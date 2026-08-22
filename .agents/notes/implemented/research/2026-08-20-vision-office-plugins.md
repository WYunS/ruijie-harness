# rc.8 多模态、附件解析与 Office 工具插件核验

日期：2026-08-20  
范围：只核验一手资料与包内容；未安装插件，未修改应用源码、`package.json` 或锁文件。

## 结论先行

建议采用“**两个插件先集成，一个插件带修订集成**”的路线，而不是原样照搬推荐清单：

1. **采用 `dsh-vision-router@1.7.3`**，让现有两个 DeepSeek 文本模型继续负责推理，另用一个不暴露在员工模型选择器里的视觉模型做“眼睛”。它在 DSH rc.8 + Node 22/24 上有真实契约 CI，三者里兼容证据最强。
2. **采用 `dsh-attachment-formats`，但固定到 `v0.6.4` / commit `eb21244d746310e46805ac961e7f2542244ad1f1` 并先做 rc.8 适配测试或维护内部 fork**。它最直接满足回形针、拖放、PDF/现代 Office、扫描 PDF OCR 和长文档落盘分页读取，但没有 npm 包，也没有 rc.8 集成测试，并依赖未公开的 DOM 事件桥。
3. **`dsh-office-tools@0.1.0` 可作为第一阶段的 Office 生成工具，但不能接受“可编辑 Word、Excel、PPT”这一宣传口径**。它能创建/读取 Word，创建/读取/更新 Excel，创建/读取 PPT；不能编辑既有 Word 或 PPT。若产品承诺三种格式都能编辑，需要扩展内部 fork 或另选工具。

更关键的产品判断：**只显示两个 DeepSeek 模型**与**后台实际用视觉模型看图**并不冲突。员工仍只选 DeepSeek-V4-Flash / DeepSeek-V4-Pro；图片轮由 Vision Router 把图交给隐藏的 VLM，VLM 返回观察结果，再由 DeepSeek 推理和回答。这里获得的是“DeepSeek 主模型 + 视觉工具”的多模态体验，不是把当前纯文本 GPTAuth DeepSeek 接口凭空变成原生视觉接口。

不建议员工版沿用 Vision Router 的默认匿名 OVH 兜底：图片会离开公司环境，而且匿名端点只有每 IP、每模型约 2 次/分钟，无企业 SLA。生产安装包应配置公司批准的视觉端点或本地 VLM，并将 `freeFallback` 设为 `false`。

## 资料可信度

用户给出的 [dsh.so Vision / OCR 页面](https://www.dsh.so/use-cases/vision/)确实收录了三个项目，但它是社区目录，不是 DeepSeek 官方插件市场。页面的 JSON-LD 把运营方指向 `ihuajiu/dsh.so`，各 artifact 页也说明数据来自 GitHub/npm，并把“作者声明”与“独立验证”分开。它甚至把 `dsh-vision-router` 的许可证显示为 LGPL-3.0，而 npm、GitHub `LICENSE` 和 `package.json` 均为 MIT。因此版本、许可证、能力和安全结论均以下列上游仓库、npm 元数据与源码为准，不以目录文案为准。

DSH rc.8 官方发布说明只承诺框架层增强：DeepSeek adapter 可配置原生图片请求、命令支持图文输入、`@` 菜单可引用文件和会话；它不代表任意现有 DeepSeek 后端都能读图。见 [DeepSeek Harness dsh-v0.1.0-rc.8 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8)。

官方 CLI 的 Bundle 机制是：`dsh plugin --profile <name> add ...` 把声明了 `dsh.bundle.patch` 的包加入 profile 的 bundle 层，增删或升级 Bundle 后必须重启 profile。见 [rc.8 CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.8/apps/cli/reference/README.zh.md)。员工安装包不应在首次启动时临时联网安装这些依赖；应在构建阶段固定版本、纳入桌面产品依赖与 profile composition，再随安装包交付。

## 1. dsh-vision-router

### 身份、版本与兼容性

- 真实 npm 包：[`dsh-vision-router@1.7.3`](https://www.npmjs.com/package/dsh-vision-router)，npm registry 元数据见 [`registry.npmjs.org/dsh-vision-router`](https://registry.npmjs.org/dsh-vision-router)。
- 源码：[`ysr666/dsh-vision-router`](https://github.com/ysr666/dsh-vision-router)，固定 tag [`v1.7.3`](https://github.com/ysr666/dsh-vision-router/releases/tag/v1.7.3)，commit `26e82a7c2317f6292b8760c6ded665ba1b9ad4ae`，MIT。
- Node 要求：`^22.19.0 || >=24.0.0`。直接依赖为 `@deepseek-ai/schemastery`、`potrace`、`puppeteer-core`、`undici`，`sharp` 为可选 peer。完整清单见 [v1.7.3 package.json](https://github.com/ysr666/dsh-vision-router/blob/v1.7.3/package.json)。
- **rc.8 兼容性有直接证据**：v1.7.3 release 明确包含 “align Vision Router with DSH rc.8 contracts”；其 [Native multimodal cold resume workflow](https://github.com/ysr666/dsh-vision-router/blob/v1.7.3/.github/workflows/native-multimodal-cold-resume.yml) 在 DSH `0.1.0-rc.7`、`0.1.0-rc.8` 与 Node 22/24 矩阵上安装真实发布包并跑冷启动/进程重启契约，tag commit 对应的 CI、资源压力和该 workflow 均成功。`cordis.patch.yml` 也显式处理 rc.8 新增的 `maxImageDimension`。这仍不能代替锐捷桌面包里的端到端粘图验证，但不是纸面猜测。

### 它如何让纯文本 DeepSeek 获得视觉体验

默认 `routing: false` 是工具优先流程：

1. 插件为现有文本 provider 注册同名的“`+ 自动识图`”包装入口，原 provider 与文字轮保持不变。
2. 图片仍由 Harness attachment store 持久化；包装入口声明可接收图片，让请求通过 rc.8 的图片准入。
3. 插件在模型输入边界把图片变成可调用视觉工具的提示，并向 DeepSeek 暴露 `vision_describe`、`vision_ocr`、`vision_ground`、`vision_crop` 等工具。
4. DeepSeek 决定调用哪个视觉工具；工具把选中的图片和问题发给配置好的视觉模型。视觉模型只做识别，返回文本/坐标/裁剪结果。
5. 结果回到同一个 DeepSeek 会话，最终分析、办公任务规划和回答仍由 DeepSeek 完成；识图结果可按附件哈希缓存。

该边界由作者在 [v1.7.3 中文 README 的“为什么是这个插件”与“供应商降级链”](https://github.com/ysr666/dsh-vision-router/blob/v1.7.3/README.zh.md)明确描述：“DeepSeek 始终是大脑，视觉模型只当眼睛”。因此隐藏 VLM 后，员工模型选择器可以仍只显示两个 DeepSeek 模型。

### 功能边界与配置

- 图片粘贴/上传、图片问答、OCR、区域定位/裁剪、像素差异、颜色、SVG trace、抠图、HTML 截图等。桌面截屏工具默认关闭，必须显式开启。
- 默认自动包装所有已启用 provider；可用 `wrappedProviders` 只包装锐捷的两个 DeepSeek route。
- 默认内置 OVH 匿名视觉链；可改为 DSH 中已注册的视觉 provider、OpenAI-compatible HTTP 端点、本地 Ollama 或 LM Studio。配置表见 [README 配置项](https://github.com/ysr666/dsh-vision-router/blob/v1.7.3/README.zh.md#配置项)。
- 常规安装命令是 `npx @deepseek-ai/dsh plugin --profile web add dsh-vision-router`，但本产品应在构建期固定依赖；不要让员工首次启动时执行该命令。
- 无 Python。只有 HTML 截图需要 Chrome/Chromium/Edge；本地 OCR 可用 tesseract，可用性不足时回退 VLM。

### 对锐捷版本的集成建议

- 文字 delegate 必须继续指向现有 GPTAuth/锐捷 provider；不要把认证、SSO、额度或请求计费逻辑迁入插件。
- 不建议直接打开 `stealth` 接管官方 `deepseek-official` 行。该模式会重建官方 adapter，虽复用设置和凭据，但对锐捷自定义 SSO/额度链路属于不必要风险。优先只包装现有锐捷 provider，再在桌面 presentation 层把两个包装条目显示为原来的两个 DeepSeek 名称并隐藏纯文本重复项。
- 企业默认配置至少应包含：仅包装两个 DeepSeek route、`routing: false`、`desktopScreenshot: false`、`freeFallback: false`、视觉端点固定为公司批准的 VLM。若暂时没有批准的 VLM，就不能承诺企业可用的图片理解；匿名 OVH 只能用于研发验证。

### 许可证与供应链

- MIT；随安装包保留许可证。
- npm 1.7.3 由 GitHub Actions trusted publishing 发布，带 SLSA provenance；registry integrity 为 `sha512-cWTjRMYJfvsf7uwxJ16OOoXboAcyyd9jAM10x7cEwSGOahVrngY8Srdy4sPul2og1uT32wbJRNU3ZjdN/zrMAg==`。release 另给 tarball SHA-256 `8a8a97f2f0b9f1ebebe4d5cf3500888fd1a1bc16144596ad52632490490039c1`。
- 风险不是“有没有 provenance”这么简单：插件可读选中的图片、发起外网请求、生成本地文件，还包含可选截屏和更新逻辑。应禁用匿名外发与桌面截屏、固定包版本、禁用产品内自行更新，由锐捷发行流程统一升级。

## 2. dsh-attachment-formats

### 身份、版本与 rc.8 状态

- 源码：[`linkingoscar/dsh-attachment-formats`](https://github.com/linkingoscar/dsh-attachment-formats)，最新 release [`v0.6.4`](https://github.com/linkingoscar/dsh-attachment-formats/releases/tag/v0.6.4)，commit `eb21244d746310e46805ac961e7f2542244ad1f1`，Apache-2.0。
- **npm 精确包名返回 404**：[`registry.npmjs.org/dsh-attachment-formats`](https://registry.npmjs.org/dsh-attachment-formats)。当前只能按作者说明从 GitHub 安装：`dsh plugin --profile web add github:linkingoscar/dsh-attachment-formats`。
- Node `>=20`；直接依赖包含 `pdfjs-dist`、`mammoth`、`exceljs`、`jszip`、`tesseract.js`、`sharp`、`@napi-rs/canvas`、`turndown`。见 [v0.6.4 package.json](https://github.com/linkingoscar/dsh-attachment-formats/blob/v0.6.4/package.json)。
- tag 的 Node 20/22 lint + smoke CI 成功，但 release 发布于 rc.8 之前，workflow 没有装真实 DSH rc.8。好的一面是 rc.8 官方源码仍保留插件使用的 `conversation.input.left`、`conversation.input.dock`、`settings.section` slots；坏的一面是作者明确承认文档卡片“发送时合并”依赖 Harness **未公开的 DOM 事件桥**。因此结论是“基本契约仍在，但不能视为 rc.8 已验证”。

### 能力与无需 Office/Python 的真实边界

按 [v0.6.4 中文 README](https://github.com/linkingoscar/dsh-attachment-formats/blob/v0.6.4/README.zh.md)：

- PDF 有文本层：内置 `pdfjs` 可解析；可选 Python `pymupdf4llm` 提高小型/图表密集 PDF 保真度。
- 扫描 PDF：本地 `tesseract.js` OCR，首次下载 `eng`/`chi_sim` traineddata；源码使用 jsDelivr、projectnaptha 与 npm CDN 作为下载源。也可选百度 OCR、OpenAI-compatible VLM OCR 或外部文档服务。
- DOCX：`mammoth` → HTML → Markdown，正文、标题和表格可提取；公式与内嵌图片不提取。
- XLSX：`exceljs` 输出显示文本/结果；图表、批注不提取。
- PPTX：解压 OOXML 并提取文字。
- 旧 `.doc/.xls/.ppt` 必须安装 LibreOffice；RTF 必须安装 pandoc。用户当前目标只写 PDF、DOCX、XLSX、PPTX，所以把 `DSH_ATTACH_ENGINE=builtin` 作为默认时，可不要求 Office 或 Python，但仍会随包携带 Node 原生模块 `sharp` / `@napi-rs/canvas`。
- 单文件硬上限 64 MiB；超出直接拒绝。扫描 PDF OCR 单次最多 20 页，低置信度会回退为页面图片，由视觉模型处理。
- 文本过长时写入会话工作区 `.dsh-attachments/<sha-16>/doc.md`（或 `doc.json`）、`manifest.json`、`INDEX.md`，消息只放索引卡，随后用 Harness `read` 工具按 offset/limit 分页读取。必须确认锐捷 agent preset 中 `read` 工具对员工默认可用，否则长文档闭环不成立。
- UI 增加回形针按钮，并拦截页面级拖放/粘贴。作者披露：多对话同时打开时，转换出的页面图片可能被其他空闲对话接住；升级后 DOM 事件桥若失效，症状会是“卡片显示但内容未进入消息”。

### 配置与集成建议

- 固定 Git commit 或维护内部镜像/fork，不能依赖浮动的 `github:...` main；在产品锁文件中锁定全部 transitive dependency 和 Windows x64 原生包。
- 第一阶段默认 `DSH_ATTACH_ENGINE=builtin`，`DSH_ATTACH_OCR=tesseract-js`；不要静默启用百度、VLM 或外部 doc server。若要云 OCR，必须走公司批准域名并告知数据去向。
- 在 Electron/Windows 打包门禁中增加：回形针、拖放、粘贴、当前会话归属、DOCX/XLSX/PPTX、文本 PDF、中文扫描 PDF、64 MiB 拒绝、8 万字以上转存与分页读取、冷重启缓存。
- 对 rc.8 新 `@` 文件引用能力做产品取舍，避免出现两个互相冲突的附件入口；如果保留回形针，应让两条路径最终复用同一 attachment/session 归属规则。

### 许可证与供应链

- Apache-2.0；安装包应保留 `LICENSE` 与仓库 `NOTICE`。
- 无 npm provenance；GitHub 安装会增加可复现性和依赖漂移风险。dsh.so 的自动扫描把该项目标为 High Risk，原因包括子进程/动态执行类启发式命中。人工查看源码后，子进程主要用于受控调用项目 venv Python、pandoc 和 LibreOffice，但它仍是能解析不可信文件、启动外部二进制、注册本地 HTTP 路由并写工作区的高权限组件，进入员工版前应做固定 commit 的代码审计和恶意文档测试。
- OCR 首次使用会访问公共 CDN 下载约 24 MiB 语言包，这在离线办公网或供应链审计中不可接受；员工安装包应预置并校验 `eng`/`chi_sim` traineddata，或改为公司制品源。

## 3. dsh-office-tools

### 身份、版本与兼容性

- npm：[`dsh-office-tools@0.1.0`](https://www.npmjs.com/package/dsh-office-tools)，registry 元数据见 [`registry.npmjs.org/dsh-office-tools`](https://registry.npmjs.org/dsh-office-tools)。
- 源码：[`kw78/dsh-office-tools`](https://github.com/kw78/dsh-office-tools)，tag [`v0.1.0`](https://github.com/kw78/dsh-office-tools/tree/v0.1.0)，commit `a5867a1bb8d37f6a80db439f3e003515b842fefd`，MIT。
- 依赖 `docx`、`mammoth`、`xlsx`、`pptxgenjs`、`jszip`；全部在 Node 进程内工作，不调用 Word、Excel、PowerPoint、LibreOffice 或 Python。见 [v0.1.0 package.json](https://github.com/kw78/dsh-office-tools/blob/v0.1.0/package.json)及 [中文 README](https://github.com/kw78/dsh-office-tools/blob/v0.1.0/README.zh.md)。
- 它只注入标准 `ctx.tools` 并调用 `ctx.tools.register()`。rc.8 官方 `ToolRuntime` 仍提供该 API，所以结构风险低于附件 UI 插件；但其 CI 锁定的是 DSH rc.6，没有 rc.8 矩阵，仍需在当前桌面包中跑真实工具 smoke，不能标为已验证兼容。

### 实际能力，不要过度承诺

共七个工具：

| 格式 | 创建 | 读取 | 更新既有文件 |
|---|---:|---:|---:|
| DOCX | `word_create` | `word_read`（纯文本） | **无** |
| XLSX | `excel_create` | `excel_read` | `excel_update` |
| PPTX | `ppt_create` | `ppt_read` | **无** |

补充边界：

- `word_create` 只支持标题、段落、项目符号和一个表格；不是版式级 Word 编辑器。
- `excel_update` 能替换/新建整张 sheet 或按 A1 地址写值，但 SheetJS 重写可能丢失图表、宏等不支持特性。
- `ppt_create` 支持标题、段落、项目符号、备注和 PNG/JPG/GIF 图片；没有对既有 PPT 的增删页/改内容工具。
- 所有路径限制在调用 agent 的会话工作区，并检查真实路径防 symlink 越界；Office 文件读取上限 50 MiB，单次文本/单元格结果和写入都有上限，写文件走临时文件 + rename。默认拒绝覆盖，模型显式传 `overwrite: true` 才覆盖。

### 许可证与供应链

- MIT；保留许可证即可。
- npm 包无 provenance attestation，只有普通 npm registry 签名；项目非常新、只有 0.1.0、单维护者、没有 GitHub Release。npm integrity 为 `sha512-TDXlF+NVtAdrNvSJhVe9GTkydp/dJmnqHiB4rhjfLUVRI2Sdnf+MbAszgpiE02MgTLCm8mM0SF+yvHEH6jiu0Q==`。
- 建议固定 npm 版本和 integrity，并对打包后的 11 MiB 内联 bundle 做一次来源/许可证清单。若要补 Word/PPT 更新，应在内部 fork 中实现并维护测试，不要让产品话术先于能力。

## 推荐的产品组合与验收门槛

推荐最终形态：

```text
员工看到：DeepSeek-V4-Flash / DeepSeek-V4-Pro（仍走原锐捷 SSO、额度和 GPTAuth）
                         │
                         ├─ 纯文字 ───────────────→ 原 DeepSeek provider
                         ├─ 图片 ─ Vision Router ─→ 公司批准的隐藏 VLM ─→ DeepSeek 总结/执行
                         ├─ PDF/Office ─ Attachment Formats ─→ 文本/索引卡/工作区分页读取
                         └─ 生成办公文件 ─ Office Tools ─→ 工作区 DOCX/XLSX/PPTX
```

进入员工安装包前必须同时满足：

1. 模型选择器只有两个锐捷 DeepSeek 展示项；视觉后端不作为聊天模型出现。
2. 文字消息的 provider、认证、SSO、额度显示和计费请求与升级前完全一致。
3. 图片发送后实际调用批准的视觉端点；`freeFallback=false`，断网/限流有明确错误，不偷跑匿名 OVH。
4. PDF、DOCX、XLSX、PPTX 和中文扫描 PDF 在新装 Windows 机器上无需 Office/Python即可解析；OCR 语言包随安装包离线可用。
5. 长文档确实落盘并由 `read` 分页完成问答，不把全文一次塞进上下文；会话切换时附件不串线。
6. Word/PPT 只承诺“创建和读取”，除非先补齐并验收更新工具；Excel 更新需验证图表/宏损失提示。
7. 冷启动、重启续聊、卸载回滚、ASAR/原生模块、Windows x64 新用户安装与无管理员权限场景全部通过。

## 一手来源索引

- DeepSeek Harness rc.8：[release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8)、[CLI Bundle reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.8/apps/cli/reference/README.zh.md)
- Vision Router：[repo](https://github.com/ysr666/dsh-vision-router)、[v1.7.3 release](https://github.com/ysr666/dsh-vision-router/releases/tag/v1.7.3)、[README.zh](https://github.com/ysr666/dsh-vision-router/blob/v1.7.3/README.zh.md)、[package.json](https://github.com/ysr666/dsh-vision-router/blob/v1.7.3/package.json)、[rc.8 CI workflow](https://github.com/ysr666/dsh-vision-router/blob/v1.7.3/.github/workflows/native-multimodal-cold-resume.yml)、[npm registry](https://registry.npmjs.org/dsh-vision-router)
- Attachment Formats：[repo](https://github.com/linkingoscar/dsh-attachment-formats)、[v0.6.4 release](https://github.com/linkingoscar/dsh-attachment-formats/releases/tag/v0.6.4)、[README.zh](https://github.com/linkingoscar/dsh-attachment-formats/blob/v0.6.4/README.zh.md)、[package.json](https://github.com/linkingoscar/dsh-attachment-formats/blob/v0.6.4/package.json)、[client bridge source](https://github.com/linkingoscar/dsh-attachment-formats/blob/v0.6.4/lib/client.js)
- Office Tools：[repo](https://github.com/kw78/dsh-office-tools)、[v0.1.0 source](https://github.com/kw78/dsh-office-tools/tree/v0.1.0)、[README.zh](https://github.com/kw78/dsh-office-tools/blob/v0.1.0/README.zh.md)、[package.json](https://github.com/kw78/dsh-office-tools/blob/v0.1.0/package.json)、[path safety source](https://github.com/kw78/dsh-office-tools/blob/v0.1.0/src/paths.ts)、[npm registry](https://registry.npmjs.org/dsh-office-tools)
- 社区目录（仅用于发现，不作为权威事实源）：[Vision/OCR](https://www.dsh.so/use-cases/vision/)、[Vision Router artifact](https://www.dsh.so/artifact/dsh-vision-router/)、[Attachment Formats artifact](https://www.dsh.so/artifact/dsh-attachment-formats/)、[Office Tools artifact](https://www.dsh.so/artifact/dsh-office-tools/)

## 增量核验：rc.8 与 dsh.so 页面能否让现有 Flash/Pro 接口直接识图

结论是**不能**。这两项本身提供的是“发现插件”和“图片进入模型请求的基础管线”，并不会把一个真实上游仍为纯文本的 `DeepSeek-V4-Flash` / `DeepSeek-V4-Pro` 接口变成视觉模型。

### dsh.so 页面实际是什么

[dsh.so Vision / OCR](https://www.dsh.so/use-cases/vision/)的页面标题是 “Vision / OCR — dsh.so Plugin Registry”，正文说“651 verified plugins support this use case”，即它是插件索引，不是一个装进 Harness 后自动生效的视觉运行时。页面页脚更明确写道：

> “dsh.so is an independent community resource and is not affiliated with DeepSeek AI.”

因此把该页面称为 DeepSeek 官方能力页并不准确。它列出的 `dsh-vision-router` 条目也不是声称原 DeepSeek 接口突然会看图，而是：

> “Eyes for text-only DeepSeek Harness agents: built-in free vision chain (no key) + pixel-level vision tools …”

这里的关键字是 **text-only agents** 与 **built-in free vision chain**：文本 DeepSeek 保持文本模型，插件另接一条真正能看图的视觉链，再把识别结果交还给文本模型。

### rc.8 官方发布说明只承诺可配置的传输管线

[DSH rc.8 官方发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8)原文是：

> “增强多模态支持度，DeepSeek 模型适配器支持配置启用原生图片请求……”

英文原文同样使用限定词：

> “Expand multimodal support with **configurable native image requests** for DeepSeek adapters …”

这表示 adapter 现在能在配置允许时把附件转成图片请求，并不表示默认两个模型或任意自定义网关一定理解图片。

rc.8 同 tag 的官方 [`llm-deepseek` 中文 README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.8/packages/llm/llm-deepseek/README.zh.md)给出了决定性边界：

> “在视觉模型端点完成发布前，默认目录不会公布视觉模型，但部署方可以通过 `inputModalities: [text, image]` 主动添加。”

> “省略 `inputModalities` 则表示仅支持 `text`。”

> “纯文本模型与未列出模型会在凭据、附件或网络 I/O 前拒绝图片输入。”

官方源码和测试进一步固定了这个行为：

- [`DEFAULT_MODELS`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.8/packages/llm/llm-deepseek/src/index.ts#L51-L53)只有 `deepseek-v4-flash` 和 `deepseek-v4-pro`，两项都没有声明图片模态；省略时按 `['text']` 处理。
- [adapter 的图片准入](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.8/packages/llm/llm-deepseek/src/adapter.ts#L235-L251)要求所选 catalog model 显式包含 `image`，否则抛出 `UNSUPPORTED_CONTENT`，根本不会发起网络请求。
- [adapter 的请求序列化](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.8/packages/llm/llm-deepseek/src/adapter.ts#L313-L319)只是在通过准入后把附件序列化为图片 payload。
- [官方默认目录测试](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.0-rc.8/packages/llm/llm-deepseek/tests/adapter.spec.ts#L763-L771)明确期望 Flash 与 Pro 的 `inputModalities` 都是 `['text']`。

还要区分“声明能力”和“真实能力”：把 catalog 手工改为 `[text, image]` 只会让 adapter 尝试发送 `image_url`；真正是否识图仍由 `baseURL` 后面的模型/网关决定。若上游忽略图片或不支持该请求格式，rc.8 不能补造视觉推理。锐捷当前 GPTAuth Flash/Pro 实测会忽略图片，因而不属于可直接启用的原生视觉端点。

### 对锐捷方案的直接含义

要保持员工只看到 `DeepSeek-V4-Flash` 与 `DeepSeek-V4-Pro`，同时实现可靠图片聊天，必须二选一：

1. 后端以后提供真正支持图片的同名或新 DeepSeek 视觉端点，再在 rc.8 catalog 中正确声明 `inputModalities: [text, image]`；或
2. 保留当前两个纯文本 DeepSeek 作为“脑”，在 UI 后面接一个真实 VLM/视觉路由作为“眼睛”。视觉模型无需出现在员工模型选择器中。

当前可执行方案是第 2 种。rc.8 提供必要的附件/图片生命周期与 adapter 扩展基础，Vision Router 提供路由编排；**真正的视觉模型仍是不可省略的依赖**。附件解析插件和本地 OCR 能解决文字提取，但也不能替代通用图片理解模型。
