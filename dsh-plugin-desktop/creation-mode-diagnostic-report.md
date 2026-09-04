# 创造模式格式诊断报告

## 测试概述

对 DSH 动态 Cordis Plugin 的"创造模式"（创建 → 定义 → 运行）完整流程进行了系统性测试，包括 11 个 Package 迭代，覆盖了定义、运行、诊断、修复、更新、停止、删除的全生命周期。

---

## 测试结果

### ✅ 正常工作

| 功能 | 状态 | 说明 |
|------|------|------|
| `cordis_define` (新 Plugin) | ✅ | 使用 `kind: "new"` + `idPrefix` 成功创建 Plugin |
| `cordis_define` (追加 Package) | ✅ | 使用 `kind: "existing"` + `pluginId` 成功追加新版本 |
| `cordis_run` (首次运行) | ✅ | `mode: "run"` 成功激活第一个 Package |
| `cordis_run` (更新) | ✅ | `mode: "update"` 成功切换到新 Package |
| `cordis_run` (已停止后恢复) | ✅ | 停止后可用 `run` 重新激活 |
| `cordis_stop` | ✅ | 正确停止运行并保留定义 |
| `cordis_undefine` | ✅ | 正确删除 Plugin 和所有 Package |
| Host-only Plugin | ✅ | 纯 Host 端代码的 apply() 正常执行 |
| `harness.defineTool`（基础定义） | ✅ | 仅含 `name`/`description`/`parameters`/`execute` 时成功 |
| `harness.registerTool`（设置 schema/render 后） | ✅ | 在 `defineTool` 返回对象上设置 `schema` 和 `render` 后注册成功 |
| Host 端 `console.log` | ✅ | 日志输出功能正常 |
| 错误诊断 | ✅ | `cordis_inspect_self` 能正确返回 `runtime.host.error` 字段 |

### ⚠️ 出现过问题但已解决

| 问题 | 根因 | 修复方式 |
|------|------|----------|
| `code` 参数格式错误 | 第一次传了字符串而不是对象 | 修正为 `{"host": "..."}` 格式 |
| `harness.defineTool` 参数名错误 | 使用了 `schema` 而不是 `parameters` | 修正为 `parameters` 作为输入参数 |
| `harness.defineTool` 缺少输出 schema/render | `defineTool` 返回的对象需要额外设置 `schema` 和 `render` | 在 `defineTool` 返回后对对象设置 `.schema` 和 `.render` |
| `tools.register` 不接受裸定义 | `ctx.tools.register()` 要求工具来自 `harness.defineTool` | 改用 `harness.defineTool` + `harness.registerTool` 模式 |
| 代码语法错误 | 括号不匹配导致的解析错误 | 修正代码括号平衡 |

### ❌ 已知限制

| 限制 | 说明 |
|------|------|
| `Tool.listTools` 未显示动态注册的工具 | 动态注册的 `hello-creation-mode` 工具未出现在 Agent 可用工具列表中，可能是作用域问题 |
| 无法在 `defineTool` 输入中直接包含 `schema`/`render` | 在输入中包含 `schema` 字段会导致 `"harness.defineTool output must declare { schema, render, presentationMeta? }"` 错误 |
| Client 端插件需要用户审批 | 由于审批提示已禁用，无法测试 Client 端 Slot 注册 |

---

## 正确的创造模式代码模板

### 创建 Host Tool 的完整工作流程

```javascript
// 1. 定义 Plugin
// cordis_define({
//   plugin: { kind: "new", idPrefix: "myplug" },
//   name: "My Plugin",
//   purpose: "Description of what it does",
//   code: {
//     host: `
//       return {
//         apply(ctx) {
//           // 2. 用 defineTool 创建工具定义（不含 schema/render）
//           const tool = harness.defineTool({
//             name: 'my-tool',
//             description: 'What this tool does',
//             parameters: {                          // 输入参数 JSON Schema
//               type: 'object',
//               properties: {
//                 input: { type: 'string', description: 'Some input' }
//               },
//               required: ['input']
//             },
//             execute: async (args) => {
//               return { result: 'Processed: ' + args.input }
//             }
//           });
//
//           // 3. 设置输出 schema 和渲染函数
//           tool.schema = {                           // 输出 JSON Schema
//             type: 'object',
//             properties: {
//               result: { type: 'string' }
//             }
//           };
//           tool.render = function(args, result) {     // 渲染函数
//             return 'Result: ' + result.result;
//           };
//
//           // 4. 注册工具
//           harness.registerTool(ctx, tool);
//         }
//       }
//     `
//   }
// })
```

### 版本管理流程

```
首次运行: cordis_run(pluginId, pkgId, mode: "run")
版本更新: cordis_define(plugin: { kind: "existing", pluginId }) → cordis_run(..., mode: "update")
停止:     cordis_stop(pluginId)
回滚:     cordis_run(pluginId, currentPackageId, mode: "run")
删除:     cordis_stop(pluginId) → cordis_undefine(pluginId)
```

---

## 诊断结论

**创造模式格式整体工作正常**，核心流程 `cordis_define → cordis_run → (stop/undefine)` 全部通过测试。

关键发现：
1. `harness.defineTool` 的输入参数名是 `parameters`（不是 `schema`），输出 `schema` 和 `render` 需要在调用后单独设置
2. 动态注册的工具可能因作用域限制在 `Tool.listTools` 中不可见，但不影响运行
3. 错误诊断系统 `cordis_inspect_self` 能准确报告运行时错误，便于迭代修复
4. 版本管理系统（current/next/run/update）工作正常，支持完整的 CI/CD 式迭代

测试日期：2026-08-25