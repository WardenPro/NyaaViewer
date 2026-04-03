import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [updateProgress, setUpdateProgress] = useState<number>(0);
  const [updateVersion, setUpdateVersion] = useState<string>('');

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;

    window.electronAPI.onUpdateStatus((data: { type: string; version?: string; percent?: number }) => {
      switch (data.type) {
        case 'checking':
          setUpdateStatus('Checking for updates...');
          setUpdateProgress(0);
          break;
        case 'available':
          setUpdateStatus(`Downloading update ${data.version || '...'}`);
          setUpdateVersion(data.version || '');
          setUpdateProgress(0);
          break;
        case 'downloading':
          setUpdateProgress(data.percent || 0);
          break;
        case 'downloaded':
          setUpdateStatus('Update installed! Restarting...');
          setTimeout(() => {
            setUpdateStatus('');
            window.location.reload();
          }, 2000);
          break;
        case 'error':
          setUpdateStatus('Update failed');
          setTimeout(() => setUpdateStatus(''), 5000);
          break;
        case 'not-available':
        default:
          setUpdateStatus('');
          setUpdateProgress(0);
          break;
      }
    });

    // Auto-check on mount
    window.electronAPI.checkForUpdates();
    // Re-check every 4 hours
    const interval = setInterval(() => window.electronAPI.checkForUpdates(), 4 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Update banner */}
      {updateStatus && (
        <div className="fixed bottom-4 right-4 z-50 bg-dark-card border border-primary/50 rounded-lg px-4 py-3 shadow-lg max-w-sm">
          <p className="text-sm text-primary font-medium">{updateStatus}</p>
          {updateProgress > 0 && (
            <div className="w-full bg-dark-border rounded-full h-1.5 mt-2">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(updateProgress, 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
