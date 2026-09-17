import { describe, expect, it } from 'vitest'
import { secondInstanceUiAction } from '../src/desktop-launch-mode.ts'

describe('second desktop launch while OpenMaus server is running', () => {
  it('mounts the UI when the existing instance is headless', () => {
    expect(secondInstanceUiAction({
      openMausServerMode: true,
      rendererMounted: false,
    })).toBe('mount')
  })

  it('only shows an already mounted UI', () => {
    expect(secondInstanceUiAction({
      openMausServerMode: true,
      rendererMounted: true,
    })).toBe('show')
  })

  it('keeps normal desktop launches on the existing show path', () => {
    expect(secondInstanceUiAction({
      openMausServerMode: false,
      rendererMounted: true,
    })).toBe('show')
  })
})
