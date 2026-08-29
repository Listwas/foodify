/**
 * The taste engine.
 *
 * Content-based recommender for one person. There is no second user to
 * collaborate with, so everything is learned from this user's own signals:
 * swipes, stated ingredient preferences, what got planned, what got cooked.
 *
 * The core idea is that ingredients carry the taste signal, but not equally.
 * `garlic` appears in over half the library and says nothing about anyone;
 * `harissa` appears once and says a lot. Inverse document frequency handles that
 * weighting automatically, so no hand-maintained stopword list is needed.
 */
import { daysBetween, iso, today as todayIso } from "../lib/dates"
import type { Feedback, Pref, PlanSlot } from "../store/types"

// how much each kind of evidence counts toward an ingredient's affinity
export const W_COOKED = 1.5      // they made it — the strongest positive we have
export const W_LIKE = 1.0        // right-swipe
export const W_PLANNED = 0.4     // chose it for a day, but may not have cooked it yet
export const W_DISLIKE = -1.0    // left-swipe
export const W_PREF_LIKE = 2.0   // said so explicitly on the profile
export const W_PREF_AVOID = -3.0 // explicit avoid outweighs a lot of implicit liking

// affinities are shrunk toward zero until evidence accumulates, so a single
// swipe can never make an ingredient dominate the ranking
export const SHRINK = 2.0

export const W_INGREDIENT = 1.0
export const W_PROTEIN = 0.35
export const W_TIME = 0.15
export const W_NOVELTY = 0.08

// the actual problem: "without repeating the same two or three chicken dishes".
// These two penalties are what solve it.
export const REPEAT_WINDOW_DAYS = 21
export const W_REPEAT = 1.2
export const FATIGUE_WINDOW_MEALS = 7
export const W_FATIGUE = 0.5

// tastes drift. A recipe passed three months ago quietly becomes eligible
// again, and old evidence counts for less than recent evidence, so the model
// follows the person rather than freezing them in place. Hiding is deliberate
// and is never undone automatically.
export const DISLIKE_RETURN_DAYS = 90
export const EVIDENCE_HALF_LIFE_DAYS = 180
export const MIN_RECENCY = 0.25

const PLAN_HISTORY_DAYS = 90

export interface EngineRecipe {
    id: number
    title: string
    protein_type: string | null
    prep_time_minutes: number | null
    ingredients: { name: string }[]
}

/** Everything the engine reads out of local state. */
export interface Signals {
    feedback: Record<number, Feedback>
    prefs: Pref[]
    plan: Record<string, PlanSlot>
    /** Overridable so tests aren't pinned to the wall clock. */
    today?: string
}

/** Weight multiplier for evidence, decaying with age (never below MIN_RECENCY). */
export function recency(when: string | null | undefined, now: string): number {
    if (!when) return 1.0
    const age = daysBetween(when, now)
    if (age <= 0) return 1.0
    return Math.max(MIN_RECENCY, Math.pow(0.5, age / EVIDENCE_HALF_LIFE_DAYS))
}

/** Fold trivial spelling variants together (chicken breasts -> chicken breast). */
export function normalize(name: string): string {
    const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ")
    return n.replace(/[^a-z0-9 &-]/g, "")
}

/** Map plural -> singular, but only when the singular really exists here. */
function singularize(names: Set<string>): Map<string, string> {
    const mapping = new Map<string, string>()
    for (const n of names) {
        if (n.endsWith("s") && names.has(n.slice(0, -1))) mapping.set(n, n.slice(0, -1))
    }
    return mapping
}

/** Precomputed corpus statistics: which ingredients are informative. */
export class Index {
    readonly n: number
    readonly df = new Map<string, number>()
    readonly idf = new Map<string, number>()

    readonly docs: Map<number, Set<string>>
    readonly recipes: Map<number, EngineRecipe>

    constructor(docs: Map<number, Set<string>>, recipes: Map<number, EngineRecipe>) {
        this.docs = docs
        this.recipes = recipes
        this.n = Math.max(docs.size, 1)
        for (const terms of docs.values()) {
            for (const t of terms) this.df.set(t, (this.df.get(t) ?? 0) + 1)
        }
        // rare ingredient -> high idf -> carries the signal
        for (const [t, c] of this.df) this.idf.set(t, Math.log(this.n / (1 + c)) + 1.0)
    }

    weight(term: string): number {
        return this.idf.get(term) ?? Math.log(this.n) + 1.0
    }

    /** Rare enough to be worth naming when explaining a recommendation. */
    isDistinctive(term: string): boolean {
        return (this.df.get(term) ?? 0) <= Math.max(2, this.n * 0.2)
    }

    terms(recipeId: number): Set<string> {
        return this.docs.get(recipeId) ?? EMPTY
    }
}

const EMPTY: Set<string> = new Set()

export function buildIndex(recipes: EngineRecipe[]): Index {
    const raw: [number, string][] = []
    for (const recipe of recipes) {
        for (const ing of recipe.ingredients) raw.push([recipe.id, normalize(ing.name)])
    }
    const fold = singularize(new Set(raw.map(([, name]) => name)))

    const grouped = new Map<number, Set<string>>()
    for (const [rid, name] of raw) {
        if (!name) continue
        let set = grouped.get(rid)
        if (!set) grouped.set(rid, (set = new Set()))
        set.add(fold.get(name) ?? name)
    }

    return new Index(
        new Map(recipes.map(r => [r.id, grouped.get(r.id) ?? new Set<string>()])),
        new Map(recipes.map(r => [r.id, r])),
    )
}

interface PlanRow {
    date: string
    recipeId: number
    status: string
}

/** Everything the engine has learned about this user. */
export class Taste {
    readonly today: string
    readonly feedback: Record<number, Feedback>
    readonly hidden = new Set<number>()
    readonly prefLike = new Set<string>()
    readonly prefAvoid = new Set<string>()
    readonly blocked = new Set<string>()
    readonly lastPlanned = new Map<number, string>()
    readonly completed = new Set<number>()
    readonly recentPlans: PlanRow[]

    affinity = new Map<string, number>()
    proteinAffinity = new Map<string, number>()
    evidence = new Map<string, number>()
    likedTime: number | null = null
    proteinShare = new Map<string, number>()
    fatigueConfidence = 0

    readonly index: Index

    constructor(index: Index, signals: Signals) {
        this.index = index
        this.today = signals.today ?? todayIso()
        this.feedback = signals.feedback

        for (const [id, f] of Object.entries(signals.feedback)) {
            if (f.verdict === "hidden") this.hidden.add(Number(id))
        }
        for (const p of signals.prefs) {
            const name = normalize(p.name)
            if (p.stance === "like") this.prefLike.add(name)
            else {
                this.prefAvoid.add(name)
                if (p.hardFilter) this.blocked.add(name)
            }
        }

        const cutoff = iso(new Date(Date.parse(`${this.today}T00:00:00Z`) - PLAN_HISTORY_DAYS * 86_400_000))
        const plans: PlanRow[] = Object.entries(signals.plan)
            .map(([key, slot]) => ({
                date: key.split("|")[0],
                recipeId: slot.recipeId,
                status: slot.status,
            }))
            .filter(p => p.date >= cutoff)
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

        for (const p of plans) {
            if (!this.lastPlanned.has(p.recipeId)) this.lastPlanned.set(p.recipeId, p.date)
            if (p.status === "completed") this.completed.add(p.recipeId)
        }
        this.recentPlans = plans.slice(0, FATIGUE_WINDOW_MEALS)

        this.buildAffinities()
    }

    private buildAffinities(): void {
        const pos = new Map<string, number>()
        const mass = new Map<string, number>()
        const ppos = new Map<string, number>()
        const pmass = new Map<string, number>()
        const likedTimes: number[] = []

        const bump = (m: Map<string, number>, k: string, v: number) =>
            m.set(k, (m.get(k) ?? 0) + v)

        const observe = (recipeId: number, w: number) => {
            for (const term of this.index.terms(recipeId)) {
                bump(pos, term, w)
                bump(mass, term, Math.abs(w))
            }
            const recipe = this.index.recipes.get(recipeId)
            if (recipe?.protein_type) {
                bump(ppos, recipe.protein_type, w)
                bump(pmass, recipe.protein_type, Math.abs(w))
            }
            if (w > 0 && recipe?.prep_time_minutes) likedTimes.push(recipe.prep_time_minutes)
        }

        for (const [id, f] of Object.entries(this.feedback)) {
            // a swipe from last year shouldn't outweigh one from last week
            const decay = recency(f.decidedAt, this.today)
            if (f.verdict === "like") observe(Number(id), W_LIKE * decay)
            else if (f.verdict === "dislike") observe(Number(id), W_DISLIKE * decay)
        }
        for (const [recipeId, when] of this.lastPlanned) {
            const base = this.completed.has(recipeId) ? W_COOKED : W_PLANNED
            observe(recipeId, base * recency(when, this.today))
        }

        // explicit profile preferences act directly on the ingredient
        for (const term of this.prefLike) {
            bump(pos, term, W_PREF_LIKE)
            bump(mass, term, Math.abs(W_PREF_LIKE))
        }
        for (const term of this.prefAvoid) {
            bump(pos, term, W_PREF_AVOID)
            bump(mass, term, Math.abs(W_PREF_AVOID))
        }

        for (const [t, m] of mass) this.affinity.set(t, (pos.get(t) ?? 0) / (m + SHRINK))
        for (const [p, m] of pmass) this.proteinAffinity.set(p, (ppos.get(p) ?? 0) / (m + SHRINK))
        this.evidence = mass
        this.likedTime = likedTimes.length
            ? likedTimes.reduce((a, b) => a + b, 0) / likedTimes.length
            : null

        const counts = new Map<string, number>()
        for (const p of this.recentPlans) {
            const r = this.index.recipes.get(p.recipeId)
            if (r?.protein_type) counts.set(r.protein_type, (counts.get(r.protein_type) ?? 0) + 1)
        }
        const total = [...counts.values()].reduce((a, b) => a + b, 0)
        if (total) for (const [p, c] of counts) this.proteinShare.set(p, c / total)
        // two meals is not enough to conclude they're sick of chicken, so the
        // fatigue penalty ramps up as the window fills
        this.fatigueConfidence = Math.min(1.0, total / FATIGUE_WINDOW_MEALS)
    }

    get hasSignal(): boolean {
        return (
            Object.keys(this.feedback).length > 0 ||
            this.prefLike.size > 0 ||
            this.prefAvoid.size > 0 ||
            this.lastPlanned.size > 0
        )
    }

    /** Hidden, or contains an ingredient flagged as never-show. */
    isBlocked(recipeId: number): boolean {
        if (this.hidden.has(recipeId)) return true
        for (const term of this.index.terms(recipeId)) {
            if (this.blocked.has(term)) return true
        }
        return false
    }

    /** How much evidence we have about this recipe's ingredients, 0..1. */
    coverage(recipeId: number): number {
        const terms = this.index.terms(recipeId)
        if (!terms.size) return 0
        let known = 0
        for (const t of terms) if ((this.evidence.get(t) ?? 0) > 0) known += 1
        return known / terms.size
    }

    /** Score a recipe and explain why. */
    score(recipeId: number): { score: number; reasons: string[] } {
        const recipe = this.index.recipes.get(recipeId)
        if (!recipe) return { score: 0, reasons: [] }
        const terms = this.index.terms(recipeId)
        const reasons: string[] = []

        // idf-weighted mean affinity, length-normalized so a 20-ingredient
        // recipe doesn't outrank a 6-ingredient one just by being longer
        const contributions: { value: number; term: string }[] = []
        let totalW = 0
        let acc = 0
        for (const t of terms) {
            const w = this.index.weight(t)
            const a = this.affinity.get(t) ?? 0
            acc += a * w
            totalW += w
            // "you like water" is true of everyone and explains nothing, so
            // pantry staples score normally but never get named as the reason
            if (a && this.index.isDistinctive(t)) contributions.push({ value: a * w, term: t })
        }
        const sIng = totalW ? acc / totalW : 0

        const sPro = this.proteinAffinity.get(recipe.protein_type ?? "") ?? 0

        let sTime = 0
        if (this.likedTime && recipe.prep_time_minutes) {
            const off = Math.abs(recipe.prep_time_minutes - this.likedTime)
            sTime = Math.max(-0.5, 1.0 - off / 45.0)
        }

        const novelty = W_NOVELTY * (1.0 - this.coverage(recipeId))

        let score = W_INGREDIENT * sIng + W_PROTEIN * sPro + W_TIME * sTime + novelty

        // don't suggest what they just ate — or what's already on the calendar
        const last = this.lastPlanned.get(recipeId)
        if (last) {
            const days = daysBetween(last, this.today)
            if (days < 0) {
                score -= W_REPEAT
                reasons.push("already planned")
            } else if (days <= REPEAT_WINDOW_DAYS) {
                score -= W_REPEAT * (1 - days / REPEAT_WINDOW_DAYS)
                reasons.push(`planned ${days === 0 ? "today" : `${days}d ago`}`)
            }
        }

        const share = this.proteinShare.get(recipe.protein_type ?? "") ?? 0
        if (share >= 0.5) {
            score -= W_FATIGUE * (share - 0.5) * 2 * this.fatigueConfidence
        } else if (recipe.protein_type && this.proteinShare.size && share === 0) {
            let hot = ""
            let hotShare = -Infinity
            for (const [p, v] of this.proteinShare) {
                if (v > hotShare) { hot = p; hotShare = v }
            }
            if (hotShare >= 0.5) reasons.push(`a break from ${hot}`)
        }

        // descending by contribution, ties broken by term descending — matches
        // how the reference implementation sorted (value, term) tuples
        contributions.sort((a, b) =>
            b.value - a.value || (a.term < b.term ? 1 : a.term > b.term ? -1 : 0)
        )
        const liked = contributions.slice(0, 2).filter(c => c.value > 0).map(c => c.term)
        if (liked.length) {
            reasons.unshift("you like " + liked.join(" + "))
        } else if (!reasons.length && this.coverage(recipeId) < 0.34) {
            reasons.push("something new for you")
        }

        return { score, reasons: reasons.slice(0, 2) }
    }
}

/** What the engine has learned, for the profile page. */
export function tasteSummary(index: Index, signals: Signals) {
    const taste = new Taste(index, signals)

    const ranked = [...taste.affinity]
        .filter(([, a]) => Math.abs(a) > 0.01)
        .map(([t, a]) => ({ key: a * index.weight(t), name: t, affinity: a }))
        .sort((x, y) =>
            y.key - x.key || (x.name < y.name ? 1 : x.name > y.name ? -1 : 0)
        )

    const verdicts: Record<string, number> = {}
    for (const f of Object.values(taste.feedback)) {
        verdicts[f.verdict] = (verdicts[f.verdict] ?? 0) + 1
    }

    const round = (v: number, places: number) => {
        const f = 10 ** places
        return Math.round(v * f) / f
    }

    return {
        likes: ranked.slice(0, 8)
            .filter(r => r.affinity > 0)
            .map(r => ({ name: r.name, affinity: round(r.affinity, 3) })),
        dislikes: ranked.slice(-8)
            .filter(r => r.affinity < 0)
            .map(r => ({ name: r.name, affinity: round(r.affinity, 3) })),
        counts: {
            liked: verdicts.like ?? 0,
            passed: verdicts.dislike ?? 0,
            hidden: verdicts.hidden ?? 0,
            planned: taste.lastPlanned.size,
            cooked: taste.completed.size,
        },
        protein_share: Object.fromEntries(
            [...taste.proteinShare].map(([k, v]) => [k, round(v, 2)])
        ),
        has_signal: taste.hasSignal,
    }
}
