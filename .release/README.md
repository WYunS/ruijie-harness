# GitHub 三平台候选发布

入口：[Actions → 发布软件](https://github.com/rj-liukaiwen/ruijie-harness/actions/workflows/release.yml)。

填写新版本，选择 `main`，运行 `draft`。同一提交构建 Windows x64 NSIS、macOS Universal DMG、Linux x64 AppImage/deb；成功后在本仓库创建待验 Release 草稿。

Windows 未签名；Mac 沿用项目完整 ad-hoc 签名和最终 DMG 审计，未公证。Mac 再由原生 Intel 运行器校验同一 DMG。Linux 是新接入的实验平台，保留原有 afterPack 闭包验证，并检查 deb 内的真实 Electron/终端原生模块；GUI 登录、升级和发行版覆盖不等于自动通过。

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
