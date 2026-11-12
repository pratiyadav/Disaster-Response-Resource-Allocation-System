from pathlib import Path
from uuid import uuid4

from psycopg import Connection
from psycopg.types.json import Jsonb

from .routing import Travel

SCENARIO_QUERY = """
    SELECT s.id, s.name, s.region, s.description, s.sample, s.revision,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', a.id, 'name', a.name, 'population', a.population,
            'severity', a.severity, 'demand', a.demand,
            'location', jsonb_build_object('lat', ST_Y(a.location), 'lng', ST_X(a.location))
        ) ORDER BY a.id) FROM areas a WHERE a.scenario_id = s.id AND a.active), '[]') AS areas,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', b.id, 'name', b.name, 'quantity', r.quantity,
            'location', jsonb_build_object('lat', ST_Y(b.location), 'lng', ST_X(b.location))
        ) ORDER BY b.id) FROM resource_bases b JOIN resources r
            ON (r.scenario_id, r.base_id) = (b.scenario_id, b.id)
            WHERE b.scenario_id = s.id AND b.active), '[]') AS bases
    FROM scenarios s
"""

RUN_QUERY = """
    SELECT r.id, r.scenario_id AS "scenarioId", r.revision, r.method,
        r.runtime_ms AS "runtimeMs", r.created_at AS "createdAt", r.settings,
        jsonb_build_object(
            'averageResponseTime', m.average_response_time,
            'maxResponseTime', m.max_response_time, 'coverageRatio', m.coverage_ratio,
            'unmetDemand', m.unmet_demand, 'utilization', m.utilization,
            'totalTravelCost', m.total_travel_cost
        ) AS metrics,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'baseId', a.base_id, 'areaId', a.area_id, 'quantity', a.quantity,
            'travelMinutes', t.seconds / 60.0, 'isFallback', t.is_fallback
        ) ORDER BY a.area_id, a.base_id)
            FROM allocations a JOIN travel_matrix t USING (scenario_id, revision, base_id, area_id)
            WHERE a.run_id = r.id), '[]') AS assignments,
        EXISTS (SELECT 1 FROM travel_matrix t
            WHERE t.scenario_id = r.scenario_id AND t.revision = r.revision AND t.is_fallback) AS "usesFallback"
    FROM runs r JOIN metrics m ON m.run_id = r.id
"""


def migrate(db: Connection) -> None:
    db.execute("SELECT pg_advisory_xact_lock(734912)")
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)")
    directory = Path(__file__).resolve().parents[1] / "migrations"
    for file in sorted(directory.glob("*.sql")):
        applied = db.execute("SELECT 1 FROM schema_migrations WHERE version = %s", (file.name,)).fetchone()
        if not applied:
            db.execute(file.read_text(), prepare=False)
            db.execute("INSERT INTO schema_migrations VALUES (%s)", (file.name,))


def list_scenarios(db: Connection) -> list[dict]:
    return db.execute(SCENARIO_QUERY + " ORDER BY s.sample DESC, s.created_at, s.id").fetchall()


def get_scenario(db: Connection, scenario_id: str) -> dict | None:
    return db.execute(SCENARIO_QUERY + " WHERE s.id = %s", (scenario_id,)).fetchone()


def create_scenario(db: Connection, scenario_id: str, fields: dict, sample: bool = False) -> bool:
    cursor = db.execute(
        """
        INSERT INTO scenarios (id, name, region, description, sample)
        VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING
        """,
        (scenario_id, fields["name"], fields["region"], fields["description"], sample),
    )
    return cursor.rowcount == 1


def add_area(db: Connection, scenario_id: str, area: dict, area_id: str) -> None:
    db.execute(
        """
        INSERT INTO areas (scenario_id, id, name, location, population, severity, demand)
        VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s)
        ON CONFLICT (scenario_id, id) DO UPDATE SET
            name = excluded.name, location = excluded.location, population = excluded.population,
            severity = excluded.severity, demand = excluded.demand, active = true
        """,
        (scenario_id, area_id, area["name"], area["location"]["lng"], area["location"]["lat"],
         area["population"], area["severity"], area["demand"]),
    )


def add_base(db: Connection, scenario_id: str, base: dict, base_id: str) -> None:
    db.execute(
        """
        INSERT INTO resource_bases (scenario_id, id, name, location)
        VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
        ON CONFLICT (scenario_id, id) DO UPDATE SET
            name = excluded.name, location = excluded.location, active = true
        """,
        (scenario_id, base_id, base["name"], base["location"]["lng"], base["location"]["lat"]),
    )
    db.execute(
        """
        INSERT INTO resources (scenario_id, base_id, resource_type, quantity)
        VALUES (%s, %s, 'ambulance', %s)
        ON CONFLICT (scenario_id, base_id, resource_type) DO UPDATE SET quantity = excluded.quantity
        """,
        (scenario_id, base_id, base["quantity"]),
    )


def remove_location(db: Connection, scenario_id: str, location_id: str, kind: str) -> bool:
    query = (
        "UPDATE areas SET active = false WHERE scenario_id = %s AND id = %s AND active"
        if kind == "areas"
        else "UPDATE resource_bases SET active = false WHERE scenario_id = %s AND id = %s AND active"
    )
    return db.execute(query, (scenario_id, location_id)).rowcount == 1


def bump_revision(db: Connection, scenario_id: str) -> None:
    db.execute("UPDATE scenarios SET revision = revision + 1 WHERE id = %s", (scenario_id,))


def seed_samples(db: Connection, samples: list[dict], *, restore: bool = False) -> None:
    for sample in samples:
        scenario_id = sample["id"]
        created = create_scenario(db, scenario_id, sample, sample=True)
        if not created and not restore:
            continue
        if not created:
            bump_revision(db, scenario_id)
            db.execute("UPDATE areas SET active = false WHERE scenario_id = %s AND active", (scenario_id,))
            db.execute("UPDATE resource_bases SET active = false WHERE scenario_id = %s AND active", (scenario_id,))
        for area in sample["areas"]:
            add_area(db, scenario_id, area, area["id"])
        for base in sample["bases"]:
            add_base(db, scenario_id, base, base["id"])


def load_matrix(db: Connection, scenario_id: str, revision: int) -> dict:
    rows = db.execute(
        """
        SELECT base_id, area_id, seconds, distance_meters, is_fallback
        FROM travel_matrix WHERE scenario_id = %s AND revision = %s
        ORDER BY base_id, area_id
        """,
        (scenario_id, revision),
    )
    return {
        (row["base_id"], row["area_id"]): Travel(row["seconds"], row["distance_meters"], row["is_fallback"])
        for row in rows
    }


def save_matrix(db: Connection, scenario: dict, matrix: dict) -> None:
    with db.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO travel_matrix (scenario_id, revision, base_id, area_id, seconds, distance_meters, is_fallback)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (scenario["id"], scenario["revision"], base, area, travel.seconds,
                 travel.distance_meters, travel.is_fallback)
                for (base, area), travel in matrix.items()
            ],
        )


def save_run(db: Connection, scenario: dict, method: str, runtime: float,
             assignments: list, metrics: dict, settings: dict) -> dict:
    run_id = str(uuid4())
    key = (run_id, scenario["id"], scenario["revision"])
    db.execute(
        """
        INSERT INTO runs (id, scenario_id, revision, method, runtime_ms, scenario_snapshot, settings)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (*key, method, runtime, Jsonb(scenario), Jsonb(settings)),
    )
    with db.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO allocations (run_id, scenario_id, revision, base_id, area_id, quantity)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            [(*key, *assignment) for assignment in assignments],
        )
    db.execute(
        """
        INSERT INTO metrics (run_id, average_response_time, max_response_time, coverage_ratio,
                             unmet_demand, utilization, total_travel_cost)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (run_id, metrics["averageResponseTime"], metrics["maxResponseTime"], metrics["coverageRatio"],
         metrics["unmetDemand"], metrics["utilization"], metrics["totalTravelCost"]),
    )
    return db.execute(RUN_QUERY + " WHERE r.id = %s", (run_id,)).fetchone()


def current_runs(db: Connection, scenario_id: str, revision: int) -> dict:
    rows = db.execute(
        "SELECT DISTINCT ON (saved.method) * FROM (" + RUN_QUERY + """
            WHERE r.scenario_id = %s AND r.revision = %s
        ) saved ORDER BY saved.method, saved."createdAt" DESC, saved.id DESC
        """,
        (scenario_id, revision),
    )
    return {row["method"]: row for row in rows}


def history(db: Connection, scenario_id: str, limit: int, offset: int) -> list[dict]:
    return db.execute(
        """
        SELECT id, method, revision, created_at AS "createdAt", runtime_ms AS "runtimeMs"
        FROM runs WHERE scenario_id = %s ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s
        """,
        (scenario_id, limit, offset),
    ).fetchall()


def get_run(db: Connection, scenario_id: str, run_id: str) -> dict | None:
    return db.execute(
        "SELECT details.*, snapshot.scenario_snapshot AS scenario FROM (" + RUN_QUERY + """
            WHERE r.scenario_id = %s AND r.id = %s
        ) details JOIN runs snapshot ON snapshot.id = details.id
        """,
        (scenario_id, run_id),
    ).fetchone()
