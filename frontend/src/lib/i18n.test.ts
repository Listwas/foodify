import { beforeEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { getLang, plural, setLang, t } from "./i18n"
import { reasonText } from "./reasons"

beforeEach(() => setLang("en"))

describe("t", () => {
    it("leaves English alone", () => {
        expect(t("Shopping list")).toBe("Shopping list")
    })

    it("speaks Polish once asked to", () => {
        setLang("pl")
        expect(t("Shopping list")).toBe("Lista zakupów")
        expect(t("Dinner plan")).toBe("Plan obiadów")
    })

    /* A gap should read as an English sentence in a Polish screen, not as
       `shopping.empty.title`. That's the whole reason the key is the sentence. */
    it("falls back to the English it was given", () => {
        setLang("pl")
        expect(t("Something nobody has translated yet")).toBe("Something nobody has translated yet")
    })

    it("fills in the values", () => {
        setLang("pl")
        expect(t("Back: {title}", { title: "Rosół" })).toBe("Wraca: Rosół")
        expect(t("{ticked} of {total} in the basket", { ticked: 2, total: 9 }))
            .toBe("2 z 9 w koszyku")
    })

    it("leaves a placeholder it wasn't given a value for", () => {
        expect(t("Back: {title}")).toBe("Back: {title}")
    })
})

/*
 * Polish counts in three. Getting this wrong is the single most obvious tell
 * that nobody who speaks the language ever looked at the screen.
 */
describe("plural", () => {
    const forms = { one: "posiłek", few: "posiłki", many: "posiłków" }

    it("uses the singular for exactly one", () => {
        setLang("pl")
        expect(plural(1, forms)).toBe("posiłek")
    })

    it("uses the few-form for 2 to 4", () => {
        setLang("pl")
        for (const n of [2, 3, 4, 22, 33, 104]) expect(plural(n, forms)).toBe("posiłki")
    })

    it("uses the many-form for 5 and up, and for the teens", () => {
        setLang("pl")
        // 12, 13, 14 look like the few-form but are not: "12 posiłków"
        for (const n of [0, 5, 9, 11, 12, 13, 14, 25, 111]) {
            expect(plural(n, forms)).toBe("posiłków")
        }
    })

    it("reaches the right form through t()", () => {
        setLang("pl")
        expect(t("{n} meals", { n: 1 })).toBe("1 posiłek")
        expect(t("{n} meals", { n: 3 })).toBe("3 posiłki")
        expect(t("{n} meals", { n: 12 })).toBe("12 posiłków")
        setLang("en")
        expect(t("{n} meals", { n: 1 })).toBe("1 meals")
    })
})

describe("setLang", () => {
    it("switches, and survives having no browser around it", () => {
        setLang("pl")
        expect(getLang()).toBe("pl")
        setLang("en")
        expect(getLang()).toBe("en")
    })
})

/*
 * The engine has to keep writing these in English — the parity test pins them
 * against the frozen Python output — so they are translated on the way out.
 * If the engine ever starts saying something new, this notices.
 */
describe("reasonText", () => {
    it("translates every shape the engine can produce", () => {
        setLang("pl")
        expect(reasonText("already planned")).toBe("już zaplanowane")
        expect(reasonText("planned today")).toBe("zaplanowane dziś")
        expect(reasonText("planned 3d ago")).toBe("zaplanowane 3 dni temu")
        expect(reasonText("a break from chicken")).toBe("odpoczynek od chicken")
        expect(reasonText("you like harissa + feta")).toBe("lubisz harissa + feta")
        expect(reasonText("something new for you")).toBe("coś nowego dla ciebie")
    })

    it("passes anything it doesn't recognise straight through", () => {
        setLang("pl")
        expect(reasonText("some brand new reason")).toBe("some brand new reason")
    })

    it("covers what the engine actually emits", () => {
        // the shapes, lifted from engine/taste.ts, so a reworded reason there
        // fails here rather than silently showing English
        const source = readFileSync(new URL("../engine/taste.ts", import.meta.url), "utf8")
        const emitted = [...source.matchAll(/reasons\.(?:push|unshift)\(([^\n]+)\)/g)]
        expect(emitted.length).toBe(5)
        setLang("pl")
        // every literal reason in the engine must be recognised
        for (const literal of ["already planned", "something new for you"]) {
            expect(source).toContain(literal)
            expect(reasonText(literal)).not.toBe(literal)
        }
    })
})
