import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const path = resolve(dirname(require.resolve('@deepseek-ai/dsh-client-ui-workspace/package.json')), 'lib/client.js')
let source = await readFile(path, 'utf8')
const V2_PATCH_MARKER = '/* ruijie-session-lifecycle-v2 */'
const V3_PATCH_MARKER = '/* ruijie-session-lifecycle-v3 */'
const PATCH_MARKER = '/* ruijie-session-lifecycle-v4 */'

if (source.includes(PATCH_MARKER)) process.exit(0)

function replaceOnce(before, after) {
  if (source.includes(after)) return
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Session lifecycle client patch target missing: ${JSON.stringify(before.slice(0, 100))}`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error('Session lifecycle client patch target is ambiguous')
  source = source.slice(0, first) + after + source.slice(first + before.length)
}

function replaceExactCount(before, after, expected) {
  const count = source.split(before).length - 1
  if (count !== expected) throw new Error(`Session lifecycle client patch expected ${expected} targets, found ${count}`)
  source = source.split(before).join(after)
}

const archiveHandler = 'if (id === "archive") { onArchive(node.id); window.dispatchEvent(new CustomEvent("ruijie-session-archived", { detail: node.id })); }'
const v2LifecycleListener = '(0, react.useEffect)(() => { const listener = (event) => { setPermanentlyDeleted((ids) => ids.includes(event.detail) ? ids : [...ids, event.detail]); }; window.addEventListener("ruijie-session-deleted", listener); return () => { window.removeEventListener("ruijie-session-deleted", listener); }; }, []);'
const v3LifecycleListener = '(0, react.useEffect)(() => { const deletedListener = (event) => { setPermanentlyDeleted((ids) => ids.includes(event.detail) ? ids : [...ids, event.detail]); }; const archivedListener = (event) => { setRestoredSessions((ids) => ids.filter((id) => id !== event.detail)); }; window.addEventListener("ruijie-session-deleted", deletedListener); window.addEventListener("ruijie-session-archived", archivedListener); return () => { window.removeEventListener("ruijie-session-deleted", deletedListener); window.removeEventListener("ruijie-session-archived", archivedListener); }; }, []);'
const lifecycleListener = '(0, react.useEffect)(() => { const deletedListener = (event) => { if (sessionList.current === event.detail) { const owner = workspaces.find((workspace) => workspace.sessionIds.includes(event.detail)); startSession(owner?.workspaceId); } setPermanentlyDeleted((ids) => ids.includes(event.detail) ? ids : [...ids, event.detail]); }; const archivedListener = (event) => { setRestoredSessions((ids) => ids.filter((id) => id !== event.detail)); }; window.addEventListener("ruijie-session-deleted", deletedListener); window.addEventListener("ruijie-session-archived", archivedListener); return () => { window.removeEventListener("ruijie-session-deleted", deletedListener); window.removeEventListener("ruijie-session-archived", archivedListener); }; }, [sessionList.current, startSession, workspaces]);'

if (source.includes(V2_PATCH_MARKER)) {
  replaceOnce('if (id === "archive") onArchive(node.id);', archiveHandler)
  replaceOnce(v2LifecycleListener, v3LifecycleListener)
  source = source.replace(V2_PATCH_MARKER, V3_PATCH_MARKER)
}
if (source.includes(V3_PATCH_MARKER)) {
  replaceOnce(v3LifecycleListener, lifecycleListener)
  source = source.replace(V3_PATCH_MARKER, PATCH_MARKER)
  await writeFile(path, source)
  process.exit(0)
}

replaceOnce('max-width:60px;transition:max-width', 'max-width:92px;transition:max-width')
replaceOnce(
  '\t\t\t"menu.archiveSession": "归档会话",',
  '\t\t\t"menu.archiveSession": "归档会话",\n\t\t\t"menu.deleteSession": "彻底删除",\n\t\t\t"archive.view": "查看归档会话",\n\t\t\t"archive.title": "已归档会话",\n\t\t\t"archive.empty": "暂无已归档会话",\n\t\t\t"archive.restore": "恢复",\n\t\t\t"archive.deleteConfirm": "彻底删除后无法恢复，确定删除这个会话吗？",',
)
replaceOnce(
  '\t\t\t"menu.archiveSession": "Archive session",',
  '\t\t\t"menu.archiveSession": "Archive session",\n\t\t\t"menu.deleteSession": "Delete permanently",\n\t\t\t"archive.view": "View archived sessions",\n\t\t\t"archive.title": "Archived sessions",\n\t\t\t"archive.empty": "No archived sessions",\n\t\t\t"archive.restore": "Restore",\n\t\t\t"archive.deleteConfirm": "This cannot be undone. Permanently delete this session?",',
)
replaceOnce(
  '\t\t\t\t{\n\t\t\t\t\tid: "archive",\n\t\t\t\t\tlabel: t("menu.archiveSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })\n\t\t\t\t}\n\t\t\t];',
  '\t\t\t\t{\n\t\t\t\t\tid: "archive",\n\t\t\t\t\tlabel: t("menu.archiveSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })\n\t\t\t\t},\n\t\t\t\t{\n\t\t\t\t\tid: "delete",\n\t\t\t\t\tlabel: t("menu.deleteSession"),\n\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),\n\t\t\t\t\tdanger: true\n\t\t\t\t}\n\t\t\t];',
)
replaceOnce(
  '\t\t\t\t\t\t\t\t\tif (id === "archive") onArchive(node.id);',
  `\t\t\t\t\t\t\t\t\t${archiveHandler}\n\t\t\t\t\t\t\t\t\tif (id === "delete") void deleteSessionPermanently(node.id, t("archive.deleteConfirm"));`,
)
replaceOnce(
  '\t\tfunction WorkspaceBrowser({ wide,',
  '\t\tasync function archivedSessionAction(sessionId, action) {\n\t\t\tconst response = await fetch("/__dsh_desktop/archived-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, sessionId }) });\n\t\t\tif (response.ok) return;\n\t\t\tconst payload = await response.json().catch(() => ({}));\n\t\t\tthrow new Error(typeof payload.error === "string" ? payload.error : "会话操作失败");\n\t\t}\n\t\tasync function deleteSessionPermanently(sessionId, confirmation) {\n\t\t\tif (!window.confirm(confirmation)) return;\n\t\t\ttry { await archivedSessionAction(sessionId, "delete"); window.dispatchEvent(new CustomEvent("ruijie-session-deleted", { detail: sessionId })); } catch (reason) { window.alert(reason instanceof Error ? reason.message : String(reason)); }\n\t\t}\n\t\tfunction WorkspaceBrowser({ wide,',
)
replaceOnce(
  '\t\t\tconst archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);',
  `\t\t\tconst archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);\n\t\t\tconst sessionList = useSessions((state) => state);\n\t\t\tconst [archiveOpen, setArchiveOpen] = (0, react.useState)(false);\n\t\t\tconst [archiveBusy, setArchiveBusy] = (0, react.useState)(null);\n\t\t\tconst [archiveError, setArchiveError] = (0, react.useState)(null);\n\t\t\tconst [permanentlyDeleted, setPermanentlyDeleted] = (0, react.useState)([]);\n\t\t\tconst [restoredSessions, setRestoredSessions] = (0, react.useState)([]);\n\t\t\t${lifecycleListener}\n\t\t\tconst effectiveArchivedSessionIds = [...new Set([...archivedSessionIds.filter((id) => !restoredSessions.includes(id)), ...permanentlyDeleted])];\n\t\t\tconst archivedRows = archivedSessionIds.filter((id) => !permanentlyDeleted.includes(id) && !restoredSessions.includes(id)).map((id) => sessionList.byId[id]).filter((row) => row !== void 0);\n\t\t\tconst runArchiveAction = (sessionId, action) => {\n\t\t\t\tsetArchiveBusy(sessionId); setArchiveError(null);\n\t\t\t\tarchivedSessionAction(sessionId, action).then(() => { if (action === "delete") setPermanentlyDeleted((ids) => [...ids, sessionId]); else setRestoredSessions((ids) => [...ids, sessionId]); }).catch((reason) => { setArchiveError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { setArchiveBusy(null); });\n\t\t\t};`,
)
replaceOnce(
  '\t\t\t\t\t\t\t\tchildren: [wide && (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {',
  '\t\t\t\t\t\t\t\tchildren: [wide && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, { label: t("archive.view"), side: "bottom", delayMs: 500, children: (0, react_jsx_runtime.jsx)("button", { type: "button", className: WorkspaceBrowser_module_css_default.iconButton, "aria-label": t("archive.view"), onClick: () => { setArchiveOpen(true); setArchiveError(null); }, children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 }) }) }), wide && (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {',
)
replaceOnce(
  '\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: renameTarget !== null,',
  '\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: archiveOpen,\n\t\t\t\t\t\tonClose: () => { if (archiveBusy === null) setArchiveOpen(false); },\n\t\t\t\t\t\tcloseLabel: t("close"),\n\t\t\t\t\t\ttitle: t("archive.title"),\n\t\t\t\t\t\tchildren: [archivedRows.length === 0 && (0, react_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", padding: "12px 0" }, children: t("archive.empty") }), ...archivedRows.map((session) => (0, react_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid var(--dsw-alias-border-l3)" }, children: [(0, react_jsx_runtime.jsx)("span", { style: { minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: session.displayTitle }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, { variant: "outline", disabled: archiveBusy !== null, onClick: () => { runArchiveAction(session.id, "restore"); }, children: t("archive.restore") }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, { variant: "outline", className: WorkspaceBrowser_module_css_default.deleteAction, disabled: archiveBusy !== null, onClick: () => { if (window.confirm(t("archive.deleteConfirm"))) runArchiveAction(session.id, "delete"); }, children: t("menu.deleteSession") })] }, session.id)), archiveError !== null && (0, react_jsx_runtime.jsx)("div", { className: WorkspaceBrowser_module_css_default.renameError, role: "alert", children: archiveError })]\n\t\t\t\t\t}),\n\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: renameTarget !== null,',
)

replaceExactCount(
  '\t\t\t\t\t\t\tarchivedSessionIds,',
  '\t\t\t\t\t\t\tarchivedSessionIds: effectiveArchivedSessionIds,',
  3,
)

source = `${PATCH_MARKER}\n${source}`
await writeFile(path, source)
