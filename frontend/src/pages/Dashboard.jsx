import React, { useState, useEffect, useMemo } from 'react';
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

const TABS = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'log', icon: '✏️', label: 'Log Data' },
  { id: 'analytics', icon: '📈', label: 'Analytics' },
  { id: 'iot', icon: '📡', label: 'IoT Sensors' },
  { id: 'alerts', icon: '🔔', label: 'Alerts' },
  { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
];

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
  const [submitting, setSubmitting] = useState(false);
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
    ws.onmessage = () => loadAll();
    return () => ws.close();
  }, []);

  const loadAll = () => { fetchMe(); fetchHistory(); fetchPrediction(); fetchLeaderboard(); fetchStats(); fetchAlerts(); fetchIoT(); };
  const fetchMe = async () => { try { const r = await api.get('/auth/me'); setUser(r.data); } catch { navigate('/login'); } };
  const fetchHistory = async () => { try { setHistory((await api.get('/carbon/history')).data); } catch {} };
  const fetchPrediction = async () => { try { setPrediction((await api.get('/carbon/predict')).data); } catch {} };
  const fetchLeaderboard = async () => { try { setLeaderboard((await api.get('/carbon/leaderboard')).data); } catch {} };
  const fetchStats = async () => { try { setStats((await api.get('/carbon/stats')).data); } catch {} };
  const fetchAlerts = async () => { try { setAlerts((await api.get('/alerts')).data); } catch {} };
  const fetchIoT = async () => { try { setIotData((await api.get('/iot/latest')).data); } catch {} };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/carbon', {
        transport_mode: form.transport_mode, transport_km: parseFloat(form.transport_km) || 0,
        electricity_kwh: parseFloat(form.electricity_kwh) || 0, food_diet: form.food_diet,
        food_meals: parseInt(form.food_meals) || 3, industrial_hours: parseFloat(form.industrial_hours) || 0,
        waste_kg: parseFloat(form.waste_kg) || 0, waste_recycled_pct: parseFloat(form.waste_recycled_pct) || 0,
        latitude: parseFloat(form.latitude) || null, longitude: parseFloat(form.longitude) || null,
        city: form.city || null,
      });
      setForm({ transport_mode: 'car', transport_km: '', electricity_kwh: '', food_diet: 'veg', food_meals: '3', industrial_hours: '0', waste_kg: '', waste_recycled_pct: '0', latitude: '', longitude: '', city: '' });
    } catch { alert("Failed to submit"); }
    setSubmitting(false);
  };

  const downloadReport = async () => {
    try {
      const resp = await api.get('/carbon/report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'carbon_report.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { alert("Could not download report"); }
  };

  const handleLogout = () => { localStorage.removeItem('token'); navigate('/login'); };

  // Computed values
  const totalCarbon = useMemo(() => history.reduce((a, c) => a + c.total_carbon_kg, 0), [history]);
  const avgCarbon = useMemo(() => history.length ? totalCarbon / history.length : 0, [history, totalCarbon]);
  const unreadAlerts = alerts.filter(a => !a.is_read).length;
  const greenScore = user?.green_score || 50;
  const greenColor = greenScore > 70 ? 'var(--accent-emerald)' : greenScore > 40 ? 'var(--accent-amber)' : 'var(--accent-red)';
  const rank = leaderboard.findIndex(l => l.id === user?.id) + 1;

  // Chart shared config
  const darkOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#8899bb', font: { size: 10, family: 'Inter' }, padding: 12 }, position: 'top' } },
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#6b7a99', font: { size: 9 } } },
      x: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#6b7a99', font: { size: 9 } } }
    }
  };

  const trendData = {
    labels: history.map((_, i) => `#${i + 1}`),
    datasets: [
      { fill: true, label: 'Emissions (kg CO₂)', data: history.map(d => d.total_carbon_kg),
        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.06)', tension: 0.4, pointRadius: 1.5, borderWidth: 2 },
      ...(prediction?.trend?.length ? [{ label: '7-Day AI Forecast', data: [...Array(history.length).fill(null), ...prediction.trend.slice(0,7)],
        borderColor: '#8b5cf6', borderDash: [6,4], tension: 0.4, pointRadius: 0, borderWidth: 2 }] : [])
    ]
  };

  const catDoughnut = {
    labels: ['Transport', 'Electricity', 'Food', 'Waste', 'Industrial'],
    datasets: [{ data: [stats?.transport_total||0, stats?.electricity_total||0, stats?.food_total||0, stats?.waste_total||0, stats?.industrial_total||0],
      backgroundColor: ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6'], borderWidth: 0, cutout: '72%', spacing: 2 }]
  };

  const transportBreakdown = useMemo(() => {
    const modes = {};
    history.forEach(e => { modes[e.transport_mode] = (modes[e.transport_mode] || 0) + 1; });
    return { labels: Object.keys(modes).map(m => m.charAt(0).toUpperCase() + m.slice(1)),
      datasets: [{ data: Object.values(modes), backgroundColor: ['#f59e0b','#3b82f6','#10b981','#ef4444','#06b6d4'], borderWidth: 0 }] };
  }, [history]);

  const weeklyData = useMemo(() => {
    const weeks = {};
    history.forEach(e => {
      const d = new Date(e.timestamp);
      const wk = `W${Math.ceil(d.getDate() / 7)}`;
      weeks[wk] = (weeks[wk] || 0) + e.total_carbon_kg;
    });
    return { labels: Object.keys(weeks),
      datasets: [{ label: 'Weekly Total (kg)', data: Object.values(weeks),
        backgroundColor: 'rgba(59,130,246,0.3)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 6 }] };
  }, [history]);

  const radarData = {
    labels: ['Transport', 'Electricity', 'Food', 'Waste', 'Industrial'],
    datasets: [{
      label: 'Your Footprint',
      data: [ Math.min(100,(stats?.transport_total||0)*2), Math.min(100,(stats?.electricity_total||0)*2),
        Math.min(100,(stats?.food_total||0)*2), Math.min(100,(stats?.waste_total||0)*5), Math.min(100,(stats?.industrial_total||0)*3) ],
      backgroundColor: 'rgba(16,185,129,0.1)', borderColor: '#10b981', pointBackgroundColor: '#10b981', borderWidth: 2, pointRadius: 3
    }]
  };
  const radarOpts = { ...darkOpts, scales: { r: { grid: { color:'rgba(255,255,255,0.04)' }, pointLabels: { color:'#6b7a99', font:{size:10} }, ticks: { display:false }, angleLines: { color:'rgba(255,255,255,0.04)' } } } };

  const getCarbonClass = (v) => v > 15 ? 'high' : v > 8 ? 'medium' : 'low';
  const getModeEmoji = (m) => ({ car:'🚗', flight:'✈️', bike:'🚲', ev:'⚡', public:'🚌' }[m] || '🚗');

  return (
    <div className="dashboard-container">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <h1>🌍 Carbon Intelligence</h1>
          <div className="header-subtitle">
            <span>Welcome, <strong>{user?.username}</strong></span>
            <span className="header-stat">🏅 Eco: <strong style={{color:'var(--accent-emerald)'}}>{user?.eco_score}</strong></span>
            <span className="header-stat">🌿 Green: <strong style={{color:greenColor}}>{greenScore}%</strong></span>
            {rank > 0 && <span className="header-stat">🏆 Rank: <strong style={{color:'var(--accent-amber)'}}>#{rank}</strong></span>}
          </div>
        </div>
        <div className="nav-actions">
          <div className="live-indicator">
            {isConnected ? <><div className="pulse"></div>Live</> : <><div className="pulse" style={{background:'var(--accent-red)',animation:'none'}}></div>Offline</>}
          </div>
          <button className="btn-sm btn-blue" onClick={downloadReport}>📄 PDF</button>
          <button className="btn-sm btn-outline btn-red" onClick={handleLogout} style={{borderColor:'rgba(239,68,68,0.2)',color:'var(--accent-red)'}}>Logout</button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${activeTab===t.id?'active':''}`} onClick={()=>setActiveTab(t.id)}>
            {t.icon} {t.label}
            {t.id === 'alerts' && unreadAlerts > 0 && <span className="tab-count">{unreadAlerts}</span>}
          </button>
        ))}
      </div>

      {/* ══════════ OVERVIEW ══════════ */}
      {activeTab === 'overview' && (
        <div className="fade-in">
          <div className="metrics-grid">
            {[
              { icon:'🌡️', title:'Total Emissions', value: totalCarbon.toFixed(1), unit:'kg CO₂', color:'var(--accent-emerald)' },
              { icon:'📈', title:'Average / Entry', value: avgCarbon.toFixed(1), unit:'kg CO₂', color:'var(--accent-blue)' },
              { icon:'🤖', title:'AI Prediction', value: prediction?.predicted_next_carbon_kg?.toFixed(1) || '--', unit:'kg CO₂', color:'var(--accent-purple)' },
              { icon:'🏅', title:'Eco Score', value: user?.eco_score || 0, unit:'pts', color:'var(--accent-amber)' },
              { icon:'🌿', title:'Green Score', value: greenScore, unit:'%', color: greenColor },
              { icon:'📊', title:'Total Entries', value: stats?.total_entries || 0, unit:'', color:'var(--accent-cyan)' },
            ].map((m, i) => (
              <div key={i} className="glass-panel metric-card">
                <span className="metric-icon">{m.icon}</span>
                <span className="metric-title">{m.title}</span>
                <span className="metric-value" style={{color: m.color}}>{m.value} <span className="metric-unit">{m.unit}</span></span>
              </div>
            ))}
          </div>

          {/* Green Score Progress */}
          <div className="glass-panel" style={{marginBottom:'1.25rem', padding:'1rem 1.25rem'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem'}}>
              <span style={{fontSize:'0.8rem',fontWeight:600}}>🌱 Sustainability Score</span>
              <span style={{fontSize:'0.85rem',fontWeight:800,color:greenColor}}>{greenScore}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{width:`${greenScore}%`, background:`linear-gradient(90deg, var(--accent-emerald), ${greenColor})`}}></div>
            </div>
            <p style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'0.35rem'}}>
              {greenScore > 70 ? 'Excellent! You are a sustainability champion.' : greenScore > 40 ? 'Good progress. Keep reducing your footprint!' : 'Needs improvement. Check AI recommendations above.'}
            </p>
          </div>

          <div className="main-grid">
            <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              {/* Trend Chart */}
              <div className="glass-panel">
                <div className="section-header">
                  <h2>Emission Trends</h2>
                  <span className="section-badge ai">AI Enhanced</span>
                </div>
                <div className="chart-container"><Line data={trendData} options={darkOpts} /></div>
              </div>
              {/* Weekly Bars */}
              <div className="glass-panel">
                <div className="section-header"><h2>Weekly Breakdown</h2></div>
                <div className="chart-container"><Bar data={weeklyData} options={{...darkOpts, plugins:{...darkOpts.plugins, legend:{display:false}}}} /></div>
              </div>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              {/* Doughnut */}
              <div className="glass-panel">
                <div className="section-header"><h2>Category Split</h2></div>
                <div style={{height:'200px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Doughnut data={catDoughnut} options={{...darkOpts, scales:{}, plugins:{...darkOpts.plugins, legend:{position:'bottom',labels:{color:'#8899bb',font:{size:9},padding:6}}}}} />
                </div>
              </div>

              {/* AI Recommendations */}
              {prediction?.advice?.length > 0 && (
                <div className="glass-panel">
                  <div className="section-header"><h2>AI Recommendations</h2><span className="section-badge ai">ML</span></div>
                  {prediction.advice.slice(0,3).map((r, i) => (
                    <div key={i} className="rec-item">
                      <span className="rec-icon">{r.icon}</span>
                      <div className="rec-content">
                        <div className="rec-category">{r.category}</div>
                        <div className="rec-message">{r.message}</div>
                        {r.savings_kg > 0 && <div className="rec-savings">💚 Save ~{r.savings_kg} kg</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Stats */}
              <div className="glass-panel">
                <div className="section-header"><h2>Quick Stats</h2></div>
                <div className="stat-grid">
                  <div className="stat-box" style={{background:'var(--accent-emerald-dim)'}}>
                    <div className="stat-box-value" style={{color:'var(--accent-emerald)'}}>{stats?.best_day || 0}</div>
                    <div className="stat-box-label">Best Day (kg)</div>
                  </div>
                  <div className="stat-box" style={{background:'var(--accent-red-dim)'}}>
                    <div className="stat-box-value" style={{color:'var(--accent-red)'}}>{stats?.worst_day || 0}</div>
                    <div className="stat-box-label">Worst Day (kg)</div>
                  </div>
                  <div className="stat-box" style={{background:'var(--accent-blue-dim)'}}>
                    <div className="stat-box-value" style={{color:'var(--accent-blue)'}}>{history.length}</div>
                    <div className="stat-box-label">Entries</div>
                  </div>
                  <div className="stat-box" style={{background:'var(--accent-purple-dim)'}}>
                    <div className="stat-box-value" style={{color:'var(--accent-purple)'}}>{user?.eco_score || 0}</div>
                    <div className="stat-box-label">Eco Points</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ LOG TAB ══════════ */}
      {activeTab === 'log' && (
        <div className="fade-in" style={{maxWidth:'750px',margin:'0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>Log Carbon Emissions</h2><span className="section-badge new">New Entry</span></div>
            <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'0.65rem'}}>
              <div><label className="form-label">🚗 Transport Mode & Distance</label>
                <div className="form-row">
                  <select className="form-control" value={form.transport_mode} onChange={e=>setForm({...form,transport_mode:e.target.value})}>
                    <option value="car">🚗 Car</option><option value="public">🚌 Public Transit</option><option value="bike">🚲 Bike / Walk</option><option value="flight">✈️ Flight</option><option value="ev">⚡ Electric Vehicle</option>
                  </select>
                  <input type="number" className="form-control" value={form.transport_km} onChange={e=>setForm({...form,transport_km:e.target.value})} placeholder="Distance (km)" required />
                </div>
              </div>
              <div><label className="form-label">⚡ Electricity Consumption</label>
                <input type="number" step="0.1" className="form-control" value={form.electricity_kwh} onChange={e=>setForm({...form,electricity_kwh:e.target.value})} placeholder="Usage in kWh" required />
              </div>
              <div><label className="form-label">🍽️ Food & Diet</label>
                <div className="form-row">
                  <select className="form-control" value={form.food_diet} onChange={e=>setForm({...form,food_diet:e.target.value})}>
                    <option value="vegan">🌱 Vegan</option><option value="veg">🥬 Vegetarian</option><option value="non_veg">🍖 Non-Vegetarian</option>
                  </select>
                  <input type="number" className="form-control" value={form.food_meals} onChange={e=>setForm({...form,food_meals:e.target.value})} placeholder="Meals/day" min="1" max="6" />
                </div>
              </div>
              <div><label className="form-label">🏭 Industrial / Device Usage</label>
                <input type="number" step="0.1" className="form-control" value={form.industrial_hours} onChange={e=>setForm({...form,industrial_hours:e.target.value})} placeholder="Heavy device hours (optional)" />
              </div>
              <div><label className="form-label">🗑️ Waste Generation</label>
                <div className="form-row">
                  <input type="number" step="0.1" className="form-control" value={form.waste_kg} onChange={e=>setForm({...form,waste_kg:e.target.value})} placeholder="Waste (kg)" required />
                  <input type="number" className="form-control" value={form.waste_recycled_pct} onChange={e=>setForm({...form,waste_recycled_pct:e.target.value})} placeholder="% Recycled" min="0" max="100" />
                </div>
              </div>
              <div><label className="form-label">📍 Location (Optional - for geo tracking)</label>
                <div className="form-row">
                  <input type="text" className="form-control" value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="City name" />
                  <input type="number" step="0.001" className="form-control" value={form.latitude} onChange={e=>setForm({...form,latitude:e.target.value})} placeholder="Latitude" />
                  <input type="number" step="0.001" className="form-control" value={form.longitude} onChange={e=>setForm({...form,longitude:e.target.value})} placeholder="Longitude" />
                </div>
              </div>
              <button type="submit" className="btn" disabled={submitting} style={{marginTop:'0.35rem'}}>
                {submitting ? '⏳ Recording...' : '🌍 Record Emissions'}
              </button>
            </form>
          </div>

          {/* Recent Entries Table */}
          <div className="glass-panel fade-in-delay" style={{marginTop:'1.25rem'}}>
            <div className="section-header"><h2>Recent Entries</h2><span className="section-badge live">Live</span></div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead><tr><th>Mode</th><th>km</th><th>kWh</th><th>Diet</th><th>Waste</th><th>CO₂</th></tr></thead>
                <tbody>
                  {history.slice(-12).reverse().map((e, i) => (
                    <tr key={i}>
                      <td>{getModeEmoji(e.transport_mode)} {e.transport_mode}</td>
                      <td>{e.transport_km}</td>
                      <td>{e.electricity_kwh}</td>
                      <td>{e.food_diet === 'vegan' ? '🌱' : e.food_diet === 'veg' ? '🥬' : '🍖'}</td>
                      <td>{e.waste_kg} kg</td>
                      <td><span className={`carbon-badge ${getCarbonClass(e.total_carbon_kg)}`}>{e.total_carbon_kg.toFixed(1)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ANALYTICS TAB ══════════ */}
      {activeTab === 'analytics' && (
        <div className="fade-in">
          <div className="main-grid">
            <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header"><h2>Footprint Radar</h2></div>
                <div className="chart-container" style={{height:'280px'}}><Radar data={radarData} options={radarOpts} /></div>
              </div>
              <div className="glass-panel">
                <div className="section-header"><h2>Historical Trend</h2><span className="section-badge ai">AI Forecast</span></div>
                <div className="chart-container"><Line data={trendData} options={darkOpts} /></div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header"><h2>Transport Modes</h2></div>
                <div style={{height:'200px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Doughnut data={transportBreakdown} options={{...darkOpts, scales:{}, plugins:{...darkOpts.plugins, legend:{position:'bottom',labels:{color:'#8899bb',font:{size:9},padding:6}}}}} />
                </div>
              </div>
              <div className="glass-panel">
                <div className="section-header"><h2>Category Totals</h2></div>
                <div style={{display:'flex',flexDirection:'column',gap:'0.65rem',marginTop:'0.5rem'}}>
                  {[
                    {label:'Transport',value:stats?.transport_total||0,color:'var(--accent-amber)',max:Math.max(stats?.transport_total||1,stats?.electricity_total||1,stats?.food_total||1,stats?.waste_total||1,stats?.industrial_total||1)},
                    {label:'Electricity',value:stats?.electricity_total||0,color:'var(--accent-blue)'},
                    {label:'Food',value:stats?.food_total||0,color:'var(--accent-emerald)'},
                    {label:'Waste',value:stats?.waste_total||0,color:'var(--accent-red)'},
                    {label:'Industrial',value:stats?.industrial_total||0,color:'var(--accent-purple)'},
                  ].map((cat,i) => {
                    const maxVal = Math.max(stats?.transport_total||1,stats?.electricity_total||1,stats?.food_total||1);
                    return (
                    <div key={i}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem',marginBottom:'0.2rem'}}>
                        <span style={{color:'var(--text-secondary)',fontWeight:500}}>{cat.label}</span>
                        <span style={{fontWeight:700,color:cat.color}}>{cat.value.toFixed(1)} kg</span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{width:`${Math.min(100,cat.value/maxVal*100)}%`,background:cat.color}}></div>
                      </div>
                    </div>
                  )})}
                </div>
              </div>

              {/* All Recommendations */}
              {prediction?.advice?.length > 0 && (
                <div className="glass-panel">
                  <div className="section-header"><h2>All AI Insights</h2><span className="section-badge ai">ML + Rules</span></div>
                  {prediction.advice.map((r, i) => (
                    <div key={i} className="rec-item">
                      <span className="rec-icon">{r.icon}</span>
                      <div className="rec-content">
                        <div className="rec-category">{r.category}</div>
                        <div className="rec-message">{r.message}</div>
                        {r.savings_kg > 0 && <div className="rec-savings">💚 ~{r.savings_kg} kg saved</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ IoT TAB ══════════ */}
      {activeTab === 'iot' && (
        <div className="fade-in">
          <div className="glass-panel">
            <div className="section-header"><h2>IoT Sensor Dashboard</h2><span className="section-badge iot">Real-Time</span></div>
            <p style={{color:'var(--text-muted)',fontSize:'0.8rem',marginBottom:'0.85rem'}}>
              Live sensor readings from connected ESP32, MQ2, and power monitoring devices.
            </p>
            {iotData.length === 0 ? (
              <div style={{textAlign:'center',padding:'2.5rem',color:'var(--text-muted)'}}>
                <div style={{fontSize:'2.5rem',marginBottom:'0.75rem'}}>📡</div>
                <p style={{fontWeight:500}}>No IoT devices connected</p>
                <p style={{fontSize:'0.75rem',marginTop:'0.35rem'}}>Send sensor data via <code style={{color:'var(--accent-cyan)',background:'rgba(6,182,212,0.1)',padding:'0.15rem 0.35rem',borderRadius:'4px'}}>POST /api/iot/data</code></p>
              </div>
            ) : (
              <div className="iot-grid">
                {iotData.map((d, i) => (
                  <div key={i} className="iot-card">
                    <div className="iot-emoji">
                      {d.sensor_type==='power'?'⚡':d.sensor_type==='gas'?'💨':d.sensor_type==='temperature'?'🌡️':'💧'}
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

      {/* ══════════ ALERTS TAB ══════════ */}
      {activeTab === 'alerts' && (
        <div className="fade-in" style={{maxWidth:'700px',margin:'0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>Notifications</h2><span className="section-badge alert">{unreadAlerts} unread</span></div>
            {alerts.length === 0 ? (
              <div style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>
                <div style={{fontSize:'2.5rem',marginBottom:'0.5rem'}}>✅</div><p>No alerts — you're doing great!</p>
              </div>
            ) : alerts.map((a, i) => (
              <div key={i} className={`alert-item ${a.alert_type}`}>
                <span style={{fontSize:'1.1rem'}}>{a.alert_type==='critical'?'🚨':'⚠️'}</span>
                <div style={{flex:1}}>
                  <div className="alert-message">{a.message}</div>
                  <div className="alert-time">{new Date(a.timestamp).toLocaleString()}</div>
                </div>
                {!a.is_read && <div className="alert-unread"></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ LEADERBOARD TAB ══════════ */}
      {activeTab === 'leaderboard' && (
        <div className="fade-in" style={{maxWidth:'600px',margin:'0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>🏆 Global Leaderboard</h2><span className="section-badge live">Live</span></div>
            {leaderboard.map((u, i) => (
              <div key={i} className="leader-item" style={u.id===user?.id?{background:'var(--accent-emerald-dim)',borderRadius:'8px',padding:'0.6rem 0.5rem'}:{}}>
                <span className={`leader-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}`}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                </span>
                <span className="leader-name" style={u.id===user?.id?{color:'var(--accent-emerald)',fontWeight:700}:{}}>
                  {u.username} {u.id===user?.id && '(You)'}
                </span>
                <div style={{textAlign:'right'}}>
                  <div className="leader-score">{u.eco_score} pts</div>
                  <div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>Green: {u.green_score?.toFixed(0)||50}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
