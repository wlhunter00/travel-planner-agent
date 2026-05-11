import { describe, expect, it } from "vitest";
import { isStaleSaveError, StaleSaveError } from "@/lib/stale-save-error";
import type { Conversation, Trip } from "@/lib/types";

const minimalTrip = { id: "t1" } as Trip;
const minimalConv = { id: "c1" } as Conversation;

describe("StaleSaveError", () => {
  it("tags trip kind", () => {
    const e = new StaleSaveError({ kind: "trip", serverTrip: minimalTrip });
    expect(e.name).toBe("StaleSaveError");
    expect(e.message).toBe("stale_save");
    expect(e.serverTrip).toBe(minimalTrip);
    expect(e.serverConversation).toBeUndefined();
  });

  it("tags conversation kind", () => {
    const e = new StaleSaveError({ kind: "conversation", serverConversation: minimalConv });
    expect(e.serverConversation).toBe(minimalConv);
    expect(e.serverTrip).toBeUndefined();
  });
});

describe("isStaleSaveError", () => {
  it("narrows StaleSaveError", () => {
    const e = new StaleSaveError({ kind: "trip", serverTrip: minimalTrip });
    expect(isStaleSaveError(e)).toBe(true);
  });

  it("rejects other errors", () => {
    expect(isStaleSaveError(new Error("x"))).toBe(false);
    expect(isStaleSaveError(null)).toBe(false);
    expect(isStaleSaveError("stale_save")).toBe(false);
  });
});
