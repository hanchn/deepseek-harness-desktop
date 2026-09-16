# dsh-market

给 DSH Web UI 的**设置**里加一页「市场」，三个 tab：

| tab | 做什么 |
|---|---|
| **CLI 市场** | 检测本机已装的 CLI 与版本，给出官方安装命令供复制。**绝不自作主张代跑安装器。** |
| **Skill 市场** | 按 **GitHub Stars** 排序的技能仓库目录（可筛选、可「只看已安装」），选中后固定到某个 commit 浏览并安装到工作区或用户级技能根，装完写 `SOURCE.md` 溯源。底部可浏览固定来源，也可**直接手输任意 `owner/repo`**。 |
| **自定义 Skill** | 管理你自己的技能，按归属分三组：**本页创建**（可编辑）、**来源安装**（可删）、**已安装（只读）**（三组默认展开，只列出）。 |

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

## 评分目录（GitHub Stars）

页面打开「Skill 市场」时按 **star 数从高到低**列出技能仓库，条目只做**发现**：

- 主题：`agent-skills` / `claude-skills` / `claude-skill` / `codex-skills`，每个主题一次
  `search/repositories`（`sort=stars`），合并去重后取前 40 条；某个主题失败只降级成一行提示，
  全部失败才报错。
- **评分是仓库的 stars，不是单个技能的评分**（GitHub 没有免认证的单技能评分），页面上明说了这点。
- 结果缓存在 `$DSH_HOME/market-catalog.json`（6 小时 TTL，临时文件 + `rename` 原子写入，
  超过 1 MiB 拒绝读取）。刷新失败时回退到上次成功的结果并标注「离线」；「刷新目录」按钮
  （`?refresh=1`）绕开 TTL 重新拉取。
- 点「浏览技能」后：先解析 40 位 commit，再从文件树里**推断技能根**（含最多
  `<name>/SKILL.md` 的目录，平局取更浅的；`""` 表示仓库根），然后才列出可装技能。
  安装请求把推断出的目录一起带上，保证「列出的」和「装下的」是同一棵树。
- **单技能仓库**：技能根里直接放 `SKILL.md`、而没有任何 `<name>/SKILL.md` 的仓库
  （`next-1688/1688-shopkeeper` 就是这种布局），整个仓库根即那个技能，技能名取仓库名；
  安装会把该目录下的全部文件装进 `<技能根>/<仓库名>/`。没有这条规则，这种仓库会
  浏览出 0 个技能。
- 技能描述走 `SKILL.md` 的 frontmatter；`description: |` 这类**块标量**按多行读
  （否则描述会渲染成字面的 `|`，而 1688 / linkfox 系列几乎都这么写）。
- 文件树被 GitHub 截断（超大仓库）时**拒绝安装**——那会静默装出一个残缺技能。

## 目录以外的两个入口

40 条 stars 目录只是**发现**清单，不是白名单，所以：

- **「只看已安装」**：勾上后只留当前作用域真正装过的来源仓库；每个仓库卡片上带
  「已装 N」标记。该标记只认**本页安装**（带 `.dsh-market.json`）的技能——手工放进
  技能根的目录没有来源记录，因此计入总数但不归属到任何仓库，页面上的提示会把人
  引到「自定义 Skill」tab。手输过或装过的仓库即使掉出 40 条，也会固定排在目录前面。
- **手输 `owner/repo`**：底部「或按固定来源浏览」里可直接输入仓库名（也接受
  GitHub 链接、尾部 `.git`），走与目录条目完全相同的固定 commit 浏览/安装路径。

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
    { "id": "my-skills", "label": "My skills", "repo": "owner/repo", "path": "skills", "license": "MIT" },
    { "id": "1688-shopkeeper", "label": "1688 选品铺货", "repo": "next-1688/1688-shopkeeper", "path": "" }
  ]
}
```

`path` 是该仓库的技能根；留空或省略表示「先按文件树推断，推断不出就用仓库根」
（上面那条 1688 就是根即技能的布局）。`id` 与内置相同会覆盖内置项；缺 `repo`
或 `repo` 不是 `owner/name` 的条目会被丢弃，整个文件解析失败只在页面上给一行提示，
不会影响内置来源。

目录里的仓库不需要登记：`/dsh-market/source/browse?repo=owner/name` 与安装接口的
`repo` 字段可以直接指任意公开仓库（技能根自动推断）。所以「Skill 市场」的目录条目
无需写进 `market.json`；`market.json` 只用来固定常用来源和 `path`。

## 路由与安全

全部在组合的 `connection` 信任栅栏之后（Host/Origin + 浏览器鉴权 cookie）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-market/cli` | 目录 + 检测结果 + 派生出的安装命令 |
| GET | `/dsh-market/catalog?refresh=1` | 按 stars 排序的技能仓库目录（缓存 + 离线回退） |
| GET | `/dsh-market/workspaces` | 工作区列表（只读注册表） |
| GET | `/dsh-market/sources` | 技能来源 |
| GET | `/dsh-market/skills?scope=&root=` | 某作用域下已装技能 + 溯源 |
| GET | `/dsh-market/source/browse?source=` 或 `?repo=` | 固定 commit 下浏览（单次 trees 请求） |
| GET | `/dsh-market/source/resolve?source=` 或 `?repo=` | 解析默认分支 HEAD commit |
| POST | `/dsh-market/skills/install` | 安装（需 `confirm: true`；`source` 或 `repo` 二选一，可带 `path`） |
| POST | `/dsh-market/skills/save` | 新建/更新自定义技能 |
| POST | `/dsh-market/skills/remove` | 删除（需 `confirm: true`） |

- 只用 Node 内置模块（profile 插件解析不到 harness 包），子进程一律 argv、**不经 shell**。
- 来源标识只接受 `owner/repo` 形式；技能名必须匹配 `[a-z0-9][a-z0-9._-]{0,63}`，
  写入前再校验落在技能目录内（防目录穿越）。远程数据一律白名单字段后再回给页面。
- 请求体必须是 `application/json`，上限 256 KiB。
- 装源文件走 `raw.githubusercontent.com`（不计 API 配额），列目录用一次 git trees 请求，
  避免 GitHub 未认证 60 次/小时的限流；目录搜索走 search 配额并带 6 小时缓存。

## 卸载

```bash
dsh plugin --profile web remove dsh-market
```

`$DSH_HOME/market.json` 与已装技能不会被删除（那是你的数据）。
