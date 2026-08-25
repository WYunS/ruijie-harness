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

目标不是机械生成 DMG，而是让最终 `.app` 具备当前本地源码已经确认的新功能。每项功能都必须从发布 commit 追踪到配置挂载、直接依赖与 `yarn.lock`、universal 打包闭包、最终安装副本和对应验收证据；只在开发 checkout、缓存或间接依赖中存在的能力不算进入候选包。

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
- IM 交付或生成文件链路：除文件本身外，核对 `dsh_im_return_file` 的 produced-file 展示元数据，追加“本次产出”可点击与右侧栏预览回归。
- 登录、模型、浏览器、WebSearch、存储迁移：为最终 DMG 的自动与真人验收追加风险项。时间、时区或其他模型可见运行时上下文改动必须额外覆盖直接问答、基于“今天”的搜索词、新旧会话、重启边界和最终 `.app` 依赖闭包。
- 更新逻辑、版本接口、下载地址或安装脚本：追加后台检查、用户拒绝/重试、私有目录下载、DMG 打开、旧数据保留和网站 curl 安装回归；Windows 与 Mac 必须保持同一稳定版本。
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
corepack yarn workspace dsh-plugin-desktop vitest run tests/mac-universal.spec.ts tests/package.spec.ts tests/package-mac.spec.ts tests/verify-mac-smoke.spec.ts tests/verify-packaged-runtime.spec.ts tests/electron-runtime.spec.ts tests/profile.spec.ts tests/desktop-plugins.spec.ts tests/sidebar-produced-files.spec.ts tests/window-options.spec.ts tests/mac-installed-acceptance.spec.ts tests/ruijie-auth.spec.ts tests/ruijie-login-window.spec.ts tests/time-context-runtime-patch.spec.ts tests/ui-appearance-runtime-patch.spec.ts tests/appearance-compatibility.spec.ts tests/dsh-im-runtime-patch.spec.ts tests/sidebar-shortcuts.spec.ts tests/system-proxy.spec.ts tests/search-recovery.spec.ts tests/search-recovery-presentation.spec.ts tests/update-checker.spec.ts tests/update-download.spec.ts tests/updates.spec.ts
corepack yarn workspace dsh-community-market vitest run tests/contracts.spec.ts tests/market-install.spec.ts tests/market-settings-persistence.spec.ts
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/eng.traineddata.gz
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/chi_sim.traineddata.gz
git diff --check
bash -n scripts/install-macos.sh
```

`dsh_im_return_file` 成功只代表文件已登记给 IM，不天然代表桌面端已把它识别为本轮产物。最终 `@xmanrui/dsh-im/lib/index.js` 必须经过 `scripts/patch-dsh-im-runtime.mjs`，使该工具的 `presentCall` 返回 generic edit card 和原始文件 `locations`；否则会出现磁盘上已有 PDF、工具提示成功，但“本次产出”缺失且最终文件名不可点击的回归。上面的 `tests/dsh-im-runtime-patch.spec.ts` 是打包门禁，不能从 Mac 专项命令中删除。

候选 `.app` 的动态验收必须让真实模型通过 Python 或终端生成一个中文文件名 PDF，再调用 `dsh_im_return_file` 交付。只有同时看到“本次产出”的可点击 PDF，并能在右侧栏打开，才算通过；磁盘存在、聊天正文出现文件名或 `Registered ... for IM delivery` 均不能单独作为证据。

若有意修改 `vendor/dsh-better-sidebar/src`，先审查生成后的 `lib`，再执行一次 `corepack yarn install` 更新 file dependency 哈希和 `yarn.lock`，随后重新运行 immutable 安装、构建和验证。源码、生成后的 `lib`、安装副本和锁文件必须一致。

Mac runner 上 `file:` 依赖可能因宿主 archive 元数据产生哈希差异。工作流允许一次刷新后必须立即再次执行 `yarn install --immutable`，证明依赖图稳定；不能删除第二次校验，也不能在 Mac runner 重建 Windows 生成的 sidebar bundle。

`verify:profile` 必须保留历史 profile 回归夹具：第三方插件在 profile 中实体化 `@deepseek-ai/cordis`、`dsh-scope`、`dsh-system-prompt` 等框架依赖时，启动应自动改用当前 `.app` 内的唯一框架实例，同时保留插件自身。出现 `duplicate deployment:persona`、旧会话无法打开、模型选择无响应、新建会话或工作区选择无响应，均视为产品/打包阻断问题，不能要求用户删除 `~/.dsh` 规避。

时间上下文门禁必须同时证明：desktop profile 组合后恰好存在一个已启用的 `@deepseek-ai/dsh-time-context` row；desktop deploy root 把它声明为直接生产依赖；packaged-runtime verifier 能从最终 `.app` 的物理运行树解析其 `package.json` export；构建已执行 `patch-dsh-time-context-runtime.mjs`，最终运行文件明确要求相对日期和搜索/工具参数采用权威时间戳，并忽略训练数据或早先消息中的冲突年份。任一缺失都阻断 DMG。真实日期回答和“今天”搜索语义由同目录真人验收指导执行，不能用模拟登录或静态包存在性冒充通过。

内置插件门禁必须同时证明 `dsh-ui-appearance@0.1.4` 与 `@xmanrui/dsh-im@2.0.0` 是 desktop deploy root 的精确生产依赖，组合后分别只有一个已启用的 `ui-appearance`、`im-channels` row，并能从最终 `.app` 物理运行树解析两个包；旧 `dsh-lark-channel` 不得残留。二者必须随 DMG 提供，不能依赖开发机插件缓存或要求员工从市场补装。`verify:licenses` 与 notices 必须覆盖新增闭包；`@tencent-connect/qqbot-connector@1.2.0` 只允许准确包名的业务批准例外并须如实标记为 `UNLICENSED (business-approved exception)`，不得放宽全局许可证白名单或伪造许可证。

全新 profile 启动后，九个 IM 渠道必须全部休眠：不打开浏览器、不弹授权窗/二维码、不连接外部平台、不反复提示凭据。用户只有主动点击侧栏“IM机器人”（位于设置正上方）或进入“设置 → 插件 → IM机器人”、选择渠道并点击添加/接入后，才进入扫码、Token 或应用凭据配置；取消或关闭后不得自动重开。账号/额度位于 IM 上方；“IM机器人”必须与原生“设置”使用相同文字颜色、行高和左边界，机器人与齿轮图标视觉尺寸一致，点击必须直达 IM 配置而非插件市场。外观位于“通用设置”顶部并明确命名为“界面外观（颜色、壁纸与透明度）”，收起状态也要显示“一键恢复默认”；修改多项外观后点击它应一次回到原版且不清除登录、会话或 IM 配置。改变强调色不得改变原版用户消息气泡颜色。各平台凭据不得打入 DMG。搜索及普通工具恢复都属于固定门禁：备用方式成功后继续完成任务，主“对话”视图不显示中间失败行、红/黄状态、错误文字或 `Error` 技术文本；完整失败详情只在“轨迹”和日志中可追溯。仅整个回合最终失败时显示原有红色终局错误。WhatsApp 代理实现必须使用 desktop deploy root 直接声明的 `https-proxy-agent@7.0.6`，最终 `.app` 物理运行树必须可解析该包，不能引用上游压缩 bundle 的临时变量名。主动生成二维码遇到断网、无效代理或服务异常时必须留在 IM 页面并显示可读错误，不得退出或重启 `.app`，也不得显示 `ReferenceError` 或 RPC schema 校验 JSON；代理兼容不能破坏无代理网络或应用启动。

联网降噪不得靠关闭 `web_search`、ModSearch 或浏览器工具通过。最终 `.app` 的自动验收负责证明工具和呈现链路仍在，真人验收必须用“联网搜索今天 AI 圈发生的大事”证明真实 `web_search` 返回来源、多个来源可读取、`browser_search` 可见且同词重搜会重新加载；再用确定不可访问的 URL 证明失败后换路完成、“对话”静默而“轨迹”保留证据。正常搜索缺失时不得因界面无红字而放行。

登录窗口门禁还必须覆盖本版平台差异：回调完成页和等待进度使用应用图标的蓝紫渐变；Windows 使用自绘右上角关闭按钮，并由主进程处理真实窗口关闭，不能依赖渲染页 `window.close()`；最终 macOS `.app` 必须保留可用的原生左上角交通灯关闭，不得同时叠加 Windows“×”。两种平台都必须实点后确认窗口消失、本次启动结束且不会立即重弹授权。回调后的账号验证与工作台启动必须分阶段呈现，账号服务请求有界超时；这些行为要进入 `ruijie-auth`、`ruijie-login-window`、`package-mac` 和最终安装副本验收，不能只检查源码字符串。

更新门禁必须证明 `desktop-updates.config.enabled: true` 已进入最终 profile，正式 `.app` 启动约 60 秒后会检查固定 HTTPS 版本接口，用户确认后把 DMG 下载到 Electron userData 的私有 `updates` 目录并自动打开，不出现保存路径选择框。macOS 内部包未签名、未公证，因此应用内更新只负责发现、下载和打开 DMG，不能宣称会静默替换 `/Applications`。`scripts/install-macos.sh` 必须通过 `bash -n`，并核对脚本只接受 macOS、校验 DMG 与 bundle id、拒绝覆盖运行中的应用、使用暂存和备份完成替换、失败时恢复旧应用，且不关闭 Gatekeeper、不自动清除 quarantine。

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

### 6.1 三种运行模式

每次运行前先判断改动范围，只能选择以下一种模式：

| 模式 | Action 输入 | 适用条件 | 完成条件 |
|---|---|---|---|
| 全量新候选 | 三项输入均留空 | 产品源码、依赖、vendor、打包配置或版本发生变化 | 完整门禁通过，生成并保存新的 candidate Artifact，自动验收形成完整证据和阶段判定 |
| 省略已通过的发布门禁 | `skip_release_checks=true`，其他留空 | 同一产品源码范围内只改验收工具，且本轮仍需重新生成候选 DMG | 必须执行 `yarn build` 生成 `lib/`，保存新 candidate，自动验收形成完整证据和阶段判定 |
| 复用候选并续验 | `candidate_run_id=<候选 run>`；只有已有可靠基线证据时才加 `acceptance_resume_run_id=<证据 run>` | DMG、产品源码、依赖、vendor 与打包配置均未变化，失败仅来自验收脚本或后续阶段 | 下载的是同一候选 DMG；从最近可信断点续验，最终形成完整证据和阶段判定 |

命令行示例：

```powershell
# 全量新候选
gh workflow run macos-internal-build.yml --repo WYunS/ruijie-harness --ref main

# 只改验收工具，但仍重新生成候选 DMG
gh workflow run macos-internal-build.yml --repo WYunS/ruijie-harness --ref main -f skip_release_checks=true

# 复用同一候选，只从失败点继续；没有可延续证据时不要传 acceptance_resume_run_id
gh workflow run macos-internal-build.yml --repo WYunS/ruijie-harness --ref main `
  -f candidate_run_id=<候选run-id> `
  -f acceptance_resume_run_id=<已有基线证据run-id>
```

`candidate_run_id` 指向“产生并保存 DMG 的 run”；`acceptance_resume_run_id` 指向“已有可审计验收证据的 run”。两者可以相同，也可能不同，不能仅因编号相近就混用。复用前核对 candidate 的 `CANDIDATE-MANIFEST.txt`、DMG 文件名、版本、bytes、SHA-256 与预期源码范围；任何一项不一致都回到全量新候选。

工作流固定执行：

1. 递归检出源码与子模块。
2. 安装并锁定依赖。
3. 完整代码门禁和 sidebar 连续性测试。
4. 准备并校验 x86_64、arm64 两套原生依赖。
5. 生成 universal unsigned DMG。
6. 挂载 DMG、复制最终 `.app`，运行固定基线与动态增量的安装后验收。固定基线必须包含登录等待窗的 macOS 原生关闭、时间上下文安装闭包、外观与一键恢复、侧栏 IM 入口与默认休眠、可恢复错误降噪，以及更新插件启用与私有下载路径；不能只测旧版工作台、文件和浏览器基线。
7. 上传自动验收矩阵、截图、日志、报告、DMG、SHA-256 和构建清单。

工作流会先上传 `Ruijie-Harness-macOS-candidate-<run-id>`，再执行安装后验收。候选上传必须发生在验收之前：即使后续脚本失败，DMG 仍可复用，不得让一次 UI 定位错误迫使完整重打。自动流程走完后按验收指导第 5 节作两态判定；只有判定“允许进入下一步”才把 candidate 作为待交付候选。稳定命名的 `Ruijie-Harness-<version>-macOS-universal` Artifact 通常在工作流成功时产生；若工作流因低影响例外未产生稳定 Artifact，可交付经哈希确认的 candidate，同时连同完整验收报告说明例外。candidate 是可复用的原始候选，稳定 Artifact 则额外汇集 SHA-256、构建清单和验收证据。

若产品源码、依赖和打包配置未变，只有验收脚本需要修正，不要重新构建或重跑已经通过的 release checks。只要产品源码、依赖、vendor bundle 或打包配置发生变化，就不得跳过这些门禁，也不得复用旧 DMG。

一次只运行一个目标构建。失败后先执行：

```powershell
gh run view <run-id> --repo WYunS/ruijie-harness --log-failed
```

先下载轻量的验收证据，依据首个失败截图、DOM snapshot、stdout、stderr 和报告区分产品缺陷、打包缺陷、验收脚本缺陷与环境问题。验收器问题完成最小修正并通过本地测试后，从最近可信断点续验；产品源码或打包问题则先完成报告并等待用户决定下一轮，不能在本轮擅自修改。禁止不看证据连续触发新 run。构建耗时较长或 Artifact 下载暂时无输出不等于失败，网页显示 Artifact 已生成时不需要启动另一个构建。

## 7. 判定后的产物下载与机器校验

下载完整 DMG 前必须先完成验收报告，并按 `03-macOS真人验收测试指导.md` 第 5 节给出两态判定：

- **允许进入下一步**：下载稳定 Artifact；若只有 candidate，则下载 candidate、校验文件与完整验收证据。完成本地哈希核验后交给真人测试。
- **阻断，不进入下一步**：保留 GitHub 上的 candidate、run 链接和证据，不下载 DMG 作交付。先向用户提交验收报告、阻断问题和建议的下一轮工作，等待用户决定是否修复源码并重新打包。

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

如果大文件下载持续无进度或速度明显低于用户从 GitHub 页面手动下载，不要让下载阻塞整项任务。安全停止下载进程，但保留已完成的构建和云端 Artifact；先完成报告、指导更新、提交推送、证据整理和仓库状态检查等所有不依赖本地 DMG 的工作。随后一次性告诉用户：GitHub run 链接、应下载的准确 Artifact 名、其中必须包含的文件、目标绝对目录，以及下载完成后的核验动作。用户反馈完成后再继续本地哈希与清单核验；若没有本地核验需求，交接说明发出后即可结束任务。

阶段判定允许进入下一步后仍只能称为“Mac 候选包”。随后完整执行 `03-macOS真人验收测试指导.md`；真人验收作出“允许内部上线/发布”判定后才能称为“Mac 内部可用版”。

### 7.1 更新服务与 curl 安装脚本发布

DMG 通过机器校验后，按 `04-自动更新服务器交接.md` 操作：上传版本化 DMG 和 Windows EXE，核对远端大小与 SHA-256，更新两个下载入口和网页，最后才提高版本接口。只上传 DMG 或先提高版本号都会让另一平台收到无法完成的更新，必须阻断。

把仓库中的 `scripts/install-macos.sh` 原样发布到 `https://www.dshdesktop.cn/install-macos.sh`，检查响应为脚本文本且没有被网页模板包裹。先下载到本地审阅并执行 `bash -n`，再在获得安装授权的专用 Mac 上验证：

```bash
curl -fsSL https://www.dshdesktop.cn/install-macos.sh | /bin/bash
```

脚本用于首次安装或应用已退出时的覆盖安装，不是应用内后台更新器。它应从 `/api/downloads/mac` 获取当前 DMG，核对 bundle id 后替换 `/Applications/锐捷 Harness.app`；无写权限时允许 `sudo` 请求本机管理员密码。未签名内部版首次打开仍按第 8 节处理，严禁在脚本中关闭 Gatekeeper。

## 8. 未签名内部版

当前内部版没有 Apple Developer ID，也不做 notarization。首次打开可能被 Gatekeeper 拦截。先在 Finder 中右键应用并选择“打开”；确认 DMG 哈希正确仍被拦截时，可执行：

```bash
xattr -dr com.apple.quarantine "/Applications/锐捷 Harness.app"
```

不要关闭整台 Mac 的 Gatekeeper，也不要把 unsigned 写成已签名或已公证。

## 9. 交付记录

最终记录必须包含：源码 commit、GitHub run 链接、Artifact 名、DMG 绝对路径或云端位置、bytes/MiB、SHA-256、架构、签名/公证状态、本地门禁、自动安装验收、更新三个接口与 curl 脚本状态、通过/失败/阻塞/未执行数量、两态阶段判定、判定理由、真人验收状态和未执行项。

旧构建快照只用于追溯，版本、路径和哈希必须从本次产物动态读取，不能复制旧值。

安装、替换 `/Applications` 中的现有应用以及删除真实 `~/.dsh` 均需用户在本轮明确授权。只要求构建 DMG 时，不得把真人验收章节当成安装或清理授权；应交付候选包并明确列出未执行的真人项目。

## 10. 每次使用结束后的按需优化

打包结束后必须审查本文件，但不要求机械修改。仅在以下情况更新：

1. 新失败可稳定复现，并已有明确根因、修复和验证命令。
2. 路径、构建入口、版本来源、Artifact 结构或权限流程改变。
3. 新门禁已进入正式脚本或测试。
4. 某项动态风险以后每版都存在，应提升为固定基线。
5. 某条指示使执行者误用了分支、旧 bundle、旧版本或错误产物。

单次网络抖动、runner 偶发慢速和未经证实的猜测只写入当次构建记录。更新后执行 `git diff --check`，与 Windows 指导和真人验收指导交叉核对，并把有价值的经验与对应代码一同提交。
