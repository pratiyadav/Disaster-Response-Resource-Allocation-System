CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE scenarios (
    id text PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    region text NOT NULL CHECK (length(btrim(region)) > 0),
    description text NOT NULL DEFAULT '',
    sample boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE areas (
    scenario_id text NOT NULL REFERENCES scenarios(id),
    id text NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    location geometry(Point, 4326) NOT NULL
        CHECK (ST_X(location) BETWEEN -180 AND 180 AND ST_Y(location) BETWEEN -90 AND 90),
    population integer NOT NULL CHECK (population >= 0),
    severity text NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
    demand integer NOT NULL CHECK (demand >= 0),
    active boolean NOT NULL DEFAULT true,
    PRIMARY KEY (scenario_id, id)
);

CREATE TABLE resource_bases (
    scenario_id text NOT NULL REFERENCES scenarios(id),
    id text NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    location geometry(Point, 4326) NOT NULL
        CHECK (ST_X(location) BETWEEN -180 AND 180 AND ST_Y(location) BETWEEN -90 AND 90),
    active boolean NOT NULL DEFAULT true,
    PRIMARY KEY (scenario_id, id)
);

CREATE TABLE resources (
    scenario_id text NOT NULL,
    base_id text NOT NULL,
    resource_type text NOT NULL CHECK (resource_type = 'ambulance'),
    quantity integer NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (scenario_id, base_id, resource_type),
    FOREIGN KEY (scenario_id, base_id) REFERENCES resource_bases(scenario_id, id)
);

CREATE TABLE travel_matrix (
    scenario_id text NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    base_id text NOT NULL,
    area_id text NOT NULL,
    seconds integer NOT NULL CHECK (seconds >= 0),
    distance_meters double precision NOT NULL CHECK (distance_meters >= 0),
    is_fallback boolean NOT NULL,
    PRIMARY KEY (scenario_id, revision, base_id, area_id),
    FOREIGN KEY (scenario_id, base_id) REFERENCES resource_bases(scenario_id, id),
    FOREIGN KEY (scenario_id, area_id) REFERENCES areas(scenario_id, id)
);

CREATE TABLE runs (
    id text PRIMARY KEY,
    scenario_id text NOT NULL REFERENCES scenarios(id),
    revision integer NOT NULL CHECK (revision > 0),
    method text NOT NULL CHECK (method IN ('baseline', 'optimized')),
    runtime_ms double precision NOT NULL CHECK (runtime_ms >= 0),
    scenario_snapshot jsonb NOT NULL,
    settings jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (id, scenario_id, revision)
);

CREATE INDEX runs_by_scenario_revision ON runs (scenario_id, revision, method, created_at DESC);

CREATE TABLE allocations (
    run_id text NOT NULL,
    scenario_id text NOT NULL,
    revision integer NOT NULL,
    base_id text NOT NULL,
    area_id text NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (run_id, base_id, area_id),
    FOREIGN KEY (run_id, scenario_id, revision) REFERENCES runs(id, scenario_id, revision),
    FOREIGN KEY (scenario_id, revision, base_id, area_id)
        REFERENCES travel_matrix(scenario_id, revision, base_id, area_id)
);

CREATE TABLE metrics (
    run_id text PRIMARY KEY REFERENCES runs(id),
    average_response_time double precision NOT NULL CHECK (average_response_time >= 0),
    max_response_time double precision NOT NULL CHECK (max_response_time >= 0),
    coverage_ratio double precision NOT NULL CHECK (coverage_ratio BETWEEN 0 AND 1),
    unmet_demand integer NOT NULL CHECK (unmet_demand >= 0),
    utilization double precision NOT NULL CHECK (utilization BETWEEN 0 AND 1),
    total_travel_cost double precision NOT NULL CHECK (total_travel_cost >= 0)
);
