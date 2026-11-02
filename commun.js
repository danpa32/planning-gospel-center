// Code partagé par le planning (index.html) et le tableau des idées (idees.html) :
// construction du DOM, lecture/écriture des fichiers JSON (dans Firebase, ou en local avec serveur.py),
// enregistrement automatique, champs de formulaire.

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

// Légende qu'on peut cacher ; le choix est retenu par ce navigateur, pour les deux pages.
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

// ---------- Firebase : lecture publique, écriture réservée aux comptes Google autorisés ----------

// Chaque fichier JSON est un document planning/<nom> : { json, version }.
// La liste des comptes autorisés se trouve uniquement dans les règles Firestore (console Firebase).
const SDK_FIREBASE = "https://www.gstatic.com/firebasejs/10.12.2";
const FIREBASE_CONFIGURE = typeof FIREBASE !== "undefined" && Boolean(FIREBASE.apiKey);

// Sur localhost, serveur.py enregistre les fichiers dans le dossier local/ ; ailleurs, on écrit dans Firebase.
// http://localhost:8000/?firebase utilise le vrai Firebase, pour tester la connexion avant de publier.
const EN_LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
  && !new URLSearchParams(location.search).has("firebase");

let firebase = null;
const session = { utilisateur: null, autorise: false, prete: false };
const suiviSession = [];

function chargerFirebase() {
  firebase ||= Promise.all([
    import(`${SDK_FIREBASE}/firebase-app.js`),
    import(`${SDK_FIREBASE}/firebase-firestore.js`),
    import(`${SDK_FIREBASE}/firebase-auth.js`),
  ]).then(([{ initializeApp }, fs, au]) => {
    const app = initializeApp(FIREBASE);
    const fb = { db: fs.getFirestore(app), auth: au.getAuth(app), fs, au };
    au.onAuthStateChanged(fb.auth, async utilisateur => {
      session.utilisateur = utilisateur;
      session.autorise = utilisateur ? await compteAutorise(fb, utilisateur) : false;
      session.prete = true;
      suiviSession.forEach(f => f());
    });
    return fb;
  });
  return firebase;
}

// Les règles n'autorisent la lecture de editeurs/<adresse> qu'aux comptes de la liste :
// si la lecture passe (même document absent), le compte peut modifier le planning.
async function compteAutorise(fb, utilisateur) {
  try {
    await fb.fs.getDoc(fb.fs.doc(fb.db, "editeurs", utilisateur.email.toLowerCase()));
    return true;
  } catch {
    return false;
  }
}

// f() est appelée à chaque connexion ou déconnexion.
function suivreSession(f) {
  suiviSession.push(f);
}

async function seConnecter() {
  const fb = await chargerFirebase();
  await fb.au.signInWithPopup(fb.auth, new fb.au.GoogleAuthProvider());
}

async function seDeconnecter() {
  const fb = await chargerFirebase();
  await fb.au.signOut(fb.auth);
}

function documentFirebase(fb, fichier) {
  return fb.fs.doc(fb.db, "planning", fichier.replace(/\.json$/, ""));
}

// Renvoie le texte JSON enregistré dans Firebase, ou null s'il n'existe pas encore ou est injoignable.
async function lireFichierFirebase(fichier) {
  if (!FIREBASE_CONFIGURE) return null;
  try {
    const fb = await chargerFirebase();
    const d = await fb.fs.getDoc(documentFirebase(fb, fichier));
    return d.exists() ? d.data().json : null;
  } catch (e) {
    console.error(fichier, e);
    return null;
  }
}

// Firebase d'abord (toujours à jour), sinon le fichier publié à côté de la page.
// En local, toujours le fichier servi par serveur.py.
async function lireJson(fichier) {
  let texte = EN_LOCAL ? null : await lireFichierFirebase(fichier);
  if (texte === null) {
    const rep = await fetch(fichier, { cache: "no-cache" });
    if (!rep.ok) throw new Error(`fichier introuvable (${rep.status})`);
    texte = await rep.text();
  }
  return JSON.parse(texte);
}

// ---------- Où enregistrer : serveur local de test ou Firebase ----------

function enregistrementPossible() {
  return EN_LOCAL || session.autorise;
}

function decrireStockage() {
  if (EN_LOCAL) return "Test en local : les modifications sont enregistrées dans le dossier local/.";
  if (!FIREBASE_CONFIGURE) return "Firebase non configuré : les modifications peuvent seulement être téléchargées.";
  const u = session.utilisateur;
  if (!session.prete) return "Connexion…";
  if (!u) return "Connectez-vous avec votre compte Google pour enregistrer vos modifications.";
  if (!session.autorise) return `Le compte ${u.email} n'est pas autorisé à modifier le planning.`;
  return `Connecté : ${u.displayName || u.email}`;
}

// Bouton de connexion du panneau d'édition ; une fois connecté, suivreSession() recharge les données.
function boutonCompte() {
  if (EN_LOCAL || !FIREBASE_CONFIGURE || !session.prete) return null;
  if (!session.utilisateur) {
    return el("button", { type: "button", class: "principal", onclick: () => seConnecter().catch(console.error) },
      "Se connecter avec Google");
  }
  return el("button", { type: "button", class: "secondaire", onclick: seDeconnecter }, "Se déconnecter");
}

// Renvoie { donnees, version } ; la version sert à détecter une modification faite entre-temps
// par quelqu'un d'autre. Tant que Firebase est vide, on part du fichier publié (version 0).
async function chargerJsonEdition(fichier) {
  if (EN_LOCAL) return { donnees: await lireJson(fichier), version: null };
  const fb = await chargerFirebase();
  const d = await fb.fs.getDoc(documentFirebase(fb, fichier));
  if (!d.exists()) {
    const rep = await fetch(fichier, { cache: "no-cache" });
    if (!rep.ok) throw new Error(`fichier introuvable (${rep.status})`);
    return { donnees: await rep.json(), version: 0 };
  }
  const { json, version } = d.data();
  return { donnees: JSON.parse(json), version };
}

// Renvoie la nouvelle version.
async function enregistrerJsonEdition(fichier, donnees, version) {
  if (EN_LOCAL) {
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
  const fb = await chargerFirebase();
  const ref = documentFirebase(fb, fichier);
  try {
    return await fb.fs.runTransaction(fb.db, async t => {
      const d = await t.get(ref);
      if ((d.exists() ? d.data().version : 0) !== version) {
        throw new Error("le planning a été modifié entre-temps par quelqu'un d'autre : rechargez la page");
      }
      t.set(ref, { json: texteJson(donnees), version: version + 1 });
      return version + 1;
    });
  } catch (e) {
    if (e.code === "permission-denied") throw new Error("ce compte n'a pas le droit de modifier le planning");
    if (e.code === "unavailable") throw new Error("pas de connexion internet");
    throw e;
  }
}

// Enregistre automatiquement peu après chaque modification. Les modifications rapprochées
// (plusieurs champs, un glisser-déposer) sont regroupées en un seul enregistrement, et un seul
// enregistrement a lieu à la fois, car chacun part de la version enregistrée par le précédent.
// etatEdition : { modifie, version, message, erreur } ; afficher() redessine le panneau d'édition.
function enregistrementAuto(fichier, etatEdition, lireDonnees, afficher) {
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
    enCours = enregistrerJsonEdition(fichier, lireDonnees(), etatEdition.version)
      .then(version => {
        etatEdition.version = version;
        etatEdition.message = etatEdition.modifie ? "" : "Enregistré ✓";
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
    : (enregistrementPossible() ? "Les modifications sont enregistrées automatiquement." : ""));
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
