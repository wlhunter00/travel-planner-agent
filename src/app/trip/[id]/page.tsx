"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TripView } from "@/components/trip-view";
import { ChatPanel } from "@/components/chat-panel";
import { useTripStore } from "@/lib/store";
import type { Trip } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function TripPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.id as string;
  const setTrip = useTripStore((s) => s.setTrip);
  const clearTrip = useTripStore((s) => s.clearTrip);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/trips?id=${tripId}`);
        if (!res.ok) throw new Error();
        const trip: Trip = await res.json();
        setTrip(trip);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => clearTrip();
  }, [tripId, setTrip, clearTrip]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground">
        Loading trip...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Trip not found</p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Back to trips
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2 border-b bg-background/95 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          ← Trips
        </Button>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={60} minSize={30}>
          <TripView />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={40} minSize={25}>
          <ChatPanel tripId={tripId} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
