import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { Verdict } from "../../lib/types"
import { daysBetween, today } from "../../lib/dates"
import { imageBox, mealImage } from "../../lib/format"
import { useToast } from "../../context/ToastContext"
import { clearFeedback, setFeedback, useAppState } from "../../store"
import { useRecipeMap } from "../../data/library"
import Icon, { type IconName } from "../../components/Icon"
import s from "./History.module.css"

const FILTERS: { key: Verdict | "all"; label: string }[] = [
    { key: "all", label: "Everything" },
    { key: "like", label: "Liked" },
    { key: "dislike", label: "Passed" },
    { key: "hidden", label: "Hidden" },
]

const VERDICT: Record<Verdict, { label: string; icon: IconName }> = {
    like: { label: "Liked", icon: "heart" },
    dislike: { label: "Passed", icon: "close" },
    hidden: { label: "Hidden", icon: "ban" },
}

const when = (decidedAt: string) => {
    const days = daysBetween(decidedAt, today())
    if (days <= 0) return "today"
    if (days === 1) return "yesterday"
    if (days < 30) return `${days} days ago`
    const months = Math.round(days / 30)
    return months === 1 ? "a month ago" : `${months} months ago`
}

function History() {
    const [filter, setFilter] = useState<Verdict | "all">("all")
    const { showToast } = useToast()
    const state = useAppState()
    const recipes = useRecipeMap()

    const entries = useMemo(() => {
        return Object.entries(state.feedback)
            .map(([id, f]) => ({ recipe: recipes.get(Number(id)), ...f }))
            .filter(e => e.recipe && (filter === "all" || e.verdict === filter))
            // newest first; seq is monotonic where a date-only stamp can't order
            // two swipes made on the same afternoon
            .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0) || b.decidedAt.localeCompare(a.decidedAt))
    }, [state.feedback, recipes, filter])

    const change = (id: number, verdict: Verdict) => {
        setFeedback(id, verdict)
        showToast("Updated")
    }

    const reset = (id: number) => {
        clearFeedback(id)
        showToast("Reset, it'll come back around")
    }

    return (
        <div className="page">
            <Link to="/discover" className={s.back}>
                <Icon name="left" size={15} />
                Discover
            </Link>
            <h1>Swipe history</h1>
            <p className={s.blurb}>
                Nothing here is permanent. Change your mind whenever you like, and anything you
                passed on drifts back into the deck after a few months on its own.
            </p>

            <div className={s.chips}>
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        className={`${s.chip} ${filter === f.key ? s.chipActive : ""}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {entries.length === 0 && (
                <p className={s.empty}>
                    Nothing here yet. <Link to="/discover">Go find something.</Link>
                </p>
            )}

            <div className={s.list}>
                {entries.map(entry => {
                    const r = entry.recipe!
                    const img = mealImage(r.image_url, "thumb")
                    const verdict = VERDICT[entry.verdict]
                    return (
                        <div key={r.id} className={s.row}>
                            <Link to={`/recipe/${r.id}`} className={s.rowMain}>
                                {img ? (
                                    <img
                                        className={s.thumb}
                                        src={img}
                                        width={imageBox("thumb")}
                                        height={imageBox("thumb")}
                                        alt=""
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className={`${s.thumb} ${s.thumbPlaceholder}`}>
                                        <Icon name="plate" size={18} />
                                    </div>
                                )}
                                <div className={s.text}>
                                    <div className={s.title}>{r.title}</div>
                                    <div className={s.meta}>
                                        <span className={`${s.verdict} ${s[entry.verdict]}`}>
                                            <Icon name={verdict.icon} size={13}
                                                filled={entry.verdict === "like"} />
                                            {verdict.label}
                                        </span>
                                        <span className={s.dot}>·</span>
                                        {when(entry.decidedAt)}
                                    </div>
                                </div>
                            </Link>

                            <div className={s.actions}>
                                {(Object.keys(VERDICT) as Verdict[])
                                    .filter(v => v !== entry.verdict)
                                    .map(v => (
                                        <button
                                            key={v}
                                            className="btn icon"
                                            onClick={() => change(r.id, v)}
                                            aria-label={VERDICT[v].label.toLowerCase()}
                                            data-tip={VERDICT[v].label}
                                        >
                                            <Icon name={VERDICT[v].icon} size={16}
                                                filled={v === "like"} />
                                        </button>
                                    ))}
                                <button
                                    className="btn ghost icon"
                                    onClick={() => reset(r.id)}
                                    aria-label="forget this decision"
                                    data-tip="Forget this decision"
                                >
                                    <Icon name="undo" size={16} />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default History
