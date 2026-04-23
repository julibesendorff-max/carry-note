const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const BG1 = 'display:flex;gap:1rem;padding:0.85rem 1rem;border-bottom:1px solid #2a2a32;align-items:flex-start;background:#111114;border-left:3px solid #2a2a32';
const BG2 = 'display:flex;gap:1rem;padding:0.85rem 1rem;border-bottom:1px solid #2a2a32;align-items:flex-start;background:#0d1f14;border-left:3px solid #4caf7d';
const LBL = 'font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;color:#6b6875;min-width:120px;flex-shrink:0;font-family:monospace';
const LBL2 = 'font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;color:#4caf7d;min-width:120px;flex-shrink:0;font-family:monospace';
const VAL = 'font-size:0.83rem;color:#e8e6e0;line-height:1.7';
const CHG = 'padding:1.1rem 1.25rem;background:#18181d;border-top:1px solid #2a2a32';
const P = 'font-size:0.83rem;color:#c8c4bc;line-height:1.7;margin-bottom:0.6rem';
const STR = 'color:#e8e6e0';

const SYSTEMS = {
  diagnostic: `Eres un educador financiero amigable escribiendo para inversores argentinos de todo nivel. Usa español simple. Cuando menciones un instrumento, explica brevemente qué es entre paréntesis. Solo HTML puro, sin markdown ni asteriscos.

Responde EXACTAMENTE con esta estructura:
<div class="ds"><h3>Tu cartera hoy</h3><p>[2-3 oraciones simples]</p></div>
<div class="ds dg"><h3>Lo que está bien</h3><ul><li>[fortaleza 1]</li><li>[fortaleza 2]</li><li>[fortaleza 3]</li></ul></div>
<div class="ds dr"><h3>Lo que hay que revisar</h3><ul><li>[riesgo 1 explicado simple]</li><li>[riesgo 2]</li><li>[riesgo 3]</li></ul></div>
<div class="ds dy"><h3>Qué podrías hacer</h3><ul><li>[sugerencia 1: instrumento, qué es, cómo comprarlo en Argentina]</li><li>[sugerencia 2]</li><li>[sugerencia 3]</li></ul></div>
<div class="dscore"><b>[X]/10</b><span>[etiqueta simple]</span></div>`,

  scenario: `Educador financiero. Explica en español simple cómo este escenario afecta la cartera. Solo HTML con etiquetas <p>. Sin markdown. Máximo 3 párrafos cortos y directos.`,

  comparison: `Educador financiero argentino. Propone cartera alternativa en español simple. Para cada instrumento: qué es y cómo comprarlo en Argentina. Solo HTML con estilos inline. Sin clases CSS ni markdown.

USA EXACTAMENTE este HTML (copia la estructura, reemplaza solo el contenido entre corchetes):

<div style="${BG1}"><div style="${LBL}">Cartera actual</div><div style="${VAL}">[resumen simple de cartera actual con porcentajes]</div></div>
<div style="${BG2}"><div style="${LBL2}">Cartera sugerida</div><div style="${VAL}">[nueva asignación: X% instrumento (qué es), Y% instrumento (qué es), Z% instrumento (qué es)]</div></div>
<div style="${CHG}"><p style="${P}"><strong style="${STR}">Cambio 1:</strong> [qué hacer, por qué en términos simples, cómo comprarlo]</p><p style="${P}"><strong style="${STR}">Cambio 2:</strong> [ídem]</p><p style="${P}"><strong style="${STR}">Cambio 3:</strong> [ídem]</p></div>`,
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

  const maxTokens = 1600;
  const model = 'claude-sonnet-4-20250514';

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
