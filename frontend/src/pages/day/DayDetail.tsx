import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { dayLong, iso, startOfWeek } from "../../lib/dates"
import { imageBox, ingredientLabel, mealImage } from "../../lib/format"
import { kitchenQuantity, metricProse } from "../../lib/quantity"
import { useToast } from "../../context/ToastContext"
import { markCooked, servingsFor, setCheck, setDayServings, useAppState } from "../../store"
import { BASE_SERVINGS, groceryKey, planKey } from "../../store/types"
import { useRecipeMap } from "../../data/library"
import Icon from "../../components/Icon"
import ServingsStepper from "../../components/ServingsStepper"
import SuggestModal from "../../components/SuggestModal"
import GenerateModal from "../../components/GenerateModal"
import s from "./DayDetail.module.css"

const SLOT = "dinner"

function DayDetail() {
    const { date } = useParams()
    const { showToast } = useToast()
    const [modal, setModal] = useState<"suggest" | "generate" | null>(null)
    const state = useAppState()
    const recipes = useRecipeMap()

    const slot = date ? state.plan[planKey(date)] : undefined
    const recipe = slot && recipes.get(slot.recipeId)

    if (!date || !slot || !recipe) {
        return (
            <div className="page">
                <p>This meal isn't planned anymore.</p>
                <Link to="/" className="btn">
                    <Icon name="left" size={15} />
                    Back to the week
                </Link>
            </div>
        )
    }

    const cooked = slot.status === "completed"
    const servings = servingsFor(state, recipe.id, date, SLOT)
    const items = recipe.ingredients.map(i => ({
        ...i,
        quantity: kitchenQuantity(i.quantity, servings / BASE_SERVINGS),
        checked: state.grocery[groceryKey(date, SLOT, i.id)] ?? false,
    }))
    const checkedCount = items.filter(i => i.checked).length

    const cook = () => {
        markCooked(date, !cooked)
        showToast(cooked ? "Marked as not cooked" : "Marked as cooked")
    }

    return (
        <div className="page">
            <div className={s.top}>
                <Link to="/" className={s.back}>
                    <Icon name="left" size={15} />
                    Week
                </Link>
                <div className={s.dateLine}>{dayLong(new Date(`${date}T00:00`))} · {SLOT}</div>
                <button
                    className={`btn ${cooked ? "primary" : ""}`}
                    onClick={cook}
                    data-tip="Cooking it teaches the app what you actually make"
                >
                    <Icon name="check" size={16} />
                    {cooked ? "Cooked" : "Mark cooked"}
                </button>
                <button className="btn" onClick={() => setModal("suggest")} data-tip="Swap for something else">
                    <Icon name="swap" size={16} />
                    Swap
                </button>
            </div>

            <div className={s.hero}>
                {mealImage(recipe.image_url, "hero") && (
                    <img
                        className={`${s.heroImg} meal-img`}
                        src={mealImage(recipe.image_url, "hero")!}
                        width={imageBox("hero")}
                        height={imageBox("hero")}
                        alt=""
                    />
                )}
                <div className={s.heroBody}>
                    <h1>{recipe.title}</h1>
                    <div className={s.meta}>
                        {recipe.protein_type}
                        {recipe.prep_time_minutes != null && <> · {recipe.prep_time_minutes} min</>}
                        {recipe.source === "ai" && <> · generated</>}
                    </div>
                    {recipe.calories != null && (
                        <div className={s.macroChips}>
                            <span className={s.chip}><b>{recipe.calories}</b> kcal</span>
                            <span className={s.chip}><b>{Math.round(recipe.protein_g ?? 0)}g</b> protein</span>
                            <span className={s.chip}><b>{Math.round(recipe.carbs_g ?? 0)}g</b> carbs</span>
                            <span className={s.chip}><b>{Math.round(recipe.sugar_g ?? 0)}g</b> sugar</span>
                        </div>
                    )}
                    <Link to={`/recipe/${recipe.id}`} className={s.fullLink}>Full recipe →</Link>
                </div>
            </div>

            <div className={s.columns}>
                <section className={s.groceries}>
                    <h2>
                        Groceries
                        <span className={s.count}>{checkedCount}/{items.length}</span>
                    </h2>
                    <ServingsStepper
                        className={s.servings}
                        value={servings}
                        base={BASE_SERVINGS}
                        onChange={next => setDayServings(date, next, SLOT)}
                    />
                    <ul className={s.checklist}>
                        {items.map(item => (
                            <li key={item.id}>
                                <label className={item.checked ? s.checked : ""}>
                                    <input
                                        type="checkbox"
                                        checked={item.checked}
                                        onChange={e => setCheck(date, SLOT, item.id, e.target.checked)}
                                    />
                                    <span>{ingredientLabel(item)}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <Link
                        to={`/shopping/${iso(startOfWeek(new Date(`${date}T00:00`)))}`}
                        className={s.weekLink}
                    >
                        <Icon name="list" size={14} />
                        Everything for this week
                    </Link>
                </section>

                <section className={s.instructions}>
                    <h2>Instructions</h2>
                    <div className={s.instructionsText}>
                        {metricProse(recipe.instructions) || "No instructions recorded."}
                    </div>
                </section>
            </div>

            {modal === "suggest" && (
                <SuggestModal
                    date={date}
                    currentRecipeId={recipe.id}
                    onGenerate={() => setModal("generate")}
                    onClose={() => setModal(null)}
                />
            )}
            {modal === "generate" && (
                <GenerateModal date={date} onClose={() => setModal(null)} />
            )}
        </div>
    )
}

export default DayDetail
