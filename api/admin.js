module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || '';
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) { res.status(500).json({ error: 'ADMIN_TOKEN non configuré.' }); return; }
  if (token !== expected) { res.status(401).json({ error: 'Accès refusé.' }); return; }
  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante.' }); return; }
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  const prix = 29;
  try {
    const pr = await fetch(url + '/rest/v1/profiles?select=id', { headers: h });
    const clubs = (await pr.json()).length;
    const pi = await fetch(url + '/rest/v1/pipeline?select=statut,montant', { headers: h });
    const rows = await pi.json();
    let signes = 0, sponsoring = 0;
    const total = Array.isArray(rows) ? rows.length : 0;
    if (Array.isArray(rows)) for (const r of rows) { if (r.statut === 'Signé') { signes++; sponsoring += (+r.montant || 0); } }
    res.status(200).json({ clubs, total, signes, sponsoring, mrr: clubs * prix, prix });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
