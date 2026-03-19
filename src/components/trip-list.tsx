"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TripCard } from "./trip-card";
import { Button } from "@/components/ui/button";
import type { Phase, TripStatus } from "@/lib/types";

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
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Trips</h1>
          <p className="text-muted-foreground mt-1">Plan, organize, and export travel itineraries.</p>
        </div>
        <Button onClick={handleNewTrip} size="lg">
          + New Trip
        </Button>
      </div>

      {loading && (
        <p className="text-muted-foreground text-center py-20">Loading trips...</p>
      )}

      {!loading && trips.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <p className="text-xl font-medium mb-2">No trips yet</p>
          <p className="text-muted-foreground mb-6">Start planning your next adventure.</p>
          <Button onClick={handleNewTrip}>Create your first trip</Button>
        </div>
      )}

      {!loading && trips.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              {...trip}
              onClick={() => router.push(`/trip/${trip.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
