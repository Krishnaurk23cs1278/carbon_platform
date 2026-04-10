import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

class CarbonAI:
    def __init__(self):
        self.model = LinearRegression()
        self.is_trained = False

    def train(self, historical_data):
        """
        Trains model on historical data.
        historical_data: List of dicts [{'carbon': 50}, ...]
        """
        if len(historical_data) < 2:
            return False

        df = pd.DataFrame(historical_data)
        # Using index as a simple time feature for linear regression prediction
        X = np.arange(len(df)).reshape(-1, 1)
        y = df['carbon'].values

        self.model.fit(X, y)
        self.is_trained = True
        return True

    def predict_next(self, current_index_len):
        if not self.is_trained:
            return 0.0
        prediction = self.model.predict([[current_index_len]])
        return max(0, float(prediction[0]))
