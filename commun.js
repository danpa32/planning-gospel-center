// Code partagé par les pages du planning :
// construction du DOM, lecture/écriture des fichiers JSON (sur GitHub, ou en local avec serveur.py),
// enregistrement automatique, champs de formulaire.

const STOCKAGE = "planning-github";

// ---------- DOM ----------

function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null) n.append(e);
  return n;
}

function pastille(couleur) {
  return el("span", { class: "pastille", style: `--c:${couleur}` });
}

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

// Légende qu'on peut cacher ; le choix est retenu par ce navigateur.
const STOCKAGE_LEGENDE = "planning-legende-cachee";

function legendeRepliable(titre, ...contenu) {
  let cachee = false;
  try { cachee = localStorage.getItem(STOCKAGE_LEGENDE) === "1"; } catch { /* stockage indisponible */ }
  const details = el("details", cachee ? {} : { open: "" },
    el("summary", { class: "intro" }, el("span", {}, titre), el("span", { class: "bascule" })),
    ...contenu);
  details.addEventListener("toggle", () => {
    try { localStorage.setItem(STOCKAGE_LEGENDE, details.open ? "0" : "1"); } catch { /* stockage indisponible */ }
  });
  return details;
}

// ---------- Réglages GitHub (gardés dans ce navigateur uniquement) ----------

function lireReglages() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem(STOCKAGE)) || {}; } catch { /* stockage indisponible */ }
  const pages = /^([^.]+)\.github\.io$/.exec(location.hostname);
  if (pages && !r.depot) {
    const dossier = location.pathname.split("/")[1];
    r.depot = `${pages[1]}/${dossier || location.hostname}`;
  }
  r.branche ||= "main";
  return r;
}

function ecrireReglages(r) {
  try { localStorage.setItem(STOCKAGE, JSON.stringify(r)); } catch { /* stockage indisponible */ }
}

function githubConfigure() {
  const r = lireReglages();
  return Boolean(r.depot && r.jeton);
}

// ---------- API GitHub ----------

async function apiGithub(fichier, methode, corps) {
  const { depot, branche, jeton } = lireReglages();
  const url = `https://api.github.com/repos/${depot}/contents/${fichier}` +
    (methode === "GET" ? `?ref=${encodeURIComponent(branche)}` : "");
  const rep = await fetch(url, {
    method: methode,
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jeton}` },
    body: corps && JSON.stringify(corps),
  });
  if (!rep.ok) {
    const messages = {
      401: "jeton invalide ou expiré",
      403: "le jeton n'a pas le droit d'écrire dans ce dépôt",
      404: `dépôt « ${depot} » ou fichier ${fichier} introuvable (ou jeton sans accès)`,
      409: "le fichier a été modifié entre-temps par quelqu'un d'autre : rechargez la page",
      422: "le fichier a été modifié entre-temps par quelqu'un d'autre : rechargez la page",
    };
    throw new Error(messages[rep.status] || `erreur GitHub ${rep.status}`);
  }
  return rep.json();
}

// Lecture publique du fichier dans le dépôt (sans jeton pour les visiteurs).
// Renvoie null si le dépôt est inconnu ou injoignable, pour se rabattre sur le fichier publié.
async function lireFichierDepot(fichier) {
  const { depot, branche, jeton } = lireReglages();
  if (!depot) return null;
  const headers = { Accept: "application/vnd.github.raw+json" };
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  try {
    const rep = await fetch(
      `https://api.github.com/repos/${depot}/contents/${fichier}?ref=${encodeURIComponent(branche)}`,
      { cache: "no-cache", headers });
    return rep.ok ? await rep.text() : null;
  } catch {
    return null;
  }
}

// Le dépôt d'abord (toujours à jour), sinon le fichier publié à côté de la page.
// En local, toujours le fichier servi par serveur.py.
async function lireJson(fichier) {
  let texte = EN_LOCAL ? null : await lireFichierDepot(fichier);
  if (texte === null) {
    const rep = await fetch(fichier, { cache: "no-cache" });
    if (!rep.ok) throw new Error(`fichier introuvable (${rep.status})`);
    texte = await rep.text();
  }
  return JSON.parse(texte);
}

function versBase64(texte) {
  const octets = new TextEncoder().encode(texte);
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

function depuisBase64(b64) {
  const binaire = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binaire, c => c.charCodeAt(0)));
}

// Renvoie { donnees, sha } ; le sha est nécessaire pour réécrire le fichier ensuite.
async function chargerJsonGithub(fichier) {
  const rep = await apiGithub(fichier, "GET");
  return { donnees: JSON.parse(depuisBase64(rep.content)), sha: rep.sha };
}

// Renvoie le nouveau sha du fichier.
async function enregistrerJsonGithub(fichier, donnees, sha, message) {
  const { branche } = lireReglages();
  const rep = await apiGithub(fichier, "PUT", {
    message,
    content: versBase64(texteJson(donnees)),
    sha,
    branch: branche,
  });
  return rep.content.sha;
}

// ---------- Où enregistrer : serveur local de test ou dépôt GitHub ----------

// Sur localhost, serveur.py enregistre les fichiers dans le dossier local/ ; ailleurs, on écrit dans le dépôt.
const EN_LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

function enregistrementPossible() {
  return EN_LOCAL || githubConfigure();
}

function decrireStockage() {
  if (EN_LOCAL) return "Test en local : les modifications sont enregistrées dans le dossier local/.";
  const r = lireReglages();
  return githubConfigure()
    ? `Dépôt GitHub : ${r.depot} (${r.branche})`
    : "GitHub non configuré : les modifications peuvent seulement être téléchargées.";
}

// Renvoie { donnees, sha } ; en local, il n'y a pas de sha.
async function chargerJsonEdition(fichier) {
  if (!EN_LOCAL) return chargerJsonGithub(fichier);
  return { donnees: await lireJson(fichier), sha: null };
}

async function enregistrerJsonEdition(fichier, donnees, sha, message) {
  if (!EN_LOCAL) return enregistrerJsonGithub(fichier, donnees, sha, message);
  let rep;
  try {
    rep = await fetch(fichier, { method: "PUT", headers: { "Content-Type": "application/json" }, body: texteJson(donnees) });
  } catch {
    throw new Error("serveur local injoignable");
  }
  if (rep.status === 501) throw new Error("ce serveur n'enregistre pas, lancez « python3 serveur.py »");
  if (!rep.ok) throw new Error(`erreur du serveur local ${rep.status}`);
  return null;
}

// Enregistre automatiquement peu après chaque modification. Les modifications rapprochées
// (plusieurs champs, un glisser-déposer) sont regroupées en un seul enregistrement, et un seul
// enregistrement a lieu à la fois, car GitHub exige le sha de la version précédente.
// etatEdition : { modifie, sha, message, erreur } ; afficher() redessine le panneau d'édition.
function enregistrementAuto(fichier, etatEdition, lireDonnees, message, afficher) {
  let minuterie = null;
  let enCours = null;

  async function enregistrer() {
    clearTimeout(minuterie);
    while (enCours) await enCours;
    if (!etatEdition.modifie || !enregistrementPossible()) return;
    etatEdition.modifie = false;
    etatEdition.erreur = false;
    etatEdition.message = "Enregistrement…";
    afficher();
    enCours = enregistrerJsonEdition(fichier, lireDonnees(), etatEdition.sha, message)
      .then(sha => {
        etatEdition.sha = sha;
        etatEdition.message = etatEdition.modifie ? "" :
          EN_LOCAL ? "Enregistré ✓" : "Enregistré ✓ Le site public sera à jour dans une minute environ.";
      })
      .catch(e => {
        etatEdition.modifie = true;
        etatEdition.erreur = true;
        etatEdition.message = `Échec de l'enregistrement : ${e.message}.`;
      })
      .finally(() => { enCours = null; afficher(); });
    await enCours;
  }

  return {
    planifier() {
      clearTimeout(minuterie);
      if (enregistrementPossible()) minuterie = setTimeout(enregistrer, 1000);
    },
    maintenant: enregistrer,
  };
}

// Ligne d'état du panneau d'édition, avec « Réessayer » après un échec.
function statutEdition(etatEdition, auto) {
  const texte = etatEdition.message || (etatEdition.modifie
    ? (enregistrementPossible() ? "Enregistrement…" : "Modifications non enregistrées.")
    : "Les modifications sont enregistrées automatiquement.");
  return el("p", { class: etatEdition.modifie ? "statut modifie" : "statut" }, texte,
    etatEdition.erreur
      ? el("button", { type: "button", class: "lien", onclick: () => auto.maintenant() }, " Réessayer")
      : null);
}

// ---------- Fichier JSON lisible (petits objets sur une ligne) ----------

function formaterJson(v, retrait = "") {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const tableau = Array.isArray(v);
  const entrees = tableau ? v.map(x => [null, x]) : Object.entries(v);
  if (!entrees.length) return tableau ? "[]" : "{}";
  const parties = entrees.map(([k, x]) =>
    (k === null ? "" : `${JSON.stringify(k)}: `) + formaterJson(x, retrait + "  "));
  const simple = entrees.every(([, x]) =>
    x === null || typeof x !== "object" || (Array.isArray(x) && x.every(y => typeof y !== "object")));
  const enLigne = tableau ? `[${parties.join(", ")}]` : `{ ${parties.join(", ")} }`;
  if (simple && retrait.length + enLigne.length <= 90) return enLigne;
  const [ouvre, ferme] = tableau ? ["[", "]"] : ["{", "}"];
  return `${ouvre}\n${parties.map(p => `${retrait}  ${p}`).join(",\n")}\n${retrait}${ferme}`;
}

function texteJson(donnees) {
  return formaterJson(donnees) + "\n";
}

function telechargerJson(fichier, donnees) {
  const blob = new Blob([texteJson(donnees)], { type: "application/json" });
  const lien = el("a", { href: URL.createObjectURL(blob), download: fichier });
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// ---------- Formulaires ----------

function champ(libelle, controle, aide) {
  return el("label", { class: "champ" }, el("span", {}, libelle), controle, aide ? el("small", {}, aide) : null);
}

function select(options, valeur, attrs = {}) {
  const s = el("select", attrs, Object.entries(options).map(([v, t]) => el("option", { value: v }, t)));
  if (valeur != null) s.value = String(valeur);
  return s;
}

function entree(type, valeur, attrs = {}) {
  const i = el("input", { type, ...attrs });
  if (valeur != null) i.value = valeur;
  return i;
}

function ouvrirDialogue(formulaire) {
  const dialogue = el("dialog", { class: "dialogue" }, formulaire);
  dialogue.addEventListener("close", () => dialogue.remove());
  document.body.append(dialogue);
  dialogue.showModal();
  return dialogue;
}

// Bouton qui demande une confirmation (second clic dans les 3 secondes).
function boutonConfirmer(libelle, action) {
  const bouton = el("button", { type: "button", class: "lien danger" }, libelle);
  bouton.addEventListener("click", () => {
    if (bouton.dataset.confirmer) return action();
    bouton.dataset.confirmer = "1";
    bouton.textContent = "Confirmer ?";
    setTimeout(() => { delete bouton.dataset.confirmer; bouton.textContent = libelle; }, 3000);
  });
  return bouton;
}

// ---------- Réglages ----------

function ouvrirReglages(apresEnregistrement) {
  const r = lireReglages();
  const formulaire = el("form", { method: "dialog" },
    el("h2", {}, "Réglages GitHub"),
    el("p", {}, "Pour enregistrer, il faut un jeton GitHub avec le droit d'écrire dans le dépôt. ",
      el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener" },
        "Créer un jeton"),
      " : choisir « Only select repositories » → ce dépôt, puis Permissions → Contents → « Read and write »."),
    champ("Dépôt", entree("text", r.depot, { name: "depot", placeholder: "compte/depot", required: "" })),
    champ("Branche", entree("text", r.branche, { name: "branche", required: "" })),
    champ("Jeton", entree("password", r.jeton, { name: "jeton", placeholder: "github_pat_…", autocomplete: "off" }),
      "Le jeton reste enregistré dans ce navigateur uniquement."),
    el("div", { class: "boutons" },
      el("button", { type: "button", class: "secondaire", onclick: () => dialogue.close() }, "Annuler"),
      el("button", { type: "submit", class: "principal" }, "Enregistrer")));

  formulaire.addEventListener("submit", async e => {
    e.preventDefault();
    const d = new FormData(formulaire);
    ecrireReglages({ depot: d.get("depot").trim(), branche: d.get("branche").trim(), jeton: d.get("jeton").trim() });
    dialogue.close();
    await apresEnregistrement();
  });

  const dialogue = ouvrirDialogue(formulaire);
}
