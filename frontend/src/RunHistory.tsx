import { useEffect, useState } from 'react'
import { api } from './api'
import { EmptyState, Panel, PanelHeading, formatNumber } from './dashboard'
import { RunDetails } from './RunDetails'
import type { Method, RunSummary, SavedRun, Scenario } from './types'

const pageSize = 8
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
const methodNames: Record<Method, string> = { baseline: 'Baseline', optimized: 'Optimized' }

function RunSnapshot({ scenarioId, runId, currentRevision }: {
  scenarioId: string
  runId: string
  currentRevision: number
}) {
  const [run, setRun] = useState<SavedRun>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api.savedRun(scenarioId, runId, controller.signal).then((saved) => {
      if (!controller.signal.aborted) setRun(saved)
    }).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message)
    })
    return () => controller.abort()
  }, [scenarioId, runId, attempt])

  if (error) return <Panel><EmptyState title="Could not open the saved run" body={error} action={
    <button className="secondary-button" onClick={() => { setError(''); setAttempt((value) => value + 1) }}>Retry</button>
  } /></Panel>
  if (!run) return <Panel><p className="dashboard-status" role="status">Loading saved run…</p></Panel>

  return (
    <section className="detail-stack" aria-label="Saved run details">
      <Panel>
        <PanelHeading title={`${methodNames[run.method]} · Revision ${run.revision}`}
          action={<span className="count-pill">{run.revision === currentRevision ? 'Current revision' : 'Earlier revision'}</span>} />
        <p className="dashboard-status">{run.scenario.name} · Saved <time dateTime={run.createdAt}>{dateFormat.format(new Date(run.createdAt))}</time></p>
      </Panel>
      <RunDetails scenario={run.scenario} run={run} />
    </section>
  )
}

export function RunHistory({ scenario, onAllocate }: { scenario: Scenario; onAllocate: () => void }) {
  const [page, setPage] = useState(0)
  const [runs, setRuns] = useState<RunSummary[]>()
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const scenarioId = scenario.id

  useEffect(() => {
    const controller = new AbortController()
    api.runHistory(scenarioId, pageSize + 1, page * pageSize, controller.signal).then((history) => {
      if (!controller.signal.aborted) setRuns(history)
    }).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message)
    })
    return () => controller.abort()
  }, [scenarioId, page, attempt])

  function changePage(next: number) {
    setRuns(undefined)
    setSelected('')
    setError('')
    setPage(next)
  }

  return (
    <div className="detail-stack">
      <Panel>
        <PanelHeading title="Saved allocation runs" action={<span className="count-pill">Current revision {scenario.revision}</span>} />
        {error ? <EmptyState title="Could not load run history" body={error} action={
          <button className="secondary-button" onClick={() => { setError(''); setAttempt((value) => value + 1) }}>Retry</button>
        } /> : !runs ? <p className="dashboard-status" role="status">Loading run history…</p>
          : runs.length === 0 && page === 0 ? <EmptyState title="No saved runs yet" body="Run an allocation to add the first entry." action={
            <button className="primary-button" onClick={onAllocate}>Go to allocations</button>
          } /> : (
            <div className="table-scroll">
              <table aria-label="Saved allocation runs">
                <thead><tr><th scope="col">Method</th><th scope="col">Revision</th><th scope="col">Saved</th><th scope="col">Runtime</th><th scope="col" className="align-right">Details</th></tr></thead>
                <tbody>
                  {runs.slice(0, pageSize).map((run) => {
                    const savedAt = dateFormat.format(new Date(run.createdAt))
                    return (
                      <tr key={run.id} className={selected === run.id ? 'history-row--selected' : undefined}>
                        <td><strong>{methodNames[run.method]}</strong></td><td>{run.revision}</td>
                        <td><time dateTime={run.createdAt}>{savedAt}</time></td>
                        <td>{formatNumber(run.runtimeMs, 2)} ms</td>
                        <td className="align-right">
                          <button className="secondary-button" aria-pressed={selected === run.id}
                            aria-label={`View ${methodNames[run.method].toLowerCase()} run from revision ${run.revision}, saved ${savedAt}`}
                            onClick={() => setSelected(run.id)}>{selected === run.id ? 'Selected' : 'View run'}</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        {(page > 0 || (runs && runs.length > pageSize)) && (
          <div className="dashboard-pagination">
            <button className="secondary-button" disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</button>
            <span>Page {page + 1}</span>
            <button className="secondary-button" disabled={!runs || runs.length <= pageSize} onClick={() => changePage(page + 1)}>Next</button>
          </div>
        )}
      </Panel>
      {selected && <RunSnapshot key={selected} scenarioId={scenarioId} runId={selected} currentRevision={scenario.revision} />}
    </div>
  )
}
