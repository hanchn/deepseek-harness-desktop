import type { PluginMarketConfig } from './types.js';
/** Cordis plugin name used by loader diagnostics. */
declare const name = "plugin-market";
/** Services required by this plugin. */
declare const inject: string[];
/**
 * DSH 插件市场插件入口（适配 DSH 运行时）
 *
 * 提供：
 * - 共享目录拉取与本地缓存（sql.js）
 * - Typert Remote（设置 → 插件 → 插件市场 Tab）
 * - 官方 CLI 安装 / 卸载
 * - Agent 工具（plugin_market_*）
 *
 * 公开浏览面是 Vercel 上的 website/，本机不启独立 HTTP 面板。
 */
declare function apply(ctx: any, config: Partial<PluginMarketConfig>): Promise<void>;
export { apply, inject, name };
//# sourceMappingURL=index.d.ts.map