import { create } from "zustand";
import type { Trip, TripState, Phase } from "./types";
import { createEmptyTripState } from "./types";

interface TripStore {
  trip: Trip | null;
  setTrip: (trip: Trip) => void;
  clearTrip: () => void;

  updateTripState: (partial: Partial<TripState>) => void;
  setPhase: (phase: Phase) => void;
  setTripMeta: (meta: { name?: string; destination?: string; startDate?: string; endDate?: string; coverImage?: string }) => void;
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
      return {
        trip: {
          ...s.trip,
          ...meta,
          updatedAt: new Date().toISOString(),
        },
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
