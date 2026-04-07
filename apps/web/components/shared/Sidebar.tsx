'use client'

import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import {
  Flame,
  FolderKanban,
  Home,
  Inbox,
  KeySquare,
  Mail,
  MessageSquareText,
  Send,
  Settings,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

const navGroups = [
  {
    label: 'Dashboards',
    items: [{ label: 'Dashboard', href: '/', icon: Home }],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Campaigns', href: '/campaigns', icon: FolderKanban },
      { label: 'CSV Files', href: '/csv', icon: MessageSquareText },
    ],
  },
  {
    label: 'Channels',
    items: [
      { label: 'Mail Accounts', href: '/mail-accounts', icon: Mail },
      { label: 'Email Warmup', href: '/warmup', icon: Flame },
      { label: 'Inbox', href: '/inbox', icon: Inbox },
      { label: 'Sent Mail', href: '/sent', icon: Send },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'API Management', href: '/api-management', icon: KeySquare },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'OO'
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <aside className="page-shell sticky top-6 flex h-[calc(100vh-3rem)] w-[220px] shrink-0 flex-col rounded-[30px] border border-white/60 px-4 py-5 shadow-[0_26px_70px_rgba(60,45,25,0.08)]">
      <div className="mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#1f252d,#3e4856)] text-sm font-semibold text-white shadow-[0_16px_38px_rgba(31,37,45,0.18)]">
            OS
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)]">OutreachOS</div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Outbound suite</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
              {group.label}
            </div>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition',
                      isActive
                        ? 'bg-[var(--text-primary)] text-white shadow-[0_18px_34px_rgba(31,37,45,0.18)]'
                        : 'text-[var(--text-secondary)] hover:bg-white/70 hover:text-[var(--text-primary)]',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </div>
            <Separator className="mt-5 bg-black/6" />
          </div>
        ))}
      </nav>

      <div className="mt-5 rounded-[24px] border border-black/8 bg-white/80 p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 border-black/10">
            <AvatarImage src={session?.user?.image ?? ''} alt={session?.user?.name ?? 'User'} />
            <AvatarFallback>{getInitials(session?.user?.name, session?.user?.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--text-primary)]">
              {session?.user?.name || 'Outreach Admin'}
            </div>
            <div className="truncate text-xs text-[var(--text-muted)]">
              {session?.user?.email || 'Internal workspace'}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost mt-3 w-full justify-center"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          Log out
        </button>
      </div>
    </aside>
  )
}
