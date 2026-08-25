const NAVIGATION_ATTEMPTS = 80
const NAVIGATION_INTERVAL_MS = 50

export function findExactButton(label: string, root: ParentNode): HTMLButtonElement | undefined {
  const labelledButton = [...root.querySelectorAll<HTMLButtonElement>('button')]
    .find(candidate => candidate.textContent?.trim() === label
      || candidate.getAttribute('aria-label')?.trim() === label
      || candidate.getAttribute('title')?.trim() === label)
  if (labelledButton !== undefined) return labelledButton
  if (label !== '设置') return undefined
  return root.querySelector<HTMLElement>('[data-slot="settings.trigger"]')
    ?.closest<HTMLButtonElement>('button') ?? undefined
}

function awaitExactButton(
  label: string,
  root: ParentNode,
  attempts = NAVIGATION_ATTEMPTS,
): Promise<HTMLButtonElement | undefined> {
  return new Promise(resolve => {
    let remaining = attempts
    const find = (): void => {
      const button = findExactButton(label, root)
      if (button !== undefined || remaining <= 1) {
        resolve(button)
        return
      }
      remaining -= 1
      window.setTimeout(find, NAVIGATION_INTERVAL_MS)
    }
    find()
  })
}

function awaitSettingsDialog(attempts = NAVIGATION_ATTEMPTS): Promise<HTMLElement | undefined> {
  return new Promise(resolve => {
    let remaining = attempts
    const find = (): void => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]') ?? undefined
      if (dialog !== undefined || remaining <= 1) {
        resolve(dialog)
        return
      }
      remaining -= 1
      window.setTimeout(find, NAVIGATION_INTERVAL_MS)
    }
    find()
  })
}

/** Open Settings and select IM机器人 only after the user explicitly clicks the sidebar entry. */
export async function openImSettings(): Promise<void> {
  const settingsTrigger = findExactButton('设置', document)
  settingsTrigger?.click()
  const dialog = await awaitSettingsDialog()
  if (dialog === undefined) return
  const plugins = await awaitExactButton('插件', dialog)
  if (plugins === undefined) return
  plugins.click()
  const im = await awaitExactButton('IM机器人', dialog)
  im?.click()
}
