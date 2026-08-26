import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiGrocery, apiMarkCooked, apiPlanRange, apiRecipe, apiSetCheck } from "../../lib/api"
import type { GroceryList } from "../../lib/types"
import { dayLong } from "../../lib/dates"
import { imageBox, ingredientLabel, mealImage } from "../../lib/format"
import { useToast } from "../../context/ToastContext"
import SuggestModal from "../../components/SuggestModal"
import GenerateModal from "../../components/GenerateModal"
import s from "./DayDetail.module.css"

function DayDetail() {
    const { id } = useParams()
    const { showToast } = useToast()
    const queryClient = useQueryClient()
    const [modal, setModal] = useState<"suggest" | "generate" | null>(null)

    const grocery = useQuery({
        queryKey: ["grocery", id],
        queryFn: () => apiGrocery(id!),
        retry: (count, err) => !(err instanceof Error && err.message.includes("not found")) && count < 2,
    })
    const recipeId = grocery.data?.recipe_id
    const recipe = useQuery({
        queryKey: ["recipe", recipeId],
        queryFn: () => apiRecipe(recipeId!),
        enabled: recipeId != null,
    })

    // the plan entry carries the cooked flag; the grocery payload doesn't
    const plan = useQuery({
        queryKey: ["plan-entry", id, grocery.data?.date],
        queryFn: () => apiPlanRange(grocery.data!.date, grocery.data!.date),
        enabled: !!grocery.data?.date,
    })
    const entry = plan.data?.find(p => p.id === Number(id))

    const cook = useMutation({
        mutationFn: (completed: boolean) => apiMarkCooked(Number(id), completed),
        onSuccess: e => {
            queryClient.invalidateQueries({ queryKey: ["plan-entry"] })
            queryClient.invalidateQueries({ queryKey: ["week"] })
            // cooking it is the strongest signal the recommender gets
            queryClient.invalidateQueries({ queryKey: ["recommendations"] })
            queryClient.invalidateQueries({ queryKey: ["profile"] })
            showToast(e.status === "completed" ? "Marked as cooked 🍳" : "Marked as not cooked")
        },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    const toggle = useMutation({
        mutationFn: ({ ingredientId, checked }: { ingredientId: number; checked: boolean }) =>
            apiSetCheck(Number(id), ingredientId, checked),
        onMutate: async ({ ingredientId, checked }) => {
            await queryClient.cancelQueries({ queryKey: ["grocery", id] })
            const previous = queryClient.getQueryData<GroceryList>(["grocery", id])
            queryClient.setQueryData<GroceryList>(["grocery", id], old =>
                old && {
                    ...old,
                    items: old.items.map(i =>
                        i.ingredient_id === ingredientId ? { ...i, checked } : i
                    ),
                }
            )
            return { previous }
        },
        onError: (e: Error, _vars, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(["grocery", id], ctx.previous)
            showToast(e.message, "error")
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["grocery", id] }),
    })

    if (grocery.isLoading) return <div className="page" />
    if (grocery.isError || !grocery.data) {
        return (
            <div className="page">
                <p>This meal isn't planned anymore.</p>
                <Link to="/" className="btn">‹ Back to the week</Link>
            </div>
        )
    }

    const g = grocery.data
    const r = recipe.data
    const date = new Date(`${g.date}T00:00`)
    const checkedCount = g.items.filter(i => i.checked).length

    return (
        <div className="page">
            <div className={s.top}>
                <Link to="/" className={s.back}>‹ Week</Link>
                <div className={s.dateLine}>
                    {dayLong(date)} · {g.meal_slot}
                </div>
                <button
                    className={`btn ${entry?.status === "completed" ? "primary" : ""}`}
                    onClick={() => cook.mutate(entry?.status !== "completed")}
                    disabled={cook.isPending || !entry}
                    data-tip="Cooking it teaches the app what you actually make"
                >
                    {entry?.status === "completed" ? "✓ Cooked" : "Mark cooked"}
                </button>
                <button
                    className="btn"
                    onClick={() => setModal("suggest")}
                    data-tip="Swap for something else"
                >
                    ⇄ Swap
                </button>
            </div>

            <div className={s.hero}>
                {r && mealImage(r.image_url, "hero") && (
                    <img
                        className={`${s.heroImg} meal-img`}
                        src={mealImage(r.image_url, "hero")!}
                        width={imageBox("hero")}
                        height={imageBox("hero")}
                        alt=""
                    />
                )}
                <div className={s.heroBody}>
                    <h1>{g.recipe_title}</h1>
                    {r && (
                        <div className={s.meta}>
                            {r.protein_type}
                            {r.prep_time_minutes != null && <> · {r.prep_time_minutes} min</>}
                            {r.source === "ai" && <> · ✨ generated</>}
                        </div>
                    )}
                    {r && r.calories != null && (
                        <div className={s.macroChips}>
                            <span className={s.chip}><b>{r.calories}</b> kcal</span>
                            <span className={s.chip}><b>{Math.round(r.protein_g ?? 0)}g</b> protein</span>
                            <span className={s.chip}><b>{Math.round(r.carbs_g ?? 0)}g</b> carbs</span>
                            <span className={s.chip}><b>{Math.round(r.sugar_g ?? 0)}g</b> sugar</span>
                        </div>
                    )}
                </div>
            </div>

            <div className={s.columns}>
                <section className={s.groceries}>
                    <h2>
                        Groceries
                        <span className={s.count}>{checkedCount}/{g.items.length}</span>
                    </h2>
                    <ul className={s.checklist}>
                        {g.items.map(item => (
                            <li key={item.ingredient_id}>
                                <label className={item.checked ? s.checked : ""}>
                                    <input
                                        type="checkbox"
                                        checked={item.checked}
                                        onChange={e =>
                                            toggle.mutate({
                                                ingredientId: item.ingredient_id,
                                                checked: e.target.checked,
                                            })
                                        }
                                    />
                                    <span>{ingredientLabel(item)}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={s.instructions}>
                    <h2>Instructions</h2>
                    <div className={s.instructionsText}>
                        {r ? r.instructions || "No instructions recorded." : "…"}
                    </div>
                </section>
            </div>

            {modal === "suggest" && (
                <SuggestModal
                    date={g.date}
                    currentRecipeId={g.recipe_id}
                    onGenerate={() => setModal("generate")}
                    onClose={() => setModal(null)}
                />
            )}
            {modal === "generate" && (
                <GenerateModal date={g.date} onClose={() => setModal(null)} />
            )}
        </div>
    )
}

export default DayDetail
