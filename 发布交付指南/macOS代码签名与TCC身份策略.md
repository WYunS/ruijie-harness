# macOS 代码签名与 TCC 身份策略

用途：解释锐捷 Harness 内部 macOS 包的代码身份决策，以及签名、TCC、Files and Folders 权限和跨版本升级的放行边界。遇到 macOS 签名状态、`Allow` 循环、`Failed to match existing code requirement`、受保护目录或签名方式升级时，先完整读取本文件；实际构建执行 `02-macOS打包指导.md`，实体 Mac 验收执行 `03-macOS真人验收测试指导.md`。

## 1. 最终目的

目标不是隐藏 Gatekeeper，也不是让 `codesign` 输出好看，而是让负责访问 Downloads、Documents、Desktop 的 `cn.com.ruijie.dsh.desktop` 主进程具有可验证代码身份。用户主动选择受保护目录后，macOS 可以零次或最多询问一次；点击一次 `Allow` 后，同一次运行和同一安装版本不得再次询问。

静态签名通过只允许候选进入实体 Mac 测试。只有最终 DMG 在真实 TCC 环境中不再出现 `Failed to match existing code requirement`，才能判定权限循环问题通过。

## 2. 已确认的故障与参考基线

领导机上的 `2.1.1` 证据包括：

- TCC 服务为 `kTCCServiceSystemPolicyDownloadsFolder`；
- 责任进程和 Bundle ID 为锐捷 Harness / `cn.com.ruijie.dsh.desktop`；
- 同一分钟连续出现 `Failed to match existing code requirement` 和权限提示；
- 当时内部构建明确关闭签名，主 App 与大量嵌套原生代码没有有效签名。

已验证的锐捷 Codex 参考 DMG SHA-256 为 `F1D558881C5074C339B29282235079034382D698874E6C0123D877F7F040FA61`。它使用完整 ad-hoc App 封装并严格验证，而不是使用内部 CA；少数未修改运行时保留各自原始 OpenAI Developer ID 签名。其 OpenAI provisioning profile 与锐捷 Bundle ID 不匹配，只是来源包残留，不是可复用签名身份。

可借鉴的是完整签名闭包、固定 Bundle ID、签名后不修改和最终产物复验。OpenAI 证书、Team ID、provisioning profile、Codex Shell 包装器均不属于 Harness，不得复制或冒充。

## 3. 当前发布决策

当前无 Apple Developer ID 的内部版采用：

```text
固定 Bundle ID
→ 枚举真实 Mach-O 与嵌套代码 Bundle
→ 从内到外使用同一次 ad-hoc 身份封装
→ 最后签主 App
→ 生成 DMG
→ 挂载最终 DMG 再逐个验签
```

当前状态应准确写为：`ad-hoc signed, not notarized`。ad-hoc 是真实代码签名，但没有证书 Team ID，也不等于 Developer ID、Apple 公证或正规外部分发身份。

签名实现位于：

- `dsh-plugin-desktop/scripts/sign-mac-internal.ts`：内部 afterPack 会跳过单架构临时 App，仅在 universal 合并完成后执行 Mach-O 枚举与 inside-out ad-hoc 封装；
- `dsh-plugin-desktop/scripts/package-mac.ts`：只为内部构建启用该 Hook；
- `dsh-plugin-desktop/scripts/verify-mac-smoke.ts`：挂载最终 DMG 后执行签名审计；
- `.github/workflows/macos-internal-build.yml`：保存 `SIGNATURE-AUDIT.txt` 与准确构建清单。

正式 Developer ID 发布路径仍由 `release-mac.ts` 和 `verify-mac-release.ts` 负责，不与内部 ad-hoc 路径混写。

## 4. 签名闭包完成标准

每次内部 DMG 必须同时满足：

1. Bundle ID 为 `cn.com.ruijie.dsh.desktop`。
2. 最终 `.app` 显示 `Signature=adhoc` 和 `TeamIdentifier=not set`。
3. App 内物理 Mach-O 数量大于零，每个对象通过 `codesign --verify --strict --verbose=2`。
4. 外层 App 通过 `codesign --verify --deep --strict --verbose=2`。
5. `codesign -dr -` 能输出 designated requirement。
6. 上述检查针对挂载 DMG 中的 `.app`，不是打包前临时目录。
7. 签名后没有补丁、复制、二进制修改或会改变签名封装的操作。
8. Artifact 包含 `SIGNATURE-AUDIT.txt`、`BUILD-MANIFEST.txt`、DMG 和 SHA-256。

执行位不是代码类型。签名器只处理真实 Mach-O 和嵌套 `.app`、`.framework`、`.xpc`、`.appex`、`.bundle`、`.plugin`、`.service`，不以“77个可执行位文件”作为盲签清单。

## 5. TCC 与应用请求必须双重收口

签名解决“macOS 无法再次识别同一代码对象”，应用层同时必须保持：

- 用户未选择时不访问 Downloads、Documents、Desktop；
- 原生目录选择器单飞；
- 选中目录只探测一次；
- 取消、拒绝、异常后停止；
- 同一启动批次中多个历史会话共享同一 cwd 时，只执行一次 `realpath` 和一次 `stat`；
- 退出后不残留选择器、权限框或 Harness 进程。

因此签名不替代 `mac-directory-access`、`client-mac-directory-flow`、`workspace-cross-move-runtime-patch` 和原生路由契约测试；这些测试通过也不替代实体 Mac TCC 验收。

## 6. 跨版本边界

同一份 ad-hoc 构建安装后应稳定复用本次代码要求。版本内容变化会改变 CodeDirectory/CDHash，因此从 A 覆盖到 B 时可能重新询问一次，不能承诺 ad-hoc 跨所有版本零提示。

`2.1.5` 包含 GPTAuth Claude 模型、OAuth 代理和运行时配置变化，必须视为新的完整应用内容：即使没有改动签名脚本，也要从最终 universal `.app` 重新执行 inside-out ad-hoc 签名并挂载最终 DMG 复验，不能继承 `2.1.4` 的签名审计、CDHash 或 TCC 验收结论。模型供应商变化本身不授权访问 Downloads、Documents 或 Desktop；Claude 与 DeepSeek 的图片输入都只能在用户已经选择或主动附加文件后读取，不能为了模型能力预探测受保护目录。

正式升级门禁是：不清 TCC，从旧正式版覆盖安装新候选；第一次访问受保护目录可以零次或最多一次 `Allow`，此后连续访问和重启不再提示。每次升级都循环提示、同一动作出现第二次提示或继续出现 requirement mismatch 均为失败。

## 7. 升级到固定证书的条件

出现以下任一情况时，停止继续调 ad-hoc，建立新的签名方案任务：

- 完整 ad-hoc 包在同一安装版本仍无法复用 TCC；
- 两个正常构建之间的身份变化导致内部升级体验不可接受；
- 员工需要跨版本零提示；
- 公司提供 Apple Developer ID、MDM 或正式内部 PKI。

无 Apple Developer ID 时的下一候选是固定内部 Root CA 与固定 Code Signing 叶子证书。该方案需要目标 Mac 一次性信任公共根证书，私钥只进入受保护构建环境。它必须先在普通 Mac 完成 A→B 验证，再进入领导机；不能把安装根证书临时变成领导机排障步骤。

## 8. 放行顺序

```text
Windows 本地测试
→ 本地提交并推送 ruijie/main
→ GitHub Actions macOS 构建与最终 DMG 静态验签
→ 普通 Apple Silicon Mac 集中预验收
→ 领导机最后一次不清 TCC 覆盖验收
```

GitHub Actions runner 可以构建、签名、生成和挂载 DMG，但无法替代持久真实用户 TCC 数据库和系统弹窗。领导机只接受已经通过普通 Mac 全套权限门禁的最终哈希，不承担反复诊断。
