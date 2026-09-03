/**
 * Two languages, no library.
 *
 * The dictionary is keyed on the English sentence rather than on invented ids
 * like `shopping.empty.title`. That keeps the source readable — `t("This week")`
 * says what it renders — and it means a missing translation falls back to
 * perfectly good English instead of showing a key to the user.
 *
 * What is *not* translated: the recipes. Titles, ingredients and methods are
 * the shipped library, 511 of them in English, and machine-translating a
 * recipe is how you end up cooking something else. The app speaks Polish; the
 * cookbook it came with doesn't.
 */
import { useSyncExternalStore } from "react"

export const LANGUAGES = { en: "English", pl: "Polski" } as const
export type Lang = keyof typeof LANGUAGES

/**
 * Polish counts in three: one thing, a few things, and a lot of things.
 * "1 posiłek", "2 posiłki", "5 posiłków" — using the wrong one is the tell
 * that nobody who speaks the language ever read the screen.
 */
export interface Plural {
    one: string
    few: string
    many: string
}

type Entry = string | Plural

const STORAGE_KEY = "lang"

const DICT: Record<string, Entry> = {
    // --- navigation and page titles ---
    "Plan": "Plan",
    "Discover": "Odkrywaj",
    "Recipes": "Przepisy",
    "Taste": "Smak",
    "Dinner plan": "Plan obiadów",
    "Shopping list": "Lista zakupów",
    "Recipe library": "Biblioteka przepisów",
    "Swipe history": "Historia przesunięć",
    "Your taste": "Twój smak",
    "Settings": "Ustawienia",

    // --- the week ---
    "Week": "Tydzień",
    "Month": "Miesiąc",
    "This week": "Ten tydzień",
    "This month": "Ten miesiąc",
    "Previous": "Poprzedni",
    "Next": "Następny",
    "Previous week": "Poprzedni tydzień",
    "Next week": "Następny tydzień",
    "Jump to today": "Skocz do dziś",
    "Jump to this week": "Skocz do tego tygodnia",
    "Plan something": "Zaplanuj coś",
    "Open recipe & groceries": "Otwórz przepis i zakupy",
    "Mark as cooked": "Oznacz jako ugotowane",
    "Cooked, tap to undo": "Ugotowane, kliknij by cofnąć",
    "Swap meal": "Zamień danie",
    "Clear day": "Wyczyść dzień",
    "Marked as cooked": "Oznaczone jako ugotowane",
    "Marked as not cooked": "Oznaczone jako nieugotowane",
    "Day cleared": "Dzień wyczyszczony",
    "Shopping": "Zakupy",
    "Everything this week needs, added up": "Wszystko na ten tydzień, zsumowane",

    // --- a day ---
    "Week view": "Widok tygodnia",
    "This meal isn't planned anymore.": "To danie nie jest już zaplanowane.",
    "Back to the week": "Wróć do tygodnia",
    "Mark cooked": "Oznacz ugotowane",
    "Cooked": "Ugotowane",
    "Swap": "Zamień",
    "Swap for something else": "Zamień na coś innego",
    "Cooking it teaches the app what you actually make":
        "Gotowanie uczy aplikację, co naprawdę robisz",
    "Groceries": "Zakupy",
    "Instructions": "Sposób przygotowania",
    "Method": "Sposób przygotowania",
    "Ingredients": "Składniki",
    "No instructions recorded.": "Brak zapisanego sposobu przygotowania.",
    "Full recipe →": "Pełny przepis →",
    "Everything for this week": "Wszystko na ten tydzień",
    "Serves": "Porcje",
    "amounts ×{factor}": "ilości ×{factor}",
    "one fewer serving": "jedna porcja mniej",
    "one more serving": "jedna porcja więcej",
    "kcal": "kcal",
    "protein": "białko",
    "carbs": "węglowodany",
    "sugar": "cukry",
    "generated": "wygenerowane",
    "min": "min",

    // --- discover ---
    "History": "Historia",
    "Everything you've swiped": "Wszystko, co przesunąłeś",
    "Swipe or use ← → keys, ↑ for what's in it. Everything you keep trains what the app suggests everywhere else.":
        "Przesuwaj lub użyj strzałek ← →, ↑ pokazuje skład. Wszystko, co zachowasz, uczy aplikację.",
    "Dealing cards…": "Rozdaję karty…",
    "You've been through everything for now.": "Na razie przejrzałeś wszystko.",
    "Browse the library": "Przeglądaj bibliotekę",
    "Details": "Szczegóły",
    "close details": "zamknij szczegóły",
    "Yes": "Tak",
    "Pass": "Pomiń",
    "Hide": "Ukryj",
    "pass": "pomiń",
    "hide": "ukryj",
    "like": "polub",
    "undo last swipe": "cofnij ostatnie przesunięcie",
    "Pass, not right now": "Pomiń, nie teraz",
    "Hide, never show me this": "Ukryj, nigdy tego nie pokazuj",
    "Undo last swipe": "Cofnij ostatnie przesunięcie",
    "Like, add to your list": "Polub, dodaj do listy",
    "Nothing to undo": "Nie ma czego cofnąć",
    "Back: {title}": "Wraca: {title}",
    "{n} swiped": { one: "{n} przesunięcie", few: "{n} przesunięcia", many: "{n} przesunięć" },

    // --- history ---
    "All": "Wszystkie",
    "Liked": "Polubione",
    "Passed": "Pominięte",
    "Hidden": "Ukryte",
    "Go find something.": "Idź coś znaleźć.",
    "Forget this decision": "Zapomnij tę decyzję",
    "Nothing here is permanent. Change your mind whenever you like, and anything you passed on drifts back into the deck after a few months on its own.":
        "Nic tu nie jest na stałe. Możesz zmienić zdanie kiedy chcesz, a pominięte przepisy same wracają do talii po kilku miesiącach.",
    "best matches first": "najlepiej dopasowane najpierw",
    "Reset, it'll come back around": "Zresetowane, wróci do puli",
    "today": "dziś",
    "yesterday": "wczoraj",
    "{n} days ago": { one: "{n} dzień temu", few: "{n} dni temu", many: "{n} dni temu" },
    "{n} months ago": {
        one: "{n} miesiąc temu", few: "{n} miesiące temu", many: "{n} miesięcy temu",
    },

    // --- the library ---
    "Search recipes…": "Szukaj przepisów…",
    "Filters": "Filtry",
    "Protein": "Białko",
    "Nutrition": "Wartości",
    "Status": "Status",
    "Clear all": "Wyczyść",
    "Nothing hidden yet.": "Nic jeszcze nie ukryte.",
    "Nothing matches. Try a different search.": "Nic nie pasuje. Spróbuj inaczej.",
    "Add your own": "Dodaj własny",
    "Generate": "Wygeneruj",
    "AI-made": "Zrobione przez AI",
    "under 500 kcal": "poniżej 500 kcal",
    "35g+ protein": "35g+ białka",
    "low carb ≤20g": "mało węgli ≤20g",
    "low sugar ≤5g": "mało cukru ≤5g",
    "yours": "twoje",
    "Nothing here yet.": "Jeszcze nic tu nie ma.",
    "Hidden recipes": "Ukryte przepisy",
    "Unhidden": "Odkryte",
    "Put it back in the library": "Przywróć do biblioteki",
    "Back in the library": "Z powrotem w bibliotece",
    "Removed from your likes": "Usunięte z polubionych",
    "Remove your like": "Usuń polubienie",
    "Like this": "Polub to",
    "Add to a day on your plan": "Dodaj do dnia w planie",
    "Never show me this": "Nigdy mi tego nie pokazuj",
    "{n} recipes": { one: "{n} przepis", few: "{n} przepisy", many: "{n} przepisów" },

    // --- a recipe ---
    "Recipe not found.": "Nie znaleziono przepisu.",
    "Library": "Biblioteka",
    "Like": "Polub",
    "Liked. It'll come up more often.": "Polubione. Będzie pojawiać się częściej.",
    "Tells the app to suggest this sort of thing more":
        "Mówi aplikacji, żeby proponowała takie rzeczy częściej",
    "Edit": "Edytuj",
    "Change anything about this recipe": "Zmień cokolwiek w tym przepisie",
    "Unhide": "Odkryj",
    "Hidden. It won't be suggested again.": "Ukryte. Nie będzie już proponowane.",
    "Keep it out of the library and the deck": "Trzymaj z dala od biblioteki i talii",
    "Plan this": "Zaplanuj to",
    "Photo": "Zdjęcie",
    "Change this photo": "Zmień to zdjęcie",
    "stock photo": "zdjęcie stockowe",
    "hidden": "ukryte",
    "modified": "zmodyfikowane",
    "Restore original": "Przywróć oryginał",
    "Original restored": "Oryginał przywrócony",
    "Undo every change and go back to the shipped recipe":
        "Cofnij wszystkie zmiany i wróć do oryginalnego przepisu",
    "copy of": "kopia",
    "another recipe": "innego przepisu",
    "Delete this recipe": "Usuń ten przepis",
    "Yes, delete it": "Tak, usuń",
    "Keep it": "Zostaw",
    "Deleted: {title}": "Usunięto: {title}",

    // --- forms ---
    "Add your own recipe": "Dodaj własny przepis",
    "Edit recipe": "Edytuj przepis",
    "Name": "Nazwa",
    "Grandma's tomato soup": "Pomidorowa babci",
    "Give it a name first.": "Najpierw nadaj nazwę.",
    "Main ingredient": "Główny składnik",
    "Minutes": "Minuty",
    "Add at least one ingredient.": "Dodaj przynajmniej jeden składnik.",
    "How to make it": "Jak to zrobić",
    "Add an ingredient": "Dodaj składnik",
    "Save to library": "Zapisz w bibliotece",
    "Save & plan it": "Zapisz i zaplanuj",
    "Save changes": "Zapisz zmiany",
    "Save as a copy": "Zapisz jako kopię",
    "Keeps the original as it was": "Zostawia oryginał bez zmian",
    "Cancel": "Anuluj",
    "Add": "Dodaj",
    "Looks like": "Wygląda na",
    "use it": "użyj",
    "Saved: {title}": "Zapisano: {title}",
    "Planned: {title}": "Zaplanowano: {title}",
    "Copied: {title}": "Skopiowano: {title}",
    "Updated: {title}": "Zaktualizowano: {title}",
    ", filed under {category}": ", w kategorii {category}",

    // --- generating ---
    "Generate something new": "Wygeneruj coś nowego",
    "Anything": "Cokolwiek",
    "Doesn't matter": "Bez znaczenia",
    "Cooking up an idea…": "Wymyślam pomysł…",
    "Thinking…": "Myślę…",
    "Try another": "Spróbuj innego",
    "Discard": "Odrzuć",

    // --- suggest / day picker ---
    "What's for dinner?": "Co na obiad?",
    "Any protein": "Dowolne białko",
    "Any time": "Dowolny czas",
    "Skip": "Pomiń",
    "Surprise me": "Zaskocz mnie",
    "No recipes match those filters": "Żaden przepis nie pasuje do tych filtrów",
    "Pick a day. Anything already planned will be replaced.":
        "Wybierz dzień. To, co już zaplanowane, zostanie zastąpione.",
    "Today": "Dziś",
    "Tomorrow": "Jutro",

    // --- photos ---
    "Find a photo": "Znajdź zdjęcie",
    "Reroll photo": "Losuj inne zdjęcie",
    "Try a different photo": "Spróbuj innego zdjęcia",
    "Use a photo from your device": "Użyj zdjęcia z urządzenia",
    "Remove the photo": "Usuń zdjęcie",
    "Photo updated": "Zdjęcie zaktualizowane",
    "No photos found for this dish": "Nie znaleziono zdjęć tego dania",
    "No more photos for this dish": "Nie ma więcej zdjęć tego dania",
    "Couldn't use that image": "Nie udało się użyć tego obrazu",

    // --- shopping ---
    "{ticked} of {total} in the basket": "{ticked} z {total} w koszyku",
    "{n} cooked meals left out": {
        one: "{n} ugotowany posiłek pominięty",
        few: "{n} ugotowane posiłki pominięte",
        many: "{n} ugotowanych posiłków pominiętych",
    },
    "Reset": "Reset",
    "Start the list again": "Zacznij listę od nowa",
    "Everything unticked": "Wszystko odznaczone",
    "Copy": "Kopiuj",
    "Copy the list as text": "Skopiuj listę jako tekst",
    "List copied": "Lista skopiowana",
    "Couldn't copy the list": "Nie udało się skopiować listy",
    "Add something: milk, 2 kg potatoes, bin bags":
        "Dodaj coś: mleko, 2 kg ziemniaków, worki na śmieci",
    "add an item to this week's list": "dodaj rzecz do listy na ten tydzień",
    "Nothing planned for this week, and nothing added yet.":
        "Nic nie zaplanowane na ten tydzień i nic nie dodane.",
    "Go to the plan": "Przejdź do planu",
    "Off this week's list": "Poza listą na ten tydzień",
    "Put them all back": "Przywróć wszystko",
    "Put it back on the list": "Przywróć na listę",
    "Already got it": "Już to mam",
    "Delete": "Usuń",
    "for {n}": "dla {n}",
    "cooked": "ugotowane",
    "{n} meals": { one: "{n} posiłek", few: "{n} posiłki", many: "{n} posiłków" },
    "some": "trochę",

    // --- why the engine picked something (see lib/reasons.ts) ---
    "already planned": "już zaplanowane",
    "planned today": "zaplanowane dziś",
    "planned {n}d ago": "zaplanowane {n} dni temu",
    "a break from {protein}": "odpoczynek od {protein}",
    "you like {ingredients}": "lubisz {ingredients}",
    "something new for you": "coś nowego dla ciebie",

    // --- where things are in the shop ---
    "Fruit & veg": "Owoce i warzywa",
    "Meat & fish": "Mięso i ryby",
    "Dairy & eggs": "Nabiał i jajka",
    "Bakery": "Pieczywo",
    "Frozen": "Mrożonki",
    "Cupboard": "Spiżarnia",
    "Herbs & spices": "Zioła i przyprawy",
    "Other": "Inne",

    // --- taste ---
    "Tell the app what you like and it'll weight suggestions accordingly, everywhere in the app and not just here.":
        "Powiedz aplikacji, co lubisz, a dopasuje propozycje wszędzie, nie tylko tutaj.",
    "Ingredients you like": "Składniki, które lubisz",
    "Ingredients to avoid": "Składniki do unikania",
    "Nothing yet.": "Jeszcze nic.",
    "allergy": "alergia",
    "never show recipes containing this": "nigdy nie pokazuj przepisów z tym składnikiem",
    "ingredient you like": "składnik, który lubisz",
    "ingredient to avoid": "składnik do unikania",
    "e.g. garlic, feta…": "np. garlic, feta…",
    "e.g. olives, cilantro…": "np. olives, cilantro…",
    "remove {name}": "usuń {name}",
    "What the app has learned": "Czego nauczyła się aplikacja",
    "Nothing yet. Swipe a few recipes in Discover and this fills in.":
        "Jeszcze nic. Przesuń kilka przepisów w Odkrywaj, a to się wypełni.",
    "liked": "polubione",
    "passed": "pominięte",
    "planned": "zaplanowane",
    "drawn to": "ciągnie cię do",
    "steering clear of": "omijasz",
    "recently": "ostatnio",

    // --- settings ---
    "Appearance": "Wygląd",
    "Currently {theme}.": "Obecnie {theme}.",
    "dark": "ciemny",
    "light": "jasny",
    "Switch to {theme}": "Przełącz na {theme}",
    "Language": "Język",
    "The app's own words. Recipes stay in English.":
        "Język aplikacji. Przepisy zostają po angielsku.",
    "Your data": "Twoje dane",
    "Everything lives in this browser. Nothing is uploaded anywhere. A backup file is also the only way to move your plan to another device.":
        "Wszystko żyje w tej przeglądarce. Nic nigdzie nie jest wysyłane. Plik kopii to jedyny sposób, by przenieść plan na inne urządzenie.",
    "Export": "Eksportuj",
    "Import": "Importuj",
    "Backup restored": "Kopia przywrócona",
    "That file isn't a Foodify backup": "Ten plik to nie kopia Foodify",
    "Wipe all data": "Wymaż wszystkie dane",
    "Clears your plan, every swipe, your ingredient preferences, groceries and any recipe you wrote. There is no undo and no copy on a server.":
        "Czyści plan, każde przesunięcie, preferencje składników, zakupy i każdy napisany przez ciebie przepis. Nie ma cofnięcia ani kopii na serwerze.",
    "Back up first": "Najpierw zrób kopię",
    "Yes, wipe everything": "Tak, wymaż wszystko",
    "Everything wiped. Starting fresh.": "Wszystko wymazane. Zaczynamy od nowa.",
    "Recipe data from": "Dane przepisów z",

    // --- shell ---
    "There's nothing here": "Nic tu nie ma",
    "That address doesn't match anything in Foodify.":
        "Ten adres nie pasuje do niczego w Foodify.",
    "Back to the plan": "Wróć do planu",
    "Foodify couldn't start": "Foodify nie mogło wystartować",
    "Try again": "Spróbuj ponownie",
    "More actions": "Więcej akcji",
    "Close": "Zamknij",
}

function initial(): Lang {
    const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY)
    if (saved === "pl" || saved === "en") return saved
    // a Polish browser gets a Polish app without being asked
    const preferred = typeof navigator === "undefined" ? "" : navigator.language
    return preferred.toLowerCase().startsWith("pl") ? "pl" : "en"
}

let current: Lang = initial()
const listeners = new Set<() => void>()

// index.html is served with lang="en", so a session that starts in Polish has
// to correct it here rather than only when the language is switched — the
// attribute is what a screen reader picks its pronunciation from.
if (typeof document !== "undefined") document.documentElement.lang = current

export const getLang = () => current

export function setLang(next: Lang) {
    if (next === current) return
    current = next
    // both of these are absent under test and in any non-browser context, and
    // neither is worth failing a language change over
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
    if (typeof document !== "undefined") document.documentElement.lang = next
    listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
}

/** Which of Polish's three counting forms `n` takes. */
export function plural(n: number, forms: Plural): string {
    if (current === "en") return n === 1 ? forms.one : forms.many
    if (n === 1) return forms.one
    const tens = n % 100
    const ones = n % 10
    if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14)) return forms.few
    return forms.many
}

const fill = (text: string, params?: Record<string, string | number>) =>
    params
        ? text.replace(/\{(\w+)\}/g, (whole, key: string) =>
            key in params ? String(params[key]) : whole)
        : text

/**
 * The English sentence in, the current language out.
 *
 * Anything missing from the dictionary comes back exactly as it went in, so a
 * gap shows up as an English phrase in a Polish screen rather than as a broken
 * key — visible enough to fix, harmless enough to ship.
 */
export function t(text: string, params?: Record<string, string | number>): string {
    const entry = current === "en" ? undefined : DICT[text]
    if (typeof entry === "object") {
        const n = Number(params?.n ?? params?.count ?? 0)
        return fill(plural(n, entry), params)
    }
    return fill(entry ?? text, params)
}

/** Subscribes the component, so switching language repaints it. */
export function useT(): typeof t {
    useSyncExternalStore(subscribe, getLang, getLang)
    return t
}

export function useLang(): Lang {
    return useSyncExternalStore(subscribe, getLang, getLang)
}

/** For `toLocaleDateString`, which wants a BCP 47 tag rather than our key. */
export const locale = () => (current === "pl" ? "pl-PL" : "en-GB")
