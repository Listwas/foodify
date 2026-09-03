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
 * Quota: 80 names account for 63% of every ingredient mention in the library,
 * because every second recipe wants onion, garlic and salt. Answering those
 * from here means the free daily allowance is spent on the long tail that
 * actually needs it.
 */

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

export const knownFoodCount = () => Object.keys(PL).length
