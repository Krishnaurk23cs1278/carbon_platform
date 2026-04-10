import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
import logging

logger = logging.getLogger("carbon_ai")

class CarbonAI:
    def __init__(self):
        self.model = LinearRegression()
        self.is_trained = False

    def train(self, historical_data):
        """
        Trains model on historical data with multiple features.
        historical_data: List of dicts with keys: transport_km, electricity_kwh, waste_kg, industrial_hours, carbon
        """
        if len(historical_data) < 3:
            return False

        df = pd.DataFrame(historical_data)
        feature_cols = ['transport_km', 'electricity_kwh', 'waste_kg']
        if 'industrial_hours' in df.columns:
            feature_cols.append('industrial_hours')
        
        X = df[feature_cols].values
        y = df['carbon'].values

        self.model.fit(X, y)
        self.is_trained = True
        logger.info(f"AI model trained on {len(historical_data)} samples with R²={self.model.score(X, y):.3f}")
        return True

    def predict_carbon(self, transport_km, electricity_kwh, waste_kg, industrial_hours=0):
        if not self.is_trained:
            return self._fallback_estimate(transport_km, electricity_kwh, waste_kg, industrial_hours)
        features = [[transport_km, electricity_kwh, waste_kg]]
        if len(self.model.coef_) == 4:
            features = [[transport_km, electricity_kwh, waste_kg, industrial_hours]]
        prediction = self.model.predict(features)
        return max(0, float(prediction[0]))

    def predict_trend(self, historical_data, days_ahead=30):
        """Predict future trend using simple time-series linear regression."""
        if len(historical_data) < 3:
            return []
        
        df = pd.DataFrame(historical_data)
        X = np.arange(len(df)).reshape(-1, 1)
        y = df['carbon'].values
        
        trend_model = LinearRegression()
        trend_model.fit(X, y)
        
        future_X = np.arange(len(df), len(df) + days_ahead).reshape(-1, 1)
        predictions = trend_model.predict(future_X)
        return [max(0, float(p)) for p in predictions]

    def _fallback_estimate(self, transport_km, electricity_kwh, waste_kg, industrial_hours=0):
        return (transport_km * 0.2) + (electricity_kwh * 0.4) + (waste_kg * 0.1) + (industrial_hours * 1.5)

    def get_recommendations(self, entry: dict):
        recs = []
        transport_km = entry.get("transport_km", 0)
        electricity = entry.get("electricity_kwh", 0)
        waste = entry.get("waste_kg", 0)
        diet = entry.get("food_diet", "veg")
        industrial = entry.get("industrial_hours", 0)
        recycled = entry.get("waste_recycled_pct", 0)

        # Transport
        if transport_km > 100:
            recs.append({"icon": "🚗", "category": "Transport", "message": "Extremely high travel distance. Consider remote work or video conferencing.", "impact": "high", "savings_kg": round(transport_km * 0.15, 1)})
        elif transport_km > 50:
            recs.append({"icon": "🚌", "category": "Transport", "message": "Consider public transit or carpooling to reduce transport emissions.", "impact": "medium", "savings_kg": round(transport_km * 0.10, 1)})
        
        if entry.get("transport_mode") == "car" and transport_km > 10:
            recs.append({"icon": "🚲", "category": "Transport", "message": "Switch to cycling for short distances under 10km.", "impact": "medium", "savings_kg": round(min(transport_km, 10) * 0.2, 1)})

        if entry.get("transport_mode") == "flight":
            recs.append({"icon": "✈️", "category": "Transport", "message": "Air travel has high emissions. Consider trains for distances under 500km.", "impact": "high", "savings_kg": round(transport_km * 0.15, 1)})

        # Electricity
        if electricity > 30:
            recs.append({"icon": "⚡", "category": "Electricity", "message": "Very high electricity usage. Switch to LED lighting and energy-efficient appliances.", "impact": "high", "savings_kg": round(electricity * 0.15, 1)})
        elif electricity > 15:
            recs.append({"icon": "💡", "category": "Electricity", "message": "Moderate electricity usage. Turn off unused devices and use natural lighting.", "impact": "medium", "savings_kg": round(electricity * 0.08, 1)})

        # Food
        if diet == "non_veg":
            recs.append({"icon": "🥗", "category": "Food", "message": "Switching to a plant-based diet can reduce food emissions by up to 50%.", "impact": "high", "savings_kg": 1.8})
        elif diet == "veg":
            recs.append({"icon": "🌱", "category": "Food", "message": "Great choice! Consider trying vegan meals 2x/week for even lower impact.", "impact": "low", "savings_kg": 0.5})

        # Waste
        if waste > 5:
            recs.append({"icon": "🗑️", "category": "Waste", "message": "High waste generation. Start composting and avoid single-use plastics.", "impact": "medium", "savings_kg": round(waste * 0.05, 1)})
        if recycled < 30 and waste > 1:
            recs.append({"icon": "♻️", "category": "Waste", "message": f"Only {recycled:.0f}% recycled. Aim for at least 50% recycling rate.", "impact": "medium", "savings_kg": round(waste * 0.03, 1)})

        # Industrial
        if industrial > 4:
            recs.append({"icon": "🏭", "category": "Industrial", "message": "Heavy device usage detected. Schedule energy-intensive tasks during off-peak hours.", "impact": "medium", "savings_kg": round(industrial * 0.5, 1)})

        if not recs:
            recs.append({"icon": "🌍", "category": "General", "message": "Excellent! Your carbon footprint is very low across all categories.", "impact": "positive", "savings_kg": 0})

        return recs

    def calculate_green_score(self, entries):
        """Calculate sustainability score 0-100 based on lifestyle patterns."""
        if not entries:
            return 50.0
        
        scores = []
        for e in entries:
            score = 100.0
            # Transport penalty
            transport_score = max(0, 30 - e.get("transport_km", 0) * 0.3)
            # Electricity penalty
            elec_score = max(0, 25 - e.get("electricity_kwh", 0) * 0.8)
            # Diet bonus
            diet = e.get("food_diet", "veg")
            diet_score = 20 if diet == "vegan" else (15 if diet == "veg" else 5)
            # Waste penalty + recycling bonus
            waste_score = max(0, 15 - e.get("waste_kg", 0) * 1.5) + (e.get("waste_recycled_pct", 0) / 100 * 10)
            
            total = transport_score + elec_score + diet_score + waste_score
            scores.append(min(100, max(0, total)))
        
        return round(sum(scores) / len(scores), 1)
