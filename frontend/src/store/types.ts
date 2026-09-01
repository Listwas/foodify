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
    /** How many this particular day is being cooked for. Snapshotted when the
     *  meal is planned, so changing a recipe's default later can't quietly
     *  rewrite a shopping list you already shopped from. Absent on plans made
     *  before servings existed, which means the standard four. */
    servings?: number
}

/**
 * What the shipped recipes are written for.
 *
 * They come from TheMealDB, which carries no servings field at all, and its
 * recipes are family-sized. Four is the assumption every scaled amount is
 * relative to; nothing in the data can confirm it, so it's stated here once
 * rather than buried in a component.
 */
export const BASE_SERVINGS = 4
export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 20

export interface Pref {
    id: number
    name: string
    stance: Stance
    hardFilter: boolean
}

/** A photo the user attached, either their own upload or a stock pick. */
export interface ImageOverride {
    url: string
    isStock: boolean
    attribution: string | null
}

/**
 * Changes made to a shipped recipe.
 *
 * recipes.json is read-only and replaced wholesale whenever the library is
 * refreshed, so edits live here instead, keyed by recipe id. Restoring the
 * original is deleting the entry.
 */
export interface RecipeEdit {
    title: string
    protein_type: string | null
    prep_time_minutes: number | null
    instructions: string
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    sugar_g: number | null
    ingredients: { id: number; name: string; quantity: string; unit: string }[]
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
    edits: Record<number, RecipeEdit>     // recipeId
    servings: Record<number, number>      // recipeId — how many you usually cook it for
    nextId: number
    nextPrefId: number
    nextSeq: number
}

/** Recipes the user creates start here so they can never collide with the
 *  seeded library, however much it grows. */
export const FIRST_LOCAL_ID = 1_000_000

export const STATE_VERSION = 2

export const emptyState = (): AppState => ({
    version: STATE_VERSION,
    plan: {},
    feedback: {},
    prefs: [],
    grocery: {},
    customRecipes: [],
    images: {},
    edits: {},
    servings: {},
    nextId: FIRST_LOCAL_ID,
    nextPrefId: 1,
    nextSeq: 1,
})

export const planKey = (date: string, slot = "dinner") => `${date}|${slot}`
export const groceryKey = (date: string, slot: string, ingredientId: number) =>
    `${date}|${slot}|${ingredientId}`
