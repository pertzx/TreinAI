import React, { useMemo } from "react";
import Chart from "react-apexcharts";
import PropTypes from "prop-types";

/**
 * TokensChart
 * Props:
 *  - user: objeto user (usa user.stats.tokens)
 *  - tokens: alternativa para passar array direto [{ valor|value, data|date|createdAt }, ...]
 *  - days: número de dias para exibir (padrão 14)
 *  - tema: 'dark' | 'light'
 *
 * Uso:
 *  <TokensChart user={user} days={14} tema="dark" />
 */

function brazilDayKey(d) {
  try {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  } catch (err) {
    return (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
  }
}

function formatDayLabel(dayKey) {
  // dayKey expected "YYYY-MM-DD"
  try {
    const [y, m, dd] = String(dayKey).split("-");
    return `${dd}/${m}`;
  } catch (e) {
    return dayKey;
  }
}

export default function TokensChart({ user, tokens, days = 14, tema = "dark" }) {
  const isLight = tema === "light";

  const tokensArray = useMemo(() => {
    if (Array.isArray(tokens)) return tokens;
    if (user && Array.isArray(user?.stats?.tokens)) return user.stats.tokens;
    return [];
  }, [user, tokens]);

  // cria lista de últimos N dias (do mais antigo -> mais recente)
  const daysList = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      out.push(brazilDayKey(d));
    }
    return out;
  }, [days]);

  // agrega tokens por dayKey
  const aggregated = useMemo(() => {
    const map = new Map();
    for (const entry of tokensArray) {
      const v = Number(entry?.valor ?? entry?.value ?? 0);
      if (!Number.isFinite(v)) continue;
      const dateField = entry?.data ?? entry?.date ?? entry?.createdAt ?? entry?.publishedAt ?? null;
      const key = dateField ? brazilDayKey(dateField) : brazilDayKey(new Date());
      map.set(key, (map.get(key) || 0) + v);
    }

    const data = [];
    let cumulative = 0;
    for (const dayKey of daysList) {
      const dayVal = map.get(dayKey) || 0;
      cumulative += dayVal;
      data.push({
        dayKey,
        label: formatDayLabel(dayKey),
        tokens: Math.round(dayVal),
        cumulative: Math.round(cumulative),
      });
    }
    return data;
  }, [tokensArray, daysList]);

  // preparar series para apex
  const series = useMemo(() => {
    return [
      {
        name: "Tokens/dia",
        type: "column",
        data: aggregated.map((d) => d.tokens),
      },
      {
        name: "Cumulativo",
        type: "line",
        data: aggregated.map((d) => d.cumulative),
      },
    ];
  }, [aggregated]);

  const options = useMemo(() => {
    const primaryColor = isLight ? "#2563eb" : "#60a5fa"; // azul
    const lineColor = isLight ? "#059669" : "#34d399"; // verde
    const textColor = isLight ? "#111827" : "#e5e7eb";
    const gridColor = isLight ? "#e6edf3" : "#1f2937";

    return {
      chart: {
        toolbar: { show: false },
        height: 320,
        type: "line",
        zoom: { enabled: false },
        foreColor: textColor,
        animations: { enabled: true },
      },
      stroke: {
        width: [0, 3],
        curve: "smooth",
      },
      plotOptions: {
        bar: {
          columnWidth: "60%",
          borderRadius: 6,
        },
      },
      dataLabels: {
        enabled: false,
      },
      colors: [primaryColor, lineColor],
      xaxis: {
        categories: aggregated.map((d) => d.label),
        labels: {
          style: { colors: aggregated.map(() => textColor) },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: [
        {
          title: { text: undefined },
          labels: { style: { colors: textColor } },
        },
      ],
      grid: {
        borderColor: gridColor,
        strokeDashArray: 3,
      },
      tooltip: {
        theme: isLight ? "light" : "dark",
        x: {
          formatter: function (val, opts) {
            // val = label like '07/09' ; we can show full dayKey if we want
            const idx = opts.dataPointIndex;
            const dayKey = aggregated[idx]?.dayKey;
            const dt = new Date(`${dayKey}T00:00:00Z`);
            // show dayKey + localized full date in Brazil timezone (fallback)
            let full;
            try {
              full = new Date(aggregated[idx].dayKey + "T00:00:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch (e) {
              full = dayKey;
            }
            return `${val} — ${full}`;
          },
        },
        y: {
          formatter: function (val, opts) {
            return `${val}`;
          },
        },
        shared: true,
      },
      legend: {
        position: "top",
        horizontalAlign: "right",
        labels: { colors: textColor },
      },
      responsive: [
        {
          breakpoint: 768,
          options: {
            plotOptions: { bar: { columnWidth: "70%" } },
            xaxis: { labels: { rotate: -45, rotateAlways: true } },
          },
        },
      ],
    };
  }, [aggregated, isLight]);

  if (!aggregated.length) {
    return (
      <div className={`p-4 rounded-lg ${isLight ? "bg-white" : "bg-gray-800"}`}>
        <div className={`text-sm ${isLight ? "text-gray-700" : "text-gray-200"}`}>Nenhum registro de tokens disponível.</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className={`text-sm font-medium ${isLight ? "text-gray-700" : "text-gray-200"}`}>Tokens (últimos {days} dias)</div>
        <div className={`text-xs ${isLight ? "text-gray-500" : "text-gray-400"}`}>Fuso: America/Sao_Paulo</div>
      </div>

      <Chart options={options} series={series} type="line" height={320} />
    </div>
  );
}

TokensChart.propTypes = {
  user: PropTypes.object,
  tokens: PropTypes.array,
  days: PropTypes.number,
  tema: PropTypes.oneOf(["dark", "light"]),
};
