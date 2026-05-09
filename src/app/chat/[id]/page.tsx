import { ConversationPageClient } from "./conversation-page-client";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConversationPageClient conversationId={id} />;
}
