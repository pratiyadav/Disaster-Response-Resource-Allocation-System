import logging
from dataclasses import dataclass
from math import asin, cos, isfinite, radians, sin, sqrt

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Travel:
    seconds: int
    distance_meters: float
    is_fallback: bool


def straight_line(base: dict, area: dict, speed_kmh: float) -> Travel:
    lat1, lat2 = radians(base["lat"]), radians(area["lat"])
    delta_lng = radians(area["lng"] - base["lng"])
    arc = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lng / 2) ** 2
    meters = 2 * 6_371_000 * asin(sqrt(min(1.0, max(0.0, arc))))
    return Travel(round(meters * 3.6 / speed_kmh), meters, True)


def table_value(table: object, row: int, column: int) -> float | None:
    if not isinstance(table, list) or row >= len(table):
        return None
    values = table[row]
    if not isinstance(values, list) or column >= len(values):
        return None
    value = values[column]
    if type(value) in (int, float) and isfinite(value) and 0 <= value <= 100_000_000:
        return value
    return None


def build_matrix(scenario: dict, url: str, speed_kmh: float) -> dict[tuple[str, str], Travel]:
    bases, areas = scenario["bases"], scenario["areas"]
    durations, distances = None, None
    if url:
        coords = ";".join(
            f'{item["location"]["lng"]:.7f},{item["location"]["lat"]:.7f}'
            for item in [*bases, *areas]
        )
        try:
            response = httpx.get(
                f"{url.rstrip('/')}/table/v1/driving/{coords}",
                params={
                    "sources": ";".join(map(str, range(len(bases)))),
                    "destinations": ";".join(map(str, range(len(bases), len(bases) + len(areas)))),
                    "annotations": "duration,distance",
                },
                headers={"User-Agent": "DRRAS-coursework/1.0"},
                timeout=5.0,
            )
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict) and data.get("code") == "Ok":
                durations, distances = data.get("durations"), data.get("distances")
        except (httpx.HTTPError, ValueError) as error:
            logger.warning("OSRM table unavailable (%s); using straight-line estimates", type(error).__name__)

    matrix = {}
    for row, base in enumerate(bases):
        for column, area in enumerate(areas):
            seconds = table_value(durations, row, column)
            meters = table_value(distances, row, column)
            matrix[base["id"], area["id"]] = (
                Travel(round(seconds), meters, False)
                if seconds is not None and meters is not None
                else straight_line(base["location"], area["location"], speed_kmh)
            )
    return matrix
