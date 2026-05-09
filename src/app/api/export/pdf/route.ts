import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { markdownToDocDefinition } from "@/lib/markdown-to-pdf";

// pdfmake ships as a browser bundle; require the build artifact for Node
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require("pdfmake/build/pdfmake");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require("pdfmake/build/vfs_fonts");
pdfmake.vfs = vfsFonts;

export async function POST(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  let body: { title?: string; content?: string; subtitle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, content, subtitle } = body;

  if (!title || !content) {
    return NextResponse.json(
      { error: "title and content are required" },
      { status: 400 }
    );
  }

  const docDefinition = markdownToDocDefinition(title, content, subtitle);

  const pdf = pdfmake.createPdf(docDefinition);
  const raw = await pdf.getBuffer();
  const arrayBuffer = (raw as Uint8Array).buffer.slice(
    (raw as Uint8Array).byteOffset,
    (raw as Uint8Array).byteOffset + (raw as Uint8Array).byteLength
  ) as ArrayBuffer;

  const filename = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return new Response(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
