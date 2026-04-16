import { useEffect, useState } from 'react';
import useAppStore from '../store/appStore';
import type { VerifyAllDebridKeyResult } from '../types/alldebrid';
import type { AutoUpdateStatusEvent } from '../types/update';

const SUBTITLE_LANGUAGES = [
  { value: 'en', label: 'Anglais' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Espagnol' },
  { value: 'ja', label: 'Japonais' },
  { value: 'de', label: 'Allemand' },
  { value: 'pt', label: 'Portugais' },
  { value: 'it', label: 'Italien' },
];

export default function SettingsPage() {
  const allDebridApiKey = useAppStore((state) => state.allDebridApiKey);
  const isADConnected = useAppStore((state) => state.isADConnected);
  const adUsername = useAppStore((state) => state.adUsername);
  const preferredSubtitleLang = useAppStore((state) => state.preferredSubtitleLang);
  const setAllDebridApiKey = useAppStore((state) => state.setAllDebridApiKey);
  const setADConnected = useAppStore((state) => state.setADConnected);
  const setPreferredSubtitleLang = useAppStore((state) => state.setPreferredSubtitleLang);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testingKey, setTestingKey] = useState(false);
  const [testError, setTestError] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [appVersion, setAppVersion] = useState('0.1.0');

  useEffect(() => {
    const loadSettings = async () => {
      const [savedKey, savedSubtitleLang, version] = await Promise.all([
        window.electronAPI.getAllDebridKey(),
        window.electronAPI.getPreferredSubtitleLang(),
        window.electronAPI.getAppVersion(),
      ]);

      if (savedKey) {
        setApiKeyInput(savedKey);
        setAllDebridApiKey(savedKey);
        await testConnection(savedKey, false);
      } else {
        setApiKeyInput(allDebridApiKey);
      }

      if (savedSubtitleLang) {
        setPreferredSubtitleLang(savedSubtitleLang);
      }

      setAppVersion(version);
    };

    loadSettings().catch((error) => {
      console.error('Impossible de charger les réglages :', error);
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) {
      return;
    }

    const unsubscribe = window.electronAPI.onUpdateStatus((data: AutoUpdateStatusEvent) => {
      switch (data.type) {
        case 'checking':
          setUpdateStatus('Recherche des mises à jour…');
          setUpdateProgress(0);
          break;
        case 'available':
          setUpdateStatus(`Téléchargement de la version ${data.version || '?'}…`);
          setUpdateProgress(0);
          break;
        case 'downloading':
          setUpdateProgress(Math.round(data.percent || 0));
          break;
        case 'downloaded':
          setUpdateStatus('Mise à jour installée, redémarrage…');
          setTimeout(() => window.location.reload(), 2000);
          break;
        case 'not-available':
          setUpdateStatus('L’application est déjà à jour');
          setUpdateProgress(0);
          break;
        case 'error':
          setUpdateStatus(`Erreur : ${data.message || 'échec de la recherche de mise à jour'}`);
          setUpdateProgress(0);
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, []);

  const handleCheckUpdates = async () => {
    setUpdateStatus('Recherche des mises à jour…');
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result.error) {
        setUpdateStatus(`Erreur : ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'échec de la recherche de mise à jour';
      setUpdateStatus(`Erreur : ${message}`);
    }
  };

  const testConnection = async (key: string, persistKey = true) => {
    setTestingKey(true);
    setTestError('');

    try {
      const result: VerifyAllDebridKeyResult = await window.electronAPI.verifyAllDebridKey(key);

      if (result.success) {
        setADConnected(true, result.username);
        setAllDebridApiKey(key);
        if (persistKey) {
          await window.electronAPI.setAllDebridKey(key);
        }
      } else {
        setADConnected(false);
        setTestError(result.error || 'Connexion impossible');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connexion impossible';
      setADConnected(false);
      setTestError(message);
    } finally {
      setTestingKey(false);
    }
  };

  const handleSave = () => {
    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      return;
    }

    void testConnection(trimmedKey);
  };

  const handleSubtitlePreferenceChange = async (lang: string) => {
    setPreferredSubtitleLang(lang);
    try {
      await window.electronAPI.setPreferredSubtitleLang(lang);
    } catch (error) {
      console.error('Impossible d’enregistrer la langue de sous-titres :', error);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold">Réglages</h2>

      <div className="card space-y-4">
        <h3 className="text-lg font-semibold">AllDebrid</h3>

        <div className="space-y-2">
          <label className="text-sm text-dark-textMuted">Clé API</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="Entrez votre clé API AllDebrid"
              className="input-field flex-1"
            />
            <button
              onClick={handleSave}
              disabled={testingKey || !apiKeyInput.trim()}
              className="btn-primary"
            >
              {testingKey ? 'Vérification…' : 'Tester et enregistrer'}
            </button>
          </div>
        </div>

        {isADConnected && (
          <div className="text-sm text-green-400 flex items-center gap-2">
            <span>&#10003;</span>
            Connecté en tant que {adUsername}
          </div>
        )}

        {testError && <div className="text-sm text-red-400">{testError}</div>}

        <p className="text-xs text-dark-textMuted">
          Récupérez votre clé API sur <span className="text-primary">alldebrid.com/account</span>
        </p>
      </div>

      <div className="card space-y-4">
        <h3 className="text-lg font-semibold">Préférences de sous-titres</h3>

        <div className="space-y-2">
          <label className="text-sm text-dark-textMuted">Langue par défaut</label>
          <select
            value={preferredSubtitleLang}
            onChange={(event) => void handleSubtitlePreferenceChange(event.target.value)}
            className="input-field"
          >
            {SUBTITLE_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="text-lg font-semibold">À propos</h3>
        <p className="text-sm text-dark-textMuted">NyaaViewer v{appVersion}</p>
        <p className="text-xs text-dark-textMuted">
          Recherchez des torrents sur nyaa.si, débridez-les via AllDebrid et lisez-les avec leurs sous-titres.
        </p>
        <div className="flex items-center gap-3 pt-2 border-t border-dark-border">
          <button onClick={handleCheckUpdates} className="btn-secondary text-sm py-1.5 px-4">
            Vérifier les mises à jour
          </button>
          {updateStatus && <div className="text-sm text-dark-textMuted">{updateStatus}</div>}
          {updateProgress > 0 && updateProgress < 100 && (
            <div className="flex-1 bg-dark-border rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${updateProgress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
