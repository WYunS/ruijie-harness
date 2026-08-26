import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const path = resolve(dirname(require.resolve('@deepseek-ai/dsh-client-ui-workspace/package.json')), 'lib/client.js')
let source = await readFile(path, 'utf8')
const PATCH_MARKER = '/* ruijie-session-delete-dialog-v1 */'

if (source.includes(PATCH_MARKER)) process.exit(0)
if (!source.includes('/* ruijie-session-lifecycle-v4 */')) {
  throw new Error('Session delete dialog patch requires ruijie-session-lifecycle-v4')
}

function replaceOnce(before, after) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Session delete dialog patch target missing: ${JSON.stringify(before.slice(0, 100))}`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error('Session delete dialog patch target is ambiguous')
  source = source.slice(0, first) + after + source.slice(first + before.length)
}

replaceOnce(
  '\t\tasync function deleteSessionPermanently(sessionId, confirmation) {\n\t\t\tif (!window.confirm(confirmation)) return;\n\t\t\ttry { await archivedSessionAction(sessionId, "delete"); window.dispatchEvent(new CustomEvent("ruijie-session-deleted", { detail: sessionId })); } catch (reason) { window.alert(reason instanceof Error ? reason.message : String(reason)); }\n\t\t}',
  '\t\tfunction deleteSessionPermanently(sessionId) {\n\t\t\twindow.dispatchEvent(new CustomEvent("ruijie-session-delete-request", { detail: sessionId }));\n\t\t}',
)

replaceOnce(
  'if (id === "delete") void deleteSessionPermanently(node.id, t("archive.deleteConfirm"));',
  'if (id === "delete") deleteSessionPermanently(node.id);',
)

replaceOnce(
  '\t\t\tconst [archiveError, setArchiveError] = (0, react.useState)(null);',
  '\t\t\tconst [archiveError, setArchiveError] = (0, react.useState)(null);\n\t\t\tconst [deleteConfirmTarget, setDeleteConfirmTarget] = (0, react.useState)(null);\n\t\t\t(0, react.useEffect)(() => { const listener = (event) => { setArchiveOpen(false); setArchiveError(null); setDeleteConfirmTarget(event.detail); }; window.addEventListener("ruijie-session-delete-request", listener); return () => { window.removeEventListener("ruijie-session-delete-request", listener); }; }, []);',
)

replaceOnce(
  '\t\t\t\tarchivedSessionAction(sessionId, action).then(() => { if (action === "delete") setPermanentlyDeleted((ids) => [...ids, sessionId]); else setRestoredSessions((ids) => [...ids, sessionId]); }).catch((reason) => { setArchiveError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { setArchiveBusy(null); });',
  '\t\t\t\tarchivedSessionAction(sessionId, action).then(() => { if (action === "delete") { setDeleteConfirmTarget(null); window.dispatchEvent(new CustomEvent("ruijie-session-deleted", { detail: sessionId })); } else setRestoredSessions((ids) => [...ids, sessionId]); }).catch((reason) => { setArchiveError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { setArchiveBusy(null); });',
)

replaceOnce(
  'onClick: () => { if (window.confirm(t("archive.deleteConfirm"))) runArchiveAction(session.id, "delete"); }',
  'onClick: () => { setArchiveOpen(false); setArchiveError(null); setDeleteConfirmTarget(session.id); }',
)

replaceOnce(
  '\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: renameTarget !== null,',
  '\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: deleteConfirmTarget !== null,\n\t\t\t\t\t\tonClose: () => { if (archiveBusy === null) { setDeleteConfirmTarget(null); setArchiveError(null); } },\n\t\t\t\t\t\tcloseLabel: t("close"),\n\t\t\t\t\t\ttitle: t("menu.deleteSession"),\n\t\t\t\t\t\tfooter: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, { variant: "outline", disabled: archiveBusy !== null, onClick: () => { setDeleteConfirmTarget(null); setArchiveError(null); }, children: t("cancel") }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, { variant: "outline", className: WorkspaceBrowser_module_css_default.deleteAction, disabled: archiveBusy !== null, onClick: () => { if (deleteConfirmTarget !== null) runArchiveAction(deleteConfirmTarget, "delete"); }, children: t("menu.deleteSession") })] }),\n\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("div", { children: t("archive.deleteConfirm") }), archiveError !== null && (0, react_jsx_runtime.jsx)("div", { className: WorkspaceBrowser_module_css_default.renameError, role: "alert", children: archiveError })]\n\t\t\t\t\t}),\n\t\t\t\t\t(0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {\n\t\t\t\t\t\topen: renameTarget !== null,',
)

if (source.includes('window.confirm(') || source.includes('window.alert(')) {
  throw new Error('Session delete dialog patch left a blocking JavaScript dialog in the workspace client')
}

source = `${PATCH_MARKER}\n${source}`
await writeFile(path, source)
