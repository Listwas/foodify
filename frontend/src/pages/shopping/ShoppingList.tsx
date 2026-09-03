import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { addDays, iso, rangeLabel, startOfWeek, weekdayShort } from "../../lib/dates"
import { splitEntry } from "../../lib/quantity"
import { buildShoppingWeek, shoppingText, type ShoppingLine } from "../../lib/shopping"
import { useT } from "../../lib/i18n"
import { useFoodWord } from "../../lib/foodwords"
import {
    addExtra, clearShoppingTicks, dropLine, editExtra, removeExtra, restoreAllLines,
    restoreLine, setChecks, setExtraChecked, useAppState,
} from "../../store"
import { useToast } from "../../context/ToastContext"
import { useRecipeMap } from "../../data/library"
import Icon from "../../components/Icon"
import s from "./ShoppingList.module.css"

/**
 * Put text on the clipboard.
 *
 * The async clipboard API is the one to use, but it only exists in a secure
 * context, so it is simply missing whenever the app is opened over plain http
 * on a home network. The old selection trick still works there, and a list you
 * can't hand to anyone is half a feature.
 */
async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        // no clipboard API, or permission withheld
    }
    try {
        const area = document.createElement("textarea")
        area.value = text
        area.setAttribute("readonly", "")
        area.style.position = "fixed"
        area.style.top = "-1000px"
        document.body.appendChild(area)
        area.select()
        const copied = document.execCommand("copy")
        area.remove()
        return copied
    } catch {
        return false
    }
}

/** yyyy-mm-dd, and a Monday, whatever the URL says. */
function weekStart(raw: string | undefined): string {
    const parsed = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00`) : new Date()
    return iso(startOfWeek(Number.isNaN(parsed.getTime()) ? new Date() : parsed))
}

function ShoppingList() {
    const { start } = useParams()
    const navigate = useNavigate()
    const { showToast } = useToast()
    const t = useT()
    const state = useAppState()
    const recipes = useRecipeMap()
    const [open, setOpen] = useState<string | null>(null)
    const [draft, setDraft] = useState("")
    const [editing, setEditing] = useState<number | null>(null)
    const [editDraft, setEditDraft] = useState("")

    const from = weekStart(start)
    const week = useMemo(
        () => buildShoppingWeek(state, recipes, from),
        [state, recipes, from]
    )

    const go = (weeks: number) =>
        navigate(`/shopping/${iso(addDays(new Date(`${from}T00:00`), weeks * 7))}`)

    const toggle = (line: ShoppingLine) => {
        if (line.extraId != null) setExtraChecked(line.extraId, !line.checked)
        else setChecks(line.keys, !line.checked)
    }

    const add = (event: React.FormEvent) => {
        event.preventDefault()
        const { quantity, name } = splitEntry(draft)
        if (!name) return
        addExtra(from, name, quantity)
        setDraft("")
    }

    const startEditing = (line: ShoppingLine) => {
        setEditing(line.extraId!)
        setEditDraft([line.amounts[0], line.name].filter(Boolean).join(" "))
    }

    const saveEdit = (event: React.FormEvent) => {
        event.preventDefault()
        const { quantity, name } = splitEntry(editDraft)
        if (name && editing != null) editExtra(editing, name, quantity)
        setEditing(null)
    }

    const copy = async () => {
        const copied = await copyText(shoppingText(week))
        showToast(copied ? t("List copied") : t("Couldn't copy the list"), copied ? "success" : "error")
    }

    const food = useFoodWord()

    const thisWeek = from === iso(startOfWeek(new Date()))
    const nothingHere = week.total === 0 && week.meals.length === 0

    return (
        <div className="page">
            <div className="page-head">
                <h1>{t("Shopping list")}</h1>
                <div className={s.weekNav}>
                    <button className="btn ghost icon" onClick={() => go(-1)}
                        aria-label={t("Previous week")} data-tip={t("Previous week")}>
                        <Icon name="left" />
                    </button>
                    <button
                        className={`btn ghost ${s.rangeBtn}`}
                        onClick={() => navigate(`/shopping/${iso(startOfWeek(new Date()))}`)}
                        data-tip={t("Jump to this week")}
                    >
                        {thisWeek ? t("This week") : rangeLabel(new Date(`${from}T00:00`))}
                    </button>
                    <button className="btn ghost icon" onClick={() => go(1)}
                        aria-label={t("Next week")} data-tip={t("Next week")}>
                        <Icon name="right" />
                    </button>
                </div>
            </div>

            {week.meals.length > 0 && (
                <div className={s.meals}>
                    {week.meals.map(meal => (
                        <Link
                            key={meal.date}
                            to={`/day/${meal.date}`}
                            className={`${s.meal} ${meal.cooked ? s.mealCooked : ""}`}
                        >
                            <span className={s.mealDay}>
                                {weekdayShort(new Date(`${meal.date}T00:00`))}
                            </span>
                            <span className={s.mealTitle}>{meal.recipe.title}</span>
                            <span className={s.mealServes}>
                                {meal.cooked ? t("cooked") : t("for {n}", { n: meal.servings })}
                            </span>
                        </Link>
                    ))}
                </div>
            )}

            {nothingHere ? (
                <div className={s.empty}>
                    <Icon name="list" size={30} />
                    <p>{t("Nothing planned for this week, and nothing added yet.")}</p>
                    <Link to="/" className="btn primary">
                        <Icon name="calendar" size={16} />
                        {t("Go to the plan")}
                    </Link>
                </div>
            ) : (
                <div className={s.bar}>
                    <div className={s.progress}>
                        {t("{ticked} of {total} in the basket", { ticked: week.ticked, total: week.total })}
                        {week.cooked > 0 && (
                            <span className={s.note}>
                                {" "}
                                &middot; {t("{n} cooked meals left out", { n: week.cooked })}
                            </span>
                        )}
                    </div>
                    <div className={s.barActions}>
                        {week.ticked > 0 && (
                            <button
                                className="btn ghost"
                                onClick={() => {
                                    clearShoppingTicks(
                                        from,
                                        week.sections.flatMap(x => x.lines).flatMap(l => l.keys),
                                    )
                                    showToast(t("Everything unticked"))
                                }}
                                data-tip={t("Start the list again")}
                                data-tip-below
                            >
                                <Icon name="undo" size={15} />
                                {t("Reset")}
                            </button>
                        )}
                        <button className="btn" onClick={copy}
                            data-tip={t("Copy the list as text")} data-tip-below>
                            <Icon name="download" size={15} />
                            {t("Copy")}
                        </button>
                    </div>
                </div>
            )}

            {/* One field, not two: nobody writing a shopping list wants to tab
                between an amount and a name. */}
            <form className={s.add} onSubmit={add}>
                <Icon name="plus" size={16} className={s.addIcon} />
                <input
                    className={`field ${s.addInput}`}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={t("Add something: milk, 2 kg potatoes, bin bags")}
                    aria-label={t("add an item to this week's list")}
                />
                <button className="btn primary" type="submit" disabled={!draft.trim()}>
                    {t("Add")}
                </button>
            </form>

            <div className={s.sections}>
                {week.sections.map(({ section, lines }) => (
                    <section key={section} className={s.section}>
                        <h2 className={s.sectionHead}>
                            {t(section)}
                            <span className={s.sectionCount}>{lines.length}</span>
                        </h2>
                        <ul className={s.list}>
                            {lines.map(line => (
                                <li key={line.key} className={line.checked ? s.done : ""}>
                                    {editing === line.extraId && line.extraId != null ? (
                                        <form className={s.editRow} onSubmit={saveEdit}>
                                            <input
                                                className={`field ${s.editInput}`}
                                                value={editDraft}
                                                onChange={e => setEditDraft(e.target.value)}
                                                aria-label={t("Edit")}
                                                autoFocus
                                                onKeyDown={e => e.key === "Escape" && setEditing(null)}
                                            />
                                            <button className="btn primary" type="submit"
                                                aria-label={t("Save changes")}>
                                                <Icon name="check" size={15} />
                                            </button>
                                            <button className="btn ghost" type="button"
                                                onClick={() => setEditing(null)} aria-label={t("Cancel")}>
                                                <Icon name="close" size={15} />
                                            </button>
                                        </form>
                                    ) : (
                                        <div className={s.row}>
                                            <label className={s.rowLabel}>
                                                <input
                                                    type="checkbox"
                                                    checked={line.checked}
                                                    onChange={() => toggle(line)}
                                                />
                                                <span className={s.name}>{food(line.name)}</span>
                                                {/* Empty for a pinch or a handful. Inventing a
                                                    number there would be worse than saying
                                                    nothing. */}
                                                {line.amounts.length > 0 && (
                                                    <span className={s.amount}>
                                                        {line.amounts.join(" + ")}
                                                    </span>
                                                )}
                                            </label>

                                            <div className={s.rowActions}>
                                                {line.extraId != null ? (
                                                    <>
                                                        <button
                                                            className={s.rowBtn}
                                                            onClick={() => startEditing(line)}
                                                            aria-label={t("Edit")}
                                                            data-tip={t("Edit")}
                                                            data-tip-below
                                                        >
                                                            <Icon name="edit" size={14} />
                                                        </button>
                                                        <button
                                                            className={s.rowBtn}
                                                            onClick={() => removeExtra(line.extraId!)}
                                                            aria-label={t("Delete")}
                                                            data-tip={t("Delete")}
                                                            data-tip-below
                                                        >
                                                            <Icon name="close" size={14} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        className={s.rowBtn}
                                                        onClick={() => dropLine(from, line.key)}
                                                        aria-label={t("Already got it")}
                                                        data-tip={t("Already got it")}
                                                        data-tip-below
                                                    >
                                                        <Icon name="close" size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* A total is only trustworthy if you can see what it
                                        was added up from. */}
                                    {line.sources.length > 1 && (
                                        <button
                                            className={s.why}
                                            onClick={() => setOpen(open === line.key ? null : line.key)}
                                            aria-expanded={open === line.key}
                                        >
                                            {open === line.key ? t("hide") : t("{n} meals", { n: line.sources.length })}
                                        </button>
                                    )}
                                    {open === line.key && (
                                        <ul className={s.sources}>
                                            {line.sources.map((source, i) => (
                                                <li key={`${source.date}-${i}`}>
                                                    <span className={s.sourceQty}>
                                                        {source.quantity || t("some")}
                                                    </span>
                                                    <Link to={`/day/${source.date}`}>
                                                        {source.title}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>

            {week.dropped.length > 0 && (
                <div className={s.droppedBox}>
                    <div className={s.droppedHead}>
                        <span>{t("Off this week's list")}</span>
                        <button className="btn ghost" onClick={() => restoreAllLines(from)}>
                            <Icon name="undo" size={14} />
                            {t("Put them all back")}
                        </button>
                    </div>
                    <div className={s.droppedChips}>
                        {week.dropped.map(line => (
                            <button
                                key={line.key}
                                className={s.droppedChip}
                                onClick={() => restoreLine(from, line.key)}
                                data-tip={t("Put it back on the list")}
                            >
                                <Icon name="plus" size={12} />
                                {line.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default ShoppingList
