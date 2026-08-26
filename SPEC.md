# Foodify — Build Spec

*Feed this whole file to Claude Code as your first message in a new project folder, or save it as `SPEC.md` in the repo root and point Claude Code at it.*

## What this is

A meal planning app for one household (single account for now). Solves two real problems: deciding what to eat without repeating the same two or three chicken dishes, and killing the daily "what's for dinner" stalemate by having a plan visible ahead of time, with a quick escape hatch for the nights nobody feels like cooking.

## Tech stack

- **Backend**: FastAPI (Python), same as Booker
- **Frontend**: React + TypeScript, Vite, same as Booker
- **Database**: SQLite, single file, no separate DB server needed
- **Recipe seed data**: TheMealDB API, free test key
- **AI features**: Anthropic API (recipe generation, nutrition estimation), needs its own API key, see Costs below
- **Hosting**: local network only. FastAPI serves the built frontend and the API from one process, bound to `0.0.0.0` so it's reachable from a phone over home wifi at the machine's LAN IP. No cloud deployment for v1.

## Costs before you start

- TheMealDB's free test key (literally the string `1`) works for personal projects, no signup, no rate-limit trouble at this scale. A paid supporter key only matters if this ever ships publicly.
- The Claude Pro/Max chat subscription does not cover this part. Calls the backend makes to the Claude API are billed separately, per token, through a Console account at platform.claude.com. At the volume this app actually uses (a handful of recipe generations and nutrition estimates a week) it's a trivial cost, but it's a real, separate line item, check current per-token rates on Anthropic's pricing page rather than assuming it's included.

## Feature scope, locked

- Weekly calendar view, each day shows its assigned meal (dinner-focused for v1, but the data model supports other meal slots later)
- Quick-suggest / swap: replace any day's meal in one action, either "surprise me" or filtered by protein/time
- Recipe library seeded from TheMealDB (chicken + beef/minced-meat categories to start), each recipe tagged with an AI-estimated calorie/protein/carb/sugar readout
- "Generate something new" mode: describe what's wanted (protein, time, mood), Claude proposes a recipe, accept or discard it into the library
- Per-meal grocery checklist: open a day, see that meal's ingredients, check them off. No weekly aggregated list in v1.
- Single user, no login screen, but the schema carries a `user_id` on every table so real accounts later are additive, not a rewrite

## Explicitly out of scope for v1

- Multi-user/shared household accounts
- Weekly aggregated grocery list across multiple meals
- Full food diary or macro logging beyond the per-recipe estimate
- Social features of any kind
- Native mobile app packaging
- Restaurant or delivery integration
- Public hosting/deployment

## Data model

**recipes**
- id, title, source (`seeded` / `ai` / `custom`), protein_type, prep_time_minutes
- instructions (text)
- calories, protein_g, carbs_g, sugar_g (AI-estimated, nullable until estimated)
- image_url, external_id (TheMealDB id if seeded), created_at

**ingredients**
- id, recipe_id (FK), name, quantity, unit

**meal_plan**
- id, user_id, date, meal_slot (`breakfast`/`lunch`/`dinner`, default `dinner`), recipe_id (FK), status (`planned`/`completed`)

**grocery_checks**
- id, meal_plan_id (FK), ingredient_id (FK), checked (bool, default false)

## API endpoints

- `GET /recipes` — list/filter by protein_type, source
- `GET /recipes/{id}` — full recipe detail
- `POST /recipes/generate` — AI-generate a candidate recipe from constraints, not saved until accepted
- `POST /recipes` — save a generated or custom recipe
- `GET /meal-plan?start=&end=` — week view
- `POST /meal-plan` — assign or swap a recipe onto a date + slot (upsert)
- `DELETE /meal-plan/{id}` — clear a day
- `GET /meal-plan/{id}/grocery` — ingredients + checked state for that meal
- `PATCH /meal-plan/{id}/grocery/{ingredient_id}` — toggle a checkbox

## Frontend pages

- **Week view**: 7-day grid, each day a card showing its meal or an empty "plan something" state, quick swap button on every card
- **Day detail**: recipe name, instructions, macro readout, ingredient checklist
- **Suggest/swap modal**: opens from week view or day detail, "surprise me" button plus protein/time filters, shows one candidate at a time with accept/skip
- **Generate flow**: small form (protein, time available, mood/craving), calls `/recipes/generate`, shows the result with accept/discard
- **Recipe browse**: simple searchable list of everything in the library

## Recipe seeding plan

1. One-time (re-runnable) script hits TheMealDB's `filter.php?c=Chicken` and `filter.php?c=Beef` (minced meat mostly falls under Beef there), then `lookup.php?i={id}` for each result to pull full instructions and ingredients
2. TheMealDB returns numbered ingredient/measure fields up to 20, most blank, stop at the first empty one when building the ingredient list
3. A search with no results returns `{"meals": null}`, handle that explicitly rather than assuming an error
4. Store each into `recipes` + `ingredients` with `source = seeded`
5. For each seeded recipe, call the Claude API once with its ingredients and instructions, ask for a calorie/protein/carb/sugar estimate, store the result back onto the recipe. This is the one place the AI feature is required for v1, not optional, since TheMealDB doesn't include nutrition data itself

## Build order

1. Scaffold: backend + frontend folders, FastAPI skeleton, Vite + React + TS skeleton, SQLite file, `.gitignore`, README
2. Data models + migrations matching the schema above
3. Seeding script (TheMealDB fetch + AI nutrition backfill), run it once to populate the library
4. Core API endpoints: recipes, meal-plan, grocery
5. Frontend: week view + day detail, wired to the API
6. Suggest/swap flow + generate flow
7. Grocery checklist UI with persisted checked state
8. Polish: dark/light theme (reuse Booker's), mobile-responsive layout since this gets used from a phone
9. Bind the server to `0.0.0.0`, confirm it's reachable from a phone on the same wifi using the PC's LAN IP

## Environment notes

- Runs on CachyOS (Arch-based), fish shell. Stick to pip/npm rather than distro-specific package managers so nothing here is Arch-locked if it ever moves.
- Reuse Booker's patterns wherever they fit (FastAPI structure, SQLAlchemy models, theming) instead of reinventing them, this should build fast on top of already-proven code.

## Definition of done for v1

- [ ] Opens from a phone browser over home wifi
- [ ] Week view shows real assigned meals, not placeholders
- [ ] Any day's meal can be swapped in a couple taps
- [ ] Every recipe shows a macro estimate
- [ ] Grocery checklist persists checked state between visits
- [ ] "Generate something new" produces a usable recipe, not a hallucinated mess
