'use client'

import { signIn } from 'next-auth/react'
import { useState, useTransition } from 'react'
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export default function LoginPage() {
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
  })
  const [isPending, startTransition] = useTransition()

  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleLoading(true)
    await signIn('google', { callbackUrl: '/' })
  }

  const handleCredentialsSignIn = () => {
    setError('')
    startTransition(async () => {
      const result = await signIn('credentials', {
        email: credentials.email,
        password: credentials.password,
        redirect: false,
        callbackUrl: '/',
      })

      if (result?.error) {
        setError('Those credentials did not match the admin account.')
        return
      }

      window.location.href = result?.url || '/'
    })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-12%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(214,170,102,0.35),_transparent_68%)]" />
        <div className="absolute bottom-[-12%] right-[-8%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,_rgba(30,36,48,0.12),_transparent_72%)]" />
      </div>

      <div className="animate-fade-in grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_480px]">
        <div className="hidden rounded-[36px] border border-white/50 bg-white/55 p-10 shadow-[0_30px_80px_rgba(60,45,25,0.08)] backdrop-blur-xl lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--success)]" />
              OutreachOS
            </div>
            <div className="max-w-xl space-y-5">
              <p className="text-sm uppercase tracking-[0.28em] text-[var(--text-muted)]">
                Control tower for outbound ops
              </p>
              <h1 className="text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--text-primary)]">
                Premium command surfaces for campaigns, mailboxes, and warmup.
              </h1>
              <p className="max-w-lg text-base leading-7 text-[var(--text-secondary)]">
                The workspace is now tuned for focused operators: calm hierarchy, quick status scanning,
                and a dedicated warmup lane separated from sender management.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Live status', 'Mailbox health and queue activity remain visible at a glance.'],
              ['Cleaner auth', 'Use the direct admin credential while keeping Google available.'],
              ['Warmup split', 'Recipients, stage pacing, and logs live in their own workspace.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[28px] border border-black/8 bg-white/80 p-5">
                <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="border-white/60 bg-white/90 shadow-[0_36px_100px_rgba(66,50,28,0.12)] backdrop-blur-xl">
          <CardHeader className="space-y-4 pb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#1f252d,#3e4856)] text-white shadow-[0_18px_38px_rgba(31,37,45,0.22)]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-3xl tracking-[-0.03em]">Sign in</CardTitle>
              <CardDescription className="mt-2 text-sm leading-6">
                Use the admin email and password for direct access, or keep Google available for the existing OAuth flow.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    id="email"
                    type="email"
                    className="h-12 rounded-2xl border-black/10 bg-[#fbfaf7] pl-11"
                    value={credentials.email}
                    onChange={(event) =>
                      setCredentials((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    id="password"
                    type="password"
                    className="h-12 rounded-2xl border-black/10 bg-[#fbfaf7] pl-11"
                    value={credentials.password}
                    onChange={(event) =>
                      setCredentials((current) => ({ ...current, password: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleCredentialsSignIn()
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <Button
              className="h-12 w-full rounded-2xl text-sm font-medium"
              onClick={handleCredentialsSignIn}
              disabled={isPending}
            >
              {isPending ? 'Signing in...' : 'Continue to workspace'}
              <ArrowRight className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              variant="outline"
              className="h-12 w-full rounded-2xl border-black/10 bg-white text-sm font-medium"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </Button>

            <div className="rounded-[24px] bg-[linear-gradient(180deg,rgba(247,243,236,0.9),rgba(255,255,255,0.9))] px-4 py-4 text-sm text-[var(--text-secondary)]">
              Internal agency access only. Sign in with the admin email and password configured in the environment.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
