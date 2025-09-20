import React, { useEffect, useMemo, useState } from 'react'
import api from '../../../../Api'

// AdminAnuncios (atualizado)
// - Preview de mídia mais responsivo (container com proporção 16:9)
// - Ordenação também por estatísticas (impressoes / cliques)
// - Estilização diferenciada para status (ativo / inativo)
// - Botão global "Mostrar mais / Mostrar menos" que envolve tudo + toggles por card
// - Mantém filtros, paginação e ordenação já implementados

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
  if (typeof tema === 'string') {
    return tema === 'dark' ? darkTheme : fallbackTheme
  }
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
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch (e) {
    return iso
  }
}

export default function AdminAnuncios({ tema, user }) {
  const theme = getTheme(tema)

  const [anuncios, setAnuncios] = useState([])
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  // filtros & ordenação & paginação
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [stateFilter, setStateFilter] = useState('todos')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [sortField, setSortField] = useState('criadoEm')
  const [sortDir, setSortDir] = useState('desc')

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(5)

  // controles de expand/collapse
  const [expandAll, setExpandAll] = useState(false)
  const [expandedMap, setExpandedMap] = useState({}) // { [id]: true }

  const fetchAnuncios = async () => {
    try {
      const res = await api.post('/anuncios-by-admin', { adminId: user?._id })
      if (res.data && res.data.success) {
        setAnuncios(res.data.anuncios || [])
      } else {
        setErro(res.data?.msg || 'Erro ao buscar anúncios')
      }
    } catch (error) {
      console.error(error)
      setErro(error?.message || 'Erro na requisição')
    }
  }

  useEffect(() => { fetchAnuncios() }, [])

  const statesList = useMemo(() => {
    const s = new Set()
    anuncios.forEach(a => a.state && s.add(a.state))
    return Array.from(s).sort()
  }, [anuncios])

  const tiposList = useMemo(() => {
    const s = new Set()
    anuncios.forEach(a => a.anuncioTipo && s.add(a.anuncioTipo))
    return Array.from(s).sort()
  }, [anuncios])

  // processed: search + filters + sorting
  const processed = useMemo(() => {
    let arr = [...anuncios]
    // search
    if (search.trim() !== '') {
      const q = search.trim().toLowerCase()
      arr = arr.filter(a => (
        (a.titulo || '').toLowerCase().includes(q) ||
        (a.descricao || '').toLowerCase().includes(q) ||
        (a.link || '').toLowerCase().includes(q) ||
        (a.anuncioId || '').toLowerCase().includes(q)
      ))
    }
    // status filter
    if (statusFilter !== 'todos') arr = arr.filter(a => (a.status || '').toLowerCase() === statusFilter.toLowerCase())
    // state filter
    if (stateFilter !== 'todos') arr = arr.filter(a => (a.state || '') === stateFilter)
    // tipo filter
    if (tipoFilter !== 'todos') arr = arr.filter(a => (a.anuncioTipo || '') === tipoFilter)

    // sorting
    arr.sort((x, y) => {
      // support nested estatisticas.impressoes or estatisticas.cliques
      const getVal = (obj, field) => {
        if (!obj) return ''
        if (field.startsWith('estatisticas')) {
          const k = field.split('.')[1]
          return Number(obj.estatisticas?.[k] ?? 0)
        }
        if (field === 'criadoEm' || field === 'createdAt' || field === 'updatedAt') {
          return obj[field] ? new Date(obj[field]).getTime() : 0
        }
        return (obj[field] || '').toString().toLowerCase()
      }

      const a = getVal(x, sortField)
      const b = getVal(y, sortField)

      if (typeof a === 'number' && typeof b === 'number') {
        return sortDir === 'asc' ? a - b : b - a
      }
      if (a < b) return sortDir === 'asc' ? -1 : 1
      if (a > b) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return arr
  }, [anuncios, search, statusFilter, stateFilter, tipoFilter, sortField, sortDir])

  // pagination
  const total = processed.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * perPage
    return processed.slice(start, start + perPage)
  }, [processed, page, perPage])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('todos')
    setStateFilter('todos')
    setTipoFilter('todos')
    setSortField('criadoEm')
    setSortDir('desc')
    setPage(1)
  }

  const toggleExpand = (id) => {
    setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleToggleAll = () => {
    const next = !expandAll
    setExpandAll(next)
    // // sync expandedMap only when collapsing (to keep manual per-card toggles when expanding we set all true)
    // if (next) {
    //   const map = {}
    //     (processed || []).forEach(a => { map[a._id] = true })
    //   setExpandedMap(map)
    // } else {
    //   setExpandedMap({})
    // }
  }

  const alterarStatusAnuncio = async (anuncioId, novoStatus) => {
    if (!user || !user._id) {
      setErro('Usuario nao autentificado.')
      setTimeout(() => setErro(''), 5000)
      return
    }

    if (!novoStatus || (novoStatus !== 'ativo' && novoStatus !== 'inativo')) {
      setErro('Status inválido. Use "ativo" ou "inativo".')
      setTimeout(() => setErro(''), 5000)
      return
    }

    if (!anuncioId) {
      setErro('anuncioId é obrigatório.')
      setTimeout(() => setErro(''), 5000)
      return
    }

    const ok = window.confirm(`Tem certeza que deseja alterar o status do anúncio ${anuncioId} para "${novoStatus}"?`)
    if (!ok) {
      setErro('Você decidiu não trocar o status')
      setTimeout(() => setErro(''), 5000)
      return
    }

    try {
      const res = await api.post('/alterar-status-anuncio', { adminId: user._id, anuncioId, novoStatus })
      if (res.data && res.data.success) {
        setMsg(res.data.msg || 'Status do anúncio alterado com sucesso.')
        setTimeout(() => setMsg(''), 5000)
        // atualizar lista
        fetchAnuncios()
      } else {
        setErro(res.data?.msg || 'Erro ao alterar status do anúncio.')
        setTimeout(() => setErro(''), 5000)
      }
    } catch (error) {
      setErro(error?.msg || 'Erro na requisição')
    }
  }


  return (
    <div className={`p-4 ${theme.bg} ${theme.text}`}>
      {/* mensagens */}
      {erro && <div className="fixed right-4 top-4 z-50"><div className="px-4 py-2 rounded-lg bg-red-700 text-white">{erro}</div></div>}
      {msg && <div className="fixed right-4 top-20 z-50"><div className="px-4 py-2 rounded-lg bg-green-600 text-white">{msg}</div></div>}

      <button className={`mb-4 px-4 py-2 rounded ${theme.primary} border ${theme.border} hover:bg-indigo-100 hover:dark:bg-indigo-700`} onClick={handleToggleAll}>
        {expandAll ? 'Mostrar menos ▲' : 'Mostrar mais ▼'}
      </button>

      {
        expandAll ? (
          <div>
            <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex gap-2 items-center">
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Pesquisar título, descrição, id..." className={`px-3 py-2 rounded-lg shadow-sm ${theme.cardBg} ${theme.text} ${theme.border}`} />
                <button onClick={clearFilters} className="px-3 py-2 rounded-lg border ml-1">Limpar</button>
              </div>

              <div className="flex gap-2 flex-wrap items-center">
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} className="px-2 py-2 rounded-md">
                  <option className={`text-black`} value="todos">Todos os status</option>
                  <option className={`text-black`} value="ativo">Ativo</option>
                  <option className={`text-black`} value="inativo">Inativo</option>
                </select>

                <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(1) }} className="px-2 py-2 rounded-md">
                  <option className={`text-black`} value="todos">Todos os estados</option>
                  {statesList.map(s => <option className={`text-black`} key={s} value={s}>{s}</option>)}
                </select>

                <select value={tipoFilter} onChange={e => { setTipoFilter(e.target.value); setPage(1) }} className="px-2 py-2 rounded-md">
                  <option className={`text-black`} value="todos">Todos os tipos</option>
                  {tiposList.map(t => <option className={`text-black`} key={t} value={t}>{t}</option>)}
                </select>

                <select value={sortField} onChange={e => setSortField(e.target.value)} className="px-2 py-2 rounded-md">
                  <option className={`text-black`} value="criadoEm">Ordenar por: criadoEm</option>
                  <option className={`text-black`} value="titulo">Ordenar por: título</option>
                  <option className={`text-black`} value="status">Ordenar por: status</option>
                  <option className={`text-black`} value="createdAt">Ordenar por: createdAt</option>
                  <option className={`text-black`} value="estatisticas.impressoes">Ordenar por: impressoes</option>
                  <option className={`text-black`} value="estatisticas.cliques">Ordenar por: cliques</option>
                </select>

                <select value={sortDir} onChange={e => setSortDir(e.target.value)} className="px-2 py-2 rounded-md">
                  <option className={`text-black`} value="desc">Desc</option>
                  <option className={`text-black`} value="asc">Asc</option>
                </select>

              </div>
            </div>

            <div className="mb-3 text-sm">Mostrando <strong>{pageItems.length}</strong> de <strong>{total}</strong> anúncios — página {page} / {totalPages}</div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {pageItems.map(a => {
                const ativo = (a.status || '').toLowerCase() === 'ativo'
                const mediaUrl = a.midiaUrl || null
                return (
                  <div key={a._id} className={`p-4 rounded-2xl shadow ${theme.cardBg} border ${theme.border} transition-all duration-200 ${ativo ? 'ring-2 ring-green-300' : 'opacity-80 ring-1 ring-gray-500/20'}`}>
                    <div className="mb-3 flex flex-col gap-4">
                      <div className="relative flex items-center justify-center mb-3">
                        {a.anuncioTipo === 'video' && mediaUrl ? (
                          <video src={mediaUrl} controls className="h-full w-full object-cover" />
                        ) : a.anuncioTipo === 'imagem' && mediaUrl ? (
                          <img src={mediaUrl} alt={a.titulo} className="h-full w-full object-cover" />
                        ) : (
                          <div className="text-sm text-gray-500">Sem mídia</div>
                        )}
                      </div>

                      <div className="flex flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h3 className={`text-lg font-semibold ${theme.text}`}>{a.titulo || '—'}</h3>
                            <p className={`text-sm ${theme.muted} line-clamp-2`}>{a.descricao || '—'}</p>
                            <a href={a.link} target="_blank" rel="noreferrer" className="block truncate text-xs mt-2 underline">{a.link}</a>
                          </div>

                          <div className="text-right text-xs">
                            <div className="mb-1">
                              <span className="font-medium">Status:</span>
                              <span className={`ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{a.status}</span>
                            </div>
                            <div className="mb-1"><span className="font-medium">Tipo:</span> {a.anuncioTipo || '—'}</div>
                            <div className="mb-1"><span className="font-medium">Impressoes:</span> {a.estatisticas?.impressoes ?? 0}</div>
                            <div className="mb-1"><span className="font-medium">Cliques:</span> {a.estatisticas?.cliques ?? 0}</div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className='col-span-2 bg-gray-500/10 p-2 rounded-md'>
                            <div><span className="font-medium">anuncioId:</span> <code className="break-all">{a.anuncioId}</code></div>
                            <div><span className="font-medium">userId:</span>{a.userId}</div>
                            <div><span className="font-medium">País:</span> {a.country} ({a.countryCode})</div>
                            <div><span className="font-medium">Estado:</span> {a.state || '-'}</div>
                            <div><span className="font-medium">Cidade:</span> {a.city ?? '-'}</div>
                          </div>

                          <div className='col-span-2 bg-gray-400/10 p-2 rounded-md'>
                            <div><span className="font-medium">criadoEm:</span> {formatDate(a.criadoEm)}</div>
                            <div><span className="font-medium">createdAt:</span> {formatDate(a.createdAt)}</div>
                            <div><span className="font-medium">updatedAt:</span> {formatDate(a.updatedAt)}</div>
                            <div className="mt-2"><span className="font-medium">reports:</span>
                              {Array.isArray(a.reports) && a.reports.length > 0 ? (
                                <ul className="list-disc ml-5">
                                  {a.reports.map((r, i) => <li key={i} className="text-xs">{JSON.stringify(r)}</li>)}
                                </ul>
                              ) : <div className={"text-xs " + theme.muted}>nenhum report</div>}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <button
                            onClick={a.status == 'ativo' ? () => {
                              console.log('Desativar anuncio', a.anuncioId)
                              alterarStatusAnuncio(a.anuncioId, 'inativo')
                            } : () => {
                              console.log('Ativar anuncio', a.anuncioId)
                              alterarStatusAnuncio(a.anuncioId, 'ativo')
                            }}
                            className={`${a.status == 'ativo' ? 'bg-red-500/40 border-red-500 text-white p-3' : 'bg-green-500/40 border-green-500 text-white p-3'} border rounded-xl`}>{a.status == 'ativo' ? 'Desativar anuncio' : 'Ativar anuncio'}</button>
                        </div>


                        {/* conteúdo expandido */}
                        <div className="mt-3 text-xs">
                          <details className="mt-2 text-xs">
                            <summary className="cursor-pointer">Objeto completo (JSON)</summary>
                            <pre className="mt-2 overflow-auto text-xs p-2 rounded-md bg-black/10">{JSON.stringify(a, null, 2)}</pre>
                          </details>
                        </div>

                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* paginação */}
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} className="px-3 py-1 rounded-md border">Anterior</button>
                <div className="px-3">{page} / {totalPages}</div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded-md border">Próxima</button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm">Itens / página:</label>
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }} className="px-2 py-1 rounded-md">
                  <option className={`text-black`} value={5}>5</option>
                  <option className={`text-black`} value={10}>10</option>
                  <option className={`text-black`} value={20}>20</option>
                  <option className={`text-black`} value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
        ) : (<p>Não expandido</p>)
      }

    </div>
  )
}
