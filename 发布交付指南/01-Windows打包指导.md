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

同步完成条件不是“几个目录看起来都更新了”，而是本地 `main` 与 `ruijie/main` 指向同一提交。不存在需要额外同步的长期 Win/Mac 分支；若临时分支存在，只能作为短期工作分支，合入 `main` 后删除或归档，不能把它当发布事实来源。

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

第三方插件也可能把 `@deepseek-ai/cordis`、`dsh-scope`、`dsh-system-prompt` 等框架包实体化到 `profiles\desktop\node_modules`。这些包即使版本和文件哈希相同，两份物理模块实例仍会分裂进程级注册表，典型报错是 `duplicate deployment:persona`。启动准备必须把安装闭包内的 `@deepseek-ai/*` 框架包修复为指向当前程序副本，同时保留第三方插件自身、manifest、配置和数据；禁止通过删除整个 `.dsh` 掩盖问题。`verify:profile` 必须包含带重复框架依赖的历史 profile 夹具并完成真实 Host 启动。

## 6. 上线前功能门禁

### 6.1 固定基线 + 动态生成当次验收标准

本节 6.2–6.10 是每版不能删除的固定回归基线，不是完整清单。每次打包前，发布模型必须找到上一个已经完成安装验收的 Windows 发布 commit/tag，并根据到当前 `HEAD` 的真实差异生成当次验收矩阵：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
git log --oneline <上次已验收提交>..HEAD
git diff --name-status <上次已验收提交>..HEAD
git diff --stat <上次已验收提交>..HEAD
```

同时读取用户直接说明的“本版新增、修改、修复了什么”。Git diff 与用户说明取并集；一方没有提到的变化不能被另一方覆盖。必须阅读变更文件、对应测试、配置、数据迁移与依赖变化，不能只根据 commit 标题生成清单。矩阵写入当次构建记录或最终交付说明，每行至少包含：`编号 / 功能或风险 / 变更依据 / 测试环境 / 操作 / 预期结果 / 证据 / 结果`。

本地开发版的当前源码行为是本次安装包的功能对照基线，但“本地能用”本身不等于已经交付。打包模型必须为每项新增能力追踪完整链路：源码与配置进入发布 commit → 直接依赖和 `yarn.lock` 完整 → Loader/profile 实际挂载 → packaged-runtime 闭包包含所需文件与 export → 最终 Setup EXE 安装出的应用按同一用户操作得到一致结果。任一环只在开发目录成立，都应判为安装包尚未具备该功能。

当次矩阵必须同时覆盖：

1. **历史回归**：本节最低基线全部执行，确认此前正常功能在新安装包中仍然正常。
2. **本次增量**：每个新增、修改或修复点覆盖正常路径、关键异常路径、重启与升级持久化；bug 修复必须复现旧失败条件。
3. **相邻影响**：按依赖和调用关系扩展验证。例如 sidebar 改动要同时回归 Office、PDF、浏览器、Files 与关闭/收起；模型适配器改动要同时回归普通对话、工具调用、已有上下文、新对话和推理模式；时间、时区或其他模型可见运行时上下文改动要同时回归直接问答、基于“今天”的搜索词、新旧会话、跨重启和最终安装包闭包；安装/数据目录改动要同时回归全新安装、升级、卸载和开发版隔离。

功能删除或行为变化必须有用户明确授权，并在矩阵中记录新预期。不能删除旧验收项来掩盖回归。打包前冻结矩阵，打包后在最终 Setup EXE 安装出的应用上逐项执行；开发版或 `win-unpacked` 结果不能替代最终安装包验收。若无法追溯上次已验收 commit，则按全部最低基线加全部可见变更验收，并明确记录基线不确定性。

运行完整检查：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH'
corepack yarn check
```

然后在 Windows 桌面端目录运行关键测试：

```powershell
Set-Location -LiteralPath 'D:\ChatGPT\RuijieDSH\dsh-plugin-desktop'
corepack yarn vitest run tests/native-sidebar-browser.spec.ts tests/electron-runtime.spec.ts tests/office-document-plugins.spec.ts tests/profile.spec.ts tests/package.spec.ts tests/verify-packaged-runtime.spec.ts tests/desktop-plugins.spec.ts tests/sidebar-produced-files.spec.ts tests/ruijie-auth.spec.ts tests/ruijie-login-window.spec.ts tests/time-context-runtime-patch.spec.ts tests/ui-appearance-runtime-patch.spec.ts tests/appearance-compatibility.spec.ts tests/dsh-im-runtime-patch.spec.ts tests/sidebar-shortcuts.spec.ts tests/system-proxy.spec.ts tests/search-recovery.spec.ts tests/search-recovery-presentation.spec.ts
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
- 安装插件后保留 `.dsh` 升级，`profiles\desktop\package.json` 中的第三方依赖和对应 `node_modules` 内容必须继续存在；只允许桌面端自有的 `dsh-better-sidebar` 与安装闭包内的 `@deepseek-ai/*` 框架包被修复为新版程序链接。
- 用一个历史 profile 夹具让第三方插件带入重复的 `@deepseek-ai/cordis`、`dsh-scope`、`dsh-system-prompt`，升级启动后必须自动改用当前程序中的同一套框架实例，第三方插件仍保留。日志不得出现 `duplicate deployment:persona`；已有会话可打开、模型选择器可操作、新建对话和工作区选择有响应。

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

首次登录完成后，系统浏览器的 `/auth/callback` 必须显示锐捷 Harness 品牌完成页，并明确提示用户可以关闭页面、返回应用。RJ 标记、完成勾和进度强调色必须使用与应用图标一致的蓝紫渐变（`#6682FF → #3D57DA`），不得退回旧红色。浏览器可能拒绝脚本自动关闭，因此不得使用隐藏空白页作为唯一成功反馈。

退出登录并重新启动授权后，在**专用测试账户**中不点击浏览器授权而直接关闭浏览器：Windows 无边框等待窗右上角必须有可聚焦的“关闭并退出”按钮。点击后必须由 Electron 主进程原生关闭等待窗、结束本次启动且不得再次弹出授权；不能只检查页面存在 `window.close()` 字符串，也不能以按钮 hover 变色代替真实关闭。取消授权不得清除此前安全存储中的其他账号资料。正常完成回调时，等待窗应先显示“正在验证账号”，账号网络超过 8 秒显示中性的网络/代理提示；账号验证完成后才显示“认证已完成”，工作台加载超过 8 秒再显示组件初始化提示。令牌交换、刷新和模型接口验证必须有 30 秒超时，不能无限停留或过早宣称认证完成。记录慢阶段文字、网络/代理/PAC、测试环境和耗时，用它区分账号服务慢与 Host/profile/renderer 启动慢；用户可见文案不得针对某类硬件或运行环境下结论。

### 6.8 当前日期、时区与“今天”搜索

时间感知属于每版固定基线。源码组合测试必须证明 desktop layer 中恰好存在一个已启用的 `@deepseek-ai/dsh-time-context` row；`dsh-plugin-desktop/package.json` 必须把它声明为直接生产依赖；packaged-runtime gate 必须从最终 `app.asar.unpacked` 物理树解析 `@deepseek-ai/dsh-time-context/package.json`。桌面构建还必须执行 `patch-dsh-time-context-runtime.mjs`，并断言最终运行文件包含“权威当前日期/时间、相对日期与搜索参数必须采用该时间、不得沿用训练数据或早先消息中的冲突年份”三层约束。只看到源码包存在、依赖被其他包间接带入或开发环境能解析，都不能替代这些门禁。

分别在本地开发版和最终 Setup EXE 安装版的新会话中执行：

1. 直接询问“今天是几月几日、星期几？”，答案必须与 Windows 当前本地日期和星期一致，不能回答不知道、从新闻推断日期或使用模型训练年份。
2. 询问“搜索今天 AI 圈发生的大事”，检查实际 `web_search`、`browser_search` 等工具参数和最终来源：查询必须使用当前年份及当天/近期语义，不能退回 2025、2024 等旧年份；来源发布时间应与“今天”请求相符。不能只看最终回答碰巧写对日期。
3. 在一个曾经出现过错误旧年份的已有会话连续执行三次相对日期搜索，再新建无上下文会话重复三次，所有实际工具参数都必须正确；完全退出并重启后再测一次，确认 Loader row 在新 generation 中生效且不会被旧会话年份锚定。
4. 记录操作系统时区、提问、模型回答、可见搜索参数/日志和截图。浏览器请求只有一个经 Host 校验的 IANA 时区时应采用该时区；来源缺失或混合时允许要求用户澄清，但不得静默猜测。

当前正在运行的 generation 不会热挂载新增 Loader row。验收源码变更时必须在保留认证安全的前提下选择可重启窗口；认证服务异常、退出后可能无法重新登录时，不得为了完成本项擅自退出日常使用实例，应记录阻塞并等待安全验收时机。

### 6.9 内置外观与多平台会话控制

`dsh-ui-appearance@0.1.4` 与 `@xmanrui/dsh-im@2.0.0` 是桌面版固定生产依赖，不是要求员工另行从插件市场安装的可选项。源码组合测试必须分别证明 `ui-appearance`、`im-channels` row 恰好存在一次且已启用；`package.json` 必须声明精确版本；packaged-runtime gate 必须能从最终 `app.asar.unpacked` 物理树解析两个包的 `package.json`。旧的 `dsh-lark-channel` 不得同时残留，避免两套飞书连接器重复初始化。

`@tencent-connect/qqbot-connector@1.2.0` 的 npm 元数据为 `UNLICENSED`。本项目只允许针对这个准确包名的业务批准例外，并在 `THIRD_PARTY_NOTICES.md` 如实记录；不得把它伪装成 MIT、不得把 `UNLICENSED` 加入全局许可证白名单，也不得让例外自动覆盖新包或新版本。

最终 Setup EXE 安装版必须完成以下验收：

1. 全新 profile 不进入插件市场、不执行安装即可在“通用设置”顶部看到“界面外观（颜色、壁纸与透明度）”。该行收起时也必须始终显示“一键恢复默认”；先修改多项颜色、背景、透明度和侧栏效果，再点击恢复，必须一次清除全部外观自定义并回到原版界面，同时不影响登录、账号、会话、工作区或 IM 配置。左侧栏底部从上到下应为账号/额度、“IM机器人”、设置；“IM机器人”与原生“设置”文字同色、行高与左边界一致，机器人图标和齿轮图标视觉尺寸一致，点击后必须直达“插件 → IM机器人”，不得打开插件市场。修改主题、背景或界面透明度后立即生效并在完全退出重启后保持，但用户消息气泡必须维持原版浅色，不得跟随主题强调色变成深蓝或高饱和色。
2. 全新 profile 启动并静置至少 60 秒，不打开设置：微信、飞书、钉钉、企业微信、QQ、Slack、Telegram、Discord、WhatsApp 均不得打开浏览器、弹出授权窗或二维码，也不得反复提示缺少凭据；外部网络抓包中不得出现这些渠道的连接。安装包内置但默认休眠。
3. 用户主动进入“设置 → 插件 → IM机器人”，选择具体渠道并点击添加/接入后，才允许出现该渠道的扫码、Token 或应用凭据配置。关闭配置页或取消流程不得自动重开；未配置的其他渠道继续休眠。真实 Secret、个人账号和测试凭据不得写进源码、安装包、日志或截图。
4. 使用专用账号至少完整验证飞书，并按发布范围抽测其余渠道：完成主动接入、连接测试、发送消息、接续 Harness 会话、停用/删除连接。飞书还应验证 `/new`、`/sessions`、`/sessions <关键词>`、点击切换历史会话、`/status`、`/ws`、`/cd` 与 `/stop`，并确认不同聊天/工作区不会串会话。
5. 触发一次模型提问、计划或工具授权卡片，确认只允许预期用户处理。生产部署必须配置平台应用可用范围并收紧发送者、群组、审批者和工作区边界；不得把“能控制 Harness 会话”描述为能任意编辑或删除聊天平台的历史消息。
6. WhatsApp 的代理构造器不得引用上游压缩 bundle 的临时变量名；`https-proxy-agent@7.0.6` 必须是 desktop deploy root 的直接生产依赖，packaged-runtime gate 必须从最终 `app.asar.unpacked` 物理树解析其 `package.json`。在 Windows 开启系统 HTTP/HTTPS 代理且不设置 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量，用户主动接入 WhatsApp 后应尽量生成可扫码二维码；显式环境变量存在时不得覆盖。无论网络、代理或二维码服务是否成功，点击“生成二维码”都不得让桌面进程退出或重启。失败必须留在 IM 页面并显示可读的网络/代理说明，不能暴露 `ReferenceError`、`invalid_union`、`invalid_value` 等内部异常或 RPC 校验 JSON。代理解析失败不得阻止桌面应用启动。

完成条件：员工无需自行安装这两个插件；外观能力开箱可用，IM 能力由用户按渠道主动启用；未启用时绝不打扰，启用后能正常使用；安装包内置版本、profile row、物理依赖闭包和真实交互四层一致。

### 6.10 工具失败恢复与主界面降噪

用可控夹具令主搜索源连续失败两次以上，并让备用搜索随后成功。智能体必须停止用相同参数重复调用同一失败工具，主动切换不同搜索/浏览方式，并继续完成用户任务。再对 Pwsh、文件渲染等非搜索工具构造“前一步失败、后续替代步骤成功”的用例。

对上段用例，主“对话”视图不得显示中间工具失败行、红点、黄灯、红/黄错误文字或 `Error` 技术文本；完整失败事件、参数和原始错误必须保留在“轨迹”和本地日志中。专用的回合终局错误节点不得隐藏：只有所有合理替代路径均失败并导致整个回合终止时，才按原产品行为显示醒目的红色错误与必要诊断。不得吞掉工具结果、删除存储事件或把失败伪装成成功。至少回归：主源失败后备用成功、非搜索工具失败后替代步骤成功、所有合理路径失败、切换到“轨迹”查看详情、下一条用户消息重新计组。

降噪不能以关闭联网能力换取。最终安装版还必须用自然提示词“联网搜索今天 AI 圈发生的大事”完成一次真实全链路：`web_search` 返回非空来源，实际读取多个不同来源，`browser_search` 在右侧栏显示结果，同一关键词再次搜索仍重新加载，最终回答使用当前日期并给出可点击来源。再加入一个确定不可访问的 URL，验证读取失败后切换其他联网方式并完成任务；“对话”保持安静，“轨迹”保留失败与换路证据。若普通网络下正常搜索能力缺失，即使界面没有报错也判为失败。

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

最后只清理 `win-unpacked`、`builder-debug.yml`、`latest.yml`、临时 `.nsis.zip` 等中间产物。保留用户在本次任务中明确指定的历史正式 Setup EXE 和本次最新版；未取得明确授权不得根据旧手册中的版本号删除正式产物。Mac 的正式 DMG、哈希、构建清单和验收证据不属于 Windows 清理范围。删除前必须先列出每个候选的绝对路径、版本和类型，解析并核对目标位于准确的 `dsh-plugin-desktop\dist` 内，再使用 `Remove-Item -LiteralPath` 精确删除；不得递归删除仓库根目录、用户目录或通过未解析变量构造的路径。

## 10. 安装后真机验收

完整发布验收不能只测 `win-unpacked`，应使用最终 EXE 安装；但安装、卸载、覆盖当前程序或删除真实 `%USERPROFILE%\.dsh` 都是独立的状态变更，只有用户在本轮明确授权后才能执行。若用户只要求“打包”，应停在非侵入式安装器验证并把真机安装项明确记为未执行，不能把本节当成额外授权。

1. 在已获明确授权的专用测试电脑或测试账户卸载旧版，避免旧进程仍在运行；不得卸载用户正在使用的版本。
2. 用新的 Windows 用户账户优先完成首次启动测试；需要保留旧数据时，再单独做升级安装测试。
3. 重复第 6 节 6.2–6.10 的全部固定基线，并执行当次动态验收矩阵；不得只复测首次启动、Office、侧栏、浏览器和 PDF 等旧基线。
4. 升级测试必须保留 `%USERPROFILE%\.dsh`：确认登录、历史会话、用户已选模型/推理强度、市场来源、安装回执和用户安装的插件不丢失；同时确认 `profiles\desktop\node_modules\dsh-better-sidebar` 以及安装闭包内的 `@deepseek-ai/*` 框架包已被修复为指向新版程序依赖，旧实体副本不能继续加载。至少打开一个历史会话、操作模型选择器、新建对话并选择工作区，日志中不得出现 `duplicate deployment:persona`。
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

## 12. Windows 历史产物快照（2026-08-23，仅用于追溯）

发布目录：`D:\ChatGPT\RuijieDSH\dsh-plugin-desktop\dist`

| 用途 | 文件 | bytes | MiB | SHA-256 | Authenticode |
|---|---|---:|---:|---|---|
| 上版备份 | `Ruijie-Harness-2.0.7-x64-Setup.exe` | 344285426 | 328.34 | `875576C9A857D9B96EE913CDF27A94DF905110C44E8338398B74C652F8A731E3` | `NotSigned` |
| 历史正式包 | `Ruijie-Harness-2.0.8-x64-Setup.exe` | 344287016 | 328.34 | `697EC1ECA5010CDC98521DC97DF24D70FB62626DF5E0710D48C15BAE69292691` | `NotSigned` |
| 最近历史正式包 | `Ruijie-Harness-2.0.9-x64-Setup.exe` | 354214480 | 337.81 | `AE03CACD2420E545F1AC5A04CEDC70616F473B953A6D1A1307DD515562067580` | `NotSigned` |

`node scripts/verify-win-installer.ts` 已对 2.0.8 通过验证。该安装包包含 profile 框架单例修复，产品源码 commit 为 `5d90929a86d99a871e18497be3bed37a319b2dad`。此快照只证明构建产物结构、打包内容检查与发布门禁通过；由于本轮没有安装授权，安装后的联网、登录、侧栏、Office、搜索、PDF 和真实保留数据升级仍须按第 10 节验收。

2.0.9 生成于产品提交 `73143e3bd9748e5a8a078ddc6b9e12dface07791` 之后，并已保存在上述发布目录。它是历史产物，不自动包含其后新增的源码改动；当前源码与该提交存在产品差异时，必须提升版本并重新打包，不能覆盖或继续交付同名 2.0.9 文件。

`2.0.7` EXE 生成于 OCR 文件正式纳入 Git 与重新安装 file dependency 之前，因此不能宣称它已内置离线中英文 OCR。该 EXE 继续作为上版保留，不得因生成 2.0.8 而删除。

## 13. 每次使用结束后的按需优化

失败后先保存命令、退出码和首个根因日志。一次修复只对应一个已理解的问题；完成相关定向测试和完整门禁后才重新打包。不要因产物尚未出现、下载无进度或单个环境网络异常而重复启动多个构建。

每次发布结束都要审查本手册，但不要求机械修改；只有以下变化值得永久写入：

1. 可复现的新失败已有明确根因、稳定修复和验证命令。
2. 唯一仓库路径、脚本入口、版本来源、产物命名、数据隔离或验收标准发生变化。
3. 新的共享变更会影响 Windows/Mac 发布判定，或出现新的旧缓存/旧 bundle 风险。
4. 新门禁已进入脚本或测试；手册只引用权威入口和必须知道的原因，不复制容易过期的实现。
5. 新功能已成为以后每版都必须保留的核心能力；此时把它加入第 6 节最低回归基线。仅适用于本次版本的用例留在当次动态矩阵，不把手册写成版本流水账。

单次下载慢、临时网络抖动、偶发 runner 故障和未经证实的猜测只写入当次交付记录。更新手册后必须运行 `git diff --check`，审查文档是否仍存在版本、路径或命令冲突，并与对应源码修复一起提交。
