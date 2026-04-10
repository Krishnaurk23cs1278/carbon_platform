import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const resp = await api.post('/auth/login', { username: '', email, password });
      localStorage.setItem('token', resp.data.access_token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">
        <div style={{textAlign: 'center', marginBottom: '0.5rem', fontSize: '2.5rem'}}>🌍</div>
        <h2 style={{textAlign: 'center'}}>Welcome Back</h2>
        <p style={{textAlign: 'center'}}>Sign in to your Carbon Intelligence dashboard</p>
        
        {error && (
          <div className="alert-item critical" style={{marginBottom: '1rem'}}>
            <span className="alert-message">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input type="email" className="form-control" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn" disabled={loading} style={{marginTop: '0.5rem'}}>
            {loading ? 'Signing in...' : '🔐 Sign In'}
          </button>
        </form>

        <div className="auth-divider">or</div>
        
        <p style={{textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)'}}>
          Don't have an account? <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
}
