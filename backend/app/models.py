from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Severity = Literal["Critical", "High", "Medium", "Low"]
Method = Literal["baseline", "optimized"]
NAME = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
UNITS = Annotated[int, Field(strict=True, ge=0, le=1_000_000)]
MAX_LOCATIONS_PER_KIND = 40


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Coordinates(Input):
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)


class NewScenario(Input):
    name: NAME
    region: NAME
    description: str = Field(default="", max_length=2000)


class NewArea(Input):
    name: NAME
    location: Coordinates
    population: int = Field(strict=True, ge=0, le=2_147_483_647)
    severity: Severity
    demand: UNITS


class NewBase(Input):
    name: NAME
    location: Coordinates
    quantity: UNITS


class ImportScenario(NewScenario):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    areas: list[NewArea] = Field(max_length=MAX_LOCATIONS_PER_KIND)
    bases: list[NewBase] = Field(max_length=MAX_LOCATIONS_PER_KIND)
