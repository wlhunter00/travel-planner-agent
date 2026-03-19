import { NextResponse } from "next/server";
import { listTrips, saveTrip, getTrip, deleteTrip } from "@/lib/trips-store";
import { createNewTrip } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    const trip = await getTrip(id);
    if (!trip) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(trip);
  }
  const trips = await listTrips();
  return NextResponse.json(trips);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = uuidv4();
  const trip = createNewTrip(id);
  if (body.name) trip.name = body.name;
  await saveTrip(trip);
  return NextResponse.json(trip, { status: 201 });
}

export async function PUT(req: Request) {
  const trip = await req.json();
  if (!trip?.id) {
    return NextResponse.json({ error: "Missing trip id" }, { status: 400 });
  }
  await saveTrip(trip);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await deleteTrip(id);
  return NextResponse.json({ ok: true });
}
