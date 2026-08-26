from datetime import date, timedelta

from tests.conftest import make_recipe


def test_feedback_upsert_and_clear(client):
    r = make_recipe(client)

    liked = client.post("/feedback", json={"recipe_id": r["id"], "verdict": "like"}).json()
    assert liked == {"recipe_id": r["id"], "verdict": "like", "shortlisted": True}

    # a second verdict replaces the first rather than stacking up
    passed = client.post("/feedback", json={"recipe_id": r["id"], "verdict": "dislike"}).json()
    assert passed["verdict"] == "dislike"
    assert passed["shortlisted"] is False

    cleared = client.post("/feedback", json={"recipe_id": r["id"], "verdict": "clear"}).json()
    assert cleared["verdict"] is None
    assert client.get("/recipes").json()[0]["verdict"] is None

    assert client.post(
        "/feedback", json={"recipe_id": 99999, "verdict": "like"}
    ).status_code == 404
    assert client.post(
        "/feedback", json={"recipe_id": r["id"], "verdict": "maybe"}
    ).status_code == 422


def test_undo_rewinds_the_last_swipe(client):
    first = make_recipe(client, title="First")
    second = make_recipe(client, title="Second")
    client.post("/feedback", json={"recipe_id": first["id"], "verdict": "like"})
    client.post("/feedback", json={"recipe_id": second["id"], "verdict": "dislike"})

    undone = client.post("/feedback/undo").json()
    assert undone["recipe_id"] == second["id"]

    by_id = {r["id"]: r for r in client.get("/recipes").json()}
    assert by_id[second["id"]]["verdict"] is None
    assert by_id[first["id"]]["verdict"] == "like"

    client.post("/feedback/undo")
    assert client.post("/feedback/undo").status_code == 404


def test_shortlist_holds_likes_until_they_are_planned(client):
    r = make_recipe(client, title="Wanted")
    assert client.get("/shortlist").json() == []

    client.post("/feedback", json={"recipe_id": r["id"], "verdict": "like"})
    assert [x["id"] for x in client.get("/shortlist").json()] == [r["id"]]

    # planning it takes it off the "still want to cook" list
    client.post("/meal-plan", json={
        "date": (date.today() + timedelta(days=1)).isoformat(),
        "recipe_id": r["id"],
    })
    assert client.get("/shortlist").json() == []


def test_shortlist_can_be_cleared_without_losing_the_like(client):
    r = make_recipe(client)
    client.post("/feedback", json={"recipe_id": r["id"], "verdict": "like"})

    client.patch(f"/shortlist/{r['id']}", json={"shortlisted": False})
    assert client.get("/shortlist").json() == []
    assert client.get("/recipes").json()[0]["verdict"] == "like"

    assert client.patch("/shortlist/99999", json={"shortlisted": True}).status_code == 404


def test_hidden_filter_partitions_the_library(client):
    keep = make_recipe(client, title="Keep")
    drop = make_recipe(client, title="Drop")
    client.post("/feedback", json={"recipe_id": drop["id"], "verdict": "hidden"})

    assert [r["id"] for r in client.get("/recipes").json()] == [keep["id"]]
    assert [r["id"] for r in client.get("/recipes?hidden=true").json()] == [drop["id"]]


def test_profile_ingredient_crud(client):
    added = client.post(
        "/profile/ingredients", json={"name": "  Harissa ", "stance": "like"}
    ).json()
    assert added["name"] == "harissa"  # normalized on the way in

    # same ingredient again updates in place instead of duplicating
    client.post(
        "/profile/ingredients",
        json={"name": "harissa", "stance": "avoid", "hard_filter": True},
    )
    prefs = client.get("/profile").json()["ingredients"]
    assert len(prefs) == 1
    assert prefs[0]["stance"] == "avoid" and prefs[0]["hard_filter"] is True

    assert client.delete(f"/profile/ingredients/{prefs[0]['id']}").json() == {"ok": True}
    assert client.get("/profile").json()["ingredients"] == []
    assert client.delete("/profile/ingredients/999").status_code == 404
    assert client.post(
        "/profile/ingredients", json={"name": "x", "stance": "sometimes"}
    ).status_code == 422


def test_hard_filter_only_applies_to_avoided_ingredients(client):
    added = client.post(
        "/profile/ingredients",
        json={"name": "garlic", "stance": "like", "hard_filter": True},
    ).json()
    assert added["hard_filter"] is False


def test_profile_reports_learned_taste(client):
    r = make_recipe(client, ingredients=[{"name": "harissa", "quantity": "1", "unit": ""}])
    assert client.get("/profile").json()["taste"]["has_signal"] is False

    client.post("/feedback", json={"recipe_id": r["id"], "verdict": "like"})
    taste = client.get("/profile").json()["taste"]
    assert taste["has_signal"] is True
    assert taste["counts"]["liked"] == 1
    assert "harissa" in [x["name"] for x in taste["likes"]]


def test_ingredient_autocomplete(client):
    make_recipe(client, ingredients=[
        {"name": "Harissa paste", "quantity": "1", "unit": ""},
        {"name": "Tomato", "quantity": "2", "unit": ""},
    ])
    assert "harissa paste" in client.get("/ingredients").json()
    assert client.get("/ingredients?q=har").json() == ["harissa paste"]
    assert client.get("/ingredients?q=zzz").json() == []


def test_mark_cooked_toggles_status(client):
    r = make_recipe(client)
    today = date.today().isoformat()
    entry = client.post("/meal-plan", json={"date": today, "recipe_id": r["id"]}).json()
    assert entry["status"] == "planned"

    done = client.post(f"/meal-plan/{entry['id']}/complete", json={"completed": True}).json()
    assert done["status"] == "completed"

    undone = client.post(f"/meal-plan/{entry['id']}/complete", json={"completed": False}).json()
    assert undone["status"] == "planned"

    assert client.post("/meal-plan/999/complete", json={"completed": True}).status_code == 404


def test_deck_and_recommendations_carry_reasons(client):
    for i in range(4):
        make_recipe(client, title=f"Recipe {i}", protein="beef" if i % 2 else "chicken")

    deck = client.get("/deck?limit=3").json()
    assert len(deck) == 3
    assert all("score" in c and "reasons" in c for c in deck)

    recs = client.get("/recommendations?limit=2").json()
    assert len(recs) == 2


def test_split_steps_normalizes_single_line_instructions():
    import ai

    # the model often ignores "separate steps with newlines"
    packed = "1. Heat the oil. 2. Add the chicken. 3. Simmer for 20 minutes."
    assert ai.split_steps(packed).split("\n") == [
        "1. Heat the oil.",
        "2. Add the chicken.",
        "3. Simmer for 20 minutes.",
    ]

    # already-formatted text is left alone
    proper = "1. First\n2. Second\n3. Third"
    assert ai.split_steps(proper) == proper

    # unnumbered prose stays as one block rather than being mangled
    prose = "Cook everything together until done."
    assert ai.split_steps(prose) == prose
    assert ai.split_steps("") == ""
