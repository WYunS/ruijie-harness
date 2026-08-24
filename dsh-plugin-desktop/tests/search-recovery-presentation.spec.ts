import { describe, expect, it } from 'vitest'
import {
  SEARCH_RECOVERY_PROMPT,
  classifySearchFailureRows,
} from '../src/client/search-recovery-presentation.ts'

describe('search recovery presentation', () => {
  it('keeps one subdued summary for repeated recoverable failures in a user turn', () => {
    expect(classifySearchFailureRows([
      { kind: 'user' },
      { kind: 'assistant' },
      { kind: 'tool-call', toolName: 'web_search', state: 'error' },
      { kind: 'assistant' },
      { kind: 'tool-call', toolName: 'browser_search', state: 'error' },
      { kind: 'tool-call', toolName: 'web_search', state: 'error' },
      { kind: 'tool-call', toolName: 'browser_search', state: 'ok' },
    ])).toEqual(['summary-recovered', 'hidden-duplicate', 'hidden-duplicate'])
  })

  it('starts a fresh group after the next user message', () => {
    expect(classifySearchFailureRows([
      { kind: 'user' },
      { kind: 'tool-call', toolName: 'web_search', state: 'error' },
      { kind: 'user' },
      { kind: 'tool-call', toolName: 'web_search', state: 'error' },
    ])).toEqual(['summary-recovering', 'summary-recovering'])
  })

  it('subdues a failed shell step after a later fallback tool succeeds', () => {
    expect(classifySearchFailureRows([
      { kind: 'user' },
      { kind: 'tool-call', toolName: 'Pwsh', state: 'error' },
      { kind: 'assistant' },
      { kind: 'tool-call', toolName: 'Pwsh', state: 'ok' },
    ])).toEqual(['summary-recovered'])
  })

  it('teaches the agent to switch methods and continue instead of retrying forever', () => {
    expect(SEARCH_RECOVERY_PROMPT).toContain('不要用相同参数重复调用同一个失败的搜索工具')
    expect(SEARCH_RECOVERY_PROMPT).toContain('切换到不同的可用搜索或浏览工具')
    expect(SEARCH_RECOVERY_PROMPT).toContain('继续推进并完成用户任务')
  })
})
