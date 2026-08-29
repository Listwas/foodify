/**
 * The recipe library: the shipped file plus whatever the user has added on this
 * device, with their photo replacements and swipe verdicts applied.
 *
 * The seeded recipes are read-only reference data, so they arrive as a static
 * JSON file rather than from a database. Derived views are memoised on object
 * identity — the store replaces the slices it touches, so a reference check is
 * enough to know whether a recomputation is needed.
 */
import type { AppState } from "../store/types"
import type { RecipeFull } from "../lib/types"
import { getState, useAppState } from "../store"

/** Shape of an entry in public/recipes.json — the optional fields are omitted
 *  there whenever they'd be false or null, which is most of the time. */
interface SeededRecipe extends Omit<RecipeFull, "image_is_stock" | "image_attribution" | "verdict" | "shortlisted"> {
    image_is_stock?: boolean
    image_attribution?: string | null
}

let base: RecipeFull[] = []

export async function loadRecipes(): Promise<void> {
    const response = await fetch(`${import.meta.env.BASE_URL}recipes.json`)
    if (!response.ok) throw new Error(`could not load the recipe library (${response.status})`)
    const data = (await response.json()) as { recipes: SeededRecipe[] }
    base = data.recipes.map(r => ({
        ...r,
        image_is_stock: r.image_is_stock ?? false,
        image_attribution: r.image_attribution ?? null,
        verdict: null,
        shortlisted: false,
    }))
}

// --- derived views ------------------------------------------------------

let structuralCache: {
    custom: AppState["customRecipes"]
    images: AppState["images"]
    value: RecipeFull[]
} | null = null

/**
 * Every recipe with its current photo, but without the user's verdicts.
 *
 * The taste engine indexes this: ingredient statistics depend on which recipes
 * exist, never on how the user felt about them, so swiping must not invalidate
 * the index.
 */
export function structuralRecipes(s: AppState = getState()): RecipeFull[] {
    if (structuralCache && structuralCache.custom === s.customRecipes
        && structuralCache.images === s.images) {
        return structuralCache.value
    }
    const value = [...base, ...s.customRecipes].map(recipe => {
        const override = s.images[recipe.id]
        if (!override) return recipe
        return {
            ...recipe,
            image_url: override.url,
            image_is_stock: override.isStock,
            image_attribution: override.attribution,
        }
    })
    structuralCache = { custom: s.customRecipes, images: s.images, value }
    return value
}

let structuralMapCache: { list: RecipeFull[]; byId: Map<number, RecipeFull> } | null = null

/**
 * Lookup by id that does *not* change when a verdict does.
 *
 * The swipe deck builds its cards from this. Using the verdict-annotated map
 * there meant every swipe handed back a new Map, which invalidated the deal
 * callback and reshuffled the whole deck mid-session — undo then restored
 * whatever the fresh deal put on top instead of the card just swiped.
 */
export function useStructuralMap(): Map<number, RecipeFull> {
    const list = structuralRecipes(useAppState())
    if (!structuralMapCache || structuralMapCache.list !== list) {
        structuralMapCache = { list, byId: new Map(list.map(r => [r.id, r])) }
    }
    return structuralMapCache.byId
}

let annotatedCache: {
    structural: RecipeFull[]
    feedback: AppState["feedback"]
    list: RecipeFull[]
    byId: Map<number, RecipeFull>
} | null = null

function annotated(s: AppState) {
    const structural = structuralRecipes(s)
    if (annotatedCache && annotatedCache.structural === structural
        && annotatedCache.feedback === s.feedback) {
        return annotatedCache
    }
    const list = structural.map(recipe => {
        const fb = s.feedback[recipe.id]
        if (!fb) return recipe
        return { ...recipe, verdict: fb.verdict, shortlisted: fb.shortlisted }
    })
    annotatedCache = {
        structural,
        feedback: s.feedback,
        list,
        byId: new Map(list.map(r => [r.id, r])),
    }
    return annotatedCache
}

/** Every recipe, verdicts included. */
export function useLibrary(): RecipeFull[] {
    return annotated(useAppState()).list
}

export function useRecipe(id: number | undefined): RecipeFull | undefined {
    const byId = annotated(useAppState()).byId
    return id == null ? undefined : byId.get(id)
}

export function useRecipeMap(): Map<number, RecipeFull> {
    return annotated(useAppState()).byId
}

/** The distinct protein types present, for the library's filter chips. */
export function useProteinTypes(): string[] {
    const list = useLibrary()
    return [...new Set(list.map(r => r.protein_type).filter((p): p is string => !!p))].sort()
}
