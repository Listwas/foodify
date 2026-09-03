/**
 * Translating the long texts, on request.
 *
 * Everything short — the interface, the categories, the ingredient names — is
 * translated from our own word lists, instantly and offline. This module is
 * only for the one thing those can't cover: the method, which is prose, runs
 * to a few thousand characters, and is different in every recipe.
 *
 * It is deliberately **not** automatic. A machine translation of a paragraph
 * is worth having when you want it and noise when you don't, so it happens on
 * a button press, the way booker translates a book description. That also
 * keeps the free daily allowance for the recipes somebody actually reads.
 *
 * MyMemory, keyless and CORS-open, called straight from the browser because
 * this app has no server to proxy through. Every failure resolves to the
 * original English, which is still a recipe someone can cook from.
 */
import { useCallback, useEffect, useState } from "react"
import { useLang } from "./i18n"

const DB_NAME = "foodify-i18n"
const STORE = "translations"
/** MyMemory rejects much more than this in one `q`. */
const CHUNK_LIMIT = 450
/** Past this a method is long enough that nobody reads to the end anyway. */
const MAX_SOURCE = 2500

let db: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
    if (db) return db
    db = new Promise((resolve, reject) => {
        // its own database, so the state store's version and migrations are
        // left completely alone
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE)
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
    return db
}

const key = (text: string, lang: string) => `${lang}|${text}`

async function readCache(k: string): Promise<string | null> {
    try {
        const store = (await open()).transaction(STORE, "readonly").objectStore(STORE)
        return await new Promise(resolve => {
            const req = store.get(k)
            req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null)
            req.onerror = () => resolve(null)
        })
    } catch {
        return null // no IndexedDB (private mode); every lookup is a miss
    }
}

async function writeCache(k: string, value: string): Promise<void> {
    try {
        const store = (await open()).transaction(STORE, "readwrite").objectStore(STORE)
        store.put(value, k)
    } catch { /* a cache that can't be written still works, just slower */ }
}

/**
 * Split on sentence ends, then pack up to the request limit.
 *
 * Sentences rather than characters because a method cut mid-clause comes back
 * as nonsense — the translator needs a whole thought to get the grammar right.
 */
export function splitChunks(text: string, limit = CHUNK_LIMIT): string[] {
    const pieces: string[] = []
    for (const sentence of text.replace(/\r/g, "").split(/(?<=[.!?])\s+/)) {
        let rest = sentence.trim()
        while (rest.length > limit) {
            const cut = rest.lastIndexOf(" ", limit)
            pieces.push(rest.slice(0, cut > 0 ? cut : limit))
            rest = rest.slice(cut > 0 ? cut : limit).trim()
        }
        if (rest) pieces.push(rest)
    }

    const chunks: string[] = []
    let current = ""
    for (const piece of pieces) {
        if (current && current.length + piece.length + 1 > limit) {
            chunks.push(current)
            current = piece
        } else {
            current = current ? `${current} ${piece}` : piece
        }
    }
    if (current) chunks.push(current)
    return chunks
}

/** Set once the service says we're done for the day, to stop asking. */
let exhausted = false

async function request(text: string, lang: string): Promise<string> {
    const parts: string[] = []
    for (const chunk of splitChunks(text.slice(0, MAX_SOURCE))) {
        const url = new URL("https://api.mymemory.translated.net/get")
        url.searchParams.set("q", chunk)
        url.searchParams.set("langpair", `en|${lang}`)

        const response = await fetch(url)
        if (!response.ok) throw new Error(`translate ${response.status}`)
        const body = await response.json()
        if (String(body?.responseStatus) !== "200") {
            throw new Error(String(body?.responseDetails ?? "translation failed"))
        }
        const out = String(body?.responseData?.translatedText ?? "")
        // a spent quota arrives as a perfectly good 200 with a shouted warning
        // in the field where the translation should be
        if (!out || out.toUpperCase().includes("MYMEMORY WARNING")) {
            exhausted = true
            throw new Error("quota exhausted")
        }
        parts.push(out)
    }
    return parts.join(" ")
}

/** In flight right now, so two views of one recipe ask once. */
const pending = new Map<string, Promise<string>>()

export async function translateText(text: string, lang: string): Promise<string> {
    const source = text.trim()
    if (!source || lang === "en") return text

    const k = key(source, lang)
    const cached = await readCache(k)
    if (cached) return cached
    if (exhausted) throw new Error("quota exhausted")

    let inFlight = pending.get(k)
    if (!inFlight) {
        inFlight = request(source, lang)
        pending.set(k, inFlight)
    }
    try {
        const translated = await inFlight
        void writeCache(k, translated)
        return translated
    } finally {
        pending.delete(k)
    }
}

export interface Translatable {
    /** The text to render right now. */
    shown: string
    /** Whether `shown` is the translation rather than the original. */
    isTranslated: boolean
    busy: boolean
    failed: boolean
    /** False in English, or when there is nothing to translate. */
    available: boolean
    toggle: () => void
}

/**
 * A long text that can be translated on request, and put back.
 *
 * Starts on the original every time. Translating is a thing the reader asks
 * for, so it is never the state they arrive in — but once a recipe has been
 * translated the answer is cached, and asking again is instant and free.
 */
export function useTranslatable(text: string | undefined): Translatable {
    const lang = useLang()
    const source = (text ?? "").trim()
    const [translated, setTranslated] = useState<string | null>(null)
    const [showing, setShowing] = useState(false)
    const [busy, setBusy] = useState(false)
    const [failed, setFailed] = useState(false)

    // a different recipe is a different text: drop everything
    useEffect(() => {
        setTranslated(null)
        setShowing(false)
        setBusy(false)
        setFailed(false)
    }, [source, lang])

    const toggle = useCallback(() => {
        if (showing) { setShowing(false); return }
        if (translated) { setShowing(true); return }
        setBusy(true)
        setFailed(false)
        translateText(source, lang).then(
            result => { setTranslated(result); setShowing(true); setBusy(false) },
            () => { setFailed(true); setBusy(false) },
        )
    }, [showing, translated, source, lang])

    return {
        shown: showing && translated ? translated : text ?? "",
        isTranslated: showing && !!translated,
        busy,
        failed,
        available: lang !== "en" && source.length > 0,
        toggle,
    }
}
