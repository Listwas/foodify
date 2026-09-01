/**
 * A week's meals turned into one shopping list.
 *
 * Groceries have always been per-meal, which means seven pages and doing the
 * addition in your head at the shelf. This does the addition: the same
 * ingredient asked for by three different dinners becomes one line with one
 * total, filed under the part of the shop it's found in.
 *
 * Nothing is invented along the way. Amounts that can't be added stay side by
 * side, amounts with no number in them stay uncounted, and every line still
 * knows which meals asked for it so the total can be checked against them.
 */
import { normalize } from "../engine/taste"
import { BASE_SERVINGS, groceryKey, planKey, type AppState } from "../store/types"
import { sectionFor, sectionRank, type Section } from "./aisles"
import { addDays, iso } from "./dates"
import { formatAmount, kitchenQuantity, parseAmount, sumAmounts } from "./quantity"
import type { RecipeFull } from "./types"

export interface ShoppingSource {
    date: string
    title: string
    recipeId: number
    /** As that meal asks for it, already scaled to that day's servings. */
    quantity: string
}

export interface ShoppingLine {
    /** Folded ingredient name; unique within the list. */
    key: string
    name: string
    section: Section
    /** Totals, one per unit that wouldn't combine with the others. Empty when
     *  every mention was a pinch or a handful. */
    amounts: string[]
    checked: boolean
    /** Every per-day grocery tick this line stands for. Empty for a line the
     *  user added, which answers to nothing on the plan. */
    keys: string[]
    sources: ShoppingSource[]
    /** Set when the user put this line here themselves, so it can be edited
     *  and deleted rather than merely dropped. */
    extraId?: number
}

export interface PlannedMeal {
    date: string
    recipe: RecipeFull
    servings: number
    cooked: boolean
}

export interface ShoppingWeek {
    start: string
    end: string
    meals: PlannedMeal[]
    /** Planned and already cooked, so left out of the list. */
    cooked: number
    sections: { section: Section; lines: ShoppingLine[] }[]
    /** Taken off this week's list by hand, kept so they can be put back. */
    dropped: ShoppingLine[]
    total: number
    ticked: number
}

/**
 * Plural to singular, but only where the singular is on this same list.
 *
 * The engine gets away with folding "carrots" onto "carrot" and leaving
 * "tomatoes" alone, because a term it doesn't recognise just carries slightly
 * less weight. Here it would print tomatoes twice, so the endings that actually
 * occur are all tried. Requiring the singular to be present keeps it from
 * inventing a word: nothing is merged unless both spellings are in this week.
 */
function fold(names: Set<string>): (name: string) => string {
    const mapping = new Map<string, string>()
    for (const n of names) {
        const candidates = [
            n.endsWith("ies") ? `${n.slice(0, -3)}y` : null, // cherries -> cherry
            n.endsWith("s") ? n.slice(0, -1) : null,         // carrots  -> carrot
            n.endsWith("es") ? n.slice(0, -2) : null,        // tomatoes -> tomato
        ]
        const singular = candidates.find(c => c && c !== n && names.has(c))
        if (singular) mapping.set(n, singular)
    }
    return name => mapping.get(name) ?? name
}

export function buildShoppingWeek(
    state: AppState,
    recipes: Map<number, RecipeFull>,
    start: string,
    days = 7,
    slot = "dinner",
): ShoppingWeek {
    const startDate = new Date(`${start}T00:00`)
    const meals: PlannedMeal[] = []

    for (let i = 0; i < days; i++) {
        const date = iso(addDays(startDate, i))
        const planned = state.plan[planKey(date, slot)]
        const recipe = planned && recipes.get(planned.recipeId)
        if (!planned || !recipe) continue
        meals.push({
            date,
            recipe,
            servings: planned.servings ?? state.servings[recipe.id] ?? BASE_SERVINGS,
            cooked: planned.status === "completed",
        })
    }

    // Cooked means bought and eaten. Carrying it would send you out for
    // ingredients you used on Monday.
    const toBuy = meals.filter(m => !m.cooked)

    interface Row {
        normalized: string
        display: string
        quantity: string
        unit: string
        key: string
        source: ShoppingSource
    }

    const rows: Row[] = []
    for (const meal of toBuy) {
        const factor = meal.servings / BASE_SERVINGS
        for (const ingredient of meal.recipe.ingredients) {
            const display = ingredient.name.trim()
            const normalized = normalize(display)
            if (!normalized) continue
            const quantity = kitchenQuantity(ingredient.quantity, factor)
            rows.push({
                normalized,
                display,
                quantity,
                unit: ingredient.unit,
                key: groceryKey(meal.date, slot, ingredient.id),
                source: {
                    date: meal.date,
                    title: meal.recipe.title,
                    recipeId: meal.recipe.id,
                    quantity,
                },
            })
        }
    }

    const singular = fold(new Set(rows.map(r => r.normalized)))
    const grouped = new Map<string, Row[]>()
    for (const row of rows) {
        const key = singular(row.normalized)
        grouped.set(key, [...(grouped.get(key) ?? []), row])
    }

    const lines: ShoppingLine[] = []
    for (const [key, group] of grouped) {
        // whichever spelling the week uses most often is the one to shop by
        const spellings = new Map<string, number>()
        for (const row of group) {
            spellings.set(row.display, (spellings.get(row.display) ?? 0) + 1)
        }
        const name = [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]

        const amounts = group
            .map(row => parseAmount(row.quantity, row.unit))
            .filter(a => a !== null)

        const keys = group.map(row => row.key)
        lines.push({
            key,
            name,
            section: sectionFor(name),
            amounts: sumAmounts(amounts).map(formatAmount),
            checked: keys.length > 0 && keys.every(k => state.grocery[k]),
            keys,
            sources: group.map(row => row.source),
        })
    }

    // Anything the user added sits in the same aisles as the rest, so the list
    // reads as one list rather than a list plus an appendix.
    for (const extra of state.extras) {
        if (extra.week !== start) continue
        const amount = parseAmount(extra.quantity)
        lines.push({
            key: `extra:${extra.id}`,
            name: extra.name,
            section: sectionFor(extra.name),
            // an amount that won't parse ("a few") is shown as typed
            amounts: amount ? [formatAmount(amount)] : (extra.quantity ? [extra.quantity] : []),
            checked: extra.checked,
            keys: [],
            sources: [],
            extraId: extra.id,
        })
    }

    const droppedKeys = new Set(state.dropped[start] ?? [])
    const visible = lines.filter(l => !droppedKeys.has(l.key))

    const sections = [...new Set(visible.map(l => l.section))]
        .sort((a, b) => sectionRank(a) - sectionRank(b))
        .map(section => ({
            section,
            lines: visible
                .filter(l => l.section === section)
                .sort((a, b) => a.name.localeCompare(b.name)),
        }))

    return {
        start,
        end: iso(addDays(startDate, days - 1)),
        meals,
        cooked: meals.length - toBuy.length,
        sections,
        dropped: lines
            .filter(l => droppedKeys.has(l.key))
            .sort((a, b) => a.name.localeCompare(b.name)),
        total: visible.length,
        ticked: visible.filter(l => l.checked).length,
    }
}

/** The list as plain text, for handing to whoever is actually going. */
export function shoppingText(week: ShoppingWeek): string {
    const out: string[] = []
    for (const { section, lines } of week.sections) {
        out.push(section.toUpperCase())
        for (const line of lines) {
            const amount = line.amounts.join(" + ")
            out.push(`${line.checked ? "[x]" : "[ ]"} ${amount ? `${amount} ` : ""}${line.name}`)
        }
        out.push("")
    }
    return out.join("\n").trim()
}
