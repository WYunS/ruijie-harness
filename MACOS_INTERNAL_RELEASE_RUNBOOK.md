# 锐捷 Harness macOS 内部版构建与维护手册

用途：确保 macOS 内部版始终从 Windows 正式版所用的同一套业务源码构建，避免出现两个仓库、两个功能版本或把旧 bundle 打进 DMG。

## 1. 唯一源码与地址

- 唯一本地仓库：`D:\ChatGPT\RuijieDSH`
- 桌面应用：`D:\ChatGPT\RuijieDSH\dsh-plugin-desktop`
- GitHub 仓库：`https://github.com/WYunS/ruijie-harness.git`
- GitHub Actions：`.github/workflows/macos-internal-build.yml`
- 内部 Mac 构建入口：`corepack yarn dist:mac-internal`
- 内部 Mac 输出目录：`dsh-plugin-desktop/dist/mac-internal`
- 产品版本唯一来源：`dsh-plugin-desktop/package.json`；Artifact 与 DMG 名称必须动态使用该版本。

不要复制出 `RuijieDSH-M` 或长期维护 macOS 专属源码目录。Windows 与 macOS 必须共用业务代码；平台差异通过 `process.platform`、Electron 平台策略和打包脚本处理。

当前发布方式是统一 `main`，不是 `win branch`/`mac branch` 两套长期源码。每次开始前必须执行并记录：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
```

正式源码应位于本地 `main`，并推送到 `ruijie/main`（`https://github.com/WYunS/ruijie-harness.git`）。`origin` 指向上游项目，只用于读取上游更新；未经明确授权不要向 `origin` 推送。已生成或已安装的旧 DMG 是不可变文件，后续源码提交不会反向改变它。共享运行时代码或资源发生变化时，应提升产品版本后重新生成需要保持一致的平台产物，不要让两个内容不同的文件共用同一版本号。

## 2. 如何拆分维护

| 内容 | 维护位置 | 规则 |
|---|---|---|
| 登录、模型、会话、侧栏、Office、浏览器、PDF、WebSearch | 共用源码与 `vendor` | 两个平台同时生效，修改后必须跑完整 `yarn check` |
| 窗口外观、红绿灯区域、托盘 | `src/window-options.ts`、`src/client`、`src/tray-icons.ts` | 用平台策略或 `platform === 'darwin'` 分流 |
| 终端和 Shell | `src/desktop-terminal.ts`、`src/shell-environment.ts` | Windows 使用 PowerShell；Mac 使用系统 login shell/bash/zsh |
| Windows ACL 和卷诊断 | `src/windows-*.ts` 与对应 profile 条件 | 只在 `win32` 注册，Mac 不加载 |
| Mac universal 原生依赖 | `scripts/mac-universal.ts` | Intel 与 Apple Silicon 文件必须同时存在并通过 `lipo` 校验 |
| Windows 打包 | `scripts/package-win.ts` | 不得因 Mac 改造更换现有正式入口 |
| Mac 内部打包 | `scripts/package-mac.ts` | unsigned、关闭 notarization、永不自动发布 |
| Mac 签名发布 | `scripts/release-mac.ts` | 当前内部版不用；没有证书时禁止调用 |

临时开发分支可以命名为 `release/macos-internal-<version>`，但完成验证后应合回统一主线，不能演变为另一套长期源码。

## 3. 推送 GitHub 前

在仓库根目录执行：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git status --short
git branch --show-current
git rev-parse HEAD
git submodule status --recursive
git diff --check
corepack yarn install --immutable
corepack yarn workspace dsh-plugin-desktop build:vendor-sidebar
corepack yarn workspace dsh-plugin-desktop verify:vendor-sidebar
corepack yarn check
corepack yarn workspace dsh-plugin-desktop vitest run tests/mac-universal.spec.ts tests/package-mac.spec.ts tests/verify-mac-smoke.spec.ts tests/verify-packaged-runtime.spec.ts tests/electron-runtime.spec.ts tests/profile.spec.ts tests/desktop-plugins.spec.ts tests/sidebar-produced-files.spec.ts tests/window-options.spec.ts
corepack yarn workspace dsh-community-market vitest run tests/contracts.spec.ts tests/market-install.spec.ts tests/market-settings-persistence.spec.ts
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/eng.traineddata.gz
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/chi_sim.traineddata.gz
```

`build:vendor-sidebar` 必须成功且不得出现 `UNRESOLVED_IMPORT`。`verify:vendor-sidebar` 必须确认 `vendor/dsh-better-sidebar/lib` 与 Electron 将打包的 `node_modules/dsh-better-sidebar/lib` 逐文件相同。若本轮有意修改 sidebar 源码，先审查生成的 `lib`，再运行一次 `corepack yarn install` 更新 file dependency 哈希和 `yarn.lock`，随后重新运行上面的全部命令。源码、生成后的 `lib` 与 `yarn.lock` 必须一同提交。

确认 `deepseek-harness` 子模块固定为 `dsh-v0.1.0-rc.8`，并确认以下内容都已加入提交：

- `.github/workflows/macos-internal-build.yml`
- `.yarnrc.yml` 中的 `supportedArchitectures`
- `vendor` 目录和 rc.8 patches
- `scripts/mac-universal.ts`、`scripts/package-mac.ts`、`scripts/verify-mac-smoke.ts`
- 当前 Windows 正式版的全部业务修复

GitHub 构建只读取提交过的文件。仅存在于本机但没有 `git add`、commit、push 的内容不会进入 DMG。

提交前用 `git diff --name-status <上次发布提交>..HEAD` 把变化分为三类：共享运行时、平台专属实现、仅测试/CI/文档。共享运行时变化（例如侧栏、Office、PDF、浏览器、WebSearch、OCR 数据）必须同时评估 Windows 与 macOS；仅 `.github/workflows/macos-internal-build.yml`、Mac 打包脚本或测试断言的变化不要求重打 Windows。

## 4. 在 GitHub Actions 打包

推送 commit、触发 GitHub Actions 和产生远端 Artifact 都属于外部写操作。只有用户明确要求打包/发布、当前环境已有相应 GitHub 凭证与 Actions 权限时才能执行；若用户只要求修改源码或指南，到本地门禁通过为止，不得擅自 push 或运行工作流。

1. 将完整仓库和子模块指针推送到 GitHub。
2. 确认工作流文件已经存在于 GitHub 默认分支；否则网页上的手动运行按钮可能不显示。
3. 打开仓库的 `Actions` 页面。
4. 选择 `Build macOS Internal DMG`。
5. 点击 `Run workflow`，选择包含完整改动的分支。
6. 等待 `Build universal macOS DMG` 全部变绿。
7. 从 `dsh-plugin-desktop/package.json` 读取 `$version`，下载名为 `Ruijie-Harness-${version}-macOS-universal` 的 Artifact。

已安装并登录 GitHub CLI 时，等价的可审计命令如下：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
gh auth status
git push ruijie main
gh workflow run macos-internal-build.yml --repo WYunS/ruijie-harness --ref main
gh run list --repo WYunS/ruijie-harness --workflow macos-internal-build.yml --limit 5
gh run watch <run-id> --repo WYunS/ruijie-harness --exit-status
```

一次只保留一个目标构建在运行。构建耗时二三十分钟并不等于卡死；以步骤状态和 90 分钟 job timeout 为准。收到失败结果后先读取该 run 的失败日志，定位和验证后才允许重跑：

```powershell
gh run view <run-id> --repo WYunS/ruijie-harness --log-failed
```

禁止在原因未知时连续点击 `Run workflow`；每次重跑都必须对应一个已提交、可解释且经过本地检查的修复。

Artifact 解压后必须包含：

- `Ruijie-Harness-${version}-macOS-universal.dmg`
- 同名 `.sha256` 文件
- `BUILD-MANIFEST.txt`，记录源码 commit、版本、架构与签名状态

下载和本机复核：

```powershell
$runId = '<run-id>'
$download = "D:\ChatGPT\RuijieDSH\dsh-plugin-desktop\dist\mac-github\run-$runId"
New-Item -ItemType Directory -Force -Path $download | Out-Null
gh run download $runId --repo WYunS/ruijie-harness --dir $download

$version = (Get-Content -LiteralPath 'D:\ChatGPT\RuijieDSH\dsh-plugin-desktop\package.json' -Raw |
  ConvertFrom-Json).version
$dmg = Join-Path $download "Ruijie-Harness-$version-macOS-universal.dmg"
$actual = (Get-FileHash -LiteralPath $dmg -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = ((Get-Content -LiteralPath "$dmg.sha256" -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
if ($actual -ne $expected) { throw 'Downloaded DMG SHA-256 mismatch' }
Get-Item -LiteralPath $dmg | Select-Object FullName,Length,LastWriteTime
Get-Content -LiteralPath (Join-Path $download 'BUILD-MANIFEST.txt')
```

`gh run download` 对大型 Artifact 可能长时间没有进度输出；先检查下载进程和临时文件是否仍增长，不要把慢下载误判为构建失败，更不要因此重新触发 Action。

## 5. GitHub 自动门禁

工作流会在真实 macOS runner 上：

1. 递归检出固定的 upstream 子模块。
2. 在一次性 macOS runner 中刷新四个 `file:../vendor/*` 本地依赖的宿主平台哈希，然后立即再次执行 `yarn install --immutable`，确认依赖图稳定。该刷新不改变依赖版本，也不会回写仓库；不能直接删除第二次 immutable 校验。
3. 运行完整 `yarn check`。
4. 校验已由 Windows 发布门禁生成并提交的侧栏 bundle 与 Mac 将要打包的依赖副本逐文件一致；不要在 Mac runner 上重新生成该前端 bundle，因为 source map 路径字节具有宿主平台差异。
5. 运行真实 Electron 侧栏/popup 连续性测试 20 次。
6. 验证两套 CPU 的 18 个原生依赖文件（包括 Office/PDF 可能使用的 Canvas 与 Vectorizer）并生成 universal DMG。
7. 挂载 DMG，检查 Info.plist、主程序、执行权限、`app.asar`、`x86_64`/`arm64` 架构和原生依赖。
8. 计算 SHA-256 并上传可下载 Artifact。

任一步失败都不能把该次产物交给同事。

### 5.1 本次已验证的失败模式

| 现象 | 根因 | 固化处理 |
|---|---|---|
| Mac 上 `yarn install --immutable` 报本地 `file:` 依赖校验变化 | vendor archive 元数据包含宿主平台差异 | 一次性 runner 先允许刷新，再立即执行 immutable 校验；不改变依赖版本，不回写仓库 |
| Electron runtime 测试仍期待 `2.0.6` | 测试写死旧版本 | 测试从 `dsh-plugin-desktop/package.json` 动态读取版本 |
| Office/PDF 闭包检查缺 OCR 数据 | `eng`、`chi_sim` traineddata 曾被 `.gitignore` 整目录排除 | 两个 gzip 文件、README 和哈希必须纳入 Git，禁止依赖开发机缓存 |
| Mac 重建 sidebar 后 Git 出现差异 | source map 包含宿主路径字节 | Windows 门禁生成并提交 bundle；Mac 只逐文件校验打包副本 |
| 修复实现正确但 CI 合约测试失败 | `package.spec.ts` 仍断言旧工作流 | 修改工作流时同步更新对应合约测试并在本地运行 |

排障顺序固定为：读取失败步骤和日志 → 归类为源码、依赖、平台产物或 CI 合约 → 做最小修复 → 本地运行相关测试与完整门禁 → 提交并推送 → 只重跑一次。失败邮件数量不是诊断依据。

## 6. 未签名内部版的预期行为

内部 DMG 不使用 Apple Developer ID，也不做 notarization。首次在另一台 Mac 打开时，Gatekeeper 可能拦截。先尝试在 Finder 中右键应用并选择“打开”；仍被拦截时可在确认 DMG 哈希正确后执行：

```bash
xattr -dr com.apple.quarantine "/Applications/锐捷 Harness.app"
```

不要关闭整台 Mac 的 Gatekeeper，也不要把签名失败伪装成已公证发布。

## 7. 真机验收

GitHub 全绿只能证明包结构和基础运行时正确，不能代替人工体验测试。至少准备一台 Apple Silicon Mac；如公司仍有 Intel Mac，再补测一台 Intel。

### 7.1 每次发布动态生成验收矩阵

本节后面的清单只是不能删除的最低回归基线，不是完整且固定的验收标准。每次打包前，发布模型必须以“上一个已经真机验收的发布 commit/tag”为基线，结合当前版本的真实 diff 生成当次验收矩阵：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git log --oneline <上次已验收提交>..HEAD
git diff --name-status <上次已验收提交>..HEAD
git diff --stat <上次已验收提交>..HEAD
```

不能只依据提交标题。必须阅读变更文件、对应测试、配置和迁移逻辑，并把当次矩阵写入构建记录或最终交付说明。每一行至少包含：`编号 / 功能或风险 / 变更依据 / 测试环境 / 操作 / 预期结果 / 证据 / 结果`。

动态矩阵必须覆盖三层：

1. **历史回归**：本节最低基线全部保留，证明上一版正常功能在新包中仍可使用。
2. **本次增量**：每个新增或修改功能至少包含正常路径、关键异常路径和重启/升级后的持久化路径；修复 bug 时必须复现原失败条件并证明不再发生。
3. **相邻影响**：根据依赖和调用关系测试受变化间接影响的功能。例如 sidebar 变化同时回归 Office、PDF、浏览器和关闭/收起；模型适配器变化同时回归普通文本、工具调用、上下文恢复和推理模式。

功能被删除或行为被改变时，必须有用户明确授权，并在矩阵中写出新预期；不能通过删除旧验收项把回归包装成通过。打包前冻结矩阵，打包后在最终安装的 DMG 上执行；开发版测试不能替代安装包验收。若无法确定上次已验收提交，先从旧包的 `BUILD-MANIFEST.txt`、发布快照或 GitHub run 追溯，无法追溯时按全部最低基线加全部可见变更验收。

必须验证：

- 新用户首次启动不出现旧版新手引导，默认模型为 `deepseek-vision / deepseek-v4-flash / low`。
- 用户手动选择模型或推理强度后，重启应用、进入已有上下文或新建无上下文对话都继续使用用户选择；升级不得覆盖。
- 登录、会话、新建任务和本地文件选择正常。
- 右侧栏能展开、收起、关闭标签。
- Word、Excel、PPT、PDF 能打开。
- 内置浏览器普通 HTTPS、`target=_blank` 链接和返回/前进正常。
- `browser_search` 与真实 `web_search` 分别有效；对同一关键词或同一 URL 连续执行两次时，第二次也必须触发当前 webview 重新加载。
- 终端使用 Mac 的 bash/zsh，不出现 PowerShell 或 Windows ACL 错误。
- 关闭重启后缓存、登录状态和会话数据符合预期。
- 升级测试保留原有 `~/.dsh`，确认登录、历史会话、用户已选模型/推理强度、市场来源、安装回执和用户安装的插件不丢失；`profiles/desktop/node_modules/dsh-better-sidebar` 必须是指向新版应用依赖的软链接，不能继续加载旧实体副本。
- 在专用测试账户关闭应用并删除整个 `~/.dsh`，再次启动必须自动重建 profile 与设置文件，无需手工创建目录。
- 全新 profile 的插件市场默认已有并启用 `DSH 1024Store`；用户仍可添加标准 manifest 来源、切换、禁用或移除来源。已有 `dsh-community-market.sources`（包括空数组）升级时不得被重置或追加。
- 浏览器授权回调显示锐捷 Harness 完成页；即使 Safari/Chrome 阻止脚本自动关页，也有“可关闭并返回应用”的可见提示。
- 通过 shell/Python/Notebook 间接生成文件后，先确认文件存在，再用一次 `artifact_register` 登记该轮所有最终产物，尤其不能漏掉 PDF；不要重复登记文件写入工具已经报告的文件。PDF 必须在对话中变为可点击产物、进入右侧预览，并在约 2 秒内自动出现在 Files 面板。
- “在文件夹中显示”由 Finder 处理，不被侧栏编辑器当成普通文件。

使用 Puppeteer 连接已运行的桌面端做验收时必须设置 `defaultViewport: null`，避免测试工具把原生窗口强制成 `800×600` 的渲染 viewport，制造右侧空白和缩放错位。

上述产物链路使用 rc.8 的 `owner.turn.data.get('deliverables')`，不要回退到 rc.7 的 `owner.nodes`。模型流若同时返回原生 `tool_calls` 与旧 DSML 包络，旧包络必须被过滤，避免正文重复爆量。

macOS 默认应用数据位于当前用户的 `~/Library/Application Support/` 下。真机验收时记录实际生成的产品目录名称，确认后再补入本手册，不能在 Windows 上猜测。

## 8. 发布判定

只有同时满足以下条件才称为“Mac 内部可用版”：

- GitHub Actions 全部通过。
- 下载后的 SHA-256 与 `.sha256` 文件一致。
- 至少一台 Apple Silicon 真机完成第 7 节验收。
- 当次动态验收矩阵中的历史回归、本次增量和相邻影响项目全部有结果与证据；任何必测失败都已解决或明确阻止发布。
- 已记录未通过项，并区分产品缺陷、Gatekeeper 限制和公司网络限制。

在真机验收之前，只能称为“已生成并自动验证的 Mac 候选包”。

## 9. 已验证候选包快照（2026-08-22）

- GitHub run：`32572940702`
- 源码提交：`8492550572e9df150c2f8efa9a04becb78fbd8ae`
- Artifact：`Ruijie-Harness-2.0.7-macOS-universal`
- DMG：`Ruijie-Harness-2.0.7-macOS-universal.dmg`
- 大小：`405965986` bytes（387.16 MiB）
- SHA-256：`4d60004c6359bc3cdf3f7b0f350d05758ecfac327cd756246454855af22a411c`
- 架构：universal（`x86_64 + arm64`）
- 状态：GitHub 自动门禁通过；unsigned、未 notarize；仍待 Mac 真机完成第 7 节验收

快照用于追溯，不替代动态读取版本与重新计算哈希。新构建不得复制此哈希。

## 10. 交付与手册回写

完成一次构建后，最终回复必须给出：源码 commit、run 链接、Artifact 名称、DMG 绝对路径、bytes/MiB、SHA-256、架构、签名/公证状态、自动门禁结果、真机验收结果与跳过项。只有实际完成真机验收后才能写“Mac 内部可用版”。

每次发布结束都要做一次手册审查，但只把可复现、能改变后续操作的经验写回：

1. 新失败是否有明确日志、根因和稳定修复；有则更新第 5.1 节或对应步骤。
2. 路径、脚本、工作流、版本来源或产物名称是否改变；有则修改唯一权威位置并删除旧说法。
3. 新门禁是否已落入脚本/测试；手册引用正式入口，不复制易过期的实现细节。
4. 新功能是否形成以后每版都应保留的核心能力；是则加入第 7 节最低回归基线，否则只保留在当次动态矩阵。
5. 单次网络抖动、runner 偶发慢速和未经证实的猜测只记录在当次交付说明，不写成永久规则。
6. 文档修改后运行 `git diff --check`，审查 diff，并与相关源码在同一发布提交中推送。
