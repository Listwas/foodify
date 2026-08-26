import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiAssign, apiPlanRange } from "../lib/api"
import type { PlanEntry } from "../lib/types"
import { addDays, iso } from "../lib/dates"
import { useToast } from "../context/ToastContext"
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
    const queryClient = useQueryClient()

    const days = useMemo(
        () => [...Array(DAYS_AHEAD)].map((_, i) => addDays(new Date(), i)),
        []
    )
    const startIso = iso(days[0])
    const endIso = iso(days[days.length - 1])

    const { data: entries } = useQuery({
        queryKey: ["week", startIso, endIso],
        queryFn: () => apiPlanRange(startIso, endIso),
    })

    const byDate = useMemo(() => {
        const map: Record<string, PlanEntry> = {}
        for (const e of entries ?? []) if (e.meal_slot === "dinner") map[e.date] = e
        return map
    }, [entries])

    const assign = useMutation({
        mutationFn: (date: string) => apiAssign({ date, recipe_id: recipeId }),
        onSuccess: entry => {
            queryClient.invalidateQueries({ queryKey: ["week"] })
            queryClient.invalidateQueries({ queryKey: ["shortlist"] })
            queryClient.invalidateQueries({ queryKey: ["recommendations"] })
            queryClient.invalidateQueries({ queryKey: ["grocery"] })
            const when = new Date(`${entry.date}T00:00`).toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "short",
            })
            showToast(`${entry.recipe.title} → ${when}`)
            onClose()
        },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    return (
        <Modal title={`Plan "${recipeTitle}"`} onClose={onClose}>
            <p className={s.hint}>Pick a day. Anything already planned will be replaced.</p>
            <div className={s.days}>
                {days.map((day, i) => {
                    const dateIso = iso(day)
                    const taken = byDate[dateIso]
                    const isSame = taken?.recipe.id === recipeId
                    return (
                        <button
                            key={dateIso}
                            className={`${s.day} ${taken ? s.dayTaken : ""} ${isSame ? s.daySame : ""}`}
                            onClick={() => !isSame && assign.mutate(dateIso)}
                            disabled={assign.isPending || isSame}
                        >
                            <span className={s.dayName}>
                                {i === 0 ? "Today" : i === 1 ? "Tomorrow"
                                    : day.toLocaleDateString("en-GB", { weekday: "short" })}
                            </span>
                            <span className={s.dayNum}>
                                {day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                            <span className={s.dayTaken_label}>
                                {isSame ? "already here" : taken ? taken.recipe.title : "free"}
                            </span>
                        </button>
                    )
                })}
            </div>
        </Modal>
    )
}

export default DayPickerModal
