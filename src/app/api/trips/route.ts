import { NextResponse } from "next/server";
import { listTrips, saveTrip, getTrip, deleteTrip } from "@/lib/trips-store";
import { createNewTrip } from "@/lib/types";
import { requireAuth } from "@/lib/api-auth";
import { classifyDbError } from "@/lib/db-errors";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    const trip = await getTrip(id, userId);
    if (!trip) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(trip);
  }
  const trips = await listTrips(userId);
  return NextResponse.json(trips);
}

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const id = uuidv4();
  const trip = createNewTrip(id);
  if (body.name) trip.name = body.name;
  await saveTrip(trip, userId);
  return NextResponse.json(trip, { status: 201 });
}

const MAX_TRIP_PAYLOAD_BYTES = 4_000_000;

export async function PUT(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const started = Date.now();
  const raw = await req.text();
  const payloadKB = Math.round(raw.length / 1024);

  if (raw.length > MAX_TRIP_PAYLOAD_BYTES) {
    console.warn("[chat-persist] put rejected", { payloadKB, code: "payload_too_large" });
    return NextResponse.json(
      { error: "Trip payload too large", code: "payload_too_large", payloadKB },
      { status: 413 }
    );
  }

  let trip: unknown;
  try {
    trip = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!trip || typeof trip !== "object" || !(trip as { id?: string }).id) {
    return NextResponse.json({ error: "Missing trip id" }, { status: 400 });
  }

  const tripId = (trip as { id: string }).id;
  try {
    await saveTrip(trip as Parameters<typeof saveTrip>[0], userId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code = classifyDbError(message);
    console.error("[chat-persist] put failed", {
      tripId,
      payloadKB,
      durationMs: Date.now() - started,
      code,
      message,
    });
    return NextResponse.json({ error: "Save failed", code }, { status: 500 });
  }

  console.log("[chat-persist] put", {
    tripId,
    payloadKB,
    durationMs: Date.now() - started,
    ok: true,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await deleteTrip(id, userId);
  return NextResponse.json({ ok: true });
}
