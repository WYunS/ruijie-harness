export function comparableLock(text) {
  return text.replaceAll('\r\n', '\n').split(/\n(?=")/).map(block => {
    const key = block.split('\n', 1)[0];
    if (!/@file:\.\.\/vendor\/(?:modsearch|dsh-attachment-formats|dsh-better-sidebar|dsh-vision-router)::/.test(key)) return block;
    return block.replace(/^  checksum:.*\n/gm, '')
      .replace(/^(  resolution: .*@file:.*::)hash=[a-f0-9]+&/gm, '$1hash=LOCAL_ARCHIVE&');
  }).join('\n');
}
