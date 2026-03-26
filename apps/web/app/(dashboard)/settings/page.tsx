'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'

interface UnsubscribeEntry {
  id: string
  email: string
  createdAt: string
}

export default function SettingsPage() {
  const [entries, setEntries] = useState<UnsubscribeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  
  const [newEmail, setNewEmail] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchList = async (p = 1) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/unsubscribe?page=${p}&limit=50`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setEntries(data.list || [])
      setPage(p)
      setTotalPages(data.pages || 1)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your workspace settings and preferences.</p>
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

          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchList(page - 1)} 
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchList(page + 1)} 
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
