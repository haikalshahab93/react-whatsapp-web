import React from 'react';
import { Box, Button, TextField, Typography, Alert } from '@mui/material';

const API_BASE = (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_API_BASE) || '/api';

export default function Login() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || 'Respons bukan JSON dari server');
      }
      if (!res.ok) throw new Error(data?.message || 'Login gagal');
      localStorage.setItem('chateasy_token', data.token);
      localStorage.setItem('chateasy_user', JSON.stringify(data.user));
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', p: 2 }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ width: 360, p: 3, borderRadius: 2, boxShadow: 1, bgcolor: 'background.paper' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Masuk ke ChatEasy</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth sx={{ mb: 2 }} required />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth sx={{ mb: 3 }} required />
        <Button type="submit" variant="contained" color="primary" fullWidth disabled={loading}>
          {loading ? 'Memproses...' : 'Masuk'}
        </Button>
      </Box>
    </Box>
  );
}