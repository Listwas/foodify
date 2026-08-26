# foodify

meal planning for one household. weekly dinner calendar, quick "surprise me" swaps, a recipe library seeded from [TheMealDB](https://www.themealdb.com), AI-estimated macros, AI recipe generation, and a per-meal grocery checklist. python/fastapi backend + react frontend, sqlite, no accounts.

built to answer "what's for dinner" without cooking the same three chicken dishes forever.

## what it does

- **plan view**: an agenda of the week — each day a row with its photo, macros and buttons for *mark cooked*, *swap* and *clear* — or a month calendar when you want the wider view
- **discover**: swipe through recipes tinder-style. Every swipe trains a taste model that reorders suggestions everywhere else in the app. Undo puts back the exact card you just swiped
- **swipe history**: everything you've ever swiped, with the date and your verdict, all changeable. Nothing is a one-way door — recipes you passed on quietly return to the deck after a few months
- **suggest/swap**: ranked by what it's learned about you, filtered by protein or max cooking time, with liked recipes offered first
- **generate something new**: describe protein/time/mood, the AI proposes a recipe, keep it or toss it
- **recipe library**: ~175 chicken & beef recipes seeded from TheMealDB, filterable by protein, nutrition (under 500 kcal, 35g+ protein, low carb, low sugar) and status (liked, AI-made, custom, hidden). *Plan this* puts any recipe straight onto a day. Hide anything you never want to see, with 5 seconds to undo
- **photos**: generated recipes borrow an openly-licensed photo of a similar dish — clearly badged as stock, credited, and rerollable. You can upload your own photo for any recipe, seeded ones included
- **taste profile**: tell it ingredients you like or avoid (allergies can be hard-filtered), and see what it has worked out on its own
- **macros**: AI-estimated calories/protein/carbs/sugar per recipe (needs the free key below)
- **grocery checklist**: open a day, tick off that meal's ingredients, state persists

## how the recommendations work

Content-based, learned entirely from your own signals — there's no second user to
compare against. Ingredients carry the taste signal, but not equally: `garlic` is in
over half the library and says nothing about anyone, while `harissa` appears once and
says a lot. Inverse document frequency handles that weighting automatically.

- **evidence**: cooking a meal counts most, then a right-swipe, then merely planning it; left-swipes count against. Stated profile preferences outweigh all of it.
- **shrinkage**: an ingredient's score stays near zero until enough evidence accumulates, so one swipe can't take over the ranking.
- **variety**: anything planned in the last three weeks is pushed down, and a protein you've eaten repeatedly gets damped — this is the "stop suggesting the same three chicken dishes" part.
- **exploration**: about a third of the deck is deliberately stuff it knows little about, so it keeps learning instead of narrowing. With no history at all it opens with a maximally varied spread.
- **drift**: old evidence counts for less than recent evidence, and a recipe you passed on becomes eligible again after 90 days. Hiding is deliberate, so that one stays until you undo it yourself.

Every suggestion says why it was picked ("you like curry powder + garam masala"). Pantry
staples never appear in those explanations — "you like water" is true of everyone.

Photos for AI-generated recipes come from [Openverse](https://openverse.org) (openly
licensed, no API key). They're always labelled as a photo of a *similar* dish rather than
the real thing, and the CC attribution is shown alongside.

## setup

```sh
# backend
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py        # fills the library from TheMealDB

# frontend
cd ../frontend
npm install
npm run build
```

### AI features (free)

Grab a free key at [aistudio.google.com](https://aistudio.google.com) (no card needed), then:

```sh
cp backend/.env.example backend/.env   # paste the key into GEMINI_API_KEY
cd backend && .venv/bin/python seed.py # re-run to backfill macros (~20 min, free-tier rate limits)
```

Without the key everything still works — recipes just show no macros and "generate" politely refuses.

The free tier has a daily request cap. If the backfill stops partway, it's just out of
quota for the day: re-run `seed.py` tomorrow and it picks up exactly where it left off.
When the main model's allowance is spent the app automatically continues on a lighter
one (`FOODIFY_FALLBACK_MODELS`).

## running it

```sh
cd backend
.venv/bin/uvicorn main:server --host 0.0.0.0 --port 8000
```

One process serves the app and the API. On the same wifi, open `http://<this machine's LAN IP>:8000` from your phone.

### dev mode

```sh
cd backend && .venv/bin/uvicorn main:app --port 8000    # api with hot /docs
cd frontend && npm run dev                              # vite on :5173, /api proxied
```

## tests

```sh
cd backend && .venv/bin/python -m pytest tests/
```

## notes

- db is a single file, `backend/foodify.db` — back it up by copying it
- `seed.py` is idempotent: run it any time to pick up missing macros or newly added TheMealDB meals
- schema carries `user_id` everywhere it matters, so multi-user later is additive
