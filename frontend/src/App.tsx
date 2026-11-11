import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Building2, Check, ChevronDown, CircleAlert,
  Clock3, GitCompareArrows, LayoutDashboard, MapPin, MapPinned, Menu, Play,
  Plus, RotateCcw, Route, Trash2, X,
} from 'lucide-react'
import { sampleScenarios, severityColors, severityOrder } from './data'
import { createPreviewRun, previewTravelMinutes } from './demo'
import { ScenarioMap } from './ScenarioMap'
import type { AllocationRun, Area, Method, ResourceBase, Scenario, Severity } from './types'

type View = 'overview' | 'scenario' | 'allocations' | 'comparison'
type RunStore = Record<string, Partial<Record<Method, AllocationRun>>>

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'scenario', label: 'Scenario data', icon: MapPinned },
  { id: 'allocations', label: 'Allocations', icon: Route },
  { id: 'comparison', label: 'Compare results', icon: GitCompareArrows },
]

const metricDefinitions: { key: keyof AllocationRun['metrics']; label: string; unit: string; better: 'lower' | 'higher' }[] = [
  { key: 'averageResponseTime', label: 'Avg. response time', unit: 'min', better: 'lower' },
  { key: 'maxResponseTime', label: 'Max. response time', unit: 'min', better: 'lower' },
  { key: 'coverageRatio', label: 'Demand coverage', unit: '%', better: 'higher' },
  { key: 'unmetDemand', label: 'Unmet demand', unit: 'units', better: 'lower' },
  { key: 'utilization', label: 'Resource utilization', unit: '%', better: 'higher' },
  { key: 'totalTravelCost', label: 'Total travel cost', unit: 'unit-min', better: 'lower' },
]

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
}

function metricValue(value: number, unit: string) {
  if (unit === '%') return `${formatNumber(value * 100, 1)}%`
  return `${formatNumber(value, unit === 'min' ? 1 : 0)} ${unit}`
}

function loadScenarios(): Scenario[] {
  try {
    const stored = localStorage.getItem('drras-scenarios-v1')
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Scenario[]
    }
  } catch { /* use built-in samples */ }
  return sampleScenarios
}

function initialRuns(scenarios: Scenario[]): RunStore {
  return Object.fromEntries(scenarios.filter((scenario) => scenario.sample).map((scenario) => [
    scenario.id,
    { baseline: createPreviewRun(scenario, 'baseline'), optimized: createPreviewRun(scenario, 'optimized') },
  ]))
}

function fieldValid(value: number, min: number, max = Number.POSITIVE_INFINITY) {
  return Number.isFinite(value) && value >= min && value <= max
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>
}

function PanelHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>
      {action}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`severity-badge severity-badge--${severity.toLowerCase()}`}><span />{severity}</span>
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

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><CircleAlert size={24} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>(loadScenarios)
  const [selectedId, setSelectedId] = useState(() => loadScenarios()[0]?.id ?? '')
  const [runs, setRuns] = useState<RunStore>(() => initialRuns(loadScenarios()))
  const [view, setView] = useState<View>('overview')
  const [runTab, setRunTab] = useState<Method>('baseline')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [scenarioForm, setScenarioForm] = useState({ name: '', region: '', description: '' })
  const [areaForm, setAreaForm] = useState({ name: '', population: '', severity: 'High' as Severity, demand: '', lat: '', lng: '' })
  const [baseForm, setBaseForm] = useState({ name: '', quantity: '', lat: '', lng: '' })

  const scenario = scenarios.find((item) => item.id === selectedId) ?? scenarios[0]
  const currentRuns = scenario ? runs[scenario.id] ?? {} : {}
  const selectedRun = currentRuns[runTab]
  const areaCount = scenario?.areas.length ?? 0
  const baseCount = scenario?.bases.length ?? 0
  const demand = scenario?.areas.reduce((sum, area) => sum + area.demand, 0) ?? 0
  const supply = scenario?.bases.reduce((sum, base) => sum + base.quantity, 0) ?? 0
  const priorityAreas = useMemo(() => [...(scenario?.areas ?? [])].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)), [scenario])

  useEffect(() => {
    try { localStorage.setItem('drras-scenarios-v1', JSON.stringify(scenarios)) } catch { /* browser storage unavailable */ }
  }, [scenarios])

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

  function invalidateScenario(id: string) {
    setRuns((existing) => {
      const next = { ...existing }
      delete next[id]
      return next
    })
    setNotice('Scenario updated. Previous previews were cleared so both methods use the same data.')
  }

  function addScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = scenarioForm.name.trim()
    const region = scenarioForm.region.trim()
    if (!name || !region) return
    const next: Scenario = {
      id: newId(), name, region, description: scenarioForm.description.trim(),
      areas: [], bases: [], sample: false,
    }
    setScenarios((existing) => [...existing, next])
    setSelectedId(next.id)
    setScenarioForm({ name: '', region: '', description: '' })
    setNotice('Scenario created. Add affected areas and resource bases to begin.')
    navigate('scenario')
  }

  function addArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scenario) return
    const population = Number(areaForm.population)
    const quantity = Number(areaForm.demand)
    const lat = Number(areaForm.lat)
    const lng = Number(areaForm.lng)
    if (!fieldValid(population, 0) || !fieldValid(quantity, 0) || !fieldValid(lat, -90, 90) || !fieldValid(lng, -180, 180)
      || !Number.isInteger(population) || !Number.isInteger(quantity) || !areaForm.name.trim()) {
      setNotice('Enter a name, nonnegative whole numbers, and valid coordinates.')
      return
    }
    const area: Area = { id: newId(), name: areaForm.name.trim(), population, severity: areaForm.severity, demand: quantity, location: { lat, lng } }
    setScenarios((existing) => existing.map((item) => item.id === scenario.id ? { ...item, areas: [...item.areas, area] } : item))
    setAreaForm({ name: '', population: '', severity: 'High', demand: '', lat: '', lng: '' })
    invalidateScenario(scenario.id)
  }

  function addBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scenario) return
    const quantity = Number(baseForm.quantity)
    const lat = Number(baseForm.lat)
    const lng = Number(baseForm.lng)
    if (!fieldValid(quantity, 0) || !Number.isInteger(quantity) || !fieldValid(lat, -90, 90) || !fieldValid(lng, -180, 180) || !baseForm.name.trim()) {
      setNotice('Enter a name, nonnegative whole-number stock, and valid coordinates.')
      return
    }
    const base: ResourceBase = { id: newId(), name: baseForm.name.trim(), quantity, location: { lat, lng } }
    setScenarios((existing) => existing.map((item) => item.id === scenario.id ? { ...item, bases: [...item.bases, base] } : item))
    setBaseForm({ name: '', quantity: '', lat: '', lng: '' })
    invalidateScenario(scenario.id)
  }

  function removeItem(kind: 'area' | 'base', id: string) {
    if (!scenario) return
    setScenarios((existing) => existing.map((item) => item.id === scenario.id
      ? kind === 'area' ? { ...item, areas: item.areas.filter((area) => area.id !== id) } : { ...item, bases: item.bases.filter((base) => base.id !== id) }
      : item))
    invalidateScenario(scenario.id)
  }

  function runPreview(method: Method) {
    if (!scenario) return
    if (!areaCount || !baseCount) {
      setNotice('Add at least one affected area and one resource base first.')
      return
    }
    const result = createPreviewRun(scenario, method)
    setRuns((existing) => ({ ...existing, [scenario.id]: { ...existing[scenario.id], [method]: result } }))
    setRunTab(method)
    setNotice(`${method === 'baseline' ? 'Baseline' : 'Alternative'} preview ready. Synthetic travel times are used; no backend solver was called.`)
    navigate('allocations')
  }

  function resetSamples() {
    const customScenarios = scenarios.filter((item) => !item.sample)
    const sampleRuns = initialRuns(sampleScenarios)
    setScenarios([...sampleScenarios, ...customScenarios])
    setRuns((existing) => ({ ...existing, ...sampleRuns }))
    setSelectedId(sampleScenarios[0].id)
    setNotice('Built-in sample scenarios restored. Custom scenarios were kept.')
    navigate('overview')
  }

  if (!scenario) return <EmptyState title="No scenarios available" body="Refresh the page to load sample scenarios." />

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
          <div className="topbar-path"><span>Workspace</span><span className="path-separator">/</span><strong>{navItems.find((item) => item.id === view)?.label}</strong></div>
          <div className="topbar-right"><span className="topbar-status"><span className="live-dot" /> Demo mode</span><span className="avatar">CO</span></div>
        </header>

        <div className="page-content">
          {notice && <div className="toast" role="status"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}

          <div className="page-heading">
            <div>
              <div className="heading-eyebrow"><span className="eyebrow-line" /> DISASTER RESPONSE RESOURCE ALLOCATION</div>
              <h1>{view === 'overview' ? 'Situation overview' : view === 'scenario' ? 'Scenario data' : view === 'allocations' ? 'Allocation runs' : 'Compare results'}</h1>
              <p>{view === 'overview' ? 'A clear picture of needs, available resources, and suggested response.' : view === 'scenario' ? 'Build and review the inputs used by both allocation methods.' : view === 'allocations' ? 'Inspect assignments and performance for each method.' : 'Understand the trade-offs between two plans on identical inputs.'}</p>
            </div>
            <div className="heading-actions">
              <label className="scenario-select-wrap"><span className="sr-only">Select scenario</span><MapPin size={17} /><select value={scenario.id} onChange={(event) => setSelectedId(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></label>
            </div>
          </div>

          <div className="demo-banner"><CircleAlert size={18} /><span><strong>Illustrative preview.</strong> Travel times are synthetic; allocation previews are browser-generated. OSRM, the optimizer, and persistent backend are not connected.</span></div>

          {view === 'overview' && (
            <>
              <div className="stats-grid">
                <StatCard label="Affected areas" value={String(areaCount).padStart(2, '0')} helper="Across this scenario" icon={MapPin} tone="coral" />
                <StatCard label="Resource bases" value={String(baseCount).padStart(2, '0')} helper={`${formatNumber(supply)} ambulances available`} icon={Building2} tone="blue" />
                <StatCard label="Total demand" value={formatNumber(demand)} helper="Ambulance units needed" icon={Activity} tone="gold" />
                <StatCard label="Demand coverage" value={baseline ? `${formatNumber(baseline.metrics.coverageRatio * 100, 1)}%` : '—'} helper={baseline ? 'Baseline preview' : 'Run a baseline preview'} icon={ArrowUpRight} tone="teal" />
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
                <Panel className="action-panel"><div className="action-art"><Route size={30} /></div><div><div className="eyebrow">NEXT STEP</div><h2>Plan the response</h2><p>Preview the simple severity-first baseline, then review an alternative plan and compare their results.</p></div><div className="action-buttons"><button className="primary-button" onClick={() => runPreview('baseline')}><Play size={16} fill="currentColor" /> Run baseline</button><button className="secondary-button" onClick={() => runPreview('optimized')}>Alternative preview <ArrowRight size={16} /></button></div></Panel>
                <Panel className="capacity-panel"><PanelHeading eyebrow="CAPACITY SNAPSHOT" title="Supply vs. demand" /><div className="capacity-numbers"><div><strong>{formatNumber(supply)}</strong><span>Available</span></div><div><strong>{formatNumber(demand)}</strong><span>Needed</span></div></div><div className="capacity-bar"><span style={{ width: `${demand ? Math.min((supply / demand) * 100, 100) : 0}%` }} /></div><p>{supply >= demand ? 'Current stock can cover the listed demand in total.' : `${formatNumber(demand - supply)} more units are needed to fully meet demand.`}</p></Panel>
              </div>
            </>
          )}

          {view === 'scenario' && (
            <>
              <div className="scenario-layout">
                <div className="scenario-main">
                  <Panel><PanelHeading eyebrow="SCENARIO PROFILE" title={scenario.name} action={<span className="region-chip"><MapPin size={13} />{scenario.region}</span>} /><p className="scenario-description">{scenario.description || 'A custom disaster response scenario.'}</p><div className="scenario-facts"><span><MapPin size={17} />{areaCount} affected areas</span><span><Building2 size={17} />{baseCount} resource bases</span><span><Activity size={17} />{supply} available units</span></div><ScenarioMap scenario={scenario} compact /></Panel>
                  <Panel><PanelHeading eyebrow="D1 / SCENARIO DATA" title="Affected areas" action={<span className="count-pill">{areaCount} areas</span>} />{priorityAreas.length ? <div className="data-list">{priorityAreas.map((area) => <div className="data-row" key={area.id}><span className="data-marker" style={{ background: severityColors[area.severity] }} /><div className="data-info"><strong>{area.name}</strong><span>{formatNumber(area.population)} people · {area.location.lat.toFixed(3)}, {area.location.lng.toFixed(3)}</span></div><SeverityBadge severity={area.severity} /><span className="data-quantity">{area.demand} needed</span><button className="row-delete" onClick={() => removeItem('area', area.id)} aria-label={`Remove ${area.name}`}><Trash2 size={16} /></button></div>)}</div> : <EmptyState title="No areas yet" body="Use the form to add the first affected area." />}</Panel>
                  <Panel><PanelHeading eyebrow="D1 / RESOURCE DATA" title="Resource bases" action={<span className="count-pill">{baseCount} bases</span>} />{scenario.bases.length ? <div className="data-list">{scenario.bases.map((base) => <div className="data-row" key={base.id}><span className="data-marker data-marker--base"><Building2 size={15} /></span><div className="data-info"><strong>{base.name}</strong><span>{base.location.lat.toFixed(3)}, {base.location.lng.toFixed(3)}</span></div><span className="data-quantity">{base.quantity} available</span><button className="row-delete" onClick={() => removeItem('base', base.id)} aria-label={`Remove ${base.name}`}><Trash2 size={16} /></button></div>)}</div> : <EmptyState title="No bases yet" body="Use the form to add a resource base." />}</Panel>
                </div>
                <div className="scenario-forms">
                  <Panel><PanelHeading eyebrow="NEW" title="Create scenario" /><form onSubmit={addScenario} className="form-grid"><label>Scenario name<input required value={scenarioForm.name} onChange={(event) => setScenarioForm({ ...scenarioForm, name: event.target.value })} placeholder="e.g. District flood response" /></label><label>Region<input required value={scenarioForm.region} onChange={(event) => setScenarioForm({ ...scenarioForm, region: event.target.value })} placeholder="City, state" /></label><label>Description<textarea value={scenarioForm.description} onChange={(event) => setScenarioForm({ ...scenarioForm, description: event.target.value })} placeholder="Brief context for the scenario" rows={2} /></label><button className="primary-button" type="submit"><Plus size={16} /> Create scenario</button></form></Panel>
                  <Panel><PanelHeading eyebrow="ADD TO CURRENT SCENARIO" title="Affected area" /><form onSubmit={addArea} className="form-grid"><label>Area name<input required value={areaForm.name} onChange={(event) => setAreaForm({ ...areaForm, name: event.target.value })} placeholder="Area or locality" /></label><div className="form-pair"><label>Population<input required type="number" min="0" step="1" value={areaForm.population} onChange={(event) => setAreaForm({ ...areaForm, population: event.target.value })} placeholder="0" /></label><label>Demand<input required type="number" min="0" step="1" value={areaForm.demand} onChange={(event) => setAreaForm({ ...areaForm, demand: event.target.value })} placeholder="Units" /></label></div><label>Severity<select value={areaForm.severity} onChange={(event) => setAreaForm({ ...areaForm, severity: event.target.value as Severity })}>{severityOrder.map((item) => <option key={item}>{item}</option>)}</select></label><div className="form-pair"><label>Latitude<input required type="number" min="-90" max="90" step="any" value={areaForm.lat} onChange={(event) => setAreaForm({ ...areaForm, lat: event.target.value })} placeholder="17.385" /></label><label>Longitude<input required type="number" min="-180" max="180" step="any" value={areaForm.lng} onChange={(event) => setAreaForm({ ...areaForm, lng: event.target.value })} placeholder="78.487" /></label></div><button className="secondary-button" type="submit"><Plus size={16} /> Add area</button></form></Panel>
                  <Panel><PanelHeading eyebrow="ADD TO CURRENT SCENARIO" title="Resource base" /><form onSubmit={addBase} className="form-grid"><label>Base name<input required value={baseForm.name} onChange={(event) => setBaseForm({ ...baseForm, name: event.target.value })} placeholder="e.g. Central medical base" /></label><label>Available ambulances<input required type="number" min="0" step="1" value={baseForm.quantity} onChange={(event) => setBaseForm({ ...baseForm, quantity: event.target.value })} placeholder="0" /></label><div className="form-pair"><label>Latitude<input required type="number" min="-90" max="90" step="any" value={baseForm.lat} onChange={(event) => setBaseForm({ ...baseForm, lat: event.target.value })} placeholder="17.385" /></label><label>Longitude<input required type="number" min="-180" max="180" step="any" value={baseForm.lng} onChange={(event) => setBaseForm({ ...baseForm, lng: event.target.value })} placeholder="78.487" /></label></div><button className="secondary-button" type="submit"><Plus size={16} /> Add base</button></form></Panel>
                  <button className="reset-button" onClick={resetSamples}><RotateCcw size={15} /> Restore built-in samples</button>
                </div>
              </div>
            </>
          )}

          {view === 'allocations' && (
            <>
              <div className="run-toolbar"><div><div className="eyebrow">D3 / ALLOCATION RESULTS</div><h2>Run previews</h2><p>Both previews use the current scenario and the same synthetic travel estimates.</p></div><div className="toolbar-actions"><button className="secondary-button" onClick={() => runPreview('baseline')}><Play size={15} /> Run baseline</button><button className="primary-button" onClick={() => runPreview('optimized')}><Play size={15} fill="currentColor" /> Preview alternative</button></div></div>
              <div className="tabs" role="tablist" aria-label="Allocation method"><button role="tab" aria-selected={runTab === 'baseline'} className={runTab === 'baseline' ? 'tab--active' : ''} onClick={() => setRunTab('baseline')}>Baseline <span>{baseline ? 'Ready' : 'Not run'}</span></button><button role="tab" aria-selected={runTab === 'optimized'} className={runTab === 'optimized' ? 'tab--active' : ''} onClick={() => setRunTab('optimized')}>Alternative preview <span>{optimized ? 'Ready' : 'Not run'}</span></button></div>
              {selectedRun ? <>
                <div className="run-summary-grid"><StatCard label="Demand coverage" value={metricValue(selectedRun.metrics.coverageRatio, '%')} helper={`${demand - selectedRun.metrics.unmetDemand} of ${demand} units assigned`} icon={Activity} /><StatCard label="Avg. response" value={metricValue(selectedRun.metrics.averageResponseTime, 'min')} helper="Weighted by dispatched units" icon={Clock3} tone="blue" /><StatCard label="Unmet demand" value={String(selectedRun.metrics.unmetDemand)} helper="Units still needed" icon={CircleAlert} tone="coral" /><StatCard label="Resource use" value={metricValue(selectedRun.metrics.utilization, '%')} helper={`${supply} total units available`} icon={Building2} tone="gold" /></div>
                <div className="allocation-grid"><Panel><PanelHeading eyebrow={`${runTab.toUpperCase()} / MAP`} title="Assignment routes" action={<span className="count-pill">{selectedRun.assignments.length} routes</span>} /><ScenarioMap scenario={scenario} assignments={selectedRun.assignments} /><div className="map-legend"><span><i className="legend-route" /> Proposed route</span><span><i className="legend-base">✚</i> Resource base</span><span><i style={{ background: severityColors.Critical }} /> Affected area</span></div></Panel><Panel><PanelHeading eyebrow="RUN DETAILS" title="Performance metrics" /><div className="metric-list">{metricDefinitions.map((metric) => <div className="metric-line" key={metric.key}><span>{metric.label}</span><strong>{metricValue(selectedRun.metrics[metric.key], metric.unit)}</strong></div>)}<div className="metric-line"><span>Preview runtime</span><strong>{formatNumber(selectedRun.runtimeMs, 2)} ms</strong></div></div><div className="panel-footnote"><CircleAlert size={16} /> {runTab === 'optimized' ? 'This alternative is an illustrative nearest-pair plan, not an OR-Tools solution.' : 'This baseline uses a synthetic time estimate, not OSRM road travel time.'}</div></Panel></div>
                <Panel><PanelHeading eyebrow="BASE-TO-AREA PLAN" title="Assignments" action={<button className="text-button" onClick={() => navigate('comparison')}>Compare methods <ArrowRight size={16} /></button>} /><div className="table-scroll"><table><thead><tr><th>Resource base</th><th>Affected area</th><th>Severity</th><th>Travel estimate</th><th className="align-right">Units sent</th></tr></thead><tbody>{selectedRun.assignments.map((assignment) => { const base = scenario.bases.find((item) => item.id === assignment.baseId); const area = scenario.areas.find((item) => item.id === assignment.areaId); if (!base || !area) return null; return <tr key={`${assignment.baseId}-${assignment.areaId}`}><td><span className="table-base-dot" />{base.name}</td><td>{area.name}</td><td><SeverityBadge severity={area.severity} /></td><td>{formatNumber(previewTravelMinutes(base, area), 1)} min</td><td className="align-right"><strong>{assignment.quantity}</strong></td></tr> })}</tbody></table></div></Panel>
              </> : <Panel><EmptyState title="No run preview yet" body="Add at least one area and base, then run a preview. Both methods will use the same scenario data." action={<button className="primary-button" onClick={() => runPreview(runTab)}><Play size={16} /> Run preview</button>} /></Panel>}
            </>
          )}

          {view === 'comparison' && (
            <>
              {baseline && optimized ? <>
                <div className="compare-intro"><div><div className="eyebrow">SAME SCENARIO · SAME SYNTHETIC MATRIX</div><h2>Two plans, one clear comparison</h2><p>Compare illustrative browser previews before the real backend methods are connected.</p></div><span className="compare-badge"><Check size={16} /> Both previews ready</span></div>
                <div className="compare-maps"><Panel><PanelHeading eyebrow="METHOD 01" title="Severity-first baseline" action={<span className="method-dot method-dot--blue" />} /><ScenarioMap scenario={scenario} assignments={baseline.assignments} compact /><div className="compare-map-foot"><strong>{metricValue(baseline.metrics.coverageRatio, '%')}</strong> coverage <span>{baseline.assignments.length} routes</span></div></Panel><Panel><PanelHeading eyebrow="METHOD 02" title="Alternative preview" action={<span className="method-dot method-dot--teal" />} /><ScenarioMap scenario={scenario} assignments={optimized.assignments} compact /><div className="compare-map-foot"><strong>{metricValue(optimized.metrics.coverageRatio, '%')}</strong> coverage <span>{optimized.assignments.length} routes</span></div></Panel></div>
                <Panel><PanelHeading eyebrow="SIDE-BY-SIDE ANALYSIS" title="Performance comparison" action={<span className="count-pill">{scenario.name}</span>} /><div className="table-scroll"><table className="comparison-table"><thead><tr><th>Metric</th><th>Baseline</th><th>Alternative preview</th><th>Difference</th><th>Better when</th></tr></thead><tbody>{metricDefinitions.map((metric) => { const before = baseline.metrics[metric.key]; const after = optimized.metrics[metric.key]; const difference = after - before; const improved = metric.better === 'lower' ? difference < -0.0001 : difference > 0.0001; return <tr key={metric.key}><td>{metric.label}</td><td>{metricValue(before, metric.unit)}</td><td><strong>{metricValue(after, metric.unit)}</strong></td><td><span className={`delta ${improved ? 'delta--good' : difference === 0 ? 'delta--neutral' : 'delta--bad'}`}>{difference > 0 ? '+' : ''}{metricValue(difference, metric.unit)}</span></td><td>{metric.better === 'lower' ? 'Lower' : 'Higher'}</td></tr> })}<tr><td>Preview runtime</td><td>{formatNumber(baseline.runtimeMs, 2)} ms</td><td><strong>{formatNumber(optimized.runtimeMs, 2)} ms</strong></td><td>{formatNumber(optimized.runtimeMs - baseline.runtimeMs, 2)} ms</td><td>Lower</td></tr></tbody></table></div><div className="panel-footnote"><CircleAlert size={16} /> These figures evaluate illustrative browser plans, not the final OSRM/OR-Tools system.</div></Panel>
              </> : <Panel><EmptyState title="Both previews are needed" body={`Run the ${!baseline && !optimized ? 'baseline and alternative' : !baseline ? 'baseline' : 'alternative'} preview to see a side-by-side comparison.`} action={<button className="primary-button" onClick={() => navigate('allocations')}>Go to allocations <ArrowRight size={16} /></button>} /></Panel>}
            </>
          )}

          <footer className="page-footer"><span>DRRAS · Disaster Response Resource Allocation System</span><span>Simulated decision support prototype <ArrowUpRight size={13} /></span></footer>
        </div>
      </main>
    </div>
  )
}
