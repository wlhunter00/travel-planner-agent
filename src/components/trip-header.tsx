"use client";

import { useTripStore } from "@/lib/store";

export function TripHeader() {
  const trip = useTripStore((s) => s.trip);
  if (!trip) return null;

  const { state } = trip;
  const hasBasicInfo = state.destination || state.startDate;

  if (!hasBasicInfo) {
    return (
      <div className="px-4 py-6 text-center text-muted-foreground">
        <p className="text-sm">Start chatting to plan your trip.</p>
        <p className="text-xs mt-1">The itinerary will build up here as you go.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 border-b">
      <h2 className="text-xl font-bold">{trip.name !== "New Trip" ? trip.name : state.destination || "New Trip"}</h2>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
        {state.destination && <span>{state.destination}</span>}
        {state.startDate && state.endDate && (
          <span>
            {new Date(state.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" — "}
            {new Date(state.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
        {state.travelers > 0 && <span>{state.travelers} traveler{state.travelers > 1 ? "s" : ""}</span>}
        {state.style && <span className="capitalize">{state.style}</span>}
        {state.budget && <span>{state.budget}</span>}
      </div>
    </div>
  );
}
