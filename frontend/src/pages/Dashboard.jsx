import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler, BarElement, ArcElement, RadialLinearScale
} from 'chart.js';
import { Line, Bar, Doughnut, Radar } from 'react-chartjs-2';
import api from '../api';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, RadialLinearScale, Title, Tooltip, Legend, Filler
);

export default function Dashboard() {
  const [history, setHistory] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [iotData, setIotData] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  const [form, setForm] = useState({
    transport_mode: 'car', transport_km: '', electricity_kwh: '',
    food_diet: 'veg', food_meals: '3', industrial_hours: '0',
    waste_kg: '', waste_recycled_pct: '0',
    latitude: '', longitude: '', city: ''
  });

  useEffect(() => {
    loadAll();
    const ws = new WebSocket('ws://localhost:8000/ws');
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'NEW_DATA' || msg.type === 'IOT_DATA' || msg.type === 'ALERT') {
          loadAll();
        }
      } catch (err) {}
    };
    return () => ws.close();
  }, []);

  const loadAll = () => { fetchMe(); fetchHistory(); fetchPrediction(); fetchLeaderboard(); fetchStats(); fetchAlerts(); fetchIoT(); };
  const fetchMe = async () => { try { const r = await api.get('/auth/me'); setUser(r.data); } catch (e) { navigate('/login'); } };
  const fetchHistory = async () => { try { const r = await api.get('/carbon/history'); setHistory(r.data); } catch (e) {} };
  const fetchPrediction = async () => { try { const r = await api.get('/carbon/predict'); setPrediction(r.data); } catch (e) {} };
  const fetchLeaderboard = async () => { try { const r = await api.get('/carbon/leaderboard'); setLeaderboard(r.data); } catch (e) {} };
  const fetchStats = async () => { try { const r = await api.get('/carbon/stats'); setStats(r.data); } catch (e) {} };
  const fetchAlerts = async () => { try { const r = await api.get('/alerts'); setAlerts(r.data); } catch (e) {} };
  const fetchIoT = async () => { try { const r = await api.get('/iot/latest'); setIotData(r.data); } catch (e) {} };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/carbon', {
        transport_mode: form.transport_mode,
        transport_km: parseFloat(form.transport_km) || 0,
        electricity_kwh: parseFloat(form.electricity_kwh) || 0,
        food_diet: form.food_diet,
        food_meals: parseInt(form.food_meals) || 3,
        industrial_hours: parseFloat(form.industrial_hours) || 0,
        waste_kg: parseFloat(form.waste_kg) || 0,
        waste_recycled_pct: parseFloat(form.waste_recycled_pct) || 0,
        latitude: parseFloat(form.latitude) || null,
        longitude: parseFloat(form.longitude) || null,
        city: form.city || null,
      });
      setForm({ transport_mode: 'car', transport_km: '', electricity_kwh: '', food_diet: 'veg', food_meals: '3', industrial_hours: '0', waste_kg: '', waste_recycled_pct: '0', latitude: '', longitude: '', city: '' });
    } catch (e) { alert("Failed to submit"); }
  };

  const downloadReport = async () => {
    try {
      const resp = await api.get('/carbon/report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'carbon_report.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    } catch(e) { alert("Could not download report"); }
  };

  const handleLogout = () => { localStorage.removeItem('token'); navigate('/login'); };
  const totalCarbon = history.reduce((a, c) => a + c.total_carbon_kg, 0);
  const avgCarbon = history.length ? totalCarbon / history.length : 0;
  const unreadAlerts = alerts.filter(a => !a.is_read).length;
  const greenScore = user?.green_score || 50;
  const greenColor = greenScore > 70 ? '#10b981' : greenScore > 40 ? '#f59e0b' : '#ef4444';

  // Chart configurations
  const darkChart = {
    responsive: true, maintainAspectRatio: false,
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7b8bae', font: { size: 10 } } },
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#7b8bae', font: { size: 10 } } }
    },
    plugins: { legend: { labels: { color: '#f0f4fc', font: { size: 11 } }, position: 'top' } }
  };

  const trendData = {
    labels: history.map((_, i) => `#${i + 1}`),
    datasets: [
      { fill: true, label: 'Emissions (kg CO₂)', data: history.map(d => d.total_carbon_kg), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, pointRadius: 2 },
      ...(prediction?.trend?.length ? [{ label: 'AI Forecast', data: [...Array(history.length).fill(null), ...prediction.trend.slice(0,7)], borderColor: '#8b5cf6', borderDash: [5,5], tension: 0.4, pointRadius: 0 }] : [])
    ]
  };

  const catBreakdown = {
    labels: ['🚗 Transport', '⚡ Electricity', '🍽️ Food', '🗑️ Waste', '🏭 Industrial'],
    datasets: [{ data: [
      stats?.transport_total || 0, stats?.electricity_total || 0,
      stats?.food_total || 0, stats?.waste_total || 0, stats?.industrial_total || 0
    ], backgroundColor: ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6'], borderWidth: 0, cutout: '65%' }]
  };

  const radarData = {
    labels: ['Transport', 'Electricity', 'Food', 'Waste', 'Industrial'],
    datasets: [{
      label: 'Your Footprint', data: [
        Math.min(100, (stats?.transport_total || 0) * 2),
        Math.min(100, (stats?.electricity_total || 0) * 2),
        Math.min(100, (stats?.food_total || 0) * 2),
        Math.min(100, (stats?.waste_total || 0) * 5),
        Math.min(100, (stats?.industrial_total || 0) * 3),
      ],
      backgroundColor: 'rgba(16,185,129,0.15)', borderColor: '#10b981', pointBackgroundColor: '#10b981',
    }]
  };

  return (
    <div className="dashboard-container">
      {/* ── Header ── */}
      <header className="header">
        <div>
          <h1>🌍 Carbon Intelligence</h1>
          <p style={{color:'var(--text-muted)', fontSize:'0.85rem'}}>
            Welcome, <strong style={{color:'var(--text-main)'}}>{user?.username}</strong> &nbsp;|&nbsp;
            Eco: <strong style={{color:'#10b981'}}>{user?.eco_score}</strong> &nbsp;|&nbsp;
            Green: <strong style={{color: greenColor}}>{greenScore}%</strong>
          </p>
        </div>
        <div className="nav-actions">
          <div className="live-indicator">
            {isConnected ? <><div className="pulse"></div> Live</> : <><div className="pulse" style={{background:'#ef4444', animation:'none'}}></div> Offline</>}
          </div>
          {unreadAlerts > 0 && <button className="btn-sm btn-outline" onClick={() => setActiveTab('alerts')}>🔔 {unreadAlerts}</button>}
          <button className="btn-sm btn-blue" onClick={downloadReport}>📄 Report</button>
          <button className="btn-sm btn-outline btn-red" onClick={handleLogout} style={{borderColor:'rgba(239,68,68,0.3)', color:'#ef4444'}}>Logout</button>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <div className="tab-bar">
        {['overview','log','iot','alerts','leaderboard'].map(t => (
          <button key={t} className={`tab ${activeTab===t?'active':''}`} onClick={()=>setActiveTab(t)}>
            {t === 'overview' && '📊 '}{t === 'log' && '✏️ '}{t === 'iot' && '📡 '}{t === 'alerts' && '🔔 '}{t === 'leaderboard' && '🏆 '}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ══════════════════ OVERVIEW TAB ══════════════════ */}
      {activeTab === 'overview' && (
        <div className="fade-in">
          {/* Metrics */}
          <div className="metrics-grid">
            <div className="glass-panel metric-card">
              <span className="metric-icon">🌡️</span>
              <span className="metric-title">Total Emissions</span>
              <span className="metric-value">{totalCarbon.toFixed(1)} <span className="metric-unit">kg CO₂</span></span>
            </div>
            <div className="glass-panel metric-card">
              <span className="metric-icon">📈</span>
              <span className="metric-title">Avg / Entry</span>
              <span className="metric-value">{avgCarbon.toFixed(1)} <span className="metric-unit">kg CO₂</span></span>
            </div>
            <div className="glass-panel metric-card">
              <span className="metric-icon">🤖</span>
              <span className="metric-title">AI Prediction</span>
              <span className="metric-value" style={{color:'var(--accent-purple)'}}>
                {prediction ? prediction.predicted_next_carbon_kg.toFixed(1) : '--'} <span className="metric-unit">kg CO₂</span>
              </span>
            </div>
            <div className="glass-panel metric-card">
              <span className="metric-icon">🏅</span>
              <span className="metric-title">Leaderboard Rank</span>
              <span className="metric-value" style={{color:'var(--accent-amber)'}}>
                #{(leaderboard.findIndex(l => l.id === user?.id) + 1) || '--'}
              </span>
            </div>
            <div className="glass-panel metric-card">
              <span className="metric-icon">🌿</span>
              <span className="metric-title">Green Score</span>
              <span className="metric-value" style={{color: greenColor}}>{greenScore}<span className="metric-unit">%</span></span>
            </div>
          </div>

          {/* Charts */}
          <div className="main-grid">
            <div style={{display:'flex', flexDirection:'column', gap:'1.5rem'}}>
              <div className="glass-panel">
                <div className="section-header">
                  <h2>Emission Trends</h2>
                  <span className="section-badge ai">AI Enhanced</span>
                </div>
                <div className="chart-container"><Line data={trendData} options={darkChart} /></div>
              </div>
              <div className="glass-panel">
                <div className="section-header">
                  <h2>Category Footprint Radar</h2>
                </div>
                <div className="chart-container">
                  <Radar data={radarData} options={{...darkChart, scales: { r: { grid: { color:'rgba(255,255,255,0.05)' }, pointLabels: { color:'#7b8bae' }, ticks: { display:false }, angleLines: { color:'rgba(255,255,255,0.05)' } } }}} />
                </div>
              </div>
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:'1.5rem'}}>
              {/* Doughnut */}
              <div className="glass-panel">
                <div className="section-header"><h2>Category Breakdown</h2></div>
                <div style={{height:'220px', display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <Doughnut data={catBreakdown} options={{...darkChart, scales:{}, cutout:'65%', plugins:{...darkChart.plugins, legend:{position:'bottom',labels:{color:'#f0f4fc',font:{size:10},padding:8}}}}} />
                </div>
              </div>

              {/* AI Recommendations */}
              {prediction?.advice?.length > 0 && (
                <div className="glass-panel">
                  <div className="section-header"><h2>AI Recommendations</h2><span className="section-badge ai">ML + Rules</span></div>
                  {prediction.advice.slice(0,4).map((rec, i) => (
                    <div key={i} className="rec-item">
                      <span className="rec-icon">{rec.icon}</span>
                      <div className="rec-content">
                        <div className="rec-category">{rec.category}</div>
                        <div className="rec-message">{rec.message}</div>
                        {rec.savings_kg > 0 && <div className="rec-savings">💚 Save ~{rec.savings_kg} kg CO₂</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Stats */}
              <div className="glass-panel">
                <div className="section-header"><h2>Quick Stats</h2></div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginTop:'0.5rem'}}>
                  <div style={{padding:'0.5rem', borderRadius:'8px', background:'rgba(16,185,129,0.06)', textAlign:'center'}}>
                    <div style={{fontSize:'1.2rem', fontWeight:800, color:'#10b981'}}>{stats?.best_day || 0}</div>
                    <div style={{fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase'}}>Best Day (kg)</div>
                  </div>
                  <div style={{padding:'0.5rem', borderRadius:'8px', background:'rgba(239,68,68,0.06)', textAlign:'center'}}>
                    <div style={{fontSize:'1.2rem', fontWeight:800, color:'#ef4444'}}>{stats?.worst_day || 0}</div>
                    <div style={{fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase'}}>Worst Day (kg)</div>
                  </div>
                  <div style={{padding:'0.5rem', borderRadius:'8px', background:'rgba(59,130,246,0.06)', textAlign:'center'}}>
                    <div style={{fontSize:'1.2rem', fontWeight:800, color:'#3b82f6'}}>{stats?.total_entries || 0}</div>
                    <div style={{fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase'}}>Total Entries</div>
                  </div>
                  <div style={{padding:'0.5rem', borderRadius:'8px', background:'rgba(139,92,246,0.06)', textAlign:'center'}}>
                    <div style={{fontSize:'1.2rem', fontWeight:800, color:'#8b5cf6'}}>{user?.eco_score || 0}</div>
                    <div style={{fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase'}}>Eco Points</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ LOG TAB ══════════════════ */}
      {activeTab === 'log' && (
        <div className="fade-in" style={{maxWidth:'700px', margin:'0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>Log Carbon Emissions</h2></div>
            <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:'0.75rem'}}>
              <div><label className="form-label">🚗 Transport</label>
                <div className="form-row">
                  <select className="form-control" value={form.transport_mode} onChange={e=>setForm({...form, transport_mode:e.target.value})}>
                    <option value="car">🚗 Car</option><option value="public">🚌 Public Transit</option><option value="bike">🚲 Bike</option><option value="flight">✈️ Flight</option><option value="ev">⚡ EV</option>
                  </select>
                  <input type="number" className="form-control" value={form.transport_km} onChange={e=>setForm({...form, transport_km:e.target.value})} placeholder="Distance (km)" required />
                </div>
              </div>
              <div><label className="form-label">⚡ Electricity</label>
                <input type="number" step="0.1" className="form-control" value={form.electricity_kwh} onChange={e=>setForm({...form, electricity_kwh:e.target.value})} placeholder="Usage (kWh)" required />
              </div>
              <div><label className="form-label">🍽️ Food</label>
                <div className="form-row">
                  <select className="form-control" value={form.food_diet} onChange={e=>setForm({...form, food_diet:e.target.value})}>
                    <option value="vegan">🌱 Vegan</option><option value="veg">🥬 Vegetarian</option><option value="non_veg">🍖 Non-Vegetarian</option>
                  </select>
                  <input type="number" className="form-control" value={form.food_meals} onChange={e=>setForm({...form, food_meals:e.target.value})} placeholder="Meals/day" min="1" max="6" />
                </div>
              </div>
              <div><label className="form-label">🏭 Industrial / Device Usage</label>
                <input type="number" step="0.1" className="form-control" value={form.industrial_hours} onChange={e=>setForm({...form, industrial_hours:e.target.value})} placeholder="Heavy device hours" />
              </div>
              <div><label className="form-label">🗑️ Waste</label>
                <div className="form-row">
                  <input type="number" step="0.1" className="form-control" value={form.waste_kg} onChange={e=>setForm({...form, waste_kg:e.target.value})} placeholder="Waste (kg)" required />
                  <input type="number" className="form-control" value={form.waste_recycled_pct} onChange={e=>setForm({...form, waste_recycled_pct:e.target.value})} placeholder="Recycled %" min="0" max="100" />
                </div>
              </div>
              <div><label className="form-label">📍 Location (Optional)</label>
                <div className="form-row">
                  <input type="text" className="form-control" value={form.city} onChange={e=>setForm({...form, city:e.target.value})} placeholder="City" />
                  <input type="number" step="0.001" className="form-control" value={form.latitude} onChange={e=>setForm({...form, latitude:e.target.value})} placeholder="Lat" />
                  <input type="number" step="0.001" className="form-control" value={form.longitude} onChange={e=>setForm({...form, longitude:e.target.value})} placeholder="Lng" />
                </div>
              </div>
              <button type="submit" className="btn" style={{marginTop:'0.5rem'}}>🌍 Record Emissions</button>
            </form>
          </div>

          {/* Recent History Table */}
          <div className="glass-panel" style={{marginTop:'1.5rem'}}>
            <div className="section-header"><h2>Recent Entries</h2><span className="section-badge live">Live</span></div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.8rem'}}>
                <thead><tr style={{color:'var(--text-muted)', borderBottom:'1px solid var(--glass-border)'}}>
                  <th style={{padding:'0.5rem', textAlign:'left'}}>Mode</th><th style={{padding:'0.5rem'}}>km</th><th style={{padding:'0.5rem'}}>kWh</th><th style={{padding:'0.5rem'}}>Waste</th><th style={{padding:'0.5rem'}}>CO₂</th>
                </tr></thead>
                <tbody>
                  {history.slice(-10).reverse().map((e, i) => (
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                      <td style={{padding:'0.4rem 0.5rem'}}>{e.transport_mode === 'car' ? '🚗' : e.transport_mode === 'flight' ? '✈️' : e.transport_mode === 'bike' ? '🚲' : e.transport_mode === 'ev' ? '⚡' : '🚌'} {e.transport_mode}</td>
                      <td style={{padding:'0.4rem', textAlign:'center'}}>{e.transport_km}</td>
                      <td style={{padding:'0.4rem', textAlign:'center'}}>{e.electricity_kwh}</td>
                      <td style={{padding:'0.4rem', textAlign:'center'}}>{e.waste_kg}kg</td>
                      <td style={{padding:'0.4rem', textAlign:'center', fontWeight:700, color: e.total_carbon_kg > 15 ? '#ef4444' : e.total_carbon_kg > 8 ? '#f59e0b' : '#10b981'}}>{e.total_carbon_kg.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ IoT TAB ══════════════════ */}
      {activeTab === 'iot' && (
        <div className="fade-in">
          <div className="glass-panel">
            <div className="section-header"><h2>IoT Sensor Dashboard</h2><span className="section-badge iot">Real-Time</span></div>
            <p style={{color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:'1rem'}}>
              Live sensor data from connected IoT devices (ESP32, MQ2, Power Monitors).
              Send data to <code style={{color:'var(--accent-cyan)'}}>POST /api/iot/data</code>
            </p>
            {iotData.length === 0 ? (
              <div style={{textAlign:'center', padding:'3rem', color:'var(--text-muted)'}}>
                <div style={{fontSize:'3rem', marginBottom:'1rem'}}>📡</div>
                <p>No IoT devices connected yet.</p>
                <p style={{fontSize:'0.8rem', marginTop:'0.5rem'}}>Send sensor data via the API to see live readings here.</p>
                <div style={{marginTop:'1rem', padding:'1rem', background:'rgba(0,0,0,0.3)', borderRadius:'8px', textAlign:'left', fontSize:'0.8rem'}}>
                  <code style={{color:'var(--accent-cyan)'}}>
                    curl -X POST http://localhost:8000/api/iot/data \<br/>
                    &nbsp;&nbsp;-H "Content-Type: application/json" \<br/>
                    &nbsp;&nbsp;-d '{`{"device_id":"esp32_01","sensor_type":"power","value":3.5,"unit":"kWh"}`}'
                  </code>
                </div>
              </div>
            ) : (
              <div className="iot-grid">
                {iotData.map((d, i) => (
                  <div key={i} className="iot-card">
                    <div style={{fontSize:'1.5rem', marginBottom:'0.25rem'}}>
                      {d.sensor_type === 'power' ? '⚡' : d.sensor_type === 'gas' ? '💨' : d.sensor_type === 'temperature' ? '🌡️' : '💧'}
                    </div>
                    <div className="iot-value">{d.value}</div>
                    <div className="iot-label">{d.sensor_type} ({d.unit})</div>
                    <div className="iot-device">{d.device_id}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ ALERTS TAB ══════════════════ */}
      {activeTab === 'alerts' && (
        <div className="fade-in" style={{maxWidth:'700px', margin:'0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>Notifications & Alerts</h2></div>
            {alerts.length === 0 ? (
              <div style={{textAlign:'center', padding:'2rem', color:'var(--text-muted)'}}>
                <div style={{fontSize:'3rem', marginBottom:'0.5rem'}}>✅</div>
                <p>No alerts. You're doing great!</p>
              </div>
            ) : (
              alerts.map((a, i) => (
                <div key={i} className={`alert-item ${a.alert_type}`}>
                  <span style={{fontSize:'1.2rem'}}>{a.alert_type === 'critical' ? '🚨' : '⚠️'}</span>
                  <div style={{flex:1}}>
                    <div className="alert-message">{a.message}</div>
                    <div className="alert-time">{new Date(a.timestamp).toLocaleString()}</div>
                  </div>
                  {!a.is_read && <span style={{width:8,height:8,borderRadius:'50%',background:'var(--accent-blue)',flexShrink:0}}></span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ LEADERBOARD TAB ══════════════════ */}
      {activeTab === 'leaderboard' && (
        <div className="fade-in" style={{maxWidth:'600px', margin:'0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>🏆 Global Leaderboard</h2><span className="section-badge live">Live</span></div>
            {leaderboard.map((u, i) => (
              <div key={i} className="leader-item" style={u.id === user?.id ? {background:'rgba(16,185,129,0.08)', borderRadius:'8px', padding:'0.6rem 0.5rem'} : {}}>
                <span className={`leader-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}`}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                </span>
                <span className="leader-name" style={u.id===user?.id?{color:'#10b981',fontWeight:700}:{}}>
                  {u.username} {u.id===user?.id && '(You)'}
                </span>
                <div style={{textAlign:'right'}}>
                  <div className="leader-score">{u.eco_score} pts</div>
                  <div style={{fontSize:'0.7rem', color:'var(--text-muted)'}}>Green: {u.green_score?.toFixed(0) || 50}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
