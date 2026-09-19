# src/ — la source de `index.html`

`index.html`, à la racine, est un **fichier généré**. On ne le modifie jamais
à la main : on édite les morceaux de `src/parts/`, puis on reconstruit.

```
node tools/build.mjs           reconstruit index.html
node tools/build.mjs --check   vérifie sans rien écrire
```

## Comment c'est découpé

`src/parts/` contient **106 morceaux**, remis bout à bout dans l'ordre de leur
préfixe numérique :

| | |
|---|---|
| `NNNN-markup.html` | les blocs de page, et les balises `<style>` / `<script>` qui encadrent les autres morceaux |
| `NNNN-style.css`   | le contenu des feuilles de style, sans les balises |
| `NNNN-<Module>.js` | un module de l'application (`Planning`, `PublicProfile`, `FDSLive`…) |

Les numéros avancent de 10 en 10 : il reste de la place pour insérer un
morceau entre deux sans tout renuméroter.

## Le principe, et pourquoi il est sûr

Les morceaux sont des **tranches brutes** du fichier. Le script ne fait que
les concaténer — aucune transformation, aucun assemblage intelligent. La
reconstruction redonne donc le fichier **à l'octet près**.

C'est vérifiable : au premier découpage, l'empreinte SHA-256 de `index.html`
était identique avant et après.

Cela fonctionne parce que les 95 modules de l'application vivent dans **une
seule fonction** qui leur donne une mémoire commune. Recoller les morceaux
reconstitue cette fonction à l'identique.

## Ce qui a été écarté

Passer à de vrais modules JavaScript (`import` / `export`) demanderait de
réécrire toutes les références entre les 95 modules, casserait l'ouverture du
fichier en double-clic (les navigateurs bloquent les modules en protocole
`file:`) et imposerait 95 requêtes au démarrage, faute d'étape de
construction. Le rapport bénéfice / risque ne le justifiait pas.

## Le garde-fou

L'action GitHub `verifier-build` relance la vérification à chaque push. Si
`index.html` ne correspond plus à `src/parts/`, elle échoue et indique la
ligne du premier écart.
