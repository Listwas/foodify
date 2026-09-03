import { NavLink } from "react-router-dom"
import { useT } from "../lib/i18n"
import Icon, { type IconName } from "./Icon"
import s from "./Nav.module.css"

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
    { to: "/", label: "Plan", icon: "calendar", end: true },
    { to: "/discover", label: "Discover", icon: "compass" },
    { to: "/recipes", label: "Recipes", icon: "list" },
    { to: "/profile", label: "Taste", icon: "heart" },
]

/**
 * Top bar on desktop, bottom tab bar on phones.
 *
 * The app is installed to a home screen and used one-handed while standing in a
 * kitchen, so navigation belongs within reach of a thumb rather than in the far
 * corner of the screen.
 */
function Nav() {
    const t = useT()
    return (
        <nav className={s.nav}>
            <span className={s.logo}>foodify</span>
            <div className={s.tabs}>
                {TABS.map(tab => (
                    <NavLink
                        key={tab.to}
                        to={tab.to}
                        end={tab.end}
                        className={({ isActive }) => `${s.tab} ${isActive ? s.active : ""}`}
                    >
                        <Icon name={tab.icon} size={20} />
                        <span className={s.label}>{t(tab.label)}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    )
}

export default Nav
