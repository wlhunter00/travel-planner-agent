/**
 * Shared helpers for extracting plain text from uploaded documents.
 * Supports PDF (via pdf-parse), DOCX (via mammoth), and raw text pass-through.
 */

export async function extractTextFromPdfBuffer(buf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  return result.text;
}

export async function extractTextFromPdfBase64(base64: string): Promise<string> {
  const buf = Buffer.from(base64, "base64");
  return extractTextFromPdfBuffer(buf);
}

export async function extractTextFromDocxBase64(base64: string): Promise<string> {
  const mammoth = await import("mammoth");
  const buf = Buffer.from(base64, "base64");
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Extract plain text from a base64-encoded document.
 * @param base64  base64 content (no data-URL prefix)
 * @param mimeType  MIME type of the source file
 */
export async function extractTextFromBase64(
  base64: string,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf") {
    return extractTextFromPdfBase64(base64);
  }
  if (mimeType === DOCX_MIME) {
    return extractTextFromDocxBase64(base64);
  }
  // Assume plain text / unknown — decode as UTF-8
  return Buffer.from(base64, "base64").toString("utf-8");
}
