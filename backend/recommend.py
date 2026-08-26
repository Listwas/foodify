"""The taste engine.

Content-based recommender for a single household. There is no second user to
collaborate with, so everything is learned from this user's own signals:
swipes, stated ingredient preferences, what actually got planned, and what
actually got cooked.

The core idea is that ingredients carry the taste signal, but not equally.
`garlic` appears in over half the library and says nothing about anyone;
`harissa` appears once and says a lot. Inverse document frequency handles that
weighting automatically, so no hand-maintained stopword list is needed.
"""
import math
import random
import re
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from database import (
    Recipe, Ingredient, MealPlan, RecipeFeedback, IngredientPref, DEFAULT_USER_ID,
)

# how much each kind of evidence counts toward an ingredient's affinity
W_COOKED = 1.5      # they made it — the strongest positive we have
W_LIKE = 1.0        # right-swipe
W_PLANNED = 0.4     # chose it for a day, but may not have cooked it yet
W_DISLIKE = -1.0    # left-swipe
W_PREF_LIKE = 2.0   # said so explicitly on the profile
W_PREF_AVOID = -3.0 # explicit avoid outweighs a lot of implicit liking

# affinities are shrunk toward zero until evidence accumulates, so a single
# swipe can never make an ingredient dominate the ranking
SHRINK = 2.0

W_INGREDIENT = 1.0
W_PROTEIN = 0.35
W_TIME = 0.15
W_NOVELTY = 0.08

# the spec's actual problem: "without repeating the same two or three chicken
# dishes". These two penalties are what solve it.
REPEAT_WINDOW_DAYS = 21
W_REPEAT = 1.2
FATIGUE_WINDOW_MEALS = 7
W_FATIGUE = 0.5

# tastes drift. A recipe passed three months ago quietly becomes eligible
# again, and old evidence counts for less than recent evidence, so the model
# follows the person rather than freezing them in place. Hiding is deliberate
# and is never undone automatically.
DISLIKE_RETURN_DAYS = 90
EVIDENCE_HALF_LIFE_DAYS = 180
MIN_RECENCY = 0.25

_index_cache: tuple[tuple, "Index"] | None = None


def _recency(when, now: date | None = None) -> float:
    """Weight multiplier for evidence, decaying with age (never below MIN_RECENCY)."""
    if when is None:
        return 1.0
    day = when.date() if hasattr(when, "date") else when
    age = ((now or date.today()) - day).days
    if age <= 0:
        return 1.0
    return max(MIN_RECENCY, 0.5 ** (age / EVIDENCE_HALF_LIFE_DAYS))


def normalize(name: str) -> str:
    """Fold trivial spelling variants together (chicken breasts -> chicken breast)."""
    n = re.sub(r"\s+", " ", (name or "").strip().lower())
    return re.sub(r"[^a-z0-9 &-]", "", n)


class Index:
    """Precomputed corpus statistics: which ingredients are informative."""

    def __init__(self, docs: dict[int, frozenset[str]], recipes: dict[int, Recipe]):
        self.docs = docs
        self.recipes = recipes
        self.n = max(len(docs), 1)

        df: dict[str, int] = defaultdict(int)
        for terms in docs.values():
            for t in terms:
                df[t] += 1
        self.df = df
        # rare ingredient -> high idf -> carries the signal
        self.idf = {t: math.log(self.n / (1 + c)) + 1.0 for t, c in df.items()}

    def weight(self, term: str) -> float:
        return self.idf.get(term, math.log(self.n) + 1.0)

    def is_distinctive(self, term: str) -> bool:
        """Rare enough to be worth naming when explaining a recommendation."""
        return self.df.get(term, 0) <= max(2, self.n * 0.2)


def _singularize(names: set[str]) -> dict[str, str]:
    """Map plural -> singular, but only when the singular really exists here."""
    mapping = {}
    for n in names:
        if n.endswith("s") and n[:-1] in names:
            mapping[n] = n[:-1]
    return mapping


def build_index(db: Session) -> Index:
    """Cached; rebuilt whenever the recipe/ingredient corpus changes."""
    global _index_cache

    stamp = (
        db.query(Recipe).count(),
        db.query(Ingredient).count(),
        db.query(Recipe.id).order_by(Recipe.id.desc()).limit(1).scalar() or 0,
    )
    if _index_cache and _index_cache[0] == stamp:
        index = _index_cache[1]
        # The ingredient scan is what's expensive and it only changes when rows
        # are added — but recipe *columns* change without moving the stamp (the
        # nutrition backfill fills macros and prep times in place). Re-read the
        # rows every call so scoring and cards never serve stale values.
        index.recipes = {r.id: r for r in db.query(Recipe).all()}
        return index

    rows = db.query(Ingredient.recipe_id, Ingredient.name).all()
    raw = [(rid, normalize(name)) for rid, name in rows]
    fold = _singularize({n for _, n in raw})

    grouped: dict[int, set[str]] = defaultdict(set)
    for rid, n in raw:
        if n:
            grouped[rid].add(fold.get(n, n))

    recipes = {r.id: r for r in db.query(Recipe).all()}
    docs = {rid: frozenset(grouped.get(rid, ())) for rid in recipes}

    index = Index(docs, recipes)
    _index_cache = (stamp, index)
    return index


def invalidate_cache() -> None:
    global _index_cache
    _index_cache = None


class Taste:
    """Everything the engine has learned about this user."""

    def __init__(self, db: Session, index: Index, user_id: int = DEFAULT_USER_ID):
        self.index = index
        self.user_id = user_id

        self.feedback = {
            f.recipe_id: f
            for f in db.query(RecipeFeedback).filter(RecipeFeedback.user_id == user_id)
        }
        self.hidden = {rid for rid, f in self.feedback.items() if f.verdict == "hidden"}

        prefs = db.query(IngredientPref).filter(IngredientPref.user_id == user_id).all()
        self.pref_like = {normalize(p.name) for p in prefs if p.stance == "like"}
        self.pref_avoid = {normalize(p.name) for p in prefs if p.stance == "avoid"}
        self.blocked = {normalize(p.name) for p in prefs if p.stance == "avoid" and p.hard_filter}

        today = date.today()
        plans = (
            db.query(MealPlan)
            .filter(MealPlan.user_id == user_id, MealPlan.date >= today - timedelta(days=90))
            .order_by(MealPlan.date.desc())
            .all()
        )
        self.last_planned: dict[int, date] = {}
        for p in plans:
            self.last_planned.setdefault(p.recipe_id, p.date)
        self.completed = {p.recipe_id for p in plans if p.status == "completed"}
        self.recent_plans = plans[:FATIGUE_WINDOW_MEALS]

        self._build_affinities()

    def _build_affinities(self) -> None:
        pos: dict[str, float] = defaultdict(float)
        mass: dict[str, float] = defaultdict(float)
        ppos: dict[str, float] = defaultdict(float)
        pmass: dict[str, float] = defaultdict(float)
        liked_times: list[int] = []

        def observe(recipe_id: int, w: float) -> None:
            for term in self.index.docs.get(recipe_id, ()):  # noqa: B020
                pos[term] += w
                mass[term] += abs(w)
            recipe = self.index.recipes.get(recipe_id)
            if recipe and recipe.protein_type:
                ppos[recipe.protein_type] += w
                pmass[recipe.protein_type] += abs(w)
            if w > 0 and recipe and recipe.prep_time_minutes:
                liked_times.append(recipe.prep_time_minutes)

        for recipe_id, f in self.feedback.items():
            # a swipe from last year shouldn't outweigh one from last week
            decay = _recency(f.updated_at or f.created_at)
            if f.verdict == "like":
                observe(recipe_id, W_LIKE * decay)
            elif f.verdict == "dislike":
                observe(recipe_id, W_DISLIKE * decay)
        for recipe_id, when in self.last_planned.items():
            base = W_COOKED if recipe_id in self.completed else W_PLANNED
            observe(recipe_id, base * _recency(when))

        # explicit profile preferences act directly on the ingredient
        for term in self.pref_like:
            pos[term] += W_PREF_LIKE
            mass[term] += abs(W_PREF_LIKE)
        for term in self.pref_avoid:
            pos[term] += W_PREF_AVOID
            mass[term] += abs(W_PREF_AVOID)

        self.affinity = {t: pos[t] / (mass[t] + SHRINK) for t in mass}
        self.protein_affinity = {p: ppos[p] / (pmass[p] + SHRINK) for p in pmass}
        self.evidence = mass
        self.liked_time = (sum(liked_times) / len(liked_times)) if liked_times else None

        counts: dict[str, int] = defaultdict(int)
        for p in self.recent_plans:
            r = self.index.recipes.get(p.recipe_id)
            if r and r.protein_type:
                counts[r.protein_type] += 1
        total = sum(counts.values())
        self.protein_share = {p: c / total for p, c in counts.items()} if total else {}
        # two meals is not enough to conclude they're sick of chicken, so the
        # fatigue penalty ramps up as the window fills
        self.fatigue_confidence = min(1.0, total / FATIGUE_WINDOW_MEALS)

    @property
    def has_signal(self) -> bool:
        return bool(self.feedback or self.pref_like or self.pref_avoid or self.last_planned)

    def is_blocked(self, recipe_id: int) -> bool:
        """Hidden, or contains an ingredient flagged as never-show."""
        if recipe_id in self.hidden:
            return True
        return bool(self.blocked & self.index.docs.get(recipe_id, frozenset()))

    def coverage(self, recipe_id: int) -> float:
        """How much evidence we have about this recipe's ingredients, 0..1."""
        terms = self.index.docs.get(recipe_id, frozenset())
        if not terms:
            return 0.0
        known = sum(1 for t in terms if self.evidence.get(t, 0) > 0)
        return known / len(terms)

    def score(self, recipe_id: int) -> tuple[float, list[str]]:
        """Score a recipe and explain why."""
        recipe = self.index.recipes.get(recipe_id)
        if recipe is None:
            return 0.0, []
        terms = self.index.docs.get(recipe_id, frozenset())
        reasons: list[str] = []

        # idf-weighted mean affinity, length-normalized so a 20-ingredient
        # recipe doesn't outrank a 6-ingredient one just by being longer
        contributions = []
        total_w = 0.0
        acc = 0.0
        for t in terms:
            w = self.index.weight(t)
            a = self.affinity.get(t, 0.0)
            acc += a * w
            total_w += w
            # "you like water" is true of everyone and explains nothing, so
            # pantry staples score normally but never get named as the reason
            if a and self.index.is_distinctive(t):
                contributions.append((a * w, t))
        s_ing = acc / total_w if total_w else 0.0

        s_pro = self.protein_affinity.get(recipe.protein_type or "", 0.0)

        s_time = 0.0
        if self.liked_time and recipe.prep_time_minutes:
            off = abs(recipe.prep_time_minutes - self.liked_time)
            s_time = max(-0.5, 1.0 - off / 45.0)

        novelty = W_NOVELTY * (1.0 - self.coverage(recipe_id))

        score = W_INGREDIENT * s_ing + W_PROTEIN * s_pro + W_TIME * s_time + novelty

        # don't suggest what they just ate — or what's already on the calendar
        last = self.last_planned.get(recipe_id)
        if last:
            days = (date.today() - last).days
            if days < 0:
                score -= W_REPEAT
                reasons.append("already planned")
            elif days <= REPEAT_WINDOW_DAYS:
                score -= W_REPEAT * (1 - days / REPEAT_WINDOW_DAYS)
                reasons.append(f"planned {'today' if days == 0 else f'{days}d ago'}")

        share = self.protein_share.get(recipe.protein_type or "", 0.0)
        if share >= 0.5:
            score -= W_FATIGUE * (share - 0.5) * 2 * self.fatigue_confidence
        elif recipe.protein_type and self.protein_share and share == 0:
            hot = max(self.protein_share, key=self.protein_share.get)
            if self.protein_share[hot] >= 0.5:
                reasons.append(f"a break from {hot}")

        contributions.sort(reverse=True)
        liked = [t for c, t in contributions[:2] if c > 0]
        if liked:
            reasons.insert(0, "you like " + " + ".join(liked))
        elif not reasons and self.coverage(recipe_id) < 0.34:
            reasons.append("something new for you")

        return score, reasons[:2]


def _weighted_sample(items: list, weights: list[float], k: int, rng: random.Random,
                     cap: dict | None = None, key=None) -> list:
    """Sample without replacement, favouring higher weights.

    `cap` optionally limits how many picks may share a key (used to stop one
    protein from taking over the deck even when it scores highest).
    """
    pool = list(zip(items, weights))
    picked: list = []
    used: dict = defaultdict(int)
    while pool and len(picked) < k:
        if cap and key:
            allowed = [(i, w) for i, w in pool if used[key(i)] < cap.get(key(i), k)]
            if not allowed:
                allowed = pool  # cap unsatisfiable — take what's left
        else:
            allowed = pool
        total = sum(w for _, w in allowed)
        if total <= 0:
            chosen = allowed[0][0]
        else:
            r = rng.uniform(0, total)
            upto = 0.0
            chosen = allowed[-1][0]
            for item, w in allowed:
                upto += w
                if upto >= r:
                    chosen = item
                    break
        picked.append(chosen)
        if key:
            used[key(chosen)] += 1
        pool = [(i, w) for i, w in pool if i != chosen]
    return picked


def _protein(index: Index, recipe_id: int) -> str:
    r = index.recipes.get(recipe_id)
    return (r.protein_type or "") if r else ""


def _distance(index: Index, a: int, b: int) -> float:
    """How unlike two recipes are, by ingredients and protein."""
    ta, tb = index.docs.get(a, frozenset()), index.docs.get(b, frozenset())
    union = len(ta | tb) or 1
    dist = 1.0 - len(ta & tb) / union
    pa, pb = _protein(index, a), _protein(index, b)
    if pa and pa == pb:
        # same protein counts as closer, so a seed deck alternates proteins
        # instead of serving eight beef dishes that happen to differ
        dist *= 0.6
    return dist


def _diverse_seed(index: Index, candidates: list[int], k: int, rng: random.Random) -> list[int]:
    """Cold start: with nothing learned yet, show cards that are as unlike each
    other as possible so the first few swipes teach us the most.

    Rotating through proteins guarantees the spread — picking purely on
    ingredient distance can hand back eight beef dishes that merely differ
    from one another, which tells us nothing about what they want to eat.
    """
    if not candidates:
        return []

    by_protein: dict[str, list[int]] = defaultdict(list)
    for cid in candidates:
        by_protein[_protein(index, cid)].append(cid)
    order = sorted(by_protein, key=lambda p: -len(by_protein[p]))

    chosen: list[int] = []
    while len(chosen) < k and any(by_protein.values()):
        for protein in order:
            pool = by_protein[protein]
            if not pool or len(chosen) >= k:
                continue
            if not chosen:
                pick = rng.choice(pool)
            else:
                pick = max(pool, key=lambda cid: min(_distance(index, cid, c) for c in chosen))
            chosen.append(pick)
            pool.remove(pick)
    return chosen


def _spread_proteins(index: Index, ordered: list[int]) -> list[int]:
    """Avoid three cards of the same protein in a row."""
    out: list[int] = []
    pending = list(ordered)
    while pending:
        pick = 0  # fall back to the next card if nothing else fits
        for i, rid in enumerate(pending):
            tail = [_protein(index, o) for o in out[-2:]]
            if not (len(tail) == 2 and tail[0] == tail[1] == _protein(index, rid)):
                pick = i
                break
        out.append(pending.pop(pick))
    return out


def rank(db: Session, limit: int | None = None, exclude: set[int] | None = None,
         user_id: int = DEFAULT_USER_ID) -> list[dict]:
    """Every eligible recipe, best first."""
    index = build_index(db)
    taste = Taste(db, index, user_id)
    exclude = exclude or set()

    scored = []
    for rid in index.recipes:
        if rid in exclude or taste.is_blocked(rid):
            continue
        score, reasons = taste.score(rid)
        scored.append({"recipe": index.recipes[rid], "score": score, "reasons": reasons})
    scored.sort(key=lambda x: (-x["score"], x["recipe"].title))
    return scored[:limit] if limit else scored


def deck(db: Session, limit: int = 20, user_id: int = DEFAULT_USER_ID,
         rng: random.Random | None = None) -> list[dict]:
    """The swipe deck: mostly what we think they'll like, plus enough
    exploration that the model keeps learning instead of narrowing."""
    rng = rng or random.Random()
    index = build_index(db)
    taste = Taste(db, index, user_id)

    # already judged — don't ask again, except that an old pass expires so the
    # dish gets another chance once tastes have had time to move
    cutoff = date.today() - timedelta(days=DISLIKE_RETURN_DAYS)
    judged = set()
    for rid, f in taste.feedback.items():
        decided = f.updated_at or f.created_at
        decided_day = decided.date() if hasattr(decided, "date") else decided
        if f.verdict == "dislike" and decided_day and decided_day <= cutoff:
            continue  # eligible again
        judged.add(rid)

    candidates = [rid for rid in index.recipes if rid not in judged and not taste.is_blocked(rid)]
    if not candidates:
        return []

    if not taste.has_signal:
        chosen = _diverse_seed(index, candidates, limit, rng)
    else:
        scored = sorted(
            ((taste.score(rid)[0], rid) for rid in candidates), key=lambda x: -x[0]
        )
        n_exploit = max(1, round(limit * 0.7))
        n_explore = max(0, limit - n_exploit)

        # One protein can score higher across the board (right after a
        # chicken-heavy week, or simply because the library holds more of it),
        # so cap how much of the deck any single one may take. The cap covers
        # *both* bands — capping only the exploit half still let a big category
        # flood the deck through exploration.
        available = {_protein(index, rid) for _, rid in scored}
        cap = max(2, math.ceil(limit / min(max(len(available), 1), 4)))
        used: dict[str, int] = defaultdict(int)

        # exploit: sample from the top band so it isn't identical every visit.
        # The band is built per protein rather than as a flat top-N — a flat
        # window can be monolithic (the real library's top 32 was 31 pork), and
        # then the cap has nothing else to fall back on and gets abandoned.
        per_protein: dict[str, list] = defaultdict(list)
        for pair in scored:
            bucket = per_protein[_protein(index, pair[1])]
            if len(bucket) < cap * 2:  # headroom so the sampler still has choices
                bucket.append(pair)
        band = sorted(
            (pair for bucket in per_protein.values() for pair in bucket),
            key=lambda x: -x[0],
        )
        lo = min(s for s, _ in band) if band else 0.0
        weights = [(s - lo) + 0.05 for s, _ in band]
        exploit = _weighted_sample(
            [r for _, r in band], weights, n_exploit, rng,
            cap={p: cap for p in available}, key=lambda rid: _protein(index, rid),
        )
        for rid in exploit:
            used[_protein(index, rid)] += 1

        # explore: whatever we know least about, within whatever cap is left
        rest = [rid for _, rid in scored if rid not in exploit]
        rest.sort(key=lambda rid: taste.coverage(rid))
        explore = []
        for rid in rest:
            if len(explore) >= n_explore:
                break
            protein = _protein(index, rid)
            if used[protein] >= cap:
                continue
            explore.append(rid)
            used[protein] += 1

        chosen = []
        for i in range(max(len(exploit), len(explore))):
            if i < len(exploit):
                chosen.append(exploit[i])
            if i < len(explore):
                chosen.append(explore[i])

    chosen = _spread_proteins(index, chosen)[:limit]
    out = []
    for rid in chosen:
        score, reasons = taste.score(rid)
        out.append({"recipe": index.recipes[rid], "score": score, "reasons": reasons})
    return out


def taste_summary(db: Session, user_id: int = DEFAULT_USER_ID) -> dict:
    """What the engine has learned, for the profile page."""
    index = build_index(db)
    taste = Taste(db, index, user_id)

    ranked = sorted(
        ((a * index.weight(t), t, a) for t, a in taste.affinity.items() if abs(a) > 0.01),
        reverse=True,
    )
    verdicts: dict[str, int] = defaultdict(int)
    for f in taste.feedback.values():
        verdicts[f.verdict] += 1

    return {
        "likes": [{"name": t, "affinity": round(a, 3)} for _, t, a in ranked[:8] if a > 0],
        "dislikes": [{"name": t, "affinity": round(a, 3)} for _, t, a in ranked[-8:] if a < 0],
        "counts": {
            "liked": verdicts.get("like", 0),
            "passed": verdicts.get("dislike", 0),
            "hidden": verdicts.get("hidden", 0),
            "planned": len(taste.last_planned),
            "cooked": len(taste.completed),
        },
        "protein_share": {k: round(v, 2) for k, v in taste.protein_share.items()},
        "has_signal": taste.has_signal,
    }
