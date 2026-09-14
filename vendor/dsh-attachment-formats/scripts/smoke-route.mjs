/**
 * dsh-attachment-formats — 路由级端到端测试（不依赖运行中的 dsh）。
 *
 * 用假 cordis ctx + 假 req/res 直接驱动 lib/index.js 注册的 convert 路由，
 * 覆盖 v2a 全部通道：PDF 文字优先（text/index/images 三级）、Office 直插、
 * 长文本/长 JSON 索引卡落盘、错误映射。
 * 运行：npm run smoke:route
 */
import { Readable } from "node:stream";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { createCanvas } from "@napi-rs/canvas";
import * as plugin from "../lib/index.js";
import { probePythonEngine } from "../lib/convert/provider.js";
import { shortHashOf } from "../lib/cache.js";
import { decodeZipFileName } from "../lib/convert/archive.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePdf = readFileSync(join(root, "temp", "fixture.pdf"));
const fixtureDocx = readFileSync(join(root, "temp", "fixture.docx"));
const testCwd = mkdtempSync(join(tmpdir(), "dsh-attach-test-"));

let failures = 0;
function check(label, ok, extra = "") {
  if (ok) console.log(`  ok  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label} ${extra}`);
  }
}

/** 无文本层 PDF（只有一块灰矩形）——扫描件回退夹具。 */
function buildBlankPdf() {
  const content = "q 0.5 0.5 0.5 RG 72 72 100 100 re f Q";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objs.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
const fixtureBlankPdf = buildBlankPdf();

/** 同时包含文字层和位图的 PDF。 */
function buildMixedPdf() {
  const canvas = createCanvas(80, 80);
  const context = canvas.getContext("2d");
  context.fillStyle = "#e11d48";
  context.fillRect(0, 0, 80, 80);
  const jpeg = canvas.toBuffer("image/jpeg", 80);
  const content = "BT /F1 12 Tf 72 740 Td (Mixed PDF text layer) Tj ET\nq 160 0 0 160 72 500 cm /Im1 Do Q";
  const imageHead = `<< /Type /XObject /Subtype /Image /Width 80 /Height 80 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    imageHead,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objs.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${i + 1} 0 obj\n${objs[i]}`;
    if (i === 4) pdf += jpeg.toString("binary") + "\nendstream\nendobj\n";
    else pdf += "\nendobj\n";
  }
  const xrefStart = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
const fixtureMixedPdf = buildMixedPdf();

async function buildZip(entries) {
  const zip = new JSZip();
  for (const [name, value] of entries) zip.file(name, value);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** 多行文本 PDF（Helvetica 文字层）——惰性页面图/低预算分流夹具。 */
function buildTextPdf(lines) {
  const ops = ["BT /F1 12 Tf 72 740 Td"]
    .concat(lines.map((line) => `(${line}) Tj 0 -14 Td`))
    .join("\n") + "\nET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objs.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

/** 长 Markdown（>60k 字符，带两级标题）。 */
function buildLongMd() {
  const heading = (level, text) => `${"#".repeat(level)} ${text}\n`;
  let md = heading(1, "长文档测试");
  md += heading(2, "第一节 背景");
  for (let i = 0; i < 900; i += 1) md += `第 ${i} 行内容，用于撑大文档体量。abcdefghijklmnopqrstuvwxyz 0123456789\n`;
  md += heading(2, "第二节 方法");
  for (let i = 0; i < 900; i += 1) md += `更多内容 ${i}。The quick brown fox jumps over the lazy dog.\n`;
  md += heading(2, "第三节 结论");
  md += "结束。\n";
  return Buffer.from(md, "utf8");
}
const fixtureLongMd = buildLongMd();

/** 长 JSON（>60k 字符，第一层多键）。 */
function buildLongJson() {
  const obj = {
    meta: { title: "数据集", version: 1 },
    users: [],
    products: {},
    stats: { total: 0, avg: 0 }
  };
  for (let i = 0; i < 500; i += 1) {
    obj.users.push({ id: i, name: `用户${i}`, note: "x".repeat(80) });
  }
  for (let i = 0; i < 50; i += 1) {
    obj.products[`p${i}`] = { price: i, name: `产品${i}` };
  }
  return Buffer.from(JSON.stringify(obj), "utf8");
}
const fixtureLongJson = buildLongJson();

/** 中等体量 DOCX（~3 万字符，介于 4k 预算与 8 万阈值之间）——v2b 预算分流夹具。 */
async function buildLongDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>"
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>"
  );
  const paragraphs = [];
  for (let i = 0; i < 1200; i += 1) {
    paragraphs.push(`<w:p><w:r><w:t>段落 ${i}：预算分流测试内容。abcdefghijklmnopqrstuvwxyz</w:t></w:r></w:p>`);
  }
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${paragraphs.join("")}</w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
const fixtureLongDocx = await buildLongDocx();

/** 超大 DOCX（~36 万字符，验证"转换器不截断、全文落盘"）。 */
async function buildHugeDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>"
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>"
  );
  const paragraphs = [];
  for (let i = 0; i < 14000; i += 1) {
    paragraphs.push(`<w:p><w:r><w:t>段落 ${i}：全文不截断验证内容。abcdefghijklmnopqrstuvwxyz</w:t></w:r></w:p>`);
  }
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${paragraphs.join("")}</w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
const fixtureHugeDocx = await buildHugeDocx();

// ---- 假 cordis 上下文（不注入 attachments → 走回退限额）------------------
const routes = [];
const registeredCommands = [];
const sessionsStub = {
  get(sessionId) {
    return sessionId === "test-session" ? { header: { cwd: testCwd } } : undefined;
  }
};
const ctx = {
  effect(callback) {
    callback();
    return () => {};
  },
  webServer: {
    register(route) {
      routes.push(route);
      return () => {};
    }
  },
  commands: {
    register(spec) {
      registeredCommands.push(spec);
      return () => {};
    }
  },
  get(name) {
    return name === "sessions" ? sessionsStub : undefined;
  },
  logger: console
};

check("plugin exports name/inject/apply", plugin.name === "dsh-attachment-formats" && Array.isArray(plugin.inject) && typeof plugin.apply === "function");
plugin.apply(ctx);
check("route registered", routes.some((route) => route.path === "/api/attach-formats/convert" && route.kind === "exact"));
check("/attach command registered", registeredCommands.length === 1 && registeredCommands[0].name === "attach");
const convertHandler = routes.find((route) => route.path === "/api/attach-formats/convert").handler;

// 经典用例固定 builtin 引擎 + 关闭 OCR，保证速度与确定性；python/OCR 用例单独跑。
const previousEngine = process.env.DSH_ATTACH_ENGINE;
const previousOcr = process.env.DSH_ATTACH_OCR;
process.env.DSH_ATTACH_ENGINE = "builtin";
process.env.DSH_ATTACH_OCR = "off";

async function callRoute(files, extra = {}) {
  const handler = convertHandler;
  const body = JSON.stringify({ files, sessionId: "test-session", ...extra });
  const req = new Readable({
    read() {
      this.push(Buffer.from(body));
      this.push(null);
    }
  });
  req.method = "POST";
  req.url = "/api/attach-formats/convert";
  let status = 0;
  let response = "";
  const res = {
    writeHead(code) {
      status = code;
    },
    end(chunk) {
      response = String(chunk);
    }
  };
  await handler(req, res);
  return { status, body: JSON.parse(response) };
}

console.log("\n== PDF 文字优先（小 PDF → text）==");
{
  const { status, body } = await callRoute([
    { name: "报告.pdf", kind: "pdf", data: fixturePdf.toString("base64") }
  ]);
  check("status 200", status === 200, `got ${status}`);
  const result = body.results?.[0];
  check("pdf → text (not images)", result?.kind === "text", `got ${result?.kind}`);
  check("text has page marker", String(result?.text).includes("<!-- p1 -->"));
  check("text has content", String(result?.text).includes("Hello PDF page 1"));
}

console.log("\n== 扫描件 PDF 回退（无文本层 → images）==");
{
  const { body } = await callRoute([
    { name: "扫描.pdf", kind: "pdf", data: fixtureBlankPdf.toString("base64") }
  ]);
  const result = body.results?.[0];
  check("blank pdf → images", result?.kind === "images", `got ${result?.kind}`);
  check("images have scan warning", Array.isArray(result.warnings) && result.warnings.some((w) => w.includes("文本层")), JSON.stringify(result.warnings));
}

console.log("\n== 混合 PDF（文字 + 图片 → 索引卡和页面图）==");
{
  const { body } = await callRoute([
    { name: "图文报告.pdf", kind: "pdf", data: fixtureMixedPdf.toString("base64") }
  ]);
  const result = body.results?.[0];
  check("mixed pdf → index", result?.kind === "index", `got ${result?.kind}`);
  check("mixed pdf 保留文字层", existsSync(join(testCwd, String(result?.docPath)))
    && readFileSync(join(testCwd, String(result?.docPath)), "utf8").includes("Mixed PDF text layer"));
  check("mixed pdf 卡片含页面图入口", String(result?.card).includes("页面图"));
  check("mixed pdf 页面图已生成", existsSync(join(testCwd, ".dsh-attachments", shortHashOf(fixtureMixedPdf), "pages", "p01.png")));
  const cached = await callRoute([
    { name: "图文报告.pdf", kind: "pdf", data: fixtureMixedPdf.toString("base64") }
  ]);
  check("mixed pdf 缓存命中仍保留视觉入口", cached.body.results?.[0]?.kind === "index"
    && String(cached.body.results?.[0]?.card).includes("页面图"));
}

console.log("\n== ZIP 安全提取 ==");
{
  const zip = await buildZip([
    ["README.md", "# 压缩包\r\n中文😀e\u0301"],
    ["src/app.js", "console.log('ok');"],
    ["skill/SKILL.md", "# Zip Skill\n\n读取 references/guide.md 后回答用户。"],
    ["skill/references/guide.md", "技能参考资料：完整读取成功。"],
    ["legacy.txt", Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0d, 0xcf, 0xdf])],
    ["docs/说明.docx", fixtureDocx],
    ["docs/report.pdf", fixturePdf],
    ["assets/logo.bin", Buffer.from([0, 1, 2, 3])]
  ]);
  const { body } = await callRoute([{ name: "项目.zip", kind: "zip", data: zip.toString("base64") }]);
  const result = body.results?.[0];
  check("zip → text", result?.kind === "text", `got ${result?.kind} ${result?.error?.message ?? ""}`);
  check("zip 提取文本并列出二进制", String(result?.text).includes("README.md")
    && String(result?.text).includes("中文😀e\u0301") && String(result?.text).includes("assets/logo.bin"));
  check("zip 深度解析 Office/PDF", String(result?.text).includes("你好 DOCX 冒烟测试")
    && String(result?.text).includes("Hello PDF page 1"));
  check("zip 标出 Skill 入口", String(result?.text).includes("Skill 入口")
    && String(result?.text).includes("skill/SKILL.md"));
  check("zip 解码 GBK 正文并规范 CR", String(result?.text).includes("中文\n线"));
  const zipCache = join(testCwd, ".dsh-attachments", shortHashOf(zip));
  check("zip 完整目录已安全解压", existsSync(join(zipCache, "extracted", "skill", "SKILL.md"))
    && existsSync(join(zipCache, "extracted", "docs", "说明.docx")));
  check("zip 派生文本和 PDF 页面预览已落盘", existsSync(join(zipCache, "converted", "docs", "说明.docx.md"))
    && existsSync(join(zipCache, "converted", "docs", "report.pdf.md"))
    && existsSync(join(zipCache, "previews", "docs", "report.pdf", "p01.png")));
  rmSync(join(zipCache, "extracted", "skill", "SKILL.md"));
  const rebuilt = await callRoute([{ name: "项目.zip", kind: "zip", data: zip.toString("base64") }]);
  check("zip 缓存缺少展开文件时自动重建", rebuilt.body.results?.[0]?.engine === "builtin+deep-archive"
    && existsSync(join(zipCache, "extracted", "skill", "SKILL.md")));
  check("GBK 中文 ZIP 文件名解码", decodeZipFileName(Uint8Array.from([0xb4, 0xf2, 0xd3, 0xcd, 0xca, 0xab])) === "打油诗");

  const traversal = await buildZip([["../outside.txt", "blocked"]]);
  const blocked = await callRoute([{ name: "穿越.zip", kind: "zip", data: traversal.toString("base64") }]);
  check("zip 拒绝路径穿越", blocked.body.results?.[0]?.kind === "error"
    && /路径/.test(blocked.body.results?.[0]?.error?.message ?? ""));

  const bomb = await buildZip([["huge.txt", "A".repeat(2 * 1024 * 1024)]]);
  const rejected = await callRoute([{ name: "高压缩比.zip", kind: "zip", data: bomb.toString("base64") }]);
  check("zip 拒绝异常压缩比", rejected.body.results?.[0]?.kind === "error"
    && /压缩比/.test(rejected.body.results?.[0]?.error?.message ?? ""));

  const empty = await buildZip([]);
  const emptyResult = await callRoute([{ name: "空.zip", kind: "zip", data: empty.toString("base64") }]);
  check("空 ZIP 可识别", emptyResult.body.results?.[0]?.kind === "text"
    && String(emptyResult.body.results?.[0]?.text).includes("共 0 个文件"));
}

console.log("\n== Office 直插（小 docx → text）==");
{
  const { body } = await callRoute([
    { name: "说明.docx", kind: "docx", data: fixtureDocx.toString("base64") }
  ]);
  const result = body.results?.[0];
  check("docx → text", result?.kind === "text" && String(result.text).includes("你好 DOCX 冒烟测试"));
}

console.log("\n== 长 Markdown（text-cache → index 卡 + 落盘）==");
{
  const { body } = await callRoute(
    [{ name: "长文档.md", kind: "text-cache", data: fixtureLongMd.toString("base64") }],
    { cwd: testCwd }
  );
  const result = body.results?.[0];
  check("long md → index", result?.kind === "index", `got ${result?.kind}`);
  check("card 含读取指引", String(result.card).includes("read 工具") && String(result.card).includes("分页读取"));
  check("card 含大纲", String(result.card).includes("第一节 背景") && String(result.card).includes("第二节 方法"));
  check("card 含字符数", String(result.card).includes("字符"));
  check("docPath 指向工作区缓存", String(result.docPath).includes(".dsh-attachments/"));
  const docFile = join(testCwd, String(result.docPath));
  check("doc.md 已落盘", existsSync(docFile));
  const cacheDirs = readdirSync(join(testCwd, ".dsh-attachments"), { withFileTypes: true }).filter((e) => e.isDirectory());
  check("缓存目录存在 manifest", cacheDirs.some((d) => existsSync(join(testCwd, ".dsh-attachments", d.name, "manifest.json"))));
}

console.log("\n== 长 JSON（text-cache → index 卡 + 键树 + 格式化落盘）==");
{
  const { body } = await callRoute(
    [{ name: "数据.json", kind: "text-cache", data: fixtureLongJson.toString("base64") }],
    { cwd: testCwd }
  );
  const result = body.results?.[0];
  check("long json → index", result?.kind === "index", `got ${result?.kind}`);
  check("card 含 JSON 结构", String(result.card).includes("JSON 结构") && String(result.card).includes("users(array(500))"));
  const docFile = join(testCwd, String(result.docPath));
  check("doc.json 已落盘", existsSync(docFile) && result.docPath.endsWith("doc.json"));
  const formatted = readFileSync(docFile, "utf8");
  check("JSON 已格式化", formatted.includes('\n  "meta"'));
}

console.log("\n== 修复验证：JSON 源文本/落盘产物尺寸分离（tier 用产物口径）==");
{
  // 单行压缩 JSON：源文本 ≤8 万，pretty 落盘 >8 万——旧逻辑会按源尺寸
  // 把超限产物误判为可直插。
  const rows = [];
  for (let i = 0; i < 600; i += 1) rows.push(`{"id":${i},"name":"用户${i}","note":"${"x".repeat(80)}"}`);
  const fixtureTierJson = Buffer.from(`{"rows":[${rows.join(",")}]}`, "utf8");
  const srcText = fixtureTierJson.toString("utf8");
  check("源文本 ≤8 万（夹具前提）", srcText.length <= 80_000, `src=${srcText.length}`);
  const first = await callRoute(
    [{ name: "清单.json", kind: "text-cache", data: fixtureTierJson.toString("base64") }],
    { cwd: testCwd }
  );
  const result = first.body.results?.[0];
  const artifact = readFileSync(join(testCwd, String(result?.docPath)), "utf8");
  check("落盘产物 >8 万（pretty）", artifact.length > 80_000, `artifact=${artifact.length}`);
  check("result 计数为产物口径", result?.charCount === artifact.length && result?.lineCount === artifact.split("\n").length, `char=${result?.charCount}/${artifact.length}`);
  check("source 口径单独保留", result?.sourceCharCount === srcText.length && result?.sourceLineCount === 1, `src=${result?.sourceCharCount}/${srcText.length} lines=${result?.sourceLineCount}`);
  const again = await callRoute(
    [{ name: "清单.json", kind: "text-cache", data: fixtureTierJson.toString("base64") }],
    { cwd: testCwd }
  );
  const hitResult = again.body.results?.[0];
  check("缓存命中按产物尺寸分流为 index（不误判直插）", hitResult?.kind === "index", `got ${hitResult?.kind}`);
  check("命中卡片计数为产物口径", hitResult?.charCount === artifact.length, `char=${hitResult?.charCount}/${artifact.length}`);
  check("缓存命中保留 source 口径（cache-transparent shape）", hitResult?.sourceCharCount === srcText.length && hitResult?.sourceLineCount === 1, `src=${hitResult?.sourceCharCount}/${srcText.length} lines=${hitResult?.sourceLineCount}`);
}

console.log("\n== 错误映射 ==");
{
  const { status, body } = await callRoute([
    { name: "evil.bin", kind: "pdf", data: Buffer.from([0x00, 0x01, 0x02, 0x03]).toString("base64") }
  ]);
  check("status 200 (per-file error)", status === 200, `got ${status}`);
  check("kind error", body.results?.[0]?.kind === "error");
  check("unsupported message", /暂不支持/.test(body.results?.[0]?.error?.message ?? ""));
}

console.log("\n== 修复验证：缓存命中降级为 index 时惰性补页面图 ==");
{
  // 50 行 × ~120 字符 ≈ 6000 字符（>4000 预算、<8 万直插），全部落在页框内
  // （pdfjs 只提取页框内的文字，行数过多会被裁掉导致夹具失效）
  const lines = Array.from({ length: 50 }, (_, i) => `line ${String(i).padStart(3, "0")} ${"padded content text ".repeat(6)}`);
  const textPdf = buildTextPdf(lines);
  const id = shortHashOf(textPdf);
  const pagesDir = join(testCwd, ".dsh-attachments", id, "pages");
  const first = await callRoute(
    [{ name: "文本.pdf", kind: "pdf", data: textPdf.toString("base64") }],
    { cwd: testCwd }
  );
  check("默认预算 → 直插 text", first.body.results?.[0]?.kind === "text", `got ${first.body.results?.[0]?.kind}`);
  const before = existsSync(pagesDir) ? readdirSync(pagesDir).length : 0;
  check("直插快路径不渲染页面图", before === 0, `got ${before}`);
  const second = await callRoute(
    [{ name: "文本.pdf", kind: "pdf", data: textPdf.toString("base64") }],
    { cwd: testCwd, directLimitChars: 4000 }
  );
  const result = second.body.results?.[0];
  check("低预算命中 → index", result?.kind === "index", `got ${result?.kind}`);
  check("card 含页面图指引", String(result?.card).includes("页面图"), String(result?.card).slice(0, 160));
  const after = existsSync(pagesDir) ? readdirSync(pagesDir).length : 0;
  check("pages/ 已惰性生成", after > 0, `got ${after}`);
}

console.log("\n== python 引擎（条件用例，venv 可用时）==");
if (await probePythonEngine()) {
  process.env.DSH_ATTACH_ENGINE = "python";
  try {
    // 尾部追加字节改变内容哈希，避免命中前面 builtin 引擎留下的转换缓存
    const uncachedPdf = Buffer.concat([fixturePdf, Buffer.from("py-engine")]);
    const { body } = await callRoute([
      { name: "报告.pdf", kind: "pdf", data: uncachedPdf.toString("base64") }
    ]);
    const result = body.results?.[0];
    check("python pdf → text", result?.kind === "text", `got ${result?.kind}`);
    check("engine is pymupdf4llm", result?.engine === "pymupdf4llm", `got ${result?.engine}`);
  } finally {
    process.env.DSH_ATTACH_ENGINE = "builtin";
  }
} else {
  console.log("  skip python 引擎（venv 不可用）");
}

console.log("\n== v2b 上下文预算分流（directLimitChars）==");
{
  const { body: noLimit } = await callRoute(
    [{ name: "预算.docx", kind: "docx", data: fixtureLongDocx.toString("base64") }],
    { cwd: testCwd }
  );
  check("无预算限制 → 直插 text", noLimit.results?.[0]?.kind === "text", `got ${noLimit.results?.[0]?.kind}`);
  const { body: limited } = await callRoute(
    [{ name: "预算.docx", kind: "docx", data: fixtureLongDocx.toString("base64") }],
    { cwd: testCwd, directLimitChars: 4000 }
  );
  const result = limited.results?.[0];
  check("预算 4000 → 转存 index", result?.kind === "index", `got ${result?.kind}`);
  check("tierReason=budget", result?.tierReason === "budget", `got ${result?.tierReason}`);
}

console.log("\n== v2b /attach 命令 ==");
{
  const sends = [];
  const agent = {
    session: { header: { cwd: testCwd } },
    send(message, target, wakeup) {
      sends.push({ message, target, wakeup });
    }
  };
  const invocation = (rawInput) => ({ rawInput, agent });

  const listed = await plugin.executeAttachCommand(ctx, invocation("list"));
  check("/attach list 成功", listed.kind === "success" && listed.text.includes("长文档.md"), listed.text.slice(0, 120));
  const id = shortHashOf(fixtureLongMd);
  const expanded = await plugin.executeAttachCommand(ctx, invocation(`full ${id}`));
  check("/attach full 成功", expanded.kind === "success");
  check("发送 next-step 消息", sends.length === 1 && sends[0].target === "next-step" && sends[0].wakeup === false);
  const text = sends[0]?.message?.content?.[0]?.text ?? "";
  check("消息含全文与出处", text.includes("[附件全文: 长文档.md") && text.includes("第一节 背景"), text.slice(0, 140));
  check("消息为 user 角色且带 id", sends[0]?.message?.role === "user" && typeof sends[0]?.message?.id === "string");
  const missing = await plugin.executeAttachCommand(ctx, invocation("full 不存在的东西"));
  check("/attach full 未命中 → error", missing.kind === "error");
  const badVerb = await plugin.executeAttachCommand(ctx, invocation("explode"));
  check("未知子命令 → error", badVerb.kind === "error");
}

console.log("\n== 修复验证：转换器不截断（全文落盘）==");
{
  const { body } = await callRoute(
    [{ name: "巨无霸.docx", kind: "docx", data: fixtureHugeDocx.toString("base64") }],
    { cwd: testCwd }
  );
  const result = body.results?.[0];
  check("36 万字符 docx → index（未被截到 30 万以下）", result?.kind === "index" && result.charCount > 300_000, `kind=${result?.kind} chars=${result?.charCount}`);
  const docFile = join(testCwd, String(result?.docPath ?? ""));
  check("落盘 doc.md 为全文", existsSync(docFile) && readFileSync(docFile, "utf8").length > 300_000);
}

console.log("\n== 修复验证：转换缓存（同文件复用，跳过引擎）==");
{
  const first = await callRoute(
    [{ name: "长文档.md", kind: "text-cache", data: fixtureLongMd.toString("base64") }],
    { cwd: testCwd }
  );
  const second = await callRoute(
    [{ name: "长文档.md", kind: "text-cache", data: fixtureLongMd.toString("base64") }],
    { cwd: testCwd }
  );
  const a = first.body.results?.[0];
  const b = second.body.results?.[0];
  check("两次返回同一 docPath", a?.kind === "index" && b?.docPath === a?.docPath);
  check("第二次命中缓存（engine 标记 (cache)）", typeof b?.engine === "string" && b.engine.includes("(cache)"), `engine=${b?.engine}`);
}

console.log("\n== 修复验证：转换策略指纹（换引擎不吃旧缓存）==");
{
  // fixturePdf 已由 builtin 引擎转换并缓存；切成 python 引擎、相同字节
  // 必须因 converterFingerprint 变化而重跑当前引擎，而不是吃到旧结果。
  if (await probePythonEngine()) {
    process.env.DSH_ATTACH_ENGINE = "python";
    try {
      const { body } = await callRoute(
        [{ name: "报告.pdf", kind: "pdf", data: fixturePdf.toString("base64") }],
        { cwd: testCwd }
      );
      const result = body.results?.[0];
      check("同字节换引擎 → 不命中旧缓存", result?.kind === "text" && result?.engine === "pymupdf4llm", `engine=${result?.engine}`);
    } finally {
      process.env.DSH_ATTACH_ENGINE = "builtin";
    }
  } else {
    console.log("  skip 指纹门控（venv 不可用）");
  }
}

console.log("\n== 修复验证：cwd 权威源（会话未驻留拒绝）==");
{
  const { status, body } = await callRoute(
    [{ name: "报告.pdf", kind: "pdf", data: fixturePdf.toString("base64") }],
    { sessionId: "ghost-session" }
  );
  check("未知 sessionId → 400 session-not-resident", status === 400 && body.error?.code === "session-not-resident", `status=${status} code=${body?.error?.code}`);
}

console.log("\n== 非 POST ==");
{
  const handler = convertHandler;
  const req = new Readable({ read() {} });
  req.method = "GET";
  req.url = "/api/attach-formats/convert";
  let status = 0;
  const res = { writeHead(code) { status = code; }, end() {} };
  await handler(req, res);
  check("status 405", status === 405, `got ${status}`);
}

process.env.DSH_ATTACH_ENGINE = previousEngine ?? undefined;
process.env.DSH_ATTACH_OCR = previousOcr ?? undefined;
if (process.env.DSH_ATTACH_ENGINE === undefined) delete process.env.DSH_ATTACH_ENGINE;
if (process.env.DSH_ATTACH_OCR === undefined) delete process.env.DSH_ATTACH_OCR;
rmSync(testCwd, { recursive: true, force: true });
console.log(`\n${failures === 0 ? "路由测试全部通过 ✅" : `${failures} 项失败 ❌`}`);
if (failures > 0) process.exitCode = 1;
