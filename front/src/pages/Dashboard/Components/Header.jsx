import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Logo from '../../../components/Logo';
import { LuMenu } from 'react-icons/lu';

const Header = ({ user, tema }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Home', href: '/dashboard' },
    { name: 'Encontrar', href: '/dashboard/encontrar' },
    { name: 'Meus Treinos', href: '/dashboard/meus-treinos' },
    { name: 'Histórico', href: '/dashboard/historico' },
    { name: 'Perfil', href: '/dashboard/perfil' },
    { name: 'Configurações', href: '/dashboard/configuracoes' },
  ];

  // Classes do tema
  const themeClasses = tema === 'dark'
    ? {
      headerBg: 'bg-[#10151e] text-white border-b border-blue-600',
      logoText: 'text-blue-600',
      linkHover: 'hover:text-blue-400',
      buttonBg: 'bg-green-500 hover:bg-green-600 text-white'
    }
    : {
      headerBg: 'bg-white text-black border-b border-gray-300',
      logoText: 'text-blue-700',
      linkHover: 'hover:text-blue-500',
      buttonBg: 'bg-green-600 hover:bg-green-700 text-white'
    };

  return (
    <header className={`${themeClasses.headerBg} p-3`}>
      <div className="flex justify-between flex-col gap-2 sm:flex-row sm:gap-0 items-center">
        {/* Logo e nome */}
        <NavLink to="/dashboard" className="flex items-center gap-2">
          <Logo scale={1} />
          <h1 className={`font-bold text-2xl ${themeClasses.logoText}`}>TreinAI</h1>
        </NavLink>

        {/* NavLinks desktop */}
        <nav className="hidden xl:flex gap-6">
          {navLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              end={link.href === '/dashboard'} // Aplica end apenas no Home
              className={({ isActive }) =>
                `${themeClasses.linkHover} transition ${isActive ? 'font-bold' : ''}`
              }
            >
              {link.name}
            </NavLink>
          ))}
        </nav>

        {/* Botão e círculo */}
        <div className="flex items-center gap-4">

          <p>Olá, {user.username}</p>

          <NavLink to="/dashboard/perfil" className="w-10 h-10 rounded-full bg-blue-600"
            style={{
              backgroundImage: `url(${user.avatar})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat'
            }}
          ></NavLink>

          {/* Botão mobile para abrir menu */}
          <button
            className="xl:hidden ml-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <LuMenu className="text-2xl" />
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {menuOpen && (
        <nav className="flex flex-col gap-3 mt-3 xl:hidden">
          {navLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              end={link.href === '/dashboard'} // Aplica end apenas no Home
              className={({ isActive }) =>
                `${themeClasses.linkHover} transition ${isActive ? 'font-bold' : ''}`
              }
              onClick={() => setMenuOpen(false)} // fecha menu ao clicar
            >
              {link.name}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
};

export default Header;
