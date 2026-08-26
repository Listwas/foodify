from datetime import date as date_type

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

import ai
import photos
import recommend
from database import (
    SessionLocal, Recipe, Ingredient, MealPlan, GroceryCheck,
    RecipeFeedback, IngredientPref,
    MEAL_SLOTS, SOURCES, VERDICTS, STANCES, DEFAULT_USER_ID,
)

app = FastAPI()

# only matters when the frontend skips the vite /api proxy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def recipe_brief(r: Recipe, feedback: dict[int, RecipeFeedback] | None = None) -> dict:
    f = (feedback or {}).get(r.id)
    return {
        "id": r.id,
        "title": r.title,
        "source": r.source,
        "protein_type": r.protein_type,
        "prep_time_minutes": r.prep_time_minutes,
        "calories": r.calories,
        "protein_g": r.protein_g,
        "carbs_g": r.carbs_g,
        "sugar_g": r.sugar_g,
        "image_url": r.image_url,
        "image_is_stock": bool(r.image_is_stock),
        "image_attribution": r.image_attribution,
        "verdict": f.verdict if f else None,
        "shortlisted": bool(f.shortlisted) if f else False,
    }


def feedback_map(db: Session) -> dict[int, RecipeFeedback]:
    return {
        f.recipe_id: f
        for f in db.query(RecipeFeedback).filter(RecipeFeedback.user_id == DEFAULT_USER_ID)
    }


def recipe_full(r: Recipe) -> dict:
    return {
        **recipe_brief(r),
        "instructions": r.instructions or "",
        "ingredients": [
            {"id": i.id, "name": i.name, "quantity": i.quantity or "", "unit": i.unit or ""}
            for i in r.ingredients
        ],
    }


def plan_entry(mp: MealPlan) -> dict:
    return {
        "id": mp.id,
        "date": mp.date.isoformat(),
        "meal_slot": mp.meal_slot,
        "status": mp.status,
        "recipe": recipe_brief(mp.recipe),
    }


# ---------- recipes ----------

# thresholds chosen from the actual library distribution so each one selects a
# useful slice rather than almost everything or almost nothing
NUTRITION_FILTERS = {
    "light": lambda q: q.filter(Recipe.calories < 500),
    "high_protein": lambda q: q.filter(Recipe.protein_g >= 35),
    "low_carb": lambda q: q.filter(Recipe.carbs_g <= 20),
    "low_sugar": lambda q: q.filter(Recipe.sugar_g <= 5),
}


@app.get("/recipes")
def list_recipes(
    protein_type: str | None = None,
    source: str | None = None,
    q: str | None = None,
    hidden: bool = False,
    shortlisted: bool = False,
    nutrition: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Recipe).options(joinedload(Recipe.ingredients))
    if protein_type:
        query = query.filter(Recipe.protein_type == protein_type.lower())
    if source:
        query = query.filter(Recipe.source == source)
    if q:
        query = query.filter(Recipe.title.ilike(f"%{q}%"))
    if nutrition:
        apply_filter = NUTRITION_FILTERS.get(nutrition)
        if not apply_filter:
            raise HTTPException(status_code=422, detail="Unknown nutrition filter")
        query = apply_filter(query)

    # status is about how *this user* relates to the recipe, so it's applied
    # after the feedback map is loaded
    if status == "ai":
        query = query.filter(Recipe.source == "ai")
    elif status == "custom":
        query = query.filter(Recipe.source == "custom")
    elif status == "liked":
        shortlisted = False  # "liked" means any right-swipe, planned or not
    elif status and status not in ("hidden",):
        raise HTTPException(status_code=422, detail="Unknown status filter")
    if status == "hidden":
        hidden = True

    fb = feedback_map(db)
    hidden_ids = {rid for rid, f in fb.items() if f.verdict == "hidden"}
    recipes = query.order_by(Recipe.title).all()
    if hidden:
        recipes = [r for r in recipes if r.id in hidden_ids]
    else:
        # hidden recipes stay out of the library until asked for by name
        recipes = [r for r in recipes if r.id not in hidden_ids]
    if shortlisted:
        recipes = [r for r in recipes if fb.get(r.id) and fb[r.id].shortlisted]
    if status == "liked":
        recipes = [r for r in recipes if fb.get(r.id) and fb[r.id].verdict == "like"]
    return [recipe_brief(r, fb) for r in recipes]


@app.get("/recipes/protein-types")
def protein_types(db: Session = Depends(get_db)):
    rows = (
        db.query(Recipe.protein_type)
        .filter(Recipe.protein_type.isnot(None))
        .distinct().order_by(Recipe.protein_type).all()
    )
    return [p for (p,) in rows]


@app.get("/recipes/{recipe_id}")
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    r = db.get(Recipe, recipe_id)
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe_full(r)


class GenerateBody(BaseModel):
    protein: str = ""
    time_minutes: int | None = Field(default=None, ge=5, le=600)
    mood: str = Field(default="", max_length=300)


@app.post("/recipes/generate")
def generate_recipe(body: GenerateBody):
    try:
        rec = ai.generate_recipe(body.protein, body.time_minutes, body.mood)
    except ai.AIUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")
    # candidate only — nothing is saved until the user accepts it via POST /recipes
    return {
        "title": rec.title,
        "source": "ai",
        "protein_type": rec.protein_type.lower(),
        "prep_time_minutes": rec.prep_time_minutes,
        "instructions": ai.split_steps(rec.instructions),
        "calories": rec.calories,
        "protein_g": rec.protein_g,
        "carbs_g": rec.carbs_g,
        "sugar_g": rec.sugar_g,
        "image_url": None,
        "ingredients": [
            {"name": i.name, "quantity": i.quantity, "unit": i.unit} for i in rec.ingredients
        ],
    }


class IngredientBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: str = Field(default="", max_length=100)
    unit: str = Field(default="", max_length=50)


class RecipeBody(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    source: str = "custom"
    protein_type: str | None = None
    prep_time_minutes: int | None = Field(default=None, ge=0)
    instructions: str = ""
    calories: int | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    sugar_g: float | None = Field(default=None, ge=0)
    image_url: str | None = Field(default=None, max_length=4_000_000)
    # a borrowed photo of a similar dish must keep its badge and its credit
    image_is_stock: bool = False
    image_attribution: str | None = Field(default=None, max_length=400)
    ingredients: list[IngredientBody] = []

    @field_validator("source")
    @classmethod
    def source_known(cls, v):
        if v not in SOURCES:
            raise ValueError("Unknown source")
        return v


@app.post("/recipes")
def create_recipe(body: RecipeBody, db: Session = Depends(get_db)):
    r = Recipe(
        title=body.title,
        source=body.source,
        protein_type=body.protein_type.lower() if body.protein_type else None,
        prep_time_minutes=body.prep_time_minutes,
        instructions=body.instructions,
        calories=body.calories,
        protein_g=body.protein_g,
        carbs_g=body.carbs_g,
        sugar_g=body.sugar_g,
        image_url=body.image_url,
        image_is_stock=bool(body.image_is_stock) and bool(body.image_url),
        image_attribution=body.image_attribution if body.image_is_stock else None,
    )
    for ing in body.ingredients:
        r.ingredients.append(Ingredient(name=ing.name, quantity=ing.quantity, unit=ing.unit))
    db.add(r)
    db.commit()
    recommend.invalidate_cache()  # the corpus changed
    return recipe_full(r)


@app.get("/photo-search")
def photo_search(q: str, page: int = 1):
    """Openly-licensed photos of a similar dish, for recipes with no image."""
    return photos.search(q, page)


class ImageBody(BaseModel):
    # a data: url from an upload, or an http url from photo search
    image_url: str | None = Field(default=None, max_length=4_000_000)
    image_is_stock: bool = False
    image_attribution: str | None = Field(default=None, max_length=400)


@app.patch("/recipes/{recipe_id}/image")
def set_recipe_image(recipe_id: int, body: ImageBody, db: Session = Depends(get_db)):
    r = db.get(Recipe, recipe_id)
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    r.image_url = body.image_url or None
    # your own photo is of the real dish, so it's never "stock"
    r.image_is_stock = bool(body.image_is_stock) and bool(body.image_url)
    r.image_attribution = body.image_attribution if r.image_is_stock else None
    db.commit()
    return recipe_full(r)


# ---------- taste engine ----------

def _card(entry: dict, fb: dict[int, RecipeFeedback]) -> dict:
    return {
        **recipe_brief(entry["recipe"], fb),
        "score": round(entry["score"], 4),
        "reasons": entry["reasons"],
    }


@app.get("/deck")
def get_deck(limit: int = 20, db: Session = Depends(get_db)):
    """Cards to swipe on, ordered by what we think they'll like — with enough
    exploration mixed in that the model keeps learning."""
    fb = feedback_map(db)
    return [_card(e, fb) for e in recommend.deck(db, limit=limit)]


@app.get("/recommendations")
def get_recommendations(limit: int = 30, db: Session = Depends(get_db)):
    fb = feedback_map(db)
    return [_card(e, fb) for e in recommend.rank(db, limit=limit)]


@app.get("/shortlist")
def get_shortlist(db: Session = Depends(get_db)):
    """Liked and not yet planned — the 'want to cook' list."""
    fb = feedback_map(db)
    wanted = [rid for rid, f in fb.items() if f.shortlisted and f.verdict == "like"]
    if not wanted:
        return []
    planned = {
        rid for (rid,) in db.query(MealPlan.recipe_id).filter(
            MealPlan.user_id == DEFAULT_USER_ID, MealPlan.date >= date_type.today()
        )
    }
    recipes = db.query(Recipe).filter(Recipe.id.in_(wanted)).all()
    return [recipe_brief(r, fb) for r in recipes if r.id not in planned]


class FeedbackBody(BaseModel):
    recipe_id: int
    verdict: str  # like / dislike / hidden / clear

    @field_validator("verdict")
    @classmethod
    def verdict_known(cls, v):
        if v not in VERDICTS + ["clear"]:
            raise ValueError("Unknown verdict")
        return v


@app.post("/feedback")
def set_feedback(body: FeedbackBody, db: Session = Depends(get_db)):
    if not db.get(Recipe, body.recipe_id):
        raise HTTPException(status_code=404, detail="Recipe not found")

    row = (
        db.query(RecipeFeedback)
        .filter(
            RecipeFeedback.user_id == DEFAULT_USER_ID,
            RecipeFeedback.recipe_id == body.recipe_id,
        )
        .first()
    )
    if body.verdict == "clear":
        if row:
            db.delete(row)
            db.commit()
        return {"recipe_id": body.recipe_id, "verdict": None, "shortlisted": False}

    if not row:
        row = RecipeFeedback(user_id=DEFAULT_USER_ID, recipe_id=body.recipe_id)
        db.add(row)
    row.verdict = body.verdict
    # a like lands on the shortlist; anything else takes it off
    row.shortlisted = body.verdict == "like"
    db.commit()
    return {
        "recipe_id": row.recipe_id,
        "verdict": row.verdict,
        "shortlisted": bool(row.shortlisted),
    }


@app.post("/feedback/undo")
def undo_feedback(db: Session = Depends(get_db)):
    """Rewind the most recent swipe, returning the card so the deck can put
    that exact recipe back on top instead of a fresh recommendation."""
    row = (
        db.query(RecipeFeedback)
        .filter(RecipeFeedback.user_id == DEFAULT_USER_ID)
        .order_by(RecipeFeedback.updated_at.desc(), RecipeFeedback.id.desc())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nothing to undo")
    recipe_id = row.recipe_id
    db.delete(row)
    db.commit()

    restored = next(
        (e for e in recommend.rank(db) if e["recipe"].id == recipe_id), None
    )
    card = _card(restored, feedback_map(db)) if restored else None
    return {"recipe_id": recipe_id, "verdict": None, "card": card}


@app.get("/feedback/history")
def feedback_history(verdict: str | None = None, db: Session = Depends(get_db)):
    """Everything swiped so far, newest first — tastes change, so nothing is
    meant to be a one-way door."""
    query = (
        db.query(RecipeFeedback)
        .options(joinedload(RecipeFeedback.recipe))
        .filter(RecipeFeedback.user_id == DEFAULT_USER_ID)
    )
    if verdict:
        if verdict not in VERDICTS:
            raise HTTPException(status_code=422, detail="Unknown verdict")
        query = query.filter(RecipeFeedback.verdict == verdict)

    rows = query.order_by(
        RecipeFeedback.updated_at.desc(), RecipeFeedback.id.desc()
    ).all()
    fb = {r.recipe_id: r for r in rows}
    return [
        {
            "recipe": recipe_brief(row.recipe, fb),
            "verdict": row.verdict,
            "decided_at": (row.updated_at or row.created_at).isoformat(),
            # passed recipes drift back into the deck on their own
            "returns_to_deck": (
                row.verdict == "dislike"
                and (row.updated_at or row.created_at) is not None
            ),
        }
        for row in rows
        if row.recipe
    ]


class ShortlistBody(BaseModel):
    shortlisted: bool


@app.patch("/shortlist/{recipe_id}")
def set_shortlisted(recipe_id: int, body: ShortlistBody, db: Session = Depends(get_db)):
    row = (
        db.query(RecipeFeedback)
        .filter(
            RecipeFeedback.user_id == DEFAULT_USER_ID,
            RecipeFeedback.recipe_id == recipe_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No feedback for this recipe")
    row.shortlisted = body.shortlisted
    db.commit()
    return {"recipe_id": recipe_id, "shortlisted": bool(row.shortlisted)}


@app.get("/ingredients")
def list_ingredient_names(q: str | None = None, limit: int = 20, db: Session = Depends(get_db)):
    """Autocomplete over the real ingredient corpus."""
    rows = db.query(Ingredient.name).distinct().all()
    names = sorted({recommend.normalize(n) for (n,) in rows if n and recommend.normalize(n)})
    if q:
        needle = recommend.normalize(q)
        starts = [n for n in names if n.startswith(needle)]
        contains = [n for n in names if needle in n and n not in starts]
        names = starts + contains
    return names[:limit]


class PrefBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    stance: str
    hard_filter: bool = False

    @field_validator("stance")
    @classmethod
    def stance_known(cls, v):
        if v not in STANCES:
            raise ValueError("Unknown stance")
        return v


@app.get("/profile")
def get_profile(db: Session = Depends(get_db)):
    prefs = (
        db.query(IngredientPref)
        .filter(IngredientPref.user_id == DEFAULT_USER_ID)
        .order_by(IngredientPref.name)
        .all()
    )
    return {
        "ingredients": [
            {
                "id": p.id,
                "name": p.name,
                "stance": p.stance,
                "hard_filter": bool(p.hard_filter),
            }
            for p in prefs
        ],
        "taste": recommend.taste_summary(db),
    }


@app.post("/profile/ingredients")
def add_pref(body: PrefBody, db: Session = Depends(get_db)):
    name = recommend.normalize(body.name)
    if not name:
        raise HTTPException(status_code=422, detail="Ingredient name is empty")

    row = (
        db.query(IngredientPref)
        .filter(IngredientPref.user_id == DEFAULT_USER_ID, IngredientPref.name == name)
        .first()
    )
    if not row:
        row = IngredientPref(user_id=DEFAULT_USER_ID, name=name)
        db.add(row)
    row.stance = body.stance
    row.hard_filter = body.hard_filter and body.stance == "avoid"
    db.commit()
    return {
        "id": row.id,
        "name": row.name,
        "stance": row.stance,
        "hard_filter": bool(row.hard_filter),
    }


@app.delete("/profile/ingredients/{pref_id}")
def remove_pref(pref_id: int, db: Session = Depends(get_db)):
    row = db.get(IngredientPref, pref_id)
    if not row:
        raise HTTPException(status_code=404, detail="Preference not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ---------- meal plan ----------

@app.get("/meal-plan")
def get_meal_plan(start: date_type, end: date_type, db: Session = Depends(get_db)):
    entries = (
        db.query(MealPlan)
        .options(joinedload(MealPlan.recipe))
        .filter(
            MealPlan.user_id == DEFAULT_USER_ID,
            MealPlan.date >= start,
            MealPlan.date <= end,
        )
        .order_by(MealPlan.date)
        .all()
    )
    return [plan_entry(mp) for mp in entries]


class PlanBody(BaseModel):
    date: date_type
    meal_slot: str = "dinner"
    recipe_id: int

    @field_validator("meal_slot")
    @classmethod
    def slot_known(cls, v):
        if v not in MEAL_SLOTS:
            raise ValueError("Unknown meal slot")
        return v


@app.post("/meal-plan")
def assign_meal(body: PlanBody, db: Session = Depends(get_db)):
    if not db.get(Recipe, body.recipe_id):
        raise HTTPException(status_code=404, detail="Recipe not found")

    mp = (
        db.query(MealPlan)
        .filter(
            MealPlan.user_id == DEFAULT_USER_ID,
            MealPlan.date == body.date,
            MealPlan.meal_slot == body.meal_slot,
        )
        .first()
    )
    if mp:
        if mp.recipe_id != body.recipe_id:
            # swapping meals invalidates the old grocery checklist
            db.query(GroceryCheck).filter(GroceryCheck.meal_plan_id == mp.id).delete()
            mp.recipe_id = body.recipe_id
            mp.status = "planned"
    else:
        mp = MealPlan(
            user_id=DEFAULT_USER_ID,
            date=body.date,
            meal_slot=body.meal_slot,
            recipe_id=body.recipe_id,
        )
        db.add(mp)
    db.commit()
    return plan_entry(mp)


class CompleteBody(BaseModel):
    completed: bool = True


@app.post("/meal-plan/{meal_plan_id}/complete")
def mark_cooked(meal_plan_id: int, body: CompleteBody, db: Session = Depends(get_db)):
    """Marking a meal cooked is the strongest positive signal the engine gets."""
    mp = db.get(MealPlan, meal_plan_id)
    if not mp:
        raise HTTPException(status_code=404, detail="Meal plan entry not found")
    mp.status = "completed" if body.completed else "planned"
    db.commit()
    return plan_entry(mp)


@app.delete("/meal-plan/{meal_plan_id}")
def clear_meal(meal_plan_id: int, db: Session = Depends(get_db)):
    mp = db.get(MealPlan, meal_plan_id)
    if not mp:
        raise HTTPException(status_code=404, detail="Meal plan entry not found")
    db.delete(mp)  # grocery checks cascade
    db.commit()
    return {"ok": True}


# ---------- grocery checklist ----------

@app.get("/meal-plan/{meal_plan_id}/grocery")
def get_grocery(meal_plan_id: int, db: Session = Depends(get_db)):
    mp = (
        db.query(MealPlan)
        .options(joinedload(MealPlan.recipe).joinedload(Recipe.ingredients))
        .filter(MealPlan.id == meal_plan_id)
        .first()
    )
    if not mp:
        raise HTTPException(status_code=404, detail="Meal plan entry not found")

    checked = {c.ingredient_id: c.checked for c in mp.checks}
    # rows are created lazily the first time a meal's checklist is opened
    missing = [i for i in mp.recipe.ingredients if i.id not in checked]
    for ing in missing:
        db.add(GroceryCheck(meal_plan_id=mp.id, ingredient_id=ing.id, checked=False))
        checked[ing.id] = False
    if missing:
        db.commit()

    return {
        "meal_plan_id": mp.id,
        "date": mp.date.isoformat(),
        "meal_slot": mp.meal_slot,
        "recipe_id": mp.recipe_id,
        "recipe_title": mp.recipe.title,
        "items": [
            {
                "ingredient_id": i.id,
                "name": i.name,
                "quantity": i.quantity or "",
                "unit": i.unit or "",
                "checked": checked[i.id],
            }
            for i in mp.recipe.ingredients
        ],
    }


class CheckBody(BaseModel):
    checked: bool


@app.patch("/meal-plan/{meal_plan_id}/grocery/{ingredient_id}")
def set_grocery_check(
    meal_plan_id: int, ingredient_id: int, body: CheckBody, db: Session = Depends(get_db)
):
    mp = db.get(MealPlan, meal_plan_id)
    if not mp:
        raise HTTPException(status_code=404, detail="Meal plan entry not found")
    ingredient = db.get(Ingredient, ingredient_id)
    if not ingredient or ingredient.recipe_id != mp.recipe_id:
        raise HTTPException(status_code=404, detail="Ingredient not part of this meal")

    check = (
        db.query(GroceryCheck)
        .filter(
            GroceryCheck.meal_plan_id == meal_plan_id,
            GroceryCheck.ingredient_id == ingredient_id,
        )
        .first()
    )
    if not check:
        check = GroceryCheck(meal_plan_id=meal_plan_id, ingredient_id=ingredient_id)
        db.add(check)
    check.checked = body.checked
    db.commit()
    return {"ingredient_id": ingredient_id, "checked": check.checked}


# production: `uvicorn main:server` serves the built frontend, api under /api
from pathlib import Path
from fastapi.responses import FileResponse

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

server = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
server.mount("/api", app)

if DIST.is_dir():
    @server.get("/{path:path}")
    def spa(path: str):
        file = (DIST / path).resolve()
        if path and file.is_file() and file.is_relative_to(DIST):
            return FileResponse(file)
        # don't let browsers cache the spa shell
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
