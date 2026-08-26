import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiAddPref, apiIngredientNames, apiProfile, apiRemovePref } from "../../lib/api"
import type { Stance } from "../../lib/types"
import { useToast } from "../../context/ToastContext"
import s from "./Profile.module.css"

function IngredientInput({ stance, onAdded }: { stance: Stance; onAdded: () => void }) {
    const [value, setValue] = useState("")
    const [hardFilter, setHardFilter] = useState(false)
    const { showToast } = useToast()

    const { data: suggestions } = useQuery({
        queryKey: ["ingredient-names", value],
        queryFn: () => apiIngredientNames(value),
        enabled: value.length > 0,
    })

    const add = useMutation({
        mutationFn: (name: string) => apiAddPref(name, stance, hardFilter),
        onSuccess: () => {
            setValue("")
            setHardFilter(false)
            onAdded()
        },
        onError: (e: Error) => showToast(e.message, "error"),
    })

    const listId = `ing-${stance}`

    return (
        <form
            className={s.addRow}
            onSubmit={e => {
                e.preventDefault()
                if (value.trim()) add.mutate(value.trim())
            }}
        >
            <input
                className="field"
                value={value}
                list={listId}
                onChange={e => setValue(e.target.value)}
                placeholder={stance === "like" ? "e.g. garlic, feta…" : "e.g. olives, cilantro…"}
                aria-label={stance === "like" ? "ingredient you like" : "ingredient to avoid"}
            />
            <datalist id={listId}>
                {(suggestions ?? []).map(n => <option key={n} value={n} />)}
            </datalist>
            {stance === "avoid" && (
                <label className={s.hardToggle} title="never show recipes containing this">
                    <input
                        type="checkbox"
                        checked={hardFilter}
                        onChange={e => setHardFilter(e.target.checked)}
                    />
                    allergy
                </label>
            )}
            <button className="btn" type="submit" disabled={!value.trim() || add.isPending}>
                Add
            </button>
        </form>
    )
}

function Profile() {
    const queryClient = useQueryClient()
    const { showToast } = useToast()
    const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: apiProfile })

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ["profile"] })
        queryClient.invalidateQueries({ queryKey: ["recommendations"] })
        queryClient.invalidateQueries({ queryKey: ["deck"] })
    }

    const remove = useMutation({
        mutationFn: apiRemovePref,
        onSuccess: refresh,
        onError: (e: Error) => showToast(e.message, "error"),
    })

    if (isLoading || !data) return <div className="page" />

    const likes = data.ingredients.filter(i => i.stance === "like")
    const avoids = data.ingredients.filter(i => i.stance === "avoid")
    const { taste } = data

    return (
        <div className="page">
            <h1 className={s.title}>Your taste</h1>
            <p className={s.blurb}>
                Tell the app what you like and it'll weight suggestions accordingly — everywhere,
                not just here.
            </p>

            <div className={s.columns}>
                <section className={s.panel}>
                    <h2>♥ Ingredients you like</h2>
                    <IngredientInput stance="like" onAdded={refresh} />
                    <div className={s.tags}>
                        {likes.length === 0 && <span className={s.none}>Nothing yet.</span>}
                        {likes.map(i => (
                            <span key={i.id} className={`${s.tag} ${s.tagLike}`}>
                                {i.name}
                                <button onClick={() => remove.mutate(i.id)} aria-label={`remove ${i.name}`}>✕</button>
                            </span>
                        ))}
                    </div>
                </section>

                <section className={s.panel}>
                    <h2>✕ Ingredients to avoid</h2>
                    <IngredientInput stance="avoid" onAdded={refresh} />
                    <div className={s.tags}>
                        {avoids.length === 0 && <span className={s.none}>Nothing yet.</span>}
                        {avoids.map(i => (
                            <span key={i.id} className={`${s.tag} ${s.tagAvoid}`}>
                                {i.name}
                                {i.hard_filter && <em title="never shown">allergy</em>}
                                <button onClick={() => remove.mutate(i.id)} aria-label={`remove ${i.name}`}>✕</button>
                            </span>
                        ))}
                    </div>
                </section>
            </div>

            <section className={s.learned}>
                <h2>What the app has learned</h2>
                {!taste.has_signal ? (
                    <p className={s.none}>
                        Nothing yet — swipe a few recipes in Discover and this fills in.
                    </p>
                ) : (
                    <>
                        <div className={s.stats}>
                            <span><b>{taste.counts.liked}</b> liked</span>
                            <span><b>{taste.counts.passed}</b> passed</span>
                            <span><b>{taste.counts.hidden}</b> hidden</span>
                            <span><b>{taste.counts.planned}</b> planned</span>
                            <span><b>{taste.counts.cooked}</b> cooked</span>
                        </div>
                        {taste.likes.length > 0 && (
                            <div className={s.learnedRow}>
                                <span className={s.learnedLabel}>drawn to</span>
                                <div className={s.learnedTags}>
                                    {taste.likes.map(l => (
                                        <span key={l.name} className={`${s.tag} ${s.tagLike}`}>{l.name}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {taste.dislikes.length > 0 && (
                            <div className={s.learnedRow}>
                                <span className={s.learnedLabel}>steering clear of</span>
                                <div className={s.learnedTags}>
                                    {taste.dislikes.map(l => (
                                        <span key={l.name} className={`${s.tag} ${s.tagAvoid}`}>{l.name}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {Object.keys(taste.protein_share).length > 0 && (
                            <div className={s.learnedRow}>
                                <span className={s.learnedLabel}>recently</span>
                                <div className={s.learnedTags}>
                                    {Object.entries(taste.protein_share).map(([p, share]) => (
                                        <span key={p} className={s.tag}>
                                            {p} {Math.round(share * 100)}%
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    )
}

export default Profile
