/**
 * Reading, rescaling and adding up the amounts written on ingredients.
 *
 * The library has no structured amounts. The `unit` column is empty on 5659 of
 * 5680 rows, so everything lives in one freeform `quantity` string: "200g",
 * "1/2 tsp", "2 tablespoons", "1 chopped", "Pinch", "To taste". The servings
 * scaler and the weekly shopping list both need arithmetic on those, so this is
 * the single place that tries to understand them, and the single place that
 * gives up gracefully when it can't. An amount with no number in it is not a
 * failure: a pinch stays a pinch however many people are eating.
 */

const VULGAR: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
}

/** "1½ tbsp" -> "1 1/2 tbsp", so one number grammar covers the whole library. */
function deVulgar(text: string): string {
  return text
    .replace(/(\d)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, "$1 $2")
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => VULGAR[m])
}

// A number as recipes write them: 2, 0.5, 1/2, 1 1/2, 2-1/2. Longest form
// first, or "1/2" would match as a bare "1" and leave the half behind.
const NUMBER = String.raw`\d+[\s-]+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?`
// ...optionally written as a range ("2-3 tbsp"). The lookahead keeps that
// apart from the hyphen inside a mixed number like "2-1/2".
const LEADING = new RegExp(
  String.raw`^\s*(${NUMBER})(?:\s*[-–]\s*(?=\d+(?:\.\d+)?(?!\s*\/))(${NUMBER}))?`
)

function toNumber(text: string): number {
  const mixed = text.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = text.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  return Number(text)
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [3 / 8, "3/8"], [1 / 2, "1/2"],
  [5 / 8, "5/8"], [2 / 3, "2/3"], [3 / 4, "3/4"], [7 / 8, "7/8"],
]

/**
 * A number the way a person would write it on a list.
 *
 * Halves and thirds read as "1 1/2", not "1.5", because that's how the rest of
 * the recipe is written and a shopping list is read at a glance. Anything large
 * enough that the fraction is noise gets rounded off instead.
 */
export function prettyNumber(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < 0.005) return String(rounded)
  if (Math.abs(value) >= 10) return String(rounded)

  const whole = Math.floor(value)
  const rest = value - whole
  for (const [size, label] of FRACTIONS) {
    if (Math.abs(rest - size) < 0.02) return whole ? `${whole} ${label}` : label
  }
  return String(Math.round(value * 100) / 100)
}

/**
 * Word units that have to agree with the number in front of them. The
 * abbreviations are deliberately absent: nobody writes 500 gs or 2 tbsps.
 */
const FORMS = new Map<string, [string, string]>()
for (const pair of [
  ["clove", "cloves"], ["cup", "cups"], ["can", "cans"], ["tin", "tins"],
  ["slice", "slices"], ["sprig", "sprigs"], ["stick", "sticks"],
  ["bunch", "bunches"], ["packet", "packets"], ["pack", "packs"],
  ["bag", "bags"], ["head", "heads"], ["bulb", "bulbs"], ["leaf", "leaves"],
  ["teaspoon", "teaspoons"], ["tablespoon", "tablespoons"],
  ["pound", "pounds"], ["ounce", "ounces"], ["gram", "grams"],
  ["sheet", "sheets"], ["strip", "strips"], ["knob", "knobs"],
  ["fillet", "fillets"], ["rasher", "rashers"], ["stalk", "stalks"],
] as [string, string][]) {
  FORMS.set(pair[0], pair)
  FORMS.set(pair[1], pair)
}

/** Make the unit agree with its new number, keeping how it was capitalised. */
function agree(rest: string, plural: boolean): string {
  return rest.replace(/^(\s*)([A-Za-z]+)/, (whole, space: string, word: string) => {
    const forms = FORMS.get(word.toLowerCase())
    if (!forms) return whole
    const wanted = forms[plural ? 1 : 0]
    const capital = word[0] === word[0].toUpperCase()
    return space + (capital ? wanted[0].toUpperCase() + wanted.slice(1) : wanted)
  })
}

/**
 * Multiply the amount at the front of a quantity string, leave the rest alone.
 *
 * Deliberately a text transform rather than a parse-and-rebuild: it keeps
 * "200g" attached and "2 tbsp" spaced, carries "chopped" or "finely diced"
 * through untouched, and turns "2-3 tbsp" into "4-6 tbsp" rather than picking
 * one end of the range. Strings with no number come back as they went in.
 *
 * The one thing it does reach past the number for is the unit's plural, since
 * halving "2 teaspoons" and printing "1 teaspoons" looks like a bug.
 */
export function scaleQuantity(quantity: string, factor: number): string {
  if (factor === 1 || !quantity) return quantity
  const text = deVulgar(quantity)
  const match = text.match(LEADING)
  if (!match) return quantity

  const scaled = toNumber(match[1]) * factor
  const rest0 = text.slice(match[0].length)
  // "0.75kg", not "3/4kg" — fractions belong on spoons and cups
  const write = METRIC.has(unitToken(rest0)) ? decimal : prettyNumber
  const low = write(scaled)
  const high = match[2] ? write(toNumber(match[2]) * factor) : null
  // a range is always plural; below one is not ("1/2 cup", never "1/2 cups")
  const plural = high !== null || (scaled > 1 && low !== "1")
  return (high ? `${low}-${high}` : low) + agree(rest0, plural)
}

// --- units --------------------------------------------------------------

/**
 * Spellings seen in the library folded onto one key each. Anything not listed
 * is not a unit: "1 large" and "1 chopped" are counts of a thing with a note
 * attached, and adding a count to a count is exactly right.
 */
const UNITS: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gr: "g", gramme: "g", grammes: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  oz: "oz", ounce: "oz", ounces: "oz",
  tsp: "tsp", tsps: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tbsps: "tbsp", tbs: "tbsp", tbls: "tbsp", tblsp: "tbsp",
  tablespoon: "tbsp", tablespoons: "tbsp",
  cup: "cup", cups: "cup",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can", tin: "can", tins: "can",
  slice: "slice", slices: "slice",
  sprig: "sprig", sprigs: "sprig",
  stick: "stick", sticks: "stick",
  bunch: "bunch", bunches: "bunch",
  packet: "packet", packets: "packet", pack: "packet", packs: "packet",
  bag: "bag", bags: "bag",
  head: "head", heads: "head",
  bulb: "bulb", bulbs: "bulb",
  leaf: "leaf", leaves: "leaf",
}

/** Units that measure the same thing, so a total can be stated in one of them. */
const FAMILY: Record<string, { base: string; per: number }> = {
  g: { base: "g", per: 1 },
  kg: { base: "g", per: 1000 },
  ml: { base: "ml", per: 1 },
  l: { base: "ml", per: 1000 },
}

/**
 * Weights the library inherited from American sources, in grams.
 *
 * Nobody shopping here weighs anything in pounds, so these never reach the
 * screen: `parseAmount` turns them into grams on the way in and `toMetric`
 * rewrites them wherever the original text is shown.
 */
const IMPERIAL_MASS: Record<string, number> = { lb: 453.592, oz: 28.3495 }

/**
 * A converted weight as a person would write it.
 *
 * 453.592 g is arithmetic. 450 g is a shopping list, and it is what every
 * conversion chart prints for a pound, because five grams of chicken has
 * never changed a dinner.
 */
function roundMetric(grams: number): number {
  if (grams < 100) return Math.round(grams / 5) * 5
  return Math.round(grams / 10) * 10
}

/** The unit word sitting immediately after the number, canonicalised. */
function unitToken(rest: string): string {
  // the hyphen is for "8-ounce sliced", which is one written amount
  const word = rest.replace(/^[\s-]+/, "").split(/[\s,]+/)[0] ?? ""
  return UNITS[word.toLowerCase().replace(/\.$/, "")] ?? ""
}

/** Written as decimals; the rest of the world's units take fractions. */
const METRIC = new Set(["g", "kg", "ml", "l"])

const IMPERIAL_ANYWHERE = /\b(lbs?|pounds?|oz|ounces?)\b/i

/** In grams or kilograms, whichever the size calls for. */
const asMetric = (grams: number) =>
  grams >= 1000 ? `${decimal(grams / 1000)} kg` : `${grams} g`

/**
 * A handful of rows state one amount twice, once each way: "650g/1lb 8 oz",
 * "12 ounces (340g)". The recipe has already done the conversion, so keep its
 * answer and drop the half we can't shop with.
 */
function dropRestatement(text: string): string {
  const metricThenImperial = text.match(/^(.*?\d\s*(?:kg|g|ml|l)\b)\s*\/\s*(.+)$/i)
  if (metricThenImperial && IMPERIAL_ANYWHERE.test(metricThenImperial[2])) {
    return metricThenImperial[1]
  }
  const imperialThenMetric = text.match(/\(\s*([^)]*\d\s*(?:kg|g|ml|l|grams?|kilograms?)[^)]*)\)/i)
  if (imperialThenMetric && IMPERIAL_ANYWHERE.test(text.slice(0, imperialThenMetric.index))) {
    return imperialThenMetric[1].trim()
  }
  return text
}

// Imperial that isn't the amount at the front, as in "1 (12 oz.)" — one tin,
// described by its imperial weight.
const EMBEDDED = /(\d+(?:\.\d+)?|\d+\/\d+)\s*(lbs?|pounds?|oz|ounces?)\b\.?/gi

const sweepEmbedded = (text: string) =>
  text.replace(EMBEDDED, (_, count: string, unit: string) =>
    asMetric(roundMetric(toNumber(count) * IMPERIAL_MASS[UNITS[unit.toLowerCase()]])))

/**
 * Rewrite an imperial weight in grams or kilograms.
 *
 * Text in, text out, the same way `scaleQuantity` works, so whatever follows
 * the unit is carried through: "14 oz jar" becomes "400 g jar". Anything with
 * no pound or ounce in it is returned exactly as it arrived.
 */
export function toMetric(quantity: string): string {
  if (!quantity || !IMPERIAL_ANYWHERE.test(quantity)) return quantity

  const text = dropRestatement(deVulgar(quantity))
  if (!IMPERIAL_ANYWHERE.test(text)) return text

  const match = text.match(LEADING)
  const rest = match ? text.slice(match[0].length) : ""
  const perUnit = match ? IMPERIAL_MASS[unitToken(rest)] : undefined
  // imperial, but not as the leading amount
  if (!match || !perUnit) return sweepEmbedded(text)

  const low = roundMetric(toNumber(match[1]) * perUnit)
  const high = match[2] ? roundMetric(toNumber(match[2]) * perUnit) : null
  // one unit for the whole range: "1.81-2.27 kg", not "1.81 kg-2.27 kg"
  const kilos = Math.max(low, high ?? 0) >= 1000
  const show = (grams: number) => (kilos ? decimal(grams / 1000) : String(grams))

  const tail = sweepEmbedded(rest.replace(/^[\s-]*[A-Za-z]+\.?/, ""))
  const amount = high !== null ? `${show(low)}-${show(high)}` : show(low)
  return `${amount} ${kilos ? "kg" : "g"}${tail}`
}

/**
 * An amount as it should read in this kitchen: scaled to the number of people,
 * then said in the units people here actually use.
 */
export function kitchenQuantity(quantity: string, factor = 1): string {
  return toMetric(scaleQuantity(quantity, factor))
}

export interface Amount {
  value: number
  /** Canonical unit key, or "" for a bare count. */
  unit: string
}

/**
 * The measurable part of a quantity string, or null when there isn't one.
 *
 * `column` is the separate `unit` field, which the library populates on 21 rows
 * out of 5680 but which a hand-written recipe fills in properly.
 */
export function parseAmount(quantity: string, column = ""): Amount | null {
  const text = deVulgar(quantity ?? "")
  const match = text.match(LEADING)
  if (!match) return null

  // a range is what you'd buy for, so take the top of it
  const value = toNumber(match[2] ?? match[1])
  if (!Number.isFinite(value)) return null

  const rest = text.slice(match[0].length)
  const stated = column.trim()
  const unit = stated ? UNITS[stated.toLowerCase()] ?? "" : unitToken(rest)

  // pounds are normalised here rather than downstream, so every total, every
  // sum and every comparison past this point is already metric
  const perUnit = IMPERIAL_MASS[unit]
  return perUnit ? { value: roundMetric(value * perUnit), unit: "g" } : { value, unit }
}

/** Metric is written 1.5 kg, never 1 1/2 kg. Fractions are for spoons. */
const decimal = (value: number) => String(Math.round(value * 100) / 100)

/**
 * Split something typed on one line into an amount and the thing itself.
 *
 * Two fields would be more precise and worse: nobody writing a shopping list
 * wants to tab between "2 kg" and "potatoes". The unit only joins the amount
 * when it really is one, so "2 potatoes" keeps its potatoes.
 */
export function splitEntry(text: string): { quantity: string; name: string } {
  const trimmed = (text ?? "").trim()
  const match = deVulgar(trimmed).match(LEADING)
  if (!match) return { quantity: "", name: trimmed }

  const rest = trimmed.slice(match[0].length)
  const unit = rest.match(/^\s*([A-Za-z]+)/)
  const takesUnit = unit ? unitToken(rest) !== "" : false
  const consumed = match[0].length + (takesUnit ? unit![0].length : 0)
  return {
    quantity: trimmed.slice(0, consumed).trim(),
    name: trimmed.slice(consumed).trim(),
  }
}

/** "500 g", "1.5 kg", "2 tbsp", "18 cloves", "3" — one total, ready to read. */
export function formatAmount({ value, unit }: Amount): string {
  if (!unit) return prettyNumber(value)
  const base = FAMILY[unit]?.base
  if (value >= 1000) {
    if (base === "g") return `${decimal(value / 1000)} kg`
    if (base === "ml") return `${decimal(value / 1000)} l`
  }
  const written = FORMS.get(unit)?.[value === 1 ? 0 : 1] ?? unit
  return `${base ? decimal(value) : prettyNumber(value)} ${written}`
}

/**
 * Add up amounts that came from different recipes.
 *
 * Grams add to grams and kilos convert into them, but a tablespoon is never
 * silently turned into millilitres: 15 ml of olive oil is not something anyone
 * buys, and a list that quietly invents conversions stops being trustworthy.
 * Amounts that genuinely don't combine ("400 g tomatoes" and "2 tomatoes") come
 * back as separate entries rather than being forced together or dropped.
 */
export function sumAmounts(amounts: Amount[]): Amount[] {
  const totals = new Map<string, number>()
  for (const a of amounts) totals.set(a.unit, (totals.get(a.unit) ?? 0) + a.value)

  // g + kg is one number; g + tbsp is two
  const byBase = new Map<string, string[]>()
  for (const unit of totals.keys()) {
    const base = FAMILY[unit]?.base
    if (!base) continue
    byBase.set(base, [...(byBase.get(base) ?? []), unit])
  }
  for (const [base, units] of byBase) {
    if (units.length < 2) continue
    let total = 0
    for (const unit of units) {
      total += totals.get(unit)! * FAMILY[unit].per
      totals.delete(unit)
    }
    totals.set(base, (totals.get(base) ?? 0) + total)
  }

  // counts last: "400 g tomatoes + 2" reads better than the other way round
  return [...totals]
    .map(([unit, value]) => ({ unit, value }))
    .sort((a, b) => (a.unit ? 0 : 1) - (b.unit ? 0 : 1) || a.unit.localeCompare(b.unit))
}
