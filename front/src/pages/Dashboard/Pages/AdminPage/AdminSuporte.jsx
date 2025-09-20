import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../../../../Api'

// Componente AdminSuporte (melhorado)
// Alterações nesta versão:
// - Adicionado filtro "Respondido / Não respondido / Todos" (enviado ao servidor como param `responded`)
// - Se o backend não suportar o param `responded`, há um fallback comentado para filtrar no cliente
// - Removido `window.location.reload()`; agora a UI atualiza via fetchSupports
// - setItemLoading aplicado corretamente ao salvar resposta

const fallbackTheme = {
  bg: 'bg-white',
  cardBg: 'bg-gray-50',
  text: 'text-gray-900',
  muted: 'text-gray-600',
  primary: 'text-indigo-600',
  border: 'border-gray-200'
}
const darkTheme = {
  bg: 'bg-gray-900',
  cardBg: 'bg-gray-800',
  text: 'text-gray-100',
  muted: 'text-gray-300',
  primary: 'text-indigo-300',
  border: 'border-gray-700'
}
const getTheme = (tema) => {
  if (!tema) return fallbackTheme
  if (typeof tema === 'string') return tema === 'dark' ? darkTheme : fallbackTheme
  return {
    bg: tema.bg || fallbackTheme.bg,
    cardBg: tema.cardBg || fallbackTheme.cardBg,
    text: tema.text || fallbackTheme.text,
    muted: tema.muted || fallbackTheme.muted,
    primary: tema.primary || fallbackTheme.primary,
    border: tema.border || fallbackTheme.border
  }
}

const formatDate = (iso) => {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleString() } catch (e) { return iso }
}

const downloadCSV = (rows = [], filename = 'supports.csv') => {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [headers.join(',')]
  for (const r of rows) {
    csv.push(headers.map(h => {
      const cell = r[h] == null ? '' : String(r[h]).replace(/"/g, '""')
      return `"${cell.replace(/\n/g, ' ')}"`
    }).join(','))
  }
  const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminSuporte({ tema, user }) {
  const theme = getTheme(tema)

  const [supports, setSupports] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandAll, setExpandAll] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  // search/pagination/sort
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  // novo: filtro de respondido
  // values: 'all' | 'responded' | 'unresponded'
  const [respondedFilter, setRespondedFilter] = useState('all')

  // ui
  const [detailItem, setDetailItem] = useState(null)
  const [respostaTexto, setRespostaTexto] = useState('')

  // action states per item
  const [actionLoading, setActionLoading] = useState({}) // { [id]: true }

  const isMounted = useRef(true)
  const timeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      isMounted.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const isAdmin = !!user && (user.role === 'admin' || user.isAdmin)

  const clearStatus = useCallback((delay = 4000) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (!isMounted.current) return
      setErro('')
      setMsg('')
    }, delay)
  }, [])

  const fetchSupports = useCallback(async (opts = {}) => {
    if (!user || !user._id) return setErro('Usuário inválido')
    try {
      setLoading(true)
      setErro('')
      const p = opts.page ?? page
      const pp = opts.perPage ?? perPage
      const s = typeof opts.search !== 'undefined' ? opts.search : debouncedSearch
      const rf = typeof opts.respondedFilter !== 'undefined' ? opts.respondedFilter : respondedFilter

      const params = { adminId: user._id, page: p, perPage: pp }
      if (s) params.search = s
      if (sortBy) params.sort = `${sortDir === 'desc' ? '-' : ''}${sortBy}`

      // passing the respondido filter to the server. Backend should accept a param like `responded=all|responded|unresponded`
      // If your backend expects boolean, adjust accordingly (e.g. responded=true/false)
      if (rf && rf !== 'all') params.responded = rf

      const res = await api.get('/supports-by-admin', { params })
      console.log('fetchSupports =>', res?.data)
      const supportsData = res?.data?.supports ?? res?.data?.data ?? res?.data ?? []
      setSupports(Array.isArray(supportsData) ? supportsData : [])
      setTotal(res?.data?.pagination?.total ?? supportsData.length)
    } catch (error) {
      console.error(error)
      if (!isMounted.current) return
      setErro(error?.message || 'Erro de requisição')
      clearStatus()
    } finally {
      if (!isMounted.current) return
      setLoading(false)
    }
  }, [user, page, perPage, debouncedSearch, sortBy, sortDir, respondedFilter, clearStatus])

  useEffect(() => { fetchSupports({ page: 1 }) }, [fetchSupports])

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  // refetch when debouncedSearch, page, perPage, sort changes or respondedFilter
  useEffect(() => { fetchSupports({ page, perPage }) }, [debouncedSearch, page, perPage, sortBy, sortDir, respondedFilter, fetchSupports])

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const tableRows = useMemo(() => supports.map(s => ({
    supportId: s.supportId,
    assunto: s.assunto,
    descricao: s.descricao,
    userEmail: s.userEmail || s.userId?.email || '-',
    userName: s.userId?.name || '-',
    criadoEm: formatDate(s.createdAt || s.criadoEm),
    privado: String(!!s.privado),
    resposta: s.resposta || ''
  })), [supports])

  // helper para setar loading por id
  const setItemLoading = (id, value) => setActionLoading(prev => ({ ...prev, [id]: !!value }))

  // ADICIONAR/EDITAR RESPOSTA com atualização otimista
  const adicionarResposta = useCallback(async (supportId, texto) => {
    setErro('')
    setMsg('')
    if (!user || !user._id) {
      setErro('Usuário não autenticado.')
      clearStatus()
      return
    }
    if (!supportId) {
      setErro('supportId é obrigatório')
      clearStatus()
      return
    }
    if (!texto || texto.trim() === '') {
      setErro('Resposta vazia')
      clearStatus()
      return
    }

    const id = supportId
    const prevSupports = supports

    // marca loading por item
    setItemLoading(id, true)

    try {
      const res = await api.post('/adicionarRespostaSuportAdmin', { adminId: user._id, supportId: id, resposta: texto })
      if (res?.data?.success) {
        setMsg('Resposta salva')
        // atualiza da fonte de verdade
        try { await fetchSupports({ page }) } catch (e) { console.error('refresh after addResposta', e) }
        // fechar modal e limpar texto
        setDetailItem(null)
        setRespostaTexto('')
        clearStatus()
      } else {
        // rollback
        setSupports(prevSupports)
        setErro(res?.data?.msg || 'Erro ao salvar resposta no servidor')
        clearStatus()
      }

    } catch (err) {
      console.error(err)
      setSupports(prevSupports)
      setErro(err?.message || 'Erro ao chamar API de resposta')
      clearStatus()
    } finally {
      setItemLoading(id, false)
      // atualiza detailItem se estiver aberto
      setDetailItem(prev => prev && prev.supportId === id ? { ...prev, resposta: texto } : prev)
    }
  }, [user, supports, clearStatus, fetchSupports, page])

  // ALTERAR VISIBILIDADE com otimista e rollback
  const alterarVisibilidade = useCallback(async (supportId, novoPrivado) => {
    setErro('')
    setMsg('')
    if (!user || !user._id) {
      setErro('Usuário não autenticado.')
      clearStatus()
      return
    }
    if (!supportId) {
      setErro('supportId é obrigatório')
      clearStatus()
      return
    }

    const id = supportId
    const prevSupports = supports
    // otimista
    // setSupports(prev => prev.map(s => s.supportId === id ? { ...s, privado: !!novoPrivado } : s))
    // setItemLoading(id, true)

    try {
      const res = await api.post('/alterarVisibilidade-by-admin', { adminId: user._id, supportId: id, boolean: !!novoPrivado })
      if (res?.data?.success) {
        setMsg(`Visibilidade atualizada`)
        // re-fetch para garantir consistência
        try { await fetchSupports({ page }) } catch (e) { console.error('refresh after alterarVisibilidade', e) }
        clearStatus()
      } else {
        setSupports(prevSupports)
        setErro(res?.data?.msg || 'Erro ao atualizar visibilidade')
        clearStatus()
      }
    } catch (err) {
      console.error(err)
      setSupports(prevSupports)
      setErro(err?.message || 'Erro ao chamar API de visibilidade')
      clearStatus()
    } finally {
      setItemLoading(id, false)
      setDetailItem(prev => prev && prev.supportId === id ? { ...prev, privado: !!novoPrivado } : prev)
    }
  }, [user, supports, clearStatus, fetchSupports, page])

  if (!isAdmin) return <div className={`p-4 ${theme.bg} ${theme.text}`}><div className="text-red-600">Acesso negado: somente administradores.</div></div>

  return (
    <div className={`p-4 ${theme.bg} ${theme.text}`}>
      {erro !== '' ? <div className="mb-3 text-sm text-red-700">{erro}</div> : null}
      {msg !== '' ? <div className="mb-3 text-sm text-green-600">{msg}</div> : null}

      <button className={`mb-4 px-4 py-2 rounded ${theme.primary} border ${theme.border} hover:bg-indigo-100 hover:dark:bg-indigo-700`} onClick={() => setExpandAll(!expandAll)}>
        {expandAll ? 'Mostrar menos ▲' : 'Mostrar mais ▼'}
      </button>

      {
        expandAll ? (
          <div>
            <div className="mb-4 flex flex-col flex-wrap md:flex-row gap-2 items-center">
              <div className="flex-1 flex gap-2">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar assunto/descrição" className={`px-3 py-2 rounded-md ${theme.cardBg} ${theme.border} w-full`} />
                <button onClick={() => fetchSupports({ page: 1 })} className="px-3 py-2 rounded-md border">Buscar</button>
              </div>

              <div className="flex gap-2 items-center flex-wrap">
                <label className="text-sm">Ordenar por</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-2 py-1 rounded-md">
                  <option className={`text-black`} value="createdAt">Criado</option>
                  <option className={`text-black`} value="assunto">Assunto</option>
                </select>

                <select value={sortDir} onChange={e => setSortDir(e.target.value)} className="px-2 py-1 rounded-md">
                  <option className={`text-black`} value="desc">Desc</option>
                  <option className={`text-black`} value="asc">Asc</option>
                </select>

                {/* FILTRO RESPONDIDO */}
                <label className="text-sm">Status</label>
                <select value={respondedFilter} onChange={e => { setRespondedFilter(e.target.value); setPage(1); /* refetch triggered by useEffect */ }} className="px-2 py-1 rounded-md">
                  <option className={`text-black`} value="all">Todos</option>
                  <option className={`text-black`} value="responded">Respondidos</option>
                  <option className={`text-black`} value="unresponded">Não respondidos</option>
                </select>

                <button onClick={() => downloadCSV(tableRows)} className="px-3 py-2 rounded-md border">Export CSV</button>
              </div>
            </div>

            {/* desktop table */}
            <div className="hidden md:flex md:flex-col">
              <div className={`w-full grid grid-cols-2 lg:grid-cols-3 gap-2`}>
                {supports.map(s => (
                  <div key={s.supportId} className={`col-span-1 ${s.resposta !== null && s.resposta !== '' ? 'bg-green-500/30 border-green-500' : 'bg-red-500/30 border-red-400'} border rounded-2xl p-3 flex justify-between flex-col gap-2`}>
                    <div className="w-full font-medium truncate">Assunto: {s.assunto}</div>
                    <div className="w-full text-sm truncate">Email: {s.userEmail || s.userId?.email}</div>
                    <div className="w-full text-sm">Criado em: {formatDate(s.createdAt || s.criadoEm)}</div>
                    <div className="w-full text-sm">Privado: {String(!!s.privado)}</div>
                    <div className="w-full text-sm overflow-hidden border p-2 rounded-xl">
                      Reposta:
                      {s.resposta ? (<div className={`text-sm ${tema === 'light' ? 'text-gray-500' : 'text-gray-300'} line-clamp-3`}>{s.resposta}</div>) : (<div className="text-sm text-gray-500">—</div>)}
                    </div>
                    <div className="w-full flex flex-col items-start gap-2">
                      <button onClick={() => { setDetailItem(s); setRespostaTexto(s.resposta || ''); }} className="px-2 py-1 rounded-md border text-sm">Ver</button>
                      <button disabled={!!actionLoading[s.supportId]} onClick={() => alterarVisibilidade(s.supportId, !s.privado)} className="px-2 py-1 rounded-md border text-sm">{s.privado ? 'Tornar público' : 'Tornar privado'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* mobile cards */}
            <div className="md:hidden space-y-3">
              {supports.map(s => (
                <div key={s.supportId} className={`${s.resposta !== null && s.resposta !== '' ? 'bg-green-500/30 border-green-500' : 'bg-red-500/30 border-red-400'} p-3 rounded-md border`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-semibold">{s.assunto}</div>
                      <div className={`text-sm ${theme.muted}`}>{(s.descricao || '').slice(0, 140)}{(s.descricao || '').length > 140 ? '...' : ''}</div>
                      <div className="text-xs text-gray-500 mt-1">{s.userEmail || s.userId?.email} • {formatDate(s.createdAt || s.criadoEm)}</div>
                      <div className="w-full mt-2 text-sm overflow-hidden border p-2 rounded-xl">
                        Reposta:
                        {s.resposta ? (<div className={`text-sm ${tema === 'light' ? 'text-gray-500' : 'text-gray-300'} line-clamp-3`}>{s.resposta}</div>) : (<div className="text-sm text-gray-500">—</div>)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => { setDetailItem(s); setRespostaTexto(s.resposta || ''); }} className="px-2 py-1 rounded-md border text-sm">Ver</button>
                      <button disabled={!!actionLoading[s.supportId]} onClick={() => alterarVisibilidade(s.supportId, !s.privado)} className="px-2 py-1 rounded-md border text-sm">{s.privado ? 'Tornar público' : 'Tornar privado'}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* detalhes modal simples */}
            {detailItem && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className={`max-w-3xl w-full p-4 rounded-md ${theme.cardBg} ${theme.text}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold">Detalhes</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setDetailItem(null)} className="px-2 py-1 rounded-md border">Fechar</button>
                      <button disabled={!!actionLoading[detailItem.supportId]} onClick={() => alterarVisibilidade(detailItem.supportId, !detailItem.privado)} className="px-2 py-1 rounded-md border">{detailItem.privado ? 'Tornar público' : 'Tornar privado'}</button>
                    </div>
                  </div>
                  <div className="mt-3 text-sm">
                    <div><strong>Assunto:</strong> {detailItem.assunto}</div>
                    <div className="mt-2"><strong>Descrição:</strong>
                      <div className="mt-1 whitespace-pre-wrap">{detailItem.descricao}</div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-black/5 rounded">Email: {detailItem.userEmail || detailItem.userId?.email}</div>
                      <div className="p-2 bg-black/5 rounded">CreatedAt: {formatDate(detailItem.createdAt || detailItem.criadoEm)}</div>
                      <div className="p-2 bg-black/5 rounded">Privado: {String(!!detailItem.privado)}</div>
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer">Objeto completo</summary>
                      <pre className="mt-2 max-h-64 overflow-auto text-xs p-2 rounded bg-black/5">{JSON.stringify(detailItem, null, 2)}</pre>
                    </details>

                    {/* Adicionar / editar resposta */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium mb-1">Resposta do admin</label>
                      <textarea value={respostaTexto} onChange={e => setRespostaTexto(e.target.value)} rows={6} className="w-full p-2 border rounded-md" placeholder="Escreva aqui sua resposta..." />
                      <div className="flex gap-2 mt-2">
                        <button disabled={!!actionLoading[detailItem.supportId]} onClick={() => { adicionarResposta(detailItem.supportId, respostaTexto); }} className={`${!!actionLoading[detailItem.supportId] ? 'bg-gray-500' : 'bg-green-600'} px-4 py-2 rounded-md text-white `}>Salvar resposta</button>
                        <button onClick={() => { setRespostaTexto(''); }} className="px-4 py-2 rounded-md border">Limpar</button>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}
            {/* paginação */}
            <div className="mt-4 flex items-center justify-between flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button disabled={page === 1} onClick={() => { setPage(1); fetchSupports({ page: 1 }) }} className="px-3 py-1 rounded-md border">First</button>
                <button disabled={page === 1} onClick={() => { const np = Math.max(1, page - 1); setPage(np); fetchSupports({ page: np }) }} className="px-3 py-1 rounded-md border">Prev</button>
                <div className="px-3">{page} / {totalPages}</div>
                <button disabled={page === totalPages} onClick={() => { const np = Math.min(totalPages, page + 1); setPage(np); fetchSupports({ page: np }) }} className="px-3 py-1 rounded-md border">Next</button>
                <button disabled={page === totalPages} onClick={() => { setPage(totalPages); fetchSupports({ page: totalPages }) }} className="px-3 py-1 rounded-md border">Last</button>
              </div>

              <div className="text-sm text-gray-600">Total: {total}</div>
            </div>
          </div>
        ) : (<p>Não expandido</p>)
      }




    </div>
  )
}

/*
Fallback cliente (caso seu backend NÃO aceite o param `responded`):
- Você pode filtrar `supports` localmente antes de renderizar e ajustar paginação local.
- Exemplo simples (não implementado por padrão pois o componente assume paginação no servidor):

const visibleSupports = useMemo(() => {
  if (respondedFilter === 'all') return supports
  const isResponded = (s) => !!s.resposta && String(s.resposta).trim() !== ''
  return supports.filter(s => respondedFilter === 'responded' ? isResponded(s) : !isResponded(s))
}, [supports, respondedFilter])

// e então renderizar `visibleSupports` em vez de `supports` e ajustar `total` com `visibleSupports.length`.
*/
