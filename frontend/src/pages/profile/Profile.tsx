import { useMemo, useRef, useState } from "react"
import type { Stance } from "../../lib/types"
import { useToast } from "../../context/ToastContext"
import {
    addPref, exportState, importState, removePref, resetState, useAppState,
} from "../../store"
import { useIndex, useSignals } from "../../data/taste"
import { tasteSummary } from "../../engine"
import Icon from "../../components/Icon"
import s from "./Profile.module.css"

function IngredientInput({ stance, names }: { stance: Stance; names: string[] }) {
    const [value, setValue] = useState("")
    const [hardFilter, setHardFilter] = useState(false)

    const suggestions = useMemo(() => {
        const needle = value.trim().toLowerCase()
        if (!needle) return []
        return names.filter(n => n.includes(needle)).slice(0, 10)
    }, [value, names])

    const listId = `ing-${stance}`

    return (
        <form
            className={s.addRow}
            onSubmit={e => {
                e.preventDefault()
                if (!value.trim()) return
                addPref(value.trim(), stance, hardFilter)
                setValue("")
                setHardFilter(false)
            }}
        >
            <input
                className="field"
                value={value}
                list={listId}
                onChange={e => setValue(e.target.value)}
                placeholder={stance === "like" ? "e.g. garlic, feta…" : "e.g. olives, cilantro…"}
                aria-label={stance === "like" ? "ingredient you like" : "ingredient to avoid"}
            />
            <datalist id={listId}>
                {suggestions.map(n => <option key={n} value={n} />)}
            </datalist>
            {stance === "avoid" && (
                <label className={s.hardToggle} title="never show recipes containing this">
                    <input
                        type="checkbox"
                        checked={hardFilter}
                        onChange={e => setHardFilter(e.target.checked)}
                    />
                    allergy
                </label>
            )}
            <button className="btn" type="submit" disabled={!value.trim()}>Add</button>
        </form>
    )
}

function Settings() {
    const { showToast } = useToast()
    const fileInput = useRef<HTMLInputElement>(null)
    const [confirmWipe, setConfirmWipe] = useState(false)
    const [theme, setTheme] = useState(
        () => document.documentElement.getAttribute("data-theme") ?? "dark"
    )

    const toggleTheme = () => {
        const next = theme === "light" ? "dark" : "light"
        document.documentElement.setAttribute("data-theme", next)
        localStorage.setItem("theme", next)
        setTheme(next)
    }

    const download = () => {
        const blob = new Blob([exportState()], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `foodify-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const upload = async (file: File | undefined) => {
        if (!file) return
        try {
            importState(await file.text())
            showToast("Backup restored")
        } catch {
            showToast("That file isn't a Foodify backup", "error")
        } finally {
            if (fileInput.current) fileInput.current.value = ""
        }
    }

    return (
        <section className={s.settings}>
            <h2>Settings</h2>
            <div className={s.settingRow}>
                <div>
                    <div className={s.settingName}>Appearance</div>
                    <div className={s.settingNote}>Currently {theme}.</div>
                </div>
                <button className="btn" onClick={toggleTheme}>
                    <Icon name="theme" size={16} />
                    Switch to {theme === "light" ? "dark" : "light"}
                </button>
            </div>

            <div className={s.settingRow}>
                <div>
                    <div className={s.settingName}>Your data</div>
                    <div className={s.settingNote}>
                        Everything lives in this browser. Nothing is uploaded anywhere. A backup
                        file is also the only way to move your plan to another device.
                    </div>
                </div>
                <div className={s.settingActions}>
                    <button className="btn" onClick={download}>
                        <Icon name="download" size={16} />
                        Export
                    </button>
                    <button className="btn" onClick={() => fileInput.current?.click()}>
                        <Icon name="upload" size={16} />
                        Import
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json"
                        hidden
                        onChange={e => void upload(e.target.files?.[0])}
                    />
                </div>
            </div>

            {/* Last, behind a confirmation, and next door to Export, because
                the backup is the only thing standing between this button and
                a plan that took months to build. */}
            <div className={`${s.settingRow} ${s.danger}`}>
                <div>
                    <div className={s.settingName}>Wipe all data</div>
                    <div className={s.settingNote}>
                        Clears your plan, every swipe, your ingredient preferences, groceries
                        and any recipe you wrote. There is no undo and no copy on a server.
                    </div>
                </div>
                <div className={s.settingActions}>
                    {confirmWipe ? (
                        <>
                            <button className="btn" onClick={download}>
                                <Icon name="download" size={16} />
                                Back up first
                            </button>
                            <button
                                className="btn danger"
                                onClick={() => {
                                    resetState()
                                    localStorage.removeItem("planner-mode")
                                    setConfirmWipe(false)
                                    showToast("Everything wiped. Starting fresh.")
                                }}
                            >
                                Yes, wipe everything
                            </button>
                            <button className="btn ghost" onClick={() => setConfirmWipe(false)}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            className={`btn ${s.wipeBtn}`}
                            onClick={() => setConfirmWipe(true)}
                        >
                            <Icon name="ban" size={16} />
                            Wipe all data
                        </button>
                    )}
                </div>
            </div>

            <p className={s.credit}>
                Recipe data from{" "}
                <a href="https://www.themealdb.com" target="_blank" rel="noopener noreferrer">
                    TheMealDB
                </a>.
            </p>
        </section>
    )
}

function Profile() {
    const state = useAppState()
    const index = useIndex()
    const signals = useSignals()

    const taste = useMemo(() => tasteSummary(index, signals), [index, signals])
    // every ingredient the library knows about, commonest first — the type-ahead
    // for the preference fields
    const names = useMemo(
        () => [...index.df.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
        [index]
    )

    const likes = state.prefs.filter(p => p.stance === "like")
    const avoids = state.prefs.filter(p => p.stance === "avoid")

    return (
        <div className="page">
            <h1>Your taste</h1>
            <p className={s.blurb}>
                Tell the app what you like and it'll weight suggestions accordingly, everywhere
                in the app and not just here.
            </p>

            <div className={s.columns}>
                <section className={s.panel}>
                    <h2><Icon name="heart" size={16} filled /> Ingredients you like</h2>
                    <IngredientInput stance="like" names={names} />
                    <div className={s.tags}>
                        {likes.length === 0 && <span className={s.none}>Nothing yet.</span>}
                        {likes.map(i => (
                            <span key={i.id} className={`${s.tag} ${s.tagLike}`}>
                                {i.name}
                                <button onClick={() => removePref(i.id)} aria-label={`remove ${i.name}`}>
                                    <Icon name="close" size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                </section>

                <section className={s.panel}>
                    <h2><Icon name="close" size={16} /> Ingredients to avoid</h2>
                    <IngredientInput stance="avoid" names={names} />
                    <div className={s.tags}>
                        {avoids.length === 0 && <span className={s.none}>Nothing yet.</span>}
                        {avoids.map(i => (
                            <span key={i.id} className={`${s.tag} ${s.tagAvoid}`}>
                                {i.name}
                                {i.hardFilter && <em title="never shown">allergy</em>}
                                <button onClick={() => removePref(i.id)} aria-label={`remove ${i.name}`}>
                                    <Icon name="close" size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                </section>
            </div>

            <section className={s.learned}>
                <h2>What the app has learned</h2>
                {!taste.has_signal ? (
                    <p className={s.none}>
                        Nothing yet. Swipe a few recipes in Discover and this fills in.
                    </p>
                ) : (
                    <>
                        <div className={s.stats}>
                            <span><b>{taste.counts.liked}</b> liked</span>
                            <span><b>{taste.counts.passed}</b> passed</span>
                            <span><b>{taste.counts.hidden}</b> hidden</span>
                            <span><b>{taste.counts.planned}</b> planned</span>
                            <span><b>{taste.counts.cooked}</b> cooked</span>
                        </div>
                        {taste.likes.length > 0 && (
                            <LearnedRow label="drawn to">
                                {taste.likes.map(l => (
                                    <span key={l.name} className={`${s.tag} ${s.tagLike}`}>{l.name}</span>
                                ))}
                            </LearnedRow>
                        )}
                        {taste.dislikes.length > 0 && (
                            <LearnedRow label="steering clear of">
                                {taste.dislikes.map(l => (
                                    <span key={l.name} className={`${s.tag} ${s.tagAvoid}`}>{l.name}</span>
                                ))}
                            </LearnedRow>
                        )}
                        {Object.keys(taste.protein_share).length > 0 && (
                            <LearnedRow label="recently">
                                {Object.entries(taste.protein_share).map(([p, share]) => (
                                    <span key={p} className={s.tag}>
                                        {p} {Math.round(share * 100)}%
                                    </span>
                                ))}
                            </LearnedRow>
                        )}
                    </>
                )}
            </section>

            <Settings />
        </div>
    )
}

function LearnedRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className={s.learnedRow}>
            <span className={s.learnedLabel}>{label}</span>
            <div className={s.learnedTags}>{children}</div>
        </div>
    )
}

export default Profile
