/**
 * Stock photo lookup for recipes that don't come with one.
 *
 * AI-generated recipes have no image, so we search Openverse — openly licensed
 * images, no API key, no signup, which keeps this inside the "nothing paid"
 * rule. Openverse serves CORS headers, so the browser calls it directly and no
 * proxy is involved.
 *
 * Results are always presented as *a photo of a similar dish*, never as a photo
 * of the actual recipe, and the CC attribution travels with them.
 */
import type { StockPhoto } from "./types"

const API = "https://api.openverse.org/v1/images/"
const PER_PAGE = 8

/** 'by' + '2.0' -> 'CC BY 2.0'; 'cc0' is already prefixed, so don't double it. */
function licenseLabel(code: string, version: string): string {
    const upper = (code || "").trim().toUpperCase()
    if (!upper) return ""
    const prefix = upper.startsWith("CC") ? "" : "CC "
    return `${prefix}${upper} ${version || ""}`.trim()
}

interface OpenverseResult {
    url?: string
    thumbnail?: string
    title?: string
    creator?: string
    license?: string
    license_version?: string
    attribution?: string
    foreign_landing_url?: string
}

function clean(item: OpenverseResult): StockPhoto | null {
    if (!item.url) return null
    return {
        url: item.url,
        thumbnail: item.thumbnail || item.url,
        title: (item.title || "").trim().slice(0, 200),
        creator: (item.creator || "").trim().slice(0, 120),
        license: licenseLabel(item.license || "", item.license_version || ""),
        attribution: (item.attribution || "").trim().slice(0, 400),
        source_url: item.foreign_landing_url || "",
    }
}

/**
 * Photos of a dish. Returns [] rather than throwing — a missing photo is a
 * cosmetic problem and must never fail whatever wanted one.
 */
export async function searchPhotos(query: string, page = 1): Promise<StockPhoto[]> {
    const q = (query || "").trim()
    if (!q) return []

    const params = new URLSearchParams({
        q,
        page: String(Math.max(1, page)),
        page_size: String(PER_PAGE),
        // photos of food, not diagrams or clip art
        category: "photograph",
        mature: "false",
    })

    try {
        const response = await fetch(`${API}?${params}`)
        if (!response.ok) return [] // includes the anonymous rate limit
        const data = await response.json()
        const results: OpenverseResult[] = data.results ?? []
        return results.map(clean).filter((p): p is StockPhoto => p !== null)
    } catch {
        // offline, or the request was blocked — degrade to "no photo"
        return []
    }
}
