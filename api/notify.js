// api/notify.js — Alerta automática a suscriptores cuando se publica un análisis
// Requiere: RESEND_API_KEY y SUPABASE_URL + SUPABASE_KEY en variables de entorno de Vercel

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_KEY || '';
const PIN = process.env.NOTIFY_PIN || 'carrynote2025';
const FROM = 'Carry Note <newsletter@thecarrynote.com>';
const PORTAL_URL = 'https://thecarrynote.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pin, title, subtitle } = req.body || {};
  if (pin !== PIN) return res.status(401).json({ error: 'No autorizado' });
  if (!title) return res.status(400).json({ error: 'Falta título' });
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

  // 1. Fetch subscribers from Supabase
  let emails = [];
  try {
    const sbRes = await fetch(`${SB_URL}/rest/v1/subscribers?select=email`, {
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      }
    });
    if (sbRes.ok) {
      const data = await sbRes.json();
      emails = data.map(r => r.email).filter(Boolean);
    }
  } catch (e) {
    console.error('Error fetching subscribers:', e);
    return res.status(500).json({ error: 'Error al obtener suscriptores' });
  }

  if (!emails.length) return res.status(200).json({ sent: 0, message: 'Sin suscriptores' });

  // 2. Build email HTML
  const emailHtml = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:Georgia,serif">
<div style="max-width:600px;margin:0 auto;background:#0e0e10">
  <div style="padding:2rem 2.5rem;border-bottom:1px solid #2a2a32">
    <div style="font-family:Georgia,serif;font-size:1.4rem;font-weight:bold;font-style:italic;color:#c9a84c">Carry·Note</div>
    <div style="font-family:'Courier New',monospace;font-size:0.58rem;letter-spacing:0.12em;text-transform:uppercase;color:#6b6875;margin-top:0.4rem">Nuevo análisis publicado</div>
  </div>
  <div style="padding:2rem 2.5rem;border-bottom:1px solid #2a2a32;background:linear-gradient(135deg,rgba(201,168,76,0.06),transparent)">
    <div style="font-family:'Courier New',monospace;font-size:0.58rem;letter-spacing:0.12em;text-transform:uppercase;color:#c9a84c;margin-bottom:0.6rem">▸ Nuevo en el portal</div>
    <div style="font-size:1.5rem;font-weight:bold;color:#f0ede8;line-height:1.25;margin-bottom:0.6rem">${title}</div>
    ${subtitle ? `<div style="font-size:0.9rem;color:#c8c4bc;line-height:1.7">${subtitle}</div>` : ''}
  </div>
  <div style="padding:2rem 2.5rem;text-align:center;border-bottom:1px solid #2a2a32">
    <a href="${PORTAL_URL}" style="display:inline-block;background:#c9a84c;color:#0e0e10;font-family:'Courier New',monospace;font-size:0.7rem;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;padding:0.85rem 2rem;text-decoration:none">Leer el análisis completo →</a>
    <div style="font-family:'Courier New',monospace;font-size:0.58rem;color:#6b6875;margin-top:0.75rem">thecarrynote.com</div>
  </div>
  <div style="padding:1.25rem 2.5rem;text-align:center">
    <div style="font-family:'Courier New',monospace;font-size:0.55rem;color:#6b6875;line-height:1.7">
      Recibís este mail porque te suscribiste en Carry Note.<br>
      Para cancelar: contacto@thecarrynote.com
    </div>
  </div>
</div>
</body></html>`;

  // 3. Send via Resend (batch — max 50 per request)
  let sent = 0;
  const BATCH = 50;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(to => ({
          from: FROM,
          to,
          subject: `[Carry Note] ${title}`,
          html: emailHtml,
        })))
      });
      if (r.ok) sent += batch.length;
      else { const e = await r.json(); console.error('Resend error:', e); }
    } catch (e) {
      console.error('Batch send error:', e);
    }
  }

  return res.status(200).json({ sent, total: emails.length });
}
