interface SessionLifecycleEvent {
  readonly type: string
  readonly data?: unknown
}

function turnNumber(data: unknown): number | undefined {
  if (typeof data !== 'object' || data === null || !('turn' in data)) return undefined
  const turn = (data as { readonly turn?: unknown }).turn
  return typeof turn === 'number' && Number.isInteger(turn) ? turn : undefined
}

/** A loaded session is only busy while at least one turn has not reached turn/end. */
export function isSessionActivelyRunning(events: readonly SessionLifecycleEvent[]): boolean {
  const openTurns = new Set<number>()
  for (const event of events) {
    const turn = turnNumber(event.data)
    if (turn === undefined) continue
    if (event.type === 'turn/start') openTurns.add(turn)
    else if (event.type === 'turn/end') openTurns.delete(turn)
  }
  return openTurns.size > 0
}
