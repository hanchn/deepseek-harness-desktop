# Feishu / Lark CLI skills source

- CLI: [`lark-cli`](https://github.com/larksuite/cli) — the official Lark/飞书 CLI,
  distributed through the `@larksuite/cli` npm package.
- Pinned version: **1.0.90** (see `scripts/lib/feishu-cli.ts`)
- Installed paths: the 28 `lark-*` directories in this folder
- License: MIT, Copyright (c) 2026 Lark Technologies Pte. Ltd.; see
  `lark-cli-skills.LICENSE`

These skills are not copied from a mutable branch. `lark-cli` embeds its agent
skills in the binary at build time and exposes them through
`lark-cli skills list|read`, so the vendored files are extracted from that exact
pinned CLI version by:

```bash
node scripts/sync-feishu-skills.ts          # rewrite .agents/skills/lark-*
node scripts/sync-feishu-skills.ts --check  # assert no drift (CI / review)
```

To update: install the reviewed CLI version, bump `feishuCli.version` (and
`feishuCli.skillCount`) in `scripts/lib/feishu-cli.ts`, re-run the sync script,
then review the resulting diff before committing. Do not hand-edit the vendored
skill files — the next sync overwrites them.

The CLI also exposes machine resources (assets/, scripts/) that are deliberately
**not** embedded and therefore not vendored here; every file in these
directories is agent-readable Markdown.
