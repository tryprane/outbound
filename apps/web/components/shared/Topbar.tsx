'use client'

import { Search, Sparkles } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'OO'
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function Topbar() {
  const { data: session } = useSession()

  return (
    <header className="page-shell sticky top-6 z-20 mb-8 flex items-center justify-between gap-4 rounded-[28px] border border-white/60 px-5 py-4 shadow-[0_24px_60px_rgba(60,45,25,0.08)]">
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-black/10 bg-white/85 px-4 py-3">
        <Search className="h-4 w-4 text-[var(--text-muted)]" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--text-primary)]">Search workspace</div>
          <div className="truncate text-xs text-[var(--text-muted)]">Campaigns, accounts, sent mail, inbox threads</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="success" className="hidden sm:inline-flex">
          <span className="inline-flex h-2 w-2 rounded-full bg-current" />
          Live
        </Badge>
        <Badge variant="outline" className="hidden md:inline-flex">
          <Sparkles className="h-3 w-3" />
          Warmup ready
        </Badge>
        <div className="flex items-center gap-3 rounded-full border border-black/10 bg-white/90 px-3 py-2">
          <Avatar className="h-10 w-10 border-black/10">
            <AvatarImage src={session?.user?.image ?? ''} alt={session?.user?.name ?? 'User'} />
            <AvatarFallback>{getInitials(session?.user?.name, session?.user?.email)}</AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {session?.user?.name || 'Outreach Admin'}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              {session?.user?.email || 'Operations workspace'}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
