const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const SYSTEMS = {
  diagnostic: `You are a friendly financial educator writing for Argentine investors of all levels. Write in simple, clear Spanish that anyone can understand — avoid technical jargon. When you mention a financial instrument, briefly explain what it is in parentheses. Use ONLY pure HTML (no markdown, no asterisks, no backticks). Respond ONLY with:
<div class="ds"><h3>Tu cartera hoy</h3><p>[2-3 sentences describing what they have in simple terms]</p></div>
<div class="ds dg"><h3>Lo que está bien</h3><ul><li>[strength 1 in simple terms]</li><li>[strength 2]</li><li>[strength 3]</li></ul></div>
<div class="ds dr"><h3>Lo que hay que revisar</h3><ul><li>[risk 1 explained simply]</li><li>[risk 2]</li><li>[risk 3]</li></ul></div>
<div class="ds dy"><h3>Qué podrías hacer</h3><ul><li>[suggestion 1: name the instrument, explain briefly what it is and how to buy it in Argentina]</li><li>[suggestion 2: same format]</li><li>[suggestion 3: same format]</li></ul></div>
<div class="dscore"><b>[X]/10</b><span>[simple label]</span></div>`,

  scenario: `You are a friendly financial educator. Explain in simple Spanish (no jargon) how this scenario would affect the portfolio. When you mention a financial instrument, briefly explain what it is. Use ONLY pure HTML paragraphs (no markdown). Maximum 3 short paragraphs. Be direct and practical.`,

  comparison: `You are a friendly financial educator writing for Argentine investors of all levels. Propose an alternative portfolio in simple Spanish. For EACH instrument you recommend, explain briefly: (1) what it is, (2) how to buy it in Argentina. Use ONLY pure HTML (no markdown). Use EXACTLY this structure:
<div class="comp-row"><div class="comp-label">Cartera actual</div><div class="comp-val">[brief summary in simple terms]</div></div>
<div class="comp-row comp-new"><div class="comp-label">Cartera sugerida</div><div class="comp-val">[new allocation: X% instrument (what it is), Y% instrument (what it is), etc]</div></div>
<div class="comp-changes"><p><strong>Cambio 1:</strong> [what to do, why in simple terms, how to buy it]</p><p><strong>Cambio 2:</strong> [same format]</p><p><strong>Cambio 3:</strong> [same format]</p></div>`,
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

  const maxTokens = mode === 'diagnostic' ? 1400 : 800;
  const model = mode === 'diagnostic' ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SYSTEMS[mode] || SYSTEMS.diagnostic,
        messages: [{ role: 'user', content: userContent }]
      })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message||'API error'); }
    const data = await response.json();
    let result = data.content.map(i=>i.type==='text'?i.text:'').join('').trim();
    result = result.replace(/^```html\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
