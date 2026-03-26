type StatusType = 'active' | 'draft' | 'paused' | 'completed' | 'failed' | 'sent' | 'bounced' | 'pending' | 'running' | 'done' | 'opened' | 'unopened'

interface StatusBadgeProps {
  status: StatusType | string
}

const statusConfig: Record<string, { label: string; className: string; dot?: boolean }> = {
  active:    { label: 'Active',    className: 'badge badge-active',    dot: true },
  draft:     { label: 'Draft',     className: 'badge badge-draft' },
  paused:    { label: 'Paused',    className: 'badge badge-paused' },
  completed: { label: 'Completed', className: 'badge badge-completed' },
  failed:    { label: 'Failed',    className: 'badge badge-failed' },
  sent:      { label: 'Sent',      className: 'badge badge-active' },
  bounced:   { label: 'Bounced',   className: 'badge badge-failed' },
  pending:   { label: 'Pending',   className: 'badge badge-draft' },
  running:   { label: 'Running',   className: 'badge badge-paused',   dot: true },
  done:      { label: 'Done',      className: 'badge badge-completed' },
  opened:    { label: 'Opened',    className: 'badge badge-active',    dot: true },
  unopened:  { label: 'Not Opened', className: 'badge badge-draft' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, className: 'badge badge-draft' }
  return (
    <span className={config.className}>
      {config.dot && (
        <span className="animate-pulse-dot" style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: 'currentColor', display: 'inline-block',
        }}/>
      )}
      {config.label}
    </span>
  )
}
