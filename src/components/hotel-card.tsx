"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Hotel } from "@/lib/types";

const SOURCE_COLORS: Record<string, string> = {
  Airbnb: "bg-rose-100 text-rose-700",
  VRBO: "bg-blue-100 text-blue-700",
  "Booking.com": "bg-indigo-100 text-indigo-700",
  "Vacation Rental": "bg-emerald-100 text-emerald-700",
  Hotel: "bg-amber-100 text-amber-700",
};

export function HotelCard({ hotel }: { hotel: Hotel }) {
  const sourceClass = SOURCE_COLORS[hotel.source || "Hotel"] || "bg-muted text-muted-foreground";
  const isRental = hotel.source && hotel.source !== "Hotel";

  return (
    <Card className="overflow-hidden">
      {hotel.photoUrl && (
        <div className="h-28 bg-muted">
          <img src={hotel.photoUrl} alt={hotel.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-sm">{hotel.name}</p>
              {hotel.source && (
                <Badge variant="secondary" className={`text-[10px] shrink-0 ${sourceClass}`}>
                  {hotel.source}
                </Badge>
              )}
              {hotel.isSuperhost && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  Superhost
                </Badge>
              )}
            </div>
            {hotel.address && <p className="text-xs text-muted-foreground mt-0.5">{hotel.address}</p>}
            {hotel.propertyType && (
              <p className="text-xs text-muted-foreground capitalize">{hotel.propertyType}</p>
            )}
          </div>
          {hotel.pricePerNight && (
            <div className="text-right shrink-0">
              <p className="font-bold text-sm">
                {hotel.currency === "USD" ? "$" : hotel.currency || "$"}{hotel.pricePerNight}
              </p>
              <p className="text-[10px] text-muted-foreground">/night</p>
              {hotel.totalPrice && (
                <p className="text-[10px] text-muted-foreground">
                  ${hotel.totalPrice} total
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {hotel.rating != null && (
            <span className="text-xs font-medium">⭐ {hotel.rating}</span>
          )}
          {hotel.reviewCount != null && (
            <span className="text-xs text-muted-foreground">({hotel.reviewCount} reviews)</span>
          )}
          {isRental && hotel.bedrooms != null && (
            <span className="text-xs text-muted-foreground">{hotel.bedrooms} bed{hotel.bedrooms > 1 ? "s" : ""}</span>
          )}
          {isRental && hotel.bathrooms != null && (
            <span className="text-xs text-muted-foreground">{hotel.bathrooms} bath</span>
          )}
          {isRental && hotel.maxGuests != null && (
            <span className="text-xs text-muted-foreground">up to {hotel.maxGuests} guests</span>
          )}
        </div>

        {hotel.checkIn && hotel.checkOut && (
          <p className="text-xs text-muted-foreground mt-1">
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
            className="block mt-2 text-xs text-primary hover:underline"
          >
            {hotel.source === "Airbnb" ? "View on Airbnb →" :
             hotel.source === "VRBO" ? "View on VRBO →" :
             "Book now →"}
          </a>
        )}
      </div>
    </Card>
  );
}
