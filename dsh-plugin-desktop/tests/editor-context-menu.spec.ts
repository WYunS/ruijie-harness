import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { editorContextMenuRoles } from '../src/editor-context-menu.ts'

describe('desktop editor context menu', () => {
  it('offers native editing commands in editable conversation inputs', () => {
    expect(editorContextMenuRoles({ isEditable: true, hasSelection: false })).toEqual([
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'selectAll',
    ])
  })

  it('offers copy for selected conversation text outside the editor', () => {
    expect(editorContextMenuRoles({ isEditable: false, hasSelection: true })).toEqual(['copy'])
  })

  it('does not replace existing page menus on blank non-editable content', () => {
    expect(editorContextMenuRoles({ isEditable: false, hasSelection: false })).toEqual([])
  })

  it('installs and removes the native menu listener with the desktop window', () => {
    const source = readFileSync(new URL('../src/electron-shell-generation.ts', import.meta.url), 'utf8')
    expect(source).toContain("window.webContents.on('context-menu', showEditorContextMenu)")
    expect(source).toContain("window.webContents.off('context-menu', showEditorContextMenu)")
    expect(source).toContain('Menu.buildFromTemplate(template).popup({ window })')
  })

  it('does not force renderer focus from the host while a client modal is closing', () => {
    const shellSource = readFileSync(new URL('../src/electron-shell-generation.ts', import.meta.url), 'utf8')
    const desktopSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    expect(shellSource).not.toContain('window.webContents.focus()')
    expect(desktopSource).not.toContain('await rm(sessionDirectory, { recursive: true, force: false })\n          runtime.show()')
  })
})
