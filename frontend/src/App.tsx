import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Building2, Check, ChevronDown, CircleAlert,
  Clock3, History, GitCompareArrows, LayoutDashboard, MapPin, MapPinned, Menu, Network, Play,
  Plus, RotateCcw, Route, Trash2, X,
} from 'lucide-react'
import { severityColors, severityOrder } from './data'
import { api, browserScenarios, type RunSet } from './api'
import { ScenarioMap } from './ScenarioMap'
import { RunDetails } from './RunDetails'
import { RunHistory } from './RunHistory'
import { TravelMatrix } from './TravelMatrix'
import { EmptyState, Panel, PanelHeading, SeverityBadge, formatNumber, metricDefinitions, metricValue } from './dashboard'
import type { Area, Method, ResourceBase, Scenario, Severity } from './types'

type View = 'overview' | 'scenario' | 'matrix' | 'allocations' | 'comparison' | 'history'

const navItems: { id: View; label: string; icon: typeof LayoutDashboard; title: string; description: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, title: 'Situation overview', description: 'A clear picture of needs, available resources, and suggested response.' },
  { id: 'scenario', label: 'Scenario data', icon: MapPinned, title: 'Scenario data', description: 'Build and review the inputs used by both allocation methods.' },
  { id: 'matrix', label: 'Travel matrix', icon: Network, title: 'Travel matrix', description: 'Inspect the travel times and distances used by both allocation methods.' },
  { id: 'allocations', label: 'Allocations', icon: Route, title: 'Allocation runs', description: 'Inspect assignments and performance for each method.' },
  { id: 'comparison', label: 'Compare results', icon: GitCompareArrows, title: 'Compare results', description: 'Understand the trade-offs between two plans on identical inputs.' },
  { id: 'history', label: 'Run history', icon: History, title: 'Run history', description: 'Review saved allocations with the scenario inputs used at the time.' },
]

function fieldValid(value: number, min: number, max = Number.POSITIVE_INFINITY) {
  return Number.isFinite(value) && value >= min && value <= max
}

function StatCard({ label, value, helper, icon: Icon, tone = 'teal' }: {
  label: string; value: string; helper: string; icon: typeof Activity; tone?: 'teal' | 'coral' | 'blue' | 'gold'
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon stat-icon--${tone}`}><Icon size={20} strokeWidth={1.9} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-helper">{helper}</div>
    </div>
  )
}

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [runs, setRuns] = useState<Record<string, RunSet>>({})
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [legacyScenarios, setLegacyScenarios] = useState(browserScenarios)
  const [view, setView] = useState<View>('overview')
  const [runTab, setRunTab] = useState<Method>('baseline')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [scenarioForm, setScenarioForm] = useState({ name: '', region: '', description: '' })
  const [areaForm, setAreaForm] = useState({ name: '', population: '', severity: 'High' as Severity, demand: '', lat: '', lng: '' })
  const [baseForm, setBaseForm] = useState({ name: '', quantity: '', lat: '', lng: '' })

  const scenario = scenarios.find((item) => item.id === selectedId) ?? scenarios[0]
  const scenarioId = scenario?.id
  const revision = scenario?.revision
  const runSet = scenarioId ? runs[scenarioId] : undefined
  const currentRuns = runSet && runSet.revision === revision ? runSet.runs : {}
  const selectedRun = currentRuns[runTab]
  const areaCount = scenario?.areas.length ?? 0
  const baseCount = scenario?.bases.length ?? 0
  const demand = scenario?.areas.reduce((sum, area) => sum + area.demand, 0) ?? 0
  const supply = scenario?.bases.reduce((sum, base) => sum + base.quantity, 0) ?? 0
  const priorityAreas = useMemo(() => [...(scenario?.areas ?? [])].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)), [scenario])

  useEffect(() => {
    const controller = new AbortController()
    api.scenarios(controller.signal).then((list) => {
      setScenarios(list)
      setError('')
      setLoading(false)
    }).catch((failure: Error) => {
      if (controller.signal.aborted) return
      setError(failure.message)
      setLoading(false)
    })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!scenarioId || revision === undefined) return
    const controller = new AbortController()
    async function loadRuns(id: string) {
      try {
        const result = await api.runs(id, controller.signal)
        if (controller.signal.aborted) return
        if (result.revision !== revision) {
          const current = await api.scenario(id, controller.signal)
          if (!controller.signal.aborted) setScenarios((existing) =>
            existing.map((item) => item.id === id ? current : item))
          return
        }
        setRuns((existing) => {
          const current = existing[id]
          const latest = { ...result.runs }
          if (current?.revision === result.revision) {
            for (const method of ['baseline', 'optimized'] as const) {
              const known = current.runs[method]
              if (known && (!latest[method] || known.createdAt > latest[method].createdAt)) latest[method] = known
            }
          }
          return { ...existing, [id]: { revision: result.revision, runs: latest } }
        })
      } catch (failure) {
        if (!controller.signal.aborted) setError((failure as Error).message)
      }
    }
    void loadRuns(scenarioId)
    return () => controller.abort()
  }, [scenarioId, revision, reload])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function navigate(next: View) {
    setView(next)
    setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function perform(action: () => Promise<void>) {
    if (pending) return
    setPending(true)
    setNotice('')
    setError('')
    try {
      await action()
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setPending(false)
    }
  }

  function replaceScenario(updated: Scenario) {
    setScenarios((existing) => existing.map((item) => item.id === updated.id ? updated : item))
  }

  function addScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(async () => {
      const next = await api.createScenario(scenarioForm)
      setScenarios((existing) => [...existing, next])
      setSelectedId(next.id)
      setScenarioForm({ name: '', region: '', description: '' })
      setNotice('Scenario saved. Add affected areas and resource bases to begin.')
      navigate('scenario')
    })
  }

  function addArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scenario) return
    const population = Number(areaForm.population)
    const demand = Number(areaForm.demand)
    const lat = Number(areaForm.lat)
    const lng = Number(areaForm.lng)
    if (!fieldValid(population, 0) || !fieldValid(demand, 0) || !fieldValid(lat, -90, 90) || !fieldValid(lng, -180, 180)
      || !Number.isInteger(population) || !Number.isInteger(demand) || !areaForm.name.trim()) {
      setError('Enter a name, nonnegative whole numbers, and valid coordinates.')
      return
    }
    const area: Omit<Area, 'id'> = { name: areaForm.name, population, severity: areaForm.severity, demand, location: { lat, lng } }
    void perform(async () => {
      replaceScenario(await api.addArea(scenario.id, area))
      setAreaForm({ name: '', population: '', severity: 'High', demand: '', lat: '', lng: '' })
      setNotice('Area saved. Run both methods again to compare this version of the scenario.')
    })
  }

  function addBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scenario) return
    const quantity = Number(baseForm.quantity)
    const lat = Number(baseForm.lat)
    const lng = Number(baseForm.lng)
    if (!fieldValid(quantity, 0) || !Number.isInteger(quantity) || !fieldValid(lat, -90, 90) || !fieldValid(lng, -180, 180) || !baseForm.name.trim()) {
      setError('Enter a name, nonnegative whole-number stock, and valid coordinates.')
      return
    }
    const base: Omit<ResourceBase, 'id'> = { name: baseForm.name, quantity, location: { lat, lng } }
    void perform(async () => {
      replaceScenario(await api.addBase(scenario.id, base))
      setBaseForm({ name: '', quantity: '', lat: '', lng: '' })
      setNotice('Base saved. Run both methods again to compare this version of the scenario.')
    })
  }

  function removeItem(kind: 'areas' | 'bases', id: string) {
    if (!scenario) return
    void perform(async () => {
      replaceScenario(await api.removeLocation(scenario.id, kind, id))
      setNotice('Scenario updated. Run both methods again to compare this version.')
    })
  }

  function runAllocation(method: Method) {
    if (!scenario) return
    if (!areaCount || !baseCount) {
      setError('Add at least one affected area and one resource base first.')
      return
    }
    void perform(async () => {
      const result = await api.run(scenario.id, method)
      if (result.revision !== scenario.revision) replaceScenario(await api.scenario(scenario.id))
      setRuns((existing) => {
        const current = existing[scenario.id]
        const previous = current?.revision === result.revision ? current.runs : {}
        return { ...existing, [scenario.id]: { revision: result.revision, runs: { ...previous, [method]: result } } }
      })
      setRunTab(method)
      const methodName = method === 'baseline' ? 'Baseline' : 'Optimized'
      setNotice(`${methodName} run saved.${result.usesFallback ? ' The matrix includes straight-line estimates.' : ''}`)
      navigate('allocations')
    })
  }

  function resetSamples() {
    void perform(async () => {
      const list = await api.restoreSamples()
      setScenarios(list)
      setSelectedId(list.find((item) => item.sample)?.id ?? '')
      setNotice('Built-in sample scenarios restored.')
      navigate('overview')
    })
  }

  function importScenarios() {
    void perform(async () => {
      for (const legacy of legacyScenarios) {
        const imported = await api.importScenario(legacy)
        setScenarios((existing) => existing.some((item) => item.id === imported.id)
          ? existing : [...existing, imported])
        setLegacyScenarios((existing) => existing.filter((item) => item.id !== legacy.id))
      }
      setNotice('Browser scenarios imported into the database.')
    })
  }

  if (!scenario) {
    return <EmptyState title={loading ? 'Loading scenarios…' : 'Could not load scenarios'}
      body={error || 'Waiting for the DRRAS API.'}
      action={!loading && <button className="primary-button" onClick={() => {
        setLoading(true)
        setReload((value) => value + 1)
      }}>Retry</button>} />
  }

  const page = navItems.find((item) => item.id === view)
  const baseline = currentRuns.baseline
  const optimized = currentRuns.optimized

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'sidebar--open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-symbol"><Activity size={24} strokeWidth={2.4} /></div>
          <div><strong>DRRAS</strong><span>Response planning</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'nav-item--active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
              {view === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="sidebar-note-icon"><CircleAlert size={16} /></span><strong>Planning prototype</strong><p>All data and allocations shown here are simulated. Human review is required.</p></div>
          <div className="sidebar-foot"><span className="live-dot" /> Demo workspace <span>v0.1</span></div>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="topbar-path"><span>Workspace</span><span className="path-separator">/</span><strong>{page?.label}</strong></div>
          <div className="topbar-right"><span className="topbar-status"><span className="live-dot" /> Demo mode</span><span className="avatar">CO</span></div>
        </header>

        <div className="page-content">
          {error && <div className="demo-banner" role="alert"><CircleAlert size={18} /><span>{error}</span><button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
          {pending && <p role="status">Working…</p>}
          {notice && <div className="toast" role="status"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}

          <div className="page-heading">
            <div>
              <div className="heading-eyebrow"><span className="eyebrow-line" /> DISASTER RESPONSE RESOURCE ALLOCATION</div>
              <h1>{page?.title}</h1>
              <p>{page?.description}</p>
            </div>
            <div className="heading-actions">
              <label className="scenario-select-wrap"><span className="sr-only">Select scenario</span><MapPin size={17} /><select disabled={pending} value={scenario.id} onChange={(event) => setSelectedId(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></label>
            </div>
          </div>

          <div className="demo-banner"><CircleAlert size={18} /><span><strong>Simulated scenario.</strong> Review suggested assignments before drawing conclusions about an allocation.</span></div>

          {view === 'overview' && (
            <>
              <div className="stats-grid">
                <StatCard label="Affected areas" value={String(areaCount).padStart(2, '0')} helper="Across this scenario" icon={MapPin} tone="coral" />
                <StatCard label="Resource bases" value={String(baseCount).padStart(2, '0')} helper={`${formatNumber(supply)} ambulances available`} icon={Building2} tone="blue" />
                <StatCard label="Total demand" value={formatNumber(demand)} helper="Ambulance units needed" icon={Activity} tone="gold" />
                <StatCard label="Demand coverage" value={baseline ? `${formatNumber(baseline.metrics.coverageRatio * 100, 1)}%` : '—'} helper={baseline ? 'Saved baseline run' : 'Run the baseline'} icon={ArrowUpRight} tone="teal" />
              </div>

              <div className="overview-grid">
                <Panel className="map-panel">
                  <PanelHeading eyebrow="LIVE SCENARIO VIEW" title={scenario.name} action={<span className="region-chip"><MapPin size={13} />{scenario.region}</span>} />
                  <ScenarioMap scenario={scenario} />
                  <div className="map-legend"><span><i className="legend-base">✚</i> Resource base</span>{severityOrder.map((severity) => <span key={severity}><i style={{ background: severityColors[severity] }} />{severity}</span>)}</div>
                </Panel>

                <Panel className="priority-panel">
                  <PanelHeading eyebrow="RESPONSE PRIORITY" title="Affected areas" action={<span className="count-pill">{areaCount} areas</span>} />
                  {priorityAreas.length ? <div className="area-list">{priorityAreas.map((area, index) => <div className="area-row" key={area.id}><div className="area-index">{String(index + 1).padStart(2, '0')}</div><div className="area-row-main"><strong>{area.name}</strong><span>{formatNumber(area.population)} people</span></div><div className="area-row-right"><SeverityBadge severity={area.severity} /><span>{area.demand} units needed</span></div></div>)}</div> : <EmptyState title="No affected areas" body="Add an area in Scenario data to populate this view." action={<button className="text-button" onClick={() => navigate('scenario')}>Add an area <ArrowRight size={16} /></button>} />}
                  <button className="panel-footer-link" onClick={() => navigate('scenario')}>Manage scenario data <ArrowRight size={16} /></button>
                </Panel>
              </div>

              <div className="lower-grid">
                <Panel className="action-panel"><div className="action-art"><Route size={30} /></div><div><div className="eyebrow">NEXT STEP</div><h2>Plan the response</h2><p>Run the severity-first baseline and optimized allocation on the same travel-time matrix.</p></div><div className="action-buttons"><button className="primary-button" disabled={pending} onClick={() => runAllocation('baseline')}><Play size={16} fill="currentColor" /> Run baseline</button><button className="secondary-button" disabled={pending} onClick={() => runAllocation('optimized')}>Optimized <ArrowRight size={16} /></button></div></Panel>
                <Panel className="capacity-panel"><PanelHeading eyebrow="CAPACITY SNAPSHOT" title="Supply vs. demand" /><div className="capacity-numbers"><div><strong>{formatNumber(supply)}</strong><span>Available</span></div><div><strong>{formatNumber(demand)}</strong><span>Needed</span></div></div><div className="capacity-bar"><span style={{ width: `${demand ? Math.min((supply / demand) * 100, 100) : 0}%` }} /></div><p>{supply >= demand ? 'Current stock can cover the listed demand in total.' : `${formatNumber(demand - supply)} more units are needed to fully meet demand.`}</p></Panel>
              </div>
            </>
          )}

          {view === 'scenario' && (
            <>
              <div className="scenario-layout">
                <div className="scenario-main">
                  <Panel><PanelHeading eyebrow="SCENARIO PROFILE" title={scenario.name} action={<span className="region-chip"><MapPin size={13} />{scenario.region}</span>} /><p className="scenario-description">{scenario.description || 'A custom disaster response scenario.'}</p><div className="scenario-facts"><span><MapPin size={17} />{areaCount} affected areas</span><span><Building2 size={17} />{baseCount} resource bases</span><span><Activity size={17} />{supply} available units</span></div><ScenarioMap scenario={scenario} compact /></Panel>
                  <Panel><PanelHeading eyebrow="D1 / SCENARIO DATA" title="Affected areas" action={<span className="count-pill">{areaCount} areas</span>} />{priorityAreas.length ? <div className="data-list">{priorityAreas.map((area) => <div className="data-row" key={area.id}><span className="data-marker" style={{ background: severityColors[area.severity] }} /><div className="data-info"><strong>{area.name}</strong><span>{formatNumber(area.population)} people · {area.location.lat.toFixed(3)}, {area.location.lng.toFixed(3)}</span></div><SeverityBadge severity={area.severity} /><span className="data-quantity">{area.demand} needed</span><button className="row-delete" disabled={pending} onClick={() => removeItem('areas', area.id)} aria-label={`Remove ${area.name}`}><Trash2 size={16} /></button></div>)}</div> : <EmptyState title="No areas yet" body="Use the form to add the first affected area." />}</Panel>
                  <Panel><PanelHeading eyebrow="D1 / RESOURCE DATA" title="Resource bases" action={<span className="count-pill">{baseCount} bases</span>} />{scenario.bases.length ? <div className="data-list">{scenario.bases.map((base) => <div className="data-row" key={base.id}><span className="data-marker data-marker--base"><Building2 size={15} /></span><div className="data-info"><strong>{base.name}</strong><span>{base.location.lat.toFixed(3)}, {base.location.lng.toFixed(3)}</span></div><span className="data-quantity">{base.quantity} available</span><button className="row-delete" disabled={pending} onClick={() => removeItem('bases', base.id)} aria-label={`Remove ${base.name}`}><Trash2 size={16} /></button></div>)}</div> : <EmptyState title="No bases yet" body="Use the form to add a resource base." />}</Panel>
                </div>
                <div className="scenario-forms">
                  <Panel><PanelHeading eyebrow="NEW" title="Create scenario" /><form onSubmit={addScenario} className="form-grid"><label>Scenario name<input required value={scenarioForm.name} onChange={(event) => setScenarioForm({ ...scenarioForm, name: event.target.value })} placeholder="e.g. District flood response" /></label><label>Region<input required value={scenarioForm.region} onChange={(event) => setScenarioForm({ ...scenarioForm, region: event.target.value })} placeholder="City, state" /></label><label>Description<textarea value={scenarioForm.description} onChange={(event) => setScenarioForm({ ...scenarioForm, description: event.target.value })} placeholder="Brief context for the scenario" rows={2} /></label><button className="primary-button" type="submit" disabled={pending}><Plus size={16} /> Create scenario</button></form></Panel>
                  <Panel><PanelHeading eyebrow="ADD TO CURRENT SCENARIO" title="Affected area" /><form onSubmit={addArea} className="form-grid"><label>Area name<input required value={areaForm.name} onChange={(event) => setAreaForm({ ...areaForm, name: event.target.value })} placeholder="Area or locality" /></label><div className="form-pair"><label>Population<input required type="number" min="0" step="1" value={areaForm.population} onChange={(event) => setAreaForm({ ...areaForm, population: event.target.value })} placeholder="0" /></label><label>Demand<input required type="number" min="0" step="1" value={areaForm.demand} onChange={(event) => setAreaForm({ ...areaForm, demand: event.target.value })} placeholder="Units" /></label></div><label>Severity<select value={areaForm.severity} onChange={(event) => setAreaForm({ ...areaForm, severity: event.target.value as Severity })}>{severityOrder.map((item) => <option key={item}>{item}</option>)}</select></label><div className="form-pair"><label>Latitude<input required type="number" min="-90" max="90" step="any" value={areaForm.lat} onChange={(event) => setAreaForm({ ...areaForm, lat: event.target.value })} placeholder="17.385" /></label><label>Longitude<input required type="number" min="-180" max="180" step="any" value={areaForm.lng} onChange={(event) => setAreaForm({ ...areaForm, lng: event.target.value })} placeholder="78.487" /></label></div><button className="secondary-button" type="submit" disabled={pending}><Plus size={16} /> Add area</button></form></Panel>
                  <Panel><PanelHeading eyebrow="ADD TO CURRENT SCENARIO" title="Resource base" /><form onSubmit={addBase} className="form-grid"><label>Base name<input required value={baseForm.name} onChange={(event) => setBaseForm({ ...baseForm, name: event.target.value })} placeholder="e.g. Central medical base" /></label><label>Available ambulances<input required type="number" min="0" step="1" value={baseForm.quantity} onChange={(event) => setBaseForm({ ...baseForm, quantity: event.target.value })} placeholder="0" /></label><div className="form-pair"><label>Latitude<input required type="number" min="-90" max="90" step="any" value={baseForm.lat} onChange={(event) => setBaseForm({ ...baseForm, lat: event.target.value })} placeholder="17.385" /></label><label>Longitude<input required type="number" min="-180" max="180" step="any" value={baseForm.lng} onChange={(event) => setBaseForm({ ...baseForm, lng: event.target.value })} placeholder="78.487" /></label></div><button className="secondary-button" type="submit" disabled={pending}><Plus size={16} /> Add base</button></form></Panel>
                  {legacyScenarios.length > 0 && <button className="secondary-button" disabled={pending} onClick={importScenarios}>Import custom browser scenarios</button>}
                  <button className="reset-button" disabled={pending} onClick={resetSamples}><RotateCcw size={15} /> Restore built-in samples</button>
                </div>
              </div>
            </>
          )}

          {view === 'allocations' && (
            <>
              <div className="run-toolbar"><div><div className="eyebrow">D3 / ALLOCATION RESULTS</div><h2>Run allocations</h2><p>Both methods use the current scenario and share a saved travel-time matrix.</p></div><div className="toolbar-actions"><button className="secondary-button" disabled={pending} onClick={() => runAllocation('baseline')}><Play size={15} /> Run baseline</button><button className="primary-button" disabled={pending} onClick={() => runAllocation('optimized')}><Play size={15} fill="currentColor" /> Run optimized</button></div></div>
              <div className="tabs" role="tablist" aria-label="Allocation method"><button role="tab" aria-selected={runTab === 'baseline'} className={runTab === 'baseline' ? 'tab--active' : ''} onClick={() => setRunTab('baseline')}>Baseline <span>{baseline ? 'Ready' : 'Not run'}</span></button><button role="tab" aria-selected={runTab === 'optimized'} className={runTab === 'optimized' ? 'tab--active' : ''} onClick={() => setRunTab('optimized')}>Optimized <span>{optimized ? 'Ready' : 'Not run'}</span></button></div>
              {selectedRun ? <>
                <div className="run-summary-grid"><StatCard label="Demand coverage" value={metricValue(selectedRun.metrics.coverageRatio, '%')} helper={`${demand - selectedRun.metrics.unmetDemand} of ${demand} units assigned`} icon={Activity} /><StatCard label="Avg. response" value={metricValue(selectedRun.metrics.averageResponseTime, 'min')} helper="Weighted by dispatched units" icon={Clock3} tone="blue" /><StatCard label="Unmet demand" value={String(selectedRun.metrics.unmetDemand)} helper="Units still needed" icon={CircleAlert} tone="coral" /><StatCard label="Resource use" value={metricValue(selectedRun.metrics.utilization, '%')} helper={`${supply} total units available`} icon={Building2} tone="gold" /></div>
                <RunDetails scenario={scenario} run={selectedRun} assignmentAction={
                  <button className="text-button" onClick={() => navigate('comparison')}>Compare methods <ArrowRight size={16} /></button>
                } />
              </> : <Panel><EmptyState title="No saved run yet" body="Add at least one area and base, then run the selected allocation method." action={<button className="primary-button" disabled={pending} onClick={() => runAllocation(runTab)}><Play size={16} /> Run allocation</button>} /></Panel>}
            </>
          )}

          {view === 'comparison' && (
            <>
              {baseline && optimized ? <>
                <div className="compare-intro"><div><div className="eyebrow">SAME SCENARIO · SHARED TRAVEL MATRIX</div><h2>Two plans, one clear comparison</h2><p>Review how the two methods allocate ambulances under the same conditions.</p></div><span className="compare-badge"><Check size={16} /> Both runs saved</span></div>
                <div className="compare-maps"><Panel><PanelHeading eyebrow="METHOD 01" title="Severity-first baseline" action={<span className="method-dot method-dot--blue" />} /><ScenarioMap scenario={scenario} assignments={baseline.assignments} compact /><div className="compare-map-foot"><strong>{metricValue(baseline.metrics.coverageRatio, '%')}</strong> coverage <span>{baseline.assignments.length} assignments</span></div></Panel><Panel><PanelHeading eyebrow="METHOD 02" title="Optimized" action={<span className="method-dot method-dot--teal" />} /><ScenarioMap scenario={scenario} assignments={optimized.assignments} compact /><div className="compare-map-foot"><strong>{metricValue(optimized.metrics.coverageRatio, '%')}</strong> coverage <span>{optimized.assignments.length} assignments</span></div></Panel></div>
                <Panel><PanelHeading eyebrow="SIDE-BY-SIDE ANALYSIS" title="Performance comparison" action={<span className="count-pill">{scenario.name}</span>} /><div className="table-scroll"><table className="comparison-table"><thead><tr><th>Metric</th><th>Baseline</th><th>Optimized</th><th>Difference</th><th>Better when</th></tr></thead><tbody>{metricDefinitions.map((metric) => { const before = baseline.metrics[metric.key]; const after = optimized.metrics[metric.key]; const difference = after - before; const improved = metric.better === 'lower' ? difference < -0.0001 : difference > 0.0001; return <tr key={metric.key}><td>{metric.label}</td><td>{metricValue(before, metric.unit)}</td><td><strong>{metricValue(after, metric.unit)}</strong></td><td><span className={`delta ${improved ? 'delta--good' : difference === 0 ? 'delta--neutral' : 'delta--bad'}`}>{difference > 0 ? '+' : ''}{metricValue(difference, metric.unit)}</span></td><td>{metric.better === 'lower' ? 'Lower' : 'Higher'}</td></tr> })}<tr><td>Allocation runtime</td><td>{formatNumber(baseline.runtimeMs, 2)} ms</td><td><strong>{formatNumber(optimized.runtimeMs, 2)} ms</strong></td><td>{formatNumber(optimized.runtimeMs - baseline.runtimeMs, 2)} ms</td><td>Lower</td></tr></tbody></table></div><div className="panel-footnote"><CircleAlert size={16} /> {baseline.usesFallback ? 'The shared matrix includes straight-line estimates.' : 'The shared matrix uses OSRM road estimates.'}</div></Panel>
              </> : <Panel><EmptyState title="Both allocation runs are needed" body={`Run the ${!baseline && !optimized ? 'baseline and optimized' : !baseline ? 'baseline' : 'optimized'} allocation to see a side-by-side comparison.`} action={<button className="primary-button" onClick={() => navigate('allocations')}>Go to allocations <ArrowRight size={16} /></button>} /></Panel>}
            </>
          )}

          {view === 'matrix' && <TravelMatrix key={`${scenario.id}:${scenario.revision}`} scenario={scenario} onAllocate={() => navigate('allocations')} />}
          {view === 'history' && <RunHistory key={scenario.id} scenario={scenario} onAllocate={() => navigate('allocations')} />}

          <footer className="page-footer"><span>DRRAS · Disaster Response Resource Allocation System</span><span>Simulated decision support prototype <ArrowUpRight size={13} /></span></footer>
        </div>
      </main>
    </div>
  )
}
