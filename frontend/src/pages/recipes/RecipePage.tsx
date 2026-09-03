import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { imageBox, ingredientLabel, mealImage } from "../../lib/format"
import { kitchenQuantity, metricProse } from "../../lib/quantity"
import {
    clearFeedback, deleteRecipe, isLocalRecipe, restoreRecipe, servingsFor,
    setFeedback, setImage, setRecipeServings, useAppState,
} from "../../store"
import { BASE_SERVINGS } from "../../store/types"
import { useT } from "../../lib/i18n"
import { useTranslatable } from "../../lib/translate"
import { useFoodWord } from "../../lib/foodwords"
import TranslateToggle from "../../components/TranslateToggle"
import { useToast } from "../../context/ToastContext"
import { useRecipe, useRecipeMap } from "../../data/library"
import Icon from "../../components/Icon"
import ServingsStepper from "../../components/ServingsStepper"
import PhotoPicker, { type PhotoChoice } from "../../components/PhotoPicker"
import DayPickerModal from "../../components/DayPickerModal"
import RecipeFormModal from "../../components/RecipeFormModal"
import s from "./RecipePage.module.css"

function RecipePage() {
    const { id } = useParams()
    const [planning, setPlanning] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editingPhoto, setEditingPhoto] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const navigate = useNavigate()
    const { showToast } = useToast()
    const t = useT()
    const state = useAppState()
    const recipes = useRecipeMap()
    const r = useRecipe(Number(id))
    // Ingredients come from our own word list: instant, and right. The
    // method is prose and goes to the service, but only when asked.
    const food = useFoodWord()
    const method = useTranslatable(r?.instructions)

    if (!r) {
        return (
            <div className="page">
                <p>{t("Recipe not found.")}</p>
                <Link to="/recipes" className="btn">
                    <Icon name="left" size={15} />
                    {t("Library")}
                </Link>
            </div>
        )
    }

    const hidden = r.verdict === "hidden"
    const liked = r.verdict === "like"
    const servings = servingsFor(state, r.id)
    const img = mealImage(r.image_url, "hero")
    const photo: PhotoChoice = {
        image_url: r.image_url,
        image_is_stock: !!r.image_is_stock,
        image_attribution: r.image_attribution ?? null,
    }

    const applyPhoto = (choice: PhotoChoice) =>
        setImage(r.id, choice.image_url ? {
            url: choice.image_url,
            isStock: choice.image_is_stock,
            attribution: choice.image_attribution,
        } : null)

    return (
        <div className="page">
            <div className={s.topBar}>
                <Link to="/recipes" className={s.back}>
                    <Icon name="left" size={15} />
                    {t("Library")}
                </Link>
                <div className={s.topActions}>
                    <button
                        className={`btn ${liked ? s.likedBtn : ""}`}
                        onClick={() => {
                            if (liked) {
                                clearFeedback(r.id)
                                showToast(t("Removed from your likes"))
                            } else {
                                setFeedback(r.id, "like")
                                showToast(t("Liked. It'll come up more often."))
                            }
                        }}
                        aria-pressed={liked}
                        data-tip={liked
                            ? t("Remove your like")
                            : t("Tells the app to suggest this sort of thing more")}
                        data-tip-below
                    >
                        <Icon name="heart" size={16} filled={liked} />
                        {liked ? t("Liked") : t("Like")}
                    </button>
                    <button
                        className="btn"
                        onClick={() => setEditing(true)}
                        data-tip={t("Change anything about this recipe")}
                        data-tip-below
                    >
                        <Icon name="edit" size={16} />
                        {t("Edit")}
                    </button>
                    <button
                        className="btn"
                        onClick={() => {
                            if (hidden) {
                                clearFeedback(r.id)
                                showToast(t("Back in the library"))
                            } else {
                                setFeedback(r.id, "hidden")
                                showToast(t("Hidden. It won't be suggested again."))
                            }
                        }}
                        data-tip={hidden
                            ? t("Put it back in the library")
                            : t("Keep it out of the library and the deck")}
                        data-tip-below
                    >
                        <Icon name={hidden ? "undo" : "ban"} size={16} />
                        {hidden ? t("Unhide") : t("Hide")}
                    </button>
                    <button
                        className="btn primary"
                        onClick={() => setPlanning(true)}
                        data-tip={t("Add to a day on your plan")}
                    >
                        <Icon name="plus" size={16} />
                        {t("Plan this")}
                    </button>
                </div>
            </div>

            <div className={s.hero}>
                <div className={s.heroImgWrap}>
                    {img ? (
                        <img
                            className={`${s.heroImg} meal-img`}
                            src={img}
                            width={imageBox("hero")}
                            height={imageBox("hero")}
                            alt=""
                        />
                    ) : (
                        <div className={`${s.heroImg} ${s.heroPlaceholder}`}>
                            <Icon name={r.source === "ai" ? "sparkle" : "plate"} size={44} />
                        </div>
                    )}
                    {r.image_is_stock && <span className={s.stockTag}>{t("stock photo")}</span>}
                    <button
                        className={s.photoToggle}
                        onClick={() => setEditingPhoto(v => !v)}
                        data-tip={t("Change this photo")}
                    >
                        <Icon name="image" size={15} />
                        {t("Photo")}
                    </button>
                </div>

                <div className={s.heroBody}>
                    <h1>{r.title}</h1>
                    {(r.edited || r.copied_from || hidden) && (
                        <div className={s.marks}>
                            {hidden && (
                                <span className={`${s.mark} ${s.markHidden}`}>
                                    <Icon name="ban" size={12} />
                                    {t("hidden")}
                                </span>
                            )}
                            {r.edited && (
                                <>
                                    <span className={s.mark}>
                                        <Icon name="edit" size={12} />
                                        {t("modified")}
                                    </span>
                                    <button
                                        className={`btn ghost ${s.restore}`}
                                        onClick={() => {
                                            restoreRecipe(r.id)
                                            showToast(t("Original restored"))
                                        }}
                                        data-tip={t("Undo every change and go back to the shipped recipe")}
                                    >
                                        <Icon name="undo" size={14} />
                                        {t("Restore original")}
                                    </button>
                                </>
                            )}
                            {r.copied_from != null && (
                                <span className={s.mark}>
                                    <Icon name="plus" size={12} />
                                    {t("copy of")}{" "}
                                    <Link to={`/recipe/${r.copied_from}`}>
                                        {recipes.get(r.copied_from)?.title ?? t("another recipe")}
                                    </Link>
                                </span>
                            )}
                        </div>
                    )}
                    <div className={s.meta}>
                        {t(r.protein_type ?? "")}
                        {r.prep_time_minutes != null && <> · {r.prep_time_minutes} {t("min")}</>}
                        {r.source === "ai" && <> · {t("generated")}</>}
                    </div>
                    {r.calories != null && (
                        <div className={s.macroChips}>
                            <span className={s.chip}><b>{r.calories}</b> {t("kcal")}</span>
                            <span className={s.chip}><b>{Math.round(r.protein_g ?? 0)}g</b> {t("protein")}</span>
                            <span className={s.chip}><b>{Math.round(r.carbs_g ?? 0)}g</b> {t("carbs")}</span>
                            <span className={s.chip}><b>{Math.round(r.sugar_g ?? 0)}g</b> {t("sugar")}</span>
                        </div>
                    )}
                    {(editingPhoto || r.image_is_stock) && (
                        <div className={s.photoBox}>
                            <PhotoPicker query={r.title} value={photo} onChange={applyPhoto} compact />
                        </div>
                    )}
                </div>
            </div>

            <div className={s.columns}>
                <section>
                    <h2>{t("Ingredients")}</h2>
                    <ServingsStepper
                        className={s.servings}
                        value={servings}
                        base={BASE_SERVINGS}
                        onChange={next => setRecipeServings(r.id, next)}
                    />
                    <ul className={s.ingredients}>
                        {r.ingredients.map(i => (
                            <li key={i.id}>
                                {ingredientLabel({
                                    ...i,
                                    name: food(i.name),
                                    quantity: kitchenQuantity(i.quantity, servings / BASE_SERVINGS),
                                })}
                            </li>
                        ))}
                    </ul>
                </section>
                <section>
                    <div className={s.methodHead}>
                        <h2>{t("Instructions")}</h2>
                        <TranslateToggle state={method} />
                    </div>
                    <div className={`${s.instructions} ${method.busy ? "translating" : ""}`}>
                        {metricProse(method.shown) || t("No instructions recorded.")}
                    </div>
                </section>
            </div>

            {isLocalRecipe(r.id) && (
                <div className={s.danger}>
                    {confirmDelete ? (
                        <>
                            <span className={s.dangerText}>
                                Delete <strong>{r.title}</strong> for good? This can't be undone.
                            </span>
                            <button
                                className="btn danger"
                                onClick={() => {
                                    const name = r.title
                                    deleteRecipe(r.id)
                                    showToast(t("Deleted: {title}", { title: name }))
                                    navigate("/recipes")
                                }}
                            >
                                {t("Yes, delete it")}
                            </button>
                            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                                {t("Keep it")}
                            </button>
                        </>
                    ) : (
                        <button
                            className={`btn ghost ${s.deleteBtn}`}
                            onClick={() => setConfirmDelete(true)}
                        >
                            <Icon name="close" size={15} />
                            {t("Delete this recipe")}
                        </button>
                    )}
                </div>
            )}

            {planning && (
                <DayPickerModal
                    recipeId={r.id}
                    recipeTitle={r.title}
                    onClose={() => setPlanning(false)}
                />
            )}
            {editing && <RecipeFormModal recipe={r} onClose={() => setEditing(false)} />}
        </div>
    )
}

export default RecipePage
