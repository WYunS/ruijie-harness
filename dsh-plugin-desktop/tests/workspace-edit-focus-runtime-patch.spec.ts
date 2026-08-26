import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('workspace editable focus runtime patch', () => {
  it('forces pointer focus for workspace creation and rename editors', () => {
    const clientPath = import.meta.resolve('@deepseek-ai/dsh-client-ui-workspace/client')
    const source = readFileSync(new URL(clientPath), 'utf8')
    expect(source.match(/ruijie-workspace-edit-focus-v1/g)).toHaveLength(1)
    expect(source.match(/onPointerDown: \(event\) => \{ event\.currentTarget\.focus\(\); \}/g)).toHaveLength(2)
  })
})
