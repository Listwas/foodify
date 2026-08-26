import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClearDay, apiMarkCooked, apiPlanRange } from "../../lib/api"
import type { PlanEntry } from "../../lib/types"
import {
    addDays, addMonths, iso, monthGrid, monthLabel, rangeLabel,
    startOfMonth, startOfWeek, weekdayShort, WEEKDAY_HEADS,
} from "../../lib/dates"
import { imageBox, macroLine, mealImage } from "../../lib/format"
import { useToast } from "../../context/ToastContext"
import SuggestModal from "../../components/SuggestModal"
import GenerateModal from "../../components/GenerateModal"
import s from "./WeekView.module.css"

type Mode = "week" | "month"
type ModalState =
    | { kind: "suggest"; date: string; currentRecipeId?: number }
    | { kind: "generate"; date: string }
    | null

function WeekView() {
    const [mode, setMode] = useState<Mode>(
        () => (localStorage.getItem("planner-mode") as Mode) || "week"
    )
    const [offset, setOffset] = useState(0)
    const [modal, setModal] = useState<ModalState>(null)
    const navigate = useNavigate()
    const { showToast } = useToast()
    const queryClient = useQueryClient()

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

    const startIso = iso(days[0])
    const endIso = iso(days[days.length - 1])
    const todayIso = iso(new Date())

    const { data: entries, isLoading } = useQuery({
        queryKey: ["week", startIso, endIso],
        queryFn: () => apiPlanRange(startIso, endIso),
    })

    const byDate = useMemo(() => {
        const map: Record<string, PlanEntry> = {}
        for (const e of entries ?? []) if (e.meal_slot === "dinner") map[e.date] = e
        return map
    }, [entries])

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["week"] })
        queryClient.invalidateQueries({ queryKey: ["recommendations"] })
    }

    const clear = useMutation({
        mutationFn: apiClearDay,
        onSuccess: () => { refresh(); showToast("Day cleared") },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    const cook = useMutation({
        mutationFn: ({ id, done }: { id: number; done: boolean }) => apiMarkCooked(id, done),
        onSuccess: e => {
            refresh()
            queryClient.invalidateQueries({ queryKey: ["profile"] })
            showToast(e.status === "completed" ? "Marked as cooked 🍳" : "Marked as not cooked")
        },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    const openFor = (dateIso: string, entry?: PlanEntry) =>
        setModal({ kind: "suggest", date: dateIso, currentRecipeId: entry?.recipe.id })

    return (
        <div className="page">
            <div className={s.header}>
                <h1>Dinner plan</h1>
                <div className={s.headerRight}>
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
                        <button className="btn ghost" onClick={() => setOffset(o => o - 1)} aria-label="previous" data-tip="Previous">‹</button>
                        <button className={`btn ghost ${s.rangeBtn}`} onClick={() => setOffset(0)} data-tip="Jump to today">
                            {offset === 0
                                ? (mode === "week" ? "This week" : "This month")
                                : (mode === "week" ? rangeLabel(anchor) : monthLabel(anchor))}
                        </button>
                        <button className="btn ghost" onClick={() => setOffset(o => o + 1)} aria-label="next" data-tip="Next">›</button>
                    </div>
                </div>
            </div>

            {mode === "week" ? (
                <div className={s.agenda}>
                    {days.map(day => {
                        const dateIso = iso(day)
                        const entry = byDate[dateIso]
                        const isToday = dateIso === todayIso
                        const past = dateIso < todayIso
                        const cooked = entry?.status === "completed"
                        return (
                            <div
                                key={dateIso}
                                className={[
                                    s.row,
                                    isToday ? s.rowToday : "",
                                    past ? s.rowPast : "",
                                    cooked ? s.rowCooked : "",
                                ].join(" ")}
                            >
                                <div className={s.gutter}>
                                    <span className={s.weekday}>{weekdayShort(day)}</span>
                                    <span className={s.dayNum}>{day.getDate()}</span>
                                    {isToday && <span className={s.todayTag}>today</span>}
                                </div>

                                {entry ? (
                                    <>
                                        <button
                                            className={s.rowMain}
                                            onClick={() => navigate(`/day/${entry.id}`)}
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
                                                <div className={`${s.thumb} ${s.thumbPlaceholder}`}>🍽</div>
                                            )}
                                            <div className={s.rowText}>
                                                <div className={s.rowTitle}>
                                                    {cooked && <span className={s.cookedTick}>✓</span>}
                                                    {entry.recipe.title}
                                                </div>
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
                                                className={`btn ${cooked ? "primary" : ""} ${s.cookBtn}`}
                                                onClick={() => cook.mutate({ id: entry.id, done: !cooked })}
                                                disabled={cook.isPending}
                                                data-tip={cooked ? "Undo cooked" : "Mark as cooked"}
                                            >
                                                {cooked ? "✓ Cooked" : "Mark cooked"}
                                            </button>
                                            <button
                                                className="btn"
                                                onClick={() => openFor(dateIso, entry)}
                                                data-tip="Swap for something else"
                                            >
                                                ⇄ Swap
                                            </button>
                                            <button
                                                className="btn ghost"
                                                onClick={() => clear.mutate(entry.id)}
                                                aria-label="clear day"
                                                data-tip="Clear this day"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <button
                                        className={s.rowEmpty}
                                        onClick={() => openFor(dateIso)}
                                        disabled={isLoading}
                                    >
                                        + Plan something
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
                            const entry = byDate[dateIso]
                            const isToday = dateIso === todayIso
                            const outside = day.getMonth() !== anchor.getMonth()
                            return (
                                <button
                                    key={dateIso}
                                    className={[
                                        s.cell,
                                        isToday ? s.cellToday : "",
                                        outside ? s.cellOutside : "",
                                        entry ? s.cellFilled : "",
                                    ].join(" ")}
                                    onClick={() =>
                                        entry ? navigate(`/day/${entry.id}`) : openFor(dateIso)
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
                                            <span className={s.chipText}>
                                                {entry.status === "completed" && "✓ "}
                                                {entry.recipe.title}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className={s.cellAdd}>+</span>
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
