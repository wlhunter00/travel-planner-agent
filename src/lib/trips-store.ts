import type { Trip, TripState, ChatMessage, Recommendation } from "./types";
import { prisma } from "./prisma";

export interface TripIndex {
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

export async function listTrips(userId: string): Promise<TripIndex[]> {
  const rows = await prisma.trip.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      phase: true,
      destination: true,
      startDate: true,
      endDate: true,
      coverImage: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    phase: r.phase,
    destination: r.destination,
    startDate: r.startDate,
    endDate: r.endDate,
    coverImage: r.coverImage ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getTrip(id: string, userId: string): Promise<Trip | null> {
  const row = await prisma.trip.findFirst({ where: { id, userId } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status as Trip["status"],
    phase: row.phase as Trip["phase"],
    destination: row.destination,
    startDate: row.startDate,
    endDate: row.endDate,
    coverImage: row.coverImage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    state: (row.state as unknown as TripState) ?? ({} as TripState),
    chatHistory: ((row.chatHistory as unknown) as ChatMessage[]) ?? [],
    recommendations: ((row.recommendations as unknown) as Recommendation[]) ?? [],
    recommenderPriorities:
      ((row.recommenderPriorities as unknown) as Record<string, number>) ?? {},
  };
}

export async function saveTrip(trip: Trip, userId: string): Promise<void> {
  const data = {
    name: trip.name,
    status: trip.status,
    phase: trip.phase,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    coverImage: trip.coverImage ?? null,
    state: trip.state as unknown as object,
    chatHistory: (trip.chatHistory ?? []) as unknown as object,
    recommendations: (trip.recommendations ?? []) as unknown as object,
    recommenderPriorities: (trip.recommenderPriorities ?? {}) as unknown as object,
  };

  await prisma.trip.upsert({
    where: { id: trip.id },
    update: data,
    create: { id: trip.id, userId, ...data },
  });
}

export async function deleteTrip(id: string, userId: string): Promise<void> {
  await prisma.trip.deleteMany({ where: { id, userId } });
}
