import { describe, expect, it } from "vitest";
import { isShrinkingChatSnapshot } from "@/lib/chat-history-save-guard";

describe("isShrinkingChatSnapshot", () => {
  it("is true when incoming is shorter than persisted", () => {
    expect(isShrinkingChatSnapshot(2, 5)).toBe(true);
  });

  it("is false when lengths match", () => {
    expect(isShrinkingChatSnapshot(3, 3)).toBe(false);
  });

  it("is false when incoming is longer", () => {
    expect(isShrinkingChatSnapshot(10, 4)).toBe(false);
  });

  it("is false for empty vs empty", () => {
    expect(isShrinkingChatSnapshot(0, 0)).toBe(false);
  });
});
