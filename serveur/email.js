// Envoi d'e-mails transactionnels via l'API Brevo (prestataire français).
// Nécessite BREVO_API_KEY et EMAIL_EXPEDITEUR (adresse validée chez Brevo).
// Retourne "envoye", "non-configure" ou "echec" : la page n'affiche « envoyé » que si "envoye".

export const emailConfigure = (env) => Boolean(env.BREVO_API_KEY && env.EMAIL_EXPEDITEUR);

export async function envoyerEmail(env, { a, sujet, texte }, fetchFn = fetch) {
  if (!emailConfigure(env)) return "non-configure";
  try {
    const r = await fetchFn("https://api.brevo.com/v3/smtp/email", {
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
    return r.ok ? "envoye" : "echec";
  } catch {
    return "echec";
  }
}
