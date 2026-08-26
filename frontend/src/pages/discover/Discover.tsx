import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiDeck, apiFeedback, apiUndoFeedback } from "../../lib/api"
import type { DeckCard, Verdict } from "../../lib/types"
import { imageBox, macroLine, mealImage } from "../../lib/format"
import { useSwipe, type SwipeDir } from "../../lib/useSwipe"
import { useToast } from "../../context/ToastContext"
import s from "./Discover.module.css"

const VERDICT_OF: Record<SwipeDir, Verdict> = {
    right: "like",
    left: "dislike",
    down: "hidden",
}

const LABEL: Record<SwipeDir, string> = {
    right: "Yes",
    left: "Pass",
    down: "Hide",
}

function Card({ card, onCommit, top }: {
    card: DeckCard
    onCommit: (dir: SwipeDir) => void
    top: boolean
}) {
    const { handlers, style, intent } = useSwipe(onCommit)
    const img = mealImage(card.image_url, "hero")

    return (
        <div
            className={`${s.card} ${top ? s.top : s.behind}`}
            style={top ? style : undefined}
            {...(top ? handlers : {})}
        >
            {intent.dir && top && (
                <div
                    className={`${s.stamp} ${s[intent.dir]}`}
                    style={{ opacity: intent.strength }}
                >
                    {LABEL[intent.dir]}
                </div>
            )}
            {img ? (
                <img
                    className={`${s.img} meal-img`}
                    src={img}
                    width={imageBox("hero")}
                    height={imageBox("hero")}
                    alt=""
                    draggable={false}
                    onLoad={e => e.currentTarget.setAttribute("data-loaded", "true")}
                />
            ) : (
                <div className={`${s.img} ${s.placeholder}`}>{card.source === "ai" ? "✨" : "🍽"}</div>
            )}
            <div className={s.body}>
                <h2>{card.title}</h2>
                <div className={s.meta}>
                    {card.protein_type}
                    {card.prep_time_minutes != null && <> · {card.prep_time_minutes} min</>}
                </div>
                {macroLine(card) && <div className="macros">{macroLine(card)}</div>}
                {card.reasons.length > 0 && (
                    <div className={s.reasons}>
                        {card.reasons.map(r => <span key={r} className={s.reason}>{r}</span>)}
                    </div>
                )}
            </div>
        </div>
    )
}

function Discover() {
    const { showToast } = useToast()
    const queryClient = useQueryClient()
    const [queue, setQueue] = useState<DeckCard[]>([])
    const [swiped, setSwiped] = useState(0)

    const { data, isLoading, refetch } = useQuery({
        queryKey: ["deck"],
        queryFn: () => apiDeck(20),
        staleTime: 0,
        gcTime: 0,
    })

    useEffect(() => {
        if (data) setQueue(data)
    }, [data])

    const invalidate = useCallback(() => {
        // the taste model just changed — everything downstream is stale
        queryClient.invalidateQueries({ queryKey: ["recipes"] })
        queryClient.invalidateQueries({ queryKey: ["recommendations"] })
        queryClient.invalidateQueries({ queryKey: ["shortlist"] })
        queryClient.invalidateQueries({ queryKey: ["profile"] })
    }, [queryClient])

    const send = useMutation({
        mutationFn: ({ id, verdict }: { id: number; verdict: Verdict }) =>
            apiFeedback(id, verdict),
        onSuccess: invalidate,
        onError: (e: Error) => showToast(e.message, "error"),
    })

    const undo = useMutation({
        mutationFn: apiUndoFeedback,
        onSuccess: result => {
            invalidate()
            setSwiped(n => Math.max(0, n - 1))
            if (result.card) {
                // put back the card that was actually swiped, not whatever the
                // recommender would serve next
                setQueue(q => [result.card!, ...q.filter(c => c.id !== result.card!.id)])
                showToast(`Back: ${result.card.title}`)
            } else {
                refetch()
                showToast("Undone")
            }
        },
        onError: () => showToast("Nothing to undo", "error"),
    })

    const commit = useCallback(
        (dir: SwipeDir) => {
            setQueue(q => {
                const [card, ...rest] = q
                if (card) send.mutate({ id: card.id, verdict: VERDICT_OF[dir] })
                // top up before the stack empties
                if (rest.length <= 3) refetch()
                return rest
            })
            setSwiped(n => n + 1)
        },
        [send, refetch]
    )

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") commit("right")
            else if (e.key === "ArrowLeft") commit("left")
            else if (e.key === "ArrowDown") commit("down")
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [commit])

    const visible = useMemo(() => queue.slice(0, 3).reverse(), [queue])
    const top = queue[0]

    return (
        <div className="page">
            <div className={s.header}>
                <h1>Discover</h1>
                <div className={s.headerRight}>
                    {swiped > 0 && <span className={s.counter}>{swiped} swiped</span>}
                    <Link to="/discover/history" className="btn ghost" data-tip="Everything you've swiped">
                        History
                    </Link>
                </div>
            </div>
            <p className={s.hint}>
                Swipe or use ← → keys. Everything you keep trains what the app suggests everywhere else.
            </p>

            <div className={s.stage}>
                {visible.length > 0 ? (
                    visible.map((card, i) => (
                        <Card
                            key={card.id}
                            card={card}
                            top={i === visible.length - 1}
                            onCommit={commit}
                        />
                    ))
                ) : (
                    <div className={s.empty}>
                        {isLoading ? "Dealing cards…" : (
                            <>
                                <div className={s.emptyIcon}>🍽</div>
                                <p>You've been through everything for now.</p>
                                <Link to="/recipes" className="btn">Browse the library</Link>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className={s.controls}>
                <button
                    className={`${s.action} ${s.pass}`}
                    onClick={() => commit("left")}
                    disabled={!top}
                    aria-label="pass"
                    data-tip="Pass — not right now"
                >
                    ✕
                </button>
                <button
                    className={`${s.action} ${s.hideBtn}`}
                    onClick={() => commit("down")}
                    disabled={!top}
                    aria-label="hide"
                    data-tip="Hide — never show me this"
                >
                    🚫
                </button>
                <button
                    className={`${s.action} ${s.undoBtn}`}
                    onClick={() => undo.mutate()}
                    disabled={undo.isPending}
                    aria-label="undo last swipe"
                    data-tip="Undo last swipe"
                >
                    ↺
                </button>
                <button
                    className={`${s.action} ${s.like}`}
                    onClick={() => commit("right")}
                    disabled={!top}
                    aria-label="like"
                    data-tip="Like — add to your list"
                >
                    ♥
                </button>
            </div>
        </div>
    )
}

export default Discover
