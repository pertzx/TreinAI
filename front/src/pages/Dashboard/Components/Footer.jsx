// src/components/Footer.jsx
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { FiInstagram, FiMail, FiGithub, FiArrowUp, FiUser, FiLogOut } from 'react-icons/fi';
import Logo from '../../../components/Logo';

export default function Footer({
  tema = 'dark',
  user = null,
  onLogout = null,
  links = [
    { label: 'Sobre', href: '/sobre' },
    { label: 'Ajuda', href: '/ajuda' },
    { label: 'Termos', href: '/termos' }
  ],
  social = [
    { label: 'GitHub', href: 'https://github.com', icon: <FiGithub /> },
    { label: 'Instagram', href: 'https://instagram.com', icon: <FiInstagram /> },
    { label: 'Contato', href: 'mailto:hi@example.com', icon: <FiMail /> }
  ],
  copyrightText = null,
  sticky = false,
  showBackToTop = true
}) {
  const isDark = tema === 'dark';
  const bg = isDark ? 'text-gray-100' : 'bg-white text-gray-900';
  const panel = isDark ? '' : 'bg-gray-50';
  const muted = isDark ? 'text-gray-400' : 'text-gray-600';
  const linkHover = isDark ? 'hover:text-white' : 'hover:text-gray-900';
  const profileBg = isDark ? 'bg-gray-800' : 'bg-white';

  const [showTopBtn, setShowTopBtn] = useState(false);

  useEffect(() => {
    if (!showBackToTop) return;
    const onScroll = () => setShowTopBtn(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [showBackToTop]);

  const handleBackToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const handleLogout = () => {
    if (typeof onLogout === 'function') return onLogout();
    // fallback: try to call a /logout route or simply reload
    try {
      // optional: call API logout here if you want
      window.location.href = '/logout';
    } catch (err) {
      window.location.reload();
    }
  };

  return (
    <>
      <footer className={`${bg} ${sticky ? 'sticky bottom-0 left-0 w-full z-40' : ''} border-t border-gray-200`}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 ${panel}`}>
          <div className="flex flex-col xl:flex-row items-center xl:items-center justify-between gap-4">
            {/* Left: Branding + copy */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 min-w-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-md flex items-center justify-center ${isDark ? 'bg-indigo-600' : 'bg-indigo-600'}`}>
                  <Logo scale={1} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">TreinAI</div>
                  <div className={`text-xs ${muted} truncate`}>Treinador IA</div>
                </div>
              </div>

              <div className="hidden sm:block border-l border-gray-300 h-8 mx-3" />

              <div className="text-xs">
                <div className={`${muted}`}>
                  {copyrightText ||
                    `© ${new Date().getFullYear()} Seu App. Todos os direitos reservados.`}
                </div>
              </div>
            </div>

            {/* Center: links */}
            <nav className="flex gap-4 flex-wrap justify-center">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.href}
                  className={`text-sm ${muted} ${linkHover} transition-colors`}
                  aria-label={l.label}
                >
                  {l.label}
                </a>
              ))}
            </nav>

            {/* Right: user (if any) + social */}
            <div className="flex items-center gap-3">
              {user ? (
                <div className={`hidden sm:flex items-center gap-3 px-3 py-2 rounded-md ${profileBg} border`}>
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                    {user?.avatar ? (
                      <img src={user.avatar} alt={user.name || user.username || 'user'} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-medium text-gray-700">{(user?.name || user?.username || 'U').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="text-xs text-left min-w-0">
                    <div className="text-sm font-medium truncate">{user?.name || user?.username || 'Usuário'}</div>
                    <div className={`${muted} truncate`}>{user?.email || ''}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <a href="/dashboard/perfil" title="Perfil" className="p-2 rounded-md hover:bg-gray-100">
                      <FiUser  />
                    </a>
                    <button onClick={handleLogout} title="Sair" className="p-2 rounded-md hover:bg-gray-100">
                      <FiLogOut />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2">
                {social.map((s, i) => (
                  <a
                    key={i}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={s.label}
                    className={`p-2 rounded-md ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                  >
                    <span className={`inline-flex items-center justify-center text-sm ${isDark ? 'text-gray-100' : 'text-gray-700'}`}>
                      {s.icon}
                    </span>
                  </a>
                ))}
              </div>

              {showBackToTop && (
                <button
                  onClick={handleBackToTop}
                  aria-label="Voltar ao topo"
                  className={`hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-md ${isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'} transition`}
                >
                  <FiArrowUp />
                  <span className="text-sm">Topo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* Floating back-to-top visible on scroll (mobile) */}
      {showBackToTop && showTopBtn && (
        <button
          onClick={handleBackToTop}
          aria-label="Subir"
          className="fixed right-4 bottom-20 z-50 p-3 rounded-full shadow-lg bg-indigo-600 text-white sm:hidden"
        >
          <FiArrowUp />
        </button>
      )}
    </>
  );
}

Footer.propTypes = {
  tema: PropTypes.oneOf(['dark', 'light']),
  user: PropTypes.shape({
    name: PropTypes.string,
    username: PropTypes.string,
    email: PropTypes.string,
    avatar: PropTypes.string
  }),
  onLogout: PropTypes.func,
  links: PropTypes.array,
  social: PropTypes.array,
  copyrightText: PropTypes.string,
  sticky: PropTypes.bool,
  showBackToTop: PropTypes.bool
};
