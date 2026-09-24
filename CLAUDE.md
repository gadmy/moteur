# Consignes pour Claude

Le journal du projet (méthode de travail, reste à faire, règles, historique
des versions) et le SQL de la base NE SONT PAS dans ce dépôt, qui est public.
Ils vivent dans le dépôt privé **gadmy/moteur-suivi** (`SUIVI.md`, `sql/`).

En début de conversation : ajouter `gadmy/moteur-suivi` à la session, lire
son `SUIVI.md` avant toute chose, et y tenir le journal de la version en
cours. Le code se modifie ici, dans `src/parts/` (voir `src/README.md`) :
`index.html` est généré par `node tools/build.mjs`.
