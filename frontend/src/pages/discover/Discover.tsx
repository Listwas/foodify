import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { RecipeFull, Verdict } from "../../lib/types"
import { imageBox, ingredientLabel, macroLine, mealImage } from "../../lib/format"
import { kitchenQuantity, metricProse } from "../../lib/quantity"
import { useT } from "../../lib/i18n"
import { useTranslated } from "../../lib/translate"
import { reasonText } from "../../lib/reasons"
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

/**
 * What's actually in the dish, over the card rather than in it.
 *
 * The deck is one screenful by design, and the photo already gives up its
 * height to the title on a laptop, so there is nowhere to put a list of
 * ingredients without squeezing something that was tuned not to be squeezed.
 * Laid over the card instead: the stage keeps its size and this gets to scroll.
 */
function CardDetails({ card, onClose }: { card: Card; onClose: () => void }) {
    const t = useT()
    const tr = useTranslated([card.title, card.instructions, ...card.ingredients.map(i => i.name)])
    return (
        <div className={s.details}>
            <div className={s.detailsHead}>
                <h3 className={tr.pending ? "translating" : ""}>{tr(card.title)}</h3>
                <button className={s.detailsClose} onClick={onClose} aria-label={t("close details")}>
                    <Icon name="close" size={18} />
                </button>
            </div>
            <div className={`${s.detailsBody} ${tr.pending ? "translating" : ""}`}>
                <h4>{t("Ingredients")}</h4>
                <ul className={s.detailsList}>
                    {card.ingredients.map(i => (
                        <li key={i.id}>
                            {ingredientLabel({ ...i, name: tr(i.name), quantity: kitchenQuantity(i.quantity) })}
                        </li>
                    ))}
                </ul>
                <h4>{t("Method")}</h4>
                <p className={s.detailsMethod}>
                    {metricProse(tr(card.instructions)) || t("No instructions recorded.")}
                </p>
            </div>
        </div>
    )
}

function SwipeCard({ card, onCommit, top, open, onOpen, onClose }: {
    card: Card
    onCommit: (dir: SwipeDir) => void
    top: boolean
    open: boolean
    onOpen: () => void
    onClose: () => void
}) {
    const t = useT()
    // only the title on the card face; the method waits until it is opened
    const tr = useTranslated([card.title])
    const { handlers, style, intent } = useSwipe(onCommit)
    const img = mealImage(card.image_url, "hero")
    // dragging while reading would fling the card away mid-sentence
    const draggable = top && !open

    return (
        <div
            className={`${s.card} ${top ? s.top : s.behind}`}
            style={top ? style : undefined}
            {...(draggable ? handlers : {})}
        >
            {intent.dir && draggable && (
                <div className={`${s.stamp} ${s[intent.dir]}`} style={{ opacity: intent.strength }}>
                    {t(LABEL[intent.dir])}
                </div>
            )}
            <div className={s.photo}>
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
                {top && !open && (
                    <button
                        className={s.detailsBtn}
                        onClick={onOpen}
                        // the card is one big drag surface; without this the
                        // press that opens the details also starts a swipe
                        onPointerDown={e => e.stopPropagation()}
                    >
                        <Icon name="list" size={14} />
                        {t("Details")}
                    </button>
                )}
            </div>
            <div className={s.body}>
                <h2 className={tr.pending ? "translating" : ""}>{tr(card.title)}</h2>
                <div className={s.meta}>
                    {t(card.protein_type ?? "")}
                    {card.prep_time_minutes != null && <> · {card.prep_time_minutes} {t("min")}</>}
                </div>
                {macroLine(card) && <div className="macros">{macroLine(card)}</div>}
                {card.reasons.length > 0 && (
                    <div className={s.reasons}>
                        {card.reasons.map(r => <span key={r} className={s.reason}>{reasonText(r)}</span>)}
                    </div>
                )}
            </div>
            {open && <CardDetails card={card} onClose={onClose} />}
        </div>
    )
}

function Discover() {
    const { showToast } = useToast()
    const t = useT()
    const index = useIndex()
    // deliberately the verdict-free map: a swipe must not invalidate the deal
    const recipes = useStructuralMap()
    const [queue, setQueue] = useState<Card[]>([])
    const [undoStack, setUndoStack] = useState<Card[]>([])
    const [swiped, setSwiped] = useState(0)
    const [dealt, setDealt] = useState(false)
    // by card id, not a flag: a deal that moves on must never leave the
    // details of a card that is no longer on top hanging open
    const [preview, setPreview] = useState<number | null>(null)

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
        setPreview(null)
        setFeedback(card.id, VERDICT_OF[dir])
        setUndoStack(stack => [card, ...stack])
        setSwiped(n => n + 1)
        // top up before the stack empties, keeping what's already dealt. The
        // store has already recorded the verdict, so the new cards exclude it.
        setQueue(rest.length <= 3 ? dealCards(rest) : rest)
    }, [queue, dealCards])

    const undo = useCallback(() => {
        setPreview(null)
        const card = undoStack[0]
        if (card) {
            clearFeedback(card.id)
            setUndoStack(stack => stack.slice(1))
            setSwiped(n => Math.max(0, n - 1))
            // put back the card that was actually swiped, not whatever the
            // recommender would serve next
            setQueue(q => [card, ...q.filter(c => c.id !== card.id)])
            showToast(t("Back: {title}", { title: card.title }))
            return
        }
        // nothing swiped this session — fall back to the last verdict on record,
        // so undo still works after a reload
        const id = lastJudged()
        const recipe = id == null ? undefined : recipes.get(id)
        if (!recipe) {
            showToast(t("Nothing to undo"), "error")
            return
        }
        clearFeedback(recipe.id)
        setQueue(q => [{ ...recipe, reasons: [] }, ...q.filter(c => c.id !== recipe.id)])
        showToast(t("Back: {title}", { title: recipe.title }))
    }, [undoStack, recipes, showToast])

    const visible = useMemo(() => queue.slice(0, 3).reverse(), [queue])
    const top = queue[0]

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // reading the recipe, not judging it: the arrows would otherwise
            // swipe away the card being read
            if (preview !== null) {
                if (e.key === "Escape" || e.key === "ArrowUp") setPreview(null)
                return
            }
            if (e.key === "ArrowRight") commit("right")
            else if (e.key === "ArrowLeft") commit("left")
            else if (e.key === "ArrowDown") commit("down")
            else if (e.key === "ArrowUp" && top) setPreview(top.id)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [commit, preview, top])

    return (
        <div className={`page ${s.page}`}>
            <div className="page-head">
                <h1>{t("Discover")}</h1>
                <div className={s.headerRight}>
                    {swiped > 0 && <span className={s.counter}>{t("{n} swiped", { n: swiped })}</span>}
                    <Link to="/discover/history" className="btn ghost" data-tip={t("Everything you've swiped")}>
                        {t("History")}
                    </Link>
                </div>
            </div>
            <p className={s.hint}>
                {t("Swipe or use ← → keys, ↑ for what's in it. Everything you keep trains what the app suggests everywhere else.")}
            </p>

            <div className={s.stage}>
                {visible.length > 0 ? (
                    visible.map((card, i) => (
                        <SwipeCard
                            key={card.id}
                            card={card}
                            top={i === visible.length - 1}
                            open={preview === card.id}
                            onOpen={() => setPreview(card.id)}
                            onClose={() => setPreview(null)}
                            onCommit={commit}
                        />
                    ))
                ) : (
                    <div className={s.empty}>
                        {!dealt ? t("Dealing cards…") : (
                            <>
                                <Icon name="plate" size={34} />
                                <p>{t("You've been through everything for now.")}</p>
                                <Link to="/recipes" className="btn">{t("Browse the library")}</Link>
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
                    aria-label={t("Pass")}
                    data-tip={t("Pass, not right now")}
                >
                    <Icon name="close" size={22} />
                </button>
                <button
                    className={`${s.action} ${s.hideBtn}`}
                    onClick={() => commit("down")}
                    disabled={!top}
                    aria-label={t("Hide")}
                    data-tip={t("Hide, never show me this")}
                >
                    <Icon name="ban" size={19} />
                </button>
                <button
                    className={`${s.action} ${s.undoBtn}`}
                    onClick={undo}
                    aria-label={t("undo last swipe")}
                    data-tip={t("Undo last swipe")}
                >
                    <Icon name="undo" size={19} />
                </button>
                <button
                    className={`${s.action} ${s.like}`}
                    onClick={() => commit("right")}
                    disabled={!top}
                    aria-label={t("like")}
                    data-tip={t("Like, add to your list")}
                >
                    <Icon name="heart" size={22} filled />
                </button>
            </div>
        </div>
    )
}

export default Discover
