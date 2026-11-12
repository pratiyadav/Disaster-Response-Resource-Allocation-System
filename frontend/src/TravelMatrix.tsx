import { useEffect, useState } from 'react'
import { api } from './api'
import { EmptyState, Panel, PanelHeading, formatNumber } from './dashboard'
import type { Scenario, TravelMatrixData } from './types'

export function TravelMatrix({ scenario, onAllocate }: { scenario: Scenario; onAllocate: () => void }) {
  const [matrix, setMatrix] = useState<TravelMatrixData>()
  const [areaId, setAreaId] = useState('')
  const [source, setSource] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const { id, revision } = scenario

  useEffect(() => {
    const controller = new AbortController()
    api.travelMatrix(id, revision, controller.signal).then((saved) => {
      if (!controller.signal.aborted) setMatrix(saved)
    }).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message)
    })
    return () => controller.abort()
  }, [id, revision, attempt])

  const areaNames = new Map(scenario.areas.map((area) => [area.id, area.name]))
  const baseNames = new Map(scenario.bases.map((base) => [base.id, base.name]))
  const pairs = matrix?.pairs ?? []
  const fallbackCount = pairs.filter((pair) => pair.isFallback).length
  const visiblePairs = pairs.filter((pair) =>
    (!areaId || pair.areaId === areaId) && (!source || pair.isFallback === (source === 'fallback')))
    .sort((a, b) => a.seconds - b.seconds)

  return (
    <Panel>
      <PanelHeading title="Base-to-area travel estimates" action={<span className="count-pill">Revision {revision}</span>} />
      {error ? <EmptyState title="Could not load the travel matrix" body={error} action={
        <button className="secondary-button" onClick={() => { setError(''); setAttempt((value) => value + 1) }}>Retry</button>
      } /> : !matrix ? <p className="dashboard-status" role="status">Loading travel estimates…</p>
        : pairs.length === 0 ? <EmptyState title="No travel estimates for this revision"
          body="Run either allocation method to calculate and save the shared estimates." action={
            <button className="primary-button" onClick={onAllocate}>Go to allocations</button>
          } /> : (
            <>
              <div className="matrix-totals">
                <div><strong>{formatNumber(pairs.length)}</strong><span>Base-to-area pairs</span></div>
                <div><strong>{formatNumber(pairs.length - fallbackCount)}</strong><span>OSRM road estimates</span></div>
                <div><strong>{formatNumber(fallbackCount)}</strong><span>Straight-line estimates</span></div>
              </div>
              <div className="matrix-filters form-grid">
                <label>Affected area
                  <select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
                    <option value="">All areas</option>
                    {scenario.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                  </select>
                </label>
                <label>Estimate source
                  <select value={source} onChange={(event) => setSource(event.target.value)}>
                    <option value="">All sources</option>
                    <option value="road">OSRM road</option>
                    <option value="fallback">Straight-line fallback</option>
                  </select>
                </label>
              </div>
              {visiblePairs.length === 0 ? <p className="dashboard-status" role="status">No estimates match these filters.</p> : (
                <div className="table-scroll">
                  <table aria-label="Travel estimates from each base to each area">
                    <thead><tr><th scope="col">Resource base</th><th scope="col">Affected area</th><th scope="col" aria-sort="ascending">Travel time ↑</th><th scope="col">Distance</th><th scope="col">Source</th></tr></thead>
                    <tbody>
                      {visiblePairs.map((pair) => (
                        <tr key={`${pair.baseId}-${pair.areaId}`}>
                          <td><strong>{baseNames.get(pair.baseId)}</strong></td><td>{areaNames.get(pair.areaId)}</td>
                          <td>{formatNumber(pair.seconds / 60, 1)} min</td><td>{formatNumber(pair.distanceMeters / 1000, 2)} km</td>
                          <td>{pair.isFallback ? <span className="delta delta--fallback">Straight-line fallback</span> : 'OSRM road'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
    </Panel>
  )
}
