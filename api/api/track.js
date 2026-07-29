module.exports = async (req, res) => {
  let id = req.query && req.query.id;
  if (!id) { try { id = new URL(req.url, 'http://x').searchParams.get('id'); } catch (e) {} }
  try {
    const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (id && key) {
      await fetch(url + '/rest/v1/pipeline?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'content-type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ email_opened_at: new Date().toISOString() }) });
    }
  } catch (e) {}
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif'); res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(gif);
};
