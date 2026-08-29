import { useRef, useState } from "react"
import { searchPhotos } from "../lib/photos"
import type { StockPhoto } from "../lib/types"
import { fileToSquareDataUrl, ImageError } from "../lib/image"
import { useToast } from "../context/ToastContext"
import Icon from "./Icon"
import s from "./PhotoPicker.module.css"

export interface PhotoChoice {
    image_url: string | null
    image_is_stock: boolean
    image_attribution: string | null
}

interface Props {
    /** what to search for when looking up a stock photo */
    query: string
    value: PhotoChoice
    onChange: (choice: PhotoChoice) => void
    compact?: boolean
}

/**
 * Photo controls shared by the generate flow and the recipe page.
 *
 * A generated recipe has no real photo, so we borrow an openly-licensed one of
 * a similar dish — and say so plainly rather than passing it off as the real
 * thing. Reroll walks the search results; uploading your own replaces it with
 * something that genuinely is your dinner.
 */
function PhotoPicker({ query, value, onChange, compact }: Props) {
    const { showToast } = useToast()
    const fileInput = useRef<HTMLInputElement>(null)
    const [results, setResults] = useState<StockPhoto[]>([])
    const [cursor, setCursor] = useState(0)
    const [page, setPage] = useState(1)
    const [busy, setBusy] = useState(false)

    const applyPhoto = (photo: StockPhoto) =>
        onChange({
            image_url: photo.url,
            image_is_stock: true,
            image_attribution: photo.attribution || `${photo.title} by ${photo.creator}`,
        })

    const reroll = async () => {
        setBusy(true)
        try {
            // walk the current page first, then fetch the next one
            const next = cursor + 1
            if (next < results.length) {
                setCursor(next)
                applyPhoto(results[next])
                return
            }
            const nextPage = results.length ? page + 1 : 1
            const found = await searchPhotos(query, nextPage)
            if (found.length === 0) {
                showToast(
                    results.length ? "No more photos for this dish" : "No photos found for this dish",
                    "error"
                )
                return
            }
            setResults(found)
            setPage(nextPage)
            setCursor(0)
            applyPhoto(found[0])
        } catch (e) {
            showToast((e as Error).message, "error")
        } finally {
            setBusy(false)
        }
    }

    const upload = async (file: File | undefined) => {
        if (!file) return
        setBusy(true)
        try {
            const dataUrl = await fileToSquareDataUrl(file)
            // your own photo is of the real dish, so it isn't stock any more
            onChange({ image_url: dataUrl, image_is_stock: false, image_attribution: null })
            showToast("Photo updated")
        } catch (e) {
            showToast(e instanceof ImageError ? e.message : "Couldn't use that image", "error")
        } finally {
            setBusy(false)
            if (fileInput.current) fileInput.current.value = ""
        }
    }

    return (
        <div className={`${s.wrap} ${compact ? s.compact : ""}`}>
            {value.image_is_stock && value.image_url && (
                <div className={s.notice}>
                    <span className={s.badge}>stock photo</span>
                    <span className={s.noticeText}>
                        A photo of a similar dish, not this exact recipe.
                    </span>
                </div>
            )}
            {value.image_is_stock && value.image_attribution && (
                <div className={s.credit}>{value.image_attribution}</div>
            )}

            <div className={s.actions}>
                <button
                    type="button"
                    className="btn"
                    onClick={reroll}
                    disabled={busy || !query}
                    data-tip="Try a different photo"
                >
                    <Icon name={value.image_url ? "swap" : "search"} size={15} />
                    {busy ? "…" : value.image_url ? "Reroll photo" : "Find a photo"}
                </button>
                <button
                    type="button"
                    className="btn"
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                    data-tip="Use a photo from your device"
                >
                    <Icon name="upload" size={15} />
                    Upload your own
                </button>
                {value.image_url && (
                    <button
                        type="button"
                        className="btn ghost icon"
                        onClick={() =>
                            onChange({ image_url: null, image_is_stock: false, image_attribution: null })
                        }
                        aria-label="remove the photo"
                        data-tip="Remove the photo"
                    >
                        <Icon name="close" size={16} />
                    </button>
                )}
            </div>

            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={e => upload(e.target.files?.[0])}
            />
        </div>
    )
}

export default PhotoPicker
