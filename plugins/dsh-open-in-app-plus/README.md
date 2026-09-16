# dsh-open-in-app-plus

给 DSH Web UI 的会话头部**一个合并的"打开方式"控件**：上游自带的
Finder / Cursor / VS Code / Zed… 目录，和 Trae / Qoder / Codex 桌面版等自定义
条目，**共用一个分体按钮 + 一个菜单**，不再并排两个下拉。

上游不带自定义目录的能力，而且是官方明确延后的：

> **The catalog is fixed at build time.** A deployment cannot add its own editor
> or Git GUI from cordis.yml ... Configurable custom handlers remain deferred.
>
> — `@deepseek-ai/dsh-host-open-in-app` README, *Known Limitations*

所以本插件自带一套 host 路由供自定义条目使用，并通过**复用上游的 cell id**
把两者合成一个控件。

## 装了什么

| 半身 | 文件 | 内容 |
|---|---|---|
| host | `lib/index.js` | `GET /open-in-app-plus/apps`（自定义目录）、`POST /open-in-app-plus/open`（按 id 启动） |
| client | `lib/client.js` | 接管 `conversation.session.header.utilities` 的 `open-in-app` cell，渲染合并后的分体按钮 |

## 合并是怎么做到的

会话头部的 `conversation.session.header.utilities` 是一个 **list slot**，其契约
写明：

> 用你自己的 id：新条目会**加在**已发布条目旁边；**复用已发布的 id 则进入那个
> cell 并替换它**。
>
> — `@deepseek-ai/dsh-cordis-client-runner` slot 契约

上游 `dsh-client-ui-open-in-app` 用 id `open-in-app`、order `-10` 占用该 cell。
本插件用**同一个 id 和 order** 注册，于是替换掉它的占位，而不是并排再加一个：

- 菜单上半部分：上游目录（`GET /open-in-app/apps` 的 id，图标走
  `/open-in-app/icon/<id>`，名称用本插件内的产品名表；未知 id 回退显示原 id）；
- 菜单下半部分：本插件的自定义条目（`GET /open-in-app-plus/apps`）；
- 启动各走各的路由：上游条目 → `POST /open-in-app/open`，自定义条目 →
  `POST /open-in-app-plus/open`；
- 记住的选择带命名空间前缀（`ship:` / `plus:`），因为两个目录的 id 空间独立。

加载顺序保证了替换方向：本插件在 profile 的 `dsh.profile.bundles` 里排在
`@deepseek-ai/dsh-web-app` 之后，因此**后注册**、赢得该 cell。若哪天顺序被改，
症状是头部只剩上游按钮、自定义条目消失——把本插件排到 web-app 之后即可。

## 预设（装了才出现）

| id | 启动方式 |
|---|---|
| `trae` | `open -a Trae <工作区>` |
| `qoder` | `open -a Qoder <工作区>` |
| `qoderwork` | `open -a "QoderWork CN" <工作区>` |
| `codex` | `open -a ChatGPT <工作区>` |

> `codex` 指向 **ChatGPT.app**：本机没有独立的 `Codex.app`，Codex 桌面能力由
> ChatGPT 桌面版承载。若你装了别的 Codex 壳，用下面的自定义条目覆盖它即可。

## 自定义

编辑 `$DSH_HOME/open-in-app.json`（macOS 桌面版为
`~/Library/Application Support/com.yeagoo.dsh-desktop/harness/open-in-app.json`）：

```json
{
  "apps": [
    { "id": "vscode-cli", "label": "VS Code (CLI)", "kind": "cli", "command": "code", "args": ["{path}"] },
    { "id": "terminal",   "label": "Terminal",      "kind": "app", "app": "Terminal" },
    { "id": "my-editor",  "label": "My Editor",     "kind": "app", "app": "/Applications/My Editor.app" },
    { "id": "cwd-tool",   "label": "Tool in cwd",   "kind": "cli", "command": "mytool", "args": [], "cwd": true }
  ],
  "launchWatchMs": 1000
}
```

- `kind: "app"`：`open -a <app> [args]`；`app` 可以是名字（在
  `/Applications`、`~/Applications`、`/System/Applications` 里找）或 `.app` 绝对路径。
- `kind: "cli"`：按 `command` 在 PATH 上解析后 `spawn`，`args` 里的 `{path}`
  会替换成工作区目录；`cwd: true` 时同时把子进程工作目录设为它。
- 同 id 的自定义条目**覆盖**同名预设。
- 解析不到的命令不会出现在菜单里，而是在菜单底部列为「未安装」。
- 改完**不用重启**：每次打开菜单都会重新读这个文件。

## 安全模型

这里的每条都对应上游同样的约束：

- 每个路由先过组合的 `connection` 信任栅栏（Host/Origin 检查 + 浏览器鉴权
  cookie），未通过直接拒绝。
- 浏览器只发 **id + 工作区路径**，命令一律由 host 侧从可信配置文件解析——
  网页无法把它变成任意命令执行端点。
- 全程 `spawn(command, argv)`，**不经 shell**。
- 请求体必须是 `application/json`、上限 64 KiB；路径必须是存在的绝对目录。
- 子进程 `detached` 启动，环境变量剔除 `*KEY*` / `*SECRET*` / `*TOKEN*` /
  `*PASSWORD*` / `*CREDENTIAL*` / `*COOKIE*`，不继承 stdio。

## 卸载

```bash
dsh plugin --profile web remove dsh-open-in-app-plus
```

`$DSH_HOME/open-in-app.json` 不会被删除（那是你的数据）。
