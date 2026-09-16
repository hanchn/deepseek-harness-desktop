export interface NpmPackage {
    name: string;
    version: string;
    description: string;
    author?: {
        name: string;
        email?: string;
        url?: string;
    };
    keywords: string[];
    license: string;
    links: {
        npm?: string;
        homepage?: string;
        repository?: string;
        bugs?: string;
    };
    date: string;
    publisher?: {
        username: string;
        email: string;
    };
    maintainers?: Array<{
        username: string;
        email: string;
    }>;
}
export interface NpmSearchResult {
    objects: Array<{
        package: NpmPackage;
        score: {
            final: number;
            detail: {
                quality: number;
                popularity: number;
                maintenance: number;
            };
        };
        searchScore: number;
    }>;
    total: number;
    time: string;
}
export interface NpmDownloadResult {
    downloads: number;
    start: string;
    end: string;
    package: string;
}
export declare class NpmApiClient {
    private registry;
    constructor(registry?: string);
    /**
     * 按关键词搜索 npm 包
     */
    search(keyword: string, size?: number): Promise<NpmSearchResult>;
    /**
     * 获取包详情
     */
    getPackage(name: string): Promise<any>;
    /**
     * 获取包的周下载量
     */
    getWeeklyDownloads(packageName: string): Promise<number>;
    /**
     * 获取 README（从包详情中）
     */
    getReadme(packageName: string): Promise<string | null>;
    /**
     * 从 repository 字段中提取 GitHub owner/repo
     */
    extractGitHubRepo(repoUrl: string): {
        owner: string;
        repo: string;
    } | null;
}
//# sourceMappingURL=npm-api.d.ts.map