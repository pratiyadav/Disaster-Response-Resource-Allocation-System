import type { AllocationRun, Area, Method, ResourceBase, RunSummary, SavedRun, Scenario, TravelMatrixData } from './types'

export type RunSet = {
  revision: number
  runs: Partial<Record<Method, AllocationRun>>
}

type ScenarioFields = Pick<Scenario, 'name' | 'region' | 'description'>

async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method, signal,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Could not reach the DRRAS API. Check that the backend is running.')
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    if (typeof data.detail === 'string') throw new Error(data.detail)
    if (Array.isArray(data.detail)) {
      throw new Error(data.detail.map((item: { loc: (string | number)[]; msg: string }) => `${item.loc.slice(1).join('.')}: ${item.msg}`).join(' · '))
    }
    throw new Error(`The DRRAS API returned HTTP ${response.status}.`)
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The DRRAS API did not return JSON. Check the API proxy configuration.')
  }
  return response.json()
}

const scenarioPath = (id: string) => `/scenarios/${encodeURIComponent(id)}`

export const api = {
  scenarios: (signal?: AbortSignal) => request<Scenario[]>('/scenarios', 'GET', undefined, signal),
  scenario: (id: string, signal?: AbortSignal) => request<Scenario>(scenarioPath(id), 'GET', undefined, signal),
  createScenario: (body: ScenarioFields) => request<Scenario>('/scenarios', 'POST', body),
  addArea: (id: string, body: Omit<Area, 'id'>) =>
    request<Scenario>(`${scenarioPath(id)}/areas`, 'POST', body),
  addBase: (id: string, body: Omit<ResourceBase, 'id'>) =>
    request<Scenario>(`${scenarioPath(id)}/bases`, 'POST', body),
  removeLocation: (id: string, kind: 'areas' | 'bases', locationId: string) =>
    request<Scenario>(`${scenarioPath(id)}/${kind}/${encodeURIComponent(locationId)}`, 'DELETE'),
  restoreSamples: () => request<Scenario[]>('/scenarios/restore-samples', 'POST'),
  importScenario: ({ id, name, region, description, areas, bases }: Scenario) =>
    request<Scenario>('/scenarios/import', 'POST', {
      id, name, region, description,
      areas: areas.map(({ id: _id, ...area }) => area),
      bases: bases.map(({ id: _id, ...base }) => base),
    }),
  runs: (id: string, signal?: AbortSignal) =>
    request<RunSet>(`${scenarioPath(id)}/runs`, 'GET', undefined, signal),
  runHistory: (id: string, limit: number, offset: number, signal: AbortSignal) =>
    request<RunSummary[]>(`${scenarioPath(id)}/runs/history?limit=${limit}&offset=${offset}`, 'GET', undefined, signal),
  savedRun: (id: string, runId: string, signal: AbortSignal) =>
    request<SavedRun>(`${scenarioPath(id)}/runs/${encodeURIComponent(runId)}`, 'GET', undefined, signal),
  travelMatrix: (id: string, revision: number, signal: AbortSignal) =>
    request<TravelMatrixData>(`${scenarioPath(id)}/matrix?revision=${revision}`, 'GET', undefined, signal),
  run: (id: string, method: Method) =>
    request<AllocationRun>(`${scenarioPath(id)}/runs/${method}`, 'POST'),
}

export function browserScenarios(): Scenario[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('drras-scenarios-v1') ?? '[]')
    if (Array.isArray(saved)) {
      return saved.filter((item) => item?.sample === false && typeof item.id === 'string'
        && Array.isArray(item.areas) && Array.isArray(item.bases))
    }
  } catch {
    // The previous prototype's browser data may be unavailable.
  }
  return []
}
