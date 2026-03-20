"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StreamingTimeIndicatorProps = {
  elapsed: number;
  className?: string;
};

function formatElapsed(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  return `${seconds}s`;
}

export const StreamingTimeIndicator = memo(function StreamingTimeIndicator({
  elapsed,
  className,
}: StreamingTimeIndicatorProps) {
  let message = "";
  let tone: "muted" | "amber" | "destructive" = "muted";

  if (elapsed >= 300) {
    message = "Something may have gone wrong — try resending";
    tone = "destructive";
  } else if (elapsed >= 180) {
    message = "This is taking longer than usual";
    tone = "amber";
  } else if (elapsed >= 90) {
    message = "Complex searches take longer — still working";
  } else if (elapsed >= 30) {
    message = "Planning can take a minute or two";
  }

  return (
    <div
      className={cn(
        "text-xs leading-snug tabular-nums",
        tone === "muted" && "text-muted-foreground",
        tone === "amber" && "text-amber-500 dark:text-amber-400",
        tone === "destructive" && "text-destructive/80",
        className
      )}
      aria-live="polite"
    >
      <span>{formatElapsed(elapsed)}</span>
      {message ? <span> · {message}</span> : null}
    </div>
  );
});

/**
 * Remount with a new `key` (e.g. per user send) so elapsed seconds reset without sync setState in an effect.
 */
export function StreamElapsedSlot({
  active,
  children,
}: {
  active: boolean;
  children: (elapsedSeconds: number) => ReactNode;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setSeconds((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);
  const elapsed = active ? seconds : 0;
  return <>{children(elapsed)}</>;
}
