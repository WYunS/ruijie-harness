# 锐捷 Harness macOS 真人验收测试指导

用途：交给完全不了解项目上下文的大模型或测试人员，对最终 DMG 安装出的应用做接近真实同事使用方式的验收，并给出可追溯的发布结论。本文件只负责验收，不负责修改源码或打包；发现缺陷后回到源码修复，再依据 `02-macOS打包指导.md` 重新生成候选包。

## 1. 唯一位置与测试对象

- 唯一源码仓库：`D:\ChatGPT\RuijieDSH`
- 动态矩阵生成命令：`corepack yarn workspace dsh-plugin-desktop accept:mac-plan dist/mac-internal/acceptance-evidence [上次已验收提交]`
- 最终安装包验收命令：`corepack yarn workspace dsh-plugin-desktop accept:mac-installed <DMG所在目录>`
- 自动验收实现：`dsh-plugin-desktop/scripts/verify-mac-installed-app.mjs`
- 自动验收证据：`dsh-plugin-desktop/dist/mac-internal/acceptance-evidence`
- 产品版本来源：`dsh-plugin-desktop/package.json`

验收对象必须是本次最终 DMG 安装出的 `.app`，不能用开发模式、源码页面或旧 DMG 代替。开始时记录 DMG 路径、bytes、SHA-256、源码 commit、GitHub run、Mac 型号、CPU、macOS 版本、网络类型和测试账户。

## 2. 每次先生成“固定 + 动态”矩阵

每次验收都包含两部分：

1. **固定基线**：第 4 节全部执行，任何版本都不能删除。
2. **动态增量**：从上次已经完成真人验收的 commit/tag 到当前候选 commit 读取真实 diff；也接受用户直接提供“本版新增/修改/修复了什么”。两种输入同时存在时取并集，不能互相覆盖。

自动生成 Git 差异矩阵：

```bash
cd /path/to/RuijieDSH
corepack yarn workspace dsh-plugin-desktop accept:mac-plan \
  dist/mac-internal/acceptance-evidence \
  <上次已验收提交>
```

如果用户直接描述本版变化，把每一项追加到 `ACCEPTANCE-PLAN.md`。每项至少写明：`编号 / 功能或风险 / 变更依据 / 环境 / 操作 / 预期 / 证据 / 结果`。

动态扩展规则：

- 侧栏变化：追加 Files、标签关闭/恢复、收起/展开、Office、PDF、图片和浏览器相邻回归。
- 模型或推理变化：追加默认模型、新旧会话、已有上下文、推理强度、普通对话、图片和文档理解。
- 登录或凭据变化：追加首次登录、回调页、退出重登、关闭重启、升级保留登录。
- 浏览器或 WebSearch 变化：追加 HTTP/HTTPS、同 URL 连续两次、返回/前进、`target=_blank`、家庭网络与公司网络。
- 存储、profile 或迁移变化：追加全新数据目录、保留旧数据升级、删除后重建、设置和插件持久化。
- Office、PDF、附件或 OCR 变化：追加中英文文件名、文本型与扫描型 PDF、图片理解、损坏文件、超限文件。
- 新运行时代码无法映射到现有用例：标为 `manual-blocking`，先补验收项再继续。

完成条件：固定基线完整保留，本版每项变化都有正常路径、关键异常路径和重启/升级路径；矩阵在操作前冻结并保存。

## 3. 先审查自动验收证据

GitHub macOS runner 会挂载 DMG、复制最终 `.app`，在隔离的 `DSH_HOME` 和 Electron userData 中执行真实 UI 操作。先检查：

- `ACCEPTANCE-PLAN.md`、`acceptance-plan.json`
- `ACCEPTANCE-REPORT.md`、`acceptance-report.json`
- `first-launch.png`、`first-launch-exercised.png`
- `restart.png`、`restart-persisted-ui.png`
- 对应 stdout、stderr 和 failure 截图

自动基线必须证明：

- 安装副本启动并进入真实工作台，窗口尺寸正常，不出现旧新手引导。
- 模拟 OAuth 登录成功，重启不重复授权。
- 自动选择隔离工作区并创建会话。
- 默认模型显示 `deepseek-v4-flash`，推理强度显示 `low`。
- 通过 UI 切换语言，偏好写入 `DSH_HOME/settings.yaml`，重启后保持。
- 侧栏可收起、展开、关闭 Files 标签并重新打开。
- Word、Excel、PPT、PDF、PNG 测试夹具能从 Files 中打开到对应预览器。
- 内置浏览器能打开 HTTPS 页面，不能出现 `ERR_SSL_PROTOCOL_ERROR`、证书错误或错误页。

自动通过只能称为“已自动验证的 Mac 候选包”。模拟服务不能证明真实公司账号、真实模型语义理解、真实 WebSearch 或公司网络可用，这些项目必须继续真人测试。

自动夹具若位于 macOS 临时目录，写入 workspace 存储前必须使用真实路径规范化（macOS 的 `/var` 通常解析为 `/private/var`）。否则产品的工作区安全校验会正确拒绝路径不一致；这属于验收夹具错误，不能误判为产品无法创建会话。

自动操作同名控件时，不能只用 DOM 元素“有宽高”判断可点击。右侧栏与已收起的底部栏可能同时保留同名按钮；脚本必须确认目标位于当前视口内，并用 `document.elementFromPoint()` 验证中心点击点没有被裁剪或遮挡。“新建标签页”必须按“目标菜单项已出现则直接选择，否则再点 +”作为一个原子重试动作，不能假设上一次菜单关闭动画已经完成。菜单未出现时同时保存点击后的截图和 DOM 快照，避免把误点或菜单时序问题误判为 Browser、Files 等产品功能失效。

若同一候选 DMG 已在某次 run 中完成侧栏、Browser 和全部文件预览，之后只因语言或重启阶段的验收脚本失败，可在复用该候选 DMG 时把 `acceptance_resume_run_id` 设为该证据 run ID。脚本仍执行安装、启动、登录、工作区和模型这些后续步骤的必要前置条件，但会把已有截图证明的侧栏、Browser、Office/PDF/图片结果标为从该 run 延续，只继续语言与重启阶段。不得用此参数跨产品源码、依赖、vendor bundle 或 DMG 哈希复用结果。

## 4. 真人固定基线

### 4.1 安装与首次启动

1. 校验 DMG SHA-256。
2. 安装到 Applications；未签名内部版用 Finder 右键“打开”。只有确认哈希正确仍被拦截时，才执行 `xattr -dr com.apple.quarantine "/Applications/锐捷 Harness.app"`。
3. 使用从未运行过本产品的测试账户启动。
4. 确认没有欢迎页、视图模式或模型选择新手引导。
5. 默认语言跟随 macOS；用户切换语言后立即生效并在重启后保持。

### 4.2 登录、工作区、会话与模型

1. 用真实公司账号登录，检查浏览器回调页有锐捷 Harness 品牌和“可关闭并返回应用”提示。
2. 添加真实文件夹为工作区，新建会话并发送普通文本。
3. 确认模型选择器存在，默认值为 `deepseek-v4-flash / low`。
4. 修改模型或推理强度，分别验证已有上下文和新建无上下文会话。
5. 完全退出再启动，确认登录、工作区、会话和用户选择保持。

### 4.3 侧栏与文件预览

1. 展开、收起右侧栏。
2. 关闭 Files 标签，再通过“新建标签页”恢复。
3. 打开真实 `.docx`、`.xlsx`、`.pptx`、`.pdf` 和图片；至少一组使用中文文件名。
4. 检查内容可见、可滚动，Excel 不遮挡标签栏，所有标签可关闭。
5. 用损坏文件验证错误提示；用超过限制的 PDF 验证明确信息和下载回退。
6. 新生成文件应在约 2 秒内出现在 Files；“在文件夹中显示”必须交给 Finder。

### 4.4 图片和文档语义理解

使用真实模型分别上传或引用：图片、Word、Excel、PPT、文本 PDF、扫描 PDF。每个文件先放入一个只有测试者知道的唯一事实，例如编号、金额或一句话，再要求模型回答该事实。

通过条件：回答与文件内容一致；Excel 能定位指定工作表与单元格；扫描 PDF 能识别中英文；模型不能只复述文件名或声称成功却没有给出内容。记录提问、回答和截图。此项不能由模拟模型代替。

### 4.5 浏览器与 WebSearch

1. 地址栏打开普通 HTTPS 页面，确认页面实际渲染。
2. 验证返回、前进、刷新和 `target=_blank`。
3. 连续两次打开同一 URL，第二次仍真实加载。
4. 执行 `browser_search`，确认结果页进入侧栏，而不只看 `delivered: true`。
5. 用真实模型执行 `web_search`，确认返回非空来源并能打开来源。
6. 普通网络至少测一次；公司网络再测一次并记录代理/PAC。

如果 Chromium、Node 和系统浏览器都失败，先归类网络环境；如果只有 Harness 失败，归类产品缺陷。不得通过关闭 TLS、证书校验、webSecurity 或 sandbox 伪造通过。

### 4.6 升级与全新重建

1. 保留旧版数据升级：登录、历史会话、模型/推理强度、市场来源、插件和安装回执不得丢失。
2. 在专用测试账户退出应用并删除该账户的 `~/.dsh`，再次启动：profile 与 `settings.yaml` 应自动重建。
3. 全新 profile 默认启用 `DSH 1024Store`；已有来源配置（包括空数组）升级时不得被覆盖。
4. `profiles/desktop/node_modules/dsh-better-sidebar` 必须指向新版应用依赖，不能加载旧实体副本。

## 5. 结果与发布判定

每项只允许：`通过 / 失败 / 因环境阻塞 / 未执行`。失败和未执行不能写成“全部通过”。证据至少包含操作截图、必要日志、实际结果、期望结果和环境信息。

只有同时满足以下条件才能称为“Mac 内部可用版”：

- GitHub Action 和安装后自动验收全部通过。
- DMG 哈希一致，架构符合交付要求。
- 至少一台 Apple Silicon Mac 完成本文件固定基线。
- 动态增量与相邻影响全部有结果。
- 真实模型附件理解和真实 WebSearch 已验证。
- 产品缺陷全部解决；环境限制被单独记录。

否则只能称为“候选包”，并明确列出未完成项。

## 6. 失败后的闭环

保存首个失败步骤、时间、截图、日志和环境。先判断属于产品源码、打包闭包、Mac 平台、账号服务还是网络环境。产品问题回源码增加可复现测试并修复；打包问题回 `02-macOS打包指导.md`；环境问题换普通网络或干净账户交叉验证。每次修复后重新生成候选 DMG，旧 DMG 不会被源码修改自动修复。

## 7. 每次使用结束后的按需优化

验收结束后必须审查本文件，但不要求机械修改。仅在以下情况更新：

1. 本次发现了可复现的新故障，并已有明确根因、稳定修复与验证方法。
2. 新功能以后每版都必须保留，应加入固定基线。
3. 某个动态映射漏掉了真实相邻风险，应补充动态规则。
4. 路径、命令、证据名称或发布判定已经变化。
5. 某条步骤含糊，导致不同执行者得到不同结论。

一次性网络抖动、未经证实的猜测和只属于某台电脑的偶发现象留在当次报告，不写成永久规则。更新后执行 `git diff --check`，确认没有与另外两份指导冲突，并把有价值的经验与对应源码或测试一起提交。
