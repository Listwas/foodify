/** Wiring between local state and the taste engine. */
import { useMemo } from "react"
import { buildIndex, type Index, type Signals } from "../engine"
import { useAppState } from "../store"
import { structuralRecipes } from "./library"

let indexCache: { recipes: unknown; value: Index } | null = null

/**
 * The corpus statistics, rebuilt only when the set of recipes changes.
 *
 * Scanning 5,680 ingredients is the expensive part and it depends on which
 * recipes exist, never on how the user felt about them — so swiping, planning
 * and cooking must all leave this cache intact.
 */
export function useIndex(): Index {
    const recipes = structuralRecipes(useAppState())
    if (!indexCache || indexCache.recipes !== recipes) {
        indexCache = { recipes, value: buildIndex(recipes) }
    }
    return indexCache.value
}

/** Everything the engine learns from, straight off local state. */
export function useSignals(): Signals {
    const s = useAppState()
    return useMemo(
        () => ({ feedback: s.feedback, prefs: s.prefs, plan: s.plan }),
        [s.feedback, s.prefs, s.plan]
    )
}
