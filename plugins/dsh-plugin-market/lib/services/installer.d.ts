import type { InstallResult, UninstallResult, UpdateResult, InstallStatus, InstallOptions, IInstallerService } from '../types.js';

/**
 * The slice of the cache the installer actually uses.
 *
 * Typed structurally so the installed-state logic can be exercised against a
 * stub — no sql.js, no database file, no Harness.
 */
export interface PluginCacheLike {
  getPlugin(pluginId: string): {
    id?: string;
    name?: string;
    installedVersion?: string;
    isInstalled?: boolean;
  } | null;
  listIdentities(): {
    id: string;
    name?: string;
    source?: string;
  }[];
  applyInstalledIds(ids: string[]): number;
  setInstalled(pluginId: string, installed: boolean, version?: string): void;
  addInstallLog(entry: unknown): number;
  updateInstallLog(id: number, status: string, errorMessage?: string): void;
}

export interface ProfileManifest {
  dir: string;
  file: string;
  dependencies: Record<string, string>;
  bundles: string[];
  error: string | null;
}

export interface InstalledSnapshot {
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
}

export interface UninstallTarget {
  name?: string;
  catalogId?: string | null;
  error?: string;
}

export declare class InstallerService implements IInstallerService {
    private cache;
    private dshClient;
    private defaultProfile;
    private confirmBeforeInstall;
    private loader?;
    private installingPlugins;
    private autoDetectPromise;
    /** Last profile-manifest read failure, surfaced by the installed tab. */
    profileError: string | null;
    constructor(cache: PluginCacheLike, dshCommand?: string, defaultProfile?: string, confirmBeforeInstall?: boolean);
    bindLoader(loader: {
        entries?: () => Iterable<{
            options?: {
                name?: string;
            };
        }>;
    }): void;
    collectInstalledNames(): string[];
    profileDir(profile?: string): string;
    readProfileManifest(profile?: string): ProfileManifest;
    readInstalledVersions(profileDir: string, names: string[]): Record<string, string>;
    refreshInstalledFlags(profile?: string): Promise<{
        updated: boolean;
        profile: string;
        installed: number;
        error: string | null;
    }>;
    /**
     * 自动检测 dsh 命令（全局 dsh 或 npx）
     * 如果用户已显式指定 dshCommand，则跳过检测
     */
    ensureDshAvailable(): Promise<boolean>;
    /**
     * 安装插件
     */
    install(pluginId: string, options?: InstallOptions): Promise<InstallResult>;
    /**
     * 解析卸载目标：包名或目录 ID
     */
    resolveUninstallTarget(identifier: string, profile: string): UninstallTarget;
    /**
     * 卸载插件
     */
    uninstall(identifier: string, options?: {
        profile?: string;
    }): Promise<UninstallResult>;
    /**
     * 更新插件
     */
    update(pluginId: string, options?: {
        profile?: string;
    }): Promise<UpdateResult>;
    /**
     * 获取已安装插件列表（以 profile manifest 为准）
     */
    getInstalled(options?: {
        profile?: string;
    }): Promise<InstalledSnapshot>;
    /**
     * 检查插件是否已安装
     */
    isInstalled(pluginId: string): Promise<boolean>;
    /**
     * 获取安装状态
     */
    getStatus(pluginId: string): Promise<InstallStatus>;
    /**
     * 检查 dsh CLI 是否可用（会触发自动检测）
     */
    isDshAvailable(): Promise<boolean>;
    /**
     * 从插件对象中提取安装标识
     */
    private extractInstallSpec;
}
