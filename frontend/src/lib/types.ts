export interface RecipeBrief {
  id: number
  title: string
  source: "seeded" | "ai" | "custom"
  protein_type: string | null
  prep_time_minutes: number | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  sugar_g: number | null
  image_url: string | null
  image_is_stock: boolean
  image_attribution: string | null
  verdict: Verdict | null
  shortlisted: boolean
}

/** An openly-licensed photo of a *similar* dish, for recipes with no image. */
export interface StockPhoto {
  url: string
  thumbnail: string
  title: string
  creator: string
  license: string
  attribution: string
  source_url: string
}

export interface HistoryEntry {
  recipe: RecipeBrief
  verdict: Verdict
  decided_at: string
}

export type Verdict = "like" | "dislike" | "hidden"

/** A deck card: a recipe plus why the engine picked it. */
export interface DeckCard extends RecipeBrief {
  score: number
  reasons: string[]
}

export interface IngredientT {
  id: number
  name: string
  quantity: string
  unit: string
}

export interface RecipeFull extends RecipeBrief {
  instructions: string
  ingredients: IngredientT[]
}

// what POST /recipes/generate returns and POST /recipes accepts
export interface RecipeCandidate {
  title: string
  source: "seeded" | "ai" | "custom"
  protein_type: string | null
  prep_time_minutes: number | null
  instructions: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  sugar_g: number | null
  image_url: string | null
  image_is_stock?: boolean
  image_attribution?: string | null
  ingredients: { name: string; quantity: string; unit: string }[]
}

export interface PlanEntry {
  id: number
  date: string
  meal_slot: string
  status: string
  recipe: RecipeBrief
}

export interface GroceryItem {
  ingredient_id: number
  name: string
  quantity: string
  unit: string
  checked: boolean
}

export interface GroceryList {
  meal_plan_id: number
  date: string
  meal_slot: string
  recipe_id: number
  recipe_title: string
  items: GroceryItem[]
}

export type Stance = "like" | "avoid"

export interface IngredientPref {
  id: number
  name: string
  stance: Stance
  hard_filter: boolean
}

export interface TasteSummary {
  likes: { name: string; affinity: number }[]
  dislikes: { name: string; affinity: number }[]
  counts: {
    liked: number
    passed: number
    hidden: number
    planned: number
    cooked: number
  }
  protein_share: Record<string, number>
  has_signal: boolean
}

export interface Profile {
  ingredients: IngredientPref[]
  taste: TasteSummary
}
