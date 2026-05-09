"use client";

import { useState, useRef, useCallback, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, FileText, Loader2 } from "lucide-react";

interface ImportItineraryDialogProps {
  open: boolean;
  onClose: () => void;
}

type InputMode = "file" | "paste";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export function ImportItineraryDialog({
  open,
  onClose,
}: ImportItineraryDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [author, setAuthor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPasteText("");
    setAuthor("");
    setErrorMsg(null);
    setIsSubmitting(false);
    setDragActive(false);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (
      !ACCEPTED_TYPES.includes(f.type) &&
      !f.name.endsWith(".txt") &&
      !f.name.endsWith(".docx") &&
      !f.name.endsWith(".pdf")
    ) {
      setErrorMsg("Unsupported file type. Use PDF, DOCX, or TXT.");
      return;
    }
    setFile(f);
    setErrorMsg(null);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  }

  async function handleSubmit() {
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      let content: string;
      let filename: string | undefined;
      let mimeType: string | undefined;

      if (mode === "file" && file) {
        filename = file.name;
        mimeType =
          file.type ||
          (file.name.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : file.name.endsWith(".pdf")
              ? "application/pdf"
              : "text/plain");

        if (mimeType === "text/plain") {
          content = await file.text();
        } else {
          const buf = await file.arrayBuffer();
          content = btoa(
            new Uint8Array(buf).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              "",
            ),
          );
        }
      } else if (mode === "paste" && pasteText.trim()) {
        content = pasteText.trim();
        filename = undefined;
        mimeType = undefined;
      } else {
        setErrorMsg("Please upload a file or paste itinerary text.");
        setIsSubmitting(false);
        return;
      }

      const res = await fetch("/api/trips/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, mimeType, content }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Import failed" }));
        setErrorMsg(data.error || "Import failed");
        setIsSubmitting(false);
        return;
      }

      const data = await res.json();
      reset();
      onClose();

      if (data.trips?.length > 0) {
        router.push(`/trip/${data.trips[0].id}`);
      }
    } catch {
      setErrorMsg("Network error — please try again.");
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  const hasContent =
    (mode === "file" && file) || (mode === "paste" && pasteText.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="font-semibold text-base">Import Itinerary</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload a trip plan someone made for you — PDF, DOCX, or paste text
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setMode("file")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "file"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setMode("paste")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "paste"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Paste Text
            </button>
          </div>

          {/* File upload */}
          {mode === "file" && (
            <div
              className={`rounded-lg border-2 border-dashed transition-colors ${
                dragActive
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 hover:border-border"
              } ${file ? "p-3" : "p-6"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="size-6 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop, or{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-primary hover:underline"
                    >
                      choose a file
                    </button>
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    PDF, DOCX, or TXT
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={(e) => {
                  handleFileSelect(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Paste text */}
          {mode === "paste" && (
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the full itinerary text here..."
              rows={8}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none dark:bg-input/30"
            />
          )}

          {/* Author (optional) */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Who made this itinerary? (optional)
            </label>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Travel agent, friend's name..."
              className="text-xs h-8"
            />
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!hasContent || isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
