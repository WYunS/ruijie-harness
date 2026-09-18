# Full access 冗余提权参数修复与本地验收

日期：2026-09-18。基线：Harness 2.1.10 / `a7c71c4`。本次为其上的本地补丁，未发布新的版本或安装包。

## 原因与范围

不是 Markdown 格式不支持。`write/edit` 在执行文件操作前，无条件检查提权参数是否成对、理由非空、目标权限严格更宽。已处于 `danger-full-access` 的会话误传这些参数也会被拒绝，文件尚未写入。`bash` 有同样问题；此前仅 `pwsh` 做过兼容。

扫描当前 desktop 安装依赖与 vendor 的 `sandbox_permissions` / `validateEscalationArgs` / `approveEscalation` 调用：直接工具入口为 `write/edit`、`bash`、`pwsh`；共享沙箱和审批服务保留原有校验。终端与其他工具未找到这一对提权字段的同类入口。本修复不代表所有文件权限、网络、第三方 CLI 问题都已消除。

## 实现

- `patches/dsh-tool-fs@0.1.0-rc.8.patch`：先解析当前调用的会话策略。实际为 Full access 时返回该策略，不进入冗余提权参数校验；`write/edit` 共用此入口。
- `patches/dsh-tool-bash@0.1.0-rc.8.patch`：按当前策略归一化冗余权限参数，再执行原有命令校验，覆盖前台和后台分支之前的公共入口。
- 既有 `pwsh` 补丁保持；跨工具回归同时验证它未回退。
- 根 `package.json` 的 Yarn resolutions 与 `yarn.lock` 锁定补丁，已安装到真实运行依赖；不是只编辑源码或临时修改 node_modules。
- 未修改 `deepseek-harness/` 子模块，未放宽全局策略。只读、工作区写入、会话级权限覆盖、参数类型校验仍然有效。

模式兼容限于工具 schema 接受的目标值（`workspace-write` / `danger-full-access`）。无效枚举、错误类型、空命令、缺失内容等错误不会被吞掉。

## 回归证据

`tests/tool-full-access.spec.ts` 通过真实工具注册及执行流水线测试。修复前 55 项中 21 项失败，错误与反馈一致；安装补丁后全部通过。

- 同级与较低的合法权限目标；理由正常、缺失、空字符串、纯空白，以及单独传理由。
- 真实 `write/edit` 创建、修改、读回中文与空格路径的 `.md`，核对 CRLF 与中文内容。
- `bash/pwsh` 的执行器边界检查、受限模式不执行、当前会话权限切换。
- 工作区内写入成功、工作区外拒绝、普通参数校验仍有效。
- Windows 原生 PowerShell executor 实际写入并读回临时 Markdown（10 组），不是只检查返回文字。

所有写入都在测试自建目录内；测试结束验证目标路径后清理。没有写用户桌面、调用真实飞书/SSO、修改用户 ACL。Bash 在 Windows 上验证真实工具的参数与调度逻辑，执行器为记录型替身；没有声称完成 macOS 原生 Bash 或安装包验收。

复测命令（仓库根运行）：

```powershell
corepack yarn install --immutable
corepack yarn workspace dsh-plugin-desktop exec vitest run tests/tool-full-access.spec.ts tests/pwsh-full-access.spec.ts tests/windows-pwsh-sandbox.spec.ts
corepack yarn workspace dsh-plugin-desktop exec tsc -p tsconfig.tests.json --noEmit
corepack yarn build
corepack yarn workspace dsh-plugin-desktop verify:loader
corepack yarn workspace dsh-plugin-desktop verify:profile
```

上述针对性回归合计 73 项通过；再加入 `windows-agent-presets.spec.ts`、`module-resolution.spec.ts`、`profiles.spec.ts`、`profile.spec.ts`，最终 7 个测试文件共 114 项全部通过（92.55 秒）。类型检查、本地构建和两个无窗口启动检查均已通过。

## 本机入口与肉眼验收

桌面 `锐捷 Harness (本地开发版).lnk` 指向本仓库 `scripts/start-ruijie-dsh-desktop.vbs`，加载 `dsh-plugin-desktop/lib/main.js`。本地 profile 的三个工具包 Junction 已核对指向本仓库修复后的依赖。

构建完成时旧开发版进程仍在运行。等当前任务结束后，先从托盘完全退出开发版，再双击上述快捷方式；仅关窗口或新建聊天不保证卸载旧模块。不要误开未更新的安装版。本次没有替用户关闭进程或打开窗口。

选择 Full access 后可以发送：

> 在当前工作区新建一个不重名的验收文件夹，用 write 创建“中文测试.md”，写入标题和两行中文；再用 edit 修改其中一行，最后用 read 读回并给我文件路径。我想亲自打开看结果。请实际执行，不要只展示代码，不要覆盖已有文件。

需要针对性复测时，另要求工具带 `sandbox_permissions=danger-full-access`，分别不带理由、带正常理由、带空理由；上述合法冗余参数应不再提前拒绝。自然语言模型是否按要求发出每一种参数组合不保证，确定性覆盖由回归测试完成。

本次没有打 EXE/DMG、触发 Action，也没有更新旧安装版或 Bot 内置的另一份 Harness runtime。发布或同步 Bot 时必须显式带上这次新增补丁与 lockfile。
