import React, { useState } from 'react'
import { LuMenu, LuX } from "react-icons/lu"
import { Link } from 'react-router-dom' // se usar React Router

export default function Menu() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 bg-[#10151e] text-white shadow-md z-50">
      <nav className="max-w-7xl mx-auto flex items-center justify-between p-4 md:px-8">
        {/* Logo */}
        <div className="text-2xl font-bold cursor-pointer">
          <Link to="/">TreinAI</Link>
        </div>

        {/* Menu desktop */}
        <ul className="hidden md:flex gap-8 font-semibold">
          <li>
            <a href="/planos" className="hover:text-blue-500 transition">Planos</a>
          </li>
          <li>
            <Link to="/login" className="hover:text-blue-500 transition">Login</Link>
          </li>
        </ul>

        {/* Botão menu mobile */}
        <button
          className="md:hidden text-3xl focus:outline-none"
          onClick={() => setOpen(!open)}
          aria-label="Abrir menu"
        >
          {open ? <LuX /> : <LuMenu />}
        </button>
      </nav>

      {/* Menu mobile */}
      <div
        className={`md:hidden bg-[#10151e] fixed top-[64px] left-0 right-0 overflow-hidden transition-all duration-300 ease-in-out
          ${open ? 'max-h-48 py-4' : 'max-h-0'}`}
      >
        <ul className="flex flex-col gap-4 px-6 text-lg font-semibold">
          <li>
            <a href="/planos" onClick={() => setOpen(false)} className="block hover:text-blue-500 transition">Planos</a>
          </li>
          <li>
            <Link to="/login" onClick={() => setOpen(false)} className="block hover:text-blue-500 transition">Login</Link>
          </li>
        </ul>
      </div>
    </header>
  )
}
