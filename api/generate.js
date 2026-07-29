module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "Clé API absente : configure ANTHROPIC_API_KEY dans Vercel." }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { type, data } = body;
    const { system, prompt } = buildPrompt(type, data || {});
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1600, system, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json();
    if (j.error) { res.status(500).json({ error: j.error.message || 'Erreur IA' }); return; }
    res.status(200).json({ text: (j.content && j.content[0] && j.content[0].text) || '' });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
};
function buildPrompt(type, d) {
  const club = `Club : ${d.club || 'le club'} (${d.sport || 'sport'}), ${d.lic || '?'} licenciés, environ ${d.spec || '?'} spectateurs par match, ${d.res || '?'} abonnés réseaux.`;
  if (type === 'contrat') {
    const cps = (d.contreparties || []).join(' ; ');
    return {
      system: "Tu rédiges des contrats de parrainage sportif clairs, simples et équilibrés, en français, prêts à signer, structurés en articles numérotés.",
      prompt: `Rédige un contrat de parrainage entre ${d.club || 'le Club'} (« le Club ») et ${d.sponsor || 'le partenaire'} (« le Parrain »).\n${club}\nMontant : ${d.montant || 'à préciser'} € pour la saison.\nContreparties : ${cps || 'à préciser'}.\nArticles : Objet, Contreparties détaillées, Montant et paiement, Durée (une saison, sans reconduction tacite), Obligations, Résiliation, puis blocs de signature (le Club / le Parrain) avec lieu et date.`
    };
  }
  return {
    system: "Tu rédiges des emails de prospection chaleureux, concrets et concis pour des clubs de sport amateur cherchant des sponsors locaux. En français, ton direct et sympathique. Termine par une proposition d'échange court.",
    prompt: `Rédige un email d'approche pour proposer un partenariat à « ${d.sponsor || 'ce commerce'} » (${d.categorie || 'commerce local'}).\n${club}\nMets en avant la visibilité (panneau au stade, logo sur les tenues, posts réseaux) et 3 formules de 300 à 1500 €.\nDonne une ligne « Objet : … » puis le corps. 150 mots max.`
  };
}
