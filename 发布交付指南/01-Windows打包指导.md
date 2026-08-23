# 锐捷 Harness Windows 打包指导

用途：交给完全不了解项目上下文的大模型或发布人员，确保从唯一正确源码构建正式 Windows 安装包，并验证安装后的体验与本地开发版一致。macOS 打包和真人验收分别使用同目录的另外两份指导。

## 1. 唯一可信位置

- 仓库根目录：`D:\ChatGPT\RuijieDSH`
- Windows 桌面端目录：`D:\ChatGPT\RuijieDSH\dsh-plugin-desktop`
- 正式安装包目录：`D:\ChatGPT\RuijieDSH\dsh-plugin-desktop\dist`
- 正式安装包命名：`Ruijie-Harness-<package.json version>-x64-Setup.exe`
- 不得从旧原型目录 `D:\ChatGPT\锐捷Codex\rj-deepseek-harness-prototype` 构建。

版本号以 `dsh-plugin-desktop\package.json` 为唯一事实来源，不要从聊天记录、旧 EXE 名称或备份目录猜测。

第 12 节只保存已经核实过的历史产物快照，不代表当前待发布版本。当前版本必须动态读取 `package.json`。内部发布的预期签名状态为 `NotSigned`。

任何源码变化都会使上述哈希失效。新构建必须重新计算，不能复用旧哈希。

Windows 与 macOS 共用 `main` 上的业务源码。不要复制一套长期的 Windows 源码目录，也不要从所谓 `win branch` 猜测最新版。平台差异应保留在 `process.platform` 分支、Windows 专属模块和 `scripts/package-win.ts` 中。共享运行时或资源变化后，先判断两个平台是否都受影响；需要双平台重发时提升版本号，不能让内容不同的 EXE 与 DMG 共用同一版本号。

## 2. 本机双版本隔离

本地开发版与正式安装版允许共存，但入口和持久化目录必须保持如下分工：

| 项目 | 本地开发版 | 正式安装版 |
|---|---|---|
| 桌面快捷方式 | `锐捷 Harness (本地开发版).lnk` | `锐捷 Harness.lnk` |
| 程序位置 | `D:\ChatGPT\RuijieDSH` | `%LOCALAPPDATA%\Programs\Ruijie-Harness` |
| DSH_HOME | `D:\ChatGPT\RuijieDSH\.local-data\dsh-home` | `%USERPROFILE%\.dsh` |
| Electron userData | `D:\ChatGPT\RuijieDSH\.local-data\electron-user-data` | Electron 的当前用户默认 AppData 目录 |

本地入口由 `scripts\install-ruijie-dsh-desktop-shortcut.ps1` 创建。该脚本必须继续设置独立的 `DSH_HOME` 与 `RUIJIE_DSH_USER_DATA_DIR`，并使用带“本地开发版”后缀的快捷方式名称，避免安装器覆盖。

正式 EXE 测试时保持默认安装路径、默认桌面快捷方式和默认数据目录；不要给它注入测试专用环境变量，否则测不到同事实际安装体验。需要验证绝对干净的首次启动时，优先在同一电脑创建独立 Windows 测试账户。

## 3. 发布原则

交付的是正常同事实际下载安装的 unsigned x64 NSIS 正式安装包，不是 portable、smoke、test 或临时包。

发布目标是多数正常 Windows 电脑开箱即用。把问题分成三类：

1. 通用产品缺陷：在正常网络或本地夹具中可复现，必须修复并增加回归测试。
2. 常见环境兼容：系统代理、PAC、企业证书等有明确配置时，应尽量继承并提供诊断。
3. 个别环境限制：网络出口明确禁止公网时，给出准确错误和排查办法；不要关闭 TLS、安全沙箱或证书校验绕过企业策略。

## 4. 开工前保护现场

在仓库根目录执行只读检查：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git status --short
git branch --show-current
git rev-parse HEAD
git submodule status --recursive
git remote -v
git rev-parse --show-toplevel
Get-Content -LiteralPath '.\dsh-plugin-desktop\package.json' -Raw |
  ConvertFrom-Json | Select-Object name,version
node --version
corepack yarn --version
```

通过条件：

- Git 根目录必须是 `D:/ChatGPT/RuijieDSH`。
- Node 必须是 x64 的 `22.19+` 或 `24.x`；当前验证环境是 `24.12.0`。
- Yarn 必须由 Corepack 启动；当前锁定版本是 `4.18.0`。
- 记录工作树已有改动。它们可能属于用户，禁止通过 `git reset --hard`、`git checkout --` 或批量删除来“清理”。
- 确认本轮需要进入正式版的每项改动都在这个仓库内。
- 正式源码位于本地 `main`；个人发布远端为 `ruijie/main`（`https://github.com/WYunS/ruijie-harness.git`）。`origin` 是上游仓库，未经明确授权不要推送。
- 开始前记录上次 Windows 发布 commit。用 `git diff --name-status <上次发布提交>..HEAD` 审查所有后续变化，不能只看提交标题。

## 5. 防止打入旧 bundle

桌面端通过本地 `file:` 依赖装入以下包：

- `vendor\dsh-better-sidebar` → `dsh-plugin-desktop\node_modules\dsh-better-sidebar`
- `vendor\modsearch` → `dsh-plugin-desktop\node_modules\@liustack\modsearch`

打包实际读取安装后的 `node_modules`。修改 vendor 后如果没有同步，源码看起来是新的，EXE 仍可能装入旧 bundle。

安装依赖、重建侧栏并验证打包副本的标准入口如下；必须按顺序执行，不得自行拼临时 tsdown 配置：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
corepack yarn install --immutable
corepack yarn workspace dsh-plugin-desktop build:vendor-sidebar
corepack yarn workspace dsh-plugin-desktop verify:vendor-sidebar
```

`build:vendor-sidebar` 是仓库内唯一受支持的侧栏构建入口；它从 `vendor\dsh-better-sidebar\src` 生成 `lib`，并正确内联浏览器端 `clsx`。出现 `UNRESOLVED_IMPORT`、非零退出码或 `verify:vendor-sidebar` 报错都必须停止。验证脚本会逐文件比较 `vendor\dsh-better-sidebar\lib` 与 `dsh-plugin-desktop\node_modules\dsh-better-sidebar\lib`，并输出 `client.js` 的 SHA-256。

如果本轮有意修改了 sidebar 源码，首次构建会改变 file dependency 的内容哈希。此时在确认生成文件合理后执行一次 `corepack yarn install` 更新 `yarn.lock` 和安装副本，再重新执行 `corepack yarn install --immutable`、构建与验证；三条命令全部通过后才可继续。正式发布提交必须包含 sidebar 源码、生成后的 `vendor\dsh-better-sidebar\lib` 和对应 `yarn.lock`，缺一项都视为旧 bundle 风险。

完成条件：生成的 vendor 发布文件与 Electron 实际打包的安装副本逐文件一致，且从干净检出重新构建不会产生未提交的 sidebar `lib` 差异。

Office/PDF 的离线扫描识别依赖两个正式纳管的 OCR 文件。它们必须同时存在于源码和安装后的 file dependency，不能依赖开发电脑历史缓存：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/eng.traineddata.gz
git ls-files --error-unmatch vendor/dsh-attachment-formats/vendor/tessdata/chi_sim.traineddata.gz
Get-FileHash -Algorithm SHA256 -LiteralPath `
  '.\vendor\dsh-attachment-formats\vendor\tessdata\eng.traineddata.gz', `
  '.\vendor\dsh-attachment-formats\vendor\tessdata\chi_sim.traineddata.gz'
```

期望 SHA-256 分别为：

- `eng.traineddata.gz`：`45B4CB346724AC1774F1C36F42F182B887BCDB28EBE63E6FFF90AC41F3FCFF91`
- `chi_sim.traineddata.gz`：`B8A23F10C7DE500891EB458A8ADC9CC58AB7F242F08B7D149F5E9AEA4AD5DB7C`

若这些文件、其他共享 vendor 内容或 `yarn.lock` 在上次 Windows 构建后发生变化，现有 EXE 不会自动获得变化。必须明确决定保留旧版还是提升版本后重新打包。

开发 profile 还可能残留旧的 `profiles\desktop\node_modules\dsh-better-sidebar` 实体副本。启动准备阶段必须把它修复为指向当前 `dsh-plugin-desktop\node_modules\dsh-better-sidebar` 的 Junction；否则源码和打包依赖即使已经更新，实际 UI 仍会继续加载旧侧栏。

## 6. 上线前功能门禁

### 6.1 固定基线 + 动态生成当次验收标准

本节 6.2–6.7 是每版不能删除的固定回归基线，不是完整清单。每次打包前，发布模型必须找到上一个已经完成安装验收的 Windows 发布 commit/tag，并根据到当前 `HEAD` 的真实差异生成当次验收矩阵：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git log --oneline <上次已验收提交>..HEAD
git diff --name-status <上次已验收提交>..HEAD
git diff --stat <上次已验收提交>..HEAD
```

同时读取用户直接说明的“本版新增、修改、修复了什么”。Git diff 与用户说明取并集；一方没有提到的变化不能被另一方覆盖。必须阅读变更文件、对应测试、配置、数据迁移与依赖变化，不能只根据 commit 标题生成清单。矩阵写入当次构建记录或最终交付说明，每行至少包含：`编号 / 功能或风险 / 变更依据 / 测试环境 / 操作 / 预期结果 / 证据 / 结果`。

当次矩阵必须同时覆盖：

1. **历史回归**：本节最低基线全部执行，确认此前正常功能在新安装包中仍然正常。
2. **本次增量**：每个新增、修改或修复点覆盖正常路径、关键异常路径、重启与升级持久化；bug 修复必须复现旧失败条件。
3. **相邻影响**：按依赖和调用关系扩展验证。例如 sidebar 改动要同时回归 Office、PDF、浏览器、Files 与关闭/收起；模型适配器改动要同时回归普通对话、工具调用、已有上下文、新对话和推理模式；安装/数据目录改动要同时回归全新安装、升级、卸载和开发版隔离。

功能删除或行为变化必须有用户明确授权，并在矩阵中记录新预期。不能删除旧验收项来掩盖回归。打包前冻结矩阵，打包后在最终 Setup EXE 安装出的应用上逐项执行；开发版或 `win-unpacked` 结果不能替代最终安装包验收。若无法追溯上次已验收 commit，则按全部最低基线加全部可见变更验收，并明确记录基线不确定性。

运行完整检查：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
corepack yarn check
```

然后在 Windows 桌面端目录运行关键测试：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH\dsh-plugin-desktop'
corepack yarn vitest run tests/native-sidebar-browser.spec.ts tests/electron-runtime.spec.ts tests/office-document-plugins.spec.ts tests/profile.spec.ts tests/desktop-plugins.spec.ts tests/sidebar-produced-files.spec.ts
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
corepack yarn workspace dsh-community-market vitest run tests/contracts.spec.ts tests/market-install.spec.ts tests/market-settings-persistence.spec.ts
```

所有命令必须退出码为 0。测试输出中的失败、未处理拒绝和超时都算失败，不能只看最后是否生成 EXE。

### 6.2 首次启动

用新的空白用户数据目录验证：

- 不出现欢迎、视图选择或模型选择引导。
- 新用户默认模型为 `deepseek-vision / deepseek-v4-flash / low`。
- 用户手动选择模型或推理强度后，重启应用、进入已有上下文或新建无上下文对话都必须继续使用用户选择；升级时不得用产品默认值覆盖。
- 默认 agent preset 为 `standard`。
- 默认权限为 `danger-full-access`。
- 右侧栏可以展开、收起；文件标签可以关闭。
- 关闭并重启后设置和会话状态符合预期。

完成条件：不能依赖开发电脑旧 profile、缓存或已安装插件才能通过。

### 6.3 `.dsh` 与插件市场生命周期

必须分别使用“保留旧数据升级”和“删除数据后重建”两条路径验收；不要把 `%USERPROFILE%\.dsh` 当成安装包内容，也不要在升级安装时删除它。

- 保留 `%USERPROFILE%\.dsh` 安装新版：应用正常启动，登录、会话、用户模型选择、市场来源、安装回执和用户已安装插件均保留。
- 应用关闭后，在专用测试账户中删除整个 `%USERPROFILE%\.dsh` 再启动：应用自动重建 profile 与 `settings.yaml`，无需手工建目录。
- 全新 profile 的插件市场默认已有并启用 `DSH 1024Store`；用户仍可切换当前来源、添加标准 manifest 来源、禁用或移除来源。
- 若用户已经配置过 `dsh-community-market.sources`，升级迁移不得重置、追加或覆盖该列表；空数组也代表用户的明确选择。
- 安装插件后保留 `.dsh` 升级，`profiles\desktop\package.json` 中的第三方依赖和对应 `node_modules` 内容必须继续存在；只允许桌面端自有的 `dsh-better-sidebar` 链接被修复到新版程序副本。

完成条件：首次安装有可用默认市场，用户仍拥有来源和安装决定权；保留 `.dsh` 能无损升级，删除 `.dsh` 能自动恢复到可用初始状态。

### 6.4 Office 文件

分别从 Files 面板打开真实的 `.docx`、`.xlsx`、`.pptx`：

- Office 插件已经装入新 profile。
- 三种文件均能预览；中文文件名也必须测试。
- 表格不会遮挡顶部标签栏和关闭按钮。

完成条件：测试的是安装包创建的空白 profile，不是开发 profile。

### 6.5 浏览器与两种搜索

必须区分：

- `browser_search`：只生成 Bing URL 并送到右侧栏，`delivered: true` 只表示命令送达。
- `web_search`：模型后端搜索；当前由 ModSearch 调用 `https://api.firecrawl.dev/v2/search`，成功时应返回真实来源列表。

至少分别验证：

1. 地址栏打开一个普通 HTTPS 页面。
2. `browser_search` 的结果页确实加载，而非只返回 `delivered: true`。
3. 对同一关键词或同一 URL 连续执行两次，第二次必须触发当前 webview 重新加载，不能因为 URL 字符串未变化而被 React 吞掉。
4. `web_search` 返回非空 sources，而非只证明插件已注册。
5. 点击含 `target="_blank"` 的普通链接，仍在受控侧栏 tab 内稳定导航。

网络测试矩阵至少包含：

- 普通家庭网络或手机热点。
- 公司标准受管网络/代理环境。
- 一台新的 Windows 用户账户或未安装过 Harness 的电脑。

如果 Chrome/Edge、Node 和 Harness 同时出现 `ERR_SSL_PROTOCOL_ERROR`，并且公网 443 返回明文 `HTTP ... Forbidden`，判定为网络出口策略，不是漏打包。不得采用以下方式绕过：

- `--ignore-certificate-errors`
- `webSecurity: false`
- 无条件接受 `certificate-error`
- 关闭 sandbox

若增加企业代理兼容，必须同时验证两条链路：

- Electron/Chromium 默认 session 与侧栏 webview。
- ModSearch 子进程中的 Node `fetch()`。

只调用 `session.setProxy()` 不能自动证明 Node WebSearch 已使用同一代理。代理必须来自系统、PAC、环境或明确设置，不能硬编码开发电脑地址。

### 6.6 PDF

PDF 有两条不同链路，必须分开验收：

1. 内置链路：Files 面板 → `/sidebar/file` → Blob `application/pdf` → iframe。
2. 浏览器链路：任意 HTTP 文件服务器 → browser tab → 普通链接或 popup。

内置链路要求：

- PDF 位于当前会话 `cwd` 内。
- 默认 `mediaLimit` 是 20 MiB；小于限制的 ASCII、中文文件名 PDF 都要测试。
- 页面能显示；下载回退可用；超过限制时错误信息明确。

浏览器链路要求：

- 自建服务器必须 `decodeURIComponent(new URL(req.url, base).pathname)`，并防止路径穿越。
- 链接按 path segment 做 `encodeURIComponent()`。
- PDF 返回 `Content-Type: application/pdf`、正确 `Content-Length`，建议支持 HEAD 与 Range。
- 当前页链接与 `target="_blank"` 链接都要测试。

不要用自建服务器的 404 推断内置 PdfView 缺失。

如果 PDF、图片或 Office 文件是由 `pwsh`、Python 脚本、Notebook 或终端间接生成，生成后必须先确认文件存在，再用一次 `artifact_register` 登记该轮所有最终产物（尤其不能漏掉 PDF）；不能只在最终回复里写文件名，也不要重复登记已经由文件写入工具报告的文件。验收时同时确认：

- 对话末尾出现可点击的产物条目，点击后在右侧栏打开对应预览。
- Files 面板无需手动点击刷新，最迟约 2 秒出现新文件。
- “在文件夹中显示”交给系统文件管理器处理，不得在编辑器里报“is a directory”。
- rc.8 的产物数据从 `owner.turn.data.get('deliverables')` 读取；不要恢复旧版 `owner.nodes` 作为主路径。

### 6.7 登录授权回调

首次登录完成后，系统浏览器的 `/auth/callback` 必须显示锐捷 Harness 品牌完成页，并明确提示用户可以关闭页面、返回应用。浏览器可能拒绝脚本自动关闭，因此不得使用隐藏空白页作为唯一成功反馈；同时确认桌面登录窗口继续显示启动进度。

## 7. 当前已知故障与发布判定

### 7.1 公司电脑 HTTPS

现场证据显示公网 TCP 443 建连后收到明文 Apache Forbidden，导致 Electron、Node、SChannel 同时报 TLS 协议错误。这台电脑属于环境限制案例。若换手机热点或系统浏览器恢复后 Harness 也恢复，不需要为它关闭安全能力。

### 7.2 中文 PDF 404

现场 `server.js` 直接执行 `path.join(ROOT, req.url)`，把 `%E6...pdf` 当磁盘文件名，已确定返回 404。该错误属于现场自建服务器，不属于内置 PdfView。

### 7.3 popup 导航竞态——已修复，仍是强制门禁

旧实现会在 `setWindowOpenHandler()` 返回 `{ action: 'deny' }` 的同时调用 `guest.loadURL()`，真实 Electron 43.4.0 下曾在连续 10 次中失败 2 次。新实现由主进程拒绝 popup 并通过受限 IPC 通知 renderer，再由拥有该 guest id 的 browser tab 统一导航。

强制回归命令：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH\dsh-plugin-desktop'
corepack yarn verify:webview-continuity
```

该命令循环运行真实 Electron 夹具 20 次，必须输出 `20/20`。失败一次即阻止发布。

若用 Puppeteer 连接已经运行的桌面端做 UI 验收，必须传入 `defaultViewport: null`。默认的 `800×600` viewport 会覆盖真实 Electron viewport，造成右侧大片空白、最大化/还原后暂时恢复的假故障；脚本退出前后都要确认 `window.innerWidth` 与窗口内容宽度一致。

### 7.4 内置 PDF viewer 的 Electron 能力

已用 Electron 43.4.0 独立验证：在当前安全配置下，不论 `plugins` 显式为 false 或 true，Blob `application/pdf` iframe 都能完成加载。因此当前没有证据要求为 PDF 开启通用插件权限。

### 7.5 模型工具流兼容

对 `deepseek-v4-flash` 必须保留“原生 `tool_calls` 与累计 DSML 文本同时出现”的回归用例。适配器只能执行原生工具调用，不能把 `<｜DSML｜tool_calls>` 控制包络追加到助手正文；否则一次调用会被累计快照放大成大量重复文本。

## 8. 正式打包

只有第 6、7 节门禁全部通过后才执行：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
corepack yarn dist:win
```

这个入口会：

1. 构建社区市场与桌面端。
2. 运行 Windows 包预检。
3. 使用本机 Electron 分发生成 unsigned x64 NSIS installer。
4. 禁止发布到远端。
5. 验证安装器和 `win-unpacked\Ruijie-Harness.exe` 的 PE 结构。

不得设置 `DSH_PACKAGE_CHECK_ALREADY_RAN=1` 跳过门禁，除非同一次受控 CI 工作流已经成功完成等价检查并保存日志。

打包前再执行一次发布差异判定：

1. 仅 Mac 工作流、Mac 打包脚本、测试断言或文档变化：通常不要求重打 Windows。
2. 登录、模型、会话、侧栏、Office、PDF、浏览器、WebSearch、市场、共享 vendor 或 OCR 数据变化：Windows 必须重新通过门禁；若要交付这些变化，提升版本后重打。
3. Windows 专属路径、Shell、ACL、安装器、更新逻辑变化：必须重打 Windows。
4. 无法证明现有 EXE 是否包含某项共享资源时，将其视为未包含；通过解包检查或提升版本重打解决，不凭开发机缓存猜测。

已有安装包不会因源码后来修改而失效或被远程改变。重新打包是为了纳入新修复和保持版本一致，不是为了“修复”磁盘上已经生成的旧 EXE。

## 9. 打包后验证与清理顺序

先验证，再清理 `win-unpacked`；顺序不能反。

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH\dsh-plugin-desktop'
node '.\scripts\verify-win-installer.ts'

$version = (Get-Content -LiteralPath '.\package.json' -Raw | ConvertFrom-Json).version
$exe = Join-Path (Resolve-Path '.\dist') "Ruijie-Harness-$version-x64-Setup.exe"
Get-FileHash -LiteralPath $exe -Algorithm SHA256
Get-AuthenticodeSignature -LiteralPath $exe |
  Select-Object Status,StatusMessage,Path
Get-Item -LiteralPath $exe |
  Select-Object FullName,Length,LastWriteTime
```

通过条件：

- 验证脚本退出码为 0。
- EXE 名称中的版本与 `package.json` 完全一致。
- 文件非空，SHA-256 已记录。
- 当前内部版签名状态为 `NotSigned`。

最后只清理 `win-unpacked`、`builder-debug.yml`、`latest.yml`、临时 `.nsis.zip` 等中间产物。保留用户在本次任务中明确指定的历史正式 Setup EXE 和本次最新版；未取得明确授权不得根据旧手册中的版本号删除正式产物。删除前必须解析并核对每个目标都位于准确的 `dsh-plugin-desktop\dist` 内；不得递归删除仓库根目录、用户目录或通过未解析变量构造的路径。

## 10. 安装后真机验收

不要只测 `win-unpacked`，必须用最终 EXE 安装。

1. 在测试电脑卸载旧版，避免旧进程仍在运行。
2. 用新的 Windows 用户账户优先完成首次启动测试；需要保留旧数据时，再单独做升级安装测试。
3. 重复第 6 节的首次启动、Office、侧栏、浏览器、两种搜索和 PDF 用例。
4. 升级测试必须保留 `%USERPROFILE%\.dsh`：确认登录、历史会话、用户已选模型/推理强度、市场来源、安装回执和用户安装的插件不丢失；同时确认 `profiles\desktop\node_modules\dsh-better-sidebar` 已被修复为指向新版程序依赖的 Junction，旧实体副本不能继续加载。
5. 在专用测试账户关闭应用并删除整个 `%USERPROFILE%\.dsh`，再次启动应自动完成初始化；新 profile 默认启用 `DSH 1024Store`，且仍可添加、切换、禁用或移除来源。
6. 新建无上下文对话与打开已有上下文对话都要确认沿用用户最后保存的模型选择；只有没有模型设置的新 profile 使用 `deepseek-v4-flash / low`。
7. 记录 Windows 版本、网络类型、代理/PAC 状态、安装包 SHA-256和失败时间。
8. 异常时先区分应用缺陷与环境限制，再决定是否阻止发布。

完成条件：普通网络的全新安装体验与开发机一致；升级安装不会被旧缓存或旧 profile 误判为新包问题；公司网络限制会显示可诊断错误，不会诱导用户关闭安全保护；当次动态验收矩阵中的历史回归、本次增量和相邻影响全部有结果与证据，任何必测失败都已解决或明确阻止发布。

## 11. 交付时必须输出

发布人员或模型最终回复必须包含：

- 正式 EXE 的绝对路径和可点击文件链接。
- 产品版本。
- 源码 commit，以及本地分支与目标远端分支。
- 文件大小（bytes 与 MiB）。
- SHA-256。
- Authenticode 状态。
- 完整门禁结果与跳过项；没有跳过才可写“全部通过”。
- 真机测试矩阵及结果。
- 当次动态验收矩阵及其基线 commit；明确列出历史回归、本次增量、相邻影响和未执行项。
- `dist` 最终文件列表，确认保留用户本次明确指定的历史备份和当前正式 EXE，不含构建中间产物。
- 已知环境限制与通用产品缺陷分开列出。
- 本次是否产生值得写回手册的稳定经验；若有，说明已更新的章节。

只生成 EXE、不验证安装后的真实功能，不算完成发布。

## 12. Windows 历史产物快照（2026-08-22，仅用于追溯）

发布目录：`D:\ChatGPT\RuijieDSH\dsh-plugin-desktop\dist`

| 用途 | 文件 | bytes | MiB | SHA-256 | Authenticode |
|---|---|---:|---:|---|---|
| 上版备份 | `Ruijie-Harness-2.0.6-x64-Setup.exe` | 344273900 | 328.33 | `EDAFE070FAE5F2B992F61B59882DE93F5BFFBE53FCB9FD7C2A5BCC3EFE408CFA` | `NotSigned` |
| 当前最新版 | `Ruijie-Harness-2.0.7-x64-Setup.exe` | 344285426 | 328.34 | `875576C9A857D9B96EE913CDF27A94DF905110C44E8338398B74C652F8A731E3` | `NotSigned` |

`node scripts/verify-win-installer.ts` 已对 2.0.7 通过验证。此快照只证明构建产物结构与发布门禁通过；安装后的联网、登录、侧栏、Office、搜索和 PDF 仍须按第 10 节在真实安装环境验收。

`2.0.7` EXE 生成于本次 OCR 文件正式纳入 Git 与重新安装 file dependency 之前，因此不能宣称它已内置离线中英文 OCR。该 EXE 仍可继续使用；若离线扫描 PDF OCR 属于交付要求，应提升版本并按本手册重新打包，而不是覆盖同名 `2.0.7`。

## 13. 每次使用结束后的按需优化

失败后先保存命令、退出码和首个根因日志。一次修复只对应一个已理解的问题；完成相关定向测试和完整门禁后才重新打包。不要因产物尚未出现、下载无进度或单个环境网络异常而重复启动多个构建。

每次发布结束都要审查本手册，但不要求机械修改；只有以下变化值得永久写入：

1. 可复现的新失败已有明确根因、稳定修复和验证命令。
2. 唯一仓库路径、脚本入口、版本来源、产物命名、数据隔离或验收标准发生变化。
3. 新的共享变更会影响 Windows/Mac 发布判定，或出现新的旧缓存/旧 bundle 风险。
4. 新门禁已进入脚本或测试；手册只引用权威入口和必须知道的原因，不复制容易过期的实现。
5. 新功能已成为以后每版都必须保留的核心能力；此时把它加入第 6 节最低回归基线。仅适用于本次版本的用例留在当次动态矩阵，不把手册写成版本流水账。

单次下载慢、临时网络抖动、偶发 runner 故障和未经证实的猜测只写入当次交付记录。更新手册后必须运行 `git diff --check`，审查文档是否仍存在版本、路径或命令冲突，并与对应源码修复一起提交。
