import type { RecipeFull, Stance, Verdict } from "../lib/types"

/** A recipe the user reacted to. `decidedAt` drives both recency decay and the
 *  90-day return of passed recipes, so it moves every time the verdict changes. */
export interface Feedback {
    verdict: Verdict
    shortlisted: boolean
    decidedAt: string // ISO date — the engine reads this, so it stays a plain date
    /** Monotonic, so "undo the last swipe" still works after a reload, which a
     *  day-resolution date can't answer. */
    seq?: number
}

export interface PlanSlot {
    recipeId: number
    status: "planned" | "completed"
}

export interface Pref {
    id: number
    name: string
    stance: Stance
    hardFilter: boolean
}

/** A photo the user attached — either their own upload or a stock pick. */
export interface ImageOverride {
    url: string
    isStock: boolean
    attribution: string | null
}

/**
 * Everything that isn't the shipped recipe library.
 *
 * Plan and grocery entries are keyed by date rather than a row id, because
 * there is no database to allocate ids and a day+slot is already unique. That
 * also makes the day route (`/day/2026-08-29`) readable.
 */
export interface AppState {
    version: number
    plan: Record<string, PlanSlot>        // `${date}|${slot}`
    feedback: Record<number, Feedback>    // recipeId
    prefs: Pref[]
    grocery: Record<string, boolean>      // `${date}|${slot}|${ingredientId}`
    customRecipes: RecipeFull[]
    images: Record<number, ImageOverride> // recipeId
    nextId: number
    nextPrefId: number
    nextSeq: number
}

/** Recipes the user creates start here so they can never collide with the
 *  seeded library, however much it grows. */
export const FIRST_LOCAL_ID = 1_000_000

export const STATE_VERSION = 1

export const emptyState = (): AppState => ({
    version: STATE_VERSION,
    plan: {},
    feedback: {},
    prefs: [],
    grocery: {},
    customRecipes: [],
    images: {},
    nextId: FIRST_LOCAL_ID,
    nextPrefId: 1,
    nextSeq: 1,
})

export const planKey = (date: string, slot = "dinner") => `${date}|${slot}`
export const groceryKey = (date: string, slot: string, ingredientId: number) =>
    `${date}|${slot}|${ingredientId}`
