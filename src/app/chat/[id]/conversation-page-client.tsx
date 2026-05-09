"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationPanel } from "@/components/conversation-panel";
import { ArrowLeft } from "lucide-react";
import type { Conversation } from "@/lib/types";

interface ConversationPageClientProps {
  conversationId: string;
}

export function ConversationPageClient({ conversationId }: ConversationPageClientProps) {
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => setConversation(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [conversationId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="shimmer h-8 w-48 rounded-lg" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Conversation not found</p>
        <button
          type="button"
          onClick={() => router.push("/chat")}
          className="text-sm text-primary hover:underline"
        >
          Back to conversations
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="shrink-0 px-4 py-2 border-b flex items-center gap-3 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <button
          type="button"
          onClick={() => router.push("/chat")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" />
          All Chats
        </button>
        <span className="text-xs text-border">|</span>
        <h2 className="text-sm font-medium truncate">{conversation.title}</h2>
      </div>
      <div className="flex-1 min-h-0">
        <ConversationPanel
          conversationId={conversationId}
          initialTitle={conversation.title}
          initialMessages={conversation.messages}
        />
      </div>
    </div>
  );
}
