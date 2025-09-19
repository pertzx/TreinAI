import React, { useMemo, useRef, useEffect, useState } from "react";
import Chart from "react-apexcharts";

/**
 * HistoricoChart (responsive)
 * Props:
 *  - tema: 'dark' | 'light' (default: 'dark')
 *  - historico: array of { treinoId, treinoName, dataExecucao, duracao (s), exerciciosFeitos: [{..., seriesConcluidas, repeticoesPorSerie}]}
 */
const HistoricoChart = ({ tema = "dark", historico = [], summary = false }) => {
  const wrapperRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // measure container width with ResizeObserver
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    setContainerWidth(Math.floor(el.clientWidth || 0));

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(Math.floor(entry.contentRect.width || 0));
        }
      });
      ro.observe(el);
    } else {
      const onResize = () => setContainerWidth(Math.floor(el.clientWidth || 0));
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    return () => ro && ro.disconnect();
  }, [wrapperRef.current]);

  // responsive flags
  const isSmall = containerWidth > 0 ? containerWidth < 640 : false; // mobile
  const isMedium = containerWidth >= 640 && containerWidth < 1024;
  // dynamic chart height
  const chartHeight = isSmall ? 240 : isMedium ? 340 : 420;

  // normalize + sort ascending by date
  const rows = useMemo(() => {
    if (!Array.isArray(historico)) return [];
    return [...historico]
      .map((r) => ({ ...r, dataExecucao: r.dataExecucao ? new Date(r.dataExecucao) : new Date() }))
      .sort((a, b) => a.dataExecucao - b.dataExecucao);
  }, [historico]);

  // derive series/labels
  const { labels, seriesDuracaoMin, seriesSeriesCount, meta } = useMemo(() => {
    const labels = [];
    const duracaoMin = [];
    const seriesCount = [];
    let totalDuracao = 0;
    let totalSeries = 0;

    rows.forEach((r) => {
      const label = r.dataExecucao ? r.dataExecucao.toLocaleDateString() : "—";
      labels.push(label);

      const durSec = Number(r.duracao) || 0;
      const durMin = +(durSec / 60).toFixed(2); // minutes, 2 decimals
      duracaoMin.push(durMin);
      totalDuracao += durMin;

      const totalSeriesForSession = (r.exerciciosFeitos || []).reduce((acc, ex) => {
        const s = Number(ex.seriesConcluidas) || 0;
        return acc + s;
      }, 0);
      seriesCount.push(totalSeriesForSession);
      totalSeries += totalSeriesForSession;
    });

    const avgDur = rows.length ? +(totalDuracao / rows.length).toFixed(2) : 0;
    const avgSeries = rows.length ? +(totalSeries / rows.length).toFixed(1) : 0;
    const latest = rows.length ? rows[rows.length - 1] : null;

    return {
      labels,
      seriesDuracaoMin: duracaoMin,
      seriesSeriesCount: seriesCount,
      meta: {
        avgDur,
        avgSeries,
        latest,
        count: rows.length,
      },
    };
  }, [rows]);

  // apex options (theme aware + responsive tuning)
  const isDark = tema === "dark";
  const primary = isDark ? "#60A5FA" : "#2563EB";
  const accent = isDark ? "#FCA5A5" : "#EF4444";
  const gridColor = isDark ? "#374151" : "#E6E6E6";
  const textColor = isDark ? "#E5E7EB" : "#0F172A";

  const options = {
    chart: {
      id: "history-combined",
      stacked: false,
      toolbar: { show: true },
      zoom: { enabled: true },
      background: "transparent",
      foreColor: textColor,
    },
    stroke: { width: [0, 3], curve: "smooth" }, // bars then line
    plotOptions: {
      bar: { columnWidth: isSmall ? "70%" : isMedium ? "55%" : "45%", borderRadius: 6 },
    },
    colors: [primary, accent],
    dataLabels: { enabled: false },
    grid: { borderColor: gridColor },
    xaxis: {
      categories: labels,
      labels: {
        rotate: labels.length > (isSmall ? 3 : isMedium ? 5 : 8) ? (isSmall ? -45 : -30) : 0,
        style: { colors: labels.map(() => textColor), fontSize: isSmall ? "10px" : "12px" },
      },
      tooltip: { enabled: false },
    },
    yaxis: [
      {
        title: { text: "Séries concluídas", style: { color: textColor } },
        labels: { style: { colors: textColor } },
        min: 0,
      },
      {
        opposite: true,
        title: { text: "Duração (min)", style: { color: textColor } },
        labels: { style: { colors: textColor } },
        min: 0,
      },
    ],
    tooltip: {
      shared: true,
      y: {
        formatter: (val, { seriesIndex }) => {
          if (seriesIndex === 0) return `${val} séries`;
          return `${val} min`;
        },
      },
      x: { format: "dd/MM/yyyy" },
    },
    legend: { show: !isSmall, position: "top", horizontalAlign: "right", labels: { colors: textColor } },
    responsive: [
      {
        breakpoint: 1024,
        options: {
          plotOptions: { bar: { columnWidth: "55%" } },
          legend: { show: !isSmall },
        },
      },
      {
        breakpoint: 640,
        options: {
          chart: { height: 240 },
          plotOptions: { bar: { columnWidth: "70%" } },
          legend: { show: false },
          xaxis: { labels: { rotate: -45, style: { fontSize: "10px" } } },
        },
      },
    ],
  };

  const series = [
    { name: "Séries concluídas", type: "column", data: seriesSeriesCount },
    { name: "Duração (min)", type: "line", data: seriesDuracaoMin },
  ];

  return (
    <div ref={wrapperRef} className={`${isDark ? "bg-gray-800 text-white" : "bg-white text-black"} rounded-2xl shadow p-4 w-full`}>
      <div className="flex flex-col gap-4">
        {/* Chart area */}
        <div className="flex-1 min-w-0">
          {
            !summary && (
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold">Histórico de Treinos</h3>
                  <p className="text-xs text-gray-400">Duração (min) e número de séries por sessão</p>
                </div>

                <div className="flex gap-3 items-center">
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Última sessão</div>
                    <div className="font-semibold">{meta.latest ? meta.latest.treinoName : "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Média</div>
                    <div className="font-semibold">{meta.avgDur} min • {meta.avgSeries} séries</div>
                  </div>
                </div>
              </div>
            )
          }

          <div className="bg-transparent rounded-md text-black p-2">
            {/* Chart uses computed height so it's responsive */}
            <Chart options={options} series={series} type="line" height={chartHeight} />
          </div>

          {/* sessions list: becomes horizontally scrollable on small screens */}
          <div className="mt-4">
            <div className="hidden sm:grid grid-cols-2 gap-2 text-xs">
              {rows.map((r, i) => (
                <div key={i} className={`${isDark ? "bg-gray-700" : "bg-gray-50"} p-2 rounded-lg border ${isDark ? "border-gray-600" : "border-gray-200"}`}>
                  <div className="font-medium truncate">{r.treinoName}</div>
                  <div className="text-[11px] text-gray-400">{r.dataExecucao?.toLocaleDateString()}</div>
                  <div className="mt-1 text-sm font-semibold">{((Number(r.duracao) || 0) / 60).toFixed(1)}m</div>
                  <div className="text-[11px] text-gray-500">{(r.exerciciosFeito || r.exerciciosFeitos || []).reduce((a, ex) => a + (Number(ex.seriesConcluidas) || 0), 0)} séries</div>
                </div>
              ))}
            </div>

            {/* mobile: horizontal scroll */}
            <div className="sm:hidden -mx-2 mt-2">
              <div className="flex gap-2 overflow-x-auto px-2">
                {rows.map((r, i) => (
                  <div key={i} style={{ minWidth: 180 }} className={`${isDark ? "bg-gray-700" : "bg-gray-50"} p-3 rounded-lg border ${isDark ? "border-gray-600" : "border-gray-200"}`}>
                    <div className="font-medium truncate">{r.treinoName}</div>
                    <div className="text-[11px] text-gray-400">{r.dataExecucao?.toLocaleDateString()}</div>
                    <div className="mt-1 text-sm font-semibold">{((Number(r.duracao) || 0) / 60).toFixed(1)}m</div>
                    <div className="text-[11px] text-gray-500">{(r.exerciciosFeito || r.exerciciosFeitos || []).reduce((a, ex) => a + (Number(ex.seriesConcluidas) || 0), 0)} séries</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* right column: details (collapses under chart on small) */}
        {!summary && (
          <aside className="flex-shrink-0 w-full ">
            <div className={`${isDark ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"} rounded-2xl p-4 border`}>
              <div className="text-xs text-gray-400 mb-2">Detalhes da última sessão</div>
              {meta.latest ? (
                <>
                  <div className="font-semibold">{meta.latest.treinoName}</div>
                  <div className="text-xs text-gray-400">{meta.latest.dataExecucao?.toLocaleString()}</div>
                  <div className="mt-2 text-sm">Duração: <strong>{((Number(meta.latest.duracao) || 0) / 60).toFixed(1)} min</strong></div>
                  <div className="mt-2 text-sm">Séries totais: <strong>{(meta.latest.exerciciosFeito || meta.latest.exerciciosFeitos || []).reduce((a, ex) => a + (Number(ex.seriesConcluidas) || 0), 0)}</strong></div>

                  <div className="mt-3 text-xs text-gray-400">Exercícios</div>
                  <div className="mt-2 space-y-2 max-h-56 overflow-auto pr-2">
                    {(meta.latest.exerciciosFeito || meta.latest.exerciciosFeitos || []).map((ex, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <div className="truncate">{ex.nome}</div>
                        <div className="text-sm text-gray-300">{(Number(ex.seriesConcluidas) || 0)}x{ex.repeticoesPorSerie || "-"}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-400">Sem dados</div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default HistoricoChart;
