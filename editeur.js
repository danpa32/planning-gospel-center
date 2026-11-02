// Mode édition : modifier les événements depuis la page. Chaque modification est enregistrée
// automatiquement dans Firebase (comptes Google autorisés), ou en local avec serveur.py.

const FICHIER = "evenements.json";
const edition = { actif: false, version: null, modifie: false, message: "", erreur: false };
const autoPlanning = enregistrementAuto(FICHIER, edition, () => etat.donnees, () => rendreEditeur());

const TYPES_REGLE = {
  chaque_annee: "Même date chaque année",
  jour: "N-ième jour d'un mois",
  paques: "Par rapport à Pâques",
  proche_de: "Jour le plus proche d'une date",
  date: "Une seule fois (date précise)",
};

async function chargerPourEdition() {
  const { donnees, version } = await chargerJsonEdition(FICHIER);
  etat.donnees = donnees;
  etat.donnees.categories ||= {};
  etat.donnees.evenements ||= [];
  edition.version = version;
}

// ---------- Panneau d'édition ----------

function marquerModifie() {
  edition.modifie = true;
  edition.message = "";
  rendre();
  rendreEditeur();
  autoPlanning.planifier();
}

function rendreEditeur() {
  const zone = document.getElementById("editeur");
  zone.hidden = !edition.actif;
  document.body.classList.toggle("en-edition", edition.actif);
  if (!edition.actif) return zone.replaceChildren();

  const lignes = etat.donnees.evenements.map((evt, i) => el("li", {},
    pastille(categorie(evt).couleur),
    el("div", { class: "def" },
      el("strong", {}, evt.titre || "(sans titre)"),
      el("span", {}, [decrireRegle(evt), evt.responsable].filter(Boolean).join(" · "))),
    el("div", { class: "boutons" },
      el("button", { type: "button", class: "lien", onclick: () => ouvrirFormulaire(i) }, "Modifier"),
      boutonConfirmer("Supprimer", () => {
        etat.donnees.evenements.splice(i, 1);
        marquerModifie();
      }))));

  zone.replaceChildren(
    el("div", { class: "editeur-entete" },
      el("div", {},
        el("h2", {}, "Mode édition"),
        el("p", { class: "source" }, decrireStockage()),
        statutEdition(edition, autoPlanning),
        el("p", { class: "source" },
          "Cliquez sur un jour du calendrier pour y ajouter un événement, ou sur un événement pour le modifier.")),
      el("div", { class: "boutons" },
        el("button", { type: "button", class: "principal", onclick: () => ouvrirFormulaire(null) }, "+ Ajouter un événement"),
        el("button", { type: "button", class: "secondaire", onclick: () => telechargerJson(FICHIER, etat.donnees) }, "Télécharger le fichier"),
        boutonCompte(),
        el("button", { type: "button", class: "secondaire", onclick: quitterEdition }, "Quitter"))),
    // Repliée par défaut : on travaille directement dans le calendrier.
    el("details", { class: "toutes-definitions", ...(edition.listeOuverte ? { open: "" } : {}),
      ontoggle: e => (edition.listeOuverte = e.currentTarget.open) },
      el("summary", {}, `Liste de tous les événements (${lignes.length})`),
      el("ul", { class: "definitions" }, lignes)));
}

async function entrerEdition() {
  edition.actif = true;
  if (enregistrementPossible() && !edition.modifie) {
    try {
      await chargerPourEdition();
      edition.message = "";
    } catch (e) {
      edition.message = `Impossible de lire le planning ${EN_LOCAL ? "local" : "en ligne"} : ${e.message}.`;
    }
  }
  rendre();
  rendreEditeur();
}

function quitterEdition() {
  edition.actif = false;
  rendre();
  rendreEditeur();
}

// ---------- Formulaire d'un événement ----------

const OPTIONS_JOURS = Object.fromEntries(Object.keys(JOURS).map(j => [j, j]));
const OPTIONS_MOIS = Object.fromEntries(NOMS_MOIS.map((m, i) => [i + 1, m]));

function typeDeRegle(q) {
  // "proche_de" utilise aussi la clé "jour" : il doit être testé avant.
  return ["proche_de", "chaque_annee", "paques", "date", "jour"].find(t => t in q) || "jour";
}

function champsRegle(type, q) {
  const [mm, jj] = (q.chaque_annee || q.proche_de || "01-01").split("-").map(Number);
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

function dateIso(d) {
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}

// Un nouvel événement a lieu une fois, à la date cliquée dans le calendrier (ou à choisir) ;
// le type « Quand » permet ensuite d'en faire un événement qui revient chaque année.
function ouvrirFormulaire(index, date = null) {
  const existant = index === null ? null : etat.donnees.evenements[index];
  const evt = existant || { categorie: Object.keys(etat.donnees.categories)[0], quand: { date: date ? dateIso(date) : "" } };
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
    el("div", { class: "rangee" },
      champ("Responsable", entree("text", evt.responsable, { name: "responsable", placeholder: "personne ou groupe" })),
      champ("Catégorie", select(categories, evt.categorie, { name: "categorie" }))),
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
      for (const cle of ["responsable", "heure", "lieu", "description"]) {
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

  const dialogue = ouvrirDialogue(formulaire);
}

// ---------- Initialisation ----------

function initEditeur(ouvrirEdition) {
  document.getElementById("modifier").addEventListener("click", entrerEdition);
  window.addEventListener("beforeunload", e => {
    if (edition.modifie) e.preventDefault();
  });
  suivreSession(() => { if (edition.actif) entrerEdition(); });
  if (ouvrirEdition) entrerEdition();
}
