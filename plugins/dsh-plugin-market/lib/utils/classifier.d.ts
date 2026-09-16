import type { RiskLevel } from '../types.js';
/**
 * English tokens use word boundaries so `git` ≠ `github`, `system` ≠ `design-systems`,
 * `auth` ≠ `author`, `read` ≠ `readme`. CJK keywords stay substring matches.
 */
export declare function containsToken(haystack: string, keyword: string): boolean;
export declare function classifyPlugin(info: {
    name: string;
    description: string;
    topics: string[];
    keywords: string[];
}): string;
/**
 * Heuristic hint from public marketing text. Not a sandbox / permission audit.
 * Default is `unknown`. Prefer missing a flag over alarming a theme or desktop wrapper.
 * Broad words (web, git, ui, system, file, command, shell, exec, upload) are excluded.
 */
export declare function inferRiskLevel(info: {
    name: string;
    description: string;
    topics: string[];
    keywords: string[];
}): RiskLevel;
//# sourceMappingURL=classifier.d.ts.map