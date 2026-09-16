/**
 * The Rust usage/balance commands answer with a small set of prefixed error
 * codes so the panel can translate them. Anything else stays `unknown` and is
 * never echoed to the user: transport errors can carry URLs and socket
 * details that do not belong in the controller surface.
 */

const ERROR_PREFIX = {
  noCredential: "USAGE_NO_CREDENTIAL:",
  keyRejected: "USAGE_KEY_REJECTED:",
  timeout: "USAGE_TIMEOUT:",
  unavailable: "USAGE_UNAVAILABLE:",
  http: "USAGE_HTTP_ERROR:",
  invalidResponse: "USAGE_INVALID_RESPONSE:",
} as const;

export type UsageFailureKind = keyof typeof ERROR_PREFIX | "unknown";

export function classifyUsageFailure(error: unknown): UsageFailureKind {
  const raw = String(error);
  for (const [kind, prefix] of Object.entries(ERROR_PREFIX)) {
    if (raw.startsWith(prefix)) return kind as UsageFailureKind;
  }
  return "unknown";
}
