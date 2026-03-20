"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Hotel } from "@/lib/types";
import { Star, ExternalLink, Award } from "lucide-react";

const SOURCE_STYLE: Record<string, string> = {
  Airbnb: "bg-warm-terracotta/10 text-warm-terracotta border-warm-terracotta/15",
  VRBO: "bg-chart-4/10 text-chart-4 border-chart-4/15",
  "Booking.com": "bg-primary/10 text-primary border-primary/15",
  "Vacation Rental": "bg-warm-sage/10 text-warm-sage border-warm-sage/15",
  Hotel: "bg-warm-amber/10 text-warm-amber border-warm-amber/15",
};

export function HotelCard({ hotel }: { hotel: Hotel }) {
  const sourceClass = SOURCE_STYLE[hotel.source || "Hotel"] || "bg-muted text-muted-foreground border-border";
  const isRental = hotel.source && hotel.source !== "Hotel";

  return (
    <Card className="overflow-hidden border-border/50 transition-all duration-200 hover:border-border group">
      {hotel.photoUrl && (
        <div className="h-32 bg-muted overflow-hidden">
          <img
            src={hotel.photoUrl}
            alt={hotel.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-sm">{hotel.name}</p>
              {hotel.source && (
                <Badge variant="outline" className={`text-[10px] shrink-0 border ${sourceClass}`}>
                  {hotel.source}
                </Badge>
              )}
              {hotel.isSuperhost && (
                <Badge variant="outline" className="text-[10px] shrink-0 gap-0.5 border-warm-gold/20 text-warm-gold bg-warm-gold/8">
                  <Award className="size-2.5" />
                  Superhost
                </Badge>
              )}
            </div>
            {hotel.address && <p className="text-xs text-muted-foreground/70 mt-1">{hotel.address}</p>}
            {hotel.propertyType && (
              <p className="text-xs text-muted-foreground/60 capitalize">{hotel.propertyType}</p>
            )}
          </div>
          {hotel.pricePerNight && (
            <div className="text-right shrink-0">
              <p className="font-serif text-lg">
                {hotel.currency === "USD" ? "$" : hotel.currency || "$"}{hotel.pricePerNight}
              </p>
              <p className="text-[10px] text-muted-foreground/60">/night</p>
              {hotel.totalPrice && (
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  ${hotel.totalPrice} total
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
          {hotel.rating != null && (
            <span className="flex items-center gap-1 text-xs font-medium">
              <Star className="size-3 text-warm-gold fill-warm-gold" />
              {hotel.rating}
            </span>
          )}
          {hotel.reviewCount != null && (
            <span className="text-xs text-muted-foreground/60">({hotel.reviewCount} reviews)</span>
          )}
          {isRental && hotel.bedrooms != null && (
            <span className="text-xs text-muted-foreground/60">{hotel.bedrooms} bed{hotel.bedrooms > 1 ? "s" : ""}</span>
          )}
          {isRental && hotel.bathrooms != null && (
            <span className="text-xs text-muted-foreground/60">{hotel.bathrooms} bath</span>
          )}
          {isRental && hotel.maxGuests != null && (
            <span className="text-xs text-muted-foreground/60">up to {hotel.maxGuests} guests</span>
          )}
        </div>

        {hotel.checkIn && hotel.checkOut && (
          <p className="text-xs text-muted-foreground/60 mt-1.5">
            {new Date(hotel.checkIn).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {new Date(hotel.checkOut).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        )}
        {hotel.bookingUrl && (
          <a
            href={hotel.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 mt-2.5 text-xs text-primary/80 hover:text-primary transition-colors"
          >
            {hotel.source === "Airbnb" ? "View on Airbnb" :
             hotel.source === "VRBO" ? "View on VRBO" :
             "Book now"}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </Card>
  );
}
