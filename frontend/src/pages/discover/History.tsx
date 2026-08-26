import { useState } from "react"
import { Link } from "react-router-dom"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFeedback, apiHistory } from "../../lib/api"
import type { Verdict } from "../../lib/types"
import { imageBox, mealImage } from "../../lib/format"
import { useToast } from "../../context/ToastContext"
import s from "./History.module.css"

const FILTERS: { key: Verdict | "all"; label: string }[] = [
    { key: "all", label: "Everything" },
    { key: "like", label: "♥ Liked" },
    { key: "dislike", label: "✕ Passed" },
    { key: "hidden", label: "🚫 Hidden" },
]

const VERDICT_LABEL: Record<Verdict, string> = {
    like: "♥ Liked",
    dislike: "✕ Passed",
    hidden: "🚫 Hidden",
}

const when = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
    if (days <= 0) return "today"
    if (days === 1) return "yesterday"
    if (days < 30) return `${days} days ago`
    const months = Math.round(days / 30)
    return months === 1 ? "a month ago" : `${months} months ago`
}

function History() {
    const [filter, setFilter] = useState<Verdict | "all">("all")
    const { showToast } = useToast()
    const queryClient = useQueryClient()

    const { data, isLoading } = useQuery({
        queryKey: ["history", filter],
        queryFn: () => apiHistory(filter === "all" ? undefined : filter),
        placeholderData: keepPreviousData,
    })

    const change = useMutation({
        mutationFn: ({ id, verdict }: { id: number; verdict: Verdict | "clear" }) =>
            apiFeedback(id, verdict),
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ["history"] })
            queryClient.invalidateQueries({ queryKey: ["deck"] })
            queryClient.invalidateQueries({ queryKey: ["recipes"] })
            queryClient.invalidateQueries({ queryKey: ["recommendations"] })
            queryClient.invalidateQueries({ queryKey: ["profile"] })
            showToast(vars.verdict === "clear" ? "Reset — it'll come back around" : "Updated")
        },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    return (
        <div className="page">
            <div className={s.header}>
                <div>
                    <Link to="/discover" className={s.back}>‹ Discover</Link>
                    <h1>Swipe history</h1>
                </div>
            </div>
            <p className={s.blurb}>
                Nothing here is permanent. Change your mind whenever you like — and anything you
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

            {!isLoading && (data ?? []).length === 0 && (
                <p className={s.empty}>
                    Nothing swiped yet. <Link to="/discover">Go find something.</Link>
                </p>
            )}

            <div className={s.list}>
                {(data ?? []).map(entry => {
                    const r = entry.recipe
                    const img = mealImage(r.image_url, "thumb")
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
                                    <div className={`${s.thumb} ${s.thumbPlaceholder}`}>🍽</div>
                                )}
                                <div className={s.text}>
                                    <div className={s.title}>{r.title}</div>
                                    <div className={s.meta}>
                                        <span className={s[entry.verdict]}>
                                            {VERDICT_LABEL[entry.verdict]}
                                        </span>
                                        <span className={s.dot}>·</span>
                                        {when(entry.decided_at)}
                                    </div>
                                </div>
                            </Link>

                            <div className={s.actions}>
                                {entry.verdict !== "like" && (
                                    <button
                                        className="btn"
                                        onClick={() => change.mutate({ id: r.id, verdict: "like" })}
                                        data-tip="Actually, I like this"
                                    >
                                        ♥
                                    </button>
                                )}
                                {entry.verdict !== "dislike" && (
                                    <button
                                        className="btn"
                                        onClick={() => change.mutate({ id: r.id, verdict: "dislike" })}
                                        data-tip="Pass on this"
                                    >
                                        ✕
                                    </button>
                                )}
                                {entry.verdict !== "hidden" && (
                                    <button
                                        className="btn"
                                        onClick={() => change.mutate({ id: r.id, verdict: "hidden" })}
                                        data-tip="Hide it entirely"
                                    >
                                        🚫
                                    </button>
                                )}
                                <button
                                    className="btn ghost"
                                    onClick={() => change.mutate({ id: r.id, verdict: "clear" })}
                                    data-tip="Forget this decision"
                                >
                                    ↺
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
