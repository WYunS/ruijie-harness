# 锐捷 Harness 版本发布指南

本指南用于在 1Panel 中发布瑞捷 Harness 的 Windows 和 macOS 安装包。以发布 `2.0.9` 为例，后续版本只需替换版本号和安装包。

## 固定信息

- 下载页面：<https://gptauth.ruijie.com.cn/harness/>
- 发布工具：`/data/code/codex/harness_deploy/publish-harness-release.sh`
- 安装包上传目录：`/data/code/codex/deepseek_app/upload`
- 线上文件目录：`/data/code/codex/deepseek_app/site`
- 历史备份目录：`/data/code/codex/deepseek_app/bak`
- 自动更新版本接口：`https://gptauth.ruijie.com.cn/harness/api/desktop/version`
- Windows 自动更新入口：`https://gptauth.ruijie.com.cn/harness/api/downloads/windows`
- macOS 自动更新入口：`https://gptauth.ruijie.com.cn/harness/api/downloads/mac`
- macOS 终端安装入口：`https://gptauth.ruijie.com.cn/harness/install.sh`

macOS 安装包必须是同时支持 Intel `x86_64` 与 Apple Silicon `arm64` 的 universal DMG。网页 macOS 按钮、应用内更新和终端安装命令都使用同一份 DMG。

禁止修改 `/data/code/codex/codex_app`、13002 端口、任何 `codex-*` 资源以及现有 CodeX 路由。

## 一、准备新版安装包

准备同一个版本的一个 Windows EXE 和一个 macOS DMG。两个文件名必须包含相同的三段式版本号，例如：

```text
Ruijie-Harness-2.0.9-x64-Setup.exe
Ruijie-Harness-2.0.9-macOS-universal.dmg
```

不要提前修改文件名，也不要把安装包放进 `codex_app`。

## 二、启动发布向导

登录 1Panel，打开「终端」，执行：

```bash
sudo su root
bash /data/code/codex/harness_deploy/publish-harness-release.sh
```

首次出现提示时按 Enter。看到下面的上传提示后，保持终端窗口开启：

```text
Stage 1/5 · Upload installers in 1Panel
```

## 三、上传 EXE 和 DMG

在 1Panel 中另行打开「文件」，进入：

```text
/data/code/codex/deepseek_app/upload
```

上传新版 EXE 和 DMG，等待两个文件都显示上传完成，再回到终端按 Enter。

脚本显示识别到的两个文件后，会询问：

```text
Use these two files? [y/N]
```

仔细核对文件名，正确则输入 `y` 并按 Enter。

## 四、确认发布

脚本会自动检查：

- EXE 和 DMG 是否为正常文件；
- 两个文件的版本号是否相同；
- 安装包格式和大小是否合理；
- 服务器剩余空间是否足够；
- 两个安装包的 SHA-256 校验值。

随后会询问：

```text
Publish version 2.0.9 after creating a backup? [y/N]
```

确认版本正确后输入 `y` 并按 Enter。看到下面内容即代表发布和自动验收均已成功：

```text
Setup complete
```

终端返回 `root@...#` 后再按 `Ctrl+C` 不会影响已经完成的发布。

## 五、旧版本如何备份

发布新版本前，脚本会先把当前线上网站、版本清单和安装包完整复制到：

```text
/data/code/codex/deepseek_app/bak/时间-before-新版本号/
```

例如发布 `2.0.9` 时，备份目录名称类似：

```text
/data/code/codex/deepseek_app/bak/20260823T130938Z-before-2.0.9/
```

该目录中保存的是发布前的版本，也就是 `2.0.8`。不要手动删除 `bak` 中的历史备份。

## 六、页面版本号和下载入口

不需要手动修改 `index.html`。脚本会从安装包文件名识别版本号，并自动生成：

```text
/data/code/codex/deepseek_app/site/latest.yml
/data/code/codex/deepseek_app/site/latest-mac.yml
```

页面读取这两个清单后会自动完成：

- 两个 Windows 下载入口指向新版 EXE；
- 两个 macOS 下载入口打开同一个安装弹窗；
- 弹窗可复制 `curl -fsSL https://gptauth.ruijie.com.cn/harness/install.sh | bash`，也可直接下载新版 universal DMG；
- 页面显示的 Windows 和 macOS 版本号自动更新；
- 右上角「立即下载」在 Windows 上下载 EXE，在 macOS 上下载 DMG；
- 无法识别操作系统时，右上角按钮跳转到版本选择区域。

同一次发布还会把两个应用内更新下载入口切换到相同的 EXE 和 DMG。脚本完成安装包与网页验证后，最后才把 `/api/desktop/version` 更新为新版本，避免旧客户端先看到新版本却下载不到对应安装包。

## 七、发布后验收

打开下载页面并刷新：

<https://gptauth.ruijie.com.cn/harness/>

检查页面显示的新版本号，并分别点击 Windows、macOS 和右上角下载按钮。也可以在终端查看线上清单：

```bash
curl -fsS https://gptauth.ruijie.com.cn/harness/latest.yml
curl -fsS https://gptauth.ruijie.com.cn/harness/latest-mac.yml
curl -fsS https://gptauth.ruijie.com.cn/harness/api/desktop/version
curl -fsSI https://gptauth.ruijie.com.cn/harness/api/downloads/windows
curl -fsSI https://gptauth.ruijie.com.cn/harness/api/downloads/mac
```

同时确认原 CodeX 页面仍可访问：

```bash
curl -sS -o /dev/null -w 'codex_http=%{http_code}\n' https://gptauth.ruijie.com.cn/codex/
```

正常结果应为 `codex_http=200`。

## 八、异常处理

- 上传过程中不要刷新、关闭 1Panel 文件页面，也不要提前在终端按 Enter。
- 如果文件识别错误，在确认问题处输入 `n`，不要继续发布。
- 校验失败时脚本会停止，上传文件会保留，旧网站不会被替换。
- 发布后的公网验证失败时，脚本会自动恢复发布前的网站文件。
- 遇到异常时保留终端完整输出，不要自行删除目录、重启服务器或修改 CodeX 服务。

以后发布 `2.0.10`、`2.1.0` 等版本，重复上述流程即可；无需重新配置路由、端口或 systemd 服务。
