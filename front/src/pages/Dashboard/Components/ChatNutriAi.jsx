// ChatNutriAI.jsx
import React, { useEffect, useRef, useState } from 'react';
import api from '../../../Api.js'; // ajuste se necessário

export default function ChatNutriAI({ user, tema = 'dark', profissionalId = null }) {
  const isDark = tema === 'dark';

  const theme = {
    container: isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900',
    panel: isDark ? 'bg-gray-800 border-green-400 shadow-md shadow-green-500' : 'bg-gray-50 border-green-400 shadow-xl shadow-green-500',
    input: isDark ? 'bg-gray-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900',
    primaryBtn: 'bg-indigo-600 text-white',
    notifyBg: isDark ? 'bg-indigo-700 text-white' : 'bg-indigo-50 text-indigo-900',
    errorBg: isDark ? 'bg-red-700 text-white' : 'bg-red-50 text-red-900'
  };

  const [messages, setMessages] = useState(() => [
    { id: 'w-1', from: 'nutri', text: 'Olá! Eu sou sua NutriAI — pergunte sobre seu plano nutricional ou peça alterações.', createdAt: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  let c = -2
  const [nutriInfos, setNutriInfos] = useState(() => (user && user.nutriInfos ? user.nutriInfos : null));
  const [notify, setNotify] = useState(null); // { text, type: 'info'|'error' }
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  // helper: show notification (auto hide)
  const showNotify = (text, type = 'info', timeout = 3500) => {
    setNotify({ text, type });
    setTimeout(() => setNotify(null), timeout);
  };

  // scroll to bottom on new message if at bottom
  useEffect(() => {

    c += 1

    if (c <= 0) return

    const el = containerRef.current;
    if (!el) return;
    // if user is near bottom, scroll; else don't interrupt
    const threshold = 120;
    const scrollBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (scrollBottom <= threshold) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const allowedToUse = () => {
    const plan = user?.planInfos?.planType;
    return profissionalId !== null ? true : (plan === 'max' || plan === 'coach');
  };

  const sendToServer = async (text) => {
    // server expects body: { email, conteudo, profissionalId }
    setLoading(true);
    try {
      const body = { email: user.email, conteudo: text };
      if (profissionalId) body.profissionalId = profissionalId;
      const res = await api.post('/conversar-nutri', body);
      const data = res?.data || {};

      // show server msg if present
      if (data.msg) {
        console.log(data)
        showNotify(data.msg, data.success === false ? 'error' : 'info');
      }

      // If backend returned nutriInfos, update local view
      if (data.nutriInfos && Array.isArray(data.nutriInfos.planoNutricional)) {
        setNutriInfos({
          userId: data.nutriInfos.userId || String(user._id),
          planoNutricional: data.nutriInfos.planoNutricional
        });

        // also append an AI message that a plan foi criada/atualizada (use data.msg when available)
        const textResp = data.msg || 'Plano nutricional atualizado.';
        setMessages(prev => [...prev, { id: `ai-${Date.now()}`, from: 'nutri', text: textResp, createdAt: new Date() }]);
      } else {
        // fallback: if API returned a textual reply (msg) show it, else generic success/fail
        if (typeof data.success !== 'undefined') {
          if (data.success) {
            const successText = data.msg || 'Resposta da NutriAI recebida.';
            setMessages(prev => [...prev, { id: `ai-${Date.now()}`, from: 'nutri', text: successText, createdAt: new Date() }]);
          } else {
            const failText = data.msg || 'A NutriAI não conseguiu gerar uma resposta válida.';
            setMessages(prev => [...prev, { id: `ai-${Date.now()}`, from: 'nutri', text: failText, createdAt: new Date() }]);
          }
        } else {
          // no structured response, attempt to show raw message if present
          if (data?.raw) {
            setMessages(prev => [...prev, { id: `ai-${Date.now()}`, from: 'nutri', text: String(data.raw).slice(0, 1000), createdAt: new Date() }]);
          } else {
            setMessages(prev => [...prev, { id: `ai-${Date.now()}`, from: 'nutri', text: 'Resposta recebida (sem conteúdo estruturado).', createdAt: new Date() }]);
          }
        }
      }

      return data;
    } catch (err) {
      console.error('conversar-nutri error', err);
      const msg = err?.response?.data?.msg || 'Erro ao comunicar com servidor.';
      showNotify(msg, 'error');
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, from: 'nutri', text: `Erro: ${msg}`, createdAt: new Date() }]);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const texto = (input || '').trim();
    if (!texto) return;
    if (!user) {
      showNotify('Faça login para usar a NutriAI.', 'error');
      return;
    }
    // check plan
    if (!allowedToUse()) {
      showNotify('NutriAI disponível apenas para planos MAX ou COACH. Atualize seu plano para usar.', 'error');
      return;
    }

    // optimistic add user message
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, from: 'user', text: texto, createdAt: new Date() }]);
    setInput('');

    // call server
    await sendToServer(texto);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // render plano nutricional card
  const renderPlano = () => {
    const plano = nutriInfos?.planoNutricional;
    if (!Array.isArray(plano) || plano.length === 0) {
      return <div className="text-sm text-gray-400">Nenhum plano nutricional ainda.</div>;
    }
    return (
      <div className="space-y-3">
        {plano.map((it, idx) => (
          <div key={idx} className={`p-3 rounded-lg ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border`}>
            <div className="flex justify-between items-start">
              <div className="text-sm font-medium">{it.horaDoDia || 'Horário não especificado'}</div>
            </div>
            <div className="text-sm mt-2 whitespace-pre-wrap">{it.conteudo}</div>
          </div>
        ))}
      </div>
    );
  };

  // if user changes and has nutriInfos we sync local copy
  useEffect(() => {
    if (user && user.nutriInfos) setNutriInfos(user.nutriInfos);
  }, [user]);

  return (
    <div className={`w-full max-w-3xl mx-auto p-4 rounded-2xl shadow-md ${theme.container}`}>
      <div className={`mb-4 p-3 rounded-lg border ${theme.panel}`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-lg font-semibold">NutriAI</div>
            <div className="text-xs text-gray-400">Converse com o seu nutricionista virtual</div>
          </div>
          <div className="text-xs text-gray-400">{user ? (user.email || user.username || '') : 'Usuário não autenticado'}</div>
        </div>

        <div ref={containerRef} className={`max-h-[40vh] overflow-auto p-2 mb-3 rounded ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
          {messages.map((m) => (
            <div key={m.id} className={`mb-3 max-w-[85%] ${m.from === 'user' ? 'ml-auto' : ''}`}>
              <div className={`p-3 rounded-2xl ${m.from === 'user' ? (isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-gray-900') : (isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900')}`}>
                <div className="text-sm whitespace-pre-wrap">{m.text}</div>
                <div className="text-[10px] opacity-70 mt-1">{new Date(m.createdAt).toLocaleString('pt-BR')}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2">
          <input
            type='text'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={user ? (allowedToUse() ? 'Escreva sua pergunta para a NutriAI...' : 'NutriAI disponível apenas para planos MAX/COACH') : 'Faça login para conversar'}
            className={`flex-1 p-3 rounded-lg border ${theme.input}`}
            rows={2}
            disabled={!user || !allowedToUse()}
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSend}
              disabled={!user || !allowedToUse() || loading || !input.trim()}
              className={`px-4 py-2 rounded-lg ${theme.primaryBtn} ${(!user || !allowedToUse() || loading || !input.trim()) ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Enviando...' : 'Enviar'}
            </button>
            <button
              onClick={() => {
                if (!user) { showNotify('Faça login para usar.', 'error'); return; }
                if (!allowedToUse()) { showNotify('Disponível apenas para planos MAX/COACH.', 'error'); return; }
                setInput('');
              }}
              className="px-3 py-1 rounded-lg border text-sm"
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* plano nutricional abaixo do chat */}
      <div className={`p-4 rounded-lg border ${theme.panel}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Plano Nutricional</div>
          <div className="text-xs text-gray-400">Atualizado em: {nutriInfos?.atualizadoEm ? new Date(nutriInfos.atualizadoEm).toLocaleString('pt-BR') : '—'}</div>
        </div>

        <div className="flex items-start flex-col gap-2 border-2 rounded-2xl border-red-400 shadow-md shadow-red-500 p-4 mb-3">
          <h1 className={`font-semibold`}>Restrições</h1>
          <p className={`font-light italic`}>{nutriInfos?.restricoes ? nutriInfos?.restricoes : 'Sem restricoes!'}</p>
        </div>

        {renderPlano()}
      </div>

      {/* notification absolute (bottom-right) */}
      {notify && (
        <div
          className={`fixed right-4 bottom-6 z-50 px-4 py-3 rounded-lg shadow-lg ${notify.type === 'error' ? theme.errorBg : theme.notifyBg}`}
          role="status"
        >
          <div className="text-sm">{notify.text}</div>
        </div>
      )}
    </div>
  );
}
