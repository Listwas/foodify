import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFeedback, apiProteinTypes, apiRecipes } from "../../lib/api"
import { imageBox, macroLine, mealImage } from "../../lib/format"
import { useToast } from "../../context/ToastContext"
import GenerateModal from "../../components/GenerateModal"
import DayPickerModal from "../../components/DayPickerModal"
import s from "./RecipeBrowse.module.css"

const UNDO_SECONDS = 5

// thresholds match the backend; the label states the number so it's obvious
// what you're actually filtering on
const NUTRITION = [
    { key: "light", label: "under 500 kcal" },
    { key: "high_protein", label: "35g+ protein" },
    { key: "low_carb", label: "low carb ≤20g" },
    { key: "low_sugar", label: "low sugar ≤5g" },
]

const STATUS = [
    { key: "liked", label: "♥ liked" },
    { key: "ai", label: "✨ AI-made" },
    { key: "custom", label: "custom" },
    { key: "hidden", label: "🚫 hidden" },
]

function RecipeBrowse() {
    const [q, setQ] = useState("")
    const [protein, setProtein] = useState("")
    const [nutrition, setNutrition] = useState("")
    const [status, setStatus] = useState("")
    const [showGenerate, setShowGenerate] = useState(false)
    const [planning, setPlanning] = useState<{ id: number; title: string } | null>(null)
    const showHidden = status === "hidden"
    // recipes mid-countdown: id -> seconds left
    const [pending, setPending] = useState<Record<number, number>>({})
    const timers = useRef<Record<number, number>>({})
    const { showToast } = useToast()
    const queryClient = useQueryClient()

    const { data: recipes, isLoading } = useQuery({
        queryKey: ["recipes", q, protein, nutrition, status],
        queryFn: () =>
            apiRecipes({
                q: q || undefined,
                protein_type: protein || undefined,
                nutrition: nutrition || undefined,
                status: status || undefined,
            }),
        placeholderData: keepPreviousData,
    })
    const { data: proteins } = useQuery({ queryKey: ["protein-types"], queryFn: apiProteinTypes })

    useEffect(() => {
        const saved = timers.current
        return () => Object.values(saved).forEach(t => window.clearInterval(t))
    }, [])

    const settle = (id: number) => {
        window.clearInterval(timers.current[id])
        delete timers.current[id]
        setPending(p => {
            const next = { ...p }
            delete next[id]
            return next
        })
    }

    const refreshTaste = () => {
        queryClient.invalidateQueries({ queryKey: ["recipes"] })
        queryClient.invalidateQueries({ queryKey: ["recommendations"] })
        queryClient.invalidateQueries({ queryKey: ["deck"] })
        queryClient.invalidateQueries({ queryKey: ["profile"] })
    }

    const hide = async (id: number) => {
        // write immediately so the hide sticks even if they navigate away;
        // the countdown is the grace period to take it back
        try {
            await apiFeedback(id, "hidden")
        } catch (e) {
            showToast((e as Error).message, "error")
            return
        }
        setPending(p => ({ ...p, [id]: UNDO_SECONDS }))
        timers.current[id] = window.setInterval(() => {
            setPending(p => {
                const left = (p[id] ?? 1) - 1
                if (left <= 0) {
                    window.clearInterval(timers.current[id])
                    delete timers.current[id]
                    const next = { ...p }
                    delete next[id]
                    refreshTaste()
                    return next
                }
                return { ...p, [id]: left }
            })
        }, 1000)
    }

    const undo = async (id: number) => {
        settle(id)
        try {
            await apiFeedback(id, "clear")
            refreshTaste()
            showToast("Back in the library")
        } catch (e) {
            showToast((e as Error).message, "error")
        }
    }

    const unhide = async (id: number) => {
        try {
            await apiFeedback(id, "clear")
            refreshTaste()
            showToast("Unhidden")
        } catch (e) {
            showToast((e as Error).message, "error")
        }
    }

    return (
        <div className="page">
            <div className={s.header}>
                <h1>{showHidden ? "Hidden recipes" : "Recipe library"}</h1>
                <button className="btn primary" onClick={() => setShowGenerate(true)}>
                    ✨ Generate new
                </button>
            </div>

            <div className={s.filters}>
                <input
                    className={`field ${s.search}`}
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search recipes…"
                    aria-label="search recipes"
                />
                {(protein || nutrition || status) && (
                    <button
                        className={s.clearAll}
                        onClick={() => { setProtein(""); setNutrition(""); setStatus("") }}
                    >
                        clear filters
                    </button>
                )}

                <div className={s.filterGroup}>
                    <span className={s.groupLabel}>Protein</span>
                    <div className={s.chips}>
                        {(proteins ?? []).map(p => (
                            <button
                                key={p}
                                className={`${s.chipBtn} ${protein === p ? s.chipActive : ""}`}
                                onClick={() => setProtein(protein === p ? "" : p)}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={s.filterGroup}>
                    <span className={s.groupLabel}>Nutrition</span>
                    <div className={s.chips}>
                        {NUTRITION.map(n => (
                            <button
                                key={n.key}
                                className={`${s.chipBtn} ${nutrition === n.key ? s.chipActive : ""}`}
                                onClick={() => setNutrition(nutrition === n.key ? "" : n.key)}
                            >
                                {n.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={s.filterGroup}>
                    <span className={s.groupLabel}>Status</span>
                    <div className={s.chips}>
                        {STATUS.map(st => (
                            <button
                                key={st.key}
                                className={`${s.chipBtn} ${status === st.key ? s.chipActive : ""}`}
                                onClick={() => setStatus(status === st.key ? "" : st.key)}
                            >
                                {st.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {recipes && recipes.length === 0 && !isLoading && (
                <p className={s.emptyNote}>
                    {showHidden ? "Nothing hidden yet." : "Nothing matches — try a different search."}
                </p>
            )}

            <div className={s.grid}>
                {(recipes ?? []).map(r => {
                    const secondsLeft = pending[r.id]
                    if (secondsLeft !== undefined) {
                        return (
                            <div key={r.id} className={`${s.card} ${s.hiddenCard}`}>
                                <div className={s.hiddenInner}>
                                    <div className={s.hiddenIcon}>🚫</div>
                                    <div className={s.hiddenText}>
                                        <strong>{r.title}</strong> was hidden
                                    </div>
                                    <button className="btn" onClick={() => undo(r.id)}>
                                        Undo ({secondsLeft})
                                    </button>
                                </div>
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
                                        {r.source === "ai" ? "✨" : "🍽"}
                                    </div>
                                )}
                                <div className={s.cardBody}>
                                    <div className={s.cardTitle}>
                                        {r.shortlisted && <span title="you liked this">♥ </span>}
                                        {r.title}
                                    </div>
                                    <div className={s.cardMeta}>
                                        {r.protein_type}
                                        {r.prep_time_minutes != null && <> · {r.prep_time_minutes} min</>}
                                    </div>
                                    {macroLine(r) && <div className="macros">{macroLine(r)}</div>}
                                </div>
                            </Link>
                            <div className={s.cardActions}>
                                {showHidden ? (
                                    <button
                                        className={s.cardBtn}
                                        onClick={() => unhide(r.id)}
                                        data-tip="Put it back in the library"
                                    >
                                        ↺ Unhide
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className={`${s.cardBtn} ${s.planBtn}`}
                                            onClick={() => setPlanning({ id: r.id, title: r.title })}
                                            data-tip="Add to a day on your plan"
                                        >
                                            + Plan this
                                        </button>
                                        <button
                                            className={s.cardBtn}
                                            onClick={() => hide(r.id)}
                                            aria-label="hide this recipe"
                                            data-tip="Never show me this"
                                        >
                                            🚫
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} />}
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

export default RecipeBrowse
