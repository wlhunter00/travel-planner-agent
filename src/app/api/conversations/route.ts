import { NextResponse } from "next/server";
import {
  listConversations,
  createConversation,
  saveConversation,
} from "@/lib/conversations-store";
import { requireAuth } from "@/lib/api-auth";
import { isStaleSaveError } from "@/lib/stale-save-error";

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const conversations = await listConversations(userId);
  return NextResponse.json(conversations);
}

export async function POST() {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const conv = await createConversation(userId);
  return NextResponse.json(conv, { status: 201 });
}

export async function PUT(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  try {
    await saveConversation(
      { id: body.id, title: body.title, messages: body.messages },
      userId,
    );
  } catch (e) {
    if (isStaleSaveError(e) && e.serverConversation) {
      console.warn("[chat-persist] conversation put rejected stale", {
        conversationId: body.id,
        incomingMsgs: Array.isArray(body.messages) ? body.messages.length : null,
        serverMsgs: e.serverConversation.messages.length,
      });
      return NextResponse.json(
        { error: "stale", conversation: e.serverConversation },
        { status: 409 },
      );
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
