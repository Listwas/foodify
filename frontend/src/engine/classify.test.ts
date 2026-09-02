import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { buildIndex, guessCategory, withCategory, type EngineRecipe } from "./index"

const library = JSON.parse(
    readFileSync(new URL("../../public/recipes.json", import.meta.url), "utf8")
) as { recipes: (EngineRecipe & { protein_type: string | null })[] }

const index = buildIndex(library.recipes)
const of = (...names: string[]) => names.map(name => ({ name }))

describe("guessCategory", () => {
    it("reads a category straight off an ingredient that names one", () => {
        expect(guessCategory(index, of("chicken breast", "onion", "garlic"))?.category)
            .toBe("chicken")
        expect(guessCategory(index, of("ground beef", "onion", "tomato"))?.category)
            .toBe("beef")
    })

    /* The whole reason for learning from the library rather than matching
       words: half of it never names its own category. */
    it("learns the ingredients that stand in for one", () => {
        expect(guessCategory(index, of("salmon fillet", "lemon", "dill"))?.category)
            .toBe("fish")
        expect(guessCategory(index, of("chorizo", "paprika", "potatoes"))?.category)
            .toBe("pork")
    })

    /* Fifty recipes call for chicken stock and most of them are not chicken. */
    it("doesn't mistake the stock pot for the dish", () => {
        const guess = guessCategory(index, of("beef", "chicken stock", "onion", "carrots"))
        expect(guess?.category).toBe("beef")
    })

    it("says nothing when the ingredients say nothing", () => {
        expect(guessCategory(index, [])).toBeNull()
        expect(guessCategory(index, of("qwertyuiop", "zxcvbnm"))).toBeNull()
    })

    it("never overwrites a category somebody chose", () => {
        const chosen = { protein_type: "lamb", ingredients: of("chicken breast") }
        expect(withCategory(index, chosen).protein_type).toBe("lamb")
        const blank = { protein_type: null, ingredients: of("chicken breast", "garlic") }
        expect(withCategory(index, blank).protein_type).toBe("chicken")
    })
})

/*
 * Measured by holding each labelled recipe out of its own training data. It is
 * a default offered in a form, not an oracle, so the bar is "useful and
 * honest about being unsure" rather than "right". Pinned so a change to the
 * scoring can't quietly make it worse.
 */
describe("accuracy against the labelled library", () => {
    const labelled = library.recipes.filter(r => r.protein_type)

    const scored = labelled.map(recipe => {
        const heldOut = buildIndex(library.recipes.filter(o => o.id !== recipe.id))
        const guess = guessCategory(heldOut, recipe.ingredients)
        return { guess, truth: recipe.protein_type }
    })

    const answered = scored.filter(s => s.guess)
    const correct = answered.filter(s => s.guess!.category === s.truth)

    it("is right about three times in four when it answers", () => {
        expect(correct.length / answered.length).toBeGreaterThan(0.70)
    })

    it("answers for the large majority of recipes", () => {
        expect(answered.length / scored.length).toBeGreaterThan(0.80)
    })

    /* Confidence has to mean something, or abstaining is theatre. */
    it("is markedly more reliable when it says it is confident", () => {
        const sure = answered.filter(s => s.guess!.confidence >= 0.6)
        const sureCorrect = sure.filter(s => s.guess!.category === s.truth)
        expect(sureCorrect.length / sure.length)
            .toBeGreaterThan(correct.length / answered.length)
    })
})
