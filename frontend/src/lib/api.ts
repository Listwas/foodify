import type {
  RecipeBrief, RecipeFull, RecipeCandidate, PlanEntry, GroceryList,
  DeckCard, Profile, Stance, Verdict, StockPhoto, HistoryEntry,
} from "./types"

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data.detail === "string") message = data.detail
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

const qs = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  const s = search.toString()
  return s ? `?${s}` : ""
}

export const apiRecipes = (
  params: {
    protein_type?: string
    source?: string
    q?: string
    hidden?: string
    shortlisted?: string
    nutrition?: string
    status?: string
  } = {}
) => api<RecipeBrief[]>(`/recipes${qs(params)}`)

export const apiProteinTypes = () => api<string[]>("/recipes/protein-types")

export const apiRecipe = (id: number | string) => api<RecipeFull>(`/recipes/${id}`)

export const apiGenerate = (body: { protein: string; time_minutes: number | null; mood: string }) =>
  api<RecipeCandidate>("/recipes/generate", { method: "POST", body })

export const apiSaveRecipe = (body: RecipeCandidate) =>
  api<RecipeFull>("/recipes", { method: "POST", body })

export const apiPlanRange = (start: string, end: string) =>
  api<PlanEntry[]>(`/meal-plan${qs({ start, end })}`)

export const apiAssign = (body: { date: string; meal_slot?: string; recipe_id: number }) =>
  api<PlanEntry>("/meal-plan", { method: "POST", body })

export const apiClearDay = (id: number) =>
  api<{ ok: boolean }>(`/meal-plan/${id}`, { method: "DELETE" })

export const apiGrocery = (id: number | string) =>
  api<GroceryList>(`/meal-plan/${id}/grocery`)

export const apiSetCheck = (mealPlanId: number, ingredientId: number, checked: boolean) =>
  api<{ ingredient_id: number; checked: boolean }>(
    `/meal-plan/${mealPlanId}/grocery/${ingredientId}`,
    { method: "PATCH", body: { checked } }
  )

export const apiMarkCooked = (mealPlanId: number, completed: boolean) =>
  api<PlanEntry>(`/meal-plan/${mealPlanId}/complete`, {
    method: "POST",
    body: { completed },
  })

// ---- taste engine ----

export const apiDeck = (limit = 20) => api<DeckCard[]>(`/deck${qs({ limit: String(limit) })}`)

export const apiRecommendations = (limit = 30) =>
  api<DeckCard[]>(`/recommendations${qs({ limit: String(limit) })}`)

export const apiShortlist = () => api<RecipeBrief[]>("/shortlist")

export const apiFeedback = (recipeId: number, verdict: Verdict | "clear") =>
  api<{ recipe_id: number; verdict: Verdict | null; shortlisted: boolean }>("/feedback", {
    method: "POST",
    body: { recipe_id: recipeId, verdict },
  })

export const apiUndoFeedback = () =>
  api<{ recipe_id: number; card: DeckCard | null }>("/feedback/undo", { method: "POST" })

export const apiHistory = (verdict?: Verdict) =>
  api<HistoryEntry[]>(`/feedback/history${qs({ verdict })}`)

export const apiPhotoSearch = (q: string, page = 1) =>
  api<StockPhoto[]>(`/photo-search${qs({ q, page: String(page) })}`)

export const apiSetImage = (
  recipeId: number,
  body: { image_url: string | null; image_is_stock?: boolean; image_attribution?: string | null }
) => api<RecipeFull>(`/recipes/${recipeId}/image`, { method: "PATCH", body })

export const apiSetShortlisted = (recipeId: number, shortlisted: boolean) =>
  api<{ recipe_id: number; shortlisted: boolean }>(`/shortlist/${recipeId}`, {
    method: "PATCH",
    body: { shortlisted },
  })

export const apiIngredientNames = (q: string) =>
  api<string[]>(`/ingredients${qs({ q: q || undefined })}`)

export const apiProfile = () => api<Profile>("/profile")

export const apiAddPref = (name: string, stance: Stance, hard_filter = false) =>
  api<{ id: number }>("/profile/ingredients", {
    method: "POST",
    body: { name, stance, hard_filter },
  })

export const apiRemovePref = (id: number) =>
  api<{ ok: boolean }>(`/profile/ingredients/${id}`, { method: "DELETE" })
