/** Desktop search recovery prompt contribution. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { SEARCH_RECOVERY_PROMPT } from './search-recovery-policy.ts'

export const name = 'desktop-search-recovery'
export const inject = ['systemPrompt']

/** Register the model policy independently from the native window shell. */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.systemPrompt.section({
      name: 'ruijie-desktop:search-recovery',
      order: 175,
      text: SEARCH_RECOVERY_PROMPT,
    }),
    'dsh-plugin-desktop: search recovery policy',
  )
}
