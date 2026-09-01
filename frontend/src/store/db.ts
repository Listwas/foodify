/**
 * Persistence for the app state document.
 *
 * IndexedDB rather than localStorage because custom recipe photos are stored as
 * data URLs at roughly 50 KB each, and localStorage's ~5 MB ceiling would run
 * out after a hundred of them. The whole state is one record: it's small enough
 * (hundreds of KB) that rewriting it wholesale is simpler and faster than
 * maintaining object stores per entity.
 */
import { emptyState, type AppState, STATE_VERSION } from "./types"

const DB_NAME = "foodify"
const STORE = "state"
const KEY = "app"

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE)
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return open().then(
        db =>
            new Promise<T>((resolve, reject) => {
                const request = run(db.transaction(STORE, mode).objectStore(STORE))
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
            })
    )
}

/** Fill in anything a state written by an older version is missing. */
export function migrate(raw: unknown): AppState {
    const base = emptyState()
    if (!raw || typeof raw !== "object") return base
    const state = { ...base, ...(raw as Partial<AppState>) }
    state.version = STATE_VERSION
    // an id counter that lags behind the data would hand out colliding ids
    const highest = state.customRecipes.reduce((max, r) => Math.max(max, r.id), 0)
    state.nextId = Math.max(state.nextId, highest + 1, base.nextId)
    state.nextPrefId = Math.max(
        state.nextPrefId,
        state.prefs.reduce((max, p) => Math.max(max, p.id), 0) + 1
    )
    state.nextSeq = Math.max(
        state.nextSeq ?? 1,
        Object.values(state.feedback).reduce((max, f) => Math.max(max, f.seq ?? 0), 0) + 1
    )
    state.nextExtraId = Math.max(
        state.nextExtraId ?? 1,
        state.extras.reduce((max, e) => Math.max(max, e.id), 0) + 1
    )
    return state
}

export async function load(): Promise<AppState> {
    try {
        return migrate(await tx("readonly", s => s.get(KEY)))
    } catch {
        // private browsing and some locked-down settings deny IndexedDB; the app
        // stays usable for the session rather than refusing to start
        return emptyState()
    }
}

export async function save(state: AppState): Promise<void> {
    try {
        await tx("readwrite", s => s.put(state, KEY) as IDBRequest<IDBValidKey>)
    } catch {
        /* see load() — a failed write must never break the UI */
    }
}
