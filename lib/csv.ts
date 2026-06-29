import { Order } from '@/types'
import iconv from 'iconv-lite'

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return dateStr.replace(/-/g, '')
}

function q(val: string | number | null | undefined): string {
  const s = String(val ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

function normalizeCompanyName(name: string): string {
  // 「株式会社 ナニナニ」→「株式会社ナニナニ」スペースを除去
  return name.replace(/(株式会社|有限会社|合同会社|一般社団法人|医療法人)\s+/, '$1')
             .replace(/\s+(株式会社|有限会社|合同会社|一般社団法人|医療法人)/, '$1')
}

export function generateCSV(orders: Order[]): Buffer {
  const headers = [
    '*注文番号', '*注文日', '注文時間', '*商品名', '*商品番号', '*個数', '単価',
    '注文者氏名', '注文者氏名', 'メールアドレス',
    '注文者郵便番号1', '注文者郵便番号2', '注文者住所2', '注文者住所2', '注文者住所3',
    '注文者電話番号1', '注文者電話番号2', '注文者電話番号3',
    '*送付先氏名1', '送付先氏名2', '*送付先郵便番号1', '送付先郵便番号2',
    '*送付先住所1', '送付先住所2', '送付先住所3',
    '*送付先電話番号１', '送付先電話番号2', '送付先電話番号3',
    '決済方法', '配送日指定', '＊配送方法', '時間帯指定',
    '品代合計（税込）', '送料（税込）', '代引き手数料（税込）', '＊請求金額（税込）',
    '調整額', '割引額（ポイント利用額）', 'ポイント残高', '合計金額（税込）',
    '備考', '送り状備考', '荷扱い1', 'メール通知', '入力機種',
    '通知メッセージ', '止め置き', '営業所コード', '熨斗フラグ', 'ギフトフラグ', '倉庫備考',
  ]

  const rows = orders.map(order => {
    const companyName = normalizeCompanyName(order.shipping_name)
    const contactName = order.shipping_contact ? ` ${order.shipping_contact}` : ''
    return [
    order.order_number,
    formatDate(order.order_date),
    '',
    order.product_name,
    order.product_code,
    order.quantity,
    '',
    companyName,
    contactName,
    '',
    order.shipping_postal_code,
    '',
    order.shipping_address,
    '',
    '',
    order.shipping_phone,
    '',
    '',
    companyName,
    contactName,
    order.shipping_postal_code,
    '',
    order.shipping_address,
    '',
    '',
    order.shipping_phone,
    '',
    '',
    '',
    formatDate(order.shipping_date),
    '1',
    order.time_slot === '指定無し' ? '' : order.time_slot,
    '',
    '',
    '',
    '0',
    '',
    '',
    '',
    '',
    order.notes || '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]})

  const csvText = [headers, ...rows]
    .map(row => row.map(cell => q(cell)).join(','))
    .join('\r\n')

  return iconv.encode(csvText, 'Shift_JIS')
}
