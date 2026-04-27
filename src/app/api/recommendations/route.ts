import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { getTrip, saveTrip } from "@/lib/trips-store";
import { fetchUrlContent } from "@/lib/tools/exa";
import { searchPlaces, getPlaceDetails } from "@/lib/tools/google-places";
import type { Recommendation, ExtractedItem, Trip } from "@/lib/types";
import { v4 as uuid } from "uuid";

export const maxDuration = 60;

const extractedItemSchema = z.object({
  name: z.string().describe("Name of the place, venue, or recommendation"),
  category: z
    .enum(["restaurant", "bar", "hotel", "attraction", "activity", "shop", "neighborhood", "general"])
    .describe(
      "Best-fit category. Pick the most specific bucket: " +
        "restaurant (places primarily for meals — cafes, bakeries, food markets, gelato, brunch spots), " +
        "bar (places primarily for drinks/nightlife — bars, pubs, cocktail lounges, wine bars, breweries, clubs, rooftops), " +
        "hotel (any lodging — hotels, hostels, Airbnbs, guesthouses), " +
        "attraction (museums, churches, palaces, monuments, landmarks, viewpoints, plazas, bridges, libraries — places to see/visit), " +
        "activity (tours, classes, day trips, parks, beaches, experiences — things to do), " +
        "shop (boutiques, bookstores, designer stores, concept shops, vintage stores, craft stores, malls), " +
        "neighborhood (named districts or areas to explore). " +
        "If a venue serves food but is primarily known for drinks/atmosphere (e.g. a cocktail bar with small plates), pick 'bar'. " +
        "Iconic bookstores famous as cultural landmarks (e.g. Livraria Lello) are 'attraction'; smaller/local bookshops are 'shop'. " +
        "Use 'general' ONLY as a last resort when nothing else fits."
    ),
  location: z.string().nullable().describe("City, neighborhood, or address if identifiable"),
  notes: z.string().nullable().describe("Context about why it was recommended or any tips"),
  sourceUrl: z.string().nullable().describe("URL if the recommendation came from a link"),
  priceRange: z.string().nullable().describe("Price range if mentioned (e.g. '$$', '€€€', '$50-80/night')"),
});

const extractionSchema = z.object({
  items: z.array(extractedItemSchema).describe("Extracted travel recommendations"),
});

async function extractTextFromPdf(base64Data: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const data = Buffer.from(base64Data, "base64");
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  return result.text;
}

// ── Google Maps URL handling ──────────────────────────────────────────────

const MAPS_PATTERNS = [
  /^https?:\/\/(www\.)?google\.\w+\/maps/i,
  /^https?:\/\/maps\.google\.\w+/i,
  /^https?:\/\/maps\.app\.goo\.gl\//i,
  /^https?:\/\/goo\.gl\/maps\//i,
];

function isGoogleMapsUrl(url: string): boolean {
  return MAPS_PATTERNS.some((re) => re.test(url));
}

function extractQueryFromMapsUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // ?q=Place+Name,+Address
    const q = parsed.searchParams.get("q");
    if (q) return q;

    // /maps/place/Place+Name/...
    const placeMatch = parsed.pathname.match(/\/place\/([^/]+)/);
    if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));

    // /maps/search/query/...
    const searchMatch = parsed.pathname.match(/\/search\/([^/]+)/);
    if (searchMatch) return decodeURIComponent(searchMatch[1].replace(/\+/g, " "));

    return null;
  } catch {
    return null;
  }
}

async function resolveShortUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch {
    try {
      const res = await fetch(url, { redirect: "follow" });
      return res.url || url;
    } catch {
      return url;
    }
  }
}

const PRICE_LEVEL_LABELS: Record<number, string> = {
  0: "Free",
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

function categorizePlaceTypes(types?: string[]): ExtractedItem["category"] {
  if (!types) return "general";
  const t = types.join(",").toLowerCase();
  // Check bar/nightlife BEFORE restaurant — many bars are also tagged "restaurant" in
  // Google's data, so we prioritize the more specific drinks/nightlife signal.
  if (
    t.includes("bar") ||
    t.includes("pub") ||
    t.includes("night_club") ||
    t.includes("nightclub") ||
    t.includes("winery") ||
    t.includes("brewery") ||
    t.includes("liquor_store")
  ) return "bar";
  if (
    t.includes("restaurant") ||
    t.includes("food") ||
    t.includes("cafe") ||
    t.includes("coffee") ||
    t.includes("bakery") ||
    t.includes("meal_")
  ) return "restaurant";
  if (t.includes("lodging") || t.includes("hotel") || t.includes("hostel") || t.includes("guest_house") || t.includes("apartment")) return "hotel";
  if (
    t.includes("museum") ||
    t.includes("church") ||
    t.includes("cathedral") ||
    t.includes("monument") ||
    t.includes("tourist_attraction") ||
    t.includes("art_gallery") ||
    t.includes("library") ||
    t.includes("market") ||
    t.includes("plaza") ||
    t.includes("square") ||
    t.includes("bridge") ||
    t.includes("castle") ||
    t.includes("palace") ||
    t.includes("synagogue") ||
    t.includes("mosque") ||
    t.includes("temple") ||
    t.includes("place_of_worship") ||
    t.includes("historical") ||
    t.includes("landmark") ||
    t.includes("aquarium") ||
    t.includes("zoo")
  ) return "attraction";
  if (
    t.includes("park") ||
    t.includes("gym") ||
    t.includes("spa") ||
    t.includes("amusement") ||
    t.includes("stadium") ||
    t.includes("beach") ||
    t.includes("hiking") ||
    t.includes("tour") ||
    t.includes("travel_agency")
  ) return "activity";
  if (
    t.includes("neighborhood") ||
    t.includes("sublocality") ||
    t.includes("locality") ||
    t.includes("political")
  ) return "neighborhood";
  if (
    t.includes("book_store") ||
    t.includes("clothing_store") ||
    t.includes("shoe_store") ||
    t.includes("jewelry_store") ||
    t.includes("department_store") ||
    t.includes("furniture_store") ||
    t.includes("home_goods_store") ||
    t.includes("shopping_mall") ||
    t.includes("store") ||
    t.includes("shop")
  ) return "shop";
  // Generic Google fallback types — let the LLM's category stand if we got here.
  return "general";
}

async function extractFromGoogleMapsUrl(url: string): Promise<{ items: ExtractedItem[]; rawText: string }> {
  let resolvedUrl = url;
  if (/goo\.gl/i.test(url)) {
    resolvedUrl = await resolveShortUrl(url);
  }

  const query = extractQueryFromMapsUrl(resolvedUrl);
  if (!query) {
    return { items: [], rawText: "" };
  }

  // Use the query directly to search Google Places API
  const { places } = await searchPlaces({ query });
  if (!places.length) {
    // If no Places API result, at least pass the query text to the LLM
    return { items: [], rawText: `Google Maps link for: ${query}` };
  }

  const top = places[0];
  const details = await getPlaceDetails({ placeId: top.placeId });

  if (details) {
    const ratingStr = details.rating ? `${details.rating}★` : "";
    const reviewCountStr = details.reviewCount ? `(${details.reviewCount} reviews)` : "";
    const ratingLine = [ratingStr, reviewCountStr].filter(Boolean).join(" ");

    const noteParts = [ratingLine, details.description].filter(Boolean);
    const notes = noteParts.join(" · ") || undefined;

    const item: ExtractedItem = {
      name: details.name,
      category: categorizePlaceTypes(top.types),
      location: details.address ?? undefined,
      notes,
      sourceUrl: details.website ?? resolvedUrl,
      priceRange: details.priceLevel != null ? PRICE_LEVEL_LABELS[details.priceLevel] : undefined,
    };

    const rawText = `${details.name} — ${details.address || ""}. ${details.description || ""}`;
    return { items: [item], rawText };
  }

  // Fallback to basic search result
  const item: ExtractedItem = {
    name: top.name,
    category: categorizePlaceTypes(top.types),
    location: top.address ?? undefined,
    notes: top.rating ? `${top.rating}★ · ${top.reviewCount ?? 0} reviews` : undefined,
    sourceUrl: resolvedUrl,
  };
  return { items: [item], rawText: `${top.name} — ${top.address || ""}` };
}

// ── Content extraction ────────────────────────────────────────────────────

async function extractRawContent(
  type: "url" | "text" | "file",
  content: string
): Promise<{ rawText: string; sourceUrl?: string; directItems?: ExtractedItem[] }> {
  switch (type) {
    case "url": {
      if (isGoogleMapsUrl(content)) {
        const { items, rawText } = await extractFromGoogleMapsUrl(content);
        return { rawText, sourceUrl: content, directItems: items.length > 0 ? items : undefined };
      }
      const page = await fetchUrlContent(content);
      return { rawText: page.text, sourceUrl: content };
    }
    case "file": {
      const text = await extractTextFromPdf(content);
      return { rawText: text };
    }
    case "text":
    default:
      return { rawText: content };
  }
}

function chunkText(text: string, maxChars: number, overlap: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

// ── Document triage ───────────────────────────────────────────────────────

// Triage exists to filter out encyclopedic/historical filler from large documents
// (e.g. a 30+ page travel guide where most pages are background reading). For shorter
// documents, the cost of triage (dropping real recommendations as collateral) outweighs
// the benefit, so we skip it and just chunk + extract directly. ~30k chars is roughly
// 10-15 pages of dense PDF text — the inflection point in practice.
const TRIAGE_MIN_LENGTH = 30_000;
const TRIAGE_MAX_LENGTH = 400_000;
const BLOCK_TARGET_CHARS = 800;

function splitIntoBlocks(text: string): { id: number; text: string }[] {
  // First pass: split on blank lines (paragraph boundaries)
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Second pass: merge tiny paragraphs together and split oversized ones
  const blocks: string[] = [];
  let buffer = "";

  const flushBuffer = () => {
    if (buffer.trim()) blocks.push(buffer.trim());
    buffer = "";
  };

  for (const p of paragraphs) {
    if (p.length > BLOCK_TARGET_CHARS) {
      flushBuffer();
      // Split oversized paragraphs at sentence boundaries
      const sentences = p.match(/[^.!?]+[.!?]+|\S+/g) ?? [p];
      let sub = "";
      for (const s of sentences) {
        if (sub.length + s.length > BLOCK_TARGET_CHARS && sub) {
          blocks.push(sub.trim());
          sub = s;
        } else {
          sub += (sub ? " " : "") + s;
        }
      }
      if (sub.trim()) blocks.push(sub.trim());
      continue;
    }

    if (buffer.length + p.length > BLOCK_TARGET_CHARS) {
      flushBuffer();
    }
    buffer += (buffer ? "\n\n" : "") + p;
  }
  flushBuffer();

  return blocks.map((text, id) => ({ id, text }));
}

const triageSchema = z.object({
  documentType: z.string().describe("Brief description of what kind of document this is"),
  keepBlockIds: z.array(z.number()).describe("IDs of blocks containing actual recommendations"),
  excludedReason: z.string().nullable().describe("Brief reason for excluding the rest"),
});

async function triageDocument(rawText: string): Promise<string> {
  if (rawText.length < TRIAGE_MIN_LENGTH) return rawText;
  if (rawText.length > TRIAGE_MAX_LENGTH) return rawText;

  const blocks = splitIntoBlocks(rawText);
  if (blocks.length <= 1) return rawText;

  const numbered = blocks.map((b) => `[${b.id}] ${b.text}`).join("\n\n");

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: triageSchema,
      prompt: `You are analyzing a travel document to find which sections contain actual recommendations vs pure boilerplate.

DEFAULT: KEEP. Bias strongly toward keeping blocks. The cost of dropping a real recommendation is much higher than the cost of including some extra context.

KEEP a block if ANY of the following is true:
- It names ANY specific place a traveler could visit, stay at, eat at, or do (restaurants, hotels, attractions, monuments, neighborhoods, viewpoints, parks, shops, bars, etc.) — even ONE named place is enough
- It contains a bullet list, numbered list, or dash-prefixed entries (these are almost always picks)
- It is a scheduled itinerary item, day plan, booked accommodation, or "must-see"/"highlights" list
- It mixes personal context (e.g. "10 min walk from Airbnb", history blurbs) with named places — keep it; we want the names

DISCARD ONLY blocks that are PURELY:
- Page numbers, headers/footers, navigation breadcrumbs ("-- 3 of 10 --", "Page 4")
- Contact info, copyright, legal boilerplate
- Standalone history/encyclopedia paragraphs with NO named venue a traveler would visit (e.g. abstract prose about a region's geography or political history with zero named places)
- Generic food/cuisine glossaries with no specific restaurants attached (e.g. "Bacalhau is salted cod" with no place to eat it)

When a block has even one named place worth visiting alongside historical or contextual prose, KEEP IT. Do NOT discard a block just because it also contains background information — recall matters more than precision here.

Document blocks:
${numbered}`,
    });

    if (object.keepBlockIds.length === 0) return rawText;

    const keepSet = new Set(object.keepBlockIds);
    const filtered = blocks
      .filter((b) => keepSet.has(b.id))
      .map((b) => b.text)
      .join("\n\n");

    return filtered.trim() ? filtered : rawText;
  } catch (err) {
    console.error("Triage failed, falling back to full text:", err);
    return rawText;
  }
}

function normalizeKey(name: string): string {
  const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  return words.sort().join("");
}

function deduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Map<string, ExtractedItem>();
  for (const item of items) {
    // Include a location prefix in the key so same-named places in different locations
    // (e.g. Manteigaria in Porto vs Manteigaria in Lisbon) survive into enrichment, where
    // deduplicateByAddress will collapse true duplicates using canonical Google addresses.
    const nameKey = normalizeKey(item.name);
    const locKey = item.location
      ? item.location.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 25)
      : "";
    const key = `${nameKey}|${locKey}`;
    const existing = seen.get(key);
    if (!existing || (item.notes && !existing.notes)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

function deduplicateByAddress(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Map<string, ExtractedItem>();
  const result: ExtractedItem[] = [];
  for (const item of items) {
    if (!item.location) {
      result.push(item);
      continue;
    }
    const addrKey = item.location.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = seen.get(addrKey);
    if (!existing) {
      seen.set(addrKey, item);
      result.push(item);
    } else if (item.notes && !existing.notes) {
      const idx = result.indexOf(existing);
      if (idx >= 0) result[idx] = item;
      seen.set(addrKey, item);
    }
  }
  return result;
}

const EXTRACT_PROMPT = `Extract EVERY specific named place from the following text. Be thorough — do not skip items even if they have minimal context.

What to extract:
- Restaurants, cafes, bars, bakeries, gelato shops, food markets, brunch spots
- Hotels, Airbnbs, hostels, accommodations
- Attractions, monuments, palaces, castles, churches, cathedrals, museums, towers
- Activities, tours, boat rides, wine tastings
- Bookshops, factories, galleries, cultural venues
- Neighborhoods, viewpoints (miradouros), parks, plazas, bridges
- Any other named location or venue

IMPORTANT: Pay special attention to bullet-point lists and short entries like "- Alma" or "- Heim cafe - brunch". These are just as important as longer descriptions. Extract every single named place even if it only appears as a brief list item with no additional context.

NOTES FIELD GUIDELINES — be strict about this:
- Write notes as a brief, GENERIC reason this place is worth visiting (1 short sentence, max ~80 chars).
- Capture useful tips that apply to anyone: cuisine type, what it's famous for, must-try dishes, booking advice, best time to visit, special features.
- DO NOT include the recommender's personal context. Strip out:
  * "Near my Airbnb" / "5 min walk from Airbnb" / "around the corner from us"
  * "We loved this" / "I went here" / "my favorite"
  * Personal walking times or distances from anywhere
  * Day-of-week scheduling like "Tuesday lunch"
  * Personal pricing math like "8e discount with my voucher"
- If the only context is personal (e.g. "5 min walk from Airbnb"), leave notes empty rather than including it.
- Good notes: "Famous for pastel de nata", "Inspiration for Harry Potter; book tickets in advance", "Best francesinha in Porto (heavy meat dish)"
- Bad notes: "RIGHT AROUND THE CORNER FROM AIRBNB!", "5 min walk from Airbnb; closes at 7pm", "We had lunch here"

If you cannot identify any specific travel recommendations, return an empty array.`;

async function extractItemsFromChunk(
  chunk: string,
  sourceUrl?: string
): Promise<ExtractedItem[]> {
  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: extractionSchema,
    prompt: `${EXTRACT_PROMPT}\n\nText:\n${chunk}`,
  });

  return object.items.map((item) => ({
    name: item.name,
    category: item.category,
    location: item.location ?? undefined,
    notes: item.notes ?? undefined,
    sourceUrl: item.sourceUrl ?? sourceUrl,
    priceRange: item.priceRange ?? undefined,
  }));
}

// ── Trip-aware Google Places enrichment ───────────────────────────────────

/**
 * A bag of region tokens (countries, cities, destination string) used to:
 *   1. Bias Google search queries toward the trip's region
 *   2. Reject Google matches whose address falls outside the trip's region
 *
 * Tokens are lowercased and stripped of punctuation.
 */
interface TripContext {
  /** Best single phrase to append to search queries (e.g. "Portugal" or "Porto and Lisbon"). */
  searchHint?: string;
  /** Tokens that should appear in a valid Google address (cities + countries). */
  addressTokens: string[];
}

function buildTripContext(trip: Trip | null): TripContext {
  if (!trip) return { addressTokens: [] };

  const cityNames = (trip.state?.cities || []).map((c) => c.name).filter(Boolean);
  const countries = Array.from(
    new Set(
      (trip.state?.cities || []).map((c) => c.country).filter(Boolean)
    )
  );

  const tokens: string[] = [];
  for (const c of [...cityNames, ...countries]) {
    tokens.push(c.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim());
  }
  if (trip.destination) {
    // Destination might be free-form like "Portugal trip" or "Porto and Lisbon"; split into words.
    for (const word of trip.destination.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 3) tokens.push(word);
    }
  }

  // Build a single "search hint" — prefer countries (most discriminating), else cities, else destination.
  const searchHint =
    countries[0] ||
    (cityNames.length > 0 ? cityNames.join(" or ") : undefined) ||
    trip.destination ||
    undefined;

  return { searchHint, addressTokens: Array.from(new Set(tokens)) };
}

/**
 * Returns true if the Google-returned address plausibly falls within the trip's region.
 * If we have no trip context (free-form recommendation, no cities yet), we always accept.
 */
function addressMatchesTrip(address: string | undefined, ctx: TripContext): boolean {
  if (!ctx.addressTokens.length) return true;
  if (!address) return true; // can't filter what we don't see; accept.
  const addr = address.toLowerCase();
  return ctx.addressTokens.some((t) => t && addr.includes(t));
}

const FRIENDLY_TYPE_LABELS: Record<string, string> = {
  italian_restaurant: "Italian restaurant",
  french_restaurant: "French restaurant",
  japanese_restaurant: "Japanese restaurant",
  chinese_restaurant: "Chinese restaurant",
  thai_restaurant: "Thai restaurant",
  mexican_restaurant: "Mexican restaurant",
  mediterranean_restaurant: "Mediterranean restaurant",
  seafood_restaurant: "Seafood restaurant",
  steak_house: "Steakhouse",
  sushi_restaurant: "Sushi restaurant",
  vegetarian_restaurant: "Vegetarian restaurant",
  vegan_restaurant: "Vegan restaurant",
  pizza_restaurant: "Pizzeria",
  fine_dining_restaurant: "Fine dining restaurant",
  fast_food_restaurant: "Casual eatery",
  brunch_restaurant: "Brunch spot",
  breakfast_restaurant: "Breakfast spot",
  cafe: "Cafe",
  coffee_shop: "Coffee shop",
  bakery: "Bakery",
  ice_cream_shop: "Ice cream shop",
  dessert_shop: "Dessert shop",
  bar: "Bar",
  wine_bar: "Wine bar",
  pub: "Pub",
  night_club: "Nightclub",
  brewery: "Brewery",
  winery: "Winery",
  hotel: "Hotel",
  hostel: "Hostel",
  museum: "Museum",
  art_gallery: "Art gallery",
  church: "Church",
  cathedral: "Cathedral",
  mosque: "Mosque",
  synagogue: "Synagogue",
  hindu_temple: "Hindu temple",
  buddhist_temple: "Buddhist temple",
  monument: "Monument",
  historical_landmark: "Historical landmark",
  tourist_attraction: "Tourist attraction",
  park: "Park",
  national_park: "National park",
  beach: "Beach",
  market: "Market",
  shopping_mall: "Shopping mall",
  book_store: "Bookstore",
  clothing_store: "Clothing store",
  library: "Library",
  zoo: "Zoo",
  aquarium: "Aquarium",
  amusement_park: "Amusement park",
  spa: "Spa",
};

/**
 * Synthesizes a one-line description from Google's place types when the editorial
 * summary is missing. Picks the most specific known type. Returns undefined if no
 * type maps to a friendly label.
 */
function describeFromTypes(types?: string[]): string | undefined {
  if (!types?.length) return undefined;
  // Prefer types in the order Google returns them — they're sorted most-specific first.
  for (const t of types) {
    const label = FRIENDLY_TYPE_LABELS[t];
    if (label) return label;
  }
  return undefined;
}

function deduplicateByPlaceId(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Map<string, ExtractedItem>();
  const result: ExtractedItem[] = [];
  for (const item of items) {
    if (!item.placeId) {
      result.push(item);
      continue;
    }
    const existing = seen.get(item.placeId);
    if (!existing) {
      seen.set(item.placeId, item);
      result.push(item);
    } else {
      // Keep whichever has richer notes
      const incomingScore = (item.notes?.length ?? 0);
      const existingScore = (existing.notes?.length ?? 0);
      if (incomingScore > existingScore) {
        const idx = result.indexOf(existing);
        if (idx >= 0) result[idx] = item;
        seen.set(item.placeId, item);
      }
    }
  }
  return result;
}

async function extractItems(
  rawText: string,
  sourceUrl: string | undefined,
  tripCtx: TripContext
): Promise<ExtractedItem[]> {
  const triaged = await triageDocument(rawText);
  const chunks = chunkText(triaged, 8000, 1000);

  const chunkResults = await Promise.all(
    chunks.map((chunk) => extractItemsFromChunk(chunk, sourceUrl))
  );

  const dedupedByName = deduplicateItems(chunkResults.flat());
  const enriched = await enrichItemsViaPlaces(dedupedByName, tripCtx);
  const dedupedByAddress = deduplicateByAddress(enriched);
  return deduplicateByPlaceId(dedupedByAddress);
}

async function enrichItemsViaPlaces(
  items: ExtractedItem[],
  tripCtx: TripContext
): Promise<ExtractedItem[]> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return items;

  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        // Bias the search to the trip region. Two layers:
        //   1. Append the trip's region to the query string when the LLM didn't
        //      already capture a location — this is the strongest signal for
        //      Google's text search.
        //   2. Pass `location` to searchPlaces so it geocodes and applies a
        //      locationBias circle around the trip area.
        const queryParts = [item.name];
        if (item.location) queryParts.push(item.location);
        if (tripCtx.searchHint) queryParts.push(tripCtx.searchHint);
        const query = queryParts.join(", ");

        const { places } = await searchPlaces({
          query,
          location: item.location || tripCtx.searchHint,
        });
        if (!places.length) return item;

        const top = places[0];

        // Reject matches whose address falls outside the trip region. Catches
        // global namesakes (e.g. "Alma" → Brooklyn, "Portobello Road Market" → London,
        // "Bao Bao Cafe" → wherever) that slip past query biasing because their global
        // popularity outranks the local match.
        if (!addressMatchesTrip(top.address, tripCtx)) {
          return item;
        }

        const details = await getPlaceDetails({ placeId: top.placeId });
        if (!details) return item;

        // Defense in depth — verify the detailed address too.
        if (!addressMatchesTrip(details.address, tripCtx)) {
          return item;
        }

        const ratingStr = details.rating ? `${details.rating}★` : "";
        const reviewCountStr = details.reviewCount ? `(${details.reviewCount} reviews)` : "";
        const ratingBadge = [ratingStr, reviewCountStr].filter(Boolean).join(" ");

        // Description: prefer Google's editorialSummary; fall back to a friendly
        // type label ("Italian restaurant", "Park", "Bookstore"). Better than nothing
        // for places where Google has no editorial coverage.
        const description = details.description?.trim() || describeFromTypes(top.types);

        // Compose notes: rating · description · recommender's tip
        // Skip the recommender's tip if it duplicates the description.
        const personalNote = item.notes?.trim();
        const isRedundant =
          description && personalNote &&
          (description.toLowerCase().includes(personalNote.toLowerCase()) ||
           personalNote.toLowerCase().includes(description.toLowerCase()));

        const noteParts = [ratingBadge, description];
        if (personalNote && !isRedundant) noteParts.push(personalNote);
        const notes = noteParts.filter(Boolean).join(" · ") || undefined;

        return {
          ...item,
          name: details.name || item.name,
          location: details.address ?? item.location,
          notes,
          sourceUrl: item.sourceUrl || details.website || undefined,
          priceRange: item.priceRange || (details.priceLevel != null ? PRICE_LEVEL_LABELS[details.priceLevel] : undefined),
          placeId: details.placeId || top.placeId,
          // The LLM has the surrounding text context (e.g. "Time Out Market - 10 min from Teatro"
          // → restaurant, not bar; "Fauna & Flora - brunch" → restaurant, not bar). Google's
          // place types are a flat list and often include incidental categories — e.g. a food
          // hall like Time Out Market is tagged with `bar` because it has bar stalls inside.
          //
          // Rule: trust the LLM's specific call. Only fall back to Google's categorization
          // when the LLM punted to "general" (typical for markets, landmarks, etc. that the
          // LLM doesn't have a bucket for).
          category: (() => {
            if (item.category && item.category !== "general") return item.category;
            return categorizePlaceTypes(top.types);
          })(),
        };
      } catch {
        return item;
      }
    })
  );
  return enriched;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tripId, type, content, recommender } = body as {
      tripId: string;
      type: "url" | "text" | "file";
      content: string;
      recommender?: string;
    };

    if (!tripId || !type || !content) {
      return Response.json(
        { error: "tripId, type, and content are required" },
        { status: 400 }
      );
    }

    const trip = await getTrip(tripId);
    if (!trip) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }

    const rec: Recommendation = {
      id: uuid(),
      type,
      rawInput: type === "file" ? "(uploaded PDF)" : content,
      recommender,
      status: "processing",
      extractedItems: [],
      addedAt: new Date().toISOString(),
    };

    try {
      const tripCtx = buildTripContext(trip);
      const { rawText, sourceUrl, directItems } = await extractRawContent(type, content);
      if (directItems && directItems.length > 0) {
        rec.extractedItems = directItems;
      } else if (rawText.trim()) {
        rec.extractedItems = await extractItems(rawText, sourceUrl, tripCtx);
      }
      rec.status = "ready";
    } catch (err) {
      rec.status = "error";
      rec.error = err instanceof Error ? err.message : "Processing failed";
    }

    if (!trip.recommendations) trip.recommendations = [];
    trip.recommendations.push(rec);
    trip.updatedAt = new Date().toISOString();
    await saveTrip(trip);

    return Response.json(rec);
  } catch (err) {
    console.error("Recommendations API error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const recId = searchParams.get("id");
  const recommender = searchParams.get("recommender");
  const itemIndexParam = searchParams.get("itemIndex");

  if (!tripId || (!recId && !recommender)) {
    return Response.json(
      { error: "tripId and either id or recommender are required" },
      { status: 400 }
    );
  }

  const trip = await getTrip(tripId);
  if (!trip) {
    return Response.json({ error: "Trip not found" }, { status: 404 });
  }

  if (recommender && !recId) {
    trip.recommendations = (trip.recommendations || []).filter(
      (r) => (r.recommender || "_unnamed") !== recommender
    );
    if (trip.recommenderPriorities) {
      delete trip.recommenderPriorities[recommender];
    }
  } else if (itemIndexParam != null && recId) {
    const idx = parseInt(itemIndexParam, 10);
    trip.recommendations = (trip.recommendations || []).map((r) => {
      if (r.id !== recId) return r;
      return { ...r, extractedItems: r.extractedItems.filter((_, i) => i !== idx) };
    }).filter((r) => r.extractedItems.length > 0 || r.status !== "ready");
  } else if (recId) {
    trip.recommendations = (trip.recommendations || []).filter(
      (r) => r.id !== recId
    );
  }

  trip.updatedAt = new Date().toISOString();
  await saveTrip(trip);

  return Response.json({ success: true });
}

export async function PATCH(req: Request) {
  try {
    const { tripId, recommender, priority } = (await req.json()) as {
      tripId: string;
      recommender: string;
      priority: number;
    };

    if (!tripId || !recommender || priority == null) {
      return Response.json(
        { error: "tripId, recommender, and priority are required" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      return Response.json(
        { error: "priority must be an integer between 1 and 5" },
        { status: 400 }
      );
    }

    const trip = await getTrip(tripId);
    if (!trip) {
      return Response.json({ error: "Trip not found" }, { status: 404 });
    }

    if (!trip.recommenderPriorities) trip.recommenderPriorities = {};
    trip.recommenderPriorities[recommender] = priority;
    trip.updatedAt = new Date().toISOString();
    await saveTrip(trip);

    return Response.json({ success: true });
  } catch (err) {
    console.error("Recommendations PATCH error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
