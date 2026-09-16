// ============================================================
// DSH Plugin Market - npm Registry API Wrapper
// ============================================================
export class NpmApiClient {
    registry;
    constructor(registry = 'https://registry.npmjs.org') {
        this.registry = registry.replace(/\/$/, '');
    }
    /**
     * 按关键词搜索 npm 包
     */
    async search(keyword, size = 250) {
        const url = `${this.registry}/-/v1/search?text=keywords:${encodeURIComponent(keyword)}&size=${size}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`npm registry error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * 获取包详情
     */
    async getPackage(name) {
        const url = `${this.registry}/${encodeURIComponent(name)}`;
        const response = await fetch(url);
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`npm registry error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * 获取包的周下载量
     */
    async getWeeklyDownloads(packageName) {
        try {
            const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`;
            const response = await fetch(url);
            if (!response.ok)
                return 0;
            const data = await response.json();
            return data.downloads || 0;
        }
        catch {
            return 0;
        }
    }
    /**
     * 获取 README（从包详情中）
     */
    async getReadme(packageName) {
        try {
            const pkg = await this.getPackage(packageName);
            return pkg?.readme || null;
        }
        catch {
            return null;
        }
    }
    /**
     * 从 repository 字段中提取 GitHub owner/repo
     */
    extractGitHubRepo(repoUrl) {
        if (!repoUrl)
            return null;
        // 处理各种格式:
        // https://github.com/owner/repo
        // git+https://github.com/owner/repo.git
        // github:owner/repo
        // owner/repo
        const patterns = [
            /github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?/,
            /^([^/]+)\/([^/]+)$/,
        ];
        for (const pattern of patterns) {
            const match = repoUrl.match(pattern);
            if (match) {
                return { owner: match[1], repo: match[2] };
            }
        }
        return null;
    }
}
//# sourceMappingURL=npm-api.js.map