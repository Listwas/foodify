import { useEffect, useRef, useState, type ReactNode } from "react"
import { useT } from "../lib/i18n"
import Icon, { type IconName } from "./Icon"
import s from "./Menu.module.css"

export interface MenuItem {
    label: string
    icon?: IconName
    onSelect: () => void
    danger?: boolean
}

/**
 * A small overflow menu.
 *
 * The plan used to carry three buttons on every one of seven rows. Keeping the
 * one action people use daily visible and folding the rest in here drops the
 * count from twenty-one controls to seven, without taking anything away.
 */
export function Menu({ items, label = "More actions", children }: {
    items: MenuItem[]
    label?: string
    children?: ReactNode
}) {
    const t = useT()
    const [open, setOpen] = useState(false)
    const wrap = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (!wrap.current?.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", onDown)
            document.removeEventListener("keydown", onKey)
        }
    }, [open])

    return (
        <div className={s.wrap} ref={wrap}>
            <button
                className={`btn ghost icon ${s.trigger} ${open ? s.triggerOpen : ""}`}
                onClick={() => setOpen(o => !o)}
                aria-label={t(label)}
                aria-expanded={open}
                data-tip={open ? undefined : t(label)}
            >
                {children ?? <Icon name="more" />}
            </button>
            {open && (
                <div className={s.menu} role="menu">
                    {items.map(item => (
                        <button
                            key={item.label}
                            role="menuitem"
                            className={`${s.item} ${item.danger ? s.danger : ""}`}
                            onClick={() => { setOpen(false); item.onSelect() }}
                        >
                            {item.icon && <Icon name={item.icon} size={16} />}
                            {t(item.label)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default Menu
