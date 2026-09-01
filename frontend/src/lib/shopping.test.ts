import { describe, expect, it } from "vitest"
import { buildShoppingWeek, shoppingText } from "./shopping"
import { emptyState, groceryKey, planKey, type AppState } from "../store/types"
import type { RecipeFull } from "./types"

const MONDAY = "2026-09-07"
const TUESDAY = "2026-09-08"
const WEDNESDAY = "2026-09-09"

let nextIngredientId = 1

function recipe(id: number, title: string, items: [string, string][]): RecipeFull {
    return {
        id, title,
        source: "seeded",
        protein_type: null, prep_time_minutes: null,
        calories: null, protein_g: null, carbs_g: null, sugar_g: null,
        image_url: null, image_is_stock: false, image_attribution: null,
        verdict: null, shortlisted: false,
        instructions: "",
        ingredients: items.map(([name, quantity]) => ({
            id: nextIngredientId++, name, quantity, unit: "",
        })),
    }
}

/** A week with the given meals planned for dinner, and nothing else. */
function week(
    meals: { date: string; recipe: RecipeFull; servings?: number; cooked?: boolean }[],
    tweak: (s: AppState) => void = () => {},
) {
    const state = emptyState()
    const map = new Map<number, RecipeFull>()
    for (const meal of meals) {
        state.plan[planKey(meal.date)] = {
            recipeId: meal.recipe.id,
            status: meal.cooked ? "completed" : "planned",
            servings: meal.servings ?? 4,
        }
        map.set(meal.recipe.id, meal.recipe)
    }
    tweak(state)
    return buildShoppingWeek(state, map, MONDAY)
}

const lineFor = (built: ReturnType<typeof week>, name: string) =>
    built.sections.flatMap(s => s.lines).find(l => l.name === name)

describe("buildShoppingWeek", () => {
    it("adds one ingredient up across the meals that want it", () => {
        const built = week([
            { date: MONDAY, recipe: recipe(1, "Curry", [["chicken", "200g"]]) },
            { date: WEDNESDAY, recipe: recipe(2, "Pie", [["chicken", "300g"]]) },
        ])
        expect(lineFor(built, "chicken")?.amounts).toEqual(["500 g"])
        expect(lineFor(built, "chicken")?.sources).toHaveLength(2)
    })

    it("folds a plural into the singular already on the list", () => {
        const built = week([
            { date: MONDAY, recipe: recipe(1, "Salad", [["tomato", "2"]]) },
            { date: TUESDAY, recipe: recipe(2, "Sauce", [["tomatoes", "3"]]) },
        ])
        expect(built.total).toBe(1)
        expect(lineFor(built, "tomato")?.amounts).toEqual(["5"])
    })

    it("scales each meal by what that day is cooked for", () => {
        const built = week([
            { date: MONDAY, recipe: recipe(1, "Curry", [["rice", "100g"]]), servings: 8 },
            { date: TUESDAY, recipe: recipe(2, "Stew", [["rice", "100g"]]), servings: 2 },
        ])
        // doubled for eight, halved for two
        expect(lineFor(built, "rice")?.amounts).toEqual(["250 g"])
    })

    /* Cooked means bought and eaten. Carrying it forward would send you out
       for ingredients that are already in Monday's bin. */
    it("leaves out a meal that has been cooked", () => {
        const built = week([
            { date: MONDAY, recipe: recipe(1, "Curry", [["chicken", "200g"]]), cooked: true },
            { date: TUESDAY, recipe: recipe(2, "Pie", [["chicken", "300g"]]) },
        ])
        expect(lineFor(built, "chicken")?.amounts).toEqual(["300 g"])
        expect(built.cooked).toBe(1)
        expect(built.meals).toHaveLength(2) // still shown, just not shopped for
    })

    it("keeps amounts apart when adding them would be a lie", () => {
        const built = week([
            { date: MONDAY, recipe: recipe(1, "Curry", [["tomato", "400g"]]) },
            { date: TUESDAY, recipe: recipe(2, "Salad", [["tomato", "2"]]) },
        ])
        expect(lineFor(built, "tomato")?.amounts).toEqual(["400 g", "2"])
    })

    it("has no total to offer for a pinch of something", () => {
        const built = week([
            { date: MONDAY, recipe: recipe(1, "Curry", [["salt", "Pinch"]]) },
            { date: TUESDAY, recipe: recipe(2, "Pie", [["salt", "To taste"]]) },
        ])
        const salt = lineFor(built, "salt")
        expect(salt?.amounts).toEqual([])
        expect(salt?.sources).toHaveLength(2)
    })

    it("files each line under a part of the shop", () => {
        const built = week([{
            date: MONDAY,
            recipe: recipe(1, "Curry", [["chicken", "200g"], ["onion", "1"], ["cumin", "1 tsp"]]),
        }])
        expect(built.sections.map(s => s.section))
            .toEqual(["Fruit & veg", "Meat & fish", "Herbs & spices"])
    })

    /* The point of merging: one tick in the shop, and every day that wanted
       the ingredient agrees it's been bought. */
    it("counts a line as bought only once every meal's tick is set", () => {
        const curry = recipe(1, "Curry", [["chicken", "200g"]])
        const pie = recipe(2, "Pie", [["chicken", "300g"]])
        const first = groceryKey(MONDAY, "dinner", curry.ingredients[0].id)

        const half = week(
            [{ date: MONDAY, recipe: curry }, { date: TUESDAY, recipe: pie }],
            s => { s.grocery[first] = true },
        )
        expect(lineFor(half, "chicken")?.checked).toBe(false)

        const all = week(
            [{ date: MONDAY, recipe: curry }, { date: TUESDAY, recipe: pie }],
            s => {
                s.grocery[first] = true
                s.grocery[groceryKey(TUESDAY, "dinner", pie.ingredients[0].id)] = true
            },
        )
        expect(lineFor(all, "chicken")?.checked).toBe(true)
        expect(all.ticked).toBe(1)
    })

    it("files something you added into the aisle it belongs to", () => {
        const built = week([], s => {
            s.extras.push({ id: 1, week: MONDAY, name: "milk", quantity: "2 l", checked: false })
            s.extras.push({ id: 2, week: MONDAY, name: "bin bags", quantity: "", checked: false })
        })
        const milk = lineFor(built, "milk")
        expect(milk?.section).toBe("Dairy & eggs")
        expect(milk?.amounts).toEqual(["2 l"])
        expect(milk?.extraId).toBe(1)
        // nothing recognisable is still a perfectly good line
        expect(lineFor(built, "bin bags")?.amounts).toEqual([])
        expect(built.total).toBe(2)
    })

    it("shows an amount it can't parse exactly as it was typed", () => {
        const built = week([], s => {
            s.extras.push({ id: 1, week: MONDAY, name: "coffee", quantity: "a bag", checked: false })
        })
        expect(lineFor(built, "coffee")?.amounts).toEqual(["a bag"])
    })

    it("keeps your own items to the week you added them to", () => {
        const built = week([], s => {
            s.extras.push({ id: 1, week: "2026-08-31", name: "milk", quantity: "", checked: false })
        })
        expect(built.total).toBe(0)
    })

    /* Dropping is not ticking. A tick says it's in the basket; dropping says
       it was never going to be bought and shouldn't be in the way. */
    it("takes a dropped line off the list but keeps it recoverable", () => {
        const curry = recipe(1, "Curry", [["chicken", "200g"], ["olive oil", "2 tbsp"]])
        const built = week([{ date: MONDAY, recipe: curry }], s => {
            s.dropped[MONDAY] = ["olive oil"]
        })
        expect(built.total).toBe(1)
        expect(lineFor(built, "olive oil")).toBeUndefined()
        expect(built.dropped.map(l => l.name)).toEqual(["olive oil"])
    })

    it("counts only what's still on the list", () => {
        const curry = recipe(1, "Curry", [["chicken", "200g"], ["salt", "Pinch"]])
        const key = groceryKey(MONDAY, "dinner", curry.ingredients[0].id)
        const built = week([{ date: MONDAY, recipe: curry }], s => {
            s.grocery[key] = true
            s.dropped[MONDAY] = ["salt"]
        })
        expect(built.total).toBe(1)
        expect(built.ticked).toBe(1)
    })

    it("looks past the end of the week and finds nothing", () => {
        const built = week([{ date: "2026-09-20", recipe: recipe(1, "Curry", [["chicken", "200g"]]) }])
        expect(built.total).toBe(0)
        expect(built.meals).toHaveLength(0)
    })
})

describe("shoppingText", () => {
    it("copies out as something you could read in a shop", () => {
        const built = week([{
            date: MONDAY,
            recipe: recipe(1, "Curry", [["chicken", "200g"], ["salt", "Pinch"]]),
        }])
        expect(shoppingText(built)).toBe(
            "MEAT & FISH\n[ ] 200 g chicken\n\nHERBS & SPICES\n[ ] salt"
        )
    })

    it("carries your own items out and leaves the dropped ones behind", () => {
        const built = week(
            [{ date: MONDAY, recipe: recipe(1, "Curry", [["chicken", "200g"], ["salt", "Pinch"]]) }],
            s => {
                s.extras.push({ id: 1, week: MONDAY, name: "bin bags", quantity: "", checked: false })
                s.dropped[MONDAY] = ["salt"]
            },
        )
        const text = shoppingText(built)
        expect(text).toContain("[ ] bin bags")
        expect(text).not.toContain("salt")
    })
})
