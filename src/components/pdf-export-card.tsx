"use client";

import { memo, useCallback, useState } from "react";
import { Download, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PdfExportCardProps = {
  title: string;
  subtitle?: string;
  content: string;
};

export const PdfExportCard = memo(function PdfExportCard({
  title,
  subtitle,
  content,
}: PdfExportCardProps) {
  const [status, setStatus] = useState<"idle" | "downloading" | "done">("idle");

  const handleDownload = useCallback(async () => {
    setStatus("downloading");
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, subtitle, content }),
      });

      if (!res.ok) throw new Error("PDF generation failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+?)"/);
      a.download = filenameMatch?.[1] ?? "export.pdf";

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("done");
    } catch (err) {
      console.error("PDF download error:", err);
      setStatus("idle");
    }
  }, [title, subtitle, content]);

  const preview = content.length > 140 ? `${content.slice(0, 137)}…` : content;

  return (
    <div className="w-full max-w-[85%] rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed">
            {preview}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleDownload}
          disabled={status === "downloading"}
        >
          {status === "downloading" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating…
            </>
          ) : status === "done" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Downloaded
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </>
          )}
        </Button>
        {status === "done" && (
          <button
            onClick={() => setStatus("idle")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Download again
          </button>
        )}
      </div>
    </div>
  );
});
