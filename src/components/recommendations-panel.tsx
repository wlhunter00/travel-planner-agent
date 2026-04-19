"use client";

import { Sparkles, X } from "lucide-react";
import { AddRecommendationForm } from "@/components/add-recommendation-form";

interface RecommendationsPanelProps {
  tripId: string;
  collapsed: boolean;
  onToggle: () => void;
}

export function RecommendationsPanel({
  tripId,
  collapsed,
  onToggle,
}: RecommendationsPanelProps) {
  if (collapsed) {
    return null;
  }

  return (
    <div className="border-b border-border/60">
      <div className="px-3 pt-3 pb-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-xs font-semibold">Add Recommendations</span>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
          Paste URLs, type tips, or upload PDFs. Extracted items appear in
          your trip overview on the left.
        </p>

        <AddRecommendationForm tripId={tripId} variant="panel" />
      </div>
    </div>
  );
}
