import { NextRequest, NextResponse } from 'next/server'

function extractPostalCode(text: string): string | null {
  const m = text.match(/〒?\s*(\d{3})-?(\d{4})/)
  return m ? `${m[1]}-${m[2]}` : null
}

function extractPhone(text: string): string | null {
  const m = text.match(/0\d{1,3}[-－ー]\d{2,4}[-－ー]\d{4}/)
  return m ? m[0] : null
}

function extractAddress(text: string): string | null {
  for (const line of text.split(/\n/)) {
    if (/[都道府県]/.test(line)) {
      // 郵便番号部分を除去して住所だけ返す
      return line.replace(/〒?\s*\d{3}-?\d{4}/, '').trim()
    }
  }
  return null
}

function extractCompanyName(text: string): string | null {
  for (const line of text.split(/\n/)) {
    const t = line.trim()
    if (/株式会社|有限会社|合同会社|一般社団|医療法人|工業|商事/.test(t) && t.length < 80) {
      // （担当：〇〇）部分を除去
      return t.replace(/[（(]担当[：:].+?[）)]/g, '').trim()
    }
  }
  return null
}

function extractContactName(text: string): string | null {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
  const titlePattern = /取締役|部長|課長|社長|代表|所長|主任|係長|専務|常務|理事|店長|マネージャー|担当/

  // 「（担当：〇〇）」パターンを優先
  for (const line of lines) {
    const m = line.match(/[（(]担当[：:]\s*(.+?)[）)]/)
    if (m) return m[1].trim()
  }

  for (let i = 0; i < lines.length; i++) {
    // 役職行の次の行を担当者名とみなす
    if (titlePattern.test(lines[i]) && lines[i + 1]) {
      const next = lines[i + 1].split(/\s+[A-Za-z]/)[0].trim()
      if (next && next.length < 20 && /[一-龥぀-ゟ]/.test(next)) {
        return next
      }
    }
    // 「様」で終わる行
    if (/様$/.test(lines[i]) && lines[i].length < 20) return lines[i]
  }
  return null
}

function extractQuantity(text: string): number | null {
  const m = text.match(/(\d+)\s*(個|ケース|本|箱|cs|CS|case)/i)
  return m ? parseInt(m[1]) : null
}

function extractShippingDate(text: string): string | null {
  const year = new Date().getFullYear()
  let m = text.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = text.match(/(\d{1,2})[\/月](\d{1,2})/)
  if (m) return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

export async function POST(request: NextRequest) {
  const { text } = await request.json()
  if (!text?.trim()) {
    return NextResponse.json({ error: 'テキストが空です' }, { status: 400 })
  }

  return NextResponse.json({
    company_name: extractCompanyName(text),
    contact_name: extractContactName(text),
    postal_code: extractPostalCode(text),
    address: extractAddress(text),
    phone: extractPhone(text),
    quantity: extractQuantity(text),
    shipping_date: extractShippingDate(text),
  })
}
