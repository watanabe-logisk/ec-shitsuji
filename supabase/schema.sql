-- 得意先マスタ
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 受注テーブル
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  shipping_date DATE,
  shipping_name TEXT DEFAULT '',
  shipping_contact TEXT DEFAULT '',
  shipping_postal_code TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  shipping_phone TEXT DEFAULT '',
  time_slot TEXT DEFAULT '指定無し',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'shipped')),
  -- 出荷アラートの延長日数。基準の2営業日前に加算される
  alert_extra_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS有効。ポリシーは作らない（= anon / authenticated からは一切見えない）。
-- アプリはサーバー側 API ルートから service_role キーで接続し、RLS をバイパスする。
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
