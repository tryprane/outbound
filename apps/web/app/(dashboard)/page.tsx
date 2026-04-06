import Link from 'next/link'
import { ArrowRight, FolderPlus, MailPlus, Upload } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

async function getStats() {
  const [campaigns, mailAccounts, csvFiles, sentToday, activeCampaigns, warmingAccounts] =
    await Promise.all([
      prisma.campaign.count(),
      prisma.mailAccount.count(),
      prisma.csvFile.count(),
      prisma.sentMail.count({
        where: {
          sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          status: 'sent',
        },
      }),
      prisma.campaign.count({ where: { status: 'active' } }),
      prisma.mailAccount.count({ where: { warmupStatus: 'WARMING' } }),
    ])

  return { campaigns, mailAccounts, csvFiles, sentToday, activeCampaigns, warmingAccounts }
}

export default async function DashboardPage() {
  const stats = await getStats()

  const statCards = [
    {
      label: 'Campaigns',
      value: stats.campaigns,
      detail: `${stats.activeCampaigns} active`,
      href: '/campaigns',
      accent: 'bg-[#1f252d]',
    },
    {
      label: 'Mail Accounts',
      value: stats.mailAccounts,
      detail: `${stats.warmingAccounts} warming`,
      href: '/mail-accounts',
      accent: 'bg-[#c78f4a]',
    },
    {
      label: 'CSV Files',
      value: stats.csvFiles,
      detail: 'Ready for import',
      href: '/csv',
      accent: 'bg-[#607274]',
    },
    {
      label: 'Sent Today',
      value: stats.sentToday,
      detail: 'Across all senders',
      href: '/sent',
      accent: 'bg-[#7b6a58]',
    },
  ]

  return (
    <div className="animate-fade-in space-y-8">
      <section className="page-shell overflow-hidden rounded-[34px] border border-white/70 px-8 py-8 shadow-[0_28px_80px_rgba(60,45,25,0.08)]">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <Badge variant="outline" className="bg-white/70">
              Dashboard
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] md:text-5xl">
                Run outbound from one clean operations surface.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
                Track campaign momentum, keep sender inventory healthy, and shift into the dedicated warmup workspace when
                you need to tune ramp schedules or recipient pools.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-full px-6">
                <Link href="/campaigns/new">
                  New Campaign
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-black/10 bg-white/75 px-6">
                <Link href="/warmup">Open Warmup Workspace</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {statCards.map((card) => (
              <Link key={card.label} href={card.href}>
                <Card className="h-full rounded-[28px] border-black/8 bg-white/85 shadow-none transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(60,45,25,0.08)]">
                  <CardContent className="p-6">
                    <div className={`mb-5 h-2.5 w-20 rounded-full ${card.accent}`} />
                    <div className="text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                      {card.value}
                    </div>
                    <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">{card.label}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{card.detail}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[32px] border-black/8 bg-white/88 shadow-none">
          <CardContent className="p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-[0.22em] text-[var(--text-muted)]">Quick actions</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  Keep the workspace moving
                </h2>
              </div>
              <Badge variant="success">Live</Badge>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: 'Start a campaign',
                  body: 'Launch a new outbound motion with fresh copy and sender allocation.',
                  href: '/campaigns/new',
                  icon: FolderPlus,
                },
                {
                  title: 'Upload a CSV',
                  body: 'Bring in a new lead source and prep fields for campaign mapping.',
                  href: '/csv',
                  icon: Upload,
                },
                {
                  title: 'Add mail accounts',
                  body: 'Connect Gmail or Zoho senders, then manage warmup separately.',
                  href: '/mail-accounts',
                  icon: MailPlus,
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="rounded-[26px] border border-black/8 bg-[#fcfbf8] p-5 transition hover:border-black/14 hover:bg-white"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#f4ece0,#ffffff)] text-[var(--text-primary)] shadow-[0_12px_24px_rgba(60,45,25,0.08)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-5 text-base font-medium text-[var(--text-primary)]">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.body}</p>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-black/8 bg-[linear-gradient(180deg,#232a33,#2f3844)] text-white shadow-none">
          <CardContent className="p-8">
            <div className="text-sm uppercase tracking-[0.22em] text-white/60">Operations pulse</div>
            <div className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
              {stats.warmingAccounts > 0 ? `${stats.warmingAccounts} mailboxes warming` : 'All warmed mailboxes ready'}
            </div>
            <p className="mt-3 max-w-md text-sm leading-7 text-white/70">
              Sender warmup now has its own workspace, so the inventory page can stay focused on connection quality,
              mailbox actions, and account activation.
            </p>

            <div className="mt-8 grid gap-4">
              {[
                ['Warmup workspace', 'Tune stage pacing, recipients, and logs from a dedicated control plane.'],
                ['Mail accounts', 'Audit provider setup, sync issues, and active sender status without domain panels.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-medium text-white">{title}</div>
                  <p className="mt-2 text-sm leading-6 text-white/68">{body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
