import { Product } from '@/types'

export const PRODUCTS: Product[] = [
  { id: '1', name: 'NJB 500ml 24本(1ケース)', csvCode: '10000001' },
  { id: '2', name: 'NJB 350ml 24本(1ケース)', csvCode: '30000001' },
  { id: '3', name: 'NJB 280ml 40本(1ケース)', csvCode: '10000010' },
  { id: '4', name: 'FUJI SUN SUI 500ml 24本', csvCode: 'fujisansui24' },
  { id: '5', name: 'HEBELHOUS ASAHI KASEI 280ml 40本(1ケース)', csvCode: 'HEBEL280' },
  { id: '6', name: 'zouk tokyo 280ml 40本(1ケース)', csvCode: 'zouk280' },
]

export const TIME_SLOTS = [
  '指定無し',
  '午前中',
  '12:00-14:00',
  '14:00-16:00',
  '16:00-18:00',
  '18:00-20:00',
  '19:00-21:00',
]
