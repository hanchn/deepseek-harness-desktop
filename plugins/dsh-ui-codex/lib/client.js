// dsh-ui-codex — browser half.
//
// Presentation-only client plugin for the DeepSeek Harness Web UI. It layers a
// Codex-style neutral palette and density over the *active* theme through
// `ctx.theme.overrideTokens` (the sanctioned token-override seam): the shipped
// light/dark palettes stay untouched, the layer composes in registration order,
// and unloading this plugin restores whatever it covered.
//
// Loaded through package.json's `dsh.client` declaration + exports["./client"].

window.__ModuleLoader__.load({
  id: "dsh-ui-codex",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;

    /** Layer identity for the theme override — also names its origin for inspection. */
    const SOURCE = "dsh-ui-codex";

    /**
     * Codex-style neutral palette. Every token carries both modes: the theme
     * contract requires it so an override can never go illegible when the user
     * switches color scheme.
     */
    const TOKENS = {
      // Surfaces: pure neutral greys, no blue cast. The main canvas sits one
      // step above the sidebar, exactly as the Codex desktop app separates them.
      "--dsw-alias-bg-base": { dark: "#212121", light: "#ffffff" },
      "--dsw-alias-bg-layer-1": { dark: "#171717", light: "#f9f9f9" },
      "--dsw-alias-bg-layer-2": { dark: "#2a2a2a", light: "#f2f2f2" },
      "--dsw-alias-bg-layer-3": { dark: "#303030", light: "#ececec" },
      "--dsw-alias-bg-overlay": { dark: "#2a2a2a", light: "#ffffff" },
      "--dsw-alias-bg-module-platform": { dark: "#1c1c1c", light: "#f4f4f4" },
      "--dsw-alias-bg-skeleton": { dark: "#2a2a2a", light: "#ececec" },

      // Text ladder: near-white primary, quiet greys below it.
      "--dsw-alias-label-primary": { dark: "#f5f5f5", light: "#0d0d0d" },
      "--dsw-alias-label-secondary": { dark: "#a6a6a6", light: "#5d5d5d" },
      "--dsw-alias-label-tertiary": { dark: "#8c8c8c", light: "#757575" },
      "--dsw-alias-label-dimmed": { dark: "#6e6e6e", light: "#8f8f8f" },
      "--dsw-alias-label-primary-foreground": { dark: "#0d0d0d", light: "#ffffff" },

      // Hairlines: white alpha on dark, black alpha on light — Codex never
      // draws a solid grey border.
      "--dsw-alias-border-l1": { dark: "#ffffff12", light: "#0000000f" },
      "--dsw-alias-border-l2": { dark: "#ffffff1f", light: "#0000001a" },
      "--dsw-alias-border-l3": { dark: "#ffffff2e", light: "#00000029" },
      "--dsw-alias-border-l4": { dark: "#ffffff3d", light: "#0000003d" },

      // Interaction states.
      "--dsw-alias-interactive-bg-hover": { dark: "#ffffff14", light: "#0000000a" },
      "--dsw-alias-interactive-bg-active": { dark: "#ffffff1f", light: "#00000012" },

      // Primary action is white-on-dark, not blue.
      "--dsw-alias-brand-primary": { dark: "#f5f5f5", light: "#0d0d0d" },
      "--dsw-alias-brand-primary-invert": { dark: "#0d0d0d", light: "#ffffff" },
      "--dsw-alias-label-primary-bluish": { dark: "#f5f5f5", light: "#0d0d0d" },
      "--dsw-alias-link": { dark: "#f5f5f5", light: "#0d0d0d" },

      // Code surfaces.
      "--dsw-alias-markdown-code-block": { dark: "#171717", light: "#f7f7f7" },
      "--dsw-alias-markdown-inline-code": { dark: "#2a2a2a", light: "#efefef" },
      "--dsw-alias-tooltip-bg": { dark: "#2f2f2f", light: "#0d0d0d" },
    };

    const CSS = `
/* ── dsh-ui-codex: density & type ───────────────────────────────────────────
   Codex reads tight: smaller radii, denser rows, no decorative shadows. */
body {
  --dsh-codex-radius: 8px;
  --dsh-codex-radius-lg: 12px;
}

/* Square off the app's larger rounded surfaces one step. */
body[data-ds-dark-theme] [class*="rounded-"] {
  corner-shape: initial;
}

/* Codex uses a neutral, slightly cool sans with tabular figures in chrome. */
body {
  font-feature-settings: "cv11", "ss01";
}

code, pre, kbd, samp {
  font-variant-ligatures: none;
}
`;

    function injectStyles() {
      const tagId = SOURCE + "/styles";
      if (typeof document === "undefined") return;
      let el = document.querySelector('style[data-plugin-css="' + tagId + '"]');
      if (!el) {
        el = document.createElement("style");
        el.dataset.plugin = SOURCE;
        el.dataset.pluginCss = tagId;
        document.head.appendChild(el);
      }
      el.textContent = CSS;
    }

    const inject = ["theme"];

    async function apply(ctx) {
      injectStyles();
      const theme = ctx.theme || (typeof ctx.get === "function" ? ctx.get("theme") : undefined);
      if (!theme || typeof theme.overrideTokens !== "function") {
        throw new Error("dsh-ui-codex: ctx.theme.overrideTokens unavailable");
      }
      ctx.effect(() => theme.overrideTokens(SOURCE, TOKENS), "ui-codex.theme");
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.SOURCE = SOURCE;
    return module.exports;
  },
});
