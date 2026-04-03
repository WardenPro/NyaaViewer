import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
