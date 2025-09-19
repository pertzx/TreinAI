import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import api from '../Api.js'; // ajuste o caminho se necessário

/**
 * InfoCoachs
 * - busca os profissionais referenciados em user.coachsId
 * - busca em paralelo e trata erros individualmente
 * - evita setState após unmount
 * - fornece loading + error states
 * - exibe, para cada profissional, o campo `ultimoUpdate` do objeto do aluno
 *   que pertence ao usuário atual (procura em profissional.alunos pelo userId)
 *
 * Props:
 *  - user: objeto do usuário (espera user.coachsId um objeto com chaves: 'nutricionista','personal-trainner','fisioterapeuta')
 */

const InfoCoachs = ({ user }) => {
    const [nutricionista, setNutricionista] = useState(null);
    const [personalTrainner, setPersonalTrainner] = useState(null);
    const [fisioterapeuta, setFisioterapeuta] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [atualizar, setAtualizar] = useState(false);

    const userId = user?.userId || user?._id || user?.id || null;

    const getProfissionalByProfissionalId = useCallback(async (profissionalId) => {
        if (!profissionalId) return null;
        try {
            const res = await api.get(`/profissionais`, { params: { userId: profissionalId } });
            // dependendo do backend, os dados podem vir em res.data.profissional ou res.data
            return res?.data?.profissional ?? res?.data ?? null;
        } catch (err) {
            console.warn('Erro ao buscar profissional', profissionalId, err?.message || err);
            return null;
        }
    }, []);

    const AtualizarInfos = useCallback(async (signal) => {
        // se user ou user.coachsId não existe, limpa e retorna
        const coachs = user?.coachsId ?? null;
        if (!coachs) {
            setNutricionista(null);
            setPersonalTrainner(null);
            setFisioterapeuta(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // buscar em paralelo, cada chave pode estar ausente
            const promises = [];
            const keys = ['nutricionista', 'personal-trainner', 'fisioterapeuta'];

            keys.forEach((k) => {
                const id = coachs[k];
                promises.push(getProfissionalByProfissionalId(id));
            });

            const [nut, pt, fisio] = await Promise.all(promises);

            // se o componente desmontou, abortar aplicação de estado
            if (signal && signal.aborted) return;

            setNutricionista(nut || null);
            setPersonalTrainner(pt || null);
            setFisioterapeuta(fisio || null);

            // logs úteis: mostre a resposta direta das requisições (não o state imediatamente)
            console.debug('AtualizarInfos resultados:', { nut, pt, fisio });
        } catch (err) {
            console.error('AtualizarInfos erro:', err?.message || err);
            if (!(err && err.name === 'CanceledError')) setError('Erro ao carregar informações dos profissionais.');
        } finally {
            setLoading(false);
        }
    }, [getProfissionalByProfissionalId, user]);

    // rodar ao montar e quando user.coachsId mudar
    useEffect(() => {
        const controller = new AbortController();
        AtualizarInfos(controller.signal);
        return () => controller.abort();
    }, [AtualizarInfos]);

    // permitir refresh manual via botão
    useEffect(() => {
        if (!atualizar) return;
        const controller = new AbortController();
        AtualizarInfos(controller.signal).finally(() => setAtualizar(false));
        return () => controller.abort();
    }, [atualizar, AtualizarInfos]);

    // helper para formatar data (pt-BR)
    const fmt = (iso) => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return String(iso);
            return d.toLocaleString('pt-BR');
        } catch (e) {
            return String(iso);
        }
    };

    const handleRemoverAlunoClick = async (alunoUserId, profissionalId) => {
        if (!profissionalId || !alunoUserId) return;
        const ok = window.confirm('Deseja deixa de ser aluno?');
        if (!ok) return;
        try {
            const payload = { profissionalId, alunoUserId };
            const res = await api.post('/remover-aluno', payload);
            if (!res?.data?.success) throw new Error(res?.data?.msg || 'Falha ao remover');
        } catch (err) {
            console.error('Erro remover aluno:', err);
            alert(`Falha ao remover aluno: ${err?.message || 'erro'}`);
        } finally {
            setAtualizar(true); // força refresh
        }
    };

    // simples render de cartão do profissional
    const ProfCard = ({ title, prof }) => {
        if (!prof) return (
            <div className="p-3 border rounded bg-white/5">{
                loading ? (<div className="text-sm text-gray-500">Carregando {title}...</div>) : (<div className="text-sm text-gray-400">Nenhum {title} atribuído</div>)
            }</div>
        );

        // ajuste os campos conforme seu objeto profissional real
        const nome = prof.nome ?? prof.profissionalName ?? prof.username ?? '—';
        const especialidade = prof.especialidade ?? '';
        const contato = prof.telefone ?? prof.phone ?? prof.contato ?? '';
        const imgUrl = prof.imageUrl

        // procuramos, dentro de prof.alunos, o objeto relativo ao usuário atual
        const alunoObj = (Array.isArray(prof.alunos) ? prof.alunos.find(a => String(a.userId) === String(userId)) : null) || null;
        // suporte a diferentes nomes do campo de data: ultimoUpdate, ultimo_update, lastUpdate
        const ultimoUpdateRaw = alunoObj?.ultimoUpdate ?? alunoObj?.ultimo_update ?? alunoObj?.lastUpdate ?? null;
        const ultimoUpdateText = ultimoUpdateRaw ? fmt(ultimoUpdateRaw) : null;

        return (
            <div className="border rounded-2xl" style={{
                backgroundImage: `url(${imgUrl})`,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover'
            }}>
                <div className="p-3 rounded-2xl w-full h-full bg-gradient-to-b from-black/80 to-black/20">
                    <div className="font-semibold">{title}</div>
                    <div className="text-sm text-gray-400">{nome}</div>
                    {especialidade && <div className="text-xs text-gray-200">{especialidade}</div>}
                    {contato && <div className="text-xs text-gray-200 mt-1">Contato: {contato}</div>}


                    {/* mostrar info do aluno relativo a este usuário, se existir */}
                    {alunoObj ? (
                        <div className="text-xs text-gray-200 mt-2">
                            <div>Seu acompanhamento:</div>
                            {ultimoUpdateText ? <div>Última atualização: <strong>{ultimoUpdateText}</strong></div> : <div>Última atualização: —</div>}
                            {/* você pode mostrar outros campos do objeto aluno aqui, ex: status, notas, etc. */}

                            <button className='mt-2 text-white font-bold cursor-pointer bg-red-600 p-3 rounded-2xl' onClick={() => {
                                handleRemoverAlunoClick(userId, prof.profissionalId);
                            }}>Deixar de ser aluno</button>
                        </div>
                    ) : (
                        <div className="text-xs text-gray-400 mt-2">Você não está nos alunos deste profissional.</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Profissionais vinculados</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => setAtualizar(true)} className="px-3 py-1 rounded bg-indigo-600 text-white">Atualizar</button>
                    {loading && <div className="text-sm text-gray-500">Carregando...</div>}
                </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ProfCard title="Nutricionista" prof={nutricionista} />
                <ProfCard title="Personal Trainer" prof={personalTrainner} />
                <ProfCard title="Fisioterapeuta" prof={fisioterapeuta} />
            </div>
        </div>
    );
};

InfoCoachs.propTypes = {
    user: PropTypes.object
};

export default InfoCoachs;