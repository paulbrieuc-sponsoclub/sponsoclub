// Résilie (ou réactive) l'abonnement Stripe du club — annulation en fin de période.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const sk = process.env.STRIPE_SECRET_KEY;
  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sk || !key) { res.status(500).json({ error: 'Configuration manquante.' }); return; }
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { clubId, action } = b;
    const token = b.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !clubId) { res.status(400).json({ error: 'Requête invalide.' }); return; }

    // Vérifier l'utilisateur
    const u = await (await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } })).json();
    if (!u || !u.id) { res.status(401).json({ error: 'Session invalide.' }); return; }

    const h = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' };
    const pr = await (await fetch(url + '/rest/v1/profiles?id=eq.' + encodeURIComponent(clubId) + '&select=stripe_sub_id&limit=1', { headers: h })).json();
    const subId = Array.isArray(pr) && pr[0] && pr[0].stripe_sub_id;
    if (!subId) { res.status(404).json({ error: 'Aucun abonnement à résilier.' }); return; }

    const resume = action === 'resume';
    const params = new URLSearchParams();
    params.set('cancel_at_period_end', resume ? 'false' : 'true');
    const sr = await fetch('https://api.stripe.com/v1/subscriptions/' + subId, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sk, 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const sj = await sr.json();
    if (!sr.ok || sj.error) { res.status(500).json({ error: (sj.error && sj.error.message) || 'Erreur Stripe' }); return; }

    await fetch(url + '/rest/v1/profiles?id=eq.' + encodeURIComponent(clubId), {
      method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({ subscription_cancel: !resume })
    });
    res.status(200).json({ ok: true, canceling: !resume });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
