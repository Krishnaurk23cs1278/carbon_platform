import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './index.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_BASE = 'http://localhost:8000/api/carbon';
const WS_BASE = 'ws://localhost:8000/ws';

function App() {
  const [history, setHistory] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [form, setForm] = useState({ transport_km: '', electricity_kwh: '', fuel_liters: '' });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchPrediction();

    const ws = new WebSocket(WS_BASE);
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'NEW_DATA') {
          setHistory(prev => [...prev, msg.data]);
          fetchPrediction();
        }
      } catch (err) {
        console.error(err);
      }
    };

    return () => ws.close();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/history`);
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPrediction = async () => {
    try {
      const res = await fetch(`${API_BASE}/predict`);
      if (res.ok) {
        setPrediction(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transport_km: parseFloat(form.transport_km) || 0,
          electricity_kwh: parseFloat(form.electricity_kwh) || 0,
          fuel_liters: parseFloat(form.fuel_liters) || 0,
        })
      });
      if (res.ok) {
        setForm({ transport_km: '', electricity_kwh: '', fuel_liters: '' });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const totalCarbon = history.reduce((acc, curr) => acc + curr.total_carbon_kg, 0);
  const lastEntry = history[history.length - 1];

  const chartData = {
    labels: history.map((_, i) => `Entry ${i + 1}`),
    datasets: [
      {
        fill: true,
        label: 'Carbon Payload (kg)',
        data: history.map(d => d.total_carbon_kg),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
    },
    plugins: {
      legend: { labels: { color: '#f8fafc' } }
    }
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <div>
          <h1>Carbon Intelligence</h1>
          <p style={{ color: 'var(--text-muted)' }}>Real-time emissions tracking & AI forecasting</p>
        </div>
        <div className="live-indicator">
          {isConnected ? (
            <><div className="pulse"></div> Live Connected</>
          ) : (
            <><div className="pulse" style={{ background: 'var(--accent-warning)', boxShadow: 'none', animation: 'none' }}></div> Connecting...</>
          )}
        </div>
      </header>

      <div className="metrics-grid">
        <div className="glass-panel metric-card">
          <span className="metric-title">Total Emissions</span>
          <span className="metric-value">{totalCarbon.toFixed(1)} <span className="metric-unit">kg CO₂</span></span>
        </div>
        <div className="glass-panel metric-card">
          <span className="metric-title">Latest Entry</span>
          <span className="metric-value">{lastEntry ? lastEntry.total_carbon_kg.toFixed(1) : '0.0'} <span className="metric-unit">kg CO₂</span></span>
        </div>
        <div className="glass-panel metric-card">
          <span className="metric-title">AI Prediction (Next)</span>
          <span className="metric-value" style={{ color: 'var(--accent-secondary)' }}>
            {prediction ? prediction.predicted_next_carbon_kg.toFixed(1) : '--'} <span className="metric-unit">kg CO₂</span>
          </span>
        </div>
      </div>

      <div className="main-grid">
        <div className="glass-panel">
          <h2>Emission Trends</h2>
          <div className="chart-container">
            <Line data={chartData} options={chartOptions} />
          </div>
          
          {prediction && (
            <div className="prediction-box">
              <div className="prediction-title">✦ AI Insights</div>
              <p>{prediction.advice}</p>
            </div>
          )}
        </div>

        <div className="glass-panel">
          <h2>Log Data</h2>
          <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
            <div className="form-group">
              <label>Transport (km)</label>
              <input 
                type="number" 
                className="form-control" 
                value={form.transport_km}
                onChange={e => setForm({...form, transport_km: e.target.value})}
                placeholder="e.g. 15"
                required
              />
            </div>
            <div className="form-group">
              <label>Electricity (kWh)</label>
              <input 
                type="number" 
                className="form-control" 
                value={form.electricity_kwh}
                onChange={e => setForm({...form, electricity_kwh: e.target.value})}
                placeholder="e.g. 5"
                required
              />
            </div>
            <div className="form-group">
              <label>Fuel Usage (liters)</label>
              <input 
                type="number" 
                className="form-control" 
                value={form.fuel_liters}
                onChange={e => setForm({...form, fuel_liters: e.target.value})}
                placeholder="e.g. 2"
                required
              />
            </div>
            <button type="submit" className="btn">Record Emissions</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
