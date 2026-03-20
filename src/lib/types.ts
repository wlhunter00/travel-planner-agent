export type Phase =
  | "big_picture"
  | "flights"
  | "cities"
  | "hotels"
  | "day_plans"
  | "restaurants"
  | "review";

export const PHASE_ORDER: Phase[] = [
  "big_picture",
  "flights",
  "cities",
  "hotels",
  "day_plans",
  "restaurants",
  "review",
];

export const PHASE_LABELS: Record<Phase, string> = {
  big_picture: "Big Picture",
  flights: "Flights",
  cities: "Cities & Route",
  hotels: "Accommodation",
  day_plans: "Day Plans",
  restaurants: "Restaurants",
  review: "Review & Export",
};

export type TripStatus =
  | "planning"
  | "ready"
  | "in-progress"
  | "completed"
  | "archived";

export interface Flight {
  id: string;
  airline: string;
  flightNumber?: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  price?: number;
  currency?: string;
  bookingUrl?: string;
  cabinClass?: string;
}

export interface CityStop {
  id: string;
  name: string;
  country: string;
  days: number;
  startDate?: string;
  endDate?: string;
  lat?: number;
  lng?: number;
}

export interface Hotel {
  id: string;
  name: string;
  cityId: string;
  address?: string;
  pricePerNight?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
  bookingUrl?: string;
  checkIn?: string;
  checkOut?: string;
  source?: "Hotel" | "Airbnb" | "VRBO" | "Booking.com" | "Vacation Rental" | string;
  propertyType?: string;
  isSuperhost?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  totalPrice?: number;
}

export interface Activity {
  id: string;
  type: "poi" | "meal" | "tour" | "travel" | "free_time" | "experience";
  title: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
  address?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  rating?: number;
  price?: number;
  currency?: string;
  bookingUrl?: string;
  notes?: string;
  sourceCitations?: { label: string; url: string }[];
}

export interface DayPlan {
  id: string;
  date: string;
  cityId: string;
  activities: Activity[];
  daySummary?: string;
}

export interface TripState {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  style: string;
  budget: string;
  flights: Flight[];
  cities: CityStop[];
  hotels: Hotel[];
  days: DayPlan[];
}

export interface Trip {
  id: string;
  name: string;
  status: TripStatus;
  phase: Phase;
  createdAt: string;
  updatedAt: string;
  state: TripState;
  chatHistory: ChatMessage[];
  destination: string;
  startDate: string;
  endDate: string;
  coverImage?: string;
}

export interface ChatMessagePart {
  type: string;
  text?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  state?: string;
  toolCallId?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  id?: string;
  toolInvocations?: unknown[];
  parts?: ChatMessagePart[];
}

export function createEmptyTripState(): TripState {
  return {
    destination: "",
    startDate: "",
    endDate: "",
    travelers: 1,
    style: "",
    budget: "",
    flights: [],
    cities: [],
    hotels: [],
    days: [],
  };
}

export function createNewTrip(id: string): Trip {
  const now = new Date().toISOString();
  return {
    id,
    name: "New Trip",
    status: "planning",
    phase: "big_picture",
    createdAt: now,
    updatedAt: now,
    state: createEmptyTripState(),
    chatHistory: [],
    destination: "",
    startDate: "",
    endDate: "",
  };
}
