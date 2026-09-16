/** Strip GitHub-flavored chrome so Agent / UI can show a short readable excerpt. */
export interface ReadmeBlock {
    type: 'p' | 'h' | 'ul' | 'pre';
    text?: string;
    items?: string[];
}
export interface ReadmeExcerpt {
    blocks: ReadmeBlock[];
    truncated: boolean;
}
export declare function excerptReadme(raw: string | undefined, pluginName?: string, maxChars?: number): ReadmeExcerpt;
export declare function excerptReadmeText(raw: string | undefined, pluginName?: string): string;
//# sourceMappingURL=readme.d.ts.map