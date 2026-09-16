import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { IndexingService } from './services/indexing.js';
import { InstallerService } from './services/installer.js';
import type { PluginMarketConfig } from './types.js';
/** Wire-safe scalar projection of one plugin list item. */
export interface PluginListItem {
    id: string;
    source: string;
    name: string;
    description: string;
    category: string;
    author: string;
    url: string;
    stars: number;
    downloads: number;
    version: string;
    license: string;
    permissionLevel: string;
    isInstalled: boolean;
}
/** Wire-safe scalar projection of one plugin detail. */
export interface PluginDetailItem extends PluginListItem {
    readme: string;
    homepage?: string;
    repository?: string;
}
/** Search request accepted from the browser client. */
export interface MarketSearchRequest {
    query?: string;
    category?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    installedOnly?: boolean;
    riskLevel?: string;
    source?: string;
}
/** Search response: scalar list + total. */
export interface MarketSearchResponse {
    plugins: PluginListItem[];
    total: number;
}
/** Install/uninstall/update request. */
export interface PluginActionRequest {
    pluginId: string;
    profile?: string;
    confirm?: boolean;
}
/**
 * The plugin-market Remote service. Built by {@link loadPluginMarketService}
 * inside the plugin entry and registered under the `pluginMarket` Cordis
 * service key. Every public method marked with `@Remote` is callable from the
 * browser via `ctx.remote.pluginMarket`.
 *
 * Declared here as the instance shape; the runtime export is the loader, because
 * a vendored copy resolves its base class from the installation anchors.
 */
export declare class PluginMarketService extends TypertRemoteService {
    static inject: string[];
    private indexing;
    private installer;
    private config;
    constructor(ctx: any, config: PluginMarketConfig, indexing: IndexingService, installer: InstallerService);
    /** Drop `undefined` / non-JSON values so Gateway SRC `assertJsonValue` accepts the result. */
    private toWire;
    /** Project one cached Plugin into its wire-safe list shape. */
    private toListItem;
    /** Wire-safe snapshot of the current cache status. */
    private statusSnapshot;
    search(request?: MarketSearchRequest): Promise<MarketSearchResponse>;
    detail(request: {
        pluginId: string;
    }): Promise<PluginDetailItem | null>;
    categories(): Promise<Array<{
        id: string;
        name: string;
        nameEn?: string;
        icon?: string;
        pluginCount: number;
    }>>;
    trending(request?: {
        limit?: number;
    }): Promise<PluginListItem[]>;
    recent(request?: {
        limit?: number;
    }): Promise<PluginListItem[]>;
    status(): Promise<any>;
    sync(): Promise<any>;
    installPlugin(request: PluginActionRequest): Promise<any>;
    uninstall(request: PluginActionRequest): Promise<any>;
    update(request: PluginActionRequest): Promise<any>;
    installed(): Promise<{
        profile: string;
        profileDir: string;
        profileFile: string;
        error: string | null;
        plugins: Array<{
            name: string;
            spec: string;
            kind: string;
            catalogId: string | null;
            catalogName: string | null;
            version: string | null;
            active: boolean;
        }>;
    }>;
    statusOf(request: {
        pluginId: string;
    }): Promise<string>;
}
export declare function createPluginMarketService(Remote: unknown, TypertRemoteService: unknown): typeof PluginMarketService;
export declare function loadPluginMarketService(): Promise<typeof PluginMarketService>;
//# sourceMappingURL=remote.d.ts.map