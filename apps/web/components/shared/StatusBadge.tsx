type StatusType =
  | 'active'
  | 'draft'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'sent'
  | 'bounced'
  | 'pending'
  | 'running'
  | 'done'
  | 'opened'
  | 'unopened'
  | 'replied'
  | 'awaiting reply'
  | 'gmail'
  | 'zoho'
  | 'connected'
  | 'error'
  | 'idle'
  | 'syncing'

interface StatusBadgeProps {
  status: StatusType | string
}

const statusConfig: Record<string, { label: string; className: string; dot?: boolean }> = {
  active: { label: 'Active', className: 'badge badge-active', dot: true },
  draft: { label: 'Draft', className: 'badge badge-draft' },
  paused: { label: 'Paused', className: 'badge badge-paused' },
  completed: { label: 'Completed', className: 'badge badge-completed' },
  failed: { label: 'Failed', className: 'badge badge-failed' },
  sent: { label: 'Sent', className: 'badge badge-active' },
  bounced: { label: 'Bounced', className: 'badge badge-failed' },
  pending: { label: 'Pending', className: 'badge badge-draft' },
  running: { label: 'Running', className: 'badge badge-paused', dot: true },
  done: { label: 'Done', className: 'badge badge-completed' },
  opened: { label: 'Opened', className: 'badge badge-active', dot: true },
  unopened: { label: 'Not Opened', className: 'badge badge-draft' },
  replied: { label: 'Replied', className: 'badge badge-completed', dot: true },
  'awaiting reply': { label: 'Awaiting Reply', className: 'badge badge-draft' },
  gmail: { label: 'Gmail', className: 'badge badge-completed' },
  zoho: { label: 'Zoho', className: 'badge badge-paused' },
  connected: { label: 'Connected', className: 'badge badge-active', dot: true },
  error: { label: 'Error', className: 'badge badge-failed', dot: true },
  idle: { label: 'Idle', className: 'badge badge-draft' },
  syncing: { label: 'Syncing', className: 'badge badge-completed', dot: true },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] ?? {
    label: status,
    className: 'badge badge-draft',
  }

  return (
    <span className={config.className}>
      {config.dot ? (
        <span
          className="animate-pulse-dot"
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'currentColor',
            display: 'inline-block',
          }}
        />
      ) : null}
      {config.label}
    </span>
  )
}
