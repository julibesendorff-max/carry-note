const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const SYSTEMS = {
  diagnostic: 'You are a senior financial analyst. Provide educational portfolio diagnostic in Spanish using HTML. Be concise. NEVER use markdown fences or backticks. Respond ONLY with pure HTML: <div class="ds"><h3>Composicion actual</h3><p>[2-3 sentences max]</p></div><div class="ds dg"><h3>Fortalezas</h3><ul><li>[s1]</li><li>[s2]</li><li>[s3]</li></ul></div><div class="ds dr"><h3>Riesgos identificados</h3><ul><li>[r1]</li><li>[r2]</li><li>[r3]</li></ul></div><div class="ds dy"><h3>Sugerencias</h3><ul><li>[sug1]</li><li>[sug2]</li><li>[sug3]</li></ul></div><div class="dscore"><b>[X]/10</b><span>[label]</span></div>',

  scenario: 'You are a senior financial analyst. In Spanish, respond in pure HTML paragraphs only (no markdown, no backticks). In 3-4 short paragraphs max, explain: 1) How this scenario affects the portfolio. 2) Which assets benefit or suffer most. 3) One concrete action to take. Be direct and specific. No fluff.',

  scenario_short: 'You are a senior financial analyst. In Spanish, respond in pure HTML paragraphs only (no markdown). In 2-3 short paragraphs, briefly explain how this scenario affects the portfolio and one concrete action to consider. Be direct.',

  comparison: 'You are a senior financial analyst. In Spanish using HTML, propose an optimized alternative portfolio. Format: <p><strong>Cartera actual:</strong> brief summary</p><p><strong>Cartera sugerida:</strong> new allocation with percentages</p><p><strong>Cambios clave:</strong> 2-3 specific changes with brief rationale</p>',

  comparison_short: 'You are a senior financial analyst. In Spanish, briefly propose an alternative portfolio in 3 bullet points max. Include specific instruments and percentages. Be concise.',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { assets, horizonte, riesgo, liveData, scenario, mode = 'diagnostic', short = false } = req.body;
  if (!assets || !assets.length) return res.status(400).json({ error: 'Sin activos' });

  const horizonMap = { corto:'corto plazo (menos de 1 año)', medio:'mediano plazo (1-3 años)', largo:'largo plazo (más de 3 años)' };
  const portfolioText = assets.map(a => `- ${a.tipo}: ${a.moneda==='ARS'?'$':'USD '}${a.monto.toLocaleString()} ${a.moneda}`).join('\n');

  let userContent = `Perfil: horizonte ${horizonMap[horizonte]||horizonte}, riesgo ${riesgo}.\n\nCartera:\n${portfolioText}\n\n${liveData||''}`;
  if (mode === 'scenario' && scenario) userContent += `\n\n${scenario}`;

  // Select system prompt - use short version when requested
  let systemKey = mode;
  if (short && mode === 'scenario') systemKey = 'scenario_short';
  if (short && mode === 'comparison') systemKey = 'comparison_short';

  // Use fewer tokens for short mode
  const maxTokens = short ? 600 : (mode === 'diagnostic' ? 1200 : 900);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: SYSTEMS[systemKey] || SYSTEMS[mode] || SYSTEMS.diagnostic,
        messages: [{ role: 'user', content: userContent }]
      })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message||'API error'); }
    const data = await response.json();
    return res.status(200).json({ result: data.content.map(i=>i.type==='text'?i.text:'').join('').trim() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
