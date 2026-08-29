/**
 * Turning scores into something worth looking at.
 *
 * Ranking is the easy half. The deck is the hard half: the highest-scoring
 * recipes are usually all the same kind of thing, and a swipe deck of twelve
 * pork dishes teaches the model nothing and reads as broken.
 */
import { daysBetween } from "../lib/dates"
import { systemRng, type Rng } from "./rng"
import {
    DISLIKE_RETURN_DAYS, Index, Taste, type EngineRecipe, type Signals,
} from "./taste"

export interface Scored {
    recipe: EngineRecipe
    score: number
    reasons: string[]
}

const proteinOf = (index: Index, recipeId: number) =>
    index.recipes.get(recipeId)?.protein_type ?? ""

/**
 * Sample without replacement, favouring higher weights.
 *
 * `cap` optionally limits how many picks may share a key (used to stop one
 * protein from taking over the deck even when it scores highest).
 */
export function weightedSample<T>(
    items: T[], weights: number[], k: number, rng: Rng,
    cap?: Map<string, number>, key?: (item: T) => string,
): T[] {
    let pool = items.map((item, i) => ({ item, weight: weights[i] }))
    const picked: T[] = []
    const used = new Map<string, number>()

    while (pool.length && picked.length < k) {
        let allowed = pool
        if (cap && key) {
            const room = pool.filter(p => (used.get(key(p.item)) ?? 0) < (cap.get(key(p.item)) ?? k))
            allowed = room.length ? room : pool // cap unsatisfiable — take what's left
        }
        const total = allowed.reduce((sum, p) => sum + p.weight, 0)
        let chosen: T
        if (total <= 0) {
            chosen = allowed[0].item
        } else {
            const r = rng.uniform(0, total)
            let upto = 0
            chosen = allowed[allowed.length - 1].item
            for (const p of allowed) {
                upto += p.weight
                if (upto >= r) { chosen = p.item; break }
            }
        }
        picked.push(chosen)
        if (key) used.set(key(chosen), (used.get(key(chosen)) ?? 0) + 1)
        pool = pool.filter(p => p.item !== chosen)
    }
    return picked
}

/** How unlike two recipes are, by ingredients and protein. */
function distance(index: Index, a: number, b: number): number {
    const ta = index.terms(a)
    const tb = index.terms(b)
    let shared = 0
    for (const t of ta) if (tb.has(t)) shared += 1
    const union = ta.size + tb.size - shared || 1
    let dist = 1.0 - shared / union
    const pa = proteinOf(index, a)
    // same protein counts as closer, so a seed deck alternates proteins
    // instead of serving eight beef dishes that happen to differ
    if (pa && pa === proteinOf(index, b)) dist *= 0.6
    return dist
}

/**
 * Cold start: with nothing learned yet, show cards that are as unlike each
 * other as possible so the first few swipes teach us the most.
 *
 * Rotating through proteins guarantees the spread — picking purely on
 * ingredient distance can hand back eight beef dishes that merely differ from
 * one another, which tells us nothing about what they want to eat.
 */
function diverseSeed(index: Index, candidates: number[], k: number, rng: Rng): number[] {
    if (!candidates.length) return []

    const byProtein = new Map<string, number[]>()
    for (const cid of candidates) {
        const p = proteinOf(index, cid)
        const bucket = byProtein.get(p)
        if (bucket) bucket.push(cid)
        else byProtein.set(p, [cid])
    }
    const order = [...byProtein.keys()].sort(
        (a, b) => byProtein.get(b)!.length - byProtein.get(a)!.length
    )

    const chosen: number[] = []
    while (chosen.length < k && [...byProtein.values()].some(v => v.length)) {
        for (const protein of order) {
            const pool = byProtein.get(protein)!
            if (!pool.length || chosen.length >= k) continue
            let pick: number
            if (!chosen.length) {
                pick = rng.choice(pool)
            } else {
                let best = -Infinity
                pick = pool[0]
                for (const cid of pool) {
                    const d = Math.min(...chosen.map(c => distance(index, cid, c)))
                    if (d > best) { best = d; pick = cid }
                }
            }
            chosen.push(pick)
            pool.splice(pool.indexOf(pick), 1)
        }
    }
    return chosen
}

/** Avoid three cards of the same protein in a row. */
function spreadProteins(index: Index, ordered: number[]): number[] {
    const out: number[] = []
    const pending = [...ordered]
    while (pending.length) {
        let pick = 0 // fall back to the next card if nothing else fits
        for (let i = 0; i < pending.length; i++) {
            const tail = out.slice(-2).map(o => proteinOf(index, o))
            const same = proteinOf(index, pending[i])
            if (!(tail.length === 2 && tail[0] === tail[1] && tail[1] === same)) {
                pick = i
                break
            }
        }
        out.push(pending.splice(pick, 1)[0])
    }
    return out
}

/** Every eligible recipe, best first. */
export function rank(
    index: Index, signals: Signals,
    { limit, exclude }: { limit?: number; exclude?: Set<number> } = {},
): Scored[] {
    const taste = new Taste(index, signals)
    const scored: Scored[] = []
    for (const rid of index.recipes.keys()) {
        if (exclude?.has(rid) || taste.isBlocked(rid)) continue
        const { score, reasons } = taste.score(rid)
        scored.push({ recipe: index.recipes.get(rid)!, score, reasons })
    }
    scored.sort((a, b) =>
        b.score - a.score || (a.recipe.title < b.recipe.title ? -1 : a.recipe.title > b.recipe.title ? 1 : 0)
    )
    return limit ? scored.slice(0, limit) : scored
}

/**
 * The swipe deck: mostly what we think they'll like, plus enough exploration
 * that the model keeps learning instead of narrowing.
 */
export function deck(
    index: Index, signals: Signals, limit = 20, rng: Rng = systemRng,
): Scored[] {
    const taste = new Taste(index, signals)

    // already judged — don't ask again, except that an old pass expires so the
    // dish gets another chance once tastes have had time to move
    const judged = new Set<number>()
    for (const [id, f] of Object.entries(signals.feedback)) {
        const age = daysBetween(f.decidedAt, taste.today)
        if (f.verdict === "dislike" && age >= DISLIKE_RETURN_DAYS) continue // eligible again
        judged.add(Number(id))
    }

    const candidates = [...index.recipes.keys()].filter(
        rid => !judged.has(rid) && !taste.isBlocked(rid)
    )
    if (!candidates.length) return []

    let chosen: number[]
    if (!taste.hasSignal) {
        chosen = diverseSeed(index, candidates, limit, rng)
    } else {
        const scored = candidates
            .map(rid => ({ score: taste.score(rid).score, rid }))
            .sort((a, b) => b.score - a.score)

        const nExploit = Math.max(1, Math.round(limit * 0.7))
        const nExplore = Math.max(0, limit - nExploit)

        // One protein can score higher across the board (right after a
        // chicken-heavy week, or simply because the library holds more of it),
        // so cap how much of the deck any single one may take. The cap covers
        // *both* bands — capping only the exploit half still let a big category
        // flood the deck through exploration.
        const available = new Set(scored.map(s => proteinOf(index, s.rid)))
        const cap = Math.max(2, Math.ceil(limit / Math.min(Math.max(available.size, 1), 4)))
        const used = new Map<string, number>()

        // exploit: sample from the top band so it isn't identical every visit.
        // The band is built per protein rather than as a flat top-N — a flat
        // window can be monolithic (the real library's top 32 was 31 pork), and
        // then the cap has nothing else to fall back on and gets abandoned.
        const perProtein = new Map<string, typeof scored>()
        for (const pair of scored) {
            const p = proteinOf(index, pair.rid)
            let bucket = perProtein.get(p)
            if (!bucket) perProtein.set(p, (bucket = []))
            if (bucket.length < cap * 2) bucket.push(pair) // headroom for the sampler
        }
        const band = [...perProtein.values()].flat().sort((a, b) => b.score - a.score)
        const lo = band.length ? Math.min(...band.map(b => b.score)) : 0
        const weights = band.map(b => b.score - lo + 0.05)
        const exploit = weightedSample(
            band.map(b => b.rid), weights, nExploit, rng,
            new Map([...available].map(p => [p, cap])), rid => proteinOf(index, rid),
        )
        for (const rid of exploit) {
            const p = proteinOf(index, rid)
            used.set(p, (used.get(p) ?? 0) + 1)
        }

        // explore: whatever we know least about, within whatever cap is left
        const picked = new Set(exploit)
        const rest = scored
            .map(s => s.rid)
            .filter(rid => !picked.has(rid))
            .sort((a, b) => taste.coverage(a) - taste.coverage(b))
        const explore: number[] = []
        for (const rid of rest) {
            if (explore.length >= nExplore) break
            const p = proteinOf(index, rid)
            if ((used.get(p) ?? 0) >= cap) continue
            explore.push(rid)
            used.set(p, (used.get(p) ?? 0) + 1)
        }

        chosen = []
        for (let i = 0; i < Math.max(exploit.length, explore.length); i++) {
            if (i < exploit.length) chosen.push(exploit[i])
            if (i < explore.length) chosen.push(explore[i])
        }
    }

    return spreadProteins(index, chosen).slice(0, limit).map(rid => {
        const { score, reasons } = taste.score(rid)
        return { recipe: index.recipes.get(rid)!, score, reasons }
    })
}
