import { NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { saveConversation } from "@/lib/conversations-store";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const { conversationId, userMessage, assistantMessage } = await req.json();
  if (!conversationId || !userMessage) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let title: string;
  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system:
        "Generate a concise title (max 6 words) for this travel conversation. Return ONLY the title, no quotes, no punctuation at the end.",
      prompt: `User: ${userMessage.slice(0, 500)}\n\nAssistant: ${(assistantMessage || "").slice(0, 300)}`,
    });
    title = text.trim().slice(0, 80) || userMessage.slice(0, 60);
  } catch {
    title = userMessage.slice(0, 60);
  }

  await saveConversation({ id: conversationId, title }, userId);
  return NextResponse.json({ title });
}
