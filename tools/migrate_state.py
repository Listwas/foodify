"""Carry an existing SQLite install over to the browser-based app.

Foodify used to keep everything in backend/foodify.db. It now runs entirely in
the browser, with your swipes, plan and preferences in IndexedDB. This turns the
old database into a backup file you can load from **Taste → Your data → Import**.

    python tools/migrate_state.py [path/to/foodify.db]

Defaults to backend/foodify.db, writes foodify-backup.json in the repo root.
The database is only read, never modified.
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "backend" / "foodify.db"
LIBRARY = ROOT / "frontend" / "public" / "recipes.json"
OUT = ROOT / "foodify-backup.json"

FIRST_LOCAL_ID = 1_000_000
STATE_VERSION = 1


def as_date(value) -> str:
    """Timestamps became plain dates — that's the resolution the engine uses."""
    return str(value or "")[:10]


def main() -> None:
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DB
    if not db_path.exists():
        raise SystemExit(f"no database at {db_path} — nothing to migrate")
    if not LIBRARY.exists():
        raise SystemExit(f"no {LIBRARY} — the recipe library is missing")

    shipped = {r["id"]: r for r in json.loads(LIBRARY.read_text(encoding="utf-8"))["recipes"]}

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    # a recipe the shipped library doesn't have has to travel with the state,
    # or every reference to it would dangle
    custom = []
    renamed = 0
    for row in conn.execute("SELECT * FROM recipes ORDER BY id"):
        match = shipped.get(row["id"])
        if match and match["title"] == row["title"]:
            continue
        if match:
            renamed += 1  # same id, different recipe — keep the shipped one
            continue
        ingredients = [
            {"id": i["id"], "name": i["name"] or "", "quantity": i["quantity"] or "",
             "unit": i["unit"] or ""}
            for i in conn.execute(
                "SELECT id, name, quantity, unit FROM ingredients WHERE recipe_id = ? ORDER BY id",
                (row["id"],),
            )
        ]
        custom.append({
            "id": row["id"], "title": row["title"], "source": row["source"] or "custom",
            "protein_type": row["protein_type"], "prep_time_minutes": row["prep_time_minutes"],
            "instructions": row["instructions"] or "", "calories": row["calories"],
            "protein_g": row["protein_g"], "carbs_g": row["carbs_g"], "sugar_g": row["sugar_g"],
            "image_url": row["image_url"], "image_is_stock": bool(row["image_is_stock"]),
            "image_attribution": row["image_attribution"], "verdict": None,
            "shortlisted": False, "ingredients": ingredients,
        })

    feedback = {}
    for seq, row in enumerate(
        conn.execute("SELECT * FROM recipe_feedback ORDER BY COALESCE(updated_at, created_at), id"),
        start=1,
    ):
        feedback[str(row["recipe_id"])] = {
            "verdict": row["verdict"],
            "shortlisted": bool(row["shortlisted"]),
            "decidedAt": as_date(row["updated_at"] or row["created_at"]),
            "seq": seq,
        }

    prefs = [
        {"id": row["id"], "name": row["name"], "stance": row["stance"],
         "hardFilter": bool(row["hard_filter"])}
        for row in conn.execute("SELECT * FROM ingredient_prefs ORDER BY id")
    ]

    # plan rows are keyed by day+slot now, so their row ids disappear; the
    # grocery ticks that referenced those ids are re-keyed onto the day
    plan, slot_of_plan = {}, {}
    for row in conn.execute("SELECT * FROM meal_plan ORDER BY date"):
        key = f"{as_date(row['date'])}|{row['meal_slot'] or 'dinner'}"
        plan[key] = {"recipeId": row["recipe_id"], "status": row["status"] or "planned"}
        slot_of_plan[row["id"]] = key

    grocery = {}
    for row in conn.execute("SELECT * FROM grocery_checks WHERE checked = 1"):
        key = slot_of_plan.get(row["meal_plan_id"])
        if key:
            grocery[f"{key}|{row['ingredient_id']}"] = True

    conn.close()

    state = {
        "version": STATE_VERSION,
        "plan": plan,
        "feedback": feedback,
        "prefs": prefs,
        "grocery": grocery,
        "customRecipes": custom,
        "images": {},
        "nextId": max([FIRST_LOCAL_ID, *(r["id"] + 1 for r in custom)]),
        "nextPrefId": max([1, *(p["id"] + 1 for p in prefs)]),
        "nextSeq": len(feedback) + 1,
    }
    OUT.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")

    print(
        f"{OUT.name}: {len(feedback)} swipes, {len(plan)} planned meals, "
        f"{len(prefs)} ingredient preferences, {len(grocery)} ticked groceries, "
        f"{len(custom)} recipes not in the shipped library"
    )
    if renamed:
        print(
            f"note: {renamed} recipe id(s) hold a different recipe than the shipped "
            "library — kept the shipped one", file=sys.stderr,
        )
    print("\nOpen the app -> Taste -> Your data -> Import, and pick this file.")


if __name__ == "__main__":
    main()
