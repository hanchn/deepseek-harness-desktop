export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    forks_count: number;
    updated_at: string;
    pushed_at: string;
    owner: {
        login: string;
        avatar_url: string;
        type: string;
    };
    topics: string[];
    language: string | null;
    license: {
        key: string;
        name: string;
        spdx_id: string;
    } | null;
    default_branch: string;
    homepage: string | null;
}
export interface GitHubSearchResult {
    total_count: number;
    items: GitHubRepo[];
    incomplete_results: boolean;
}
export interface GitHubReadmeResponse {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    download_url: string | null;
    content: string;
    encoding: string;
}
export declare class GitHubApiClient {
    private baseUrl;
    private token?;
    constructor(token?: string);
    private get headers();
    /**
     * 搜索 topic 为 dsh-plugin 的仓库
     */
    searchByTopic(topic: string, page?: number, perPage?: number): Promise<GitHubSearchResult>;
    /**
     * 获取仓库详情
     */
    getRepo(owner: string, repo: string): Promise<GitHubRepo>;
    /**
     * 获取仓库 README
     */
    getReadme(owner: string, repo: string): Promise<string | null>;
    /**
     * 获取最新的 commit hash
     */
    getLatestCommitHash(owner: string, repo: string, branch?: string): Promise<string | null>;
    /**
     * 全量拉取所有 topic 仓库（最多 1000 条，GitHub 搜索限制）
     */
    fetchAllRepos(topic: string): Promise<GitHubRepo[]>;
}
//# sourceMappingURL=github-api.d.ts.map