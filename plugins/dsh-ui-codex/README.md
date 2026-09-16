# dsh-ui-codex

把 DSH Web UI 的观感朝 Codex 桌面版推近的**纯外观**客户端插件。它不改上游
任何代码，只做两件事：

1. 通过官方主题接缝 `ctx.theme.overrideTokens(source, tokens)` 叠一层
   **中性灰暗色配色**（Codex 的底色是纯中性灰，不是 DSH 默认的偏蓝灰）；
2. 注入少量密度/字型规则。

因为用的是 override *层*，上游浅色/暗色主题本身不受影响：卸载本插件即恢复原样。

## 为什么用 overrideTokens 而不是自己写 CSS 变量

上游主题把解析后的别名 token 以**内联样式**写在 `<body>` 上，任何样式表选择器
都盖不过它，只有 `!important` 或官方 override 层能生效。`overrideTokens` 是官方
接口，参与注册顺序合成，且每个 token 必须同时给 `light` / `dark` 两个值——这里
全部照办，所以切到浅色模式也不会出现不可读的组合。

## 范围与边界

- **只能改别名层**（79 个 `--dsw-alias-*`）。基础/静态/字体 token 不在 API 内，
  改不了；组件类名是内容哈希，靠 CSS 选择器硬顶属于升级即碎的用法，这里不用。
- 布局不是本插件负责的：三栏 AppFrame 由上游 `dsh-client-ui-layout` 拥有。
  要让侧栏/右栏变成 Codex 那种形态，得顶替 `sidebar` / `rightbar` 插槽，属于
  另一个（风险更高）的改动。

## 装

```bash
dsh plugin --profile web add <path-to-this-package>
```

然后重启 `dsh web`。

## 卸载

```bash
dsh plugin --profile web remove dsh-ui-codex
```
