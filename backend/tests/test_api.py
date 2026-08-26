from tests.conftest import make_recipe


def test_recipe_create_and_filters(client):
    make_recipe(client, "Chicken Korma", "chicken")
    make_recipe(client, "Beef Chili", "beef")

    assert len(client.get("/recipes").json()) == 2
    chicken = client.get("/recipes", params={"protein_type": "chicken"}).json()
    assert [r["title"] for r in chicken] == ["Chicken Korma"]
    search = client.get("/recipes", params={"q": "chili"}).json()
    assert [r["title"] for r in search] == ["Beef Chili"]
    assert client.get("/recipes/protein-types").json() == ["beef", "chicken"]

    full = client.get(f"/recipes/{chicken[0]['id']}").json()
    assert len(full["ingredients"]) == 2
    assert client.get("/recipes/99999").status_code == 404


def test_meal_plan_upsert_swaps_in_place(client):
    r1 = make_recipe(client, "First Dinner")
    r2 = make_recipe(client, "Second Dinner")

    a = client.post("/meal-plan", json={"date": "2026-08-24", "recipe_id": r1["id"]})
    assert a.status_code == 200
    entry = a.json()
    assert entry["meal_slot"] == "dinner"
    assert entry["recipe"]["id"] == r1["id"]

    # same day + slot with another recipe replaces, doesn't duplicate
    b = client.post("/meal-plan", json={"date": "2026-08-24", "recipe_id": r2["id"]})
    assert b.json()["id"] == entry["id"]
    assert b.json()["recipe"]["id"] == r2["id"]

    week = client.get(
        "/meal-plan", params={"start": "2026-08-24", "end": "2026-08-30"}
    ).json()
    assert len(week) == 1

    assert client.post(
        "/meal-plan", json={"date": "2026-08-24", "recipe_id": 99999}
    ).status_code == 404
    assert client.post(
        "/meal-plan",
        json={"date": "2026-08-24", "meal_slot": "brunch", "recipe_id": r1["id"]},
    ).status_code == 422


def test_grocery_checklist_persists_and_resets_on_swap(client):
    r1 = make_recipe(client, "Dinner A")
    r2 = make_recipe(client, "Dinner B")
    entry = client.post("/meal-plan", json={"date": "2026-08-25", "recipe_id": r1["id"]}).json()

    grocery = client.get(f"/meal-plan/{entry['id']}/grocery").json()
    assert grocery["recipe_title"] == "Dinner A"
    assert [i["checked"] for i in grocery["items"]] == [False, False]

    first = grocery["items"][0]["ingredient_id"]
    r = client.patch(
        f"/meal-plan/{entry['id']}/grocery/{first}", json={"checked": True}
    )
    assert r.json() == {"ingredient_id": first, "checked": True}

    # persists across fetches
    again = client.get(f"/meal-plan/{entry['id']}/grocery").json()
    assert {i["ingredient_id"]: i["checked"] for i in again["items"]}[first] is True

    # swapping the meal resets the checklist to the new recipe's ingredients
    client.post("/meal-plan", json={"date": "2026-08-25", "recipe_id": r2["id"]})
    swapped = client.get(f"/meal-plan/{entry['id']}/grocery").json()
    assert swapped["recipe_title"] == "Dinner B"
    assert all(i["checked"] is False for i in swapped["items"])

    # ingredient from the old recipe no longer accepted
    assert client.patch(
        f"/meal-plan/{entry['id']}/grocery/{first}", json={"checked": True}
    ).status_code == 404


def test_clear_day(client):
    r1 = make_recipe(client)
    entry = client.post("/meal-plan", json={"date": "2026-08-26", "recipe_id": r1["id"]}).json()
    client.get(f"/meal-plan/{entry['id']}/grocery")  # create check rows

    assert client.delete(f"/meal-plan/{entry['id']}").json() == {"ok": True}
    assert client.get(
        "/meal-plan", params={"start": "2026-08-26", "end": "2026-08-26"}
    ).json() == []
    assert client.delete(f"/meal-plan/{entry['id']}").status_code == 404


def test_generate_without_key_returns_503(client, monkeypatch):
    import ai
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    r = client.post("/recipes/generate", json={"protein": "chicken"})
    assert r.status_code == 503
    assert "GEMINI_API_KEY" in r.json()["detail"]
