import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', label: 'Accueil', icon: '🏠' },
  { path: '/search', label: 'Recherche', icon: '🔍' },
  { path: '/settings', label: 'Réglages', icon: '⚙️' },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  return (
    <div className="flex h-screen bg-dark-bg text-white overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-56' : 'w-16'
        } bg-dark-card border-r border-dark-border flex flex-col transition-all duration-200 relative`}
      >
        <div className="p-4 border-b border-dark-border flex items-center justify-between">
          {sidebarOpen && (
            <h1 className="text-lg font-bold text-primary">NyaaViewer</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-dark-cardHover text-dark-textMuted"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                ${
                  location.pathname === item.path
                    ? 'bg-primary/20 text-primary'
                    : 'text-dark-textMuted hover:bg-dark-cardHover hover:text-white'
                }`}
            >
              <span className="text-lg">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
