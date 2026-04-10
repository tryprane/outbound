import { Sidebar } from '@/components/shared/Sidebar'
import { Topbar } from '@/components/shared/Topbar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 xl:px-6 xl:py-6">
      <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-3 sm:gap-4 xl:flex-row xl:gap-6">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Topbar />
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  )
}
