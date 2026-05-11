import type { Trip, Conversation } from "./types";

/**
 * Thrown by saveTrip / saveConversation when the incoming write would
 * shrink the persisted chat history. Carries the authoritative server-side
 * record so the API route can return it to the client in a 409 response.
 */
export class StaleSaveError extends Error {
  readonly serverTrip?: Trip;
  readonly serverConversation?: Conversation;

  constructor(
    args:
      | { kind: "trip"; serverTrip: Trip }
      | { kind: "conversation"; serverConversation: Conversation },
  ) {
    super("stale_save");
    this.name = "StaleSaveError";
    if (args.kind === "trip") this.serverTrip = args.serverTrip;
    else this.serverConversation = args.serverConversation;
  }
}

export function isStaleSaveError(e: unknown): e is StaleSaveError {
  return e instanceof StaleSaveError;
}
