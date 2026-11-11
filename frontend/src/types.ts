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
}

export interface Assignment {
  baseId: string
  areaId: string
  quantity: number
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
  illustrative: boolean
}
