# v2.1.7 打包与验收矩阵

- 上游源码：`e366b3b0420f9e40aab6d7bf4cd460b47965a6c4`。
- 增量比较：上一次自动验证的上游 `d557d8806dbf1df3667db0cd6c13c673bccc26fd` → 本次上游；这不是已完成人工验收的基线。
- 完整自动矩阵继续从历史 `v2.0.7` 覆盖全部可见变化，保留基线不确定性说明。
- Windows：x64 Setup EXE；macOS：一个 Universal DMG；Linux：x64 AppImage/deb。
- 结果以当前 Actions 的 summary、日志和 evidence 为准；本文是运行前计划，不代表检查通过。

| 编号 | 功能或风险 / 依据 | 环境与操作 | 预期结果 | 证据 / 初始状态 |
|---|---|---|---|---|
| A01 | 既有功能回归；完整产品依赖 | 三平台完整 check、vendor 一致性、WebView 连续性及打包闭包检查 | 所有适用检查通过，依赖图不漂移 | Actions 构建日志 / 待执行 |
| A02 | OCR worker 在 Electron 下的环境识别与异常处理 | 三平台执行上游新增 verify:attachment-ocr-electron | Electron 子进程中的 OCR 初始化和识别完成，无 Host 崩溃 | Actions 构建日志 / 待执行 |
| A03 | PDF 文字、图像页索引与 OCR | 最终安装副本上传 output/pdf 中纯文字、混合图文、扫描件夹具，使用真实模型追问互补事实 | 分别读取文字、联合图文、OCR；单附件错误不终止会话 | 真人记录 / 未执行 |
| A04 | ZIP 递归转换与安全边界 | 最终安装副本上传含中英文/GBK、Office/PDF、代码和嵌套 SKILL.md 的 ZIP；补充恶意/超限样本 | 能读取实际内容；危险归档拒绝，不越界写入；包内文字保留为待分析材料 | 真人记录 / 未执行 |
| A05 | 转换缓存完整性与持久化 | 专用测试目录删除一个派生产物后重新读取附件，重启后复测 | 不复用残缺缓存；正常缓存和原始附件可用 | 真人记录 / 未执行 |
| A06 | macOS 格式、双架构及新代码签名 | 只生成 DMG；挂载验签；同一 DMG 在原生 Intel runner 续验 | 单个 Universal DMG，双架构原生库正确，ad-hoc signed, not notarized | Mac / Intel evidence / 待执行 |
| A07 | Windows 与 Linux 最终包 | 检查 EXE 签名与 PE；解包 AppImage/deb 并执行包内 Electron 与两份终端模块 | Windows NotSigned；Linux amd64 包和原生终端可用 | 平台 evidence / 待执行 |
| A08 | 登录、真实模型、TCC、升级与企业更新站点 | 按发布交付指南使用专用实体测试账户验收 | 保留用户数据、权限不循环、真实服务可用 | 真人记录 / 未执行；本流程不修改企业更新站点 |

草稿仅用于交付测试候选。自动通过不能替代实体 Mac TCC、真实账号、模型语义理解、安装升级或 Linux 发行版覆盖。
