import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { imageBox, ingredientLabel, mealImage } from "../../lib/format"
import { setImage } from "../../store"
import { useRecipe } from "../../data/library"
import Icon from "../../components/Icon"
import PhotoPicker, { type PhotoChoice } from "../../components/PhotoPicker"
import DayPickerModal from "../../components/DayPickerModal"
import s from "./RecipePage.module.css"

function RecipePage() {
    const { id } = useParams()
    const [planning, setPlanning] = useState(false)
    const [editingPhoto, setEditingPhoto] = useState(false)
    const r = useRecipe(Number(id))

    if (!r) {
        return (
            <div className="page">
                <p>Recipe not found.</p>
                <Link to="/recipes" className="btn">
                    <Icon name="left" size={15} />
                    Back to library
                </Link>
            </div>
        )
    }

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
                    Library
                </Link>
                <button
                    className="btn primary"
                    onClick={() => setPlanning(true)}
                    data-tip="Add to a day on your plan"
                >
                    <Icon name="plus" size={16} />
                    Plan this
                </button>
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
                    {r.image_is_stock && <span className={s.stockTag}>stock photo</span>}
                    <button
                        className={s.photoToggle}
                        onClick={() => setEditingPhoto(v => !v)}
                        data-tip="Change this photo"
                    >
                        <Icon name="image" size={15} />
                        Photo
                    </button>
                </div>

                <div className={s.heroBody}>
                    <h1>{r.title}</h1>
                    <div className={s.meta}>
                        {r.protein_type}
                        {r.prep_time_minutes != null && <> · {r.prep_time_minutes} min</>}
                        {r.source === "ai" && <> · generated</>}
                    </div>
                    {r.calories != null && (
                        <div className={s.macroChips}>
                            <span className={s.chip}><b>{r.calories}</b> kcal</span>
                            <span className={s.chip}><b>{Math.round(r.protein_g ?? 0)}g</b> protein</span>
                            <span className={s.chip}><b>{Math.round(r.carbs_g ?? 0)}g</b> carbs</span>
                            <span className={s.chip}><b>{Math.round(r.sugar_g ?? 0)}g</b> sugar</span>
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
                    <h2>Ingredients</h2>
                    <ul className={s.ingredients}>
                        {r.ingredients.map(i => <li key={i.id}>{ingredientLabel(i)}</li>)}
                    </ul>
                </section>
                <section>
                    <h2>Instructions</h2>
                    <div className={s.instructions}>{r.instructions || "No instructions recorded."}</div>
                </section>
            </div>

            {planning && (
                <DayPickerModal
                    recipeId={r.id}
                    recipeTitle={r.title}
                    onClose={() => setPlanning(false)}
                />
            )}
        </div>
    )
}

export default RecipePage
