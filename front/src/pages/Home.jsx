import React from 'react'
import Header from '../components/Header'
import SmartphoneAnimation from '../components/SmartphoneAnimation'
import {
    LuBadgeCheck, LuBellRing, LuCalendarDays, LuArrowUpRight,
    LuAmbulance, LuSunDim, LuTvMinimal, LuBadgeDollarSign
} from "react-icons/lu"
import { NavLink } from 'react-router-dom'

function Home({logado}) {
    return (
        <>
            {/* HERO */}
            <section className='flex gap-y-10 md:gap-y-0 items-center md:gap-10 flex-col md:justify-center md:flex-row h-full px-4'>
                <div className='w-full md:w-1/2 flex flex-col gap-y-10 items-center md:items-start h-full justify-around'>
                    <Header logado={logado} />
                    <div className='flex flex-col items-center text-center md:items-start md:text-start gap-4'>
                        <h1 className='text-5xl md:text-7xl font-semibold text-white'>Seu coach digital pessoal</h1>
                        <p className='text-xl font-medium w-full text-gray-400 max-w-lg'>
                            Treine de forma inteligente e alcance seus objetivos com a ajuda da nossa IA.
                        </p>
                        <NavLink to="/planos">
                            <button className='bg-blue-600 hover:bg-blue-700 text-white p-3 px-6 rounded-xl mt-5 text-xl transition'>
                                Comece já
                            </button>
                        </NavLink>
                    </div>
                </div>
                <SmartphoneAnimation />
            </section>

            {/* BENEFÍCIOS */}
            <section className='flex bg-white/90 backdrop-blur-md text-black gap-10 shadow-lg p-8 rounded-3xl border border-gray-200 items-center justify-center w-full flex-col md:flex-row my-16'>
                <div className='flex flex-col flex-wrap gap-5 text-lg md:text-xl'>
                    <h3 className='flex items-center gap-2 font-medium'><LuBadgeCheck color='#155dfc' />Converse com seu coach IA</h3>
                    <h3 className='flex items-center gap-2 font-medium'><LuCalendarDays color='#155dfc' />Siga o plano ideal para você</h3>
                    <h3 className='flex items-center gap-2 font-medium'><LuArrowUpRight color='#155dfc' />Acompanhe o seu progresso real</h3>
                </div>
                <div className='aspect-[0.5] w-1/2 md:w-1/4 xl:w-1/6 rounded-3xl bg-gray-950 border-gray-900 border-4 flex items-center justify-center'>
                    <img src="/src/images/8.png" alt="Preview" className='w-full rounded-xl' />
                </div>
            </section>

            {/* DEMONSTRAÇÃO */}
            <section className='flex flex-col gap-8 w-full items-center text-2xl md:text-4xl px-4'>
                <h1 className='text-white'>Veja o TreinAI em ação</h1>
                <div className='w-full md:w-1/2 aspect-video bg-gray-100 border border-gray-300 rounded-xl overflow-hidden flex items-center justify-center'>
                    <img src="https://tse2.mm.bing.net/th/id/OIP.pkx6_050Q-DYENqEDTD_UQHaEK?pid=Api&P=0&h=180" alt="Demo" className='h-full w-auto' />
                </div>
                <h1 className='text-white text-center'>Tudo o que seu treino precisa – em um só lugar:</h1>

                <div className='w-full md:w-2/3'>
                    <div className='grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4 text-base md:text-lg text-white'>
                        <h3 className='flex items-center gap-2 font-medium'><LuBadgeCheck color='#155dfc' />Planos flexíveis e adaptáveis</h3>
                        <h3 className='flex items-center gap-2 font-medium'><LuSunDim color='#155dfc' />Modo claro e escuro</h3>
                        <h3 className='flex items-center gap-2 font-medium'><LuAmbulance color='#155dfc' />Suporte a lesões</h3>
                        <h3 className='flex items-center gap-2 font-medium'><LuBellRing color='#155dfc' />Motivação constante com feedbacks</h3>
                        <h3 className='flex items-center gap-2 font-medium'><LuTvMinimal color='#155dfc' />Interface simples e intuitiva</h3>
                        <h3 className='flex items-center gap-2 font-medium'><LuBadgeDollarSign color='#155dfc' />Preço acessível</h3>
                    </div>
                </div>
            </section>

            {/* CHAMADA PLANOS (teaser, não os cards inteiros) */}
            <section className="text-center my-20 pb-20 px-4">
                <h2 className="text-white text-3xl md:text-4xl font-bold mb-4">
                    Escolha seu plano e comece hoje
                </h2>
                <p className="text-gray-400 max-w-xl mx-auto mb-6">
                    A partir de <span className="text-blue-500 font-semibold">R$14,99/mês</span> você já pode ter treinos inteligentes com IA.
                </p>
                <NavLink to="/planos">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-lg font-medium transition">
                        Ver todos os planos →
                    </button>
                </NavLink>
            </section>
        </>
    )
}

export default Home
