"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MessageSquare, ArrowRight, Trash2 } from "lucide-react";

interface ConversationCardProps {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  onClick: () => void;
  onDelete: () => void;
}

export function ConversationCard({
  title,
  createdAt,
  updatedAt,
  onClick,
  onDelete,
}: ConversationCardProps) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5 border-border/60"
      onClick={onClick}
    >
      <div className="h-24 bg-linear-to-br from-indigo-500/8 via-violet-500/6 to-purple-500/8 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,oklch(0.78_0.14_280/0.12),transparent_60%)]" />
        <MessageSquare className="size-8 text-primary/20 transition-transform duration-500 group-hover:scale-110" />
      </div>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <CardTitle className="text-base font-semibold truncate">{title}</CardTitle>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            title="Delete conversation"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <CardDescription className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Updated {formatRelative(updatedAt)}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <span>Started {formatDate(createdAt)}</span>
            <ArrowRight className="size-3 opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 text-primary" />
          </div>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(iso);
  } catch {
    return formatDate(iso);
  }
}
