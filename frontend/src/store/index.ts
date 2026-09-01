/**
 * The app's mutable state, held in memory and mirrored to IndexedDB.
 *
 * There is no server, so this replaces every write endpoint the FastAPI backend
 * used to expose. Reads are synchronous — `useSyncExternalStore` gives React the
 * subscription it needs without a query cache in front of data that never
 * travels over a network.
 */
import { useSyncExternalStore } from "react"
import type { RecipeCandidate, RecipeFull, Stance, Verdict } from "../lib/types"
import { iso } from "../lib/dates"
import { load, migrate, save } from "./db"
import {
    emptyState, groceryKey, planKey, FIRST_LOCAL_ID,
    type AppState, type ImageOverride, type PlanSlot, type RecipeEdit,
} from "./types"

const SAVE_DEBOUNCE_MS = 250

let state: AppState = emptyState()
let ready = false
const listeners = new Set<() => void>()
let saveTimer: number | undefined

function scheduleSave() {
    window.clearTimeout(saveTimer)
    // a swipe streak can fire a dozen updates a second; one write after the
    // burst is enough, and the state is small so it lands well before unload
    saveTimer = window.setTimeout(() => void save(state), SAVE_DEBOUNCE_MS)
}

function commit(next: AppState) {
    state = next
    listeners.forEach(l => l())
    scheduleSave()
}

function update(fn: (draft: AppState) => Partial<AppState>) {
    commit({ ...state, ...fn(state) })
}

export function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
}

export const getState = () => state

/** Load persisted state. Called once before the first render. */
export async function hydrate() {
    if (ready) return
    state = await load()
    ready = true
    listeners.forEach(l => l())
}

export function useAppState(): AppState {
    return useSyncExternalStore(subscribe, getState)
}

// --- plan ---------------------------------------------------------------

export function assign(recipeId: number, date: string, slot = "dinner") {
    update(s => ({
        plan: { ...s.plan, [planKey(date, slot)]: { recipeId, status: "planned" } },
    }))
}

export function clearDay(date: string, slot = "dinner") {
    const key = planKey(date, slot)
    update(s => {
        const plan = { ...s.plan }
        delete plan[key]
        // the day's ticked-off groceries are meaningless without the meal
        const grocery = Object.fromEntries(
            Object.entries(s.grocery).filter(([k]) => !k.startsWith(`${key}|`))
        )
        return { plan, grocery }
    })
}

export function markCooked(date: string, done: boolean, slot = "dinner") {
    const key = planKey(date, slot)
    update(s => {
        const entry = s.plan[key]
        if (!entry) return {}
        const next: PlanSlot = { ...entry, status: done ? "completed" : "planned" }
        return { plan: { ...s.plan, [key]: next } }
    })
}

// --- taste signals ------------------------------------------------------

export function setFeedback(recipeId: number, verdict: Verdict, shortlisted?: boolean) {
    update(s => ({
        feedback: {
            ...s.feedback,
            [recipeId]: {
                verdict,
                shortlisted: shortlisted ?? (verdict === "like"),
                decidedAt: iso(new Date()),
                seq: s.nextSeq,
            },
        },
        nextSeq: s.nextSeq + 1,
    }))
}

/** The recipe id of the most recent verdict, or null when there's nothing to undo. */
export function lastJudged(): number | null {
    let best: number | null = null
    let bestSeq = -Infinity
    for (const [id, f] of Object.entries(getState().feedback)) {
        const seq = f.seq ?? 0
        if (seq >= bestSeq) { bestSeq = seq; best = Number(id) }
    }
    return best
}

export function clearFeedback(recipeId: number) {
    update(s => {
        const feedback = { ...s.feedback }
        delete feedback[recipeId]
        return { feedback }
    })
}

export function setShortlisted(recipeId: number, shortlisted: boolean) {
    update(s => {
        const current = s.feedback[recipeId]
        if (!current) return {}
        return { feedback: { ...s.feedback, [recipeId]: { ...current, shortlisted } } }
    })
}

// --- profile ------------------------------------------------------------

export function addPref(name: string, stance: Stance, hardFilter = false) {
    const clean = name.trim().toLowerCase()
    if (!clean) return
    update(s => {
        const existing = s.prefs.find(p => p.name === clean)
        if (existing) {
            return {
                prefs: s.prefs.map(p =>
                    p.name === clean ? { ...p, stance, hardFilter } : p
                ),
            }
        }
        return {
            prefs: [...s.prefs, { id: s.nextPrefId, name: clean, stance, hardFilter }],
            nextPrefId: s.nextPrefId + 1,
        }
    })
}

export function removePref(id: number) {
    update(s => ({ prefs: s.prefs.filter(p => p.id !== id) }))
}

// --- groceries ----------------------------------------------------------

export function setCheck(
    date: string, slot: string, ingredientId: number, checked: boolean
) {
    update(s => ({
        grocery: { ...s.grocery, [groceryKey(date, slot, ingredientId)]: checked },
    }))
}

// --- user recipes and photos --------------------------------------------

/** Save a generated or hand-written recipe into the local library. */
export function addRecipe(candidate: RecipeCandidate): RecipeFull {
    const id = state.nextId
    const recipe: RecipeFull = {
        id,
        title: candidate.title,
        source: candidate.source,
        protein_type: candidate.protein_type,
        prep_time_minutes: candidate.prep_time_minutes,
        instructions: candidate.instructions,
        calories: candidate.calories,
        protein_g: candidate.protein_g,
        carbs_g: candidate.carbs_g,
        sugar_g: candidate.sugar_g,
        image_url: candidate.image_url,
        image_is_stock: candidate.image_is_stock ?? false,
        image_attribution: candidate.image_attribution ?? null,
        copied_from: candidate.copied_from ?? null,
        verdict: null,
        shortlisted: false,
        ingredients: candidate.ingredients.map((ing, i) => ({
            id: id * 100 + i, // local ingredient ids, unique per recipe
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
        })),
    }
    update(s => ({ customRecipes: [...s.customRecipes, recipe], nextId: s.nextId + 1 }))
    return recipe
}

export const isLocalRecipe = (id: number) => id >= FIRST_LOCAL_ID

/**
 * Change a recipe in place.
 *
 * A recipe the user wrote is edited directly. A shipped one can't be, since
 * recipes.json is replaced wholesale whenever the library is refreshed, so the
 * change is kept as an override that `restoreRecipe` removes.
 *
 * Either way the id doesn't move, so the swipes and cooking history already
 * attached to this recipe stay attached. It's the same dish, tweaked.
 */
export function editRecipe(recipeId: number, patch: RecipeEdit) {
    update(s => {
        if (isLocalRecipe(recipeId)) {
            return {
                customRecipes: s.customRecipes.map(r =>
                    r.id === recipeId ? { ...r, ...patch } : r
                ),
            }
        }
        return { edits: { ...s.edits, [recipeId]: patch } }
    })
}

/**
 * Delete a recipe the user created, along with everything pointing at it.
 *
 * Only local recipes can go: a shipped one isn't ours to remove, and hiding is
 * what that case is for. Leaving a plan entry or a swipe behind would strand a
 * reference to an id that no longer resolves, so they go too.
 */
export function deleteRecipe(recipeId: number) {
    if (!isLocalRecipe(recipeId)) return
    update(s => {
        const goneDays = new Set(
            Object.entries(s.plan)
                .filter(([, slot]) => slot.recipeId === recipeId)
                .map(([key]) => key)
        )
        const feedback = { ...s.feedback }
        delete feedback[recipeId]
        const images = { ...s.images }
        delete images[recipeId]
        const edits = { ...s.edits }
        delete edits[recipeId]
        return {
            customRecipes: s.customRecipes.filter(r => r.id !== recipeId),
            plan: Object.fromEntries(
                Object.entries(s.plan).filter(([key]) => !goneDays.has(key))
            ),
            grocery: Object.fromEntries(
                Object.entries(s.grocery).filter(
                    ([key]) => ![...goneDays].some(day => key.startsWith(`${day}|`))
                )
            ),
            feedback,
            images,
            edits,
        }
    })
}

/** Drop local changes and fall back to the shipped recipe. */
export function restoreRecipe(recipeId: number) {
    update(s => {
        const edits = { ...s.edits }
        delete edits[recipeId]
        return { edits }
    })
}

/** Replace any recipe's photo, seeded ones included. */
export function setImage(recipeId: number, image: ImageOverride | null) {
    update(s => {
        const images = { ...s.images }
        if (image) images[recipeId] = image
        else delete images[recipeId]
        return { images }
    })
}

// --- backup -------------------------------------------------------------

/** The only way to move a plan between devices — there is no sync. */
export const exportState = () => JSON.stringify(state, null, 2)

export function importState(json: string) {
    const parsed = migrate(JSON.parse(json))
    commit(parsed)
}

export function resetState() {
    commit(emptyState())
}
