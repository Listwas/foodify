/**
 * Properties the recommender is supposed to have.
 *
 * These assert behaviour, not exact scores — the weights are tunable and
 * shouldn't break the suite when adjusted. Exact numbers are covered separately
 * by parity.test.ts, which pins the port to the original Python output.
 *
 * Ported from the server implementation's test_recommend.py (see git history).
 */
import { beforeEach, describe, expect, it } from "vitest"
import { buildIndex, type EngineRecipe, type Signals } from "./taste"
import { deck, rank } from "./deck"
import { seeded } from "./rng"
import type { Feedback, PlanSlot } from "../store/types"

const PANTRY = ["garlic", "salt", "onion", "olive oil"]
const TODAY = "2026-08-29"

let nextId = 1
beforeEach(() => { nextId = 1 })

function make(
    title: string, ingredients: string[], protein: string | null = "chicken", prep = 30
): EngineRecipe {
    return {
        id: nextId++,
        title,
        protein_type: protein,
        prep_time_minutes: prep,
        ingredients: ingredients.map(name => ({ name })),
    }
}

/** Pantry staples everywhere, two "signature" dishes sharing a rare
 *  ingredient — the situation the real corpus is in. */
function corpus() {
    const recipes: EngineRecipe[] = []
    for (let i = 0; i < 8; i++) recipes.push(make(`Common Chicken ${i}`, [...PANTRY, `filler ${i}`], "chicken"))
    for (let i = 0; i < 8; i++) recipes.push(make(`Common Beef ${i}`, [...PANTRY, `stuffing ${i}`], "beef"))
    const a = make("Harissa Chicken", [...PANTRY, "harissa"], "chicken")
    const b = make("Harissa Traybake", [...PANTRY, "harissa"], "chicken")
    recipes.push(a, b)
    return { recipes, a, b }
}

const signals = (partial: Partial<Signals> = {}): Signals =>
    ({ feedback: {}, prefs: [], plan: {}, today: TODAY, ...partial })

const shift = (days: number) => {
    const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000)
    return d.toISOString().slice(0, 10)
}

const swipe = (verdict: Feedback["verdict"], decidedAt = TODAY): Feedback =>
    ({ verdict, shortlisted: verdict === "like", decidedAt })

const meal = (recipeId: number, status: PlanSlot["status"] = "planned"): PlanSlot =>
    ({ recipeId, status })

const order = (recipes: EngineRecipe[], s: Signals) =>
    rank(buildIndex(recipes), s).map(e => e.recipe.id)

describe("the index", () => {
    it("weights rare ingredients above pantry staples", () => {
        const index = buildIndex(corpus().recipes)
        // garlic is in every recipe; harissa is in two
        expect(index.df.get("garlic")!).toBeGreaterThan(index.df.get("harissa")!)
        expect(index.weight("harissa")).toBeGreaterThan(index.weight("garlic"))
    })

    it("merges plural variants into one term", () => {
        const index = buildIndex([
            make("A", ["chicken breast", "carrot"]),
            make("B", ["chicken breasts", "carrots"]),
        ])
        expect(index.df.get("chicken breast")).toBe(2)
        expect(index.df.has("chicken breasts")).toBe(false)
    })
})

describe("learning from swipes", () => {
    it("promotes another recipe sharing a rare ingredient with a liked one", () => {
        const { recipes, a, b } = corpus()
        const before = order(recipes, signals()).indexOf(b.id)

        const after = order(recipes, signals({ feedback: { [a.id]: swipe("like") } }))

        // the untouched harissa dish climbs to sit alongside the one they liked
        expect(after.indexOf(b.id)).toBeLessThan(before)
        expect(new Set(after.slice(0, 2))).toEqual(new Set([a.id, b.id]))
    })

    it("pushes similar recipes down after a dislike", () => {
        const { recipes, a, b } = corpus()
        const ranked = order(recipes, signals({ feedback: { [a.id]: swipe("dislike") } }))
        expect(ranked[ranked.length - 1]).toBe(b.id)
    })

    it("explains the pick", () => {
        const { recipes, a, b } = corpus()
        const ranked = rank(buildIndex(recipes), signals({ feedback: { [a.id]: swipe("like") } }))
        const entry = ranked.find(e => e.recipe.id === b.id)!
        expect(entry.reasons.some(r => r.includes("harissa"))).toBe(true)
    })

    it("removes hidden recipes from ranking and deck alike", () => {
        const { recipes, a } = corpus()
        const s = signals({ feedback: { [a.id]: swipe("hidden") } })
        const index = buildIndex(recipes)

        expect(order(recipes, s)).not.toContain(a.id)
        expect(deck(index, s, 50, seeded(0)).map(c => c.recipe.id)).not.toContain(a.id)
    })

    it("counts a recent swipe for more than an old one", () => {
        const { recipes, a, b } = corpus()
        const index = buildIndex(recipes)
        const scoreOf = (decidedAt: string) =>
            rank(index, signals({ feedback: { [a.id]: swipe("like", decidedAt) } }))
                .find(e => e.recipe.id === b.id)!.score

        expect(scoreOf(TODAY)).toBeGreaterThan(scoreOf(shift(-400)))
    })
})

describe("variety", () => {
    it("demotes a meal eaten yesterday to the bottom", () => {
        const { recipes } = corpus()
        // named to sort first, so the drop is visible rather than hidden by the
        // alphabetical tiebreak that applies when nothing is learned yet
        const target = make("AAA Yesterday's Dinner", [...PANTRY, "harissa"], "chicken")
        recipes.push(target)

        expect(order(recipes, signals()).indexOf(target.id)).toBe(0)

        const ranked = order(recipes, signals({
            plan: { [`${shift(-1)}|dinner`]: meal(target.id) },
        }))
        expect(ranked[ranked.length - 1]).toBe(target.id)
    })

    it("demotes a meal already on the calendar", () => {
        const { recipes } = corpus()
        const target = make("Tomorrow's Dinner", [...PANTRY, "harissa"], "chicken")
        recipes.push(target)

        const s = signals({ plan: { [`${shift(1)}|dinner`]: meal(target.id) } })
        const ranked = rank(buildIndex(recipes), s)
        const entry = ranked.find(e => e.recipe.id === target.id)!

        expect(entry.reasons).toContain("already planned")
        expect(ranked.findIndex(e => e.recipe.id === target.id))
            .toBeGreaterThan(ranked.length / 2)
    })

    it("counts cooking a meal for more than merely planning it", () => {
        const { recipes } = corpus()
        const planned = make("Planned Only", [...PANTRY, "tamarind"], "chicken")
        const cooked = make("Actually Cooked", [...PANTRY, "gochujang"], "chicken")
        const twinPlanned = make("Tamarind Twin", [...PANTRY, "tamarind"], "beef")
        const twinCooked = make("Gochujang Twin", [...PANTRY, "gochujang"], "beef")
        recipes.push(planned, cooked, twinPlanned, twinCooked)

        const old = shift(-40) // outside the repeat window
        const ranked = rank(buildIndex(recipes), signals({
            plan: {
                [`${old}|dinner`]: meal(planned.id),
                [`${shift(-41)}|dinner`]: meal(cooked.id, "completed"),
            },
        }))
        const score = (id: number) => ranked.find(e => e.recipe.id === id)!.score

        expect(score(twinCooked.id)).toBeGreaterThan(score(twinPlanned.id))
    })
})

describe("stated preferences", () => {
    it("downranks an avoided ingredient and removes a hard-filtered one", () => {
        const { recipes, a } = corpus()
        const index = buildIndex(recipes)

        const soft = signals({
            prefs: [{ id: 1, name: "harissa", stance: "avoid", hardFilter: false }],
        })
        const ranked = rank(index, soft).map(e => e.recipe.id)
        expect(ranked).toContain(a.id)
        expect(ranked.indexOf(a.id)).toBeGreaterThan(ranked.length / 2)

        // promoting it to an allergy removes the recipe outright
        const hard = signals({
            prefs: [{ id: 1, name: "harissa", stance: "avoid", hardFilter: true }],
        })
        expect(rank(index, hard).map(e => e.recipe.id)).not.toContain(a.id)
        expect(deck(index, hard, 50, seeded(0)).map(c => c.recipe.id)).not.toContain(a.id)
    })

    it("promotes recipes matching a liked ingredient", () => {
        const { recipes, a, b } = corpus()
        const ranked = order(recipes, signals({
            prefs: [{ id: 1, name: "harissa", stance: "like", hardFilter: false }],
        }))
        expect([a.id, b.id]).toContain(ranked[0])
    })
})

describe("the deck", () => {
    it("opens on a spread of proteins when nothing is known", () => {
        const { recipes } = corpus()
        const cards = deck(buildIndex(recipes), signals(), 10, seeded(0))
        const proteins = cards.map(c => c.recipe.protein_type)

        expect(new Set(proteins).size).toBeGreaterThan(1)
        for (let i = 0; i < proteins.length - 2; i++) {
            expect(proteins[i] === proteins[i + 1] && proteins[i + 1] === proteins[i + 2])
                .toBe(false)
        }
    })

    it("skips recipes already judged", () => {
        const { recipes, a } = corpus()
        const cards = deck(
            buildIndex(recipes),
            signals({ feedback: { [a.id]: swipe("like") } }),
            50, seeded(0),
        )
        expect(cards.map(c => c.recipe.id)).not.toContain(a.id)
    })

    it("brings a recipe passed over 90 days ago back into circulation", () => {
        const { recipes, a } = corpus()
        const index = buildIndex(recipes)
        const ids = (decidedAt: string) =>
            deck(index, signals({ feedback: { [a.id]: swipe("dislike", decidedAt) } }), 50, seeded(0))
                .map(c => c.recipe.id)

        expect(ids(shift(-89))).not.toContain(a.id)
        expect(ids(shift(-91))).toContain(a.id)
    })

    it("stays balanced when one protein outscores the rest", () => {
        const { recipes } = corpus()
        // a week of chicken makes every beef dish outrank every chicken dish
        const plan: Record<string, PlanSlot> = {}
        for (let offset = 0; offset < 4; offset++) {
            const r = make(`Chicken Night ${offset}`, [...PANTRY, `x${offset}`], "chicken")
            recipes.push(r)
            plan[`${shift(-(offset + 1))}|dinner`] = meal(r.id)
        }

        const cards = deck(buildIndex(recipes), signals({ plan }), 10, seeded(3))
        const proteins = cards.map(c => c.recipe.protein_type)
        expect(proteins).toContain("chicken")
        expect(proteins).toContain("beef")
    })

    it("lets no single protein swallow a varied library", () => {
        // this was happening for real once the library grew past two proteins
        const recipes: EngineRecipe[] = []
        for (const p of ["chicken", "beef", "pork", "lamb", "fish", "vegetarian"]) {
            // pork deliberately over-represented, as it is in the real library
            const count = p === "pork" ? 20 : 5
            for (let i = 0; i < count; i++) {
                recipes.push(make(`${p} dish ${i}`, [...PANTRY, `${p} spice ${i}`], p))
            }
        }

        const cards = deck(buildIndex(recipes), signals(), 12, seeded(11))
        const counts = new Map<string, number>()
        for (const c of cards) {
            const p = c.recipe.protein_type!
            counts.set(p, (counts.get(p) ?? 0) + 1)
        }

        expect(cards).toHaveLength(12)
        expect(Math.max(...counts.values())).toBeLessThanOrEqual(4)
        expect(counts.size).toBeGreaterThanOrEqual(4)
    })
})
