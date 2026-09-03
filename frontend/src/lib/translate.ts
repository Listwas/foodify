/**
 * Translating the cookbook itself.
 *
 * The interface is translated from a dictionary, but the recipes are data:
 * 511 titles, 753 ingredient names and a method each, none of which can be
 * written out by hand. So they go through MyMemory, the same keyless service
 * the booker project uses, called straight from the browser because it sends
 * CORS headers and this app has no server to proxy through.
 *
 * The scarce resource is quota, not time: anonymous use gets a few thousand
 * characters a day. Two things follow from that, and they shape everything
 * here. Translations are cached **permanently**, in their own database, so a
 * string is ever paid for once. And they are cached **per string** rather than
 * per recipe, so the "Salt" in one recipe is the "Salt" in the other two
 * hundred — which is what makes an ingredient list nearly free after the first
 * few recipes.
 *
 * Nothing here is allowed to break the page. Every failure — quota gone,
 * offline, service down — resolves to the original English, which is a real
 * recipe that someone can still cook from.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import { knownFood } from "./foodwords"
import { useLang } from "./i18n"

const DB_NAME = "foodify-i18n"
const STORE = "translations"
/** MyMemory rejects much more than this in one `q`. */
const CHUNK_LIMIT = 450
/** Past this a method is long enough that nobody reads to the end anyway. */
const MAX_SOURCE = 2500
const MAX_PARALLEL = 3

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

async function readCache(keys: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>()
    try {
        const store = (await open()).transaction(STORE, "readonly").objectStore(STORE)
        await Promise.all(keys.map(k => new Promise<void>(resolve => {
            const req = store.get(k)
            req.onsuccess = () => {
                if (typeof req.result === "string") found.set(k, req.result)
                resolve()
            }
            req.onerror = () => resolve()
        })))
    } catch {
        // no IndexedDB (private mode); every lookup is simply a miss
    }
    return found
}

async function writeCache(entries: [string, string][]): Promise<void> {
    if (!entries.length) return
    try {
        const store = (await open()).transaction(STORE, "readwrite").objectStore(STORE)
        for (const [k, value] of entries) store.put(value, k)
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
/** How many requests are out right now, so the UI can say it's working. */
let inFlight = 0
const watchers = new Set<() => void>()

const announce = () => watchers.forEach(w => w())

function watchStatus(listener: () => void) {
    watchers.add(listener)
    return () => void watchers.delete(listener)
}

/**
 * Whether anything is being translated, and whether the day's allowance is
 * gone. Both worth saying out loud: text that is about to change should look
 * like it, and text that is staying English should say why.
 */
export function useTranslateStatus(): { busy: boolean; outOfQuota: boolean } {
    const snapshot = useSyncExternalStore(
        watchStatus,
        () => `${inFlight}|${exhausted}`,
        () => "0|false",
    )
    const [count, spent] = snapshot.split("|")
    return { busy: Number(count) > 0, outOfQuota: spent === "true" }
}

async function fetchOne(text: string, lang: string): Promise<string> {
    inFlight += 1
    announce()
    try {
        return await request(text, lang)
    } finally {
        inFlight -= 1
        announce()
    }
}

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
            announce()
            throw new Error("quota exhausted")
        }
        parts.push(out)
    }
    return parts.join(" ")
}

/** In flight right now, so two cards asking for the same title ask once. */
const pending = new Map<string, Promise<string>>()

/**
 * Translate a batch, returning what's known now and fetching what isn't.
 *
 * Resolves to a map from source text to translation. Anything that couldn't be
 * translated is simply absent, and callers fall back to the original.
 */
export async function translateBatch(
    texts: string[], lang: string,
): Promise<Map<string, string>> {
    const wanted = [...new Set(texts.map(s => s.trim()).filter(Boolean))]
    const out = new Map<string, string>()
    if (!wanted.length || lang === "en") return out

    // the house words first: better than the service on a bare ingredient
    // name, and they are most of what a recipe asks for
    const unknown: string[] = []
    for (const text of wanted) {
        const known = knownFood(text, lang)
        if (known) out.set(text, known)
        else unknown.push(text)
    }

    const cached = await readCache(unknown.map(s => key(s, lang)))
    const misses: string[] = []
    for (const text of unknown) {
        const hit = cached.get(key(text, lang))
        if (hit) out.set(text, hit)
        else misses.push(text)
    }
    if (!misses.length || exhausted) return out

    const fresh: [string, string][] = []
    const queue = [...misses]
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
        while (queue.length && !exhausted) {
            const text = queue.shift()!
            const k = key(text, lang)
            try {
                let inFlight = pending.get(k)
                if (!inFlight) {
                    inFlight = fetchOne(text, lang)
                    pending.set(k, inFlight)
                }
                const translated = await inFlight
                pending.delete(k)
                out.set(text, translated)
                fresh.push([k, translated])
            } catch {
                pending.delete(k)
                // leave it out; the caller shows the English
            }
        }
    })
    await Promise.all(workers)
    await writeCache(fresh)
    return out
}

/** Whether the day's free allowance has already run out. */
export const quotaSpent = () => exhausted

/**
 * Translate what this component is about to show.
 *
 * Returns a lookup that hands back the English until the Polish arrives, so
 * the page renders immediately and fills in rather than blocking on a network
 * call. In English it is the identity function and nothing is ever requested.
 */
export interface Translator {
    (text: string): string
    /** True while this batch is still out. Text on screen is still English. */
    pending: boolean
}

export function useTranslated(texts: (string | null | undefined)[]): Translator {
    const lang = useLang()
    const [map, setMap] = useState<Map<string, string>>(EMPTY)
    const [pending, setPending] = useState(false)

    const wanted = texts.filter((s): s is string => !!s && !!s.trim())
    // A stable dependency, since the array is new on every render. The
    // separator must be something no recipe can contain, or a two-word
    // ingredient would come back out of here as two ingredients.
    const signature = wanted.join(SEP)

    useEffect(() => {
        if (lang === "en" || !signature) {
            setMap(EMPTY)
            setPending(false)
            return
        }
        let alive = true
        setPending(true)
        void translateBatch(signature.split(SEP), lang).then(result => {
            if (!alive) return
            setMap(result)
            setPending(false)
        })
        return () => { alive = false }
    }, [lang, signature])

    const translator = ((text: string) => map.get(text.trim()) ?? text) as Translator
    translator.pending = pending
    return translator
}

const EMPTY: Map<string, string> = new Map()

/** Joins the batch into one dependency string; cannot occur in a recipe. */
const SEP = "\u0000"
