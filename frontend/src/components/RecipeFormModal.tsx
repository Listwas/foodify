import { useRef, useState } from "react"
import type { RecipeCandidate } from "../lib/types"
import { useToast } from "../context/ToastContext"
import { addRecipe, assign } from "../store"
import { useProteinTypes } from "../data/library"
import Icon from "./Icon"
import Modal from "./Modal"
import PhotoPicker, { type PhotoChoice } from "./PhotoPicker"
import s from "./RecipeFormModal.module.css"

interface Props {
    /** when set, the saved recipe goes straight onto this day */
    date?: string
    onClose: () => void
}

interface Row {
    name: string
    quantity: string
    unit: string
}

const emptyRow = (): Row => ({ name: "", quantity: "", unit: "" })
const NO_PHOTO: PhotoChoice = { image_url: null, image_is_stock: false, image_attribution: null }

const num = (v: string) => {
    const n = Number(v)
    return v.trim() === "" || Number.isNaN(n) ? null : n
}

/**
 * Write down a recipe of your own.
 *
 * Only a title and one ingredient are required. Everything else is optional and
 * stays out of the way until asked for, because most of the time somebody is
 * copying a dish they already know rather than filling in a database record.
 */
function RecipeFormModal({ date, onClose }: Props) {
    const { showToast } = useToast()
    const proteins = useProteinTypes()

    const [title, setTitle] = useState("")
    const [protein, setProtein] = useState("")
    const [time, setTime] = useState("")
    const [instructions, setInstructions] = useState("")
    const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()])
    const [photo, setPhoto] = useState<PhotoChoice>(NO_PHOTO)
    const [showNutrition, setShowNutrition] = useState(false)
    const [macros, setMacros] = useState({ calories: "", protein_g: "", carbs_g: "", sugar_g: "" })
    const [touched, setTouched] = useState(false)
    const lastRow = useRef<HTMLInputElement>(null)

    const filled = rows.filter(r => r.name.trim())
    const titleMissing = touched && !title.trim()
    const ingredientsMissing = touched && filled.length === 0

    const setRow = (i: number, patch: Partial<Row>) =>
        setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

    const addRow = () => {
        setRows(rs => [...rs, emptyRow()])
        // focus lands on the new field after it renders
        requestAnimationFrame(() => lastRow.current?.focus())
    }

    const removeRow = (i: number) =>
        setRows(rs => (rs.length === 1 ? [emptyRow()] : rs.filter((_, j) => j !== i)))

    const save = () => {
        setTouched(true)
        if (!title.trim() || filled.length === 0) return

        const candidate: RecipeCandidate = {
            title: title.trim(),
            source: "custom",
            protein_type: protein || null,
            prep_time_minutes: num(time),
            instructions: instructions.trim(),
            calories: num(macros.calories),
            protein_g: num(macros.protein_g),
            carbs_g: num(macros.carbs_g),
            sugar_g: num(macros.sugar_g),
            image_url: photo.image_url,
            image_is_stock: photo.image_is_stock,
            image_attribution: photo.image_attribution,
            ingredients: filled.map(r => ({
                name: r.name.trim(),
                quantity: r.quantity.trim(),
                unit: r.unit.trim(),
            })),
        }

        const saved = addRecipe(candidate)
        if (date) assign(saved.id, date)
        showToast(date ? `Planned: ${saved.title}` : `Saved: ${saved.title}`)
        onClose()
    }

    return (
        <Modal title="Add your own recipe" onClose={onClose}>
            <div className={s.form}>
                <label className={s.field}>
                    <span className={s.label}>Name</span>
                    <input
                        className="field"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Grandma's tomato soup"
                        maxLength={140}
                        autoFocus
                    />
                    {titleMissing && <span className={s.error}>Give it a name first.</span>}
                </label>

                <div className={s.pair}>
                    <label className={s.field}>
                        <span className={s.label}>Main ingredient</span>
                        <input
                            className="field"
                            value={protein}
                            onChange={e => setProtein(e.target.value.toLowerCase())}
                            placeholder="chicken"
                            list="known-proteins"
                            maxLength={24}
                        />
                        <datalist id="known-proteins">
                            {proteins.map(p => <option key={p} value={p} />)}
                        </datalist>
                    </label>
                    <label className={s.field}>
                        <span className={s.label}>Minutes</span>
                        <input
                            className="field"
                            value={time}
                            onChange={e => setTime(e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="30"
                            inputMode="numeric"
                            maxLength={4}
                        />
                    </label>
                </div>

                <div className={s.field}>
                    <span className={s.label}>Ingredients</span>
                    <div className={s.rows}>
                        {rows.map((row, i) => (
                            <div key={i} className={s.row}>
                                <input
                                    className={`field ${s.qty}`}
                                    value={row.quantity}
                                    onChange={e => setRow(i, { quantity: e.target.value })}
                                    placeholder="200"
                                    aria-label={`quantity for ingredient ${i + 1}`}
                                />
                                <input
                                    className={`field ${s.unit}`}
                                    value={row.unit}
                                    onChange={e => setRow(i, { unit: e.target.value })}
                                    placeholder="g"
                                    aria-label={`unit for ingredient ${i + 1}`}
                                />
                                <input
                                    ref={i === rows.length - 1 ? lastRow : undefined}
                                    className={`field ${s.name}`}
                                    value={row.name}
                                    onChange={e => setRow(i, { name: e.target.value })}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" && i === rows.length - 1) {
                                            e.preventDefault()
                                            addRow()
                                        }
                                    }}
                                    placeholder="tinned tomatoes"
                                    aria-label={`ingredient ${i + 1}`}
                                />
                                <button
                                    type="button"
                                    className={`btn ghost icon ${s.drop}`}
                                    onClick={() => removeRow(i)}
                                    aria-label={`remove ingredient ${i + 1}`}
                                >
                                    <Icon name="close" size={15} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button type="button" className={`btn ghost ${s.addRow}`} onClick={addRow}>
                        <Icon name="plus" size={15} />
                        Add ingredient
                    </button>
                    {ingredientsMissing && <span className={s.error}>Add at least one ingredient.</span>}
                </div>

                <label className={s.field}>
                    <span className={s.label}>How to make it</span>
                    <textarea
                        className={`field ${s.steps}`}
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        placeholder={"1. Soften the onions.\n2. Add everything else.\n3. Simmer 20 minutes."}
                        rows={5}
                    />
                </label>

                <div className={s.field}>
                    <span className={s.label}>Photo</span>
                    {photo.image_url && (
                        <img className={`${s.preview} meal-img`} src={photo.image_url} alt="" />
                    )}
                    <PhotoPicker query={title} value={photo} onChange={setPhoto} compact />
                </div>

                <button
                    type="button"
                    className={`btn ghost ${s.toggle}`}
                    onClick={() => setShowNutrition(v => !v)}
                    aria-expanded={showNutrition}
                >
                    <Icon name={showNutrition ? "minus" : "plus"} size={15} />
                    Nutrition, if you know it
                </button>

                {showNutrition && (
                    <div className={s.macros}>
                        {([
                            ["calories", "kcal"],
                            ["protein_g", "protein g"],
                            ["carbs_g", "carbs g"],
                            ["sugar_g", "sugar g"],
                        ] as const).map(([key, label]) => (
                            <label key={key} className={s.field}>
                                <span className={s.label}>{label}</span>
                                <input
                                    className="field"
                                    value={macros[key]}
                                    onChange={e =>
                                        setMacros(m => ({
                                            ...m,
                                            [key]: e.target.value.replace(/[^0-9.]/g, ""),
                                        }))
                                    }
                                    inputMode="decimal"
                                    maxLength={6}
                                />
                            </label>
                        ))}
                    </div>
                )}

                <div className={s.actions}>
                    <button type="button" className="btn primary" onClick={save}>
                        {date ? "Save & plan it" : "Save to library"}
                    </button>
                    <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </Modal>
    )
}

export default RecipeFormModal
