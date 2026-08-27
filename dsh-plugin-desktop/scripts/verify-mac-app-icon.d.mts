export function premultipliedChannelMae(
  actual: Uint8Array,
  expected: Uint8Array,
): number

export function verifyMacIcns(
  sourcePath: string,
  icnsPath: string,
  label: string,
): Promise<void>

export function verifyPackagedMacIcons(
  sourcePath: string,
  appIcnsPath: string,
  volumeIcnsPath: string,
): Promise<void>
