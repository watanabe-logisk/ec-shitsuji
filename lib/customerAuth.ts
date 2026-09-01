import crypto from 'crypto'
import { supabase } from '@/lib/supabase'

/**
 * 顧客向けWeb発注アプリのログインアカウントを管理する。
 *
 * 認証そのものは Supabase Auth が持っており、パスワードはハッシュで保存される。
 * 発行後は誰も読み出せないため、顧客へ案内する用の控えを
 * customer_login_secrets テーブルに別途保持する。
 * この表は RLS ポリシーを作っていないので、顧客側からは一切見えない。
 *
 * このモジュールはサーバー専用。lib/supabase.ts と同じく service_role を使う。
 */

if (typeof window !== 'undefined') {
  throw new Error('lib/customerAuth.ts はサーバー側でのみ import してください')
}

/** ログインIDのドメイン。実在しないドメインなのでメールは届かない */
export const LOGIN_DOMAIN = 'aqua-jacket.order'

/** 顧客が実際に開くURL。案内文に載せる */
export const ORDER_APP_URL =
  process.env.ORDER_APP_URL ?? 'https://aquajacket-order.vercel.app'

export type CustomerLogin = {
  userId: string
  email: string
  displayName: string
  isActive: boolean
  /** 控えが残っていない場合は null（再発行すれば入る） */
  password: string | null
  issuedAt: string | null
}

/** 紛らわしい文字(0/O/1/l/I)を除いた12桁。顧客が手で入力するため */
export function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.randomBytes(12))
    .map(b => alphabet[b % alphabet.length])
    .join('')
}

/** 'nanso' でも 'nanso@aqua-jacket.order' でも受け付けて正規化する */
export function normalizeLoginId(input: string): string {
  const s = (input ?? '').trim().toLowerCase()
  if (!s) return ''
  return s.includes('@') ? s : `${s}@${LOGIN_DOMAIN}`
}

/** ログインIDとして使える形か。顧客が手で入力するので記号は絞る */
export function isValidLoginId(email: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,40}@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)
}

// --- Supabase Auth Admin API ------------------------------------------------
// supabase-js の admin メソッドは使わず REST を直接叩く。
// 既存の lib/supabase.ts のクライアントは auth を無効化しているため。

function authHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function authApi(path: string, init?: RequestInit) {
  const res = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...init,
    headers: authHeaders(),
    cache: 'no-store',
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(json?.msg ?? json?.error_description ?? json?.message ?? `HTTP ${res.status}`)
  }
  return json
}

type AuthUser = { id: string; email: string }

async function listAuthUsers(): Promise<AuthUser[]> {
  const json = await authApi('/auth/v1/admin/users?per_page=200')
  return (json?.users ?? []) as AuthUser[]
}

/**
 * 得意先に紐づくログインアカウントを取得する。
 * まだ発行されていなければ null。
 */
export async function getCustomerLogin(customerId: string): Promise<CustomerLogin | null> {
  const { data: link } = await supabase
    .from('customer_users')
    .select('user_id, display_name, is_active')
    .eq('customer_id', customerId)
    .maybeSingle()

  if (!link) return null

  const users = await listAuthUsers()
  const user = users.find(u => u.id === link.user_id)

  const { data: secret } = await supabase
    .from('customer_login_secrets')
    .select('password, issued_at')
    .eq('user_id', link.user_id)
    .maybeSingle()

  return {
    userId: link.user_id,
    email: user?.email ?? '',
    displayName: link.display_name ?? '',
    isActive: link.is_active,
    password: secret?.password ?? null,
    issuedAt: secret?.issued_at ?? null,
  }
}

/** 控えを書き換える。Auth 側の更新と必ずセットで呼ぶこと */
async function saveSecret(userId: string, password: string) {
  const { error } = await supabase
    .from('customer_login_secrets')
    .upsert({ user_id: userId, password, issued_at: new Date().toISOString() })
  if (error) throw new Error(`控えの保存に失敗しました: ${error.message}`)
}

/** 既存アカウントのパスワードを再発行する */
export async function reissuePassword(userId: string): Promise<string> {
  const password = generatePassword()
  await authApi(`/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  })
  await saveSecret(userId, password)
  return password
}

/**
 * 得意先にログインアカウントを新規発行する。
 *
 * 既にアカウントがある場合は作らない。パスワードを変えたいだけなら
 * reissuePassword を使う。
 */
export async function createCustomerLogin(
  customerId: string,
  customerName: string,
  loginId: string,
): Promise<CustomerLogin> {
  const email = normalizeLoginId(loginId)
  if (!isValidLoginId(email)) {
    throw new Error('ログインIDの形式が正しくありません。英小文字・数字・ . _ - が使えます')
  }

  const existing = await getCustomerLogin(customerId)
  if (existing) throw new Error('この得意先には既にログインアカウントがあります')

  const users = await listAuthUsers()
  if (users.some(u => u.email?.toLowerCase() === email)) {
    throw new Error('このログインIDは既に使われています')
  }

  const password = generatePassword()
  const user: AuthUser = await authApi('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,   // 実在しないドメインなので確認メールは送れない
    }),
  })

  const { error } = await supabase.from('customer_users').insert({
    user_id: user.id,
    customer_id: customerId,
    display_name: customerName,
    is_active: true,
  })
  if (error) {
    // 紐付けに失敗したら Auth 側も消す。
    // 残すと「ログインできるがどの会社か分からない」宙ぶらりんの利用者ができる
    await authApi(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' }).catch(() => {})
    throw new Error(`得意先との紐付けに失敗しました: ${error.message}`)
  }

  await saveSecret(user.id, password)

  return {
    userId: user.id,
    email,
    displayName: customerName,
    isActive: true,
    password,
    issuedAt: new Date().toISOString(),
  }
}

/** 顧客へそのまま送れる案内文を組み立てる */
export function buildGuideText(login: CustomerLogin, customerName: string): string {
  return [
    `${customerName} 御中`,
    '',
    'AQUA JACKET Web発注システムのご案内です。',
    '下記より発注いただけます。',
    '',
    `URL       : ${ORDER_APP_URL}`,
    `ログインID : ${login.email}`,
    `パスワード  : ${login.password ?? '（再発行してください）'}`,
    '',
    'ご不明な点がございましたら AQUA JACKET までご連絡ください。',
  ].join('\n')
}
