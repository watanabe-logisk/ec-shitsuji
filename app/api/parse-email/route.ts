import { NextRequest, NextResponse } from 'next/server'

/**
 * 「ラベル：値」形式の行を拾う。同じラベルが複数回出た場合は最初の1件を採用。
 */
function labeledFields(text: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[【\[]/, '').replace(/[】\]]$/, '')
    const m = line.match(/^\s*[◆■●○・*＊\-]*\s*([^：:]{1,12})\s*[：:]\s*(.+)$/)
    if (!m) continue
    const key = m[1].trim()
    const value = m[2].trim()
    if (!key || !value) continue
    if (!(key in map)) map[key] = value
  }
  return map
}

function pick(fields: Record<string, string>, pattern: RegExp): string | null {
  for (const key of Object.keys(fields)) {
    if (pattern.test(key)) return fields[key]
  }
  return null
}

/** 行頭の「住所：」のようなラベルを除去 */
function stripLabel(value: string): string {
  return value.replace(/^[^：:]{1,8}[：:]\s*/, '').trim()
}

function stripPostal(value: string): string {
  return value.replace(/〒?\s*\d{3}\s*-?\s*\d{4}/, '').trim()
}

function extractPostalCode(text: string): string | null {
  const withMark = text.match(/〒\s*(\d{3})\s*-?\s*(\d{4})/)
  if (withMark) return `${withMark[1]}-${withMark[2]}`
  // 〒なしの場合、電話番号の一部（03-1111-2222）を拾わないよう前後を制限
  const bare = text.match(/(?<![\d\-－ー])(\d{3})-(\d{4})(?![\d\-－ー])/)
  return bare ? `${bare[1]}-${bare[2]}` : null
}

function extractPhone(fields: Record<string, string>, text: string): string | null {
  const labeled = pick(fields, /^(TEL|Tel|tel|TEL番号|電話|電話番号|℡|Phone|phone)$/)
  const target = labeled ?? text
  const m = target.match(/0\d{1,3}[-－ー(]\s*\d{2,4}\s*[-－ー)]\s*\d{4}/)
  if (m) return m[0].replace(/[－ー]/g, '-').replace(/[()\s]/g, '-').replace(/-+/g, '-')
  return labeled ? labeled.trim() : null
}

function extractAddress(fields: Record<string, string>, text: string): string | null {
  const labeled = pick(fields, /(住所|所在地|お届け先住所|納品先住所)/)
  if (labeled) return stripPostal(labeled)

  for (const line of text.split(/\r?\n/)) {
    if (/[都道府県]/.test(line)) {
      return stripPostal(stripLabel(line.trim()))
    }
  }
  return null
}

function extractCompanyName(fields: Record<string, string>, text: string): string | null {
  // ラベル優先（店舗名・会社名など）
  const named = pick(fields, /(店舗名|店名|会社名|社名|屋号|施設名|法人名|貴社名|宛名)/)
  if (named) return cleanCompany(named)

  // 「納品先：〇〇」形式。値が住所そのものの場合は会社名とみなさない
  const dest = pick(fields, /^(納品先|届け先|配送先|送り先|お届け先)$/)
  if (dest && !/[都道府県]/.test(dest) && !/〒/.test(dest)) return cleanCompany(dest)

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (/株式会社|有限会社|合同会社|一般社団|医療法人|工業|商事/.test(t) && t.length < 80) {
      return cleanCompany(t)
    }
  }
  return null
}

function cleanCompany(value: string): string {
  return value
    .replace(/[（(]担当[：:].+?[）)]/g, '')
    .replace(/\s*御中$/, '')
    .trim()
}

function extractContactName(fields: Record<string, string>, text: string): string | null {
  const labeled = pick(fields, /(担当|ご担当|担当者|担当者名|窓口)/)
  if (labeled) return cleanContact(labeled)

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const titlePattern = /取締役|部長|課長|社長|代表|所長|主任|係長|専務|常務|理事|店長|マネージャー/

  // 「（担当：〇〇）」パターン
  for (const line of lines) {
    const m = line.match(/[（(]担当[：:]\s*(.+?)[）)]/)
    if (m) return cleanContact(m[1])
  }

  for (let i = 0; i < lines.length; i++) {
    // 役職行の次の行を担当者名とみなす
    if (titlePattern.test(lines[i]) && lines[i + 1]) {
      const next = lines[i + 1].split(/\s+[A-Za-z]/)[0].trim()
      if (next && next.length < 20 && /[一-龥぀-ゟ]/.test(next)) {
        return cleanContact(next)
      }
    }
    // 「様」で終わる行
    if (/様$/.test(lines[i]) && lines[i].length < 20) return cleanContact(lines[i])
  }
  return null
}

function cleanContact(value: string): string {
  return value.replace(/\s*(様|さん|殿)$/, '').trim()
}

function extractQuantity(text: string): number | null {
  const m = text.match(/(\d+)\s*(個|ケース|本|箱|cs|CS|case)/i)
  return m ? parseInt(m[1]) : null
}

function extractShippingDate(text: string): string | null {
  const year = new Date().getFullYear()
  // 電話番号・郵便番号・住所の行は日付として誤検出しやすいので除外
  const lines = text
    .split(/\r?\n/)
    .filter(l => !/〒|TEL|Tel|tel|℡|電話|住所|所在地|FAX|Fax/.test(l))
  const target = lines.join('\n')

  let m = target.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = target.match(/(\d{1,2})[\/月](\d{1,2})/)
  if (m) return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

export async function POST(request: NextRequest) {
  const { text } = await request.json()
  if (!text?.trim()) {
    return NextResponse.json({ error: 'テキストが空です' }, { status: 400 })
  }

  const fields = labeledFields(text)

  return NextResponse.json({
    company_name: extractCompanyName(fields, text),
    contact_name: extractContactName(fields, text),
    postal_code: extractPostalCode(text),
    address: extractAddress(fields, text),
    phone: extractPhone(fields, text),
    quantity: extractQuantity(text),
    shipping_date: extractShippingDate(text),
  })
}
