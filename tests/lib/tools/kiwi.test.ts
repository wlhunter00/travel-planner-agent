import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeToIata, validateNotPastDate } from "@/lib/tools/kiwi";

describe("normalizeToIata", () => {
  it("accepts 3-letter IATA codes", () => {
    expect(normalizeToIata("  lis  ")).toEqual({ code: "LIS", hint: "" });
    expect(normalizeToIata("JFK")).toEqual({ code: "JFK", hint: "" });
  });

  it("resolves known aliases", () => {
    expect(normalizeToIata("New York")).toEqual({ code: "JFK", hint: "" });
    expect(normalizeToIata("oporto")).toEqual({ code: "OPO", hint: "" });
  });

  it("rejects unknown input", () => {
    const r = normalizeToIata("Unknownville");
    expect(r.code).toBeNull();
    expect(r.hint).toContain("could not resolve");
  });

  it("handles empty string", () => {
    expect(normalizeToIata("   ")).toEqual({ code: null, hint: "empty location" });
  });
});

describe("validateNotPastDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects malformed dates", () => {
    expect(validateNotPastDate("06-15-2026", "Departure")).toContain("YYYY-MM-DD");
  });

  it("rejects dates before today (UTC)", () => {
    expect(validateNotPastDate("2026-06-14", "Out")).toContain("in the past");
  });

  it("accepts today and future dates", () => {
    expect(validateNotPastDate("2026-06-15", "Out")).toBeNull();
    expect(validateNotPastDate("2026-12-31", "Out")).toBeNull();
  });
});
