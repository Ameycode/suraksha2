from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import pandas as pd
import numpy as np
from typing import List
from scipy.spatial import KDTree
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, # Changed to False to allow wildcard origins more easily
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"Incoming request: {request.method} {request.url}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

@app.get("/")
async def root():
    return {"status": "PSI Engine is Running", "demo": "Suraksha Pune Safety Model"}

# Load model, scaler and dataset
model = joblib.load(r"C:\Users\user\Documents\Suraksha-1\suraksha_psi_model.pkl")
scaler = joblib.load(r"C:\Users\user\Documents\Suraksha-1\scaler.pkl")
df = pd.read_csv(r"C:\Users\user\Documents\Suraksha-1\suraksha_pune_dataset_with_coords.csv")
    
# Create a KDTree for fast spatial lookup
coords = df[['lat', 'lng']].values
tree = KDTree(coords)

class SafetyFeatures(BaseModel):
    crime_rate: float
    light_level: float
    crowd_density: float
    sos_count: int
    time_risk: float
    user_rating: float
    sentiment_score: float
    lat: float
    lng: float

class LocationUpdate(BaseModel):
    lat: float
    lng: float

class RouteRequest(BaseModel):
    routes: List[List[List[float]]] # List of routes, each route is a list of [lat, lng]

def get_psi_prediction(features_list):
    scaled_features = scaler.transform(features_list)
    return model.predict(scaled_features)

@app.post("/predict")
async def predict_psi(features: SafetyFeatures):
    data = [[
        features.crime_rate, features.light_level, features.crowd_density,
        features.sos_count, features.time_risk, features.user_rating,
        features.sentiment_score, features.lat, features.lng
    ]]
    prediction = get_psi_prediction(data)
    return {"psi_score": float(prediction[0])}

@app.post("/location-psi")
async def location_psi(loc: LocationUpdate):
    # Find the nearest historical data point to get regional context
    dist, idx = tree.query([loc.lat, loc.lng])
    nearest_data = df.iloc[idx]
    
    # Use features from nearest historical point but with current lat/lng
    data = [[
        nearest_data['crime_rate'], nearest_data['light_level'], nearest_data['crowd_density'],
        nearest_data['sos_count'], nearest_data['time_risk'], nearest_data['user_rating'],
        nearest_data['sentiment_score'], loc.lat, loc.lng
    ]]
    prediction = get_psi_prediction(data)
    return {
        "area": nearest_data['area'],
        "psi_score": float(prediction[0]),
        "nearest_distance": float(dist)
    }

@app.post("/safest-route")
async def safest_route(req: RouteRequest):
    if not req.routes:
        raise HTTPException(status_code=400, detail="No routes provided")
    
    route_details = []
    
    for route in req.routes:
        # We want approximately 50m resolution. 
        # Very rough conversion: 0.00045 degrees lat is ~50m
        # For simplicity, we sample based on cumulative distance or a fixed number of segments
        # but to guarantee granularity, we'll interpolate or sample at high frequency
        
        point_data = []
        for p in route:
            dist, idx = tree.query([p[0], p[1]])
            nearest_data = df.iloc[idx]
            data = [[
                nearest_data['crime_rate'], nearest_data['light_level'], nearest_data['crowd_density'],
                nearest_data['sos_count'], nearest_data['time_risk'], nearest_data['user_rating'],
                nearest_data['sentiment_score'], p[0], p[1]
            ]]
            score = get_psi_prediction(data)[0]
            point_data.append({
                "lat": p[0],
                "lng": p[1],
                "psi": float(score)
            })
            
        avg_score = sum(d['psi'] for d in point_data) / len(point_data)
        route_details.append({
            "avg_score": avg_score,
            "segments": point_data
        })
        
    best_index = int(np.argmax([r['avg_score'] for r in route_details]))
    
    return {
        "best_route_index": best_index,
        "safest_psi": float(route_details[best_index]['avg_score']),
        "heatmap_data": route_details[best_index]['segments']
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
