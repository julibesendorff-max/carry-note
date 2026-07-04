// api/portafolio.js — Carry Note · Constructor de portafolio con IA
// Vercel serverless function. Requiere ANTHROPIC_KEY en variables de entorno.

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.thecarrynote.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { amount, profile, horizon, email } = req.body || {};

  // Validación básica
  if (!amount || !profile || !horizon) {
    return res.status(400).json({ error: 'Faltan parámetros: amount, profile, horizon.' });
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) < 1000) {
    return res.status(400).json({ error: 'Monto inválido (mínimo USD 1.000).' });
  }

  // Rate limiting simple por IP (1 request por minuto)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  if (!global._portRateMap) global._portRateMap = new Map();
  const last = global._portRateMap.get(ip) || 0;
  if (now - last < 60_000) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Esperá un minuto.' });
  }
  global._portRateMap.set(ip, now);

  const profileLabels = {
    conservador: 'Conservador — el objetivo principal es preservar capital y evitar pérdidas. Prioriza liquidez, cobertura cambiaria y renta fija de bajo riesgo.',
    moderado:    'Moderado — busca crecimiento por encima de la inflación, acepta volatilidad moderada. Equilibrio entre renta fija en dólares, CEDEARs y algo de renta variable.',
    agresivo:    'Agresivo — maximizar retorno de largo plazo, acepta alta volatilidad. Mayor exposición a renta variable (CEDEARs, acciones), bonos de mayor duración.'
  };

  const prompt = `Sos un analista financiero senior especializado en el mercado argentino. Tu tarea es armar un portafolio de inversión personalizado para un inversor argentino.

DATOS DEL INVERSOR:
- Capital disponible: USD ${parseFloat(amount).toLocaleString('en-US')}
- Perfil de riesgo: ${profileLabels[profile] || profile}
- Horizonte de inversión: ${horizon}

CONTEXTO MACRO QUE DEBÉS CONSIDERAR (a julio 2026, aproximado):
- Régimen cambiario argentino actual: bandas de flotación, brecha blue reducida
- Tasas reales en pesos: evaluar si carry tiene sentido según perfil
- Riesgo país: zona de compresión pero con volatilidad política latente
- Fed Funds Rate: en pausa, inflación EEUU moderándose (~3%)
- CEDEARs: acceso a renta variable global en pesos/dólares
- Instrumentos disponibles: Lecaps, Boncaps, bonos CER, AL30/GD30/GD35, dólar MEP, CEDEARs (NVDA, AAPL, JPM, XOM, BRK, etc.), FCI money market, plazo fijo, obligaciones negociables

INSTRUCCIONES:
Respondé ÚNICAMENTE con un JSON válido, sin texto adicional ni backticks. El JSON debe tener exactamente esta estructura:

{
  "allocation": [
    { "name": "Nombre de clase de activo", "pct": 35 },
    { "name": "Otra clase", "pct": 25 }
  ],
  "context": "Párrafo breve (2-3 oraciones) sobre el contexto macro específico que justifica esta asignación en este momento.",
  "rationale": "Párrafo explicando la lógica de la asignación para este perfil y horizonte. Debe ser concreto y en lenguaje accesible.",
  "risks": "Principales riesgos a monitorear para este portafolio. 2-3 riesgos concretos en prosa.",
  "instruments": [
    {
      "name": "Nombre del instrumento o ticker",
      "category": "Clase de activo",
      "why": "Por qué este instrumento para este inversor. 1-2 oraciones.",
      "pct": 15
    }
  ]
}

REGLAS:
- La suma de "pct" en "allocation" debe ser exactamente 100.
- La suma de "pct" en "instruments" debe ser aproximadamente 100 (puede variar ±5 por redondeos).
- Incluí entre 5 y 9 instrumentos concretos. Para CEDEARs mencioná el ticker (NVDA, AAPL, etc.).
- Las clases de activo típicas son: Liquidez en USD, Renta fija en USD, Renta fija en ARS, Renta variable (CEDEARs), Cobertura cambiaria, Renta fija CER.
- El lenguaje debe ser claro, en español rioplatense, sin jerga innecesaria.
- No incluyas disclaimers dentro del JSON. No uses markdown. Solo JSON.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errText);
      return res.status(502).json({ error: 'Error al conectar con la IA. Intentá de nuevo.' });
    }

    const anthropicData = await anthropicRes.json();
    const raw = anthropicData.content?.[0]?.text || '';

    // Parse JSON — strip accidental backticks
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let portfolio;
    try {
      portfolio = JSON.parse(cleaned);
    } catch(parseErr) {
      console.error('JSON parse error:', parseErr, '\nRaw:', raw.slice(0, 300));
      return res.status(500).json({ error: 'Error al procesar la respuesta de la IA. Intentá de nuevo.' });
    }

    // Validate minimally
    if (!portfolio.allocation || !Array.isArray(portfolio.allocation) || !portfolio.instruments) {
      return res.status(500).json({ error: 'Respuesta incompleta de la IA. Intentá de nuevo.' });
    }

    return res.status(200).json(portfolio);

  } catch(err) {
    console.error('Portfolio API error:', err);
    return res.status(500).json({ error: 'Error interno. Intentá de nuevo en unos segundos.' });
  }
}
