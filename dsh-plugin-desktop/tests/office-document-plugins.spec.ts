import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply as applyOfficeTools } from 'dsh-office-tools'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface OfficeTool {
  name: string
  execute(args: Record<string, unknown>, exec: unknown): Promise<unknown>
}

const workspace = mkdtempSync(join(tmpdir(), 'ruijie-office-plugins-'))
const tools = new Map<string, OfficeTool>()
const signal = new AbortController().signal
const exec = { agent: { session: { header: { cwd: workspace } } }, signal }

beforeAll(() => {
  applyOfficeTools({
    tools: {
      register(tool: OfficeTool) {
        tools.set(tool.name, tool)
        return () => { tools.delete(tool.name) }
      },
    },
    effect(effect: () => unknown) { return effect() },
  } as never)
})

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true })
})

function tool(name: string): OfficeTool {
  const value = tools.get(name)
  if (value === undefined) throw new Error(`missing Office tool ${name}`)
  return value
}

describe('employee Office and attachment plugins', () => {
  it('registers the seven audited Office tools', () => {
    expect([...tools.keys()]).toEqual([
      'word_create',
      'word_read',
      'excel_create',
      'excel_read',
      'excel_update',
      'ppt_create',
      'ppt_read',
    ])
  })

  it('creates, reads, and parses modern Office files without Office or Python', async () => {
    await tool('word_create').execute({
      path: 'sample.docx',
      title: '锐捷文档测试',
      paragraphs: ['Q7 多模态与办公文档解析'],
    }, exec)
    await tool('excel_create').execute({
      path: 'sample.xlsx',
      sheets: [{ name: '额度', rows: [['项目', '数值'], ['可用', 100]] }],
    }, exec)
    await tool('excel_update').execute({
      path: 'sample.xlsx',
      cell_updates: [{ sheet: '额度', cell: 'B2', value: 88 }],
    }, exec)
    await tool('ppt_create').execute({
      path: 'sample.pptx',
      title: '锐捷 Harness',
      slides: [{ title: '能力', bullets: ['图片理解', '文档解析'] }],
    }, exec)

    const word = await tool('word_read').execute({ path: 'sample.docx' }, exec) as { text: string }
    const excel = await tool('excel_read').execute({ path: 'sample.xlsx' }, exec) as {
      sheets: Array<{ rows: unknown[][] }>
    }
    const ppt = await tool('ppt_read').execute({ path: 'sample.pptx' }, exec) as {
      slides: Array<{ paragraphs: string[] }>
    }
    expect(word.text).toContain('Q7 多模态与办公文档解析')
    expect(excel.sheets[0]?.rows).toContainEqual(['可用', '88'])
    expect(ppt.slides.flatMap(slide => slide.paragraphs).join('\n')).toContain('图片理解')

    const attachmentRoot = new URL('../node_modules/dsh-attachment-formats/', import.meta.url)
    const { docxToText } = await import(new URL('lib/convert/docx.js', attachmentRoot).href)
    const { xlsxToText } = await import(new URL('lib/convert/xlsx.js', attachmentRoot).href)
    const { pptxToText } = await import(new URL('lib/convert/pptx.js', attachmentRoot).href)
    expect(await docxToText(readFileSync(join(workspace, 'sample.docx')))).toContain('Q7 多模态')
    expect(await xlsxToText(readFileSync(join(workspace, 'sample.xlsx')))).toContain('可用\t88')
    expect(await pptxToText(readFileSync(join(workspace, 'sample.pptx')))).toContain('图片理解')
  })

  it('ships Chinese and English OCR data for offline scanned-PDF parsing', async () => {
    const { TESSDATA_DIR, ensureTraineddata } = await import(new URL(
      '../node_modules/dsh-attachment-formats/lib/convert/ocr.js',
      import.meta.url,
    ).href)
    expect(statSync(join(TESSDATA_DIR, 'eng.traineddata.gz')).size).toBeGreaterThan(100_000)
    expect(statSync(join(TESSDATA_DIR, 'chi_sim.traineddata.gz')).size).toBeGreaterThan(100_000)
    expect(await ensureTraineddata('eng')).toBe(true)
    expect(await ensureTraineddata('chi_sim')).toBe(true)
  })
})
