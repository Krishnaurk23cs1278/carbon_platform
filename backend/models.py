from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ── Auth Models ──
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    eco_score: int
    green_score: float
    role: str

class Token(BaseModel):
    access_token: str
    token_type: str

# ── Carbon Entry (Multi-Source Tracking) ──
class CarbonEntry(BaseModel):
    # Transport
    transport_mode: str       # "car", "public", "bike", "flight", "ev"
    transport_km: float
    # Electricity
    electricity_kwh: float
    # Food
    food_diet: str            # "veg", "non_veg", "vegan"
    food_meals: int = 3       # meals per day
    # Industrial / Device
    industrial_hours: float = 0.0   # hours of heavy device usage
    # Waste
    waste_kg: float
    waste_recycled_pct: float = 0.0  # percent recycled (0-100)
    # Geo location (optional)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    timestamp: Optional[datetime] = None

class CarbonResponse(BaseModel):
    id: str
    user_id: str
    transport_mode: str
    transport_km: float
    electricity_kwh: float
    food_diet: str
    food_meals: int
    industrial_hours: float
    waste_kg: float
    waste_recycled_pct: float
    total_carbon_kg: float
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    timestamp: datetime

# ── IoT Sensor Data ──
class IoTSensorData(BaseModel):
    device_id: str
    sensor_type: str          # "power", "gas", "temperature", "humidity"
    value: float
    unit: str                 # "kWh", "ppm", "celsius", "%"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timestamp: Optional[datetime] = None

# ── Alert Thresholds ──
class AlertThreshold(BaseModel):
    metric: str               # "daily_carbon", "electricity", "transport"
    threshold_value: float
    alert_type: str = "warning"  # "warning", "critical"

class AlertResponse(BaseModel):
    id: str
    user_id: str
    message: str
    alert_type: str
    triggered_value: float
    threshold_value: float
    is_read: bool
    timestamp: datetime
