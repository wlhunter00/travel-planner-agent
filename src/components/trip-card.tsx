"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PHASE_LABELS } from "@/lib/types";
import type { Phase, TripStatus } from "@/lib/types";
import { MapPin, ArrowRight } from "lucide-react";

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

const STATUS_STYLE: Record<TripStatus, string> = {
  planning: "bg-primary/15 text-primary border-primary/20",
  ready: "bg-warm-sage/15 text-warm-sage border-warm-sage/20",
  "in-progress": "bg-warm-amber/15 text-warm-amber border-warm-amber/20",
  completed: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted text-muted-foreground border-border",
};

export function TripCard({ name, destination, startDate, endDate, status, phase, coverImage, onClick }: TripCardProps) {
  const dateRange = startDate && endDate
    ? `${formatDate(startDate)} — ${formatDate(endDate)}`
    : "Dates TBD";

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 border-border/60"
      onClick={onClick}
    >
      {coverImage ? (
        <div className="h-36 bg-muted overflow-hidden">
          <img
            src={coverImage}
            alt={destination}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="h-36 bg-linear-to-br from-primary/8 via-warm-amber/6 to-warm-terracotta/8 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,oklch(0.78_0.14_75/0.12),transparent_60%)]" />
          <MapPin className="size-10 text-primary/20 transition-transform duration-500 group-hover:scale-110" />
        </div>
      )}
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <CardTitle className="text-base font-semibold truncate">{name}</CardTitle>
          <Badge variant="outline" className={`shrink-0 text-[10px] font-medium uppercase tracking-wide border ${STATUS_STYLE[status]}`}>
            {status}
          </Badge>
        </div>
        <CardDescription className="space-y-1.5">
          {destination && (
            <p className="font-medium text-foreground/80 flex items-center gap-1.5">
              {destination}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{dateRange}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <span>{PHASE_LABELS[phase]}</span>
            <ArrowRight className="size-3 opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 text-primary" />
          </div>
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
