import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Store, LogOut } from 'lucide-react';
import Logo from './Logo';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <aside className="w-64 bg-tss-dark flex flex-col flex-shrink-0">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <p className="text-white font-bold text-sm leading-tight">The Souled Store</p>
              <p className="text-gray-400 text-xs">Store Dashboard</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-tss-red text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            Pincode Finder
          </NavLink>
          <NavLink
            to="/stores"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-tss-red text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`
            }
          >
            <Store className="w-4 h-4" />
            Store Manager
          </NavLink>
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-tss-red/20 flex items-center justify-center">
              <span className="text-tss-red text-xs font-bold uppercase">
                {user?.name?.[0] || user?.email?.[0] || 'A'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.name || 'Admin'}</p>
              <p className="text-gray-500 text-xs truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-white transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
