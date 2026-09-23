
  const PlanningBoards = {
    // ==================================================================
    //  LE PLAN DE TRAVAIL, L'AUTRE MOITIE (v601)
    // ==================================================================
    //  Ce qui s'appelait « plan de travail » n'etait que la GRILLE des
    //  presences (SW / W / WF / T) : la moitie « qui travaille quand », celle
    //  qui sert a la paie et aux contrats. Juste, mais muette sur ce qu'on
    //  tourne.
    //  L'AUTRE MOITIE, C'EST LE TOURNAGE ENTIER SUR UN DOCUMENT : chaque
    //  journee, dans l'ordre, avec son decor, son effet, ses scenes, ses
    //  personnages et ce qu'il faut preparer. C'est avec ca qu'on FABRIQUE un
    //  tournage — on y lit qu'un decor revient trois fois a trois semaines
    //  d'ecart, qu'un comedien a un trou de dix jours au milieu, qu'une nuit
    //  suit un jour.
    //  CE N'EST PAS LA FEUILLE DE SERVICE, qui existe deja et qui est tres
    //  complete : celle-la, c'est UNE journee, distribuee la veille, avec les
    //  convocations et les adresses. Le plan de travail, c'est la forme de
    //  l'ensemble. On lit donc le depouillement PAR LA MEME PORTE que la
    //  feuille de service (PlanningFDS.breakdownSlots) : deux lectures du
    //  meme depouillement finiraient par ne plus dire la meme chose.
    //  LES JOURS NUMEROTES SONT LES JOURS DE PLATEAU, et eux seuls — c'est
    //  ainsi que font les productions : J1, J2... comptent le tournage, et
    //  les reperages, essais et journees probables figurent au bon endroit
    //  dans le calendrier, sans numero. Numeroter un essai costume ferait un
    //  « 30 jours de tournage » qui n'en est pas un, et c'est ce chiffre qui
    //  part dans le budget et les contrats.

    //  Un jour de plateau, ou une journee d'autre chose ?
    _estPlateau: (j) => {
        if(!j) return false;
        if(typeof Planning !== 'undefined' && Planning.estProbable && Planning.estProbable(j)) return false;
        const t = j.dayType || 'tournage';
        return t === 'tournage';
    },
    //  Les journees du projet, dans l'ordre, avec leur numero de plateau.
    journees: () => {
        const jours = (state.data.shootingDays || []).slice().sort((a, b) =>
            String(a.startDate || a.date || '').localeCompare(String(b.startDate || b.date || '')));
        let n = 0;
        return jours.map(j => {
            const plateau = PlanningBoards._estPlateau(j);
            if(plateau) n++;
            return { jour: j, numero: plateau ? n : null, plateau: plateau };
        });
    },
    //  Les scenes d'une journee, retrouvees par leur identifiant.
    _scenesDe: (j) => (j && j.scenes || [])
        .map(ref => (state.data.scenes || []).find(s => s && s.id === (ref && ref.sceneId)))
        .filter(Boolean),
    //  Le decor d'une scene : la fiche liee si elle existe, sinon ce que dit
    //  l'en-tete de scene (meme lecture que la feuille de service).
    _decorDe: (sc) => {
        const fiche = sc && sc.locationId
            ? (state.data.locations || []).find(l => l && l.id === sc.locationId) : null;
        if(fiche && fiche.name) return fiche.name;
        try { return PlanningFDS.decor(sc); } catch(e) { return (sc && sc.title) || ''; }
    },
    //  L'effet : INT/EXT et JOUR/NUIT, tels qu'ils sont ecrits sur la scene.
    _effetDe: (sc) => [sc && sc.intExt, sc && sc.dayNight].filter(Boolean).join(' · '),
    //  Les personnages d'une journee, par leurs fiches.
    _personnagesDe: (j) => {
        const vus = {}, out = [];
        PlanningBoards._scenesDe(j).forEach(sc => {
            (sc.breakdown && sc.breakdown['PERSONNAGES'] || []).forEach(it => {
                const t = Utils.bdText(it);
                if(!t || vus[t]) return;
                vus[t] = 1; out.push(t);
            });
        });
        return out;
    },
    //  ==================================================================
    //  LE METRAGE : CE QUI DIT QU'UNE JOURNEE EST TROP CHARGEE
    //  ==================================================================
    //  La duree estimee existe sur la fiche de scene depuis toujours
    //  (« Duree estimee (min) », sc.time) et le plan de travail l'ignorait.
    //  Mesure faite avant d'y toucher : 55 scenes sur 68 en portent une, de
    //  0,2 a 5 minutes. C'est donc une donnee reelle, pas un champ decoratif.
    //  ELLE EST STOCKEE EN TEXTE et peut contenir une virgule : « 2,5 » et
    //  « 2.5 » sont la meme chose pour celui qui la tape, et deux choses
    //  differentes pour parseFloat. On normalise a la lecture.
    _dureeDe: (sc) => {
        const t = String((sc && sc.time) || '').trim().replace(',', '.');
        if(!t) return 0;
        const n = parseFloat(t);
        return (isFinite(n) && n > 0) ? n : 0;
    },
    dureeJour: (j) => PlanningBoards._scenesDe(j)
        .reduce((somme, sc) => somme + PlanningBoards._dureeDe(sc), 0),
    //  LE PREMINUTAGE S'ECRIT EN HEURES:MINUTES:SECONDES (00:03:15), et pas
    //  en « 3,25 min » : c'est la forme des modeles professionnels, celle que
    //  lisent les gens a qui ce document est destine. Une minute et demie,
    //  c'est 00:01:30 — la fraction decimale se lit mal et se compare mal.
    _hms: (minutes) => {
        const tot = Math.max(0, Math.round((Number(minutes) || 0) * 60));
        const h = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), sec = tot % 60;
        const d2 = (n) => String(n).padStart(2, '0');
        return d2(h) + ':' + d2(m) + ':' + d2(sec);
    },
    //  LA SEMAINE DE TOURNAGE, pas la semaine du calendrier : le modele
    //  compte a partir de la premiere journee de plateau, parce que c'est
    //  « la semaine 3 du tournage » qu'on dit sur un plateau, jamais « la
    //  semaine 38 de l'annee ».
    _semaineDe: (dateStr, premiere) => {
        if(!premiere) return '';
        const a = new Date(String(premiere) + 'T12:00:00');
        const b = new Date(String(dateStr) + 'T12:00:00');
        if(isNaN(a.getTime()) || isNaN(b.getTime())) return '';
        // On part du LUNDI de la premiere semaine : sinon un tournage qui
        // commence un jeudi ferait changer de semaine le dimanche soir.
        const lundi = new Date(a);
        const j = (a.getDay() + 6) % 7;
        lundi.setDate(a.getDate() - j);
        const jours = Math.floor((b - lundi) / 86400000);
        return jours < 0 ? '' : (Math.floor(jours / 7) + 1);
    },
    MOIS_COURTS: ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'],
    _moisDe: (dateStr) => {
        const d = new Date(String(dateStr) + 'T12:00:00');
        return isNaN(d.getTime()) ? '' : PlanningBoards.MOIS_COURTS[d.getMonth()];
    },

    //  « 4,5 min » plutot que « 4.5 min » : on ecrit comme on parle.
    _minutes: (n) => (Math.round(n * 10) / 10).toString().replace('.', ',') + ' min',
    //  LA MOYENNE VIENT DU PROJET LUI-MEME, pas d'un chiffre que j'aurais
    //  choisi. Une journee « lourde » n'a pas de definition universelle : une
    //  serie tourne huit minutes par jour, un long-metrage deux. On compare
    //  donc chaque journee a la moyenne DE CE TOURNAGE, et on le dit dans
    //  l'infobulle pour que le signal reste interpretable.
    SEUIL_LOURD: 1.5,
    dureeMoyenne: () => {
        const jours = PlanningBoards.journees().filter(l => l.plateau);
        const avec = jours.filter(l => PlanningBoards.dureeJour(l.jour) > 0);
        if(!avec.length) return 0;
        return avec.reduce((s, l) => s + PlanningBoards.dureeJour(l.jour), 0) / avec.length;
    },

    //  CE QUI DECIDE DE L'ORDRE DES JOURS. Un vehicule, un animal, un effet
    //  special ou de la figuration coutent cher et se preparent : on les voit
    //  d'un coup d'oeil, sans deplier le depouillement entier.
    CATS_LOURDES: [
        { cat: 'VEHICULES', icone: '🚗', mot: 'véhicule' },
        { cat: 'ANIMAUX', icone: '🐕', mot: 'animal' },
        { cat: 'EFFETS SPECIAUX (SFX)', icone: '💥', mot: 'SFX' },
        { cat: 'EFFETS VISUELS (VFX)', icone: '🖥️', mot: 'VFX' },
        { cat: 'FIGURATION', icone: '👥', mot: 'figurant' }
    ],
    pointsLourds: (j) => {
        const compte = {};
        PlanningBoards._scenesDe(j).forEach(sc => {
            PlanningBoards.CATS_LOURDES.forEach(d => {
                const items = (sc.breakdown && sc.breakdown[d.cat]) || [];
                if(!items.length) return;
                if(!compte[d.cat]) compte[d.cat] = {};
                items.forEach(it => { const t = Utils.bdText(it); if(t) compte[d.cat][t] = 1; });
            });
        });
        return PlanningBoards.CATS_LOURDES
            .filter(d => compte[d.cat])
            .map(d => {
                const n = Object.keys(compte[d.cat]).length;
                return { icone: d.icone, n: n, mot: d.mot + (n > 1 ? 's' : ''),
                         quoi: Object.keys(compte[d.cat]) };
            });
    },

    // Afficher le Plan de Travail
    // Afficher le Plan de Travail (DOOD)
    //  LE RECAPITULATIF PAR DECOR : la premiere chose qu'un assistant
    //  realisateur optimise. Y retourner trois fois pour une scene a chaque
    //  fois, c'est trois installations et trois retours.
    recapDecors: () => {
        const par = {};
        PlanningBoards.journees().forEach(l => {
            PlanningBoards._scenesDe(l.jour).forEach(sc => {
                const d = PlanningBoards._decorDe(sc);
                if(!d) return;
                if(!par[d]) par[d] = { jours: [], scenes: 0, min: 0 };
                par[d].scenes++;
                par[d].min += PlanningBoards._dureeDe(sc);
                const eti = l.numero ? ('J' + l.numero) : PlanningBoards._dateCourte(l.jour.startDate || l.jour.date);
                if(par[d].jours.indexOf(eti) < 0) par[d].jours.push(eti);
            });
        });
        const noms = Object.keys(par).sort((a, b) => par[b].jours.length - par[a].jours.length);
        if(!noms.length) return '';
        const esc = Utils.escape;
        return '<div class="pdt-bloc" data-bloc="decors"><h3 class="pdt-titre">🏠 Par décor'
            + PlanningBoards._btnImp('decors') + '</h3>'
            + '<table class="pdt-table"><thead><tr><th>Décor</th><th>Jours</th><th>Scènes</th><th>Durée</th><th>Quand</th></tr></thead><tbody>'
            + noms.map(n => {
                // Un decor eclate sur des jours eloignes se voit : c'est
                // souvent la qu'on peut regrouper.
                const eclate = par[n].jours.length > 1;
                return '<tr><td>' + esc(n) + '</td>'
                     + '<td class="pdt-num">' + par[n].jours.length + '</td>'
                     + '<td class="pdt-num">' + par[n].scenes + '</td>'
                     + '<td class="pdt-duree">' + (par[n].min ? PlanningBoards._minutes(par[n].min) : '') + '</td>'
                     + '<td>' + esc(par[n].jours.join(', '))
                     + (eclate ? ' <span class="pdt-alerte" title="Ce décor revient sur plusieurs journées : regroupables ?">⚠</span>' : '')
                     + '</td></tr>';
              }).join('')
            + '</tbody></table></div>';
    },

    //  LES SCENES QUI NE SONT NULLE PART. C'est la question qu'on se pose en
    //  refermant un plan de travail : est-il COMPLET ? Un document qui ne dit
    //  pas ce qu'il oublie laisse croire que tout est place.
    scenesNonPlanifiees: () => {
        const placees = {};
        (state.data.shootingDays || []).forEach(j => {
            (j && j.scenes || []).forEach(ref => { if(ref && ref.sceneId) placees[ref.sceneId] = 1; });
        });
        const reste = (state.data.scenes || []).filter(s => s && !placees[s.id]);
        const total = (state.data.scenes || []).length;
        if(!total) return '';
        const esc = Utils.escape;
        if(!reste.length) {
            return '<div class="pdt-bloc pdt-complet">✅ Les ' + total + ' scènes du scénario sont placées.</div>';
        }
        const plur = reste.length > 1;
        // COMBIEN DE MINUTES RESTENT A CASER : « 12 scenes » ne dit pas s'il
        // faut deux jours ou huit. La duree, si.
        const min = reste.reduce((somme, sc) => somme + PlanningBoards._dureeDe(sc), 0);
        const moy = PlanningBoards.dureeMoyenne();
        const combien = min > 0
            ? ' <span class="pdt-reste">' + PlanningBoards._minutes(min)
              + (moy > 0 ? (() => {
                    // ARRONDI AU PLUS PROCHE, pas au superieur : 4 min a 3,5
                    // min/jour font « environ 1 jour », pas 2. Un plan de
                    // travail qu'on soupconne d'exagerer, on cesse de le lire.
                    const j = Math.max(1, Math.round(min / moy));
                    return ', soit environ ' + j + ' jour' + (j > 1 ? 's' : '') + ' de plus';
                  })() : '')
              + '</span>'
            : '';
        return '<div class="pdt-bloc pdt-manque"><h3 class="pdt-titre">⚠ ' + reste.length + ' scène'
            + (plur ? 's' : '') + ' sur ' + total + (plur ? ' ne sont pas encore placées' : ' n’est pas encore placée') + combien + '</h3>'
            + '<div class="pdt-scenes-libres">'
            + reste.map(sc => '<span class="pdt-scene" title="' + esc(sc.title || '') + '">'
                + esc(sc.number || '?') + '</span>').join(' ')
            + '</div></div>';
    },

    //  LE DEPOUILLEMENT COMPLET, JOUR PAR JOUR. Il est LONG — seize
    //  categories par journee — donc il se deplie : le plan de travail se lit
    //  d'abord d'un coup d'oeil, on ouvre le detail quand on prepare.
    //  MEME LECTURE QUE LA FEUILLE DE SERVICE, volontairement : deux
    //  lectures du meme depouillement finiraient par ne plus dire la meme
    //  chose.
    depouillementParJour: () => {
        const lignes = PlanningBoards.journees().filter(l => PlanningBoards._scenesDe(l.jour).length);
        if(!lignes.length) return '';
        const esc = Utils.escape;
        let html = '<div class="pdt-bloc" data-bloc="depouillement"><h3 class="pdt-titre">📋 Le dépouillement, jour par jour'
                 + PlanningBoards._btnImp('depouillement') + '</h3>';
        lignes.forEach(l => {
            const j = l.jour;
            let cats = {};
            PlanningBoards._scenesDe(j).forEach(sc => {
                Object.entries(sc.breakdown || {}).forEach(([cat, items]) => {
                    if(!Array.isArray(items) || !items.length) return;
                    if(!cats[cat]) cats[cat] = {};
                    items.forEach(it => { const t = Utils.bdText(it); if(t) cats[cat][t] = 1; });
                });
            });
            const noms = Object.keys(cats).sort();
            if(!noms.length) return;
            const titre = (l.numero ? 'J' + l.numero : Planning.getDayTypeInfo(j.dayType).icon)
                        + ' · ' + PlanningBoards._dateCourte(j.startDate || j.date);
            html += '<details class="pdt-jour"><summary>' + esc(titre)
                 + ' <span class="pdt-jour-compte">' + noms.length + ' catégorie' + (noms.length > 1 ? 's' : '') + '</span></summary>'
                 + '<div class="pdt-cats">'
                 + noms.map(cat => '<div class="pdt-cat"><strong>' + esc(Utils.catLabel(cat)) + '</strong><span>'
                     + esc(Object.keys(cats[cat]).join(', ')) + '</span></div>').join('')
                 + '</div></details>';
        });
        return html + '</div>';
    },

    //  LE RECAPITULATIF DE TETE, comme dans le modele AFAR : jours de
    //  tournage, preminutage, roles, figuration. Ce sont les chiffres qu'on
    //  recopie dans un devis — ils doivent etre justes et se lire d'un coup.
    //  ==================================================================
    //  LES PRESENCES (SW / W / WF / T) : UNE SEULE LECTURE POUR DEUX TABLEAUX
    //  ==================================================================
    //  Ces quatre questions — qui est la, quel code, combien de jours, quel
    //  personnage — vivaient DANS renderWorkPlan, donc elles n'existaient que
    //  pour la grille. Le modele AFAR met les colonnes de roles DANS le
    //  tableau des journees : il fallait que le tableau puisse les poser
    //  aussi. On les sort ici. Deux lectures du meme planning finiraient par
    //  ne plus dire la meme chose — et c'est le document qu'on cesse de
    //  croire.
    presences: (jours) => {
        const map = {};
        (state.data.actors || []).forEach(a => { map['actor_' + a.id] = { type: 'actor', person: a, days: {} }; });
        (state.data.crew || []).forEach(m => { map['crew_' + m.id] = { type: 'crew', person: m, days: {} }; });
        (jours || []).forEach((j, idx) => {
            ((j && j.callSheet) || []).forEach(call => {
                const k = call.type + '_' + call.personId;
                if(map[k]) map[k].days[idx] = { callTime: call.callTime, notes: call.notes };
            });
        });
        return map;
    },
    //  Le code d'une case. L'ordre compte : une retouche a la main (V, R, H)
    //  gagne toujours sur ce que deduit le planning.
    codeCase: (map, cle, idx) => {
        const over = (state.data.workplanOverrides || {})[cle + '_' + idx];
        if(over) return over;
        const data = map && map[cle];
        if(!data) return '';
        const jours = Object.keys(data.days).map(Number).sort((a, b) => a - b);
        if(!jours.length) return '';
        const premier = jours[0], dernier = jours[jours.length - 1];
        const present = data.days[idx] !== undefined;
        if(idx < premier || idx > dernier) return '';
        if(jours.length === 1 && present) return 'T';
        if(idx === premier) return 'SW';
        if(idx === dernier) return 'WF';
        return present ? 'W' : 'H';
    },
    joursTravailles: (map, cle) => (map && map[cle]) ? Object.keys(map[cle].days).length : 0,
    //  LE LIEN PERSONNAGE -> COMEDIEN S'ECRIT « actor_id », PAS « actorId ».
    //  Mesure en base : 22 personnages distribues, TOUS en actor_id, aucun en
    //  actorId — et 41 lectures en actor_id dans le reste du code contre une
    //  seule ici. Les colonnes de roles portaient donc le nom du comedien au
    //  lieu de celui du personnage, en silence, puisqu'il y a un repli.
    //  On lit les deux : l'ancienne orthographe ne coute rien et un import
    //  ancien peut encore la porter.
    persoDe: (actorId) => {
        const c = (state.data.characters || []).find(x => x &&
            ((x.actor_id && x.actor_id === actorId) || (x.actorId && x.actorId === actorId)));
        return c ? (c.name || '') : '';
    },
    //  LES COLONNES DE ROLES DU MODELE : les comediens d'abord, numerotes
    //  1..n comme sur la feuille, puis l'equipe. Le numero de la colonne est
    //  le numero du role : c'est lui qu'on dit au telephone.
    //  ==================================================================
    //  UNE LIGNE, UNE CROIX PAR BESOIN (v601)
    //  ==================================================================
    //  « Tu mets ressources a la suite, et tu coches quand il y a besoin de
    //  tel truc ou de tel individu. Comme ca tu lis UNE ligne et tu as tout
    //  sous les yeux. » C'est exactement le modele vertical de l'AFAR — qui
    //  aligne des rangees vehicules, animaux, figuration, equipements
    //  speciaux — remis dans le sens de l'horizontal.
    //  CE QUE CA CHANGE : le depouillement n'est plus un bloc a part qu'il
    //  faut deplier journee par journee. Il devient des COLONNES a cocher,
    //  lues sur la meme ligne que le decor, l'effet et les comediens. On voit
    //  d'un coup que la 2CV est prise J1 et J7, et qu'entre les deux elle
    //  dort.
    //  TOUTES LES CATEGORIES NE S'OUVRENT PAS D'OFFICE : deux cents
    //  accessoires feraient deux cents colonnes et un document illisible. Les
    //  lourdes — celles qui decident de l'ordre des jours — sont ouvertes ;
    //  les autres s'ouvrent au clic, et leur nombre d'elements est annonce
    //  AVANT d'ouvrir.
    GROUPES_RESSOURCES: [
        { cle: 'DECORS', label: 'Décors', icone: '\u{1F3E0}', ouvert: true },
        { cle: 'VEHICULES', icone: '\u{1F697}', ouvert: true },
        { cle: 'ANIMAUX', icone: '\u{1F415}', ouvert: true },
        { cle: 'FIGURATION', icone: '\u{1F465}', ouvert: true },
        { cle: 'EFFETS SPECIAUX (SFX)', icone: '\u{1F4A5}', ouvert: true },
        { cle: 'EFFETS VISUELS (VFX)', icone: '\u{1F5A5}', ouvert: true },
        { cle: 'ACCESSOIRES', icone: '\u{1F392}' },
        { cle: 'COSTUMES', icone: '\u{1F457}' },
        { cle: 'MAQUILLAGE-COIFFURE', icone: '\u{1F484}' },
        { cle: 'LUMIERE', icone: '\u{1F4A1}' },
        { cle: 'MACHINERIE', icone: '\u2699\uFE0F' },
        { cle: 'SON-MUSIQUE', icone: '\u{1F3B5}' },
        { cle: 'LOGISTIQUE', icone: '\u{1F4E6}' }
    ],
    _labelGroupe: (g) => g.label || Utils.catLabel(g.cle),
    //  LE DECOR SE LIT PAR LA MEME PORTE QUE LA COLONNE « DÉCORS » : la fiche
    //  de lieu si elle existe, sinon l'en-tete de scene. La categorie de
    //  depouillement « DECORS-LIEUX » est volontairement ecartee, sinon le
    //  meme decor apparaitrait deux fois sous deux orthographes.
    ressourcesParJour: () => PlanningBoards.journees().map(l => {
        const out = {};
        const pose = (cle, txt) => { if(!txt) return; (out[cle] = out[cle] || {})[txt] = 1; };
        PlanningBoards._scenesDe(l.jour).forEach(sc => {
            pose('DECORS', PlanningBoards._decorDe(sc));
            PlanningBoards.GROUPES_RESSOURCES.forEach(g => {
                if(g.cle === 'DECORS') return;
                ((sc.breakdown || {})[g.cle] || []).forEach(it => pose(g.cle, Utils.bdText(it)));
            });
        });
        return out;
    }),
    //  L'inventaire : chaque ressource et le NOMBRE DE JOURS ou elle est
    //  prise. C'est ce chiffre qui se loue, se paie et se rend.
    inventaireRessources: () => {
        const inv = {};
        PlanningBoards.ressourcesParJour().forEach(jour => {
            Object.keys(jour).forEach(cle => {
                inv[cle] = inv[cle] || {};
                Object.keys(jour[cle]).forEach(n => { inv[cle][n] = (inv[cle][n] || 0) + 1; });
            });
        });
        return inv;
    },
    groupesOuverts: null,
    _ouverts: () => {
        if(!PlanningBoards.groupesOuverts) {
            const o = {};
            PlanningBoards.GROUPES_RESSOURCES.forEach(g => { o[g.cle] = !!g.ouvert; });
            PlanningBoards.groupesOuverts = o;
        }
        return PlanningBoards.groupesOuverts;
    },
    basculerGroupe: (cle) => {
        const o = PlanningBoards._ouverts();
        o[cle] = !o[cle];
        PlanningBoards.renderWorkPlan();
    },
    //  Les boutons : on annonce combien d'elements AVANT d'ouvrir, pour que
    //  personne ne se retrouve avec quatre-vingts colonnes par surprise.
    barreRessources: () => {
        const inv = PlanningBoards.inventaireRessources();
        const ouverts = PlanningBoards._ouverts();
        const dispo = PlanningBoards.GROUPES_RESSOURCES.filter(g => Object.keys(inv[g.cle] || {}).length);
        if(!dispo.length) return '';
        return '<div class="pdt-ressources-barre"><span class="pdt-ressources-titre">Colonnes à cocher :</span>'
            + dispo.map(g => {
                const n = Object.keys(inv[g.cle]).length;
                return '<button type="button" class="pdt-res-btn' + (ouverts[g.cle] ? ' est-on' : '') + '"'
                     + ' onclick="app.PlanningBoards.basculerGroupe(\'' + g.cle.split("'").join("\\'") + '\')"'
                     + ' title="' + Utils.escape(Object.keys(inv[g.cle]).slice(0, 12).join(', ')) + '">'
                     + g.icone + ' ' + Utils.escape(PlanningBoards._labelGroupe(g))
                     + ' <b>' + n + '</b></button>';
              }).join('')
            + '</div>';
    },
    //  TOUTES LES COLONNES DU TABLEAU, dans l'ordre du document : les roles,
    //  l'equipe, puis les ressources cochables. Une seule liste, pour que
    //  l'en-tete, le recapitulatif et les lignes ne puissent pas diverger.
    colonnesTableau: () => {
        const cols = PlanningBoards.colonnesRoles().map(r => Object.assign({}, r, {
            kind: 'presence',
            groupe: r.groupe === 'actor' ? '\u{1F3AD} RÔLES' : '\u{1F3A5} ÉQUIPE',
            classe: r.groupe === 'actor' ? 'pdt-grp-com' : 'pdt-grp-tec'
        }));
        const inv = PlanningBoards.inventaireRessources();
        const ouverts = PlanningBoards._ouverts();
        PlanningBoards.GROUPES_RESSOURCES.forEach(g => {
            if(!ouverts[g.cle]) return;
            Object.keys(inv[g.cle] || {}).sort((a, b) => String(a).localeCompare(String(b), 'fr'))
                .forEach((n, i) => cols.push({
                    cle: 'res:' + g.cle + ':' + n, num: i + 1, kind: 'res', cat: g.cle, res: n,
                    titre: n, nom: PlanningBoards._labelGroupe(g),
                    groupe: g.icone + ' ' + PlanningBoards._labelGroupe(g), classe: 'pdt-grp-res'
                }));
        });
        return cols;
    },

    colonnesRoles: () => {
        const out = [];
        (state.data.actors || []).forEach((a, i) => out.push({
            cle: 'actor_' + a.id, num: i + 1, groupe: 'actor',
            titre: PlanningBoards.persoDe(a.id) || a.name || 'Sans nom',
            nom: a.name || 'Sans nom'
        }));
        (state.data.crew || []).forEach((m, i) => out.push({
            cle: 'crew_' + m.id, num: i + 1, groupe: 'crew',
            titre: m.role || m.name || 'Sans nom',
            nom: m.name || 'Sans nom'
        }));
        return out;
    },

    recapitulatif: () => {
        const lignes = PlanningBoards.journees();
        const plateau = lignes.filter(l => l.plateau);
        const total = plateau.reduce((s, l) => s + PlanningBoards.dureeJour(l.jour), 0);
        // Les roles, ce sont les PERSONNAGES du scenario ; la figuration se
        // compte sur le depouillement, la ou elle est ecrite.
        const roles = (state.data.characters || []).length;
        const figu = {};
        (state.data.scenes || []).forEach(sc => {
            ((sc.breakdown || {})['FIGURATION'] || []).forEach(it => {
                const t = Utils.bdText(it); if(t) figu[t] = 1;
            });
        });
        const nFigu = Object.keys(figu).length;
        const cases = [
            { lbl: 'Jours de tournage', val: plateau.length },
            { lbl: 'Préminutage', val: PlanningBoards._hms(total) },
            { lbl: 'Rôles', val: roles },
            { lbl: 'Figuration', val: nFigu ? nFigu + ' mention' + (nFigu > 1 ? 's' : '') : '—' }
        ];
        return '<div class="pdt-recap">'
            + cases.map(c => '<div class="pdt-recap-case"><span>' + Utils.escape(c.lbl) + '</span><strong>'
                + Utils.escape(String(c.val)) + '</strong></div>').join('')
            + '</div>';
    },

    //  Le tableau des journees. C'est le coeur du document.
    _dateCourte: (d) => {
        try {
            const x = new Date(String(d) + 'T12:00:00');
            if(isNaN(x.getTime())) return String(d || '');
            return x.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        } catch(e) { return String(d || ''); }
    },
    tableauJournees: () => {
        const lignes = PlanningBoards.journees();
        if(!lignes.length) return '';
        const esc = Utils.escape;
        const moyenne = PlanningBoards.dureeMoyenne();
        const premiere = (lignes.find(l => l.plateau) || {}).jour;
        const dateDepart = premiere ? (premiere.startDate || premiere.date) : '';
        let total = 0;
        // LA FORME DU MODELE AFAR : UN SEUL TABLEAU, PAS DEUX. Les colonnes
        // de roles (1, 2, 3...) ne sont pas un seconde tableau a cote : elles
        // sont DANS celui des journees, a droite des decors et des sequences.
        // C'est tout l'interet du document — on lit sur UNE ligne que le J12
        // est en exterieur nuit au chateau AVEC les roles 1, 4 et 7. Deux
        // tableaux separes obligent a faire la jointure de tete, et c'est la
        // qu'on se trompe.
        const roles = PlanningBoards.colonnesTableau();
        const presences = PlanningBoards.presences(lignes.map(l => l.jour));
        const resJour = PlanningBoards.ressourcesParJour();
        const inv = PlanningBoards.inventaireRessources();
        // LES DOUZE COLONNES DE GAUCHE RESTENT, « À préparer » compris : ce
        // n'est pas la meme chose que les croix. Les croix NOMMENT (la 2CV, le
        // chien) et se ferment ; « À préparer » COMPTE (1 véhicule, 1 animal)
        // et reste la quand on referme tout.
        const GAUCHE = 12;
        // Les familles, fusionnees en bandeaux : on parcourt les colonnes une
        // fois et on regroupe les voisines de meme famille. Compter chaque
        // famille a part ferait un deuxieme decompte a maintenir.
        const familles = [];
        roles.forEach(r => {
            const d = familles[familles.length - 1];
            if(d && d.groupe === r.groupe) d.n++;
            else familles.push({ groupe: r.groupe, classe: r.classe, n: 1 });
        });
        let html = '<div class="pdt-bloc" data-bloc="journees"><h3 class="pdt-titre">📆 Plan de travail — journées (modèle horizontal)'
                 + PlanningBoards._btnImp('journees') + '</h3>'
                 + PlanningBoards.barreRessources()
                 + '<div class="pdt-large"><table class="pdt-table pdt-feuille"><thead>'
                 // Premiere bande : le cartouche du document a gauche, les
                 // familles de colonnes a droite.
                 + '<tr><th class="pdt-ent" colspan="' + GAUCHE + '" rowspan="2">'
                 + '<span class="pdt-ent-titre">PLAN DE TRAVAIL</span>'
                 + '<span class="pdt-ent-ligne">' + esc(state.data.title || 'Sans titre') + '</span>'
                 + '<span class="pdt-ent-ligne">Édité le ' + esc(new Date().toLocaleDateString('fr-FR')) + '</span>'
                 + '</th>'
                 + familles.map(f => '<th class="pdt-grp ' + f.classe + '" colspan="' + f.n + '">'
                       + esc(f.groupe) + '</th>').join('')
                 + '</tr>'
                 // Deuxieme bande : les noms, a la verticale comme sur la
                 // feuille — sinon quinze colonnes font trois metres de large.
                 + '<tr>'
                 + roles.map(r => '<th class="pdt-nom" title="' + esc(r.titre + ' — ' + r.nom) + '">'
                       + '<span>' + esc(r.titre) + '</span></th>').join('')
                 + '</tr>'
                 // Troisieme bande : les colonnes du modele AFAR horizontal,
                 // dans son ordre : JT · S · M · DATES · DÉCORS · SÉQUENCES ·
                 // I/E · EFFET · HORAIRES · MIN. On y ajoute ce que
                 // l'application sait et que le tableur ne savait pas : les
                 // personnages nommes et ce qu'il faut preparer.
                 + '<tr>'
                 + '<th title="Jour de tournage">JT</th><th title="Semaine de tournage">S</th>'
                 + '<th title="Mois">M</th><th>Dates</th><th>Décors</th>'
                 + '<th title="Séquences">Séq.</th><th title="Intérieur / Extérieur">I/E</th>'
                 + '<th title="Jour / Nuit">Effet</th><th title="Convocation équipe">Horaires</th>'
                 + '<th title="Préminutage de la journée">Min</th>'
                 + '<th>Personnages</th><th>À préparer</th>'
                 + roles.map(r => '<th class="pdt-rnum" title="' + esc(r.titre + ' \u2014 ' + r.nom) + '">'
                       + (r.kind === 'res' ? '\u00b7' : r.num) + '</th>').join('')
                 + '</tr></thead><tbody>'
                 // LE RECAPITULATIF DU MODELE : combien de jours chacun.
                 // C'est le chiffre qui part dans les contrats, et il se lit
                 // au-dessus de la colonne a laquelle il se rapporte.
                 + (roles.length
                     ? '<tr class="pdt-ligne-recap"><td colspan="' + GAUCHE + '">RÉCAPITULATIF — nombre de jours</td>'
                       + roles.map(r => '<td class="pdt-rtot">'
                           + (r.kind === 'res' ? ((inv[r.cat] || {})[r.res] || 0)
                                               : PlanningBoards.joursTravailles(presences, r.cle))
                           + '</td>').join('')
                       + '</tr>'
                     : '');
        lignes.forEach((l, iJour) => {
            const j = l.jour;
            const scenes = PlanningBoards._scenesDe(j);
            const decors = [];
            scenes.forEach(sc => { const d = PlanningBoards._decorDe(sc); if(d && decors.indexOf(d) < 0) decors.push(d); });
            const effets = [];
            scenes.forEach(sc => { const e = PlanningBoards._effetDe(sc); if(e && effets.indexOf(e) < 0) effets.push(e); });
            const persos = PlanningBoards._personnagesDe(j);
            const lourds = PlanningBoards.pointsLourds(j);
            const typeInfo = Planning.getDayTypeInfo(j.dayType);
            // UN JOUR AVEC TROIS DECORS EST UN SIGNAL, pas un detail : c'est
            // une journee a deplacements, celle qui deborde.
            const alerteDecors = decors.length > 2;
            const dJour = j.startDate || j.date;
            html += '<tr class="' + (l.plateau ? 'pdt-plateau' : 'pdt-hors') + '">'
                + '<td class="pdt-num">' + (l.numero ? l.numero : ('<span title="' + esc(typeInfo.label) + '">' + typeInfo.icon + '</span>')) + '</td>'
                + '<td class="pdt-num pdt-fin">' + esc(String(PlanningBoards._semaineDe(dJour, dateDepart))) + '</td>'
                + '<td class="pdt-num pdt-fin">' + esc(PlanningBoards._moisDe(dJour)) + '</td>'
                + '<td class="pdt-date">' + esc(PlanningBoards._dateCourte(dJour)) + '</td>'
                + '<td>' + (decors.length ? esc(decors.join(' · ')) + (alerteDecors ? ' <span class="pdt-alerte" title="Trois décors ou plus dans la journée : prévoyez les déplacements">⚠</span>' : '')
                                          : '<span class="pdt-vide">' + esc(j.name || typeInfo.label) + '</span>') + '</td>'
                + '<td>' + (scenes.length
                      ? scenes.map(sc => '<span class="pdt-scene" title="' + esc(sc.title || '') + '">' + esc(sc.number || '?') + '</span>').join(' ')
                      : '') + '</td>'
                + '<td class="pdt-fin">' + esc([...new Set(scenes.map(sc => sc && sc.intExt).filter(Boolean))].join('/')) + '</td>'
                + '<td class="pdt-fin">' + esc([...new Set(scenes.map(sc => sc && sc.dayNight).filter(Boolean))].join('/')) + '</td>'
                + '<td class="pdt-fin">' + esc(j.crewCall || '') + '</td>'
                + (() => {
                    const d = PlanningBoards.dureeJour(j);
                    total += d;
                    if(!d) return '<td class="pdt-duree"></td>';
                    // LOURDE PAR RAPPORT A CE TOURNAGE-CI, pas a un chiffre
                    // que j'aurais choisi : une serie tourne huit minutes par
                    // jour, un long-metrage deux.
                    const lourde = moyenne > 0 && d > moyenne * PlanningBoards.SEUIL_LOURD;
                    const info = lourde
                        ? ' title="' + esc(Math.round(d / moyenne * 10) / 10 + '× la moyenne de ce tournage (' + PlanningBoards._minutes(moyenne) + ' par jour)') + '"'
                        : '';
                    return '<td class="pdt-duree' + (lourde ? ' est-lourde' : '') + '"' + info + '>'
                         + PlanningBoards._hms(d) + (lourde ? ' ⚠' : '') + '</td>';
                  })()
                + '<td class="pdt-persos">' + esc(persos.join(', ')) + '</td>'
                + '<td class="pdt-lourds">' + lourds.map(x => '<span class="pdt-lourd" title="' + esc(x.quoi.join(', ')) + '">' + x.icone + ' ' + x.n + ' ' + esc(x.mot) + '</span>').join(' ') + '</td>'
                // Les cases de presence, sur la MEME ligne que la journee.
                // Une case sans code reste cliquable : c'est la qu'on pose a
                // la main un voyage ou un repos, comme dans l'ancienne grille.
                + roles.map(r => {
                    // UNE CROIX, ET RIEN D'AUTRE : la question posee est
                    // « en a-t-on besoin ce jour-la ? ». Un nombre ferait
                    // croire a une quantite que le depouillement ne dit pas.
                    if(r.kind === 'res') {
                        const pris = !!((resJour[iJour] || {})[r.cat] || {})[r.res];
                        return '<td class="pdt-case pdt-croix' + (pris ? ' est-pris' : '') + '" title="'
                             + esc(r.res + ' \u2014 ' + r.nom) + '">' + (pris ? '\u2715' : '') + '</td>';
                    }
                    const code = PlanningBoards.codeCase(presences, r.cle, iJour);
                    const fixe = ['T', 'SW', 'W', 'WF'].indexOf(code) >= 0;
                    return '<td class="pdt-case ' + (code ? 'workplan-bar-' + code : 'workplan-bar-empty') + '"'
                         + (fixe ? '' : ' style="cursor:pointer" onclick="app.Planning.openWorkplanMenu(event, \'' + r.cle + '\', ' + iJour + ')"')
                         + ' title="' + esc(r.titre + ' — ' + r.nom) + '">' + code + '</td>';
                  }).join('')
            + '</tr>';
        });
        const nPlateau = lignes.filter(l => l.plateau).length;
        const nAutres = lignes.length - nPlateau;
        html += '</tbody></table></div>'
             + (roles.length ? '<div class="pdt-legende">'
                  + [['SW', 'Début'], ['W', 'Travaille'], ['WF', 'Fin'], ['T', '1 seul jour'], ['H', 'Retenue'], ['R', 'Repos'], ['V', 'Voyage']]
                      .map(x => '<span class="pdt-leg"><i class="workplan-bar-' + x[0] + '">' + x[0] + '</i> ' + x[1] + '</span>').join('')
                  + '</div>' : '')
             + (total > 0 ? '<div class="pdt-note">Préminutage placé : <strong>' + PlanningBoards._hms(total)
                  + '</strong> — soit ' + PlanningBoards._hms(moyenne)
                  + ' par jour de tournage en moyenne.</div>' : '')
             + '<div class="pdt-note">' + nPlateau + ' jour' + (nPlateau > 1 ? 's' : '') + ' de tournage'
             + (nAutres ? ' · ' + nAutres + ' autre' + (nAutres > 1 ? 's journées' : ' journée') + ' (repérage, essais, probable…), sans numéro : seuls les jours de plateau se comptent.' : '')
             + '</div></div>';
        return html;
    },

    //  ==================================================================
    //  IMPRIMER CHAQUE TABLEAU A PART (v601)
    //  ==================================================================
    //  Un plan de travail ne se distribue pas d'un bloc : le regisseur veut le
    //  recap des decors, la production le tableau des journees, la
    //  comptabilite les presences. Chaque tableau porte donc son imprimante.
    //  ET LE PAPIER SUIT LE TABLEAU, pas l'inverse. Une A4 paysage fait
    //  environ 1040 points utiles, une A3 paysage environ 1500. Un tableau de
    //  quarante colonnes sorti sur A4 donne des caracteres de deux
    //  millimetres : illisible, donc inutile, donc jete. On choisit le format
    //  avant d'imprimer, et on le DIT.
    TABLEAUX: [
        { cle: 'journees',      titre: 'Plan de travail — journées' },
        { cle: 'decors',        titre: 'Par décor' },
        { cle: 'depouillement', titre: 'Le dépouillement, jour par jour' },
        { cle: 'presences',     titre: 'Plan de travail — présences' }
    ],
    A4_PAYSAGE: 1040,
    A3_PAYSAGE: 1500,
    _btnImp: (cle) => ' <button type="button" class="pdt-imp-btn" title="Imprimer ce tableau seul"'
        + ' onclick="app.PlanningBoards.imprimerBloc(\'' + cle + '\')">\U0001F5A8️</button>',
    //  LA LARGEUR NATURELLE DU TABLEAU, celle qu'il prendrait si rien ne le
    //  contraignait. C'est la seule qui dise quelque chose sur le papier.
    //  PIEGE PAYE : mesurer le tableau TEL QU'IL EST AFFICHE repond la largeur
    //  de l'ECRAN pour tout tableau en width:100%. « Par décor » — cinq
    //  colonnes courtes — etait annonce trop large pour une A4 parce que la
    //  fenetre faisait 1200 points. Il tient sur un demi-A5.
    //  On mesure donc une COPIE posee de cote, en largeur libre.
    largeurBloc: (el) => {
        if(!el) return 0;
        const t = el.querySelector('table');
        if(!t) return Math.round(el.scrollWidth || 0);
        let banc = null;
        try {
            banc = document.createElement('div');
            banc.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;width:max-content;';
            const copie = t.cloneNode(true);
            copie.style.width = 'max-content';
            banc.appendChild(copie);
            document.body.appendChild(banc);
            const l = Math.round(Math.max(copie.scrollWidth || 0, copie.offsetWidth || 0));
            // Une mesure a zero veut dire qu'on n'a rien mesure : on retombe
            // sur la largeur affichee plutot que de conclure « ca tient ».
            return l > 0 ? l : Math.round(Math.max(t.scrollWidth || 0, t.offsetWidth || 0));
        } catch(e) {
            return Math.round(Math.max(t.scrollWidth || 0, t.offsetWidth || 0));
        } finally {
            if(banc && banc.parentNode) banc.parentNode.removeChild(banc);
        }
    },
    formatPour: (largeur) => {
        if(!largeur || largeur <= PlanningBoards.A4_PAYSAGE) return { papier: 'A4', zoom: 1 };
        if(largeur <= PlanningBoards.A3_PAYSAGE) return { papier: 'A3', zoom: 1 };
        // Au-dela de l'A3, on reduit plutot que de couper : un tableau coupe
        // en deux feuilles sans repetition des noms ne se lit plus du tout.
        return { papier: 'A3', zoom: Math.max(0.45, PlanningBoards.A3_PAYSAGE / largeur) };
    },
    _blocDOM: (cle) => document.querySelector('#workplanContent [data-bloc="' + cle + '"]'),
    //  Les tableaux qui ne tiennent pas sur une A4 paysage, avec le papier
    //  qu'il leur faudrait. C'est ce qu'on montre avant « tout imprimer ».
    tableauxLarges: () => {
        const out = [];
        PlanningBoards.TABLEAUX.forEach(t => {
            const el = PlanningBoards._blocDOM(t.cle);
            if(!el) return;
            const l = PlanningBoards.largeurBloc(el);
            if(l > PlanningBoards.A4_PAYSAGE) {
                out.push({ cle: t.cle, titre: t.titre, largeur: l, papier: PlanningBoards.formatPour(l).papier });
            }
        });
        return out;
    },
    //  LA FEUILLE BLANCHE. L'application est sombre ; le papier ne l'est pas.
    //  Cette feuille de style est la SEULE de l'impression : l'ancienne ne
    //  connaissait que la grille des presences, donc les tableaux ajoutes
    //  depuis sortaient sans bordure et sans fond.
    _cssImpression: (papier, zoom) => `
        @page { size: ${papier} landscape; margin: 8mm; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #fff; color: #111;
               zoom: ${zoom}; }
        h3, .pdt-titre { font-size: 12px; margin: 0 0 6px; }
        .pdt-imp-btn, .pdt-ressources-barre, .workplan-actions, .pdt-large { display: block; }
        .pdt-imp-btn, .pdt-ressources-barre, .workplan-actions { display: none !important; }
        .pdt-large { overflow: visible !important; border: none !important; }
        .workplan-header-box { border: 2px solid #333; padding: 10px; margin-bottom: 12px;
            display: flex; justify-content: space-between; }
        .workplan-header-title { font-size: 15px; font-weight: bold; }
        .workplan-header-subtitle, .workplan-header-info, .workplan-header-version { font-size: 9px; color: #444; }
        .pdt-recap { display: flex; gap: 8px; margin-bottom: 10px; }
        .pdt-recap-case { flex: 1; border: 1px solid #999; padding: 5px 8px; }
        .pdt-recap-case span { display: block; font-size: 7px; text-transform: uppercase; color: #555; }
        .pdt-recap-case strong { font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 8px; page-break-inside: auto; }
        th, td { border: 1px solid #999; padding: 2px 3px; vertical-align: top; }
        thead th { background: #eee; font-weight: 700; text-align: left; }
        tr { page-break-inside: avoid; }
        .pdt-num, .pdt-fin, .pdt-rnum, .pdt-rtot, .pdt-case, .workplan-col-day { text-align: center; }
        .pdt-duree { text-align: right; }
        .pdt-ent { text-align: left; }
        .pdt-ent-titre { display: block; font-size: 11px; font-weight: 700; letter-spacing: 1px; }
        .pdt-ent-ligne { display: block; font-size: 8px; color: #555; }
        .pdt-grp { text-align: center; font-weight: 700; background: #ddd; }
        .pdt-nom > span, .wp-vert { writing-mode: vertical-rl; transform: rotate(180deg);
            display: inline-block; max-height: 110px; overflow: hidden; white-space: nowrap; font-size: 7px; }
        .pdt-ligne-recap td { background: #eee; font-weight: 700; text-align: right; }
        .pdt-croix.est-pris { background: #d8ecd8; font-weight: 700; }
        .pdt-scene { border: 1px solid #999; padding: 0 3px; font-weight: 700; }
        .pdt-lourd { border: 1px solid #b26a00; color: #b26a00; padding: 0 3px; margin: 1px; display: inline-block; }
        .pdt-hors td, .wp-hors { color: #666; font-style: italic; }
        .pdt-alerte { color: #b26a00; }
        .pdt-note, .pdt-legende, .workplan-legend { font-size: 8px; color: #444; margin-top: 5px;
            display: flex; gap: 10px; flex-wrap: wrap; }
        .pdt-note { display: block; }
        .pdt-leg i, .workplan-legend-box { display: inline-block; font-style: normal; font-weight: 700;
            padding: 0 4px; color: #fff; }
        .wp-bande-lbl { text-align: right; font-size: 7px; text-transform: uppercase; background: #eee; }
        .wp-bande-case { font-size: 7px; text-align: center; }
        .workplan-section-row td { background: #d5d5d5; font-weight: 700; text-align: left; }
        .workplan-cell-role, .workplan-cell-actor, .workplan-col-role, .workplan-col-actor { text-align: left; }
        .workplan-bar-T, .workplan-bar-SW, .workplan-bar-W, .workplan-bar-WF,
        .pdt-leg i.workplan-bar-T, .pdt-leg i.workplan-bar-SW,
        .pdt-leg i.workplan-bar-W, .pdt-leg i.workplan-bar-WF { background: #c0392b; color: #fff; font-weight: 700; }
        .workplan-bar-H, .pdt-leg i.workplan-bar-H { background: #f39c12; color: #fff; }
        .workplan-bar-R, .pdt-leg i.workplan-bar-R { background: #3498db; color: #fff; }
        .workplan-bar-V, .pdt-leg i.workplan-bar-V { background: #9b59b6; color: #fff; }
        .pdt-bloc { margin-bottom: 14px; page-break-inside: auto; }
        .pdt-complet, .pdt-manque { border: 1px solid #999; padding: 7px 9px; font-size: 9px; }
        details { border: 1px solid #999; margin-bottom: 3px; padding: 3px 6px; font-size: 8px; }
        .pdt-cat { display: flex; gap: 8px; }
        .pdt-cat strong { flex: 0 0 30%; }
    `,
    //  Une fenetre, une feuille de style, un appel a l'imprimante. Le detail
    //  du depouillement est DEPLIE a l'impression : un « ▶ » ferme sur du
    //  papier ne s'ouvre jamais.
    _fenetreImpression: (titre, contenu, papier, zoom) => {
        const f = window.open('', '_blank');
        if(!f) { Utils.toast('Le navigateur a bloqué la fenêtre d’impression', 'warning'); return; }
        f.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'
            + Utils.escape(titre) + ' — ' + Utils.escape(state.data.title || 'Film') + '</title>'
            + '<style>' + PlanningBoards._cssImpression(papier, zoom) + '</style></head><body>'
            + contenu + '</body></html>');
        f.document.close();
        try { f.document.querySelectorAll('details').forEach(d => { d.open = true; }); } catch(e) {}
        f.focus();
        f.print();
    },
    imprimerBloc: (cle) => {
        const src = PlanningBoards._blocDOM(cle);
        if(!src) { Utils.toast('Ce tableau n’est pas affiché', 'warning'); return; }
        const f = PlanningBoards.formatPour(PlanningBoards.largeurBloc(src));
        const t = (PlanningBoards.TABLEAUX.find(x => x.cle === cle) || {}).titre || 'Plan de travail';
        PlanningBoards._fenetreImpression(t, src.outerHTML, f.papier, f.zoom);
    },

    //  ON PREVIENT AVANT D'IMPRIMER, PAS APRES. « Tout imprimer » sur un plan
    //  de travail de quarante colonnes donne des caracteres de deux
    //  millimetres : le document part a la poubelle et on recommence. La
    //  fenetre dit lesquels debordent, de combien, et propose de les sortir a
    //  part sur du papier plus grand.
    _avert: null,
    _fermerAvert: () => {
        if(PlanningBoards._avert) { PlanningBoards._avert.remove(); PlanningBoards._avert = null; }
    },
    imprimerTout: () => {
        const larges = PlanningBoards.tableauxLarges();
        if(!larges.length) { PlanningBoards._imprimerTout([]); return; }
        const esc = Utils.escape;
        const plur = larges.length > 1;
        PlanningBoards._fermerAvert();
        const o = document.createElement('div');
        o.className = 'modal-overlay';
        o.style.display = 'flex';
        o.innerHTML = '<div class="modal-box pdt-avert-box">'
            + '<h3 class="pdt-avert-titre">\U0001F5A8️ ' + larges.length + ' tableau' + (plur ? 'x' : '')
            + ' trop large' + (plur ? 's' : '') + ' pour une feuille A4</h3>'
            + '<p class="pdt-avert-txt">Sur une A4 paysage, ' + (plur ? 'ils seront réduits' : 'il sera réduit')
            + ' au point de ne plus se lire. Le mieux : ' + (plur ? 'les sortir' : 'le sortir')
            + ' à part, sur du papier plus grand.</p>'
            + '<div class="pdt-avert-liste">'
            + larges.map(t => '<button type="button" class="pdt-avert-item" onclick="app.PlanningBoards.imprimerBloc(\''
                  + t.cle + '\')">\U0001F5A8️ ' + esc(t.titre)
                  + '<span>' + t.largeur + ' px → ' + t.papier + ' paysage</span></button>').join('')
            + '</div>'
            + '<div class="pdt-avert-actions">'
            + '<button type="button" class="pdt-avert-btn" onclick="app.PlanningBoards._sansLarges()">Imprimer les autres seulement</button>'
            + '<button type="button" class="pdt-avert-btn est-principal" onclick="app.PlanningBoards._toutQuandMeme()">Tout imprimer quand même</button>'
            + '<button type="button" class="pdt-avert-btn" onclick="app.PlanningBoards._fermerAvert()">Fermer</button>'
            + '</div></div>';
        document.body.appendChild(o);
        PlanningBoards._avert = o;
        o.onclick = (e) => { if(e.target === o) PlanningBoards._fermerAvert(); };
    },
    _toutQuandMeme: () => { PlanningBoards._fermerAvert(); PlanningBoards._imprimerTout([]); },
    _sansLarges: () => {
        const exclure = PlanningBoards.tableauxLarges().map(t => t.cle);
        PlanningBoards._fermerAvert();
        PlanningBoards._imprimerTout(exclure);
    },
    //  LE PAPIER SUIT LE PLUS LARGE DES TABLEAUX RETENUS : une seule feuille
    //  de style pour un document, donc un seul format.
    _imprimerTout: (exclure) => {
        const zone = document.getElementById('workplanContent');
        if(!zone) { Utils.toast('Le plan de travail n’est pas affiché', 'warning'); return; }
        const horsJeu = exclure || [];
        const copie = zone.cloneNode(true);
        horsJeu.forEach(cle => {
            const el = copie.querySelector('[data-bloc="' + cle + '"]');
            if(el) el.remove();
        });
        let max = 0;
        PlanningBoards.TABLEAUX.forEach(t => {
            if(horsJeu.indexOf(t.cle) >= 0) return;
            const el = PlanningBoards._blocDOM(t.cle);
            if(el) max = Math.max(max, PlanningBoards.largeurBloc(el));
        });
        const f = PlanningBoards.formatPour(max);
        PlanningBoards._fenetreImpression('Plan de travail', copie.innerHTML, f.papier, f.zoom);
    },

    //  ==================================================================
    //  LE PLAN DE TRAVAIL DANS LE HUB D'EXPORT (v601)
    //  ==================================================================
    //  Le hub sort des PDF, pas des fenetres d'impression : c'est la que les
    //  gens fabriquent le dossier de production. Le plan de travail y entre
    //  donc comme les autres sections, avec le choix des tableaux.
    //  LES FAITS VIENNENT DES MEMES PORTES QUE L'ECRAN (journees,
    //  _scenesDe, _decorDe, colonnesTableau, codeCase...) : seule la MISE EN
    //  PAGE est ecrite deux fois. Recalculer les chiffres ici, c'est la
    //  garantie qu'un jour le papier et l'ecran ne diront plus la meme chose.
    //  LE PAPIER EST CHOISI PAR LE TABLEAU, comme a l'impression : A4 paysage
    //  tant que ca tient, A3 paysage ensuite. Et quand meme l'A3 ne suffit
    //  pas, ON COUPE EN PAQUETS DE COLONNES en REPETANT les colonnes
    //  d'identite : un tableau coupe sans ses noms ne se lit plus.
    _modeleJournees: () => {
        const lignes = PlanningBoards.journees();
        const colonnes = PlanningBoards.colonnesTableau();
        const pres = PlanningBoards.presences(lignes.map(l => l.jour));
        const resJour = PlanningBoards.ressourcesParJour();
        const premiere = (lignes.find(l => l.plateau) || {}).jour;
        const depart = premiere ? (premiere.startDate || premiere.date) : '';
        const cols = [
            { t: 'JT', w: 7 }, { t: 'S', w: 6 }, { t: 'M', w: 11 }, { t: 'Dates', w: 20 },
            { t: 'Décors', w: 34, g: 1 }, { t: 'Séq.', w: 20, g: 1 }, { t: 'I/E', w: 8 },
            { t: 'Effet', w: 9 }, { t: 'Horaires', w: 14 }, { t: 'Min', w: 16 },
            { t: 'Personnages', w: 34, g: 1 }
        // UNE COLONNE DE 7 MM NE PORTE PAS UN NOM : « ROLE1 » a « ROLE12 »
        // sortaient tous « ROL », douze colonnes identiques. Le modele AFAR
        // fait exactement l'inverse — la colonne porte SON NUMERO, et une
        // legende dit qui est qui. C'est le numero qu'on se dit au telephone.
        ].concat(colonnes.map((c, i) => ({ t: String(i + 1), w: 7 })));
        const legende = colonnes.map((c, i) => (i + 1) + ' · ' + c.titre
            + (c.kind === 'res' ? '' : (c.nom && c.nom !== c.titre ? ' (' + c.nom + ')' : '')));
        const rangs = lignes.map((l, i) => {
            const j = l.jour;
            const scenes = PlanningBoards._scenesDe(j);
            const decors = [];
            scenes.forEach(sc => { const d = PlanningBoards._decorDe(sc); if(d && decors.indexOf(d) < 0) decors.push(d); });
            const dJour = j.startDate || j.date;
            const d = PlanningBoards.dureeJour(j);
            const type = Planning.getDayTypeInfo(j.dayType);
            return [
                l.numero ? String(l.numero) : '·',
                String(PlanningBoards._semaineDe(dJour, depart) || ''),
                PlanningBoards._moisDe(dJour),
                PlanningBoards._dateCourte(dJour),
                decors.length ? decors.join(' · ') : (j.name || type.label),
                scenes.map(sc => sc.number || '?').join(' '),
                [...new Set(scenes.map(sc => sc && sc.intExt).filter(Boolean))].join('/'),
                [...new Set(scenes.map(sc => sc && sc.dayNight).filter(Boolean))].join('/'),
                j.crewCall || '',
                d ? PlanningBoards._hms(d) : '',
                PlanningBoards._personnagesDe(j).join(', ')
            ].concat(colonnes.map(c => c.kind === 'res'
                ? (((resJour[i] || {})[c.cat] || {})[c.res] ? 'X' : '')
                : PlanningBoards.codeCase(pres, c.cle, i)));
        });
        // Le libelle va dans la colonne « Décors » (34 mm) : dans « JT »
        // (7 mm) il ne tient pas, et une colonne fusionnee sur du jsPDF
        // fabrique a la main coute plus cher que ce qu'elle rapporte.
        const recap = ['', '', '', '', 'RÉCAPITULATIF (jours)', '', '', '', '', '', '']
            .concat(colonnes.map(c => String(c.kind === 'res'
                ? ((PlanningBoards.inventaireRessources()[c.cat] || {})[c.res] || 0)
                : PlanningBoards.joursTravailles(pres, c.cle))));
        return { titre: 'Plan de travail — journées', cols: cols, rangs: rangs, recap: recap,
                 fixes: 5, legende: legende };
    },
    _modeleDecors: () => {
        const tmp = document.createElement('div');
        tmp.innerHTML = PlanningBoards.recapDecors();
        const lignes = [...tmp.querySelectorAll('tbody tr')].map(tr =>
            [...tr.children].map(td => (td.textContent || '').replace(/\s+/g, ' ').trim()));
        if(!lignes.length) return null;
        return { titre: 'Par décor', fixes: 1,
            cols: [{ t: 'Décor', w: 60, g: 1 }, { t: 'Jours', w: 14 }, { t: 'Scènes', w: 14 },
                   { t: 'Durée', w: 18 }, { t: 'Quand', w: 60, g: 1 }],
            rangs: lignes };
    },
    _modelePresences: () => {
        const lignes = PlanningBoards.journees();
        const pres = PlanningBoards.presences(lignes.map(l => l.jour));
        const gens = PlanningBoards.colonnesRoles();
        if(!gens.length) return null;
        const cols = [{ t: 'N°', w: 8 }, { t: 'Rôle / Poste', w: 38, g: 1 }, { t: 'Nom', w: 38, g: 1 }]
            .concat(lignes.map(l => ({ t: l.numero ? String(l.numero) : '·', w: 7 })))
            .concat([{ t: 'Tot.', w: 10 }]);
        const rangs = gens.map(g => [String(g.num), g.titre, g.nom]
            .concat(lignes.map((l, i) => PlanningBoards.codeCase(pres, g.cle, i)))
            .concat([String(PlanningBoards.joursTravailles(pres, g.cle))]));
        return { titre: 'Plan de travail — présences', cols: cols, rangs: rangs, fixes: 3 };
    },
    //  UNE GRILLE SUR LE PAPIER : pagination en hauteur, et en largeur des
    //  paquets de colonnes qui REPETENT les colonnes d'identite.
    _pdfGrille: (doc, etat, bloc) => {
        if(!bloc || !bloc.rangs || !bloc.rangs.length) return;
        const large = doc.internal.pageSize.getWidth() - etat.marge * 2;
        const haut = doc.internal.pageSize.getHeight() - etat.marge;
        const fixes = bloc.fixes || 0;
        const clean = (x) => Utils.stripPdfUnsafe
            ? Utils.stripPdfUnsafe(String(x == null ? '' : x).replace(/[—–]/g, '-').replace(/…/g, '...'))
            : String(x == null ? '' : x);
        // Les paquets de colonnes : les fixes d'abord, puis autant que possible.
        const paquets = [];
        let courant = [], larg = bloc.cols.slice(0, fixes).reduce((a, c) => a + c.w, 0);
        for(let i = fixes; i < bloc.cols.length; i++) {
            if(courant.length && larg + bloc.cols[i].w > large) {
                paquets.push(courant);
                courant = []; larg = bloc.cols.slice(0, fixes).reduce((a, c) => a + c.w, 0);
            }
            courant.push(i); larg += bloc.cols[i].w;
        }
        paquets.push(courant);
        paquets.forEach((paquet, np) => {
            const idx = [];
            for(let i = 0; i < fixes; i++) idx.push(i);
            paquet.forEach(i => idx.push(i));
            const titre = bloc.titre + (paquets.length > 1 ? '  (' + (np + 1) + '/' + paquets.length + ')' : '');
            // DEUX PIEGES DE jsPDF, PAYES SUR LA PREMIERE EPREUVE :
            //  1. text() ECRASE LA COULEUR DE REMPLISSAGE — dans un PDF, un
            //     texte est une forme remplie. Une case dessinee APRES un
            //     texte sort donc en noir plein. Sur l'epreuve, seule la
            //     premiere colonne etait grise, toutes les suivantes noires.
            //     On dessine donc TOUTES les cases, PUIS tous les textes.
            //  2. maxWidth ne coupe pas, il RENVOIE A LA LIGNE. « RÉCAPITULATIF »
            //     dans une colonne de 7 mm s'empilait sur quatre lignes et
            //     debordait sur l'en-tete. On coupe a la largeur, nous-memes.
            const couper = (txt, w) => {
                let t = clean(txt);
                if(!t) return '';
                const max = w - 1.6;
                if(doc.getTextWidth(t) <= max) return t;
                while(t.length > 1 && doc.getTextWidth(t) > max) t = t.slice(0, -1);
                return t;
            };
            const bande = (cells, h, fond, gras) => {
                let x = etat.marge;
                doc.setDrawColor(150);
                idx.forEach(i => {
                    if(fond != null) doc.setFillColor(fond);
                    doc.rect(x, etat.y, bloc.cols[i].w, h, fond != null ? 'FD' : 'D');
                    x += bloc.cols[i].w;
                });
                x = etat.marge;
                doc.setFont('helvetica', gras ? 'bold' : 'normal');
                doc.setFontSize(6); doc.setTextColor(20);
                idx.forEach(i => {
                    const t = couper(cells[i], bloc.cols[i].w);
                    if(t) doc.text(t, x + 0.8, etat.y + h - 1.5);
                    x += bloc.cols[i].w;
                });
                etat.y += h;
            };
            const tete = () => {
                if(etat.y + 18 > haut) { doc.addPage(); etat.y = etat.marge; }
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20);
                doc.text(clean(titre), etat.marge, etat.y + 4);
                etat.y += 7;
                bande(bloc.cols.map(c => c.t), 6, 232, true);
            };
            tete();
            const ligne = (cells, gras) => {
                if(etat.y + 5 > haut) { doc.addPage(); etat.y = etat.marge; tete(); }
                bande(cells, 5, gras ? 242 : null, gras);
            };
            if(bloc.recap) ligne(bloc.recap, true);
            bloc.rangs.forEach(r => ligne(r, false));
            etat.y += 4;
        });
        // LA LEGENDE DES NUMEROS DE COLONNE. Sans elle, le tableau dit « 7 »
        // et personne ne sait qui c'est.
        if(bloc.legende && bloc.legende.length) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(70);
            const parLigne = Math.max(1, Math.floor(large / 48));
            for(let i = 0; i < bloc.legende.length; i += parLigne) {
                if(etat.y + 4 > haut) { doc.addPage(); etat.y = etat.marge; }
                bloc.legende.slice(i, i + parLigne).forEach((txt, k) => {
                    doc.text(clean(txt).substring(0, 34), etat.marge + k * 48, etat.y + 2.6);
                });
                etat.y += 3.6;
            }
            doc.setTextColor(20);
            etat.y += 5;
        }
    },
    //  Ce que chaque tableau coutera en papier, SANS avoir a l'afficher :
    //  c'est ce qu'on annonce dans le hub, la ou le plan de travail n'est
    //  peut-etre meme pas a l'ecran.
    formatTableau: (cle) => {
        let m = null;
        try {
            m = cle === 'journees' ? PlanningBoards._modeleJournees()
              : cle === 'decors'   ? PlanningBoards._modeleDecors()
              : cle === 'presences' ? PlanningBoards._modelePresences() : null;
        } catch(e) { return null; }
        if(!m || !m.rangs || !m.rangs.length) return null;
        const mm = m.cols.reduce((a, c) => a + c.w, 0);
        return { colonnes: m.cols.length, lignes: m.rangs.length, mm: mm, papier: mm > 277 ? 'A3' : 'A4' };
    },

    //  Les tableaux demandes, dans l'ordre du document.
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport');
        const { jsPDF } = window.jspdf;
        const veut = (cle) => !opts.tableaux || opts.tableaux.indexOf(cle) >= 0;
        const blocs = [];
        if(veut('journees'))  blocs.push(PlanningBoards._modeleJournees());
        if(veut('decors'))    blocs.push(PlanningBoards._modeleDecors());
        if(veut('presences')) blocs.push(PlanningBoards._modelePresences());
        const utiles = blocs.filter(b => b && b.rangs && b.rangs.length);
        if(!utiles.length) { Utils.toast('Aucun tableau à exporter : le planning est vide', 'warning'); return; }
        // Le format suit le plus large des tableaux retenus.
        const besoin = Math.max.apply(null, utiles.map(b => b.cols.reduce((a, c) => a + c.w, 0)));
        const papier = besoin > 277 ? 'a3' : 'a4';
        const doc = new jsPDF('l', 'mm', papier);
        if(opts.includeCover !== false && typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) {
            FichesPDF._drawCoverPage(doc, 'Plan de travail');
            doc.addPage();
        }
        const etat = { marge: 10, y: 10 };
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text(Utils.stripPdfUnsafe(String(state.data.title || 'Sans titre')), etat.marge, etat.y + 5);
        etat.y += 12;
        utiles.forEach(b => PlanningBoards._pdfGrille(doc, etat, b));
        if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) {
            FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        }
        if(opts.returnBlob) return doc.output('blob');
        const nom = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Plan de travail')
            : (state.data.title || 'Projet') + ' - Plan de travail - moteur.studio.pdf';
        doc.save(nom);
        Utils.toast('Plan de travail PDF exporté (' + papier.toUpperCase() + ' paysage) !', 'success');
    },

    renderWorkPlan: () => {
        // UNE SEULE LECTURE DU PLANNING POUR LES DEUX TABLEAUX : meme ordre,
        // memes numeros de journee, memes cases. Deux tris differents du meme
        // planning, c'est le jour ou les deux documents se contredisent.
        const lignesJours = PlanningBoards.journees();
        const shootDays = lignesJours.map(l => l.jour);
        
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const characters = state.data.characters || [];
        
        // État vide
        if(shootDays.length === 0) {
            document.getElementById('workplanContent').innerHTML = `
                <div class="workplan-empty">
                    <div class="workplan-empty-icon">📋</div>
                    <h3 class="mb-10">Aucun jour de tournage planifié</h3>
                    <p style="color: #666; margin-bottom: 20px;">Ajoutez des jours de tournage dans le calendrier pour générer le plan de travail.</p>
                    <button onclick="app.Planning.setMode('calendar')" class="n8-badge-15">📅 Aller au calendrier</button>
                </div>`;
            return;
        }
        
        // Les quatre aides vivent desormais au niveau du module : le tableau
        // des journees pose exactement les memes questions.
        const presenceMap = PlanningBoards.presences(shootDays);
        const getCellCode = (cle, idx) => PlanningBoards.codeCase(presenceMap, cle, idx);
        const getCharacterForActor = (actorId) => PlanningBoards.persoDe(actorId);
        const countWorkDays = (cle) => PlanningBoards.joursTravailles(presenceMap, cle);

        // v601 : LE CHIFFRE DE L'EN-TETE COMPTE LES JOURS DE PLATEAU, comme
        // le tableau plus bas. Il comptait TOUTES les journees : l'en-tete
        // annoncait « 4 jours de tournage » au-dessus d'un tableau qui en
        // montrait deux. Deux chiffres qui se contredisent sur la meme page,
        // c'est le document entier qu'on cesse de croire — et c'est ce chiffre
        // qui part dans le budget et les contrats.
        const nbPlateau = shootDays.filter(j => PlanningBoards._estPlateau(j)).length;
        const nbAutres = shootDays.length - nbPlateau;

        // Dates du tournage
        const firstDate = new Date(shootDays[0].startDate || shootDays[0].date);
        const lastDate = new Date(shootDays[shootDays.length - 1].startDate || shootDays[shootDays.length - 1].date);
        const formatDate = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // Construction HTML
        let html = '<div class="workplan-wrapper">';
        
        // En-tête avec infos film
        html += `
            <div class="workplan-header-box">
                <div>
                    <div class="workplan-header-title">${Utils.escape(state.data.title || 'Sans titre')}</div>
                    <div class="workplan-header-subtitle">Plan de travail</div>
                </div>
                <div class="workplan-header-info">
                    <strong>Tournage :</strong> Du ${formatDate(firstDate)} au ${formatDate(lastDate)}<br>
                    <strong>Jours :</strong> ${nbPlateau} jour${nbPlateau > 1 ? 's' : ''} de tournage${nbAutres ? ` <span class="pdt-vide">(+ ${nbAutres} autre${nbAutres > 1 ? 's' : ''})</span>` : ''}<br>
                    <strong>Comédiens :</strong> ${actors.length}
                </div>
                <div class="workplan-header-version">
                    <strong>Version n°1</strong><br>
                    Généré le ${formatDate(new Date())}
                </div>
            </div>`;
        
        // v601 : LE RECAPITULATIF DE TETE DU MODELE AFAR. Un plan de travail
        // s'ouvre par ses chiffres : combien de jours, combien de minutes,
        // combien de roles. C'est ce qu'on recopie dans un devis.
        html += PlanningBoards.recapitulatif();

        // LES QUATRE BLOCS QUI MANQUAIENT, avant la grille des presences.
        // On lit d'abord ce qu'on tourne, ensuite qui est la.
        html += PlanningBoards.scenesNonPlanifiees();
        html += PlanningBoards.tableauJournees();
        html += PlanningBoards.recapDecors();
        html += PlanningBoards.depouillementParJour();

        // ==============================================================
        //  LE MODELE VERTICAL : LES JOURS EN COLONNES
        // ==============================================================
        //  L'AFAR publie DEUX formes du meme document, et les productions se
        //  servent des deux : l'horizontale (une ligne par journee, ci-dessus)
        //  pour fabriquer, la verticale (une colonne par journee) pour lire la
        //  presence des comediens d'un coup d'oeil. La grille existait deja
        //  ici, mais avec deux lignes d'en-tete : jour et date. Le modele en a
        //  NEUF — semaine, jour, mois, dates, horaires, effet, int/ext, decors,
        //  sequences — et c'est tout l'interet : on voit la colonne du J12
        //  entiere, du decor au dernier comedien, sans changer de tableau.
        const esc = Utils.escape;
        const premiereJ = (lignesJours.find(l => l.plateau) || {}).jour;
        const dateDepart = premiereJ ? (premiereJ.startDate || premiereJ.date) : '';
        const infosJour = lignesJours.map(l => {
            const j = l.jour;
            const sc = PlanningBoards._scenesDe(j);
            const decors = [];
            sc.forEach(x => { const d = PlanningBoards._decorDe(x); if(d && decors.indexOf(d) < 0) decors.push(d); });
            return {
                ligne: l, jour: j, date: j.startDate || j.date, scenes: sc, decors: decors,
                type: Planning.getDayTypeInfo(j.dayType)
            };
        });
        const bande = (label, fn, cls) => {
            let r = '<tr class="wp-bande' + (cls ? ' ' + cls : '') + '">'
                  + '<th colspan="3" class="wp-bande-lbl">' + esc(label) + '</th>';
            infosJour.forEach((info, idx) => {
                const v = fn(info, idx) || { txt: '' };
                r += '<td class="wp-bande-case' + (info.ligne.plateau ? '' : ' wp-hors') + '"'
                   + (v.titre ? ' title="' + esc(v.titre) + '"' : '') + '>' + (v.html || esc(v.txt)) + '</td>';
            });
            return r + '<th class="wp-bande-vide"></th></tr>';
        };
        // Le titre, le tableau et la legende dans UN SEUL cadre : c'est ce
        // cadre qu'on imprime quand on demande ce tableau-la tout seul.
        html += '<div class="pdt-bloc" data-bloc="presences"><h3 class="pdt-titre">🎭 Plan de travail — présences (modèle vertical)'
             + PlanningBoards._btnImp('presences') + '</h3>';
        html += '<div class="pdt-large"><table class="workplan-table pdt-feuille"><thead>';
        html += bande('SEMAINE', (i) => ({ txt: String(PlanningBoards._semaineDe(i.date, dateDepart) || '') }), 'wp-bande-forte');
        html += bande('JOUR DE TOURNAGE', (i) => i.ligne.numero
                    ? { txt: String(i.ligne.numero) }
                    : { html: i.type.icon, titre: i.type.label }, 'wp-bande-forte');
        html += bande('MOIS', (i) => ({ txt: PlanningBoards._moisDe(i.date) }));
        html += bande('DATES', (i) => {
            const d = new Date(String(i.date) + 'T12:00:00');
            if(isNaN(d.getTime())) return { txt: '' };
            return { html: d.toLocaleDateString('fr-FR', { weekday: 'short' }).substring(0, 2)
                       + '<br>' + d.getDate(), titre: d.toLocaleDateString('fr-FR') };
        }, 'wp-bande-forte');
        html += bande('HORAIRES', (i) => ({ txt: i.jour.crewCall || '' }));
        // Une colonne de jour fait quarante pixels : « NUI » ne veut rien dire,
        // « N » se lit. C'est ainsi que le modele l'ecrit — J/N, I/E — et le
        // mot entier reste au survol.
        const initiales = (v) => v.map(x => String(x).trim().charAt(0).toUpperCase()).join('/');
        html += bande('EFFET', (i) => {
            const v = [...new Set(i.scenes.map(x => x && x.dayNight).filter(Boolean))];
            return { txt: initiales(v), titre: v.join(' / ') };
        });
        html += bande('INT. / EXT.', (i) => {
            const v = [...new Set(i.scenes.map(x => x && x.intExt).filter(Boolean))];
            return { txt: initiales(v), titre: v.join(' / ') };
        });
        html += bande('DÉCORS', (i) => ({
            html: i.decors.length ? '<span class="wp-vert">' + esc(i.decors.join(' · ')) + '</span>' : '',
            titre: i.decors.join(' · ')
        }), 'wp-bande-decors');
        html += bande('SÉQUENCES', (i) => ({
            txt: i.scenes.map(x => x.number || '?').join(' '),
            titre: i.scenes.map(x => (x.number || '?') + ' — ' + (x.title || '')).join('\n')
        }));
        html += '<tr><th class="workplan-col-num">N°</th>';
        html += '<th class="workplan-col-role">RÔLE</th>';
        html += '<th class="workplan-col-actor">NOM</th>';
        infosJour.forEach((info, idx) => {
            html += '<th class="workplan-col-day">' + (info.ligne.numero || '·') + '</th>';
        });
        html += '<th class="workplan-col-total">TOTAL</th>';
        html += '</tr></thead><tbody>';
        
        // Section Comédiens
        if(actors.length > 0) {
            html += `<tr class="workplan-section-row"><td colspan="${shootDays.length + 4}">🎭 COMÉDIEN.NES</td></tr>`;
            
            actors.forEach((actor, idx) => {
                const personKey = `actor_${actor.id}`;
                const character = getCharacterForActor(actor.id);
                const totalDays = countWorkDays(personKey);
                
                html += '<tr>';
                html += `<td class="workplan-cell-num">${idx + 1}</td>`;
                html += `<td class="workplan-cell-role">${Utils.escape(character || '—')}</td>`;
                html += `<td class="workplan-cell-actor">${Utils.escape(actor.name || 'Sans nom')}</td>`;
                
                // Cellules des jours
                shootDays.forEach((day, dayIdx) => {
                    const code = getCellCode(personKey, dayIdx);
                    const cellClass = code ? `workplan-bar-${code}` : 'workplan-bar-empty';
                    const isEditable = !['T', 'SW', 'W', 'WF'].includes(code);
                    const clickAttr = isEditable ? `onclick="app.Planning.openWorkplanMenu(event, '${personKey}', ${dayIdx})"` : '';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    html += `<td class="${cellClass}" style="${cursorStyle}" ${clickAttr}>${code}</td>`;
                });
                
                html += `<td class="workplan-cell-total">${totalDays}</td>`;
                html += '</tr>';
            });
        }
        
        // Section Techniciens
        if(crew.length > 0) {
            html += `<tr class="workplan-section-row"><td colspan="${shootDays.length + 4}">🎥 TECHNICIEN.NES</td></tr>`;
            
            crew.forEach((member, idx) => {
                const personKey = `crew_${member.id}`;
                const totalDays = countWorkDays(personKey);
                
                html += '<tr>';
                html += `<td class="workplan-cell-num">${idx + 1}</td>`;
                html += `<td class="workplan-cell-role">${Utils.escape(member.role || '—')}</td>`;
                html += `<td class="workplan-cell-actor">${Utils.escape(member.name || 'Sans nom')}</td>`;
                
                // Cellules des jours
                shootDays.forEach((day, dayIdx) => {
                    const code = getCellCode(personKey, dayIdx);
                    const cellClass = code ? `workplan-bar-${code}` : 'workplan-bar-empty';
                    const isEditable = !['T', 'SW', 'W', 'WF'].includes(code);
                    const clickAttr = isEditable ? `onclick="app.Planning.openWorkplanMenu(event, '${personKey}', ${dayIdx})"` : '';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    html += `<td class="${cellClass}" style="${cursorStyle}" ${clickAttr}>${code}</td>`;
                });
                
                html += `<td class="workplan-cell-total">${totalDays}</td>`;
                html += '</tr>';
            });
        }
        
        html += '</tbody></table></div>';
        
        // Footer avec légende et actions
        html += `
            <div class="workplan-footer">
                <div class="workplan-legend">
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-SW">SW</div> Début</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-W">W</div> Travaille</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-WF">WF</div> Fin</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-T">T</div> Travaille (1 jour)</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-H">H</div> Hold/Retenue</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-R">R</div> Repos</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-V">V</div> Voyage</div>
                </div>
            </div></div>`;

        // « Imprimer tout » PREVIENT quand un tableau ne tient pas sur une A4 :
        // sorti reduit avec le reste, il est illisible, donc jete.
        html += '<div class="workplan-actions">'
             + '<button onclick="app.PlanningBoards.imprimerTout()">🖨️ Imprimer tout</button>'
             + '<button onclick="app.Planning.renderWorkPlan()">🔄 Actualiser</button>'
             + '</div>';

        html += '</div>';
        
        document.getElementById('workplanContent').innerHTML = html;
    },
    
    // Ouvrir le menu pour modifier une cellule du plan de travail
    openWorkplanMenu: (event, personKey, dayIdx) => {
        event.stopPropagation();
        
        // Fermer un menu existant
        const existingMenu = document.getElementById('workplan-cell-menu');
        if(existingMenu) existingMenu.remove();
        
        // Créer le menu
        const menu = document.createElement('div');
        menu.id = 'workplan-cell-menu';
        menu.className = 'workplan-cell-menu';
        menu.innerHTML = `
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, 'H')"><span class="workplan-bar-H" style="padding: 2px 6px; border-radius: 3px;">H</span> Hold</div>
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, 'V')"><span class="workplan-bar-V" style="padding: 2px 6px; border-radius: 3px;">V</span> Voyage</div>
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, 'R')"><span class="workplan-bar-R" style="padding: 2px 6px; border-radius: 3px;">R</span> Repos</div>
            <div class="workplan-menu-divider"></div>
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, null)">✕ Effacer</div>
        `;
        
        // Positionner le menu
        menu.style.position = 'absolute';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        
        document.body.appendChild(menu);
        
        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                // Meme regle que pour le menu du calendrier : l'identifiant
                // part tout de suite, l'element s'efface ensuite.
                menu.removeAttribute('id');
                Utils.fermerMenu(menu, () => menu.remove());
                document.removeEventListener('click', closeMenu);
            });
        }, 10);
    },
    
    // Définir une valeur manuelle dans le plan de travail
    setWorkplanOverride: (personKey, dayIdx, value) => {
        if(!state.data.workplanOverrides) state.data.workplanOverrides = {};
        
        const overrideKey = `${personKey}_${dayIdx}`;
        
        if(value === null) {
            delete state.data.workplanOverrides[overrideKey];
        } else {
            state.data.workplanOverrides[overrideKey] = value;
        }
        
        // Fermer le menu
        const menu = document.getElementById('workplan-cell-menu');
        if(menu) { menu.removeAttribute('id'); Utils.fermerMenu(menu, () => menu.remove()); }
        
        // Sauvegarder et rafraîchir
        Store.save();
        Planning.renderWorkPlan();
        
        Utils.toast(`Statut mis à jour : ${value || 'effacé'}`, 'success');
    },
    
    // Récupérer les éléments du dépouillement pour une personne selon son département
    // Planning.getBreakdownItemsForPerson (31 l.) retirée v569, jamais appelée.
    
    // Imprimer le Plan de Travail
    //  L'ancienne impression avait SA PROPRE feuille de style, qui ne
    //  connaissait que la grille des presences : tout ce qui a ete ajoute
    //  depuis sortait sans bordure et sans fond. Elle passe par la porte
    //  commune, qui previent aussi sur les tableaux trop larges.
    printWorkPlan: () => PlanningBoards.imprimerTout(),

    // Afficher le Kanban
    renderKanban: () => {
        const scenes = state.data.scenes || [];
        const shootDays = state.data.shootingDays || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Récupérer le filtre de type
        const kanbanTypeSel = document.getElementById('kanban-type-filter');
        if(kanbanTypeSel && kanbanTypeSel.options.length <= 1) {
            kanbanTypeSel.insertAdjacentHTML('beforeend', Planning.dayTypeOptionsHtml(''));
        }
        const typeFilter = kanbanTypeSel?.value || 'all';
        
        // Filtrer les jours par type si nécessaire
        const filteredDays = typeFilter === 'all' 
            ? shootDays 
            : shootDays.filter(day => (day.dayType || 'tournage') === typeFilter);
        
        // Créer un mapping scène -> date de tournage (uniquement pour les jours filtrés)
        const sceneToDate = {};
        const sceneToDay = {}; // Pour récupérer les infos du jour
        filteredDays.forEach(day => {
            const dateStr = day.startDate || day.date;
            if(dateStr && day.scenes) {
                day.scenes.forEach(sceneRef => {
                    const sceneId = sceneRef.sceneId || sceneRef;
                    sceneToDate[sceneId] = new Date(dateStr);
                    sceneToDay[sceneId] = day;
                });
            }
        });
        
        // Catégoriser les scènes
        const todo = [];
        const planned = [];
        const shooting = [];
        const done = [];
        
        scenes.forEach(scene => {
            const sceneDate = sceneToDate[scene.id];
            
            if(!sceneDate) {
                // Pas dans le calendrier
                todo.push({ scene, date: null });
            } else {
                sceneDate.setHours(0, 0, 0, 0);
                if(sceneDate.getTime() === today.getTime()) {
                    // Aujourd'hui
                    shooting.push({ scene, date: sceneDate });
                } else if(sceneDate > today) {
                    // Futur
                    planned.push({ scene, date: sceneDate });
                } else {
                    // Passé
                    done.push({ scene, date: sceneDate });
                }
            }
        });
        
        // Fonction pour créer une carte
        const createCard = (item) => {
            const scene = item.scene;
            const sceneIndex = scenes.findIndex(s => s.id === scene.id) + 1;
            const dateStr = item.date ? item.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
            const intExt = scene.intExt || '';
            const dayNight = scene.dayNight || '';
            
            // Récupérer le type de journée
            const day = sceneToDay[scene.id];
            const dayTypeInfo = day ? Planning.getDayTypeInfo(day.dayType) : null;
            const typeTag = dayTypeInfo ? `<span style="background:${dayTypeInfo.color}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${dayTypeInfo.icon} ${dayTypeInfo.label}</span>` : '';
            
            return `
                <div class="kanban-card" onclick="app.UI.switchTab('board')">
                    <div class="kanban-card-title">Sc. ${sceneIndex} - ${Utils.escape(scene.title || 'Sans titre')}</div>
                    <div class="kanban-card-info">
                        ${intExt ? `<span class="kanban-card-tag ${intExt.toLowerCase()}">${intExt}</span>` : ''}
                        ${dayNight ? `<span class="kanban-card-tag ${dayNight.toLowerCase()}">${dayNight}</span>` : ''}
                        ${typeTag}
                    </div>
                    ${scene.location ? `<div style="font-size: 0.75rem; color: var(--text-sec); margin-top: 4px;">📍 ${Utils.escape(scene.location)}</div>` : ''}
                    ${dateStr ? `<div class="kanban-card-date">📅 ${dateStr}</div>` : ''}
                </div>
            `;
        };
        
        // Remplir les colonnes
        document.getElementById('kanban-body-todo').innerHTML = todo.length ? todo.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        document.getElementById('kanban-body-planned').innerHTML = planned.length ? planned.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        document.getElementById('kanban-body-shooting').innerHTML = shooting.length ? shooting.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        document.getElementById('kanban-body-done').innerHTML = done.length ? done.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        
        // Mettre à jour les compteurs
        document.getElementById('kanban-count-todo').textContent = todo.length;
        document.getElementById('kanban-count-planned').textContent = planned.length;
        document.getElementById('kanban-count-shooting').textContent = shooting.length;
        document.getElementById('kanban-count-done').textContent = done.length;
    }
};
  
  // ============== PLANNING - VUES CALENDRIER (MOIS / SEMAINE / JOUR) ==============
  // Extrait du coeur de Planning (v578). Ces trois fonctions ne font que
  // FABRIQUER du HTML a partir de state.data ; elles ne modifient rien.
  // Les aides communes (getWeekStart, formatDate, getShootDay) restent dans
  // Planning : elles servent aussi ailleurs.