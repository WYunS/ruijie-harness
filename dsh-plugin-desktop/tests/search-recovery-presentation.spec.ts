import { describe, expect, it } from 'vitest'
import {
  SEARCH_RECOVERY_PROMPT,
  shouldHideIntermediateFailure,
} from '../src/client/search-recovery-presentation.ts'

describe('quiet intermediate failure presentation', () => {
  it('hides every failed tool row from the main conversation immediately', () => {
    expect(shouldHideIntermediateFailure({ insideChatFlow: true, kind: 'tool-call', state: 'error' }))
      .toBe(true)
    expect(shouldHideIntermediateFailure({ insideChatFlow: true, kind: 'tool-call', state: 'running' }))
      .toBe(false)
  })

  it('hides stopped tool rows but leaves final non-tool errors visible', () => {
    expect(shouldHideIntermediateFailure({ insideChatFlow: true, kind: 'tool-call', state: 'stopped' }))
      .toBe(true)
    expect(shouldHideIntermediateFailure({ insideChatFlow: true, kind: 'turn-error', state: 'error' }))
      .toBe(false)
  })

  it('does not alter error rows outside the conversation flow such as the trace view', () => {
    expect(shouldHideIntermediateFailure({ insideChatFlow: false, kind: 'tool-call', state: 'error' }))
      .toBe(false)
  })

  it('teaches the agent to switch methods and continue instead of retrying forever', () => {
    expect(SEARCH_RECOVERY_PROMPT).toContain('不要用相同参数重复调用同一个失败的工具')
    expect(SEARCH_RECOVERY_PROMPT).toContain('切换到不同的可用工具、命令或实现路径')
    expect(SEARCH_RECOVERY_PROMPT).toContain('继续推进并完成用户任务')
  })
})
