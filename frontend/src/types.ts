export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
export type Method = 'baseline' | 'optimized'

export interface Coordinates {
  lat: number
  lng: number
}

export interface Area {
  id: string
  name: string
  location: Coordinates
  population: number
  severity: Severity
  demand: number
}

export interface ResourceBase {
  id: string
  name: string
  location: Coordinates
  quantity: number
}

export interface Scenario {
  id: string
  name: string
  region: string
  description: string
  areas: Area[]
  bases: ResourceBase[]
  sample: boolean
  revision: number
}

export interface Assignment {
  baseId: string
  areaId: string
  quantity: number
  travelMinutes: number
  isFallback: boolean
}

export interface Metrics {
  averageResponseTime: number
  maxResponseTime: number
  coverageRatio: number
  unmetDemand: number
  utilization: number
  totalTravelCost: number
}

export interface AllocationRun {
  id: string
  scenarioId: string
  method: Method
  assignments: Assignment[]
  metrics: Metrics
  runtimeMs: number
  createdAt: string
  revision: number
  usesFallback: boolean
}

export type RunSummary = Pick<AllocationRun, 'id' | 'method' | 'revision' | 'createdAt' | 'runtimeMs'>

export interface SavedRun extends AllocationRun {
  scenario: Scenario
}

export interface TravelMatrixData {
  revision: number
  pairs: {
    baseId: string
    areaId: string
    seconds: number
    distanceMeters: number
    isFallback: boolean
  }[]
}
