import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { getTrip, saveTrip } from "@/lib/trips-store";
import { fetchUrlContent } from "@/lib/tools/exa";
import { searchPlaces, getPlaceDetails } from "@/lib/tools/google-places";
import type { Recommendation, ExtractedItem } from "@/lib/types";
import { v4 as uuid } from "uuid";

export const maxDuration = 60;

const extractedItemSchema = z.object({
  name: z.string().describe("Name of the place, venue, or recommendation"),
  category: z
    .enum(["restaurant", "hotel", "attraction", "activity", "neighborhood", "general"])
    .describe("Best-fit category"),
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
  if (t.includes("restaurant") || t.includes("food") || t.includes("cafe") || t.includes("bakery") || t.includes("bar")) return "restaurant";
  if (t.includes("lodging") || t.includes("hotel")) return "hotel";
  if (t.includes("museum") || t.includes("church") || t.includes("monument") || t.includes("tourist_attraction")) return "attraction";
  if (t.includes("park") || t.includes("gym") || t.includes("spa") || t.includes("amusement")) return "activity";
  if (t.includes("neighborhood") || t.includes("sublocality") || t.includes("locality")) return "neighborhood";
  // Books, shops, stores, etc. → activity
  if (t.includes("store") || t.includes("book") || t.includes("shop")) return "activity";
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

function deduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Map<string, ExtractedItem>();
  for (const item of items) {
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = seen.get(key);
    if (!existing || (item.notes && !existing.notes)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

const EXTRACT_PROMPT = `Extract ALL travel recommendations from the following text. Identify every specific named place — restaurants, hotels, attractions, activities, bookshops, wineries, palaces, churches, museums, neighborhoods, viewpoints, pastry shops, etc. Include the context about why each was mentioned or tips given. If you cannot identify any specific travel recommendations, return an empty array.`;

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

async function extractItems(
  rawText: string,
  sourceUrl?: string
): Promise<ExtractedItem[]> {
  const chunks = chunkText(rawText, 12000, 500);

  const chunkResults = await Promise.all(
    chunks.map((chunk) => extractItemsFromChunk(chunk, sourceUrl))
  );

  const allItems = deduplicateItems(chunkResults.flat());
  return enrichItemsViaPlaces(allItems);
}

async function enrichItemsViaPlaces(items: ExtractedItem[]): Promise<ExtractedItem[]> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return items;

  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        const query = item.location ? `${item.name}, ${item.location}` : item.name;
        const { places } = await searchPlaces({ query });
        if (!places.length) return item;

        const top = places[0];
        const details = await getPlaceDetails({ placeId: top.placeId });
        if (!details) return item;

        const ratingStr = details.rating ? `${details.rating}★` : "";
        const reviewCountStr = details.reviewCount ? `(${details.reviewCount} reviews)` : "";
        const ratingBadge = [ratingStr, reviewCountStr].filter(Boolean).join(" ");

        let notes: string | undefined;
        if (item.notes) {
          notes = ratingBadge ? `${ratingBadge} · ${item.notes}` : item.notes;
        } else {
          const parts = [ratingBadge, details.description].filter(Boolean);
          notes = parts.join(" · ") || undefined;
        }

        return {
          ...item,
          name: details.name || item.name,
          location: details.address ?? item.location,
          notes,
          sourceUrl: item.sourceUrl || details.website || undefined,
          priceRange: item.priceRange || (details.priceLevel != null ? PRICE_LEVEL_LABELS[details.priceLevel] : undefined),
          category: item.category || categorizePlaceTypes(top.types),
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
      const { rawText, sourceUrl, directItems } = await extractRawContent(type, content);
      if (directItems && directItems.length > 0) {
        rec.extractedItems = directItems;
      } else if (rawText.trim()) {
        rec.extractedItems = await extractItems(rawText, sourceUrl);
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
  const itemIndexParam = searchParams.get("itemIndex");

  if (!tripId || !recId) {
    return Response.json(
      { error: "tripId and id are required" },
      { status: 400 }
    );
  }

  const trip = await getTrip(tripId);
  if (!trip) {
    return Response.json({ error: "Trip not found" }, { status: 404 });
  }

  if (itemIndexParam != null) {
    const idx = parseInt(itemIndexParam, 10);
    trip.recommendations = (trip.recommendations || []).map((r) => {
      if (r.id !== recId) return r;
      return { ...r, extractedItems: r.extractedItems.filter((_, i) => i !== idx) };
    }).filter((r) => r.extractedItems.length > 0 || r.status !== "ready");
  } else {
    trip.recommendations = (trip.recommendations || []).filter(
      (r) => r.id !== recId
    );
  }

  trip.updatedAt = new Date().toISOString();
  await saveTrip(trip);

  return Response.json({ success: true });
}
