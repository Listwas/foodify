/**
 * The one server-side thing Foodify has left.
 *
 * Everything else — the recipe library, the taste engine, the plan — runs in
 * the browser. Recipe generation can't, because it needs a Gemini API key, and
 * a key shipped inside a public web app is a key given away. So it lives here
 * as a Cloudflare Pages Function with the key held as a secret:
 *
 *     npx wrangler pages secret put GEMINI_API_KEY
 *
 * Without that secret this returns 501 and the app reports AI as off; nothing
 * else is affected.
 */

interface Env {
    GEMINI_API_KEY?: string
    FOODIFY_MODEL?: string
    FOODIFY_FALLBACK_MODELS?: string
}

const DEFAULT_MODEL = "gemini-3-flash-preview"
// Each model carries its own free-tier allowance, and they go temporarily
// overloaded (503) independently of one another, so walking a chain buys both
// more headroom and more resilience than any single model can. Verified against
// a live key on 2026-08-31: all five answer structured-output requests.
const DEFAULT_FALLBACKS = [
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
].join(",")

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"

const RECIPE_SCHEMA = {
    type: "OBJECT",
    properties: {
        title: { type: "STRING" },
        protein_type: { type: "STRING" },
        prep_time_minutes: { type: "INTEGER" },
        instructions: { type: "STRING" },
        ingredients: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    quantity: { type: "STRING" },
                    unit: { type: "STRING" },
                },
                required: ["name", "quantity", "unit"],
            },
        },
        calories: { type: "INTEGER" },
        protein_g: { type: "NUMBER" },
        carbs_g: { type: "NUMBER" },
        sugar_g: { type: "NUMBER" },
    },
    required: [
        "title", "protein_type", "prep_time_minutes", "instructions",
        "ingredients", "calories", "protein_g", "carbs_g", "sugar_g",
    ],
}

function buildPrompt(protein: string, timeMinutes: number | null, mood: string): string {
    const constraints: string[] = []
    if (protein) constraints.push(`main protein: ${protein}`)
    if (timeMinutes) constraints.push(`total prep + cooking time under ${timeMinutes} minutes`)
    if (mood) constraints.push(`mood / craving: ${mood}`)
    const constraintText = constraints.join("; ") || "anything goes, pick something interesting"

    return (
        "Propose one realistic dinner recipe for a home cook, for a household " +
        `meal-planning app. Constraints: ${constraintText}.\n\n` +
        "Rules:\n" +
        "- A real, cookable dish with common supermarket ingredients, 4 servings.\n" +
        "- instructions: numbered steps separated by newlines, plain text.\n" +
        "- ingredients: quantity is the number/amount (e.g. '400', '2'), unit is " +
        "the measure (e.g. 'g', 'tbsp', 'cloves'); leave unit empty for countable " +
        "items like '2 onions'.\n" +
        "- protein_type: single lowercase word (chicken, beef, pork, fish, " +
        "vegetarian, ...).\n" +
        "- prep_time_minutes: honest total time estimate.\n" +
        "- calories/protein_g/carbs_g/sugar_g: per-serving estimates."
    )
}

/**
 * Put each numbered step on its own line.
 *
 * The model is asked for newline-separated steps but often returns
 * "1. Do this. 2. Do that." on a single line, which renders as a wall of text.
 * Splitting on the numbering is more reliable than trusting the format.
 */
function splitSteps(text: string): string {
    const trimmed = (text || "").trim()
    if ((trimmed.match(/\n/g) ?? []).length >= 2) return trimmed
    const parts = trimmed.split(/\s*(?=\b\d{1,2}[.)]\s)/).map(p => p.trim()).filter(Boolean)
    return parts.length > 1 ? parts.join("\n") : trimmed
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    })

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.GEMINI_API_KEY) {
        return json({ error: "No AI key is configured for this deployment." }, 501)
    }

    let body: { protein?: string; time_minutes?: number | null; mood?: string }
    try {
        body = await request.json()
    } catch {
        return json({ error: "Malformed request." }, 400)
    }

    const prompt = buildPrompt(
        (body.protein ?? "").slice(0, 40),
        body.time_minutes ?? null,
        (body.mood ?? "").slice(0, 300),
    )

    const models = [
        env.FOODIFY_MODEL || DEFAULT_MODEL,
        ...(env.FOODIFY_FALLBACK_MODELS ?? DEFAULT_FALLBACKS)
            .split(",").map(m => m.trim()).filter(Boolean),
    ]

    let lastStatus = 502
    for (const model of models) {
        const response = await fetch(
            `${ENDPOINT}/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: RECIPE_SCHEMA,
                    },
                }),
            },
        )

        if (response.status === 429) {
            lastStatus = 429
            continue // this model's free allowance is spent; try the next
        }
        if (!response.ok) {
            lastStatus = response.status
            continue
        }

        const data = await response.json() as {
            candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
            lastStatus = 502
            continue
        }

        try {
            const recipe = JSON.parse(text)
            return json({
                ...recipe,
                source: "ai",
                instructions: splitSteps(recipe.instructions),
                image_url: null,
                image_is_stock: false,
                image_attribution: null,
            })
        } catch {
            lastStatus = 502
        }
    }

    return json(
        {
            error: lastStatus === 429
                ? "The free daily allowance is used up — try again tomorrow."
                : "The recipe generator didn't answer. Try again in a moment.",
        },
        lastStatus === 429 ? 429 : 502,
    )
}
