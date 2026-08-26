export const ARCHIVED_SESSION_ACTION_PATH = '/__dsh_desktop/archived-session'

export type ArchivedSessionAction = 'restore' | 'delete' | 'ungroup'

export interface ArchivedSessionActionRequest {
  readonly action: ArchivedSessionAction
  readonly sessionId: string
}
