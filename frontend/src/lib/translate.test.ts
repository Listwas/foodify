import { describe, expect, it } from "vitest"
import { splitChunks } from "./translate"

/*
 * MyMemory rejects a long `q`, so a method has to be sent in pieces. Cutting
 * mid-clause comes back as nonsense — the translator needs a whole thought to
 * get the grammar right — so the split follows sentences and only falls back
 * to a hard wrap when one sentence is longer than a whole request.
 */
describe("splitChunks", () => {
    it("keeps every chunk inside the request limit", () => {
        const text = "Sentence one is here. ".repeat(40).trim()
        const chunks = splitChunks(text, 450)
        expect(chunks.length).toBeGreaterThan(1)
        expect(chunks.every(c => c.length <= 450)).toBe(true)
    })

    it("loses nothing on the way through", () => {
        const text = "Chop the onion. Fry it gently. Add the stock and simmer."
        expect(splitChunks(text, 450).join(" ")).toBe(text)
    })

    it("splits on sentence ends rather than mid-clause", () => {
        const text = `${"a".repeat(200)}. ${"b".repeat(200)}. ${"c".repeat(200)}.`
        const chunks = splitChunks(text, 450)
        // the first two sentences fit together, the third starts a new chunk
        expect(chunks).toHaveLength(2)
        expect(chunks[0].endsWith(".")).toBe(true)
    })

    it("hard-wraps a sentence longer than a whole request", () => {
        const chunks = splitChunks("word ".repeat(200).trim(), 450)
        expect(chunks.length).toBeGreaterThan(1)
        expect(chunks.every(c => c.length <= 450)).toBe(true)
    })

    it("copes with the newline-joined paragraphs recipes actually use", () => {
        const text = "STEP 1\r\n\r\nHeat the oil.\r\n\r\nSTEP 2\r\n\r\nAdd the rice."
        const chunks = splitChunks(text, 450)
        expect(chunks.every(c => !c.includes("\r"))).toBe(true)
        expect(chunks.join(" ")).toContain("Add the rice")
    })

    it("has nothing to say about nothing", () => {
        expect(splitChunks("")).toEqual([])
        expect(splitChunks("   ")).toEqual([])
    })
})
