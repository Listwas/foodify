# foodify

meal planning for one household. weekly dinner calendar, quick "surprise me" swaps, a 511-recipe library seeded from [TheMealDB](https://www.themealdb.com) with AI-estimated macros, tinder-style recipe discovery that learns what you like, and a per-meal grocery checklist.

built to answer "what's for dinner" without cooking the same three chicken dishes forever.

**it is a static site.** no server, no database, no account. the recipe library is a file, the taste engine runs in your browser, and your plan lives in that browser's storage. it installs to a phone home screen and works offline.

## what it does

- **plan**: an agenda of the week — each day a row with its photo, macros, a cooked tick and the rest of the actions one tap away — or a month calendar for the wider view
- **discover**: swipe through recipes. Every swipe trains a taste model that reorders suggestions everywhere else. Undo puts back the exact card you just swiped
- **swipe history**: everything you've ever swiped, with the date and your verdict, all changeable. Nothing is a one-way door — recipes you passed on quietly return to the deck after a few months
- **suggest/swap**: ranked by what it's learned about you, filtered by protein or max cooking time, with liked recipes offered first
- **generate something new**: describe protein/time/mood and the AI proposes a recipe (needs a key, see below)
- **recipe library**: 511 recipes across ten dinner categories, filterable by protein, nutrition (under 500 kcal, 35g+ protein, low carb, low sugar) and status (liked, AI-made, custom, hidden). *Plan this* puts any recipe straight onto a day. Hide anything you never want to see, with 5 seconds to undo
- **photos**: generated recipes borrow an openly-licensed photo of a similar dish — clearly badged as stock, credited, and rerollable. You can upload your own photo for any recipe, seeded ones included
- **taste profile**: tell it ingredients you like or avoid, and see what it has worked out on its own
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

The engine lives in [`frontend/src/engine`](frontend/src/engine). It was originally
Python on the server; the port is pinned to that implementation's output by
[`parity.test.ts`](frontend/src/engine/parity.test.ts), which checks all 497 rankable
recipes score identically.

## run it

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173
```

```sh
npm run build      # static site in frontend/dist
npm test           # taste-engine tests
```

## deploy it

Cloudflare Pages, free tier. Two routes.

**From the command line** — one command, and it reports exactly what went wrong
if anything does. Log in once (opens a browser), then deploy:

```sh
cd frontend
npx wrangler login
npm run deploy
```

This uploads `frontend/dist` *and* `functions/`, so recipe generation works too.
Re-run `npm run deploy` to publish an update.

**Or connect the git repo**, which rebuilds on every push:

| setting | value |
|---|---|
| build command | `cd frontend && npm install && npm run build` |
| build output directory | `frontend/dist` |
| root directory | *(repo root)* |

That's the whole deployment. `frontend/public/_redirects` keeps deep links working,
and the service worker precaches the app and the recipe library so it runs offline.

### AI recipe generation (optional, free)

Everything works without this — only the *Generate* button needs it, and it says so
plainly when the key is absent.

A key can't ship inside a public web app, so generation goes through one Cloudflare
Pages Function ([`functions/api/generate.ts`](functions/api/generate.ts)). Grab a free
key at [aistudio.google.com](https://aistudio.google.com) (no card needed) and:

```sh
npx wrangler pages secret put GEMINI_API_KEY
```

Note the URL is public: anyone who finds it could spend the free daily allowance
(~20 requests). At that size it's a nuisance rather than a risk.

## your data

Your plan, swipes and preferences live in your browser's IndexedDB and are never
uploaded. Two consequences worth knowing:

- **there is no sync.** Each browser and each device is its own copy.
- **moving devices, or keeping a backup, is a file.** *Taste → Your data → Export*
  writes a JSON file; *Import* loads it back.

Coming from the old server version? [`tools/migrate_state.py`](tools/migrate_state.py)
turns a `foodify.db` into that same backup file:

```sh
python tools/migrate_state.py path/to/foodify.db
```

## maintaining the recipe library

The library is [`frontend/public/recipes.json`](frontend/public/recipes.json), 511
recipes at ~244 KB over the wire. It only changes when you decide it should:

```sh
python -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/seed.py                  # pull new TheMealDB meals + estimate macros
.venv/bin/python tools/seed.py --skip-nutrition # just the meals
```

`seed.py` is re-runnable: existing meals are skipped and only recipes without an
estimate get one, so it doubles as the macro backfill. Macro estimation needs the
Gemini key in `tools/.env`; the free tier has a daily cap, and the script picks up
where it left off if it runs out. Commit `recipes.json` afterwards to ship the change.
