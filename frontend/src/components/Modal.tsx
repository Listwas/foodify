import { useEffect } from "react"
import { useT } from "../lib/i18n"
import s from "./Modal.module.css"

interface Props {
    title: string
    onClose: () => void
    children: React.ReactNode
}

function Modal({ title, onClose, children }: Props) {
    const t = useT()
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
        window.addEventListener("keydown", onKey)
        document.body.style.overflow = "hidden"
        return () => {
            window.removeEventListener("keydown", onKey)
            document.body.style.overflow = ""
        }
    }, [onClose])

    return (
        <div className={s.backdrop} onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className={s.modal} role="dialog" aria-modal="true" aria-label={title}>
                <div className={s.header}>
                    <h2>{title}</h2>
                    <button className={s.close} onClick={onClose} aria-label={t("Close")}>✕</button>
                </div>
                <div className={s.body}>{children}</div>
            </div>
        </div>
    )
}

export default Modal
