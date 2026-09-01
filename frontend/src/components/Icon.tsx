/**
 * One icon language for the whole app.
 *
 * What was here before was a mix of emoji (✨ 🚫 🍽), Unicode symbols (⇄ ✓ ↺ ◑)
 * and text, which rendered at different weights and sizes on every platform and
 * was the main reason the UI looked untidy. These are all one stroke weight,
 * inherit `currentColor`, and align on the same 24px grid.
 */
import type { ReactNode } from "react"

const PATHS = {
    check: <polyline points="4 12.5 9.5 18 20 6.5" />,
    close: <path d="M6 6 18 18M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    swap: <path d="M7 8h12m-3-3 3 3-3 3M17 16H5m3-3-3 3 3 3" />,
    ban: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
    heart: (
        <path d="M12 20.4C12 20.4 3.6 15 3.6 9.3A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.4 2.7c0 5.7-8.4 11.1-8.4 11.1z" />
    ),
    undo: <path d="M9 14 4 9l5-5M20 20v-7a4 4 0 0 0-4-4H4" />,
    edit: <path d="M4 20.2l.9-4.4L15.7 5a2.6 2.6 0 0 1 3.7 3.7L8.6 19.4l-4.6.8zM14.3 6.5l3.7 3.7" />,
    sparkle: (
        <><path d="M12 3.5 13.5 9 19 10.5 13.5 12 12 17.5 10.5 12 5 10.5 10.5 9z" />
            <path d="M18.5 16.5 19 18.5 21 19l-2 .5-.5 2-.5-2L16 19l2-.5z" /></>
    ),
    plate: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /></>,
    more: (
        <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>
    ),
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
    filter: <path d="M3.5 5h17l-6.5 7.5V19l-4 2v-8.5z" />,
    left: <polyline points="14.5 5 8 12 14.5 19" />,
    right: <polyline points="9.5 5 16 12 9.5 19" />,
    calendar: (
        <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" /></>
    ),
    list: (
        <><path d="M9 6.5h11M9 12h11M9 17.5h11" />
            <circle cx="4.8" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="4.8" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="4.8" cy="17.5" r="1.2" fill="currentColor" stroke="none" /></>
    ),
    compass: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z" /></>,
    theme: <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z" />,
    upload: <path d="M12 16V4m-4.5 4.5L12 4l4.5 4.5M4 15.5V20h16v-4.5" />,
    image: (
        <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
            <circle cx="8.75" cy="9.75" r="1.75" />
            <path d="M20.5 15.5 15.5 10.5 5 20" /></>
    ),
    download: <path d="M12 4v12m-4.5-4.5L12 16l4.5-4.5M4 19.5h16" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, filled = false, className }: {
    name: IconName
    size?: number
    /** Solid rather than outlined — used for the heart once a recipe is liked. */
    filled?: boolean
    className?: string
}) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {PATHS[name]}
        </svg>
    )
}

export default Icon
