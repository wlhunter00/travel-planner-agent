"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Activity } from "@/lib/types";
import { Star, ExternalLink, Clock, MapPin } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  poi: "Attraction",
  meal: "Meal",
  tour: "Tour",
  travel: "Transit",
  free_time: "Free Time",
  experience: "Experience",
};

const TYPE_STYLE: Record<string, string> = {
  poi: "bg-primary/8 text-primary border-primary/15",
  meal: "bg-warm-terracotta/8 text-warm-terracotta border-warm-terracotta/15",
  tour: "bg-warm-sage/8 text-warm-sage border-warm-sage/15",
  travel: "bg-muted text-muted-foreground border-border/50",
  free_time: "bg-warm-cream/20 text-warm-amber border-warm-amber/15",
  experience: "bg-chart-4/8 text-chart-4 border-chart-4/15",
};

export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <Card className="p-3.5 border-border/40 transition-all duration-200 hover:border-border/70">
      <div className="flex items-start gap-3">
        {activity.photoUrl && (
          <img
            src={activity.photoUrl}
            alt={activity.title}
            className="w-16 h-16 rounded-lg object-cover shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{activity.title}</p>
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 border ${TYPE_STYLE[activity.type] || "bg-muted text-muted-foreground"}`}
            >
              {TYPE_LABELS[activity.type] || activity.type}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground/70">
            {activity.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {activity.startTime}
              </span>
            )}
            {activity.duration && <span>{activity.duration}</span>}
            {activity.rating && (
              <span className="flex items-center gap-0.5">
                <Star className="size-3 text-warm-gold fill-warm-gold" />
                {activity.rating}
              </span>
            )}
            {activity.price != null && activity.price > 0 && (
              <span className="font-medium text-foreground/70">
                {activity.currency === "USD" ? "$" : activity.currency || "$"}{activity.price}
              </span>
            )}
          </div>
          {activity.address && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground/50 mt-1 truncate">
              <MapPin className="size-3 shrink-0" />
              {activity.address}
            </p>
          )}
          {activity.notes && (
            <p className="text-xs mt-1.5 text-muted-foreground/80 leading-relaxed">{activity.notes}</p>
          )}
          {activity.bookingUrl && (
            <a
              href={activity.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors mt-1.5"
            >
              Book
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
