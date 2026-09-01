import { MAX_SERVINGS, MIN_SERVINGS } from "../store/types"
import Icon from "./Icon"
import s from "./ServingsStepper.module.css"

/**
 * How many people this is being cooked for.
 *
 * Sits directly above the ingredients it rewrites, because the whole control is
 * only meaningful next to the numbers it changes. Once it's off the recipe's
 * own size it says the multiplier out loud, so nobody has to wonder whether the
 * amounts underneath moved.
 */
function ServingsStepper({ value, base, onChange, className }: {
    value: number
    /** What the recipe as written serves. */
    base: number
    onChange: (next: number) => void
    className?: string
}) {
    const factor = Math.round((value / base) * 100) / 100

    return (
        <div className={`${s.wrap} ${className ?? ""}`}>
            <span className={s.label}>Serves</span>
            <div className={s.stepper}>
                <button
                    className={s.step}
                    onClick={() => onChange(value - 1)}
                    disabled={value <= MIN_SERVINGS}
                    aria-label="one fewer serving"
                >
                    <Icon name="minus" size={15} />
                </button>
                <span className={s.value} aria-live="polite">{value}</span>
                <button
                    className={s.step}
                    onClick={() => onChange(value + 1)}
                    disabled={value >= MAX_SERVINGS}
                    aria-label="one more serving"
                >
                    <Icon name="plus" size={15} />
                </button>
            </div>
            {factor !== 1 && <span className={s.factor}>amounts &times;{factor}</span>}
        </div>
    )
}

export default ServingsStepper
