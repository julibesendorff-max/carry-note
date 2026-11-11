// api/auto-notes.js — Carry Note · Generación automática de análisis
//
// Se ejecuta por Vercel Cron. Busca noticias macro/empresas relevantes de las
// últimas horas, decide si hay algo que amerite una nota, y si es así la escribe
// y la publica en Supabase.
//
// Requiere en variables de entorno:
//   ANTHROPIC_KEY  (ya existe, la usa /api/portafolio)
//   SUPABASE_URL   (opcional — si no está, usa el valor por defecto de abajo)
//   SUPABASE_KEY   (opcional — idem)
//   CRON_SECRET    (opcional — protege el endpoint de ejecuciones ajenas)
//
// Config:
//   AUTO_PUBLISH = true  -> publica directo
//   AUTO_PUBLISH = false -> guarda como borrador (tag 'borrador') para revisar

const AUTO_PUBLISH = true;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fhswsvjkkmnhlbdnozoe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZoc3dzdmpra21uaGxiZG5vem9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MzA5OTQsImV4cCI6MjA5MDMwNjk5NH0.eKxP2ltiL1uB2NpoIzOD4O6bYKyXvsCs4bEaflXd1O0';

// ── Helpers Supabase ──────────────────────────────────────────────────
async function sb(path, opts = {}) {
  return fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      ...(opts.headers || {})
    }
  });
}

// Títulos de las últimas notas, para que no repita temas
async function recentTitles(n = 12) {
  try {
    const r = await sb(`/rest/v1/notes?select=title,created_at&order=created_at.desc&limit=${n}`);
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.map(x => x.title);
  } catch { return []; }
}

// ── Extrae bloques delimitados de la respuesta ────────────────────────
function extract(raw, key) {
  const m = raw.match(new RegExp('===' + key + '===\\s*([\\s\\S]*?)(?====|$)'));
  return m ? m[1].trim() : '';
}

export default async function handler(req, res) {
  // Protección: solo Vercel Cron o alguien con el secreto
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

  const hoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  const previos = await recentTitles();
  const evitar = previos.length
    ? `\n\nNOTAS YA PUBLICADAS RECIENTEMENTE (NO repitas estos temas ni los reescribas):\n- ${previos.join('\n- ')}`
    : '';

  const system = `Sos un economista senior y analista de mercados radicado en Buenos Aires que escribe para Carry Note, una publicación de análisis económico para inversores argentinos. Escribís en español rioplatense, con criterio propio y sin relleno.

Tu tarea tiene DOS pasos:

PASO 1 — Buscá con web_search las noticias macroeconómicas y de mercados de las últimas 24-48 horas que sean relevantes para un inversor argentino. Mirá: decisiones de bancos centrales, datos de inflación/empleo, movimientos fuertes en tasas o commodities, resultados de empresas grandes, y novedades de Argentina (BCRA, Tesoro, riesgo país, tipo de cambio).

PASO 2 — Decidí si hay algo que realmente amerite una nota.

CRITERIO PARA DECIDIR: solo escribí si hay un hecho CONCRETO y NUEVO de las últimas 48 horas con impacto real para un inversor argentino. Un día sin novedades relevantes es normal y es perfectamente válido no publicar nada. NO escribas por escribir, no recicles temas viejos, no hagas notas genéricas tipo "el mercado sigue atento a la Fed".

SI NO HAY NADA QUE AMERITE UNA NOTA, respondé exactamente:
===SKIP===
motivo breve

SI SÍ HAY ALGO, respondé con este formato exacto:
===TITLE===
(título, máximo 10 palabras, concreto, sin clickbait)
===SUBTITLE===
(bajada de máximo 35 palabras que resuma la tesis)
===BODY===
(HTML con <p> para párrafos, <h3> para subtítulos, y <div class='key-stat'>dato clave</div> para cifras importantes. Mínimo 5 párrafos. Arrancá con la tesis central, no con contexto genérico. Citá cifras concretas con su fuente. Cerrá con qué implica para el inversor argentino.)
===TAG===
(uno solo de: macro, geo, markets, policy, latam)`;

  const userMsg = `Hoy es ${hoy}. Buscá las noticias macro y de mercados de las últimas 24-48 horas y decidí si hay algo que amerite una nota de Carry Note.${evitar}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!r.ok) {
      const e = await r.text().catch(() => '');
      return res.status(502).json({ error: 'Anthropic ' + r.status, detail: e.slice(0, 300) });
    }

    const data = await r.json();
    const txt = (data.content || [])
      .map(i => (i.type === 'text' ? i.text : ''))
      .join('')
      .trim();

    // El modelo decidió que no hay nada relevante
    if (txt.includes('===SKIP===')) {
      const motivo = extract(txt, 'SKIP') || 'sin novedades relevantes';
      return res.status(200).json({ published: false, reason: motivo });
    }

    const note = {
      title: extract(txt, 'TITLE'),
      subtitle: extract(txt, 'SUBTITLE'),
      body: extract(txt, 'BODY'),
      tag: (extract(txt, 'TAG') || 'macro').toLowerCase().trim()
    };

    if (!note.title || !note.body) {
      return res.status(200).json({ published: false, reason: 'respuesta incompleta del modelo' });
    }

    const tagsOk = ['macro', 'geo', 'markets', 'policy', 'latam', 'semanal'];
    if (!tagsOk.includes(note.tag)) note.tag = 'macro';
    if (!AUTO_PUBLISH) note.tag = 'borrador';

    const ins = await sb('/rest/v1/notes', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(note)
    });

    if (!ins.ok) {
      const e = await ins.text().catch(() => '');
      return res.status(502).json({ error: 'Supabase ' + ins.status, detail: e.slice(0, 300) });
    }

    // Avisar a los suscriptos (solo si se publicó de verdad)
    if (AUTO_PUBLISH) {
      try {
        const base = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'https://www.thecarrynote.com';
        await fetch(`${base}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: 'carrynote2025', title: note.title, subtitle: note.subtitle })
        });
      } catch { /* el newsletter no debe romper la publicación */ }
    }

    return res.status(200).json({
      published: true,
      draft: !AUTO_PUBLISH,
      title: note.title,
      tag: note.tag
    });

  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
