'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { Plus, Trash2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface UnsubscribeEntry {
  id: string
  email: string
  createdAt: string
}

interface SettingsPayload {
  profile: {
    id: string
    name: string | null
    email: string | null
    image: string | null
  } | null
  workspace: {
    defaultPageSize: number
    inboxPageSize: number
    whatsappInboxPageSize: number
    includeWarmupInInbox: boolean
  }
}

export default function SettingsPage() {
  const [entries, setEntries] = useState<UnsubscribeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settings, setSettings] = useState<SettingsPayload>({
    profile: null,
    workspace: {
      defaultPageSize: 25,
      inboxPageSize: 25,
      whatsappInboxPageSize: 20,
      includeWarmupInInbox: false,
    },
  })
  
  const [newEmail, setNewEmail] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalEntries, setTotalEntries] = useState(0)

  const fetchList = async (p = 1) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/unsubscribe?page=${p}&limit=50`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setEntries(data.list || [])
      setPage(p)
      setTotalPages(data.pages || 1)
      setTotalEntries(data.total || 0)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data?.workspace) {
          setSettings({
            profile: data.profile ?? null,
            workspace: data.workspace,
          })
        }
      })
  }, [])

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true)
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')
      setSettings((current) => ({
        profile: data.profile ?? current.profile,
        workspace: data.workspace ?? current.workspace,
      }))
      toast.success('Settings updated')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = newEmail.trim()
    if (!email) return

    try {
      setAdding(true)
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to add email')
      }
      toast.success('Added to unsubscribe list')
      setNewEmail('')
      fetchList(1)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (email: string) => {
    try {
      setRemoveId(email)
      const res = await fetch(`/api/unsubscribe?email=${encodeURIComponent(email)}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to remove email')
      toast.success('Removed from unsubscribe list')
      fetchList(page)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRemoveId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Profile details, workspace preferences, and suppression controls.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <p className="text-sm text-muted-foreground">
              Update the signed-in profile details used across the workspace.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={settings.profile?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={settings.profile?.name || ''}
                onChange={(e) =>
                  setSettings((current) => ({
                    ...current,
                    profile: current.profile
                      ? { ...current.profile, name: e.target.value }
                      : current.profile,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-image">Avatar URL</Label>
              <Input
                id="profile-image"
                value={settings.profile?.image || ''}
                onChange={(e) =>
                  setSettings((current) => ({
                    ...current,
                    profile: current.profile
                      ? { ...current.profile, image: e.target.value }
                      : current.profile,
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace Basics</CardTitle>
            <p className="text-sm text-muted-foreground">
              Shared preferences for list density and inbox defaults.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-page-size">Default page size</Label>
                <Input
                  id="default-page-size"
                  type="number"
                  min={10}
                  max={100}
                  value={settings.workspace.defaultPageSize}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      workspace: {
                        ...current.workspace,
                        defaultPageSize: Math.max(10, Number(e.target.value || 10)),
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inbox-page-size">Email inbox page size</Label>
                <Input
                  id="inbox-page-size"
                  type="number"
                  min={10}
                  max={100}
                  value={settings.workspace.inboxPageSize}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      workspace: {
                        ...current.workspace,
                        inboxPageSize: Math.max(10, Number(e.target.value || 10)),
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wa-page-size">WhatsApp inbox page size</Label>
                <Input
                  id="wa-page-size"
                  type="number"
                  min={10}
                  max={100}
                  value={settings.workspace.whatsappInboxPageSize}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      workspace: {
                        ...current.workspace,
                        whatsappInboxPageSize: Math.max(10, Number(e.target.value || 10)),
                      },
                    }))
                  }
                />
              </div>
              <label className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={settings.workspace.includeWarmupInInbox}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      workspace: {
                        ...current.workspace,
                        includeWarmupInInbox: e.target.checked,
                      },
                    }))
                  }
                />
                Include warmup emails by default in inbox views
              </label>
            </div>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global Unsubscribe List</CardTitle>
          <p className="text-sm text-muted-foreground">
            Emails added here will NOT be contacted by any campaign, overriding even individual campaign logic.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAdd} className="flex gap-2 items-center">
            <Input 
              type="email" 
              placeholder="name@example.com" 
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="max-w-md"
              required
            />
            <Button type="submit" disabled={adding || !newEmail.trim()}>
              {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add to List
            </Button>
          </form>

          <div className="border rounded-md">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading...
              </div>
            ) : entries.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                No emails in the unsubscribe list.
              </div>
            ) : (
              <div className="divide-y relative">
                {entries.map(e => (
                  <div key={e.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                    <span className="font-medium text-sm">{e.email}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemove(e.email)}
                      disabled={removeId === e.email}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {removeId === e.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!loading && totalPages > 0 && (
            <PaginationControls
              page={page}
              pages={totalPages}
              total={totalEntries}
              limit={50}
              onPageChange={fetchList}
              label="suppressed emails"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
