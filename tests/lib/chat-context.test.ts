import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import {
  capToolResult,
  sanitizeMessagesForStatelessRequest,
  stripPhotoUrls,
} from "@/lib/chat-context";

describe("stripPhotoUrls", () => {
  it("replaces nested photoUrl strings", () => {
    const input = { items: [{ photoUrl: "https://x.test/a.jpg", name: "A" }] };
    expect(stripPhotoUrls(input)).toEqual({
      items: [{ photoUrl: "[photo]", name: "A" }],
    });
  });
});

describe("capToolResult", () => {
  it("returns small payloads unchanged", () => {
    expect(capToolResult({ a: 1 }, 100)).toEqual({ a: 1 });
  });

  it("truncates oversized serialized objects", () => {
    const big = { x: "y".repeat(60_000) };
    const out = capToolResult(big, 1000) as { _truncated?: boolean; summary?: string };
    expect(out._truncated).toBe(true);
    expect(out.summary).toContain("oversized");
  });
});

describe("sanitizeMessagesForStatelessRequest", () => {
  it("returns non-object entries unchanged", () => {
    const out = sanitizeMessagesForStatelessRequest(["bad" as unknown as never]);
    expect(out[0]).toBe("bad");
  });

  it("strips assistant provider metadata and caps tool output", () => {
    const raw: unknown[] = [
      {
        role: "assistant",
        parts: [
          {
            type: "tool-search",
            output: { photoUrl: "https://img", rows: [{ photoUrl: "p" }] },
            providerMetadata: { x: 1 },
            callProviderMetadata: { y: 2 },
          },
        ],
      } as unknown as UIMessage,
    ];
    const out = sanitizeMessagesForStatelessRequest(raw);
    const a = out[0];
    if (a.role !== "assistant") throw new Error("expected assistant");
    const part = a.parts[0] as Record<string, unknown>;
    expect(part.providerMetadata).toBeUndefined();
    expect(part.callProviderMetadata).toBeUndefined();
    expect(JSON.stringify(part.output).length).toBeLessThanOrEqual(55_000);
  });

  it("runs sliding-window compression when payload exceeds threshold", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const filler = "x".repeat(900_000);
    try {
      const raw: unknown[] = [
        { role: "user", parts: [{ type: "text", text: filler }] },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-flights",
              output: { legs: [{ o: 1 }, { o: 2 }, { o: 3 }] },
            },
          ],
        } as unknown as UIMessage,
      ];
      sanitizeMessagesForStatelessRequest(raw);
      expect(log).toHaveBeenCalledWith(
        "[chat-telemetry] sliding-window compression engaged",
        expect.objectContaining({ keepLastUserTurns: 4 }),
      );
    } finally {
      log.mockRestore();
    }
  });
});
