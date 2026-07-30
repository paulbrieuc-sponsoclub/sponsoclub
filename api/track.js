// Pixel de suivi d'ouverture d'email. Marque email_opened_at sur la fiche sponsor
// et, si un id d'email est fourni (e), sur la ligne d'historique correspondante.
module.exports = async (req, res) => {
  const q = (req.query) || {};
  let id = q.id, e = q.e;
  if (!id && !e) { try { const s = new URL(req.url, 'http://x').searchParams; id = s.get('id'); e = s.get('e'); } catch (_) {} }
  try {
    const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const h = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'content-type': 'application/json', 'Prefer': 'return=minimal' };
    const now = new Date().toISOString();
    if (key && id) {
      await fetch(url + '/rest/v1/pipeline?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: h, body: JSON.stringify({ email_opened_at: now }) });
    }
    if (key && e) {
      await fetch(url + '/rest/v1/emails?id=eq.' + encodeURIComponent(e) + '&opened_at=is.null', { method: 'PATCH', headers: h, body: JSON.stringify({ opened_at: now }) });
    }
  } catch (err) {}
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).send(gif);
};
