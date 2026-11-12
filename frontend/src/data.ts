import type { Severity } from './types'

export const severityOrder: Severity[] = ['Critical', 'High', 'Medium', 'Low']

export const severityColors: Record<Severity, string> = {
  Critical: '#e65c50',
  High: '#f19a4b',
  Medium: '#e4bc62',
  Low: '#4da7a0',
}
