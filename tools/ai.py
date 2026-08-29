"""Gemini calls: nutrition estimation and recipe generation.

Uses the Google AI free tier — key in backend/.env as GEMINI_API_KEY.
Everything degrades gracefully when no key is configured.
"""
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent / ".env")

MODEL = os.environ.get("FOODIFY_MODEL", "gemini-3.6-flash")
# each model has its own free-tier allowance, so when the main one is spent we
# keep going on a lighter one rather than failing the whole run
FALLBACK_MODELS = [
    m.strip()
    for m in os.environ.get("FOODIFY_FALLBACK_MODELS", "gemini-3.5-flash-lite").split(",")
    if m.strip()
]

NO_KEY_MESSAGE = (
    "AI features are off: set GEMINI_API_KEY in backend/.env "
    "(free key from aistudio.google.com, no card needed)."
)


class AIUnavailable(Exception):
    """Raised when no API key is configured."""


class NutritionEstimate(BaseModel):
    calories: int
    protein_g: float
    carbs_g: float
    sugar_g: float
    prep_time_minutes: int


class NutritionEstimateFor(NutritionEstimate):
    """A batch estimate that echoes back which recipe it belongs to."""
    id: int


class NutritionBatch(BaseModel):
    estimates: list[NutritionEstimateFor]


class GeneratedIngredient(BaseModel):
    name: str
    quantity: str
    unit: str


class GeneratedRecipe(BaseModel):
    title: str
    protein_type: str
    prep_time_minutes: int
    instructions: str
    ingredients: list[GeneratedIngredient]
    calories: int
    protein_g: float
    carbs_g: float
    sugar_g: float


def has_key() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def _is_quota_error(e: Exception) -> bool:
    text = str(e)
    return "429" in text or "RESOURCE_EXHAUSTED" in text


def _generate(prompt: str, schema: type[BaseModel]):
    if not has_key():
        raise AIUnavailable(NO_KEY_MESSAGE)
    from google import genai
    from google.genai import types

    client = genai.Client()
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
    )

    last: Exception | None = None
    for model in [MODEL, *FALLBACK_MODELS]:
        try:
            response = client.models.generate_content(
                model=model, contents=prompt, config=config
            )
        except Exception as e:  # noqa: BLE001 - the SDK wraps quota errors generically
            last = e
            if _is_quota_error(e):
                continue  # this model's allowance is spent; try the next
            raise
        parsed = response.parsed
        if parsed is None:
            raise ValueError(f"model returned no parseable output: {response.text!r:.200}")
        return parsed

    raise last if last else RuntimeError("no model produced a response")


def split_steps(text: str) -> str:
    """Put each numbered step on its own line.

    The model is asked for newline-separated steps but often returns
    "1. Do this. 2. Do that." on a single line, which renders as a wall of
    text. Splitting on the numbering is more reliable than trusting the format.
    """
    text = (text or "").strip()
    if text.count("\n") >= 2:
        return text
    parts = [p.strip() for p in re.split(r"\s*(?=\b\d{1,2}[.)]\s)", text) if p.strip()]
    return "\n".join(parts) if len(parts) > 1 else text


def estimate_nutrition(title: str, ingredients: list[str], instructions: str) -> NutritionEstimate:
    prompt = (
        "You are estimating nutrition for a home-cooking meal planner.\n"
        f"Recipe: {title}\n"
        f"Ingredients: {'; '.join(ingredients)}\n"
        f"Instructions: {instructions[:2000]}\n\n"
        "Estimate per-serving values, assuming the recipe serves 4 unless the "
        "ingredient amounts clearly suggest otherwise. Round sensibly. Also "
        "estimate total active prep + cooking time in minutes for a typical home cook."
    )
    return _generate(prompt, NutritionEstimate)


def estimate_nutrition_batch(recipes: list[dict]) -> dict[int, NutritionEstimate]:
    """Estimate several recipes in one call.

    `recipes` items are {id, title, ingredients: list[str], instructions}.
    Results are matched by the echoed id, never by list position — the model
    can reorder or drop entries, and the caller retries whatever is missing.
    """
    lines = []
    for r in recipes:
        lines.append(
            f"- id={r['id']} | {r['title']} | ingredients: {'; '.join(r['ingredients'])[:600]}"
            f" | method: {(r['instructions'] or '')[:400]}"
        )
    prompt = (
        "You are estimating nutrition for a home-cooking meal planner.\n"
        "For EACH recipe below, estimate per-serving values assuming it serves 4 "
        "unless the amounts clearly suggest otherwise, plus the total active prep + "
        "cooking time in minutes for a typical home cook.\n"
        "Return one entry per recipe and echo back its id exactly as given.\n\n"
        + "\n".join(lines)
    )
    batch = _generate(prompt, NutritionBatch)
    return {e.id: NutritionEstimate(**e.model_dump(exclude={"id"})) for e in batch.estimates}


def generate_recipe(protein: str, time_minutes: int | None, mood: str) -> GeneratedRecipe:
    constraints = []
    if protein:
        constraints.append(f"main protein: {protein}")
    if time_minutes:
        constraints.append(f"total prep + cooking time under {time_minutes} minutes")
    if mood:
        constraints.append(f"mood / craving: {mood}")
    constraint_text = "; ".join(constraints) or "anything goes, pick something interesting"

    prompt = (
        "Propose one realistic dinner recipe for a home cook, for a household "
        "meal-planning app. Constraints: " + constraint_text + ".\n\n"
        "Rules:\n"
        "- A real, cookable dish with common supermarket ingredients, 4 servings.\n"
        "- instructions: numbered steps separated by newlines, plain text.\n"
        "- ingredients: quantity is the number/amount (e.g. '400', '2'), unit is "
        "the measure (e.g. 'g', 'tbsp', 'cloves'); leave unit empty for countable "
        "items like '2 onions'.\n"
        "- protein_type: single lowercase word (chicken, beef, pork, fish, "
        "vegetarian, ...).\n"
        "- prep_time_minutes: honest total time estimate.\n"
        "- calories/protein_g/carbs_g/sugar_g: per-serving estimates."
    )
    return _generate(prompt, GeneratedRecipe)
