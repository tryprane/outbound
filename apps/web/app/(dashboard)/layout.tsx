import { Sidebar } from '@/components/shared/Sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        padding: '32px',
        overflowY: 'auto',
        background: 'var(--bg-primary)',
      }}>
        {children}
      </main>
    </div>
  )
}
