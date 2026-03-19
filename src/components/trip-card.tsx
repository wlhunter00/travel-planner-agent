"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PHASE_LABELS } from "@/lib/types";
import type { Phase, TripStatus } from "@/lib/types";

interface TripCardProps {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  phase: Phase;
  coverImage?: string;
  onClick: () => void;
}

const STATUS_VARIANT: Record<TripStatus, "default" | "secondary" | "outline" | "destructive"> = {
  planning: "default",
  ready: "secondary",
  "in-progress": "secondary",
  completed: "outline",
  archived: "outline",
};

export function TripCard({ name, destination, startDate, endDate, status, phase, coverImage, onClick }: TripCardProps) {
  const dateRange = startDate && endDate
    ? `${formatDate(startDate)} — ${formatDate(endDate)}`
    : "Dates TBD";

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-lg overflow-hidden"
      onClick={onClick}
    >
      {coverImage && (
        <div className="h-32 bg-muted overflow-hidden">
          <img src={coverImage} alt={destination} className="w-full h-full object-cover" />
        </div>
      )}
      {!coverImage && (
        <div className="h-32 bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
          <span className="text-4xl">✈️</span>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base truncate">{name}</CardTitle>
          <Badge variant={STATUS_VARIANT[status]} className="shrink-0 text-xs">
            {status}
          </Badge>
        </div>
        <CardDescription className="space-y-1">
          {destination && <p className="font-medium">{destination}</p>}
          <p className="text-xs">{dateRange}</p>
          <p className="text-xs text-muted-foreground">Phase: {PHASE_LABELS[phase]}</p>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
