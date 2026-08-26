# Foodify — technical report

A complete map of the project: every module, function, endpoint, table and
component, plus the reasoning behind the non-obvious parts. Written to be handed
to someone (or something) that has never seen the codebase.

Generated from the code at ~7,250 lines across 46 source files.

---

## 1. What this is

A meal-planning app for a single household. It solves two stated problems:
deciding what to eat without cycling the same three chicken dishes, and killing
the daily "what's for dinner" stalemate by having a plan visible in advance.

Its distinguishing feature is a **content-based recommender** ("the taste
engine") trained on the user's own swipes, plans and cooked meals, which reorders
suggestions everywhere in the app.

**Stack**

| Layer | Choice |
|---|---|
| Backend | FastAPI + SQLAlchemy, Python 3.14 |
| Database | SQLite, single file at `backend/foodify.db` |
| Frontend | React 19 + TypeScript + Vite, CSS Modules |
| Data layer (client) | `@tanstack/react-query` |
| Routing | `react-router-dom` v7 |
| Recipe seed data | TheMealDB (free test key `1`) |
| AI | **Google Gemini free tier** via `google-genai` |
| Stock photos | **Openverse** (no API key) |
| Hosting | Local network only; one uvicorn process serves API + built SPA |

**Hard constraint:** the owner will not pay for any API. Every external service
used is free and keyless or free-tier. `SPEC.md` names the Anthropic API for AI
features; the implementation deliberately uses Gemini instead. *Do not "fix" this
to match the spec.*

---

## 2. Repo layout and how to run it

```
foodify/
├── SPEC.md                  original build spec (Anthropic API reference is outdated — see above)
├── README.md                user-facing docs
├── ARCHITECTURE.md          this file
├── .claude/launch.json      dev-server config for tooling
├── backend/
│   ├── .env                 GEMINI_API_KEY  (gitignored)
│   ├── .env.example
│   ├── requirements.txt
│   ├── foodify.db           SQLite database (gitignored)
│   ├── database.py          SQLAlchemy models + migration
│   ├── main.py              FastAPI app, all HTTP endpoints
│   ├── recommend.py         the taste engine
│   ├── ai.py                Gemini calls (nutrition, recipe generation)
│   ├── photos.py            Openverse stock-photo search
│   ├── seed.py              TheMealDB import + nutrition backfill
│   └── tests/               45 pytest tests
└── frontend/
    ├── vite.config.ts       dev proxy: /api → 127.0.0.1:8000, prefix stripped
    └── src/
        ├── main.tsx         router + providers
        ├── index.css        theme variables, tooltips, shared classes
        ├── lib/             api client, types, formatting, dates, image, swipe hook
        ├── context/         ToastContext
        ├── components/      Modal, Nav, SuggestModal, GenerateModal, DayPickerModal, PhotoPicker
        └── pages/           week/ day/ discover/ recipes/ profile/
```

**Run (production-ish, what the phone uses):**
```sh
cd frontend && npm run build
cd ../backend && .venv/bin/uvicorn main:server --host 0.0.0.0 --port 8000
```
`main:server` mounts the API under `/api` and serves `frontend/dist` with an SPA
fallback. Reachable on the LAN at `http://<machine-ip>:8000`.

**Dev:** `uvicorn main:app --port 8000` plus `npm run dev` (Vite on 5173, proxying
`/api`). Note `main:app` has **no** `/api` prefix; the prefix only exists on
`main:server`. The Vite proxy strips it so both modes work with the same client code.

**Tests:** `cd backend && .venv/bin/python -m pytest tests/`

---

## 3. Data model

Six tables. `user_id` is on every table (defaulting to `DEFAULT_USER_ID = 1`) so
real accounts later are additive rather than a rewrite — there is no login today.

### `recipes` (16 columns)
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER | default 1 |
| `title` | VARCHAR | indexed |
| `source` | VARCHAR | `seeded` \| `ai` \| `custom` |
| `protein_type` | VARCHAR | lowercase: chicken/beef/fish/… |
| `prep_time_minutes` | INTEGER | AI-estimated (TheMealDB has no prep time) |
| `instructions` | TEXT | newline-separated steps |
| `calories`, `protein_g`, `carbs_g`, `sugar_g` | INTEGER/FLOAT | AI-estimated per serving, nullable |
| `image_url` | TEXT | http URL **or** a `data:` URL for uploads |
| `image_is_stock` | BOOLEAN | true = photo of a *similar* dish, not this one |
| `image_attribution` | TEXT | required by CC licences; only set when stock |
| `external_id` | VARCHAR | TheMealDB id, unique — makes seeding idempotent |
| `created_at` | DATETIME | |

### `ingredients`
`id`, `user_id`, `recipe_id` FK, `name`, `quantity`, `unit`.
For seeded recipes `quantity` holds TheMealDB's whole freeform measure ("2 tbs",
"300ml") and `unit` is empty; AI-generated recipes split them properly.

### `meal_plan`
`id`, `user_id`, `date`, `meal_slot` (default `dinner`), `recipe_id` FK, `status`
(`planned` | `completed`).
**UNIQUE(user_id, date, meal_slot)** — this is what makes `POST /meal-plan` an
upsert rather than creating duplicates.

### `grocery_checks`
`id`, `user_id`, `meal_plan_id` FK, `ingredient_id` FK, `checked`.
**UNIQUE(meal_plan_id, ingredient_id)**. Rows are created lazily the first time a
meal's checklist is opened, and deleted when the meal is swapped.

### `recipe_feedback` — the taste signal
`id`, `user_id`, `recipe_id` FK, `verdict` (`like`|`dislike`|`hidden`),
`shortlisted` BOOL, `created_at`, `updated_at`.
**UNIQUE(user_id, recipe_id)** — one verdict per recipe, re-swiping updates it.
A `like` sets `shortlisted=true`; clearing the shortlist keeps the taste signal.

### `ingredient_prefs` — explicit profile preferences
`id`, `user_id`, `name` (normalized), `stance` (`like`|`avoid`), `hard_filter`
BOOL, `created_at`. **UNIQUE(user_id, name)**.
`hard_filter` on an avoid = allergy; the recipe is removed entirely rather than
downranked. It is force-set to false for `like` stances.

### Migrations
`database._migrate()` runs at import. SQLite can only `ALTER TABLE ADD COLUMN`,
so post-release columns are listed in `_ADDED_COLUMNS` as
`(table, column, "DDL TYPE DEFAULT x")` triples and added if absent. Currently:
`ingredients.user_id`, `grocery_checks.user_id`, `recipes.image_is_stock`,
`recipes.image_attribution`. Adding a new column = append one tuple.

---

## 4. Backend modules

### `database.py` (175 lines)
Engine, session factory, models above. Constants: `MEAL_SLOTS`, `SOURCES`,
`VERDICTS`, `STANCES`, `DEFAULT_USER_ID`. `utcnow()` for timestamps.
`DATABASE_URL` defaults to an **absolute** path next to the file so the server
works regardless of the cwd it's launched from; overridable with
`FOODIFY_DATABASE_URL` (the test suite points this at a temp file).

### `ai.py` (185 lines) — Gemini
| Symbol | Purpose |
|---|---|
| `MODEL` | env `FOODIFY_MODEL`, default `gemini-3.6-flash` |
| `FALLBACK_MODELS` | env `FOODIFY_FALLBACK_MODELS`, default `gemini-3.5-flash-lite` |
| `AIUnavailable` | raised when no key is configured |
| `NO_KEY_MESSAGE` | the user-facing "set GEMINI_API_KEY" text |
| `NutritionEstimate` | Pydantic: calories, protein_g, carbs_g, sugar_g, prep_time_minutes |
| `NutritionEstimateFor` / `NutritionBatch` | batch variants that echo back a recipe `id` |
| `GeneratedRecipe` / `GeneratedIngredient` | full generated-recipe schema |
| `has_key()` | true if `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set |
| `_is_quota_error(e)` | detects 429 / RESOURCE_EXHAUSTED |
| `_generate(prompt, schema)` | core call using `response_schema` structured output; **on a quota error it walks `[MODEL, *FALLBACK_MODELS]`** because each model has its own free-tier allowance |
| `split_steps(text)` | forces one numbered step per line — the model frequently returns "1. … 2. …" on a single line, which renders as a wall of text |
| `estimate_nutrition(...)` | one recipe |
| `estimate_nutrition_batch(recipes)` | ~10 recipes per call; **matches results by echoed `id`, never list order**, since the model can reorder or drop entries |
| `generate_recipe(protein, time_minutes, mood)` | invents a recipe from constraints |

**Free-tier reality:** the daily cap is roughly **20 requests per day per model**.
This is the single biggest operational constraint. Batching + model fallback exist
because of it.

### `photos.py` (65 lines) — Openverse
| Symbol | Purpose |
|---|---|
| `API`, `UA`, `PER_PAGE=8` | endpoint config; a User-Agent is required |
| `_license_label(code, version)` | `"by"+"2.0"` → `"CC BY 2.0"`; `"cc0"` is already prefixed so it isn't doubled |
| `_clean(item)` | maps an Openverse result to `{url, thumbnail, title, creator, license, attribution, source_url}` |
| `search(query, page)` | **returns `[]` rather than raising** on any failure — a missing photo is cosmetic and must never fail the request that wanted one |

### `recommend.py` (521 lines) — the taste engine
See §6 for the algorithm. Public surface:

| Symbol | Purpose |
|---|---|
| `normalize(name)` | lowercase, collapse whitespace, strip punctuation |
| `_recency(when, now)` | decay multiplier, half-life 180d, floored at 0.25 |
| `Index` | corpus stats: `docs` (recipe → ingredient set), `df`, `idf`, `weight(term)`, `is_distinctive(term)` |
| `_singularize(names)` | plural→singular **only when the singular exists in the corpus** — merges "chicken breasts"→"chicken breast" without a synonym table |
| `build_index(db)` | cached; the cache key is `(recipe count, ingredient count, max recipe id)` so it self-invalidates on insert |
| `invalidate_cache()` | called explicitly by `POST /recipes` |
| `Taste` | everything learned for one user: `feedback`, `hidden`, `pref_like`, `pref_avoid`, `blocked`, `last_planned`, `completed`, `affinity`, `protein_affinity`, `evidence`, `liked_time`, `protein_share`, `fatigue_confidence` |
| `Taste.has_signal` | whether anything has been learned yet (drives cold start) |
| `Taste.is_blocked(id)` | hidden, or contains a hard-filtered ingredient |
| `Taste.coverage(id)` | 0–1, how much evidence exists about this recipe's ingredients |
| `Taste.score(id)` | → `(score, reasons[])` |
| `_weighted_sample(items, weights, k, rng, cap, key)` | sample without replacement, optionally capping picks per key (used to cap one protein's share of the deck) |
| `_protein`, `_distance`, `_diverse_seed`, `_spread_proteins` | deck construction helpers |
| `rank(db, limit, exclude, user_id)` | every eligible recipe, best first |
| `deck(db, limit, user_id, rng)` | the swipe deck |
| `taste_summary(db, user_id)` | what the profile page shows |

### `seed.py` (162 lines) — TheMealDB import
| Symbol | Purpose |
|---|---|
| `API`, `CATEGORIES` | `{"Chicken": "chicken", "Beef": "beef"}` |
| `_get(path, **params)` | handles `{"meals": null}` (no results) explicitly |
| `ingredients_of(meal)` | reads `strIngredient1..20`/`strMeasure1..20`, stops at first empty |
| `seed_recipes(db)` | skips existing `external_id`s → **idempotent, re-runnable** |
| `BATCH_SIZE = 10`, `_apply`, `_payload`, `_with_backoff` | batching helpers |
| `backfill_nutrition(db)` | estimates macros for every recipe with `calories IS NULL`, in batches, committing per batch so an interrupted run keeps progress; falls back to per-recipe calls for any id the model dropped |

Run: `.venv/bin/python seed.py` (add `--skip-nutrition` to import only).
Because it's idempotent, **re-running it tomorrow is the documented fix for a
backfill that ran out of daily quota.**

### `main.py` (700 lines) — FastAPI
Two app objects:
- `app` — the API itself (CORS allows the Vite dev origins).
- `server` — production wrapper: `server.mount("/api", app)` plus an SPA catch-all
  serving `frontend/dist`, with `Cache-Control: no-cache` on the shell.

Shared serializers: `recipe_brief(r, feedback)`, `recipe_full(r)`,
`plan_entry(mp)`, `feedback_map(db)`, `_card(entry, fb)` (deck card = brief +
`score` + `reasons`).

---

## 5. HTTP API

All paths are relative to `/api` in production, bare in dev.

### Recipes
| Method | Path | Params / body | Returns |
|---|---|---|---|
| GET | `/recipes` | `protein_type`, `source`, `q`, `hidden`, `shortlisted`, `nutrition`, `status` | `RecipeBrief[]` |
| GET | `/recipes/protein-types` | — | `string[]` (distinct, sorted) |
| GET | `/recipes/{id}` | — | `RecipeFull` (adds instructions + ingredients) |
| POST | `/recipes` | `RecipeBody` | `RecipeFull` — also `recommend.invalidate_cache()` |
| POST | `/recipes/generate` | `{protein, time_minutes, mood}` | unsaved candidate; **503** if no key, **502** on AI failure |
| PATCH | `/recipes/{id}/image` | `{image_url, image_is_stock, image_attribution}` | `RecipeFull` |

`nutrition` ∈ `light` (<500 kcal) \| `high_protein` (≥35 g) \| `low_carb` (≤20 g) \|
`low_sugar` (≤5 g) — thresholds live in `NUTRITION_FILTERS` in `main.py` and were
picked from the real distribution so each selects a useful slice (73/92/75/87 of
179 recipes). `status` ∈ `liked` \| `ai` \| `custom` \| `hidden`. Unknown values → 422.
Hidden recipes are excluded from `/recipes` unless explicitly requested.

### Taste engine
| Method | Path | Notes |
|---|---|---|
| GET | `/deck?limit=20` | swipe cards + `score` + `reasons` |
| GET | `/recommendations?limit=30` | full ranking; powers "surprise me" |
| GET | `/shortlist` | liked **and** not yet planned |
| POST | `/feedback` | `{recipe_id, verdict}`; verdict ∈ like/dislike/hidden/**clear** |
| POST | `/feedback/undo` | deletes the most recent row, **returns `{recipe_id, verdict, card}`** where `card` is the full deck card so the client can restack that exact recipe |
| GET | `/feedback/history?verdict=` | newest first, each `{recipe, verdict, decided_at}` |
| PATCH | `/shortlist/{recipe_id}` | `{shortlisted}` — drop from shortlist without losing the like |
| GET | `/ingredients?q=&limit=20` | autocomplete over the real ingredient corpus |
| GET | `/profile` | `{ingredients: IngredientPref[], taste: TasteSummary}` |
| POST | `/profile/ingredients` | `{name, stance, hard_filter}`; upserts on normalized name |
| DELETE | `/profile/ingredients/{id}` | |
| GET | `/photo-search?q=&page=1` | Openverse proxy; `[]` on any failure |

### Meal plan
| Method | Path | Notes |
|---|---|---|
| GET | `/meal-plan?start=&end=` | any date range (week view and month view both use it) |
| POST | `/meal-plan` | upsert on (date, slot); **swapping clears that meal's grocery checks** |
| POST | `/meal-plan/{id}/complete` | `{completed}` → status `completed`/`planned` |
| DELETE | `/meal-plan/{id}` | grocery checks cascade |
| GET | `/meal-plan/{id}/grocery` | creates check rows lazily on first open |
| PATCH | `/meal-plan/{id}/grocery/{ingredient_id}` | `{checked}`; 404 if the ingredient isn't part of that meal |

---

## 6. The recommender, in detail

Single household → no collaborative filtering is possible, so everything is
content-based and learned from this user alone.

**Core insight:** ingredients carry the taste signal, but *not equally*. `garlic`
appears in over half the library and says nothing about anyone; a one-off spice
says a lot. Inverse document frequency handles that automatically — no
hand-maintained stopword list.

`idf(t) = ln(N / (1 + df(t))) + 1` — measured on the real corpus this gives
`garlic` ≈ 1.63 and a singleton ≈ 5.48, a ~3.4× spread.

**Evidence weights** (`recommend.py` top):

| Event | Weight |
|---|---|
| Marked cooked | +1.5 |
| Swipe like | +1.0 |
| Planned | +0.4 |
| Swipe dislike | −1.0 |
| Profile: liked ingredient | +2.0 |
| Profile: avoided ingredient | −3.0 |

Each is multiplied by `_recency(...)` — half-life 180 days, floor 0.25 — so a
swipe from last year counts for less than one from last week.

**Shrunk affinity** per ingredient: `a(t) = Σw / (Σ|w| + SHRINK)` with
`SHRINK = 2.0`, so a term stays near zero until evidence accumulates and one
swipe can never dominate. Same formula for protein type.

**Score:**
```
S_ing   = Σ a(t)·idf(t) / Σ idf(t)        # length-normalized
score   = 1.00·S_ing
        + 0.35·S_protein
        + 0.15·S_time                      # closeness to mean liked prep time
        + 0.08·(1 − coverage)              # novelty / exploration bonus
        − repeat_penalty
        − protein_fatigue
```
- **repeat_penalty** — `W_REPEAT = 1.2`, `REPEAT_WINDOW_DAYS = 21`, decaying with
  age. A meal **already on the calendar in the future** takes the full penalty and
  the reason "already planned". This is the mechanism that answers the spec's
  actual problem statement.
- **protein_fatigue** — if one protein is ≥50% of the last `FATIGUE_WINDOW_MEALS = 7`
  planned meals, it is damped by `W_FATIGUE = 0.5` scaled by
  `fatigue_confidence = min(1, n_recent/7)`. The confidence ramp exists because
  two chicken dinners is not evidence that someone is sick of chicken; without it
  the penalty swamped the ingredient signal and produced a categorical protein ban.

**Reasons** are the top positive ingredient contributions, filtered by
`Index.is_distinctive(t)` (`df ≤ max(2, 20% of corpus)`) so explanations never say
"you like water".

**Deck assembly** (`deck()`):
- Candidates exclude anything already judged **except** a `dislike` older than
  `DISLIKE_RETURN_DAYS = 90`, which becomes eligible again. `hidden` is never
  auto-restored — hiding is deliberate.
- **Cold start** (`has_signal == False`): `_diverse_seed()` round-robins across
  proteins and, within each, greedily picks the recipe most unlike what's already
  chosen. Rotating proteins is load-bearing: pure ingredient-distance selection
  returned eight beef dishes that merely differed from one another.
- **Warm**: ~70% exploit (weighted sample from the top band, **capped at ~60% per
  protein** so a systematically higher-scoring protein can't take the whole deck)
  + ~30% explore (lowest `coverage`), interleaved, then `_spread_proteins()`
  prevents three of the same protein in a row.

---

## 7. Frontend

### Routes (`main.tsx`)
| Path | Page |
|---|---|
| `/` | `WeekView` — agenda (week) or calendar (month) |
| `/day/:id` | `DayDetail` — recipe, macros, grocery checklist |
| `/discover` | `Discover` — swipe deck |
| `/discover/history` | `History` — every past swipe, changeable |
| `/recipes` | `RecipeBrowse` — searchable, filtered library |
| `/recipe/:id` | `RecipePage` — full recipe, photo controls, "Plan this" |
| `/profile` | `Profile` — ingredient likes/avoids + learned taste |

All wrapped in `Layout` (Nav + Suspense + Footer) inside
`QueryClientProvider` → `ToastProvider` → `BrowserRouter`. Pages other than
`WeekView` are lazy-loaded.

### `lib/`
- **`api.ts`** — `api<T>(path, opts)` wrapper + `ApiError`; ~25 typed helpers
  (`apiRecipes`, `apiDeck`, `apiFeedback`, `apiUndoFeedback`, `apiHistory`,
  `apiPhotoSearch`, `apiSetImage`, `apiPlanRange`, `apiMarkCooked`, …).
  Base URL is `import.meta.env.VITE_API_BASE ?? "/api"`.
- **`types.ts`** — `RecipeBrief`, `RecipeFull`, `RecipeCandidate`, `DeckCard`,
  `PlanEntry`, `GroceryList`, `StockPhoto`, `HistoryEntry`, `Profile`,
  `TasteSummary`, `Verdict`, `Stance`.
- **`format.ts`** — `macroLine(r)`, `mealImage(url, size)`, `imageBox(size)`,
  `ingredientLabel(i)`.
- **`dates.ts`** — `iso` (local yyyy-mm-dd; `toISOString` would shift across
  midnight), `startOfWeek` (Monday), `addDays`, `addMonths`, `monthGrid` (6×7),
  `rangeLabel`, `monthLabel`, `WEEKDAY_HEADS`.
- **`image.ts`** — `fileToSquareDataUrl(file)`: centre-crops and scales an upload
  to a 500 px square JPEG (q 0.82, ~50 KB) stored as a data URL. Rejects
  non-images and files >12 MB.
- **`useSwipe.ts`** — pointer-event drag hook returning `{handlers, style, intent,
  fly, busy}`. Threshold 90 px; right = like, left = pass, down = hide. No gesture
  library needed since pointer events cover mouse/touch/pen.

### Components
- **`Modal`** — backdrop, Escape to close, body scroll lock; becomes a bottom
  sheet under 640 px.
- **`Nav` / `Footer`** — Plan / Discover / Recipes / Taste + theme toggle
  (`data-theme` on `<html>`, persisted to localStorage, set pre-paint in
  `index.html` to avoid a flash).
- **`SuggestModal`** — protein/time filters, "surprise me" sampling from the top
  25 of `/recommendations`, plus a shortlist strip of liked-but-unplanned recipes.
- **`GenerateModal`** — protein/time/mood form → candidate; **auto-searches
  Openverse for a photo** on success; accept saves (and assigns if opened from a day).
- **`DayPickerModal`** — next 14 days showing what's already planned on each.
- **`PhotoPicker`** — shared by generate and recipe pages. Stock badge, CC credit,
  reroll (walks results then pages), upload, remove.

### Pages of note
- **`WeekView`** — mode toggle persisted to localStorage. **Week = agenda list**:
  one row per day with date gutter, square thumb, title/macros, and
  `Mark cooked` / `Swap` / `Clear` as labelled buttons; 2 columns desktop, 1 mobile.
  **Month** = 6×7 calendar of compact chips.
- **`Discover`** — 3-card stack, keyboard arrows, undo that **restacks the exact
  card returned by the API** rather than refetching a new recommendation.
- **`RecipeBrowse`** — grouped filter rows (Protein / Nutrition / Status) and a
  hide flow where the write fires immediately and the card flips to a
  "was hidden — Undo (5…)" countdown in place.

### Styling
CSS Modules per component plus `index.css` for theme variables, `.btn`, `.macros`,
toasts, and the tooltip system. Dark and light themes via CSS variables under
`[data-theme="light"]`. Tooltips: any element with `data-tip="…"` gets a `::after`
bubble that fades in after a 500 ms delay, wrapped in `@media (hover: hover)` so it
never triggers on touch; `aria-label` remains for screen readers.

---

## 8. Non-obvious behaviour worth knowing before changing things

1. **`mealImage()` only appends size suffixes for TheMealDB URLs.** `/preview`,
   `/medium`, `/large` are a TheMealDB convention; appending them to an Openverse
   or `data:` URL breaks it.
2. **TheMealDB images are square** (`/preview` 150², `/large` 500²). Every image
   box uses `aspect-ratio: 1/1` **plus `height: auto`** — without `height: auto`
   the HTML `height` attribute silently overrides `aspect-ratio` and images render
   stretched.
3. **Swapping a meal deletes its grocery checks** — the old checklist is
   meaningless against a new recipe.
4. **`build_index` is cached module-level.** Tests must call
   `recommend.invalidate_cache()` between cases (the `fresh_db` autouse fixture
   does this).
5. **Uploading a photo clears `image_is_stock`** — your own photo is of the real
   dish. The backend enforces this, not just the UI.
6. **`POST /recipes` accepts `image_is_stock`/`image_attribution`.** It didn't
   originally, which silently dropped CC credit on saved generated recipes — a
   licensing problem, now regression-tested.
7. **`/feedback/undo` deletes rather than reverts.** There is no verdict history
   stack; it removes the most recently updated row.
8. **Dates are local, not UTC.** `dates.iso()` deliberately avoids
   `toISOString()`.
9. **Gemini model IDs go stale.** `gemini-2.5-flash` began returning
   *"no longer available to new users"*. If AI features 404, check the model name
   before anything else.

---

## 9. Tests (45, all passing)

| File | Count | Covers |
|---|---|---|
| `test_api.py` | 5 | recipe CRUD/filters, meal-plan upsert, grocery persistence + reset-on-swap, clear day, 503 without an API key |
| `test_taste_api.py` | 12 | feedback upsert/clear/undo, shortlist semantics, hidden partitioning, profile CRUD, autocomplete, mark-cooked, deck/recommendation shape, `split_steps` |
| `test_recommend.py` | 14 | IDF vs pantry staples, plural merging, like/dislike propagation, hidden exclusion, repeat + already-planned demotion, avoid & hard filter, cold-start diversity, deck protein balance, reasons, cooked > planned |
| `test_v3_api.py` | 14 | nutrition/status filters, photo-search proxy + graceful failure, image stock flag set/clear, undo returns the card, history ordering/filtering/changes, 90-day dislike return vs hidden staying hidden, recency decay, stock credit surviving save, licence labels |

Photo search and AI are stubbed via `monkeypatch` — the suite makes no network calls.
`tests/conftest.py` points `FOODIFY_DATABASE_URL` at a temp file before importing
`database`, recreates tables per test, and provides `make_recipe` / `make_named`.

---

## 10. Current state

- **179 recipes** (176 seeded from TheMealDB, 3 AI-generated), 2,202 ingredients.
- **All recipes have macro estimates** — none missing.
- Live DB also holds real usage: 22 swipe verdicts, 3 meal-plan entries.
- Nothing has been committed to git yet — the repo is initialised with a
  `.gitignore` but has no commits.

### Known limitations / obvious next steps
- Single user; no auth (schema is ready, UI is not).
- Only `dinner` is used, though `meal_slot` supports breakfast/lunch.
- No weekly aggregated grocery list (explicitly out of scope in `SPEC.md`).
- Gemini free tier ~20 requests/day/model is the main operational limit.
- `data:` URL photos live in SQLite; fine at this scale, would want object storage
  if the library grew large.
- No frontend test suite (backend only).
