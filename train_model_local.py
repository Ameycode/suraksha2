import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

# Load the dataset with coordinates
df = pd.read_csv("C:\Users\user\Documents\Suraksha-1\suraksha_pune_dataset_with_coords.csv")

# Prepare features and target
# We keep lat, lng, and all other numeric features
X = df.drop(columns=['area', 'feedback_text', 'psi_score'])
y = df['psi_score']

# Scale features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Split data
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)

# Train model
model = RandomForestRegressor(
    n_estimators=200,
    max_depth=12,
    random_state=42
)
model.fit(X_train, y_train)

# Evaluate
preds = model.predict(X_test)
print("MAE:", mean_absolute_error(y_test, preds))
print("R2 Score:", r2_score(y_test, preds))

# Save the model and scaler for the local API
joblib.dump(model, "C:/Users/user/Documents/Suraksha-1/suraksha_psi_model.pkl")
joblib.dump(scaler, "C:/Users/user/Documents/Suraksha-1/scaler.pkl")

print("Model and Scaler saved successfully.")
