module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const key = process.env.RESEND_API_KEY;
  if (!key) { res.status(500).json({ error: 'RESEND_API_KEY absente.' }); return; }
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { to, subject, html, fromName, replyTo } = b;
    if (!to || !subject || !html) { res.status(400).json({ error: 'Champs manquants.' }); return; }
    const payload = { from: (fromName || 'Sponsoclub') + ' <contact@sponsoclub.fr>', to: [to], subject, html };
    if (replyTo) payload.reply_to = [replyTo];
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(500).json({ error: (j && (j.message || j.name)) || ('Erreur ' + r.status) }); return; }
    res.status(200).json({ id: j.id || true });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
