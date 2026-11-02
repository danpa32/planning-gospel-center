// Tableau des idées : avant de construire le planning, on rassemble les événements et programmes
// proposés pour l'année qui vient, chacun porté par une personne ou un groupe, avec les secteurs à impliquer.
// Les idées sont dans idees.json ; les couleurs (niveau d'implication) et les événements déjà
// planifiés viennent d'evenements.json.

const FICHIER_IDEES = "idees.json";
const COULEUR_A_DEFINIR = "#a8a29e";

const STATUTS = {
  idee: { nom: "Idées", aide: "Proposées, à présenter et discuter ensemble." },
  retenue: { nom: "Retenues", aide: "Validées en rencontre, à placer dans l'année." },
  planifiee: { nom: "Au planning", aide: "Datées dans le planning annuel, à élaborer." },
  ecartee: { nom: "Mises de côté", aide: "Pas cette année : gardées en mémoire." },
};

const FREQUENCES = {
  "": "—",
  ponctuel: "Une fois",
  annuel: "Chaque année",
  plusieurs: "Plusieurs fois par an",
  regulier: "Régulier (série, parcours)",
};

const ETAPES = [
  ["Récolter", "Chaque porteur de vision dépose ses idées : l'événement, pourquoi, quand, avec quels secteurs. " +
    "On repart des idées de l'année précédente."],
  ["Se rencontrer", "On s'assoit ensemble, on échange sur chaque idée, on retient ou on met de côté."],
  ["Placer", "Les idées retenues reçoivent une date dans le planning annuel ; on vérifie la charge des secteurs."],
  ["Élaborer", "Chaque événement daté est préparé avec son porteur et les secteurs impliqués."],
];

const tableau = {
  donnees: null,
  planning: { categories: {}, evenements: [] },
  annee: null,
  cycle: lireCyclePrefere(),
  secteur: null,
};
const editionIdees = { actif: false, sha: null, modifie: false, message: "", erreur: false };
const autoIdees = enregistrementAuto(FICHIER_IDEES, editionIdees, () => tableau.donnees,
  "Mise à jour du tableau des idées depuis l'interface web", () => rendreEditeurIdees());

// ---------- Données ----------

// Une idée est rattachée à un mois ("annee" + "mois" de 1 à 12), ce qui la place aussi bien
// dans l'année civile que dans l'année scolaire.
function rangIdee(idee, debutCycle = tableau.annee) {
  return rangDansCycle(Number(idee.annee), (Number(idee.mois) || 1) - 1, debutCycle, tableau.cycle);
}

function ideesDuCycle(debutCycle = tableau.annee) {
  return tableau.donnees.idees
    .map((idee, index) => ({ idee, index }))
    .filter(({ idee }) => rangIdee(idee, debutCycle) >= 0)
    .sort((a, b) => rangIdee(a.idee) - rangIdee(b.idee) || a.idee.titre.localeCompare(b.idee.titre));
}

function couleurIdee(idee) {
  return tableau.planning.categories[idee.categorie]?.couleur || COULEUR_A_DEFINIR;
}

function nomMois(idee) {
  return idee.mois ? `${NOMS_MOIS[idee.mois - 1]} ${idee.annee}` : String(idee.annee);
}

function decrireQuand(idee) {
  return [nomMois(idee), idee.periode, idee.frequence && FREQUENCES[idee.frequence]].filter(Boolean).join(" · ");
}

function memeTitre(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function frequenceDe(evt) {
  const q = evt.quand || {};
  if ("date" in q) return "ponctuel";
  if (q.repeter > 1) return "regulier";
  if (Array.isArray(q.mois) && q.mois.length > 1) return "plusieurs";
  return "annuel";
}

// Ajoute au cycle affiché les événements du planning qui n'y sont pas encore (statut « Au planning »).
function importerPlanning() {
  const deja = ideesDuCycle().map(({ idee }) => idee.titre);
  const { liste } = occurrencesCycle(tableau.planning.evenements, tableau.annee, tableau.cycle);
  const ajoutees = liste
    .filter(o => !o.suiteDeSerie && !deja.some(t => memeTitre(t, o.evt.titre)))
    .map(({ evt, debut }) => {
      const idee = {
        titre: evt.titre,
        annee: debut.getFullYear(),
        mois: debut.getMonth() + 1,
        statut: "planifiee",
        periode: decrireRegle(evt),
        frequence: frequenceDe(evt),
      };
      if (evt.categorie) idee.categorie = evt.categorie;
      if (evt.description) idee.notes = evt.description;
      return idee;
    });
  tableau.donnees.idees.push(...ajoutees);
  editionIdees.message = ajoutees.length
    ? `${pluriel(ajoutees.length, "événement")} du planning ajouté${ajoutees.length > 1 ? "s" : ""}.`
    : "Tous les événements du planning sont déjà sur le tableau.";
  if (ajoutees.length) marquerIdeesModifiees(editionIdees.message);
  else rendreEditeurIdees();
}

// Mois d'un événement du planning dans le cycle affiché (Pâques ne tombe pas chaque année le même mois).
function moisAuPlanning(titre) {
  const evt = tableau.planning.evenements.find(e => e.titre && memeTitre(e.titre, titre));
  if (!evt) return null;
  const occ = occurrencesCycle([evt], tableau.annee, tableau.cycle).liste[0];
  return occ && { annee: occ.debut.getFullYear(), mois: occ.debut.getMonth() + 1 };
}

// Recopie les idées de l'année précédente dans l'année affichée, en « Idées » à rediscuter.
// Les événements uniques déjà réalisés ne sont pas repris.
function reprendreAnneePrecedente() {
  const deja = ideesDuCycle().map(({ idee }) => idee.titre);
  const reprises = ideesDuCycle(tableau.annee - 1)
    .map(({ idee }) => idee)
    .filter(idee => !(idee.frequence === "ponctuel" && idee.statut === "planifiee"))
    .filter(idee => !deja.some(t => memeTitre(t, idee.titre)))
    .map(({ notes, statut, ...idee }) => ({
      ...idee,
      annee: Number(idee.annee) + 1,
      ...moisAuPlanning(idee.titre),
      statut: "idee",
    }));
  tableau.donnees.idees.push(...reprises);
  const source = libelleCycle(tableau.annee - 1, tableau.cycle);
  editionIdees.message = reprises.length
    ? `${pluriel(reprises.length, "idée")} reprise${reprises.length > 1 ? "s" : ""} de ${source}.`
    : `Rien à reprendre de ${source}.`;
  if (reprises.length) marquerIdeesModifiees(editionIdees.message);
  else rendreEditeurIdees();
}

// ---------- Rendu ----------

function rendreDemarche() {
  // Une carte par étape ; les flèches entre les cartes viennent du CSS.
  const etapes = ETAPES.map(([nom, texte], i) =>
    el("li", { class: "etape" },
      el("p", { class: "etape-titre" }, el("span", { class: "numero" }, String(i + 1)), nom),
      el("p", {}, texte)));
  document.getElementById("demarche").replaceChildren(
    el("h2", {}, "La démarche"),
    el("ol", { class: "etapes" }, etapes));

  const couleurs = Object.values(tableau.planning.categories).filter(c => c.legende);
  const zone = document.getElementById("couleurs-cartes");
  zone.hidden = !couleurs.length;
  zone.replaceChildren(legendeRepliable("Couleur des cartes : niveau d'implication des équipes",
    el("ul", {}, couleurs.map(c => el("li", {},
      pastille(c.couleur), el("span", {}, el("strong", {}, c.nom), el("br"), c.legende))))));
}

// Pour chaque secteur, le nombre d'idées (hors « mises de côté ») qui l'impliquent ; un clic filtre le tableau.
function rendreSecteurs(idees) {
  const actives = idees.filter(({ idee }) => idee.statut !== "ecartee");
  const zone = document.getElementById("secteurs");
  zone.replaceChildren(
    el("span", { class: "libelle" }, "Secteurs impliqués"),
    ...tableau.donnees.secteurs.map(nom => {
      const n = actives.filter(({ idee }) => idee.secteurs?.includes(nom)).length;
      return el("button", {
        type: "button",
        class: "filtre",
        "aria-pressed": String(tableau.secteur === nom),
        onclick: () => { tableau.secteur = tableau.secteur === nom ? null : nom; rendreTableau(); },
      }, nom, el("span", { class: "compte" }, String(n)));
    }));
}

function carte({ idee, index }) {
  const secteurs = idee.secteurs || [];
  const attrs = { class: "carte", style: `--c:${couleurIdee(idee)}` };
  if (editionIdees.actif) {
    attrs.draggable = "true";
    attrs.ondragstart = e => {
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.effectAllowed = "move";
    };
  }
  return el("article", attrs,
    el("h3", {}, idee.titre || "(sans titre)"),
    idee.porteur ? el("p", { class: "porteur" }, "Porté par ", el("strong", {}, idee.porteur)) : null,
    el("p", { class: "quand" }, decrireQuand(idee)),
    idee.vision ? el("p", { class: "vision" }, idee.vision) : null,
    secteurs.length
      ? el("ul", { class: "etiquettes" }, secteurs.map(s => el("li", {}, s)))
      : el("p", { class: "a-completer" }, "Secteurs à préciser"),
    idee.notes ? el("p", { class: "notes" }, el("strong", {}, "Notes : "), idee.notes) : null,
    editionIdees.actif
      ? el("button", { type: "button", class: "lien", onclick: () => ouvrirIdee(index) }, "Modifier")
      : null);
}

function colonne(cle, statut, idees) {
  const attrs = { class: "colonne", "data-statut": cle };
  if (editionIdees.actif) {
    attrs.ondragover = e => { e.preventDefault(); e.currentTarget.classList.add("survol"); };
    attrs.ondragleave = e => e.currentTarget.classList.remove("survol");
    attrs.ondrop = e => {
      e.preventDefault();
      const idee = tableau.donnees.idees[Number(e.dataTransfer.getData("text/plain"))];
      if (idee && idee.statut !== cle) {
        idee.statut = cle;
        marquerIdeesModifiees();
      } else {
        rendreTableau();
      }
    };
  }
  return el("section", attrs,
    el("header", {},
      el("h2", {}, statut.nom, el("span", { class: "compte" }, String(idees.length))),
      el("p", {}, statut.aide)),
    idees.length ? idees.map(carte) : el("p", { class: "vide" }, "—"));
}

function rendreTableau() {
  const libelle = libelleCycle(tableau.annee, tableau.cycle);
  document.getElementById("annee").textContent = libelle;
  document.title = `${tableau.planning.eglise ? tableau.planning.eglise + " – " : ""}Idées ${libelle}`;
  document.getElementById("lien-planning").href = `index.html#annee=${tableau.annee}&cycle=${tableau.cycle}`;
  document.querySelectorAll("[data-cycle]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.cycle === tableau.cycle)));

  const idees = ideesDuCycle();
  const parStatut = cle => idees.filter(({ idee }) => (STATUTS[idee.statut] ? idee.statut : "idee") === cle);
  document.getElementById("resume").textContent = [
    pluriel(parStatut("idee").length, "idée"),
    pluriel(parStatut("retenue").length, "retenue"),
    `${parStatut("planifiee").length} au planning`,
  ].join(" · ");

  rendreSecteurs(idees);
  const visibles = cle => parStatut(cle)
    .filter(({ idee }) => !tableau.secteur || idee.secteurs?.includes(tableau.secteur));
  document.getElementById("tableau").replaceChildren(
    ...Object.entries(STATUTS).map(([cle, s]) => colonne(cle, s, visibles(cle))));

  const params = new URLSearchParams({ annee: tableau.annee, cycle: tableau.cycle });
  if (editionIdees.actif) params.set("edition", "");
  history.replaceState(null, "", `#${params}`);
  if (editionIdees.actif) rendreEditeurIdees();
}

// ---------- Mode édition ----------

function marquerIdeesModifiees(message = "") {
  editionIdees.modifie = true;
  editionIdees.message = message;
  rendreTableau();
  rendreEditeurIdees();
  autoIdees.planifier();
}

function rendreEditeurIdees() {
  const zone = document.getElementById("editeur");
  zone.hidden = !editionIdees.actif;
  document.body.classList.toggle("en-edition", editionIdees.actif);
  if (!editionIdees.actif) return zone.replaceChildren();

  const precedente = libelleCycle(tableau.annee - 1, tableau.cycle);
  zone.replaceChildren(
    el("div", { class: "editeur-entete" },
      el("div", {},
        el("h2", {}, "Mode édition"),
        el("p", { class: "source" }, decrireStockage()),
        statutEdition(editionIdees, autoIdees),
        el("p", { class: "source" }, "Glissez une carte d'une colonne à l'autre pour changer son statut.")),
      el("div", { class: "boutons" },
        el("button", { type: "button", class: "principal", onclick: () => ouvrirIdee(null) }, "+ Nouvelle idée"),
        el("button", { type: "button", class: "secondaire", onclick: () => telechargerJson(FICHIER_IDEES, tableau.donnees) },
          "Télécharger le fichier"),
        EN_LOCAL ? null : el("button", { type: "button", class: "secondaire", onclick: () => ouvrirReglages(entrerEditionIdees) },
          "Réglages GitHub"),
        el("button", { type: "button", class: "secondaire", onclick: quitterEditionIdees }, "Quitter"))),
    el("div", { class: "boutons recolte" },
      el("span", {}, `Préparer ${libelleCycle(tableau.annee, tableau.cycle)} :`),
      el("button", { type: "button", class: "secondaire", onclick: reprendreAnneePrecedente },
        `Reprendre les idées de ${precedente}`),
      el("button", { type: "button", class: "secondaire", onclick: importerPlanning },
        "Ajouter les événements du planning")));
}

async function entrerEditionIdees() {
  editionIdees.actif = true;
  if (enregistrementPossible() && !editionIdees.modifie) {
    try {
      const { donnees, sha } = await chargerJsonEdition(FICHIER_IDEES);
      tableau.donnees = normaliser(donnees);
      editionIdees.sha = sha;
      editionIdees.message = "";
    } catch (e) {
      editionIdees.message = `Impossible de lire le fichier ${EN_LOCAL ? "local" : "sur GitHub"} : ${e.message}.`;
    }
  }
  rendreTableau();
  rendreEditeurIdees();
}

function quitterEditionIdees() {
  editionIdees.actif = false;
  rendreTableau();
  rendreEditeurIdees();
}

// ---------- Formulaire d'une idée ----------

function ouvrirIdee(index) {
  const existante = index === null ? null : tableau.donnees.idees[index];
  const mois = moisDuCycle(tableau.annee, tableau.cycle);
  const idee = existante || { statut: "idee", secteurs: [] };
  const choisis = new Set(idee.secteurs || []);

  // Le mois envisagé, parmi les 12 mois de l'année affichée.
  const optionsMois = { "": "Choisir…", ...Object.fromEntries(mois.map(({ annee, mois: m }) =>
    [`${annee}-${m + 1}`, `${NOMS_MOIS[m]} ${annee}`])) };
  const moisActuel = existante && rangIdee(existante) >= 0 ? `${existante.annee}-${existante.mois || 1}` : "";

  const categories = { "": "À définir", ...Object.fromEntries(
    Object.entries(tableau.planning.categories).map(([k, c]) => [k, c.nom])) };
  const choixCategorie = select(categories, idee.categorie || "", { name: "categorie" });
  const aideCategorie = el("small", {});
  const majAide = () => (aideCategorie.textContent = tableau.planning.categories[choixCategorie.value]?.legende || "");
  choixCategorie.addEventListener("change", majAide);
  majAide();

  const formulaire = el("form", { method: "dialog" },
    el("h2", {}, existante ? "Modifier l'idée" : "Nouvelle idée"),
    champ("Événement ou programme", entree("text", idee.titre, { name: "titre", required: "" })),
    champ("Porté par", entree("text", idee.porteur, { name: "porteur", placeholder: "Une personne ou un groupe" })),
    champ("Vision", el("textarea", { name: "vision", rows: 3 }, idee.vision || ""),
      "Pourquoi cet événement ? Que veut-on vivre ou transmettre ?"),
    el("fieldset", { class: "mois-choix secteurs-choix" }, el("legend", {}, "Secteurs à impliquer"),
      tableau.donnees.secteurs.map(nom => el("label", {},
        el("input", { type: "checkbox", name: "secteurs", value: nom, ...(choisis.has(nom) ? { checked: "" } : {}) }),
        nom))),
    el("label", { class: "champ" }, el("span", {}, "Niveau d'implication (couleur)"), choixCategorie, aideCategorie),
    el("div", { class: "rangee" },
      champ("Mois envisagé", select(optionsMois, moisActuel, { name: "mois", required: "" })),
      champ("Précision", entree("text", idee.periode, { name: "periode", placeholder: "début du mois, autour de Pâques…" }))),
    el("div", { class: "rangee" },
      champ("Fréquence", select(FREQUENCES, idee.frequence || "", { name: "frequence" })),
      champ("Statut", select(Object.fromEntries(Object.entries(STATUTS).map(([k, s]) => [k, s.nom])),
        idee.statut || "idee", { name: "statut" }))),
    champ("Notes", el("textarea", { name: "notes", rows: 2 }, idee.notes || ""),
      "Échanges de la rencontre, décisions, questions ouvertes."),
    el("div", { class: "boutons" },
      existante ? boutonConfirmer("Supprimer", () => {
        tableau.donnees.idees.splice(index, 1);
        dialogue.close();
        marquerIdeesModifiees();
      }) : null,
      el("span", { class: "espace" }),
      el("button", { type: "button", class: "secondaire", onclick: () => dialogue.close() }, "Annuler"),
      el("button", { type: "submit", class: "principal" }, existante ? "Appliquer" : "Ajouter")));

  formulaire.addEventListener("submit", e => {
    e.preventDefault();
    const d = new FormData(formulaire);
    const [annee, m] = d.get("mois").split("-").map(Number);
    const nouvelle = { titre: d.get("titre").trim(), annee, mois: m, statut: d.get("statut") };
    for (const cle of ["porteur", "vision", "categorie", "periode", "frequence", "notes"]) {
      const v = d.get(cle).trim();
      if (v) nouvelle[cle] = v;
    }
    const secteurs = d.getAll("secteurs");
    if (secteurs.length) nouvelle.secteurs = secteurs;

    if (existante) tableau.donnees.idees[index] = nouvelle;
    else tableau.donnees.idees.push(nouvelle);
    dialogue.close();
    marquerIdeesModifiees();
  });

  const dialogue = ouvrirDialogue(formulaire);
}

// ---------- Démarrage ----------

function normaliser(donnees) {
  donnees.secteurs ||= [];
  donnees.idees ||= [];
  return donnees;
}

// Par défaut, on prépare l'année qui vient.
function lireUrlIdees() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (CYCLES[params.get("cycle")]) tableau.cycle = params.get("cycle");
  const annee = parseInt(params.get("annee"), 10);
  tableau.annee = annee > 1900 && annee < 3000 ? annee : cycleEnCours(tableau.cycle) + 1;
  return params.has("edition");
}

async function demarrerIdees() {
  try {
    tableau.donnees = normaliser(await lireJson(FICHIER_IDEES));
  } catch (e) {
    const zone = document.getElementById("erreurs");
    zone.hidden = false;
    zone.textContent = `Impossible de lire ${FICHIER_IDEES} : ${e.message}. ` +
      "Vérifiez la syntaxe (virgules, guillemets) par exemple sur jsonlint.com.";
    return;
  }
  // Couleurs et événements du planning ; sans eux, les cartes restent grises et l'import est vide.
  try {
    const planning = await lireJson("evenements.json");
    tableau.planning = { ...planning, categories: planning.categories || {}, evenements: planning.evenements || [] };
    if (planning.eglise) document.getElementById("nom-eglise").textContent = `${planning.eglise} – Tableau des idées`;
  } catch { /* planning illisible */ }

  const edition = lireUrlIdees();
  document.getElementById("annee-prec").onclick = () => { tableau.annee--; rendreTableau(); };
  document.getElementById("annee-suiv").onclick = () => { tableau.annee++; rendreTableau(); };
  document.querySelectorAll("[data-cycle]").forEach(b => (b.onclick = () => {
    tableau.cycle = b.dataset.cycle;
    ecrireCyclePrefere(tableau.cycle);
    rendreTableau();
  }));
  document.getElementById("imprimer").onclick = () => window.print();
  document.getElementById("modifier").addEventListener("click", entrerEditionIdees);
  window.addEventListener("beforeunload", e => {
    if (editionIdees.modifie) e.preventDefault();
  });
  rendreDemarche();
  rendreTableau();
  if (edition) entrerEditionIdees();
}

document.addEventListener("DOMContentLoaded", demarrerIdees);
