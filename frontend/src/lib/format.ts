import type { RecipeBrief } from "./types"

const g = (v: number | null) => (v == null ? "?" : String(Math.round(v)))

export function macroLine(r: RecipeBrief): string | null {
  if (r.calories == null) return null
  return `${r.calories} kcal · P ${g(r.protein_g)}g · C ${g(r.carbs_g)}g · S ${g(r.sugar_g)}g`
}

/**
 * TheMealDB images are square. The bare URL is ~341px; the suffixed variants
 * are /preview 150², /medium 350², /large 500². Ask for the size that matches
 * the box it's rendered in — /preview upscaled into a hero is a blurry mess.
 */
export type ImageSize = "thumb" | "card" | "hero"

const SUFFIX: Record<ImageSize, string> = {
  thumb: "/preview", // 150² — month chips
  card: "/medium",   // 350² — grid cards
  hero: "/large",    // 500² — day hero, swipe cards
}

/**
 * The size suffixes are a TheMealDB convention. Uploaded photos (data: URLs)
 * and stock photos from Openverse must be passed through untouched — appending
 * "/large" to those would just break the URL.
 */
export const mealImage = (url: string | null, size: ImageSize = "card") => {
  if (!url) return null
  return url.includes("themealdb.com") ? `${url}${SUFFIX[size]}` : url
}

/** Intrinsic pixel size, so the browser reserves the right box before load. */
export const imageBox = (size: ImageSize) =>
  ({ thumb: 150, card: 350, hero: 500 })[size]

export const ingredientLabel = (i: { name: string; quantity: string; unit: string }) =>
  [i.quantity, i.unit, i.name].filter(Boolean).join(" ")
