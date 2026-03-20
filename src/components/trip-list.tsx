"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TripCard } from "./trip-card";
import { Button } from "@/components/ui/button";
import type { Phase, TripStatus } from "@/lib/types";
import { Plus, Compass } from "lucide-react";

interface TripIndexEntry {
  id: string;
  name: string;
  status: TripStatus;
  phase: Phase;
  destination: string;
  startDate: string;
  endDate: string;
  coverImage?: string;
  createdAt: string;
  updatedAt: string;
}

export function TripList() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trips")
      .then((r) => r.json())
      .then((data) => setTrips(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleNewTrip() {
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const trip = await res.json();
    router.push(`/trip/${trip.id}`);
  }

  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <header className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-warm-amber/5" />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-12">
          <div className="animate-fade-up">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/70 mb-3">
              Travel Planner
            </p>
            <h1 className="font-serif text-5xl lg:text-6xl tracking-tight text-foreground">
              Your Journeys
            </h1>
            <p className="text-muted-foreground mt-3 text-lg max-w-md">
              Plan, organize, and export travel itineraries with AI.
            </p>
          </div>
          <div className="mt-8 animate-fade-up stagger-2">
            <Button onClick={handleNewTrip} size="lg" className="gap-2 font-medium">
              <Plus className="size-4" />
              New Trip
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="shimmer h-56 rounded-xl" />
            ))}
          </div>
        )}

        {!loading && trips.length === 0 && (
          <div className="text-center py-24 animate-fade-up">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-5">
              <Compass className="size-7 text-primary" />
            </div>
            <p className="font-serif text-2xl mb-2">No trips yet</p>
            <p className="text-muted-foreground mb-8 max-w-xs mx-auto">
              Start planning your next adventure.
            </p>
            <Button onClick={handleNewTrip} size="lg" className="gap-2">
              <Plus className="size-4" />
              Create your first trip
            </Button>
          </div>
        )}

        {!loading && trips.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip, i) => (
              <div
                key={trip.id}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <TripCard
                  {...trip}
                  onClick={() => router.push(`/trip/${trip.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
