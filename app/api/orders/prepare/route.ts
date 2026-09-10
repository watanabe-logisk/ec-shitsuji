import { NextRequest, NextResponse } from 'next/server'
import { advanceToPreparing } from '@/lib/prepare'

/**
 * 選んだ受注を「準備中」へ進め、顧客へ出荷準備のメールを送る。
 *
 * CSV出力でも同じことが起きるが、CSVを出さずに準備へ入る場合のための入口。
 * 処理そのものは lib/prepare.ts に集めてあり、どちらの経路でも結果は同じ。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((v: unknown) => typeof v === 'string') : []

  if (ids.length === 0) {
    return NextResponse.json({ error: '受注が選ばれていません。' }, { status: 400 })
  }

  const result = await advanceToPreparing(ids)
  if (result.error) {
    console.error('[prepare] 準備中への更新に失敗しました', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
