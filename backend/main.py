import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from typing import List
from database import connect_to_mongo, close_mongo_connection, get_db
from models import CarbonEntry, CarbonResponse
from ai_module import CarbonAI

app = FastAPI(title="Carbon Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ai_model = CarbonAI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

def calculate_carbon(entry: CarbonEntry) -> float:
    # Formula: basic emission factors (fictitious examples for demonstration)
    return (entry.transport_km * 0.2) + (entry.electricity_kwh * 0.4) + (entry.fuel_liters * 2.3)

@app.post("/api/carbon", response_model=CarbonResponse)
async def submit_carbon_data(entry: CarbonEntry):
    db = get_db()
    total_carbon = calculate_carbon(entry)
    
    doc = entry.dict()
    doc['timestamp'] = datetime.utcnow()
    doc['total_carbon_kg'] = total_carbon
    
    # Check if DB is configured properly, otherwise return mocked doc
    if db is not None:
        result = await db.carbon_entries.insert_one(doc)
        doc['id'] = str(result.inserted_id)
        doc.pop('_id', None)
    else:
        doc['id'] = "mock_id"
    
    # Broadcast new footprint calculation to all connected WS clients
    await manager.broadcast({"type": "NEW_DATA", "data": doc})
    
    return doc

@app.get("/api/carbon/history")
async def get_history():
    db = get_db()
    if db is None:
        return []
    
    cursor = db.carbon_entries.find().sort("timestamp", 1).limit(100)
    entries = []
    async for doc in cursor:
        doc['id'] = str(doc['_id'])
        doc.pop('_id', None)
        doc['timestamp'] = doc['timestamp'].isoformat()
        entries.append(doc)
    return entries

@app.get("/api/carbon/predict")
async def predict_emissions():
    db = get_db()
    if db is None:
        return {"predicted_next_carbon_kg": 0.0, "advice": "No DB connection"}
        
    cursor = db.carbon_entries.find().sort("timestamp", 1)
    data = []
    async for doc in cursor:
        data.append({"carbon": doc["total_carbon_kg"]})
    
    if len(data) < 2:
        return {"predicted_next_carbon_kg": 0.0, "advice": "Not enough data to predict."}
        
    ai_model.train(data)
    prediction = ai_model.predict_next(len(data))
    
    advice = "Your emissions are rising! Try reducing electricity consumption." if prediction > sum(d['carbon'] for d in data[-3:])/3 else "Great job, your carbon footprint trend is stable or decreasing."
    
    return {"predicted_next_carbon_kg": prediction, "advice": advice}

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
