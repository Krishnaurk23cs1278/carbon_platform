import asyncio
import os
import logging
from bson.objectid import ObjectId
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from datetime import datetime, timedelta
from typing import List, Optional

from database import connect_to_mongo, close_mongo_connection, get_db
from models import CarbonEntry, CarbonResponse, UserCreate, LoginRequest, Token, IoTSensorData, AlertThreshold
from ai_module import CarbonAI
from auth import get_password_hash, verify_password, create_access_token, get_current_user_id
from report_generator import generate_pdf_report

# ── Logging Setup ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("carbon_platform")

app = FastAPI(title="Carbon Intelligence API", version="2.0.0", description="AI-Enhanced Real-Time Carbon Tracking Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ai_model = CarbonAI()

# ── WebSocket Connection Manager ──
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except:
                self.active_connections.remove(connection)

manager = ConnectionManager()

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()
    logger.info("MongoDB connected successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()
    logger.info("MongoDB connection closed")

# ══════════════════════════════════════════════
# AUTH ROUTES
# ══════════════════════════════════════════════
@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
async def signup(user: UserCreate):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    existing_username = await db.users.find_one({"username": user.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
        
    hashed_pwd = get_password_hash(user.password)
    user_doc = {
        "username": user.username,
        "email": user.email,
        "hashed_password": hashed_pwd,
        "eco_score": 100,
        "green_score": 50.0,
        "role": "user",
        "created_at": datetime.utcnow(),
        "alert_thresholds": [
            {"metric": "daily_carbon", "threshold_value": 20.0, "alert_type": "warning"},
            {"metric": "daily_carbon", "threshold_value": 50.0, "alert_type": "critical"},
        ]
    }
    await db.users.insert_one(user_doc)
    logger.info(f"New user registered: {user.username}")
    return {"message": "User created successfully"}

@app.post("/api/auth/login", response_model=Token)
async def login(user: LoginRequest):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
        
    db_user = await db.users.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
        
    access_token = create_access_token(data={"sub": str(db_user["_id"])})
    logger.info(f"User logged in: {db_user['username']}")
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me")
async def get_me(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "email": user["email"],
        "eco_score": user.get("eco_score", 0),
        "green_score": user.get("green_score", 50.0),
        "role": user.get("role", "user"),
    }

# ══════════════════════════════════════════════
# CARBON TRACKING (Multi-Source)
# ══════════════════════════════════════════════
EMISSION_FACTORS = {
    "car": 0.21, "flight": 0.255, "public": 0.05, "bike": 0.0, "ev": 0.05,
    "electricity": 0.43,
    "food_vegan": 1.0, "food_veg": 1.5, "food_non_veg": 3.3,
    "waste": 0.1,
    "industrial": 1.8,
}

def calculate_carbon(entry: CarbonEntry) -> float:
    transport = entry.transport_km * EMISSION_FACTORS.get(entry.transport_mode, 0.2)
    electricity = entry.electricity_kwh * EMISSION_FACTORS["electricity"]
    food = EMISSION_FACTORS.get(f"food_{entry.food_diet}", 1.5) * entry.food_meals
    waste = entry.waste_kg * EMISSION_FACTORS["waste"] * (1 - entry.waste_recycled_pct / 100 * 0.5)
    industrial = entry.industrial_hours * EMISSION_FACTORS["industrial"]
    
    total = transport + electricity + food + waste + industrial
    logger.debug(f"Carbon calc: transport={transport:.2f}, elec={electricity:.2f}, food={food:.2f}, waste={waste:.2f}, industrial={industrial:.2f}, total={total:.2f}")
    return round(total, 2)

async def check_alerts(db, user_id: str, total_carbon: float):
    """Check if emission exceeds user-defined thresholds and generate alerts."""
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    thresholds = user.get("alert_thresholds", [])
    
    for t in thresholds:
        if t["metric"] == "daily_carbon" and total_carbon > t["threshold_value"]:
            alert_doc = {
                "user_id": user_id,
                "message": f"⚠️ Your emission of {total_carbon:.1f} kg CO₂ exceeds your {t['alert_type']} threshold of {t['threshold_value']} kg!",
                "alert_type": t["alert_type"],
                "triggered_value": total_carbon,
                "threshold_value": t["threshold_value"],
                "is_read": False,
                "timestamp": datetime.utcnow()
            }
            await db.alerts.insert_one(alert_doc)
            await manager.broadcast({"type": "ALERT", "data": {
                "message": alert_doc["message"],
                "alert_type": t["alert_type"],
                "value": total_carbon
            }})
            logger.warning(f"Alert triggered for user {user_id}: {alert_doc['message']}")

@app.post("/api/carbon")
async def submit_carbon_data(entry: CarbonEntry, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    total_carbon = calculate_carbon(entry)
    
    doc = entry.dict()
    doc['timestamp'] = datetime.utcnow()
    doc['total_carbon_kg'] = total_carbon
    doc['user_id'] = user_id
    
    if db is not None:
        result = await db.carbon_entries.insert_one(doc)
        doc['id'] = str(result.inserted_id)
        doc.pop('_id', None)
        
        # Gamification: Update eco score
        eco_delta = 10 if total_carbon < 3.0 else (5 if total_carbon < 8.0 else (0 if total_carbon < 15.0 else -5))
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": {"eco_score": eco_delta}})
        
        # Update green score
        cursor = db.carbon_entries.find({"user_id": user_id}).sort("timestamp", -1).limit(20)
        recent = []
        async for d in cursor:
            recent.append(d)
        green_score = ai_model.calculate_green_score(recent)
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"green_score": green_score}})
        
        # Check alert thresholds
        await check_alerts(db, user_id, total_carbon)
    else:
        doc['id'] = "mock_id"
    
    await manager.broadcast({"type": "NEW_DATA", "data": doc})
    logger.info(f"Carbon entry recorded: {total_carbon:.2f} kg CO₂ by user {user_id}")
    
    return doc

@app.get("/api/carbon/history")
async def get_history(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    if db is None: return []
    
    cursor = db.carbon_entries.find({"user_id": user_id}).sort("timestamp", 1).limit(200)
    entries = []
    async for doc in cursor:
        doc['id'] = str(doc['_id'])
        doc.pop('_id', None)
        entries.append(doc)
    return entries

@app.get("/api/carbon/stats")
async def get_stats(user_id: str = Depends(get_current_user_id)):
    """Get aggregated statistics for the user dashboard."""
    db = get_db()
    if db is None: return {}
    
    # Total entries
    total_entries = await db.carbon_entries.count_documents({"user_id": user_id})
    
    # All entries for calculations
    cursor = db.carbon_entries.find({"user_id": user_id}).sort("timestamp", -1)
    entries = []
    async for doc in cursor:
        entries.append(doc)
    
    if not entries:
        return {"total_entries": 0, "total_carbon": 0, "avg_carbon": 0, "best_day": 0, "worst_day": 0,
                "transport_total": 0, "electricity_total": 0, "food_total": 0, "waste_total": 0, "industrial_total": 0}
    
    carbons = [e["total_carbon_kg"] for e in entries]
    
    return {
        "total_entries": total_entries,
        "total_carbon": round(sum(carbons), 2),
        "avg_carbon": round(sum(carbons) / len(carbons), 2),
        "best_day": round(min(carbons), 2),
        "worst_day": round(max(carbons), 2),
        "transport_total": round(sum(e.get("transport_km", 0) * EMISSION_FACTORS.get(e.get("transport_mode", "car"), 0.2) for e in entries), 2),
        "electricity_total": round(sum(e.get("electricity_kwh", 0) * EMISSION_FACTORS["electricity"] for e in entries), 2),
        "food_total": round(sum(EMISSION_FACTORS.get(f"food_{e.get('food_diet','veg')}", 1.5) * e.get("food_meals", 3) for e in entries), 2),
        "waste_total": round(sum(e.get("waste_kg", 0) * EMISSION_FACTORS["waste"] for e in entries), 2),
        "industrial_total": round(sum(e.get("industrial_hours", 0) * EMISSION_FACTORS["industrial"] for e in entries), 2),
    }

@app.get("/api/carbon/leaderboard")
async def get_leaderboard():
    db = get_db()
    if db is None: return []
    
    cursor = db.users.find({}, {"username": 1, "eco_score": 1, "green_score": 1}).sort("eco_score", -1).limit(20)
    leaders = []
    async for doc in cursor:
        leaders.append({
            "id": str(doc["_id"]),
            "username": doc["username"],
            "eco_score": doc.get("eco_score", 0),
            "green_score": doc.get("green_score", 50.0),
        })
    return leaders

@app.get("/api/carbon/community")
async def get_community_stats():
    """Get aggregated data across all users for comparison."""
    db = get_db()
    if db is None: return {"avg_carbon": 15.0, "total_saved_kg": 0}
    
    pipeline = [
        {"$group": {"_id": None, "avg_carbon": {"$avg": "$total_carbon_kg"}, "total_entries": {"$sum": 1}}}
    ]
    cursor = db.carbon_entries.aggregate(pipeline)
    res = await cursor.to_list(length=1)
    
    if not res:
        return {"avg_carbon": 15.0, "total_saved_kg": 0}
        
    return {
        "avg_carbon": round(res[0]["avg_carbon"], 2),
        "total_entries": res[0]["total_entries"],
        "total_saved_kg": round(res[0]["total_entries"] * 5.5, 2) 
    }

@app.get("/api/carbon/predict")
async def predict_emissions(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    if db is None: return {"predicted_next_carbon_kg": 0.0, "advice": [], "trend": []}
        
    cursor = db.carbon_entries.find({"user_id": user_id}).sort("timestamp", -1).limit(30)
    data = []
    async for doc in cursor:
        data.insert(0, {
            "transport_km": doc["transport_km"],
            "electricity_kwh": doc["electricity_kwh"],
            "waste_kg": doc["waste_kg"],
            "industrial_hours": doc.get("industrial_hours", 0),
            "carbon": doc["total_carbon_kg"],
            "food_diet": doc.get("food_diet", "veg"),
            "transport_mode": doc.get("transport_mode", "car"),
            "waste_recycled_pct": doc.get("waste_recycled_pct", 0),
        })
    
    ai_model.train(data)
    trend = ai_model.predict_trend(data, days_ahead=7)
    
    if len(data) > 0:
        latest = data[-1]
        prediction = ai_model.predict_carbon(latest["transport_km"], latest["electricity_kwh"], latest["waste_kg"], latest.get("industrial_hours", 0))
        advice = ai_model.get_recommendations(latest)
    else:
        prediction = 0.0
        advice = [{"icon": "📊", "category": "General", "message": "Submit data to get personalized recommendations.", "impact": "info", "savings_kg": 0}]
    
    return {"predicted_next_carbon_kg": prediction, "advice": advice, "trend": trend}

@app.get("/api/carbon/report")
async def get_report(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    cursor = db.carbon_entries.find({"user_id": user_id}).sort("timestamp", 1)
    entries = []
    async for doc in cursor:
        entries.append(doc)
        
    filepath = generate_pdf_report(user, entries, user.get("eco_score", 0))
    logger.info(f"PDF report generated for user {user_id}")
    return FileResponse(filepath, media_type="application/pdf", filename="carbon_report.pdf")

@app.get("/api/carbon/geo")
async def get_geo_data(user_id: str = Depends(get_current_user_id)):
    """Get location-based emission data for map visualization."""
    db = get_db()
    if db is None: return []
    
    cursor = db.carbon_entries.find(
        {"user_id": user_id, "latitude": {"$ne": None}},
        {"latitude": 1, "longitude": 1, "city": 1, "total_carbon_kg": 1, "transport_mode": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(100)
    
    points = []
    async for doc in cursor:
        points.append({
            "lat": doc.get("latitude"),
            "lng": doc.get("longitude"),
            "city": doc.get("city", "Unknown"),
            "carbon": doc["total_carbon_kg"],
            "transport": doc.get("transport_mode", "car"),
        })
    return points

# ══════════════════════════════════════════════
# IoT INTEGRATION
# ══════════════════════════════════════════════
@app.post("/api/iot/data")
async def receive_iot_data(sensor: IoTSensorData):
    """Receive real-time sensor data from IoT devices (ESP32, etc.)"""
    db = get_db()
    doc = sensor.dict()
    doc["timestamp"] = datetime.utcnow()
    
    if db is not None:
        await db.iot_data.insert_one(doc)
    
    await manager.broadcast({"type": "IOT_DATA", "data": {
        "device_id": sensor.device_id,
        "sensor_type": sensor.sensor_type,
        "value": sensor.value,
        "unit": sensor.unit,
    }})
    logger.info(f"IoT data received: {sensor.device_id} → {sensor.sensor_type}={sensor.value}{sensor.unit}")
    return {"status": "received", "device_id": sensor.device_id}

@app.get("/api/iot/latest")
async def get_latest_iot():
    """Get latest IoT sensor readings."""
    db = get_db()
    if db is None: return []
    
    pipeline = [
        {"$sort": {"timestamp": -1}},
        {"$group": {"_id": {"device_id": "$device_id", "sensor_type": "$sensor_type"}, "latest": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$latest"}},
        {"$limit": 20}
    ]
    readings = []
    async for doc in db.iot_data.aggregate(pipeline):
        doc.pop("_id", None)
        readings.append({
            "device_id": doc.get("device_id"),
            "sensor_type": doc.get("sensor_type"),
            "value": doc.get("value"),
            "unit": doc.get("unit"),
            "timestamp": doc.get("timestamp"),
        })
    return readings

# ══════════════════════════════════════════════
# ALERTS & NOTIFICATIONS
# ══════════════════════════════════════════════
@app.get("/api/alerts")
async def get_alerts(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    if db is None: return []
    
    cursor = db.alerts.find({"user_id": user_id}).sort("timestamp", -1).limit(20)
    alerts = []
    async for doc in cursor:
        alerts.append({
            "id": str(doc["_id"]),
            "message": doc["message"],
            "alert_type": doc["alert_type"],
            "triggered_value": doc.get("triggered_value", 0),
            "threshold_value": doc.get("threshold_value", 0),
            "is_read": doc.get("is_read", False),
            "timestamp": doc["timestamp"],
        })
    return alerts

@app.put("/api/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    await db.alerts.update_one({"_id": ObjectId(alert_id), "user_id": user_id}, {"$set": {"is_read": True}})
    return {"status": "ok"}

@app.post("/api/alerts/threshold")
async def set_alert_threshold(threshold: AlertThreshold, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$push": {"alert_thresholds": threshold.dict()}}
    )
    return {"status": "threshold set"}

# ══════════════════════════════════════════════
# ADMIN PANEL
# ══════════════════════════════════════════════
@app.get("/api/admin/users")
async def admin_get_users(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    cursor = db.users.find({}, {"hashed_password": 0})
    users = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        doc.pop("_id", None)
        users.append(doc)
    return users

@app.get("/api/admin/stats")
async def admin_stats(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    total_users = await db.users.count_documents({})
    total_entries = await db.carbon_entries.count_documents({})
    total_iot = await db.iot_data.count_documents({})
    total_alerts = await db.alerts.count_documents({})
    
    return {
        "total_users": total_users,
        "total_entries": total_entries,
        "total_iot_readings": total_iot,
        "total_alerts": total_alerts,
    }

# ══════════════════════════════════════════════
# WEBSOCKET
# ══════════════════════════════════════════════
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ── Health Check ──
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat(), "version": "2.0.0"}
