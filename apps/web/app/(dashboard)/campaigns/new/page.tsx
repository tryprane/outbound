import { CampaignWizard } from '@/components/campaigns/CampaignWizard'
import Link from 'next/link'

export default function NewCampaignPage() {
  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          <Link href="/campaigns" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Back to Campaigns</Link>
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          New Campaign
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Choose between Extraction, Email, and WhatsApp campaigns from one unified wizard
        </p>
      </div>

      <CampaignWizard />
    </div>
  )
}
