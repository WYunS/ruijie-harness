# v2.1.8 打包与验收矩阵

- 发布提交包含 DeepSeek SSE 恢复和 OpenMausBot 后台模式的普通桌面启动恢复。
- Windows：x64 Setup EXE；macOS：一个 Universal DMG；Linux：x64 AppImage/deb。
- GitHub Actions 自动执行三平台构建、macOS 安装后自动验收和同一 DMG 的原生 Intel 验证。
- 结果以本次 Actions summary、日志、构建清单和 SHA-256 为准；本文是运行前矩阵，不能代替真人验收。

| 编号 | 功能或风险 / 依据 | 环境与操作 | 预期结果 | 证据 / 初始状态 |
|---|---|---|---|---|
| B01 | 已保存的 `https://gptauth.ruijie.com.cn` 覆盖地址 | 启动 profile 默认值修复；运行 profile 回归 | 仅删除已知网站根地址，保留其他显式 API 地址 | `profile.spec.ts` / 已覆盖 |
| B02 | DeepSeek 流结束兼容 | 模拟带 `finish_reason` 但缺少 `[DONE]` 的 SSE | 完整响应正常完成，不显示 `SSE stream ended without [DONE]` | DeepSeek 流回归 / 已覆盖 |
| B03 | 真正的中途断流 | 首轮截断、随后正常的 SSE；以及始终截断的 SSE | 仅丢弃不完整首轮，按上限重试；持续失败保持失败 | `deepseek-stream-closure-retry.spec.ts` / 已覆盖 |
| B04 | 错误端点可诊断性 | HTTP 200 的 HTML/JSON 非 SSE 响应 | 报 `MALFORMED_RESPONSE` 与端点说明，不冒充 SSE 终止错误 | DeepSeek 流回归 / 已覆盖 |
| B05 | Bot 后台与用户桌面启动共存 | 先以 `--openmaus-server` 启动，再普通点击启动器 | 现有实例挂载并显示桌面 UI；普通启动路径不变 | `desktop-launch-mode.spec.ts` / 已覆盖 |
| B06 | 三平台可交付物 | Actions 构建 Windows、macOS Universal、Linux | EXE、一个 Universal DMG、AppImage 和 deb 通过自动验证并写入 Release | Actions evidence / 待执行 |
| B07 | macOS 真实内部可用性 | 按 `发布交付指南/03-macOS真人验收测试指导.md` 使用专用 Mac 与账号 | 登录、TCC、模型、升级及安装行为均通过 | 真人记录 / 未执行 |

自动通过后发布的是 GitHub 测试候选；macOS 为 ad-hoc signed, not notarized，Windows 与 Linux 未签名。真实账号、真实模型语义、TCC 与跨版本升级仍须按发布指导验收。
