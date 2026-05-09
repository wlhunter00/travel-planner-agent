"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { Logo } from "@/components/logo";
import { ConversationCard } from "@/components/conversation-card";
import { Plus, ArrowLeft } from "lucide-react";

interface ConversationIndex {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export function ConversationListClient() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationIndex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => setConversations(data))
      .finally(() => setLoading(false));
  }, []);

  async function handleNew() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const conv = await res.json();
    router.push(`/chat/${conv.id}`);
  }

  return (
    <div className="min-h-screen">
      <header className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 via-transparent to-violet-500/5" />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-12">
          <div className="absolute top-4 right-6">
            <UserMenu />
          </div>
          <div className="animate-fade-up">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="size-3" />
              Back to trips
            </button>
            <div className="flex items-center gap-2.5 mb-3">
              <Logo className="size-6 shrink-0 rounded-md shadow-sm" />
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/70">
                Travel Concierge
              </p>
            </div>
            <h1 className="font-serif text-5xl lg:text-6xl tracking-tight text-foreground">
              Conversations
            </h1>
            <p className="text-muted-foreground mt-3 text-lg max-w-md">
              Ask anything about travel — upload docs, compare options, get second opinions.
            </p>
          </div>
          <div className="mt-8 animate-fade-up stagger-2">
            <Button onClick={handleNew} size="lg" className="gap-2 font-medium">
              <Plus className="size-4" />
              New Conversation
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="shimmer h-32 rounded-xl" />
            ))}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="text-center py-24 animate-fade-up">
            <Logo className="size-14 mx-auto mb-5 rounded-xl shadow-md" />
            <p className="font-serif text-2xl mb-2">No conversations yet</p>
            <p className="text-muted-foreground mb-8 max-w-xs mx-auto">
              Start a freeform chat about anything travel-related.
            </p>
            <Button onClick={handleNew} size="lg" className="gap-2">
              <Plus className="size-4" />
              Start your first conversation
            </Button>
          </div>
        )}

        {!loading && conversations.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {conversations.map((conv, i) => (
              <div
                key={conv.id}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <ConversationCard
                  {...conv}
                  onClick={() => router.push(`/chat/${conv.id}`)}
                  onDelete={async () => {
                    await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" });
                    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
