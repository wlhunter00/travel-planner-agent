import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { saveTrip } from "@/lib/trips-store";
import { requireAuth } from "@/lib/api-auth";
import { extractTextFromBase64 } from "@/lib/extract-text";
import { createNewTrip } from "@/lib/types";
import type { TripState, ImportMeta, ImportedHotelAlternative } from "@/lib/types";

export const maxDuration = 120;

// ── Step 1 schema: detect itineraries within the document ─────────────────

const itineraryDetectionSchema = z.object({
  destination: z.string().describe("Overall destination region (e.g. 'Galicia, Spain')"),
  itineraries: z.array(
    z.object({
      title: z.string().describe("Human-readable itinerary title"),
      optionLabel: z
        .string()
        .nullable()
        .describe("Short label like 'Option A' or 'Plan B', null if only one itinerary"),
      summary: z.string().describe("1-2 sentence summary of this option"),
      dateHint: z.string().nullable().describe("Date range mentioned, e.g. 'June 29 – July 5'"),
      travelersHint: z.number().nullable().describe("Number of travelers if mentioned"),
      startCharIndex: z.number().describe("Approximate character offset where this itinerary starts"),
      endCharIndex: z.number().describe("Approximate character offset where this itinerary ends"),
    })
  ),
});

// ── Step 2 schema: parse one itinerary into structured TripState ──────────

const parsedCitySchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  days: z.number(),
  startDate: z.string().nullable().describe("YYYY-MM-DD or null"),
  endDate: z.string().nullable().describe("YYYY-MM-DD or null"),
});

const parsedHotelSchema = z.object({
  id: z.string(),
  name: z.string(),
  cityId: z.string().describe("Must match a city id"),
  address: z.string().nullable(),
  priceHint: z.string().nullable().describe("e.g. '€350-500/night'"),
  rating: z.string().nullable().describe("e.g. '8.8 Booking' or '4.7 Google'"),
  bookingUrl: z.string().nullable(),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  isTopPick: z.boolean().describe("True if this is the document's recommended pick for its base"),
});

const parsedActivitySchema = z.object({
  id: z.string(),
  type: z.enum(["poi", "meal", "tour", "travel", "free_time", "experience"]),
  title: z.string(),
  duration: z.string().nullable(),
  notes: z.string().nullable(),
  bookingUrl: z.string().nullable(),
});

const parsedDaySchema = z.object({
  id: z.string(),
  date: z.string().describe("YYYY-MM-DD"),
  cityId: z.string(),
  daySummary: z.string(),
  activities: z.array(parsedActivitySchema),
});

const tripStateExtractionSchema = z.object({
  destination: z.string(),
  startDate: z.string().describe("YYYY-MM-DD"),
  endDate: z.string().describe("YYYY-MM-DD"),
  travelers: z.number(),
  style: z.string().describe("Brief travel style description from the doc"),
  budget: z.string().nullable(),
  cities: z.array(parsedCitySchema),
  hotels: z.array(parsedHotelSchema),
  days: z.array(parsedDaySchema),
  notes: z
    .string()
    .nullable()
    .describe("Key highlights, constraints, or booking warnings from the doc"),
  statedDriveTimes: z
    .array(z.string())
    .describe("All driving/transit time statements from the doc, e.g. 'Baiona → Vigo ferry: 30 min'"),
});

// ── Helpers ───────────────────────────────────────────────────────────────

function sliceText(fullText: string, start: number, end: number): string {
  return fullText.slice(
    Math.max(0, start),
    Math.min(fullText.length, end),
  );
}

// ── POST handler ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { filename, mimeType, content } = body as {
    filename?: string;
    mimeType?: string;
    content: string;
  };

  if (!content) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  // ── Extract plain text ────────────────────────────────────────────────

  let fullText: string;
  const isBase64 =
    mimeType === "application/pdf" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (isBase64 && mimeType) {
    try {
      fullText = await extractTextFromBase64(content, mimeType);
    } catch (e) {
      console.error("[import] text extraction failed:", e);
      return Response.json(
        { error: "Failed to extract text from the uploaded file" },
        { status: 422 },
      );
    }
  } else {
    fullText = content;
  }

  if (!fullText.trim() || fullText.trim().length < 50) {
    return Response.json(
      { error: "Document appears empty or too short to contain an itinerary" },
      { status: 422 },
    );
  }

  // ── Step 1: detect itineraries ────────────────────────────────────────

  let detection: z.infer<typeof itineraryDetectionSchema>;
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: itineraryDetectionSchema,
      prompt: `You are analyzing a travel document to identify distinct itinerary options.

A document may contain multiple itinerary options (e.g. "Option A", "Option B", "Itinerary 1", "Plan A / Plan B", or sections with different base cities). Or it may contain just a single itinerary.

For EACH distinct itinerary option, extract:
- A descriptive title
- An option label if applicable (e.g. "Option A — Rías Baixas Base + Ribadeo")
- A brief summary
- The approximate character positions in the text where it starts and ends
- Date and traveler hints if mentioned

IMPORTANT:
- Hotels sections that list alternatives within the SAME option are NOT separate itineraries — they are choices within one option.
- Day-by-day plans that belong to the same option header are part of that single option.
- Only split into separate itineraries when the document explicitly presents them as different overall trip plans or options.

If there is only one itinerary in the whole document, return a single entry covering the entire text.

Document text:
${fullText.slice(0, 80_000)}`,
    });
    detection = object;
  } catch (e) {
    console.error("[import] itinerary detection failed:", e);
    return Response.json(
      { error: "Failed to analyze document structure" },
      { status: 422 },
    );
  }

  if (!detection.itineraries.length) {
    return Response.json(
      { error: "No itinerary found in the document" },
      { status: 422 },
    );
  }

  // ── Step 2: parse each itinerary into TripState (parallel) ────────────

  const batchId = uuid();
  const sourceFilename = filename || "imported-document";

  const parsePromises = detection.itineraries.map(async (itin) => {
    const excerpt = sliceText(fullText, itin.startCharIndex, itin.endCharIndex);
    const { object: parsed } = await generateObject({
      model: openai("gpt-4o"),
      schema: tripStateExtractionSchema,
      prompt: `Extract a structured trip itinerary from the following text. This is one specific option/plan from a travel document.

RULES:
- Generate unique IDs for cities, hotels, days, and activities (use short slugs like "city-baiona", "hotel-parador-baiona", "day-1", "act-1-1").
- For hotels: mark the document's TOP PICK / recommended choice with isTopPick=true. All other hotel alternatives for the same base should have isTopPick=false.
- Map each hotel's cityId to a city you extracted.
- For days: each day should have a date (YYYY-MM-DD) and a cityId matching one of the cities. Use the date hints from context: ${itin.dateHint || "infer from the document"}.
- For activities: classify them into poi (sightseeing), meal (restaurants/food), tour (guided tours/excursions), travel (driving/ferry segments), free_time, or experience (wine tasting, fishing, etc.).
- Capture all 🚗 driving/transit time statements in statedDriveTimes.
- In notes, capture key warnings like "BOOK NOW", advance booking requirements, max driving constraints, and other planning-critical info.
- Travelers: ${itin.travelersHint ?? "infer from context or default to 2"}.

Itinerary text:
${excerpt.slice(0, 60_000)}`,
    });

    return { itin, parsed, excerpt };
  });

  let parseResults: Awaited<typeof parsePromises[number]>[];
  try {
    parseResults = await Promise.all(parsePromises);
  } catch (e) {
    console.error("[import] itinerary parsing failed:", e);
    return Response.json(
      { error: "Failed to parse itinerary details" },
      { status: 422 },
    );
  }

  // ── Step 3: create Trip records ───────────────────────────────────────

  const createdTrips: { id: string; name: string; optionLabel?: string }[] = [];

  for (const { itin, parsed, excerpt } of parseResults) {
    const tripId = uuid();
    const trip = createNewTrip(tripId);

    const topPickHotels = parsed.hotels
      .filter((h) => h.isTopPick)
      .map((h) => ({
        id: h.id,
        name: h.name,
        cityId: h.cityId,
        address: h.address ?? undefined,
        bookingUrl: h.bookingUrl ?? undefined,
        checkIn: h.checkIn ?? undefined,
        checkOut: h.checkOut ?? undefined,
      }));

    const alternativeHotels: ImportedHotelAlternative[] = parsed.hotels
      .filter((h) => !h.isTopPick)
      .map((h) => ({
        name: h.name,
        baseLabel: h.cityId,
        description: undefined,
        rating: h.rating ?? undefined,
        priceHint: h.priceHint ?? undefined,
        bookingUrl: h.bookingUrl ?? undefined,
      }));

    const importMeta: ImportMeta = {
      sourceFilename,
      importedAt: new Date().toISOString(),
      batchId,
      optionLabel: itin.optionLabel ?? undefined,
      alternatives:
        alternativeHotels.length > 0
          ? { hotels: alternativeHotels }
          : undefined,
      rawTextExcerpt: excerpt.slice(0, 3000),
      statedDriveTimes:
        parsed.statedDriveTimes.length > 0
          ? parsed.statedDriveTimes
          : undefined,
    };

    const tripState: TripState = {
      destination: parsed.destination || detection.destination,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      travelers: parsed.travelers,
      style: parsed.style,
      budget: parsed.budget ?? "",
      flights: [],
      cities: parsed.cities.map((c) => ({
        id: c.id,
        name: c.name,
        country: c.country,
        days: c.days,
        startDate: c.startDate ?? undefined,
        endDate: c.endDate ?? undefined,
      })),
      hotels: topPickHotels,
      days: parsed.days.map((d) => ({
        id: d.id,
        date: d.date,
        cityId: d.cityId,
        daySummary: d.daySummary,
        activities: d.activities.map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          duration: a.duration ?? undefined,
          notes: a.notes ?? undefined,
          bookingUrl: a.bookingUrl ?? undefined,
        })),
      })),
      notes: parsed.notes ?? undefined,
      import: importMeta,
    };

    const tripName = itin.optionLabel
      ? `${detection.destination} · ${itin.optionLabel}`
      : detection.destination || itin.title;

    trip.name = tripName;
    trip.destination = tripState.destination;
    trip.startDate = tripState.startDate;
    trip.endDate = tripState.endDate;
    trip.state = tripState;
    trip.phase = "review";
    trip.status = "planning";

    await saveTrip(trip, userId);

    createdTrips.push({
      id: tripId,
      name: tripName,
      optionLabel: itin.optionLabel ?? undefined,
    });
  }

  return Response.json({ batchId, trips: createdTrips }, { status: 201 });
}
