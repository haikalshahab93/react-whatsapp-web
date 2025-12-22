import React, { useState, useEffect } from 'react';
import { Box, TextField, Button, Typography, Alert } from '@mui/material';

const API_BASE = (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_API_BASE) || '/api';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviter, setInviter] = useState('');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inv = params.get('inviter') || '';
      if (inv) setInviter(inv);
    } catch {}
  }, []);

  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone, inviter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Gagal mendaftar');
      alert('Registrasi berhasil. Silakan cek email untuk verifikasi.');
      window.location.href = '/verify';
    } catch (e: any) {
      setError(e?.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', p: 2 }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ width: 360, p: 3, borderRadius: 2, boxShadow: 1, bgcolor: 'background.paper' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Daftar ke ChatEasy</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth sx={{ mb: 2 }} required />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth sx={{ mb: 2 }} required />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth sx={{ mb: 2 }} required />
        <TextField label="Nomor WhatsApp (opsional)" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth sx={{ mb: 3 }} />
        <Button type="submit" variant="contained" color="primary" fullWidth disabled={loading}>
          {loading ? 'Memproses...' : 'Daftar'}
        </Button>
      </Box>
    </Box>
  );
}