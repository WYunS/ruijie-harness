import { describe, expect, it } from 'vitest'
import { unifiedRuijieModelState } from '../src/client/ruijie-model-directory.ts'

describe('unified Ruijie multimodal model directory', () => {
  it('keeps the source catalog visible while the wrapper catalog is still mounting on first launch', () => {
    const state = unifiedRuijieModelState({
      current: { provider: 'deepseek-vision', model: 'deepseek-v4-flash', reasoningEffort: 'low' },
      routable: true,
      status: 'ready',
      error: null,
      failures: [],
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
          { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
        ],
      }],
    })

    expect(state.current).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'low',
    })
    expect(state.groups).toEqual([{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }])
  })

  it('shows one DeepSeek group with the wrapper reasoning metadata intact', () => {
    const reasoning = {
      efforts: ['off', 'low', 'medium', 'high', 'max'].map(id => ({ id, name: id === 'off' ? 'Off' : id[0]!.toUpperCase() + id.slice(1) })),
      defaultEffort: 'high',
    }
    const state = unifiedRuijieModelState({
      current: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' },
      routable: true,
      status: 'ready',
      error: null,
      failures: [],
      groups: [
        { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning }] },
        {
          id: 'deepseek-vision',
          name: 'DeepSeek + 自动识图',
          models: [
            { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
            { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', reasoning },
          ],
        },
      ],
    })
    expect(state.current).toEqual({
      provider: 'deepseek-vision',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'high',
    })
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0]?.name).toBe('DeepSeek')
    expect(state.groups[0]?.models.map(model => model.name)).toEqual(['DeepSeek-V4-Flash', 'DeepSeek-V4-Pro'])
    expect(state.groups[0]?.models[0]?.reasoning?.efforts.map(effort => effort.name)).toEqual([
      'Off', 'Low', 'Medium', 'High', 'Max',
    ])
  })
})
