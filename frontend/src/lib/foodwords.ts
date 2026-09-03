/**
 * The kitchen words, translated by hand.
 *
 * Two reasons this exists rather than sending everything to the service.
 *
 * Quality: a translator given the single word "Oil" with no sentence around it
 * has no way to know this is a kitchen, and MyMemory duly returned "Ropa" —
 * crude oil, the kind that comes out of the ground. Short ingredient names are
 * exactly where machine translation is weakest, and exactly where being wrong
 * is most visible.
 *
 * Reach: a few hundred names cover 84% of every ingredient mention in the
 * library, because every second recipe wants onion, garlic and salt. That is
 * what makes a hand-written list practical here at all — the shopping list and
 * the ingredient panel are translated instantly, offline, with no request to
 * make and no daily allowance to run out. A name that isn't here stays as the
 * library wrote it, which on a shopping list is worth more than a guess.
 */

import { useLang } from "./i18n"

const PL: Record<string, string> = {
    // the constants of every recipe
    "salt": "sól",
    "pepper": "pieprz",
    "black pepper": "czarny pieprz",
    "white pepper": "biały pieprz",
    "cayenne pepper": "pieprz cayenne",
    "peppercorns": "ziarna pieprzu",
    "salt and pepper": "sól i pieprz",
    "water": "woda",
    "sugar": "cukier",
    "brown sugar": "cukier trzcinowy",
    "caster sugar": "cukier drobny",
    "icing sugar": "cukier puder",
    "honey": "miód",
    "flour": "mąka",
    "plain flour": "mąka pszenna",
    "all purpose flour": "mąka uniwersalna",
    "cornstarch": "skrobia kukurydziana",
    "corn flour": "mąka kukurydziana",
    "breadcrumbs": "bułka tarta",
    "baking powder": "proszek do pieczenia",
    "yeast": "drożdże",

    // fats and liquids
    "oil": "olej",
    "olive oil": "oliwa z oliwek",
    "extra virgin olive oil": "oliwa z oliwek extra virgin",
    "vegetable oil": "olej roślinny",
    "sunflower oil": "olej słonecznikowy",
    "sesame seed oil": "olej sezamowy",
    "sesame oil": "olej sezamowy",
    "coconut oil": "olej kokosowy",
    "butter": "masło",
    "unsalted butter": "masło niesolone",
    "vinegar": "ocet",
    "red wine vinegar": "ocet z czerwonego wina",
    "white wine vinegar": "ocet z białego wina",
    "rice vinegar": "ocet ryżowy",
    "balsamic vinegar": "ocet balsamiczny",
    "white wine": "białe wino",
    "red wine": "czerwone wino",

    // the vegetable drawer
    "garlic": "czosnek",
    "garlic clove": "ząbek czosnku",
    "garlic cloves": "ząbki czosnku",
    "onion": "cebula",
    "onions": "cebula",
    "red onions": "czerwona cebula",
    "red onion": "czerwona cebula",
    "spring onions": "dymka",
    "scallions": "dymka",
    "shallots": "szalotka",
    "leek": "por",
    "carrots": "marchew",
    "carrot": "marchew",
    "potatoes": "ziemniaki",
    "potato": "ziemniak",
    "sweet potato": "batat",
    "tomato": "pomidor",
    "tomatoes": "pomidory",
    "cherry tomatoes": "pomidorki koktajlowe",
    "tinned tomatoes": "pomidory z puszki",
    "chopped tomatoes": "pomidory krojone",
    "tomato puree": "koncentrat pomidorowy",
    "celery": "seler naciowy",
    "cucumber": "ogórek",
    "cabbage": "kapusta",
    "mushrooms": "pieczarki",
    "spinach": "szpinak",
    "lettuce": "sałata",
    "broccoli": "brokuł",
    "cauliflower": "kalafior",
    "aubergine": "bakłażan",
    "courgette": "cukinia",
    "courgettes": "cukinia",
    "peas": "groszek",
    "green beans": "fasolka szparagowa",
    "sweetcorn": "kukurydza",
    "red pepper": "papryka czerwona",
    "green pepper": "papryka zielona",
    "yellow pepper": "papryka żółta",
    "red chilli": "czerwone chilli",
    "green chilli": "zielone chilli",
    "chilli": "chilli",
    "ginger": "imbir",
    "beetroot": "burak",
    "pumpkin": "dynia",

    // meat and fish
    "chicken": "kurczak",
    "chicken breast": "pierś z kurczaka",
    "chicken breasts": "piersi z kurczaka",
    "chicken thighs": "udka z kurczaka",
    "beef": "wołowina",
    "ground beef": "mielona wołowina",
    "minced beef": "mielona wołowina",
    "pork": "wieprzowina",
    "lamb": "jagnięcina",
    "bacon": "boczek",
    "ham": "szynka",
    "sausages": "kiełbaski",
    "chorizo": "chorizo",
    "salmon": "łosoś",
    "tuna": "tuńczyk",
    "cod": "dorsz",
    "prawns": "krewetki",
    "anchovies": "anchois",

    // dairy
    "milk": "mleko",
    "cream": "śmietanka",
    "double cream": "śmietanka kremówka",
    "sour cream": "śmietana",
    "creme fraiche": "creme fraiche",
    "greek yogurt": "jogurt grecki",
    "yogurt": "jogurt",
    "cheese": "ser",
    "cheddar cheese": "ser cheddar",
    "parmesan": "parmezan",
    "mozzarella": "mozzarella",
    "feta": "feta",
    "egg": "jajko",
    "eggs": "jajka",
    "egg yolks": "żółtka",

    // the herb and spice shelf
    "parsley": "pietruszka",
    "coriander": "kolendra",
    "cilantro": "kolendra",
    "basil": "bazylia",
    "mint": "mięta",
    "dill": "koperek",
    "chives": "szczypiorek",
    "thyme": "tymianek",
    "rosemary": "rozmaryn",
    "oregano": "oregano",
    "sage": "szałwia",
    "bay leaf": "liść laurowy",
    "bay leaves": "liście laurowe",
    "paprika": "papryka mielona",
    "smoked paprika": "papryka wędzona",
    "cumin": "kmin rzymski",
    "ground cumin": "mielony kmin rzymski",
    "turmeric": "kurkuma",
    "cinnamon": "cynamon",
    "nutmeg": "gałka muszkatołowa",
    "allspice": "ziele angielskie",
    "cloves": "goździki",
    "cardamom": "kardamon",
    "saffron": "szafran",
    "star anise": "anyż gwiazdkowy",
    "vanilla": "wanilia",
    "curry powder": "curry w proszku",
    "chilli powder": "chilli w proszku",
    "garam masala": "garam masala",

    // cupboard
    "rice": "ryż",
    "basmati rice": "ryż basmati",
    "pasta": "makaron",
    "spaghetti": "spaghetti",
    "noodles": "makaron",
    "rice noodles": "makaron ryżowy",
    "bread": "chleb",
    "soy sauce": "sos sojowy",
    "fish sauce": "sos rybny",
    "oyster sauce": "sos ostrygowy",
    "worcestershire sauce": "sos worcestershire",
    "hot sauce": "ostry sos",
    "ketchup": "ketchup",
    "mayonnaise": "majonez",
    "mustard": "musztarda",
    "chicken stock": "bulion drobiowy",
    "beef stock": "bulion wołowy",
    "vegetable stock": "bulion warzywny",
    "coconut milk": "mleko kokosowe",
    "chickpeas": "ciecierzyca",
    "lentils": "soczewica",
    "kidney beans": "fasola czerwona",
    "chocolate": "czekolada",
    "cocoa": "kakao",
    "peanuts": "orzeszki ziemne",
    "almonds": "migdały",
    "walnuts": "orzechy włoskie",
    "cashews": "nerkowce",
    "raisins": "rodzynki",
    "sesame seeds": "sezam",

    // fruit
    "lemon": "cytryna",
    "lemon juice": "sok z cytryny",
    "lime": "limonka",
    "lime juice": "sok z limonki",
    "orange": "pomarańcza",
    "apple": "jabłko",
    "banana": "banan",
    "strawberries": "truskawki",
    "coconut": "kokos",
    "olives": "oliwki",

    // --- the long tail that still turns up often ---
    "scotch bonnet": "papryczka scotch bonnet",
    "tinned tomatos": "pomidory z puszki",
    "plum tomatoes": "pomidory śliwkowe",
    "sun-dried tomatoes": "suszone pomidory",
    "sundried tomatoes": "suszone pomidory",
    "tomato sauce": "sos pomidorowy",
    "tomato ketchup": "ketchup",
    "basil leaves": "listki bazylii",
    "coriander leaves": "listki kolendry",
    "dried oregano": "suszone oregano",
    "kosher salt": "sól gruboziarnista",
    "sea salt": "sól morska",
    "hotsauce": "ostry sos",
    "garlic powder": "czosnek granulowany",
    "onion powder": "cebula granulowana",
    "ground ginger": "imbir mielony",
    "ground coriander": "kolendra mielona",
    "cumin seeds": "nasiona kminu rzymskiego",
    "chilli flakes": "płatki chilli",
    "chili flakes": "płatki chilli",
    "red pepper flakes": "płatki chilli",
    "chili powder": "chilli w proszku",
    "cinnamon stick": "laska cynamonu",
    "harissa spice": "przyprawa harissa",
    "pita bread": "chleb pita",
    "baguette": "bagietka",
    "heavy cream": "śmietanka kremówka",
    "jasmine rice": "ryż jaśminowy",
    "macaroni": "makaron rurki",
    "bean sprouts": "kiełki fasoli",
    "thai red curry paste": "czerwona pasta curry",
    "red curry paste": "czerwona pasta curry",
    "thai green curry paste": "zielona pasta curry",
    "tamarind paste": "pasta tamaryndowa",
    "chicken stock cube": "kostka rosołowa",
    "black olives": "czarne oliwki",
    "green olives": "zielone oliwki",
    "dry sherry": "wytrawna sherry",
    "dry white wine": "wytrawne białe wino",
    "apple cider vinegar": "ocet jabłkowy",
    "sesame seed": "sezam",
    "pine nuts": "orzeszki piniowe",
    "white cabbage": "kapusta biała",
    "red cabbage": "kapusta czerwona",
    "kale": "jarmuż",
    "rocket": "rukola",
    "fennel": "koper włoski",
    "avocado": "awokado",
    "egg plants": "bakłażany",
    "challots": "szalotka",
    "lamb mince": "mielona jagnięcina",
    "lamb leg": "udziec jagnięcy",
    "chicken legs": "nogi z kurczaka",
    "ground pork": "mielona wieprzowina",
    "minced pork": "mielona wieprzowina",
    "sirloin steak": "polędwica wołowa",
    "beef brisket": "mostek wołowy",
    "raw king prawns": "surowe krewetki królewskie",
    "squid": "kalmary",
    "lard": "smalec",
    "parmesan cheese": "parmezan",
    "cannellini beans": "fasola cannellini",
    "black beans": "czarna fasola",
    "butter beans": "fasola biała",
    "dijon mustard": "musztarda dijon",
    "rapeseed oil": "olej rzepakowy",
}

/**
 * The house translation for a kitchen word, if there is one.
 *
 * Matched on the trimmed, lowercased name, so "Olive Oil" and "olive oil" are
 * the same word. Anything not in here is somebody's own phrasing and goes to
 * the service.
 */
export function knownFood(name: string, lang: string): string | undefined {
    if (lang !== "pl") return undefined
    return PL[name.trim().toLowerCase()]
}


/**
 * Ingredient names in the current language.
 *
 * Answers from the list above and nowhere else — no request, no waiting, no
 * daily allowance to run out, and no chance of "Oil" coming back as crude oil.
 * A name that isn't on the list stays as the library wrote it, which is worth
 * more than a guess on a shopping list somebody is holding in a shop.
 */
export function useFoodWord(): (name: string) => string {
    const lang = useLang()
    return (name: string) => knownFood(name, lang) ?? name
}
