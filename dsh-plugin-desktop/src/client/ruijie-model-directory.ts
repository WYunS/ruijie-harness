import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const SOURCE_PROVIDER = 'deepseek-official'
const PUBLIC_PROVIDER = 'deepseek-vision'

interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

interface ModelReasoning {
  efforts: Array<{ id: string; name: string; description?: string }>
  defaultEffort?: string
}

interface ModelProviderGroup {
  id: string
  name: string
  models: Array<{ id: string; name: string; description?: string; reasoning?: ModelReasoning }>
}

interface ModelCatalogFailure {
  id: string
  name: string
  message: string
}

interface SessionModels {
  current: ModelSelection
  routable: boolean
  groups: ModelProviderGroup[]
  failures: ModelCatalogFailure[]
}

export interface RuijieModelDirectoryState {
  current: ModelSelection | null
  routable: boolean | null
  groups: ModelProviderGroup[]
  failures: ModelCatalogFailure[]
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  error: string | null
}

/** Keep one public image-capable DeepSeek group while preserving reasoning metadata. */
export function unifiedRuijieModelState(state: RuijieModelDirectoryState): RuijieModelDirectoryState {
  const publicGroup = state.groups.find(group => group.id === PUBLIC_PROVIDER)
  const sourceGroup = state.groups.find(group => group.id === SOURCE_PROVIDER)
  const visibleGroup = publicGroup ?? sourceGroup
  return {
    ...state,
    current: publicGroup !== undefined && state.current?.provider === SOURCE_PROVIDER
      ? { ...state.current, provider: PUBLIC_PROVIDER }
      : publicGroup === undefined && sourceGroup !== undefined && state.current?.provider === PUBLIC_PROVIDER
        ? { ...state.current, provider: SOURCE_PROVIDER }
        : state.current,
    groups: visibleGroup === undefined ? [] : [{ ...visibleGroup, name: 'DeepSeek' }],
    failures: publicGroup === undefined
      ? state.failures
      : state.failures.filter(failure => failure.id !== SOURCE_PROVIDER),
  }
}

interface PatchableDirectory {
  load(): Promise<SessionModels>
  select(selection: ModelSelection): Promise<void>
  store: {
    getSnapshot(): RuijieModelDirectoryState
    update(update: (state: RuijieModelDirectoryState) => void): void
  }
}

interface PatchableResolver {
  directoryFor(sessionId: string): PatchableDirectory
  live?: { directories?: Map<string, PatchableDirectory> }
}

function patchDirectory(directory: PatchableDirectory, restores: Array<() => void>): void {
  if ((directory as PatchableDirectory & { __ruijieUnified?: boolean }).__ruijieUnified === true) return
  const marked = directory as PatchableDirectory & { __ruijieUnified?: boolean }
  marked.__ruijieUnified = true
  const originalLoad = directory.load.bind(directory)
  let migration: Promise<void> | undefined
  directory.load = async () => {
    let value = await originalLoad()
    if (value.current.provider === SOURCE_PROVIDER
      && value.groups.some(group => group.id === PUBLIC_PROVIDER)) {
      migration ??= directory.select({
        ...value.current,
        provider: PUBLIC_PROVIDER,
      }).finally(() => { migration = undefined })
      await migration
      value = { ...value, current: { ...value.current, provider: PUBLIC_PROVIDER } }
    }
    const unified = unifiedRuijieModelState({
      ...value,
      status: 'ready',
      error: null,
    })
    directory.store.update(state => {
      state.current = unified.current
      state.routable = unified.routable
      state.groups = unified.groups
      state.failures = unified.failures
    })
    return {
      ...value,
      current: unified.current ?? value.current,
      routable: unified.routable ?? value.routable,
      groups: [...unified.groups],
      failures: [...unified.failures],
    }
  }
  restores.push(() => {
    directory.load = originalLoad
    delete marked.__ruijieUnified
  })
}

/** Merge the text and auto-vision catalogs at the client boundary. */
export function applyRuijieUnifiedModelDirectory(ctx: ClientContext): void {
  ctx.inject(['modelDirectories'], (scope) => {
    scope.effect(() => {
      const resolver = (scope as unknown as { modelDirectories: PatchableResolver }).modelDirectories
      const restores: Array<() => void> = []
      const originalDirectoryFor = resolver.directoryFor.bind(resolver)
      resolver.directoryFor = (sessionId: string) => {
        const directory = originalDirectoryFor(sessionId) as PatchableDirectory
        patchDirectory(directory, restores)
        return directory
      }
      for (const directory of resolver.live?.directories?.values() ?? []) {
        patchDirectory(directory, restores)
        void directory.load()
      }
      return () => {
        resolver.directoryFor = originalDirectoryFor
        for (const restore of restores.reverse()) restore()
      }
    }, 'dsh-plugin-desktop: unified Ruijie multimodal model directory')
  })
}
