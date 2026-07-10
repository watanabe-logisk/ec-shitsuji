import { createClient } from '@supabase/supabase-js'

// このモジュールはサーバー側（API ルート）専用。
// service_role キーは RLS をバイパスするため、クライアントに渡してはいけない。
if (typeof window !== 'undefined') {
  throw new Error('lib/supabase.ts はサーバー側でのみ import してください')
}

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL が未設定です')
}
if (!serviceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY が未設定です。' +
      'Supabase ダッシュボード > Project Settings > API > service_role key を .env.local に設定してください。'
  )
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
