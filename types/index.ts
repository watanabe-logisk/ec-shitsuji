export type Customer = {
  id: string
  name: string
  contact_name: string
  postal_code: string
  address: string
  phone: string
  email?: string
}

export type Product = {
  id: string
  name: string
  csvCode: string
}

export type Order = {
  id: string
  order_number: string
  order_date: string
  customer_id: string
  customer_name: string
  product_name: string
  product_code: string
  quantity: number
  shipping_date: string
  shipping_name: string
  shipping_contact: string
  shipping_postal_code: string
  shipping_address: string
  shipping_phone: string
  time_slot: string
  notes: string
  status: 'pending' | 'shipped'
  created_at: string
}

export type ParsedEmail = {
  company_name: string | null
  contact_name: string | null
  postal_code: string | null
  address: string | null
  phone: string | null
  quantity: number | null
  shipping_date: string | null
}
