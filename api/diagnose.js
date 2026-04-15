const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const SYSTEMS = {
  diagnostic: 'You are a senior financial analyst specializing in Argentine and global markets. Provide educational portfolio diagnostic. Write in Spanish using HTML. Use the LIVE market data provided. Respond ONLY with: <div class="ds"><h3>Composicion actual</h3><p>[analysis]</p></div><div class="ds dg"><h3>Fortalezas</h3><ul><li>[s1]</li><li>[s2]</li><li>[s3]</li></ul></div><div class="ds dr"><h3>Riesgos identificados</h3><ul><li>[r1]</li><li>[r2]</li><li>[r3]</li></ul></div><div class="ds dy"><h3>Sugerencias de ajuste</h3><ul><li>[sug1]</li><li>[sug2]</li><li>[sug3]</li></ul></div><div class="dscore"><b>[X]/10</b><span>[alignment label]</span></div>',
  scenario: 'You are a senior financial analyst. Analyze the specific macro scenario impact on the given portfolio. Write in Spanish using plain HTML paragraphs. Be specific about which assets benefit or lose value. Give concrete actionable recommendations.',
  comparison: 'You are a senior financial analyst. Propose an optimized alternative portfolio for this investor profile. Write in Spanish using HTML. Format: <p><strong>Cartera actual:</strong> current allocation summary</p><p><strong>Cartera sugerida:</strong> specific new allocation with percentages</p><p><strong>Principales cambios:</strong> 3-4 specific changes with rationale</p><p><strong>Instrumentos recomendados:</strong> specific instruments with allocations</p>'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { assets, horizonte, riesgo, liveData, scenario, mode = 'diagnostic' } = req.body;
  if (!assets || !assets.length) return res.status(400).json({ error: 'Sin activos' });

  const horizonMap = { corto:'corto plazo (menos de 1 año)', medio:'mediano plazo (1-3 años)', largo:'largo plazo (más de 3 años)' };
  const portfolioText = assets.map(a => `- ${a.tipo}: ${a.moneda==='ARS'?'$':'USD '}${a.monto.toLocaleString()} ${a.moneda}`).join('\n');
  let userContent = `Perfil: horizonte ${horizonMap[horizonte]||horizonte}, riesgo ${riesgo}.\n\nCartera:\n${portfolioText}\n\n${liveData||''}`;
  if (mode === 'scenario' && scenario) userContent += `\n\n${scenario}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: SYSTEMS[mode]||SYSTEMS.diagnostic, messages: [{ role: 'user', content: userContent }] })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message||'API error'); }
    const data = await response.json();
    return res.status(200).json({ result: data.content.map(i=>i.type==='text'?i.text:'').join('').trim() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
