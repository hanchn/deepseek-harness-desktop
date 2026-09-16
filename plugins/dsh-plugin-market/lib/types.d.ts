export type PluginSource = 'github' | 'npm';
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'unknown';
export interface Category {
    id: string;
    name: string;
    nameEn?: string;
    icon?: string;
    description?: string;
    pluginCount: number;
}
export interface Plugin {
    id: string;
    source: PluginSource;
    name: string;
    description: string;
    category: string;
    categories?: string[];
    author: string;
    url: string;
    stars: number;
    downloads: number;
    version: string;
    license: string;
    language: string;
    topics: string[];
    keywords: string[];
    readmeUrl?: string;
    installCmd: string;
    permissionLevel: RiskLevel;
    compatibility?: string;
    updatedAt: string;
    cachedAt: string;
    isInstalled: boolean;
    installedVersion?: string;
}
export interface PluginDetail extends Plugin {
    readme: string;
    homepage?: string;
    repository?: string;
    bugsUrl?: string;
    maintainers?: string[];
}
export type InstallStatus = 'not_installed' | 'installing' | 'installed' | 'install_failed' | 'uninstalling';
export interface InstallResult {
    success: boolean;
    pluginId: string;
    version?: string;
    error?: string;
    durationMs: number;
    needsConfirm?: boolean;
}
export interface UninstallResult {
    success: boolean;
    pluginId: string;
    error?: string;
    durationMs: number;
}
export interface UpdateResult {
    success: boolean;
    pluginId: string;
    fromVersion?: string;
    toVersion?: string;
    error?: string;
    durationMs: number;
}
export interface InstalledPlugin {
    id: string;
    name: string;
    version: string;
    source: PluginSource;
    installedAt: string;
    profile: string;
}
export interface SyncResult {
    success: boolean;
    totalPlugins: number;
    newPlugins: number;
    updatedPlugins: number;
    failedSources: string[];
    durationMs: number;
    error?: string;
}
export interface CacheStatus {
    totalPlugins: number;
    lastSyncAt?: string;
    nextSyncAt?: string;
    isStale: boolean;
    sourceStats: {
        github: {
            count: number;
            lastSync?: string;
        };
        npm: {
            count: number;
            lastSync?: string;
        };
    };
}
export interface SearchOptions {
    category?: string;
    sortBy?: 'stars' | 'updated' | 'name' | 'downloads';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    installedOnly?: boolean;
    riskLevel?: RiskLevel;
    source?: PluginSource;
}
export interface PaginationOptions {
    page?: number;
    pageSize?: number;
}
export interface InstallOptions {
    profile?: string;
    version?: string;
    confirm?: boolean;
}
export interface PluginMarketConfig {
    catalog: {
        urls: string[];
        fallbackToSearch: boolean;
    };
    sources: {
        github: {
            enabled: boolean;
            token?: string;
            topic: string;
        };
        npm: {
            enabled: boolean;
            keyword: string;
            registry: string;
        };
    };
    cache: {
        ttl: number;
        autoRefresh: boolean;
        refreshInterval: number;
    };
    ui: {
        defaultSort: string;
        defaultView: string;
        showRiskLevel: boolean;
    };
    install: {
        defaultProfile: string;
        autoUpdate: boolean;
        confirmBeforeInstall: boolean;
        dshCommand?: string;
    };
}
export interface InstallLogEntry {
    id: number;
    pluginId: string;
    action: 'install' | 'uninstall' | 'update';
    version?: string;
    status: 'success' | 'failed' | 'pending';
    errorMessage?: string;
    createdAt: string;
}
export interface IIndexingService {
    syncAll(): Promise<SyncResult>;
    syncIncremental(): Promise<SyncResult>;
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
    getCategories(): Promise<Category[]>;
    getCacheStatus(): Promise<CacheStatus>;
}
export interface IInstallerService {
    install(pluginId: string, options?: InstallOptions): Promise<InstallResult>;
    uninstall(pluginId: string, options?: {
        profile?: string;
    }): Promise<UninstallResult>;
    update(pluginId: string, options?: {
        profile?: string;
    }): Promise<UpdateResult>;
    getInstalled(): Promise<InstalledPlugin[]>;
    isInstalled(pluginId: string): Promise<boolean>;
    getStatus(pluginId: string): Promise<InstallStatus>;
}
//# sourceMappingURL=types.d.ts.map