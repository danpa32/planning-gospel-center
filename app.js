// Planning annuel de l'église.
// Les événements sont décrits dans evenements.json avec une règle de récurrence ;
// ce script calcule leurs dates pour l'année affichée (civile ou scolaire, voir dates.js).

const ENTETES_JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const COULEUR_DEFAUT = "#78716c";
const COULEUR_VACANCES = "#94a3b8";

const etat = {
  donnees: null,
  annee: null,
  cycle: lireCyclePrefere(),
  vue: "calendrier",
  periode: "trimestre",
  masquees: new Set(),
  griserPasse: false, // mois et événements passés en gris, à activer dans les filtres
  vacances: [],
  erreurVacances: null,
};

function occurrences() {
  return occurrencesCycle(etat.donnees.evenements, etat.annee, etat.cycle);
}

// ---------- Utilitaires d'affichage ----------

function categorie(evt) {
  return etat.donnees.categories[evt.categorie] || { nom: evt.categorie || "Autre", couleur: COULEUR_DEFAUT };
}

// Les dimanches ordinaires (cultes) sont colorés dans le calendrier sans être listés un par un.
const CLE_DIMANCHES = "_dimanches";

function dimanchesVisibles() {
  return Boolean(etat.donnees.dimanches) && !etat.masquees.has(CLE_DIMANCHES);
}

// Dimanches sans culte du cycle affiché (règles "sauf" de "dimanches", ex. le dernier dimanche de décembre).
function dimanchesSansCulte() {
  const { debut, fin } = bornesCycle(etat.annee, etat.cycle);
  const annees = [];
  for (let a = debut.getFullYear(); a <= fin.getFullYear(); a++) annees.push(a);
  return new Set((etat.donnees.dimanches?.sauf || [])
    .flatMap(q => annees.flatMap(a => datesDeBase(q, a)))
    .map(d => d.getTime()));
}

// Les vacances scolaires sont hachurées dans le calendrier (liste "vacances" d'evenements.json).
const CLE_VACANCES = "_vacances";

function vacancesVisibles() {
  return etat.vacances.length > 0 && !etat.masquees.has(CLE_VACANCES);
}

function vacancesDuCycle() {
  const { debut, fin } = bornesCycle(etat.annee, etat.cycle);
  return etat.vacances.filter(v => v.fin >= debut && v.debut <= fin);
}

// Heure et lieu : ceux de l'événement, sinon les valeurs "par_defaut" du fichier.
function heureDe(evt) {
  return evt.heure || etat.donnees.par_defaut?.heure || "";
}

function lieuDe(evt) {
  return evt.lieu || etat.donnees.par_defaut?.lieu || "";
}

function enEdition() {
  return typeof edition !== "undefined" && edition.actif;
}

// En mode édition, cliquer sur un événement l'ouvre ; cliquer sur un jour libre en ajoute un à cette date.
function rendreModifiable(noeud, ouvrir, titre) {
  if (!enEdition()) return noeud;
  noeud.classList.add("modifiable");
  noeud.setAttribute("role", "button");
  noeud.setAttribute("tabindex", "0");
  if (titre) noeud.title = titre;
  noeud.addEventListener("click", ouvrir);
  noeud.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); }
  });
  return noeud;
}

function modifierOccurrence(o) {
  ouvrirFormulaire(etat.donnees.evenements.indexOf(o.evt), null, o.annee);
}

function plageDates(occ, fmt) {
  if (memeJour(occ.debut, occ.fin)) return fmt.format(occ.debut);
  return `${fmt.format(occ.debut)} – ${fmt.format(occ.fin)}`;
}

// ---------- Vues ----------

function vueCalendrier(occs) {
  const aujourdhui = new Date();
  const grille = el("div", { class: "grille-annee" });

  const vacances = vacancesVisibles() ? vacancesDuCycle() : [];
  const bornes = bornesCycle(etat.annee, etat.cycle);
  const sansCulte = dimanchesSansCulte();

  for (const { annee: a, mois: m } of moisDuCycle(etat.annee, etat.cycle)) {
    const jours = el("div", { class: "jours" }, ENTETES_JOURS.map(j => el("span", { class: "entete-jour" }, j)));
    const premier = new Date(a, m, 1);
    const decalage = (premier.getDay() + 6) % 7; // semaine commençant le lundi
    for (let i = 0; i < decalage; i++) jours.append(el("span"));

    const nbJours = new Date(a, m + 1, 0).getDate();
    for (let d = 1; d <= nbJours; d++) {
      const date = new Date(a, m, d);
      const duJour = occs.filter(o => date >= o.debut && date <= o.fin);
      const classes = ["jour"];
      const dimancheOrdinaire = date.getDay() === 0 && !duJour.length && dimanchesVisibles()
        && !sansCulte.has(date.getTime());
      if (date.getDay() === 0) classes.push("dimanche");
      if (duJour.length) classes.push("occupe");
      if (dimancheOrdinaire) classes.push("culte");
      if (memeJour(date, aujourdhui)) classes.push("aujourdhui");
      const enVacances = vacancesVisibles() && vacancesDuJour(etat.vacances, date);
      if (enVacances) classes.push("vacances");
      const attrs = { class: classes.join(" ") };
      if (duJour.length) {
        attrs.style = `--c:${categorie(duJour[0].evt).couleur}`;
        attrs.title = duJour.map(o => o.evt.responsable ? `${o.titre} (${o.evt.responsable})` : o.titre).join("\n");
      } else if (dimancheOrdinaire) {
        attrs.style = `--c:${etat.donnees.dimanches.couleur}`;
        attrs.title = etat.donnees.dimanches.nom;
      }
      if (enVacances) attrs.title = [attrs.title, enVacances.nom].filter(Boolean).join("\n");
      const jour = el("span", attrs, String(d));
      jours.append(duJour.length
        ? rendreModifiable(jour, () => modifierOccurrence(duJour[0]))
        : rendreModifiable(jour, () => ouvrirFormulaire(null, date), `${attrs.title ? attrs.title + "\n" : ""}Ajouter un événement ce jour`));
    }

    const duMois = occs.filter(o => o.debut.getFullYear() === a && o.debut.getMonth() === m);
    // Des vacances commencées avant le début de l'année affichée sont listées sous son premier mois.
    const vacancesDuMois = vacances.filter(v => {
      const debut = v.debut < bornes.debut ? bornes.debut : v.debut;
      return debut.getFullYear() === a && debut.getMonth() === m;
    });
    const liste = el("ul", { class: "evts-mois" },
      duMois.map(o => rendreModifiable(el("li", {},
        pastille(categorie(o.evt).couleur),
        el("span", { class: "date" }, plageDates(o, fmtCourt)),
        el("span", {}, o.titre,
          o.evt.responsable ? el("span", { class: "responsable" }, ` · ${o.evt.responsable}`) : null)),
        () => modifierOccurrence(o))),
      vacancesDuMois.map(v => el("li", { class: "vacances-ligne" },
        el("span", { class: "pastille hachuree", style: `--c:${COULEUR_VACANCES}` }),
        el("span", { class: "date" }, plageDates(v, fmtCourt)),
        el("span", {}, v.nom))),
      duMois.length || vacancesDuMois.length ? null : el("li", { class: "vide" }, "—"));

    const passe = etat.griserPasse && new Date(a, m + 1, 1) <= new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
    grille.append(el("section", { class: passe ? "mois passe" : "mois" },
      el("h2", {}, NOMS_MOIS[m],
        etat.cycle === "scolaire" ? el("span", { class: "an" }, String(a)) : null,
        duMois.length ? el("span", { class: "compte" }, String(duMois.length)) : null,
        passe ? el("span", { class: "etiquette-passe" }, "passé") : null),
      jours, liste));
  }
  return grille;
}

function periodes() {
  if (etat.periode === "semestre") {
    return [
      { nom: "1er semestre", debut: 0, fin: 5 },
      { nom: "2e semestre", debut: 6, fin: 11 },
    ];
  }
  return [
    { nom: "1er trimestre", debut: 0, fin: 2 },
    { nom: "2e trimestre", debut: 3, fin: 5 },
    { nom: "3e trimestre", debut: 6, fin: 8 },
    { nom: "4e trimestre", debut: 9, fin: 11 },
  ];
}

function texteRecap(p, occs) {
  const lignes = [`${etat.donnees.eglise} – ${p.nom} ${libelleCycle(etat.annee, etat.cycle)}`, ""];
  for (const o of occs) {
    let ligne = `• ${plageDates(o, fmtLong)} : ${o.titre}`;
    const details = [heureDe(o.evt), lieuDe(o.evt), o.evt.responsable && `resp. ${o.evt.responsable}`]
      .filter(Boolean).join(", ");
    if (details) ligne += ` (${details})`;
    lignes.push(ligne);
  }
  if (!occs.length) lignes.push("Aucun événement.");
  return lignes.join("\n");
}

function vueListe(occs) {
  const conteneur = el("div");
  const maintenant = new Date();
  const debutDuJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const mois = moisDuCycle(etat.annee, etat.cycle);
  for (const p of periodes()) {
    const duPeriode = occs.filter(o => {
      const rang = rangDansCycle(o.debut.getFullYear(), o.debut.getMonth(), etat.annee, etat.cycle);
      return rang >= p.debut && rang <= p.fin;
    });
    const bouton = el("button", { type: "button", class: "copier" }, "Copier le récap");
    bouton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(texteRecap(p, duPeriode));
        bouton.textContent = "Copié ✓";
      } catch {
        bouton.textContent = "Copie impossible";
      }
      setTimeout(() => (bouton.textContent = "Copier le récap"), 2000);
    });

    const liste = el("ul", { class: "liste" },
      duPeriode.length
        ? duPeriode.map(o => {
            const vacances = vacancesDuJour(etat.vacances, o.debut);
            const meta = [heureDe(o.evt), lieuDe(o.evt), categorie(o.evt).nom,
              o.evt.responsable && `Responsable : ${o.evt.responsable}`].filter(Boolean).join(" · ");
            const passe = etat.griserPasse && o.fin < debutDuJour;
            return rendreModifiable(el("li", { class: passe ? "ligne passe" : "ligne" },
              el("span", { class: "quand" }, plageDates(o, fmtLong)),
              el("span", { class: "titre" }, pastille(categorie(o.evt).couleur), o.titre),
              el("p", { class: "meta" }, meta,
                vacances ? el("span", { class: "alerte" }, ` · ${vacances.nom}`) : null),
              o.evt.description ? el("p", { class: "desc" }, o.evt.description) : null),
              () => modifierOccurrence(o));
          })
        : el("li", { class: "vide" }, "Aucun événement."));

    conteneur.append(el("section", { class: "periode" },
      el("div", { class: "periode-entete" },
        el("h2", {}, p.nom,
          el("span", { class: "plage" }, `${NOMS_MOIS[mois[p.debut].mois]} – ${NOMS_MOIS[mois[p.fin].mois]}`),
          el("span", { class: "compte" }, pluriel(duPeriode.length, "événement"))),
        bouton),
      liste));
  }
  return conteneur;
}

// ---------- Export iCalendar ----------

function icsDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function icsTexte(t) {
  return String(t).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

function exporterIcs() {
  const { liste } = occurrences();
  const horodatage = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Planning eglise//FR", "CALSCALE:GREGORIAN"];
  for (const o of liste.filter(o => !etat.masquees.has(o.evt.categorie))) {
    const desc = [heureDe(o.evt), o.evt.responsable && `Responsable : ${o.evt.responsable}`, o.evt.description]
      .filter(Boolean).join(" – ");
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${icsDate(o.debut)}-${o.titre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@planning-eglise`,
      `DTSTAMP:${horodatage}`,
      `DTSTART;VALUE=DATE:${icsDate(o.debut)}`,
      `DTEND;VALUE=DATE:${icsDate(ajouterJours(o.fin, 1))}`,
      `SUMMARY:${icsTexte(o.titre)}`,
      `CATEGORIES:${icsTexte(categorie(o.evt).nom)}`);
    if (desc) lignes.push(`DESCRIPTION:${icsTexte(desc)}`);
    if (lieuDe(o.evt)) lignes.push(`LOCATION:${icsTexte(lieuDe(o.evt))}`);
    lignes.push("END:VEVENT");
  }
  lignes.push("END:VCALENDAR");

  const blob = new Blob([lignes.join("\r\n")], { type: "text/calendar" });
  const lien = el("a", { href: URL.createObjectURL(blob), download: `planning-${libelleCycle(etat.annee, etat.cycle)}.ics` });
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// ---------- Rendu & navigation ----------

function afficherErreurs(erreurs) {
  const zone = document.getElementById("erreurs");
  zone.hidden = !erreurs.length;
  zone.replaceChildren();
  if (erreurs.length) {
    zone.append(el("strong", {}, "Certains événements n'ont pas pu être placés :"),
      el("ul", {}, erreurs.map(e => el("li", {}, e))));
  }
}

function nombreDimanches() {
  const { debut, fin } = bornesCycle(etat.annee, etat.cycle);
  const sansCulte = dimanchesSansCulte();
  let n = 0;
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) {
    if (d.getDay() === 0 && !sansCulte.has(d.getTime())) n++;
  }
  return n;
}

// Nombre d'événements de l'année par catégorie, affiché sur chaque filtre.
function rendreFiltres(liste) {
  const comptes = { [CLE_DIMANCHES]: nombreDimanches(), [CLE_VACANCES]: vacancesDuCycle().length };
  for (const o of liste) comptes[o.evt.categorie] = (comptes[o.evt.categorie] || 0) + 1;
  const zone = document.getElementById("filtres");
  const entrees = Object.entries(etat.donnees.categories);
  if (etat.donnees.dimanches) entrees.unshift([CLE_DIMANCHES, etat.donnees.dimanches]);
  if (etat.vacances.length) entrees.push([CLE_VACANCES, { nom: "Vacances scolaires", couleur: COULEUR_VACANCES }]);
  const griser = el("button", {
    type: "button",
    class: "filtre griser",
    "aria-pressed": String(etat.griserPasse),
    onclick: () => { etat.griserPasse = !etat.griserPasse; rendre(); },
  }, el("span", { class: "pastille", style: "--c:var(--texte-doux)" }), "Griser le passé");
  zone.replaceChildren(...entrees.map(([cle, cat]) =>
    el("button", {
      type: "button",
      class: "filtre",
      "aria-pressed": String(!etat.masquees.has(cle)),
      onclick: () => {
        etat.masquees.has(cle) ? etat.masquees.delete(cle) : etat.masquees.add(cle);
        rendre();
      },
    }, cle === CLE_VACANCES ? el("span", { class: "pastille hachuree", style: `--c:${cat.couleur}` }) : pastille(cat.couleur),
    cat.nom, el("span", { class: "compte" }, String(comptes[cle] || 0)))), griser);
}

// Signification des couleurs : une ligne par catégorie qui a une "legende".
function rendreLegende() {
  const zone = document.getElementById("legende");
  const entrees = [etat.donnees.dimanches, ...Object.values(etat.donnees.categories)]
    .filter(cat => cat?.legende);
  const vacances = etat.vacances.length && etat.donnees.vacances.legende
    ? el("li", {}, el("span", { class: "pastille hachuree", style: `--c:${COULEUR_VACANCES}` }),
        el("span", {}, el("strong", {}, "Vacances scolaires"), el("br"), etat.donnees.vacances.legende))
    : null;
  zone.hidden = !entrees.length && !vacances;
  zone.replaceChildren(legendeRepliable(etat.donnees.legende || "Légende",
    el("ul", {}, entrees.map(cat => el("li", {},
      pastille(cat.couleur),
      el("span", {}, el("strong", {}, cat.nom), el("br"), cat.legende))), vacances)));
}

function rendre() {
  const libelle = libelleCycle(etat.annee, etat.cycle);
  document.getElementById("annee").textContent = libelle;
  document.title = `${etat.donnees.eglise} – Planning ${libelle}`;
  document.querySelectorAll("[data-cycle]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.cycle === etat.cycle)));
  document.querySelectorAll("[data-vue]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.vue === etat.vue)));
  document.querySelectorAll("[data-periode]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.periode === etat.periode)));
  document.getElementById("choix-periode").hidden = etat.vue !== "liste";

  const { liste, erreurs } = occurrences();
  try {
    dimanchesSansCulte();
  } catch (e) {
    etat.donnees.dimanches.sauf = [];
    erreurs.push(`Dimanches sans culte ("sauf") : ${e.message}`);
  }
  afficherErreurs(etat.erreurVacances ? [...erreurs, etat.erreurVacances] : erreurs);
  rendreFiltres(liste);
  rendreLegende();
  const visibles = liste.filter(o => !etat.masquees.has(o.evt.categorie));
  document.getElementById("resume").textContent =
    `${pluriel(visibles.length, "événement")} · ${pluriel(nombreDimanches(), "dimanche")}`;
  document.getElementById("contenu").replaceChildren(
    etat.vue === "liste" ? vueListe(visibles) : vueCalendrier(visibles));

  const params = new URLSearchParams({ annee: etat.annee, cycle: etat.cycle, vue: etat.vue });
  if (etat.vue === "liste") params.set("par", etat.periode);
  if (enEdition()) params.set("edition", "");
  history.replaceState(null, "", `#${params}`);
}

function lireUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (CYCLES[params.get("cycle")]) etat.cycle = params.get("cycle");
  const annee = parseInt(params.get("annee"), 10);
  etat.annee = annee > 1900 && annee < 3000 ? annee : cycleEnCours(etat.cycle);
  if (["calendrier", "liste"].includes(params.get("vue"))) etat.vue = params.get("vue");
  if (["trimestre", "semestre"].includes(params.get("par"))) etat.periode = params.get("par");
}

async function demarrer() {
  try {
    // La version du dépôt est la plus récente ; le fichier publié peut être en cache quelques minutes.
    etat.donnees = await lireJson("evenements.json");
  } catch (e) {
    document.getElementById("erreurs").hidden = false;
    document.getElementById("erreurs").textContent =
      `Impossible de lire evenements.json : ${e.message}. ` +
      "Vérifiez la syntaxe (virgules, guillemets) par exemple sur jsonlint.com.";
    return;
  }
  etat.donnees.categories ||= {};
  etat.donnees.evenements ||= [];
  etat.masquees.add(CLE_VACANCES); // vacances masquées par défaut, à activer dans les filtres
  try {
    etat.vacances = periodesVacances(etat.donnees);
  } catch (e) {
    etat.erreurVacances = `Vacances scolaires : ${e.message}`;
  }
  document.getElementById("nom-eglise").textContent = etat.donnees.eglise || "Planning annuel";

  lireUrl();
  const ouvrirEdition = new URLSearchParams(location.hash.slice(1)).has("edition"); // avant que rendre() réécrive l'adresse
  document.getElementById("annee-prec").onclick = () => { etat.annee--; rendre(); };
  document.getElementById("annee-suiv").onclick = () => { etat.annee++; rendre(); };
  document.querySelectorAll("[data-vue]").forEach(b => (b.onclick = () => { etat.vue = b.dataset.vue; rendre(); }));
  document.querySelectorAll("[data-periode]").forEach(b => (b.onclick = () => { etat.periode = b.dataset.periode; rendre(); }));
  document.querySelectorAll("[data-cycle]").forEach(b => (b.onclick = () => {
    etat.cycle = b.dataset.cycle;
    ecrireCyclePrefere(etat.cycle);
    rendre();
  }));
  document.getElementById("exporter").onclick = exporterIcs;
  document.getElementById("imprimer").onclick = () => window.print();
  rendre();
  initEditeur(ouvrirEdition);
}

document.addEventListener("DOMContentLoaded", demarrer);
