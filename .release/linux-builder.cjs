const original = require('../dsh-plugin-desktop/package.json').build;
module.exports = {
  ...original,
  // Preserve the project afterPack runtime verifier and original app identity.
  extraMetadata: { author: { name: 'Ruijie Harness contributors', email: 'rj-liukaiwen@users.noreply.github.com' } },
  linux: {
    ...original.linux,
    executableName: 'ruijie-harness',
    category: 'Development',
    maintainer: 'rj-liukaiwen <rj-liukaiwen@users.noreply.github.com>',
    artifactName: 'Ruijie-Harness-${version}-linux-${arch}.${ext}',
    target: ['AppImage', 'deb'],
  },
};
