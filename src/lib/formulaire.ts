// Branche un formulaire : validation accessible, envoi au serveur, gestion honnête des résultats.
type Resultat = { ok: boolean; erreurs: Record<string, string>; valeurs: Record<string, unknown> };
type Options = {
  valider: (d: Record<string, unknown>) => Resultat;
  url: string;
  zone: HTMLElement;                                   // zone de message (succès / problème)
  succes: (reponse: any, valeurs: Record<string, unknown>) => void;
  indisponible: (valeurs: Record<string, unknown>, code: string) => void;
};

export function lireFormulaire(form: HTMLFormElement): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    d[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  return d;
}

export function afficherErreurs(form: HTMLFormElement, erreurs: Record<string, string>) {
  let premier: HTMLElement | null = null;
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    const msg = erreurs[el.name];
    const zone = form.querySelector<HTMLElement>(`#err-${el.name}`);
    if (msg) {
      el.setAttribute("aria-invalid", "true");
      if (zone) { zone.textContent = msg; zone.hidden = false; }
      premier ??= el;
    } else {
      el.removeAttribute("aria-invalid");
      if (zone) { zone.textContent = ""; zone.hidden = true; }
    }
  }
  premier?.focus();
}

export function message(zone: HTMLElement, type: "ok" | "ko" | "info", titre: string, paragraphes: (string | Node)[]) {
  zone.hidden = false;
  zone.className = `message-formulaire ${type}`;
  zone.replaceChildren();
  const h = document.createElement("h3");
  h.textContent = titre;
  zone.append(h);
  for (const p of paragraphes) {
    if (typeof p === "string") { const e = document.createElement("p"); e.textContent = p; zone.append(e); }
    else zone.append(p);
  }
  zone.setAttribute("tabindex", "-1");
  zone.focus();
}

export function brancher(form: HTMLFormElement, o: Options) {
  form.noValidate = true;   // on affiche nos propres messages, plus clairs
  const bouton = form.querySelector<HTMLButtonElement>("button[type=submit]");
  // Heure d'ouverture du formulaire : le serveur refuse les envois trop rapides (robots).
  const ouvertLe = Date.now();
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const donnees = lireFormulaire(form);
    const r = o.valider(donnees);
    afficherErreurs(form, r.erreurs);
    if (!r.ok) return;
    if (bouton) { bouton.disabled = true; bouton.dataset.texte = bouton.textContent || ""; bouton.textContent = "Envoi en cours…"; }
    form.setAttribute("aria-busy", "true");
    try {
      const rep = await fetch(o.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...donnees, ouvert_le: ouvertLe }),
        signal: AbortSignal.timeout(15_000),   // pas d'attente infinie si le serveur ne répond pas
      });
      const data = await rep.json().catch(() => null);
      if (rep.ok && data?.ok) { o.succes(data, r.valeurs); return; }
      if (rep.status === 400 && data?.erreurs) { afficherErreurs(form, data.erreurs); return; }
      if (rep.status === 429) {
        message(o.zone, "ko", "Trop de demandes", ["Votre demande n’a pas été enregistrée. Merci de réessayer dans quelques minutes."]);
        return;
      }
      if (rep.status === 400 && data?.code === "trop_rapide") {
        message(o.zone, "ko", "Envoi trop rapide", ["Par sécurité, patientez quelques secondes puis cliquez à nouveau sur le bouton d’envoi."]);
        return;
      }
      o.indisponible(r.valeurs, data?.code || `http_${rep.status}`);
    } catch {
      o.indisponible(r.valeurs, "reseau");
    } finally {
      form.removeAttribute("aria-busy");
      if (bouton) { bouton.disabled = false; bouton.textContent = bouton.dataset.texte || "Envoyer"; }
    }
  });
}

/** Lien de brouillon d'e-mail (mailto ou Gmail), tronqué pour rester sous la taille maximale d'un lien. */
export function lienBrouillon(type: "mailto" | "gmail", a: string, sujet: string, corps: string) {
  const c = corps.length > 1500 ? corps.slice(0, 1500) + "\n[…texte raccourci]" : corps;
  return type === "mailto"
    ? `mailto:${a}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(c)}`
    : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(a)}&su=${encodeURIComponent(sujet)}&body=${encodeURIComponent(c)}`;
}

export function boutonsBrouillon(a: string, sujet: string, corps: string) {
  const p = document.createElement("p");
  p.className = "cta";
  const m = document.createElement("a");
  m.className = "btn"; m.href = lienBrouillon("mailto", a, sujet, corps); m.textContent = "Ouvrir mon application mail";
  const g = document.createElement("a");
  g.className = "btn alt"; g.href = lienBrouillon("gmail", a, sujet, corps); g.target = "_blank"; g.rel = "noopener";
  g.textContent = "Ouvrir Gmail";
  p.append(m, g);
  return p;
}
