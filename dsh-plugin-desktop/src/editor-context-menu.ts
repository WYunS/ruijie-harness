export type EditorContextMenuRole = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'

export interface EditorContextMenuTarget {
  readonly isEditable: boolean
  readonly hasSelection: boolean
}

/** Select the native edit commands appropriate for the element under the pointer. */
export function editorContextMenuRoles(target: EditorContextMenuTarget): EditorContextMenuRole[] {
  if (target.isEditable) return ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']
  return target.hasSelection ? ['copy'] : []
}
