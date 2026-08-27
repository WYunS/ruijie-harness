# 锐捷 Harness 版本发布指南

本指南用于在 1Panel 中发布锐捷 Harness 的 Windows 和 macOS 安装包。以下以从 `2.1.0` 发布到 `2.1.1` 为例；后续版本替换版本号和安装包即可。

`2.1.0` 是首次包含自动更新能力的桥接版本。已经安装 `2.1.0` 的用户可以收到 `2.1.1` 更新提示；`2.0.9` 及更早版本不能远程补上自动更新能力，仍需从网页手动安装一次新版。

## 固定信息与安全边界

- 下载页面：<https://gptauth.ruijie.com.cn/harness/>
- 发布工具：`/data/code/codex/harness_deploy/publish-harness-release.sh`
- 安装包上传目录：`/data/code/codex/deepseek_app/upload`
- 线上文件目录：`/data/code/codex/deepseek_app/site`
- 历史备份目录：`/data/code/codex/deepseek_app/bak`
- 自动更新版本接口：`https://gptauth.ruijie.com.cn/harness/api/desktop/version`
- Windows 自动更新入口：`https://gptauth.ruijie.com.cn/harness/api/downloads/windows`
- macOS 自动更新入口：`https://gptauth.ruijie.com.cn/harness/api/downloads/mac`
- macOS 终端安装入口：`https://gptauth.ruijie.com.cn/harness/install.sh`
- Harness 服务：`harness-site.service`，端口 `13003`

禁止修改 `/data/code/codex/codex_app`、13002 端口、任何 `codex-*` Kubernetes 资源、根域名 `/` 及其他正常运行的服务。不要重启服务器或 containerd。

macOS 安装包必须是同时支持 Intel `x86_64` 与 Apple Silicon `arm64` 的 universal DMG。网页直接下载、应用内更新和 curl 安装都必须使用同一份 DMG。

## 一、准备 2.1.1 安装包

先把产品版本改为 `2.1.1`，完成源码提交、Windows 打包、macOS universal 打包及对应验收。准备两个来自同一业务源码版本的安装包：

```text
Ruijie-Harness-2.1.1-x64-Setup.exe
Ruijie-Harness-2.1.1-macOS-universal.dmg
```

发布前必须记录两个文件的绝对路径、字节数和 SHA-256，并确认：

- 文件名均包含完全相同的三段式版本号 `2.1.1`；
- EXE 具有 `MZ`/PE 文件头；
- DMG 具有有效 UDIF 结尾，构建清单标明 `universal (x86_64 + arm64)`；
- 两个平台使用同一业务源码，不允许内容不同的安装包复用旧版本号；
- Windows 和 macOS 的安装包都已准备好，不能只发布一个平台；
- 不要把安装包上传到 `codex_app`。

已经对外发布过的版本号不能重复使用。如果 `2.1.1` 发布后又修改了产品代码，必须升级为 `2.1.2` 并重新打包，否则已安装的 `2.1.1` 不会发现“同版本的新文件”。

## 二、网站或发布工具有变化时

普通版本只更新 EXE 和 DMG，不需要重新上传网站工具包。

如果网页图片、HTML、安装脚本或发布脚本发生变化，应先在本地网站源码中修改并重新生成网站包，再上传对应文件。不要直接修改线上图片后再运行旧发布包，因为发布向导会按网站包覆盖线上资源。

当前快速发布脚本只做必要的公网状态、响应类型和文件大小校验，不会再从公网完整读取两个大安装包；本地 SHA-256、文件格式、同盘硬链接和版本一致性仍会检查。

## 三、启动发布向导

登录 1Panel，打开“终端”，执行：

```bash
sudo su root
bash /data/code/codex/harness_deploy/publish-harness-release.sh
```

出现 `Ready to start?` 时按 Enter。看到下面提示后保持终端窗口开启：

```text
Stage 1/5 · Upload installers in 1Panel
```

## 四、上传 EXE 和 DMG

在 1Panel 中另行打开“文件”，进入：

```text
/data/code/codex/deepseek_app/upload
```

上传本次 `2.1.1` 的 EXE 和 DMG。如果存在相同文件名，确认本次确实要替换后选择覆盖。等待两个文件都显示上传完成，再回到终端按 Enter。

向导会列出识别到的 Windows 和 macOS 文件，并询问：

```text
Use these two files? [y/N]
```

逐字核对两个文件名均为 `2.1.1`，正确后输入 `y`。

## 五、确认发布

向导会检查：

- EXE 和 DMG 是普通文件而不是链接；
- 两个文件名中的版本号一致；
- 文件格式和大小合理；
- 磁盘空间足以完成备份和原子发布；
- 本地 SHA-256 可正常计算；
- 服务配置不会启用 SPA 回退，三个无扩展名 API 能返回真实文件；
- 公网下载入口的状态、响应类型和文件大小正确。

随后会显示两个 SHA-256，并询问：

```text
Publish version 2.1.1 after creating a backup? [y/N]
```

再次与打包机记录核对。完全一致后输入 `y`。向导会先更新两个安装包和网页，最后才切换版本 JSON。看到下面内容才表示发布成功：

```text
Setup complete
```

如果显示 `Verification failed`，不要重复运行、不要手工补写版本号。脚本会自动恢复发布前的网站；保留完整错误输出并先定位失败命令。

## 六、旧版本备份

每次发布前，向导都会把当前线上网站、版本清单和安装包复制到：

```text
/data/code/codex/deepseek_app/bak/时间-before-新版本号/
```

例如发布 `2.1.1` 时可能生成：

```text
/data/code/codex/deepseek_app/bak/20260901T080000Z-before-2.1.1/
```

该目录保存发布前的 `2.1.0`。不要手动删除 `bak` 中的历史备份。发布成功后，上传暂存目录中的本次 EXE 和 DMG 会被向导清理。

## 七、页面和下载入口

不需要手工修改 `index.html`。向导会从安装包文件名识别版本号并生成：

```text
/data/code/codex/deepseek_app/site/latest.yml
/data/code/codex/deepseek_app/site/latest-mac.yml
```

页面下载行为如下：

1. Windows 主下载按钮下载本版 EXE；
2. Windows 底部下载按钮下载同一份 EXE；
3. 两个 macOS 按钮都打开 macOS 安装弹窗；
4. 弹窗提供两种方式：复制 curl 安装命令，或直接下载同一份 universal DMG；
5. 右上角“立即下载”会识别浏览器平台：Windows 下载 EXE，macOS 打开 macOS 安装弹窗，无法识别时跳到版本选择区域。

macOS curl 命令固定为：

```bash
curl -fsSL https://gptauth.ruijie.com.cn/harness/install.sh | bash
```

该脚本会下载当前 macOS DMG、校验 DMG 和应用 bundle id，并安装或覆盖 `/Applications/锐捷 Harness.app`。运行前必须退出锐捷 Harness；没有写权限时会请求 Mac 管理员密码。内部 DMG 未签名、未公证，首次启动可能仍需在 Finder 中右键选择“打开”。脚本不会关闭 Gatekeeper，也不会静默绕过系统安全策略。

## 八、两类用户如何升级

### A. 已安装 2.1.0 的用户

`2.1.0` 启动约 60 秒后会检查版本接口，此后约每 6 小时检查一次。也可以从托盘选择“检查更新…”立即检查。

发现 `2.1.1` 后只会提示，不会强迫更新：

- 选择“稍后”或关闭提示：继续使用当前版本；后台不会针对同一个版本反复打扰，用户仍可从托盘主动重试。
- Windows 选择下载：安装器进入应用私有更新目录，下载完成后再询问是否退出应用并启动安装器。
- macOS 选择下载：DMG 进入应用私有更新目录并自动打开；用户退出旧应用后手动拖入 Applications 覆盖。

### B. 2.0.9 及更早版本或首次安装用户

这类用户不能自动收到 `2.1.1`，需要打开：

<https://gptauth.ruijie.com.cn/harness/>

- Windows：点击 Windows 下载按钮并运行 EXE；
- macOS：点击 macOS 按钮，在弹窗中选择复制 curl 命令或直接下载 universal DMG。

## 九、发布后公网验收

先检查根站、CodeX 和 Harness，确保没有影响其他服务：

```bash
curl -sS -o /dev/null -w 'root_http=%{http_code}\n' https://gptauth.ruijie.com.cn/
curl -sS -o /dev/null -w 'codex_http=%{http_code}\n' https://gptauth.ruijie.com.cn/codex/
curl -sS -o /dev/null -w 'harness_http=%{http_code}\n' https://gptauth.ruijie.com.cn/harness/
```

三项都应为 `200`。然后检查更新协议：

```bash
curl -fsS https://gptauth.ruijie.com.cn/harness/api/desktop/version
curl -fsSI https://gptauth.ruijie.com.cn/harness/api/downloads/windows
curl -fsSI https://gptauth.ruijie.com.cn/harness/api/downloads/mac
curl -fsSL https://gptauth.ruijie.com.cn/harness/install.sh | head -n 1
```

预期：

- 版本接口返回 `{"version":"2.1.1"}` 和 `application/json`；
- Windows 接口返回 `200`、`application/octet-stream` 和本版 EXE 的准确大小；
- macOS 接口返回 `200`、`application/octet-stream` 和本版 DMG 的准确大小；
- `install.sh` 第一行为 `#!/bin/bash`；
- 页面显示 `2.1.1`，Windows 两个按钮下载同一 EXE；
- macOS 两个按钮打开弹窗，curl 和直接 DMG 两种方式都可用；
- 右上角按钮在 Windows/macOS 上行为正确。

## 十、2.1.1 必做的真实自动更新验收

保留一台已正式安装 `2.1.0` 的测试机，在 `2.1.1` 发布后执行：

1. 从托盘点击“检查更新…”，确认识别到 `2.1.1`；
2. 第一次选择“稍后”，确认应用继续运行；
3. 再从托盘主动检查，确认仍可重新打开提示；
4. 接受更新，确认没有要求选择保存目录；
5. Windows 验证下载完成后询问退出并启动安装器；
6. macOS 验证下载完成后自动打开 DMG，但不会静默覆盖 Applications；
7. 升级后确认版本为 `2.1.1`，登录、历史会话、工作区、模型、插件和设置均保留。

后台同版本不提示、旧版本不降级、网络失败不影响应用启动也应一并确认。不能为了测试提前把线上版本号改成一个尚未上传安装包的版本。

## 十一、异常处理

- 上传过程中不要关闭文件页面，也不要在文件未完成时按 Enter。
- 文件识别错误或 SHA-256 不符时输入 `n`，不要继续。
- 公网验证失败时向导会自动恢复发布前的网站。
- `127.0.0.1:13003` 在服务重启最初一两秒可能出现一次连接失败；只要后续健康检查成功并继续执行，这是正常重试。
- 若失败，记录向导显示的具体失败行和命令，并查看 `journalctl -u harness-site`；不要盲目反复发布。
- 不要自行删除备份、修改 CodeX、重启服务器或 containerd。
- 发布完成后可以关闭 1Panel 和本地电脑；服务器由 systemd 自启动并持续提供网站和下载。

以后发布 `2.1.2`、`2.2.0` 等版本，重复上述流程即可，不需要重新配置域名、Ingress、端口或 systemd 服务。
