// Rattache l'utilisateur connecté à son club : accepte les invitations en attente
// (match par email), sinon crée son propre club. Utilise la clé service (RLS bypass).
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL || 'https://pizltvprhpbtxgpymjsq.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { res.status(500).json({ error: 'Service indisponible.' }); return; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Non authentifié.' }); return; }
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' };
  try {
    // Vérifier l'identité via le jeton de l'utilisateur
    const ur = await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } });
    const u = await ur.json();
    if (!u || !u.id) { res.status(401).json({ error: 'Session invalide.' }); return; }
    const uid = u.id, email = (u.email || '').toLowerCase();

    // 1. Accepter les invitations en attente correspondant à l'email
    if (email) {
      await fetch(url + '/rest/v1/members?status=eq.invited&user_id=is.null&email=ilike.' + encodeURIComponent(email), {
        method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: uid, status: 'active' })
      });
    }

    // 2. Récupérer les adhésions actives
    let mem = await (await fetch(url + '/rest/v1/members?user_id=eq.' + uid + '&status=eq.active&select=club_id,role,created_at', { headers: h })).json();
    if (!Array.isArray(mem)) mem = [];

    // 3. Aucun club : l'utilisateur devient propriétaire de son propre club
    if (mem.length === 0) {
      await fetch(url + '/rest/v1/members', {
        method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ club_id: uid, user_id: uid, email: email, role: 'owner', status: 'active' })
      });
      mem = [{ club_id: uid, role: 'owner', created_at: new Date().toISOString() }];
    }

    // 4. Club courant : le plus récent (un club rejoint sur invitation l'emporte)
    mem.sort((a, b) => ('' + (b.created_at || '')).localeCompare('' + (a.created_at || '')));
    res.status(200).json({ club_id: mem[0].club_id, role: mem[0].role, clubs: mem });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
