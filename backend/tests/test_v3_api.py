from datetime import date, datetime, timedelta, timezone

import photos
import recommend
from database import SessionLocal, RecipeFeedback
from tests.conftest import make_named, make_recipe

PANTRY = ["garlic", "salt", "onion"]


def age_feedback(recipe_id: int, days: int) -> None:
    """Backdate a swipe so time-based behaviour can be tested."""
    db = SessionLocal()
    row = db.query(RecipeFeedback).filter(RecipeFeedback.recipe_id == recipe_id).first()
    when = datetime.now(timezone.utc) - timedelta(days=days)
    row.created_at = when
    row.updated_at = when
    db.commit()
    db.close()


# ---------- nutrition + status filters ----------

def test_nutrition_filters_select_the_right_slices(client):
    client.post("/recipes", json={
        "title": "Light and lean", "source": "custom", "protein_type": "chicken",
        "calories": 400, "protein_g": 40, "carbs_g": 10, "sugar_g": 3,
        "ingredients": [{"name": "chicken", "quantity": "1", "unit": ""}],
    })
    client.post("/recipes", json={
        "title": "Heavy and sweet", "source": "custom", "protein_type": "beef",
        "calories": 900, "protein_g": 20, "carbs_g": 80, "sugar_g": 20,
        "ingredients": [{"name": "beef", "quantity": "1", "unit": ""}],
    })

    def titles(**params):
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        return [r["title"] for r in client.get(f"/recipes?{qs}").json()]

    assert titles(nutrition="light") == ["Light and lean"]
    assert titles(nutrition="high_protein") == ["Light and lean"]
    assert titles(nutrition="low_carb") == ["Light and lean"]
    assert titles(nutrition="low_sugar") == ["Light and lean"]
    # composes with the other filters rather than replacing them
    assert titles(nutrition="light", protein_type="beef") == []
    assert client.get("/recipes?nutrition=bogus").status_code == 422


def test_status_filters(client):
    seeded = make_recipe(client, title="Seeded one")
    client.post("/recipes", json={
        "title": "Robo dinner", "source": "ai", "protein_type": "chicken",
        "ingredients": [{"name": "x", "quantity": "1", "unit": ""}],
    })
    client.post("/feedback", json={"recipe_id": seeded["id"], "verdict": "like"})

    def titles(status):
        return [r["title"] for r in client.get(f"/recipes?status={status}").json()]

    assert titles("ai") == ["Robo dinner"]
    assert titles("liked") == ["Seeded one"]
    assert titles("hidden") == []
    assert client.get("/recipes?status=bogus").status_code == 422


# ---------- photos ----------

def test_photo_search_is_proxied(client, monkeypatch):
    monkeypatch.setattr(photos, "search", lambda q, page=1: [
        {"url": f"https://example.test/{q}-{page}.jpg", "thumbnail": "t",
         "title": "A dish", "creator": "Someone", "license": "CC BY 2.0",
         "attribution": "\"A dish\" by Someone is licensed under CC BY 2.0.",
         "source_url": "https://example.test/page"},
    ])
    out = client.get("/photo-search?q=curry&page=2").json()
    assert out[0]["url"] == "https://example.test/curry-2.jpg"
    assert "CC BY" in out[0]["license"]


def test_photo_search_degrades_to_empty_on_failure(client, monkeypatch):
    # a missing photo must never fail the request that wanted one
    monkeypatch.setattr(photos, "search", lambda q, page=1: [])
    assert client.get("/photo-search?q=nothing").json() == []


def test_set_image_marks_and_clears_stock(client):
    r = make_recipe(client)

    stocked = client.patch(f"/recipes/{r['id']}/image", json={
        "image_url": "https://example.test/similar.jpg",
        "image_is_stock": True,
        "image_attribution": "\"Dish\" by Someone, CC BY 2.0",
    }).json()
    assert stocked["image_is_stock"] is True
    assert "CC BY" in stocked["image_attribution"]

    # uploading your own photo is of the real dish, so the stock flag goes away
    own = client.patch(f"/recipes/{r['id']}/image", json={
        "image_url": "data:image/jpeg;base64,AAAA",
    }).json()
    assert own["image_is_stock"] is False
    assert own["image_attribution"] is None
    assert own["image_url"].startswith("data:image/jpeg")

    assert client.patch("/recipes/999/image", json={"image_url": "x"}).status_code == 404


# ---------- undo returns the actual card ----------

def test_undo_returns_the_card_that_was_swiped(client):
    make_named(client, "Filler", PANTRY, "beef")
    target = make_named(client, "The One I Passed", PANTRY + ["harissa"], "chicken")

    client.post("/feedback", json={"recipe_id": target["id"], "verdict": "dislike"})
    undone = client.post("/feedback/undo").json()

    assert undone["recipe_id"] == target["id"]
    assert undone["card"] is not None
    assert undone["card"]["id"] == target["id"]
    assert undone["card"]["title"] == "The One I Passed"
    # full deck-card shape, so the client can drop it straight back on the stack
    assert "score" in undone["card"] and "reasons" in undone["card"]


# ---------- history ----------

def test_history_lists_swipes_newest_first_and_filters(client):
    a = make_recipe(client, title="First swiped")
    b = make_recipe(client, title="Second swiped")
    client.post("/feedback", json={"recipe_id": a["id"], "verdict": "like"})
    client.post("/feedback", json={"recipe_id": b["id"], "verdict": "dislike"})

    history = client.get("/feedback/history").json()
    assert [h["recipe"]["title"] for h in history] == ["Second swiped", "First swiped"]
    assert all(h["decided_at"] for h in history)

    liked = client.get("/feedback/history?verdict=like").json()
    assert [h["recipe"]["title"] for h in liked] == ["First swiped"]
    assert client.get("/feedback/history?verdict=bogus").status_code == 422


def test_history_verdict_can_be_changed_later(client):
    r = make_recipe(client)
    client.post("/feedback", json={"recipe_id": r["id"], "verdict": "dislike"})

    client.post("/feedback", json={"recipe_id": r["id"], "verdict": "like"})
    history = client.get("/feedback/history").json()
    assert len(history) == 1 and history[0]["verdict"] == "like"


# ---------- tastes drift ----------

def test_old_pass_returns_to_the_deck_but_hidden_stays_hidden(client):
    passed = make_named(client, "Passed Long Ago", PANTRY + ["harissa"], "chicken")
    buried = make_named(client, "Hidden Long Ago", PANTRY + ["tamarind"], "beef")
    for i in range(4):
        make_named(client, f"Filler {i}", PANTRY + [f"x{i}"], "beef")

    client.post("/feedback", json={"recipe_id": passed["id"], "verdict": "dislike"})
    client.post("/feedback", json={"recipe_id": buried["id"], "verdict": "hidden"})

    db = SessionLocal()
    fresh = [e["recipe"].id for e in recommend.deck(db, limit=50)]
    assert passed["id"] not in fresh  # just passed — don't ask again yet

    age_feedback(passed["id"], recommend.DISLIKE_RETURN_DAYS + 1)
    age_feedback(buried["id"], recommend.DISLIKE_RETURN_DAYS + 1)

    later = [e["recipe"].id for e in recommend.deck(db, limit=50)]
    assert passed["id"] in later, "an old pass should get another chance"
    assert buried["id"] not in later, "hiding is deliberate and stays"


def test_recent_evidence_outweighs_old_evidence(client):
    old = make_named(client, "Old Favourite", PANTRY + ["harissa"], "chicken")
    new = make_named(client, "New Favourite", PANTRY + ["gochujang"], "chicken")
    twin_old = make_named(client, "Harissa Twin", PANTRY + ["harissa"], "beef")
    twin_new = make_named(client, "Gochujang Twin", PANTRY + ["gochujang"], "beef")

    client.post("/feedback", json={"recipe_id": old["id"], "verdict": "like"})
    client.post("/feedback", json={"recipe_id": new["id"], "verdict": "like"})
    age_feedback(old["id"], 365)

    db = SessionLocal()
    scores = {e["recipe"].id: e["score"] for e in recommend.rank(db)}
    assert scores[twin_new["id"]] > scores[twin_old["id"]]


def test_recency_multiplier_decays_but_has_a_floor():
    today = date.today()
    assert recommend._recency(today, today) == 1.0
    half = recommend._recency(today - timedelta(days=recommend.EVIDENCE_HALF_LIFE_DAYS), today)
    assert 0.49 < half < 0.51
    ancient = recommend._recency(today - timedelta(days=5000), today)
    assert ancient == recommend.MIN_RECENCY


def test_saving_a_generated_recipe_keeps_its_photo_credit(client):
    """A borrowed CC photo must keep its badge and attribution through the
    save, otherwise we'd display someone's work uncredited."""
    saved = client.post("/recipes", json={
        "title": "Invented Dinner",
        "source": "ai",
        "protein_type": "chicken",
        "image_url": "https://example.test/similar-dish.jpg",
        "image_is_stock": True,
        "image_attribution": "\"A dish\" by Someone, CC BY 2.0",
        "ingredients": [{"name": "chicken", "quantity": "1", "unit": ""}],
    }).json()

    assert saved["image_is_stock"] is True
    assert "CC BY" in saved["image_attribution"]

    listed = client.get("/recipes?status=ai").json()[0]
    assert listed["image_is_stock"] is True
    assert listed["image_attribution"]


def test_a_recipe_saved_without_a_photo_is_not_marked_stock(client):
    saved = client.post("/recipes", json={
        "title": "No Photo", "source": "ai", "protein_type": "beef",
        "image_is_stock": True,  # nothing to be stock *of*
        "ingredients": [{"name": "beef", "quantity": "1", "unit": ""}],
    }).json()
    assert saved["image_is_stock"] is False


def test_license_labels_are_not_double_prefixed():
    assert photos._license_label("by", "2.0") == "CC BY 2.0"
    assert photos._license_label("cc0", "1.0") == "CC0 1.0"
    assert photos._license_label("by-nc", "4.0") == "CC BY-NC 4.0"
    assert photos._license_label("", "") == ""
