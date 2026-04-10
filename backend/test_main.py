import pytest
from fastapi.testclient import TestClient
from main import app, calculate_carbon
from models import CarbonEntry
from ai_module import CarbonAI

client = TestClient(app)

def test_calculate_carbon_car():
    entry = CarbonEntry(transport_mode="car", transport_km=10, electricity_kwh=10, food_diet="veg", waste_kg=5)
    res = calculate_carbon(entry)
    # car: 10*0.21=2.1, elec: 10*0.43=4.3, food: 1.5*3=4.5, waste: 5*0.1=0.5
    assert abs(res - 11.4) < 0.1

def test_calculate_carbon_bike():
    entry = CarbonEntry(transport_mode="bike", transport_km=20, electricity_kwh=0, food_diet="vegan", waste_kg=0)
    res = calculate_carbon(entry)
    # bike: 0, elec: 0, food: 1.0*3=3.0, waste: 0
    assert abs(res - 3.0) < 0.1

def test_calculate_carbon_flight():
    entry = CarbonEntry(transport_mode="flight", transport_km=500, electricity_kwh=5, food_diet="non_veg", waste_kg=2)
    res = calculate_carbon(entry)
    # flight: 500*0.255=127.5, elec: 5*0.43=2.15, food: 3.3*3=9.9, waste: 2*0.1=0.2
    assert res > 100

def test_ai_module_recommendations():
    ai = CarbonAI()
    recs = ai.get_recommendations({"transport_km": 100, "electricity_kwh": 30, "waste_kg": 8, "food_diet": "non_veg", "waste_recycled_pct": 10})
    assert len(recs) >= 3
    assert all("message" in r for r in recs)

def test_ai_module_green_score():
    ai = CarbonAI()
    score = ai.calculate_green_score([{"transport_km": 5, "electricity_kwh": 3, "food_diet": "vegan", "waste_kg": 1, "waste_recycled_pct": 80}])
    assert score > 50

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_docs_endpoint():
    response = client.get("/docs")
    assert response.status_code == 200
