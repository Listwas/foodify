/**
 * The TypeScript engine must score the way the Python one did.
 *
 * The recommender moved out of the FastAPI backend and into the browser. It is
 * the app's main advantage, so the port is checked against a ranking frozen
 * from the original Python implementation, run over the real 511-recipe
 * library with the fixture signals in __fixtures__/signals.json.
 *
 * That implementation and the script that dumped this baseline
 * (tools/dump_golden.py) were removed once parity was proven — both are in git
 * history. The fixture stays as the regression baseline: if these numbers move,
 * scoring has changed, and that had better be deliberate.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildIndex, normalize, type EngineRecipe, type Signals } from "./taste"
import { rank } from "./deck"

const read = (path: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf-8"))

const library: EngineRecipe[] = read("../../public/recipes.json").recipes
const signals: Signals = read("./__fixtures__/signals.json")
const golden: { id: number; score: number; reasons: string[] }[] =
    read("./__fixtures__/ranking.json")

const index = buildIndex(library)
const ours = rank(index, signals)

describe("parity with the Python engine", () => {
    it("indexes the same library", () => {
        expect(library.length).toBe(511)
        expect(index.recipes.size).toBe(511)
    })

    it("ranks the same recipes, in the same order", () => {
        expect(ours.map(r => r.recipe.id)).toEqual(golden.map(g => g.id))
    })

    it("scores every recipe identically", () => {
        for (let i = 0; i < golden.length; i++) {
            // set iteration order differs between the two languages, so the
            // weighted sums accumulate in a different order — the gap is pure
            // floating-point noise, orders of magnitude below any real one
            expect(ours[i].score).toBeCloseTo(golden[i].score, 12)
        }
    })

    it("gives the same reasons", () => {
        expect(ours.map(r => r.reasons)).toEqual(golden.map(g => g.reasons))
    })

    it("excludes hidden recipes", () => {
        const ranked = new Set(ours.map(r => r.recipe.id))
        const hidden = Object.entries(signals.feedback)
            .filter(([, f]) => f.verdict === "hidden")
            .map(([id]) => Number(id))

        expect(hidden.length).toBeGreaterThan(0)
        for (const id of hidden) expect(ranked.has(id)).toBe(false)
    })

    it("excludes recipes whose ingredient matches a hard filter exactly", () => {
        const ranked = new Set(ours.map(r => r.recipe.id))
        const blocked = library.filter(r =>
            r.ingredients.some(i => normalize(i.name) === "peanuts")
        )

        expect(blocked.length).toBe(11)
        for (const recipe of blocked) expect(ranked.has(recipe.id)).toBe(false)
    })

    it("does NOT catch related ingredients — 'peanuts' leaves 'peanut butter' through", () => {
        // Documenting current behaviour, not endorsing it. Matching is on the
        // whole normalized ingredient, so an allergy filter is narrower than the
        // profile page's "allergy" label implies. Recorded here so a future fix
        // shows up as a deliberate change rather than a surprise.
        const ranked = new Set(ours.map(r => r.recipe.id))
        const nearMiss = library.filter(r =>
            r.ingredients.some(i => /peanut/i.test(i.name))
            && !r.ingredients.some(i => normalize(i.name) === "peanuts")
        )

        expect(nearMiss.length).toBe(13)
        for (const recipe of nearMiss) expect(ranked.has(recipe.id)).toBe(true)
    })
})
