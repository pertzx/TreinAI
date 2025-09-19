import React, { useState, useMemo } from 'react';
import { FiChevronDown, FiChevronUp, FiClock, FiList } from 'react-icons/fi';

/**
 * Historico
 * Props:
 *  - historico: array (conforme seu schema)
 *  - tema: 'dark' | 'light'  (usa para estilização)
 *  - limit: number (quantos itens mostrar por padrão; default 5)
 */
const Historico = ({ historico = [], tema = 'light', limit = 5 }) => {
  const [expandedId, setExpandedId] = useState(null);
  const h = Array.isArray(historico) ? historico.slice() : [];

  // tema
  const isDark = tema === 'dark';
  const containerClass = isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const cardClass = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const mutedClass = isDark ? 'text-gray-400' : 'text-gray-500';
  const smallBg = isDark ? 'bg-gray-800' : 'bg-gray-50';

  // ordenar por dataExecucao descendente (mais recente primeiro)
  const ordenado = useMemo(() => {
    return h.sort((a, b) => {
      const da = a?.dataExecucao ? new Date(a.dataExecucao).getTime() : 0;
      const db = b?.dataExecucao ? new Date(b.dataExecucao).getTime() : 0;
      return db - da;
    });
  }, [h]);

  const mostrados = ordenado.slice(0, limit);

  const toggle = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('pt-BR');
    } catch {
      return String(d);
    }
  };

  const formatDuration = (mins) => {
    if (mins == null) return '—';
    const m = Number(mins) || 0;
    if (m === 0) return '0 min';
    const hours = Math.floor(m / 60);
    const minutes = m % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
  };

  const resumoExercicios = (arr = []) => {
    const totalEx = (arr || []).length;
    let totalSeries = 0;
    let totalReps = 0;
    for (const e of arr || []) {
      const series = Number(e.seriesConcluidas ?? e.series ?? 0);
      const reps = Number(e.repeticoesPorSerie ?? e.repeticoes ?? 0);
      totalSeries += series;
      totalReps += series * reps;
    }
    return { totalEx, totalSeries, totalReps };
  };

  if (!ordenado.length) {
    return (
      <div className={`p-4 rounded-lg border ${cardClass} ${mutedClass}`}>
        Nenhum treino no histórico ainda.
      </div>
    );
  }

  return (
    <div className={`space-y-3 p-2 rounded-lg ${containerClass}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-md font-semibold">Últimos treinos</h3>
        <div className="text-xs text-gray-400">
          Mostrando {Math.min(limit, ordenado.length)} de {ordenado.length}
        </div>
      </div>

      <div className="grid gap-3">
        {mostrados.map((item, idx) => {
          const id = item.treinoId ?? `${idx}-${item.treinoName}`;
          const exercicios = item.exerciciosFeitos ?? item.exerciciosFeitos ?? [];
          const { totalEx, totalSeries, totalReps } = resumoExercicios(exercicios);
          const expanded = expandedId === id;

          return (
            <div key={id} className={`p-3 rounded-xl border ${cardClass} shadow-sm`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="font-medium truncate">{item.treinoName}</div>
                    <div className={`text-xs ${mutedClass}`}>• {formatDate(item.dataExecucao)}</div>
                  </div>
                  <div className={`text-sm mt-1 ${mutedClass}`}>
                    <span className="inline-flex items-center gap-1 mr-3"><FiList /> {totalEx} exerc.</span>
                    <span className="inline-flex items-center gap-1 mr-3"><FiClock /> {formatDuration(item.duracao)}</span>
                    <span className="text-xs">Séries: {totalSeries} • Reps totais: {totalReps}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggle(id)}
                    className={`text-sm px-3 py-1 rounded-md border transition ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-100'}`}
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <span className="flex items-center gap-2"><FiChevronUp /> Mostrar menos</span>
                    ) : (
                      <span className="flex items-center gap-2"><FiChevronDown /> Mostrar mais</span>
                    )}
                  </button>
                </div>
              </div>

              {expanded && (
                <div className={`mt-3 border-t pt-3 space-y-2 ${smallBg} rounded-md p-2`}>
                  {exercicios.length === 0 ? (
                    <div className={`text-xs ${mutedClass}`}>Nenhum exercício registrado neste treino.</div>
                  ) : (
                    <div className="space-y-2">
                      {exercicios.map((ex, i) => (
                        <div key={ex.exercicioId ?? `${i}-${ex.nome}`} className={`p-2 rounded-md border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                          <div className="flex justify-between items-start">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{ex.nome}</div>
                              <div className={`text-xs ${mutedClass}`}>
                                Séries: {ex.seriesConcluidas ?? ex.series ?? '—'} • Reps/serie: {ex.repeticoesPorSerie ?? ex.repeticoes ?? '—'}
                              </div>
                            </div>
                            <div className={`text-xs ${mutedClass}`}>{ex.musculo ?? ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`text-xs ${mutedClass} pt-2`}>
                    Duração: {formatDuration(item.duracao)} • Executado em {formatDate(item.dataExecucao)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ordenado.length > limit && (
        <div className={`text-center mt-2 text-xs ${mutedClass}`}>
          Para ver todo o histórico, visite a página de Histórico.
        </div>
      )}
    </div>
  );
};

export default Historico;
