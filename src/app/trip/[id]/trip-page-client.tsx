"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { ArrowLeft, Loader2 } from "lucide-react";

interface TripPageClientProps {
  tripId: string;
}

export function TripPageClient({ tripId }: TripPageClientProps) {
  const router = useRouter();
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
      <div className="h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span className="text-sm">Loading trip...</span>
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
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Trips</span>
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
