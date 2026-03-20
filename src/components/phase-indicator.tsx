"use client";

import { PHASE_ORDER, PHASE_LABELS, type Phase } from "@/lib/types";
import { Check } from "lucide-react";

interface PhaseIndicatorProps {
  currentPhase: Phase;
}

export function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div className="flex items-center gap-1 px-4 py-3 border-b border-border/60 bg-card/30">
      {PHASE_ORDER.map((phase, i) => {
        const isActive = i === currentIdx;
        const isComplete = i < currentIdx;
        return (
          <div key={phase} className="flex items-center gap-1.5 flex-1 min-w-0">
            <div
              className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium shrink-0 transition-all duration-300
                ${isComplete ? "bg-primary text-primary-foreground" : ""}
                ${isActive ? "bg-primary text-primary-foreground ring-2 ring-primary/25 ring-offset-1 ring-offset-background" : ""}
                ${!isComplete && !isActive ? "bg-muted/60 text-muted-foreground/60" : ""}
              `}
            >
              {isComplete ? <Check className="size-3" /> : i + 1}
            </div>
            <span
              className={`text-xs truncate hidden lg:inline transition-colors ${
                isActive ? "font-semibold text-foreground" : "text-muted-foreground/60"
              }`}
            >
              {PHASE_LABELS[phase]}
            </span>
            {i < PHASE_ORDER.length - 1 && (
              <div className={`flex-1 h-px min-w-2 transition-colors ${isComplete ? "bg-primary/60" : "bg-border/50"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
