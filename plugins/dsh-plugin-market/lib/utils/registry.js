/** Stable on-wire schema for website/public/registry.json (CI + Vercel + DSH plugin). */
export const EXCLUDED_REPOS = new Set([
    'deepseek-ai/deepseek-harness',
]);
export const DEFAULT_CATALOG_URLS = [
    'https://dsh-plugin-market.vercel.app/registry.json',
    'https://cdn.jsdelivr.net/gh/chnjames/dsh-plugin-market@main/website/public/registry.json',
    'https://raw.githubusercontent.com/chnjames/dsh-plugin-market/main/website/public/registry.json',
];
//# sourceMappingURL=registry.js.map