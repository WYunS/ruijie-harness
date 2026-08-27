import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it } from 'vitest'
import { applyRuijieBrand, RUIJIE_BRAND_STYLES } from '../src/client/ruijie-brand.ts'

interface RenderedElement {
  type: string
  props: Record<string, unknown> & { children?: unknown }
}

interface SlotRegistration {
  name: string
  priority?: number
  component: (props: Record<string, unknown>) => RenderedElement
}

function applyWithSlotHarness(): { injected: string[], registered: SlotRegistration[] } {
  const injected: string[] = []
  const registered: SlotRegistration[] = []
  const drain = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || !(Symbol.iterator in value)) return
    for (const _ of value as Iterable<unknown>) void _
  }
  const ctx = {
    slots: {
      inject(name: string, callback: () => unknown) {
        injected.push(name)
        const value = callback()
        drain(value)
        return value
      },
      register(
        slot: { name: string, priority?: number },
        component: SlotRegistration['component'],
      ) {
        registered.push({ ...slot, component })
        return () => {}
      },
    },
    effect() {},
  } as unknown as ClientContext

  applyRuijieBrand(ctx)
  return { injected, registered }
}

describe('Ruijie Harness rc.8 brand slots', () => {
  it('registers a higher-precedence Ruijie renderer for every brand slot', () => {
    const { injected, registered } = applyWithSlotHarness()

    expect(injected).toEqual([
      'sidebar.brand.mark',
      'sidebar.brand.name',
      'conversation.hero.brand.mark',
    ])
    expect(registered.map(({ name, priority }) => ({ name, priority }))).toEqual([
      { name: 'sidebar.brand.mark', priority: -100 },
      { name: 'sidebar.brand.name', priority: -100 },
      { name: 'conversation.hero.brand.mark', priority: -100 },
    ])
  })

  it('renders the RJ mark in the sidebar rail and conversation hero with distinct hooks', () => {
    const { registered } = applyWithSlotHarness()
    for (const [slotName, hook] of [
      ['sidebar.brand.mark', 'ruijieHarnessSidebarBrandMark'],
      ['conversation.hero.brand.mark', 'ruijieHarnessHeroBrandMark'],
    ] as const) {
      const slot = registered.find(({ name }) => name === slotName)
      expect(slot).toBeDefined()
      const mark = slot!.component(slotName === 'sidebar.brand.mark'
        ? { size: 24 }
        : { size: 24, className: 'hostClass' })
      expect(mark.type).toBe('span')
      expect(mark.props.className).toContain('ruijieHarnessBrandMark')
      expect(mark.props.className).toContain(hook)
      expect(mark.props.children).toBe('RJ')
    }
  })

  it('renders the supplied Ruijie wordmark and red Harness badge', () => {
    const { registered } = applyWithSlotHarness()
    const slot = registered.find(({ name }) => name === 'sidebar.brand.name')
    const brand = slot!.component({})
    const children = brand.props.children as RenderedElement[]
    const [logo, badge] = children

    expect(logo).toBeDefined()
    expect(badge).toBeDefined()
    if (logo === undefined || badge === undefined) throw new Error('Ruijie brand children missing')

    expect(brand.props.className).toBe('ruijieHarnessBrandName')
    expect(logo.type).toBe('img')
    expect(logo.props.alt).toBe('Ruijie 锐捷')
    expect(logo.props.src).toBe('/__dsh_desktop/ruijie-wordmark.png')
    expect(badge.props.className).toBe('ruijieHarnessBadge')
    expect(badge.props.children).toBe('HARNESS')
  })

  it('keeps the expanded-sidebar mark hidden, shifts its name, and removes the preview badge', () => {
    expect(RUIJIE_BRAND_STYLES).toContain('.ruijieHarnessBrandName { height: 24px; margin-left: 0;')
    expect(RUIJIE_BRAND_STYLES).toContain(
      'span:has(> [data-slot="sidebar.brand.mark"] > .ruijieHarnessSidebarBrandMark):has(+ span > [data-slot="sidebar.brand.name"] > .ruijieHarnessBrandName) { display: none; }',
    )
    expect(RUIJIE_BRAND_STYLES).toContain(
      'div:has(> span > [data-slot="conversation.hero.brand.mark"] > .ruijieHarnessHeroBrandMark) > span:last-child { display: none; }',
    )
  })

  it('keeps the Harness badge transparent so dark mode cannot show a white tile', () => {
    expect(RUIJIE_BRAND_STYLES).toMatch(/\.ruijieHarnessBadge[^}]+background:\s*transparent;/su)
    expect(RUIJIE_BRAND_STYLES).not.toMatch(/\.ruijieHarnessBadge[^}]+background:\s*#fff;/su)
  })
})
