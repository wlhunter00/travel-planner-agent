import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  Globe,
  Home,
  Link,
  MapPin,
  Pencil,
  Plane,
  Route,
  Save,
  Settings2,
  Sparkles,
  Ticket,
  Wrench,
  ExternalLink,
} from "lucide-react";

export type ToolMeta = {
  /** Short verb label, e.g. "Searching flights" */
  actionLabel: string;
  Icon: LucideIcon;
  summarizeInput: (input: unknown) => string;
  summarizeOutput: (output: unknown) => string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickError(out: Record<string, unknown>): string | null {
  const err = out.error;
  if (typeof err === "string" && err.trim()) return err;
  return null;
}

function countArray(out: Record<string, unknown>, key: string): number | null {
  const v = out[key];
  return Array.isArray(v) ? v.length : null;
}

const DEFAULT_META: ToolMeta = {
  actionLabel: "Running tool",
  Icon: Wrench,
  summarizeInput: (input) => {
    const o = asRecord(input);
    if (!o) return "";
    try {
      const j = JSON.stringify(o);
      return j.length > 120 ? `${j.slice(0, 117)}…` : j;
    } catch {
      return "";
    }
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Done";
    const err = pickError(o);
    if (err) return err;
    return "Done";
  },
};

function flightsMeta(actionLabel: string): ToolMeta {
  return {
    actionLabel,
    Icon: Plane,
    summarizeInput: (input) => {
      const o = asRecord(input);
      if (!o) return "";
      const origin = str(o.origin);
      const destination = str(o.destination);
      const departureDate = str(o.departureDate);
      if (origin && destination) {
        return departureDate
          ? `${origin} → ${destination} · ${departureDate}`
          : `${origin} → ${destination}`;
      }
      return DEFAULT_META.summarizeInput(input);
    },
    summarizeOutput: (output) => {
      const o = asRecord(output);
      if (!o) return "No results";
      const err = pickError(o);
      if (err) return err;
      const n = countArray(o, "flights");
      if (n !== null) return n === 0 ? "No flights found" : `Found ${n} flight option${n === 1 ? "" : "s"}`;
      return "Search complete";
    },
  };
}

function multiCityMeta(): ToolMeta {
  return {
    actionLabel: "Searching multi-city flights",
    Icon: Plane,
    summarizeInput: (input) => {
      const o = asRecord(input);
      const legs = o?.legs;
      if (!Array.isArray(legs) || legs.length === 0) return DEFAULT_META.summarizeInput(input);
      const bits = legs.map((leg) => {
        const l = asRecord(leg);
        if (!l) return "";
        const a = str(l.origin);
        const b = str(l.destination);
        const d = str(l.date);
        return a && b ? `${a}→${b}${d ? ` (${d})` : ""}` : "";
      }).filter(Boolean);
      return bits.join(" · ") || DEFAULT_META.summarizeInput(input);
    },
    summarizeOutput: (output) => {
      const o = asRecord(output);
      if (!o) return "No results";
      const err = pickError(o);
      if (err) return err;
      const n = countArray(o, "results");
      if (n !== null) return n === 0 ? "No itineraries" : `Found ${n} itinerary option${n === 1 ? "" : "s"}`;
      return "Search complete";
    },
  };
}

function hotelsMeta(actionLabel: string, IconComp: LucideIcon): ToolMeta {
  return {
    actionLabel,
    Icon: IconComp,
    summarizeInput: (input) => {
      const o = asRecord(input);
      if (!o) return "";
      const query = str(o.query ?? o.location);
      const checkIn = str(o.checkIn);
      const checkOut = str(o.checkOut);
      const bits = [query, checkIn && checkOut ? `${checkIn}–${checkOut}` : checkIn || checkOut].filter(
        Boolean
      ) as string[];
      return bits.join(" · ") || DEFAULT_META.summarizeInput(input);
    },
    summarizeOutput: (output) => {
      const o = asRecord(output);
      if (!o) return "No results";
      const err = pickError(o);
      if (err) return err;
      for (const key of ["hotels", "properties", "results", "listings"]) {
        const n = countArray(o, key);
        if (n !== null) return n === 0 ? "No stays found" : `Found ${n} stay${n === 1 ? "" : "s"}`;
      }
      return "Search complete";
    },
  };
}

function placesMeta(actionLabel: string, detail: boolean): ToolMeta {
  return {
    actionLabel,
    Icon: MapPin,
    summarizeInput: (input) => {
      const o = asRecord(input);
      if (!o) return "";
      if (detail) {
        const id = str(o.placeId);
        return id ? `Place ${id.slice(0, 12)}${id.length > 12 ? "…" : ""}` : "Place details";
      }
      const query = str(o.query);
      const loc = str(o.location);
      return [query, loc].filter(Boolean).join(" · ") || DEFAULT_META.summarizeInput(input);
    },
    summarizeOutput: (output) => {
      const o = asRecord(output);
      if (!o) return "Done";
      const err = pickError(o);
      if (err) return err;
      if (typeof o.name === "string" && o.name) return o.name;
      const n = countArray(o, "places") ?? countArray(o, "results");
      if (n !== null) return n === 0 ? "No places" : `${n} place${n === 1 ? "" : "s"}`;
      return "Done";
    },
  };
}

const ROUTES_META: ToolMeta = {
  actionLabel: "Computing routes",
  Icon: Route,
  summarizeInput: (input) => {
    const o = asRecord(input);
    if (!o) return "";
    const raw = o.routes;
    if (!Array.isArray(raw) || raw.length === 0) {
      return DEFAULT_META.summarizeInput(input);
    }
    const n = raw.length;
    const first = asRecord(raw[0]);
    const origin = str(first?.origin);
    const dest = str(first?.destination);
    if (origin && dest) {
      return n === 1
        ? `${origin} → ${dest}`
        : `${n} legs · ${origin} → ${dest}…`;
    }
    return `${n} legs`;
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Routes ready";
    const err = pickError(o);
    if (err) return err;
    const raw = o.routes;
    if (Array.isArray(raw) && raw.length > 0) {
      const ok = raw.filter((r) => {
        const leg = asRecord(r);
        return leg && (str(leg.duration) || str(leg.distance));
      }).length;
      return ok === raw.length ? `${raw.length} routes` : `${ok}/${raw.length} routes`;
    }
    return "Routes ready";
  },
};

const WEB_SEARCH_META: ToolMeta = {
  actionLabel: "Searching the web",
  Icon: Globe,
  summarizeInput: (input) => {
    const o = asRecord(input);
    return str(o?.query) || DEFAULT_META.summarizeInput(input);
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Done";
    const err = pickError(o);
    if (err) return err;
    const n = countArray(o, "results") ?? countArray(o, "items");
    if (n !== null) return `${n} result${n === 1 ? "" : "s"}`;
    return "Done";
  },
};

const TOURS_META: ToolMeta = {
  actionLabel: "Finding tours & activities",
  Icon: Ticket,
  summarizeInput: (input) => {
    const o = asRecord(input);
    if (!o) return "";
    const dest = str(o.destination);
    const q = str(o.query);
    return [dest, q].filter(Boolean).join(" · ") || DEFAULT_META.summarizeInput(input);
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Done";
    const err = pickError(o);
    if (err) return err;
    const n = countArray(o, "tours") ?? countArray(o, "results");
    if (n !== null) return `${n} tour${n === 1 ? "" : "s"} / activities`;
    return "Done";
  },
};

const DEEP_RESEARCH_META: ToolMeta = {
  actionLabel: "Deep research",
  Icon: BookOpen,
  summarizeInput: (input) => {
    const o = asRecord(input);
    if (!o) return "";
    const q = str(o.query);
    const dest = str(o.destination);
    return [q, dest].filter(Boolean).join(" · ") || DEFAULT_META.summarizeInput(input);
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Research complete";
    const err = pickError(o);
    if (err) return err;
    const n =
      countArray(o, "results") ??
      countArray(o, "suggestions") ??
      countArray(o, "items");
    if (n !== null) return `${n} highlighted result${n === 1 ? "" : "s"}`;
    return "Research complete";
  },
};

const UPDATE_TRIP_META: ToolMeta = {
  actionLabel: "Updating itinerary",
  Icon: Pencil,
  summarizeInput: (input) => {
    const o = asRecord(input);
    if (!o) return "";
    const bits: string[] = [];
    if (typeof o.phase === "string" && o.phase) bits.push(`phase: ${o.phase}`);
    if (typeof o.name === "string" && o.name) bits.push(o.name);
    if (typeof o.destination === "string" && o.destination) bits.push(o.destination);
    if (typeof o.tripState === "string" && o.tripState) {
      try {
        const t = JSON.parse(o.tripState) as Record<string, unknown>;
        if (typeof t.destination === "string" && t.destination) bits.push(String(t.destination));
      } catch {
        bits.push("trip state");
      }
    }
    return bits.length ? bits.join(" · ") : DEFAULT_META.summarizeInput(input);
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Itinerary updated";
    if (o.success === false) return str(o.error) || "Update failed";
    const bits: string[] = [];
    if (typeof o.phase === "string" && o.phase) bits.push(o.phase);
    return bits.length ? `Updated · ${bits.join(" · ")}` : "Itinerary updated";
  },
};

const PREFS_META: ToolMeta = {
  actionLabel: "Saving preferences",
  Icon: Settings2,
  summarizeInput: () => "Preferences",
  summarizeOutput: () => "Preferences saved",
};

const SAVE_SUMMARY_META: ToolMeta = {
  actionLabel: "Saving trip summary",
  Icon: Save,
  summarizeInput: (input) => {
    const o = asRecord(input);
    const dest = str(o?.destination);
    return dest || "Trip summary";
  },
  summarizeOutput: () => "Summary saved",
};

const WANDERLOG_META: ToolMeta = {
  actionLabel: "Pushing to Wanderlog",
  Icon: ExternalLink,
  summarizeInput: () => "Confirm export",
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Wanderlog updated";
    if (o.success === false) return str(o.error) || "Export failed";
    return "Pushed to Wanderlog";
  },
};

const GET_RECS_META: ToolMeta = {
  actionLabel: "Checking recommendations",
  Icon: Sparkles,
  summarizeInput: (input) => {
    const o = asRecord(input);
    const cat = str(o?.category);
    return cat && cat !== "all" ? `${cat}s` : "All categories";
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Done";
    const n = countArray(o, "items");
    if (n !== null) return n === 0 ? "No recommendations" : `${n} recommendation${n === 1 ? "" : "s"}`;
    return str(o.message) || "Done";
  },
};

const FETCH_URL_META: ToolMeta = {
  actionLabel: "Fetching URL",
  Icon: Link,
  summarizeInput: (input) => {
    const o = asRecord(input);
    const url = str(o?.url);
    if (!url) return "";
    try {
      return new URL(url).hostname;
    } catch {
      return url.length > 50 ? `${url.slice(0, 47)}…` : url;
    }
  },
  summarizeOutput: (output) => {
    const o = asRecord(output);
    if (!o) return "Fetched";
    const title = str(o.title);
    return title || "Content fetched";
  },
};

const TOOL_REGISTRY: Record<string, ToolMeta> = {
  search_flights: flightsMeta("Searching flights"),
  search_multi_city_flights: multiCityMeta(),
  search_hotels: hotelsMeta("Searching hotels", Building2),
  search_vacation_rentals: hotelsMeta("Searching vacation rentals", Home),
  search_airbnb: hotelsMeta("Searching Airbnb", Home),
  search_places: placesMeta("Searching places", false),
  get_place_details: placesMeta("Place details", true),
  compute_routes: ROUTES_META,
  web_search: WEB_SEARCH_META,
  search_tours: TOURS_META,
  deep_research: DEEP_RESEARCH_META,
  update_trip: UPDATE_TRIP_META,
  update_preferences: PREFS_META,
  save_trip_summary: SAVE_SUMMARY_META,
  push_to_wanderlog: WANDERLOG_META,
  get_recommendations: GET_RECS_META,
  fetch_url: FETCH_URL_META,
};

/** Peek MCP tools are dynamic; names often include `peek` or tool-specific strings. */
function isPeekTool(name: string): boolean {
  return name.toLowerCase().includes("peek") || name.startsWith("mcp_");
}

export function getToolMeta(toolName: string): ToolMeta {
  if (TOOL_REGISTRY[toolName]) return TOOL_REGISTRY[toolName]!;
  if (isPeekTool(toolName)) {
    return {
      ...DEFAULT_META,
      actionLabel: "Peek",
      Icon: Globe,
    };
  }
  return { ...DEFAULT_META, actionLabel: humanizeToolName(toolName) };
}

function humanizeToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
