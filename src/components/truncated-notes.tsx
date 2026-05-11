"use client";

import { useState } from "react";

export function TruncatedNotes({ text }: { text: string }) {
  const LIMIT = 100;
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LIMIT;

  return (
    <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
      {isLong && !expanded ? text.slice(0, LIMIT).trimEnd() + "…" : text}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-primary/60 hover:text-primary transition-colors"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </p>
  );
}
