import React, { useState } from 'react'
import { NavLink, redirect } from 'react-router-dom'
import { useNavigate } from 'react-router-dom';

function Planos({ setPlano, setNeedToPay }) {

    var [plano, setplano] = useState('free')
    var navigate = useNavigate()

    const handleBack = () => {
        navigate("/"); // se não tiver histórico, vai pra Home
    };

    return (
        <section className='my-20 pb-20 flex mb-16 flex-col items-center px-4' >


            <div className='flex flex-col md:flex-row gap-3 items-center justify-center text-xl mb-8'>
                <button
                    onClick={handleBack}
                    className=" left-4 top-4 text-slate-400 hover:text-white text-sm flex items-center gap-1"
                >
                    ← Voltar
                </button>
                <h1 className='text-white'>Quem já usa, recomenda</h1>
                <p className='font-light text-center md:text-left text-white'>
                    <span>Acesse a partir de:</span><br />
                    <span className='text-blue-600 font-medium text-2xl'>R$14,99/mês</span>
                </p>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-6xl' id='planos'>

                {/* Plano Free */}
                <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-200 hover:scale-[1.02] transition">
                    <h2 className="text-xl font-bold text-white mb-1">🆓 Plano Free (Grátis)</h2>
                    <p className="text-lg font-semibold text-gray-700 mb-3">R$0 / mês</p>
                    <p className="text-sm text-gray-600 font-semibold mb-2">Inclui:</p>
                    <ul className="space-y-2 text-gray-700 text-sm list-disc list-inside">
                        <li className='text-red-400'>5 treinos por semana com IA</li>
                        <li>Acesso ao chat com treinador IA</li>
                        <li>Feedback após o treino</li>
                        <li>Onboarding personalizado</li>
                    </ul>
                    <NavLink to="/login">

                        <button

                            onClick={() => {
                                setPlano('free')
                            }}
                            className="mt-4 w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 transition">Iniciar agora</button>
                    </NavLink>
                </div>

                {/* Plano Pro */}
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-blue-500 hover:scale-[1.02] transition">
                    <h2 className="text-xl font-bold text-blue-700 mb-1">💪 Plano Pro – Treino Inteligente</h2>
                    <p className="text-lg font-semibold text-blue-700 mb-3">R$14,99 / mês</p>
                    <p className="text-sm text-blue-600 font-semibold mb-2">Inclui:</p>
                    <ul className="space-y-2 text-gray-700 text-sm list-disc list-inside">
                        <li>Treinos diários ilimitados</li>
                        <li>IA que adapta o treino com base no seu feedback</li>
                        <li>Ciclos de treino de 4, 8 ou 12 semanas</li>
                        <li>Imagens dos exercícios geradas por IA</li>
                        <li>Relatórios semanais de progresso</li>
                        <li>Modo escuro</li>
                    </ul>

                    <NavLink to="/login">
                        <button onClick={() => {
                            setPlano('pro')
                            setNeedToPay(true)
                        }} className="mt-4 w-full bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 transition">Assinar agora</button>
                    </NavLink>
                </div>

                {/* Plano Max */}
                <div className="bg-gray-50 rounded-2xl shadow-xl p-6 border border-green-500 hover:scale-[1.02] transition">
                    <h2 className="text-xl font-bold text-green-700 mb-1">🧠 Plano Max – Corpo e Mente</h2>
                    <p className="text-lg font-semibold text-green-700 mb-3">R$39,99 / mês</p>
                    <p className="text-sm text-green-600 font-semibold mb-2">Inclui tudo do Pro, mais:</p>
                    <ul className="space-y-2 text-gray-700 text-sm list-disc list-inside">
                        <li>Plano alimentar com IA (NutriAI)</li>
                        <li>Recomendações de refeição baseadas no treino do dia</li>
                        <li>Treino mental (ZenTrain)</li>
                        <li>Checklist diário: treino + alimentação + mental</li>
                        <li>Modo desafio semanal</li>
                    </ul>
                    <NavLink to="/login">
                        <button onClick={() => {
                            setPlano('max')
                            setNeedToPay(true)
                        }} className="mt-4 w-full bg-green-600 text-white rounded-lg py-2 hover:bg-green-700 transition">Assinar agora</button>
                    </NavLink>
                </div>

                {/* Plano Coach */}
                <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 rounded-2xl shadow-2xl p-6 border-2 border-yellow-400 text-white hover:scale-[1.02] transition">
                    <h2 className="text-xl font-bold mb-1">🧑‍🏫 Plano Coach – Para Personal Trainers</h2>
                    <p className="text-lg font-semibold text-yellow-300 mb-3">R$69,99 / mês</p>
                    <p className="text-sm font-semibold mb-2 text-yellow-300">Inclui tudo do Max, mais:</p>
                    <ul className="space-y-2 text-sm list-disc list-inside">
                        <li>Marca própria (white label)</li>
                        <li>Painel com todos os alunos</li>
                        <li>Dashboard de feedbacks</li>
                        <li>Funis de venda com CoachFunnels</li>
                        <li>Ranking e desafios com RankFit</li>
                        <li>Link próprio para atrair alunos</li>
                    </ul>
                    <NavLink to="/login">
                        <button onClick={() => {
                            setPlano('coach')
                            setNeedToPay(true)
                        }} className="mt-4 w-full bg-yellow-400 text-blue-900 font-semibold rounded-lg py-2 hover:bg-yellow-300 transition">Assinar agora</button>
                    </NavLink>
                </div>

            </div>
        </section>
    )
}

export default Planos