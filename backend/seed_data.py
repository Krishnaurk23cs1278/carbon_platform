"""
Seed script: Populates MongoDB with realistic demo data for the Carbon Intelligence Platform.
Run: python seed_data.py
"""
import asyncio
import random
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MONGO_URI = "mongodb://localhost:27017"

USERS = [
    {"username": "raghu", "email": "raghu@carbon.io", "password": "pass123", "role": "admin"},
    {"username": "priya_green", "email": "priya@carbon.io", "password": "pass123", "role": "user"},
    {"username": "arjun_eco", "email": "arjun@carbon.io", "password": "pass123", "role": "user"},
    {"username": "sneha_planet", "email": "sneha@carbon.io", "password": "pass123", "role": "user"},
    {"username": "vikram_sustain", "email": "vikram@carbon.io", "password": "pass123", "role": "user"},
]

TRANSPORT_MODES = ["car", "public", "bike", "flight", "ev"]
FOOD_DIETS = ["veg", "non_veg", "vegan"]
CITIES = [
    {"city": "Chennai", "lat": 13.0827, "lng": 80.2707},
    {"city": "Bangalore", "lat": 12.9716, "lng": 77.5946},
    {"city": "Mumbai", "lat": 19.0760, "lng": 72.8777},
    {"city": "Delhi", "lat": 28.7041, "lng": 77.1025},
    {"city": "Hyderabad", "lat": 17.3850, "lng": 78.4867},
]

EMISSION_FACTORS = {
    "car": 0.21, "flight": 0.255, "public": 0.05, "bike": 0.0, "ev": 0.05,
    "electricity": 0.43,
    "food_vegan": 1.0, "food_veg": 1.5, "food_non_veg": 3.3,
    "waste": 0.1, "industrial": 1.8,
}

def calc_carbon(entry):
    transport = entry["transport_km"] * EMISSION_FACTORS.get(entry["transport_mode"], 0.2)
    electricity = entry["electricity_kwh"] * EMISSION_FACTORS["electricity"]
    food = EMISSION_FACTORS.get(f"food_{entry['food_diet']}", 1.5) * entry["food_meals"]
    waste = entry["waste_kg"] * EMISSION_FACTORS["waste"] * (1 - entry["waste_recycled_pct"] / 100 * 0.5)
    industrial = entry["industrial_hours"] * EMISSION_FACTORS["industrial"]
    return round(transport + electricity + food + waste + industrial, 2)

async def seed():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.carbon_db

    # Clear existing data
    await db.users.drop()
    await db.carbon_entries.drop()
    await db.alerts.drop()
    await db.iot_data.drop()
    print("🗑️  Cleared existing data")

    # Create users
    user_ids = []
    for u in USERS:
        doc = {
            "username": u["username"],
            "email": u["email"],
            "hashed_password": pwd_context.hash(u["password"]),
            "eco_score": random.randint(80, 150),
            "green_score": round(random.uniform(40, 85), 1),
            "role": u["role"],
            "created_at": datetime.utcnow() - timedelta(days=random.randint(10, 60)),
            "alert_thresholds": [
                {"metric": "daily_carbon", "threshold_value": 20.0, "alert_type": "warning"},
                {"metric": "daily_carbon", "threshold_value": 50.0, "alert_type": "critical"},
            ]
        }
        result = await db.users.insert_one(doc)
        user_ids.append(str(result.inserted_id))
        print(f"  👤 Created user: {u['username']} ({u['email']}) | password: {u['password']}")

    # Create carbon entries (30-60 per user, spanning 90 days)
    total_entries = 0
    for idx, uid in enumerate(user_ids):
        num_entries = random.randint(30, 60)
        for i in range(num_entries):
            city_data = random.choice(CITIES)
            mode = random.choice(TRANSPORT_MODES)
            diet = random.choice(FOOD_DIETS)
            
            # Make some users more eco-friendly than others
            eco_factor = 1.0 - (idx * 0.15)  # first user highest emissions, last lowest
            
            entry = {
                "user_id": uid,
                "transport_mode": mode,
                "transport_km": round(random.uniform(2, 100) * eco_factor, 1),
                "electricity_kwh": round(random.uniform(1, 30) * eco_factor, 1),
                "food_diet": diet,
                "food_meals": random.choice([2, 3, 3, 3, 4]),
                "industrial_hours": round(random.uniform(0, 5) * eco_factor, 1),
                "waste_kg": round(random.uniform(0.5, 8) * eco_factor, 1),
                "waste_recycled_pct": round(random.uniform(0, 80), 0),
                "latitude": city_data["lat"] + random.uniform(-0.05, 0.05),
                "longitude": city_data["lng"] + random.uniform(-0.05, 0.05),
                "city": city_data["city"],
                "timestamp": datetime.utcnow() - timedelta(days=random.randint(0, 90), hours=random.randint(0, 23)),
            }
            entry["total_carbon_kg"] = calc_carbon(entry)
            await db.carbon_entries.insert_one(entry)
            total_entries += 1
    print(f"  📊 Created {total_entries} carbon entries across {len(user_ids)} users")

    # Create IoT sensor data
    iot_devices = [
        {"device_id": "esp32_office", "sensor_type": "power", "unit": "kWh"},
        {"device_id": "esp32_office", "sensor_type": "temperature", "unit": "celsius"},
        {"device_id": "mq2_kitchen", "sensor_type": "gas", "unit": "ppm"},
        {"device_id": "esp32_home", "sensor_type": "humidity", "unit": "%"},
        {"device_id": "esp32_home", "sensor_type": "power", "unit": "kWh"},
    ]
    for dev in iot_devices:
        for i in range(20):
            doc = {
                "device_id": dev["device_id"],
                "sensor_type": dev["sensor_type"],
                "unit": dev["unit"],
                "value": round(random.uniform(0.5, 50) if dev["sensor_type"] != "temperature" else random.uniform(22, 38), 1),
                "timestamp": datetime.utcnow() - timedelta(minutes=random.randint(0, 1440)),
            }
            await db.iot_data.insert_one(doc)
    print(f"  📡 Created {len(iot_devices) * 20} IoT sensor readings")

    # Create some alerts
    alert_messages = [
        "⚠️ Your emission of 25.3 kg CO₂ exceeds your warning threshold of 20 kg!",
        "🚨 Critical: Emission of 55.1 kg CO₂ exceeds your critical threshold of 50 kg!",
        "⚠️ Your emission of 22.7 kg CO₂ exceeds your warning threshold of 20 kg!",
        "⚠️ High transport emissions detected. Consider public transit.",
    ]
    for uid in user_ids[:3]:
        for msg in random.sample(alert_messages, random.randint(1, 3)):
            await db.alerts.insert_one({
                "user_id": uid,
                "message": msg,
                "alert_type": "critical" if "Critical" in msg else "warning",
                "triggered_value": round(random.uniform(20, 60), 1),
                "threshold_value": 20.0 if "warning" in msg.lower() else 50.0,
                "is_read": random.choice([True, False]),
                "timestamp": datetime.utcnow() - timedelta(days=random.randint(0, 14)),
            })
    print(f"  🔔 Created alerts for users")

    # Recalculate eco scores based on actual data
    for idx, uid in enumerate(user_ids):
        cursor = db.carbon_entries.find({"user_id": uid})
        entries = []
        async for doc in cursor:
            entries.append(doc)
        
        if entries:
            avg_carbon = sum(e["total_carbon_kg"] for e in entries) / len(entries)
            eco_score = max(10, int(150 - avg_carbon * 3))
            green_pcts = []
            for e in entries:
                s = 100
                s -= e["transport_km"] * 0.3
                s -= e["electricity_kwh"] * 0.8
                s += 10 if e["food_diet"] == "vegan" else (5 if e["food_diet"] == "veg" else -5)
                s += e["waste_recycled_pct"] * 0.1
                green_pcts.append(max(0, min(100, s)))
            green_score = round(sum(green_pcts) / len(green_pcts), 1)
            
            from bson.objectid import ObjectId
            await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"eco_score": eco_score, "green_score": green_score}})
    
    print(f"\n✅ Seeding complete! Connect MongoDB Compass to: mongodb://localhost:27017")
    print(f"   Database: carbon_db")
    print(f"   Collections: users, carbon_entries, iot_data, alerts")
    print(f"\n🔑 Login credentials (all passwords: pass123):")
    for u in USERS:
        print(f"   {u['email']} ({u['username']}) - Role: {u['role']}")

    client.close()

if __name__ == "__main__":
    asyncio.run(seed())
