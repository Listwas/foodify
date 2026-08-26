"""Tests for the taste engine.

These assert the properties the recommender is supposed to have, not exact
scores — the weights are tunable and shouldn't break the suite when adjusted.
"""
import random
from collections import Counter
from datetime import date, timedelta

import recommend
from database import SessionLocal
from tests.conftest import make_named, make_recipe

PANTRY = ["garlic", "salt", "onion", "olive oil"]


def build_corpus(client):
    """A library where pantry staples are everywhere and two 'signature'
    ingredients are rare — the situation the real corpus is in."""
    for i in range(8):
        make_named(client, f"Common Chicken {i}", PANTRY + [f"filler {i}"], "chicken")
    for i in range(8):
        make_named(client, f"Common Beef {i}", PANTRY + [f"stuffing {i}"], "beef")
    a = make_named(client, "Harissa Chicken", PANTRY + ["harissa"], "chicken")
    b = make_named(client, "Harissa Traybake", PANTRY + ["harissa"], "chicken")
    return a, b


def test_idf_favours_rare_ingredients_over_pantry_staples(client):
    build_corpus(client)
    db = SessionLocal()
    index = recommend.build_index(db)

    # garlic is in every recipe; harissa is in two
    assert index.df["garlic"] > index.df["harissa"]
    assert index.weight("harissa") > index.weight("garlic")


def test_normalization_merges_plural_variants(client):
    make_named(client, "A", ["chicken breast", "carrot"])
    make_named(client, "B", ["chicken breasts", "carrots"])
    db = SessionLocal()
    index = recommend.build_index(db)

    # both spellings collapse into one term seen twice
    assert index.df.get("chicken breast") == 2
    assert "chicken breasts" not in index.df


def test_liking_a_recipe_promotes_others_sharing_its_rare_ingredient(client):
    a, b = build_corpus(client)
    db = SessionLocal()

    rank_before = [e["recipe"].id for e in recommend.rank(db)].index(b["id"])

    client.post("/feedback", json={"recipe_id": a["id"], "verdict": "like"})
    after = [e["recipe"].id for e in recommend.rank(db)]

    # the untouched harissa dish climbs to sit alongside the one they liked
    assert after.index(b["id"]) < rank_before
    assert set(after[:2]) == {a["id"], b["id"]}


def test_disliking_pushes_similar_recipes_down(client):
    a, b = build_corpus(client)
    db = SessionLocal()

    client.post("/feedback", json={"recipe_id": a["id"], "verdict": "dislike"})
    ranked = [e["recipe"].id for e in recommend.rank(db)]

    assert ranked[-1] == b["id"]


def test_hidden_recipes_disappear_everywhere(client):
    a, _ = build_corpus(client)
    client.post("/feedback", json={"recipe_id": a["id"], "verdict": "hidden"})
    db = SessionLocal()

    assert a["id"] not in [r["id"] for r in client.get("/recipes").json()]
    assert a["id"] not in [e["recipe"].id for e in recommend.rank(db)]
    assert a["id"] not in [e["recipe"].id for e in recommend.deck(db, limit=50)]
    # ...but they're still reachable under the hidden category
    assert a["id"] in [r["id"] for r in client.get("/recipes?hidden=true").json()]


def test_recently_planned_meal_is_demoted(client):
    build_corpus(client)
    # named to sort first, so the drop is visible rather than hidden by the
    # alphabetical tiebreak that applies when nothing is learned yet
    target = make_named(client, "AAA Yesterday's Dinner", PANTRY + ["harissa"], "chicken")
    db = SessionLocal()

    before = [e["recipe"].id for e in recommend.rank(db)].index(target["id"])
    assert before == 0

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post("/meal-plan", json={"date": yesterday, "recipe_id": target["id"]})

    ranked = [e["recipe"].id for e in recommend.rank(db)]
    assert ranked.index(target["id"]) > before
    assert ranked[-1] == target["id"], "just-eaten meals belong at the bottom"


def test_meal_already_on_the_calendar_is_demoted(client):
    build_corpus(client)
    target = make_named(client, "Tomorrow's Dinner", PANTRY + ["harissa"], "chicken")
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    client.post("/meal-plan", json={"date": tomorrow, "recipe_id": target["id"]})

    db = SessionLocal()
    entry = next(e for e in recommend.rank(db) if e["recipe"].id == target["id"])
    assert "already planned" in entry["reasons"]
    ranked = [e["recipe"].id for e in recommend.rank(db)]
    assert ranked.index(target["id"]) > len(ranked) // 2


def test_avoided_ingredient_downranks_and_hard_filter_removes(client):
    a, _ = build_corpus(client)

    client.post("/profile/ingredients", json={"name": "harissa", "stance": "avoid"})
    db = SessionLocal()
    ranked = [e["recipe"].id for e in recommend.rank(db)]
    assert a["id"] in ranked
    assert ranked.index(a["id"]) > len(ranked) // 2

    # promoting it to an allergy removes the recipe outright
    client.post(
        "/profile/ingredients",
        json={"name": "harissa", "stance": "avoid", "hard_filter": True},
    )
    assert a["id"] not in [e["recipe"].id for e in recommend.rank(db)]
    assert a["id"] not in [e["recipe"].id for e in recommend.deck(db, limit=50)]


def test_liked_ingredient_promotes_matching_recipes(client):
    a, _ = build_corpus(client)
    client.post("/profile/ingredients", json={"name": "harissa", "stance": "like"})

    db = SessionLocal()
    assert [e["recipe"].id for e in recommend.rank(db)][0] in (a["id"], a["id"] + 1)


def test_cold_start_deck_is_protein_diverse(client):
    build_corpus(client)
    db = SessionLocal()
    cards = recommend.deck(db, limit=10, rng=random.Random(0))

    proteins = [c["recipe"].protein_type for c in cards]
    assert len(set(proteins)) > 1, "a cold deck of one protein teaches us nothing"
    # and never three of the same in a row
    assert not any(
        proteins[i] == proteins[i + 1] == proteins[i + 2] for i in range(len(proteins) - 2)
    )


def test_deck_stays_balanced_when_one_protein_scores_higher(client):
    build_corpus(client)
    # a week of chicken makes every beef dish outrank every chicken dish
    for offset in range(4):
        r = make_recipe(client, title=f"Chicken Night {offset}", protein="chicken")
        client.post("/meal-plan", json={
            "date": (date.today() - timedelta(days=offset + 1)).isoformat(),
            "recipe_id": r["id"],
        })

    db = SessionLocal()
    cards = recommend.deck(db, limit=10, rng=random.Random(3))
    proteins = [c["recipe"].protein_type for c in cards]
    assert "chicken" in proteins and "beef" in proteins


def test_deck_skips_already_judged_recipes(client):
    a, _ = build_corpus(client)
    client.post("/feedback", json={"recipe_id": a["id"], "verdict": "like"})

    db = SessionLocal()
    assert a["id"] not in [e["recipe"].id for e in recommend.deck(db, limit=50)]


def test_reasons_explain_the_pick(client):
    a, b = build_corpus(client)
    client.post("/feedback", json={"recipe_id": a["id"], "verdict": "like"})

    db = SessionLocal()
    entry = next(e for e in recommend.rank(db) if e["recipe"].id == b["id"])
    assert any("harissa" in r for r in entry["reasons"])


def test_cooking_a_meal_counts_more_than_merely_planning_it(client):
    build_corpus(client)
    planned = make_named(client, "Planned Only", PANTRY + ["tamarind"], "chicken")
    cooked = make_named(client, "Actually Cooked", PANTRY + ["gochujang"], "chicken")
    twin_planned = make_named(client, "Tamarind Twin", PANTRY + ["tamarind"], "beef")
    twin_cooked = make_named(client, "Gochujang Twin", PANTRY + ["gochujang"], "beef")

    old = (date.today() - timedelta(days=40)).isoformat()  # outside the repeat window
    for recipe in (planned, cooked):
        client.post("/meal-plan", json={"date": old, "recipe_id": recipe["id"]})
    entry = client.get(f"/meal-plan?start={old}&end={old}").json()
    cooked_entry = next(e for e in entry if e["recipe"]["id"] == cooked["id"])
    client.post(f"/meal-plan/{cooked_entry['id']}/complete", json={"completed": True})

    db = SessionLocal()
    scores = {e["recipe"].id: e["score"] for e in recommend.rank(db)}
    assert scores[twin_cooked["id"]] > scores[twin_planned["id"]]


def test_no_single_protein_dominates_a_varied_library(client):
    """With many categories available, one big or well-scoring category must
    not swallow the deck — that was happening once the library grew past two
    proteins."""
    proteins = ["chicken", "beef", "pork", "lamb", "fish", "vegetarian"]
    for p in proteins:
        # pork deliberately over-represented, as it is in the real library
        count = 20 if p == "pork" else 5
        for i in range(count):
            make_named(client, f"{p} dish {i}", PANTRY + [f"{p} spice {i}"], p)

    db = SessionLocal()
    cards = recommend.deck(db, limit=12, rng=random.Random(11))
    counts = Counter(c["recipe"].protein_type for c in cards)

    assert len(cards) == 12
    assert max(counts.values()) <= 4, f"one protein took over the deck: {dict(counts)}"
    assert len(counts) >= 4, f"deck should span several proteins: {dict(counts)}"
