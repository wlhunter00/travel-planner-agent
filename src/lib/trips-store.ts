import type { Trip, TripState, ChatMessage, Recommendation } from "./types";
import { isShrinkingChatSnapshot } from "./chat-history-save-guard";
import { prisma } from "./prisma";
import { StaleSaveError } from "./stale-save-error";

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
  importBatchId?: string;
  importOptionLabel?: string;
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
      state: true,
    },
  });
  return rows.map((r) => {
    const state = r.state as Record<string, unknown> | null;
    const importMeta = state?.import as
      | { batchId?: string; optionLabel?: string }
      | undefined;
    return {
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
      importBatchId: importMeta?.batchId,
      importOptionLabel: importMeta?.optionLabel,
    };
  });
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

export async function saveTrip(
  trip: Trip,
  userId: string,
  options: { force?: boolean } = {},
): Promise<void> {
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

  // Transactional monotonic guard: refuse to overwrite a longer persisted
  // chatHistory with a shorter incoming snapshot. See plan
  // .cursor/plans/chat-save-race-fix_*.plan.md for the failure mode this fixes.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.trip.findFirst({
      where: { id: trip.id, userId },
      select: { chatHistory: true },
    });

    if (existing && !options.force) {
      const existingHistory = (existing.chatHistory as unknown as ChatMessage[] | null) ?? [];
      const incomingHistory = trip.chatHistory ?? [];
      if (isShrinkingChatSnapshot(incomingHistory.length, existingHistory.length)) {
        const serverTrip = await getTripWithinTx(tx, trip.id, userId);
        if (serverTrip) {
          throw new StaleSaveError({ kind: "trip", serverTrip });
        }
      }
    }

    await tx.trip.upsert({
      where: { id: trip.id },
      update: data,
      create: { id: trip.id, userId, ...data },
    });
  });
}

async function getTripWithinTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  id: string,
  userId: string,
): Promise<Trip | null> {
  const row = await tx.trip.findFirst({ where: { id, userId } });
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

export async function deleteTrip(id: string, userId: string): Promise<void> {
  await prisma.trip.deleteMany({ where: { id, userId } });
}
