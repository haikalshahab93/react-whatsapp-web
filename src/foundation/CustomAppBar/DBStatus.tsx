import React, { useEffect, useState } from 'react';
import { Chip } from '@mui/material';

const API_BASE = (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_API_BASE) || '/api';

type DbState = 'unknown' | 'connected' | 'connecting' | 'disconnecting' | 'disconnected';

export default function DBStatus() {
  const [status, setStatus] = useState<DbState>('unknown');

  useEffect(() => {
    let mounted = true;
    const fetchStatus = () => {
      fetch(`${API_BASE}/health`)
        .then((res) => res.json())
        .then((data) => {
          const s: DbState = (data && data.db) || 'unknown';
          if (mounted) setStatus(s);
        })
        .catch(() => {
          if (mounted) setStatus('disconnected');
        });
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 20000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const labelMap: Record<DbState, string> = {
    connected: 'Connected',
    connecting: 'Connecting',
    disconnecting: 'Disconnecting',
    disconnected: 'Disconnected',
    unknown: 'Unknown',
  };
  const bgColorMap: Record<DbState, string> = {
    connected: '#25d366',
    connecting: '#f0ad4e',
    disconnecting: '#f0ad4e',
    disconnected: '#ff4d4f',
    unknown: '#8696a1',
  };

  return (
    <Chip
      label={`DB: ${labelMap[status]}`}
      size="small"
      sx={{
        bgcolor: bgColorMap[status],
        color: '#1f2c33',
        height: 22,
        minWidth: 20,
        borderRadius: '10px',
        fontWeight: 600,
        ml: 1,
      }}
    />
  );
}