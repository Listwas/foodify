import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { RecipeFull, Verdict } from "../../lib/types"
import { imageBox, macroLine, mealImage } from "../../lib/format"
import { useSwipe, type SwipeDir } from "../../lib/useSwipe"
import { useToast } from "../../context/ToastContext"
import { clearFeedback, getState, lastJudged, setFeedback } from "../../store"
import { useStructuralMap } from "../../data/library"
import { useIndex } from "../../data/taste"
import { deck } from "../../engine"
import Icon from "../../components/Icon"
import s from "./Discover.module.css"

const DECK_SIZE = 24

type Card = RecipeFull & { reasons: string[] }

const VERDICT_OF: Record<SwipeDir, Verdict> = {
    right: "like",
    left: "dislike",
    down: "hidden",
}

const LABEL: Record<SwipeDir, string> = { right: "Yes", left: "Pass", down: "Hide" }

function SwipeCard({ card, onCommit, top }: {
    card: Card
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
                <div className={`${s.stamp} ${s[intent.dir]}`} style={{ opacity: intent.strength }}>
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
                <div className={`${s.img} ${s.placeholder}`}>
                    <Icon name={card.source === "ai" ? "sparkle" : "plate"} size={40} />
                </div>
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
    const index = useIndex()
    // deliberately the verdict-free map: a swipe must not invalidate the deal
    const recipes = useStructuralMap()
    const [queue, setQueue] = useState<Card[]>([])
    const [undoStack, setUndoStack] = useState<Card[]>([])
    const [swiped, setSwiped] = useState(0)
    const [dealt, setDealt] = useState(false)

    /**
     * Deal a fresh deck. Reads the store directly rather than through a hook so
     * that a swipe — which changes the taste signals — doesn't invalidate this
     * callback and reshuffle the cards under the user's thumb.
     */
    const dealCards = useCallback((keep: Card[] = []): Card[] => {
        const state = getState()
        const held = new Set(keep.map(c => c.id))
        const cards = deck(
            index,
            { feedback: state.feedback, prefs: state.prefs, plan: state.plan },
            DECK_SIZE,
        )
        const fresh = cards
            .filter(c => !held.has(c.recipe.id))
            .map(c => ({ ...recipes.get(c.recipe.id)!, reasons: c.reasons }))
            .filter(c => c.id != null)
        return [...keep, ...fresh]
    }, [index, recipes])

    useEffect(() => {
        setQueue(dealCards())
        setDealt(true)
    }, [dealCards])

    const commit = useCallback((dir: SwipeDir) => {
        // Recording the swipe must happen here rather than inside a setQueue
        // updater: React is free to run an updater more than once, and it did —
        // one arrow key was landing as two swipes. Updaters stay pure.
        const [card, ...rest] = queue
        if (!card) return
        setFeedback(card.id, VERDICT_OF[dir])
        setUndoStack(stack => [card, ...stack])
        setSwiped(n => n + 1)
        // top up before the stack empties, keeping what's already dealt. The
        // store has already recorded the verdict, so the new cards exclude it.
        setQueue(rest.length <= 3 ? dealCards(rest) : rest)
    }, [queue, dealCards])

    const undo = useCallback(() => {
        const card = undoStack[0]
        if (card) {
            clearFeedback(card.id)
            setUndoStack(stack => stack.slice(1))
            setSwiped(n => Math.max(0, n - 1))
            // put back the card that was actually swiped, not whatever the
            // recommender would serve next
            setQueue(q => [card, ...q.filter(c => c.id !== card.id)])
            showToast(`Back: ${card.title}`)
            return
        }
        // nothing swiped this session — fall back to the last verdict on record,
        // so undo still works after a reload
        const id = lastJudged()
        const recipe = id == null ? undefined : recipes.get(id)
        if (!recipe) {
            showToast("Nothing to undo", "error")
            return
        }
        clearFeedback(recipe.id)
        setQueue(q => [{ ...recipe, reasons: [] }, ...q.filter(c => c.id !== recipe.id)])
        showToast(`Back: ${recipe.title}`)
    }, [undoStack, recipes, showToast])

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
            <div className="page-head">
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
                        <SwipeCard
                            key={card.id}
                            card={card}
                            top={i === visible.length - 1}
                            onCommit={commit}
                        />
                    ))
                ) : (
                    <div className={s.empty}>
                        {!dealt ? "Dealing cards…" : (
                            <>
                                <Icon name="plate" size={34} />
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
                    data-tip="Pass, not right now"
                >
                    <Icon name="close" size={22} />
                </button>
                <button
                    className={`${s.action} ${s.hideBtn}`}
                    onClick={() => commit("down")}
                    disabled={!top}
                    aria-label="hide"
                    data-tip="Hide, never show me this"
                >
                    <Icon name="ban" size={19} />
                </button>
                <button
                    className={`${s.action} ${s.undoBtn}`}
                    onClick={undo}
                    aria-label="undo last swipe"
                    data-tip="Undo last swipe"
                >
                    <Icon name="undo" size={19} />
                </button>
                <button
                    className={`${s.action} ${s.like}`}
                    onClick={() => commit("right")}
                    disabled={!top}
                    aria-label="like"
                    data-tip="Like, add to your list"
                >
                    <Icon name="heart" size={22} filled />
                </button>
            </div>
        </div>
    )
}

export default Discover
