/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * One-off: reset trip state to match portugal-trip-plan.pdf.
 * Run from repo root: npx tsx scripts/restore-portugal-trip.ts
 * Dry run (no DB write): npx tsx scripts/restore-portugal-trip.ts --dry-run
 *
 * CLOSE ALL browser tabs on this trip first — ChatPanel autosave would overwrite otherwise.
 */

import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

import type { CityStop, ConfirmedHotel, Hotel, SkeletonDay, TripState } from "../src/lib/types";

loadEnv({ path: ".env.local" });
loadEnv();

const TRIP_ID = "f4c7ce55-e653-4519-a4b5-57ce2170ec2c";

const RESTORED_NOTE = `\n---\nSource: portugal-trip-plan.pdf, restored ${new Date().toISOString().slice(0, 10)}`;

const ITINERARY_SKELETON: SkeletonDay[] = [
  { date: "2026-09-19", city: "Lisbon", plan: "Arrival around noon; light afternoon/evening in central Lisbon" },
  { date: "2026-09-20", city: "Lisbon", plan: "Lisbon city day" },
  { date: "2026-09-21", city: "Lisbon", plan: "Sintra day trip" },
  { date: "2026-09-22", city: "Lisbon", plan: "Cascais day trip" },
  {
    date: "2026-09-23",
    city: "Porto",
    plan:
      "Late-morning train (~11:30 AM) from Lisbon to Porto; Porto afternoon/evening",
  },
  { date: "2026-09-24", city: "Porto", plan: "Douro Valley day trip" },
  { date: "2026-09-25", city: "Porto", plan: "Porto city day" },
  { date: "2026-09-26", city: "Porto", plan: "Fly out" },
];

const CITIES: CityStop[] = [
  {
    id: "lisbon",
    name: "Lisbon",
    country: "Portugal",
    days: 4,
    startDate: "2026-09-19",
    endDate: "2026-09-23",
  },
  {
    id: "porto",
    name: "Porto",
    country: "Portugal",
    days: 3,
    startDate: "2026-09-23",
    endDate: "2026-09-26",
  },
];

const HOTELS: Hotel[] = [
  {
    id: "browns-central",
    name: "Brown's Central Hotel",
    cityId: "lisbon",
    address: "Baixa–Chiado edge",
    checkIn: "2026-09-19",
    checkOut: "2026-09-23",
    source: "Hotel",
  },
  {
    id: "casa-dos-loios",
    name: "Casa dos Lóios by Shiadu",
    cityId: "porto",
    address: "Historic center / São Bento / Ribeira-adjacent",
    checkIn: "2026-09-23",
    checkOut: "2026-09-26",
    source: "Hotel",
  },
];

const CONFIRMED_HOTELS: Record<string, ConfirmedHotel> = {
  lisbon: {
    name: "Brown's Central Hotel",
    area: "Baixa–Chiado edge",
  },
  porto: {
    name: "Casa dos Lóios by Shiadu",
    area: "Historic center / São Bento / Ribeira-adjacent",
  },
};

const pdfNotesSections = `
Current planning notes
- Lisbon arrival day: planned as a real but light first day since arrival into the city should be around noon.
- Lisbon excursion days: Sintra on Monday; Cascais on Tuesday.
- Porto transfer day: target is an 11-ish / 11:30 AM direct train from Lisbon to Porto so you still have a real Porto half-day.
- Douro day moved to Thursday, leaving Friday as a cleaner Porto city day before departure.

Transit notes already researched
- Lisbon → Porto train: current timetable pattern suggests a good direct option around 11:30 AM, arriving around 2:45 PM (exact 2026 schedules still to be confirmed when tickets open).
- Sintra access from Lisbon: straightforward by rail from the Rossio side of Lisbon.
- Douro: best done as a guided day trip, not self-driving, since wine tasting is part of the appeal.

Likely next bookings (from PDF): (1) Lisbon → Porto train, (2) Douro Valley day tour, (3) Sintra timed entries / day structure.

Still to be finalized
- Exact Lisbon arrival-afternoon plan
- Exact Porto arrival-afternoon/evening plan
- Which Sintra sights to prioritize
- Which Douro tour to book
- Restaurant shortlist in both cities
`.trim();

const prisma = new PrismaClient();

function countState(state: unknown): {
  days: number;
  cities: number;
  hotels: number;
  itinerarySkeleton: number;
} {
  const s = state as TripState | null | undefined;
  return {
    days: Array.isArray(s?.days) ? s.days.length : 0,
    cities: Array.isArray(s?.cities) ? s.cities.length : 0,
    hotels: Array.isArray(s?.hotels) ? s.hotels.length : 0,
    itinerarySkeleton: Array.isArray(s?.itinerarySkeleton) ? s.itinerarySkeleton.length : 0,
  };
}

function countJson(arr: unknown): number {
  return Array.isArray(arr) ? arr.length : 0;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const row = await prisma.trip.findUnique({ where: { id: TRIP_ID } });
  if (!row) {
    console.error(`Trip not found: ${TRIP_ID}`);
    process.exit(1);
  }

  const priorState = (row.state as unknown as TripState) ?? {};

  const before = countState(row.state);

  const priorNotes =
    typeof priorState.notes === "string" && priorState.notes.trim().length > 0
      ? `${priorState.notes.trim()}\n\n`
      : "";

  const mergedNotes = `${priorNotes}${pdfNotesSections}${RESTORED_NOTE}`;

  const newState: TripState = {
    ...priorState,
    destination: "Portugal",
    startDate: "2026-09-19",
    endDate: "2026-09-26",
    travelers: 2,
    style: priorState.style ?? "",
    budget: priorState.budget ?? "",
    flights: Array.isArray(priorState.flights) ? priorState.flights : [],
    cities: CITIES,
    hotels: HOTELS,
    days: [],
    itinerarySkeleton: ITINERARY_SKELETON,
    route: {
      order: ["lisbon", "porto"],
      transfer:
        "Lisbon → Porto direct train, ~11:30 AM departure / ~2:45 PM arrival (2026 schedule TBC)",
    },
    lodging: {
      ...(priorState.lodging ?? {}),
      confirmedHotels: CONFIRMED_HOTELS,
      confirmedNeighborhoods: {
        lisbon: "Baixa–Chiado edge",
        porto: "Historic center / São Bento / Ribeira",
      },
    },
    notes: mergedNotes,
  };

  const chatCount = countJson(row.chatHistory);
  const recCount = countJson(row.recommendations);
  const after = countState(newState);

  console.log("Restore Portugal trip — state only (chat + recommendations preserved)");
  console.log(`Trip ID: ${TRIP_ID}`);
  console.log(
    `Before: days=${before.days}, cities=${before.cities}, hotels=${before.hotels}, itinerarySkeleton=${before.itinerarySkeleton}`,
  );
  console.log(
    `After:  days=${after.days}, cities=${after.cities}, hotels=${after.hotels}, itinerarySkeleton=${after.itinerarySkeleton}`,
  );
  console.log(`chatHistory preserved: ${chatCount} messages`);
  console.log(`recommendations preserved: ${recCount} items`);

  const updateData = {
    name: "Portugal Trip",
    phase: "day_plans",
    destination: "Portugal",
    startDate: "2026-09-19",
    endDate: "2026-09-26",
    state: newState as unknown as object,
    // Preserve status implicitly by not touching it below—Prisma omit means unchanged ✓

  };

  if (dryRun) {
    console.log("\n[Dry run] No database write.");
    console.log(JSON.stringify(updateData, null, 2).slice(0, 2000) + "\n…");
    await prisma.$disconnect();
    process.exit(0);
  }

  await prisma.trip.update({
    where: { id: TRIP_ID },
    data: updateData,
  });

  console.log("\nDone. Reload the trip in ONE browser tab.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
