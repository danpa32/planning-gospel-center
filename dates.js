// Calcul des dates, partagé par le planning (index.html) et le tableau des idées (idees.html) :
// règles de récurrence, année civile ou scolaire, vacances scolaires.

const JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];
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
  if ("proche_de" in q) {
    // Le jour de la semaine demandé le plus proche d'une date (ex. le samedi le plus proche d'Halloween).
    const m = /^(\d{2})-(\d{2})$/.exec(q.proche_de);
    if (!m) throw new Error(`"proche_de" doit être au format MM-JJ (ex. "10-31")`);
    const jourSemaine = JOURS[String(q.jour).toLowerCase()];
    if (jourSemaine === undefined) throw new Error(`jour « ${q.jour} » inconnu`);
    const repere = new Date(annee, +m[1] - 1, +m[2]);
    let ecart = (jourSemaine - repere.getDay() + 7) % 7;
    if (ecart > 3) ecart -= 7;
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

function memeJour(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const fmtCourt = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short" });
const fmtLong = new Intl.DateTimeFormat("fr-CH", { weekday: "short", day: "numeric", month: "long" });

const RANGS = { 1: "1er", 2: "2e", 3: "3e", 4: "4e", 5: "5e", dernier: "dernier" };

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

// ---------- Année civile (janvier – décembre) ou scolaire (juillet – juin) ----------

const CYCLES = { civile: "Janv. – déc.", scolaire: "Juil. – juin" };
const MOIS_DEBUT_SCOLAIRE = 6; // juillet
const STOCKAGE_CYCLE = "planning-cycle";

// L'année affichée est celle du premier mois : en scolaire, 2026 = juillet 2026 – juin 2027.
function moisDuCycle(annee, cycle) {
  const debut = cycle === "scolaire" ? MOIS_DEBUT_SCOLAIRE : 0;
  return Array.from({ length: 12 }, (_, i) => ({ annee: annee + Math.floor((debut + i) / 12), mois: (debut + i) % 12 }));
}

function bornesCycle(annee, cycle) {
  const mois = moisDuCycle(annee, cycle);
  return { debut: new Date(mois[0].annee, mois[0].mois, 1), fin: new Date(mois[11].annee, mois[11].mois + 1, 0) };
}

// Position (0 à 11) d'un mois dans le cycle, ou -1 s'il n'en fait pas partie. "mois" va de 0 à 11.
function rangDansCycle(annee, mois, debutCycle, cycle) {
  const i = (annee - debutCycle) * 12 + mois - (cycle === "scolaire" ? MOIS_DEBUT_SCOLAIRE : 0);
  return i >= 0 && i < 12 ? i : -1;
}

function libelleCycle(annee, cycle) {
  return cycle === "scolaire" ? `${annee}–${annee + 1}` : String(annee);
}

function cycleEnCours(cycle, date = new Date()) {
  const annee = date.getFullYear();
  return cycle === "scolaire" && date.getMonth() < MOIS_DEBUT_SCOLAIRE ? annee - 1 : annee;
}

// Le choix civile/scolaire est retenu dans ce navigateur, pour les deux pages.
function lireCyclePrefere() {
  try { return localStorage.getItem(STOCKAGE_CYCLE) === "scolaire" ? "scolaire" : "civile"; } catch { return "civile"; }
}

function ecrireCyclePrefere(cycle) {
  try { localStorage.setItem(STOCKAGE_CYCLE, cycle); } catch { /* stockage indisponible */ }
}

// ---------- Vacances scolaires ----------

// "vacances" dans evenements.json : [{ "nom": "Vacances d'automne", "du": "2026-10-10", "au": "2026-10-25" }, …]
function periodesVacances(donnees) {
  return (donnees.vacances?.periodes || []).map(v => ({ nom: v.nom, debut: lireDate(v.du), fin: lireDate(v.au || v.du) }));
}

function vacancesDuJour(vacances, date) {
  return vacances.find(v => date >= v.debut && date <= v.fin);
}

// ---------- Occurrences des événements sur un cycle ----------

// Toutes les occurrences comprises dans le cycle affiché, triées par date.
// Les erreurs de règle sont renvoyées à part, une seule fois par événement.
function occurrencesCycle(evenements, annee, cycle) {
  const { debut, fin } = bornesCycle(annee, cycle);
  const annees = cycle === "scolaire" ? [annee, annee + 1] : [annee];
  const erreurs = new Set();
  const liste = [];
  for (const evt of evenements) {
    for (const a of annees) {
      try {
        const dates = datesPourAnnee(evt, a);
        const serie = (evt.quand?.repeter || 1) > 1 && dates.length > 1;
        dates.forEach((d, i) => {
          if (d < debut || d > fin) return;
          const duree = Math.max(1, evt.duree || 1);
          const titre = serie ? `${evt.titre} (${i + 1}/${dates.length})` : evt.titre;
          liste.push({ evt, titre, debut: d, fin: ajouterJours(d, duree - 1), suiteDeSerie: serie && i > 0 });
        });
      } catch (e) {
        erreurs.add(`${evt.titre || "(sans titre)"} : ${e.message}`);
      }
    }
  }
  liste.sort((a, b) => a.debut - b.debut || a.titre.localeCompare(b.titre));
  return { liste, erreurs: [...erreurs] };
}
