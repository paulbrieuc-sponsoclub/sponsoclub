// Crée une session Stripe Checkout (abonnement) et renvoie l'URL de paiement.
// Formules : 'month' (39,99 €/mois) ou 'year' (399 €/an), avec 30 jours d'essai.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) { res.status(500).json({ error: 'STRIPE_SECRET_KEY manquante sur Vercel.' }); return; }
  const supaUrl = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { plan, clubId, token, action } = b;
    const token2 = token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token2) { res.status(401).json({ error: 'Non authentifié.' }); return; }

    // Vérifier l'utilisateur et récupérer son email
    let email = '';
    try {
      const ur = await fetch(supaUrl + '/auth/v1/user', { headers: { apikey: supaKey, Authorization: 'Bearer ' + token2 } });
      const u = await ur.json();
      if (!u || !u.id) { res.status(401).json({ error: 'Session invalide.' }); return; }
      email = u.email || '';
    } catch (e) { res.status(401).json({ error: 'Session invalide.' }); return; }

    const sHead = { Authorization: 'Bearer ' + sk, 'content-type': 'application/x-www-form-urlencoded' };
    const svc = { apikey: supaKey, Authorization: 'Bearer ' + supaKey, 'content-type': 'application/json', Prefer: 'return=minimal' };

    // ---- Stripe Connect : configurer l'encaissement du club ----
    if (action === 'connect' || action === 'connect_status') {
      if (!clubId) { res.status(400).json({ error: 'Club manquant.' }); return; }
      const pr = await (await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(clubId) + '&select=stripe_account_id&limit=1', { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey } })).json();
      let acct = Array.isArray(pr) && pr[0] && pr[0].stripe_account_id;

      if (action === 'connect_status') {
        if (!acct) { res.status(200).json({ connected: false }); return; }
        const a = await (await fetch('https://api.stripe.com/v1/accounts/' + acct, { headers: { Authorization: 'Bearer ' + sk } })).json();
        await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(clubId), { method: 'PATCH', headers: svc, body: JSON.stringify({ stripe_charges_enabled: !!a.charges_enabled }) });
        res.status(200).json({ connected: true, charges_enabled: !!a.charges_enabled, details_submitted: !!a.details_submitted });
        return;
      }
      // action connect : créer le compte si besoin, puis un lien d'onboarding
      if (!acct) {
        const ap = new URLSearchParams();
        ap.set('type', 'express'); ap.set('country', 'FR'); if (email) ap.set('email', email);
        ap.set('capabilities[card_payments][requested]', 'true');
        ap.set('capabilities[transfers][requested]', 'true');
        const ar = await (await fetch('https://api.stripe.com/v1/accounts', { method: 'POST', headers: sHead, body: ap.toString() })).json();
        if (ar.error) { res.status(500).json({ error: ar.error.message }); return; }
        acct = ar.id;
        await fetch(supaUrl + '/rest/v1/profiles?id=eq.' + encodeURIComponent(clubId), { method: 'PATCH', headers: svc, body: JSON.stringify({ stripe_account_id: acct }) });
      }
      const lp = new URLSearchParams();
      lp.set('account', acct);
      lp.set('refresh_url', 'https://sponsoclub.fr/?connect=refresh');
      lp.set('return_url', 'https://sponsoclub.fr/?connect=done');
      lp.set('type', 'account_onboarding');
      const lr = await (await fetch('https://api.stripe.com/v1/account_links', { method: 'POST', headers: sHead, body: lp.toString() })).json();
      if (lr.error) { res.status(500).json({ error: lr.error.message }); return; }
      res.status(200).json({ url: lr.url });
      return;
    }

    const yearly = plan === 'year';
    const interval = yearly ? 'year' : 'month';
    const amount = yearly ? 39900 : 3999;
    const label = yearly ? 'Abonnement Sponsoclub — annuel' : 'Abonnement Sponsoclub — mensuel';

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', 'https://sponsoclub.fr/?sub=success');
    params.set('cancel_url', 'https://sponsoclub.fr/?sub=cancel');
    if (clubId) params.set('client_reference_id', clubId);
    if (email) params.set('customer_email', email);
    params.set('subscription_data[trial_period_days]', '15');
    params.set('allow_promotion_codes', 'true');
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', 'eur');
    params.set('line_items[0][price_data][unit_amount]', String(amount));
    params.set('line_items[0][price_data][recurring][interval]', interval);
    params.set('line_items[0][price_data][product_data][name]', label);

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
