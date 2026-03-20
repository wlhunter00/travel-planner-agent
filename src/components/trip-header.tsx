"use client";

import { useTripStore } from "@/lib/store";
import { MapPin, Calendar, Users, Sparkles, Wallet } from "lucide-react";

export function TripHeader() {
  const trip = useTripStore((s) => s.trip);
  if (!trip) return null;

  const { state } = trip;
  const hasBasicInfo = state.destination || state.startDate;

  if (!hasBasicInfo) {
    return (
      <div className="px-6 py-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/8 mb-4">
          <MapPin className="size-6 text-primary/50" />
        </div>
        <p className="font-serif text-lg text-foreground/80">Start chatting to plan your trip</p>
        <p className="text-xs text-muted-foreground/60 mt-1.5">The itinerary will build up here as you go.</p>
      </div>
    );
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  const formatDateLong = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="px-5 py-5 border-b border-border/50">
      <h2 className="font-serif text-2xl text-foreground">
        {trip.name !== "New Trip" ? trip.name : state.destination || "New Trip"}
      </h2>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
        {state.destination && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 text-primary/60" />
            {state.destination}
          </span>
        )}
        {state.startDate && state.endDate && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="size-3.5 text-primary/60" />
            {formatDate(state.startDate)} — {formatDateLong(state.endDate)}
          </span>
        )}
        {state.travelers > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5 text-primary/60" />
            {state.travelers} traveler{state.travelers > 1 ? "s" : ""}
          </span>
        )}
        {state.style && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground capitalize">
            <Sparkles className="size-3.5 text-primary/60" />
            {state.style}
          </span>
        )}
        {state.budget && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Wallet className="size-3.5 text-primary/60" />
            {state.budget}
          </span>
        )}
      </div>
    </div>
  );
}
