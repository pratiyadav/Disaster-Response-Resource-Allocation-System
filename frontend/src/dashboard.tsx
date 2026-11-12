import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import type { AllocationRun, Severity } from './types'

export const metricDefinitions: { key: keyof AllocationRun['metrics']; label: string; unit: string; better: 'lower' | 'higher' }[] = [
  { key: 'averageResponseTime', label: 'Avg. response time', unit: 'min', better: 'lower' },
  { key: 'maxResponseTime', label: 'Max. response time', unit: 'min', better: 'lower' },
  { key: 'coverageRatio', label: 'Demand coverage', unit: '%', better: 'higher' },
  { key: 'unmetDemand', label: 'Unmet demand', unit: 'units', better: 'lower' },
  { key: 'utilization', label: 'Resource utilization', unit: '%', better: 'higher' },
  { key: 'totalTravelCost', label: 'Total travel cost', unit: 'unit-min', better: 'lower' },
]

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
}

export function metricValue(value: number, unit: string) {
  if (unit === '%') return `${formatNumber(value * 100, 1)}%`
  return `${formatNumber(value, unit === 'min' ? 1 : 0)} ${unit}`
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>
}

export function PanelHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>
      {action}
    </div>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`severity-badge severity-badge--${severity.toLowerCase()}`}><span />{severity}</span>
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><CircleAlert size={24} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}
