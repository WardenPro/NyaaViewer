import { useState, useEffect } from 'react';
import useAppStore from '../store/appStore';

export default function SettingsPage() {
  const allDebridApiKey = useAppStore((s) => s.allDebridApiKey);
  const isADConnected = useAppStore((s) => s.isADConnected);
  const adUsername = useAppStore((s) => s.adUsername);
  const preferredSubtitleLang = useAppStore((s) => s.preferredSubtitleLang);
  const setAllDebridApiKey = useAppStore((s) => s.setAllDebridApiKey);
  const setADConnected = useAppStore((s) => s.setADConnected);
  const setPreferredSubtitleLang = useAppStore((s) => s.setPreferredSubtitleLang);
  const setIsSearching = useAppStore((s) => s.setIsSearching);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testingKey, setTestingKey] = useState(false);
  const [testError, setTestError] = useState('');

  useEffect(() => {
    setApiKeyInput(allDebridApiKey);
    loadSavedApiKey();
  }, []);

  const loadSavedApiKey = async () => {
    try {
      const savedKey = await window.electronAPI.getAllDebridKey();
      if (savedKey) {
        setApiKeyInput(savedKey);
        setAllDebridApiKey(savedKey);
        // Auto-test saved key
        testConnection(savedKey);
      }
    } catch (e) {
      console.error('Failed to load saved key:', e);
    }
  };

  const testConnection = async (key: string) => {
    setTestingKey(true);
    setTestError('');
    try {
      const result = await window.electronAPI.verifyAllDebridKey(key);
      const data = result as { success: boolean; error?: string; username?: string };

      if (data.success) {
        setADConnected(true, data.username);
        setAllDebridApiKey(key);
        // Persist the key
        await window.electronAPI.setAllDebridKey(key);
      } else {
        setADConnected(false);
        setTestError(data.error || 'Connection failed');
      }
    } catch (e: any) {
      setADConnected(false);
      setTestError(e?.message || 'Connection failed');
    } finally {
      setTestingKey(false);
    }
  };

  const handleSave = () => {
    if (apiKeyInput.trim()) {
      testConnection(apiKeyInput.trim());
    }
  };

  const subLanguages = [
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'French' },
    { value: 'es', label: 'Spanish' },
    { value: 'ja', label: 'Japanese' },
    { value: 'de', label: 'German' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'it', label: 'Italian' },
  ];

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* AllDebrid */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold">AllDebrid</h3>

        <div className="space-y-2">
          <label className="text-sm text-dark-textMuted">API Key</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter your AllDebrid API key"
              className="input-field flex-1"
            />
            <button
              onClick={handleSave}
              disabled={testingKey || !apiKeyInput.trim()}
              className="btn-primary"
            >
              {testingKey ? 'Testing...' : 'Test & Save'}
            </button>
          </div>
        </div>

        {/* Connection status */}
        {isADConnected && (
          <div className="text-sm text-green-400 flex items-center gap-2">
            <span>&#10003;</span>
            Connected as {adUsername}
          </div>
        )}

        {testError && (
          <div className="text-sm text-red-400">{testError}</div>
        )}

        <p className="text-xs text-dark-textMuted">
          Get your API key from{' '}
          <span className="text-primary">alldebrid.com/account</span>
        </p>
      </div>

      {/* Subtitle preferences */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold">Subtitle Preferences</h3>

        <div className="space-y-2">
          <label className="text-sm text-dark-textMuted">Default subtitle language</label>
          <select
            value={preferredSubtitleLang}
            onChange={(e) => setPreferredSubtitleLang(e.target.value)}
            className="input-field"
          >
            {subLanguages.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* About */}
      <div className="card space-y-2">
        <h3 className="text-lg font-semibold">About</h3>
        <p className="text-sm text-dark-textMuted">NyaaViewer v0.1.0</p>
        <p className="text-xs text-dark-textMuted">
          Search nyaa.si torrents, deborid via AllDebrid, and stream MKV files with subtitles.
        </p>
      </div>
    </div>
  );
}
