import { create } from "zustand";
import type { Trip, TripState, Phase, Recommendation } from "./types";
import { createEmptyTripState } from "./types";

interface TripStore {
  trip: Trip | null;
  setTrip: (trip: Trip) => void;
  clearTrip: () => void;

  updateTripState: (partial: Partial<TripState>) => void;
  setPhase: (phase: Phase) => void;
  setTripMeta: (meta: { name?: string; destination?: string; startDate?: string; endDate?: string; coverImage?: string }) => void;

  addRecommendation: (rec: Recommendation) => void;
  removeRecommendation: (id: string) => void;
  removeExtractedItem: (recId: string, itemIndex: number) => void;
}

export const useTripStore = create<TripStore>((set) => ({
  trip: null,

  setTrip: (trip) => set({ trip }),
  clearTrip: () => set({ trip: null }),

  updateTripState: (partial) =>
    set((s) => {
      if (!s.trip) return s;
      return {
        trip: {
          ...s.trip,
          updatedAt: new Date().toISOString(),
          state: { ...s.trip.state, ...partial },
        },
      };
    }),

  setPhase: (phase) =>
    set((s) => {
      if (!s.trip) return s;
      return {
        trip: { ...s.trip, phase, updatedAt: new Date().toISOString() },
      };
    }),

  setTripMeta: (meta) =>
    set((s) => {
      if (!s.trip) return s;
      const stateSync: Partial<TripState> = {};
      if (meta.destination) stateSync.destination = meta.destination;
      if (meta.startDate) stateSync.startDate = meta.startDate;
      if (meta.endDate) stateSync.endDate = meta.endDate;
      return {
        trip: {
          ...s.trip,
          ...meta,
          updatedAt: new Date().toISOString(),
          state: { ...s.trip.state, ...stateSync },
        },
      };
    }),

  addRecommendation: (rec) =>
    set((s) => {
      if (!s.trip) return s;
      return {
        trip: {
          ...s.trip,
          recommendations: [...(s.trip.recommendations || []), rec],
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  removeRecommendation: (id) =>
    set((s) => {
      if (!s.trip) return s;
      return {
        trip: {
          ...s.trip,
          recommendations: (s.trip.recommendations || []).filter((r) => r.id !== id),
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  removeExtractedItem: (recId, itemIndex) =>
    set((s) => {
      if (!s.trip) return s;
      const recs = (s.trip.recommendations || []).map((r) => {
        if (r.id !== recId) return r;
        const items = r.extractedItems.filter((_, i) => i !== itemIndex);
        return { ...r, extractedItems: items };
      }).filter((r) => r.extractedItems.length > 0 || r.status !== "ready");
      return {
        trip: { ...s.trip, recommendations: recs, updatedAt: new Date().toISOString() },
      };
    }),
}));

interface TripListStore {
  trips: Trip[];
  setTrips: (trips: Trip[]) => void;
  addTrip: (trip: Trip) => void;
  removeTrip: (id: string) => void;
  updateTrip: (trip: Trip) => void;
}

export const useTripListStore = create<TripListStore>((set) => ({
  trips: [],
  setTrips: (trips) => set({ trips }),
  addTrip: (trip) => set((s) => ({ trips: [trip, ...s.trips] })),
  removeTrip: (id) => set((s) => ({ trips: s.trips.filter((t) => t.id !== id) })),
  updateTrip: (trip) =>
    set((s) => ({
      trips: s.trips.map((t) => (t.id === trip.id ? trip : t)),
    })),
}));
