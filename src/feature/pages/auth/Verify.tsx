import React, { useEffect } from 'react';
import { Box, Typography, Alert } from '@mui/material';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

export default function Verify() {
  // Cleaned up unused state variables
  async function verify(token: string) {
    try {
      const res = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Verifikasi gagal');
    } catch (err: any) {
      // no-op, redirect user to register/login below
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) verify(token);
  }, []);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', p: 2 }}>
      <Box sx={{ width: 420, p: 3, borderRadius: 2, boxShadow: 1, bgcolor: 'background.paper' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Verifikasi Akun ChatEasy</Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Verifikasi utama dilakukan via WhatsApp OTP. Silakan kembali ke halaman Daftar, masukkan nomor WhatsApp Anda, klik "Kirim OTP", lalu masukkan kode OTP untuk aktivasi akun.
        </Alert>
      </Box>
    </Box>
  );
}