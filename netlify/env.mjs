// Variables d'environnement vues par une fonction Netlify.
// Netlify les expose par deux canaux : process.env et Netlify.env. On fusionne les deux
// (Netlify.env l'emporte), pour qu'une variable réglée dans l'interface soit toujours vue.
export function lireEnv() {
  const env = { ...process.env };
  const sources = { processEnv: Boolean(process.env.SEL_EMPREINTE), netlifyEnv: false };
  try {
    const n = globalThis.Netlify?.env;
    if (n && typeof n.toObject === "function") {
      const o = n.toObject();
      Object.assign(env, o);
      sources.netlifyEnv = Boolean(o.SEL_EMPREINTE);
    } else if (n && typeof n.get === "function") {
      for (const cle of ["SEL_EMPREINTE", "ASSISTANT_IA", "ANTHROPIC_API_KEY", "BREVO_API_KEY", "EMAIL_EXPEDITEUR", "EMAIL_ORGANISATEUR", "SITE_URL", "ORIGINES_AUTORISEES", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
        const v = n.get(cle);
        if (v) env[cle] = v;
      }
      sources.netlifyEnv = Boolean(n.get("SEL_EMPREINTE"));
    }
  } catch { /* hors Netlify : process.env seul */ }
  return { env, sources };
}
