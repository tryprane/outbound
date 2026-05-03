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
  MailPlus,
  MessageSquareText,
  MessagesSquare,
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
      { label: 'Send Mail', href: '/send-mail', icon: MailPlus },
      { label: 'Inbox', href: '/inbox', icon: Inbox },
      { label: 'Sent', href: '/sent', icon: Send },
      { label: 'Responses', href: '/responses', icon: MessagesSquare },
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
    <aside className="page-shell sticky top-3 z-30 flex max-h-[calc(100svh-1.5rem)] min-w-0 flex-col rounded-[24px] border border-white/60 px-3 py-3 shadow-[0_18px_48px_rgba(60,45,25,0.08)] xl:top-6 xl:h-[calc(100vh-3rem)] xl:w-[220px] xl:shrink-0 xl:rounded-[30px] xl:px-4 xl:py-5 xl:shadow-[0_26px_70px_rgba(60,45,25,0.08)]">
      <div className="mb-3 px-1 xl:mb-6 xl:px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#1f252d,#3e4856)] text-sm font-semibold text-white shadow-[0_16px_38px_rgba(31,37,45,0.18)] xl:h-11 xl:w-11 xl:rounded-[16px]">
            OS
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-[-0.02em] text-[var(--text-primary)]">OutreachOS</div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Outbound suite</div>
          </div>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1 xl:flex-1 xl:flex-col xl:space-y-5 xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0 xl:pr-1">
        {navGroups.map((group) => (
          <div key={group.label} className="flex shrink-0 gap-2 xl:block xl:shrink">
            <div className="hidden px-3 text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)] xl:block">
              {group.label}
            </div>
            <div className="flex gap-2 xl:mt-2 xl:block xl:space-y-1">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2.5 text-sm transition xl:gap-3',
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
            <Separator className="mt-5 hidden bg-black/6 xl:block" />
          </div>
        ))}
      </nav>

      <div className="mt-5 hidden rounded-[24px] border border-black/8 bg-white/80 p-3 xl:block">
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
