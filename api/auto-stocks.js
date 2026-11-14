// api/auto-stocks.js — Carry Note · Análisis fundamental automático
//
// Una corrida diaria publica 2-3 análisis de acciones. Rota la cobertura entre
// sectores (tech, consumo, salud, financiero, energía, Argentina) eligiendo las
// que hace más tiempo no se cubren.
//
// Los precios y fundamentals se traen de Finnhub del lado del servidor y se le
// pasan al modelo como dato duro, para que no invente niveles.
//
// Requiere: ANTHROPIC_KEY (ya configurada).

const NOTAS_POR_DIA = 1;
const AUTO_PUBLISH  = true;

const FINNHUB_KEY  = 'd74n2ihr01qg1eo64720d74n2ihr01qg1eo6472g';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fhswsvjkkmnhlbdnozoe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoc3dzdmpra21uaGxiZG5vem9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzA5OTQsImV4cCI6MjA5MDMwNjk5NH0.eKxP2ltiL1uB2NpoIzOD4O6bYKyXvsCs4bEaflXd1O0';

// ── Universo de cobertura ─────────────────────────────────────────────
const UNIVERSO = [
  // Tecnología
  { t:'NVDA',  n:'NVIDIA',              sector:'Tecnología' },
  { t:'GOOGL', n:'Alphabet',            sector:'Tecnología' },
  { t:'MSFT',  n:'Microsoft',           sector:'Tecnología' },
  { t:'META',  n:'Meta',                sector:'Tecnología' },
  { t:'AAPL',  n:'Apple',               sector:'Tecnología' },
  { t:'AMZN',  n:'Amazon',              sector:'Tecnología' },
  { t:'MU',    n:'Micron',              sector:'Semiconductores' },
  { t:'AMD',   n:'AMD',                 sector:'Semiconductores' },
  { t:'AVGO',  n:'Broadcom',            sector:'Semiconductores' },
  { t:'TSM',   n:'TSMC',                sector:'Semiconductores' },
  { t:'PLTR',  n:'Palantir',            sector:'Software' },
  { t:'ORCL',  n:'Oracle',              sector:'Software' },
  { t:'CRM',   n:'Salesforce',          sector:'Software' },
  // Consumo
  { t:'KO',    n:'Coca-Cola',           sector:'Consumo defensivo' },
  { t:'PG',    n:'Procter & Gamble',    sector:'Consumo defensivo' },
  { t:'WMT',   n:'Walmart',             sector:'Consumo defensivo' },
  { t:'COST',  n:'Costco',              sector:'Consumo defensivo' },
  { t:'PEP',   n:'PepsiCo',             sector:'Consumo defensivo' },
  { t:'MCD',   n:'McDonald\'s',         sector:'Consumo discrecional' },
  { t:'NKE',   n:'Nike',                sector:'Consumo discrecional' },
  { t:'SBUX',  n:'Starbucks',           sector:'Consumo discrecional' },
  // Salud
  { t:'JNJ',   n:'Johnson & Johnson',   sector:'Salud' },
  { t:'UNH',   n:'UnitedHealth',        sector:'Salud' },
  { t:'LLY',   n:'Eli Lilly',           sector:'Salud' },
  { t:'PFE',   n:'Pfizer',              sector:'Salud' },
  { t:'ABBV',  n:'AbbVie',              sector:'Salud' },
  { t:'MRK',   n:'Merck',               sector:'Salud' },
  // Financiero
  { t:'JPM',   n:'JPMorgan Chase',      sector:'Financiero' },
  { t:'BAC',   n:'Bank of America',     sector:'Financiero' },
  { t:'GS',    n:'Goldman Sachs',       sector:'Financiero' },
  { t:'V',     n:'Visa',                sector:'Pagos' },
  { t:'MA',    n:'Mastercard',          sector:'Pagos' },
  { t:'NU',    n:'Nu Holdings',         sector:'Fintech · Latam' },
  // Energía
  { t:'XOM',   n:'ExxonMobil',          sector:'Energía' },
  { t:'CVX',   n:'Chevron',             sector:'Energía' },
  // Argentina / Latam
  { t:'YPF',   n:'YPF',                 sector:'Energía · Argentina' },
  { t:'GGAL',  n:'Grupo Galicia',       sector:'Financiero · Argentina' },
  { t:'BMA',   n:'Banco Macro',         sector:'Financiero · Argentina' },
  { t:'PAM',   n:'Pampa Energía',       sector:'Energía · Argentina' },
  { t:'MELI',  n:'MercadoLibre',        sector:'E-commerce · Latam' },
  { t:'GLOB',  n:'Globant',             sector:'Software · Latam' },
];

// ── Supabase ──────────────────────────────────────────────────────────
async function sb(path, opts = {}) {
  return fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      ...(opts.headers || {})
    }
  });
}

// Elige qué empresa cubrir hoy.
// Prioriza las que hace más tiempo no se analizan, pero no bloquea repetir:
// si una empresa ya rotó hace rato, puede volver a salir (y el modelo decide
// si el contexto cambió lo suficiente como para justificar la nota).
const MIN_DIAS_PARA_REPETIR = 10;

async function elegirTickers(n) {
  let recientes = [];
  try {
    const r = await sb('/rest/v1/notes?select=title,created_at&order=created_at.desc&limit=80');
    if (r.ok) recientes = await r.json();
  } catch { /* si falla, se elige al azar */ }

  const ahora = Date.now();
  const score = UNIVERSO.map(u => {
    // Nota más reciente que mencione esta empresa
    const hit = recientes.find(x => {
      const t = (x.title || '').toUpperCase();
      return t.includes(u.t) || t.includes(u.n.toUpperCase());
    });
    const dias = hit
      ? Math.floor((ahora - new Date(hit.created_at).getTime()) / 86400000)
      : 9999;
    return { ...u, dias };
  });

  // Más días sin cobertura = más prioridad. Desempate al azar.
  score.sort((a, b) => (b.dias - a.dias) || (Math.random() - 0.5));

  // Elegibles: las que superan el mínimo de días. Si ninguna lo supera
  // (universo chico o mucha actividad), se toma igual la más vieja.
  const elegibles = score.filter(s => s.dias >= MIN_DIAS_PARA_REPETIR);
  const pool = elegibles.length >= n ? elegibles : score;

  // Entre las candidatas más postergadas, variar un poco el orden para no
  // volverse predecible: se sortea dentro del tercio superior.
  const top = pool.slice(0, Math.max(n, Math.ceil(pool.length / 3)));
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [top[i], top[j]] = [top[j], top[i]];
  }
  return top.slice(0, n);
}

// ── Datos de mercado reales ───────────────────────────────────────────
async function datosDe(ticker) {
  const q = (u) => fetch(u).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  const [quote, metric] = await Promise.all([
    q(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`),
    q(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FINNHUB_KEY}`)
  ]);
  const m = metric?.metric || {};
  const px = quote?.c, prev = quote?.pc;
  if (!px) return null;

  const pct   = prev ? ((px - prev) / prev) * 100 : null;
  const hi52  = m['52WeekHigh'], lo52 = m['52WeekLow'];
  const vsHi  = hi52 ? ((px - hi52) / hi52) * 100 : null;
  const vsLo  = lo52 ? ((px - lo52) / lo52) * 100 : null;

  const linea = [];
  linea.push(`Precio actual: $${px.toFixed(2)}`);
  if (pct !== null) linea.push(`Variación del día: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
  if (hi52 && lo52) {
    linea.push(`Rango 52 semanas: $${lo52.toFixed(2)} – $${hi52.toFixed(2)}`);
    linea.push(`Está ${vsHi >= 0 ? '+' : ''}${vsHi.toFixed(1)}% respecto del máximo de 52 semanas`);
    linea.push(`Está ${vsLo >= 0 ? '+' : ''}${vsLo.toFixed(1)}% respecto del mínimo de 52 semanas`);
  }
  if (m.peTTM)            linea.push(`P/E (TTM): ${Number(m.peTTM).toFixed(1)}`);
  if (m.pbQuarterly)      linea.push(`P/B: ${Number(m.pbQuarterly).toFixed(2)}`);
  if (m.psTTM)            linea.push(`P/S (TTM): ${Number(m.psTTM).toFixed(2)}`);
  if (m.roeTTM)           linea.push(`ROE (TTM): ${Number(m.roeTTM).toFixed(1)}%`);
  if (m.netProfitMarginTTM) linea.push(`Margen neto (TTM): ${Number(m.netProfitMarginTTM).toFixed(1)}%`);
  if (m.revenueGrowthTTMYoy) linea.push(`Crecimiento de ingresos YoY: ${Number(m.revenueGrowthTTMYoy).toFixed(1)}%`);
  if (m.epsGrowthTTMYoy)  linea.push(`Crecimiento de EPS YoY: ${Number(m.epsGrowthTTMYoy).toFixed(1)}%`);
  if (m.currentDividendYieldTTM) linea.push(`Dividend yield: ${Number(m.currentDividendYieldTTM).toFixed(2)}%`);
  if (m.beta)             linea.push(`Beta: ${Number(m.beta).toFixed(2)}`);
  if (m['3MonthADReturnStd']) linea.push(`Volatilidad 3M: ${Number(m['3MonthADReturnStd']).toFixed(1)}`);

  return linea.join('\n- ');
}

function extract(raw, key) {
  const m = raw.match(new RegExp('===' + key + '===\\s*([\\s\\S]*?)(?====|$)'));
  return m ? m[1].trim() : '';
}

// ── Generar una nota ──────────────────────────────────────────────────
async function generarNota(emp, key, hoy) {
  const esRepetida = emp.dias !== undefined && emp.dias < 9999;
  const datos = await datosDe(emp.t);
  if (!datos) return { ok: false, ticker: emp.t, reason: 'sin datos de mercado' };

  const system = `Sos un analista de equity senior que escribe para Carry Note, una publicación de análisis para inversores argentinos. Escribís en español rioplatense, directo y sin relleno.

Escribís análisis fundamental con foco en el CORTO PLAZO (próximas semanas a 3 meses).

REGLA CRÍTICA SOBRE DATOS: los precios, múltiplos y rangos que te paso abajo son los ÚNICOS válidos. No uses precios de tu memoria porque están desactualizados. Si decís que la acción está cerca o lejos de máximos, usá exclusivamente el dato "% respecto del máximo de 52 semanas" que te doy. Inventar o contradecir esos números es un error grave.

Usá web_search para buscar noticias recientes de la empresa: últimos resultados trimestrales, guidance, novedades del sector, cambios de recomendación de analistas.

Estructura del análisis:
1. Dónde está parada la acción hoy (precio, posición en el rango, qué viene haciendo)
2. Qué dicen los fundamentals (múltiplos, márgenes, crecimiento) y si están caros o baratos para su historia y su sector
3. Catalizadores concretos de corto plazo (earnings, guidance, eventos del sector)
4. Riesgos concretos de corto plazo
5. Qué mirar: tu lectura para las próximas semanas, con el matiz que corresponda

Para el inversor argentino, si aplica, mencioná que se accede vía CEDEAR.

Respondé EXACTAMENTE con este formato:
===TITLE===
(título con el nombre de la empresa, máximo 10 palabras, concreto)
===SUBTITLE===
(bajada de máximo 35 palabras con la tesis)
===BODY===
(HTML con <p>, <h3> para secciones y <div class='key-stat'>dato clave</div> para cifras. Mínimo 5 párrafos.)`;

  const nota_repetida = esRepetida
    ? `\n\nATENCIÓN: ya publicamos un análisis de esta empresa hace ${emp.dias} días. Enfocá la nota en lo que CAMBIÓ desde entonces: movimiento del precio, resultados nuevos, cambios en el guidance o en el contexto del sector. No repitas la tesis anterior como si fuera nueva. Si de verdad no cambió nada relevante, decilo con franqueza y explicá por qué la tesis sigue en pie.`
    : '';

  const user = `Hoy es ${hoy}. Escribí el análisis fundamental de corto plazo de ${emp.n} (${emp.t}), sector ${emp.sector}.

DATOS DE MERCADO REALES (fuente Finnhub, son los únicos válidos):
- ${datos}

Buscá noticias recientes de la empresa antes de escribir.${nota_repetida}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!r.ok) return { ok: false, ticker: emp.t, reason: 'Anthropic ' + r.status };

  const data = await r.json();
  const txt = (data.content || []).map(i => (i.type === 'text' ? i.text : '')).join('').trim();

  const nota = {
    title:    extract(txt, 'TITLE'),
    subtitle: extract(txt, 'SUBTITLE'),
    body:     extract(txt, 'BODY'),
    tag:      'markets'
  };
  if (!nota.title || !nota.body) return { ok: false, ticker: emp.t, reason: 'respuesta incompleta' };
  if (!AUTO_PUBLISH) nota.tag = 'borrador';

  // Disclaimer propio de análisis de acciones
  nota.body += `<div style="margin-top:1.5rem;padding:0.9rem 1.1rem;border:1px solid #e8c8c8;border-left:3px solid #c62036;background:#fff8f8;font-size:0.8rem;color:#6b4a3a;line-height:1.6">Análisis de carácter informativo y educativo elaborado con datos de mercado al ${hoy}. No constituye recomendación de compra o venta ni asesoramiento financiero. Las decisiones de inversión son responsabilidad exclusiva del inversor.</div>`;

  const ins = await sb('/rest/v1/notes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(nota)
  });
  if (!ins.ok) return { ok: false, ticker: emp.t, reason: 'Supabase ' + ins.status };

  return { ok: true, ticker: emp.t, title: nota.title };
}

// ── Handler ───────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const qs = req.query?.key || '';
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  }

  const key = process.env.ANTHROPIC_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_KEY no configurada' });

  const cuantas = Math.min(parseInt(req.query?.n) || NOTAS_POR_DIA, 5);
  const hoy = new Date().toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  try {
    const elegidos = await elegirTickers(cuantas);
    const resultados = [];
    // En serie: evita rate limits de Finnhub y de la API
    for (const emp of elegidos) {
      resultados.push(await generarNota(emp, key, hoy));
    }
    return res.status(200).json({
      fecha: hoy,
      publicadas: resultados.filter(r => r.ok).length,
      detalle: resultados
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
