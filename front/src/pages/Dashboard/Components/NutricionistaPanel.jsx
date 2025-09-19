// components/NutricionistaPanel.jsx
import React from 'react';
import ChatNutriAI from './ChatNutriAi';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { AnimatePresence, motion } from 'framer-motion';

export default function NutricionistaPanel(props) {
  const {
    user, tema, isDark, profissional, themeWithSpec, theme, base,
    alunosData, pending, accepted, expandedMap, toggleExpanded, chatStates, handleChatInputChange, sendMessageToUser,
    fetchAlunosDetails, handleAceitarAluno, handleRemoverAlunoClick, getSectionState, toggleSection,
    handleEditSubmit, editMode, editForm, setEditForm, handleEditImageChange, handleToggleEditMode
  } = props;

  // nutri-specific: obtém nutriInfos do usuário (exibir embaixo do chat com nutriAI)
  const userNutriInfos = user?.nutriInfos || null;

  return (
    <section className={`${themeWithSpec.card} ${theme.bg}`}>
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Painel — Nutricionista</h1>
          <p className={`text-sm mt-1 ${theme.muted}`}>Converse com a IA Nutri e gerencie pacientes.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchAlunosDetails(new AbortController().signal)} className={`${theme.ghostBtn} ${base.smallBtn}`}>Atualizar alunos</button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* card profissional */}
        <div className="lg:col-span-1">
          <div className={`${themeWithSpec.panel} p-3 rounded-2xl`}>
            <div className="flex gap-4">
              <div className="w-20 h-20 rounded overflow-hidden bg-gray-200">{ profissional?.imageUrl ? <img src={profissional.imageUrl} alt={profissional.profissionalName} className="w-full h-full object-cover" /> : <div className="p-2 text-xs">Sem imagem</div> }</div>
              <div className="flex-1">
                <div className="font-semibold">{profissional?.profissionalName || '—'}</div>
                <div className="text-xs text-gray-400">Especialidade: Nutricionista</div>
                <div className="text-sm mt-2">{profissional?.biografia}</div>
              </div>
            </div>

            <div className="mt-4">
              <button onClick={handleToggleEditMode} className={`${themeWithSpec.primaryBtn} ${base.smallBtn}`}>{editMode ? 'Cancelar' : 'Editar Perfil'}</button>
            </div>
          </div>
        </div>

        {/* painel principal */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`${themeWithSpec.panel} rounded-2xl p-3`}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">NutriAI</h2>
              <p className="text-sm text-gray-400">Converse com a IA nutricionista — ela pode criar/atualizar planos (somente salve se for plano válido).</p>
            </div>

            {/* ChatNutriAI component (pode ser seu componente existente) */}
            <div className="mb-4">
              <ChatNutriAI user={user} tema={tema} profissionalId={profissional?.profissionalId || profissional?._id || profissional?.userId} />
            </div>

            {/* abaixo mostre nutriInfos do usuário (plano nutrit.) */}
            <div className="mt-4">
              <h3 className="font-semibold">Plano nutricional do usuário</h3>
              {!userNutriInfos || !userNutriInfos.planoNutricional || userNutriInfos.planoNutricional.length === 0 ? (
                <div className="text-sm text-gray-500 mt-2">Usuário não possui plano nutricional.</div>
              ) : (
                <div className="mt-2 grid gap-2">
                  {userNutriInfos.planoNutricional.map((p, idx) => (
                    <div key={idx} className="p-2 rounded border bg-white/5">
                      <div className="text-sm font-medium">{p.horaDoDia || `Item ${idx+1}`}</div>
                      <div className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{p.conteudo}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* alunos / chat (reaproveitado de comportamento padrão) */}
          <div className={`${themeWithSpec.panel} rounded-2xl p-3`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Meus Pacientes <span className="text-sm text-gray-400">({accepted.length})</span></h2>
              <div className={`${theme.muted} text-sm`}>Gerencie pacientes e conversas</div>
            </div>

            {accepted.length === 0 ? <div className="text-sm text-gray-500">Nenhum paciente aceito ainda.</div> : (
              <div className="flex flex-col gap-4">
                {accepted.map(item => {
                  const chState = chatStates[item.userId] || {};
                  const expanded = !!expandedMap[item.userId];
                  return (
                    <div key={String(item.userId)} className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{item.user?.name || item.user?.username || 'Paciente'}</div>
                          <div className="text-xs text-gray-400">Última atualização: {item.ultimoUpdate ? new Date(item.ultimoUpdate).toLocaleString() : '—'}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => toggleExpanded(item.userId)} className={`${base.smallBtn} ${theme.ghostBtn}`}>{expanded ? 'Fechar' : 'Abrir'}</button>
                          <button onClick={() => handleRemoverAlunoClick(item.userId)} className={`${base.smallBtn} ${isDark ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}>Remover</button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expanded && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
                            <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} p-3 rounded-md border`}>
                              <div className="mb-2 font-semibold">Chat</div>
                              <div className="h-48 overflow-auto border rounded p-2">
                                {(chState.messages || []).length === 0 ? <div className="text-xs text-gray-500">Nenhuma mensagem</div> : (chState.messages || []).map(m => {
                                  const mine = String(m.userId) === String(user?._id || user?.userId);
                                  return (
                                    <div key={m.mensagemId} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`${mine ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-black'} p-2 rounded-md`}>{m.conteudo}<div className="text-[10px] mt-1 text-gray-500">{m.publicadoEm ? new Date(m.publicadoEm).toLocaleString() : ''}</div></div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-2 flex gap-2">
                                <input value={chState.newMessage || ''} onChange={e => handleChatInputChange(item.userId, e.target.value)} className={theme.input} placeholder="Escreva..." />
                                <button onClick={() => sendMessageToUser(item.userId)} className={`${themeWithSpec.primaryBtn} ${base.smallBtn}`}>Enviar</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      <footer className={`mt-6 text-sm ${theme.muted} text-center`}>Painel Nutricionista</footer>
    </section>
  );
}
