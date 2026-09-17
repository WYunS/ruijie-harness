# GitHub 三平台候选发布

入口：[Actions → 发布软件](https://github.com/AI-Applications-Team/ruijie-harness/actions/workflows/release.yml)。

版本提交自动发布：当根 `package.json` 和 `dsh-plugin-desktop/package.json` 同时提升为相同的新版本并推入 `main` 时，工作流会自动构建 Windows x64 Setup EXE、macOS Universal DMG（Apple Silicon + Intel）和 Linux x64 AppImage/deb；全部平台和原生 Intel 检查通过后，会创建同版本的 GitHub prerelease。手动入口仍可用于仅检查、仅保留 Artifact 或生成草稿。

填写新版本，选择 `main`，运行 `draft`。同一提交构建 Windows x64 NSIS、macOS Universal DMG、Linux x64 AppImage/deb；成功后在本仓库创建待验 Release 草稿。

macOS 只生成一个 Universal `.dmg`（同时支持 Apple Silicon 和 Intel），不生成 Mac ZIP 或 PKG 安装包；产物收集会拒绝这些额外格式。GitHub 下载 Artifact 时自身的 ZIP 外包装不是新增的软件格式。Windows 保留 Setup `.exe`，Linux 保留 `.AppImage` 和 `.deb`，另附校验和与构建清单。

## v2.1.7 候选

同步上游 `main` 提交 `e366b3b0420f9e40aab6d7bf4cd460b47965a6c4`，包含附件、PDF 图文、OCR worker、ZIP 深度解析及缓存完整性更新。三平台均从同一版本源码重新构建，并执行新版 `verify:attachment-ocr-electron`；Mac 重新合并双架构、签名和挂载审计，不能继承 v2.1.6 的签名或真人验收结果。本次增量检查与人工待验项见 [v2.1.7 验收矩阵](acceptance-v2.1.7.md)。

已完成：[v2.1.7 Release 草稿](https://github.com/rj-liukaiwen/ruijie-harness/releases/tag/untagged-9f09a7aec71139a85d35)，四个安装包和三个校验/追溯文件。包内源码为 `8bba285bcc258d6e9e205d69044387f3843421f9`。三平台原构建 [34802163711](https://github.com/rj-liukaiwen/ruijie-harness/actions/runs/34802163711) 的 Intel 重启验收发生时序误判，保留原失败；验收器修正后，[34804533325](https://github.com/rj-liukaiwen/ruijie-harness/actions/runs/34804533325) 复用同一 DMG 通过 Intel 及草稿生成。Mac 两种架构均通过 17 项安装后自动检查，真实账号、模型语义、TCC 和升级仍待真人验收。

Windows 未签名；Mac 沿用项目完整 ad-hoc 签名和最终 DMG 审计，未公证。Mac 再由原生 Intel 运行器校验同一 DMG。Linux 是新接入的实验平台，保留原有 afterPack 闭包验证，并检查 deb 内的真实 Electron/终端原生模块；GUI 登录、升级和发行版覆盖不等于自动通过。

## v2.1.8 候选

本版修复 DeepSeek SSE 端点配置和流终止恢复，并使 OpenMausBot 后台启动后的普通桌面启动能显示 UI。验证矩阵见 [v2.1.8 验收矩阵](acceptance-v2.1.8.md)。根与桌面包版本同时更新后推入 `main` 会自动创建同版本 GitHub prerelease；发布产物仍需保留其候选性质和真人验收边界。

本入口不修改现有 GPTAuth 更新站点。原来的 `macos-internal-build.yml` 继续保留，供已有候选的验收续跑使用。

## 首次接入记录

- 上游 main：`d557d8806dbf1df3667db0cd6c13c673bccc26fd`。
- 版本：沿用源码 `2.1.6`，未将 Bot 的 `0.1.74` 套到 Harness。
- 已有 tag `v2.0.7` 用于覆盖完整可见差异；缺少其真人验收记录，因此不将它描述为已验收基线。
- 当前差异中目录授权、编辑菜单、主题、恢复窗口和平台更新已明确加入动态矩阵，真人项目仍待验。
- 本次接入没有覆盖本机安装，也没有访问用户的 `.dsh` 或实际账号。

## 日常使用

1. 将产品改动合入本仓库 main，更新依赖或原生组件时完成相应适配。
2. Actions → 发布软件 → 输入新版本 → Run workflow。
3. 失败先看 summary、对应 job 日志及 evidence。candidate 在安装验收前保存，不需要因为验收器失败丢失原始包。
4. 全部自动检查通过后下载草稿资产，按 `发布交付指南/` 做真人验收；通过后再在 GitHub Release 页面发布。

接入共享工作流没有取消项目许可要求。依赖中的 `@tencent-connect/qqbot-connector@1.2.0` 保留既有业务例外及 notices；对外分发前需确认该例外适用于实际发布范围。

共用逻辑维护在 [release-kit](https://github.com/rj-liukaiwen/release-kit)。升级时同步更新调用工作流和 `toolkit_sha` 两处固定提交。项目适配器位于本目录，工具库版本不会自动改变应用身份、缓存路径或更新服务。

Windows 构建会先重建源码内的 sidebar bundle，再刷新本地 file: 依赖，随后执行 immutable 安装、完整 check 和 20 项 webview 检查。仅允许四个本地 vendor archive 的哈希变化，registry 版本与哈希必须不变。生成 bundle 的哈希保存在 evidence。Linux 同时解包 AppImage/deb，运行各自内置 Electron 和两套终端原生模块。

## 已有构建直接生成草稿

打开本项目 Actions 的“从构建生成 Release”，填写“发布软件”成功运行的编号。流程重用同一源码和工具版本对应的已验证 Artifacts，重新核对全部哈希后生成草稿，不重复编译。已有同版本 Release 或过期/缺失产物会被拒绝。

## 三平台通过、只有 Intel 验收脚本失败时

先保存失败证据并确认只需要修正验收脚本。模型目录异步恢复时，验收器会在既有 45 秒时限内等待正确模型与推理档位，不能仅因工作区名称出现就立刻断言模型已加载；持续缺失或错误仍失败。

打开“复用安装包续验并生成草稿”，输入原 `candidate_run`、包清单里的完整 `source_sha` 和原 `version`。该流程要求原来三个平台 job 都成功且只有 Intel 失败；只替换外部验收脚本，不改安装包、产品源码或依赖。修正后的检查重新在原生 Intel 验证同一 DMG，再复核全部平台清单与哈希后创建草稿。

草稿附带 `RECOVERY-MANIFEST.json`，记录原构建、失败记录、验收工具提交与恢复运行。产物过期、其他平台失败或哈希不一致时直接拒绝。这个入口不能用于复用需要产品修复的旧包。
