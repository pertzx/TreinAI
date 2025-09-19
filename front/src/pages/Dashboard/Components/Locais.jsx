import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import api from '../../../Api'
import locationsRaw from '../../../data/locations.json'

// Componente Locais — exibe 2 colunas:
//  - Visualizar Meus Locais (com botão cancelar assinatura / deletar local / editar)
//  - Adicionar Local (form)
// Requisito: antes de publicar TODOS os valores do formulário são obrigatórios

const useMock = false // mude para `true` para testar sem backend

const initialForm = {
  localId: null,
  localName: '',
  localDescricao: '',
  link: '',
  localType: 'outros',
  country: '',
  countryCode: '',
  state: '',
  city: '',
  // form.image pode ser um File (arquivo novo) ou uma string (imageUrl existente)
  image: null,
}

const tiposPermitidos = [
  'clinica-de-fisioterapia',
  'academia',
  'consultorio-de-nutricionista',
  'loja',
  'outros'
]

const Locais = ({ user = {}, tema = 'light' }) => {
  const [meusLocais, setMeusLocais] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [editing, setEditing] = useState(false)
  // quando abrimos para editar, por padrão vamos SALVAR COMO NOVO para evitar sobrescrever o original
  const [saveAsNew, setSaveAsNew] = useState(false)
  const [editingSourceId, setEditingSourceId] = useState(null)

  // controlamos se o usuário quer substituir a imagem existente (apenas para edição)
  const [replaceImage, setReplaceImage] = useState(false)

  // preview da imagem: pode ser uma URL remota (local.imageUrl) ou um blob criado por createObjectURL
  const [imagePreview, setImagePreview] = useState(null)

  const fileInputRef = useRef(null)

  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // lista de países do JSON
  const countries = useMemo(() => (locationsRaw?.countries || []), [])

  // estados baseados no country selecionado
  const states = useMemo(() => {
    if (!form.country) return []
    const byCountry = locationsRaw?.byCountry?.[form.country]
    return byCountry?.states || []
  }, [form.country])

  // cidades baseadas no state selecionado
  const cities = useMemo(() => {
    if (!form.country || !form.state) return []
    const citiesByState = locationsRaw?.byCountry?.[form.country]?.citiesByState || {}
    return citiesByState[form.state] || []
  }, [form.country, form.state])

  useEffect(() => {
    fetchMeusLocais()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // cleanup de object URLs para evitar vazamento de memória
  useEffect(() => {
    return () => {
      if (imagePreview && typeof imagePreview === 'string' && imagePreview.startsWith('blob:')) {
        try { URL.revokeObjectURL(imagePreview) } catch (e) { /* ignore */ }
      }
    }
  }, [imagePreview])

  // ------------------ helpers de mock ------------------
  const simulateDelay = (ms = 700) => new Promise(res => setTimeout(res, ms))

  const fetchMeusLocais = async () => {
    setLoading(true)
    setError(null)
    try {
      if (useMock) {
        await simulateDelay()
        const mock = (window.__MOCK_LOCAIS__ = window.__MOCK_LOCAIS__ || [
          {
            localId: 'mock-1',
            localName: 'Academia Central',
            localType: 'academia',
            status: 'active',
            subscriptionId: 'sub_mock_1',
            link: 'https://example.com/academia',
            country: 'Brazil',
            countryCode: 'BR',
            state: 'São Paulo',
            city: 'São Paulo',
            imageUrl: null,
            estatisticas: { impressoes: 1200, cliques: 85 },
            userId: user?.id || user?._id || 'user-mock'
          }
        ])
        const uid = user?.id || user?._id
        setMeusLocais(uid ? mock.filter(l => l.userId === uid) : mock)
      } else {
        const res = await api.get('/locais', { params: { userId: user?.id || user?._id } })
        const payload = res.data
        if (payload && typeof payload === 'object') {
          if (payload.success && payload.data && Array.isArray(payload.data.items)) {
            setMeusLocais(payload.data.items)
          } else if (Array.isArray(payload.items)) {
            setMeusLocais(payload.items)
          } else if (Array.isArray(payload)) {
            setMeusLocais(payload)
          } else {
            setMeusLocais([])
          }
        } else {
          setMeusLocais([])
        }
      }
    } catch (err) {
      console.error(err)
      setError('Erro ao carregar seus locais')
      setMeusLocais([])
    } finally {
      setLoading(false)
    }
  }

  // ------------------ deletar / cancelar ------------------
  const handleDeletarLocal = async (localId) => {
    const ok = window.confirm('Tem certeza que deseja deletar este local? A ação é irreversível.')
    if (!ok) return
    try {
      const before = meusLocais
      setMeusLocais(prev => prev.filter(l => l.localId !== localId))
      if (useMock) {
        await simulateDelay()
        window.__MOCK_LOCAIS__ = (window.__MOCK_LOCAIS__ || []).filter(l => l.localId !== localId)
      } else {
        await api.post('/deletar-local', { localId, userId: user?.id || user?._id })
      }
    } catch (err) {
      console.error(err)
      setError('Não foi possível deletar o local.')
      fetchMeusLocais()
    }
  }

  // ------------------ adicionar / editar local ------------------
  const openForEdit = (local) => {
    // preenche o formulário com os dados do local selecionado
    // form.image recebe a imageUrl (string) — não tentamos preencher o <input type="file" /> porque não é permitido
    setForm({
      localId: saveAsNew ? null : (local.localId || null),
      localName: local.localName || '',
      localDescricao: local.localDescricao || '',
      link: local.link || '',
      localType: local.localType || 'outros',
      country: local.country || '',
      countryCode: local.countryCode || '',
      state: local.state || '',
      city: local.city || '',
      image: local.imageUrl || null,
    })

    // mostre o preview da url existente
    setImagePreview(local.imageUrl || null)

    // resetamos flags de substituição de imagem
    setReplaceImage(false)

    setFieldErrors({})
    setEditing(true)
    setEditingSourceId(local.localId || null)
    // por padrão, ao abrir via editar, queremos evitar sobrescrever — força checkbox ligado
    setSaveAsNew(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const resetForm = () => {
    // revoke de qualquer blob criado localmente
    if (imagePreview && typeof imagePreview === 'string' && imagePreview.startsWith('blob:')) {
      try { URL.revokeObjectURL(imagePreview) } catch (e) { /* ignore */ }
    }

    setForm(initialForm)
    setEditing(false)
    setError(null)
    setFieldErrors({})
    setSaveAsNew(false)
    setEditingSourceId(null)
    setImagePreview(null)
    setReplaceImage(false)
    if (fileInputRef.current) fileInputRef.current.value = null
  }

  const handleChange = (key, value) => {
    if (key === 'country') {
      const code = (locationsRaw?.countries || []).find(c => c.name === value)?.code || ''
      setForm(f => ({ ...f, country: value, countryCode: code, state: '', city: '' }))
      setFieldErrors(fe => ({ ...fe, country: undefined, countryCode: undefined, state: undefined, city: undefined }))
      return
    }
    if (key === 'state') {
      setForm(f => ({ ...f, state: value, city: '' }))
      setFieldErrors(fe => ({ ...fe, state: undefined, city: undefined }))
      return
    }
    setForm(f => ({ ...f, [key]: value }))
    setFieldErrors(fe => ({ ...fe, [key]: undefined }))
  }

  const handleFile = (file) => {
    // revoke previous blob preview se existia
    if (imagePreview && typeof imagePreview === 'string' && imagePreview.startsWith('blob:')) {
      try { URL.revokeObjectURL(imagePreview) } catch (e) { /* ignore */ }
    }

    // quando o usuário seleciona um arquivo novo, sobrescrevemos form.image com o File
    setForm(f => ({ ...f, image: file }))

    if (!file) {
      setImagePreview(null)
      setFieldErrors(fe => ({ ...fe, image: undefined }))
      return
    }

    // cria um preview temporário
    if (file instanceof File) {
      const url = URL.createObjectURL(file)
      setImagePreview(url)
    } else {
      setImagePreview(null)
    }

    setFieldErrors(fe => ({ ...fe, image: undefined }))
  }

  const isImageFile = (file) => {
    if (!file) return false
    // se for string (imageUrl), consideramos válido aqui — validação de URL acontece em outro lugar
    if (typeof file === 'string') return true
    if (!(file instanceof File)) return false
    if (file.type && file.type.startsWith('image/')) return true
    const name = file.name || ''
    return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i.test(name)
  }

  const isValidHttpUrl = (value) => {
    if (!value || typeof value !== 'string') return false
    try {
      const u = new URL(value)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch (e) {
      return false
    }
  }

  const getValidationErrors = () => {
    const errs = {}
    if (!form.localName || !form.localName.trim()) errs.localName = 'Nome do local é obrigatório.'
    if (!form.localDescricao || !form.localDescricao.trim()) errs.localDescricao = 'Descrição é obrigatória.'
    if (!form.link || !form.link.trim()) {
      errs.link = 'Link é obrigatório.'
    } else if (!isValidHttpUrl(form.link.trim())) {
      errs.link = 'Link inválido — deve começar com http:// ou https://.'
    }
    if (!form.localType || !form.localType.trim()) errs.localType = 'Tipo do local é obrigatório.'
    if (!form.country || !form.country.trim()) errs.country = 'País é obrigatório.'
    if (!form.state || !form.state.trim()) errs.state = 'Estado é obrigatório.'
    if (!form.city || !form.city.trim()) errs.city = 'Cidade é obrigatória.'

    // imagem obrigatória + checagem básica de tipo e tamanho
    // regras:
    // - se estamos editando e NÃO substituindo (replaceImage === false) e há image (string), ok
    // - caso contrário, precisamos ter um File como form.image
    if (editing && !replaceImage) {
      // editar sem substituir: aceitável desde que exista imagePreview ou form.image string
      if (!form.image && !imagePreview) {
        errs.image = 'Imagem é obrigatória.'
      }
    } else {
      // criação ou edição com substituição: requer um arquivo ou preview
      if (!form.image && !imagePreview) {
        errs.image = 'Imagem é obrigatória.'
      } else if (form.image && !isImageFile(form.image)) {
        errs.image = 'O arquivo selecionado não parece ser uma imagem válida.'
      } else if (form.image instanceof File) {
        const maxSize = 5 * 1024 * 1024 // 5 MB
        if (form.image.size > maxSize) errs.image = 'Imagem muito grande. Máx 5 MB.'
      }
    }

    return errs
  }

  const isFormValid = useMemo(() => Object.keys(getValidationErrors()).length === 0, [form, imagePreview, replaceImage, editing])

  const submitLocal = async (e) => {
    e && e.preventDefault()
    setSubmitting(true)
    setError(null)

    const errors = getValidationErrors()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('Preencha todos os campos obrigatórios antes de publicar.')
      setSubmitting(false)
      return
    }

    // Se temos uma imageUrl (string) e precisamos enviar um File (ex: criar novo a partir de existente
    // ou backend exige file), tentamos baixar a imagem e convertê-la para File. Se falhar (CORS), enviamos imageUrl.
    let imageToSend = form.image
    if (typeof imageToSend === 'string' && imageToSend && (!editing || (editing && !replaceImage))) {
      try {
        const resp = await fetch(imageToSend, { mode: 'cors' })
        if (resp.ok) {
          const blob = await resp.blob()
          const ext = (blob.type && blob.type.split('/')[1]) || 'jpg'
          const filename = `image.${ext}`
          imageToSend = new File([blob], filename, { type: blob.type || 'image/jpeg' })
          // setamos também no form para seguir a lógica (e para preview se necessário)
          setForm(f => ({ ...f, image: imageToSend }))
          // cria preview blob
          try { URL.revokeObjectURL(imagePreview) } catch (e) { /* ignore */ }
          const blobUrl = URL.createObjectURL(blob)
          setImagePreview(blobUrl)
        } else {
          // não conseguimos baixar: mantemos string (será enviada como imageUrl)
          console.warn('fetch imageUrl returned not ok', resp.status)
        }
      } catch (err) {
        console.warn('não foi possível baixar imageUrl para converter em File (possível CORS). Enviando imageUrl se backend aceitar.', err)
        // imageToSend permanece string
      }
    }

    // Verificação adicional: tenta carregar a imagem no cliente para garantir que não é um arquivo corrompido/não-imagem
    if (imageToSend instanceof File) {
      const imageOk = await new Promise(resolve => {
        const img = new Image()
        const url = URL.createObjectURL(imageToSend)
        let settled = false
        img.onload = () => { if (!settled) { settled = true; URL.revokeObjectURL(url); resolve(true) } }
        img.onerror = () => { if (!settled) { settled = true; URL.revokeObjectURL(url); resolve(false) } }
        img.src = url
        // timeout de 3s
        setTimeout(() => { if (!settled) { settled = true; URL.revokeObjectURL(url); resolve(false) } }, 3000)
      })

      if (!imageOk) {
        setFieldErrors({ image: 'Arquivo selecionado não é uma imagem válida.' })
        setError('Verifique a imagem enviada.')
        setSubmitting(false)
        return
      }
    }

    try {
      const isOverwrite = editing && !saveAsNew && !!editingSourceId

      const fd = new FormData()
      fd.append('localName', form.localName)
      fd.append('localDescricao', form.localDescricao)
      fd.append('link', form.link)
      fd.append('tipo', form.localType)
      fd.append('country', form.country)
      fd.append('countryCode', form.countryCode)
      fd.append('state', form.state)
      fd.append('city', form.city)
      fd.append('userId', user?._id)

      // imagem: se temos um File depois da tentativa de download, envia como 'image'
      if (imageToSend instanceof File) {
        fd.append('image', imageToSend)
      } else if (typeof imageToSend === 'string' && imageToSend.trim() && (!editing || !replaceImage)) {
        // fallback: envia imageUrl (string) para backend tratar — preferível ao erro atual
        fd.append('imageUrl', imageToSend)
      }

      if (isOverwrite) fd.append('localId', editingSourceId)

      if (useMock) {
        await simulateDelay()
        const created = {
          localId: (isOverwrite ? editingSourceId : (form.localId || `mock-${Date.now()}`)),
          localName: form.localName,
          localDescricao: form.localDescricao,
          localType: form.localType,
          status: 'active',
          subscriptionId: `sub_mock_${Date.now()}`,
          link: form.link,
          country: form.country,
          countryCode: form.countryCode,
          state: form.state,
          city: form.city,
          // escolha da imageUrl para o mock:
          imageUrl: imageToSend instanceof File ? URL.createObjectURL(imageToSend) : (typeof imageToSend === 'string' && imageToSend ? imageToSend : imagePreview || null),
          userId: user?.id || user?._id,
          estatisticas: { impressoes: 0, cliques: 0 }
        }

        if (isOverwrite) {
          window.__MOCK_LOCAIS__ = (window.__MOCK_LOCAIS__ || []).map(l => l.localId === editingSourceId ? { ...l, ...created } : l)
        } else {
          window.__MOCK_LOCAIS__ = [...(window.__MOCK_LOCAIS__ || []), created]
        }

        resetForm()
        fetchMeusLocais()
      } else {
        // NÃO setamos Content-Type manualmente — o browser colocará multipart/form-data com boundary
        if (isOverwrite) {
          await api.post('/editar-local', fd, { headers: { 'Content-Type': undefined } })
        } else {
          const res = await api.post('/createPayment', fd, { headers: { 'Content-Type': undefined } })

          if (res && res.data && res.data.url) {
            window.location.href = res.data.url
            return
          }
        }

        resetForm()
        fetchMeusLocais()
      }
    } catch (err) {
      console.error('submitLocal erro', err)
      console.error('response data:', err?.response?.data)
      setError('Erro ao enviar o local. Verifique a conexão e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  // ------------------ render ------------------
  return (
    <div className={`w-full p-4 ${tema === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ADD / EDIT FORM */}
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl p-6 shadow ${form.localId ? tema === 'dark' ? 'bg-green-800 text-white' : 'bg-green-400 text-slate-900' : tema === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
          <h2 className="text-xl font-semibold mb-3">{editing ? (saveAsNew ? 'Adicionar (a partir do local)' : 'Editar Local (sobrescrever)') : 'Adicionar Local'}</h2>
          {error && <div className="mb-2 text-sm text-red-500">{error}</div>}

          <form onSubmit={submitLocal}>
            <label className="block text-sm">Nome do Local <span className="text-red-500">*</span></label>
            <input className={`w-full p-2 rounded border mt-1 ${fieldErrors.localName ? 'border-red-500' : ''}`} value={form.localName} onChange={e => handleChange('localName', e.target.value)} />
            {fieldErrors.localName && <div className="text-red-500 text-xs mt-1">{fieldErrors.localName}</div>}

            <label className="block text-sm mt-3">Descrição <span className="text-red-500">*</span></label>
            <textarea className={`w-full p-2 rounded border mt-1 ${fieldErrors.localDescricao ? 'border-red-500' : ''}`} value={form.localDescricao} onChange={e => handleChange('localDescricao', e.target.value)} />
            {fieldErrors.localDescricao && <div className="text-red-500 text-xs mt-1">{fieldErrors.localDescricao}</div>}

            <label className="block text-sm mt-3">Link <span className="text-red-500">*</span></label>
            <input className={`w-full p-2 rounded border mt-1 ${fieldErrors.link ? 'border-red-500' : ''}`} value={form.link} onChange={e => handleChange('link', e.target.value)} />
            {fieldErrors.link && <div className="text-red-500 text-xs mt-1">{fieldErrors.link}</div>}

            <label className="block text-sm mt-3">Tipo de Local <span className="text-red-500">*</span></label>
            <select disabled={editing && !saveAsNew} className={`w-full p-2 rounded border mt-1 ${fieldErrors.localType ? 'border-red-500' : ''} ${editing && !saveAsNew ? 'opacity-60 cursor-not-allowed' : ''}`} value={form.localType} onChange={e => handleChange('localType', e.target.value)}>
              {tiposPermitidos.map(t => <option className={`text-black`} key={t} value={t}>{t}</option>)}
            </select>
            {fieldErrors.localType && <div className="text-red-500 text-xs mt-1">{fieldErrors.localType}</div>}
            {editing && !saveAsNew && <div className="text-xs mt-1 text-yellow-600">O tipo não pode ser alterado ao editar — cada tipo tem preço diferente.</div>}

            <label className="block text-sm mt-3">País <span className="text-red-500">*</span></label>
            <select className={`w-full p-2 rounded border mt-1 ${fieldErrors.country ? 'border-red-500' : ''}`} value={form.country} onChange={e => handleChange('country', e.target.value)}>
              <option className={`text-black`} value="">Selecione um país</option>
              {countries.map(c => <option className={`text-black`} key={c.code} value={c.name}>{c.name}</option>)}
            </select>
            {fieldErrors.country && <div className="text-red-500 text-xs mt-1">{fieldErrors.country}</div>}

            <label className="block text-sm mt-3">Estado <span className="text-red-500">*</span></label>
            <select className={`w-full p-2 rounded border mt-1 ${fieldErrors.state ? 'border-red-500' : ''}`} value={form.state} onChange={e => handleChange('state', e.target.value)}>
              <option className={`text-black`} value="">Selecione um estado</option>
              {states.map(s => <option className={`text-black`} key={s} value={s}>{s}</option>)}
            </select>
            {fieldErrors.state && <div className="text-red-500 text-xs mt-1">{fieldErrors.state}</div>}

            <label className="block text-sm mt-3">Cidade <span className="text-red-500">*</span></label>
            <select className={`w-full p-2 rounded border mt-1 ${fieldErrors.city ? 'border-red-500' : ''}`} value={form.city} onChange={e => handleChange('city', e.target.value)}>
              <option className={`text-black`} value="">Selecione uma cidade</option>
              {cities.map(c => <option className={`text-black`} key={c} value={c}>{c}</option>)}
            </select>
            {fieldErrors.city && <div className="text-red-500 text-xs mt-1">{fieldErrors.city}</div>}

            <label className="block text-sm mt-3">Imagem <span className="text-red-500">*</span></label>

            {/* 
              Política: não tentamos (e não conseguimos) setar value em <input type="file" /> via JS com uma URL.
              Em vez disso, quando estamos editando e há uma imageUrl existente mostramos o preview e deixamos o usuário
              optar por "Substituir imagem" (exibe input file) ou manter a atual. Isso resolve o problema de o input não
              receber a URL.
            */}

            {editing && imagePreview && !replaceImage ? (
              <div className="mt-2">
                <div className="text-xs text-slate-500 mb-1">Imagem atual:</div>
                <div className="flex items-center gap-3">
                  <img src={imagePreview} alt="imagem atual" className="w-48 h-28 object-cover rounded border" />
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => {
                      // quando o usuário optar por substituir, limpamos o form.image (string) e mostramos o input
                      setReplaceImage(true)
                      setForm(f => ({ ...f, image: null }))
                      // limpa preview (o usuário poderá ver o preview do arquivo que escolher)
                      if (imagePreview && imagePreview.startsWith('blob:')) {
                        try { URL.revokeObjectURL(imagePreview) } catch (e) { /* ignore */ }
                      }
                      setImagePreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = null
                    }} className="px-3 py-1 rounded border text-sm">Substituir imagem</button>
                    <button type="button" onClick={() => {
                      // permite remover completamente a imagem atual
                      const ok = window.confirm('Remover imagem atual?')
                      if (!ok) return
                      setForm(f => ({ ...f, image: null }))
                      setImagePreview(null)
                      setReplaceImage(true)
                      if (fileInputRef.current) fileInputRef.current.value = null
                    }} className="px-3 py-1 rounded bg-red-500 text-white text-sm">Remover imagem</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0] || null)} className={`w-full mt-1 ${fieldErrors.image ? 'border-red-500' : ''}`} />
                {/* se estávamos em modo de edição e o usuário abriu o input para substituir, mostramos botão para cancelar a substituição */}
                {editing && replaceImage && (
                  <div className="mt-2">
                    <button type="button" onClick={() => {
                      // cancelar substituição: restaurar preview a partir de form.image (string) se existir
                      setReplaceImage(false)
                      setForm(f => ({ ...f, image: form.image }))
                      setImagePreview(form.image || null)
                      if (fileInputRef.current) fileInputRef.current.value = null
                    }} className="px-3 py-1 rounded border text-sm">Manter imagem atual</button>
                  </div>
                )}
              </div>
            )}

            {fieldErrors.image && <div className="text-red-500 text-xs mt-1">{fieldErrors.image}</div>}

            {/* When editing, show the "Salvar como novo" checkbox (checked by default) to avoid irreversible overwrite */}
            {editing && (
              <div className="mt-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={saveAsNew} onChange={() => {
                    const next = !saveAsNew
                    setSaveAsNew(next)
                    // se o usuário optar por NÃO salvar como novo, então colocamos localId para permitir edição (sobrescrever)
                    if (!next && editingSourceId) {
                      setForm(f => ({ ...f, localId: editingSourceId }))
                    } else {
                      // se voltar para salvar como novo, limpamos localId para criar novo registro
                      setForm(f => ({ ...f, localId: null }))
                    }
                  }} />
                  Salvar como novo (não sobrescrever o local original)
                </label>
                {!saveAsNew && <div className="text-xs mt-1 text-yellow-600">Atenção: ao desmarcar essa opção, você irá sobrescrever o local original — ação potencialmente irreversível.</div>}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={submitting || !isFormValid} className="px-4 py-2 rounded bg-blue-600 text-white">{submitting ? 'Enviando...' : (form.localId ? 'Salvar Alterações' : (editing ? 'Adicionar como novo' : 'Adicionar Local'))}</button>
              <button type="button" onClick={resetForm} className="px-4 py-2 rounded border">Limpar</button>
            </div>
          </form>
          <p className="mt-3 text-xs text-slate-500">Observação: todos os campos são obrigatórios antes de publicar. Se seu backend exigir criação de pagamento/assinatura antes do cadastro, adapte a chamada para '/createPayment' conforme sua API.</p>
        </motion.section>

        {/* LISTA DE LOCAIS */}
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl p-6 shadow overflow-auto max-h-[70vh] ${tema === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
          <h2 className="text-xl font-semibold mb-3">Meus Locais</h2>
          {loading && <div>Carregando...</div>}
          {!loading && meusLocais.length === 0 && <div className="text-sm">Você ainda não tem locais cadastrados.</div>}

          <div className="space-y-3 mt-2">
            {meusLocais.map(local => (
              <div key={local.localId || local._id || Math.random()} className="p-3 rounded border flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* thumbnail: prefer local.imageUrl, se não tiver, mostra placeholder */}
                  <div className="w-20 h-12 bg-slate-100 rounded overflow-hidden flex-shrink-0">
                    {local.imageUrl ? (
                      <img src={local.imageUrl} alt={local.localName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Sem imagem</div>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold">{local.localName}</div>
                    <div className="text-xs text-slate-500">{local.localType} • {local.city} - {local.state} • {local.country}</div>
                    <div className="text-xs mt-1">Status: <span className={`font-medium uppercase ${local.status === 'ativo' ? 'text-green-600' : 'text-yellow-600'}`}>{local.status}</span></div>
                    <div className="text-xs mt-1">Impressões: {local.estatisticas?.impressoes ?? 0} • Cliques: {local.estatisticas?.cliques ?? 0}</div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => openForEdit(local)} className="px-3 py-1 rounded bg-slate-200 text-sm">Editar</button>
                  <button onClick={() => handleDeletarLocal(local.localId)} className="px-3 py-1 rounded bg-red-500 text-white text-sm">Deletar</button>
                </div>
              </div>
            ))}
          </div>

        </motion.section>
      </div >
    </div >
  )
}

export default Locais
