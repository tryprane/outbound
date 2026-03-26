import Papa from 'papaparse'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
  preview: Record<string, string>[] // first 5 rows
}

export function parseCSVText(text: string): ParsedCSV {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })

  const headers = result.meta.fields || []
  const rows = result.data as Record<string, string>[]
  const preview = rows.slice(0, 5)

  return { headers, rows, preview }
}

export function parseCSVBuffer(buffer: Buffer): ParsedCSV {
  return parseCSVText(buffer.toString('utf-8'))
}
