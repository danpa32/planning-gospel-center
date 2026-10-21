// Mode édition : modifier les événements depuis la page, puis les enregistrer
// directement dans evenements.json sur GitHub (API GitHub + jeton personnel).

const STOCKAGE = "planning-github";
const FICHIER = "evenements.json";
const edition = { actif: false, sha: null, modifie: false, message: "" };

const TYPES_REGLE = {
  chaque_annee: "Même date chaque année",
  jour: "N-ième jour d'un mois",
  paques: "Par rapport à Pâques",
  proche_de: "Jour le plus proche d'une date",
  a_partir_de: "Premier jour à partir d'une date",
  date: "Une seule fois (date précise)",
};
const RANGS = { 1: "1er", 2: "2e", 3: "3e", 4: "4e", 5: "5e", dernier: "dernier" };

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

async function apiGithub(methode, corps) {
  const { depot, branche, jeton } = lireReglages();
  const url = `https://api.github.com/repos/${depot}/contents/${FICHIER}` +
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
      404: `dépôt « ${depot} » ou fichier ${FICHIER} introuvable (ou jeton sans accès)`,
      409: "le fichier a été modifié entre-temps par quelqu'un d'autre : rechargez la page",
      422: "le fichier a été modifié entre-temps par quelqu'un d'autre : rechargez la page",
    };
    throw new Error(messages[rep.status] || `erreur GitHub ${rep.status}`);
  }
  return rep.json();
}

// Lecture publique du fichier dans le dépôt (sans jeton pour les visiteurs).
// Renvoie null si le dépôt est inconnu ou injoignable, pour se rabattre sur le fichier publié.
async function lireFichierDepot() {
  const { depot, branche, jeton } = lireReglages();
  if (!depot) return null;
  const headers = { Accept: "application/vnd.github.raw+json" };
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  try {
    const rep = await fetch(
      `https://api.github.com/repos/${depot}/contents/${FICHIER}?ref=${encodeURIComponent(branche)}`,
      { cache: "no-cache", headers });
    return rep.ok ? await rep.text() : null;
  } catch {
    return null;
  }
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

async function chargerDepuisGithub() {
  const fichier = await apiGithub("GET");
  etat.donnees = JSON.parse(depuisBase64(fichier.content));
  etat.donnees.categories ||= {};
  etat.donnees.evenements ||= [];
  edition.sha = fichier.sha;
}

async function enregistrerSurGithub() {
  const { branche } = lireReglages();
  const rep = await apiGithub("PUT", {
    message: "Mise à jour du planning depuis l'interface web",
    content: versBase64(texteFichier()),
    sha: edition.sha,
    branch: branche,
  });
  edition.sha = rep.content.sha;
  edition.modifie = false;
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

function texteFichier() {
  return formaterJson(etat.donnees) + "\n";
}

function telechargerFichier() {
  const blob = new Blob([texteFichier()], { type: "application/json" });
  const lien = el("a", { href: URL.createObjectURL(blob), download: FICHIER });
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// ---------- Description lisible d'une règle ----------

function nomDateMoisJour(texte) {
  const [m, j] = texte.split("-").map(Number);
  return `${j === 1 ? "1er" : j} ${NOMS_MOIS[m - 1]}`;
}

function listeMois(mois) {
  const noms = [].concat(mois).map(m => NOMS_MOIS[m - 1]);
  return noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}` : noms[0];
}

function decrireRegle(evt) {
  const q = evt.quand || {};
  let texte = "règle inconnue";
  if ("chaque_annee" in q) texte = `chaque ${nomDateMoisJour(q.chaque_annee)}`;
  else if ("paques" in q) {
    const n = Number(q.paques);
    texte = n === 0 ? "Pâques" : `Pâques ${n > 0 ? "+" : "−"} ${Math.abs(n)} jour${Math.abs(n) > 1 ? "s" : ""}`;
  } else if ("proche_de" in q) texte = `${q.jour} le plus proche du ${nomDateMoisJour(q.proche_de)}`;
  else if ("a_partir_de" in q) texte = `1er ${q.jour} à partir du ${nomDateMoisJour(q.a_partir_de)}`;
  else if ("jour" in q) {
    const mois = listeMois(q.mois);
    texte = `${RANGS[q.rang] || q.rang} ${q.jour} ${/^[aeiouy]/.test(mois) ? "d'" : "de "}${mois}`;
  }
  else if ("date" in q) texte = [].concat(q.date).map(d => fmtLong.format(lireDate(d)) + " " + d.slice(0, 4)).join(", ");

  const extras = [];
  if (q.decalage) extras.push(`décalé de ${q.decalage} j`);
  if (q.repeter > 1) extras.push(`${q.repeter} semaines de suite`);
  if (evt.duree > 1) extras.push(`${evt.duree} jours`);
  if (evt.exceptions) extras.push("avec exceptions");
  return [texte, ...extras].join(" · ");
}

// ---------- Panneau d'édition ----------

function marquerModifie() {
  edition.modifie = true;
  edition.message = "";
  rendre();
  rendreEditeur();
}

function boutonSupprimer(index) {
  const bouton = el("button", { type: "button", class: "lien danger" }, "Supprimer");
  bouton.addEventListener("click", () => {
    if (bouton.dataset.confirmer) {
      etat.donnees.evenements.splice(index, 1);
      marquerModifie();
    } else {
      bouton.dataset.confirmer = "1";
      bouton.textContent = "Confirmer ?";
      setTimeout(() => { delete bouton.dataset.confirmer; bouton.textContent = "Supprimer"; }, 3000);
    }
  });
  return bouton;
}

function rendreEditeur() {
  const zone = document.getElementById("editeur");
  zone.hidden = !edition.actif;
  document.body.classList.toggle("en-edition", edition.actif);
  if (!edition.actif) return zone.replaceChildren();

  const reglages = lireReglages();
  const source = githubConfigure()
    ? `Dépôt GitHub : ${reglages.depot} (${reglages.branche})`
    : "GitHub non configuré : les modifications peuvent seulement être téléchargées.";
  const statut = edition.message || (edition.modifie ? "Modifications non enregistrées." : "Aucune modification en cours.");

  const enregistrer = el("button", { type: "button", class: "principal" }, "Enregistrer sur GitHub");
  enregistrer.disabled = !edition.modifie || !githubConfigure();
  enregistrer.addEventListener("click", async () => {
    enregistrer.disabled = true;
    enregistrer.textContent = "Enregistrement…";
    try {
      await enregistrerSurGithub();
      edition.message = "Enregistré ✓ Le site public sera à jour dans une minute environ.";
    } catch (e) {
      edition.message = `Échec de l'enregistrement : ${e.message}.`;
    }
    rendreEditeur();
  });

  const lignes = etat.donnees.evenements.map((evt, i) => el("li", {},
    pastille(categorie(evt).couleur),
    el("div", { class: "def" },
      el("strong", {}, evt.titre || "(sans titre)"),
      el("span", {}, decrireRegle(evt))),
    el("div", { class: "boutons" },
      el("button", { type: "button", class: "lien", onclick: () => ouvrirFormulaire(i) }, "Modifier"),
      boutonSupprimer(i))));

  zone.replaceChildren(
    el("div", { class: "editeur-entete" },
      el("div", {},
        el("h2", {}, "Mode édition"),
        el("p", { class: "source" }, source),
        el("p", { class: edition.modifie ? "statut modifie" : "statut" }, statut)),
      el("div", { class: "boutons" },
        el("button", { type: "button", class: "secondaire", onclick: () => ouvrirFormulaire(null) }, "+ Ajouter un événement"),
        enregistrer,
        el("button", { type: "button", class: "secondaire", onclick: telechargerFichier }, "Télécharger le fichier"),
        el("button", { type: "button", class: "secondaire", onclick: ouvrirReglages }, "Réglages GitHub"),
        el("button", { type: "button", class: "secondaire", onclick: quitterEdition }, "Quitter"))),
    el("ul", { class: "definitions" }, lignes));
}

async function entrerEdition() {
  edition.actif = true;
  if (githubConfigure() && !edition.modifie) {
    try {
      await chargerDepuisGithub();
      edition.message = "";
    } catch (e) {
      edition.message = `Impossible de lire le fichier sur GitHub : ${e.message}.`;
    }
  }
  rendre();
  rendreEditeur();
}

function quitterEdition() {
  edition.actif = false;
  rendreEditeur();
}

// ---------- Formulaire d'un événement ----------

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

const OPTIONS_JOURS = Object.fromEntries(Object.keys(JOURS).map(j => [j, j]));
const OPTIONS_MOIS = Object.fromEntries(NOMS_MOIS.map((m, i) => [i + 1, m]));

function typeDeRegle(q) {
  // "proche_de" et "a_partir_de" utilisent aussi la clé "jour" : ils doivent être testés avant.
  return ["proche_de", "a_partir_de", "chaque_annee", "paques", "date", "jour"].find(t => t in q) || "jour";
}

function champsRegle(type, q) {
  const [mm, jj] = (q.chaque_annee || q.proche_de || q.a_partir_de || "01-01").split("-").map(Number);
  switch (type) {
    case "chaque_annee":
      return el("div", { class: "rangee" },
        champ("Jour", entree("number", jj, { name: "jj", min: 1, max: 31, required: "" })),
        champ("Mois", select(OPTIONS_MOIS, mm, { name: "mm" })));
    case "paques":
      return champ("Jours après Pâques", entree("number", q.paques ?? 0, { name: "paques" }),
        "0 = Pâques · −2 = Vendredi saint · 39 = Ascension · 49 = Pentecôte");
    case "proche_de":
      return el("div", { class: "rangee" },
        champ("Le", select(OPTIONS_JOURS, q.jour || "samedi", { name: "jour" })),
        champ("le plus proche du", entree("number", jj, { name: "jj", min: 1, max: 31, required: "" })),
        champ("Mois", select(OPTIONS_MOIS, mm, { name: "mm" })));
    case "a_partir_de":
      return el("div", { class: "rangee" },
        champ("Le 1er", select(OPTIONS_JOURS, q.jour || "dimanche", { name: "jour" })),
        champ("à partir du", entree("number", jj, { name: "jj", min: 1, max: 31, required: "" })),
        champ("Mois", select(OPTIONS_MOIS, mm, { name: "mm" })));
    case "date":
      return champ("Date(s)", entree("text", [].concat(q.date || []).join(", "),
        { name: "date", placeholder: "2027-10-16", required: "" }),
        "Format AAAA-MM-JJ, plusieurs dates séparées par des virgules.");
    default: {
      const mois = new Set([].concat(q.mois || []).map(Number));
      return el("div", {},
        el("div", { class: "rangee" },
          champ("Le", select(RANGS, q.rang ?? 1, { name: "rang" })),
          champ("Jour", select(OPTIONS_JOURS, q.jour || "dimanche", { name: "jour" }))),
        el("fieldset", { class: "mois-choix" }, el("legend", {}, "de"),
          NOMS_MOIS.map((nom, i) => el("label", {},
            el("input", { type: "checkbox", name: "mois", value: i + 1, ...(mois.has(i + 1) ? { checked: "" } : {}) }),
            nom))));
    }
  }
}

function deuxChiffres(n) {
  return String(n).padStart(2, "0");
}

function lireRegle(f, type) {
  const d = new FormData(f);
  switch (type) {
    case "chaque_annee":
      return { chaque_annee: `${deuxChiffres(d.get("mm"))}-${deuxChiffres(d.get("jj"))}` };
    case "paques":
      return { paques: Number(d.get("paques")) };
    case "proche_de":
      return { proche_de: `${deuxChiffres(d.get("mm"))}-${deuxChiffres(d.get("jj"))}`, jour: d.get("jour") };
    case "a_partir_de":
      return { a_partir_de: `${deuxChiffres(d.get("mm"))}-${deuxChiffres(d.get("jj"))}`, jour: d.get("jour") };
    case "date": {
      const dates = d.get("date").split(",").map(s => s.trim()).filter(Boolean);
      return { date: dates.length === 1 ? dates[0] : dates };
    }
    default: {
      const mois = d.getAll("mois").map(Number);
      if (!mois.length) throw new Error("choisissez au moins un mois");
      const rang = d.get("rang");
      return { jour: d.get("jour"), rang: rang === "dernier" ? rang : Number(rang), mois: mois.length === 1 ? mois[0] : mois };
    }
  }
}

function texteExceptions(exceptions = {}) {
  return Object.entries(exceptions)
    .map(([annee, v]) => `${annee} = ${v === null ? "annulé" : [].concat(v).join(", ")}`)
    .join("\n");
}

function lireExceptions(texte) {
  const exceptions = {};
  for (const ligne of texte.split("\n").map(l => l.trim()).filter(Boolean)) {
    const m = /^(\d{4})\s*=\s*(.+)$/.exec(ligne);
    if (!m) throw new Error(`exception « ${ligne} » : format attendu « 2027 = 2027-05-21 » ou « 2027 = annulé »`);
    const valeurs = m[2].split(",").map(s => s.trim());
    exceptions[m[1]] = valeurs[0] === "annulé" ? "annulé" : valeurs.length === 1 ? valeurs[0] : valeurs;
  }
  return Object.keys(exceptions).length ? exceptions : undefined;
}

function ouvrirFormulaire(index) {
  const existant = index === null ? null : etat.donnees.evenements[index];
  const evt = existant || { categorie: Object.keys(etat.donnees.categories)[0], quand: { jour: "dimanche", rang: 1, mois: 1 } };
  const q = evt.quand || {};
  let type = typeDeRegle(q);

  const zoneRegle = el("div", { class: "zone-regle" }, champsRegle(type, q));
  const choixType = select(TYPES_REGLE, type, { name: "type" });
  choixType.addEventListener("change", () => {
    type = choixType.value;
    zoneRegle.replaceChildren(champsRegle(type, {}));
  });
  const erreur = el("p", { class: "erreur-form" });

  const categories = Object.fromEntries(Object.entries(etat.donnees.categories).map(([k, c]) => [k, c.nom]));
  const formulaire = el("form", { method: "dialog" },
    el("h2", {}, existant ? "Modifier l'événement" : "Nouvel événement"),
    champ("Titre", entree("text", evt.titre, { name: "titre", required: "" })),
    champ("Catégorie", select(categories, evt.categorie, { name: "categorie" })),
    champ("Quand", choixType),
    zoneRegle,
    el("details", { class: "avance", ...(q.decalage || q.repeter > 1 || evt.duree > 1 || evt.exceptions ? { open: "" } : {}) },
      el("summary", {}, "Durée, répétition, exceptions"),
      el("div", { class: "rangee" },
        champ("Durée (jours)", entree("number", evt.duree || 1, { name: "duree", min: 1 })),
        champ("Répéter chaque semaine", entree("number", q.repeter || 1, { name: "repeter", min: 1 }), "nombre de fois"),
        champ("Décalage (jours)", entree("number", q.decalage || 0, { name: "decalage" }))),
      champ("Exceptions", el("textarea", { name: "exceptions", rows: 3, placeholder: "2027 = 2027-05-21\n2028 = annulé" },
        texteExceptions(evt.exceptions)), "Une année par ligne, pour déplacer ou annuler une année précise.")),
    el("div", { class: "rangee" },
      champ("Heure", entree("text", evt.heure, { name: "heure", placeholder: etat.donnees.par_defaut?.heure || "10h00" })),
      champ("Lieu", entree("text", evt.lieu, { name: "lieu", placeholder: etat.donnees.par_defaut?.lieu || "" }))),
    etat.donnees.par_defaut ? el("p", { class: "aide" }, "Laisser l'heure ou le lieu vide pour utiliser la valeur par défaut.") : null,
    champ("Description", el("textarea", { name: "description", rows: 2 }, evt.description || "")),
    erreur,
    el("div", { class: "boutons" },
      el("button", { type: "button", class: "secondaire", onclick: () => dialogue.close() }, "Annuler"),
      el("button", { type: "submit", class: "principal" }, existant ? "Appliquer" : "Ajouter")));

  formulaire.addEventListener("submit", e => {
    e.preventDefault();
    const d = new FormData(formulaire);
    try {
      const quand = lireRegle(formulaire, type);
      const decalage = Number(d.get("decalage")) || 0;
      const repeter = Number(d.get("repeter")) || 1;
      if (decalage) quand.decalage = decalage;
      if (repeter > 1) quand.repeter = repeter;

      const nouveau = { titre: d.get("titre").trim(), categorie: d.get("categorie"), quand };
      const duree = Number(d.get("duree")) || 1;
      if (duree > 1) nouveau.duree = duree;
      for (const cle of ["heure", "lieu", "description"]) {
        const v = d.get(cle).trim();
        if (v) nouveau[cle] = v;
      }
      const exceptions = lireExceptions(d.get("exceptions"));
      if (exceptions) nouveau.exceptions = exceptions;
      if (existant?.annees) nouveau.annees = existant.annees;

      datesPourAnnee(nouveau, etat.annee); // vérifie que la règle est calculable

      if (existant) etat.donnees.evenements[index] = nouveau;
      else etat.donnees.evenements.push(nouveau);
      dialogue.close();
      marquerModifie();
    } catch (err) {
      erreur.textContent = err.message.charAt(0).toUpperCase() + err.message.slice(1);
    }
  });

  const dialogue = el("dialog", { class: "dialogue" }, formulaire);
  dialogue.addEventListener("close", () => dialogue.remove());
  document.body.append(dialogue);
  dialogue.showModal();
}

// ---------- Réglages ----------

function ouvrirReglages() {
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
    await entrerEdition();
  });

  const dialogue = el("dialog", { class: "dialogue" }, formulaire);
  dialogue.addEventListener("close", () => dialogue.remove());
  document.body.append(dialogue);
  dialogue.showModal();
}

function initEditeur() {
  document.getElementById("modifier").addEventListener("click", entrerEdition);
  window.addEventListener("beforeunload", e => {
    if (edition.modifie) e.preventDefault();
  });
  if (new URLSearchParams(location.hash.slice(1)).has("edition")) entrerEdition();
}
