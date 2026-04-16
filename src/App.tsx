import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';
import useAppStore from './store/appStore';
import type { AutoUpdateStatusEvent } from './types/update';

export default function App() {
  const setAllDebridApiKey = useAppStore((state) => state.setAllDebridApiKey);
  const setPreferredSubtitleLang = useAppStore((state) => state.setPreferredSubtitleLang);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;

    const unsubscribe = window.electronAPI.onUpdateStatus((data: AutoUpdateStatusEvent) => {
      switch (data.type) {
        case 'checking':
          setUpdateStatus('Recherche des mises à jour…');
          setUpdateProgress(0);
          break;
        case 'available':
          setUpdateStatus(`Téléchargement de la mise à jour ${data.version || '…'}`);
          setUpdateProgress(0);
          break;
        case 'downloading':
          setUpdateProgress(data.percent || 0);
          break;
        case 'downloaded':
          setUpdateStatus('Mise à jour installée, redémarrage…');
          setTimeout(() => {
            setUpdateStatus('');
            window.location.reload();
          }, 2000);
          break;
        case 'error':
          setUpdateStatus('La mise à jour a échoué');
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
    window.electronAPI.checkForUpdates().catch(() => undefined);
    // Re-check every 4 hours
    const interval = setInterval(() => {
      window.electronAPI.checkForUpdates().catch(() => undefined);
    }, 4 * 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadStoredPreferences = async () => {
      const [savedApiKey, preferredSubtitleLang] = await Promise.all([
        window.electronAPI.getAllDebridKey(),
        window.electronAPI.getPreferredSubtitleLang(),
      ]);

      if (savedApiKey) {
        setAllDebridApiKey(savedApiKey);
      }

      if (preferredSubtitleLang) {
        setPreferredSubtitleLang(preferredSubtitleLang);
      }
    };

    loadStoredPreferences().catch((error) => {
      console.error('Impossible de charger les préférences sauvegardées :', error);
    });
  }, [setAllDebridApiKey, setPreferredSubtitleLang]);

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
