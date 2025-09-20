import React, { useEffect, useMemo, useState } from 'react'
import api from '../../../Api'

// SupportPage
// Props: tema (string 'dark'|'light' or object de classes Tailwind), user (objeto com _id e email)
// Funcionalidades:
// - busca paginada de supports via GET /supports (query: page, perPage, search)
// - cria novo pedido de suporte via POST /supports
// - usa props tema para cores/fallbacks

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

export default function SupportPage({ tema, user }) {
  const theme = getTheme(tema)

  const [supports, setSupports] = useState([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  // busca/pagination
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [total, setTotal] = useState(0)

  // form support
  const [assunto, setAssunto] = useState('')
  const [descricao, setDescricao] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchSupports = async (opts = {}) => {
    try {
      setLoading(true)
      setErro('')
      const p = opts.page ?? page
      const pp = opts.perPage ?? perPage
      const s = opts.search ?? search
      const res = await api.get('/supports', { params: { page: p, perPage: pp, search: s } })
      if (res?.data?.success) {
        setSupports(res.data.supports || [])
        setTotal(res.data.pagination?.total ?? (res.data.supports || []).length)
        // sync pagination if caller provided different page/perPage
        if (opts.page) setPage(p)
        if (opts.perPage) setPerPage(pp)
      } else {
        setErro(res?.data?.msg || 'Erro ao buscar supports')
      }
    } catch (error) {
      console.error(error)
      setErro(error?.message || 'Erro de requisição')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSupports() }, [])

  // handle create support
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!assunto || !descricao) return setErro('Assunto e descrição são obrigatórios')
    if (!user || !user._id || !user.email) return setErro('Usuário inválido')

    try {
      setSubmitting(true)
      setErro('')
      const payload = { userId: user._id, userEmail: user.email, assunto, descricao }
      const res = await api.post('/supports', payload)
      if (res?.data?.success) {
        setMsg('Suporte enviado com sucesso')
        setAssunto('')
        setDescricao('')
        // recarrega a primeira página (públicos)
        fetchSupports({ page: 1 })
      } else {
        setErro(res?.data?.msg || 'Erro ao enviar suporte')
      }
    } catch (error) {
      console.error(error)
      setErro(error?.message || 'Erro ao enviar suporte')
    } finally {
      setSubmitting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className={`p-4 ${theme.bg} ${theme.text}`}>
      {erro && <div className="mb-3 text-sm text-red-700">{erro}</div>}
      {msg && <div className="mb-3 text-sm text-green-600">{msg}</div>}

      {/* formulário de novo suporte */}
      <form onSubmit={handleSubmit} className={`mb-6 p-4 rounded-lg ${theme.cardBg} ${theme.border}`}>
        <h3 className="text-lg font-semibold mb-2">Abrir novo pedido de suporte</h3>
        <div className="mb-2">
          <label className="block text-sm mb-1">Seu email</label>
          <input className="w-full px-3 py-2 rounded-md border" value={user?.email || ''} readOnly />
        </div>
        <div className="mb-2">
          <label className="block text-sm mb-1">Assunto</label>
          <input className="w-full px-3 py-2 rounded-md border" value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Ex: Erro no pagamento" />
        </div>
        <div className="mb-2">
          <label className="block text-sm mb-1">Descrição</label>
          <textarea className="w-full px-3 py-2 rounded-md border" value={descricao} onChange={e => setDescricao(e.target.value)} rows={4} placeholder="Descreva o problema..." />
        </div>
        <div className="flex gap-2">
          <button disabled={submitting} className="px-4 py-2 rounded-md bg-blue-600 text-white">{submitting ? 'Enviando...' : 'Enviar suporte'}</button>
          <button type="button" onClick={() => { setAssunto(''); setDescricao(''); }} className="px-4 py-2 rounded-md border">Limpar</button>
        </div>
      </form>

      {/* busca e paginação */}
      <div className="mb-4 flex flex-col md:flex-row gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar assunto/descrição" className={`px-3 py-2 rounded-md ${theme.cardBg} ${theme.border} flex-1`} />
        <button onClick={() => fetchSupports({ page: 1 })} className="px-3 py-2 rounded-md border">Buscar</button>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm">Itens / página</label>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); fetchSupports({ perPage: Number(e.target.value), page: 1 }) }} className="px-2 py-1 rounded-md">
            {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* lista de supports */}
      {loading ? (
        <div className="p-6 text-center text-sm text-gray-500">Carregando...</div>
      ) : (
        <div className="space-y-4">
          {supports.map(s => (
            <div key={s._id} className={`p-3 rounded-lg ${theme.cardBg} ${theme.border}`}>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-semibold">{s.assunto}</h4>
                  <p className={`text-sm ${theme.muted} mt-1`}>{s.descricao}</p>
                  <div className="text-xs mt-2 text-gray-500">Resposta: {s.resposta ? s.resposta : '-'} • {formatDate(s.respondidoEm)}</div>
                </div>
                <details className="w-full md:w-1/3 mt-2 md:mt-0">
                  <summary className="cursor-pointer text-sm underline">Mostrar objeto</summary>
                  <pre className="mt-2 max-h-44 overflow-auto text-xs p-2 rounded-md bg-black/5">{JSON.stringify(s, null, 2)}</pre>
                </details>
              </div>
            </div>
          ))}

          {supports.length === 0 && <div className="p-6 text-center text-sm text-gray-500">Nenhum pedido de suporte público encontrado.</div>}
        </div>
      )}

      {/* paginação */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button disabled={page===1} onClick={() => { setPage(1); fetchSupports({ page: 1 }) }} className="px-3 py-1 rounded-md border">First</button>
          <button disabled={page===1} onClick={() => { const np = Math.max(1, page-1); setPage(np); fetchSupports({ page: np }) }} className="px-3 py-1 rounded-md border">Prev</button>
          <div className="px-3">{page} / {totalPages}</div>
          <button disabled={page===totalPages} onClick={() => { const np = Math.min(totalPages, page+1); setPage(np); fetchSupports({ page: np }) }} className="px-3 py-1 rounded-md border">Next</button>
          <button disabled={page===totalPages} onClick={() => { setPage(totalPages); fetchSupports({ page: totalPages }) }} className="px-3 py-1 rounded-md border">Last</button>
        </div>

        <div className="text-sm text-gray-600">Total: {total}</div>
      </div>
    </div>
  )
}
