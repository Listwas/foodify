import { useState } from "react"
import type { RecipeCandidate } from "../lib/types"
import { generateRecipe } from "../lib/generate"
import { searchPhotos } from "../lib/photos"
import { imageBox, ingredientLabel, mealImage } from "../lib/format"
import { useT } from "../lib/i18n"
import { useToast } from "../context/ToastContext"
import { addRecipe, assign } from "../store"
import Icon from "./Icon"
import Modal from "./Modal"
import PhotoPicker, { type PhotoChoice } from "./PhotoPicker"
import s from "./GenerateModal.module.css"

interface Props {
    date?: string
    onClose: () => void
}

const PROTEINS = ["chicken", "beef", "pork", "fish", "vegetarian"]
const TIMES = [20, 30, 45, 60]
const NO_PHOTO: PhotoChoice = {
    image_url: null, image_is_stock: false, image_attribution: null,
}

function GenerateModal({ date, onClose }: Props) {
    const { showToast } = useToast()
    const t = useT()

    const [protein, setProtein] = useState("")
    const [time, setTime] = useState("")
    const [mood, setMood] = useState("")
    const [candidate, setCandidate] = useState<RecipeCandidate | null>(null)
    const [photo, setPhoto] = useState<PhotoChoice>(NO_PHOTO)
    const [busy, setBusy] = useState(false)

    const generate = async () => {
        setBusy(true)
        try {
            const recipe = await generateRecipe({
                protein,
                time_minutes: time ? Number(time) : null,
                mood,
            })
            setCandidate(recipe)
            setPhoto(NO_PHOTO)
            // an invented recipe has no photo of its own, so borrow one of a
            // similar dish — clearly labelled, and swappable
            const found = await searchPhotos(recipe.title)
            if (found.length > 0) {
                setPhoto({
                    image_url: found[0].url,
                    image_is_stock: true,
                    image_attribution:
                        found[0].attribution || `${found[0].title} by ${found[0].creator}`,
                })
            }
        } catch (e) {
            showToast((e as Error).message, "error")
        } finally {
            setBusy(false)
        }
    }

    const save = () => {
        if (!candidate) return
        const saved = addRecipe({ ...candidate, source: "ai", ...photo })
        if (date) assign(saved.id, date)
        showToast(date
            ? t("Planned: {title}", { title: saved.title })
            : t("Saved: {title}", { title: saved.title }))
        onClose()
    }

    return (
        <Modal title={t("Generate something new")} onClose={onClose}>
            {!candidate ? (
                <form
                    className={s.form}
                    onSubmit={e => { e.preventDefault(); void generate() }}
                >
                    <label className={s.label}>
                        Protein
                        <select className="field" value={protein} onChange={e => setProtein(e.target.value)}>
                            <option value="">{t("Anything")}</option>
                            {PROTEINS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>
                    <label className={s.label}>
                        Time available
                        <select className="field" value={time} onChange={e => setTime(e.target.value)}>
                            <option value="">{t("Doesn't matter")}</option>
                            {TIMES.map(t => <option key={t} value={t}>under {t} min</option>)}
                        </select>
                    </label>
                    <label className={s.label}>
                        Mood / craving
                        <input
                            className="field"
                            value={mood}
                            onChange={e => setMood(e.target.value)}
                            placeholder={t("e.g. something spicy, cozy comfort food…")}
                            maxLength={300}
                        />
                    </label>
                    <button className="btn primary" type="submit" disabled={busy}>
                        <Icon name="sparkle" size={16} />
                        {busy ? t("Cooking up an idea…") : "Generate"}
                    </button>
                </form>
            ) : (
                <div className={s.result}>
                    {photo.image_url && (
                        <img
                            className={`${s.photo} meal-img`}
                            src={mealImage(photo.image_url, "hero")!}
                            width={imageBox("hero")}
                            height={imageBox("hero")}
                            alt=""
                        />
                    )}
                    <PhotoPicker query={candidate.title} value={photo} onChange={setPhoto} compact />
                    <h3>{candidate.title}</h3>
                    <div className={s.meta}>
                        {candidate.protein_type}
                        {candidate.prep_time_minutes != null && <> · {candidate.prep_time_minutes} {t("min")}</>}
                    </div>
                    {candidate.calories != null && (
                        <div className="macros">
                            {candidate.calories} kcal · P {candidate.protein_g}g · C {candidate.carbs_g}g · S {candidate.sugar_g}g
                        </div>
                    )}
                    <h4>{t("Ingredients")}</h4>
                    <ul className={s.ingredients}>
                        {candidate.ingredients.map((ing, i) => <li key={i}>{ingredientLabel(ing)}</li>)}
                    </ul>
                    <h4>{t("Instructions")}</h4>
                    <div className={s.instructions}>{candidate.instructions}</div>
                    <div className={s.actions}>
                        <button className="btn primary" onClick={save} disabled={busy}>
                            {date ? t("Save & plan it") : t("Save to library")}
                        </button>
                        <button className="btn" onClick={() => void generate()} disabled={busy}>
                            {busy ? t("Thinking…") : t("Try another")}
                        </button>
                        <button className="btn ghost" onClick={() => setCandidate(null)}>{t("Discard")}</button>
                    </div>
                </div>
            )}
        </Modal>
    )
}

export default GenerateModal
