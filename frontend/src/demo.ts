import { severityOrder } from './data'
import type { AllocationRun, Area, Assignment, Coordinates, Method, Metrics, ResourceBase, Scenario } from './types'

function distanceKm(a: Coordinates, b: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(b.lat - a.lat)
  const deltaLng = toRadians(b.lng - a.lng)
  const arc = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(deltaLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

/** Synthetic minutes for UI previews only. The backend must use OSRM's persisted matrix. */
export function previewTravelMinutes(base: ResourceBase, area: Area): number {
  return Math.round((6 + distanceKm(base.location, area.location) * 3.4) * 10) / 10
}

function baselineAssignments(scenario: Scenario): Assignment[] {
  const remaining = new Map(scenario.bases.map((base) => [base.id, base.quantity]))
  const assignments: Assignment[] = []
  const areas = [...scenario.areas].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))

  for (const area of areas) {
    let needed = area.demand
    const bases = [...scenario.bases].sort((a, b) => previewTravelMinutes(a, area) - previewTravelMinutes(b, area))
    for (const base of bases) {
      if (needed === 0) break
      const sent = Math.min(needed, remaining.get(base.id) ?? 0)
      if (sent > 0) {
        assignments.push({ baseId: base.id, areaId: area.id, quantity: sent })
        remaining.set(base.id, (remaining.get(base.id) ?? 0) - sent)
        needed -= sent
      }
    }
  }
  return assignments
}

/** A distinct illustrative plan for UI comparison, not an optimization solver. */
function alternativeAssignments(scenario: Scenario): Assignment[] {
  const baseStock = new Map(scenario.bases.map((base) => [base.id, base.quantity]))
  const areaNeed = new Map(scenario.areas.map((area) => [area.id, area.demand]))
  const pairs = scenario.bases.flatMap((base) => scenario.areas.map((area) => ({
    base,
    area,
    minutes: previewTravelMinutes(base, area),
  })))
  pairs.sort((a, b) => a.minutes - b.minutes)

  const assignments: Assignment[] = []
  for (const { base, area } of pairs) {
    const sent = Math.min(baseStock.get(base.id) ?? 0, areaNeed.get(area.id) ?? 0)
    if (sent > 0) {
      assignments.push({ baseId: base.id, areaId: area.id, quantity: sent })
      baseStock.set(base.id, (baseStock.get(base.id) ?? 0) - sent)
      areaNeed.set(area.id, (areaNeed.get(area.id) ?? 0) - sent)
    }
  }
  return assignments
}

function calculateMetrics(scenario: Scenario, assignments: Assignment[]): Metrics {
  const totalDemand = scenario.areas.reduce((sum, area) => sum + area.demand, 0)
  const totalStock = scenario.bases.reduce((sum, base) => sum + base.quantity, 0)
  let sent = 0
  let totalTravelCost = 0
  let maxResponseTime = 0

  for (const assignment of assignments) {
    const base = scenario.bases.find((item) => item.id === assignment.baseId)
    const area = scenario.areas.find((item) => item.id === assignment.areaId)
    if (!base || !area) continue
    const minutes = previewTravelMinutes(base, area)
    sent += assignment.quantity
    totalTravelCost += minutes * assignment.quantity
    maxResponseTime = Math.max(maxResponseTime, minutes)
  }

  return {
    averageResponseTime: sent ? totalTravelCost / sent : 0,
    maxResponseTime,
    coverageRatio: totalDemand ? sent / totalDemand : 0,
    unmetDemand: Math.max(totalDemand - sent, 0),
    utilization: totalStock ? sent / totalStock : 0,
    totalTravelCost,
  }
}

export function createPreviewRun(scenario: Scenario, method: Method): AllocationRun {
  const startedAt = performance.now()
  const assignments = method === 'baseline' ? baselineAssignments(scenario) : alternativeAssignments(scenario)
  const metrics = calculateMetrics(scenario, assignments)
  const runtimeMs = performance.now() - startedAt
  return {
    id: `${scenario.id}-${method}-${Date.now()}`,
    scenarioId: scenario.id,
    method,
    assignments,
    metrics,
    runtimeMs,
    createdAt: new Date().toISOString(),
    illustrative: true,
  }
}
