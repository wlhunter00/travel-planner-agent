"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Activity } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  poi: "Attraction",
  meal: "Meal",
  tour: "Tour",
  travel: "Transit",
  free_time: "Free Time",
  experience: "Experience",
};

export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        {activity.photoUrl && (
          <img
            src={activity.photoUrl}
            alt={activity.title}
            className="w-16 h-16 rounded object-cover shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{activity.title}</p>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {TYPE_LABELS[activity.type] || activity.type}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {activity.startTime && <span>{activity.startTime}</span>}
            {activity.duration && <span>{activity.duration}</span>}
            {activity.rating && <span>⭐ {activity.rating}</span>}
            {activity.price != null && activity.price > 0 && (
              <span>{activity.currency === "USD" ? "$" : activity.currency || "$"}{activity.price}</span>
            )}
          </div>
          {activity.address && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.address}</p>
          )}
          {activity.notes && (
            <p className="text-xs mt-1">{activity.notes}</p>
          )}
          {activity.bookingUrl && (
            <a
              href={activity.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              Book →
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
