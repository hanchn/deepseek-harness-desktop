# dsh-market

给 DSH Web UI 的**设置**里加一页「市场」，三个 tab：

| tab | 做什么 |
|---|---|
| **CLI 市场** | 检测本机已装的 CLI 与版本，给出官方安装命令供复制。**绝不自作主张代跑安装器。** |
| **Skill 市场** | 从**固定 commit** 的 GitHub 源浏览技能并安装到工作区或用户级技能根，装完写 `SOURCE.md` 溯源。 |
| **自定义 Skill** | 在本页创建/编辑/删除自己的技能（写 `SKILL.md` + 标记）。 |

## 为什么是独立插件

上游没有 CLI 目录，也没有 skill 市场；本插件走 DSH 的客户端插件边界
（`settings.section` 插槽 + 宿主 `webServer` 路由），不改上游一行代码。

## 两条供应链纪律

这个仓库对技能有明确纪律（见 `AGENTS.md` 的飞书技能包一节）：
vendored 技能从固定版本物化、留 `SOURCE.md`、**不许手改**。本插件照同一条规矩办：

1. **只从固定 commit 安装。** 浏览前先把来源解析成 40 位 commit SHA 并显示出来；
   安装记录该 SHA。没有「跟随分支」这个选项。
2. **不是本页创建的目录只读。** 判定规则：

   | 目录里有 | 归类 | 能否改/删 |
   |---|---|---|
   | `.dsh-market.json`（`kind: custom`） | 本页创建 | 可编辑、可删除 |
   | `.dsh-market.json`（`kind: source`） | 来源安装 | 可重装、可删除，正文不鼓励手改 |
   | 无标记 | 只读 | 列出 + 显示路径，**写和删都返回 409** |

   所以本仓库 `.agents/skills` 里那 57 个 vendored 技能、以及你在别处手写的技能，
   在本页都是只读的；要改请用编辑器直接改文件，或走仓库自己的同步脚本。

## 安装位置

| 作用域 | 目录 |
|---|---|
| 用户级 | `$DSH_AGENTS_HOME/skills`，默认 `~/.agents/skills` |
| 工作区级 | `<工作区>/.agents/skills` |

工作区列表来自宿主自己的工作区注册表（只读），所以不用手打路径；也可在别处
手动建技能后用「刷新」看到。

## CLI 检测的两个坑（已处理）

- **图形启动的 PATH 极简。** macOS 从 Dock 启动的进程只有
  `/usr/bin:/bin:…`，用户装在 `/usr/local/bin`、Homebrew、pnpm、nvm、cargo
  下的工具一个都看不见。所以检测除了 `PATH` 还会扫这些常见目录。
- **Node CLI 需要 `node` 在 PATH 上。** 目录里很多是
  `#!/usr/bin/env node` 脚本；探测版本时会把**本宿主自己的 Node 目录**加进子进程
  PATH，否则工具能解析到却读不出版本。

## 自定义来源

内置 `anthropics/skills`（`skills/` 子目录）。加自己的源：

```json
// $DSH_HOME/market.json
{
  "skillSources": [
    { "id": "my-skills", "label": "My skills", "repo": "owner/repo", "path": "skills", "license": "MIT" }
  ]
}
```

## 路由与安全

全部在组合的 `connection` 信任栅栏之后（Host/Origin + 浏览器鉴权 cookie）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-market/cli` | 目录 + 检测结果 + 派生出的安装命令 |
| GET | `/dsh-market/workspaces` | 工作区列表（只读注册表） |
| GET | `/dsh-market/sources` | 技能来源 |
| GET | `/dsh-market/skills?scope=&root=` | 某作用域下已装技能 + 溯源 |
| GET | `/dsh-market/source/browse?source=` | 固定 commit 下浏览（单次 trees 请求） |
| GET | `/dsh-market/source/resolve?source=` | 解析默认分支 HEAD commit |
| POST | `/dsh-market/skills/install` | 安装（需 `confirm: true`） |
| POST | `/dsh-market/skills/save` | 新建/更新自定义技能 |
| POST | `/dsh-market/skills/remove` | 删除（需 `confirm: true`） |

- 只用 Node 内置模块（profile 插件解析不到 harness 包），子进程一律 argv、**不经 shell**。
- 自定义源只接受 `owner/repo` 形式；技能名必须匹配 `[a-z0-9][a-z0-9._-]{0,63}`，
  写入前再校验落在技能目录内（防目录穿越）。
- 请求体必须是 `application/json`，上限 256 KiB。
- 装源文件走 `raw.githubusercontent.com`（不计 API 配额），列目录用一次 git trees 请求，
  避免 GitHub 未认证 60 次/小时的限流。

## 卸载

```bash
dsh plugin --profile web remove dsh-market
```

`$DSH_HOME/market.json` 与已装技能不会被删除（那是你的数据）。
