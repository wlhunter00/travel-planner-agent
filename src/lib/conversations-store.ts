import type { Conversation, ChatMessage } from "./types";
import { prisma } from "./prisma";

export interface ConversationIndex {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export async function listConversations(userId: string): Promise<ConversationIndex[]> {
  const rows = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getConversation(
  id: string,
  userId: string,
): Promise<Conversation | null> {
  const row = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    messages: (row.messages as unknown as ChatMessage[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createConversation(userId: string): Promise<Conversation> {
  const row = await prisma.conversation.create({
    data: { userId },
  });
  return {
    id: row.id,
    title: row.title,
    messages: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveConversation(
  conv: { id: string; title?: string; messages?: ChatMessage[] },
  userId: string,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (conv.title !== undefined) data.title = conv.title;
  if (conv.messages !== undefined) data.messages = conv.messages as unknown as object;
  if (Object.keys(data).length === 0) return;

  await prisma.conversation.updateMany({
    where: { id: conv.id, userId },
    data,
  });
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  await prisma.conversation.deleteMany({ where: { id, userId } });
}
