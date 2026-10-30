import { ReactNode } from 'react'

type BadgeTone = 'success' | 'warning' | 'neutral' | 'danger'

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>
}

export function StatusBadge({ status, children }: { status?: string; children?: ReactNode }) {
  const config: Record<string, { tone: BadgeTone; label: string }> = {
    complete: { tone: 'success', label: 'Complete' },
    incomplete: { tone: 'warning', label: 'Incomplete' },
    no_events: { tone: 'neutral', label: 'No events' },
    ambiguous: { tone: 'warning', label: 'Needs review' },
    pending: { tone: 'neutral', label: 'Pending' },
  }
  const normalized = status?.toLowerCase() || 'pending'
  const match = config[normalized]
  const fallbackLabel = status ? status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Pending'
  return <Badge tone={match?.tone || 'neutral'}>{children || match?.label || fallbackLabel}</Badge>
}

export function FlagBadge({ flagged }: { flagged: boolean }) {
  return <Badge tone={flagged ? 'warning' : 'neutral'}>{flagged ? 'Review' : 'Clear'}</Badge>
}
