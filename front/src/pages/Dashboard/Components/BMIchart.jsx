import React, { useMemo } from "react";
import Chart from "react-apexcharts";

/**
 * BMIChart
 * Props:
 *  - tema: 'dark' | 'light'
 *  - pesoHistory: [{ id, valor: Number, publicadoEm: Date|string }]
 *  - alturaHistory: [{ id, valor: Number (cm), publicadoEm: Date|string }]
 *  - targetBMI: Number (default 22.5)
 *  - targetPeso: Number (optional) — if provided overrides targetBMI
 *  - heightForCalcCm: Number (optional) — force height for BMI calc
 *
 * Usage:
 * <BMIChart tema="dark" pesoHistory={pesoHistory} alturaHistory={alturaHistory} targetBMI={22.5} />
 */
const BMIChart = ({
  tema,
  pesoHistory = [],
  alturaHistory = [],
  targetBMI = 22.5,
  targetPeso = null,
  heightForCalcCm = null,
}) => {
  const theme = tema === "dark" ? "dark" : "light";

  // helper: sort asc
  const sortAsc = (arr = []) => [...arr].sort((a, b) => new Date(a.publicadoEm) - new Date(b.publicadoEm));

  // build chart data + compute usedHeight
  const { labels, bmiSeries, latestPoint, usedHeightCm } = useMemo(() => {
    const pesos = sortAsc(pesoHistory).map((p) => ({
      ...p,
      publicadoEm: p.publicadoEm ? new Date(p.publicadoEm) : new Date(0),
    }));
    const alturas = sortAsc(alturaHistory).map((a) => ({
      ...a,
      publicadoEm: a.publicadoEm ? new Date(a.publicadoEm) : new Date(0),
    }));

    const findHeightForDate = (date) => {
      if (heightForCalcCm) return Number(heightForCalcCm);
      if (!alturas.length) return null;
      for (let i = alturas.length - 1; i >= 0; i--) {
        if (alturas[i].publicadoEm <= date) return Number(alturas[i].valor);
      }
      return Number(alturas[alturas.length - 1].valor);
    };

    const rows = pesos
      .map((p) => {
        const date = p.publicadoEm instanceof Date ? p.publicadoEm : new Date(p.publicadoEm);
        const hCm = findHeightForDate(date) || (alturas.length ? Number(alturas[alturas.length - 1].valor) : null);
        const hM = hCm ? hCm / 100 : null;
        const pesoKg = Number(p.valor);
        const bmi = hM && !Number.isNaN(pesoKg) ? +(pesoKg / (hM * hM)) : null;
        return {
          date,
          label: date.toLocaleDateString(),
          bmi: bmi !== null && Number.isFinite(bmi) ? +bmi.toFixed(2) : null,
          peso: Number.isFinite(pesoKg) ? pesoKg : null,
          heightUsedCm: hCm,
        };
      })
      .filter((r) => r.bmi !== null);

    const labels = rows.map((r) => r.label);
    const bmiSeries = rows.map((r) => r.bmi);
    const latestPoint = rows.length ? rows[rows.length - 1] : null;
    const usedHeightCm = heightForCalcCm
      ? Number(heightForCalcCm)
      : alturaHistory && alturaHistory.length
        ? Number(sortAsc(alturaHistory)[sortAsc(alturaHistory).length - 1].valor)
        : latestPoint
          ? latestPoint.heightUsedCm
          : null;

    return { labels, bmiSeries, latestPoint, usedHeightCm };
  }, [pesoHistory, alturaHistory, heightForCalcCm]);

  // resolved target BMI from targetPeso if provided
  const resolvedTargetBMI = useMemo(() => {
    const hCm = usedHeightCm;
    const hM = hCm ? hCm / 100 : null;
    if (targetPeso && hM) {
      return +(Number(targetPeso) / (hM * hM)).toFixed(2);
    }
    return +Number(targetBMI).toFixed(2);
  }, [targetBMI, targetPeso, usedHeightCm]);

  const currentBMI = latestPoint ? latestPoint.bmi : null;
  const currentPeso = latestPoint ? latestPoint.peso : null;
  const pesoNecessario =
    resolvedTargetBMI && usedHeightCm ? +((resolvedTargetBMI * Math.pow(usedHeightCm / 100, 2)).toFixed(1)) : null;
  const pesoDiff = pesoNecessario !== null && currentPeso !== null ? +(pesoNecessario - currentPeso).toFixed(1) : null;

  // Apex options: theme-aware colors + responsive
  const options = {
    chart: {
      id: "bmi-chart",
      toolbar: { show: true },
      zoom: { enabled: true },
      animations: { enabled: false },
      foreColor: theme === "dark" ? "#E5E7EB" : "#111827",
      background: "transparent",
    },
    stroke: { curve: "smooth", width: 3 },
    colors: [theme === "dark" ? "#60A5FA" : "#2563EB"],
    grid: {
      borderColor: theme === "dark" ? "#374151" : "#E6E6E6",
      padding: { left: 8, right: 8 },
    },
    xaxis: {
      categories: labels,
      labels: { rotate: labels.length > 6 ? -45 : 0, style: { colors: labels.map(() => (theme === "dark" ? "#D1D5DB" : "#374151")), fontSize: "12px" } },
    },
    yaxis: {
      labels: { formatter: (v) => Number.isFinite(v) ? v.toFixed(1) : v, style: { colors: theme === "dark" ? "#D1D5DB" : "#374151" } },
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      x: { show: true },
    },
    annotations: {
      yaxis: [
        {
          y: resolvedTargetBMI,
          borderColor: theme === "dark" ? "#FCA5A5" : "#EF4444",
          label: {
            borderColor: theme === "dark" ? "#FCA5A5" : "#EF4444",
            style: { color: theme === "dark" ? "#111827" : "#fff", background: theme === "dark" ? "#FCA5A5" : "#EF4444" },
            text: `IMC alvo ${resolvedTargetBMI}`,
            position: "right",
          },
        },
      ],
    },
    responsive: [
      {
        breakpoint: 900,
        options: {
          chart: { height: 300 },
          xaxis: { labels: { rotate: labels.length > 4 ? -30 : 0 } },
        },
      },
      {
        breakpoint: 520,
        options: {
          chart: { height: 220 },
          xaxis: { labels: { rotate: labels.length > 3 ? -45 : -20, style: { fontSize: "10px" } } },
          legend: { show: false },
        },
      },
    ],
    legend: { show: false },
  };

  const series = [{ name: "IMC", data: bmiSeries }];

  // Tailwind container: centered + responsive max width
  return (
    <div className={`${theme === "dark" ? "bg-gray-800 text-white" : "bg-white text-black"} rounded-2xl shadow p-4 w-full`}>
      <div className="flex flex-col gap-4 items-stretch">

        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">IMC</h3>
            <p className="text-xs text-gray-400">È um calculo usado para avaliar se a pessoa esta dentro do peso ideal em relação a altura.</p>
          </div>
        </div>

        {/* chart area: centered with max width so svg remains centered */}
        <div className="flex-1 min-w-0 flex justify-center">
          {bmiSeries && bmiSeries.length ? (
            <div className="w-full max-w-3xl mx-auto text-black">
              <Chart options={options} series={series} type="line" height={Math.max(220, Math.min(420, Math.floor((window?.innerWidth || 1200) * 0.28)))} />
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-400">Não há dados suficientes para gerar o gráfico de IMC.</div>
          )}
        </div>

        {/* summary column */}
        <div className="flex-shrink-0 items-center justify-center w-full flex flex-col gap-3">
          <div className={`${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"} w-full p-3 rounded-lg border`}>
            <div className="text-xs text-gray-400">IMC Atual</div>
            <div className="text-xl font-semibold">{currentBMI ?? "--"}</div>
            <div className="text-xs text-gray-400">{currentPeso ? `${currentPeso} kg — altura usada ${usedHeightCm ?? "--"} cm` : "Sem amostra atual"}</div>
          </div>

          <div className={`${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"} w-full p-3 rounded-lg border`}>
            <div className="text-xs text-gray-400">IMC Alvo</div>
            <div className="text-xl font-semibold" style={{ color: theme === "dark" ? "#FCA5A5" : "#EF4444" }}>{resolvedTargetBMI}</div>
            {pesoNecessario !== null && (
              <div className="text-xs text-gray-400">
                Peso necessário: <strong>{pesoNecessario} kg</strong>
                {pesoDiff !== null && <div className={`mt-1 text-sm ${pesoDiff > 0 ? "text-red-400" : "text-green-400"}`}>{pesoDiff > 0 ? `Precisa ganhar ${Math.abs(pesoDiff)} kg` : `Precisa perder ${Math.abs(pesoDiff)} kg`}</div>}
              </div>
            )}
          </div>

          <div className={`${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"} w-full p-3 rounded-lg border text-sm text-gray-400`}>
            <div className="font-medium mb-1">Detalhes</div>
            <div>Última amostra: {latestPoint ? latestPoint.date.toLocaleString() : "—"}</div>
            <div>Altura utilizada: {usedHeightCm ? `${usedHeightCm} cm` : "—"}</div>
            <div className="mt-2 text-xs">ApexCharts fornece responsividade nativa. Se o gráfico ainda ficar desalinhado, adicione <code>min-w-0</code> no contêiner pai flex.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BMIChart;
