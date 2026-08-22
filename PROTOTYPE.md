# 锐捷 Harness Windows 内测版

当前版本已经从单机脚本原型推进为可独立启动、可打包验证的 Windows x64 内测版本。Harness 运行时和固定源码基线已整体升级到 `dsh-v0.1.0-rc.8`；GPTAuth 源码、数据库和上游源码均未修改，锐捷品牌与账号能力仍由桌面层组合。

## 当前产品行为

- 产品名称和窗口标题：`锐捷 Harness`
- 模型：`deepseek-v4-flash`、`deepseek-v4-pro`、`gpt-5.6-luna`
- 默认模型：`deepseek-v4-flash`
- 推理等级：`off / low / high / max`
- 默认推理等级：`high`
- 多模态：选择“锐捷多模态（GPT-5.6-Luna）”后支持输入框图片、图文命令以及文件/会话引用；V4 Flash/Pro 保持原有纯文本路由
- 登录：应用自身打开 GPTAuth SSO，不依赖外部 CMD 或开发代理
- 凭证：OAuth Access/Refresh Token 和随机本地代理密钥只保存在应用进程内
- 模型流量：通过仅监听 `127.0.0.1` 的内存代理转发到 GPTAuth OpenAI 兼容接口
- 更新：当前关闭自动更新

V4 Flash/Pro 请求会保留 DeepSeek 的 `thinking` 与 `reasoning_effort` 字段。图片由 rc.8 附件存储校验后转换为临时 `image_url` 数据段，并通过 GPTAuth 已验证的 `gpt-5.6-luna` 路由处理；锐捷本地 OAuth 代理保持消息内容不变，并为非 V4 路由删除不支持的顶层 `thinking` 字段。

## 开发与发布验证

开发启动：

```powershell
corepack yarn dev
```

完整无图形质量门禁：

```powershell
corepack yarn check
```

Windows 发布预检：

```powershell
corepack yarn workspace dsh-plugin-desktop check:win-package
```

未签名 Windows 产物：

```powershell
corepack yarn dist:win-portable
corepack yarn dist:win
```

打包流程直接复用工作区已安装的 Electron 运行时，不需要发布时重新从 GitHub 下载 Electron。

当前发布流程生成并校验 PE、ASAR、运行时闭包和压缩包结构：

- `dsh-plugin-desktop/dist/Ruijie-Harness-<version>-x64-Portable.zip`
- `dsh-plugin-desktop/dist/Ruijie-Harness-<version>-x64-Setup.exe`

便携 ZIP 已在全新隔离目录中完成解压、首次 SSO、窗口启动、Host 和模型代理监听验证。

## 已验证能力

- GPTAuth SSO、PKCE、Access Token 刷新
- DeepSeek V4 Flash + High 推理真实对话
- DSH rc.8 原生图片输入、图片历史限额与多模态请求序列化
- GPTAuth `gpt-5.6-luna` 真实图片识别，以及 V4 纯文本目录和四档推理配置
- 桌面内置登录和模型代理
- Windows x64 便携包和 NSIS 安装器构建
- RJ 图标、锐捷 wordmark、侧栏品牌、SSO 等待界面、窗口标题、应用 ID 和产物命名
- 会话、设置、日志、诊断、PowerShell/文件工具所需运行时闭包

## 正式生产版外部前置项

以下事项无法仅由桌面代码安全完成，需要产品、GPTAuth 后端或企业发布负责人确认：

1. 为 DSH 分配独立 OAuth Client ID，并登记正式回调地址；当前临时复用 `Codex CLI` Client。
2. 明确并验证 GPTAuth 中 DSH 开通规则（老师提到的 `tag=2`、`tag=4`），由服务端拒绝未开通用户。
3. GPTAuth 回调停止携带长期兼容 API Key；桌面当前不会读取或保存该字段，但浏览器回调仍会短暂接触它。
4. 确认额度、账单和模型目录的正式接口契约；当前 CNY 额度显示逻辑与升级前版本保持一致，`gpt-5.6-luna` 已验证接受 OpenAI 兼容 `image_url` 输入，而 GPTAuth 尚未发布上游 `deepseek-v4-flash-vision-exp` 路由。
5. 决定飞连/VPN 是提示还是强制拦截，并提供可稳定探测的内网地址或策略接口。
6. 提供 Windows 企业代码签名证书、签名服务或 CI 权限；当前产物明确为 unsigned。
7. 确定正式发布仓库、版本规则、升级源、灰度和回滚负责人；当前自动更新关闭。
8. 确认最终应用图标规范；当前使用可重复生成的白色 `RJ` 图标，并保留提供的锐捷 wordmark。

完成第 1～3 项后可进入受控员工内测；完成全部事项并通过安全评审、跨机器验收和运维交接后，才能标记为生产 `v1.0`。

## 已知环境限制

当前电脑未开启 Windows 开发者模式/符号链接权限，因此全量测试中 3 个专门创建符号链接的安全用例会在测试准备阶段收到 `EPERM`。这不影响 Windows 发布预检。正式 CI 应在允许创建符号链接的隔离 Runner 上执行全量门禁。
