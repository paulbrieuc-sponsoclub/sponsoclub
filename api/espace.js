// Espace sponsor public — renvoie une vue lecture seule et assainie d'un partenariat
// à partir d'un jeton de partage (share_token). Aucune donnée sensible n'est exposée
// (pas d'email, de notes, de contrat, de lien de paiement).
module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || '';
  if (!token || token.length < 8) { res.status(400).json({ error: 'Lien invalide.' }); return; }
  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { res.status(500).json({ error: 'Service indisponible.' }); return; }
  const h = { apikey: key, Authorization: 'Bearer ' + key };
  try {
    const pr = await (await fetch(url + '/rest/v1/pipeline?share_token=eq.' + encodeURIComponent(token) + '&select=*&limit=1', { headers: h })).json();
    const row = Array.isArray(pr) ? pr[0] : null;
    if (!row) { res.status(404).json({ error: 'Espace introuvable.', debug: (pr && pr.message) ? pr.message : 'aucune ligne' }); return; }
    const pf = await (await fetch(url + '/rest/v1/profiles?id=eq.' + encodeURIComponent(row.user_id) + '&select=*&limit=1', { headers: h })).json();
    const p = Array.isArray(pf) ? pf[0] : {};
    const offres = Array.isArray(p.offres) ? p.offres : [];
    const off = offres.find(o => o.nom === row.pack);
    const cpList = (off && Array.isArray(off.contreparties)) ? off.contreparties : [];
    const done = row.contreparties || {};
    const contreparties = cpList.map(c => ({ label: c, done: done[c] === true }));
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({
      club: {
        nom: p.club_nom || 'Le club', sport: p.sport || '', ville: (p.adresse || '').split(',').slice(-1)[0].trim(),
        licencies: p.licencies || 0, spectateurs: p.spectateurs || 0, reseaux: p.reseaux || 0,
        logo: p.logo || null, primary: p.couleur_primaire || '#3b4cd8', secondary: p.couleur_secondaire || '#e0b400',
        mecenat: p.mecenat !== false
      },
      sponsor: {
        name: row.name || 'Partenaire', pack: row.pack || '', montant: +row.montant || 0,
        statut: row.statut || '', signe: row.contrat_signe === true, regle: row.payment_status === 'Réglé'
      },
      contreparties
    });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
