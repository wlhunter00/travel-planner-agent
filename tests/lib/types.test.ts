import { describe, expect, it } from "vitest";
import { createEmptyTripState, createNewTrip } from "@/lib/types";

describe("createEmptyTripState", () => {
  it("returns a consistent empty scaffold", () => {
    const s = createEmptyTripState();
    expect(s.destination).toBe("");
    expect(s.travelers).toBe(1);
    expect(s.flights).toEqual([]);
    expect(s.cities).toEqual([]);
    expect(s.hotels).toEqual([]);
    expect(s.days).toEqual([]);
  });
});

describe("createNewTrip", () => {
  it("uses empty state and planning defaults", () => {
    const trip = createNewTrip("abc-123");
    expect(trip.id).toBe("abc-123");
    expect(trip.status).toBe("planning");
    expect(trip.phase).toBe("big_picture");
    expect(trip.chatHistory).toEqual([]);
    expect(trip.state).toEqual(createEmptyTripState());
    expect(trip.createdAt).toBe(trip.updatedAt);
  });
});
