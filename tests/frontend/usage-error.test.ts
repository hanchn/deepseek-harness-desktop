import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyUsageFailure } from "../../src/lib/usage-error.ts";

test("each documented usage failure code maps to its own kind", () => {
  assert.equal(
    classifyUsageFailure("USAGE_NO_CREDENTIAL: no DeepSeek API key is configured"),
    "noCredential",
  );
  assert.equal(
    classifyUsageFailure("USAGE_KEY_REJECTED: the provider rejected the stored key"),
    "keyRejected",
  );
  assert.equal(
    classifyUsageFailure("USAGE_TIMEOUT: the balance request timed out"),
    "timeout",
  );
  assert.equal(
    classifyUsageFailure("USAGE_UNAVAILABLE: the balance request could not be sent"),
    "unavailable",
  );
  assert.equal(
    classifyUsageFailure("USAGE_HTTP_ERROR: the balance endpoint answered 502"),
    "http",
  );
  assert.equal(
    classifyUsageFailure("USAGE_INVALID_RESPONSE: balance response was not recognised"),
    "invalidResponse",
  );
});

test("unrecognised failures stay unknown instead of echoing their text", () => {
  assert.equal(classifyUsageFailure("USAGE_SERIALIZE: boom"), "unknown");
  assert.equal(
    classifyUsageFailure("Error: connect ECONNREFUSED 127.0.0.1:9"),
    "unknown",
  );
  assert.equal(classifyUsageFailure(undefined), "unknown");
});
