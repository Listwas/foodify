"""Grow the recipe library from TheMealDB, then fill in AI nutrition estimates.

The library is a plain JSON file the app ships with — there is no database and
no server. This script edits that file in place:

    python tools/seed.py                 # add new meals, then estimate macros
    python tools/seed.py --skip-nutrition

Re-runnable: meals already present are skipped, and the nutrition pass only
touches recipes with no estimate yet — so it's also how you backfill macros
after adding GEMINI_API_KEY later. Commit frontend/public/recipes.json when done.
"""
import json
import sys
import time
from pathlib import Path

import requests

import ai

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "frontend" / "public" / "recipes.json"

API = "https://www.themealdb.com/api/json/v1/1"  # "1" is the free test key

# TheMealDB category -> the protein_type we store. Only dinner-appropriate
# categories: Dessert, Breakfast, Side and Starter are deliberately left out.
# Counts measured 2026-08-25; the site holds ~793 meals in total.
CATEGORIES = {
    "Chicken": "chicken",        # 81
    "Beef": "beef",              # 95
    "Pork": "pork",              # 61
    "Lamb": "lamb",              # 33
    "Goat": "goat",              # 2
    "Seafood": "fish",           # 84
    "Pasta": "pasta",            # 12
    "Vegetarian": "vegetarian",  # 100
    "Vegan": "vegan",            # 7
    "Miscellaneous": "other",    # 33
}

BATCH_SIZE = 10


def load() -> list[dict]:
    if not LIBRARY.exists():
        return []
    return json.loads(LIBRARY.read_text(encoding="utf-8"))["recipes"]


def save(recipes: list[dict]) -> None:
    LIBRARY.write_text(
        json.dumps({"recipes": recipes}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def _get(path: str, **params) -> list[dict]:
    data = requests.get(f"{API}/{path}", params=params, timeout=20).json()
    # a search with no results returns {"meals": null}, not an error
    return data.get("meals") or []


def ingredients_of(meal: dict) -> list[tuple[str, str]]:
    """(name, measure) pairs; TheMealDB numbers them 1..20, stop at first empty."""
    out = []
    for i in range(1, 21):
        name = (meal.get(f"strIngredient{i}") or "").strip()
        if not name:
            break
        out.append((name, (meal.get(f"strMeasure{i}") or "").strip()))
    return out


def seed_recipes(recipes: list[dict]) -> int:
    known = {r.get("external_id") for r in recipes if r.get("external_id")}
    next_id = max((r["id"] for r in recipes), default=0) + 1
    next_ing = max((i["id"] for r in recipes for i in r["ingredients"]), default=0) + 1
    added = 0

    for category, protein in CATEGORIES.items():
        meals = _get("filter.php", c=category)
        print(f"{category}: {len(meals)} meals listed")
        for stub in meals:
            meal_id = stub["idMeal"]
            if meal_id in known:
                continue
            details = _get("lookup.php", i=meal_id)
            if not details:
                print(f"  ! lookup returned nothing for {meal_id}, skipping")
                continue
            meal = details[0]
            ingredients = []
            for name, measure in ingredients_of(meal):
                ingredients.append({
                    "id": next_ing, "name": name, "quantity": measure, "unit": "",
                })
                next_ing += 1
            recipes.append({
                "id": next_id,
                "title": meal["strMeal"],
                "source": "seeded",
                "protein_type": protein,
                "prep_time_minutes": None,
                "instructions": (meal.get("strInstructions") or "").strip(),
                "calories": None, "protein_g": None, "carbs_g": None, "sugar_g": None,
                "image_url": meal.get("strMealThumb"),
                "external_id": meal_id,
                "ingredients": ingredients,
            })
            known.add(meal_id)
            next_id += 1
            added += 1
            print(f"  + {meal['strMeal']}")
        save(recipes)  # per category, so an interrupted run keeps its progress
    return added


def _payload(recipe: dict) -> dict:
    return {
        "id": recipe["id"],
        "title": recipe["title"],
        "ingredients": [
            f"{i['quantity']} {i['name']}".strip() for i in recipe["ingredients"]
        ],
        "instructions": recipe["instructions"] or "",
    }


def _apply(recipe: dict, est) -> None:
    recipe["calories"] = est.calories
    recipe["protein_g"] = est.protein_g
    recipe["carbs_g"] = est.carbs_g
    recipe["sugar_g"] = est.sugar_g
    if recipe["prep_time_minutes"] is None:
        recipe["prep_time_minutes"] = est.prep_time_minutes


def _with_backoff(call, label: str):
    """Run an AI call, backing off on free-tier rate limits."""
    for attempt in range(4):
        try:
            return call()
        except Exception as e:  # noqa: BLE001 - the SDK surfaces 429s as generic errors
            text = str(e)
            if "429" in text or "RESOURCE_EXHAUSTED" in text:
                wait = 20 * (attempt + 1)
                print(f"  rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"  ! {label}: {text[:160]}")
                return None
    print(f"  ! {label}: still rate limited, giving up")
    return None


def backfill_nutrition(recipes: list[dict]) -> None:
    pending = [r for r in recipes if r["calories"] is None]
    if not pending:
        print("nutrition: nothing to backfill")
        return
    if not ai.has_key():
        print(f"nutrition: skipping {len(pending)} recipes — {ai.NO_KEY_MESSAGE}")
        print("re-run this script after adding the key to backfill.")
        return

    batches = [pending[i:i + BATCH_SIZE] for i in range(0, len(pending), BATCH_SIZE)]
    print(f"nutrition: estimating {len(pending)} recipes in {len(batches)} batched calls")

    for n, batch in enumerate(batches, 1):
        estimates = _with_backoff(
            lambda: ai.estimate_nutrition_batch([_payload(r) for r in batch]),
            f"batch {n}",
        ) or {}

        done = 0
        for recipe in batch:
            est = estimates.get(recipe["id"])
            if est is None:
                # model dropped this one — fall back to a single-recipe call
                est = _with_backoff(
                    lambda r=recipe: ai.estimate_nutrition(
                        r["title"],
                        [f"{i['quantity']} {i['name']}".strip() for i in r["ingredients"]],
                        r["instructions"] or "",
                    ),
                    recipe["title"],
                )
            if est is not None:
                _apply(recipe, est)
                done += 1
        save(recipes)  # per batch, so an interrupted run keeps its progress
        print(f"  [{n}/{len(batches)}] {done}/{len(batch)} estimated")
        time.sleep(4)  # stay comfortably inside free-tier rate limits

    left = sum(1 for r in recipes if r["calories"] is None)
    print(f"nutrition: done, {left} recipes still missing an estimate")


if __name__ == "__main__":
    library = load()
    added = seed_recipes(library)
    print(f"seeded {added} new recipes ({len(library)} total)")
    if "--skip-nutrition" not in sys.argv:
        backfill_nutrition(library)
    save(library)
    print(f"\nwrote {LIBRARY.relative_to(ROOT)} — commit it to ship the change")
