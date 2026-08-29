import { useMemo } from "react"
import { addDays, iso } from "../lib/dates"
import { useToast } from "../context/ToastContext"
import { assign, useAppState } from "../store"
import { planKey } from "../store/types"
import { useRecipeMap } from "../data/library"
import Modal from "./Modal"
import s from "./DayPickerModal.module.css"

interface Props {
    recipeId: number
    recipeTitle: string
    onClose: () => void
}

const DAYS_AHEAD = 14

/** Pick a day to cook something — the missing link between finding a recipe
 *  and it actually being on the plan. */
function DayPickerModal({ recipeId, recipeTitle, onClose }: Props) {
    const { showToast } = useToast()
    const state = useAppState()
    const recipes = useRecipeMap()

    const days = useMemo(
        () => [...Array(DAYS_AHEAD)].map((_, i) => addDays(new Date(), i)),
        []
    )

    const pick = (dateIso: string) => {
        assign(recipeId, dateIso)
        const when = new Date(`${dateIso}T00:00`).toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "short",
        })
        showToast(`${recipeTitle} → ${when}`)
        onClose()
    }

    return (
        <Modal title={`Plan "${recipeTitle}"`} onClose={onClose}>
            <p className={s.hint}>Pick a day. Anything already planned will be replaced.</p>
            <div className={s.days}>
                {days.map((day, i) => {
                    const dateIso = iso(day)
                    const slot = state.plan[planKey(dateIso)]
                    const taken = slot && recipes.get(slot.recipeId)
                    const isSame = slot?.recipeId === recipeId
                    return (
                        <button
                            key={dateIso}
                            className={`${s.day} ${taken ? s.dayTaken : ""} ${isSame ? s.daySame : ""}`}
                            onClick={() => !isSame && pick(dateIso)}
                            disabled={isSame}
                        >
                            <span className={s.dayName}>
                                {i === 0 ? "Today" : i === 1 ? "Tomorrow"
                                    : day.toLocaleDateString("en-GB", { weekday: "short" })}
                            </span>
                            <span className={s.dayNum}>
                                {day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                            <span className={s.dayTaken_label}>
                                {isSame ? "already here" : taken ? taken.title : "free"}
                            </span>
                        </button>
                    )
                })}
            </div>
        </Modal>
    )
}

export default DayPickerModal
