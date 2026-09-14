import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import sharp from "sharp";

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[2] === "--child") {
  const resultPath = process.argv[3];
  const { disposeOcr, ocrPages } = await import("../node_modules/dsh-attachment-formats/lib/convert/ocr.js");
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "white" }
  }).png().toBuffer();
  try {
    if (process.versions.electron === undefined) throw new Error("Electron runtime marker missing");
    await ocrPages([{ data: png }]);
    writeFileSync(resultPath, JSON.stringify({ ok: true }));
  } finally {
    await disposeOcr();
  }
} else {
  const temp = mkdtempSync(join(tmpdir(), "dsh-electron-ocr-"));
  const resultPath = join(temp, "result.json");
  try {
    const result = spawnSync(electronPath, [scriptPath, "--child", resultPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      timeout: 30_000,
      windowsHide: true
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Electron OCR 子进程退出码 ${result.status}: ${String(result.stderr)}`);
    }
    const verdict = JSON.parse(readFileSync(resultPath, "utf8"));
    if (verdict.ok !== true) throw new Error("Electron OCR worker 未完成初始化");
    console.log("Electron OCR worker 回归通过");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
