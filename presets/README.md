# presets/ — 随仓库维护的 agent preset

DSH 的 agent preset 决定**单个会话**拿到哪些工具、提示词段和技能。上游内置
4 个（`standard` / `ptc` / `minimal` / `cordis`），本目录放我们自己的。

## fleet —— 舰队模式

`fleet/` 是从内置 `standard` **复制**出来的 preset：能力行与 `standard` 完全
相同，唯一区别是 `persona` 的 prefix 换成了「指挥」教条 —— 先自己侦察、再把
任务拆成可并行分片、批量派发子 Agent、自己负责集成与对抗式验收。

这样做的依据是上游自己的指引：**不要改内置 preset**（升级会覆盖），复制成新
preset 再改。因此：

- `fleet` 不新增任何 `standard` 没有的工具（子代理 / workflow / ralph 行本来
  就在 `standard` 里）；
- 教条只写在 persona 段，保证同一会话要么整套生效、要么完全不生效；
- `maxDepth` / `maxRounds` 保持上游默认，preset 不该悄悄放大爆炸半径。

新增任何行都必须遵守 preset 的 realm 约束：**发布 service 的行必须放进带
`isolate` 的 group**，否则会发到 root realm（进程级），与其它 preset 冲突且会
被 `dsh-agent-presets` 在挂载时拒绝。文件头的注释有完整说明。

## 安装

preset 是**用户配置**，不会随 app 分发；把目录放进 DSH_HOME 的 preset 根：

```bash
DSH_HOME="$HOME/Library/Application Support/com.yeagoo.dsh-desktop/harness"
mkdir -p "$DSH_HOME/.agent-presets"
cp -R presets/fleet "$DSH_HOME/.agent-presets/"
```

桌面版也可以把它打包成 `.dshpreset` 走设置页的「导入预设」（两阶段确认 + 原子
安装）。装完在**新建会话**时即可在预设选择里看到「舰队模式」—— 上游只允许空
会话切换 preset，已有历史的会话不能换。

## 验证

不改上游、不用起 UI，直接用随包的 `discoverPresets` 断言发现与可解析性：

```bash
APP="/Applications/DSH Desktop.app/Contents/Resources/runtime"
cd "$APP/harness" && "$APP/node" --input-type=module -e '
import { pathToFileURL } from "node:url";
import { discoverPresets, SHIPPED_PRESET_ROOT } from "./node_modules/@deepseek-ai/dsh-agent-presets/lib/index.js";
const rows = await discoverPresets(
  [
    { path: process.env.DSH_HOME + "/.agent-presets", trust: "user" },
    { path: SHIPPED_PRESET_ROOT, trust: "system" },
  ],
  pathToFileURL(process.cwd() + "/"),
);
const hit = rows.find((r) => r.id === "fleet");
console.log({ found: Boolean(hit), broken: hit?.broken ?? null, total: rows.length });
'
```

`broken: null` 才是通过 —— 它非空时说明某个行里的包名解析不了（基准 URL 必须是
**harness 目录**，不是仓库目录，否则会全量误报）。
