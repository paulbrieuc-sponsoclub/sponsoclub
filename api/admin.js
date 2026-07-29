module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || '';
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) { res.status(500).json({ error: 'ADMIN_TOKEN non configuré.' }); return; }
  if (token !== expected) { res.status(401).json({ error: 'Accès refusé.' }); return; }
  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante.' }); return; }
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  const PRIX = 29;
  try {
    let users = [];
    try { const ur = await (await fetch(url + '/auth/v1/admin/users?per_page=1000', { headers: h })).json(); users = Array.isArray(ur) ? ur : (ur.users || []); } catch (e) { users = []; }
    const profiles = await (await fetch(url + '/rest/v1/profiles?select=id,club_nom,licencies,updated_at&limit=5000', { headers: h })).json();
    const rows = await (await fetch(url + '/rest/v1/pipeline?select=user_id,statut,montant,created_at,email_sent_at,email_opened_at&limit=20000', { headers: h })).json();
    const P = Array.isArray(profiles) ? profiles : [];
    const R = Array.isArray(rows) ? rows : [];
    const byId = {};
    users.forEach(u => byId[u.id] = { email: u.email || '', inscrit: u.created_at || null, nom: '—', licencies: 0, dossiers: 0, signes: 0, sponsoring: 0, last: null });
    P.forEach(p => { if (!byId[p.id]) byId[p.id] = { email: '', inscrit: null, nom: '', licencies: 0, dossiers: 0, signes: 0, sponsoring: 0, last: null }; byId[p.id].nom = p.club_nom || '—'; byId[p.id].licencies = p.licencies || 0; if (!byId[p.id].last) byId[p.id].last = p.updated_at || null; });
    const statuts = { 'À contacter': 0, 'Contacté': 0, 'RDV': 0, 'Signé': 0, 'Perdu': 0 };
    const months = {}; let signes = 0, sponsoring = 0, emails_envoyes = 0, emails_ouverts = 0;
    for (const r of R) {
      if (statuts[r.statut] === undefined) statuts[r.statut] = 0; statuts[r.statut]++;
      if (r.email_sent_at) emails_envoyes++; if (r.email_opened_at) emails_ouverts++;
      const c = byId[r.user_id]; if (c) { c.dossiers++; if (r.created_at && (!c.last || r.created_at > c.last)) c.last = r.created_at; }
      if (r.statut === 'Signé') { signes++; const m = +r.montant || 0; sponsoring += m; if (c) { c.signes++; c.sponsoring += m; } const mm = (r.created_at || '').slice(0, 7); if (mm) { months[mm] = months[mm] || { dossiers: 0, sponsoring: 0 }; months[mm].sponsoring += m; } }
      const mk = (r.created_at || '').slice(0, 7); if (mk) { months[mk] = months[mk] || { dossiers: 0, sponsoring: 0 }; months[mk].dossiers++; }
    }
    const clubs = Object.keys(byId).map(id => byId[id]).sort((a, b) => b.sponsoring - a.sponsoring);
    const timeline = Object.keys(months).sort().map(m => ({ mois: m, dossiers: months[m].dossiers, sponsoring: months[m].sponsoring }));
    const nbClubs = users.length || P.length;
    res.status(200).json({ kpis: { clubs: nbClubs, total: R.length, signes, sponsoring, mrr: nbClubs * PRIX, prix: PRIX, panier: signes ? Math.round(sponsoring / signes) : 0, conversion: R.length ? Math.round(signes / R.length * 100) : 0, emails_envoyes, emails_ouverts, taux_ouverture: emails_envoyes ? Math.round(emails_ouverts / emails_envoyes * 100) : 0 }, statuts, clubs, timeline });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
