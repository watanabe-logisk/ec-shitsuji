import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateCSV } from '@/lib/csv'
import { Order } from '@/types'

export async function POST(request: NextRequest) {
  const { ids } = await request.json()

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const buffer = generateCSV(data as Order[])
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'text/csv; charset=Shift_JIS',
      'Content-Disposition': `attachment; filename="orders_${today}.csv"`,
    },
  })
}
