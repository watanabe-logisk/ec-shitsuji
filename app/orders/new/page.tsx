import Navbar from '@/components/Navbar'
import OrderForm from '@/components/OrderForm'

export default function NewOrderPage() {
  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-xs tracking-[0.25em] text-stone uppercase mb-6">受注登録</p>
        <OrderForm />
      </main>
    </div>
  )
}
