"use client";

import { useMemo } from "react";
import type { CityStop, Activity } from "@/lib/types";

interface TripMapProps {
  cities: CityStop[];
  activities?: Activity[];
}

export function TripMap({ cities }: TripMapProps) {
  const mapUrl = useMemo(() => {
    if (cities.length === 0) return null;

    const markers = cities
      .filter((c) => c.lat && c.lng)
      .map((c) => `markers=color:red%7Clabel:${encodeURIComponent(c.name[0])}%7C${c.lat},${c.lng}`)
      .join("&");

    const center = cities[0]?.lat && cities[0]?.lng
      ? `center=${cities[0].lat},${cities[0].lng}`
      : `center=${encodeURIComponent(cities[0]?.name || "")}`;

    const apiKey = typeof window !== "undefined"
      ? (document.querySelector('meta[name="google-maps-key"]')?.getAttribute("content") || "")
      : "";

    if (!apiKey) return null;

    return `https://maps.googleapis.com/maps/api/staticmap?${center}&zoom=6&size=600x300&maptype=roadmap&${markers}&key=${apiKey}`;
  }, [cities]);

  if (!mapUrl || cities.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg overflow-hidden border bg-muted">
      <img src={mapUrl} alt="Trip route map" className="w-full h-auto" />
    </div>
  );
}
