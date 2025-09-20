import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../Api'; // sua instância axios
import locationsData from '../../../data/locations.json';

/* -------------------- Constantes / mocks (mantive os seus) -------------------- */
const TABS = {
  RECEITAS: 'receitas',
  PROFISSIONAIS: 'profissionais',
  ACADEMIAS: 'academias',
};

const LOCAL_TYPES = [
  { value: '', label: 'Todos os tipos' },
  { value: 'academia', label: 'Academia' },
  { value: 'clinica-de-fisioterapia', label: 'Clínica de Fisioterapia' },
  { value: 'consultorio-de-nutricionista', label: 'Consultório de Nutricionista' },
  { value: 'loja', label: 'Loja' },
  { value: 'outros', label: 'Outros' }
];

const mockReceitas = [
  { id: 'r1', title: 'Panqueca Fit', author: 'Usuário', location: 'São Paulo' },
  { id: 'r2', title: 'Shake Detox', author: 'IA', location: null },
];

const mockProfissionais = [
  { id: 'p1', name: 'Maria', title: 'Nutricionista Esportiva', cidade: 'São Paulo', estado: 'SP', country: 'Brazil', raw: { profissionalId: 'p1' } },
  { id: 'p2', name: 'Carlos', title: 'Personal Trainer', cidade: 'São Paulo', estado: 'SP', country: 'Brazil', raw: { profissionalId: 'p2' } },
  { id: 'p3', name: 'Ana', title: 'Nutricionista', cidade: 'Rio de Janeiro', estado: 'RJ', country: 'Brazil', raw: { profissionalId: 'p3' } },
];

const mockAcademias = [
  { id: 'g1', localName: 'SmartGym', cidade: 'São Paulo', estado: 'SP', country: 'Brazil', localType: 'academia' },
  { id: 'g2', localName: 'Academia Corpo Livre', cidade: 'Campinas', estado: 'SP', country: 'Brazil', localType: 'academia' },
  { id: 'g3', localName: 'FitZone RJ', cidade: 'Niterói', estado: 'RJ', country: 'Brazil', localType: 'academia' },
];

function themeClass(tema, lightClass, darkClass) {
  return tema === 'light' ? lightClass : darkClass;
}

/* -------------------- Componente -------------------- */
export default function Encontrar({ user, tema = 'dark' }) {
  const temaValue = tema === 'light' ? 'light' : 'dark';
  const navigate = useNavigate();

  const [tab, setTab] = useState(TABS.RECEITAS);
  const [search, setSearch] = useState('');

  // localidades
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(user?.country || user?.perfil?.country || '');
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState(user?.perfil?.state || user?.state || '');
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(user?.perfil?.city || user?.city || '');

  const [receitaFonte, setReceitaFonte] = useState('all');
  const [especialidade, setEspecialidade] = useState('');

  // dados reais
  const [receitas, setReceitas] = useState(mockReceitas);
  const [profissionais, setProfissionais] = useState(mockProfissionais);
  const [academias, setAcademias] = useState(mockAcademias); // antigo nome, agora usados como locais/academias
  const [locais, setLocais] = useState([]); // para geral (usado quando buscar por profissional ou por localType)

  // loading / error por lista
  const [loadingReceitas, setLoadingReceitas] = useState(false);
  const [loadingProf, setLoadingProf] = useState(false);
  const [loadingGinas, setLoadingGinas] = useState(false);
  const [loadingLocais, setLoadingLocais] = useState(false);
  const [error, setError] = useState(null);

  // filtro localType para aba academias
  const [localTypeFilter, setLocalTypeFilter] = useState(null);

  // paginação: estados por lista
  const [profPage, setProfPage] = useState(1);
  const [profPerPage, setProfPerPage] = useState(40);
  const [profTotal, setProfTotal] = useState(0);
  const [profTotalPages, setProfTotalPages] = useState(1);

  const [locaisPage, setLocaisPage] = useState(1);
  const [locaisPerPage, setLocaisPerPage] = useState(40);
  const [locaisTotal, setLocaisTotal] = useState(0);
  const [locaisTotalPages, setLocaisTotalPages] = useState(1);

  const [receitasPage, setReceitasPage] = useState(1);
  const [receitasPerPage, setReceitasPerPage] = useState(40);
  const [receitasTotal, setReceitasTotal] = useState(0);
  const [receitasTotalPages, setReceitasTotalPages] = useState(1);

  const prevRegionRef = useRef({
    country: selectedCountry,
    state: selectedState,
    city: selectedCity,
  });

  // abort + debounce refs
  const abortRef = useRef({ receitas: null, prof: null, academias: null, locais: null });
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  /* --------------------- Helpers de local (usa locations.json no formato informado) --------------------- */
  function loadCountriesLocal() {
    try {
      const arr = Array.isArray(locationsData?.countries) ? locationsData.countries : [];
      const list = arr.map(c => ({ name: c.name || 'Unknown', code: c.code || '' }))
        .filter(Boolean)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!mountedRef.current) return;
      setCountries(list.length ? list : [{ name: 'Brazil', code: 'BR' }, { name: 'Portugal', code: 'PT' }]);
    } catch (err) {
      if (!mountedRef.current) return;
      setCountries([{ name: 'Brazil', code: 'BR' }, { name: 'Portugal', code: 'PT' }]);
    }
  }

  function loadStatesForCountryLocal(countryName) {
    if (!countryName) {
      setStates([]); setSelectedState(''); return;
    }
    try {
      const byCountry = locationsData?.byCountry || {};
      const countryObj = byCountry[countryName] || byCountry[String(countryName).trim()] || null;
      if (!countryObj) {
        if ((countryName || '').toLowerCase().includes('brazil') || (countryName || '').toLowerCase() === 'br') {
          const br = ['Acre', 'São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Bahia'];
          if (mountedRef.current) {
            setStates(br);
            if (!br.includes(selectedState)) setSelectedState('');
          }
        } else {
          if (mountedRef.current) { setStates([]); setSelectedState(''); }
        }
        return;
      }

      const arr = Array.isArray(countryObj.states) ? countryObj.states : [];
      const sorted = arr.slice().sort((a, b) => String(a).localeCompare(String(b)));
      if (!mountedRef.current) return;
      setStates(sorted);
      if (!sorted.includes(selectedState)) setSelectedState('');
    } catch (err) {
      if (!mountedRef.current) return;
      setStates([]); setSelectedState('');
    }
  }

  function loadCitiesForStateLocal(countryName, stateName) {
    if (!countryName || !stateName) {
      setCities([]); setSelectedCity(''); return;
    }
    try {
      const byCountry = locationsData?.byCountry || {};
      const countryObj = byCountry[countryName] || byCountry[String(countryName).trim()] || null;
      if (!countryObj) { if (!mountedRef.current) return; setCities([]); setSelectedCity(''); return; }

      const citiesByState = countryObj.citiesByState || {};
      const arr = Array.isArray(citiesByState[stateName]) ? citiesByState[stateName] : [];
      const sorted = arr.slice().sort((a, b) => String(a).localeCompare(String(b)));
      if (!mountedRef.current) return;
      setCities(sorted);
      if (!sorted.includes(selectedCity)) setSelectedCity('');
    } catch (err) {
      if (!mountedRef.current) return;
      setCities([]); setSelectedCity('');
    }
  }

  /* --------------------- Helpers de API (mantidos/adaptados) --------------------- */
  async function loadCountries() {
    // mantive como fallback (usa local por padrão)
    loadCountriesLocal();
  }

  async function loadStatesForCountry(countryName) {
    // delega para local
    loadStatesForCountryLocal(countryName);
  }

  async function loadCitiesForState(countryName, stateName) {
    loadCitiesForStateLocal(countryName, stateName);
  }

  /* --------------------- Fetch dados reais (com debounce) --------------------- */
  const fetchProfissionais = async (opts = {}) => {
    try { abortRef.current.prof?.abort(); } catch (_) { }
    const controller = new AbortController();
    abortRef.current.prof = controller;

    setLoadingProf(true);
    setError(null);

    const pageToUse = opts.page ?? profPage ?? 1;
    const limitToUse = opts.limit ?? profPerPage ?? 10;

    const params = {
      q: opts.q ?? search ?? undefined,
      country: opts.country ?? (selectedCountry || undefined),
      state: opts.state ?? (selectedState || undefined),
      city: opts.city ?? (selectedCity || undefined),
      especialidade: opts.especialidade ?? (especialidade || undefined),
      page: pageToUse,
      limit: limitToUse
    };
    Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);

    try {
      const res = await api.get('/profissionais', { params, signal: controller.signal });
      if (!mountedRef.current) return;
      const payload = res?.data || {};

      // Normalize different server shapes and handle a server that returns ALL items in payload.data.items
      let items = [];
      let total = undefined;
      let perPage = undefined;
      let pageNum = pageToUse;

      if (Array.isArray(payload)) {
        items = payload;
      } else if (payload.profissionais) {
        items = payload.profissionais;
        total = payload.total ?? payload.count;
      } else if (payload.data && Array.isArray(payload.data.items)) {
        // payload.data may contain the full list and pagination meta
        const itemsAll = payload.data.items || [];
        total = payload.data.total ?? itemsAll.length;
        perPage = payload.data.perPage ?? limitToUse;
        pageNum = payload.data.page ?? pageToUse;

        // if API returned ALL items in itemsAll we must slice client-side
        if (itemsAll.length > (perPage || limitToUse)) {
          const start = (pageToUse - 1) * (perPage || limitToUse);
          items = itemsAll.slice(start, start + (perPage || limitToUse));
        } else {
          items = itemsAll;
        }
      } else if (payload.items) {
        items = payload.items;
        total = payload.total ?? payload.count ?? items.length;
        perPage = payload.perPage ?? limitToUse;
      } else if (payload._id || payload.profissionalId) {
        items = [payload];
      } else if (payload.profissional) {
        items = [payload.profissional];
      }

      // compute pagination numbers
      const finalPerPage = perPage ?? limitToUse;
      const finalTotal = typeof total === 'number' ? total : (Array.isArray(items) ? items.length : 0);
      const finalTotalPages = Math.max(1, Math.ceil(finalTotal / finalPerPage));

      setProfPerPage(finalPerPage);
      setProfTotal(finalTotal);
      setProfTotalPages(finalTotalPages);
      setProfPage(pageNum);

      if (!items.length) {
        setProfissionais([]);
      } else {
        const normalized = items.map(it => ({
          id: it._id || it.profissionalId || it.userId || (it.id ?? ''),
          name: it.profissionalName || it.name || it.username || '—',
          title: it.especialidade || it.title || '—',
          cidade: it.city || it.cidade || '',
          estado: it.state || it.estado || '',
          country: it.country || '',
          imageUrl: it.imageUrl || null,
          raw: it
        }));
        setProfissionais(normalized);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.message === 'canceled') {
        // abortado — silencioso
      } else {
        console.error('Erro fetchProfissionais:', err);
        setError('Falha ao carregar profissionais. Usando dados locais.');
        setProfissionais(mockProfissionais);
      }
    } finally {
      if (mountedRef.current) setLoadingProf(false);
    }
  };

  // fetchLocais: genérico para todos os tipos de Local (usa /locais)
  const fetchLocais = async (opts = {}) => {
    try { abortRef.current.locais?.abort(); } catch (_) { }
    const controller = new AbortController();
    abortRef.current.locais = controller;

    setLoadingLocais(true);
    setError(null);

    const pageToUse = opts.page ?? locaisPage ?? 1;
    const limitToUse = opts.limit ?? locaisPerPage ?? 10;

    const params = {
      q: opts.q ?? search ?? undefined,
      country: opts.country ?? (selectedCountry || undefined),
      state: opts.state ?? (selectedState || undefined),
      city: opts.city ?? (selectedCity || undefined),
      localType: opts.localType ?? (localTypeFilter || null),
      page: pageToUse,
      limit: limitToUse
    };
    Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);

    try {
      const res = await api.get('/locais', { params, signal: controller.signal });
      if (!mountedRef.current) return;
      const payload = res?.data || {};
      let items = [];
      let total = undefined;
      let perPage = undefined;
      let pageNum = pageToUse;

      if (payload) console.log('fetchLocais payload:', payload);

      if (!payload) items = [];
      else if (Array.isArray(payload)) items = payload;
      else if (payload.data && Array.isArray(payload.data.items)) {
        const itemsAll = payload.data.items || [];
        total = payload.data.total ?? itemsAll.length;
        perPage = payload.data.perPage ?? limitToUse;
        pageNum = payload.data.page ?? pageToUse;
        if (itemsAll.length > (perPage || limitToUse)) {
          const start = (pageToUse - 1) * (perPage || limitToUse);
          items = itemsAll.slice(start, start + (perPage || limitToUse));
        } else {
          items = itemsAll;
        }
      } else if (payload.items) {
        items = payload.items;
        total = payload.total ?? payload.count ?? items.length;
        perPage = payload.perPage ?? limitToUse;
      } else if (payload.locais) items = payload.locais;
      else if (payload.data) items = Array.isArray(payload.data) ? payload.data : (payload.data.items || []);
      else items = [];

      // Normaliza e extrai um campo `status` confiável (lowercase)
      const normalizedAll = (items || []).map(it => {
        return {
          id: it.localId || it.id || it._id || '',
          link: it.link,
          localName: it.localName || it.name || it.title || '—',
          localType: (it.localType || it.type || 'outros'),
          localDescricao: it.localDescricao || it.description || '',
          cidade: it.city || it.cidade || '',
          estado: it.state || it.estado || '',
          country: it.country || '',
          imageUrl: it.imageUrl || it.image || null,
          userId: it.userId || null,
          raw: it
        };
      });

      // filtragem cliente por tipo, se necessário
      const wantedType = (opts.localType ?? localTypeFilter ?? '').toString().trim().toLowerCase();
      const filteredByType = wantedType ? normalizedAll.filter(x => (x.localType || '').toString().toLowerCase() === wantedType) : normalizedAll;

      // compute pagination numbers
      const finalPerPage = perPage ?? limitToUse;
      const finalTotal = typeof total === 'number' ? total : filteredByType.length;
      const finalTotalPages = Math.max(1, Math.ceil(finalTotal / finalPerPage));

      setLocaisPerPage(finalPerPage);
      setLocaisTotal(finalTotal);
      setLocaisTotalPages(finalTotalPages);
      setLocaisPage(pageNum);

      setLocais(filteredByType);
      console.log(locais, 'locais carregados:', filteredByType.length, 'de', filteredByType.length, 'após filtro de tipo');
    } catch (err) {
      if (err.name === 'CanceledError' || err.message === 'canceled') {
        // abortado — silencioso
      } else {
        console.error('Erro fetchLocais:', err);
        setError('Falha ao carregar locais. Usando dados locais.');
        setLocais(mockAcademias.map(m => ({
          id: m.id || m.localId || '',
          link: m.link,
          localName: m.localName || m.name || '—',
          localType: m.localType || 'academia',
          localDescricao: m.localDescricao || '',
          cidade: m.cidade,
          estado: m.estado,
          country: m.country,
          imageUrl: m.imageUrl || null,
          raw: m
        })));
      }

      console.log(locais, 'locais após erro:', locais.length);
    } finally {
      if (mountedRef.current) setLoadingLocais(false);
    }
  };

  const fetchAcademias = async (opts = {}) => {
    const localTypeToUse = opts.localType ?? localTypeFilter ?? 'academia';
    return fetchLocais({ ...opts, localType: localTypeToUse });
  };

  const fetchReceitas = async (opts = {}) => {
    try { abortRef.current.receitas?.abort(); } catch (_) { }
    const controller = new AbortController();
    abortRef.current.receitas = controller;

    setLoadingReceitas(true);
    try {
      const pageToUse = opts.page ?? receitasPage ?? 1;
      const limitToUse = opts.limit ?? receitasPerPage ?? 10;

      const params = {
        q: opts.q ?? search ?? undefined,
        fonte: receitaFonte === 'all' ? undefined : receitaFonte,
        page: pageToUse,
        limit: limitToUse
      };
      Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);
      const res = await api.get('/receitas', { params, signal: controller.signal });
      if (!mountedRef.current) return;
      const payload = res?.data || {};
      let items = [];
      let total = undefined;
      let perPage = undefined;
      let pageNum = pageToUse;

      if (payload) console.log('fetchReceitas payload:', payload);

      if (Array.isArray(payload)) items = payload;
      else if (payload.data && Array.isArray(payload.data.items)) {
        const itemsAll = payload.data.items || [];
        total = payload.data.total ?? itemsAll.length;
        perPage = payload.data.perPage ?? limitToUse;
        pageNum = payload.data.page ?? pageToUse;
        if (itemsAll.length > (perPage || limitToUse)) {
          const start = (pageToUse - 1) * (perPage || limitToUse);
          items = itemsAll.slice(start, start + (perPage || limitToUse));
        } else {
          items = itemsAll;
        }
      } else if (payload.receitas) items = payload.receitas;
      else if (payload.items) items = payload.items;
      else items = [];

      const finalPerPage = perPage ?? limitToUse;
      const finalTotal = typeof total === 'number' ? total : items.length;
      const finalTotalPages = Math.max(1, Math.ceil(finalTotal / finalPerPage));

      setReceitasPerPage(finalPerPage);
      setReceitasTotal(finalTotal);
      setReceitasTotalPages(finalTotalPages);
      setReceitasPage(pageNum);

      if (!items.length) setReceitas(mockReceitas);
      else setReceitas(items);
    } catch (err) {
      if (!mountedRef.current) return;
      setReceitas(mockReceitas);
    } finally {
      if (mountedRef.current) setLoadingReceitas(false);
    }
  };

  /* --------------------- Effects de disparo (debounce) --------------------- */
  useEffect(() => {
    mountedRef.current = true;
    // carrega países do arquivo local
    loadCountriesLocal();

    // se o usuário já tiver país/estado salvo, pré-carrega os estados e cidades
    if (selectedCountry) {
      loadStatesForCountryLocal(selectedCountry);
      if (selectedState) loadCitiesForStateLocal(selectedCountry, selectedState);
    }

    return () => {
      mountedRef.current = false;
      try { abortRef.current.prof?.abort(); } catch (_) { }
      try { abortRef.current.academias?.abort(); } catch (_) { }
      try { abortRef.current.receitas?.abort(); } catch (_) { }
      try { abortRef.current.locais?.abort(); } catch (_) { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // reset pages on filter/search/tab change
    setProfPage(1);
    setLocaisPage(1);
    setReceitasPage(1);

    debounceRef.current = setTimeout(() => {
      fetchProfissionais();
      if (tab === TABS.ACADEMIAS) {
        fetchLocais({ localType: localTypeFilter });
      }
      fetchReceitas();
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCountry, selectedState, selectedCity, especialidade, receitaFonte, localTypeFilter, tab]);

  useEffect(() => {
    if (!selectedCountry) {
      setStates([]); setSelectedState(''); setCities([]); setSelectedCity(''); return;
    }
    loadStatesForCountryLocal(selectedCountry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry]);

  useEffect(() => {
    if (!selectedState) { setCities([]); setSelectedCity(''); return; }
    if (!selectedCountry) return;
    loadCitiesForStateLocal(selectedCountry, selectedState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState, selectedCountry]);

  /* --------------------- UI helpers --------------------- */
  const norm = (v) => String(v ?? '').toLowerCase().trim();

  const goToSolicitacao = (prof) => {
    const raw = prof?.raw || {};
    const key = raw.userId || raw.profissionalId || prof.id || raw._id || '';
    if (!key) {
      navigate(`/dashboard/coach/u?q=${encodeURIComponent(prof.id || '')}`);
      return;
    }
    navigate(`/dashboard/coach/u?q=${encodeURIComponent(key)}`);
  };

  const Pagination = ({ page, totalPages, onPrev, onNext }) => {
    if (!totalPages || totalPages <= 1) return null;
    return (
      <div className="mt-4 flex items-center gap-2">
        <button onClick={onPrev} className="px-3 py-1 rounded bg-gray-200">Anterior</button>
        <div className="text-sm">Página {page} de {totalPages}</div>
        <button onClick={onNext} className="px-3 py-1 rounded bg-gray-200">Próximo</button>
      </div>
    );
  };

  return (
    <div className={`p-6 max-w-6xl mx-auto ${themeClass(temaValue, 'bg-white text-gray-900', 'bg-gray-900 text-white')} rounded-md`}>
      <header className="mb-6 w-full text-clip">
        <h1 className="text-3xl font-extrabold">Encontrar</h1>
        <p className="text-sm text-gray-500 w-full">Busque receitas, profissionais e locais por país, estado e cidade.</p>
      </header>

      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procure por receita, profissional ou local..."
          className={`flex-1 px-4 py-3 rounded-xl border shadow-sm ${tema === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}
        />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab(TABS.RECEITAS)}
            className={`px-4 py-2 rounded-xl font-semibold ${tab === TABS.RECEITAS ? 'bg-blue-600 text-white' : themeClass(temaValue, 'bg-gray-100', 'bg-gray-800')}`}>
            Receitas
          </button>
          <button
            onClick={() => setTab(TABS.PROFISSIONAIS)}
            className={`px-4 py-2 rounded-xl font-semibold ${tab === TABS.PROFISSIONAIS ? 'bg-blue-600 text-white' : themeClass(temaValue, 'bg-gray-100', 'bg-gray-800')}`}>
            Profissionais
          </button>
          <button
            onClick={() => setTab(TABS.ACADEMIAS)}
            className={`px-4 py-2 rounded-xl font-semibold ${tab === TABS.ACADEMIAS ? 'bg-blue-600 text-white' : themeClass(temaValue, 'bg-gray-100', 'bg-gray-800')}`}>
            Locais
          </button>
        </div>
      </div>

      {error && <div className="mb-4 text-red-600">{error}</div>}

      <main className="space-y-6">
        {/* filtros de localização */}
        <div className="flex flex-col md:flex-row gap-3 items-start mb-4">
          <div className="w-full md:w-1/3">
            <label className="text-xs text-gray-400 mb-1 block">País</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg ${themeClass(temaValue, 'border', 'border-gray-300')}`}>
              <option className={`text-black`} value="">Todos os países</option>
              {countries.length ? countries.map(c => (
                <option className={`text-black`} key={c.name} value={c.name}>{c.name}</option>
              )) : <option className={`text-black`}>Carregando países...</option>}
            </select>
          </div>

          <div className="w-full md:w-1/3">
            <label className="text-xs text-gray-400 mb-1 block">Estado / Região</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg ${themeClass(temaValue, 'border', 'border-gray-300')}`}>
              <option className={`text-black`} value="">Todos os estados</option>
              {states.length ? states.map(s => <option className={`text-black`} key={s} value={s}>{s}</option>) : null}
            </select>
          </div>

          <div className="w-full md:w-1/3">
            <label className="text-xs text-gray-400 mb-1 block">Cidade</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg ${themeClass(temaValue, 'border', 'border-gray-300')}`}>
              <option className={`text-black`} value="">Todas as cidades</option>
              {cities.length ? cities.map(c => <option className={`text-black`} key={c} value={c}>{c}</option>) : null}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <div className="inline-flex w-full flex-wrap items-center gap-3 px-4 py-2 rounded-xl bg-gray-100 text-sm text-gray-700">
            <strong>Selecionado:</strong>
            <span>{selectedCountry || 'Todos os países'}</span>
            <span>›</span>
            <span>{selectedState || 'Todos os estados'}</span>
            <span>›</span>
            <span>{selectedCity || 'Todas as cidades'}</span>
          </div>
        </div>

        {/* Receitas */}
        {tab === TABS.RECEITAS && (
          <section>
            <div className="mb-4 flex items-center gap-3">
              <label className="text-sm font-medium">Fonte:</label>
              <select value={receitaFonte} onChange={(e) => setReceitaFonte(e.target.value)} className="px-3 py-2 rounded-lg border">
                <option className={`text-black`} value="all">Todas</option>
                <option className={`text-black`} value="ia">IA</option>
                <option className={`text-black`} value="user">Usuário</option>
              </select>
              <div className="text-xs text-gray-400">Filtre receitas por autor (IA ou usuário).</div>
            </div>

            <h2 className="text-xl font-bold mb-3">Receitas</h2>
            {loadingReceitas ? <div>Carregando receitas...</div> : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {receitas.length ? receitas.map(r => (
                    <div key={r.id || r._id} className={`p-4 rounded-xl ${themeClass(temaValue, 'bg-white', 'bg-gray-800')} shadow-sm border`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{r.title}</div>
                          <div className="text-xs text-gray-400">{r.author} {r.location ? `• ${r.location}` : ''}</div>
                        </div>
                        <div className="text-xs text-gray-500">{r.id?.startsWith?.('r') ? 'Receita' : ''}</div>
                      </div>
                    </div>
                  )) : <div className="text-sm text-gray-400">Nenhuma receita encontrada.</div>}
                </div>

                <Pagination
                  page={receitasPage}
                  totalPages={receitasTotalPages}
                  onPrev={() => {
                    const novo = Math.max(1, receitasPage - 1);
                    setReceitasPage(novo);
                    fetchReceitas({ page: novo });
                  }}
                  onNext={() => {
                    const novo = Math.min(receitasTotalPages, receitasPage + 1);
                    setReceitasPage(novo);
                    fetchReceitas({ page: novo });
                  }}
                />
              </div>
            )}
          </section>
        )}

        {/* Profissionais */}
        {tab === TABS.PROFISSIONAIS && (
          <section>
            <div className="flex items-center justify-between flex-wrap mb-3 gap-4">
              <h2 className="text-xl font-bold">Profissionais</h2>
              <div className="flex items-center gap-2">
                <select value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} className={`px-3 py-2 rounded-lg ${themeClass(temaValue, 'border', 'border-gray-600')}`}>
                  <option className={`text-black`} value="">Todas as especialidades</option>
                  <option className={`text-black`} value="nutricionista">Nutricionista</option>
                  <option className={`text-black`} value="personal-trainner">Personal Trainer</option>
                  <option className={`text-black`} value="fisioterapeuta">Fisioterapeuta</option>
                </select>
              </div>
            </div>

            {loadingProf ? <div>Carregando profissionais...</div> : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {profissionais.length ? profissionais.map(p => (
                    <div key={p.id || p.name} className={`p-4 rounded-xl ${themeClass(temaValue, 'bg-white', 'bg-gray-800')} shadow-sm border`}>
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="w-16 h-16 rounded-full overflow-hidden border flex-shrink-0">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-200 text-black">{(p.name || '—')[0]}</div>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-sm text-gray-500">{p.title}</div>
                          <div className="text-xs text-gray-400 mt-2">{p.cidade} — {p.estado} — {p.country || '—'}</div>
                        </div>

                        <div className="flex flex-col gap-2 items-end">
                          <button
                            onClick={() => goToSolicitacao(p)}
                            className="px-3 py-1 rounded-lg bg-blue-600 text-white text-sm"
                          >
                            Ver Perfil / Solicitar
                          </button>
                        </div>
                      </div>
                    </div>
                  )) : <div className="text-sm text-gray-400">Nenhum profissional encontrado com esses filtros.</div>}
                </div>

                <Pagination
                  page={profPage}
                  totalPages={profTotalPages}
                  onPrev={() => {
                    const novo = Math.max(1, profPage - 1);
                    setProfPage(novo);
                    fetchProfissionais({ page: novo });
                  }}
                  onNext={() => {
                    const novo = Math.min(profTotalPages, profPage + 1);
                    setProfPage(novo);
                    fetchProfissionais({ page: novo });
                  }}
                />
              </div>
            )}
          </section>
        )}

        {/* Academias / Locais */}
        {tab === TABS.ACADEMIAS && (
          <section>
            <div className="mb-4 flex items-center flex-wrap justify-between gap-4">
              <h2 className="text-xl font-bold">Locais</h2>

              <div className="flex items-center flex-wrap sm:flex-nowrap gap-2">
                <label className="text-sm">Tipo:</label>
                <select value={localTypeFilter} onChange={(e) => setLocalTypeFilter(e.target.value)} className="px-3 py-2 rounded-lg w-full border">
                  {LOCAL_TYPES.map(t => <option key={t.value} className='text-black' value={t.value}>{t.label}</option>)}
                </select>

                <button onClick={() => fetchLocais({ localType: localTypeFilter })} className="px-3 py-2 rounded-lg bg-blue-600 text-white">Buscar</button>
              </div>
            </div>

            {loadingLocais ? <div>Carregando locais...</div> : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(locais && locais.length) ? locais.map(l => (
                    <div
                      key={l.id || l.localName}
                      style={{
                        backgroundImage: `url(${l.imageUrl})`,
                        backgroundPosition: 'center',
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                      }}
                      className={`rounded-2xl shadow-sm border ring ring-blue-600 border-gray-800 text-white`}
                    >
                      <div className="flex flex-wrap p-4 items-start bg-gradient-to-b rounded-2xl from-black/80 to-black/0 gap-4">
                        <div className="w-16 h-16 rounded-md overflow-hidden border flex-shrink-0 bg-gray-200">
                          {l.imageUrl ? <img src={l.imageUrl} alt={l.localName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-black">LK</div>}
                        </div>

                        <div className="flex-1">
                          <div className="font-semibold">{l.localName}</div>
                          <div className="text-sm contrast-100">{(LOCAL_TYPES.find(t => t.value === l.localType)?.label) || l.localType}</div>
                          <div className="text-xs contrast-50 mt-2">{l.cidade} — {l.estado} — {l.country || '—'}</div>
                          {l.localDescricao ? <div className="text-xs mt-2 contrast-100">{l.localDescricao}</div> : null}
                        </div>

                        <div className="flex flex-col gap-2">
                          <button className="px-3 py-1 rounded-lg bg-blue-600 text-white text-sm" onClick={() => {
                            location.href = l.link
                          }}>Saber mais..</button>
                        </div>
                      </div>
                    </div>
                  )) : <div className="text-sm text-gray-400">Nenhum local encontrado com esses filtros.</div>}
                </div>

                <Pagination
                  page={locaisPage}
                  totalPages={locaisTotalPages}
                  onPrev={() => {
                    const novo = Math.max(1, locaisPage - 1);
                    setLocaisPage(novo);
                    fetchLocais({ page: novo });
                  }}
                  onNext={() => {
                    const novo = Math.min(locaisTotalPages, locaisPage + 1);
                    setLocaisPage(novo);
                    fetchLocais({ page: novo });
                  }}
                />
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
