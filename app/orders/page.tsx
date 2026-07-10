import Navbar from '@/components/Navbar'
import OrderList from '@/components/OrderList'

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <p className="text-xs tracking-[0.25em] text-stone uppercase mb-6">受注一覧</p>
        <OrderList />
      </main>
    </div>
  )
}
