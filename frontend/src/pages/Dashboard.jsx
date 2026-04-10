import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler, BarElement, ArcElement, RadialLinearScale, ScatterController, BubbleController
} from 'chart.js';
import { Line, Bar, Doughnut, Radar, Scatter, Bubble, PolarArea } from 'react-chartjs-2';
import api from '../api';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, RadialLinearScale, ScatterController, BubbleController, Title, Tooltip, Legend, Filler
);

const TABS = [
  { id: 'overview', icon: '🌍', label: 'Overview' },
  { id: 'analytics', icon: '📈', label: 'Analytics' },
  { id: 'community', icon: '🤝', label: 'Community' },
  { id: 'log', icon: '✏️', label: 'Log Data' },
  { id: 'iot', icon: '📡', label: 'IoT Sensors' },
  { id: 'alerts', icon: '🔔', label: 'Alerts' },
];

export default function Dashboard() {
  const [history, setHistory] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [community, setCommunity] = useState(null);
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

  const loadAll = () => { fetchMe(); fetchHistory(); fetchPrediction(); fetchLeaderboard(); fetchStats(); fetchAlerts(); fetchIoT(); fetchCommunity(); };
  const fetchMe = async () => { try { const r = await api.get('/auth/me'); setUser(r.data); } catch { navigate('/login'); } };
  const fetchHistory = async () => { try { setHistory((await api.get('/carbon/history')).data); } catch {} };
  const fetchPrediction = async () => { try { setPrediction((await api.get('/carbon/predict')).data); } catch {} };
  const fetchLeaderboard = async () => { try { setLeaderboard((await api.get('/carbon/leaderboard')).data); } catch {} };
  const fetchStats = async () => { try { setStats((await api.get('/carbon/stats')).data); } catch {} };
  const fetchAlerts = async () => { try { setAlerts((await api.get('/alerts')).data); } catch {} };
  const fetchIoT = async () => { try { setIotData((await api.get('/iot/latest')).data); } catch {} };
  const fetchCommunity = async () => { try { setCommunity((await api.get('/carbon/community')).data); } catch {} };

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
      loadAll();
      setActiveTab('overview');
    } catch { alert("Failed to log data"); }
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

  // ── COMPUTED METRICS ──
  const totalCarbon = useMemo(() => history.reduce((a, c) => a + c.total_carbon_kg, 0), [history]);
  const avgCarbon = useMemo(() => history.length ? totalCarbon / history.length : 0, [history, totalCarbon]);
  const unreadAlerts = alerts.filter(a => !a.is_read).length;
  const greenScore = user?.green_score || 50;
  const greenColor = greenScore > 70 ? 'var(--accent-emerald)' : greenScore > 40 ? 'var(--accent-amber)' : 'var(--accent-red)';
  const rank = leaderboard.findIndex(l => l.id === user?.id) + 1;
  const comAvg = community?.avg_carbon || 15;
  const targetPerEntry = comAvg * 0.8; // Target is 20% better than average

  // ── SHARED CHART CONFIG ──
  const darkOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#8899bb', font: { size: 10, family: 'Inter' } }, position: 'top' } },
    scales: {
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#6b7a99', font: { size: 9 } } },
      x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#6b7a99', font: { size: 9 } } }
    }
  };
  const noLegend = { ...darkOpts, plugins: { ...darkOpts.plugins, legend: { display: false } } };

  // ── CHARTS ──
  // 1. Line Trend with AI
  const trendData = {
    labels: [...history.map((_, i) => `#${i + 1}`), ...(prediction?.trend?.length ? prediction.trend.slice(0, 5).map((_, i) => `F${i + 1}`) : [])],
    datasets: [
      { fill: true, label: 'Actual CO₂ (kg)', data: history.map(d => d.total_carbon_kg), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, pointRadius: 2, borderWidth: 2 },
      ...(prediction?.trend?.length ? [{ label: 'AI Forecast', data: [...Array(history.length).fill(null), ...prediction.trend.slice(0, 5)], borderColor: '#8b5cf6', borderDash: [5, 5], tension: 0.4, pointRadius: 0, borderWidth: 2 }] : [])
    ]
  };

  // 2. Budget Speedometer Gauge (Half Doughnut)
  const budgetGoal = 300; // Example monthly budget
  const gaugeData = {
    labels: ['Used Budget', 'Remaining'],
    datasets: [{
      data: [Math.min(totalCarbon, budgetGoal), Math.max(0, budgetGoal - totalCarbon)],
      backgroundColor: [totalCarbon > budgetGoal ? '#ef4444' : totalCarbon > budgetGoal*0.8 ? '#f59e0b' : '#10b981', 'rgba(255,255,255,0.05)'],
      borderWidth: 0,
      circumference: 180,
      rotation: 270,
    }]
  };

  // 3. Category Doughnut
  const catDoughnut = {
    labels: ['Transport', 'Electricity', 'Food', 'Waste', 'Industrial'],
    datasets: [{ data: [stats?.transport_total || 0, stats?.electricity_total || 0, stats?.food_total || 0, stats?.waste_total || 0, stats?.industrial_total || 0],
      backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'], borderWidth: 0, cutout: '75%', hoverOffset: 8 }]
  };

  // 4. Polar Area DNA
  const polarData = {
    labels: ['Transport', 'Electricity', 'Food', 'Waste', 'Industrial'],
    datasets: [{
      label: 'Footprint DNA',
      data: [stats?.transport_total || 0, stats?.electricity_total || 0, stats?.food_total || 0, stats?.waste_total || 0, stats?.industrial_total || 0],
      backgroundColor: ['rgba(245, 158, 11, 0.4)', 'rgba(59, 130, 246, 0.4)', 'rgba(16, 185, 129, 0.4)', 'rgba(239, 68, 68, 0.4)', 'rgba(139, 92, 246, 0.4)'],
      borderColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'],
      borderWidth: 1,
    }]
  };
  const polarOpts = { ...darkOpts, scales: { r: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { display: false } } } };

  // 5. Activity Impact Matrix (Bubble Chart)
  const bubbleData = {
    datasets: [{
      label: 'Recent Activities',
      data: history.map((e, i) => ({
        x: i, // Time entry index
        y: e.total_carbon_kg, // Impact
        r: Math.max(5, Math.min(25, e.total_carbon_kg * 1.5)) // Bubble size based on impact
      })),
      backgroundColor: 'rgba(59, 130, 246, 0.5)',
      borderColor: '#3b82f6'
    }]
  };
  const bubbleOpts = { ...darkOpts, scales: { x: { title: { display: true, text: 'Time (Entry #)', color: '#8899bb' } }, y: { title: { display: true, text: 'CO₂ Emitted (kg)', color: '#8899bb' } } } };

  // 6. Footprint Radar

  const radarData = {
    labels: ['Transport', 'Electricity', 'Food', 'Waste', 'Industrial'],
    datasets: [{ label: 'Your Footprint',
      data: [Math.min(100, (stats?.transport_total || 0) * 1.5), Math.min(100, (stats?.electricity_total || 0) * 1.5), Math.min(100, (stats?.food_total || 0) * 2), Math.min(100, (stats?.waste_total || 0) * 5), Math.min(100, (stats?.industrial_total || 0) * 3)],
      backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: '#3b82f6', pointBackgroundColor: '#3b82f6', borderWidth: 2, pointRadius: 3
    }]
  };
  const radarOpts = { ...darkOpts, scales: { r: { grid: { color: 'rgba(255,255,255,0.04)' }, pointLabels: { color: '#6b7a99', font: { size: 10 } }, ticks: { display: false }, angleLines: { color: 'rgba(255,255,255,0.04)' } } } };

  // 4. Community Benchmarking Bar
  const compareData = {
    labels: ['Your Average', 'Community Average', 'Suggested Target'],
    datasets: [{
      label: 'Avg CO₂ per entry (kg)',
      data: [avgCarbon.toFixed(1), comAvg.toFixed(1), targetPerEntry.toFixed(1)],
      backgroundColor: [
        avgCarbon <= targetPerEntry ? '#10b981' : avgCarbon > comAvg ? '#ef4444' : '#f59e0b',
        '#3b82f6',
        '#10b981'
      ],
      borderRadius: 6,
      barThickness: 40
    }]
  };

  // 5. Leaderboard Scatter (Eco Score vs Green Score)
  const scatterData = {
    datasets: [
      {
        label: 'Community Users',
        data: leaderboard.filter(l => l.id !== user?.id).map(l => ({ x: l.eco_score, y: l.green_score })),
        backgroundColor: 'rgba(6, 182, 212, 0.5)',
        pointRadius: 6,
      },
      {
        label: 'You',
        data: [{ x: user?.eco_score || 0, y: greenScore }],
        backgroundColor: '#10b981',
        pointRadius: 10,
        pointStyle: 'star'
      }
    ]
  };
  const scatterOpts = { ...darkOpts, scales: { x: { title: { display: true, text: 'Eco Score (Points)', color: '#8899bb' }, grid: { color: 'rgba(255,255,255,0.03)' } }, y: { title: { display: true, text: 'Green Score (%)', color: '#8899bb' }, grid: { color: 'rgba(255,255,255,0.03)' } } } };

  // 6. Transport Mode Breakdown
  const transportData = useMemo(() => {
    const modes = {};
    history.forEach(e => { modes[e.transport_mode] = (modes[e.transport_mode] || 0) + 1; });
    return {
      labels: Object.keys(modes).map(m => m.charAt(0).toUpperCase() + m.slice(1)),
      datasets: [{ data: Object.values(modes), backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#06b6d4'], borderWidth: 0 }]
    };
  }, [history]);

  const getCarbonClass = (v) => v > 15 ? 'high' : v > 8 ? 'medium' : 'low';
  const getModeEmoji = (m) => ({ car: '🚗', flight: '✈️', bike: '🚲', ev: '⚡', public: '🚌' }[m] || '🚗');

  return (
    <div className="dashboard-container">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-left">
          <h1>Carbon Intelligence</h1>
          <div className="header-subtitle">
            <span>Welcome back, <strong>{user?.username}</strong></span>
            <span className="header-stat">🏅 Eco Score: <strong style={{color:'var(--accent-emerald)'}}>{user?.eco_score}</strong></span>
            <span className="header-stat">🌿 Efficiency: <strong style={{color:greenColor}}>{greenScore}%</strong></span>
            {rank > 0 && <span className="header-stat">🏆 Global Rank: <strong style={{color:'var(--accent-amber)'}}>#{rank}</strong></span>}
          </div>
        </div>
        <div className="nav-actions">
          <div className="live-indicator">
            {isConnected ? <><div className="pulse"></div>Platform Live</> : <><div className="pulse" style={{background:'var(--accent-red)', animation:'none'}}></div>Offline</>}
          </div>
          <button className="btn-sm btn-blue" onClick={downloadReport}>📄 Export PDF</button>
          <button className="btn-sm btn-outline btn-red" onClick={handleLogout} style={{borderColor:'rgba(239,68,68,0.2)', color:'var(--accent-red)'}}>Sign Out</button>
        </div>
      </header>

      {/* ── TABS ── */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
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
              { icon: '🌡️', title: 'Total Emitted', value: totalCarbon.toFixed(1), unit: 'kg CO₂', color: 'var(--accent-emerald)' },
              { icon: '📉', title: 'Avg Per Entry', value: avgCarbon.toFixed(1), unit: 'kg CO₂', color: 'var(--accent-blue)' },
              { icon: '🤖', title: 'Next Entry Forecast', value: prediction?.predicted_next_carbon_kg?.toFixed(1) || '--', unit: 'kg CO₂', color: 'var(--accent-purple)' },
              { icon: '🎯', title: 'Target Check', value: avgCarbon <= targetPerEntry ? 'On Track' : 'Needs Work', unit: '', color: avgCarbon <= targetPerEntry ? 'var(--accent-emerald)' : 'var(--accent-amber)' },
              { icon: '📊', title: 'Total Logs', value: stats?.total_entries || 0, unit: 'Entries', color: 'var(--accent-cyan)' },
              { icon: '🌍', title: 'Community Savings', value: community?.total_saved_kg || 0, unit: 'kg CO₂', color: 'var(--accent-pink)' },
            ].map((m, i) => (
              <div key={i} className="glass-panel metric-card">
                <span className="metric-icon">{m.icon}</span>
                <span className="metric-title">{m.title}</span>
                <span className="metric-value" style={{color: m.color}}>{m.value} <span className="metric-unit">{m.unit}</span></span>
              </div>
            ))}
          </div>

          <div className="glass-panel" style={{marginBottom: '1.25rem', padding: '1rem 1.25rem'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
              <span style={{fontSize: '0.85rem', fontWeight: 600}}>Sustainability Progress Tracker</span>
              <span style={{fontSize: '0.9rem', fontWeight: 800, color: greenColor}}>{greenScore}% Efficiency</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{width: `${greenScore}%`, background: `linear-gradient(90deg, var(--accent-emerald), ${greenColor})`}}></div>
            </div>
          </div>

          <div className="main-grid">
            <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header">
                  <h2>Emissions Trend</h2>
                  <span className="section-badge ai">AI Forecast</span>
                </div>
                <div className="chart-container"><Line data={trendData} options={darkOpts} /></div>
              </div>

              {prediction?.advice?.length > 0 && (
                <div className="glass-panel">
                  <div className="section-header"><h2>Smart Recommendations</h2><span className="section-badge ai">ML Engine</span></div>
                  {prediction.advice.slice(0, 3).map((r, i) => (
                    <div key={i} className="rec-item">
                      <span className="rec-icon">{r.icon}</span>
                      <div className="rec-content">
                        <div className="rec-category">{r.category}</div>
                        <div className="rec-message">{r.message}</div>
                        {r.savings_kg > 0 && <div className="rec-savings">💚 Reduce ~{r.savings_kg} kg</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header"><h2>Carbon Budget Speedometer</h2><span className="section-badge ai">Target 300kg</span></div>
                <div style={{height: '220px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  <Doughnut data={gaugeData} options={{...noLegend, rotation: 270, circumference: 180, cutout: '80%'}} />
                  <div style={{position: 'absolute', top: '65%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center'}}>
                    <div style={{fontSize: '2rem', fontWeight: 900, color: totalCarbon > budgetGoal ? 'var(--accent-red)' : 'var(--text-main)'}}>{totalCarbon.toFixed(0)}</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>kg CO₂ Used</div>
                  </div>
                </div>
              </div>

              <div className="glass-panel">
                <div className="section-header"><h2>Source Breakdown</h2></div>
                <div style={{height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  <Doughnut data={catDoughnut} options={{...darkOpts, scales: {}, plugins: {...darkOpts.plugins, legend: {position: 'bottom', labels: {color: '#8899bb', font: {size: 10}, padding: 10}}}}} />
                </div>
              </div>

              <div className="glass-panel">
                <div className="section-header"><h2>Recent Activity Feed</h2><span className="section-badge live">Live</span></div>
                <div style={{overflowX: 'auto'}}>
                  <table className="data-table">
                    <thead><tr><th>Source</th><th>Metric</th><th>CO₂</th></tr></thead>
                    <tbody>
                      {history.slice(-5).reverse().map((e, i) => (
                        <tr key={i}>
                          <td>{getModeEmoji(e.transport_mode)} {e.transport_mode}</td>
                          <td>{(e.transport_km > 0 ? `${e.transport_km}km` : '') || (e.electricity_kwh > 0 ? `${e.electricity_kwh}kWh` : '') || (e.waste_kg > 0 ? `${e.waste_kg}kg` : '')}</td>
                          <td><span className={`carbon-badge ${getCarbonClass(e.total_carbon_kg)}`}>{e.total_carbon_kg.toFixed(1)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ANALYTICS ══════════ */}
      {activeTab === 'analytics' && (
        <div className="fade-in">
          <div className="main-grid">
            <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header"><h2>Activity Impact Matrix</h2><span className="section-badge ai">Intensity Mapping</span></div>
                <div className="chart-container" style={{height: '320px'}}><Bubble data={bubbleData} options={bubbleOpts} /></div>
                <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem'}}>
                  Highlights specific actions that generated the most carbon emissions over time. Larger bubbles equal higher CO₂.
                </p>
              </div>

              <div className="glass-panel">
                <div className="section-header"><h2>Footprint DNA Distribution</h2></div>
                <div className="chart-container" style={{height: '280px'}}><PolarArea data={polarData} options={polarOpts} /></div>
              </div>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header"><h2>Category Intensity Bars</h2></div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem'}}>
                  {[
                    { label: 'Transport', value: stats?.transport_total || 0, color: 'var(--accent-amber)' },
                    { label: 'Electricity', value: stats?.electricity_total || 0, color: 'var(--accent-blue)' },
                    { label: 'Food', value: stats?.food_total || 0, color: 'var(--accent-emerald)' },
                    { label: 'Waste', value: stats?.waste_total || 0, color: 'var(--accent-red)' },
                    { label: 'Industrial', value: stats?.industrial_total || 0, color: 'var(--accent-purple)' },
                  ].map((cat, i) => {
                    const maxVal = Math.max(stats?.transport_total || 1, stats?.electricity_total || 1, stats?.food_total || 1, stats?.waste_total || 1, stats?.industrial_total || 1);
                    return (
                      <div key={i}>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem'}}>
                          <span style={{color: 'var(--text-secondary)', fontWeight: 500}}>{cat.label}</span>
                          <span style={{fontWeight: 700, color: cat.color}}>{cat.value.toFixed(1)} kg</span>
                        </div>
                        <div className="progress-bar-container">
                          <div className="progress-bar-fill" style={{width: `${Math.min(100, (cat.value / maxVal) * 100)}%`, background: cat.color}}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ COMMUNITY ══════════ */}
      {activeTab === 'community' && (
        <div className="fade-in">
          <div className="main-grid">
            <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header"><h2>Community Benchmarking</h2></div>
                <div className="chart-container" style={{height: '300px'}}>
                  <Bar data={compareData} options={noLegend} />
                </div>
                <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1rem'}}>
                  Your average footprint per log is <strong>{avgCarbon.toFixed(1)} kg</strong>. 
                  The platform community average is <strong>{comAvg.toFixed(1)} kg</strong>.
                  {avgCarbon < comAvg ? " You're doing better than average!" : " Try following AI recommendations to lower this."}
                </p>
              </div>

              <div className="glass-panel">
                <div className="section-header"><h2>🏆 Global Top 5 Leaderboard</h2><span className="section-badge live">Real-time</span></div>
                <div style={{marginTop: '0.5rem'}}>
                  {leaderboard.slice(0, 5).map((u, i) => (
                    <div key={i} className="leader-item" style={u.id === user?.id ? {background: 'var(--accent-emerald-dim)', borderRadius: '8px', padding: '0.7rem'} : {}}>
                      <span className={`leader-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                      <span className="leader-name" style={u.id === user?.id ? {color: 'var(--accent-emerald)', fontWeight: 800} : {}}>
                        {u.username} {u.id === user?.id && '(You)'}
                      </span>
                      <div style={{textAlign: 'right'}}>
                        <div className="leader-score">{u.eco_score} pts</div>
                        <div style={{fontSize: '0.65rem', color: 'var(--text-muted)'}}>Efficiency: {u.green_score?.toFixed(0) || 50}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
              <div className="glass-panel">
                <div className="section-header"><h2>Platform Eco-Distribution</h2></div>
                <div className="chart-container" style={{height: '300px'}}>
                  <Scatter data={scatterData} options={scatterOpts} />
                </div>
                <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem'}}>
                  Compare your Eco Score and Green Efficiency % against active community members. (Top right is best)
                </p>
              </div>

              <div className="glass-panel" style={{textAlign: 'center', padding: '2rem 1rem'}}>
                <div style={{fontSize: '3.5rem', marginBottom: '1rem'}}>🌱</div>
                <h3>Community Impact</h3>
                <p style={{color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
                  Together, the Carbon Intelligence community has logged <strong>{community?.total_entries || 0}</strong> eco-actions.
                </p>
                <div style={{display: 'inline-block', background: 'var(--accent-emerald-dim)', border: '1px solid var(--accent-emerald)', borderRadius: '12px', padding: '1rem 2rem'}}>
                  <div style={{fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em'}}>Estimated Total Savings</div>
                  <div style={{fontSize: '2rem', fontWeight: '900', color: 'var(--text-main)', marginTop: '0.2rem'}}>{community?.total_saved_kg || 0} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>kg CO₂</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ LOG DATA ══════════ */}
      {activeTab === 'log' && (
        <div className="fade-in" style={{maxWidth: '800px', margin: '0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>Log Carbon Emissions</h2><span className="section-badge new">New Entry</span></div>
            <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '0.85rem'}}>
              <div><label className="form-label">🚗 Transport Route Mode & Distance</label>
                <div className="form-row">
                  <select className="form-control" value={form.transport_mode} onChange={e => setForm({...form, transport_mode: e.target.value})}>
                    <option value="car">🚗 Personal Car</option><option value="public">🚌 Public Transit</option><option value="bike">🚲 Bike / Walk</option><option value="flight">✈️ Flight Route</option><option value="ev">⚡ EV</option>
                  </select>
                  <input type="number" className="form-control" value={form.transport_km} onChange={e => setForm({...form, transport_km: e.target.value})} placeholder="Distance (km)" required />
                </div>
              </div>
              <div><label className="form-label">⚡ Electricity Consumption</label>
                <input type="number" step="0.1" className="form-control" value={form.electricity_kwh} onChange={e => setForm({...form, electricity_kwh: e.target.value})} placeholder="Usage in kWh" required />
              </div>
              <div><label className="form-label">🍽️ Food & Diet</label>
                <div className="form-row">
                  <select className="form-control" value={form.food_diet} onChange={e => setForm({...form, food_diet: e.target.value})}>
                    <option value="vegan">🌱 Vegan</option><option value="veg">🥬 Vegetarian</option><option value="non_veg">🍖 Non-Vegetarian</option>
                  </select>
                  <input type="number" className="form-control" value={form.food_meals} onChange={e => setForm({...form, food_meals: e.target.value})} placeholder="Meals/day" min="1" max="6" />
                </div>
              </div>
              <div><label className="form-label">🏭 Industrial / Device Usage</label>
                <input type="number" step="0.1" className="form-control" value={form.industrial_hours} onChange={e => setForm({...form, industrial_hours: e.target.value})} placeholder="Heavy device active hours" />
              </div>
              <div><label className="form-label">🗑️ Waste Generation</label>
                <div className="form-row">
                  <input type="number" step="0.1" className="form-control" value={form.waste_kg} onChange={e => setForm({...form, waste_kg: e.target.value})} placeholder="Waste Created (kg)" required />
                  <input type="number" className="form-control" value={form.waste_recycled_pct} onChange={e => setForm({...form, waste_recycled_pct: e.target.value})} placeholder="% Recycled" min="0" max="100" />
                </div>
              </div>
              <div><label className="form-label">📍 Geographic Registration</label>
                <div className="form-row">
                  <input type="text" className="form-control" value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="City name" />
                  <input type="number" step="0.001" className="form-control" value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} placeholder="Latitude (Optional)" />
                  <input type="number" step="0.001" className="form-control" value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} placeholder="Longitude (Optional)" />
                </div>
              </div>
              <button type="submit" className="btn" disabled={submitting} style={{marginTop: '0.5rem', padding: '0.8rem'}}>
                {submitting ? '⏳ Transmitting Data...' : '🌍 Record Emissions & Update Score'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════ IOT TAB ══════════ */}
      {activeTab === 'iot' && (
        <div className="fade-in">
          <div className="glass-panel">
            <div className="section-header"><h2>IoT Edge Sensor Network</h2><span className="section-badge iot">Real-Time Sync</span></div>
            <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem'}}>
              Live telemetry stream from connected edge devices (ESP32, MQ2, Power Monitors). Sync architecture via WebSockets.
            </p>
            {iotData.length === 0 ? (
              <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-muted)'}}>
                <div style={{fontSize: '3rem', marginBottom: '1rem'}}>📡</div>
                <p style={{fontWeight: 500, fontSize: '1.1rem'}}>No active IoT edge devices connected</p>
                <p style={{fontSize: '0.8rem', marginTop: '0.5rem'}}>Ingest sensor data via <code style={{color: 'var(--accent-cyan)', background: 'rgba(6,182,212,0.1)', padding: '0.2rem 0.4rem', borderRadius: '4px'}}>POST /api/iot/data</code></p>
              </div>
            ) : (
              <div className="iot-grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem'}}>
                {iotData.map((d, i) => (
                  <div key={i} className="iot-card" style={{padding: '1.5rem 1rem'}}>
                    <div className="iot-emoji" style={{fontSize: '2rem', marginBottom: '0.5rem'}}>
                      {d.sensor_type === 'power' ? '⚡' : d.sensor_type === 'gas' ? '💨' : d.sensor_type === 'temperature' ? '🌡️' : '💧'}
                    </div>
                    <div className="iot-value" style={{fontSize: '1.8rem', marginBottom: '0.2rem'}}>{d.value} <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{d.unit}</span></div>
                    <div className="iot-label" style={{fontSize: '0.75rem', fontWeight: 700}}>{d.sensor_type} NODE</div>
                    <div className="iot-device" style={{fontFamily: 'monospace', fontSize: '0.65rem', marginTop: '0.5rem'}}>{d.device_id}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ ALERTS TAB ══════════ */}
      {activeTab === 'alerts' && (
        <div className="fade-in" style={{maxWidth: '800px', margin: '0 auto'}}>
          <div className="glass-panel">
            <div className="section-header"><h2>Anomaly Detection & Threshold Alerts</h2><span className="section-badge alert">{unreadAlerts} Unread</span></div>
            <div style={{marginTop: '1rem'}}>
              {alerts.length === 0 ? (
                <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-muted)'}}>
                  <div style={{fontSize: '3rem', marginBottom: '1rem'}}>✅</div>
                  <p style={{fontSize: '1.1rem'}}>All systems nominal. No alerts triggered.</p>
                </div>
              ) : alerts.map((a, i) => (
                <div key={i} className={`alert-item ${a.alert_type}`} style={{padding: '1rem', marginBottom: '0.75rem', alignItems: 'center'}}>
                  <span style={{fontSize: '1.5rem'}}>{a.alert_type === 'critical' ? '🚨' : '⚠️'}</span>
                  <div style={{flex: 1, marginLeft: '0.5rem'}}>
                    <div className="alert-message" style={{fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)'}}>{a.message}</div>
                    <div className="alert-time" style={{marginTop: '0.2rem'}}>{new Date(a.timestamp).toLocaleString()}</div>
                  </div>
                  {!a.is_read && <div className="alert-unread" style={{width: '10px', height: '10px'}}></div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
