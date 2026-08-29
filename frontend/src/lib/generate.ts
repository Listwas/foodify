/**
 * Recipe generation — the one thing that can't happen in the browser.
 *
 * It needs a Gemini API key, and a key shipped inside a public web app is a key
 * given away, so the call goes through a Cloudflare Pages Function that holds
 * it as a secret. Everything else in Foodify is static.
 *
 * When the function isn't deployed, or no key is configured, this fails with a
 * message saying so and the rest of the app carries on untouched.
 */
import type { RecipeCandidate } from "./types"

export const AI_OFF =
    "Recipe generation is off — this copy has no AI key configured. Everything else works."

export class GenerateUnavailable extends Error {
    constructor(message = AI_OFF) {
        super(message)
        this.name = "GenerateUnavailable"
    }
}

export interface GenerateRequest {
    protein: string
    time_minutes: number | null
    mood: string
}

export async function generateRecipe(body: GenerateRequest): Promise<RecipeCandidate> {
    let response: Response
    try {
        response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
    } catch {
        throw new GenerateUnavailable("Couldn't reach the generator — are you offline?")
    }

    // 404 means the function isn't deployed at all; 501 is it telling us the
    // key is missing. Either way the answer for the user is the same.
    if (response.status === 404 || response.status === 501) throw new GenerateUnavailable()

    if (!response.ok) {
        let message = `Generation failed (${response.status})`
        try {
            const data = await response.json()
            if (typeof data.error === "string") message = data.error
        } catch { /* keep the status-code message */ }
        throw new Error(message)
    }

    return response.json() as Promise<RecipeCandidate>
}
