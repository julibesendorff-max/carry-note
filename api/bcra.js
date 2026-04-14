export default async function handler(req, res) {
  // Allow CORS from our domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1 hour

  const { variable } = req.query;

  // Allowed variable IDs from BCRA API
  // 1  = Compras/ventas netas BCRA en MLC (USD mill)
  // 15 = BADLAR bancos privados (TNA)
  // 6  = TAMAR (TNA)
  // 27 = TM20 plazo fijo 30-44 dias
  const allowed = ['1', '15', '6', '27'];

  if (!variable || !allowed.includes(variable)) {
    return res.status(400).json({ error: 'Variable no permitida' });
  }

  try {
    const url = `https://api.bcra.gob.ar/estadisticas/v3.0/datosvariable/${variable}/5/1`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CarryNote/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`BCRA API error: ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
