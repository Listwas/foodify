import { Link, useLocation } from "react-router-dom"
import s from "./Nav.module.css"

function Nav() {
    const location = useLocation()

    const toggleTheme = () => {
        const current = document.documentElement.getAttribute("data-theme")
        const next = current === "light" ? "dark" : "light"
        document.documentElement.setAttribute("data-theme", next)
        localStorage.setItem("theme", next)
    }

    const isActive = (path: string) =>
        (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)) ? s.active : ""

    return (
        <div className={s.nav_outer}>
            <nav className={s.nav_container}>
                <Link to="/" className={s.logo}>foodify</Link>
                <Link to="/" className={`${s.nav_link} ${isActive("/")}`}>Plan</Link>
                <Link to="/discover" className={`${s.nav_link} ${isActive("/discover")}`}>Discover</Link>
                <Link to="/recipes" className={`${s.nav_link} ${isActive("/recipe")}`}>Recipes</Link>
                <Link to="/profile" className={`${s.nav_link} ${isActive("/profile")}`}>Taste</Link>
                <div className={s.spacer} />
                <button className={s.theme_btn} onClick={toggleTheme} aria-label="toggle theme">◑</button>
            </nav>
        </div>
    )
}

export function Footer() {
    return (
        <footer className="app-footer">
            foodify · recipe data from{" "}
            <a href="https://www.themealdb.com" target="_blank" rel="noopener noreferrer">TheMealDB</a>
        </footer>
    )
}

export default Nav
