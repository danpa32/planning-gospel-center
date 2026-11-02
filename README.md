# Planning annuel de l'église

Une page web qui affiche sur l'année les cultes du dimanche et les gros événements récurrents, en couleur.
Les dates se recalculent automatiquement pour chaque année (Pâques, « 2e dimanche de décembre », etc.).

- **Calendrier** : les 12 mois d'un coup d'œil, avec la liste des événements sous chaque mois.
- **Liste** : les événements regroupés par trimestre ou par semestre, avec un bouton **Copier le récap**
  qui copie un texte prêt à envoyer à la comm.
- **Exporter .ics** : télécharge l'année dans un fichier calendrier (Google Agenda, Outlook, Apple…).
- **Imprimer** : version papier / PDF.

Deux découpages de l'année, au choix en haut de page (le choix est retenu dans le navigateur) :

- **Janv. – déc.** : l'année civile.
- **Juil. – juin** : l'année scolaire, par exemple 2026–2027 = juillet 2026 à juin 2027.

Les **vacances scolaires vaudoises** sont hachurées dans le calendrier, dans les deux vues. Dans la liste,
un événement qui tombe pendant des vacances est signalé en rouge.

Les liens sont partageables : `…/#annee=2026&cycle=scolaire&vue=liste&par=semestre`
(`annee` est la première année : 2026 pour 2026–2027).

## Tableau des idées (`idees.html`)

Avant de construire le planning, on rassemble ce que l'église veut vivre dans l'année. Chaque idée
est **portée par une personne ou un groupe** et indique les **secteurs à impliquer**.

La démarche, rappelée en haut de la page :

1. **Récolter** : chaque porteur de vision dépose ses idées (via un des admins).
2. **Se rencontrer** : on échange ensemble sur chaque idée, on la retient ou on la met de côté.
3. **Placer** : les idées retenues reçoivent une date dans le planning (`index.html`).
4. **Élaborer** : chaque événement daté est préparé avec son porteur et les secteurs impliqués.

Le tableau s'ouvre sur l'année qui vient, en vue civile ou scolaire comme le planning. Chaque idée est
rattachée à un **mois** : elle apparaît donc dans les deux vues.

À chaque nouvelle récolte, en mode édition :

- **Reprendre les idées de l'année précédente** recopie les idées de l'année d'avant comme *Idées* à
  rediscuter, avec leurs secteurs, porteur et vision (sans les notes). Les événements uniques déjà
  réalisés ne sont pas repris. Pour un événement du planning, le mois est recalculé (Pâques, etc.).
- **Ajouter les événements du planning** place sur le tableau, en *Au planning*, les événements
  d'`evenements.json` de l'année affichée qui n'y sont pas encore.

Le tableau a quatre colonnes : *Idées*, *Retenues*, *Au planning*, *Mises de côté*. En mode édition
(**Modifier le tableau**, même connexion Google que le planning), on ajoute ou modifie une idée et on glisse
les cartes d'une colonne à l'autre. La couleur d'une carte reprend les catégories d'`evenements.json`
(niveau d'implication des équipes). En haut, chaque secteur affiche le nombre d'idées qui l'impliquent ;
un clic filtre le tableau sur ce secteur.

Tout est enregistré dans **`idees.json`** :

```json
{
  "secteurs": ["Accueil", "Communication", "…"],
  "idees": [
    {
      "titre": "Soirée de louange",
      "porteur": "Équipe louange",
      "annee": 2027,
      "mois": 3,
      "statut": "retenue",
      "categorie": "vie-eglise",
      "periode": "début du mois",
      "frequence": "plusieurs",
      "vision": "Pourquoi cet événement.",
      "secteurs": ["Louange", "Sonorisation"],
      "notes": "Échanges de la rencontre."
    }
  ]
}
```

`statut` : `idee`, `retenue`, `planifiee` ou `ecartee`. `frequence` : `ponctuel`, `annuel`, `plusieurs`
ou `regulier`. `mois` va de 1 à 12. La liste `secteurs` se modifie directement dans le fichier.

## Mettre en ligne sur GitHub Pages

1. Créer un dépôt sur GitHub et y envoyer ces fichiers (`index.html`, `idees.html`, les fichiers `.js`, `style.css`, `evenements.json`, `idees.json`).
   Les données modifiées depuis la page sont dans Firebase (voir plus bas) ; les fichiers JSON du dépôt
   servent de point de départ et de secours si Firebase est injoignable.
2. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Après une minute, le site est disponible à `https://<compte>.github.io/<dépôt>/`.

## Modifier le planning depuis la page

En bas de la page, cliquer sur **Modifier le planning** : un panneau permet d'ajouter, modifier ou supprimer
les événements, avec un aperçu immédiat dans le calendrier. Ensuite :

- Chaque modification est **enregistrée automatiquement** dans Firebase environ une seconde après (les
  modifications rapprochées sont regroupées) ; le site public est à jour tout de suite. En cas d'échec,
  le panneau l'indique et propose **Réessayer**. Si quelqu'un d'autre a enregistré entre-temps, le panneau
  demande de recharger la page plutôt que d'écraser son travail. Le tableau des idées fonctionne de la même
  manière.
- **Télécharger le fichier** donne le JSON à jour (sauvegarde, ou pour mettre à jour le fichier du dépôt).

Pour enregistrer, il faut **se connecter avec un compte Google autorisé** (bouton dans le panneau). Tout le
monde peut lire le planning ; seuls les comptes listés dans les règles Firestore peuvent le modifier.

### Mettre en route Firebase (une seule fois)

1. Sur <https://console.firebase.google.com>, **Ajouter un projet** (Google Analytics : inutile).
2. **Build → Firestore Database → Créer une base de données**, emplacement `eur3 (europe-west)`,
   mode production.
3. **Build → Authentication → Commencer → Google** : activer, puis enregistrer.
   Dans **Authentication → Paramètres → Domaines autorisés**, ajouter `<compte>.github.io`.
4. **Paramètres du projet → Vos applications → Web (`</>`)** : créer l'application, puis recopier
   `apiKey`, `authDomain`, `projectId` et `appId` dans **`firebase-config.js`**. Ces valeurs ne sont pas
   secrètes.
5. **Firestore → Règles** : coller le contenu de `firestore.rules` en y remplaçant `ADRESSE_1`…`ADRESSE_5`
   par les adresses Gmail des personnes autorisées (en minuscules), puis **Publier**. Les vraies adresses
   restent dans la console : ne pas les mettre dans le fichier du dépôt, qui est public.

Pour ajouter ou retirer une personne, il suffit de modifier la liste dans les règles de la console.

Au premier enregistrement, le planning et le tableau des idées sont copiés depuis les fichiers JSON du dépôt.

## Modifier le fichier directement

Avant la mise en route de Firebase, tout se trouve dans **`evenements.json`**, qu'on peut éditer
directement sur github.com (icône crayon). Une fois Firebase utilisé, c'est la version de Firebase qui
s'affiche : modifier le fichier du dépôt n'a plus d'effet, sauf si Firebase est injoignable.

Si le fichier contient une erreur de syntaxe (virgule oubliée, guillemet manquant), la page l'affiche.
On peut vérifier le fichier sur [jsonlint.com](https://jsonlint.com).

### Couleurs

```json
"dimanches": { "nom": "Culte du dimanche", "couleur": "#3b82f6" },
"categories": {
  "evenement":  { "nom": "Gros événements", "couleur": "#dc2626" },
  "vie-eglise": { "nom": "Vie d'église",    "couleur": "#f59e0b" }
}
```

Chaque catégorie (et `dimanches`) peut avoir une `"legende"` : une phrase affichée dans la légende en haut
de la page. Le champ `"legende"` à la racine du fichier est la phrase d'introduction de cette légende.

Tous les dimanches sont colorés avec la couleur `dimanches` ; un dimanche qui a un événement prend la couleur
de l'événement. On peut ajouter autant de catégories que souhaité.

### Vacances scolaires

```json
"vacances": {
  "legende": "Vacances scolaires vaudoises et congés…",
  "periodes": [
    { "nom": "Vacances d'automne", "du": "2026-10-10", "au": "2026-10-25" },
    { "nom": "Jeûne fédéral", "du": "2026-09-21" }
  ]
}
```

Les dates jusqu'à l'été 2031 viennent du calendrier officiel du canton de Vaud
([vd.ch/vacances](https://www.vd.ch/vacances)). Au-delà, il faudra ajouter les nouvelles périodes.

### Heure et lieu par défaut

```json
"par_defaut": { "heure": "17h00", "lieu": "Explorit, Yverdon – salle Exploria" }
```

Un événement sans `heure` ou sans `lieu` utilise ces valeurs ; il suffit d'en indiquer d'autres dans
l'événement pour les remplacer.

### Un événement

```json
{
  "titre": "Noël",
  "categorie": "evenement",
  "quand": { "jour": "dimanche", "rang": 2, "mois": 12 },
  "duree": 1,
  "heure": "17h00",
  "lieu": "Grande salle",
  "description": "Texte libre."
}
```

Seuls `titre`, `categorie` et `quand` sont obligatoires. `duree` est en jours (3 = vendredi → dimanche).

### Les règles « quand »

| Besoin | Règle |
|---|---|
| Même date chaque année | `{ "chaque_annee": "12-25" }` (mois-jour) |
| Par rapport à Pâques | `{ "paques": 0 }` Pâques · `-2` Vendredi saint · `39` Ascension · `49` Pentecôte |
| n-ième jour d'un mois | `{ "jour": "dimanche", "rang": 2, "mois": 12 }` — `rang` : 1 à 5 ou `"dernier"` |
| Plusieurs mois | `{ "jour": "vendredi", "rang": 1, "mois": [3, 11] }` |
| Jour le plus proche d'une date | `{ "proche_de": "10-31", "jour": "dimanche" }` (dimanche le plus proche d'Halloween) |
| Une seule fois | `{ "date": "2027-10-16" }` (ou une liste de dates) |

Options utilisables avec toutes les règles :

- `"decalage": -2` décale de n jours (ex. le vendredi avant le 1er dimanche d'octobre).
- `"repeter": 5` répète chaque semaine, 5 fois (ex. un parcours de 5 dimanches).

### Une année différente des autres

```json
"exceptions": {
  "2027": "2027-10-08",
  "2028": "annulé"
}
```

Pour un événement répété (`repeter`), on peut donner une liste : `"2027": ["2027-02-07", "2027-02-21", …]`.

## Tester en local

Les pages lisent les fichiers JSON, elles doivent donc être servies par un petit serveur :

```bash
python3 serveur.py
```

puis ouvrir <http://localhost:8000>. En local, rien n'est envoyé à Firebase : les modifications du mode
édition sont enregistrées automatiquement dans le dossier `local/` (ignoré par git), et les pages lisent
ensuite ces copies. Les vrais `evenements.json` et `idees.json` ne sont pas touchés. Pour repartir des
vraies données, supprimer le dossier `local/`.

Pour tester la connexion Google et l'enregistrement dans le vrai Firebase avant de publier, ouvrir
<http://localhost:8000/?firebase> (attention : les modifications sont alors réelles).
