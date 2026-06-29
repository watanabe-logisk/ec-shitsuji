import Navbar from '@/components/Navbar'
import ButlerGreeting from '@/components/ButlerGreeting'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <ButlerGreeting />
      </main>
    </div>
  )
}
