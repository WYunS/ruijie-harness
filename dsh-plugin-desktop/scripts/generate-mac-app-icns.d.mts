export const MAC_ICONSET_ENTRIES: readonly (readonly [filename: string, size: number])[]

export function generateMacIconsetPngs(
  source: string,
  iconsetDirectory: string,
): Promise<void>

export function generateMacAppIcns(
  source?: string,
  output?: string,
  platform?: NodeJS.Platform,
): Promise<void>
