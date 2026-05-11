/**
 * Pure predicate for the transactional guard in saveTrip / saveConversation:
 * refuse to persist when the incoming snapshot would replace a longer history.
 */
export function isShrinkingChatSnapshot(incomingLength: number, existingLength: number): boolean {
  return incomingLength < existingLength;
}
