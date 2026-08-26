"""Seed the recipe library from TheMealDB, then backfill AI nutrition estimates.

Re-runnable: already-imported meals are skipped, and the nutrition pass only
touches recipes that don't have an estimate yet — so it's also the way to
backfill macros after adding GEMINI_API_KEY later.

    .venv/bin/python seed.py
"""
import sys
import time

import requests

import ai
from database import SessionLocal, Recipe, Ingredient

API = "https://www.themealdb.com/api/json/v1/1"  # "1" is the free test key
CATEGORIES = {"Chicken": "chicken", "Beef": "beef"}


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
        measure = (meal.get(f"strMeasure{i}") or "").strip()
        out.append((name, measure))
    return out


def seed_recipes(db) -> int:
    existing = {r for (r,) in db.query(Recipe.external_id).filter(Recipe.external_id.isnot(None))}
    added = 0
    for category, protein in CATEGORIES.items():
        meals = _get("filter.php", c=category)
        print(f"{category}: {len(meals)} meals listed")
        for stub in meals:
            meal_id = stub["idMeal"]
            if meal_id in existing:
                continue
            details = _get("lookup.php", i=meal_id)
            if not details:
                print(f"  ! lookup returned nothing for {meal_id}, skipping")
                continue
            meal = details[0]
            recipe = Recipe(
                title=meal["strMeal"],
                source="seeded",
                protein_type=protein,
                instructions=(meal.get("strInstructions") or "").strip(),
                image_url=meal.get("strMealThumb"),
                external_id=meal_id,
            )
            for name, measure in ingredients_of(meal):
                recipe.ingredients.append(Ingredient(name=name, quantity=measure, unit=""))
            db.add(recipe)
            db.commit()
            added += 1
            print(f"  + {meal['strMeal']}")
    return added


BATCH_SIZE = 10


def _apply(recipe, est) -> None:
    recipe.calories = est.calories
    recipe.protein_g = est.protein_g
    recipe.carbs_g = est.carbs_g
    recipe.sugar_g = est.sugar_g
    if recipe.prep_time_minutes is None:
        recipe.prep_time_minutes = est.prep_time_minutes


def _payload(recipe) -> dict:
    return {
        "id": recipe.id,
        "title": recipe.title,
        "ingredients": [f"{i.quantity} {i.name}".strip() for i in recipe.ingredients],
        "instructions": recipe.instructions or "",
    }


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


def backfill_nutrition(db) -> None:
    pending = db.query(Recipe).filter(Recipe.calories.is_(None)).all()
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
            est = estimates.get(recipe.id)
            if est is None:
                # model dropped this one — fall back to a single-recipe call
                est = _with_backoff(
                    lambda r=recipe: ai.estimate_nutrition(
                        r.title,
                        [f"{i.quantity} {i.name}".strip() for i in r.ingredients],
                        r.instructions or "",
                    ),
                    recipe.title,
                )
            if est is not None:
                _apply(recipe, est)
                done += 1
        db.commit()  # per batch, so an interrupted run keeps its progress
        print(f"  [{n}/{len(batches)}] {done}/{len(batch)} estimated")
        time.sleep(4)  # stay comfortably inside free-tier rate limits

    left = db.query(Recipe).filter(Recipe.calories.is_(None)).count()
    print(f"nutrition: done, {left} recipes still missing an estimate")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        added = seed_recipes(db)
        total = db.query(Recipe).count()
        print(f"seeded {added} new recipes ({total} total)")
        if "--skip-nutrition" not in sys.argv:
            backfill_nutrition(db)
    finally:
        db.close()
