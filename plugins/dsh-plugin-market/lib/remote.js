// ============================================================
// DSH Plugin Market - Remote Service (client-facing API)
// ============================================================
// Exposes the plugin-market domain to the DSH browser client through the
// Typert Gateway: the browser half calls `ctx.remote.pluginMarket.<method>()`
// and every call lands on the matching `@Remote` method here.
//
// This class IS the `pluginMarket` Cordis service (extends TypertRemoteService,
// which extends cordis Service and auto-registers under the service key).
// The legacy `ctx.provide('pluginMarket', {...})` object is replaced by this
// class instance so the Gateway can route browser calls to it.
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { loadDshPackage } from './services/dsh-package.js';
/** The installation package that carries the Remote base class. */
const TYPERT_PACKAGE = '@deepseek-ai/dsh-typert-protocol';
/**
 * The plugin-market Remote service. Instantiated inside the plugin entry and
 * registered under the `pluginMarket` Cordis service key. Every public method
 * marked with `@Remote` is callable from the browser via `ctx.remote.pluginMarket`.
 *
 * Built by a factory rather than at module load: a vendored copy of this plugin
 * is reached through a symlink, so the bare peer import is resolved against the
 * installation anchors instead — see `services/dsh-package.js`.
 */
function createPluginMarketService(Remote, TypertRemoteService) {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _search_decorators;
    let _detail_decorators;
    let _categories_decorators;
    let _trending_decorators;
    let _recent_decorators;
    let _status_decorators;
    let _sync_decorators;
    let _installPlugin_decorators;
    let _uninstall_decorators;
    let _update_decorators;
    let _installed_decorators;
    let _statusOf_decorators;
    return class PluginMarketService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _search_decorators = [Remote('search')];
            _detail_decorators = [Remote('detail')];
            _categories_decorators = [Remote('categories')];
            _trending_decorators = [Remote('trending')];
            _recent_decorators = [Remote('recent')];
            _status_decorators = [Remote('status')];
            _sync_decorators = [Remote('sync')];
            _installPlugin_decorators = [Remote('installPlugin')];
            _uninstall_decorators = [Remote('uninstall')];
            _update_decorators = [Remote('update')];
            _installed_decorators = [Remote('installed')];
            _statusOf_decorators = [Remote('statusOf')];
            __esDecorate(this, null, _search_decorators, { kind: "method", name: "search", static: false, private: false, access: { has: obj => "search" in obj, get: obj => obj.search }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _detail_decorators, { kind: "method", name: "detail", static: false, private: false, access: { has: obj => "detail" in obj, get: obj => obj.detail }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _categories_decorators, { kind: "method", name: "categories", static: false, private: false, access: { has: obj => "categories" in obj, get: obj => obj.categories }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _trending_decorators, { kind: "method", name: "trending", static: false, private: false, access: { has: obj => "trending" in obj, get: obj => obj.trending }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _recent_decorators, { kind: "method", name: "recent", static: false, private: false, access: { has: obj => "recent" in obj, get: obj => obj.recent }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sync_decorators, { kind: "method", name: "sync", static: false, private: false, access: { has: obj => "sync" in obj, get: obj => obj.sync }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _installPlugin_decorators, { kind: "method", name: "installPlugin", static: false, private: false, access: { has: obj => "installPlugin" in obj, get: obj => obj.installPlugin }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _uninstall_decorators, { kind: "method", name: "uninstall", static: false, private: false, access: { has: obj => "uninstall" in obj, get: obj => obj.uninstall }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _installed_decorators, { kind: "method", name: "installed", static: false, private: false, access: { has: obj => "installed" in obj, get: obj => obj.installed }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _statusOf_decorators, { kind: "method", name: "statusOf", static: false, private: false, access: { has: obj => "statusOf" in obj, get: obj => obj.statusOf }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['tools'];
        indexing = __runInitializers(this, _instanceExtraInitializers);
        installer;
        config;
        constructor(ctx, config, indexing, installer) {
            super(ctx, 'pluginMarket');
            this.config = config;
            this.indexing = indexing;
            this.installer = installer;
        }
        /** Drop `undefined` / non-JSON values so Gateway SRC `assertJsonValue` accepts the result. */
        toWire(value) {
            return JSON.parse(JSON.stringify(value));
        }
        /** Project one cached Plugin into its wire-safe list shape. */
        toListItem(p) {
            return {
                id: p.id,
                source: p.source,
                name: p.name,
                description: p.description || '',
                category: p.category || 'other',
                author: p.author || '',
                url: p.url || '',
                stars: Number(p.stars) || 0,
                downloads: Number(p.downloads) || 0,
                version: p.version || '',
                license: p.license || '',
                permissionLevel: p.permissionLevel || 'unknown',
                isInstalled: !!p.isInstalled,
            };
        }
        /** Wire-safe snapshot of the current cache status. */
        statusSnapshot() {
            return this.indexing.getCacheStatus().then((s) => ({
                totalPlugins: s.totalPlugins,
                lastSyncAt: s.lastSyncAt ?? null,
                isStale: s.isStale,
                sourceStats: {
                    github: {
                        count: s.sourceStats?.github?.count ?? 0,
                        lastSync: s.sourceStats?.github?.lastSync ?? null,
                    },
                    npm: {
                        count: s.sourceStats?.npm?.count ?? 0,
                        lastSync: s.sourceStats?.npm?.lastSync ?? null,
                    },
                },
            }));
        }
        // ---------- indexing ----------
        async search(request) {
            // SRC gateway parses Function.toString(); no default params / destructuring.
            const req = request || {};
            const sortBy = (req.sortBy === 'stars' || req.sortBy === 'updated' ||
                req.sortBy === 'name' || req.sortBy === 'downloads') ? req.sortBy : 'stars';
            const result = await this.indexing.search(req.query || '', {
                category: req.category,
                sortBy,
                sortOrder: req.sortOrder,
                page: req.page,
                pageSize: req.pageSize || 50,
                installedOnly: req.installedOnly,
                riskLevel: req.riskLevel,
                source: req.source,
            });
            return this.toWire({
                plugins: result.plugins.map((p) => this.toListItem(p)),
                total: result.total,
            });
        }
        async detail(request) {
            const d = await this.indexing.getDetail(request.pluginId);
            if (!d)
                return null;
            return this.toWire({
                ...this.toListItem(d),
                readme: (d.readme || '').slice(0, 12000),
                homepage: d.homepage,
                repository: d.repository,
            });
        }
        async categories() {
            return this.toWire(await this.indexing.getCategories());
        }
        async trending(request) {
            const items = await this.indexing.getTrending((request && request.limit) || 20);
            return this.toWire(items.map((p) => this.toListItem(p)));
        }
        async recent(request) {
            const items = await this.indexing.getRecent((request && request.limit) || 20);
            return this.toWire(items.map((p) => this.toListItem(p)));
        }
        async status() {
            return this.toWire(await this.statusSnapshot());
        }
        async sync() {
            const result = await this.indexing.syncAll();
            return this.toWire({
                success: result.success,
                totalPlugins: result.totalPlugins,
                newPlugins: result.newPlugins,
                updatedPlugins: result.updatedPlugins,
                failedSources: result.failedSources,
                durationMs: result.durationMs,
                error: result.error ?? null,
            });
        }
        // ---------- installer ----------
        // Wire name cannot be `install`: Client RemoteNamespaceService already has install().
        async installPlugin(request) {
            const result = await this.installer.install(request.pluginId, {
                profile: request.profile,
                confirm: request.confirm,
            });
            return this.toWire(result);
        }
        async uninstall(request) {
            const result = await this.installer.uninstall(request.pluginId, { profile: request.profile });
            return this.toWire(result);
        }
        async update(request) {
            const result = await this.installer.update(request.pluginId, { profile: request.profile });
            return this.toWire(result);
        }
        async installed() {
            return this.toWire(await this.installer.getInstalled());
        }
        async statusOf(request) {
            return this.installer.getStatus(request.pluginId);
        }
    };
}
/**
 * Resolve the installation's typert runtime and build the service class.
 * `apply()` awaits this so the class extends the module instance the running
 * Harness itself uses.
 */
async function loadPluginMarketService() {
    const protocol = await loadDshPackage(TYPERT_PACKAGE);
    return createPluginMarketService(protocol.Remote, protocol.TypertRemoteService);
}
export { loadPluginMarketService };
//# sourceMappingURL=remote.js.map