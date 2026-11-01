// Envoi d'e-mails transactionnels via l'API Brevo (prestataire français).
// Nécessite BREVO_API_KEY et EMAIL_EXPEDITEUR (adresse d'expédition validée chez Brevo).
// Retourne :
//   "accepte"       : Brevo a ACCEPTÉ le message (réponse 2xx). Cela ne garantit PAS sa réception
//                     (filtre anti-spam, adresse erronée, boîte pleine) : ne jamais écrire « reçu » ;
//   "non-configure" : Brevo n'est pas connecté, rien n'a été envoyé ;
//   "echec"         : Brevo a refusé ou n'a pas répondu, rien n'a été envoyé.

export const emailConfigure = (env) => Boolean(env.BREVO_API_KEY && env.EMAIL_EXPEDITEUR);

export async function envoyerEmail(env, { a, sujet, texte }, fetchFn = fetch) {
  if (!emailConfigure(env)) return "non-configure";
  try {
    // BREVO_API_URL : simulateur local pour les tests uniquement.
    const r = await (fetchFn || fetch)(`${env.BREVO_API_URL || "https://api.brevo.com/v3"}/smtp/email`, {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: env.EMAIL_EXPEDITEUR, name: env.EMAIL_NOM_EXPEDITEUR || "AUREVIA SAAS" },
        to: [{ email: a }],
        replyTo: env.EMAIL_REPONSE ? { email: env.EMAIL_REPONSE } : undefined,
        subject: sujet,
        textContent: texte,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? "accepte" : "echec";
  } catch {
    return "echec";
  }
}
