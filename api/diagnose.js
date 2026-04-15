const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { assets, horizonte, riesgo, liveData } = req.body;

  if (!assets || !assets.length) {
    return res.status(400).json({ error: 'Sin activos' });
  }

  const horizonMap = {
    corto: 'corto plazo (menos de 1 año)',
    medio: 'mediano plazo (1-3 años)',
    largo: 'largo plazo (más de 3 años)'
  };

  const portfolioText = assets.map(a =>
    `- ${a.tipo}: ${a.moneda === 'ARS' ? '$' : 'USD '}${a.monto.toLocaleString()} ${a.moneda}`
  ).join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: 'You are a senior financial analyst specializing in Argentine and global markets. Provide educational portfolio diagnostic. Write in Spanish using HTML. Use the LIVE market data provided by the user. Respond ONLY with this exact HTML: <div class="ds"><h3>Composicion actual</h3><p>[analysis]</p></div><div class="ds dg"><h3>Fortalezas</h3><ul><li>[strength 1]</li><li>[strength 2]</li><li>[strength 3]</li></ul></div><div class="ds dr"><h3>Riesgos identificados</h3><ul><li>[risk 1]</li><li>[risk 2]</li><li>[risk 3]</li></ul></div><div class="ds dy"><h3>Sugerencias de ajuste</h3><ul><li>[concrete suggestion 1]</li><li>[concrete suggestion 2]</li><li>[concrete suggestion 3]</li></ul></div><div class="dscore"><b>[X]/10</b><span>[Bien/Parcialmente/Des] alineado con perfil [conservador/moderado/agresivo]</span></div>',
        messages: [{
          role: 'user',
          content: `Perfil: horizonte ${horizonMap[horizonte] || horizonte}, riesgo ${riesgo}.\n\nCartera:\n${portfolioText}\n\n${liveData || ''}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    const txt = data.content.map(i => i.type === 'text' ? i.text : '').join('').trim();
    return res.status(200).json({ result: txt });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
