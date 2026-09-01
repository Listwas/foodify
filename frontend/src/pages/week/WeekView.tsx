import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { RecipeFull } from "../../lib/types"
import {
    addDays, addMonths, iso, monthGrid, monthLabel, rangeLabel,
    startOfMonth, startOfWeek, weekdayShort, WEEKDAY_HEADS,
} from "../../lib/dates"
import { imageBox, macroLine, mealImage } from "../../lib/format"
import { useToast } from "../../context/ToastContext"
import { useAppState, clearDay, markCooked } from "../../store"
import { planKey } from "../../store/types"
import { useRecipeMap } from "../../data/library"
import Icon from "../../components/Icon"
import Menu from "../../components/Menu"
import SuggestModal from "../../components/SuggestModal"
import GenerateModal from "../../components/GenerateModal"
import s from "./WeekView.module.css"

type Mode = "week" | "month"
type ModalState =
    | { kind: "suggest"; date: string; currentRecipeId?: number }
    | { kind: "generate"; date: string }
    | null

interface Entry {
    date: string
    recipe: RecipeFull
    cooked: boolean
}

function WeekView() {
    const [mode, setMode] = useState<Mode>(
        () => (localStorage.getItem("planner-mode") as Mode) || "week"
    )
    const [offset, setOffset] = useState(0)
    const [modal, setModal] = useState<ModalState>(null)
    const navigate = useNavigate()
    const { showToast } = useToast()
    const state = useAppState()
    const recipes = useRecipeMap()

    const setPlannerMode = (next: Mode) => {
        setMode(next)
        setOffset(0)
        localStorage.setItem("planner-mode", next)
    }

    const anchor = mode === "week"
        ? startOfWeek(addDays(new Date(), offset * 7))
        : addMonths(startOfMonth(new Date()), offset)

    const days = useMemo(
        () => (mode === "week" ? [...Array(7)].map((_, i) => addDays(anchor, i)) : monthGrid(anchor)),
        [mode, anchor.getTime()] // eslint-disable-line react-hooks/exhaustive-deps
    )

    const todayIso = iso(new Date())

    const entryFor = (dateIso: string): Entry | undefined => {
        const slot = state.plan[planKey(dateIso)]
        const recipe = slot && recipes.get(slot.recipeId)
        if (!slot || !recipe) return undefined
        return { date: dateIso, recipe, cooked: slot.status === "completed" }
    }

    const cook = (dateIso: string, done: boolean) => {
        markCooked(dateIso, done)
        showToast(done ? "Marked as cooked" : "Marked as not cooked")
    }

    const clear = (dateIso: string) => {
        clearDay(dateIso)
        showToast("Day cleared")
    }

    const openSuggest = (dateIso: string, entry?: Entry) =>
        setModal({ kind: "suggest", date: dateIso, currentRecipeId: entry?.recipe.id })

    return (
        <div className="page">
            <div className="page-head">
                <h1>Dinner plan</h1>
                <div className={s.headerRight}>
                    <Link
                        className={`btn ${s.shopBtn}`}
                        to={`/shopping/${iso(startOfWeek(mode === "week" ? anchor : new Date()))}`}
                        data-tip="Everything this week needs, added up"
                        data-tip-below
                    >
                        <Icon name="list" size={16} />
                        Shopping
                    </Link>
                    <div className={s.modes} role="tablist" aria-label="calendar range">
                        {(["week", "month"] as Mode[]).map(m => (
                            <button
                                key={m}
                                role="tab"
                                aria-selected={mode === m}
                                className={`${s.modeBtn} ${mode === m ? s.modeActive : ""}`}
                                onClick={() => setPlannerMode(m)}
                            >
                                {m === "week" ? "Week" : "Month"}
                            </button>
                        ))}
                    </div>
                    <div className={s.weekNav}>
                        <button className="btn ghost icon" onClick={() => setOffset(o => o - 1)}
                            aria-label="previous" data-tip="Previous">
                            <Icon name="left" />
                        </button>
                        <button className={`btn ghost ${s.rangeBtn}`} onClick={() => setOffset(0)}
                            data-tip="Jump to today">
                            {offset === 0
                                ? (mode === "week" ? "This week" : "This month")
                                : (mode === "week" ? rangeLabel(anchor) : monthLabel(anchor))}
                        </button>
                        <button className="btn ghost icon" onClick={() => setOffset(o => o + 1)}
                            aria-label="next" data-tip="Next">
                            <Icon name="right" />
                        </button>
                    </div>
                </div>
            </div>

            {mode === "week" ? (
                <div className={s.agenda}>
                    {days.map(day => {
                        const dateIso = iso(day)
                        const entry = entryFor(dateIso)
                        const isToday = dateIso === todayIso
                        return (
                            <div
                                key={dateIso}
                                className={[
                                    s.row,
                                    isToday ? s.rowToday : "",
                                    dateIso < todayIso ? s.rowPast : "",
                                    entry?.cooked ? s.rowCooked : "",
                                ].join(" ")}
                            >
                                <div className={s.gutter}>
                                    <span className={s.weekday}>{weekdayShort(day)}</span>
                                    <span className={s.dayNum}>{day.getDate()}</span>
                                </div>

                                {entry ? (
                                    <>
                                        <button
                                            className={s.rowMain}
                                            onClick={() => navigate(`/day/${dateIso}`)}
                                            data-tip="Open recipe & groceries"
                                            data-tip-below
                                        >
                                            {mealImage(entry.recipe.image_url, "card") ? (
                                                <img
                                                    className={`${s.thumb} meal-img`}
                                                    src={mealImage(entry.recipe.image_url, "card")!}
                                                    width={imageBox("card")}
                                                    height={imageBox("card")}
                                                    alt=""
                                                    loading="lazy"
                                                    onLoad={e => e.currentTarget.setAttribute("data-loaded", "true")}
                                                />
                                            ) : (
                                                <div className={`${s.thumb} ${s.thumbPlaceholder}`}>
                                                    <Icon name="plate" size={22} />
                                                </div>
                                            )}
                                            <div className={s.rowText}>
                                                <div className={s.rowTitle}>{entry.recipe.title}</div>
                                                <div className={s.rowMeta}>
                                                    {entry.recipe.protein_type}
                                                    {entry.recipe.prep_time_minutes != null &&
                                                        ` · ${entry.recipe.prep_time_minutes} min`}
                                                </div>
                                                {macroLine(entry.recipe) && (
                                                    <div className="macros">{macroLine(entry.recipe)}</div>
                                                )}
                                            </div>
                                        </button>

                                        <div className={s.rowActions}>
                                            <button
                                                className={`btn icon ${s.cookBtn} ${entry.cooked ? s.cookedOn : ""}`}
                                                onClick={() => cook(dateIso, !entry.cooked)}
                                                aria-pressed={entry.cooked}
                                                aria-label={entry.cooked ? "mark as not cooked" : "mark as cooked"}
                                                data-tip={entry.cooked ? "Cooked, tap to undo" : "Mark as cooked"}
                                            >
                                                <Icon name="check" />
                                            </button>
                                            <Menu items={[
                                                {
                                                    label: "Swap meal",
                                                    icon: "swap",
                                                    onSelect: () => openSuggest(dateIso, entry),
                                                },
                                                {
                                                    label: "Clear day",
                                                    icon: "close",
                                                    danger: true,
                                                    onSelect: () => clear(dateIso),
                                                },
                                            ]} />
                                        </div>
                                    </>
                                ) : (
                                    <button className={s.rowEmpty} onClick={() => openSuggest(dateIso)}>
                                        <Icon name="plus" size={16} />
                                        Plan something
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className={s.month}>
                    <div className={s.monthHead}>
                        {WEEKDAY_HEADS.map(d => <div key={d}>{d}</div>)}
                    </div>
                    <div className={s.monthGrid}>
                        {days.map(day => {
                            const dateIso = iso(day)
                            const entry = entryFor(dateIso)
                            return (
                                <button
                                    key={dateIso}
                                    className={[
                                        s.cell,
                                        dateIso === todayIso ? s.cellToday : "",
                                        day.getMonth() !== anchor.getMonth() ? s.cellOutside : "",
                                        entry ? s.cellFilled : "",
                                    ].join(" ")}
                                    onClick={() =>
                                        entry ? navigate(`/day/${dateIso}`) : openSuggest(dateIso)
                                    }
                                    title={entry ? entry.recipe.title : "plan something"}
                                >
                                    <span className={s.cellNum}>{day.getDate()}</span>
                                    {entry ? (
                                        <span className={s.chip}>
                                            {mealImage(entry.recipe.image_url, "thumb") && (
                                                <img
                                                    className={s.chipImg}
                                                    src={mealImage(entry.recipe.image_url, "thumb")!}
                                                    width={imageBox("thumb")}
                                                    height={imageBox("thumb")}
                                                    alt=""
                                                    loading="lazy"
                                                />
                                            )}
                                            <span className={s.chipText}>{entry.recipe.title}</span>
                                            {entry.cooked && (
                                                <Icon name="check" size={13} className={s.chipTick} />
                                            )}
                                        </span>
                                    ) : (
                                        <span className={s.cellAdd}>
                                            <Icon name="plus" size={15} />
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {modal?.kind === "suggest" && (
                <SuggestModal
                    date={modal.date}
                    currentRecipeId={modal.currentRecipeId}
                    onGenerate={() => setModal({ kind: "generate", date: modal.date })}
                    onClose={() => setModal(null)}
                />
            )}
            {modal?.kind === "generate" && (
                <GenerateModal date={modal.date} onClose={() => setModal(null)} />
            )}
        </div>
    )
}

export default WeekView
