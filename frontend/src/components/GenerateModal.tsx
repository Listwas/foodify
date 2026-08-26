import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiAssign, apiGenerate, apiPhotoSearch, apiSaveRecipe } from "../lib/api"
import type { RecipeCandidate } from "../lib/types"
import { imageBox, ingredientLabel, mealImage } from "../lib/format"
import { useToast } from "../context/ToastContext"
import Modal from "./Modal"
import PhotoPicker, { type PhotoChoice } from "./PhotoPicker"
import s from "./GenerateModal.module.css"

interface Props {
    date?: string
    onClose: () => void
}

const PROTEINS = ["chicken", "beef", "pork", "fish", "vegetarian"]
const TIMES = [20, 30, 45, 60]

function GenerateModal({ date, onClose }: Props) {
    const { showToast } = useToast()
    const queryClient = useQueryClient()

    const [protein, setProtein] = useState("")
    const [time, setTime] = useState("")
    const [mood, setMood] = useState("")
    const [candidate, setCandidate] = useState<RecipeCandidate | null>(null)
    const [photo, setPhoto] = useState<PhotoChoice>({
        image_url: null, image_is_stock: false, image_attribution: null,
    })

    const generate = useMutation({
        mutationFn: () =>
            apiGenerate({ protein, time_minutes: time ? Number(time) : null, mood }),
        onSuccess: async rec => {
            setCandidate(rec)
            setPhoto({ image_url: null, image_is_stock: false, image_attribution: null })
            // an invented recipe has no photo of its own, so borrow one of a
            // similar dish — clearly labelled, and swappable
            try {
                const found = await apiPhotoSearch(rec.title)
                if (found.length > 0) {
                    setPhoto({
                        image_url: found[0].url,
                        image_is_stock: true,
                        image_attribution:
                            found[0].attribution || `${found[0].title} by ${found[0].creator}`,
                    })
                }
            } catch {
                // no photo is a cosmetic loss; the recipe is still usable
            }
        },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    const save = useMutation({
        mutationFn: async (rec: RecipeCandidate) => {
            const saved = await apiSaveRecipe({ ...rec, ...photo })
            if (date) await apiAssign({ date, recipe_id: saved.id })
            return saved
        },
        onSuccess: saved => {
            queryClient.invalidateQueries({ queryKey: ["recipes"] })
            queryClient.invalidateQueries({ queryKey: ["protein-types"] })
            queryClient.invalidateQueries({ queryKey: ["week"] })
            queryClient.invalidateQueries({ queryKey: ["grocery"] })
            showToast(date ? `Planned: ${saved.title}` : `Saved: ${saved.title}`)
            onClose()
        },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    return (
        <Modal title="Generate something new" onClose={onClose}>
            {!candidate ? (
                <form
                    className={s.form}
                    onSubmit={e => {
                        e.preventDefault()
                        generate.mutate()
                    }}
                >
                    <label className={s.label}>
                        Protein
                        <select className="field" value={protein} onChange={e => setProtein(e.target.value)}>
                            <option value="">Anything</option>
                            {PROTEINS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>
                    <label className={s.label}>
                        Time available
                        <select className="field" value={time} onChange={e => setTime(e.target.value)}>
                            <option value="">Doesn't matter</option>
                            {TIMES.map(t => <option key={t} value={t}>under {t} min</option>)}
                        </select>
                    </label>
                    <label className={s.label}>
                        Mood / craving
                        <input
                            className="field"
                            value={mood}
                            onChange={e => setMood(e.target.value)}
                            placeholder="e.g. something spicy, cozy comfort food…"
                            maxLength={300}
                        />
                    </label>
                    <button className="btn primary" type="submit" disabled={generate.isPending}>
                        {generate.isPending ? "Cooking up an idea…" : "✨ Generate"}
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
                    <PhotoPicker
                        query={candidate.title}
                        value={photo}
                        onChange={setPhoto}
                        compact
                    />
                    <h3>{candidate.title}</h3>
                    <div className={s.meta}>
                        {candidate.protein_type}
                        {candidate.prep_time_minutes != null && <> · {candidate.prep_time_minutes} min</>}
                    </div>
                    {candidate.calories != null && (
                        <div className="macros">
                            {candidate.calories} kcal · P {candidate.protein_g}g · C {candidate.carbs_g}g · S {candidate.sugar_g}g
                        </div>
                    )}
                    <h4>Ingredients</h4>
                    <ul className={s.ingredients}>
                        {candidate.ingredients.map((ing, i) => <li key={i}>{ingredientLabel(ing)}</li>)}
                    </ul>
                    <h4>Instructions</h4>
                    <div className={s.instructions}>{candidate.instructions}</div>
                    <div className={s.actions}>
                        <button
                            className="btn primary"
                            onClick={() => save.mutate(candidate)}
                            disabled={save.isPending}
                        >
                            {save.isPending ? "Saving…" : date ? "Save & plan it" : "Save to library"}
                        </button>
                        <button
                            className="btn"
                            onClick={() => generate.mutate()}
                            disabled={generate.isPending}
                        >
                            {generate.isPending ? "Thinking…" : "Try another"}
                        </button>
                        <button className="btn ghost" onClick={() => setCandidate(null)}>Discard</button>
                    </div>
                </div>
            )}
        </Modal>
    )
}

export default GenerateModal
