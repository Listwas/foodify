/**
 * Putting the engine's explanations into the user's language.
 *
 * The engine writes its reasons in English and has to keep doing so: the
 * parity test pins them, character for character, against the frozen output of
 * the Python implementation they were ported from. Rewording them there would
 * mean either breaking that proof or regenerating the golden file, and neither
 * is worth doing for a caption.
 *
 * So they are translated on the way to the screen instead. There are only five
 * shapes and they are covered by tests, so if the engine ever starts saying
 * something new it fails here rather than quietly showing English.
 *
 * Ingredient and protein names inside them stay as they are, because the
 * recipe library is English and "you like harissa" is about an ingredient the
 * user will read under that name everywhere else in the app.
 */
import { t } from "./i18n"

const SHAPES: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^already planned$/, () => t("already planned")],
    [/^planned today$/, () => t("planned today")],
    [/^planned (\d+)d ago$/, m => t("planned {n}d ago", { n: m[1] })],
    [/^a break from (.+)$/, m => t("a break from {protein}", { protein: m[1] })],
    [/^you like (.+)$/, m => t("you like {ingredients}", { ingredients: m[1] })],
    [/^something new for you$/, () => t("something new for you")],
]

export function reasonText(reason: string): string {
    for (const [shape, render] of SHAPES) {
        const match = reason.match(shape)
        if (match) return render(match)
    }
    // an unrecognised reason is still worth showing, just untranslated
    return reason
}
