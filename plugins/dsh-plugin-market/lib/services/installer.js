// ============================================================
// DSH Plugin Market - Installer Service
// ============================================================
// Installed state is read from the profile manifest, never guessed from a
// module name. `profile-state.js` documents the two user-visible bugs that
// name matching produced (same-name false positives, and a just-installed
// plugin losing its flag — and therefore its uninstall button).
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DshCliClient } from '../utils/dsh-cli.js';
import { catalogIdFromSpec, deriveInstalledIds, summarizeInstalled } from './profile-state.js';

/** `<DSH_HOME>` as the Harness itself resolves it. */
function dshHome() {
    const value = process.env.DSH_HOME;
    return typeof value === 'string' && value.trim() !== '' ? value : path.join(os.homedir(), '.dsh');
}

function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}

export class InstallerService {
    cache;
    dshClient;
    defaultProfile;
    confirmBeforeInstall;
    loader;
    installingPlugins = new Map();
    autoDetectPromise = null;
    /** Last profile-manifest read failure, surfaced by the installed tab. */
    profileError = null;
    constructor(cache, dshCommand, defaultProfile = 'web', confirmBeforeInstall = true) {
        this.cache = cache;
        this.dshClient = new DshCliClient(dshCommand);
        this.defaultProfile = defaultProfile;
        this.confirmBeforeInstall = confirmBeforeInstall;
    }
    bindLoader(loader) {
        this.loader = loader;
    }
    /**
     * Loader entry names.
     *
     * Display only: a loader name carries no source, so it cannot tell
     * `github:owner/repo` from a local `file:` copy of the same package. Using
     * it as an identity is what marked unrelated same-named rows installed.
     */
    collectInstalledNames() {
        const names = [];
        try {
            if (this.loader && typeof this.loader.entries === 'function') {
                for (const entry of this.loader.entries()) {
                    const n = entry?.options?.name;
                    if (n)
                        names.push(String(n));
                }
            }
        }
        catch {
            /* ignore */
        }
        return names;
    }
    profileDir(profile) {
        return path.join(dshHome(), 'profiles', profile ?? this.defaultProfile);
    }
    /**
     * Read `<DSH_HOME>/profiles/<profile>/package.json`.
     *
     * The dependency map is the authority on WHAT is installed and FROM WHERE.
     * A read failure returns `error` with no dependencies, and every caller must
     * then leave the cached flags untouched — clearing them would turn "cannot
     * read the profile" into "nothing is installed", which is the more damaging
     * of the two wrong answers.
     */
    readProfileManifest(profile) {
        const dir = this.profileDir(profile);
        const file = path.join(dir, 'package.json');
        try {
            if (!existsSync(file))
                return { dir, file, dependencies: {}, bundles: [], error: `no profile manifest at ${file}` };
            const parsed = JSON.parse(readFileSync(file, 'utf8'));
            const dependencies = parsed?.dependencies && typeof parsed.dependencies === 'object' && !Array.isArray(parsed.dependencies)
                ? { ...parsed.dependencies }
                : {};
            const bundles = Array.isArray(parsed?.dsh?.profile?.bundles)
                ? parsed.dsh.profile.bundles.map((entry) => String(entry))
                : [];
            return { dir, file, dependencies, bundles, error: null };
        }
        catch (error) {
            return { dir, file, dependencies: {}, bundles: [], error: `could not read ${file}: ${errorText(error)}` };
        }
    }
    /** Versions of the installed dependencies, read from the profile they live in. */
    readInstalledVersions(profileDir, names) {
        const versions = {};
        for (const name of names) {
            try {
                const file = path.join(profileDir, 'node_modules', ...String(name).split('/'), 'package.json');
                const parsed = JSON.parse(readFileSync(file, 'utf8'));
                if (typeof parsed?.version === 'string')
                    versions[name] = parsed.version;
            }
            catch {
                /* a link without a readable manifest simply has no version */
            }
        }
        return versions;
    }
    /**
     * Re-derive every installed flag from the profile manifest.
     *
     * `dsh plugin add` writes the dependency before it returns, so this is
     * already correct for a plugin the running Harness has not loaded yet —
     * which the old loader-based pass could not see, and why a freshly installed
     * plugin used to lose the flag that had just been set.
     */
    async refreshInstalledFlags(profile) {
        const target = profile ?? this.defaultProfile;
        const manifest = this.readProfileManifest(target);
        if (manifest.error !== null) {
            this.profileError = manifest.error;
            return { updated: false, profile: target, installed: 0, error: manifest.error };
        }
        this.profileError = null;
        const installed = deriveInstalledIds(this.cache.listIdentities(), manifest.dependencies);
        this.cache.applyInstalledIds(installed);
        return { updated: true, profile: target, installed: installed.length, error: null };
    }
    /**
     * 自动检测 dsh 命令（全局 dsh 或 npx）
     * 如果用户已显式指定 dshCommand，则跳过检测
     */
    async ensureDshAvailable() {
        // 如果已经指定了命令，直接检查可用性
        if (this.dshClient['dshCommand'] !== 'dsh' || this.dshClient['useNpx']) {
            return this.dshClient.isAvailable();
        }
        // 否则执行自动检测（只检测一次）
        if (!this.autoDetectPromise) {
            this.autoDetectPromise = this.dshClient.autoDetect();
        }
        return this.autoDetectPromise;
    }
    /**
     * 安装插件
     */
    async install(pluginId, options) {
        const profile = options?.profile || this.defaultProfile;
        if (this.confirmBeforeInstall && !options?.confirm) {
            return {
                success: false,
                pluginId,
                needsConfirm: true,
                error: 'Confirmation required',
                durationMs: 0,
            };
        }
        // 确保 dsh 命令可用
        const dshAvailable = await this.ensureDshAvailable();
        if (!dshAvailable) {
            return {
                success: false,
                pluginId,
                error: 'dsh 命令不可用，请检查 DSH 是否已安装。如果使用 npx，请在配置中设置 install.dshCommand: "npx @deepseek-ai/dsh"',
                durationMs: 0,
            };
        }
        // 防重复安装
        if (this.installingPlugins.has(pluginId)) {
            return this.installingPlugins.get(pluginId);
        }
        const plugin = this.cache.getPlugin(pluginId);
        if (!plugin) {
            return {
                success: false,
                pluginId,
                error: 'Plugin not found in cache',
                durationMs: 0,
            };
        }
        // 从插件信息中提取安装命令
        const installSpec = this.extractInstallSpec(plugin);
        if (!installSpec) {
            return {
                success: false,
                pluginId,
                error: 'Could not determine install spec',
                durationMs: 0,
            };
        }
        const logId = this.cache.addInstallLog({
            pluginId,
            action: 'install',
            version: plugin.version,
            status: 'pending',
            createdAt: new Date().toISOString(),
        });
        const installPromise = (async () => {
            try {
                this.cache.updateInstallLog(logId, 'pending');
                const result = await this.dshClient.install(installSpec, profile);
                if (result.success) {
                    this.cache.setInstalled(pluginId, true, plugin.version);
                    this.cache.updateInstallLog(logId, 'success');
                    await this.refreshInstalledFlags(profile);
                }
                else {
                    this.cache.updateInstallLog(logId, 'failed', result.error);
                }
                return {
                    ...result,
                    pluginId,
                };
            }
            catch (error) {
                const errorMsg = errorText(error);
                this.cache.updateInstallLog(logId, 'failed', errorMsg);
                return {
                    success: false,
                    pluginId,
                    error: errorMsg,
                    durationMs: 0,
                };
            }
            finally {
                this.installingPlugins.delete(pluginId);
            }
        })();
        this.installingPlugins.set(pluginId, installPromise);
        return installPromise;
    }
    /**
     * Resolve what `dsh plugin remove` should receive.
     *
     * Accepts the package name the profile records, or a catalog id
     * (`github:owner/repo`, `npm:name`). A catalog id is matched through the
     * SPEC of each dependency, so `github:dsh-market/dsh-market` never resolves
     * to a local `file:` copy of the same name — that would uninstall the wrong
     * plugin. The catalog row's own `name` cannot be used either: for a GitHub
     * package it is the repository name (`DeepSeek-Balance-Whale-Widget`), not
     * the dependency key (`dsh-whale-widget`).
     */
    resolveUninstallTarget(identifier, profile) {
        const value = String(identifier ?? '').trim();
        if (value === '')
            return { error: 'pluginId is required' };
        const manifest = this.readProfileManifest(profile);
        if (manifest.error !== null)
            return { error: manifest.error };
        if (manifest.dependencies[value] !== undefined) {
            return { name: value, catalogId: catalogIdFromSpec(manifest.dependencies[value]) };
        }
        const wanted = catalogIdFromSpec(value) ?? (/^(github|npm):/i.test(value) ? value : null);
        if (wanted !== null) {
            for (const [name, spec] of Object.entries(manifest.dependencies)) {
                const id = catalogIdFromSpec(spec);
                if (id !== null && id.toLowerCase() === wanted.toLowerCase())
                    return { name, catalogId: id };
            }
        }
        return { error: `${value} is not installed in profile "${profile}"` };
    }
    /**
     * 卸载插件
     */
    async uninstall(identifier, options) {
        const profile = options?.profile || this.defaultProfile;
        const startTime = Date.now();
        const requestId = String(identifier ?? '');
        // 确保 dsh 命令可用
        const dshAvailable = await this.ensureDshAvailable();
        if (!dshAvailable) {
            return {
                success: false,
                pluginId: requestId,
                error: 'dsh 命令不可用',
                durationMs: 0,
            };
        }
        const target = this.resolveUninstallTarget(identifier, profile);
        if (target.error !== undefined) {
            return {
                success: false,
                pluginId: requestId,
                error: target.error,
                durationMs: Date.now() - startTime,
            };
        }
        const known = target.catalogId === null || target.catalogId === undefined
            ? undefined
            : this.cache.getPlugin(target.catalogId);
        const logId = this.cache.addInstallLog({
            pluginId: target.catalogId ?? target.name,
            action: 'uninstall',
            version: known?.installedVersion,
            status: 'pending',
            createdAt: new Date().toISOString(),
        });
        try {
            const result = await this.dshClient.uninstall(target.name, profile);
            if (result.success) {
                if (target.catalogId)
                    this.cache.setInstalled(target.catalogId, false);
                this.cache.updateInstallLog(logId, 'success');
                await this.refreshInstalledFlags(profile);
            }
            else {
                this.cache.updateInstallLog(logId, 'failed', result.error);
            }
            return {
                ...result,
                pluginId: target.name,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMsg = errorText(error);
            this.cache.updateInstallLog(logId, 'failed', errorMsg);
            return {
                success: false,
                pluginId: target.name,
                error: errorMsg,
                durationMs: Date.now() - startTime,
            };
        }
    }
    /**
     * 更新插件
     */
    async update(pluginId, options) {
        const profile = options?.profile || this.defaultProfile;
        const startTime = Date.now();
        // 确保 dsh 命令可用
        const dshAvailable = await this.ensureDshAvailable();
        if (!dshAvailable) {
            return {
                success: false,
                pluginId,
                error: 'dsh 命令不可用',
                durationMs: 0,
            };
        }
        const plugin = this.cache.getPlugin(pluginId);
        if (!plugin) {
            return {
                success: false,
                pluginId,
                error: 'Plugin not found in cache',
                durationMs: 0,
            };
        }
        const fromVersion = plugin.installedVersion;
        const installSpec = this.extractInstallSpec(plugin);
        if (!installSpec) {
            return {
                success: false,
                pluginId,
                error: 'Could not determine install spec',
                durationMs: 0,
            };
        }
        try {
            // 先卸载旧版本再安装新版本
            await this.dshClient.uninstall(plugin.name, profile);
            const result = await this.dshClient.install(installSpec, profile);
            if (result.success) {
                this.cache.setInstalled(pluginId, true, plugin.version);
                await this.refreshInstalledFlags(profile);
            }
            return {
                success: result.success,
                pluginId,
                fromVersion,
                toVersion: result.success ? plugin.version : undefined,
                error: result.error,
                durationMs: Date.now() - startTime,
            };
        }
        catch (error) {
            return {
                success: false,
                pluginId,
                fromVersion,
                error: errorText(error),
                durationMs: Date.now() - startTime,
            };
        }
    }
    /**
     * 获取已安装插件列表（以 profile manifest 为准）
     */
    async getInstalled(options) {
        const target = options?.profile || this.defaultProfile;
        const manifest = this.readProfileManifest(target);
        if (manifest.error !== null) {
            this.profileError = manifest.error;
            return {
                profile: target,
                profileDir: manifest.dir,
                profileFile: manifest.file,
                error: manifest.error,
                plugins: [],
            };
        }
        this.profileError = null;
        const names = Object.keys(manifest.dependencies);
        const plugins = summarizeInstalled(manifest.dependencies, this.cache.listIdentities(), {
            bundles: manifest.bundles,
            loaderNames: this.collectInstalledNames(),
            versions: this.readInstalledVersions(manifest.dir, names),
        });
        return {
            profile: target,
            profileDir: manifest.dir,
            profileFile: manifest.file,
            error: null,
            plugins,
        };
    }
    /**
     * 检查插件是否已安装
     */
    async isInstalled(pluginId) {
        const plugin = this.cache.getPlugin(pluginId);
        if (!plugin)
            return false;
        await this.refreshInstalledFlags();
        return this.cache.getPlugin(pluginId)?.isInstalled === true;
    }
    /**
     * 获取安装状态
     */
    async getStatus(pluginId) {
        if (this.installingPlugins.has(pluginId)) {
            return 'installing';
        }
        const plugin = this.cache.getPlugin(pluginId);
        if (!plugin)
            return 'not_installed';
        await this.refreshInstalledFlags();
        return this.cache.getPlugin(pluginId)?.isInstalled ? 'installed' : 'not_installed';
    }
    /**
     * 检查 dsh CLI 是否可用（会触发自动检测）
     */
    async isDshAvailable() {
        return this.ensureDshAvailable();
    }
    /**
     * 从插件对象中提取安装标识
     */
    extractInstallSpec(plugin) {
        if (plugin.source === 'github') {
            // github:owner/repo 格式
            const fullName = plugin.id.slice('github:'.length);
            return `github:${fullName}`;
        }
        if (plugin.source === 'npm') {
            // npm 包名
            const pkgName = plugin.id.slice('npm:'.length);
            return `${pkgName}@${plugin.version || 'latest'}`;
        }
        return null;
    }
}
