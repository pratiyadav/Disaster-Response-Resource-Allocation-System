from collections import Counter

from ortools.graph.python.min_cost_flow import SimpleMinCostFlow

from .routing import Travel

PRIORITY = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
Assignment = tuple[str, str, int]
Matrix = dict[tuple[str, str], Travel]


class AllocationError(Exception):
    pass


def baseline(scenario: dict, matrix: Matrix) -> list[Assignment]:
    stock = {base["id"]: base["quantity"] for base in scenario["bases"]}
    assignments = []
    for area in sorted(scenario["areas"], key=lambda area: (PRIORITY[area["severity"]], area["id"])):
        area_id, needed = area["id"], area["demand"]
        for base_id in sorted(stock, key=lambda base_id: (matrix[base_id, area_id].seconds, base_id)):
            quantity = min(needed, stock[base_id])
            if quantity:
                assignments.append((base_id, area_id, quantity))
                stock[base_id] -= quantity
                needed -= quantity
            if needed == 0:
                break
    return assignments


def optimized(scenario: dict, matrix: Matrix, penalty_seconds: int) -> list[Assignment]:
    """Route total demand through real bases or a per-unit unmet-demand arc."""
    solver = SimpleMinCostFlow()
    bases, areas = scenario["bases"], scenario["areas"]
    source = 0
    total_demand = sum(area["demand"] for area in areas)
    for base_node, base in enumerate(bases, start=1):
        solver.add_arc_with_capacity_and_unit_cost(source, base_node, base["quantity"], 0)

    assignment_arcs = []
    for area_node, area in enumerate(areas, start=len(bases) + 1):
        area_id = area["id"]
        solver.set_node_supply(area_node, -area["demand"])
        solver.add_arc_with_capacity_and_unit_cost(source, area_node, area["demand"], penalty_seconds)
        for base_node, base in enumerate(bases, start=1):
            base_id = base["id"]
            arc = solver.add_arc_with_capacity_and_unit_cost(
                base_node, area_node, area["demand"], matrix[base_id, area_id].seconds
            )
            assignment_arcs.append((arc, base_id, area_id))

    solver.set_node_supply(source, total_demand)
    status = solver.solve()
    if status != solver.OPTIMAL:
        raise AllocationError(f"The optimizer could not produce a valid plan ({status.name}).")
    assignments = []
    for arc, base_id, area_id in assignment_arcs:
        quantity = solver.flow(arc)
        if quantity:
            assignments.append((base_id, area_id, quantity))
    return assignments


def validate_assignments(scenario: dict, matrix: Matrix, assignments: list[Assignment]) -> None:
    sent, received = Counter(), Counter()
    seen = set()
    for base_id, area_id, quantity in assignments:
        pair = (base_id, area_id)
        if pair not in matrix or pair in seen or type(quantity) is not int or quantity <= 0:
            raise AllocationError("The plan contains an invalid assignment.")
        seen.add(pair)
        sent[base_id] += quantity
        received[area_id] += quantity
    if any(sent[base["id"]] > base["quantity"] for base in scenario["bases"]):
        raise AllocationError("The plan exceeds the stock of a resource base.")
    if any(received[area["id"]] > area["demand"] for area in scenario["areas"]):
        raise AllocationError("The plan exceeds the demand of an affected area.")


def metrics(scenario: dict, matrix: Matrix, assignments: list[Assignment]) -> dict:
    demand = sum(area["demand"] for area in scenario["areas"])
    stock = sum(base["quantity"] for base in scenario["bases"])
    sent = sum(quantity for _, _, quantity in assignments)
    unit_minutes = sum(matrix[base, area].seconds * quantity for base, area, quantity in assignments) / 60
    return {
        "averageResponseTime": unit_minutes / sent if sent else 0,
        "maxResponseTime": max((matrix[base, area].seconds for base, area, _ in assignments), default=0) / 60,
        "coverageRatio": sent / demand if demand else 0,
        "unmetDemand": demand - sent,
        "utilization": sent / stock if stock else 0,
        "totalTravelCost": unit_minutes,
    }
