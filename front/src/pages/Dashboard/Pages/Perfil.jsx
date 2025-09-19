import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../../Api';
import BuscarImagem from '../../../components/BuscarImagens';
import locationsRaw from '../../../data/locations.json';

const Perfil = ({ user, tema = 'light' }) => {
  const isDark = tema === 'dark';

  // ---------- Locations (from JSON) ----------
  const locations = useMemo(() => {
    try {
      const countries = Array.isArray(locationsRaw?.countries) ? locationsRaw.countries : [];
      const byCountry = locationsRaw?.byCountry || {};
      return { countries, byCountry };
    } catch (err) {
      return { countries: [], byCountry: {} };
    }
  }, []);

  // ---------- estados iniciais (mantive sua lógica) ----------
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const prevAvatarPreviewRef = useRef(null);

  const [username, setUsername] = useState(user.username || '');
  const [objetivo, setObjetivo] = useState(user.perfil?.objetivo || '');

  const inicialPesoArray = Array.isArray(user.perfil?.pesoAtual)
    ? user.perfil.pesoAtual
    : user.perfil?.pesoAtual
      ? [user.perfil.pesoAtual]
      : [];

  const inicialAlturaArray = Array.isArray(user.perfil?.altura)
    ? user.perfil.altura
    : user.perfil?.altura
      ? [user.perfil.altura]
      : [];

  const [pesoHistory, setPesoHistory] = useState(inicialPesoArray);
  const [alturaHistory, setAlturaHistory] = useState(inicialAlturaArray);

  const getLatest = (arr) => {
    if (!arr || arr.length === 0) return null;
    return [...arr].sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm))[0];
  };

  const latestPeso = getLatest(pesoHistory);
  const latestAltura = getLatest(alturaHistory);

  const [peso, setPeso] = useState(latestPeso?.valor ?? 60);
  const [altura, setAltura] = useState(latestAltura?.valor ?? 170);
  const [idade, setIdade] = useState(user.perfil?.idade || 20);
  const [genero, setGenero] = useState(user.perfil?.genero || 'outro');

  // ---------- localização (indices em relação ao JSON) ----------
  const [countryIndex, setCountryIndex] = useState(-1);
  const [stateIndex, setStateIndex] = useState(-1);
  const [cityIndex, setCityIndex] = useState(-1);

  // ---------- meta ----------
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // tipos / helpers
  const tipos = [
    { value: 'academia', label: 'Academia' },
    { value: 'clinica-de-fisioterapia', label: 'Clínica de Fisioterapia' },
    { value: 'consultorio-de-nutricionista', label: 'Consultório de Nutricionista' },
    { value: 'loja', label: 'Loja' },
    { value: 'outros', label: 'Outros' }
  ];

  // derived location data
  const countries = locations.countries || [];
  const selectedCountry = countryIndex >= 0 ? countries[countryIndex] : null;
  const byCountry = locations.byCountry || {};
  const countryData = selectedCountry ? (byCountry[selectedCountry.name] || {}) : {};
  const states = Array.isArray(countryData.states) ? countryData.states : [];
  const citiesByState = countryData.citiesByState || {};
  const selectedStateName = stateIndex >= 0 ? states[stateIndex] : null;
  const cities = selectedStateName && Array.isArray(citiesByState[selectedStateName]) ? citiesByState[selectedStateName] : [];

  // inclui avatar para comparação de alterações
  const originalData = {
    username: user.username || '',
    objetivo: user.perfil?.objetivo || '',
    peso: latestPeso?.valor ?? (user.perfil?.pesoAtual?.valor ?? 60),
    altura: latestAltura?.valor ?? (user.perfil?.altura?.valor ?? 170),
    idade: user.perfil?.idade || 20,
    genero: user.perfil?.genero || 'outro',
    avatar: user.avatar || '',
    country: (user.perfil?.country || user.country || '') || '',
    state: (user.perfil?.state || user.state || '') || '',
    city: (user.perfil?.city || user.city || '') || ''
  };

  // quando user muda, atualizar estados e localização
  useEffect(() => {
    const pArr = Array.isArray(user.perfil?.pesoAtual) ? user.perfil.pesoAtual : user.perfil?.pesoAtual ? [user.perfil.pesoAtual] : [];
    const aArr = Array.isArray(user.perfil?.altura) ? user.perfil.altura : user.perfil?.altura ? [user.perfil.altura] : [];
    setPesoHistory(pArr);
    setAlturaHistory(aArr);

    const newestP = getLatest(pArr);
    const newestA = getLatest(aArr);
    setPeso(newestP?.valor ?? 60);
    setAltura(newestA?.valor ?? 170);

    setUsername(user.username || '');
    setObjetivo(user.perfil?.objetivo || '');
    setIdade(user.perfil?.idade || 20);
    setGenero(user.perfil?.genero || 'outro');

    // avatar preview
    setAvatar(user.avatar || '');
    setAvatarFile(null);
    if (prevAvatarPreviewRef.current) {
      URL.revokeObjectURL(prevAvatarPreviewRef.current);
      prevAvatarPreviewRef.current = null;
    }

    // --- prefill location from user.perfil or user fields ---
    const countryName = (user.perfil?.country || user.country || '').toString().trim();
    const stateName = (user.perfil?.state || user.state || '').toString().trim();
    const cityName = (user.perfil?.city || user.city || '').toString().trim();

    if (countryName) {
      const countryIdx = countries.findIndex(c =>
        String(c.name).toLowerCase() === String(countryName).toLowerCase() ||
        String(c.code || '').toLowerCase() === String(countryName).toLowerCase()
      );
      if (countryIdx >= 0) {
        setCountryIndex(countryIdx);
        const cobj = byCountry[countries[countryIdx].name] || {};
        const statesArr = Array.isArray(cobj.states) ? cobj.states : [];
        if (stateName) {
          const stIdx = statesArr.findIndex(s => String(s).toLowerCase() === String(stateName).toLowerCase());
          setStateIndex(stIdx >= 0 ? stIdx : -1);
          if (stIdx >= 0) {
            const citiesArr = (cobj.citiesByState && cobj.citiesByState[statesArr[stIdx]]) ? cobj.citiesByState[statesArr[stIdx]] : [];
            if (cityName) {
              const ctIdx = citiesArr.findIndex(ct => String(ct).toLowerCase() === String(cityName).toLowerCase());
              setCityIndex(ctIdx >= 0 ? ctIdx : -1);
            } else {
              setCityIndex(-1);
            }
          } else {
            setCityIndex(-1);
          }
        } else {
          setStateIndex(-1);
          setCityIndex(-1);
        }
      } else {
        setCountryIndex(-1);
        setStateIndex(-1);
        setCityIndex(-1);
      }
    } else {
      setCountryIndex(-1);
      setStateIndex(-1);
      setCityIndex(-1);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, locations.countries?.length]);

  // avatar change
  const handleAvatarChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (prevAvatarPreviewRef.current) {
      URL.revokeObjectURL(prevAvatarPreviewRef.current);
      prevAvatarPreviewRef.current = null;
    }

    const url = URL.createObjectURL(file);
    prevAvatarPreviewRef.current = url;
    setAvatar(url);
    setAvatarFile(file);
  };

  // handlers de selects de location
  const handleCountryChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    const i = isNaN(idx) ? -1 : idx;
    setCountryIndex(i);
    setStateIndex(-1);
    setCityIndex(-1);
  };
  const handleStateChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    const i = isNaN(idx) ? -1 : idx;
    setStateIndex(i);
    setCityIndex(-1);
  };
  const handleCityChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    const i = isNaN(idx) ? -1 : idx;
    setCityIndex(i);
  };

  // submit
  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const formData = new FormData();
      formData.append('email', user?.email);
      formData.append('username', username);
      formData.append('objetivo', objetivo);
      formData.append('pesoAtual', Number(peso));
      formData.append('altura', Number(altura));
      formData.append('idade', Number(idade));
      formData.append('genero', genero);

      // location fields
      if (selectedCountry) {
        formData.append('country', selectedCountry.name);
        if (selectedCountry.code) formData.append('countryCode', selectedCountry.code);
      }
      if (selectedStateName) formData.append('state', selectedStateName);
      if (cityIndex >= 0 && cities[cityIndex]) formData.append('city', cities[cityIndex]);

      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      const res = await api.post('/atualizar-perfil', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res && res.data) {
        if (res.data.avatarUrl) setAvatar(res.data.avatarUrl);
        if (res.data.user) {
          const updated = res.data.user;
          setUsername(updated.username || username);
          setObjetivo(updated.perfil?.objetivo || objetivo);
          setIdade(updated.perfil?.idade ?? idade);
          setGenero(updated.perfil?.genero || genero);
          if (Array.isArray(updated.perfil?.pesoAtual)) setPesoHistory(updated.perfil.pesoAtual);
          if (Array.isArray(updated.perfil?.altura)) setAlturaHistory(updated.perfil.altura);
        }
      }

      // cleanup preview
      setAvatarFile(null);
      if (prevAvatarPreviewRef.current) {
        URL.revokeObjectURL(prevAvatarPreviewRef.current);
        prevAvatarPreviewRef.current = null;
      }
    } catch (err) {
      console.error('Erro ao atualizar o perfil: ', err);
      setError(err?.response?.data?.message || err.message || 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  };

  // -------- current location display (prefere seleções ativas, faz fallback para user) --------
  const selectedCountryNameNow = selectedCountry?.name || '';
  const selectedStateNow = selectedStateName || '';
  const selectedCityNow = (cityIndex >= 0 && cities[cityIndex]) ? cities[cityIndex] : '';

  const fallbackCountry = originalData.country || '';
  const fallbackState = originalData.state || '';
  const fallbackCity = originalData.city || '';

  const displayCountry = selectedCountryNameNow || fallbackCountry;
  const displayState = selectedStateNow || fallbackState;
  const displayCity = selectedCityNow || fallbackCity;

  const currentLocationParts = [];
  if (displayCountry) currentLocationParts.push(displayCountry);
  if (displayState) currentLocationParts.push(displayState);
  if (displayCity) currentLocationParts.push(displayCity);
  const currentLocationDisplay = currentLocationParts.length ? currentLocationParts.join(' · ') : 'Localização não definida';

  // UI helpers
  const sortAscByDate = (arr) => {
    return [...(arr || [])].sort((a, b) => new Date(a.publicadoEm) - new Date(b.publicadoEm));
  };
  function formatDate(d) {
    if (!d) return '-';
    const dt = new Date(d);
    return dt.toLocaleString();
  }

  // detectar alteração incluindo localização
  const houveAlteracao =
    username !== originalData.username ||
    objetivo !== originalData.objetivo ||
    Number(peso) !== Number(originalData.peso) ||
    Number(altura) !== Number(originalData.altura) ||
    Number(idade) !== Number(originalData.idade) ||
    genero !== originalData.genero ||
    !!avatarFile ||
    displayCountry !== (originalData.country || '') ||
    displayState !== (originalData.state || '') ||
    displayCity !== (originalData.city || '');

  /* ================= Tokens (total + hoje) ================= */
  const [tokensTotal, setTokensTotal] = useState(0);
  const [tokensToday, setTokensToday] = useState(0);

  const brazilDayKey = (d) => {
    try {
      const dt = d ? new Date(d) : new Date();
      return dt.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    } catch (err) {
      const dt = d ? new Date(d) : new Date();
      return dt.toISOString().slice(0, 10);
    }
  };

  useEffect(() => {
    const tokenEntries = (user?.stats && Array.isArray(user.stats.tokens)) ? user.stats.tokens : [];
    if (!tokenEntries.length) {
      setTokensTotal(0);
      setTokensToday(0);
      return;
    }
    const total = tokenEntries.reduce((acc, e) => {
      const v = Number(e?.valor ?? e?.value ?? 0);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);

    const todayKey = brazilDayKey(new Date());
    const todaySum = tokenEntries.reduce((acc, e) => {
      const dt = e?.data ?? e?.date ?? e?.createdAt ?? e?.publishedAt ?? null;
      const key = dt ? brazilDayKey(dt) : null;
      if (key === todayKey) {
        const v = Number(e?.valor ?? e?.value ?? 0);
        return acc + (Number.isFinite(v) ? v : 0);
      }
      return acc;
    }, 0);

    setTokensTotal(total);
    setTokensToday(todaySum);
  }, [user]);

  const fmt = (n) => (typeof n === 'number' ? Math.round(n) : 0);

  // ---------- Theme classes ----------
  const containerClass = `perfil-container p-6 rounded-2xl max-w-xl mx-auto flex flex-col gap-6 shadow-sm ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-black'}`;
  const cardClass = `rounded-2xl p-4 shadow-sm ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`;
  const inputClass = `w-full p-2 rounded-2xl border ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-black placeholder-gray-600'}`;
  const mutedText = isDark ? 'text-xs text-gray-400' : 'text-xs text-gray-500';
  const btnPrimary = houveAlteracao && !submitting
    ? (isDark ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-green-500 text-white hover:bg-green-600')
    : 'bg-gray-300 text-gray-600 cursor-not-allowed';

  return (
    <div className={containerClass}>
      {/* Avatar + location badge */}
      <div className="avatar-container flex flex-col items-center gap-2">
        {avatar ? (
          <img src={avatar} alt="" className={`w-32 h-32 rounded-full object-cover shadow-md ${isDark ? 'bg-blue-700' : 'bg-blue-300'}`} />
        ) : (
          <BuscarImagem query={'foto de perfil icone'} className={`w-32 h-32 rounded-full object-cover shadow-md ${isDark ? 'bg-gray-800' : 'bg-blue-300'}`} />
        )}
        <input type="file" accept="image/*" className={`${inputClass} max-w-xs text-sm`} onChange={handleAvatarChange} />

        {/* Current location badge (mostra mesmo se não selecionado no form) */}
        <div className={`mt-2 px-3 py-1 rounded-full text-sm ${isDark ? 'bg-gray-800 text-gray-200 border border-gray-700' : 'bg-white text-gray-700 border border-gray-200'}`}>
          <strong className="mr-2">Localização:</strong>
          <span>{currentLocationDisplay}</span>
        </div>
      </div>

      {/* Username */}
      <div className={cardClass}>
        <div className="username-container flex flex-col gap-2">
          <label htmlFor="username" className="font-semibold text-lg">Username:</label>
          <input type="text" id="username" placeholder="Digite seu username" className={`${inputClass} focus:ring-2 ${isDark ? 'focus:ring-indigo-700' : 'focus:ring-blue-400'}`} value={username} onChange={(e) => setUsername(e.target.value)} />
          <p className={mutedText}>Este é o nome exibido no seu perfil e em atividades no SaaS.</p>
        </div>
      </div>

      {/* Objetivo */}
      <div className={`${cardClass} ${isDark ? '' : 'bg-yellow-100 border-yellow-300'}`}>
        <h2 className="text-xl font-bold mb-2">Objetivo</h2>
        <input type="text" className={`text-center w-full p-2 rounded-2xl border ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:ring-yellow-500' : 'bg-white border-gray-300 text-black placeholder-gray-600 focus:ring-yellow-400'}`} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
        <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'} mt-2`}>Descreva seu principal objetivo ao fazer exercícios.</p>
      </div>

      {/* Peso / Altura / Idade */}
      <div className="info-container grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={cardClass}>
          <h2 className="font-semibold">Peso — amostra mais recente</h2>
          <div className="text-sm text-gray-400 mb-2">{latestPeso ? `${latestPeso.valor} kg — ${formatDate(latestPeso.publicadoEm)}` : 'Nenhuma medição disponível'}</div>
          <input type="number" className={`${inputClass} text-center`} value={peso} onChange={(e) => setPeso(e.target.value)} /> <span className={mutedText}>kg</span>
        </div>

        <div className={cardClass}>
          <h2 className="font-semibold">Altura — amostra mais recente</h2>
          <div className="text-sm text-gray-400 mb-2">{latestAltura ? `${latestAltura.valor} cm — ${formatDate(latestAltura.publicadoEm)}` : 'Nenhuma medição disponível'}</div>
          <input type="number" className={`${inputClass} text-center`} value={altura} onChange={(e) => setAltura(e.target.value)} /> <span className={mutedText}>cm</span>
        </div>

        <div className={cardClass}>
          <h2 className="font-semibold">Idade</h2>
          <input type="number" className={`${inputClass} text-center`} value={idade} onChange={(e) => setIdade(e.target.value)} /> <span className={mutedText}>anos</span>
        </div>
      </div>

      {/* Localização (novo campo) */}
      <div className={cardClass}>
        <h3 className="font-semibold mb-2">Localização</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-400 block mb-1">País</label>
            <select className={inputClass} value={countryIndex} onChange={handleCountryChange}>
              <option value={-1}>— Selecione —</option>
              {countries.map((c, i) => <option key={`${c.name}-${i}`} value={i}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Estado</label>
            <select className={inputClass} value={stateIndex} onChange={handleStateChange} disabled={!states.length}>
              <option value={-1}>— Selecione —</option>
              {states.map((s, i) => <option key={`${s}-${i}`} value={i}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Cidade</label>
            <select className={inputClass} value={cityIndex} onChange={handleCityChange} disabled={!cities.length}>
              <option value={-1}>— Selecione —</option>
              {cities.map((ct, i) => <option key={`${ct}-${i}`} value={i}>{ct}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">País, estado e cidade usados para localizar ofertas, profissionais e locais próximos.</p>
      </div>

      {/* Histórico de Peso */}
      <div className={cardClass}>
        <h3 className="font-semibold mb-2">Histórico de Peso</h3>
        {pesoHistory && pesoHistory.length > 0 ? (
          <div className="text-xs space-y-2">
            {sortAscByDate(pesoHistory).map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-gray-50">
                <div>
                  <div className="font-medium">{item.valor} kg</div>
                  <div className="text-gray-400 text-xs">{formatDate(item.publicadoEm)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className={mutedText}>Sem histórico de peso.</div>}
      </div>

      {/* Histórico de Altura */}
      <div className={cardClass}>
        <h3 className="font-semibold mb-2">Histórico de Altura</h3>
        {alturaHistory && alturaHistory.length > 0 ? (
          <div className="text-xs space-y-2">
            {sortAscByDate(alturaHistory).map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-gray-50">
                <div>
                  <div className="font-medium">{item.valor} cm</div>
                  <div className="text-gray-400 text-xs">{formatDate(item.publicadoEm)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className={mutedText}>Sem histórico de altura.</div>}
      </div>

      {/* Gênero */}
      <div className={cardClass}>
        <h2 className="text-lg font-bold mb-4 text-center">Gênero</h2>
        <div className="grid grid-cols-3 gap-4">
          <button className={`p-4 rounded-xl border font-semibold flex flex-col items-center justify-center transition-all ${genero === 'masculino' ? `${isDark ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' : 'bg-blue-500 text-white border-blue-500 shadow-md scale-105'}` : 'border-gray-300 hover:bg-opacity-10'}`} onClick={() => setGenero('masculino')}>
            <span className="text-3xl mb-1">♂</span>
            Masculino
          </button>
          <button className={`p-4 rounded-xl border font-semibold flex flex-col items-center justify-center transition-all ${genero === 'feminino' ? `${isDark ? 'bg-pink-500 text-white border-pink-500 shadow-md scale-105' : 'bg-pink-500 text-white border-pink-500 shadow-md scale-105'}` : 'border-gray-300 hover:bg-opacity-10'}`} onClick={() => setGenero('feminino')}>
            <span className="text-3xl mb-1">♀</span>
            Feminino
          </button>
          <button className={`p-4 rounded-xl border font-semibold flex flex-col items-center justify-center transition-all ${genero === 'outro' ? `${isDark ? 'bg-gray-500 text-white border-gray-500 shadow-md scale-105' : 'bg-gray-400 text-white border-gray-400 shadow-md scale-105'}` : 'border-gray-300 hover:bg-opacity-10'}`} onClick={() => setGenero('outro')}>
            <span className="text-3xl mb-1">⚪</span>
            Outro
          </button>
        </div>
        <p className={`text-xs mt-3 text-center ${mutedText}`}>Escolha o gênero com o qual você mais se identifica.</p>
      </div>

      {/* Tokens summary */}
      <div className={cardClass}>
        <h3 className="font-semibold mb-2">Tokens (IA)</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-gray-500">Total de tokens gastos</div>
            <div className="text-lg font-bold">{fmt(tokensTotal)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Tokens gastos hoje</div>
            <div className="text-lg font-bold">{fmt(tokensToday)}</div>
          </div>
        </div>
        <div className={`text-xs mt-2 ${mutedText}`}>Contagem baseada nos registros de <code>user.stats.tokens</code> (fuso America/Sao_Paulo).</div>
      </div>

      {/* Botão Aplicar */}
      <button onClick={handleSubmit} disabled={!houveAlteracao || submitting} className={`p-3 rounded-2xl font-semibold mt-4 transition-all ${btnPrimary}`}>
        {submitting ? 'Salvando...' : houveAlteracao ? 'Salvar Alterações' : 'Nenhuma Alteração'}
      </button>

      {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
    </div>
  );
};

export default Perfil;
