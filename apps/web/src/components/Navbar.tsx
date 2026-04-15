import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getMe } from '../lib/api';
import { LogOut, Shield, Bookmark, Search } from 'lucide-react';

export function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: meResp } = useQuery({
    queryKey: ['me', user?.id],
    queryFn: getMe,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = meResp?.ok && meResp.data?.role === 'ADMIN';
  const displayName = meResp?.ok ? meResp.data?.displayName : null;
  const initial = (displayName ?? user?.email ?? '?').charAt(0).toUpperCase();

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate('/');
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 w-full bg-white border-b border-gray-200"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
      >
        <div className="max-w-[1700px] mx-auto px-8 lg:px-16 flex items-center justify-between h-[72px]">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-sky-200 flex items-center justify-center flex-shrink-0 shadow-sm">
              <img src="/favicon.png" alt="Optima" className="w-5 h-5" />
            </div>
            <span className="font-bold text-[21px] text-dark tracking-[-0.02em]">
              Optima
            </span>
          </Link>

          {/* Nav links + actions */}
          <div className="flex items-center gap-0.5">
            {user ? (
              <>
                <Link
                  to="/app/search"
                  className="flex items-center gap-2 text-[15px] font-medium text-gray-600 hover:text-dark transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  <Search size={15} />
                  Search
                </Link>

                <Link
                  to="/app/saved"
                  className="flex items-center gap-2 text-[15px] font-medium text-gray-600 hover:text-dark transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  <Bookmark size={15} />
                  Saved
                </Link>

                {isAdmin && (
                  <Link
                    to="/app/admin"
                    className="flex items-center gap-2 text-[15px] font-medium text-gray-600 hover:text-dark transition-colors px-4 py-2 rounded-lg hover:bg-gray-50"
                  >
                    <Shield size={15} />
                    Admin
                  </Link>
                )}

                {/* Avatar dropdown */}
                <div className="relative ml-2">
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className="w-8 h-8 bg-sky-300 text-white font-bold text-[13px] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm"
                  >
                    {initial}
                  </button>

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lifted z-10 py-1 overflow-hidden">
                        <div className="px-3.5 py-3 border-b border-gray-100">
                          {displayName && (
                            <p className="text-[14px] font-semibold text-dark truncate">{displayName}</p>
                          )}
                          <p className="text-[12px] text-muted truncate">{user.email}</p>
                          {isAdmin && (
                            <span className="inline-block mt-1.5 text-[10px] font-bold text-navy bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                              Admin
                            </span>
                          )}
                        </div>
                        {isAdmin && (
                          <Link
                            to="/app/admin"
                            onClick={() => setMenuOpen(false)}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] text-dark hover:bg-surface transition-colors"
                          >
                            <Shield size={13} className="text-muted" />
                            Admin Panel
                          </Link>
                        )}
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[14px] text-dark hover:bg-surface transition-colors text-left"
                        >
                          <LogOut size={13} className="text-muted" />
                          Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-[15px] font-semibold text-gray-700 hover:text-dark transition-colors px-5 py-2.5 rounded-lg hover:bg-gray-50"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="ml-2 text-[15px] font-bold bg-sky-300 text-white px-6 py-2.5 rounded-lg hover:bg-navy-600 transition-colors shadow-sm"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
      {/* Spacer */}
      <div className="h-[72px]" aria-hidden="true" />
    </>
  );
}
