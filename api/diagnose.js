const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const SYSTEMS = {
  diagnostic: `You are a friendly financial educator writing for Argentine investors of all levels. Write in simple, clear Spanish that anyone can understand. When you mention a financial instrument, briefly explain what it is in parentheses. Use ONLY pure HTML (no markdown, no asterisks, no backticks). Respond ONLY with this exact structure:
<div class="ds"><h3>Tu cartera hoy</h3><p>[2-3 sentences describing what they have in simple terms]</p></div>
<div class="ds dg"><h3>Lo que está bien</h3><ul><li>[strength 1]</li><li>[strength 2]</li><li>[strength 3]</li></ul></div>
<div class="ds dr"><h3>Lo que hay que revisar</h3><ul><li>[risk 1 explained simply]</li><li>[risk 2]</li><li>[risk 3]</li></ul></div>
<div class="ds dy"><h3>Qué podrías hacer</h3><ul><li>[suggestion 1: name instrument, explain what it is, how to buy it in Argentina]</li><li>[suggestion 2]</li><li>[suggestion 3]</li></ul></div>
<div class="dscore"><b>[X]/10</b><span>[simple label]</span></div>`,

  scenario: `You are a friendly financial educator. Explain in simple Spanish (no jargon) how this scenario affects the portfolio. Use ONLY pure HTML paragraphs like <p>text</p>. No markdown, no asterisks. Maximum 3 short paragraphs. Be direct and practical.`,

  comparison: `You are a friendly financial educator writing for Argentine investors. Propose an alternative portfolio in simple Spanish. For EACH instrument you recommend, briefly explain what it is and how to buy it in Argentina. 

CRITICAL: Use ONLY these exact HTML elements with ONLY inline styles. No CSS classes. No markdown.

Respond with EXACTLY this structure:
<div style="display:flex;gap:1rem;padding:0.85rem 1rem;border-bottom:1px solid #2a2a32;align-items:flex-start;background:#111114;border-left:3px solid #2a2a32"><div style="font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;color:#6b6875;min-width:120px;flex-shrink:0;font-family:monospace">Cartera actual</div><div style="font-size:0.83rem;color:#e8e6e0;line-height:1.7">[brief summary of current portfolio in simple terms]</div></div>
<div style="display:flex;gap:1rem;padding:0.85rem 1rem;border-bottom:1px solid #2a2a32;align-items:flex-start;background:#0d1f14;border-left:3px solid #4caf7d"><div style="font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;color:#4caf7d;min-width:120px;flex-shrink:0;font-family:monospace">Cartera sugerida</div><div style="font-size:0.83rem;color:#e8e6e0;line-height:1.7">[new allocation: X% instrument (what it is), Y% instrument (what it is), etc]</div></div>
<div style="padding:1.1rem 1.25rem;background:#18181d;border-top:1px solid #2a2a32"><p style="font-size:0.83rem;color:#c8c4bc;line-height:1.7;margin-bottom:0.6rem"><strong style="color:#e8e6e0">Cambio 1:</strong> [what to do and why in simple terms, how to buy it]</p><p style="font-size:0.83rem;color:#c8c4bc;line-height:1.7;margin-bottom:0.6rem"><strong style="color:#e8e6e0">Cambio 2:</strong> [same format]</p><p style="font-size:0.83rem;color:#c8c4bc;line-height:1.7"><strong style="color:#e8e6e0">Cambio 3:</strong> [same format]</p></div>`,
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

  const maxTokens = mode === 'diagnostic' ? 1400 : 700;
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
