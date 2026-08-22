# Agent Note：在锐捷 UI 基线上升级 rc.8 多模态运行时

Status: implemented

[English](2026-08-20-rc8-multimodal-on-ruijie-ui.md) | 中文

## Problem

实际使用的锐捷桌面基线比早期 prototype 副本包含更新的产品改动：白色 RJ 应用图标、提供的锐捷 wordmark、侧栏品牌替换、可见的 SSO 等待窗口、CNY 额度显示和 `锐捷 Harness` 打包标识。若升级旧副本，虽然能得到可运行的 rc.8 应用，却会无声回退这些用户可见界面。

## Decision

将 `D:\ChatGPT\RuijieDSH` 作为唯一源码基线。把其完整 DSH 发布依赖 family 和上游源码 pin 升级到 `0.1.0-rc.8`，移植五个 package patch，同时保留所有锐捷自有的品牌、登录、账号、币种、打包和快捷方式模块。

默认模型继续使用 `deepseek-v4-flash`，两个 V4 别名继续保持纯文本。GPTAuth 尚未发布上游 `deepseek-v4-flash-vision-exp` 路由，因此新增已验证的 GPTAuth wire model `gpt-5.6-luna`，显示为“锐捷多模态（GPT-5.6-Luna）”，并声明 `inputModalities: [text, image]`。图片准入、持久引用、界面附件控件、历史限额和 OpenAI 兼容 `image_url` 序列化由 rc.8 负责；既有 OAuth 代理原样转发嵌套内容。

## Verification

发布门禁必须同时证明合并的两部分。运行时测试固定 rc.8 package 和 patch，并要求模型目录恰好有一个图片能力条目。产品测试要求 RJ 图标生成器、锐捷 wordmark 资源、侧栏品牌替换、可见 SSO 等待窗口、CNY 额度契约、`锐捷 Harness` 产品标识和 `Ruijie-Harness` 产物命名都继续存在。真实图片探针要求 GPTAuth Luna 通过相同的 data URL 请求格式识别打包的 RJ 图标。

## Consequences

今后的升级必须从实际使用的锐捷仓库开始，不能再从名称相近的 prototype 目录开始。即使运行时测试通过，只要打包产品缺少预期图标、wordmark 或品牌客户端代码，发布就仍未完成。图片能力必须绑定到已经验证的 wire model id，不能仅凭适配器支持序列化就推断模型能够看图。
