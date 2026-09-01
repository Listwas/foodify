import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
    formatAmount, kitchenQuantity, metricProse, parseAmount, prettyNumber,
    scaleQuantity, splitEntry, sumAmounts, toMetric,
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

/*
 * Roughly 140 rows of the library came from American sources. Nobody here
 * weighs dinner in pounds, so none of them are allowed to reach the screen.
 */
describe("toMetric", () => {
    it("says a pound the way a conversion chart does", () => {
        expect(toMetric("1 lb")).toBe("450 g")
        expect(toMetric("1/2 lb")).toBe("230 g")
        expect(toMetric("2 Lbs")).toBe("910 g")
        expect(toMetric("16 ounces")).toBe("450 g")
    })

    it("moves up to kilograms when the number gets big", () => {
        expect(toMetric("4 lb")).toBe("1.81 kg")
        expect(toMetric("4-5 pound")).toBe("1.81-2.27 kg")
    })

    it("keeps whatever was written after the unit", () => {
        expect(toMetric("14 oz jar")).toBe("400 g jar")
        expect(toMetric("8-ounce sliced")).toBe("230 g sliced")
    })

    /* A few rows give both, so the recipe has already done the conversion.
       Keep its answer rather than recomputing a slightly different one. */
    it("keeps the metric half when an amount is stated twice", () => {
        expect(toMetric("650g/1lb 8 oz")).toBe("650g")
        expect(toMetric("12 ounces (340g)")).toBe("340g")
        expect(toMetric("8 ounces (230 grams)")).toBe("230 grams")
    })

    it("converts imperial that isn't the leading amount", () => {
        // one tin, described by its weight
        expect(toMetric("1 (12 oz.)")).toBe("1 (340 g)")
    })

    it("leaves alone what is already ours", () => {
        expect(toMetric("200g")).toBe("200g")
        expect(toMetric("2 tbsp")).toBe("2 tbsp")
        expect(toMetric("Pinch")).toBe("Pinch")
        // an inch is a cut, not a weight
        expect(toMetric("1 cut into 1/2-inch cubes")).toBe("1 cut into 1/2-inch cubes")
    })
})

describe("kitchenQuantity", () => {
    it("scales first, then converts", () => {
        expect(kitchenQuantity("1 lb", 2)).toBe("910 g")
        expect(kitchenQuantity("1 lb", 0.5)).toBe("230 g")
        expect(kitchenQuantity("8 oz", 1)).toBe("230 g")
    })

    it("still does the ordinary thing to ordinary amounts", () => {
        expect(kitchenQuantity("200g", 2)).toBe("400g")
        expect(kitchenQuantity("2 cloves minced", 0.5)).toBe("1 clove minced")
    })
})

/*
 * The method is prose, so the oven temperature and how thick to slice things
 * live in sentences where an amount field can't reach them.
 */
describe("metricProse", () => {
    it("turns an oven dial to the notch a conversion chart prints", () => {
        expect(metricProse("Preheat the oven to 350°F.")).toBe("Preheat the oven to 180°C.")
        expect(metricProse("Preheat oven to 400 degrees F.")).toBe("Preheat oven to 200°C.")
        expect(metricProse("Bake at 425 F.")).toBe("Bake at 220°C.")
        expect(metricProse("Preheat oven to 375 F degrees.")).toBe("Preheat oven to 190°C.")
    })

    /* Below boiling this is a probe in a chicken, not a dial, and 165F has to
       come out as the 74C it means rather than a rounded 70. */
    it("keeps a food-safety reading exact", () => {
        expect(metricProse("until it reads 165°F.")).toBe("until it reads 74°C.")
        expect(metricProse("cooked through at 145°F.")).toBe("cooked through at 63°C.")
    })

    it("drops the half it can't use when a recipe gives both", () => {
        expect(metricProse("Preheat the oven to 200C/400F/Gas 6."))
            .toBe("Preheat the oven to 200C/Gas 6.")
        expect(metricProse("lower the oven setting to 180C, 350F, gas 4"))
            .toBe("lower the oven setting to 180C, gas 4")
        expect(metricProse("heat the oven to 140C (120C fan)/275F/gas 1"))
            .toBe("heat the oven to 140C (120C fan)/gas 1")
        expect(metricProse("reads 165 degrees F (74 degrees C), about an hour"))
            .toBe("reads 74 degrees C, about an hour")
        expect(metricProse("Cut beef into 1 inch (2.5 cm) cubes"))
            .toBe("Cut beef into 2.5 cm cubes")
        expect(metricProse("Melt 25g/1oz of the butter")).toBe("Melt 25g of the butter")
        expect(metricProse("Gradually add 250ml/10fl oz of the stock"))
            .toBe("Gradually add 250ml of the stock")
    })

    it("measures in centimetres, dimensions and ranges included", () => {
        expect(metricProse("Cut into 1/2 inch cubes.")).toBe("Cut into 1.3 cm cubes.")
        expect(metricProse("into ¼-inch-thick pieces")).toBe("into 0.6 cm-thick pieces")
        expect(metricProse("Grease a 10x14x2-inch pan.")).toBe("Grease a 25x36x5 cm pan.")
        expect(metricProse("a large 10- to 12-inch skillet")).toBe("a large 25 to 30 cm skillet")
        expect(metricProse('roll into a 13x8" rectangle')).toBe("roll into a 33x20 cm rectangle")
    })

    /* The word appears far more often as a verb than a unit, and mangling an
       instruction is worse than leaving a unit alone. */
    it("knows a pound you do to garlic from a pound you weigh", () => {
        expect(metricProse("Pound the garlic with a pestle")).toBe("Pound the garlic with a pestle")
        expect(metricProse("pound gently with a mallet")).toBe("pound gently with a mallet")
        expect(metricProse("Add 1 lb of beef")).toBe("Add 450 g of beef")
    })

    it("leaves what is already ours completely alone", () => {
        const metric = "Heat oven to 200C/fan 180C/gas 6. Simmer for 20 minutes."
        expect(metricProse(metric)).toBe(metric)
        const spoons = "Add 2 tbsp oil and 1 cup rice."
        expect(metricProse(spoons)).toBe(spoons)
        expect(metricProse("")).toBe("")
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
    ) as { recipes: { title: string; instructions: string; ingredients: { quantity: string; unit: string }[] }[] }
    const rows = library.recipes.flatMap(r => r.ingredients)

    it("is understood wherever it states a number", () => {
        const numeric = rows.filter(r => /\d/.test(r.quantity.split(" ").slice(0, 2).join(" ")))
        const parsed = numeric.filter(r => parseAmount(r.quantity, r.unit))
        expect(parsed.length / numeric.length).toBeGreaterThan(0.98)
    })

    it("shows no pounds or ounces anywhere, at any serving size", () => {
        const imperial = /\b(lbs?|pounds?|oz|ounces?)\b/i
        const offenders = new Set<string>()
        for (const row of rows) {
            for (const factor of [0.25, 0.5, 1, 1.5, 2, 3]) {
                const shown = kitchenQuantity(row.quantity, factor)
                if (imperial.test(shown)) offenders.add(`${row.quantity} -> ${shown}`)
            }
        }
        expect([...offenders]).toEqual([])
    })

    /* Only numerals: "a couple of inches" has no exact value to convert, and
       "pound the garlic" is a verb. Both are left as the author wrote them. */
    it("leaves no numeric imperial measurement in any method", () => {
        const numeric = /\d+\s*(?:°\s*|degrees?\s*)?F\b|\d[\d\s/.¼½¾-]*\s*-?\s*(?:inch(es)?\b|")|\d[\d\s/.]*\s*(?:lbs?|pounds?|oz|ounces?)\b/i
        const offenders: string[] = []
        for (const recipe of library.recipes) {
            const shown = metricProse(recipe.instructions)
            const hit = shown.match(numeric)
            if (hit) offenders.push(`${recipe.title}: ${hit[0]}`)
        }
        expect(offenders).toEqual([])
    })

    it("hands the shopping list metric amounts to add up", () => {
        for (const row of rows) {
            const amount = parseAmount(kitchenQuantity(row.quantity), row.unit)
            expect(amount?.unit).not.toBe("lb")
            expect(amount?.unit).not.toBe("oz")
        }
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
