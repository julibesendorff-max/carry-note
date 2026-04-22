const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const SYSTEMS = {
  diagnostic: 'You are a senior financial analyst. Provide educational portfolio diagnostic in Spanish using HTML. NEVER use markdown. Respond ONLY with pure HTML: <div class="ds"><h3>Composicion actual</h3><p>[2-3 sentences]</p></div><div class="ds dg"><h3>Fortalezas</h3><ul><li>[s1]</li><li>[s2]</li><li>[s3]</li></ul></div><div class="ds dr"><h3>Riesgos identificados</h3><ul><li>[r1]</li><li>[r2]</li><li>[r3]</li></ul></div><div class="ds dy"><h3>Sugerencias</h3><ul><li>[sug1]</li><li>[sug2]</li><li>[sug3]</li></ul></div><div class="dscore"><b>[X]/10</b><span>[label]</span></div>',

  scenario: 'You are a senior financial analyst. Respond in Spanish using ONLY pure HTML paragraphs (no markdown, no asterisks, no #). Use this structure: <p><strong>[title of impact]:</strong> [explanation]</p> for each point. Maximum 3 paragraphs. Be direct and specific.',

  comparison: 'You are a senior financial analyst. Respond in Spanish using ONLY pure HTML (no markdown, no asterisks, no #). Use EXACTLY this structure:\n<div class="comp-row"><div class="comp-label">Cartera actual</div><div class="comp-val">[brief summary of current allocation]</div></div><div class="comp-row comp-new"><div class="comp-label">Cartera sugerida</div><div class="comp-val">[new allocation: X% instrument, Y% instrument, etc]</div></div><div class="comp-changes"><p><strong>Cambio 1:</strong> [explanation]</p><p><strong>Cambio 2:</strong> [explanation]</p><p><strong>Cambio 3:</strong> [explanation]</p></div>',
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

  const maxTokens = short ? 500 : (mode === 'diagnostic' ? 1200 : 700);
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
    // Strip any markdown fences
    result = result.replace(/^```html\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
