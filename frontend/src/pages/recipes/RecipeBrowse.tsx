import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import type { RecipeFull } from "../../lib/types"
import { imageBox, macroLine, mealImage } from "../../lib/format"
import { useT } from "../../lib/i18n"
import { useToast } from "../../context/ToastContext"
import { setFeedback, clearFeedback, useAppState } from "../../store"
import { useLibrary, useProteinTypes } from "../../data/library"
import { useIndex, useSignals } from "../../data/taste"
import { rank } from "../../engine"
import Icon from "../../components/Icon"
import GenerateModal from "../../components/GenerateModal"
import RecipeFormModal from "../../components/RecipeFormModal"
import DayPickerModal from "../../components/DayPickerModal"
import s from "./RecipeBrowse.module.css"

const UNDO_SECONDS = 5
const PAGE = 48

// thresholds match what the app has always used; the label states the number so
// it's obvious what you're actually filtering on
const NUTRITION: { key: string; label: string; test: (r: RecipeFull) => boolean }[] = [
    { key: "light", label: "under 500 kcal", test: r => r.calories != null && r.calories < 500 },
    { key: "high_protein", label: "35g+ protein", test: r => r.protein_g != null && r.protein_g >= 35 },
    { key: "low_carb", label: "low carb ≤20g", test: r => r.carbs_g != null && r.carbs_g <= 20 },
    { key: "low_sugar", label: "low sugar ≤5g", test: r => r.sugar_g != null && r.sugar_g <= 5 },
]

const STATUS: { key: string; label: string; test: (r: RecipeFull) => boolean }[] = [
    { key: "liked", label: "liked", test: r => r.verdict === "like" },
    { key: "ai", label: "AI-made", test: r => r.source === "ai" },
    { key: "custom", label: "yours", test: r => r.source === "custom" },
    { key: "edited", label: "modified", test: r => !!r.edited || r.copied_from != null },
    { key: "hidden", label: "hidden", test: r => r.verdict === "hidden" },
]

function RecipeBrowse() {
    const [q, setQ] = useState("")
    const [protein, setProtein] = useState("")
    const [nutrition, setNutrition] = useState("")
    const [status, setStatus] = useState("")
    const [showFilters, setShowFilters] = useState(false)
    const [shown, setShown] = useState(PAGE)
    const [showGenerate, setShowGenerate] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [planning, setPlanning] = useState<{ id: number; title: string } | null>(null)
    // recipes mid-countdown: id -> when the undo window closes
    const [pending, setPending] = useState<Record<number, number>>({})
    const { showToast } = useToast()
    const t = useT()

    const library = useLibrary()
    const proteins = useProteinTypes()
    const index = useIndex()
    const signals = useSignals()
    useAppState() // re-render when a hide or undo lands

    const showHidden = status === "hidden"
    const activeCount = [protein, nutrition, status].filter(Boolean).length

    // Ordering by what the engine thinks of each recipe, rather than
    // alphabetically — an A-to-Z library opens on condiments and side salads,
    // which is a poor answer to "what should I cook".
    const scores = useMemo(
        () => new Map(rank(index, signals).map(r => [r.recipe.id, r.score])),
        [index, signals]
    )

    const hasSignal = Object.keys(signals.feedback).length > 0
        || signals.prefs.length > 0
        || Object.keys(signals.plan).length > 0

    /**
     * Before anything is known about you every recipe scores the same, and the
     * title tiebreak puts three sauces beginning with "A" on the opening
     * screen. Dealing round-robin across proteins gives a varied first
     * impression instead — the same trick the cold-start swipe deck uses. It
     * only reorders; nothing is filtered out.
     */
    const coldStartRank = useMemo(() => {
        if (hasSignal) return null
        const byProtein = new Map<string, number[]>()
        for (const r of [...library].sort((a, b) => a.title.localeCompare(b.title))) {
            const key = r.protein_type ?? ""
            const bucket = byProtein.get(key)
            if (bucket) bucket.push(r.id)
            else byProtein.set(key, [r.id])
        }
        const order = new Map<number, number>()
        const queues = [...byProtein.values()]
        let position = 0
        for (let round = 0; queues.some(q => q.length > round); round++) {
            for (const queue of queues) {
                if (round < queue.length) order.set(queue[round], position++)
            }
        }
        return order
    }, [library, hasSignal])

    const results = useMemo(() => {
        const needle = q.trim().toLowerCase()
        const nutritionTest = NUTRITION.find(n => n.key === nutrition)?.test
        const statusTest = STATUS.find(st => st.key === status)?.test

        return library
            .filter(r => {
                // hidden recipes stay out of the library until asked for by name
                if (showHidden ? r.verdict !== "hidden" : r.verdict === "hidden") return false
                if (needle && !r.title.toLowerCase().includes(needle)) return false
                if (protein && r.protein_type !== protein) return false
                if (nutritionTest && !nutritionTest(r)) return false
                if (statusTest && !statusTest(r)) return false
                return true
            })
            .sort((a, b) => {
                if (coldStartRank) {
                    return (coldStartRank.get(a.id) ?? Infinity) - (coldStartRank.get(b.id) ?? Infinity)
                }
                return (scores.get(b.id) ?? -Infinity) - (scores.get(a.id) ?? -Infinity)
                    || a.title.localeCompare(b.title)
            })
    }, [library, q, protein, nutrition, status, showHidden, scores, coldStartRank])

    useEffect(() => setShown(PAGE), [q, protein, nutrition, status])

    // top up as the last row comes into view rather than laying out all 500+
    // cards, which is what made the library crawl on a phone
    const sentinel = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const node = sentinel.current
        if (!node) return
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) setShown(n => n + PAGE)
        }, { rootMargin: "600px" })
        observer.observe(node)
        return () => observer.disconnect()
    }, [results.length])

    // One timer for all countdowns, and the updater only ever prunes expired
    // entries — bookkeeping inside a state updater is unsafe, since React may
    // run it more than once.
    useEffect(() => {
        if (Object.keys(pending).length === 0) return
        const timer = window.setInterval(() => {
            setPending(p => {
                const now = Date.now()
                const live = Object.fromEntries(
                    Object.entries(p).filter(([, deadline]) => deadline > now)
                )
                // a fresh object even when nothing expired, so the seconds tick
                return Object.keys(live).length === Object.keys(p).length ? { ...p } : live
            })
        }, 250)
        return () => window.clearInterval(timer)
    }, [pending])

    const hide = (id: number) => {
        // write immediately so the hide sticks even if they navigate away;
        // the countdown is the grace period to take it back
        setFeedback(id, "hidden")
        setPending(p => ({ ...p, [id]: Date.now() + UNDO_SECONDS * 1000 }))
    }

    const undo = (id: number) => {
        setPending(p => {
            const next = { ...p }
            delete next[id]
            return next
        })
        clearFeedback(id)
        showToast(t("Back in the library"))
    }

    const clearFilters = () => { setProtein(""); setNutrition(""); setStatus("") }

    return (
        <div className="page">
            <div className="page-head">
                <h1>{showHidden ? t("Hidden recipes") : t("Recipe library")}</h1>
                <div className={s.headActions}>
                    <button className="btn primary" onClick={() => setShowForm(true)}>
                        <Icon name="plus" size={16} />
                        {t("Add your own")}
                    </button>
                    <button className="btn" onClick={() => setShowGenerate(true)}>
                        <Icon name="sparkle" size={16} />
                        {t("Generate")}
                    </button>
                </div>
            </div>

            <div className={s.toolbar}>
                <div className={s.searchWrap}>
                    <Icon name="search" size={17} className={s.searchIcon} />
                    <input
                        className={`field ${s.search}`}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder={t("Search recipes…")}
                        aria-label={t("Search recipes…")}
                    />
                    {q && (
                        <button className={s.searchClear} onClick={() => setQ("")} aria-label={t("Clear all")}>
                            <Icon name="close" size={15} />
                        </button>
                    )}
                </div>
                <button
                    className={`btn ${activeCount ? s.filterOn : ""}`}
                    onClick={() => setShowFilters(f => !f)}
                    aria-expanded={showFilters}
                >
                    <Icon name="filter" size={15} />
                    {t("Filters")}
                    {activeCount > 0 && <span className={s.badge}>{activeCount}</span>}
                </button>
            </div>

            {showFilters && (
                <div className={s.filters}>
                    <Group label={t("Protein")} options={proteins.map(p => ({ key: p, label: p }))}
                        value={protein} onChange={setProtein} />
                    <Group label={t("Nutrition")} options={NUTRITION}
                        value={nutrition} onChange={setNutrition} />
                    <Group label={t("Status")} options={STATUS}
                        value={status} onChange={setStatus} />
                    {activeCount > 0 && (
                        <button className="btn ghost" onClick={clearFilters}>{t("Clear all")}</button>
                    )}
                </div>
            )}

            <p className={s.count}>
                {t("{n} recipes", { n: results.length })}
                {!showHidden && !q && !activeCount && hasSignal && ` · ${t("best matches first")}`}
            </p>

            {results.length === 0 && (
                <p className={s.empty}>
                    {showHidden ? t("Nothing hidden yet.") : t("Nothing matches. Try a different search.")}
                </p>
            )}

            <div className={s.grid}>
                {results.slice(0, shown).map(r => {
                    const deadline = pending[r.id]
                    const secondsLeft = deadline && Math.ceil((deadline - Date.now()) / 1000)
                    if (secondsLeft && secondsLeft > 0) {
                        return (
                            <div key={r.id} className={`${s.card} ${s.hiddenCard}`}>
                                <Icon name="ban" size={26} />
                                <div className={s.hiddenText}>
                                    <strong>{r.title}</strong> was hidden
                                </div>
                                <button className="btn" onClick={() => undo(r.id)}>
                                    <Icon name="undo" size={15} />
                                    Undo ({secondsLeft})
                                </button>
                            </div>
                        )
                    }
                    const img = mealImage(r.image_url, "card")
                    return (
                        <div key={r.id} className={s.card}>
                            <Link to={`/recipe/${r.id}`} className={s.cardLink}>
                                {img ? (
                                    <img
                                        className={`${s.img} meal-img`}
                                        src={img}
                                        width={imageBox("card")}
                                        height={imageBox("card")}
                                        alt=""
                                        loading="lazy"
                                        onLoad={e => e.currentTarget.setAttribute("data-loaded", "true")}
                                    />
                                ) : (
                                    <div className={`${s.img} ${s.imgPlaceholder}`}>
                                        <Icon name={r.source === "ai" ? "sparkle" : "plate"} size={28} />
                                    </div>
                                )}
                                <div className={s.marks}>
                                    {r.verdict === "like" && (
                                        <span className={`${s.mark} ${s.liked}`}>
                                            <Icon name="heart" size={11} filled />
                                            Liked
                                        </span>
                                    )}
                                    {r.edited && (
                                        <span className={s.mark}>
                                            <Icon name="edit" size={11} />
                                            Edited
                                        </span>
                                    )}
                                    {r.copied_from != null && (
                                        <span className={s.mark}>
                                            <Icon name="plus" size={11} />
                                            Copy
                                        </span>
                                    )}
                                    {r.source === "custom" && r.copied_from == null && (
                                        <span className={s.mark}>
                                            <Icon name="edit" size={11} />
                                            Yours
                                        </span>
                                    )}
                                </div>
                                <div className={s.cardBody}>
                                    <div className={s.cardTitle}>{r.title}</div>
                                    <div className={s.cardMeta}>
                                        {t(r.protein_type ?? "")}
                                        {r.prep_time_minutes != null && <> · {r.prep_time_minutes} {t("min")}</>}
                                    </div>
                                    {macroLine(r) && <div className="macros">{macroLine(r)}</div>}
                                </div>
                            </Link>
                            <div className={s.cardActions}>
                                {showHidden ? (
                                    <button
                                        className={s.cardBtn}
                                        onClick={() => { clearFeedback(r.id); showToast(t("Unhidden")) }}
                                        data-tip={t("Put it back in the library")}
                                        data-tip-below
                                    >
                                        <Icon name="undo" size={15} />
                                        Unhide
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className={`${s.cardBtn} ${s.iconOnly} ${r.verdict === "like" ? s.likeOn : ""}`}
                                            onClick={() => {
                                                if (r.verdict === "like") {
                                                    clearFeedback(r.id)
                                                    showToast(t("Removed from your likes"))
                                                } else {
                                                    setFeedback(r.id, "like")
                                                    showToast(t("Liked"))
                                                }
                                            }}
                                            aria-pressed={r.verdict === "like"}
                                            aria-label={r.verdict === "like" ? t("Remove your like") : t("Like this")}
                                            data-tip={r.verdict === "like" ? t("Remove your like") : t("Like this")}
                                            data-tip-below
                                        >
                                            <Icon name="heart" size={15} filled={r.verdict === "like"} />
                                        </button>
                                        <button
                                            className={`${s.cardBtn} ${s.planBtn}`}
                                            onClick={() => setPlanning({ id: r.id, title: r.title })}
                                            // the visible label steps aside on a narrow card, so
                                            // the accessible name can't depend on it
                                            aria-label={t("Add to a day on your plan")}
                                            data-tip={t("Add to a day on your plan")}
                                            data-tip-below
                                        >
                                            <Icon name="plus" size={15} />
                                            <span className={s.btnLabel}>{t("Plan it")}</span>
                                        </button>
                                        <button
                                            className={`${s.cardBtn} ${s.iconOnly}`}
                                            onClick={() => hide(r.id)}
                                            aria-label={t("Never show me this")}
                                            data-tip={t("Never show me this")}
                                            data-tip-below
                                        >
                                            <Icon name="ban" size={15} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {shown < results.length && <div ref={sentinel} className={s.sentinel} />}

            {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} />}
            {showForm && <RecipeFormModal onClose={() => setShowForm(false)} />}
            {planning && (
                <DayPickerModal
                    recipeId={planning.id}
                    recipeTitle={planning.title}
                    onClose={() => setPlanning(null)}
                />
            )}
        </div>
    )
}

function Group({ label, options, value, onChange }: {
    label: string
    options: { key: string; label: string }[]
    value: string
    onChange: (next: string) => void
}) {
    // the option labels are module constants, so they are translated here
    // rather than where they are declared
    const t = useT()
    return (
        <div className={s.group}>
            <span className={s.groupLabel}>{label}</span>
            <div className={s.chips}>
                {options.map(o => (
                    <button
                        key={o.key}
                        className={`${s.chip} ${value === o.key ? s.chipActive : ""}`}
                        onClick={() => onChange(value === o.key ? "" : o.key)}
                    >
                        {t(o.label)}
                    </button>
                ))}
            </div>
        </div>
    )
}

export default RecipeBrowse
