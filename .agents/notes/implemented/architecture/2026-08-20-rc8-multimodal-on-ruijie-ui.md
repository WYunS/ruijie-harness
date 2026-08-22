# Agent Note: rc.8 multimodal runtime on the Ruijie UI baseline

Status: implemented

English | [中文](2026-08-20-rc8-multimodal-on-ruijie-ui.zh.md)

## Problem

The actively used Ruijie desktop baseline contained later product work than the earlier prototype copy: the white RJ application icon, supplied Ruijie wordmark, sidebar replacement, visible SSO waiting window, CNY quota presentation, and `锐捷 Harness` packaging identity. Upgrading the older copy produced a functional rc.8 application but silently regressed those user-visible surfaces.

## Decision

Treat `D:\ChatGPT\RuijieDSH` as the source of record. Upgrade its complete published DSH dependency family and pinned upstream source to `0.1.0-rc.8`, port the five package patches, and leave every Ruijie-owned brand, login, account, currency, packaging, and shortcut module in place.

Keep `deepseek-v4-flash` as the default and keep both V4 aliases text-only. GPTAuth does not publish the upstream `deepseek-v4-flash-vision-exp` route. Add the verified GPTAuth `gpt-5.6-luna` wire model as `锐捷多模态（GPT-5.6-Luna）` with `inputModalities: [text, image]`. rc.8 owns image admission, durable references, UI attachment controls, history limits, and OpenAI-compatible `image_url` serialization; the existing OAuth proxy forwards nested content unchanged.

## Verification

The release gate must prove both halves of the merge. Runtime tests pin rc.8 packages and patches and require exactly one image-capable catalog entry. Product tests require the RJ icon generator, Ruijie wordmark asset, sidebar brand replacement, visible SSO waiting window, CNY quota contract, `锐捷 Harness` product identity, and `Ruijie-Harness` artifact names. The live image probe requires GPTAuth Luna to identify the packaged RJ icon through the same data-URL request form.

## Consequences

Future upgrades start from the actively used Ruijie repository, never from a similarly named prototype directory. A release is incomplete if runtime tests pass but the packaged product lacks the expected icon, wordmark, or branded client code. Image capability remains tied to a verified wire model id and must not be inferred from adapter serialization support.
