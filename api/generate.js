// Fonction serveur Sponsoclub — génération IA (email, contrat)
// La clé API reste secrète ici (variable d'environnement ANTHROPIC_API_KEY sur Vercel).

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "Clé API absente : configure ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables)." }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { type, data } = body;
    const { system, prompt } = buildPrompt(type, data || {});
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2600,
        system,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const j = await r.json();
    if (j.error) { res.status(500).json({ error: j.error.message || 'Erreur IA' }); return; }
    const text = (j.content && j.content[0] && j.content[0].text) || '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

function buildPrompt(type, d) {
  const club = `Club : ${d.club || 'le club'} (${d.sport || 'sport'}), ${d.lic || '?'} licenciés, environ ${d.spec || '?'} spectateurs par match, ${d.res || '?'} abonnés sur les réseaux sociaux.`;
  const mecenat = d.mecenat !== false;
  if (type === 'offres') {
    return {
      system: "Tu extrais les offres de sponsoring depuis le texte d'un dossier de club sportif. Tu réponds UNIQUEMENT par un tableau JSON valide, sans texte ni balise markdown autour.",
      prompt: `Voici le texte d'un dossier de partenariat. Identifie les formules/offres de sponsoring et renvoie un tableau JSON. Chaque élément : {"nom": string, "prix": number (en euros, 0 si non précisé), "desc": string, "contreparties": [string, ...]}.\n\nRègles :\n- Reprends fidèlement les intitulés, les prix et les contreparties du document. N'invente jamais d'offre, de prix ni de contrepartie.\n- Pour "desc" : si le document fournit une description, reprends-la. Sinon, RÉDIGE toi-même une description courte (une phrase), élégante et vendeuse, orientée bénéfice pour le partenaire (visibilité locale, image, proximité), et cohérente avec le niveau de l'offre (plus l'offre est chère, plus le ton est premium). Évite les formulations plates du type « formule d'entrée de gamme ».\n\nRéponds uniquement le JSON.\n\nTEXTE DU DOCUMENT :\n${(d.text || '').slice(0, 12000)}`
    };
  }
  if (type === 'contrat') {
    const cps = (d.contreparties || []).join(' ; ');
    const mecArt = mecenat ? `\nLe Club étant une association d'intérêt général, le versement ouvre droit pour le Parrain à une réduction d'impôt de 60 % au titre du mécénat (art. 238 bis du CGI) ; ajoute un article « Régime fiscal (mécénat) » le mentionnant et précise qu'un reçu fiscal Cerfa sera remis.` : '';
    const duree = (d.debut || d.fin)
      ? `\nDurée du partenariat : ${d.debut ? 'du ' + d.debut : ''}${d.fin ? ' au ' + d.fin : ''}. Utilise impérativement ces dates dans l'article « Durée » (pas de reconduction tacite).`
      : `\nDurée : une saison sportive, sans reconduction tacite.`;
    return {
      system: "Tu rédiges des contrats de parrainage sportif clairs, simples et équilibrés, en français, prêts à signer, structurés en articles numérotés. Reste concis et professionnel, sans jargon inutile.",
      prompt: `Rédige un contrat de parrainage sportif entre ${d.club || 'le Club'} (« le Club ») et ${d.sponsor || 'le partenaire'} (« le Parrain »).\n${club}\nMontant du parrainage : ${d.montant || 'à préciser'} €.\nContreparties offertes par le Club au Parrain : ${cps || 'à préciser'}.${duree}${mecArt}\nInclure les articles : Objet, Contreparties (détaillées), Montant et modalités de paiement, Durée (avec les dates ci-dessus), Obligations des parties, Résiliation, puis deux blocs de signature (le Club / le Parrain) avec lieu et date.`
    };
  }
  const mecLine = mecenat ? ` Mets en avant l'avantage fiscal du mécénat : réduction d'impôt de 60 % sur le don (un don de 1 000 € ne coûte réellement que 400 € au partenaire).` : '';
  return {
    system: "Tu rédiges des emails de prospection chaleureux, concrets et concis pour des clubs de sport amateur qui cherchent des sponsors locaux. En français, ton direct et sympathique, sans superlatifs creux. Termine par une proposition d'échange court.",
    prompt: `Rédige un email d'approche pour proposer un partenariat à un commerce local nommé « ${d.sponsor || 'ce commerce'} » (${d.categorie || 'commerce de proximité'}).\n${club}\nMets en avant une visibilité locale (panneau au stade, logo sur les tenues, posts sur les réseaux).${mecLine}\nDonne d'abord une ligne « Objet : … » accrocheuse, puis le corps de l'email. Maximum 160 mots.`
  };
}
