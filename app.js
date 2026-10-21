// Planning annuel de l'église.
// Les événements sont décrits dans evenements.json avec une règle de récurrence ;
// ce script calcule leurs dates pour l'année affichée.

const JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];
const ENTETES_JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const COULEUR_DEFAUT = "#78716c";

const etat = {
  donnees: null,
  annee: new Date().getFullYear(),
  vue: "calendrier",
  periode: "trimestre",
  masquees: new Set(),
};

// ---------- Calcul des dates ----------

// Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher).
function paques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

function ajouterJours(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function lireDate(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (!m) throw new Error(`date « ${texte} » invalide (format attendu : AAAA-MM-JJ)`);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

// n-ième jour de la semaine d'un mois (rang 1 à 5, ou "dernier").
function nemeJour(annee, mois, jourSemaine, rang) {
  if (rang === "dernier") {
    const dernier = new Date(annee, mois, 0);
    return ajouterJours(dernier, -((dernier.getDay() - jourSemaine + 7) % 7));
  }
  const premier = new Date(annee, mois - 1, 1);
  const date = ajouterJours(premier, (jourSemaine - premier.getDay() + 7) % 7 + (rang - 1) * 7);
  return date.getMonth() === mois - 1 ? date : null;
}

function datesPourAnnee(evt, annee) {
  const exceptions = evt.exceptions || {};
  if (String(annee) in exceptions) {
    const exc = exceptions[annee];
    if (exc === null || exc === "annulé") return [];
    return [].concat(exc).map(lireDate);
  }
  if (evt.annees && !evt.annees.includes(annee)) return [];

  const q = evt.quand || {};
  const decalage = Number(q.decalage || 0);
  const repeter = Math.max(1, Number(q.repeter || 1));
  return datesDeBase(q, annee).flatMap(d =>
    Array.from({ length: repeter }, (_, i) => ajouterJours(d, decalage + i * 7)));
}

function datesDeBase(q, annee) {
  if ("date" in q) {
    return [].concat(q.date).map(lireDate).filter(d => d.getFullYear() === annee);
  }
  if ("chaque_annee" in q) {
    const m = /^(\d{2})-(\d{2})$/.exec(q.chaque_annee);
    if (!m) throw new Error(`"chaque_annee" doit être au format MM-JJ (ex. "12-25")`);
    return [new Date(annee, +m[1] - 1, +m[2])];
  }
  if ("paques" in q) {
    return [ajouterJours(paques(annee), Number(q.paques))];
  }
  if ("proche_de" in q || "a_partir_de" in q) {
    // "proche_de" : le jour de la semaine demandé le plus proche d'une date (ex. le dimanche le plus proche d'Halloween).
    // "a_partir_de" : ce jour-là s'il tombe le bon jour de la semaine, sinon le suivant (ex. le dimanche dès le 3 février).
    const cle = "proche_de" in q ? "proche_de" : "a_partir_de";
    const m = /^(\d{2})-(\d{2})$/.exec(q[cle]);
    if (!m) throw new Error(`"${cle}" doit être au format MM-JJ (ex. "10-31")`);
    const jourSemaine = JOURS[String(q.jour).toLowerCase()];
    if (jourSemaine === undefined) throw new Error(`jour « ${q.jour} » inconnu`);
    const repere = new Date(annee, +m[1] - 1, +m[2]);
    let ecart = (jourSemaine - repere.getDay() + 7) % 7;
    if (cle === "proche_de" && ecart > 3) ecart -= 7;
    return [ajouterJours(repere, ecart)];
  }
  if ("jour" in q) {
    const jourSemaine = JOURS[String(q.jour).toLowerCase()];
    if (jourSemaine === undefined) throw new Error(`jour « ${q.jour} » inconnu`);
    if (q.rang !== "dernier" && !(q.rang >= 1 && q.rang <= 5)) {
      throw new Error(`"rang" doit valoir 1 à 5 ou "dernier"`);
    }
    return [].concat(q.mois)
      .map(mois => nemeJour(annee, mois, jourSemaine, q.rang))
      .filter(Boolean);
  }
  throw new Error(`règle "quand" non reconnue`);
}

function occurrences(annee) {
  const erreurs = [];
  const liste = [];
  for (const evt of etat.donnees.evenements) {
    try {
      const dates = datesPourAnnee(evt, annee);
      const serie = (evt.quand?.repeter || 1) > 1 && dates.length > 1;
      dates.forEach((debut, i) => {
        const duree = Math.max(1, evt.duree || 1);
        const titre = serie ? `${evt.titre} (${i + 1}/${dates.length})` : evt.titre;
        liste.push({ evt, titre, debut, fin: ajouterJours(debut, duree - 1) });
      });
    } catch (e) {
      erreurs.push(`${evt.titre || "(sans titre)"} : ${e.message}`);
    }
  }
  liste.sort((a, b) => a.debut - b.debut || a.titre.localeCompare(b.titre));
  return { liste, erreurs };
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

// Dimanches sans culte (règles "sauf" de "dimanches", ex. le dernier dimanche de décembre).
function dimanchesSansCulte(annee) {
  return new Set((etat.donnees.dimanches?.sauf || [])
    .flatMap(q => datesDeBase(q, annee))
    .map(d => d.getTime()));
}

// Heure et lieu : ceux de l'événement, sinon les valeurs "par_defaut" du fichier.
function heureDe(evt) {
  return evt.heure || etat.donnees.par_defaut?.heure || "";
}

function lieuDe(evt) {
  return evt.lieu || etat.donnees.par_defaut?.lieu || "";
}

function memeJour(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const fmtCourt = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short" });
const fmtLong = new Intl.DateTimeFormat("fr-CH", { weekday: "short", day: "numeric", month: "long" });

function plageDates(occ, fmt) {
  if (memeJour(occ.debut, occ.fin)) return fmt.format(occ.debut);
  return `${fmt.format(occ.debut)} – ${fmt.format(occ.fin)}`;
}

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

// ---------- Vues ----------

function vueCalendrier(occs) {
  const aujourdhui = new Date();
  const grille = el("div", { class: "grille-annee" });
  const sansCulte = dimanchesSansCulte(etat.annee);

  for (let m = 0; m < 12; m++) {
    const jours = el("div", { class: "jours" }, ENTETES_JOURS.map(j => el("span", { class: "entete-jour" }, j)));
    const premier = new Date(etat.annee, m, 1);
    const decalage = (premier.getDay() + 6) % 7; // semaine commençant le lundi
    for (let i = 0; i < decalage; i++) jours.append(el("span"));

    const nbJours = new Date(etat.annee, m + 1, 0).getDate();
    for (let d = 1; d <= nbJours; d++) {
      const date = new Date(etat.annee, m, d);
      const duJour = occs.filter(o => date >= o.debut && date <= o.fin);
      const classes = ["jour"];
      const dimancheOrdinaire = date.getDay() === 0 && !duJour.length && dimanchesVisibles()
        && !sansCulte.has(date.getTime());
      if (date.getDay() === 0) classes.push("dimanche");
      if (duJour.length) classes.push("occupe");
      if (dimancheOrdinaire) classes.push("culte");
      if (memeJour(date, aujourdhui)) classes.push("aujourdhui");
      const attrs = { class: classes.join(" ") };
      if (duJour.length) {
        attrs.style = `--c:${categorie(duJour[0].evt).couleur}`;
        attrs.title = duJour.map(o => o.titre).join("\n");
      } else if (dimancheOrdinaire) {
        attrs.style = `--c:${etat.donnees.dimanches.couleur}`;
        attrs.title = etat.donnees.dimanches.nom;
      }
      jours.append(el("span", attrs, String(d)));
    }

    const duMois = occs.filter(o => o.debut.getMonth() === m);
    const liste = el("ul", { class: "evts-mois" },
      duMois.length
        ? duMois.map(o => el("li", {},
            pastille(categorie(o.evt).couleur),
            el("span", { class: "date" }, plageDates(o, fmtCourt)),
            el("span", {}, o.titre)))
        : el("li", { class: "vide" }, "—"));

    grille.append(el("section", { class: "mois" },
      el("h2", {}, NOMS_MOIS[m], duMois.length ? el("span", { class: "compte" }, String(duMois.length)) : null),
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
  const lignes = [`${etat.donnees.eglise} – ${p.nom} ${etat.annee}`, ""];
  for (const o of occs) {
    let ligne = `• ${plageDates(o, fmtLong)} : ${o.titre}`;
    const details = [heureDe(o.evt), lieuDe(o.evt)].filter(Boolean).join(", ");
    if (details) ligne += ` (${details})`;
    lignes.push(ligne);
  }
  if (!occs.length) lignes.push("Aucun événement.");
  return lignes.join("\n");
}

function vueListe(occs) {
  const conteneur = el("div");
  for (const p of periodes()) {
    const duPeriode = occs.filter(o => o.debut.getMonth() >= p.debut && o.debut.getMonth() <= p.fin);
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
            const meta = [heureDe(o.evt), lieuDe(o.evt), categorie(o.evt).nom].filter(Boolean).join(" · ");
            return el("li", { class: "ligne" },
              el("span", { class: "quand" }, plageDates(o, fmtLong)),
              el("span", { class: "titre" }, pastille(categorie(o.evt).couleur), o.titre),
              el("p", { class: "meta" }, meta),
              o.evt.description ? el("p", { class: "desc" }, o.evt.description) : null);
          })
        : el("li", { class: "vide" }, "Aucun événement."));

    conteneur.append(el("section", { class: "periode" },
      el("div", { class: "periode-entete" },
        el("h2", {}, p.nom,
          el("span", { class: "plage" }, `${NOMS_MOIS[p.debut]} – ${NOMS_MOIS[p.fin]}`),
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
  const { liste } = occurrences(etat.annee);
  const horodatage = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Planning eglise//FR", "CALSCALE:GREGORIAN"];
  for (const o of liste.filter(o => !etat.masquees.has(o.evt.categorie))) {
    const desc = [heureDe(o.evt), o.evt.description].filter(Boolean).join(" – ");
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
  const lien = el("a", { href: URL.createObjectURL(blob), download: `planning-${etat.annee}.ics` });
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

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

function nombreDimanches(annee) {
  const sansCulte = dimanchesSansCulte(annee);
  let n = 0;
  for (let d = new Date(annee, 0, 1); d.getFullYear() === annee; d = ajouterJours(d, 1)) {
    if (d.getDay() === 0 && !sansCulte.has(d.getTime())) n++;
  }
  return n;
}

// Nombre d'événements de l'année par catégorie, affiché sur chaque filtre.
function rendreFiltres(liste) {
  const comptes = { [CLE_DIMANCHES]: nombreDimanches(etat.annee) };
  for (const o of liste) comptes[o.evt.categorie] = (comptes[o.evt.categorie] || 0) + 1;
  const zone = document.getElementById("filtres");
  const entrees = Object.entries(etat.donnees.categories);
  if (etat.donnees.dimanches) entrees.unshift([CLE_DIMANCHES, etat.donnees.dimanches]);
  zone.replaceChildren(...entrees.map(([cle, cat]) =>
    el("button", {
      type: "button",
      class: "filtre",
      "aria-pressed": String(!etat.masquees.has(cle)),
      onclick: () => {
        etat.masquees.has(cle) ? etat.masquees.delete(cle) : etat.masquees.add(cle);
        rendre();
      },
    }, pastille(cat.couleur), cat.nom, el("span", { class: "compte" }, String(comptes[cle] || 0)))));
}

// Signification des couleurs : une ligne par catégorie qui a une "legende".
function rendreLegende() {
  const zone = document.getElementById("legende");
  const entrees = [etat.donnees.dimanches, ...Object.values(etat.donnees.categories)]
    .filter(cat => cat?.legende);
  zone.hidden = !entrees.length;
  zone.replaceChildren(
    etat.donnees.legende ? el("p", { class: "intro" }, etat.donnees.legende) : "",
    el("ul", {}, entrees.map(cat => el("li", {},
      pastille(cat.couleur),
      el("span", {}, el("strong", {}, cat.nom), ` : ${cat.legende}`)))));
}

function rendre() {
  document.getElementById("annee").textContent = etat.annee;
  document.title = `${etat.donnees.eglise} – Planning ${etat.annee}`;
  document.querySelectorAll("[data-vue]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.vue === etat.vue)));
  document.querySelectorAll("[data-periode]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.periode === etat.periode)));
  document.getElementById("choix-periode").hidden = etat.vue !== "liste";

  const { liste, erreurs } = occurrences(etat.annee);
  try {
    dimanchesSansCulte(etat.annee);
  } catch (e) {
    etat.donnees.dimanches.sauf = [];
    erreurs.push(`Dimanches sans culte ("sauf") : ${e.message}`);
  }
  afficherErreurs(erreurs);
  rendreFiltres(liste);
  rendreLegende();
  const visibles = liste.filter(o => !etat.masquees.has(o.evt.categorie));
  document.getElementById("resume").textContent =
    `${pluriel(visibles.length, "événement")} · ${pluriel(nombreDimanches(etat.annee), "dimanche")}`;
  document.getElementById("contenu").replaceChildren(
    etat.vue === "liste" ? vueListe(visibles) : vueCalendrier(visibles));

  const params = new URLSearchParams({ annee: etat.annee, vue: etat.vue });
  if (etat.vue === "liste") params.set("par", etat.periode);
  if (typeof edition !== "undefined" && edition.actif) params.set("edition", "");
  history.replaceState(null, "", `#${params}`);
}

function lireUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  const annee = parseInt(params.get("annee"), 10);
  if (annee > 1900 && annee < 3000) etat.annee = annee;
  if (["calendrier", "liste"].includes(params.get("vue"))) etat.vue = params.get("vue");
  if (["trimestre", "semestre"].includes(params.get("par"))) etat.periode = params.get("par");
}

async function demarrer() {
  try {
    // La version du dépôt est la plus récente ; le fichier publié peut être en cache quelques minutes.
    let texte = await lireFichierDepot();
    if (texte === null) {
      const rep = await fetch("evenements.json", { cache: "no-cache" });
      if (!rep.ok) throw new Error(`fichier introuvable (${rep.status})`);
      texte = await rep.text();
    }
    etat.donnees = JSON.parse(texte);
  } catch (e) {
    document.getElementById("erreurs").hidden = false;
    document.getElementById("erreurs").textContent =
      `Impossible de lire evenements.json : ${e.message}. ` +
      "Vérifiez la syntaxe (virgules, guillemets) par exemple sur jsonlint.com.";
    return;
  }
  etat.donnees.categories ||= {};
  etat.donnees.evenements ||= [];
  document.getElementById("nom-eglise").textContent = etat.donnees.eglise || "Planning annuel";

  lireUrl();
  document.getElementById("annee-prec").onclick = () => { etat.annee--; rendre(); };
  document.getElementById("annee-suiv").onclick = () => { etat.annee++; rendre(); };
  document.querySelectorAll("[data-vue]").forEach(b => (b.onclick = () => { etat.vue = b.dataset.vue; rendre(); }));
  document.querySelectorAll("[data-periode]").forEach(b => (b.onclick = () => { etat.periode = b.dataset.periode; rendre(); }));
  document.getElementById("exporter").onclick = exporterIcs;
  document.getElementById("imprimer").onclick = () => window.print();
  rendre();
  initEditeur();
}

document.addEventListener("DOMContentLoaded", demarrer);
