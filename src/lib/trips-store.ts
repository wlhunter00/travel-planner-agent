import type { Trip } from "./types";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".travel-planner", "trips");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function tripPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

const INDEX_PATH = path.join(DATA_DIR, "index.json");

interface TripIndex {
  id: string;
  name: string;
  status: string;
  phase: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverImage?: string;
  createdAt: string;
  updatedAt: string;
}

async function readIndex(): Promise<TripIndex[]> {
  try {
    const data = await fs.readFile(INDEX_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeIndex(index: TripIndex[]) {
  await ensureDir();
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
}

function tripToIndexEntry(trip: Trip): TripIndex {
  return {
    id: trip.id,
    name: trip.name,
    status: trip.status,
    phase: trip.phase,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    coverImage: trip.coverImage,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

export async function listTrips(): Promise<TripIndex[]> {
  return readIndex();
}

export async function getTrip(id: string): Promise<Trip | null> {
  try {
    const data = await fs.readFile(tripPath(id), "utf-8");
    const trip = JSON.parse(data);
    if (!trip.recommendations) trip.recommendations = [];
    return trip;
  } catch {
    return null;
  }
}

export async function saveTrip(trip: Trip): Promise<void> {
  await ensureDir();
  await fs.writeFile(tripPath(trip.id), JSON.stringify(trip, null, 2));

  const index = await readIndex();
  const existing = index.findIndex((t) => t.id === trip.id);
  const entry = tripToIndexEntry(trip);
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.unshift(entry);
  }
  await writeIndex(index);
}

export async function deleteTrip(id: string): Promise<void> {
  try {
    await fs.unlink(tripPath(id));
  } catch {
    // file may not exist
  }
  const index = await readIndex();
  await writeIndex(index.filter((t) => t.id !== id));
}
