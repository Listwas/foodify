/**
 * Which part of the shop an ingredient is found in.
 *
 * A week's meals come to sixty-odd lines, and sixty lines in alphabetical order
 * means walking the shop four times. Grouping them cuts that to one pass.
 *
 * There is no category in the data, so this is keyword matching and it is
 * openly approximate: the sections only have to be right often enough to save a
 * lap, and anything unrecognised lands in "Other", where it is still on the
 * list rather than mis-shelved. Rules are tried in order, which is what the
 * first block is for: "red pepper" is a vegetable and "black pepper" is a
 * spice, "fish sauce" is a bottle and "kidney beans" are a tin, and each of
 * those would otherwise be caught by a broader rule further down.
 */

export const SECTIONS = [
  "Fruit & veg",
  "Meat & fish",
  "Dairy & eggs",
  "Bakery",
  "Frozen",
  "Cupboard",
  "Herbs & spices",
  "Other",
] as const

export type Section = (typeof SECTIONS)[number]

const RULES: [Section, string[]][] = [
  // --- read like one aisle, bought in another --------------------------
  // "pepper" is the worst of them: the same word is a vegetable, a spice and a
  // jar of paste, so the narrowest readings are settled before the broad ones.
  ["Cupboard", ["pepper paste", "pepper sauce", "pepper jelly", "peppadew"]],
  ["Herbs & spices", ["pepper flake", "peppercorn", "pepper corn"]],
  ["Fruit & veg", [
    "red pepper", "green pepper", "yellow pepper", "orange pepper",
    "bell pepper", "sweet pepper", "sweet red pepper", "romano pepper",
    "roasted pepper", "mixed pepper", "padron pepper", "habanero pepper",
    "banana pepper", "chilli pepper", "chili pepper",
    "egg plant", "eggplant", "garlic clove", "sugar snap pea", "snow pea",
    "mangetout",
  ]],
  ["Cupboard", [
    "stock", "broth", "bouillon", "coconut milk", "coconut cream",
    "almond milk", "soy milk", "oat milk", "condensed milk", "evaporated milk",
    "peanut butter", "almond butter", "cocoa butter", "butter bean",
    "kidney bean", "black bean", "black eyed bean", "black eyed pea",
    "split pea", "baked bean", "broad bean", "baking powder", "baking soda",
    "bicarbonate", "breadcrumb", "panko", "bread flour", "tomato puree",
    "tomato paste", "tomato ketchup", "ketchup", "passata", "sundried tomato",
    "sun-dried tomato", "tinned tomato", "tinned tomatos", "chopped tomato",
    "canned tomato", "plum tomato", "lemon juice", "lime juice",
    "orange juice", "coconut oil", "corn flour", "cornflour", "cornstarch",
    "corn starch", "cornmeal", "corn syrup", "sweetcorn", "fish sauce",
    "anchovy paste", "garlic paste", "ginger paste", "curry paste",
    "creamed coconut", "chicken bouillon", "beef bouillon", "hot sauce",
    "hotsauce", "gravy", "salsa", "vinaigrette", "dressing", "olive",
    "vegetable oil", "vegetable stock", "vegetable broth",
  ]],
  ["Herbs & spices", [
    "ground ginger", "ground coriander", "ground cardamom", "ground cardomom",
    "ground clove", "ground cinnamon", "ground allspice", "ground turmeric",
    "ground nutmeg", "ground mace", "ground anise", "pul biber",
  ]],

  // --- the ordinary aisles ---------------------------------------------
  ["Herbs & spices", [
    "salt", "pepper", "paprika", "cumin", "coriander", "turmeric", "cinnamon",
    "nutmeg", "cardamom", "clove", "allspice", "oregano", "thyme", "rosemary",
    "sage", "bay leaf", "bay leaves", "chilli powder", "chili powder",
    "chilli flake", "chili flake", "cayenne", "curry powder", "garam masala",
    "saffron", "vanilla", "star anise", "fenugreek", "sumac", "zaatar",
    "za'atar", "harissa", "ras el hanout", "jerk", "five spice", "mustard seed",
    "fennel seed", "caraway", "juniper", "mace", "dill", "tarragon",
    "marjoram", "chive", "parsley", "basil", "mint", "cilantro", "savoury",
    "seasoning", "spice", "herb", "garlic powder", "onion powder", "msg",
  ]],
  ["Meat & fish", [
    "chicken", "beef", "pork", "lamb", "mutton", "veal", "turkey", "duck",
    "goose", "venison", "rabbit", "goat meat", "bacon", "ham", "sausage",
    "chorizo", "pancetta", "prosciutto", "salami", "pepperoni", "mince",
    "steak", "brisket", "rib", "oxtail", "liver", "kidney", "gammon", "suet",
    "lard", "fish", "salmon", "tuna", "cod", "haddock", "mackerel", "sardine",
    "anchovy", "anchovies", "trout", "seabass", "sea bass", "tilapia",
    "prawn", "shrimp", "crab", "lobster", "mussel", "clam", "conch",
    "squid", "calamari", "octopus", "scallop", "monkfish", "pollock",
  ]],
  ["Dairy & eggs", [
    "milk", "butter", "cheese", "cheddar", "parmesan", "mozzarella",
    "mozarella", "feta", "halloumi", "ricotta", "mascarpone", "gruyere",
    "brie", "camembert", "pecorino", "cream", "creme fraiche", "yogurt",
    "yoghurt", "egg", "buttermilk", "ghee", "paneer", "quark", "custard",
  ]],
  ["Bakery", [
    "bread", "baguette", "ciabatta", "sourdough", "brioche", "bun", "roll",
    "bagel", "pitta", "pita", "naan", "tortilla", "wrap", "croissant",
    "muffin", "cake", "pastry", "filo", "phyllo", "crumpet", "focaccia",
    "taco shell",
  ]],
  ["Frozen", ["frozen", "ice cream"]],
  ["Fruit & veg", [
    "onion", "shallot", "challot", "spring onion", "scallion", "leek",
    "carrot", "potato", "sweet potato", "tomato", "cucumber", "lettuce",
    "spinach", "kale", "cabbage", "broccoli", "cauliflower", "courgette",
    "zucchini", "aubergine", "chilli", "chili", "jalapeno", "scotch bonnet",
    "mushroom", "celery", "celeriac", "beetroot", "radish", "turnip", "swede",
    "parsnip", "pumpkin", "squash", "butternut", "corn", "asparagus",
    "green bean", "runner bean", "bean sprout", "beansprout", "pak choi",
    "bok choy", "avocado", "ginger", "galangal", "lemongrass", "lemon",
    "lime", "orange", "apple", "pear", "banana", "mango", "pineapple",
    "peach", "plum", "cherry", "cherries", "strawberr", "raspberr",
    "blueberr", "cranberr", "grape", "watermelon", "melon", "coconut",
    "rhubarb", "rocket", "watercress", "salad", "fennel", "artichoke", "pea",
    "garlic", "horseradish", "yam", "plantain", "cassava", "okra", "caper",
    "sauerkraut", "bamboo shoot", "vegetable",
  ]],
  ["Cupboard", [
    "flour", "sugar", "rice", "pasta", "spaghetti", "noodle", "macaroni",
    "penne", "linguine", "lasagne", "fettuccine", "couscous", "quinoa",
    "bulgur", "polenta", "oat", "semolina", "yeast", "gelatine", "gelatin",
    "starch", "shortening", "oil", "vinegar", "sauce", "mayonnaise",
    "mustard", "honey", "syrup", "treacle", "molasses", "jam", "marmalade",
    "chocolate", "cocoa", "nut", "peanut", "almond", "walnut", "cashew",
    "pistachio", "pecan", "hazelnut", "seed", "sesame", "raisin", "sultana",
    "date", "apricot", "prune", "bean", "chickpea", "lentil", "cannellini",
    "soya", "tin", "tinned", "can", "canned", "wine", "beer", "stout",
    "cider", "sherry", "brandy", "rum", "vodka", "whisky", "whiskey",
    "vermouth", "sake", "mirin", "water", "tea", "coffee", "tofu", "tempeh",
    "miso", "tahini", "tamarind", "hummus", "cracker", "chip", "stuffing",
    "marmite", "wasabi", "nori", "seaweed", "cornichon", "gherkin", "pickle",
  ]],
]

/**
 * Compiled once.
 *
 * Bounded on both sides so "pepper" isn't found inside "peppermint", with an
 * optional plural so the list doesn't have to carry "courgette" and
 * "courgettes" separately. Longest keyword first, because within one rule
 * "sweet potato" has to win over "potato".
 */
const MATCHERS: [Section, RegExp][] = RULES.map(([section, words]) => [
  section,
  new RegExp(
    `(^|[^a-z])(${words
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .sort((a, b) => b.length - a.length)
      .join("|")})(e?s)?([^a-z]|$)`
  ),
])

const cache = new Map<string, Section>()

/** Where to look for this ingredient. Never throws, never returns nothing. */
export function sectionFor(name: string): Section {
  const key = name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const hit = cache.get(key)
  if (hit) return hit

  let section: Section = "Other"
  for (const [candidate, matcher] of MATCHERS) {
    if (matcher.test(key)) { section = candidate; break }
  }
  cache.set(key, section)
  return section
}

/** Shop order, so the list reads the way the aisles are walked. */
export const sectionRank = (section: Section) => SECTIONS.indexOf(section)
