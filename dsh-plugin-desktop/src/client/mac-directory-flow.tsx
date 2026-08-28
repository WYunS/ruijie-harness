import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { useEffect, useRef } from 'react'
import type { DesktopDirectoryFlowOwnerProps } from './contracts.ts'
import { requestDesktopDirectory } from './directory-picker.ts'

export interface DesktopDirectoryPickCycleProps extends DesktopDirectoryFlowOwnerProps {
  readonly pick: () => Promise<string | null>
}

/** One explicit owner-open edge maps to at most one operating-system picker. */
export class DesktopDirectoryPickCycle {
  private armed = false
  private active = true
  private generation = 0
  private current: DesktopDirectoryPickCycleProps | undefined

  update(props: DesktopDirectoryPickCycleProps): void {
    this.active = true
    this.current = props
    if (!props.open) {
      this.armed = false
      return
    }
    if (this.armed) return
    this.armed = true
    const generation = this.generation
    void props.pick().then(
      path => {
        if (!this.active || generation !== this.generation) return
        if (path === null) this.current?.onCancel()
        else this.current?.onPicked(path)
      },
      reason => {
        if (!this.active || generation !== this.generation) return
        this.current?.onError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }

  dispose(): void {
    this.active = false
    this.armed = false
    this.current = undefined
    this.generation += 1
  }
}

/** Renderless macOS flow backed by Electron's app-owned NSOpenPanel. */
export function MacDesktopDirectoryFlow(props: DesktopDirectoryFlowOwnerProps) {
  const cycle = useRef<DesktopDirectoryPickCycle>()
  cycle.current ??= new DesktopDirectoryPickCycle()
  useEffect(() => {
    cycle.current?.update({ ...props, pick: requestDesktopDirectory })
  }, [props.open, props.onCancel, props.onError, props.onPicked])
  useEffect(() => () => { cycle.current?.dispose() }, [])
  return null
}

/** Own both workspace-picking slots on macOS so no helper process receives the grant. */
export function applyMacDesktopDirectoryFlow(ctx: ClientContext): void {
  ctx.slots.inject(
    'conversation.hero.workspace.directoryFlow',
    () => ctx.slots.inject('sidebar.workspaces.directoryFlow', function* () {
      yield ctx.slots.register({ name: 'conversation.hero.workspace.directoryFlow' }, MacDesktopDirectoryFlow)
      yield ctx.slots.register({ name: 'sidebar.workspaces.directoryFlow' }, MacDesktopDirectoryFlow)
    }),
  )
}
