/**
 * A small seedable generator, so deck assembly can be tested deterministically.
 *
 * `Math.random` cannot be seeded, and the deck deliberately samples rather than
 * taking a fixed top-N — without a seed the behavioural tests (protein caps, no
 * three cards of a kind in a row) would be flaky.
 */
export interface Rng {
    /** Uniform in [min, max). */
    uniform(min: number, max: number): number
    choice<T>(items: T[]): T
}

export function seeded(seed: number): Rng {
    // mulberry32 — tiny, and its distribution is far better than the app needs
    let a = seed >>> 0
    const next = () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return {
        uniform: (min, max) => min + next() * (max - min),
        choice: items => items[Math.floor(next() * items.length)],
    }
}

export const systemRng: Rng = {
    uniform: (min, max) => min + Math.random() * (max - min),
    choice: items => items[Math.floor(Math.random() * items.length)],
}
