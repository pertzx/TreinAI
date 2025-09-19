import { DateTime } from 'luxon';

/**
 * 1) Retorna um Date que representa o MESMO INSTANTE que Date.now()
 *    -> recomendado quando você quer interoperabilidade/timestamps
 *    -> exemplo: a.getTime() === Date.now()
 */
export function getBrazilDate() {
  const millis = DateTime.now().setZone('America/Sao_Paulo').toMillis();

  // console.log(Date.now)
  // console.log(millis)
  return millis; // em prática = new Date(Date.now()) (se relógio OK)
}

/**
 * 2) Retorna um Date onde os COMPONENTES (ano, mês, dia, hora, minuto, segundo)
 *    correspondem ao relógio de 'America/Sao_Paulo'.
 *
 *    Observação importante:
 *      - Este Date foi criado com Date.UTC(...) usando os componentes Brasil.
 *      - Assim, date.getUTC*() === componentes do Brasil.
 *      - Porém date.getHours() (local do ambiente) vai refletir o fuso DA MÁQUINA.
 *      - toISOString() irá mostrar a mesma data/hora (os valores do Brasil) com 'Z'.
 *
 *    Use isso quando você precisa de um Date cuja representação UTC contenha
 *    exatamente os valores do relógio brasileiro (ex.: para gerar imagens/exports
 *    que precisam mostrar a hora local do Brasil sem depender do fuso da máquina).
 */
export function getBrazilDate_wallClockAsUTC() {
  const dt = DateTime.now().setZone('America/Sao_Paulo');
  const y = dt.year;
  const m = dt.month; // 1..12
  const d = dt.day;
  const h = dt.hour;
  const min = dt.minute;
  const s = dt.second;
  const ms = dt.millisecond;

  // Cria um Date usando os componentes como se fossem UTC.
  // Ex.: se Brasil agora é 2025-09-07 21:02:31.554 (-03), o novo Date terá
  //      toISOString() === '2025-09-07T21:02:31.554Z'
  return new Date(Date.UTC(y, m - 1, d, h, min, s, ms));
}
