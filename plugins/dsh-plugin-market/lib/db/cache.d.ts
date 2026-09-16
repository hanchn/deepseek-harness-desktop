import type { Plugin, PluginDetail, Category, InstallLogEntry, CacheStatus } from '../types.js';
export declare class PluginCache {
    private db;
    private dbPath;
    private dbDir;
    private saveTimeout;
    private pendingSave;
    private readyPromise;
    constructor(dbPath: string);
    /**
     * 等待数据库就绪（异步初始化 sql.js WASM）
     * 多次调用安全，只会初始化一次
     */
    ready(): Promise<void>;
    private initDatabase;
    private initSchema;
    private createTables;
    private scheduleSave;
    private saveToFile;
    upsertPlugin(plugin: Omit<Plugin, 'isInstalled' | 'installedVersion'> & {
        isInstalled?: boolean;
        installedVersion?: string;
    }): void;
    updatePluginReadme(pluginId: string, readme: string): void;
    getPlugin(pluginId: string): Plugin | null;
    getPluginDetail(pluginId: string): PluginDetail | null;
    searchPlugins(query: string, options: {
        category?: string;
        sortBy?: string;
        sortOrder?: string;
        page?: number;
        pageSize?: number;
        installedOnly?: boolean;
        riskLevel?: string;
        source?: string;
    }): {
        plugins: Plugin[];
        total: number;
    };
    getTrendingPlugins(limit?: number): Plugin[];
    getRecentPlugins(limit?: number): Plugin[];
    getInstalledPlugins(): Plugin[];
    setInstalled(pluginId: string, installed: boolean, version?: string): void;
    /**
     * Set the installed flags to EXACTLY these catalog ids (derived by the
     * caller from the profile manifest). Returns how many ids were applied.
     */
    applyInstalledIds(ids: string[]): number;
    /** Catalog identities used for authoritative installed-state matching. */
    listIdentities(): {
        id: string;
        name: string;
        source: string;
    }[];
    getTotalCount(): number;
    getCategories(): Category[];
    private insertDefaultCategories;
    addInstallLog(entry: Omit<InstallLogEntry, 'id'>): number;
    updateInstallLog(id: number, status: string, errorMessage?: string): void;
    addSyncLog(source: string, status: string, startedAt: string): number;
    finishSyncLog(id: number, status: string, pluginCount: number, finishedAt: string, errorMessage?: string): void;
    getLastSyncTime(source?: string): string | null;
    getCacheStatus(): CacheStatus;
    private rowToObject;
    private rowToPlugin;
    private safeJsonParse;
    close(): void;
}
//# sourceMappingURL=cache.d.ts.map