// Crée un lien de paiement Stripe (paiement unique) pour qu'un sponsor règle le club.
// Le webhook marquera ensuite le partenaire comme « Réglé » automatiquement.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) { res.status(500).json({ error: 'STRIPE_SECRET_KEY manquante.' }); return; }
  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { pipelineId } = b;
    const token = b.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !pipelineId) { res.status(400).json({ error: 'Requête invalide.' }); return; }

    // Vérifier l'utilisateur
    const u = await (await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } })).json();
    if (!u || !u.id) { res.status(401).json({ error: 'Session invalide.' }); return; }

    const h = { apikey: key, Authorization: 'Bearer ' + key };
    const pr = await (await fetch(url + '/rest/v1/pipeline?id=eq.' + encodeURIComponent(pipelineId) + '&select=name,montant,club_id&limit=1', { headers: h })).json();
    const row = Array.isArray(pr) ? pr[0] : null;
    if (!row) { res.status(404).json({ error: 'Partenaire introuvable.' }); return; }
    const montant = Math.round((+row.montant || 0) * 100);
    if (montant < 100) { res.status(400).json({ error: 'Renseigne d\'abord un montant (≥ 1 €) dans l\'onglet Offre.' }); return; }

    let clubNom = 'le club', acct = null, chargesOk = false;
    try { const pf = await (await fetch(url + '/rest/v1/profiles?id=eq.' + encodeURIComponent(row.club_id) + '&select=club_nom,stripe_account_id,stripe_charges_enabled&limit=1', { headers: h })).json(); if (Array.isArray(pf) && pf[0]) { clubNom = pf[0].club_nom || clubNom; acct = pf[0].stripe_account_id || null; chargesOk = pf[0].stripe_charges_enabled === true; } } catch (e) {}

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', 'https://sponsoclub.fr/merci.html');
    params.set('cancel_url', 'https://sponsoclub.fr/merci.html?annule=1');
    params.set('metadata[pipeline_id]', String(pipelineId));
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', 'eur');
    params.set('line_items[0][price_data][unit_amount]', String(montant));
    params.set('line_items[0][price_data][product_data][name]', 'Partenariat ' + clubNom + ' — ' + (row.name || 'sponsor'));
    params.set('payment_intent_data[metadata][pipeline_id]', String(pipelineId));

    // Si le club a connecté son compte Stripe : l'argent va DIRECTEMENT au club (destination charge),
    // avec une commission plateforme optionnelle (PLATFORM_FEE_PCT).
    if (acct && chargesOk) {
      params.set('payment_intent_data[transfer_data][destination]', acct);
      const feePct = +(process.env.PLATFORM_FEE_PCT || 0);
      if (feePct > 0) params.set('payment_intent_data[application_fee_amount]', String(Math.round(montant * feePct / 100)));
    }

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sk, 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const j = await r.json();
    if (!r.ok || j.error) { res.status(500).json({ error: (j.error && j.error.message) || 'Erreur Stripe' }); return; }
    res.status(200).json({ url: j.url });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
