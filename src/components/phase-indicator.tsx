"use client";

import { PHASE_ORDER, PHASE_LABELS, type Phase } from "@/lib/types";

interface PhaseIndicatorProps {
  currentPhase: Phase;
}

export function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div className="flex items-center gap-1 px-4 py-3 border-b">
      {PHASE_ORDER.map((phase, i) => {
        const isActive = i === currentIdx;
        const isComplete = i < currentIdx;
        return (
          <div key={phase} className="flex items-center gap-1 flex-1 min-w-0">
            <div
              className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium shrink-0
                ${isComplete ? "bg-primary text-primary-foreground" : ""}
                ${isActive ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : ""}
                ${!isComplete && !isActive ? "bg-muted text-muted-foreground" : ""}
              `}
            >
              {isComplete ? "✓" : i + 1}
            </div>
            <span
              className={`text-xs truncate hidden lg:inline ${
                isActive ? "font-semibold" : "text-muted-foreground"
              }`}
            >
              {PHASE_LABELS[phase]}
            </span>
            {i < PHASE_ORDER.length - 1 && (
              <div className={`flex-1 h-px min-w-2 ${isComplete ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
