import type { UIMessage } from "ai";
import { extractTextFromBase64 } from "./extract-text";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXTRACTABLE_MIMES = new Set([
  "application/pdf",
  DOCX_MIME,
  "text/plain",
]);

function isExtractable(mediaType: string): boolean {
  return EXTRACTABLE_MIMES.has(mediaType) || mediaType.startsWith("text/");
}

function labelForMime(mediaType: string): string {
  if (mediaType === "application/pdf") return "PDF";
  if (mediaType === DOCX_MIME) return "DOCX";
  return "Text";
}

async function extractTextFromDataUrl(
  dataUrl: string,
  mediaType: string,
): Promise<string> {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return `[Could not decode ${labelForMime(mediaType)}]`;
    return await extractTextFromBase64(base64, mediaType);
  } catch {
    return `[Failed to extract ${labelForMime(mediaType)} text]`;
  }
}

/**
 * Replace PDF / DOCX / text file parts in user messages with extracted plain
 * text so the model receives readable content instead of binary data URLs.
 */
export async function preprocessFilePartsInMessages(
  msgs: UIMessage[],
): Promise<UIMessage[]> {
  return Promise.all(
    msgs.map(async (msg) => {
      if (msg.role !== "user") return msg;

      const hasFileParts = msg.parts.some(
        (p) =>
          p.type === "file" &&
          "mediaType" in p &&
          isExtractable((p as Record<string, unknown>).mediaType as string),
      );
      if (!hasFileParts) return msg;

      const newParts = await Promise.all(
        msg.parts.map(async (part) => {
          if (part.type !== "file") return part;
          const fp = part as Record<string, unknown>;
          const mediaType = fp.mediaType as string;
          if (!isExtractable(mediaType)) return part;
          const text = await extractTextFromDataUrl(fp.url as string, mediaType);
          const filename = (fp.filename as string) || `document.${labelForMime(mediaType).toLowerCase()}`;
          return {
            type: "text" as const,
            text: `[Attached ${labelForMime(mediaType)}: ${filename}]\n\n${text}`,
          };
        }),
      );
      return { ...msg, parts: newParts } as UIMessage;
    }),
  );
}
