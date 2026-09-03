import { useMemo, useState } from "react"
import type { RecipeFull } from "../lib/types"
import { imageBox, macroLine, mealImage } from "../lib/format"
import { useT } from "../lib/i18n"
import { useToast } from "../context/ToastContext"
import { assign, useAppState } from "../store"
import { useProteinTypes, useRecipeMap } from "../data/library"
import { useIndex, useSignals } from "../data/taste"
import { rank } from "../engine"
import Icon from "./Icon"
import Modal from "./Modal"
import s from "./SuggestModal.module.css"

interface Props {
    date: string
    currentRecipeId?: number
    onGenerate: () => void
    onClose: () => void
}

const TIME_OPTIONS = [20, 30, 45, 60, 90]
/** how far down the ranking "surprise me" is willing to reach */
const TOP_BAND = 25

type Candidate = RecipeFull & { reasons: string[] }

function SuggestModal({ date, currentRecipeId, onGenerate, onClose }: Props) {
    const { showToast } = useToast()
    const t = useT()
    const state = useAppState()
    const recipes = useRecipeMap()
    const proteins = useProteinTypes()
    const index = useIndex()
    const signals = useSignals()

    const [protein, setProtein] = useState("")
    const [maxTime, setMaxTime] = useState("")
    const [candidate, setCandidate] = useState<Candidate | null>(null)
    const [seen, setSeen] = useState<Set<number>>(new Set())

    // ranked by the taste engine rather than plain random
    const ranked = useMemo(
        () => rank(index, signals).map(r => ({
            ...recipes.get(r.recipe.id)!,
            reasons: r.reasons,
        })),
        [index, signals, recipes]
    )

    const shortlist = useMemo(
        () => Object.entries(state.feedback)
            .filter(([, f]) => f.shortlisted && f.verdict === "like")
            .map(([id]) => recipes.get(Number(id)))
            .filter((r): r is RecipeFull => !!r),
        [state.feedback, recipes]
    )

    const pool = useMemo(() => {
        let list = ranked
        if (protein) list = list.filter(r => r.protein_type === protein)
        if (maxTime) {
            list = list.filter(
                r => r.prep_time_minutes != null && r.prep_time_minutes <= Number(maxTime)
            )
        }
        return list.filter(r => r.id !== currentRecipeId)
    }, [ranked, protein, maxTime, currentRecipeId])

    const pick = () => {
        if (pool.length === 0) {
            showToast(t("No recipes match those filters"), "error")
            return
        }
        let fresh = pool.filter(r => !seen.has(r.id) && r.id !== candidate?.id)
        let nextSeen = seen
        if (fresh.length === 0) {
            nextSeen = new Set()
            fresh = pool.filter(r => r.id !== candidate?.id)
            if (fresh.length === 0) fresh = pool
        }
        // favour the top of the ranking, but keep it surprising
        const band = fresh.slice(0, TOP_BAND)
        const next = band[Math.floor(Math.random() * band.length)]
        setCandidate(next)
        setSeen(new Set(nextSeen).add(next.id))
    }

    const resetFilters = (fn: () => void) => {
        fn()
        setCandidate(null)
        setSeen(new Set())
    }

    const plan = (recipeId: number) => {
        const recipe = recipes.get(recipeId)
        assign(recipeId, date)
        showToast(t("Planned: {title}", { title: recipe?.title ?? "" }))
        onClose()
    }

    const img = candidate ? mealImage(candidate.image_url, "hero") : null

    return (
        <Modal title={t("What's for dinner?")} onClose={onClose}>
            <div className={s.filters}>
                <select
                    className="field"
                    value={protein}
                    onChange={e => resetFilters(() => setProtein(e.target.value))}
                    aria-label="protein filter"
                >
                    <option value="">{t("Any protein")}</option>
                    {proteins.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select
                    className="field"
                    value={maxTime}
                    onChange={e => resetFilters(() => setMaxTime(e.target.value))}
                    aria-label="time filter"
                >
                    <option value="">{t("Any time")}</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>≤ {t} min</option>)}
                </select>
            </div>

            {candidate ? (
                <div className={s.candidate}>
                    {img && (
                        <img
                            className={`${s.img} meal-img`}
                            src={img}
                            width={imageBox("hero")}
                            height={imageBox("hero")}
                            alt=""
                        />
                    )}
                    <div className={s.info}>
                        <h3>{candidate.title}</h3>
                        <div className={s.meta}>
                            {candidate.protein_type}
                            {candidate.prep_time_minutes != null && <> · {candidate.prep_time_minutes} {t("min")}</>}
                        </div>
                        {macroLine(candidate) && <div className="macros">{macroLine(candidate)}</div>}
                        {candidate.reasons.length > 0 && (
                            <div className={s.reasons}>
                                {candidate.reasons.map(r => (
                                    <span key={r} className={s.reason}>{r}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className={s.actions}>
                        <button className="btn primary" onClick={() => plan(candidate.id)}>
                            Sounds good
                        </button>
                        <button className="btn" onClick={pick}>{t("Skip")}</button>
                    </div>
                </div>
            ) : (
                <>
                    {shortlist.length > 0 && (
                        <div className={s.shortlist}>
                            <div className={s.shortlistHead}>
                                <Icon name="heart" size={14} filled />
                                From your swipes
                            </div>
                            <div className={s.shortlistRow}>
                                {shortlist.slice(0, 6).map(r => (
                                    <button
                                        key={r.id}
                                        className={s.shortcut}
                                        onClick={() => plan(r.id)}
                                        title={r.title}
                                    >
                                        {mealImage(r.image_url, "thumb") && (
                                            <img src={mealImage(r.image_url, "thumb")!} alt="" />
                                        )}
                                        <span>{r.title}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className={s.start}>
                        <button className="btn primary" onClick={pick}>{t("Surprise me")}</button>
                        <div className={s.poolNote}>
                            {pool.length} recipe{pool.length === 1 ? "" : "s"} ranked for your taste
                        </div>
                    </div>
                </>
            )}

            <button className={`btn ghost ${s.generateLink}`} onClick={onGenerate}>
                <Icon name="sparkle" size={15} />
                Generate something new instead
            </button>
        </Modal>
    )
}

export default SuggestModal
