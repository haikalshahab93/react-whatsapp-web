import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, TextField, Button, Alert, List, ListItem, ListItemAvatar, Avatar, ListItemText, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

const API_BASE = (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_API_BASE) || '/api';

interface SuggestUser {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
}

export default function Invite() {
  const [suggestions, setSuggestions] = useState<SuggestUser[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [errorSuggest, setErrorSuggest] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const token = useMemo(() => localStorage.getItem('chateasy_token'), []);

  async function parseJSONSafe(res: Response) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { message: text }; }
  }

  async function fetchSuggestions(search?: string) {
    setLoadingSuggest(true);
    setErrorSuggest(null);
    try {
      const url = new URL(`${API_BASE}/users/suggest`, window.location.origin);
      if (search && search.trim().length > 0) {
        url.searchParams.set('q', search.trim());
      }
      const res = await fetch(url.toString().replace(window.location.origin, ''), {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      const data = await parseJSONSafe(res);
      if (!res.ok) throw new Error((data && data.message) || 'Gagal mengambil saran undangan');
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setErrorSuggest(err.message || 'Terjadi kesalahan saat memuat saran');
      setSuggestions([]);
    } finally {
      setLoadingSuggest(false);
    }
  }

  useEffect(() => {
    fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendInvite(email?: string, phone?: string) {
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const body: any = { message: inviteMessage || '' };
      if (email) body.email = email;
      if (phone) body.phone = phone;
      if (!body.email && !body.phone) throw new Error('Isi email atau nomor WhatsApp terlebih dahulu');
      const res = await fetch(`${API_BASE}/users/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify(body),
      });
      const data = await parseJSONSafe(res);
      if (!res.ok) throw new Error((data && data.message) || 'Gagal mengirim undangan');
      setInviteSuccess('Undangan berhasil dikirim');
      setInviteEmail('');
      setInvitePhone('');
    } catch (err: any) {
      setInviteError(err.message || 'Terjadi kesalahan saat mengirim undangan');
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#0b1419' }}>
      <Box sx={{ bgcolor: '#1f2c33', p: 2 }}>
        <Typography variant="h6" sx={{ color: '#e9edef', fontWeight: 600 }}>Undang Teman ke ChatEasy</Typography>
        <Typography variant="body2" sx={{ color: '#8696a1' }}>
          Saran undangan otomatis ditampilkan berdasarkan domain email atau prefix nomor WhatsApp Anda.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, p: 2 }}>
        <Box sx={{ flex: 1, bgcolor: '#101b20', p: 2, borderRadius: 1 }}>
          <Typography variant="subtitle1" sx={{ color: '#e9edef', mb: 1, fontWeight: 600 }}>Saran Undangan</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              placeholder="Cari nama, email, atau nomor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              size="small"
              fullWidth
              InputProps={{ sx: { color: '#e9edef' } }}
            />
            <Button variant="contained" onClick={() => fetchSuggestions(query)} disabled={loadingSuggest}>
              {loadingSuggest ? 'Memuat...' : 'Cari'}
            </Button>
          </Box>
          {errorSuggest && <Alert severity="error" sx={{ mb: 2 }}>{errorSuggest}</Alert>}
          <List dense sx={{ bgcolor: '#0b1419', borderRadius: 1 }}>
            {suggestions.map((u) => (
              <ListItem key={u._id} secondaryAction={
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {u.email && (
                    <IconButton aria-label="Undang via Email" onClick={() => sendInvite(u.email, undefined)}>
                      <SendIcon sx={{ color: '#25d366' }} />
                    </IconButton>
                  )}
                  {u.phone && (
                    <IconButton aria-label="Undang via WhatsApp" onClick={() => sendInvite(undefined, u.phone)}>
                      <SendIcon sx={{ color: '#00a884' }} />
                    </IconButton>
                  )}
                </Box>
              }>
                <ListItemAvatar>
                  <Avatar src={u.avatarUrl} />
                </ListItemAvatar>
                <ListItemText
                  primary={<Typography sx={{ color: '#e9edef' }}>{u.name}</Typography>}
                  secondary={<Typography sx={{ color: '#8696a1' }}>{[u.email, u.phone].filter(Boolean).join(' • ')}</Typography>}
                />
              </ListItem>
            ))}
            {suggestions.length === 0 && !loadingSuggest && (
              <Typography variant="body2" sx={{ color: '#8696a1', p: 1 }}>Tidak ada saran undangan.</Typography>
            )}
          </List>
        </Box>

        <Box sx={{ flex: 1, bgcolor: '#101b20', p: 2, borderRadius: 1 }}>
          <Typography variant="subtitle1" sx={{ color: '#e9edef', mb: 1, fontWeight: 600 }}>Kirim Undangan Manual</Typography>
          {inviteError && <Alert severity="error" sx={{ mb: 2 }}>{inviteError}</Alert>}
          {inviteSuccess && <Alert severity="success" sx={{ mb: 2 }}>{inviteSuccess}</Alert>}
          <TextField
            label="Email (opsional)"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Nomor WhatsApp (opsional)"
            value={invitePhone}
            onChange={(e) => setInvitePhone(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Pesan (opsional)"
            value={inviteMessage}
            onChange={(e) => setInviteMessage(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={() => sendInvite(inviteEmail || undefined, invitePhone || undefined)}
            disabled={inviteLoading}
          >
            {inviteLoading ? 'Mengirim...' : 'Kirim Undangan'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}