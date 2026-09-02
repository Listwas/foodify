/**
 * Working out what kind of dish a hand-written recipe is.
 *
 * A recipe someone types in already feeds the engine: it goes into the index,
 * it gets ranked, and liking it teaches the model about every ingredient in
 * it. The one thing it can't teach is a *category*, because `protein_type` is
 * optional on the form and most people typing out a dish they already know
 * won't stop to fill it in. Without one the recipe sits outside everything the
 * engine does with categories: protein affinity, the "a break from chicken"
 * reasoning, the fatigue penalty, and the cap that stops one kind of meat
 * taking over the deck.
 *
 * No model call is needed to fix that. The library ships 511 recipes already
 * labelled by hand, which is a training set: ingredients that keep company
 * with "pork" are evidence of pork. The weighting is the same idea the rest of
 * the engine runs on — an ingredient that shows up everywhere proves nothing,
 * a rare one proves a lot — so `chorizo` decides a recipe and `salt` never
 * does.
 */
import { Index, normalize, type EngineRecipe } from "./taste"

/** Below this the evidence is too thin to be worth a guess. */
const MIN_CONFIDENCE = 0.18

/**
 * How much evidence an ingredient needs before it is believed.
 *
 * Without this, a term appearing in two recipes that both happen to be fish
 * reads as a hundred percent certain and outvotes the word "chicken" — which
 * is exactly what it did to Kung Pao Chicken. Every proportion is pulled back
 * toward the library's own baseline in proportion to how thin the evidence is,
 * the same shrinkage the taste engine applies to a single swipe.
 */
const SHRINK = 5

/**
 * An ingredient that simply says what it is settles the question, and half the
 * library does say: "Chicken Breasts", "Ground Beef", "Lamb Shoulder". Learned
 * association alone gets these wrong surprisingly often, because each spelling
 * is its own rare term.
 *
 * Weighted to usually win without being absolute, so several learned signals
 * can still outvote one mention.
 */
const NAMED = 5

/**
 * ...except in the stock pot. Fifty recipes call for chicken stock, most of
 * them not chicken dishes, and a bouillon cube is not what a dinner is made
 * of.
 */
const PANTRY = /\b(stock|broth|bouillon|granules|cube|cubes|powder|seasoning)\b/

interface Model {
    /** term -> how often each labelled category used it */
    byTerm: Map<string, Map<string, number>>
    /** term -> how many labelled recipes used it at all */
    total: Map<string, number>
    /** category -> its share of the labelled library */
    prior: Map<string, number>
}

let cache: { index: Index; model: Model } | null = null

/**
 * What each ingredient says about the category, learned from the recipes that
 * already carry one. Rebuilt only when the library itself changes.
 */
function train(index: Index): Model {
    if (cache && cache.index === index) return cache.model

    const byTerm = new Map<string, Map<string, number>>()
    const total = new Map<string, number>()
    const labelCounts = new Map<string, number>()
    let labelled = 0

    for (const [id, recipe] of index.recipes) {
        const label = recipe.protein_type
        if (!label) continue
        labelled += 1
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
        for (const term of index.terms(id)) {
            total.set(term, (total.get(term) ?? 0) + 1)
            let counts = byTerm.get(term)
            if (!counts) byTerm.set(term, (counts = new Map()))
            counts.set(label, (counts.get(label) ?? 0) + 1)
        }
    }

    const prior = new Map<string, number>()
    for (const [label, n] of labelCounts) prior.set(label, n / Math.max(labelled, 1))

    const model = { byTerm, total, prior }
    cache = { index, model }
    return model
}

export interface Guess {
    category: string
    /** 0..1, the winner's share of the evidence. */
    confidence: number
}

/**
 * The most likely category for a recipe, or null when nothing in it says.
 *
 * A dish of flour, water and salt genuinely has no protein, and answering
 * "chicken" because chicken is common would be worse than saying nothing:
 * a wrong label teaches the engine something false, an absent one only leaves
 * it where it already was.
 */
export function guessCategory(
    index: Index,
    ingredients: { name: string }[],
): Guess | null {
    const model = train(index)
    const scores = new Map<string, number>()

    for (const raw of ingredients) {
        const term = normalize(raw.name)

        if (!PANTRY.test(term)) {
            for (const label of model.prior.keys()) {
                if (term.includes(label)) {
                    scores.set(label, (scores.get(label) ?? 0) + NAMED)
                }
            }
        }

        // The whole name, and the words in it. Somebody typing their own
        // recipe writes "salmon fillet" where the library says "salmon", and
        // matching only the whole string would find nothing at all in what is
        // the most telling ingredient in the dish.
        const lookups = new Set([term, ...term.split(" ").filter(w => w.length > 2)])

        for (const lookup of lookups) {
            const counts = model.byTerm.get(lookup)
            const seen = model.total.get(lookup)
            if (!counts || !seen) continue

            // How much this ingredient shifts the odds, not how often it turns
            // up alongside a category. Onion sits in half the library, so its
            // presence in chicken recipes only reflects how many chicken
            // recipes there are; measured against that baseline it says
            // nothing and scores nothing, which is what lets one `chorizo`
            // outvote a dozen store-cupboard staples instead of being buried.
            const weight = index.weight(lookup)
            for (const [label, n] of counts) {
                const prior = model.prior.get(label) ?? 0
                const observed = (n + SHRINK * prior) / (seen + SHRINK)
                scores.set(label, (scores.get(label) ?? 0) + (observed - prior) * weight)
            }
        }
    }

    let category = ""
    let best = -Infinity
    let runnerUp = -Infinity
    for (const [label, score] of scores) {
        // ties break by name so the answer never depends on Map ordering
        if (score > best || (score === best && label < category)) {
            runnerUp = best
            best = score
            category = label
        } else if (score > runnerUp) {
            runnerUp = score
        }
    }
    if (!category || best <= 0) return null

    // How far clear of the next-best guess it finished. A photo finish means
    // the ingredients genuinely don't say, and a wrong label teaches the
    // engine something false, where no label just leaves it as it was.
    const confidence = (best - Math.max(runnerUp, 0)) / best
    return confidence >= MIN_CONFIDENCE ? { category, confidence } : null
}

/** Fill in a missing category, leaving one the user actually chose alone. */
export function withCategory<T extends Pick<EngineRecipe, "protein_type" | "ingredients">>(
    index: Index,
    recipe: T,
): T {
    if (recipe.protein_type) return recipe
    const guess = guessCategory(index, recipe.ingredients)
    return guess ? { ...recipe, protein_type: guess.category } : recipe
}
