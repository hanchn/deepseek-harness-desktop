// dsh-ui-codex — host half.
//
// This package is presentation-only: everything it contributes lives in the
// browser (lib/client.js, declared through `dsh.client`). The host half exists
// because the loader imports a patch row's `name` as a cordis plugin, so the
// package must expose the plugin face even when it has nothing to do on the
// host plane.

/** Cordis plugin name used by loader diagnostics. */
export const name = "ui-codex";

/** No host services are required. */
export const inject = [];

export function apply() {
  // Intentionally empty: the browser half owns all behaviour.
}
