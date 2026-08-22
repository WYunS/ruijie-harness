import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  SidebarBrandMarkOwnerProps,
  SidebarBrandNameOwnerProps,
} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { RUIJIE_BRAND_WORDMARK_PATH } from '../ruijie-account-contract.ts'

const RUIJIE_BRAND_PRIORITY = -100

export const RUIJIE_BRAND_STYLES = `
.ruijieHarnessBrandMark {
  box-sizing: border-box;
  flex: none;
  color: #fff;
  background: linear-gradient(145deg, #6f80ff 0%, #3f57d4 100%);
  display: inline-grid;
  place-items: center;
  font-family: "Segoe UI", Arial, sans-serif;
  font-style: italic;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.08em;
}
.ruijieHarnessBrandName { height: 24px; margin-left: 0; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.ruijieHarnessBrandLogo { display: block; width: 112px; height: 20px; object-fit: contain; }
.ruijieHarnessBadge { box-sizing: border-box; height: 20px; padding: 2px 5px 1px; border: 1px solid #d71920; border-radius: 5px; color: #d71920; background: #fff; display: inline-flex; align-items: center; font: 700 10px/1 "Segoe UI", Arial, sans-serif; letter-spacing: .55px; }
span:has(> [data-slot="sidebar.brand.mark"] > .ruijieHarnessSidebarBrandMark):has(+ span > [data-slot="sidebar.brand.name"] > .ruijieHarnessBrandName) { display: none; }
div:has(> span > [data-slot="conversation.hero.brand.mark"] > .ruijieHarnessHeroBrandMark) { grid-template-columns: 34px auto; }
div:has(> span > [data-slot="conversation.hero.brand.mark"] > .ruijieHarnessHeroBrandMark) > span:last-child { display: none; }
`

type RuijieBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

function RuijieBrandMark({ size, className }: RuijieBrandMarkProps) {
  return createElement('span', {
    'aria-hidden': 'true',
    className: [
      'ruijieHarnessBrandMark',
      className === undefined ? 'ruijieHarnessSidebarBrandMark' : 'ruijieHarnessHeroBrandMark',
      className,
    ].filter(Boolean).join(' '),
    style: {
      width: size,
      height: size,
      borderRadius: Math.max(7, Math.round(size * 0.28)),
      fontSize: Math.max(8, Math.round(size * 0.43)),
    },
  }, 'RJ')
}

function RuijieBrandName(_props: SidebarBrandNameOwnerProps) {
  return createElement('span', { className: 'ruijieHarnessBrandName' },
    createElement('img', {
      className: 'ruijieHarnessBrandLogo',
      src: RUIJIE_BRAND_WORDMARK_PATH,
      alt: 'Ruijie 锐捷',
    }),
    createElement('span', { className: 'ruijieHarnessBadge' }, 'HARNESS'),
  )
}

function installRuijieBrandStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.pluginCss = 'dsh-plugin-desktop/ruijie-brand'
  style.textContent = RUIJIE_BRAND_STYLES
  document.head.appendChild(style)
  return () => { style.remove() }
}

/** Shadow the rc.8 official brand slots while leaving all sidebar/session behavior upstream-owned. */
export function applyRuijieBrand(ctx: ClientContext): void {
  ctx.effect(
    () => installRuijieBrandStyles(),
    'dsh-plugin-desktop: Ruijie Harness brand styles',
  )
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register(
          { name: 'sidebar.brand.mark', priority: RUIJIE_BRAND_PRIORITY },
          RuijieBrandMark,
        )
        yield ctx.slots.register(
          { name: 'sidebar.brand.name', priority: RUIJIE_BRAND_PRIORITY },
          RuijieBrandName,
        )
        yield ctx.slots.register(
          { name: 'conversation.hero.brand.mark', priority: RUIJIE_BRAND_PRIORITY },
          RuijieBrandMark,
        )
      }),
    ),
  )
}
