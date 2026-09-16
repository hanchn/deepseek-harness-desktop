# dsh-usage-stats

在**输入框下面**（官方槽位 `conversation.composer.dock`，即 `轮/步 · tok/s ｜ tok · 缓存命中`
那一行的下方）加一行：

```
今日花费 ¥32.10 · 余量 66.82 CNY
```

- **刷新时机**：**没有定时器**。挂载时读一次，**每次进入/新建对话（session 变化）再读一次**；打开明细面板会刷新，面板里也有「刷新」按钮。
- **点击 → 明细面板**：居中弹层，点背景 / ✕ / Esc 关闭。内容：今日用量与构成、历史累积、高峰时段（本地时区的窗口 + 下次切换）、账户余量（总额/赠送/充值）、今日按模型、累积按模型、近 14 天历史（条形图）、计价口径脚注。
- 金额一律**人民币**，用官方中文价目表（元/百万 tokens），与余额同币种，不猜汇率。

## 数据从哪来

- **宿主半边**（`lib/index.js`）注册只读路由 `GET /usage-stats/report`：
  - 折叠 `<DSH_HOME>/sessions/**/session.v3.jsonl.zstd`（一事件一 zstd 帧）里服务商回报的用量，
    按**本地自然日**与模型归属，产出今日、近 14 天历史与全量累积；单个日志的 mtime/size 变了才重新解码；
  - 读 `<DSH_HOME>/.credentials.yaml` 的 `refs`（启动环境优先）调一次官方 `/user/balance`，**5 分钟缓存**；
  - Key 只在本进程内用于一次请求：不落日志、不进响应体。
- **浏览器半边**（`lib/client.js`）只做展示；没有绝对定位、负边距、`:has()` 或上游类名依赖——
  那一行本来就是纵向排列的槽位，所以它天然落在对话框下方。

花费是**估算**，不是账单：用官方中文价目表（`deepseek-flash` / `deepseek-v4-pro`）对每次调用按其
**实际所处时段**计价——高峰为北京时间周一至周五 `09:00–12:00`、`14:00–18:00`（= UTC `01:00–04:00`、
`06:00–10:00`），单价翻倍。价格表未收录的模型只统计 token、花费显示 `—`，绝不显示 `¥0.00`。

## 装 / 卸

```bash
# 装（用 link: 建立符号链接，改代码即时生效）
cd "$DSH_HOME/profiles/web"
pnpm add "link:<本目录绝对路径>"
# 再把包名加入该 profile 的 dsh.profile.bundles，然后重启 Harness

# 卸
pnpm remove dsh-usage-stats   # 并从 dsh.profile.bundles 移除该行
```

新增 bundle 行需要**重启 Harness** 才进 composition；之后只改客户端文件会热换。
