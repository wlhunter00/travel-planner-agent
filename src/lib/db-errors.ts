export type DbErrorCode = "db_timeout" | "db_unknown";

/**
 * Classify a thrown DB error message into a coarse code the client can act on.
 * Prior version used /timeout|timed out|connect/i which mislabeled any message
 * containing the substring "connect" (e.g. "connection refused successfully
 * negotiated"); narrowed to explicit timeout/connection error codes.
 */
export function classifyDbError(message: string): DbErrorCode {
  return /timeout|timed out|ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(message)
    ? "db_timeout"
    : "db_unknown";
}
