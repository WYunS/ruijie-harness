import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)

async function patchPackage(specifier, relativePath, replacements) {
  const packageRoot = dirname(require.resolve(`${specifier}/package.json`))
  const path = resolve(packageRoot, relativePath)
  let source = await readFile(path, 'utf8')
  let changed = false
  for (const [replacementIndex, [before, after]] of replacements.entries()) {
    if (source.includes(after)) continue
    const first = source.indexOf(before)
    if (first < 0) throw new Error(`Cross-workspace runtime patch could not find target ${replacementIndex + 1} in ${specifier}/${relativePath}: ${JSON.stringify(before.slice(0, 120))}`)
    if (source.indexOf(before, first + before.length) >= 0) {
      throw new Error(`Cross-workspace runtime patch found multiple targets in ${specifier}/${relativePath}`)
    }
    source = source.slice(0, first) + after + source.slice(first + before.length)
    changed = true
  }
  if (changed) await writeFile(path, source)
}

await patchPackage('@deepseek-ai/dsh-workspace', 'lib/index.js', [
  [
    '\tasync indexHeaders(headers) {\n\t\tfor (const header of headers) await this.indexHeader(header);\n\t}\n\tasync indexHeader(header) {\n\t\tthis.headers.set(header.id, header);\n\t\tthis.sessionPaths.delete(header.id);\n\t\tif (header.cwd === void 0) {\n\t\t\tthis.invalidSessionPaths.set(header.id, "header has no cwd");\n\t\t\treturn;\n\t\t}\n\t\ttry {\n\t\t\tconst path = await realpathNormalize(header.cwd);\n\t\t\tif (!(await stat(path)).isDirectory()) {\n\t\t\t\tthis.invalidSessionPaths.set(header.id, `cwd \'${header.cwd}\' is not a directory`);\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tthis.sessionPaths.set(header.id, path);\n\t\t\tthis.invalidSessionPaths.delete(header.id);\n\t\t} catch {\n\t\t\tthis.invalidSessionPaths.set(header.id, `cwd \'${header.cwd}\' does not resolve`);\n\t\t}\n\t}',
    '\tasync indexHeaders(headers) {\n\t\tconst checkedPaths = /* @__PURE__ */ new Map();\n\t\tfor (const header of headers) {\n\t\t\tlet checked = checkedPaths.get(header.cwd);\n\t\t\tif (checked === void 0) {\n\t\t\t\tchecked = this.checkHeaderPath(header.cwd);\n\t\t\t\tcheckedPaths.set(header.cwd, checked);\n\t\t\t}\n\t\t\tawait this.indexHeader(header, await checked);\n\t\t}\n\t}\n\tasync checkHeaderPath(cwd) {\n\t\tif (cwd === void 0) return { invalid: "header has no cwd" };\n\t\ttry {\n\t\t\tconst path = await realpathNormalize(cwd);\n\t\t\tif (!(await stat(path)).isDirectory()) return { invalid: `cwd \'${cwd}\' is not a directory` };\n\t\t\treturn { path };\n\t\t} catch {\n\t\t\treturn { invalid: `cwd \'${cwd}\' does not resolve` };\n\t\t}\n\t}\n\tasync indexHeader(header, checked) {\n\t\tthis.headers.set(header.id, header);\n\t\tthis.sessionPaths.delete(header.id);\n\t\tif (checked.path !== void 0) {\n\t\t\tthis.sessionPaths.set(header.id, checked.path);\n\t\t\tthis.invalidSessionPaths.delete(header.id);\n\t\t\treturn;\n\t\t}\n\t\tthis.invalidSessionPaths.set(header.id, checked.invalid);\n\t}',
  ],
  [
    '\tget sessionIds() {\n\t\treturn this.record.sessionIds.filter((id) => this.host.sessionPath(id) === this.record.path);\n\t}',
    '\tget sessionIds() {\n\t\treturn this.record.sessionIds;\n\t}',
  ],
  [
    '\tasync insertSessionBefore(sessionId, beforeSessionId) {',
    '\tasync attachMovedSession(sessionId) {\n\t\tif (!this.record.sessionIds.includes(sessionId)) await this.host.readSessionHeader(sessionId);\n\t\tawait this.mutate((record) => record.sessionIds.includes(sessionId) ? record : {\n\t\t\t...record,\n\t\t\tsessionIds: [sessionId, ...record.sessionIds]\n\t\t});\n\t}\n\tasync insertSessionBefore(sessionId, beforeSessionId) {',
  ],
  [
    '\t\t\t\tconst sessionIds = changed.sessionIds.filter((id) => this.host.sessionPath(id) === changed.path);',
    '\t\t\t\tconst sessionIds = changed.sessionIds;',
  ],
  [
    '\tget archivedSessionIds() {',
    '\tmoveSessionBefore(workspaceId, sessionId, beforeSessionId) {\n\t\treturn this.enqueueOperation(async () => {\n\t\t\tconst target = this.entities.get(workspaceId);\n\t\t\tif (target === void 0) throw new WorkspaceOrderInvalidError(workspaceId);\n\t\t\tif (!await this.sessionKnown(sessionId)) throw new WorkspaceMoveInvalidError(`cannot move unknown session \'${sessionId}\'`);\n\t\t\tconst source = [...this.entities.values()].find((candidate) => candidate.sessionIds.includes(sessionId));\n\t\t\tif (source?.id === target.id) {\n\t\t\t\tawait target.insertSessionBefore(sessionId, beforeSessionId);\n\t\t\t\treturn target;\n\t\t\t}\n\t\t\tif (beforeSessionId !== void 0 && !target.sessionIds.includes(beforeSessionId)) {\n\t\t\t\tthrow new WorkspaceMoveInvalidError(`cannot move session \'${sessionId}\' before unaccounted session \'${beforeSessionId}\'`);\n\t\t\t}\n\t\t\tconst sourceIds = source?.sessionIds ?? [];\n\t\t\tconst sourceIndex = sourceIds.indexOf(sessionId);\n\t\t\tconst sourceAnchor = sourceIndex < 0 ? void 0 : sourceIds[sourceIndex + 1];\n\t\t\tif (source !== void 0) await source.detachSession(sessionId);\n\t\t\ttry {\n\t\t\t\tawait target.attachMovedSession(sessionId);\n\t\t\t\tawait target.insertSessionBefore(sessionId, beforeSessionId);\n\t\t\t} catch (error) {\n\t\t\t\ttry {\n\t\t\t\t\tawait target.detachSession(sessionId);\n\t\t\t\t\tif (source !== void 0) {\n\t\t\t\t\t\tawait source.attachMovedSession(sessionId);\n\t\t\t\t\t\tawait source.insertSessionBefore(sessionId, sourceAnchor);\n\t\t\t\t\t}\n\t\t\t\t} catch (rollbackError) {\n\t\t\t\t\tthrow new AggregateError([error, rollbackError], `session \'${sessionId}\' move and rollback both failed`);\n\t\t\t\t}\n\t\t\t\tthrow error;\n\t\t\t}\n\t\t\treturn target;\n\t\t});\n\t}\n\tget archivedSessionIds() {',
  ],
  [
    '\t/**\n\t* Whether a session is live, header-indexed, or present in a fresh',
    '\tunarchiveSession(sessionId) {\n\t\treturn this.enqueueOperation(async () => {\n\t\t\tconst state = this.requireState();\n\t\t\tif (!state.archivedSessionIds.includes(sessionId)) return;\n\t\t\tawait this.setState({ ...state, archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId) });\n\t\t});\n\t}\n\t/**\n\t* Whether a session is live, header-indexed, or present in a fresh',
  ],
])

await patchPackage('@deepseek-ai/dsh-host-apiproxy', 'lib/index.js', [[
  '\t\t\t\t\tawait workspace.insertSessionBefore(payload.sessionId, payload.beforeSessionId);',
  '\t\t\t\t\tawait ctx.workspaceRegistry.moveSessionBefore(WorkspaceId(payload.workspaceId), payload.sessionId, payload.beforeSessionId);',
]])

await patchPackage('@deepseek-ai/dsh-client-ui-workspace', 'lib/client.js', [
  [
    '\t\t\t\tconst group = groups.find((candidate) => candidate.key === activeDrag.accountKey);\n\t\t\t\tif (group === void 0) return;\n\t\t\t\tconst targetIndex = group.sessions.findIndex((session) => session.id === over.id);\n\t\t\t\tif (targetIndex === -1) return;\n\t\t\t\tconst anchor = over.half === "before" ? over.id : group.sessions[targetIndex + 1]?.id;',
    '\t\t\t\tconst targetGroup = groups.find((candidate) => candidate.key === over.accountKey);\n\t\t\t\tif (targetGroup === void 0) return;\n\t\t\t\tconst targetIndex = over.id === void 0 ? -1 : targetGroup.sessions.findIndex((session) => session.id === over.id);\n\t\t\t\tif (over.id !== void 0 && targetIndex === -1) return;\n\t\t\t\tconst anchor = over.id === void 0 ? targetGroup.sessions[0]?.id : over.half === "before" ? over.id : targetGroup.sessions[targetIndex + 1]?.id;',
  ],
  [
    '\t\t\t\tconst sourceIndex = group.sessions.findIndex((session) => session.id === activeDrag.sessionId);\n\t\t\t\tconst anchorIndex = anchor === void 0 ? group.sessions.length : group.sessions.findIndex((session) => session.id === anchor);\n\t\t\t\tif (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;\n\t\t\t\tconst accountSessionIds = activeDrag.accountKey === "" ? orderedUngroupedSessionIds : orderedWorkspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)?.sessionIds;\n\t\t\t\tif (accountSessionIds === void 0) return;\n\t\t\t\tconst nextOrder = accountSessionIds.filter((id) => id !== activeDrag.sessionId);',
    '\t\t\t\tconst sameAccount = activeDrag.accountKey === over.accountKey;\n\t\t\t\tconst sourceIndex = sameAccount ? targetGroup.sessions.findIndex((session) => session.id === activeDrag.sessionId) : -1;\n\t\t\t\tconst anchorIndex = anchor === void 0 ? targetGroup.sessions.length : targetGroup.sessions.findIndex((session) => session.id === anchor);\n\t\t\t\tif (sameAccount && sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;\n\t\t\t\tconst accountSessionIds = over.accountKey === "" ? orderedUngroupedSessionIds : orderedWorkspaces.find((workspace) => workspace.workspaceId === over.accountKey)?.sessionIds;\n\t\t\t\tif (accountSessionIds === void 0) return;\n\t\t\t\tconst nextOrder = accountSessionIds.filter((id) => id !== activeDrag.sessionId);',
  ],
  [
    '\t\t\t\tsetSessionOrder(activeDrag.accountKey, nextOrder.map((id) => id));\n\t\t\t\tif (orderBy === "updated" || activeDrag.accountKey === "") return;\n\t\t\t\tinsertSessionBefore(activeDrag.accountKey, activeDrag.sessionId, anchor).catch((reason) => {',
    '\t\t\t\tsetSessionOrder(over.accountKey, nextOrder.map((id) => id));\n\t\t\t\tif (!sameAccount) {\n\t\t\t\t\tconst sourceOrder = activeDrag.accountKey === "" ? orderedUngroupedSessionIds : orderedWorkspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)?.sessionIds;\n\t\t\t\t\tif (sourceOrder !== void 0) setSessionOrder(activeDrag.accountKey, sourceOrder.filter((id) => id !== activeDrag.sessionId).map((id) => id));\n\t\t\t\t}\n\t\t\t\tif (over.accountKey === "") {\n\t\t\t\t\tarchivedSessionAction(activeDrag.sessionId, "ungroup").catch((reason) => { console.warn("session ungroup rejected:", reason); });\n\t\t\t\t\treturn;\n\t\t\t\t}\n\t\t\t\tif (orderBy === "updated" && sameAccount) return;\n\t\t\t\tinsertSessionBefore(over.accountKey, activeDrag.sessionId, anchor).catch((reason) => {',
  ],
  [
    '\t\t\t\t\t\t\t\t\tconst sameGroupDrag = drag !== null && drag.accountKey === group.key;',
    '\t\t\t\t\t\t\t\t\tconst sameGroupDrag = drag !== null;',
  ],
  [
    '\t\t\t\t\t\t\t\t\t\t\t\t\t\tover: {\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: node.id,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\thalf\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t}',
    '\t\t\t\t\t\t\t\t\t\t\t\t\t\tover: {\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\taccountKey: group.key,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: node.id,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\thalf\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t}',
  ],
  [
    '\t\t\t\t\t\t\t\t\t\t\t\t\tcommitSessionDrag(drag, {\n\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: node.id,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\thalf\n\t\t\t\t\t\t\t\t\t\t\t\t\t});',
    '\t\t\t\t\t\t\t\t\t\t\t\t\tcommitSessionDrag(drag, {\n\t\t\t\t\t\t\t\t\t\t\t\t\t\taccountKey: group.key,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: node.id,\n\t\t\t\t\t\t\t\t\t\t\t\t\t\thalf\n\t\t\t\t\t\t\t\t\t\t\t\t\t});',
  ],
  [
    '\t\t\t\t\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\t\t\tclassName: clsx(WorkspaceBrowser_module_css_default.groupSection, workspaceMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, workspaceMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter),\n\t\t\t\t\t\t\t\tonDragOver: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {\n\t\t\t\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\t\t\t\te.dataTransfer.dropEffect = "move";\n\t\t\t\t\t\t\t\t\thoverWorkspace(workspaceGroupHalf(e));\n\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\tonDrop: workspaceDrag === null || dropWorkspace === void 0 ? void 0 : (e) => {\n\t\t\t\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\t\t\t\tdropWorkspace(workspaceGroupHalf(e));\n\t\t\t\t\t\t\t\t},',
    '\t\t\t\t\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\t\t\tclassName: clsx(WorkspaceBrowser_module_css_default.groupSection, workspaceMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, workspaceMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter),\n\t\t\t\t\t\t\t\tonDragEnter: drag === null || workspaceId === void 0 ? void 0 : (e) => {\n\t\t\t\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\t\t\t\tsetDrag((active) => active === null ? active : { ...active, over: { accountKey: group.key, id: void 0, half: "before" } });\n\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\tonDragOver: drag !== null && workspaceId !== void 0 ? (e) => {\n\t\t\t\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\t\t\t\te.dataTransfer.dropEffect = "move";\n\t\t\t\t\t\t\t\t} : workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {\n\t\t\t\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\t\t\t\te.dataTransfer.dropEffect = "move";\n\t\t\t\t\t\t\t\t\thoverWorkspace(workspaceGroupHalf(e));\n\t\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\t\tonDrop: drag !== null && workspaceId !== void 0 ? (e) => {\n\t\t\t\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\t\t\t\tcommitSessionDrag(drag, drag.over?.accountKey === group.key ? drag.over : { accountKey: group.key, id: void 0, half: "before" });\n\t\t\t\t\t\t\t\t} : workspaceDrag === null || dropWorkspace === void 0 ? void 0 : (e) => {\n\t\t\t\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\t\t\t\tdropWorkspace(workspaceGroupHalf(e));\n\t\t\t\t\t\t\t\t},',
  ],
])
