"use client";

import { Card } from "@/components/ui/card";

interface RestaurantCardProps {
  name: string;
  cuisine?: string;
  address?: string;
  rating?: number;
  priceLevel?: number;
  photoUrl?: string;
  bookingUrl?: string;
  notes?: string;
}

const PRICE_SYMBOLS = ["", "$", "$$", "$$$", "$$$$"];

export function RestaurantCard({ name, cuisine, address, rating, priceLevel, photoUrl, bookingUrl, notes }: RestaurantCardProps) {
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        {photoUrl && (
          <img src={photoUrl} alt={name} className="w-14 h-14 rounded object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{name}</p>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            {cuisine && <span>{cuisine}</span>}
            {rating && <span>⭐ {rating}</span>}
            {priceLevel != null && priceLevel > 0 && (
              <span>{PRICE_SYMBOLS[priceLevel] || ""}</span>
            )}
          </div>
          {address && <p className="text-xs text-muted-foreground mt-0.5 truncate">{address}</p>}
          {notes && <p className="text-xs mt-1">{notes}</p>}
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              View details →
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
