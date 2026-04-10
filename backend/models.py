from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CarbonEntry(BaseModel):
    transport_km: float
    electricity_kwh: float
    fuel_liters: float
    timestamp: Optional[datetime] = None

class CarbonResponse(BaseModel):
    id: str
    transport_km: float
    electricity_kwh: float
    fuel_liters: float
    total_carbon_kg: float
    timestamp: datetime
