import { useMemo, useRef, useState } from "react"
import type { RecipeCandidate, RecipeFull } from "../lib/types"
import type { RecipeEdit } from "../store/types"
import { useToast } from "../context/ToastContext"
import { addRecipe, assign, editRecipe } from "../store"
import { useProteinTypes } from "../data/library"
import { useIndex } from "../data/taste"
import { guessCategory } from "../engine"
import Icon from "./Icon"
import Modal from "./Modal"
import PhotoPicker, { type PhotoChoice } from "./PhotoPicker"
import s from "./RecipeFormModal.module.css"

interface Props {
    /** when set, the form edits this recipe instead of creating one */
    recipe?: RecipeFull
    /** when set, a newly created recipe goes straight onto this day */
    date?: string
    onClose: () => void
}

interface Row {
    /** kept from the original where possible, so ticked groceries survive an edit */
    id?: number
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
const str = (v: number | null | undefined) => (v == null ? "" : String(v))

/**
 * Write down a recipe of your own, or change one that's already here.
 *
 * Only a title and one ingredient are required. Everything else is optional and
 * stays out of the way until asked for, because most of the time somebody is
 * copying a dish they already know rather than filling in a database record.
 */
function RecipeFormModal({ recipe, date, onClose }: Props) {
    const { showToast } = useToast()
    const proteins = useProteinTypes()
    const editing = !!recipe

    const [title, setTitle] = useState(recipe?.title ?? "")
    const [protein, setProtein] = useState(recipe?.protein_type ?? "")
    const [time, setTime] = useState(str(recipe?.prep_time_minutes))
    const [instructions, setInstructions] = useState(recipe?.instructions ?? "")
    const [rows, setRows] = useState<Row[]>(() =>
        recipe?.ingredients.length
            ? recipe.ingredients.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit }))
            : [emptyRow(), emptyRow(), emptyRow()]
    )
    const [photo, setPhoto] = useState<PhotoChoice>(
        recipe
            ? {
                image_url: recipe.image_url,
                image_is_stock: !!recipe.image_is_stock,
                image_attribution: recipe.image_attribution ?? null,
            }
            : NO_PHOTO
    )
    const [showNutrition, setShowNutrition] = useState(
        !!recipe && recipe.calories != null
    )
    const [macros, setMacros] = useState({
        calories: str(recipe?.calories),
        protein_g: str(recipe?.protein_g),
        carbs_g: str(recipe?.carbs_g),
        sugar_g: str(recipe?.sugar_g),
    })
    const [touched, setTouched] = useState(false)
    const lastRow = useRef<HTMLInputElement>(null)

    const filled = rows.filter(r => r.name.trim())

    // Worked out from the ingredients as they're typed, using the categories
    // the shipped library already carries. Offered, never applied: it is right
    // about three times in four, which is a good default and a bad decision.
    const index = useIndex()
    const guess = useMemo(
        () => (filled.length ? guessCategory(index, filled) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [index, filled.map(r => r.name).join("|")]
    )
    const titleMissing = touched && !title.trim()
    const ingredientsMissing = touched && filled.length === 0

    const setRow = (i: number, patch: Partial<Row>) =>
        setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

    const addRow = () => {
        setRows(rs => [...rs, emptyRow()])
        requestAnimationFrame(() => lastRow.current?.focus())
    }

    const removeRow = (i: number) =>
        setRows(rs => (rs.length === 1 ? [emptyRow()] : rs.filter((_, j) => j !== i)))

    /** New rows get ids above anything this recipe already uses. */
    const numberedIngredients = () => {
        let next = Math.max(0, ...rows.map(r => r.id ?? 0)) + 1
        return filled.map(r => ({
            id: r.id ?? next++,
            name: r.name.trim(),
            quantity: r.quantity.trim(),
            unit: r.unit.trim(),
        }))
    }

    /**
     * The category the recipe will be filed under.
     *
     * Left blank, the guess is used rather than nothing: a recipe with no
     * category sits outside everything the engine does with them, and the
     * suggestion has been on screen the whole time, so this is a default
     * being taken up rather than a decision made behind anyone's back.
     */
    const category = () => protein.trim() || guess?.category || null

    const common = () => ({
        title: title.trim(),
        protein_type: category(),
        prep_time_minutes: num(time),
        instructions: instructions.trim(),
        calories: num(macros.calories),
        protein_g: num(macros.protein_g),
        carbs_g: num(macros.carbs_g),
        sugar_g: num(macros.sugar_g),
    })

    const valid = () => {
        setTouched(true)
        return !!title.trim() && filled.length > 0
    }

    const saveNew = (copiedFrom: number | null) => {
        if (!valid()) return
        const candidate: RecipeCandidate = {
            ...common(),
            source: "custom",
            image_url: photo.image_url,
            image_is_stock: photo.image_is_stock,
            image_attribution: photo.image_attribution,
            copied_from: copiedFrom,
            ingredients: numberedIngredients().map(({ name, quantity, unit }) =>
                ({ name, quantity, unit })),
        }
        const saved = addRecipe(candidate)
        if (date) assign(saved.id, date)
        // say so when the category was filled in for them, so a wrong guess is
        // something they can see and go back for
        const filedAs = !protein.trim() && saved.protein_type
            ? `, filed under ${saved.protein_type}`
            : ""
        showToast(
            copiedFrom ? `Copied: ${saved.title}`
                : date ? `Planned: ${saved.title}${filedAs}`
                    : `Saved: ${saved.title}${filedAs}`
        )
        onClose()
    }

    const saveChanges = () => {
        if (!recipe || !valid()) return
        const patch: RecipeEdit = { ...common(), ingredients: numberedIngredients() }
        editRecipe(recipe.id, patch)
        showToast(`Updated: ${patch.title}`)
        onClose()
    }

    return (
        <Modal title={editing ? "Edit recipe" : "Add your own recipe"} onClose={onClose}>
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
                        {/* Left empty this is the one thing the engine can't
                            learn from a recipe, so it offers an answer rather
                            than quietly filing the dish under nothing. */}
                        {guess && !protein && (
                            <button
                                type="button"
                                className={s.guess}
                                onClick={() => setProtein(guess.category)}
                            >
                                <Icon name="sparkle" size={13} />
                                Looks like <b>{guess.category}</b> &mdash; use it
                            </button>
                        )}
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
                    {editing ? (
                        <>
                            <button type="button" className="btn primary" onClick={saveChanges}>
                                Save changes
                            </button>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => saveNew(recipe!.id)}
                                data-tip="Keeps the original as it was"
                            >
                                <Icon name="plus" size={15} />
                                Save as a copy
                            </button>
                        </>
                    ) : (
                        <button type="button" className="btn primary" onClick={() => saveNew(null)}>
                            {date ? "Save & plan it" : "Save to library"}
                        </button>
                    )}
                    <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </Modal>
    )
}

export default RecipeFormModal
