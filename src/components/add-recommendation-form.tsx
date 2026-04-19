"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type DragEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTripStore } from "@/lib/store";
import type { Recommendation } from "@/lib/types";
import {
  X,
  Plus,
  Upload,
  Loader2,
  User,
  Check,
} from "lucide-react";

function isUrl(text: string): boolean {
  try {
    new URL(text.trim());
    return true;
  } catch {
    return /^https?:\/\//i.test(text.trim());
  }
}

interface SuccessToast {
  itemCount: number;
  recommender?: string;
}

interface AddRecommendationFormProps {
  tripId: string;
  /**
   * `compact` is the inline form rendered inside the trip view; it drops the
   * outer drag-and-drop dropzone affordance and uses a slightly tighter layout.
   * `panel` is the chat-side panel which gets the dropzone overlay.
   */
  variant?: "panel" | "compact";
  placeholder?: string;
  className?: string;
}

export function AddRecommendationForm({
  tripId,
  variant = "panel",
  placeholder = "Paste a URL or type a recommendation...",
  className,
}: AddRecommendationFormProps) {
  const addRecommendation = useTripStore((s) => s.addRecommendation);

  const [inputValue, setInputValue] = useState("");
  const [recommender, setRecommender] = useState("");
  const [showRecommenderField, setShowRecommenderField] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<SuccessToast | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  const submit = useCallback(
    async (type: "url" | "text" | "file", content: string) => {
      setIsSubmitting(true);
      setToast(null);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId,
            type,
            content,
            recommender: recommender.trim() || undefined,
          }),
        });
        if (res.ok) {
          const rec: Recommendation = await res.json();
          addRecommendation(rec);
          if (rec.status === "ready") {
            setToast({
              itemCount: rec.extractedItems.length,
              recommender: rec.recommender,
            });
          } else if (rec.status === "error") {
            setErrorMsg(rec.error || "Failed to process");
          }
        } else {
          setErrorMsg("Failed to submit recommendation");
        }
      } catch {
        setErrorMsg("Network error — try again");
      } finally {
        setIsSubmitting(false);
        setInputValue("");
      }
    },
    [tripId, recommender, addRecommendation]
  );

  function handleTextSubmit() {
    const val = inputValue.trim();
    if (!val || isSubmitting) return;
    submit(isUrl(val) ? "url" : "text", val);
  }

  function handleFileUpload(files: FileList | null) {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        submit("file", base64);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  }

  const dropProps =
    variant === "panel"
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            setDragActive(true);
          },
          onDragLeave: () => setDragActive(false),
          onDrop: handleDrop,
        }
      : {};

  return (
    <div className={className} {...dropProps}>
      {variant === "panel" && dragActive && (
        <div className="mb-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 py-4">
          <span className="text-xs text-primary font-medium">Drop files here</span>
        </div>
      )}

      <div className="flex gap-1.5">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleTextSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={isSubmitting}
          className="text-xs h-7"
        />
        <Button
          size="icon-xs"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting}
          title="Upload PDF or document"
        >
          <Upload className="size-3" />
        </Button>
        <Button
          size="xs"
          onClick={handleTextSubmit}
          disabled={!inputValue.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Plus className="size-3" />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        {!showRecommenderField ? (
          <button
            type="button"
            onClick={() => setShowRecommenderField(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <User className="size-2.5" /> Add who recommended it
          </button>
        ) : (
          <div className="flex items-center gap-1.5 flex-1">
            <User className="size-3 text-muted-foreground shrink-0" />
            <Input
              value={recommender}
              onChange={(e) => setRecommender(e.target.value)}
              placeholder="e.g. Sarah, Jake..."
              className="text-xs h-6 flex-1"
            />
            <button
              type="button"
              onClick={() => {
                setShowRecommenderField(false);
                setRecommender("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.doc,.docx"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {toast && (
        <div
          className={`mt-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] animate-fade-up ${
            toast.itemCount > 0
              ? "border border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"
              : "border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          <Check className="size-3.5 shrink-0" />
          <span>
            {toast.itemCount > 0
              ? `${toast.itemCount} item${toast.itemCount !== 1 ? "s" : ""} extracted`
              : "Added, but no specific places found"}
            {toast.recommender ? ` from ${toast.recommender}` : ""}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
