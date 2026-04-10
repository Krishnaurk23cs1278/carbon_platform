import pytest
from fastapi.testclient import TestClient
from main import app, calculate_carbon
from models import CarbonEntry

client = TestClient(app)

def test_calculate_carbon():
    entry = CarbonEntry(transport_km=10, electricity_kwh=10, fuel_liters=10)
    res = calculate_carbon(entry)
    expected = (10 * 0.2) + (10 * 0.4) + (10 * 2.3)
    assert res == expected

def test_health_check_via_docs():
    response = client.get("/docs")
    assert response.status_code == 200

# We skip DB specific tests to avoid requiring mongod for basic CI test step,
# or we use a mocked mongomock which isn't necessary for this demonstration scope.
