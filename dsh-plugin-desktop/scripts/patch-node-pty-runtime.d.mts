export const NODE_PTY_UNIX_RUNTIME_PATHS: readonly string[]

export function rewriteNodePtyUnixRuntime(source: string, label: string): string

export function patchNodePtyRuntime(desktopRoot: string): void
