// Webhook Stripe — met à jour le statut d'abonnement du club dans Supabase.
// URL à configurer dans Stripe : https://sponsoclub.fr/api/stripe-webhook?key=<STRIPE_WH_SECRET>
// Sécurité : secret dans l'URL + on re-vérifie chaque objet en le récupérant via l'API Stripe.
module.exports = async (req, res) => {
  const our = process.env.STRIPE_WH_SECRET;
  const given = (req.query && req.query.key) || '';
  if (our && given !== our) { res.status(401).json({ error: 'Non autorisé.' }); return; }

  const sk = process.env.STRIPE_SECRET_KEY;
  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sk || !key) { res.status(200).json({ ok: false, note: 'config' }); return; }
  const sh = { Authorization: 'Bearer ' + sk };
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json', Prefer: 'return=minimal' };

  const stripeGet = async (path) => (await fetch('https://api.stripe.com/v1/' + path, { headers: sh })).json();
  const setProfile = async (match, fields) => {
    await fetch(url + '/rest/v1/profiles?' + match, { method: 'PATCH', headers: h, body: JSON.stringify(fields) });
  };
  const mapStatus = (s) => (s === 'trialing' ? 'trialing' : (s === 'active' ? 'active' : (['past_due', 'unpaid', 'incomplete'].includes(s) ? 'past_due' : 'canceled')));

  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const type = event.type || '';
    const obj = (event.data && event.data.object) || {};

    if (type === 'checkout.session.completed') {
      const sess = await stripeGet('checkout/sessions/' + obj.id);
      // Paiement d'un sponsor au club (lien de paiement) → marquer la fiche « Réglé »
      const pipeId = (sess.metadata && sess.metadata.pipeline_id) || (obj.metadata && obj.metadata.pipeline_id);
      if (sess.mode === 'payment' && pipeId) {
        await fetch(url + '/rest/v1/pipeline?id=eq.' + encodeURIComponent(pipeId), {
          method: 'PATCH', headers: h,
          body: JSON.stringify({ payment_status: 'Réglé', paid_at: new Date().toISOString(), statut: 'Signé' })
        });
        res.status(200).json({ received: true });
        return;
      }
      const clubId = sess.client_reference_id;
      const subId = sess.subscription;
      const custId = sess.customer;
      if (subId) {
        const sub = await stripeGet('subscriptions/' + subId);
        const item = sub.items && sub.items.data && sub.items.data[0];
        const plan = item && item.price && item.price.recurring ? item.price.recurring.interval : null;
        const fields = {
          subscription_status: mapStatus(sub.status),
          subscription_plan: (plan === 'year' ? 'annuel' : 'mensuel'),
          subscription_until: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          stripe_customer_id: custId, stripe_sub_id: subId
        };
        if (clubId) await setProfile('id=eq.' + encodeURIComponent(clubId), fields);
        else if (custId) await setProfile('stripe_customer_id=eq.' + encodeURIComponent(custId), fields);
      }
    } else if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      const sub = await stripeGet('subscriptions/' + obj.id);
      const item = sub.items && sub.items.data && sub.items.data[0];
      const plan = item && item.price && item.price.recurring ? item.price.recurring.interval : null;
      const deleted = (type === 'customer.subscription.deleted');
      const fields = {
        subscription_status: deleted ? 'canceled' : mapStatus(sub.status),
        subscription_plan: (plan === 'year' ? 'annuel' : 'mensuel'),
        subscription_until: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        subscription_cancel: deleted ? false : !!sub.cancel_at_period_end,
        stripe_sub_id: sub.id
      };
      await setProfile('stripe_customer_id=eq.' + encodeURIComponent(sub.customer), fields);
    }
    res.status(200).json({ received: true });
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e) }); }
};
