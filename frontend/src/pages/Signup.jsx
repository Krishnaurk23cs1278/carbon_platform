import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function Signup() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/signup', { username, email, password });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">
        <div style={{textAlign: 'center', marginBottom: '0.5rem', fontSize: '2.5rem'}}>🌱</div>
        <h2 style={{textAlign: 'center'}}>Join the Movement</h2>
        <p style={{textAlign: 'center'}}>Create your account and start tracking your carbon footprint</p>

        {error && (
          <div className="alert-item critical" style={{marginBottom: '1rem'}}>
            <span className="alert-message">{error}</span>
          </div>
        )}

        <form onSubmit={handleSignup}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input type="text" className="form-control" placeholder="ecowarrior" value={username} onChange={e=>setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input type="email" className="form-control" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} />
          </div>
          <button type="submit" className="btn btn-blue" disabled={loading} style={{marginTop: '0.5rem'}}>
            {loading ? 'Creating account...' : '🚀 Create Account'}
          </button>
        </form>

        <div className="auth-divider">or</div>
        
        <p style={{textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)'}}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
