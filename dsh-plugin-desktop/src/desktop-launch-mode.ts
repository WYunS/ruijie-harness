/** Decide how a second launch request should reach the desktop surface. */

export type SecondInstanceUiAction = 'mount' | 'show'

export function secondInstanceUiAction(input: {
  readonly openMausServerMode: boolean
  readonly rendererMounted: boolean
}): SecondInstanceUiAction {
  return input.openMausServerMode && !input.rendererMounted ? 'mount' : 'show'
}
