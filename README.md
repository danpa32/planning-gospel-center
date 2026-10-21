# Planning annuel de l'église

Une page web qui affiche sur l'année les cultes du dimanche et les gros événements récurrents, en couleur.
Les dates se recalculent automatiquement pour chaque année (Pâques, « 2e dimanche de décembre », etc.).

- **Calendrier** : les 12 mois d'un coup d'œil, avec la liste des événements sous chaque mois.
- **Liste** : les événements regroupés par trimestre ou par semestre, avec un bouton **Copier le récap**
  qui copie un texte prêt à envoyer à la comm.
- **Exporter .ics** : télécharge l'année dans un fichier calendrier (Google Agenda, Outlook, Apple…).
- **Imprimer** : version papier / PDF.

Les liens sont partageables : `…/#annee=2027&vue=liste&par=semestre`.

## Mettre en ligne sur GitHub Pages

1. Créer un dépôt sur GitHub et y envoyer ces fichiers (`index.html`, `app.js`, `style.css`, `evenements.json`).
2. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Après une minute, le site est disponible à `https://<compte>.github.io/<dépôt>/`.

## Modifier le planning depuis la page

En bas de la page, cliquer sur **Modifier le planning** : un panneau permet d'ajouter, modifier ou supprimer
les événements, avec un aperçu immédiat dans le calendrier. Ensuite :

- **Enregistrer sur GitHub** écrit directement `evenements.json` dans le dépôt ; le site public est à jour
  environ une minute plus tard.
- **Télécharger le fichier** donne le `evenements.json` modifié (utile sans accès GitHub).

La première fois, il faut renseigner les **Réglages GitHub** :

1. Créer un jeton sur <https://github.com/settings/personal-access-tokens/new> :
   « Repository access » → *Only select repositories* → ce dépôt, puis
   « Permissions » → *Contents* → **Read and write**.
2. Coller le jeton dans *Réglages GitHub* (le dépôt est rempli automatiquement sur GitHub Pages).

Le jeton reste dans le navigateur de la personne qui édite ; il n'est jamais publié. Chaque personne qui
modifie le planning doit avoir accès au dépôt et créer son propre jeton.

## Modifier le fichier directement

Tout se trouve dans **`evenements.json`**. On peut aussi l'éditer directement sur github.com (icône crayon),
puis « Commit changes » : le site se met à jour en une minute environ.

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

Tous les dimanches sont colorés avec la couleur `dimanches` ; un dimanche qui a un événement prend la couleur
de l'événement. On peut ajouter autant de catégories que souhaité.

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

La page lit `evenements.json`, elle doit donc être servie par un petit serveur :

```bash
python3 -m http.server
```

puis ouvrir <http://localhost:8000>.
