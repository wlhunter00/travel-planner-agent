"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TourCardProps {
  title: string;
  description?: string;
  duration?: string;
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  bookingUrl?: string;
}

export function TourCard({ title, description, duration, price, currency, rating, reviewCount, photoUrl, bookingUrl }: TourCardProps) {
  return (
    <Card className="overflow-hidden">
      {photoUrl && (
        <div className="h-28 bg-muted">
          <img src={photoUrl} alt={title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{title}</p>
          <Badge variant="secondary" className="text-[10px] shrink-0">Tour</Badge>
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {duration && <span>{duration}</span>}
          {rating && <span>⭐ {rating.toFixed(1)}</span>}
          {reviewCount && <span>({reviewCount})</span>}
          {price != null && (
            <span className="font-semibold text-foreground">
              From {currency === "USD" ? "$" : currency || "$"}{price}
            </span>
          )}
        </div>
        {bookingUrl && (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-2 text-xs text-primary hover:underline"
          >
            View on Viator →
          </a>
        )}
      </div>
    </Card>
  );
}
