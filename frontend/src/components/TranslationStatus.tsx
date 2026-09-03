import { useT, useLang } from "../lib/i18n"
import { useTranslateStatus } from "../lib/translate"
import Icon from "./Icon"
import s from "./TranslationStatus.module.css"

/**
 * Says out loud that the recipes are being translated.
 *
 * Without this the swap is invisible: a title sits there in English for a
 * second and then quietly becomes Polish, which reads as the page glitching
 * rather than as work being done. And when the day's free allowance runs out,
 * everything simply stays English with no explanation at all — which is the
 * more important half of this. It's a small corner pill rather than anything
 * blocking, because the English underneath is always readable meanwhile.
 */
function TranslationStatus() {
    const t = useT()
    const lang = useLang()
    const { busy, outOfQuota } = useTranslateStatus()

    if (lang === "en" || (!busy && !outOfQuota)) return null

    return (
        <div
            className={`${s.pill} ${outOfQuota ? s.spent : ""}`}
            role="status"
            aria-live="polite"
        >
            {outOfQuota ? (
                <>
                    <Icon name="ban" size={13} />
                    {t("Translation limit reached for today")}
                </>
            ) : (
                <>
                    <span className={s.dots} aria-hidden="true"><i /><i /><i /></span>
                    {t("Translating…")}
                </>
            )}
        </div>
    )
}

export default TranslationStatus
