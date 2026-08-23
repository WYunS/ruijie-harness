# 锐捷 Harness macOS 打包指导

用途：交给完全不了解项目上下文的大模型或发布人员，从唯一源码稳定生成 unsigned、未公证、同时支持 Intel 与 Apple Silicon 的内部 DMG。本文件只负责源码准备、构建、自动门禁和产物交付；真人验收统一执行同目录的 `03-macOS真人验收测试指导.md`。

## 1. 唯一源码与发布入口

- 本地仓库：`D:\ChatGPT\RuijieDSH`
- 桌面应用：`D:\ChatGPT\RuijieDSH\dsh-plugin-desktop`
- GitHub：`https://github.com/WYunS/ruijie-harness.git`
- 正式源码分支：本地 `main` → `ruijie/main`
- GitHub Action：`.github/workflows/macos-internal-build.yml`
- 构建命令：`corepack yarn dist:mac-internal`
- 输出目录：`dsh-plugin-desktop/dist/mac-internal`
- 版本来源：`dsh-plugin-desktop/package.json`

Windows 与 macOS 共用 `main` 上的业务源码。平台差异放入 `process.platform` 分支、Electron 平台策略或 Mac 专属打包模块；不维护长期 `mac branch`，也不复制 `RuijieDSH-M` 源码目录。`origin` 是上游项目，只读；个人发布远端是 `ruijie`。

旧 DMG 是不可变文件，后来修改源码不会反向修复旧包。共享运行时发生变化时，应提升版本并重新生成受影响平台的产物，不能让内容不同的 EXE 和 DMG 使用同一版本号。

## 2. 每次先形成“固定 + 动态”打包计划

### 2.1 固定基线

每次必须执行：确认唯一仓库与分支、检查工作树和子模块、安装锁定依赖、验证 vendor、完整 `yarn check`、Mac 专项测试、universal 原生依赖检查、DMG 构建、最终 `.app` 自动验收、哈希与构建清单生成、Artifact 上传。

### 2.2 动态增量

找到上次已交付 Mac 构建的 commit/tag，读取到当前 `HEAD` 的真实差异：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git log --oneline <上次发布提交>..HEAD
git diff --name-status <上次发布提交>..HEAD
git diff --stat <上次发布提交>..HEAD
```

同时读取用户直接说明的本版新增、修改和修复内容。Git diff 与用户说明取并集，形成当次打包计划：

- 共享业务代码：Windows 与 Mac 都受影响，检查是否需要双平台重打和提升版本。
- Mac 平台代码、原生依赖或窗口行为：追加对应 Mac 门禁。
- sidebar/vendor：重建并核对源码、生成文件、安装副本和 `yarn.lock`。
- Office/PDF/OCR：核对插件闭包、原生依赖和 OCR 数据。
- 登录、模型、浏览器、WebSearch、存储迁移：为最终 DMG 的自动与真人验收追加风险项。
- 仅文档或测试：仍运行适用门禁，但不虚构产品功能变化。
- 无法归类的运行时变化：暂停打包，先读实现和调用关系并补充门禁。

完成条件：每个变更文件已经归类，每个产品变化都有验证入口，版本和受影响平台的重打决定有记录。

## 3. 开工前保护现场

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git status --short --branch
git branch --show-current
git rev-parse HEAD
git remote -v
git submodule status --recursive
Get-Content -LiteralPath '.\dsh-plugin-desktop\package.json' -Raw |
  ConvertFrom-Json | Select-Object name,version
node --version
corepack yarn --version
```

通过条件：

- 根目录是 `D:/ChatGPT/RuijieDSH`，分支和目标 commit 明确。
- Node 为 `22.19+` 或 `24.x`，Yarn 由 Corepack 启动并符合仓库锁定版本。
- `deepseek-harness` 子模块固定到仓库记录的 commit。
- 已记录用户原有未提交改动，不使用 reset、checkout 或清理命令覆盖。
- 本轮应进入 DMG 的改动已经提交；GitHub 只读取提交内容。

## 4. 本地固定门禁

按顺序执行：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
corepack yarn install --immutable
corepack yarn workspace dsh-plugin-desktop build:vendor-sidebar
corepack yarn workspace dsh-plugin-desktop verify:vendor-sidebar
corepack yarn check
corepack yarn workspace dsh-plugin-desktop vitest run tests/mac-universal.spec.ts tests/package-mac.spec.ts tests/verify-mac-smoke.spec.ts tests/verify-packaged-runtime.spec.ts tests/electron-runtime.spec.ts tests/profile.spec.ts tests/desktop-plugins.spec.ts tests/sidebar-produced-files.spec.ts tests/window-options.spec.ts tests/mac-installed-acceptance.spec.ts
corepack yarn workspace dsh-community-market vitest run tests/contracts.spec.ts tests/market-install.spec.ts tests/market-settings-persistence.spec.ts
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/eng.traineddata.gz
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/chi_sim.traineddata.gz
git diff --check
```

若有意修改 `vendor/dsh-better-sidebar/src`，先审查生成后的 `lib`，再执行一次 `corepack yarn install` 更新 file dependency 哈希和 `yarn.lock`，随后重新运行 immutable 安装、构建和验证。源码、生成后的 `lib`、安装副本和锁文件必须一致。

Mac runner 上 `file:` 依赖可能因宿主 archive 元数据产生哈希差异。工作流允许一次刷新后必须立即再次执行 `yarn install --immutable`，证明依赖图稳定；不能删除第二次校验，也不能在 Mac runner 重建 Windows 生成的 sidebar bundle。

完成条件：所有命令退出码为 0，工作树只含本轮明确改动，没有旧 bundle、缺失 OCR 数据或未提交生成物。

## 5. 提交与上传

提交前再次执行：

```powershell
git status --short
git diff --check
git diff --name-status <上次发布提交>..HEAD
```

提交信息应说明实际根因或交付变化。获得用户明确授权后才执行：

```powershell
git push ruijie main
```

推送后记录准确 commit。不要向 `origin` 推送，不要在原因未知时反复提交或启动 Action。

## 6. GitHub Actions 打包

手动工作流：`Build macOS Internal DMG`。

```powershell
gh auth status
gh workflow run macos-internal-build.yml --repo WYunS/ruijie-harness --ref main
gh run list --repo WYunS/ruijie-harness --workflow macos-internal-build.yml --limit 5
gh run watch <run-id> --repo WYunS/ruijie-harness --exit-status
```

工作流固定执行：

1. 递归检出源码与子模块。
2. 安装并锁定依赖。
3. 完整代码门禁和 sidebar 连续性测试。
4. 准备并校验 x86_64、arm64 两套原生依赖。
5. 生成 universal unsigned DMG。
6. 挂载 DMG、复制最终 `.app`，运行动态安装后验收。
7. 上传自动验收矩阵、截图、日志、报告、DMG、SHA-256 和构建清单。

工作流会先上传 `Ruijie-Harness-macOS-candidate-<run-id>`，再执行安装后验收。若产品源码、依赖和打包配置未变，只有验收脚本需要修正，不要重新构建或重跑已经通过的 release checks；在 Actions 手动运行页把 `candidate_run_id` 填为产生候选 DMG 的旧 run ID，工作流会下载并复用完全相同的 DMG，只运行安装后验收。首次生成新候选包但本轮只有验收工具变化时，可勾选 `skip_release_checks`；只要产品源码、依赖、vendor bundle 或打包配置发生变化，就不得跳过这些门禁，也不得复用旧 DMG。

一次只运行一个目标构建。失败后先执行：

```powershell
gh run view <run-id> --repo WYunS/ruijie-harness --log-failed
```

明确根因、完成最小修复、本地门禁通过后只重跑一次。构建耗时较长或 Artifact 下载暂时无输出不等于失败。

## 7. 产物下载与机器校验

Artifact 必须包含：

- `Ruijie-Harness-<version>-macOS-universal.dmg`
- 同名 `.sha256`
- `BUILD-MANIFEST.txt`
- `acceptance-evidence/ACCEPTANCE-PLAN.md` 与 JSON
- `acceptance-evidence/ACCEPTANCE-REPORT.md` 与 JSON
- 首启、完整操作后、重启及失败时的截图和日志

下载后重新计算哈希：

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

自动验收通过后仍只能称为“Mac 候选包”。随后完整执行 `03-macOS真人验收测试指导.md`；真人验收通过后才能称为“Mac 内部可用版”。

## 8. 未签名内部版

当前内部版没有 Apple Developer ID，也不做 notarization。首次打开可能被 Gatekeeper 拦截。先在 Finder 中右键应用并选择“打开”；确认 DMG 哈希正确仍被拦截时，可执行：

```bash
xattr -dr com.apple.quarantine "/Applications/锐捷 Harness.app"
```

不要关闭整台 Mac 的 Gatekeeper，也不要把 unsigned 写成已签名或已公证。

## 9. 交付记录

最终记录必须包含：源码 commit、GitHub run 链接、Artifact 名、DMG 绝对路径、bytes/MiB、SHA-256、架构、签名/公证状态、本地门禁、自动安装验收、真人验收状态和未执行项。

旧构建快照只用于追溯，版本、路径和哈希必须从本次产物动态读取，不能复制旧值。

## 10. 每次使用结束后的按需优化

打包结束后必须审查本文件，但不要求机械修改。仅在以下情况更新：

1. 新失败可稳定复现，并已有明确根因、修复和验证命令。
2. 路径、构建入口、版本来源、Artifact 结构或权限流程改变。
3. 新门禁已进入正式脚本或测试。
4. 某项动态风险以后每版都存在，应提升为固定基线。
5. 某条指示使执行者误用了分支、旧 bundle、旧版本或错误产物。

单次网络抖动、runner 偶发慢速和未经证实的猜测只写入当次构建记录。更新后执行 `git diff --check`，与 Windows 指导和真人验收指导交叉核对，并把有价值的经验与对应代码一同提交。
