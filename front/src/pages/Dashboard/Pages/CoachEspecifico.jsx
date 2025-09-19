import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../../Api'; // sua instância axios
import { getBrazilDate } from '../../../../helpers/getBrazilDate.js';

function themeClass(tema, lightClass, darkClass) {
  return tema === 'light' ? lightClass : darkClass;
}

/**
 * CoachEspecifico
 * - lê q da query (?q=...)
 * - tenta carregar profissional por userId (ou profissionalId)
 * - requer que o usuário digite uma mensagem antes de enviar /quero-ser-aluno
 */
const CoachEspecifico = ({ user, tema = 'dark' }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get('q'); // string | null

  const [profissional, setProfissional] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hireLoading, setHireLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  // nova state para a mensagem do usuário (obrigatória)
  const [mensagem, setMensagem] = useState('');
  const [mensagemError, setMensagemError] = useState(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // limpa mensagens ao trocar q
    setMensagem('');
    setMensagemError(null);
    setError(null);
    setSuccessMsg(null);
  }, [q]);

  useEffect(() => {
    if (!q) {
      setError('Parâmetro "q" ausente na URL.');
      setProfissional(null);
      return;
    }
    setError(null);
    setSuccessMsg(null);
    const controller = new AbortController();

    const fetchProfissional = async () => {
      setLoading(true);
      setProfissional(null);
      try {
        // 1) Tenta buscar por userId (ou profissionalId)
        let res;
        try {
          res = await api.get('/profissionais', { params: { userId: q }, signal: controller.signal });
        } catch (err) {
          // se 404 ou erro, guardamos o response para análise, mas prosseguimos com fallback
          res = err?.response || null;
        }

        if (res && res.data) {
          // caso backend retorne wrapper { profissional: ... }
          if (res.data.profissional) {
            if (!mountedRef.current) return;
            setProfissional(res.data.profissional);
            setLoading(false);
            return;
          }
          // se backend devolveu o objeto direto
          if (res.data._id || res.data.profissionalId || res.data.userId) {
            if (!mountedRef.current) return;
            setProfissional(res.data);
            setLoading(false);
            return;
          }
          // se veio lista/data.items com apenas 1 item, talvez seja o que queremos
          const listCandidate = res.data.profissionais || res.data?.data?.items || (Array.isArray(res.data) ? res.data : null);
          if (Array.isArray(listCandidate) && listCandidate.length === 1) {
            if (!mountedRef.current) return;
            setProfissional(listCandidate[0]);
            setLoading(false);
            return;
          }
        }

        // 2) Fallback: busca por texto (q)
        try {
          const byText = await api.get('/profissionais', { params: { q }, signal: controller.signal });
          const payload = byText?.data;
          let candidates = payload?.profissionais || payload?.data?.items || (Array.isArray(payload) ? payload : null);
          if (!Array.isArray(candidates) && payload && typeof payload === 'object' && payload.profissional) {
            candidates = [payload.profissional];
          }
          if (Array.isArray(candidates) && candidates.length) {
            // prefer match by id fields
            const found = candidates.find(p =>
              String(p.profissionalId) === String(q) ||
              String(p.userId) === String(q) ||
              String(p._id) === String(q)
            );
            if (found) {
              if (!mountedRef.current) return;
              setProfissional(found);
              setLoading(false);
              return;
            }
            // se não achou por id, pega primeiro candidato relevante
            if (!mountedRef.current) return;
            setProfissional(candidates[0]);
            setLoading(false);
            return;
          } else {
            if (!mountedRef.current) return;
            setError('Profissional não encontrado.');
            setProfissional(null);
            setLoading(false);
            return;
          }
        } catch (err) {
          if (!mountedRef.current) return;
          console.error('Erro fallback por texto:', err);
          setError(err?.response?.data?.msg || 'Erro ao buscar profissional.');
          setProfissional(null);
          setLoading(false);
          return;
        }
      } catch (err) {
        if (!mountedRef.current) return;
        if (err.name === 'CanceledError' || err.message === 'canceled') return;
        console.error('Erro ao buscar profissional:', err);
        setError(err?.response?.data?.msg || err.message || 'Erro desconhecido');
        setProfissional(null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchProfissional();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const handleHire = async () => {
    setMensagemError(null);
    setError(null);
    setSuccessMsg(null);

    if (!user || !user.email) {
      setError('É necessário estar logado para pedir pra ser aluno.');
      return;
    }
    if (!profissional) {
      setError('Profissional inválido.');
      return;
    }

    // valida mensagem -> obrigatória e com pelo menos 3 caracteres (ajuste se quiser)
    const text = String(mensagem || '').trim();
    if (!text || text.length < 3) {
      setMensagemError('Digite uma mensagem curta explicando por que você quer ser aluno deste coach (mínimo 3 caracteres).');
      return;
    }

    setHireLoading(true);
    try {
      const payload = {
        email: user.email,
        profissionalId: profissional.profissionalId || profissional.userId || profissional._id,
        mensagem: text
      };
      const res = await api.post('/quero-ser-aluno', payload);

      if (res?.data?.success) {
        setSuccessMsg(res.data.msg || 'Solicitação enviada com sucesso!');
        // opcional: limpar campo
        setMensagem('');
      } else {
        // backend pode retornar success:false com msg
        const msg = res?.data?.msg || 'Resposta inesperada do servidor ao enviar solicitação.';
        setError(msg);
      }
    } catch (err) {
      console.error('Erro ao solicitar ser aluno.:', err);
      setError(err?.response?.data?.msg || err.message || 'Erro ao solicitar ser aluno.');
    } finally {
      if (mountedRef.current) setHireLoading(false);
    }
  };

  if (!q) {
    return <div className="p-4">Parâmetro <code>q</code> ausente. Verifique o link de convidar do coach.</div>;
  }

  return (
    <div className={`max-w-3xl mx-auto p-4 ${themeClass(tema, 'bg-white text-black', 'bg-gray-900 text-white')} rounded-lg`}>
      <header className="mb-4">
        <h2 className="text-2xl font-bold">Perfil do Coach</h2>
        <p className="text-sm text-gray-500">Mostrando informações para o identificador <span className="font-mono">{q}</span></p>
      </header>

      {loading && <div>Carregando profissional...</div>}
      {error && <div className="mb-4 text-sm text-red-600">{String(error)}</div>}
      {successMsg && <div className="mb-4 text-sm text-green-600">{String(successMsg)}</div>}

      {!loading && profissional && (
        <div className={`p-4 rounded-lg shadow ${themeClass(tema, 'bg-white text-black', 'bg-gray-800 text-white')}`}>
          <div className="flex gap-4">
            <div className="w-28 h-28 rounded overflow-hidden border">
              {profissional.imageUrl ? (
                <img src={profissional.imageUrl} alt={profissional.profissionalName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-xs">Sem imagem</div>
              )}
            </div>

            <div className="flex-1">
              <div className="text-xl font-semibold">{profissional.profissionalName || '—'}</div>
              <div className="text-sm text-gray-400">{profissional.especialidade || '—'}</div>
              <div className="text-xs text-gray-500 mt-2">{profissional.biografia || ''}</div>

              <div className="mt-3 text-xs text-gray-500">
                <div>Criado em: {profissional.criadoEm ? new Date(profissional.criadoEm).toLocaleString() : '—'}</div>
                <div>Local: {profissional.city ? `${profissional.city} — ${profissional.state || ''}` : (profissional.country || '—')}</div>
              </div>

              {/* input obrigatório: mensagem do usuário */}
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Mensagem para o coach <span className="text-xs text-gray-400">(obrigatório)</span></label>
                <input
                  value={mensagem}
                  type='text'
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder={`Escreva uma mensagem breve para ${profissional.profissionalName || 'o coach'}...`}
                  className={`w-full p-2 rounded-md border ${themeClass(tema, 'bg-white', 'bg-gray-700')}`}
                  rows={4}
                />
                {mensagemError && <div className="text-xs text-red-600 mt-1">{mensagemError}</div>}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleHire}
                  disabled={hireLoading || !mensagem.trim()}
                  className={`px-3 py-2 rounded ${hireLoading || !mensagem.trim() ? 'bg-gray-400 text-gray-800 cursor-not-allowed' : 'bg-blue-600 text-white'}`}
                >
                  {hireLoading ? 'Enviando...' : 'Quero ser aluno'}
                </button>

                <button
                  onClick={() => window.open(profissional.imageUrl || '#', '_blank')}
                  className="px-3 py-2 rounded bg-gray-100 text-black"
                >
                  Ver imagem
                </button>

                <button
                  onClick={() => navigate('/dashboard/coach')}
                  className="px-3 py-2 rounded bg-gray-100 text-black"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !profissional && !error && (
        <div className="p-4 rounded-lg bg-yellow-50 text-black">
          Nenhum profissional encontrado para <code>{q}</code>.
        </div>
      )}
    </div>
  );
};

export default CoachEspecifico;
