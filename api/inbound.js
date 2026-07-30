// Réception des réponses des partenaires (webhook Resend Inbound).
// URL à configurer dans Resend : https://sponsoclub.fr/api/inbound?key=<INBOUND_SECRET>
// Extrait l'id du sponsor depuis l'adresse « reponse+<id>@sponsoclub.fr » et
// enregistre la réponse dans la table emails (direction = 'in').
module.exports = async (req, res) => {
  // Petit garde-fou : un secret dans l'URL
  const secret = process.env.INBOUND_SECRET;
  const given = (req.query && req.query.key) || '';
  if (secret && given !== secret) { res.status(401).json({ error: 'Non autorisé.' }); return; }

  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const d = body.data || body || {};

    // Adresse(s) destinataire : on cherche reponse+<id>@...
    const toRaw = d.to || d.recipient || d.envelope_to || (d.headers && d.headers.to) || '';
    const toStr = Array.isArray(toRaw) ? toRaw.join(',') : String(toRaw || '');
    const m = toStr.match(/reponse\+(\d+)@/i);
    const pipelineId = m ? parseInt(m[1], 10) : null;

    // Contenu : présent dans le webhook ou à récupérer via l'API Resend
    let text = d.text || d.plain || d.body_plain || '';
    let subject = d.subject || '(réponse)';
    let from = (typeof d.from === 'string') ? d.from : (d.from && (d.from.address || d.from.email)) || d.sender || '';
    if (!text && resendKey && (d.email_id || d.id)) {
      try {
        const rid = d.email_id || d.id;
        const rr = await fetch('https://api.resend.com/emails/' + rid, { headers: { Authorization: 'Bearer ' + resendKey } });
        const rj = await rr.json();
        text = rj.text || rj.html || text;
        subject = rj.subject || subject;
        from = from || rj.from || '';
      } catch (e) {}
    }
    if (!text) text = '(Contenu de la réponse non disponible — payload : ' + JSON.stringify(d).slice(0, 1500) + ')';

    if (!key) { res.status(200).json({ ok: true, note: 'stockage indisponible' }); return; }
    const h = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json', Prefer: 'return=minimal' };

    // Retrouver le club à partir du sponsor
    let clubId = null;
    if (pipelineId) {
      try {
        const pr = await (await fetch(url + '/rest/v1/pipeline?id=eq.' + pipelineId + '&select=club_id&limit=1', { headers: { apikey: key, Authorization: 'Bearer ' + key } })).json();
        if (Array.isArray(pr) && pr[0]) clubId = pr[0].club_id;
      } catch (e) {}
    }

    if (clubId) {
      await fetch(url + '/rest/v1/emails', {
        method: 'POST', headers: h,
        body: JSON.stringify({ club_id: clubId, pipeline_id: pipelineId, direction: 'in', from_email: from, to_email: null, subject: subject, body: text, sent_at: new Date().toISOString() })
      });
    }
    res.status(200).json({ ok: true });
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e) }); }
};
