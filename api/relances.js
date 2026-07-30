// Envoi des relances VALIDÉES par le club (appelée chaque jour par le cron Vercel).
// N'envoie que les relances de la table `relances` au statut « programmé » dont la date est arrivée.
// Sécurité : Vercel envoie « Authorization: Bearer <CRON_SECRET> ». Test manuel : ?key=<CRON_SECRET>.
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const manual = (req.query && req.query.key) || '';
  if (secret && auth !== 'Bearer ' + secret && manual !== secret) { res.status(401).json({ error: 'Non autorisé.' }); return; }

  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const inDom = process.env.INBOUND_DOMAIN || 'aintuorkai.resend.app';
  if (!key || !resendKey) { res.status(500).json({ error: 'Configuration manquante.' }); return; }
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Relances validées et dont la date est arrivée
    const rl = await (await fetch(url + '/rest/v1/relances?status=eq.' + encodeURIComponent('programmé') + '&scheduled_for=lte.' + today + '&select=*&limit=500', { headers: h })).json();
    if (!Array.isArray(rl) || !rl.length) { res.status(200).json({ sent: 0 }); return; }

    const profs = await (await fetch(url + '/rest/v1/profiles?select=id,club_nom', { headers: h })).json();
    const club = {}; (Array.isArray(profs) ? profs : []).forEach(p => club[p.id] = p);

    let sent = 0;
    for (const r of rl) {
      if (!r.to_email) { await mark(r.id, 'annulé'); continue; }
      const nom = (club[r.club_id] && club[r.club_id].club_nom) || 'notre club';
      const subject = r.subject || ('Re: Partenariat avec ' + nom);
      const bodyTxt = r.body || '';

      // Journaliser pour l'historique + suivi d'ouverture
      let eid = null;
      try {
        const er = await (await fetch(url + '/rest/v1/emails', { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ club_id: r.club_id, pipeline_id: r.pipeline_id, direction: 'out', to_email: r.to_email, subject, body: bodyTxt }) })).json();
        if (Array.isArray(er) && er[0]) eid = er[0].id;
      } catch (e) {}

      const track = 'https://sponsoclub.fr/api/track?id=' + r.pipeline_id + (eid ? '&e=' + eid : '');
      const html = bodyTxt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '<img src="' + track + '" width="1" height="1" style="display:none" alt="">';
      try {
        const send = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: 'Bearer ' + resendKey, 'content-type': 'application/json' },
          body: JSON.stringify({ from: nom + ' <contact@sponsoclub.fr>', to: [r.to_email], subject, html, reply_to: ['reponse-' + r.pipeline_id + '@' + inDom] })
        });
        if (send.ok) {
          await mark(r.id, 'envoyé');
          await fetch(url + '/rest/v1/pipeline?id=eq.' + r.pipeline_id, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ email_sent_at: new Date().toISOString(), last_relance_at: new Date().toISOString() }) });
          sent++;
        }
      } catch (e) {}
    }
    res.status(200).json({ sent });

    async function mark(id, status) {
      await fetch(url + '/rest/v1/relances?id=eq.' + id, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ status, sent_at: new Date().toISOString() }) });
    }
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
