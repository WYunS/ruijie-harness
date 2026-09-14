/** Safe, bounded text extraction for ordinary ZIP archives. */
import JSZip from "jszip";

const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "ndjson", "yaml", "yml",
  "toml", "ini", "cfg", "conf", "env", "log", "xml", "html", "htm", "css", "scss",
  "less", "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "java", "kt", "kts", "c", "h",
  "cpp", "hpp", "cc", "cs", "go", "rs", "rb", "php", "swift", "scala", "sql", "r",
  "lua", "pl", "dart", "ex", "exs", "elm", "hs", "clj", "fs", "fsx", "vue", "svelte",
  "graphql", "gql", "proto", "sh", "bat", "cmd", "ps1", "dockerfile", "makefile",
  "cmake", "gradle", "properties", "gitignore", "gitattributes", "editorconfig", "tex", "rst"
]);

/** ZIP 未设置 UTF-8 标志时，优先兼容 Windows 中文压缩软件常见的 GBK 文件名。 */
export function decodeZipFileName(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

function extensionOf(path) {
  const base = path.toLowerCase().split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot < 0 ? base : base.slice(dot + 1);
}

function unsafePath(path) {
  return path.includes("\0") || path.startsWith("/") || path.startsWith("\\")
    || /^[a-z]:[\\/]/i.test(path) || path.replace(/\\/g, "/").split("/").includes("..");
}

/** 保留目录结构，同时替换 Windows 无法落盘的字符和设备名。 */
export function safeZipDiskPath(path) {
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  return String(path).replace(/\\/g, "/").split("/")
    .filter((part) => part !== "" && part !== ".")
    .map((part) => {
      let safe = part.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/[ .]+$/g, "");
      if (safe === "") safe = "_";
      if (reserved.test(safe)) safe = `_${safe}`;
      return safe;
    })
    .join("/");
}

function metadataOf(entry) {
  const data = entry?._data;
  return {
    compressed: Number(data?.compressedSize),
    uncompressed: Number(data?.uncompressedSize)
  };
}

function decodeText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2)).replace(/\r\n?/g, "\n");
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2);
    const swapped = Uint8Array.from(body, (_, index) => body[index ^ 1] ?? 0);
    return new TextDecoder("utf-16le").decode(swapped).replace(/\r\n?/g, "\n");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("gb18030").decode(bytes);
  }
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function isZipTextPath(path) {
  return TEXT_EXTENSIONS.has(extensionOf(path));
}

function fenced(text) {
  const runs = text.match(/`+/g) ?? [];
  const width = Math.max(3, ...runs.map((run) => run.length + 1));
  const fence = "`".repeat(width);
  return `${fence}\n${text}\n${fence}`;
}

export async function extractZipEntries(data) {
  let zip;
  try {
    zip = await JSZip.loadAsync(Buffer.from(data), {
      checkCRC32: false,
      decodeFileName: decodeZipFileName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/encrypt/i.test(message)) throw new Error("ZIP 已加密，无法读取；请解密后重试");
    throw new Error(`ZIP 文件损坏或格式不兼容：${message}`);
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_ENTRIES) throw new Error(`ZIP 条目过多（${entries.length}，上限 ${MAX_ENTRIES}）`);

  let total = 0;
  for (const entry of entries) {
    const original = String(entry.unsafeOriginalName ?? entry.name);
    if (unsafePath(original)) throw new Error(`ZIP 内含不安全路径：${original}`);
    if ((Number(entry.unixPermissions) & 0o170000) === 0o120000) {
      throw new Error(`ZIP 内含符号链接：${entry.name}`);
    }
    const { compressed, uncompressed } = metadataOf(entry);
    if (Number.isFinite(uncompressed)) {
      if (uncompressed > MAX_ENTRY_BYTES) throw new Error(`ZIP 条目过大：${entry.name}（单文件上限 8MB）`);
      total += uncompressed;
      if (total > MAX_TOTAL_BYTES) throw new Error("ZIP 解压后内容超过 32MB 上限");
      if (Number.isFinite(compressed) && uncompressed > 1024 * 1024
        && uncompressed / Math.max(1, compressed) > MAX_COMPRESSION_RATIO) {
        throw new Error(`ZIP 条目压缩比异常：${entry.name}`);
      }
    }
  }

  let extractedTotal = 0;
  const extracted = [];
  for (const entry of entries) {
    const bytes = await entry.async("uint8array");
    extractedTotal += bytes.length;
    if (bytes.length > MAX_ENTRY_BYTES) throw new Error(`ZIP 条目过大：${entry.name}（单文件上限 8MB）`);
    if (extractedTotal > MAX_TOTAL_BYTES) throw new Error("ZIP 解压后内容超过 32MB 上限");
    let text = null;
    if (isZipTextPath(entry.name)) {
      const head = bytes.subarray(0, Math.min(8192, bytes.length));
      const nuls = head.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
      const utf16Bom = head[0] === 0xff && head[1] === 0xfe || head[0] === 0xfe && head[1] === 0xff;
      if (utf16Bom || nuls < Math.max(3, Math.ceil(head.length * 0.02))) text = decodeText(bytes);
    }
    const { compressed, uncompressed } = metadataOf(entry);
    extracted.push({
      name: String(entry.name).replace(/\\/g, "/"),
      diskPath: safeZipDiskPath(entry.name),
      bytes: Buffer.from(bytes),
      compressed,
      uncompressed,
      text
    });
  }
  return extracted;
}

export async function zipToMarkdown(data) {
  const entries = await extractZipEntries(data);
  const displayName = (name) => String(name).replace(/[\r\n\t]/g, " ");
  const lines = ["# ZIP 内容", "", `共 ${entries.length} 个文件。`, "", "## 文件清单"];
  for (const entry of entries) {
    lines.push(`- ${displayName(entry.name)}${Number.isFinite(entry.uncompressed) ? `（${entry.uncompressed} 字节）` : ""}`);
  }
  const skipped = [];
  for (const entry of entries) {
    if (entry.text === null) {
      skipped.push(entry.name);
      continue;
    }
    lines.push("", `## ${displayName(entry.name)}`, "", fenced(entry.text));
  }
  if (skipped.length > 0) lines.push("", "## 未展开", "", ...skipped.map((name) => `- ${name}`));
  return lines.join("\n");
}
