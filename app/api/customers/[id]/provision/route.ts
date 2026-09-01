import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { applyProvisionPlan, buildProvisionPlan } from '@/lib/provision'
import {
  ORDER_APP_URL,
  buildGuideText,
  createCustomerLogin,
  getCustomerLogin,
} from '@/lib/customerAuth'

/**
 * 得意先のWeb発注を開通する。
 *
 * GET  … 何が作られるかを返す（書き込まない）
 * POST … 発注可能商品・納品先・発注設定を作り、ログインを発行する
 *
 * ログインだけ発行しても、商品と納品先が無ければ顧客の画面には
 * 「ご注文いただける商品が設定されていません」としか出ない。
 * だから開通は必ずこの3点セットで行う。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function customerName(id: string): Promise<string | null> {
  const { data } = await supabase.from('customers').select('name').eq('id', id).maybeSingle()
  return data?.name?.trim() ?? null
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const name = await customerName(id)
    if (!name) return NextResponse.json({ error: '得意先が見つかりません' }, { status: 404 })

    const [plan, login] = await Promise.all([buildProvisionPlan(id), getCustomerLogin(id)])
    return NextResponse.json({ plan, hasLogin: !!login })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const name = await customerName(id)
    if (!name) return NextResponse.json({ error: '得意先が見つかりません' }, { status: 404 })

    const body = await request.json().catch(() => ({}))

    // 画面で見せた内容と実際に作る内容がずれないよう、ここで組み直す
    const plan = await buildProvisionPlan(id)
    if (!plan.canProvision) {
      return NextResponse.json({ error: plan.reason ?? '開通できません' }, { status: 400 })
    }

    const applied = await applyProvisionPlan(id, plan)

    // ログインは既にあれば作り直さない。
    // ここで再発行すると、既に顧客へ渡したパスワードが無効になってしまう
    let login = await getCustomerLogin(id)
    let loginCreated = false
    if (!login) {
      const loginId = typeof body.loginId === 'string' ? body.loginId : ''
      if (!loginId.trim()) {
        return NextResponse.json(
          { error: 'ログインIDを入力してください', applied },
          { status: 400 },
        )
      }
      login = await createCustomerLogin(id, name, loginId)
      loginCreated = true
    }

    return NextResponse.json({
      applied,
      loginCreated,
      url: ORDER_APP_URL,
      login,
      guide: buildGuideText(login, name),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
