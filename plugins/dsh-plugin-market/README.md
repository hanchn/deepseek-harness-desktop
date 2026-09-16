# DSH 插件市场

> **本目录是 vendor 的 fork**（上游 [chnjames/dsh-plugin-market](https://github.com/chnjames/dsh-plugin-market) 0.3.0，MIT，2026-09-16 从本机 npm 安装产物 `lib/` 纳入）。本 fork 修掉了「安装状态永远不对、因此没有卸载入口」的问题，并补了一个「已安装」Tab 与 `plugin_market_uninstall` 工具。
>
> | 改动 | 为什么 |
> |---|---|
> | 已安装判定改以 **profile 的 `package.json`** 为准，并按来源身份（`github:owner/repo` / `npm:name` / `file:`）精确匹配（`lib/services/profile-state.js`） | 旧实现拿 loader 的**裸名字**去撞目录行：本地 `file:` 插件 `dsh-market` 会把 `github:dsh-market/dsh-market`、`github:2BingLing/dsh-market` 一起标成已安装（`dsh-web` 也靠后缀撞上一次）；而装完立刻用 loader 重算，又把刚装上的插件抹成未安装——前端只在 `isInstalled` 时渲染「卸载」，于是既没有状态也没有卸载按钮 |
> | 前端新增「已安装」Tab（含卸载确认、来源、版本、启用状态） | 市场列表只能装，装上以后没地方看/卸 |
> | 新增 `plugin_market_uninstall` 工具 | 原来只有 install 工具，没有卸载能力 |
> | `@deepseek-ai/dsh-typert-protocol` 改按安装锚点解析（`lib/services/dsh-package.js`） | profile 用 `file:` 装本目录时会建符号链接，Node 按**真实路径**解析，父级查找走不到 `<DSH_HOME>/profiles/node_modules`，基类 import 会直接失败 |
> | 随包带 `node_modules/sql.js` | 同上：符号链接后 `import 'sql.js'` 也解析不到；`sql.js` 是运行期唯一依赖，按 `package.json` 的 `^1.10.3` 固定为 1.14.2 |
>
> 只纳入上游**构建产物** `lib/`（无 `src/`、无 `tsconfig`），因此 `package.json` 去掉了 `build`/`prepare` 脚本与 devDependencies——否则 `file:` 安装会尝试跑不存在的 `tsc`。上游脚本与源码不在本仓库内，升级需重新对照上游 diff。
>
> 在本仓库改完 `lib/` 后，profile 里的符号链接会立刻看到改动（`plugins/dsh-plugin-market` 被 `file:` 链接到 profile），**重启 Harness + 强刷页面**即可生效；若 profile 侧曾被 pnpm 物化成真实目录拷贝（hoisted linker 的行为），重装一次让它回到符号链接：
>
> ```bash
> cd "<DSH_HOME>/profiles/web"
> rm -rf node_modules/dsh-plugin-market
> ln -s "<repo>/plugins/dsh-plugin-market" node_modules/dsh-plugin-market
> ```
>
> 回归测试在仓库侧：`node --test scripts/lib/plugin-market-*.test.ts`。

在 DeepSeek Harness「设置 → 插件」里发现、确认并安装社区插件；另有公开目录站供浏览与复制安装命令。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Website](https://img.shields.io/badge/Website-dsh--plugin--market.vercel.app-4F46E5)](https://dsh-plugin-market.vercel.app)
[![CI](https://github.com/chnjames/dsh-plugin-market/actions/workflows/ci.yml/badge.svg)](https://github.com/chnjames/dsh-plugin-market/actions/workflows/ci.yml)

![设置 → 插件 → 插件市场](website/public/images/settings-market.png)

公开浏览：[https://dsh-plugin-market.vercel.app](https://dsh-plugin-market.vercel.app)

## 功能

- 设置内「插件市场」Tab：搜索、分类、展开说明、确认后安装 / 卸载；同页「已安装」Tab 直接列出 profile 里真正装了什么
- 安装走官方 `dsh plugin add/remove`，不执行第三方安装脚本
- 公开目录站：浏览、⌘K 搜索、中英 / 亮暗主题、复制安装命令
- 对话 Agent 工具：搜索、详情、安装、卸载、列出已装插件


## 安装

```bash
dsh plugin --profile web add github:chnjames/dsh-plugin-market
# 或
npx @deepseek-ai/dsh plugin --profile web add github:chnjames/dsh-plugin-market
```

安装后**重启** `dsh web`，打开 **设置 → 插件 → 插件市场**。

> Web profile 通常关闭配置热重载；改完插件后请重启再强刷页面。

## 使用

设置内卡片：

1. 标题行：名称 · 星标 · 展开  
2. 简介（最多两行）  
3. 底栏：已安装 / 作者 / 提示 · **查看仓库** · **安装**（安装前确认）

卸载本市场插件：

```bash
dsh plugin --profile web remove dsh-plugin-market
```

## 公开目录站

线上目录：[https://dsh-plugin-market.vercel.app](https://dsh-plugin-market.vercel.app)

- 首页：安装命令终端、热门 / 分类 / 最近更新  
- 分类页：排序、分页（`?sort=` / `?page=`）  
- 详情页：复制 `dsh plugin add`、README 摘要  
- 顶栏：⌘K / Ctrl+K、中英、亮暗主题  

本站**只浏览与复制命令**；真正安装在本机 DSH 设置里完成。  
本地开发与 Vercel 部署见 [`website/README.md`](website/README.md)；设计约束见 [`website/design.md`](website/design.md)。

## 配置

常用项（写入 `cordis.patch.yml` 中本插件的 `config`）：

| 键 | 说明 |
|---|---|
| `install.dshCommand` | npx 用户设为 `"npx @deepseek-ai/dsh"` |
| `catalog.urls` | 自定义 `registry.json` 地址（自建域名时） |
| `catalog.fallbackToSearch` | 目录全失败时是否回退本机 GitHub / npm 搜索 |
| `ui.showRiskLevel` | 是否显示外观类 / 高权限等启发式提示 |

完整默认块见 [`cordis.yml`](cordis.yml)。

<details>
<summary>完整配置示例</summary>

```yaml
- insert:
    - id: plugin-market
      name: dsh-plugin-market
      config:
        catalog:
          fallbackToSearch: true
          # urls: ["https://your-domain/registry.json"]
        sources:
          github:
            enabled: true
            topic: "dsh-plugin"
          npm:
            enabled: true
            keyword: "dsh-plugin"
        cache:
          ttl: 21600
          autoRefresh: true
          refreshInterval: 21600
        ui:
          showRiskLevel: true
        install:
          defaultProfile: "web"
          confirmBeforeInstall: true
          # dshCommand: "npx @deepseek-ai/dsh"
```

</details>

## Agent 工具

需插件已加载：

| 工具 | 用途 |
|---|---|
| `plugin_market_search` | 按关键词搜索目录 |
| `plugin_market_detail` | 查看单条插件详情 |
| `plugin_market_install` | 经官方 CLI 安装（带确认策略） |
| `plugin_market_list_installed` | 列出本机已装插件 |

## 安全

- 目录只含公开元数据，不上传用户信息；**目录不构成推荐**
- 安装走官方 `dsh plugin add/remove`，确认后才调用；不执行第三方安装脚本
- 设置 Tab 用 React 文本节点渲染摘要，不 `dangerouslySetInnerHTML`
- `permissionLevel` 是文案启发式，默认「未评估」，**不是**权限审计；只安装你信任的来源

<details>
<summary>故障排除</summary>

| 现象 | 处理 |
|---|---|
| 设置里没有「插件市场」Tab | 确认 `package.json` 的 `dsh.client.immediately`；重启 DSH；检查 `lib/client.js` 是否已构建 |
| 列表为空 | 等同步；或 `npm run build:registry` 后提交 `website/public/registry.json`；检查 `catalog.urls` |
| 安装失败（Windows） | 确认调用的是 `dsh.cmd` / `npx.cmd`；npx 用户设 `install.dshCommand` |
| 日志仍出现 `Web UI running at :3789` | 旧 profile 残留 `ui.webPort`：从 `cordis.patch.yml` 删掉并重启（本机已不再提供独立 HTTP 面板） |

**手动挂载**：若 `dsh plugin add` 未自动写入 patch，把仓库里的 [`cordis.yml`](cordis.yml) 追加到 `<DSH_HOME>/profiles/web/cordis.patch.yml`。

**本地 `file:` 挂载**（路径按本机调整）：

```bash
dsh plugin --profile web add file:C:/path/to/dsh-plugin-market
```

本地目录缓存：`<DSH_HOME>/plugin-market.db`（删除后下次启动会重新拉目录）。

</details>

<details>
<summary>架构</summary>

```
GitHub Actions ──► registry.json ──► Vercel 网站（浏览 / CORS）
                         └──► DSH host（sql.js 缓存 + Typert Remote）
                                    └──► 设置 → 插件 → 插件市场（本机安装）
```

| 层 | 说明 |
|---|---|
| Host | `PluginMarketService`（服务名 `pluginMarket`）；安装 Remote 方法为 **`installPlugin`**（不能叫 `install`） |
| Client | 设置 Tab（`settings.plugins.tab`）；经嵌套 inject 调用 `remote.pluginMarket` |
| 分类 / 风险 | `src/utils/classifier.ts` 与 `shared/classifier.mjs` 须保持同步 |
| README 摘要 | Host 截断下发；UI 再摘成可读段落（设置 Tab **不做**完整 Markdown 渲染） |

本机拉取目录顺序：Vercel → jsDelivr → GitHub raw → 包内 `lib/registry.snapshot.json` →（可选）本机搜索。

</details>

## 开发

```bash
npm install
npm run build          # tsc + 复制 client + registry snapshot
npm run typecheck
npm run build:registry # 生成 website/public/registry.json

cd website && npm install && npm run dev   # http://localhost:3000
```

CI：`.github/workflows/ci.yml`（构建）、`registry.yml`（定时刷新目录）。

<details>
<summary>自测清单</summary>

重启 DSH 后：

- [ ] 设置 → 插件 出现「插件市场」Tab（在「插件配置」「插件列表」之后）
- [ ] 列表来自 catalog（Network 可见 `registry.json`，而非 GitHub Search）
- [ ] 搜索、分类可用；展开说明为摘要段落，完整 README 链到仓库
- [ ] 多数卡片无风险标签；主题类可显示「外观类」；明确高权限关键词才显示「高权限提示」
- [ ] 安装 / 卸载先确认，确认后 `dsh plugin list` 可见变化
- [ ] 「同步目录」会重新拉 registry；日志无 `:3789`
- [ ] 公开站 `cd website && npm run build` 成功；复制命令与 `/registry.json` CORS 正常
- [ ] Agent：搜索 / 列出已装插件工具可走通

</details>

<details>
<summary>已知限制</summary>

- 无单元测试；Client 与 Host 的 README 摘要实现可能漂移
- 约四成插件仍落在分类 `other`（关键词启发式）
- 无版本更新检测（需卸了再装）
- 本机缓存需「同步目录」或重启后才吃到新风险分数

</details>

## 文档

| 文档 | 内容 |
|---|---|
| [website/README.md](website/README.md) | 公开站本地开发与 Vercel |
| [website/design.md](website/design.md) | 公开站设计系统 |
| [cordis.yml](cordis.yml) | 插件默认配置 |

## 许可证

MIT
