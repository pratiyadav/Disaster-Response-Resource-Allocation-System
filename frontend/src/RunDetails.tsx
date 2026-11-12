import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState, Panel, PanelHeading, SeverityBadge, formatNumber, metricDefinitions, metricValue } from './dashboard'
import { severityColors, severityOrder } from './data'
import { ScenarioMap } from './ScenarioMap'
import type { AllocationRun, Scenario } from './types'

export function RunDetails({ scenario, run, assignmentAction }: { scenario: Scenario; run: AllocationRun; assignmentAction?: ReactNode }) {
  const areas = new Map(scenario.areas.map((area) => [area.id, area]))
  const bases = new Map(scenario.bases.map((base) => [base.id, base]))
  const assignedByArea = new Map<string, number>()
  for (const assignment of run.assignments) {
    assignedByArea.set(assignment.areaId, (assignedByArea.get(assignment.areaId) ?? 0) + assignment.quantity)
  }
  const coverage = scenario.areas.map((area) => {
    const assigned = assignedByArea.get(area.id) ?? 0
    return { area, assigned, unmet: area.demand - assigned }
  }).sort((a, b) => severityOrder.indexOf(a.area.severity) - severityOrder.indexOf(b.area.severity)
    || b.unmet - a.unmet)

  return (
    <div className="detail-stack">
      <div className="allocation-grid">
        <Panel>
          <PanelHeading title="Assignments on the map" action={<span className="count-pill">{run.assignments.length} assignments</span>} />
          <ScenarioMap scenario={scenario} assignments={run.assignments} />
          <div className="map-legend">
            <span><i className="legend-route" /> Base-to-area link</span><span><i className="legend-base">✚</i> Resource base</span>
            {severityOrder.map((severity) => <span key={severity}><i style={{ background: severityColors[severity] }} />{severity}</span>)}
          </div>
        </Panel>
        <Panel>
          <PanelHeading title="Performance metrics" />
          <div className="metric-list">
            {metricDefinitions.map((metric) => (
              <div className="metric-line" key={metric.key}><span>{metric.label}</span><strong>{metricValue(run.metrics[metric.key], metric.unit)}</strong></div>
            ))}
            <div className="metric-line"><span>Allocation runtime</span><strong>{formatNumber(run.runtimeMs, 2)} ms</strong></div>
          </div>
          <div className="panel-footnote">
            <CircleAlert size={16} />
            {run.usesFallback ? 'The travel-time matrix includes straight-line estimates.' : 'The travel-time matrix uses OSRM road estimates.'}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeading title="Ambulance coverage by area" action={<span className="count-pill">{coverage.filter((row) => row.unmet > 0).length} areas with unmet demand</span>} />
        <div className="table-scroll">
          <table aria-label="Ambulance coverage by area">
            <thead><tr><th scope="col">Affected area</th><th scope="col">Severity</th><th scope="col">Needed</th><th scope="col">Assigned</th><th scope="col" className="align-right">Unmet</th></tr></thead>
            <tbody>
              {coverage.map(({ area, assigned, unmet }) => (
                <tr key={area.id}>
                  <td><strong>{area.name}</strong></td><td><SeverityBadge severity={area.severity} /></td>
                  <td>{formatNumber(area.demand)}</td><td>{formatNumber(assigned)}</td>
                  <td className="align-right">{unmet > 0 ? <span className="delta delta--bad">{formatNumber(unmet)}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <PanelHeading title="Assignments" action={assignmentAction} />
        {run.assignments.length ? (
          <div className="table-scroll">
            <table aria-label="Ambulance assignments">
              <thead><tr><th scope="col">Resource base</th><th scope="col">Affected area</th><th scope="col">Severity</th><th scope="col">Travel estimate</th><th scope="col" className="align-right">Units sent</th></tr></thead>
              <tbody>
                {run.assignments.map((assignment) => {
                  const base = bases.get(assignment.baseId)
                  const area = areas.get(assignment.areaId)
                  if (!base || !area) return null
                  return (
                    <tr key={`${assignment.baseId}-${assignment.areaId}`}>
                      <td><span className="table-base-dot" />{base.name}</td><td>{area.name}</td>
                      <td><SeverityBadge severity={area.severity} /></td>
                      <td>{formatNumber(assignment.travelMinutes, 1)} min{assignment.isFallback ? ' (fallback)' : ''}</td>
                      <td className="align-right"><strong>{formatNumber(assignment.quantity)}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No ambulances assigned" body="Review coverage by area to see which demand is still unmet." />}
      </Panel>
    </div>
  )
}
