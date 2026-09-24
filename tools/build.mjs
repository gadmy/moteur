// ============================================================================
//  MOTEUR — RECONSTRUCTION DE index.html DEPUIS src/parts
// ============================================================================
//
//  index.html est un fichier GÉNÉRÉ. On ne le modifie JAMAIS à la main :
//  toute modification se fait dans src/parts/, puis on relance ce script.
//
//  Principe : les morceaux de src/parts/ sont des TRANCHES BRUTES du fichier,
//  remises bout à bout dans l'ordre de leur préfixe numérique. Aucune
//  transformation, aucun assemblage intelligent — la concaténation redonne
//  exactement le fichier d'origine, octet pour octet. C'est ce qui rend le
//  découpage vérifiable plutôt que risqué.
//
//  Pourquoi ça marche ici : les modules de l'application vivent dans une
//  seule fonction qui leur donne une mémoire commune. Recoller les morceaux
//  reconstitue cette fonction à l'identique. Passer à de vrais modules
//  JavaScript (import / export) demanderait, lui, de réécrire toutes les
//  références entre modules.
//
//  Usage :
//    node tools/build.mjs           reconstruit index.html
//    node tools/build.mjs --check   vérifie sans écrire (code 1 si écart)
//
// ============================================================================

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'src', 'parts');
const cible = join(racine, 'index.html');

//  Numero principal, et un sous-numero facultatif (v602) : « 0900.05-Orgs.js »
//  se range juste apres « 0900-Importer.js » et avant « 0901-... ». Il sert a
//  decouper un gros morceau sans renumeroter tous les suivants.
const rang = (nom) => {
    const m = /^(\d+)(?:\.(\d+))?-/.exec(nom);
    if (!m) throw new Error(`Morceau sans préfixe numérique : ${nom}`);
    return [parseInt(m[1], 10), m[2] === undefined ? -1 : parseInt(m[2], 10)];
};
const compare = (a, b) => { const x = rang(a), y = rang(b); return (x[0] - y[0]) || (x[1] - y[1]); };

const noms = (await readdir(dossier))
    .filter(n => /^\d+(\.\d+)?-.*\.(html|css|js)$/.test(n))
    .sort(compare);

if (noms.length === 0) throw new Error(`Aucun morceau trouvé dans ${dossier}`);

const vus = new Set();
for (const n of noms) {
    const r = rang(n).join('.');
    if (vus.has(r)) throw new Error(`Deux morceaux portent le numéro ${r} — l'ordre serait ambigu.`);
    vus.add(r);
}

const morceaux = await Promise.all(noms.map(n => readFile(join(dossier, n), 'utf8')));
const contenu = morceaux.join('');

if (process.argv.includes('--check')) {
    let actuel;
    try {
        actuel = await readFile(cible, 'utf8');
    } catch {
        console.error('index.html est absent : lancer « node tools/build.mjs ».');
        process.exit(1);
    }
    if (actuel === contenu) {
        console.log(`index.html correspond à src/parts (${noms.length} morceaux, ${(contenu.length / 1048576).toFixed(2)} Mo).`);
        process.exit(0);
    }
    // Localiser le premier écart : bien plus utile qu'un simple « ça diffère ».
    let i = 0;
    while (i < Math.min(actuel.length, contenu.length) && actuel[i] === contenu[i]) i++;
    const ligne = contenu.slice(0, i).split('\n').length;
    console.error('ÉCART entre index.html et src/parts.');
    console.error(`  premier écart : ligne ${ligne} (caractère ${i})`);
    console.error(`  index.html : ${actuel.length} caractères | reconstruit : ${contenu.length}`);
    console.error('  index.html a sans doute été modifié à la main. Reporter la');
    console.error('  modification dans src/parts/, puis relancer « node tools/build.mjs ».');
    process.exit(1);
}

await writeFile(cible, contenu);
console.log(`index.html reconstruit : ${noms.length} morceaux, ${(contenu.length / 1048576).toFixed(2)} Mo.`);
