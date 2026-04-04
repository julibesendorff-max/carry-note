const SUPABASE_URL = 'https://fhswsvjkkmnhlbdnozoe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HCwgAA7wQJIJj45eU_MhvQ_gVklccHK';
const RESEND_KEY   = 're_HFR9WqL1_8uFRj5BfpFWAMfcm7vQs4oT3';
const FROM_EMAIL   = 'Carry Note <onboarding@resend.dev>';
const SITE_URL     = 'https://thecarrynote.com';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth check — same PIN as editor
  const { pin, title, subtitle } = req.body;
  if (pin !== 'carrynote2025') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!title) {
    return res.status(400).json({ error: 'Missing title' });
  }

  try {
    // 1. Get all subscribers from Supabase
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/subscribers?select=email`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!sbRes.ok) throw new Error('Error fetching subscribers');
    const subscribers = await sbRes.json();

    if (!subscribers || subscribers.length === 0) {
      return res.status(200).json({ message: 'No subscribers', sent: 0 });
    }

    const emails = subscribers.map(s => s.email);

    // 2. Send email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: emails,
        subject: `Nueva nota: ${title}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 0; background: #0a0a0b; font-family: Georgia, serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { border-bottom: 2px solid #c9a84c; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-family: Georgia, serif; font-size: 28px; color: #e8e6e0; }
    .logo em { font-style: italic; color: #c9a84c; }
    .label { font-family: monospace; font-size: 10px; color: #6b6875; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
    .note-title { font-family: Georgia, serif; font-size: 24px; color: #e8e6e0; line-height: 1.3; margin-bottom: 12px; }
    .note-sub { font-size: 14px; color: #9d99a8; line-height: 1.6; margin-bottom: 28px; }
    .cta { display: inline-block; background: #c9a84c; color: #0a0a0b; font-family: monospace; font-size: 12px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; padding: 12px 24px; text-decoration: none; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #2a2a32; font-family: monospace; font-size: 10px; color: #4a4855; line-height: 1.8; }
    .disclaimer { font-family: monospace; font-size: 10px; color: #4a4855; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">Carry<em>Note</em></div>
      <div class="label">Análisis Macroeconómico · Geopolítica · Mercados</div>
    </div>

    <div class="note-title">${title}</div>
    ${subtitle ? `<div class="note-sub">${subtitle}</div>` : ''}

    <a href="${SITE_URL}" class="cta">Leer nota completa →</a>

    <div class="footer">
      Recibís este email porque te suscribiste en thecarrynote.com<br>
      <a href="${SITE_URL}" style="color:#6b6875">thecarrynote.com</a>
    </div>
    <div class="disclaimer">⚠ No es recomendación de inversión.</div>
  </div>
</body>
</html>
        `
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      throw new Error(err.message || 'Resend error');
    }

    return res.status(200).json({ message: 'Emails sent', sent: emails.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
