import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { knownFood } from "./foodwords"

describe("knownFood", () => {
    it("translates the kitchen words we wrote down", () => {
        expect(knownFood("Olive Oil", "pl")).toBe("oliwa z oliwek")
        expect(knownFood("garlic", "pl")).toBe("czosnek")
        expect(knownFood("Chicken Thighs", "pl")).toBe("udka z kurczaka")
    })

    it("matches however the library capitalised it", () => {
        expect(knownFood("  SALT  ", "pl")).toBe("sól")
    })

    /* The reason this list exists: asked for the bare word "Oil" with no
       sentence around it, the translation service returned "Ropa" — crude oil,
       the kind that comes out of the ground. */
    it("gets the ambiguous one-word names right", () => {
        expect(knownFood("Oil", "pl")).toBe("olej")
        expect(knownFood("cream", "pl")).toBe("śmietanka")
    })

    it("says nothing about a name it doesn't know", () => {
        expect(knownFood("gochujang", "pl")).toBeUndefined()
    })

    it("leaves English alone", () => {
        expect(knownFood("garlic", "en")).toBeUndefined()
    })
})

/*
 * A hand-written list is only practical because the library repeats itself.
 * Pinned so that trimming it, or the library growing, shows up here rather
 * than as English creeping back into a Polish shopping list.
 */
describe("coverage of the shipped library", () => {
    const library = JSON.parse(
        readFileSync(new URL("../../public/recipes.json", import.meta.url), "utf8")
    ) as { recipes: { ingredients: { name: string }[] }[] }

    it("covers most of what the recipes actually ask for", () => {
        const names = library.recipes.flatMap(r => r.ingredients.map(i => i.name))
        const known = names.filter(n => knownFood(n, "pl")).length
        expect(known / names.length).toBeGreaterThan(0.80)
    })
})
