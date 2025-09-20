import React, { useEffect, useMemo, useState } from 'react'
import api from '../../../../Api'
import { getBrazilDate } from '../../../../../helpers/getBrazilDate.js'

export default function AdminUsuarios({ tema, user }) {
  const [usuarios, setUsuarios] = useState([])
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [mostrar, setMostrar] = useState(false)

  // Paginação
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  // Filtros
  const [filterPlan, setFilterPlan] = useState('all') // all, free, pro, max, coach
  const [filterStatus, setFilterStatus] = useState('all') // all, ativo, inativo
  const [q, setQ] = useState('') // pesquisa

  // Ordenação
  const [sortBy, setSortBy] = useState('none') // none, tokens_desc, tokens_asc

  const fetchUsuarios = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await api.post('/usuarios', { adminId: user._id }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data?.users) setUsuarios(res.data.users)
      if (res.data?.msg) setMsg(res.data.msg)
      if (res.data?.erro) setErro(res.data.erro)

      setTimeout(() => { setMsg(''); setErro('') }, 3000)
    } catch (error) {
      console.error(error)
      setErro('Erro ao buscar usuários. Tente novamente mais tarde.')
      setTimeout(() => { setMsg(''); setErro('') }, 3000)
    }
  }

  useEffect(() => {
    fetchUsuarios()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Enriquecer com tokens calculados
  const enrichedUsers = useMemo(() => {
    const now = new Date(getBrazilDate())
    return usuarios.map(u => {
      const tokensArr = Array.isArray(u?.stats?.tokens) ? u.stats.tokens : []
      const tokensTotal = tokensArr.reduce((s, t) => s + (Number(t?.value) || 0), 0)
      const tokensToday = tokensArr.reduce((s, t) => {
        try {
          const d = new Date(t?.data)
          if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
            return s + (Number(t?.value) || 0)
          }
        } catch (e) { }
        return s
      }, 0)
      return { ...u, __tokensTotal: tokensTotal, __tokensToday: tokensToday }
    })
  }, [usuarios])

  // Lista filtrada e ordenada
  const filteredUsers = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = enrichedUsers.filter(u => {
      const planType = (u?.planInfos?.planType || '').toLowerCase()
      const status = (u?.planInfos?.status || '').toLowerCase()

      if (filterPlan !== 'all' && planType !== filterPlan) return false
      if (filterStatus !== 'all' && status !== filterStatus) return false

      if (!term) return true

      const fields = [u.name, u.username, u.email, planType, status]
      return fields.some(f => (f || '').toString().toLowerCase().includes(term))
    })

    if (sortBy === 'tokens_desc') {
      list.sort((a, b) => (b.__tokensTotal || 0) - (a.__tokensTotal || 0))
    } else if (sortBy === 'tokens_asc') {
      list.sort((a, b) => (a.__tokensTotal || 0) - (b.__tokensTotal || 0))
    }

    return list
  }, [enrichedUsers, filterPlan, filterStatus, q, sortBy])

  // Atualiza pagina quando filtros/perPage mudam
  useEffect(() => {
    setCurrentPage(1)
  }, [filteredUsers.length, perPage])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredUsers.length / perPage))
  }, [filteredUsers.length, perPage])

  const pagedUsuarios = useMemo(() => {
    const start = (currentPage - 1) * perPage
    return filteredUsers.slice(start, start + perPage)
  }, [filteredUsers, currentPage, perPage])

  const gotoPage = (n) => {
    const page = Math.min(Math.max(1, n), totalPages)
    setCurrentPage(page)
  }

  const clearFilters = () => {
    setFilterPlan('all')
    setFilterStatus('all')
    setQ('')
    setSortBy('none')
  }

  return (
    <div>
      {erro !== '' && <p className='text-white bg-red-800 p-3 rounded-2xl fixed right-2 top-2'>{erro}</p>}
      {msg !== '' && <p className='text-white bg-green-500 p-3 rounded-2xl fixed right-2 top-2'>{msg}</p>}

      <div className='flex items-center gap-2 mb-4'>
        <button
          onClick={() => setMostrar(!mostrar)}
          className={`px-4 py-2 rounded-md ${tema === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'} transition`}
        >
          {mostrar ? 'Ocultar Usuários' : 'Mostrar Usuários'}
        </button>

        <div className='ml-auto flex items-center gap-2'>
          <label className='text-sm'>Por página:</label>
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} className='rounded-md p-1'>
            <option className={`text-black`} value={5}>5</option>
            <option className={`text-black`} value={10}>10</option>
            <option className={`text-black`} value={20}>20</option>
            <option className={`text-black`} value={50}>50</option>
          </select>
        </div>
      </div>

      {mostrar && (
        <div>
          <div className='mb-3 flex-wrap gap-3 items-center'>
            <div className='flex items-center gap-2 flex-wrap'>
              <label className='text-sm'>Plano:</label>
              <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} className='rounded-md p-1'>
                <option className={`text-black`} value='all'>Todos</option>
                <option className={`text-black`} value='free'>Free</option>
                <option className={`text-black`} value='pro'>Pro</option>
                <option className={`text-black`} value='max'>Max</option>
                <option className={`text-black`} value='coach'>Coach</option>
              </select>
            </div>

            <div className='flex items-center gap-2'>
              <label className='text-sm'>Status:</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className='rounded-md p-1'>
                <option className={`text-black`} value='all'>Todos</option>
                <option className={`text-black`} value='ativo'>Ativo</option>
                <option className={`text-black`} value='inativo'>Inativo</option>
              </select>
            </div>

            <div className='flex items-center gap-2 flex-wrap'>
              <input type='text' placeholder='Pesquisar nome, username, email, plano...' value={q}
                onChange={e => setQ(e.target.value)} className='p-1 rounded-md border w-full md:w-2/3' />
              <button onClick={clearFilters} className='px-3 py-1 rounded-md border'>Limpar</button>
            </div>

            <div className='flex items-center gap-2'>
              <label className='text-sm'>Ordenar:</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className='rounded-md p-1'>
                <option className={`text-black`} value='none'>Nenhuma</option>
                <option className={`text-black`} value='tokens_desc'>Mais tokens</option>
                <option className={`text-black`} value='tokens_asc'>Menos tokens</option>
              </select>
            </div>
          </div>

          <div className='mb-2 text-sm'>Total de usuários: {filteredUsers.length} (de {usuarios.length}) | Página {currentPage} de {totalPages}</div>

          {filteredUsers.length === 0 ? (
            <p>Nenhum usuário encontrado.</p>
          ) : (
            <div>
              {pagedUsuarios.map((u) => (
                <div key={u._id} className={`${tema === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-gray-100 text-gray-900'} p-4 mb-2 rounded-lg border`}>
                  <div className='flex justify-between flex-wrap items-start'>
                    <div>
                      <p>Nome: {u.name}</p>
                      <p>Username: {u.username}</p>
                      <p>Email: {u.email}</p>
                      <p>Role: {u.role}</p>
                    </div>

                    <div className=' text-sm'>
                      <div className='mb-1'>Tokens hoje: <b>{u.__tokensToday}</b></div>
                      <div>Tokens totais: <b>{u.__tokensTotal}</b></div>
                    </div>
                  </div>

                  <div className={`${(u?.planInfos?.status === 'ativo') ? 'bg-green-400/30 border-green-400' : 'bg-red-400/30 border-red-400'} border p-2 my-2 rounded-md`}>
                    <b>PlanInfos</b>
                    <p>PlanType: <span className='uppercase'>{u?.planInfos?.planType || 'N/A'}</span></p>
                    <p>Status: <span className='uppercase'>{u?.planInfos?.status || 'N/A'}</span></p>
                  </div>

                </div>
              ))}

              {/* Controles de paginação */}
              <div className='flex items-center flex-wrap gap-2 mt-4'>
                <button onClick={() => gotoPage(currentPage - 1)} disabled={currentPage === 1}
                  className='px-3 py-1 rounded-md border disabled:opacity-50'>Anterior</button>

                <div className='flex items-center gap-1'>
                  {(() => {
                    const range = []
                    const maxButtons = 7
                    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2))
                    let end = start + maxButtons - 1
                    if (end > totalPages) {
                      end = totalPages
                      start = Math.max(1, end - maxButtons + 1)
                    }
                    for (let i = start; i <= end; i++) range.push(i)
                    return range.map(p => (
                      <button key={p} onClick={() => gotoPage(p)}
                        className={`px-3 py-1 rounded-md border ${p === currentPage ? 'font-bold' : ''}`}>
                        {p}
                      </button>
                    ))
                  })()}
                </div>

                <button onClick={() => gotoPage(currentPage + 1)} disabled={currentPage === totalPages}
                  className='px-3 py-1 rounded-md border disabled:opacity-50'>Próxima</button>

                <div className='ml-auto text-sm'>
                  Ir para página:
                  <input type='number' min={1} max={totalPages} value={currentPage}
                    onChange={e => gotoPage(Number(e.target.value || 1))}
                    className='w-16 ml-2 p-1 rounded-md border' />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
