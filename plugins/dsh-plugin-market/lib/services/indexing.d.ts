import { PluginCache } from '../db/cache.js';
import type { Plugin, PluginDetail, Category, SyncResult, CacheStatus, SearchOptions, IIndexingService, PluginMarketConfig } from '../types.js';
export declare class IndexingService implements IIndexingService {
    private cache;
    private githubClient;
    private npmClient;
    private config;
    private catalogUrls;
    private fallbackToSearch;
    private syncInProgress;
    constructor(cache: PluginCache, config: PluginMarketConfig['sources'], catalog?: PluginMarketConfig['catalog']);
    syncAll(): Promise<SyncResult>;
    syncIncremental(): Promise<SyncResult>;
    private loadRegistry;
    private readLocalSnapshot;
    private applyRegistry;
    private registryItemToPlugin;
    private syncFromSearchApis;
    private syncFromGitHub;
    private syncFromNpm;
    private githubRepoToPlugin;
    private npmPackageToPlugin;
    private extractGitHubIdFromNpm;
    search(query: string, options?: SearchOptions): Promise<{
        plugins: Plugin[];
        total: number;
    }>;
    getByCategory(categoryId: string, options?: SearchOptions): Promise<{
        plugins: Plugin[];
        total: number;
    }>;
    getTrending(limit?: number): Promise<Plugin[]>;
    getRecent(limit?: number): Promise<Plugin[]>;
    getDetail(pluginId: string): Promise<PluginDetail | null>;
    private fetchReadme;
    getCategories(): Promise<Category[]>;
    getCacheStatus(): Promise<CacheStatus>;
}
//# sourceMappingURL=indexing.d.ts.map