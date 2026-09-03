import { useT } from "../lib/i18n"
import type { Translatable } from "../lib/translate"
import Icon from "./Icon"
import s from "./TranslateToggle.module.css"

/**
 * The button that translates a method, and puts it back.
 *
 * It states which of three things is true rather than leaving the reader to
 * infer it: working, showing a translation, or offering one. The text it
 * controls pulses while the request is out, so the thing about to change is
 * the thing that looks like it is changing — a spinner somewhere else in the
 * corner never made that connection.
 */
function TranslateToggle({ state }: { state: Translatable }) {
    const t = useT()
    if (!state.available) return null

    return (
        <button
            type="button"
            className={`${s.button} ${state.busy ? s.busy : ""}`}
            onClick={state.toggle}
            disabled={state.busy}
            aria-live="polite"
        >
            {state.busy ? (
                <>
                    <span className={s.dots} aria-hidden="true"><i /><i /><i /></span>
                    {t("Translating…")}
                </>
            ) : state.isTranslated ? (
                <>
                    <Icon name="undo" size={13} />
                    {t("Show the original")}
                </>
            ) : (
                <>
                    <Icon name="language" size={13} />
                    {state.failed ? t("Try translating again") : t("Translate")}
                </>
            )}
        </button>
    )
}

export default TranslateToggle
