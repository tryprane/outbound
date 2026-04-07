import { Sidebar } from '@/components/shared/Sidebar'
import { Topbar } from '@/components/shared/Topbar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen px-6 py-6">
      <div className="mx-auto flex max-w-[1600px] gap-6">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Topbar />
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  )
}
