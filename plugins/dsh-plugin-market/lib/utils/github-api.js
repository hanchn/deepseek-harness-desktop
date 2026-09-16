// ============================================================
// DSH Plugin Market - GitHub API Wrapper
// ============================================================
export class GitHubApiClient {
    baseUrl = 'https://api.github.com';
    token;
    constructor(token) {
        this.token = token;
    }
    get headers() {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'dsh-plugin-market',
        };
        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }
        return headers;
    }
    /**
     * 搜索 topic 为 dsh-plugin 的仓库
     */
    async searchByTopic(topic, page = 1, perPage = 100) {
        const url = `${this.baseUrl}/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`;
        const response = await fetch(url, { headers: this.headers });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * 获取仓库详情
     */
    async getRepo(owner, repo) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}`;
        const response = await fetch(url, { headers: this.headers });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    /**
     * 获取仓库 README
     */
    async getReadme(owner, repo) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/readme`;
        const response = await fetch(url, { headers: this.headers });
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (data.encoding === 'base64' && data.content) {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return null;
    }
    /**
     * 获取最新的 commit hash
     */
    async getLatestCommitHash(owner, repo, branch) {
        const ref = branch ? `heads/${branch}` : 'HEAD';
        const url = `${this.baseUrl}/repos/${owner}/${repo}/commits/${ref}`;
        const response = await fetch(url, {
            headers: { ...this.headers, 'Accept': 'application/vnd.github.sha' },
        });
        if (!response.ok) {
            return null;
        }
        return response.text();
    }
    /**
     * 全量拉取所有 topic 仓库（最多 1000 条，GitHub 搜索限制）
     */
    async fetchAllRepos(topic) {
        const allRepos = [];
        const perPage = 100;
        let page = 1;
        const maxPages = 10; // GitHub 搜索 API 最多 1000 条 = 10 页
        while (page <= maxPages) {
            try {
                const result = await this.searchByTopic(topic, page, perPage);
                if (result.items.length === 0)
                    break;
                allRepos.push(...result.items);
                if (allRepos.length >= result.total_count)
                    break;
                page++;
            }
            catch (error) {
                console.error('[plugin-market] GitHub search error:', error);
                break;
            }
        }
        return allRepos;
    }
}
//# sourceMappingURL=github-api.js.map