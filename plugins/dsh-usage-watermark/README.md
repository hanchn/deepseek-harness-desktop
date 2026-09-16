# dsh-usage-watermark

在 DSH Web UI **对话界面右下角**常驻一枚用量角标（官方 `shell.overlay` 浮层槽：
整层点击穿透，只有角标自身接管指针，不会挡住下面任何东西）。点一下展开明细面板。

## 角标（收起态）

```
今日 324M · $3.73 · 余量 73.64 CNY · ↑1.6M ↓1.2M
```

最后一段是**本会话**的实时用量：来自宿主算好的 `tokenUsage` 投影
（`useSessions(s => s.byId[s.current]?.projectionValues?.tokenUsage)`），
**不轮询**，随回合实时跳动。

## 明细面板（展开态）

| 分区 | 内容 |
|---|---|
| **今日用量** | Token 总量 / 调用次数 / 花费估算三块；下面一行是未命中缓存、命中缓存、输出的拆分 |
| **高峰时段** | 当前是「高峰计价中」还是「低谷计价」；**换算到本机时区**的高峰窗口（如 UTC+8 的 `09:00-12:00 / 14:00-18:00`）；**下次切换时间**及方向（转高峰/转低谷） |
| **账户余量** | 各币种的总额，以及赠送 / 充值拆分 |
| **按模型** | 每个模型的 token、调用次数、花费估算；未收录价格表时标注未计价次数 |
| **历史用量** | 近 14 天逐日条形图 + token + 花费（含空白天，能看出趋势） |
| **脚注** | 计价口径：官方价格表、币种、读取日期 |

## 数据从哪来

- **宿主半边**（`lib/index.js`）注册一条只读路由 `GET /usage-watermark/report`：
  - 折叠 `<DSH_HOME>/sessions/**/session.v3.jsonl.zstd`（一事件一 zstd 帧）里
    服务商回报的用量，按**本地自然日**与模型归属，产出今日 + 近 14 天历史；
    只有一个日志的 mtime/size 变了才会重新读，所以 15 秒轮询也很便宜；
  - 读 `<DSH_HOME>/.credentials.yaml` 的 `refs`（启动环境优先级更高）调一次
    DeepSeek 官方 `/user/balance`，**5 分钟缓存**；
  - Key 只在本进程内用于一次请求：不落日志、不进响应体。

花费是**估算**，不是账单：用官方价格表（`deepseek-flash` / `deepseek-v4-pro`，
USD/1M tokens）对每次调用按其**实际所处时段**计价——高峰（UTC 周一至周五
`01:00–04:00`、`06:00–10:00`）单价翻倍。价格表未收录的模型只统计 token、花费
显示 `—`，绝不显示 `$0.00`。

## 装

```bash
dsh plugin --profile web add <path-to-this-package>
```

装完**重启 Harness**（控制器里「重新启动 Harness」）生效——不需要重新打包桌面版。

## 卸

```bash
dsh plugin --profile web remove dsh-usage-watermark
```

## 边界

- 不改上游任何代码：只用一个官方浮层槽 + 一条自带信任栅栏
  （`ctx.connection.requestRejection`，Host/Origin + 浏览器会话 cookie）的路由。
- 路由是只读 GET；没有写入、没有执行、没有把凭据回传给页面。
- root 作用域槽拿不到 `useProjection`，所以本会话实时量走 `useSessions` 的
  `projectionValues`——这是 root 作用域的官方取数路径。
