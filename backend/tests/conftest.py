import os
import sys
import tempfile

# point the app at a throwaway db before database.py gets imported
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["FOODIFY_DATABASE_URL"] = f"sqlite:///{_tmp.name}"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import main
import recommend
from database import Base, engine


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    # the corpus index is cached across calls; the new db invalidates it
    recommend.invalidate_cache()
    yield


@pytest.fixture()
def client():
    with TestClient(main.app) as c:
        yield c


def make_recipe(client, title="Test Curry", protein="chicken", ingredients=None,
                prep_time=30):
    body = {
        "title": title,
        "source": "custom",
        "protein_type": protein,
        "prep_time_minutes": prep_time,
        "instructions": "1. Cook it.",
        "ingredients": ingredients if ingredients is not None else [
            {"name": "Chicken breast", "quantity": "400", "unit": "g"},
            {"name": "Curry paste", "quantity": "2", "unit": "tbsp"},
        ],
    }
    r = client.post("/recipes", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def make_named(client, title, names, protein="chicken", prep_time=30):
    """A recipe built from a plain list of ingredient names."""
    return make_recipe(
        client,
        title=title,
        protein=protein,
        prep_time=prep_time,
        ingredients=[{"name": n, "quantity": "1", "unit": ""} for n in names],
    )
