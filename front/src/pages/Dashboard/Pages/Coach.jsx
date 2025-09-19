import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import api from '../../../Api';
import locationsData from '../../../data/locations.json';
import MeusTreinos from './MeusTreinos';
import HistoricoChart from '../Components/HistoricoChart';
import ChatNutriAI from '../Components/ChatNutriAi';

const base = {
  card: 'p-4',
  panel: 'p-3 border',
  smallBtn: 'px-3 py-1 rounded-2xl'
};
const especialidadeLabels = {
  'personal-trainner': 'Personal Trainer',
  nutricionista: 'Nutricionista',
  fisioterapeuta: 'Fisioterapeuta'
};
const getSpecialtyTheme = (especialidade = 'personal-trainner', isDark = true) => {
  const map = {
    'personal-trainner': { label: 'PT', pill: 'px-2 py-0.5 rounded bg-indigo-600 text-white', btnClass: isDark ? 'bg-indigo-600 text-white rounded-xl' : 'bg-indigo-500 text-white rounded-xl', panelBorder: isDark ? 'border-indigo-700' : 'border-indigo-200' },
    nutricionista: { label: 'Nutri', pill: 'px-2 py-0.5 rounded bg-emerald-600 text-white', btnClass: isDark ? 'bg-emerald-600 text-white rounded-xl' : 'bg-emerald-500 text-white  rounded-xl', panelBorder: isDark ? 'border-emerald-700' : 'border-emerald-200' },
    fisioterapeuta: { label: 'Fisio', pill: 'px-2 py-0.5 rounded bg-yellow-500 text-black', btnClass: isDark ? 'bg-yellow-400 text-black rounded-xl' : 'bg-yellow-500 text-black rounded-xl', panelBorder: isDark ? 'border-yellow-600' : 'border-yellow-200' }
  };
  return map[especialidade] || map['personal-trainner'];
};

const Coach = ({ user, tema = 'dark' }) => {
  const navigate = useNavigate();
  const isDark = tema === 'dark';

  const theme = {
    bg: isDark ? 'bg-gray-900 text-white' : 'bg-white text-black',
    muted: isDark ? 'text-gray-300' : 'text-gray-600',
    input: 'w-full p-2 rounded border',
    primaryBtn: isDark ? 'bg-indigo-600 text-white px-4 py-2 rounded' : 'bg-indigo-500 text-white px-4 py-2 rounded',
    ghostBtn: isDark ? 'bg-transparent border px-3 py-1 rounded text-white' : 'bg-transparent border px-3 py-1 rounded text-black'
  };

  const [sectionExpandedMap, setSectionExpandedMap] = useState({});
  const [expandedMap, setExpandedMap] = useState({});
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  const [profissional, setProfissional] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [createForm, setCreateForm] = useState({ profissionalName: '', biografia: '', especialidade: 'personal-trainner', country: '', state: '', city: '' });
  const [createImageFile, setCreateImageFile] = useState(null);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ profissionalName: '', biografia: '', especialidade: 'personal-trainner', country: '', state: '', city: '', lat: '', lng: '' });
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(null);
  const [removeImageFlag, setRemoveImageFlag] = useState(false);

  const [meusLocais, setMeusLocais] = useState([]);
  const [alunosData, setAlunosData] = useState([]);
  const [chatStates, setChatStates] = useState({});
  const [removingMap, setRemovingMap] = useState({});

  const mountedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const getUserIdFromUser = useCallback(() => {
    return user ? (user._id || user.userId || user.id || null) : null;
  }, [user]);

  function loadCountries() {
    try {
      const arr = Array.isArray(locationsData?.countries) ? locationsData.countries : [];
      const list = arr.map(c => ({ name: c.name || 'Unknown', code: c.code || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (mountedRef.current) setCountries(list.length ? list : [{ name: 'Brazil', code: 'BR' }, { name: 'Portugal', code: 'PT' }]);
    } catch (err) {
      if (mountedRef.current) setCountries([{ name: 'Brazil', code: 'BR' }, { name: 'Portugal', code: 'PT' }]);
    }
  }
  function loadStatesForCountry(countryName) {
    if (!countryName) { setStates([]); return; }
    try {
      const byCountry = locationsData?.byCountry || {};
      const countryObj = byCountry[countryName] || byCountry[String(countryName).trim()] || null;
      if (!countryObj) {
        if ((countryName || '').toLowerCase().includes('brazil')) {
          if (mountedRef.current) setStates(['Acre', 'São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Bahia']);
        } else { if (mountedRef.current) setStates([]); }
        return;
      }
      const arr = Array.isArray(countryObj.states) ? countryObj.states : [];
      if (mountedRef.current) setStates(arr.slice().sort((a, b) => String(a).localeCompare(String(b))));
    } catch (err) { if (mountedRef.current) setStates([]); }
  }
  function loadCitiesForState(countryName, stateName) {
    if (!countryName || !stateName) { setCities([]); return; }
    try {
      const byCountry = locationsData?.byCountry || {};
      const countryObj = byCountry[countryName] || byCountry[String(countryName).trim()] || null;
      if (!countryObj) { if (mountedRef.current) setCities([]); return; }
      const citiesByState = countryObj.citiesByState || {};
      const arr = Array.isArray(citiesByState[stateName]) ? citiesByState[stateName] : [];
      if (mountedRef.current) setCities(arr.slice().sort((a, b) => String(a).localeCompare(String(b))));
    } catch (err) { if (mountedRef.current) setCities([]); }
  }
  useEffect(() => { loadCountries(); }, []);

  const loadProfissional = useCallback(async (signal) => {
    const userId = getUserIdFromUser();
    if (!userId) {
      if (mountedRef.current) setProfissional(null);
      return;
    }
    setLoading(true); setError(null); setSuccessMsg(null);
    try {
      const res = await api.get('/profissionais', { params: { userId }, signal });
      if (!mountedRef.current) return;
      const payload = res?.data;
      if (payload?.profissional) return setProfissional(payload.profissional);
      if (payload && typeof payload === 'object' && (payload._id || payload.profissionalId || payload.userId) && !Array.isArray(payload)) {
        return setProfissional(payload);
      }
      const list = payload?.profissionais || payload?.data?.items || payload?.data || (Array.isArray(payload) ? payload : null);
      if (Array.isArray(list) && list.length) {
        const found = list.find(p => String(p.userId) === String(userId) || String(p.profissionalId) === String(userId));
        return setProfissional(found || null);
      }
      setProfissional(null);
    } catch (err) {
      if (err.name === 'CanceledError' || err.message === 'canceled') return;
      console.error('Erro ao carregar profissional:', err);
      setError(err?.response?.data?.msg || err.message || 'Erro desconhecido');
      setProfissional(null);
    } finally { if (mountedRef.current) setLoading(false); }
  }, [getUserIdFromUser]);

  useEffect(() => {
    if (!user) return;
    const ctrl = new AbortController();
    loadProfissional(ctrl.signal);
    return () => ctrl.abort();
  }, [user, loadProfissional]);

  const handleRefresh = () => {
    const ctrl = new AbortController();
    loadProfissional(ctrl.signal);
  };

  const handleCreateImageChange = (e) => setCreateImageFile(e.target.files?.[0] || null);

  const validateCreateForm = () => {
    const userId = getUserIdFromUser();
    if (!userId) return 'Usuário não autenticado.';
    if (!createForm.profissionalName) return 'Preencha o nome do profissional.';
    if (!createForm.biografia) return 'Preencha a biografia.';
    if (!createForm.especialidade) return 'Escolha uma especialidade.';
    if (!createForm.country) return 'Escolha o país.';
    if (!createForm.state) return 'Escolha o estado.';
    if (!createForm.city) return 'Escolha a cidade.';
    if (!createImageFile) return 'Envie uma imagem.';
    return null;
  };

  const handleCreateProfissional = async (e) => {
    e?.preventDefault?.();
    const validationError = validateCreateForm();
    if (validationError) { setError(validationError); return; }

    const userId = getUserIdFromUser();
    setCreating(true); setError(null); setSuccessMsg(null);
    try {
      const form = new FormData();
      form.append('profissionalName', createForm.profissionalName);
      form.append('biografia', createForm.biografia);
      form.append('userId', userId);
      form.append('especialidade', createForm.especialidade);
      form.append('country', createForm.country);
      form.append('state', createForm.state);
      form.append('city', createForm.city);
      if (createImageFile) form.append('image', createImageFile);

      const res = await api.post('/publicar-profissional', form);
      const data = res?.data;
      if (data && (data.profissional || data.success)) {
        const created = data.profissional || data;
        setProfissional(created);
        setSuccessMsg('Profissional criado com sucesso.');
        setEditMode(false);
        setCreateForm({ profissionalName: '', biografia: '', especialidade: 'personal-trainner', country: '', state: '', city: '' });
        setCreateImageFile(null);
      } else {
        setError(data?.msg || 'Erro ao criar profissional.');
      }
    } catch (err) {
      console.error('Erro ao criar profissional:', err);
      setError(err?.response?.data?.msg || err?.message || 'Erro desconhecido');
    } finally { if (mountedRef.current) setCreating(false); }
  };

  useEffect(() => {
    if (!profissional) {
      setEditForm({ profissionalName: '', biografia: '', especialidade: 'personal-trainner', country: '', state: '', city: '', lat: '', lng: '' });
      setEditImageFile(null); setEditImagePreview(null); setRemoveImageFlag(false);
      setStates([]); setCities([]);
      return;
    }
    setEditForm({
      profissionalName: profissional.profissionalName || '',
      biografia: profissional.biografia || '',
      especialidade: profissional.especialidade || 'personal-trainner',
      country: profissional.country || '',
      state: profissional.state || '',
      city: profissional.city || '',
      lat: profissional.location?.coordinates ? String(profissional.location.coordinates[1]) : '',
      lng: profissional.location?.coordinates ? String(profissional.location.coordinates[0]) : ''
    });
    setEditImageFile(null); setEditImagePreview(profissional.imageUrl || null); setRemoveImageFlag(false);
    if (profissional.country) {
      loadStatesForCountry(profissional.country);
      if (profissional.state) loadCitiesForState(profissional.country, profissional.state);
    }
  }, [profissional]);

  const handleEditImageChange = (e) => {
    const f = e.target.files?.[0] || null;
    if (editImagePreview && editImagePreview.startsWith('blob:')) {
      try { URL.revokeObjectURL(editImagePreview); } catch (err) { /* ignore */ }
    }
    if (f) {
      const preview = URL.createObjectURL(f);
      setEditImageFile(f); setEditImagePreview(preview); setRemoveImageFlag(false);
    } else { setEditImageFile(null); setEditImagePreview(profissional?.imageUrl || null); }
  };

  const handleToggleEditMode = () => { setEditMode(prev => !prev); setError(null); setSuccessMsg(null); };

  const handleEditSubmit = async (e) => {
    e?.preventDefault();
    if (!profissional) return;
    setSavingEdit(true); setError(null); setSuccessMsg(null);
    try {
      const form = new FormData();
      form.append('profissionalId', profissional.profissionalId || profissional._id || profissional.userId || '');
      form.append('profissionalName', editForm.profissionalName || '');
      form.append('biografia', editForm.biografia || '');
      form.append('especialidade', editForm.especialidade || '');
      form.append('country', editForm.country || '');
      form.append('state', editForm.state || '');
      form.append('city', editForm.city || '');
      if (editForm.lat !== '') form.append('lat', String(editForm.lat));
      if (editForm.lng !== '') form.append('lng', String(editForm.lng));
      if (editImageFile) form.append('image', editImageFile);
      if (removeImageFlag) form.append('removeImage', '1');
      const res = await api.post('/editar-profissional', form);
      const data = res?.data;
      if (data && data.success) {
        const updated = data.profissional || data;
        if (updated && (updated._id || updated.profissionalId)) setProfissional(updated);
        else await loadProfissional(new AbortController().signal);
        setSuccessMsg(data.msg || 'Atualizado com sucesso.');
        setEditMode(false);
      } else {
        throw new Error(data?.msg || 'Falha ao atualizar.');
      }
    } catch (err) {
      console.error('Erro editar profissional:', err);
      setError(err?.response?.data?.msg || err?.message || 'Erro desconhecido');
    } finally {
      setSavingEdit(false);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const pegarLocais = useCallback(async (signal) => {
    if (!profissional) { setMeusLocais([]); return; }
    try {
      const payload = { profissionalId: profissional.profissionalId || profissional._id || profissional.userId };
      const res = await api.get('/locais', { params: payload, signal });
      if (!mountedRef.current) return;
      const items = res?.data?.data?.items || res?.data?.items || [];
      setMeusLocais(Array.isArray(items) ? items : []);
    } catch (err) {
      if (err.name === 'CanceledError' || err.message === 'canceled') return;
      console.error('Erro pegar locais:', err);
      setMeusLocais([]);
    }
  }, [profissional]);

  useEffect(() => {
    const ctrl = new AbortController();
    pegarLocais(ctrl.signal);
    return () => ctrl.abort();
  }, [profissional, pegarLocais]);

  const fetchAlunosDetails = useCallback(async (signal) => {
    if (!profissional || !Array.isArray(profissional.alunos)) { setAlunosData([]); return; }
    const alunos = profissional.alunos || [];
    const initial = alunos.map(a => ({ userId: a.userId, ultimoUpdate: a.ultimoUpdate || a.updatedAt || a.criadoEm || null, mensagem: a.mensagem || null, loading: true, user: null, error: null, aceito: !!a.aceito, aceitoEm: a.aceitoEm || null }));
    setAlunosData(initial);
    const profissionalIdForQuery = profissional.profissionalId || profissional._id || profissional.userId;
    const promises = alunos.map(a => api.get('/pegar-user', { params: { userId: a.userId, profissionalId: profissionalIdForQuery }, signal }).then(r => ({ ok: true, res: r })).catch(err => ({ ok: false, err })));
    const results = await Promise.all(promises);
    if (!mountedRef.current) return;
    const updated = results.map((r, idx) => {
      const a = alunos[idx];
      if (r.ok) {
        const payload = r.res?.data || {};
        const foundUser = payload.user || payload;
        return { userId: a.userId, ultimoUpdate: a.ultimoUpdate || null, mensagem: a.mensagem || null, loading: false, user: foundUser, error: null, aceito: !!a.aceito, aceitoEm: a.aceitoEm || null };
      } else {
        return { userId: a.userId, ultimoUpdate: a.ultimoUpdate || null, mensagem: a.mensagem || null, loading: false, user: null, error: r.err?.response?.data?.msg || r.err?.message || 'Erro ao carregar usuário', aceito: !!a.aceito, aceitoEm: a.aceitoEm || null };
      }
    });
    setAlunosData(updated);
  }, [profissional]);

  useEffect(() => {
    if (!profissional) { setAlunosData([]); return; }
    const controller = new AbortController();
    fetchAlunosDetails(controller.signal).catch(err => { if (!(err.name === 'CanceledError' || err.message === 'canceled')) console.warn(err); });
    return () => controller.abort();
  }, [profissional, fetchAlunosDetails]);

  // helper: load chat for a user
  const loadChatForUser = async (alunoUserId) => {
    if (!profissional) return;
    setChatStates(prev => ({ ...prev, [alunoUserId]: { ...(prev[alunoUserId] || {}), loading: true, error: null } }));
    try {
      const coachId = profissional.userId || profissional._id || profissional.profissionalId;
      const body = { userId: String(coachId), otherUserId: String(alunoUserId), creatorUsername: profissional.profissionalName || '' };
      const res = await api.post('/pegarChat', body);
      const chat = res?.data?.chat || res?.data || {};
      const messages = chat.mensagens || chat.messages || [];
      const normalized = Array.isArray(messages) ? messages.map(m => ({ mensagemId: m.mensagemId || m._id || String(Math.random()).slice(2), userId: String(m.userId || m.from || ''), conteudo: m.conteudo || m.text || m.mensagem || '', publicadoEm: m.publicadoEm || m.createdAt || null })) : [];
      setChatStates(prev => ({ ...prev, [alunoUserId]: { ...(prev[alunoUserId] || {}), chatId: chat.ChatId || chat._id || null, messages: normalized, loading: false, error: null, newMessage: '', sending: false } }));
    } catch (err) {
      console.error('loadChatForUser error', err);
      setChatStates(prev => ({ ...prev, [alunoUserId]: { ...(prev[alunoUserId] || {}), loading: false, error: err?.response?.data?.error || err?.message || 'Erro carregar chat' } }));
    }
  };

  const sendMessageToUser = async (alunoUserId) => {
    const state = chatStates[alunoUserId] || {};
    if (!state || !state.chatId) return;
    const texto = (state.newMessage || '').trim();
    if (!texto) return;
    const optimisticMsg = { mensagemId: `local-${Date.now()}`, userId: String(getUserIdFromUser()), conteudo: texto, publicadoEm: new Date() };
    setChatStates(prev => {
      const curr = prev[alunoUserId] || {};
      const msgs = Array.isArray(curr.messages) ? [...curr.messages, optimisticMsg] : [optimisticMsg];
      return { ...prev, [alunoUserId]: { ...curr, messages: msgs, newMessage: '', sending: true } };
    });

    try {
      const res = await api.post('/enviar-mensagem', { ChatId: state.chatId, userId: String(getUserIdFromUser()), conteudo: texto });
      const returnedMessages = res?.data?.mensagens || [];
      const last = res?.data?.mensagem || (Array.isArray(returnedMessages) ? returnedMessages[returnedMessages.length - 1] : null);
      const normalized = Array.isArray(returnedMessages) ? returnedMessages.map(m => ({ mensagemId: m.mensagemId || m._id || String(Math.random()).slice(2), userId: String(m.userId || ''), conteudo: m.conteudo || m.text || m.mensagem || '', publicadoEm: m.publicadoEm || m.createdAt || null })) : (last ? [{ mensagemId: last.mensagemId || last._id || String(Math.random()).slice(2), userId: String(last.userId || ''), conteudo: last.conteudo || last.text || last.mensagem || '', publicadoEm: last.publicadoEm || last.createdAt || new Date() }] : []);

      setChatStates(prev => {
        const curr = prev[alunoUserId] || {};
        let newMsgs = curr.messages || [];
        if (normalized.length > 0) newMsgs = normalized;
        else if (last) {
          const exists = (newMsgs || []).some(m => String(m.mensagemId) === String(last.mensagemId));
          if (!exists) newMsgs = [...newMsgs, { mensagemId: last.mensagemId || last._id || String(Math.random()).slice(2), userId: String(last.userId || ''), conteudo: last.conteudo || last.text || last.mensagem || '', publicadoEm: last.publicadoEm || last.createdAt || new Date() }];
        }
        return { ...prev, [alunoUserId]: { ...curr, messages: newMsgs, sending: false, newMessage: '' } };
      });
    } catch (err) {
      console.error('sendMessageToUser error', err);
      setChatStates(prev => {
        const curr = prev[alunoUserId] || {};
        const msgs = (curr.messages || []).filter(m => !(m.mensagemId && String(m.mensagemId).startsWith('local-')));
        return { ...prev, [alunoUserId]: { ...curr, messages: msgs, sending: false, error: err?.response?.data?.error || err?.message || 'Falha ao enviar' } };
      });
      setError('Falha ao enviar mensagem.');
    }
  };

  const handleChatInputChange = (alunoUserId, text) => {
    setChatStates(prev => ({ ...prev, [alunoUserId]: { ...(prev[alunoUserId] || {}), newMessage: text } }));
  };
  const refreshChat = (alunoUserId) => loadChatForUser(alunoUserId);

  const pending = alunosData.filter(a => !a.aceito);
  const accepted = alunosData.filter(a => a.aceito);

  const getSectionState = (userId, section) => {
    return !!(sectionExpandedMap[String(userId)] && sectionExpandedMap[String(userId)][section]);
  };

  const toggleSection = (userId, section) => {
    setSectionExpandedMap(prev => {
      const key = String(userId);
      const prevForUser = prev[key] || {};
      return {
        ...prev,
        [key]: {
          ...prevForUser,
          [section]: !prevForUser[section]
        }
      };
    });
  };

  const toggleExpanded = (userId) => {
    setExpandedMap(prev => {
      const next = { ...prev, [userId]: !prev[userId] };
      if (!prev[userId]) loadChatForUser(userId);
      return next;
    });
  };

  const handleAceitarAluno = async (alunoUserId) => {
    if (!profissional || !alunoUserId) return;
    const prevProf = JSON.parse(JSON.stringify(profissional));
    const newProf = { ...profissional };
    newProf.alunos = (newProf.alunos || []).map(a => String(a.userId) === String(alunoUserId) ? { ...a, aceito: true, aceitoEm: new Date() } : a);
    setProfissional(newProf);
    setAlunosData(prev => prev.map(a => String(a.userId) === String(alunoUserId) ? { ...a, aceito: true, aceitoEm: new Date() } : a));
    try {
      const payload = { profissionalId: profissional.profissionalId || profissional._id || profissional.userId, alunoUserId };
      const res = await api.post('/aceitar-aluno', payload);
      if (!res?.data?.success) throw new Error(res?.data?.msg || 'Falha ao aceitar aluno');
      const returnedAluno = res.data.aluno;
      if (returnedAluno) {
        setProfissional(prev => ({ ...prev, alunos: (prev.alunos || []).map(a => String(a.userId) === String(returnedAluno.userId) ? { ...a, ...returnedAluno } : a) }));
        setAlunosData(prev => prev.map(a => String(a.userId) === String(returnedAluno.userId) ? { ...a, aceito: !!returnedAluno.aceito, aceitoEm: returnedAluno.aceitoEm || a.aceitoEm } : a));
      }
      setSuccessMsg('Aluno aceito com sucesso.'); setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err) {
      console.error('Erro aceitarAluno:', err);
      setProfissional(prevProf);
      await fetchAlunosDetails(new AbortController().signal);
      setError(err?.response?.data?.msg || err?.message || 'Erro ao aceitar aluno.');
    }
  };

  const handleRemoverAlunoClick = async (alunoUserId) => {
    if (!profissional || !alunoUserId) return;
    const ok = window.confirm('Remover este aluno da sua lista?');
    if (!ok) return;
    setRemovingMap(prev => ({ ...prev, [alunoUserId]: true }));
    const prevProf = profissional;
    const prevAlunos = alunosData;
    try {
      const newProf = { ...profissional, alunos: (profissional.alunos || []).filter(a => String(a.userId) !== String(alunoUserId)) };
      setProfissional(newProf);
      setAlunosData(prev => prev.filter(a => String(a.userId) !== String(alunoUserId)));
      const payload = { profissionalId: profissional.profissionalId || profissional._id || profissional.userId, alunoUserId };
      const res = await api.post('/remover-aluno', payload);
      if (!res?.data?.success) throw new Error(res?.data?.msg || 'Falha ao remover');
      if (Array.isArray(res.data.alunos)) {
        setProfissional(prev => ({ ...prev, alunos: res.data.alunos }));
        setAlunosData(prev => prev.filter(a => res.data.alunos.some(x => String(x.userId) === String(a.userId))));
      }
      setSuccessMsg(res.data.msg || 'Aluno removido.');
    } catch (err) {
      console.error('Erro remover aluno:', err);
      setProfissional(prevProf);
      setAlunosData(prevAlunos);
      setError(err?.response?.data?.msg || err?.message || 'Erro ao remover aluno.');
      alert(`Falha ao remover aluno: ${err?.message || 'erro'}`);
    } finally {
      setRemovingMap(prev => { const c = { ...prev }; delete c[alunoUserId]; return c; });
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const currentEspecialidade = (profissional?.especialidade || editForm.especialidade || createForm.especialidade || 'personal-trainner');
  const specialty = getSpecialtyTheme(currentEspecialidade, isDark);
  const themeWithSpec = {
    ...theme,
    primaryBtn: specialty.btnClass || theme.primaryBtn,
    panel: `${isDark ? 'bg-gray-800' : 'bg-gray-50'} ${specialty.panelBorder ? specialty.panelBorder : (isDark ? 'border-gray-700' : 'border-gray-200')}`,
    card: `${base.card} ${specialty.cardGradient || (isDark ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-white to-gray-50')}`,
    subtlePanel: `${base.panel} ${isDark ? `bg-gray-800 ${specialty.panelBorder}` : `bg-white ${specialty.panelBorder}`}`
  };

  return (
    <section className={`${themeWithSpec.card} ${theme.bg}`}>
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Painel Coach</h1>
          <p className={`text-sm mt-1 ${theme.muted}`}>Gerencie seus clientes, convites e perfil profissional.</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={handleRefresh} disabled={loading} className={`${themeWithSpec.primaryBtn} ${base.smallBtn}`}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button onClick={() => fetchAlunosDetails(new AbortController().signal)} className={`${theme.ghostBtn} ${base.smallBtn}`}>
            Atualizar alunos
          </button>
        </div>
      </header>

      {error && <div className="mb-4 text-sm text-red-500">{error}</div>}
      {successMsg && <div className="mb-4 text-sm text-green-400">{successMsg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className={`${themeWithSpec.panel} p-3 rounded-2xl top-6`}>
            <div className="flex gap-4 items-start">
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-xl overflow-hidden border flex-shrink-0 bg-gray-200">
                {profissional?.imageUrl ? (
                  <img src={profissional.imageUrl} alt={profissional.profissionalName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-700">Sem imagem</div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-semibold truncate">{profissional?.profissionalName || '—'}</div>
                  <div className={specialty.pill}>{specialty.label}</div>
                </div>
                <div className={`text-sm ${theme.muted} truncate`}>{profissional?.especialidade ? especialidadeLabels[profissional.especialidade] || profissional.especialidade : ''}</div>
                <div className={`text-xs mt-2 ${theme.muted} line-clamp-3`}>{profissional?.biografia || ''}</div>
                <div className="text-xs mt-3">
                  <div className={`${theme.muted}`}>Criado em: {profissional?.criadoEm ? new Date(profissional.criadoEm).toLocaleString() : '—'}</div>
                  <div className={`${theme.muted}`}>Local: {profissional?.city ? `${profissional.city} — ${profissional.state || ''}` : (profissional?.country || '—')}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={handleRefresh} className={`${theme.ghostBtn} w-full md:w-auto`}>Recarregar</button>
              {user && (String(user._id) === String(profissional?.userId) || String(user.userId) === String(profissional?.userId)) && (
                <button onClick={() => setEditMode(prev => !prev)} className={`${isDark ? 'bg-yellow-400 text-black' : 'bg-yellow-500 text-black'} ${base.smallBtn} w-full md:w-auto`}>
                  {editMode ? 'Cancelar' : profissional ? 'Editar' : 'Criar'}
                </button>
              )}
            </div>

            {/* Edit / Create form area */}
            {editMode && (
              <form onSubmit={profissional ? handleEditSubmit : handleCreateProfissional} className={`mt-4 p-3 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs font-medium">Nome</label>
                    <input className={theme.input} value={profissional ? editForm.profissionalName : createForm.profissionalName} onChange={e => {
                      if (profissional) setEditForm(f => ({ ...f, profissionalName: e.target.value }));
                      else setCreateForm(f => ({ ...f, profissionalName: e.target.value }));
                    }} />
                  </div>

                  <div>
                    <label className="text-xs font-medium">Especialidade</label>
                    <select
                      className={theme.input}
                      value={profissional ? editForm.especialidade : createForm.especialidade}
                      onChange={e => { if (profissional) setEditForm(f => ({ ...f, especialidade: e.target.value })); else setCreateForm(f => ({ ...f, especialidade: e.target.value })); }}
                      disabled={Array.isArray(profissional?.alunos) && profissional.alunos.length > 0}
                    >
                      <option className={` text-black `} value="personal-trainner">Personal Trainer</option>
                      <option className={` text-black `} value="nutricionista">Nutricionista</option>
                      <option className={` text-black `} value="fisioterapeuta">Fisioterapeuta</option>
                    </select>

                    {(Array.isArray(profissional?.alunos) && profissional.alunos.length > 0) ? (
                      <p className="text-xs mt-2 text-yellow-300">Você não pode alterar a especialidade enquanto possuir alunos ({profissional.alunos.length}).</p>
                    ) : (
                      <p className="text-xs mt-2 text-gray-400">Escolha a especialidade do profissional.</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium">Biografia</label>
                    <textarea rows={3} className={theme.input} value={profissional ? editForm.biografia : createForm.biografia} onChange={e => { if (profissional) setEditForm(f => ({ ...f, biografia: e.target.value })); else setCreateForm(f => ({ ...f, biografia: e.target.value })); }} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">País</label>
                      <select className={theme.input} value={profissional ? editForm.country : createForm.country} onChange={e => { if (profissional) { setEditForm(f => ({ ...f, country: e.target.value })); loadStatesForCountry(e.target.value); } else { setCreateForm(f => ({ ...f, country: e.target.value })); loadStatesForCountry(e.target.value); } }}>
                        <option className={` text-black `} value="">— selecione —</option>
                        {countries.map(c => <option className={` text-black `} key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium">Estado</label>
                      <select className={theme.input} value={profissional ? editForm.state : createForm.state} onChange={e => { if (profissional) { setEditForm(f => ({ ...f, state: e.target.value })); loadCitiesForState(editForm.country || profissional?.country, e.target.value); } else { setCreateForm(f => ({ ...f, state: e.target.value })); loadCitiesForState(createForm.country, e.target.value); } }}>
                        <option className={` text-black `} value="">— selecione —</option>
                        {states.map(s => <option className={` text-black `} key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium">Cidade</label>
                      <select className={theme.input} value={profissional ? editForm.city : createForm.city} onChange={e => { if (profissional) setEditForm(f => ({ ...f, city: e.target.value })); else setCreateForm(f => ({ ...f, city: e.target.value })); }}>
                        <option className={` text-black `} value="">— selecione —</option>
                        {cities.map(c => <option className={` text-black `} key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Lat" className={theme.input} value={profissional ? editForm.lat : ''} onChange={e => setEditForm(f => ({ ...f, lat: e.target.value }))} />
                      <input placeholder="Lng" className={theme.input} value={profissional ? editForm.lng : ''} onChange={e => setEditForm(f => ({ ...f, lng: e.target.value }))} />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium">Imagem (novo upload)</label>
                    <input type="file" accept="image/*" onChange={profissional ? handleEditImageChange : handleCreateImageChange} className="p-2 rounded border w-full bg-white" />
                    <div className="flex items-center gap-3 mt-2">
                      {profissional ? (
                        editImagePreview ? (
                          <div className="w-20 h-20 rounded overflow-hidden border"><img src={editImagePreview} alt="preview" className="w-full h-full object-cover" /></div>
                        ) : (
                          <div className="w-20 h-20 rounded bg-gray-100 flex items-center justify-center text-xs">Sem imagem</div>
                        )
                      ) : (
                        createImageFile ? (
                          <div className="w-20 h-20 rounded overflow-hidden border"><img src={URL.createObjectURL(createImageFile)} alt="preview" className="w-full h-full object-cover" /></div>
                        ) : (
                          <div className="w-20 h-20 rounded bg-gray-100 flex items-center justify-center text-xs">Sem imagem</div>
                        )
                      )}
                      {profissional && (
                        <label className="text-xs inline-flex items-center gap-2"><input type="checkbox" checked={removeImageFlag} onChange={e => setRemoveImageFlag(e.target.checked)} /> Remover imagem atual</label>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button type="submit" disabled={savingEdit || creating} className={`${themeWithSpec.primaryBtn}`}>{savingEdit || creating ? (profissional ? 'Salvando...' : 'Criando...') : (profissional ? 'Salvar alterações' : 'Criar profissional')}</button>
                    <button type="button" onClick={() => setEditMode(false)} className={`${theme.ghostBtn}`}>Cancelar</button>
                  </div>
                </div>
              </form>
            )}

          </div>

          {/* Invite and locais UI (kept) */}
          {user && profissional && (String(user._id) === String(profissional?.userId) || String(user.userId) === String(profissional?.userId)) && (
            <div className={`mt-4 ${themeWithSpec.subtlePanel}`}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Link de convite</div>
                    <div className={`text-xs ${theme.muted}`}>Compartilhe com seus clientes.</div>
                  </div>
                  <div className="text-xs text-gray-400">ID: <span className="font-mono ml-1">{profissional?.profissionalId || profissional?.userId}</span></div>
                </div>

                <div className="flex flex-wrap gap-2 items-stretch">
                  <input readOnly value={`${(typeof window !== 'undefined' && window.location ? window.location.origin : '')}/dashboard/coach/u?q=${encodeURIComponent(profissional?.userId || profissional?.profissionalId || profissional?._id || '')}`} className={`${theme.input} text-xs flex-1`} onFocus={e => e.target.select()} />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { navigator.clipboard?.writeText && navigator.clipboard.writeText(window.location.origin + '/dashboard/coach/u?q=' + encodeURIComponent(profissional?.userId || profissional?.profissionalId || profissional?._id || '')); setSuccessMsg('Link copiado.'); setTimeout(() => setSuccessMsg(null), 1500); }} className={`${theme.ghostBtn}`}>Copiar</button>
                    <button onClick={() => navigator.share ? navigator.share({ title: `Convite - ${profissional?.profissionalName}`, url: window.location.origin + '/dashboard/coach/u?q=' + encodeURIComponent(profissional?.userId || profissional?.profissionalId || profissional?._id || '') }) : null} className={`${themeWithSpec.primaryBtn}`}>Compartilhar</button>
                    <button onClick={() => navigate('/dashboard/coach/u?q=' + encodeURIComponent(profissional?.userId || profissional?.profissionalId || profissional?._id || ''), '_blank')} className={`${theme.ghostBtn}`}>Abrir</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* COL 2+3: LISTA DE ALUNOS */}
        {
          profissional && (
            <div className="lg:col-span-2 space-y-6">

              {/* PENDENTES */}
              <div className={`${themeWithSpec.panel} rounded-2xl p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">Solicitações <span className="text-sm text-gray-400">({pending.length})</span></h2>
                  <div className={`${theme.muted} text-sm`}>Gerencie convites</div>
                </div>
                {pending.length === 0 ? <div className="text-sm text-gray-500">Nenhuma solicitação pendente.</div> : (
                  <div className="grid gap-3">
                    {pending.map(item => (
                      <div key={String(item.userId)} className="p-3 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">userId: <span className="font-mono text-xs">{item.userId}</span></div>
                          <div className="text-sm mt-1">Mensagem: <span className="font-medium">{item.mensagem || '—'}</span></div>
                          <div className={`text-xs mt-1 ${theme.muted}`}>Último update: {item.ultimoUpdate ? new Date(item.ultimoUpdate).toLocaleString() : '—'}</div>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => navigate(`/dashboard/usuario/${item.userId}`)} className={`${themeWithSpec.primaryBtn} ${base.smallBtn}`}>Ver cliente</button>
                          <button onClick={() => handleAceitarAluno(item.userId)} className={`${theme.ghostBtn} ${base.smallBtn}`}>Aceitar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ACEITOS */}
              <div className={`${themeWithSpec.panel} rounded-2xl p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">Meus Alunos <span className="text-sm text-gray-400">({accepted.length})</span></h2>
                  <div className={`${theme.muted} text-sm`}>Gerencie seus alunos.</div>
                </div>

                {accepted.length === 0 ? (
                  <div className="text-sm text-gray-500">Nenhum aluno aceito ainda.</div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {accepted.map(item => {
                      const chState = chatStates[item.userId] || {};
                      const expanded = !!expandedMap[item.userId];
                      const uid = String(item.userId);
                      const specialtyName = (profissional?.especialidade || 'personal-trainner').toLowerCase();

                      return (
                        <div key={uid} className="p-3 rounded-lg border">
                          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`font-medium truncate text-md`}>{item.user?.name || item.user?.username || 'Aluno'}</div>
                              <div className={`text-md mt-1 ${theme.muted}`}>Objetivo: {item.user?.perfil?.objetivo && item.user?.perfil?.objetivo}</div>
                              <div className={`text-xs mt-1 ${theme.muted}`}>userId: <span className="font-mono text-xs">{uid}</span></div>
                              <div className="text-sm mt-1">Última atualização: {item.ultimoUpdate ? new Date(item.ultimoUpdate).toLocaleString() : '—'}</div>
                            </div>

                            <div className="flex gap-2 items-center">
                              <button onClick={() => navigate(`/dashboard/usuario/${item.userId}`)} className={`${themeWithSpec.primaryBtn} ${base.smallBtn}`}>Ver cliente</button>

                              <button
                                onClick={() => handleRemoverAlunoClick(item.userId)}
                                disabled={!!removingMap[item.userId]}
                                className={`${base.smallBtn} ${isDark ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}
                              >
                                {removingMap[item.userId] ? 'Removendo...' : 'Remover'}
                              </button>

                              {/* Toggle global da caixa do aluno */}
                              <button
                                onClick={() => toggleExpanded(item.userId)}
                                aria-expanded={expanded}
                                className={`${theme.ghostBtn} ${base.smallBtn} flex items-center gap-2`}
                              >
                                {expanded ? (
                                  <>
                                    <FiChevronUp /> Mostrar menos
                                  </>
                                ) : (
                                  <>
                                    <FiChevronDown /> Mostrar mais
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Conteúdo expansível global - varia por especialidade do profissional */}
                          <AnimatePresence>
                            {expanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25 }}
                                className="mt-4 space-y-4"
                              >
                                {/* Painel interno com botões de seção — todos os tipos terão controles de expand/collapse por seção */}
                                <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} p-3 rounded-md border`}>
                                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-3">
                                      <div className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{`Detalhes — ${item.user?.username || item.user?.email || 'Usuário'}`}</div>
                                      <div className="text-xs text-gray-400">Opções rápidas</div>
                                    </div>

                                    <div className="flex gap-2 flex-wrap">
                                      {/* Treinos: relevante apenas para personal trainer */}
                                      {
                                        profissional && profissional.especialidade === 'personal-trainner' && (
                                          <button
                                            onClick={() => toggleSection(item.userId, 'treinos')}
                                            className={`${base.smallBtn} ${theme.ghostBtn} flex items-center gap-2`}
                                            aria-expanded={getSectionState(item.userId, 'treinos')}
                                          >
                                            {getSectionState(item.userId, 'treinos') ? <FiChevronUp /> : <FiChevronDown />} Treinos
                                          </button>
                                        )
                                      }
                                      {/* Histórico: relevante para todos (personal, nutri, fisioterapeuta) */}
                                      {
                                        profissional && (
                                          <button
                                            onClick={() => toggleSection(item.userId, 'historico')}
                                            className={`${base.smallBtn} ${theme.ghostBtn} flex items-center gap-2`}
                                            aria-expanded={getSectionState(item.userId, 'historico')}
                                          >
                                            {getSectionState(item.userId, 'historico') ? <FiChevronUp /> : <FiChevronDown />} Histórico
                                          </button>

                                        )
                                      }
                                      {/* NutriAI: relevante apenas para nutricionista */}
                                      {
                                        profissional && profissional.especialidade === 'nutricionista' && (
                                          <button
                                            onClick={() => toggleSection(item.userId, 'nutriAi')}
                                            className={`${base.smallBtn} ${theme.ghostBtn} flex items-center gap-2`}
                                            aria-expanded={getSectionState(item.userId, 'nutriAi')}
                                          >
                                            {getSectionState(item.userId, 'nutriAi') ? <FiChevronUp /> : <FiChevronDown />} NutriAI
                                          </button>

                                        )
                                      }
                                      {/* Chat (1:1) */}
                                      {
                                        profissional && (
                                          <button
                                            onClick={() => toggleSection(item.userId, 'chat')}
                                            className={`${base.smallBtn} ${theme.ghostBtn} flex items-center gap-2`}
                                            aria-expanded={getSectionState(item.userId, 'chat')}
                                          >
                                            {getSectionState(item.userId, 'chat') ? <FiChevronUp /> : <FiChevronDown />} Chat
                                          </button>
                                        )
                                      }
                                    </div>
                                  </div>

                                  {/* Conteúdo por especialidade */}
                                  {(() => {
                                    switch (specialtyName) {
                                      case 'nutricionista':
                                        return (
                                          <div className="space-y-4">
                                            {/* Histórico */}
                                            {getSectionState(item.userId, 'historico') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="text-sm font-semibold mb-2">Histórico de nutrição</div>
                                                {item.user?.historico ? <HistoricoChart historico={item.user?.historico} tema={tema} /> : <div className="text-sm text-gray-500">Sem histórico</div>}
                                              </div>
                                            )}

                                            {/* NutriAI Chat */}
                                            {getSectionState(item.userId, 'nutriAi') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="text-sm font-semibold mb-2">Chat NutriAI</div>
                                                <ChatNutriAI user={item.user} tema={tema} profissionalId={profissional?.profissionalId || profissional?.userId} />
                                              </div>
                                            )}

                                            {/* Chat 1:1 */}
                                            {getSectionState(item.userId, 'chat') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="flex items-center justify-between mb-2">
                                                  <div className="font-medium">Chat com {item.user?.name || item.user?.username || 'Aluno'}</div>
                                                  <div className="flex items-center gap-2">
                                                    <button onClick={() => refreshChat(item.userId)} className={`${base.smallBtn} ${theme.ghostBtn}`}>Atualizar</button>
                                                    <div className={`text-xs text-gray-400`}>{chState.loading ? 'Carregando...' : (chState.error ? 'Erro no chat' : `${(chState.messages || []).length} mensagens`)}</div>
                                                  </div>
                                                </div>

                                                <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} h-48 sm:h-56 overflow-auto border rounded p-2`}>
                                                  {(chState.messages || []).length === 0 ? (
                                                    <div className="text-xs text-gray-500">Nenhuma mensagem ainda. Envie a primeira!</div>
                                                  ) : (
                                                    (chState.messages || []).map(msg => {
                                                      const mine = String(msg.userId) === String(getUserIdFromUser());
                                                      return (
                                                        <div key={String(msg.mensagemId) + String(msg.publicadoEm)} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                                          <div className={`${mine ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-black'} p-2 rounded-md max-w-[80%] text-sm`}>
                                                            <div className="whitespace-pre-wrap">{msg.conteudo}</div>
                                                            <div className="text-[10px] mt-1 text-gray-500">{msg.publicadoEm ? new Date(msg.publicadoEm).toLocaleString() : ''}</div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })
                                                  )}
                                                </div>

                                                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                                  <input value={chState.newMessage || ''} onChange={e => handleChatInputChange(item.userId, e.target.value)} placeholder="Escreva uma mensagem..." className={theme.input} />
                                                  <button onClick={() => sendMessageToUser(item.userId)} disabled={chState.sending} className={`${themeWithSpec.primaryBtn} w-full sm:w-auto`}>{chState.sending ? 'Enviando...' : 'Enviar'}</button>
                                                </div>
                                                {chState.error && <div className="text-xs text-red-500 mt-2">{chState.error}</div>}
                                              </div>
                                            )}
                                          </div>
                                        );

                                      case 'fisioterapeuta':
                                        return (
                                          <div className="space-y-4">
                                            {/* Histórico */}
                                            {getSectionState(item.userId, 'historico') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="text-sm font-semibold mb-2">Histórico de fisioterapia</div>
                                                {item.user?.historico ? <HistoricoChart historico={item.user?.historico} tema={tema} /> : <div className="text-sm text-gray-500">Sem histórico</div>}
                                              </div>
                                            )}

                                            {/* Chat 1:1 */}
                                            {getSectionState(item.userId, 'chat') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="mb-2 font-semibold">Chat</div>
                                                <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} h-48 sm:h-56 overflow-auto border rounded p-2`}>
                                                  {(chState.messages || []).length === 0 ? (
                                                    <div className="text-xs text-gray-500">Nenhuma mensagem ainda. Envie a primeira!</div>
                                                  ) : (
                                                    (chState.messages || []).map(msg => {
                                                      const mine = String(msg.userId) === String(getUserIdFromUser());
                                                      return (
                                                        <div key={String(msg.mensagemId) + String(msg.publicadoEm)} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                                          <div className={`${mine ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-black'} p-2 rounded-md max-w-[80%] text-sm`}>
                                                            <div className="whitespace-pre-wrap">{msg.conteudo}</div>
                                                            <div className="text-[10px] mt-1 text-gray-500">{msg.publicadoEm ? new Date(msg.publicadoEm).toLocaleString() : ''}</div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })
                                                  )}
                                                </div>

                                                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                                  <input value={chState.newMessage || ''} onChange={e => handleChatInputChange(item.userId, e.target.value)} placeholder="Escreva uma mensagem..." className={theme.input} />
                                                  <button onClick={() => sendMessageToUser(item.userId)} disabled={chState.sending} className={`${themeWithSpec.primaryBtn} w-full sm:w-auto`}>{chState.sending ? 'Enviando...' : 'Enviar'}</button>
                                                </div>
                                                {chState.error && <div className="text-xs text-red-500 mt-2">{chState.error}</div>}
                                              </div>
                                            )}
                                          </div>
                                        );

                                      case 'personal-trainner':
                                      default:
                                        return (
                                          <div className="space-y-4">
                                            {/* Treinos */}
                                            {getSectionState(item.userId, 'treinos') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="text-sm font-semibold mb-2">{`Meus Treinos — ${item.user?.username || item.user?.email || 'Usuário'}`}</div>
                                                <MeusTreinos tema={tema} user={item.user} setUser={() => { }} profissionalId={profissional?.profissionalId} />
                                              </div>
                                            )}

                                            {/* Histórico */}
                                            {getSectionState(item.userId, 'historico') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="text-sm font-semibold mb-2">Histórico de treinos</div>
                                                {item.user?.historico ? <HistoricoChart historico={item.user?.historico} tema={tema} /> : <div className="text-sm text-gray-500">Sem histórico</div>}
                                              </div>
                                            )}

                                            {/* Chat */}
                                            {getSectionState(item.userId, 'chat') && (
                                              <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} p-3 rounded-md border`}>
                                                <div className="flex items-center justify-between mb-2">
                                                  <div className="font-medium">Chat com {item.user?.name || item.user?.username || 'Aluno'}</div>
                                                  <div className="flex items-center gap-2">
                                                    <button onClick={() => refreshChat(item.userId)} className={`${base.smallBtn} ${theme.ghostBtn}`}>Atualizar</button>
                                                    <div className={`text-xs text-gray-400`}>{chState.loading ? 'Carregando...' : (chState.error ? 'Erro no chat' : `${(chState.messages || []).length} mensagens`)}</div>
                                                  </div>
                                                </div>

                                                <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} h-48 sm:h-56 overflow-auto border rounded p-2`}>
                                                  {(chState.messages || []).length === 0 ? (
                                                    <div className="text-xs text-gray-500">Nenhuma mensagem ainda. Envie a primeira!</div>
                                                  ) : (
                                                    (chState.messages || []).map(msg => {
                                                      const mine = String(msg.userId) === String(getUserIdFromUser());
                                                      return (
                                                        <div key={String(msg.mensagemId) + String(msg.publicadoEm)} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                                          <div className={`${mine ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-black'} p-2 rounded-md max-w-[80%] text-sm`}>
                                                            <div className="whitespace-pre-wrap">{msg.conteudo}</div>
                                                            <div className="text-[10px] mt-1 text-gray-500">{msg.publicadoEm ? new Date(msg.publicadoEm).toLocaleString() : ''}</div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })
                                                  )}
                                                </div>

                                                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                                  <input value={chState.newMessage || ''} onChange={e => handleChatInputChange(item.userId, e.target.value)} placeholder="Escreva uma mensagem..." className={theme.input} />
                                                  <button onClick={() => sendMessageToUser(item.userId)} disabled={chState.sending} className={`${themeWithSpec.primaryBtn} w-full sm:w-auto`}>{chState.sending ? 'Enviando...' : 'Enviar'}</button>
                                                </div>
                                                {chState.error && <div className="text-xs text-red-500 mt-2">{chState.error}</div>}
                                              </div>
                                            )}
                                          </div>
                                        );
                                    }
                                  })()}
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
          )
        }

      </div>

      <footer className={`mt-6 text-sm ${theme.muted} text-center`}>Dados carregados do servidor quando aplicável.</footer>
    </section>
  );
};

export default Coach;
