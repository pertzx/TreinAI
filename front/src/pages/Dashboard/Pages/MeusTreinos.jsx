// MeusTreinos.jsx (com toasts temáticos)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../../Api';
import { FiChevronDown, FiChevronUp, FiPlus } from 'react-icons/fi';
import { getBrazilDate } from '../../../../helpers/getBrazilDate.js';

const MeusTreinos = ({ user, setUser, profissionalId, tema = 'dark' }) => {
  const isDark = tema === 'dark';

  const [meusTreinos, setMeusTreinos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rebuke, setRebuke] = useState(false);
  const [loadingIA, setLoadingIA] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [nextOrder, setNextOrder] = useState(1);

  // Inline inputs state
  const [newTreinoVisible, setNewTreinoVisible] = useState(false);
  const [newTreinoName, setNewTreinoName] = useState('');
  const newTreinoRef = useRef(null);

  const [addExVisibleMap, setAddExVisibleMap] = useState({});
  const [addExNameMap, setAddExNameMap] = useState({});
  const addExRefs = useRef({});

  // Autosave debounce
  const saveTimeoutRef = useRef(null);
  const lastSavedRef = useRef(getBrazilDate());
  const mountedRef = useRef(true);

  // toasts: { id, msg, variant }
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (rebuke) {
      const t = setTimeout(() => setRebuke(false), 2000);
      return () => clearTimeout(t);
    }
  }, [rebuke]);

  // toast helpers
  const showToast = (msg, variant = 'info', autoHide = 3500) => {
    if (!msg) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setToasts(prev => [...prev, { id, msg, variant }]);
    if (autoHide > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, autoHide);
    }
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // helper: normaliza e popula estados a partir do user (ou lista de treinos)
  const syncMeusTreinosFromUser = useCallback((userObj) => {
    try {
      const initialRaw = (userObj && Array.isArray(userObj.meusTreinos)) ? userObj.meusTreinos : [];
      let initial = [...initialRaw]
        .sort((a, b) => {
          const ao = typeof a.ordem !== 'undefined' ? Number(a.ordem) : Infinity;
          const bo = typeof b.ordem !== 'undefined' ? Number(b.ordem) : Infinity;
          return ao - bo;
        })
        .map((item, index) => ({
          ...item,
          ordem: typeof item.ordem !== 'undefined' ? Number(item.ordem) : index + 1,
          exercicios: Array.isArray(item.exercicios) ? item.exercicios : [],
        }));

      setMeusTreinos(initial);

      const expMap = {};
      initial.forEach(t => { expMap[t.treinoId] = false; });
      setExpanded(expMap);

      const vis = {};
      const names = {};
      initial.forEach(t => { vis[t.treinoId] = false; names[t.treinoId] = ''; });
      setAddExVisibleMap(vis);
      setAddExNameMap(names);
    } catch (err) {
      console.warn('syncMeusTreinosFromUser erro:', err);
      setMeusTreinos([]);
      setExpanded({});
      setAddExVisibleMap({});
      setAddExNameMap({});
    }
  }, []);

  // Carregar treinos iniciais a partir do user (ou criar no backend)
  useEffect(() => {
    const carregar = async () => {
      setLoading(true);
      try {
        if (!user) {
          setMeusTreinos([]);
          setLoading(false);
          return;
        }

        if (!Array.isArray(user.meusTreinos) || user.meusTreinos.length === 0) {
          // tenta criar treinos iniciais no backend
          try {
            const resp = await api.post('/criar-meusTreinos', { email: user.email, profissionalId });
            if (resp?.data?.msg) showToast(resp.data.msg, resp.data.success ? 'success' : 'info');
            // se backend retornar user atualizado, sincroniza
            if (resp?.data?.user && typeof setUser === 'function') {
              setUser(resp.data.user);
              syncMeusTreinosFromUser(resp.data.user);
            } else if (Array.isArray(resp?.data?.meusTreinos)) {
              // sincroniza apenas os treinos retornados
              syncMeusTreinosFromUser({ meusTreinos: resp.data.meusTreinos });
            } else {
              // fallback: usa user.meusTreinos (vazio)
              syncMeusTreinosFromUser(user);
            }
          } catch (err) {
            console.warn('Falha ao criar meusTreinos no backend (fallback local):', err);
            showToast(err?.response?.data?.msg || err?.message || 'Erro ao criar treinos', 'error');
            syncMeusTreinosFromUser(user);
          }
        } else {
          syncMeusTreinosFromUser(user);
        }
      } catch (err) {
        console.error('Erro ao carregar treinos:', err);
        setMeusTreinos([]);
        showToast('Erro ao carregar treinos', 'error');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    carregar();
  }, [user, setUser, syncMeusTreinosFromUser, profissionalId]);

  // calcula nextOrder a partir do histórico
  useEffect(() => {
    if (!user) { setNextOrder(1); return; }
    const historico = Array.isArray(user.historico) ? user.historico : [];
    if (historico.length === 0) { setNextOrder(1); return; }
    const ultimo = historico[historico.length - 1];
    const found = meusTreinos.find(t => t.treinoId === ultimo.treinoId);
    let computed = 1;
    if (found && typeof found.ordem === 'number') computed = found.ordem + 1;
    else computed = 1;
    setNextOrder(computed);
  }, [user, meusTreinos]);

  /* ------------------ helpers para salvar localmente (debounced) ------------------ */
  const saveChangesLocal = (updatedList) => {
    setMeusTreinos(updatedList);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const payload = { email: user.email, meusTreinos: updatedList };
      console.log('UPDATE (onChange) payload ->', payload);
      lastSavedRef.current = getBrazilDate();

      // Se quiser reabilitar o envio automático, pode descomentar.
      /*
      try {
        const res = await api.post('/atualizar-meusTreinos', payload);
        if (res?.data?.msg) showToast(res.data.msg, res.data.success ? 'success' : 'info');
        if (res?.data?.user && typeof setUser === 'function') setUser(res.data.user);
      } catch (err) {
        console.error('Erro ao atualizar meusTreinos:', err);
        showToast(err?.response?.data?.msg || err?.message || 'Erro ao salvar', 'error');
      }
      */
    }, 1000);
  };

  // aplica novas ordens e salva (usa PUT endpoint se desejar)
  const updateOrderAndSave = async (newList) => {
    if (!canEditSync()) { setRebuke(true); return; }
    const updated = newList.map((t, idx) => ({ ...t, ordem: idx + 1 }));
    saveChangesLocal(updated);
    // sincronizar com o backend imediatamente
    try {
      const res = await api.put('/atualizar-meusTreinos', { email: user.email, updated, profissionalId });
      if (res?.data?.msg) showToast(res.data.msg, res.data.success ? 'success' : 'info');
      if (res?.data?.user && typeof setUser === 'function') {
        setUser(res.data.user);
        syncMeusTreinosFromUser(res.data.user);
      } else {
        console.warn('PUT /atualizar-meusTreinos retornou sem user atualizado.');
      }
    } catch (err) {
      console.warn('Erro no PUT /atualizar-meusTreinos (mantendo estado local):', err);
      showToast(err?.response?.data?.msg || err?.message || 'Falha ao salvar ordem', 'error');
    }
  };

  /* ------------------ IA: gerar treino e exercício (sem reload) ------------------ */
  const generateTreinoIA = async (nome) => {
    if (!canEditSync()) { setRebuke(true); return; }
    if (!nome || !nome.trim()) return;
    const key = 'novoTreino';
    setLoadingIA(prev => ({ ...prev, [key]: true }));
    const payload = { email: user.email, nome, profissionalId };
    console.log('GENERATE TREINO (IA) payload ->', payload);

    try {
      const res = await api.post('/gerar-treino-ia', payload);
      if (res?.data?.msg) showToast(res.data.msg, res.data.success ? 'success' : 'info');
      if (res?.data?.user && typeof setUser === 'function') {
        setUser(res.data.user);
        syncMeusTreinosFromUser(res.data.user);
      } else if (Array.isArray(res?.data?.meusTreinos)) {
        syncMeusTreinosFromUser({ meusTreinos: res.data.meusTreinos });
      } else {
        // fallback local
        const newTreino = {
          treinoId: `local-${Date.now()}`,
          treinoName: nome,
          descricao: '',
          ordem: meusTreinos.length + 1,
          exercicios: []
        };
        const updated = [...meusTreinos, newTreino];
        saveChangesLocal(updated);
        console.warn('gerar-treino-ia: backend não retornou user/meusTreinos. Atualizado localmente.');
      }
    } catch (err) {
      console.error('Erro ao gerar treino via IA:', err);
      showToast(err?.response?.data?.msg || err?.message || 'Erro IA treinos', 'error');
    } finally {
      setLoadingIA(prev => ({ ...prev, [key]: false }));
    }
  };

  const generateExerciseIA = async (treinoId, nomeEx) => {
    if (!canEditSync()) { setRebuke(true); return; }
    if (!nomeEx || !nomeEx.trim()) return;
    setLoadingIA(prev => ({ ...prev, [treinoId]: true }));
    const payload = { email: user.email, treinoId, nome: nomeEx, profissionalId };
    console.log('GENERATE EXERCISE (IA) payload ->', payload);

    try {
      const res = await api.post('/gerar-exercicio-ia', payload);
      if (res?.data?.msg) showToast(res.data.msg, res.data.success ? 'success' : 'info');
      if (res?.data?.user && typeof setUser === 'function') {
        setUser(res.data.user);
        syncMeusTreinosFromUser(res.data.user);
      } else if (res?.data?.treinoAtual) {
        const updated = meusTreinos.map(t => t.treinoId === treinoId ? res.data.treinoAtual : t);
        saveChangesLocal(updated);
      } else {
        const novoEx = { exercicioId: `local-ex-${Date.now()}`, nome: nomeEx, ordem: (meusTreinos.find(t => t.treinoId === treinoId)?.exercicios.length || 0) + 1 };
        const updated = meusTreinos.map(t => t.treinoId === treinoId ? { ...t, exercicios: [...t.exercicios, novoEx] } : t);
        saveChangesLocal(updated);
        console.warn('gerar-exercicio-ia: backend não retornou treinoAtual. Atualizado localmente.');
      }
    } catch (err) {
      console.error('Erro ao gerar exercício via IA:', err);
      showToast(err?.response?.data?.msg || err?.message || 'Erro IA exercício', 'error');
    } finally {
      setLoadingIA(prev => ({ ...prev, [treinoId]: false }));
    }
  };

  /* ------------------ Drag and reorder handlers ------------------ */
  const handleDragStart = (e, treinoId) => {
    setDraggingId(treinoId);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', treinoId); } catch (err) { }
  };
  const handleDragOver = (e, targetId) => { e.preventDefault(); if (dragOverId !== targetId) setDragOverId(targetId); };
  const handleDragLeave = () => setDragOverId(null);
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!canEditSync()) { setDraggingId(null); setDragOverId(null); setRebuke(true); return; }
    const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
    if (!draggedId || draggedId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const fromIndex = meusTreinos.findIndex(t => t.treinoId === draggedId);
    const toIndex = meusTreinos.findIndex(t => t.treinoId === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const arr = [...meusTreinos];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    updateOrderAndSave(arr);
    setDraggingId(null); setDragOverId(null);
  };

  const moveUp = (treinoId) => {
    const idx = meusTreinos.findIndex(t => t.treinoId === treinoId);
    if (idx <= 0) return;
    const arr = [...meusTreinos];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    updateOrderAndSave(arr);
  };
  const moveDown = (treinoId) => {
    const idx = meusTreinos.findIndex(t => t.treinoId === treinoId);
    if (idx === -1 || idx >= meusTreinos.length - 1) return;
    const arr = [...meusTreinos];
    [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
    updateOrderAndSave(arr);
  };

  const toggleExpand = (treinoId) => {
    setExpanded(prev => ({ ...prev, [treinoId]: !prev[treinoId] }));
  };

  /* ------------------ adicionar / remover itens sem reload ------------------ */
  const handleToggleAddTreino = async () => {
    if (!canEditSync()) { setRebuke(true); return; }
    if (!newTreinoVisible) { setNewTreinoVisible(true); setTimeout(() => newTreinoRef.current?.focus?.(), 50); return; }
    if (newTreinoName && newTreinoName.trim()) {
      await generateTreinoIA(newTreinoName);
      setNewTreinoName('');
      setNewTreinoVisible(false);
    } else {
      setNewTreinoVisible(false);
    }
  };

  const handleToggleAddExercise = (treinoId) => {
    if (!canEditSync()) { setRebuke(true); return; }
    const visible = !!addExVisibleMap[treinoId];
    if (!visible) {
      setAddExVisibleMap(prev => ({ ...prev, [treinoId]: true }));
      setTimeout(() => addExRefs.current[treinoId]?.focus?.(), 50);
      return;
    }
    const name = (addExNameMap[treinoId] || '').trim();
    if (!name) {
      setAddExVisibleMap(prev => ({ ...prev, [treinoId]: false }));
      setAddExNameMap(prev => ({ ...prev, [treinoId]: '' }));
      return;
    }
    generateExerciseIA(treinoId, name);
    setAddExVisibleMap(prev => ({ ...prev, [treinoId]: false }));
    setAddExNameMap(prev => ({ ...prev, [treinoId]: '' }));
  };

  const deletarExercicio = async (exId, treinoId) => {
    if (!canEditSync()) { setRebuke(true); return; }
    if (!exId || !treinoId) return;
    try {
      const res = await api.delete(`/excluir-exercicio?email=${encodeURIComponent(user.email)}&exercicioId=${encodeURIComponent(exId)}&treinoId=${encodeURIComponent(treinoId)}&profissionalId=${profissionalId}`);
      if (res?.data?.msg) showToast(res.data.msg, res.data.success ? 'success' : 'info');
      if (res?.data?.user && typeof setUser === 'function') {
        setUser(res.data.user);
        syncMeusTreinosFromUser(res.data.user);
        return;
      }
      const updated = meusTreinos.map(t => {
        if (t.treinoId !== treinoId) return t;
        return { ...t, exercicios: (t.exercicios || []).filter(ex => ex.exercicioId !== exId) };
      });
      saveChangesLocal(updated);
    } catch (err) {
      console.error('Erro ao excluir exercício:', err);
      showToast(err?.response?.data?.msg || err?.message || 'Erro ao excluir exercício', 'error');
    }
  };

  const deletarTreino = async (treinoId) => {
    if (!canEditSync()) { setRebuke(true); return; }
    if (!treinoId) return;
    if (!confirm('Tem certeza que deseja excluir este treino?')) return;
    try {
      const res = await api.delete(`/excluir-treino?email=${encodeURIComponent(user.email)}&treinoId=${encodeURIComponent(treinoId)}&profissionalId=${profissionalId}`);
      if (res?.data?.msg) showToast(res.data.msg, res.data.success ? 'success' : 'info');
      if (res?.data?.user && typeof setUser === 'function') {
        setUser(res.data.user);
        syncMeusTreinosFromUser(res.data.user);
        return;
      }
      const updated = meusTreinos.filter(t => t.treinoId !== treinoId).map((t, idx) => ({ ...t, ordem: idx + 1 }));
      saveChangesLocal(updated);
    } catch (err) {
      console.error('Erro ao excluir treino:', err);
      showToast(err?.response?.data?.msg || err?.message || 'Erro ao excluir treino', 'error');
    }
  };

  // canEditSync: synchronous wrapper (used in handlers that expect sync)
  const canEditSync = () => {
    // permissões simples: se passou profissionalId, assume true (servidor fará validação)
    if (profissionalId) return true;
    return user?.planInfos?.planType !== 'free' && user?.planInfos?.status === 'ativo';
  };

  if (loading) return <div>Carregando treinos...</div>;

  // theme for toast boxes
  const toastClassFor = (variant) => {
    if (isDark) {
      if (variant === 'success') return 'bg-green-600 text-white border-transparent';
      if (variant === 'error') return 'bg-red-600 text-white border-transparent';
      return 'bg-gray-800 text-white border-transparent';
    } else {
      if (variant === 'success') return 'bg-green-50 text-green-800 border border-green-200';
      if (variant === 'error') return 'bg-red-50 text-red-800 border border-red-200';
      return 'bg-white text-gray-900 border border-gray-200';
    }
  };

  return (
    <div className="space-y-6 mt-6 relative">
      {/* Toast container (absolute) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2 rounded-lg shadow-lg ${toastClassFor(t.variant)} max-w-xs`}
            role="status"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">{t.msg}</div>
              <button onClick={() => removeToast(t.id)} className={`ml-2 text-xs ${isDark ? 'text-gray-200' : 'text-gray-600'}`}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {rebuke && (
        <div className={`p-4 border-4 rounded-2xl text-xl font-normal ${isDark ? 'bg-red-800 border-red-900 text-white' : 'bg-red-50 border-red-200 text-red-700'}`}>
          Somente usuarios com o plano <b>PRO, MAX ou COACH</b> podem editar os treinos!
        </div>
      )}

      {/* Novo treino */}
      <div className="flex items-center justify-end gap-3">
        {newTreinoVisible ? (
          <div className="flex items-center gap-2">
            <input ref={newTreinoRef} value={newTreinoName} onChange={(e) => setNewTreinoName(e.target.value)} placeholder="Nome do treino..." className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`} />
            <button onClick={handleToggleAddTreino} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg" disabled={loadingIA['novoTreino']}>
              {loadingIA['novoTreino'] ? 'Criando...' : <><FiPlus /> Criar</>}
            </button>
            <button onClick={() => { setNewTreinoVisible(false); setNewTreinoName(''); }} className={`px-3 py-2 rounded-lg border ${isDark ? 'border-gray-700 text-white hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} title="Cancelar">Cancelar</button>
          </div>
        ) : (
          <button onClick={handleToggleAddTreino} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg" title="Adicionar novo treino (clique para mostrar input)">
            <FiPlus /> Novo Treino
          </button>
        )}
      </div>

      <div className="grid gap-6">
        {meusTreinos.map((treino) => {
          const isDragging = draggingId === treino.treinoId;
          const isDragOver = dragOverId === treino.treinoId;
          const isExpanded = !!expanded[treino.treinoId];
          const isNextSlot = treino.ordem === nextOrder;
          const addVisible = !!addExVisibleMap[treino.treinoId];
          const addName = addExNameMap[treino.treinoId] || '';

          return (
            <div
              key={treino.treinoId}
              draggable
              onDragStart={(e) => handleDragStart(e, treino.treinoId)}
              onDragOver={(e) => handleDragOver(e, treino.treinoId)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, treino.treinoId)}
              tabIndex={0}
              aria-grabbed={isDragging}
              className={`p-6 border rounded-2xl shadow-md transition-all duration-300 ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-50 text-black'} ${isDragging ? 'opacity-70 border-dashed' : ''} ${isDragOver ? 'ring-2 ring-blue-300' : ''} ${isNextSlot ? 'border-2 border-green-500 ring-2 ring-green-200' : ''} w-full`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className="flex justify-between flex-col md:flex-row items-center mb-4 gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold truncate break-words">{treino.treinoName}</h2>
                  <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>ordem: {treino.ordem}</p>
                </div>

                <div className="flex flex-wrap justify-between items-center mb-4 gap-2 sm:gap-3">
                  {isNextSlot && <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold mr-2">Próximo treino</div>}

                  <button onClick={() => toggleExpand(treino.treinoId)} aria-expanded={isExpanded} className="p-2 rounded-md hover:bg-gray-100 transition" title={isExpanded ? 'Mostrar menos' : 'Mostrar mais'}>
                    {isExpanded ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                  </button>

                  <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 mr-2">
                    <span className="select-none">Arraste</span>
                    <svg className="w-5 h-5 opacity-60" viewBox="0 0 24 24" fill="none">
                      <path d="M7 10l5-5 5 5M7 14l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  <button onClick={() => moveUp(treino.treinoId)} title="Mover para cima" className={`px-2 sm:px-3 py-1 rounded-lg border ${isDark ? 'border-gray-700 text-white hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-100'}`}>↑</button>
                  <button onClick={() => moveDown(treino.treinoId)} title="Mover para baixo" className={`px-2 sm:px-3 py-1 rounded-lg border ${isDark ? 'border-gray-700 text-white hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-100'}`}>↓</button>

                  <button onClick={() => deletarTreino(treino.treinoId)} title="Excluir treino" className={`px-3 py-1 rounded-lg border ${isDark ? 'border-red-700 text-red-300 hover:bg-red-900/20' : 'border-red-300 text-red-600 hover:bg-red-100'}`}>Excluir</button>
                </div>
              </div>

              {treino.descricao && <p className={`${isDark ? 'text-gray-200' : 'text-gray-700'} mb-4`}>{treino.descricao}</p>}

              {!isExpanded ? (
                <div className={`${isDark ? 'bg-gray-700' : 'bg-white'} p-4 rounded-xl border`}>
                  <div><p className="font-medium">{(treino.exercicios || []).length} exercícios</p><p className="text-sm text-gray-400">Clique para ver detalhes.</p></div>
                  <div className="text-sm text-gray-400"><span className="block">{treino.exercicios?.[0]?.nome}</span><span className="block text-xs">{treino.exercicios && treino.exercicios.length > 1 ? `+${treino.exercicios.length - 1} outros` : ''}</span></div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {(treino.exercicios || []).map((ex) => (
                    <div key={ex.exercicioId} className={`p-4 border rounded-xl ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white shadow-sm'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-medium">{ex.nome}</p>
                        <p className="text-sm text-gray-500">{ex.musculo}</p>
                      </div>
                      <p className="text-sm text-gray-500">Ordem: {ex.ordem}</p>
                      {ex.instrucoes && <p className="text-sm mb-2">{ex.instrucoes}</p>}
                      <p className="text-sm">Séries: {ex.series} | Reps: {ex.repeticoes} {ex.pse ? `| pse: ${ex.pse}/10` : ''}</p>

                      <div className="mt-2 flex gap-2">
                        <button onClick={() => deletarExercicio(ex.exercicioId, treino.treinoId)} className={`px-3 py-1 rounded-lg border ${isDark ? 'border-gray-700 text-white hover:bg-gray-800' : 'border-gray-300 text-gray-800 hover:bg-gray-100'}`}>Excluir</button>
                      </div>
                    </div>
                  ))}

                  {/* Adicionar exercício */}
                  <div className="flex items-center justify-end gap-2">
                    {addVisible ? (
                      <>
                        <input ref={(el) => { addExRefs.current[treino.treinoId] = el; }} value={addName} onChange={(e) => setAddExNameMap(prev => ({ ...prev, [treino.treinoId]: e.target.value }))} placeholder="Nome do exercício..." className={`px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`} />
                        <button onClick={() => handleToggleAddExercise(treino.treinoId)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg" disabled={loadingIA[treino.treinoId]}>{loadingIA[treino.treinoId] ? 'Criando...' : 'Criar (IA)'}</button>
                        <button onClick={() => { setAddExVisibleMap(prev => ({ ...prev, [treino.treinoId]: false })); setAddExNameMap(prev => ({ ...prev, [treino.treinoId]: '' })); }} className={`px-3 py-2 rounded-lg border ${isDark ? 'border-gray-700 text-white hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}>Cancelar</button>
                      </>
                    ) : (
                      <button onClick={() => handleToggleAddExercise(treino.treinoId)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg"><FiPlus /> Adicionar Exercício</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MeusTreinos;
