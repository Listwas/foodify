import os
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean, Date, DateTime,
    ForeignKey, Text, UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# absolute default so the server works no matter the cwd it's launched from
_DEFAULT_DB = Path(__file__).resolve().parent / "foodify.db"
DATABASE_URL = os.environ.get("FOODIFY_DATABASE_URL", f"sqlite:///{_DEFAULT_DB}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

MEAL_SLOTS = ["breakfast", "lunch", "dinner"]
SOURCES = ["seeded", "ai", "custom"]
VERDICTS = ["like", "dislike", "hidden"]
STANCES = ["like", "avoid"]

# single-household v1: everything belongs to user 1, real accounts later are additive
DEFAULT_USER_ID = 1


def utcnow():
    return datetime.now(timezone.utc)


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=DEFAULT_USER_ID, index=True)
    title = Column(String, index=True)
    source = Column(String, default="custom")  # seeded / ai / custom
    protein_type = Column(String, nullable=True, index=True)
    prep_time_minutes = Column(Integer, nullable=True)
    instructions = Column(Text, default="")
    # AI-estimated, per serving, null until the backfill has run
    calories = Column(Integer, nullable=True)
    protein_g = Column(Float, nullable=True)
    carbs_g = Column(Float, nullable=True)
    sugar_g = Column(Float, nullable=True)
    image_url = Column(Text, nullable=True)  # http url, or a data: url for uploads
    # set when the photo is a stock image of a *similar* dish rather than this
    # one, so the UI can say so honestly and offer to replace it
    image_is_stock = Column(Boolean, default=False)
    image_attribution = Column(Text, nullable=True)  # required by CC licences
    external_id = Column(String, nullable=True, unique=True, index=True)  # TheMealDB id
    created_at = Column(DateTime, default=utcnow)

    ingredients = relationship(
        "Ingredient", back_populates="recipe",
        cascade="all, delete-orphan", order_by="Ingredient.id",
    )


class Ingredient(Base):
    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=DEFAULT_USER_ID, index=True)
    recipe_id = Column(Integer, ForeignKey("recipes.id"), index=True)
    name = Column(String)
    # TheMealDB measures are freeform ("2 tbs", "300ml"), so quantity holds the
    # whole measure for seeded recipes and unit stays empty
    quantity = Column(String, default="")
    unit = Column(String, default="")

    recipe = relationship("Recipe", back_populates="ingredients")


class MealPlan(Base):
    __tablename__ = "meal_plan"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=DEFAULT_USER_ID, index=True)
    date = Column(Date, index=True)
    meal_slot = Column(String, default="dinner")
    recipe_id = Column(Integer, ForeignKey("recipes.id"))
    status = Column(String, default="planned")  # planned / completed

    __table_args__ = (
        UniqueConstraint("user_id", "date", "meal_slot", name="uq_meal_plan_day_slot"),
    )

    recipe = relationship("Recipe")
    checks = relationship(
        "GroceryCheck", back_populates="meal_plan", cascade="all, delete-orphan",
    )


class GroceryCheck(Base):
    __tablename__ = "grocery_checks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=DEFAULT_USER_ID, index=True)
    meal_plan_id = Column(Integer, ForeignKey("meal_plan.id"), index=True)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), index=True)
    checked = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint("meal_plan_id", "ingredient_id", name="uq_check_per_ingredient"),
    )

    meal_plan = relationship("MealPlan", back_populates="checks")
    ingredient = relationship("Ingredient")


class RecipeFeedback(Base):
    """One row per recipe the user has reacted to — the taste signal."""
    __tablename__ = "recipe_feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=DEFAULT_USER_ID, index=True)
    recipe_id = Column(Integer, ForeignKey("recipes.id"), index=True)
    verdict = Column(String, index=True)  # like / dislike / hidden
    # a liked recipe lands on the "want to cook" shortlist; clearing the
    # shortlist keeps the taste signal
    shortlisted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "recipe_id", name="uq_feedback_per_recipe"),
    )

    recipe = relationship("Recipe")


class IngredientPref(Base):
    """Ingredients the user explicitly likes or avoids."""
    __tablename__ = "ingredient_prefs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=DEFAULT_USER_ID, index=True)
    name = Column(String, index=True)  # normalized
    stance = Column(String)  # like / avoid
    # an avoided ingredient with hard_filter never appears at all (allergies)
    hard_filter = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_pref_per_ingredient"),
    )


# columns added after a release, as (table, column, DDL type + default)
_ADDED_COLUMNS = [
    ("ingredients", "user_id", f"INTEGER DEFAULT {DEFAULT_USER_ID}"),
    ("grocery_checks", "user_id", f"INTEGER DEFAULT {DEFAULT_USER_ID}"),
    ("recipes", "image_is_stock", "BOOLEAN DEFAULT 0"),
    ("recipes", "image_attribution", "TEXT"),
]


def _migrate() -> None:
    """Add columns introduced after the first release (sqlite can ALTER ADD)."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    tables = inspector.get_table_names()
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            if table not in tables:
                continue
            cols = {c["name"] for c in inspector.get_columns(table)}
            if column not in cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


_migrate()
Base.metadata.create_all(bind=engine)
