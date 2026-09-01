import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
    formatAmount, parseAmount, prettyNumber, scaleQuantity, splitEntry, sumAmounts,
} from "./quantity"

describe("scaleQuantity", () => {
    it("keeps the unit attached or spaced the way the recipe wrote it", () => {
        expect(scaleQuantity("200g", 2)).toBe("400g")
        expect(scaleQuantity("2 tbsp", 2)).toBe("4 tbsp")
    })

    it("halves into fractions rather than decimals", () => {
        expect(scaleQuantity("1 tsp", 0.5)).toBe("1/2 tsp")
        expect(scaleQuantity("3 tbsp", 0.5)).toBe("1 1/2 tbsp")
        expect(scaleQuantity("1/2 cup", 3)).toBe("1 1/2 cups")
        expect(scaleQuantity("1 cup", 0.5)).toBe("1/2 cup")
    })

    it("writes metric as a decimal, not a fraction", () => {
        expect(scaleQuantity("1.5kg", 0.5)).toBe("0.75kg")
        expect(scaleQuantity("1 kg", 0.5)).toBe("0.5 kg")
        expect(scaleQuantity("350ml", 0.5)).toBe("175ml")
        // ...but a cup is still half a cup
        expect(scaleQuantity("1 cup", 0.5)).toBe("1/2 cup")
    })

    it("reads the fractions the library actually contains", () => {
        expect(scaleQuantity("1 1/2 tbsp", 2)).toBe("3 tbsp")
        expect(scaleQuantity("½ tsp", 4)).toBe("2 tsp")
        expect(scaleQuantity("1 ½ tbsp", 2)).toBe("3 tbsp")
        expect(scaleQuantity("2-1/2 cups", 2)).toBe("5 cups")
    })

    it("scales both ends of a range instead of picking one", () => {
        expect(scaleQuantity("2-3 tbsp", 2)).toBe("4-6 tbsp")
        expect(scaleQuantity("6-8 slices", 0.5)).toBe("3-4 slices")
    })

    it("carries the preparation note through untouched", () => {
        expect(scaleQuantity("1 chopped", 3)).toBe("3 chopped")
        expect(scaleQuantity("2 cloves minced", 2)).toBe("4 cloves minced")
    })

    /* The one thing scaling reaches past the number for. "1 teaspoons" reads
       like a bug even though the arithmetic is right. */
    it("makes the unit agree with its new number", () => {
        expect(scaleQuantity("2 teaspoons", 0.5)).toBe("1 teaspoon")
        expect(scaleQuantity("2 cloves minced", 0.5)).toBe("1 clove minced")
        expect(scaleQuantity("1 clove", 3)).toBe("3 cloves")
        expect(scaleQuantity("3 Cloves Crushed", 1 / 3)).toBe("1 Clove Crushed")
    })

    it("leaves a word it doesn't know to be a unit alone", () => {
        expect(scaleQuantity("2 chopped", 0.5)).toBe("1 chopped")
        expect(scaleQuantity("1 large", 2)).toBe("2 large")
    })

    /* The point of scaling by a factor rather than rewriting the string: an
       amount with no number in it is not a parse failure, it's an instruction
       that doesn't depend on how many people are eating. */
    it("leaves an unmeasured amount exactly as it was", () => {
        expect(scaleQuantity("Pinch", 4)).toBe("Pinch")
        expect(scaleQuantity("To taste", 0.5)).toBe("To taste")
        expect(scaleQuantity("Handful", 3)).toBe("Handful")
        expect(scaleQuantity("", 2)).toBe("")
    })

    it("does nothing at all at the original size", () => {
        expect(scaleQuantity("1 ½ tbsp", 1)).toBe("1 ½ tbsp")
    })
})

describe("prettyNumber", () => {
    it("drops the fraction once it stops mattering", () => {
        expect(prettyNumber(0.5)).toBe("1/2")
        expect(prettyNumber(2.25)).toBe("2 1/4")
        expect(prettyNumber(0.333)).toBe("1/3")
        expect(prettyNumber(12.5)).toBe("13")
        expect(prettyNumber(400)).toBe("400")
    })
})

describe("parseAmount", () => {
    it("folds the spellings of a unit onto one key", () => {
        for (const written of ["2 tbsp", "2 tbs", "2 tblsp", "2 tablespoons", "2 tbls"]) {
            expect(parseAmount(written)).toEqual({ value: 2, unit: "tbsp" })
        }
    })

    it("treats a size or a preparation as a count, not a unit", () => {
        expect(parseAmount("1 large")).toEqual({ value: 1, unit: "" })
        expect(parseAmount("2 chopped")).toEqual({ value: 2, unit: "" })
    })

    it("uses the separate unit column when a recipe fills it in", () => {
        expect(parseAmount("2", "cups")).toEqual({ value: 2, unit: "cup" })
    })

    it("buys for the top of a range", () => {
        expect(parseAmount("2-3 tbsp")).toEqual({ value: 3, unit: "tbsp" })
    })

    it("has nothing to add up for an unmeasured amount", () => {
        expect(parseAmount("Pinch")).toBeNull()
        expect(parseAmount("To taste")).toBeNull()
    })
})

describe("splitEntry", () => {
    it("takes the unit with the amount when it really is one", () => {
        expect(splitEntry("2 kg potatoes")).toEqual({ quantity: "2 kg", name: "potatoes" })
        expect(splitEntry("1/2 cup rice")).toEqual({ quantity: "1/2 cup", name: "rice" })
    })

    it("leaves the thing itself alone when the next word isn't a unit", () => {
        expect(splitEntry("2 potatoes")).toEqual({ quantity: "2", name: "potatoes" })
        expect(splitEntry("6 eggs")).toEqual({ quantity: "6", name: "eggs" })
    })

    it("is happy with no amount at all", () => {
        expect(splitEntry("milk")).toEqual({ quantity: "", name: "milk" })
        expect(splitEntry("  bin bags ")).toEqual({ quantity: "", name: "bin bags" })
        expect(splitEntry("")).toEqual({ quantity: "", name: "" })
    })
})

describe("sumAmounts", () => {
    it("adds like to like", () => {
        expect(sumAmounts([
            { value: 200, unit: "g" },
            { value: 300, unit: "g" },
        ])).toEqual([{ value: 500, unit: "g" }])
    })

    it("converts within a family and states the total once", () => {
        const total = sumAmounts([
            { value: 500, unit: "g" },
            { value: 1, unit: "kg" },
        ])
        expect(total).toEqual([{ value: 1500, unit: "g" }])
        expect(formatAmount(total[0])).toBe("1.5 kg")
    })

    /* A tablespoon of olive oil is not 15 ml of shopping. Inventing that
       conversion would make the list look tidier and be worth less. */
    it("never turns a spoon into a volume", () => {
        expect(sumAmounts([
            { value: 2, unit: "tbsp" },
            { value: 100, unit: "ml" },
        ])).toHaveLength(2)
    })

    it("pluralises a word unit but not an abbreviation", () => {
        expect(formatAmount({ value: 18, unit: "clove" })).toBe("18 cloves")
        expect(formatAmount({ value: 1, unit: "clove" })).toBe("1 clove")
        expect(formatAmount({ value: 500, unit: "g" })).toBe("500 g")
        expect(formatAmount({ value: 2, unit: "tbsp" })).toBe("2 tbsp")
    })

    it("keeps a weight and a count side by side", () => {
        expect(sumAmounts([
            { value: 400, unit: "g" },
            { value: 2, unit: "" },
        ])).toEqual([
            { value: 400, unit: "g" },
            { value: 2, unit: "" },
        ])
    })
})

/*
 * The parser exists to serve this file and nothing else, so it is measured
 * against it rather than against invented examples. 86% of the library carries
 * a number; the rest is pinches and handfuls, which are meant to fall through.
 */
describe("the shipped library", () => {
    const library = JSON.parse(
        readFileSync(new URL("../../public/recipes.json", import.meta.url), "utf8")
    ) as { recipes: { ingredients: { quantity: string; unit: string }[] }[] }
    const rows = library.recipes.flatMap(r => r.ingredients)

    it("is understood wherever it states a number", () => {
        const numeric = rows.filter(r => /\d/.test(r.quantity.split(" ").slice(0, 2).join(" ")))
        const parsed = numeric.filter(r => parseAmount(r.quantity, r.unit))
        expect(parsed.length / numeric.length).toBeGreaterThan(0.98)
    })

    it("never scales an amount into something unreadable", () => {
        for (const row of rows) {
            const scaled = scaleQuantity(row.quantity, 1.5)
            expect(scaled).not.toMatch(/NaN|Infinity|undefined/)
        }
    })

    it("comes back unchanged at the original size", () => {
        for (const row of rows) expect(scaleQuantity(row.quantity, 1)).toBe(row.quantity)
    })

    it("doubles and halves back to where it started", () => {
        for (const row of rows) {
            const amount = parseAmount(row.quantity, row.unit)
            if (!amount) continue
            const round = parseAmount(scaleQuantity(scaleQuantity(row.quantity, 2), 0.5), row.unit)
            expect(round?.value).toBeCloseTo(amount.value, 2)
        }
    })
})
