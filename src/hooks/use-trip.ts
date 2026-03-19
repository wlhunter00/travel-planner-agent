import { useTripStore } from "@/lib/store";

export function useTrip() {
  const trip = useTripStore((s) => s.trip);
  const updateTripState = useTripStore((s) => s.updateTripState);
  const setPhase = useTripStore((s) => s.setPhase);
  const setTripMeta = useTripStore((s) => s.setTripMeta);

  return {
    trip,
    state: trip?.state,
    phase: trip?.phase,
    updateTripState,
    setPhase,
    setTripMeta,
  };
}
