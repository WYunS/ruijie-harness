// Tesseract.js 5 classifies Electron worker_threads as "electron" and then
// treats a local Windows langPath as a URL. This host-side worker uses Node
// APIs, so hide only the inherited Electron marker before Tesseract detects
// its environment.
delete process.versions.electron;
require("tesseract.js/src/worker-script/node/index.js");
