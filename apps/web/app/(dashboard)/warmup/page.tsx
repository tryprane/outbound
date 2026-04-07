import { Suspense } from 'react'
import { WarmupWorkspace } from '@/components/warmup/WarmupWorkspace'

export default function WarmupPage() {
  return (
    <Suspense fallback={<div className="animate-fade-in">Loading warmup workspace...</div>}>
      <WarmupWorkspace />
    </Suspense>
  )
}
