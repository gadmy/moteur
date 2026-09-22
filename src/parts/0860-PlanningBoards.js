
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
        return '<div class="pdt-bloc"><h3 class="pdt-titre">🏠 Par décor</h3>'
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
        let html = '<div class="pdt-bloc"><h3 class="pdt-titre">📋 Le dépouillement, jour par jour</h3>';
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
        let html = '<div class="pdt-bloc"><h3 class="pdt-titre">📆 Les journées</h3>'
                 + '<table class="pdt-table"><thead><tr>'
                 // Les colonnes du modele AFAR horizontal, dans son ordre :
                 // JT · S · M · DATES · DÉCORS · SÉQUENCES · I/E · EFFET ·
                 // HORAIRES · MIN. On y ajoute ce que l'application sait et
                 // que le tableur ne savait pas : les personnages nommes et
                 // ce qu'il faut preparer.
                 + '<th title="Jour de tournage">JT</th><th title="Semaine de tournage">S</th>'
                 + '<th title="Mois">M</th><th>Dates</th><th>Décors</th>'
                 + '<th title="Séquences">Séq.</th><th title="Intérieur / Extérieur">I/E</th>'
                 + '<th title="Jour / Nuit">Effet</th><th title="Convocation équipe">Horaires</th>'
                 + '<th title="Préminutage de la journée">Min</th>'
                 + '<th>Personnages</th><th>À préparer</th>'
                 + '</tr></thead><tbody>';
        lignes.forEach(l => {
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
            + '</tr>';
        });
        const nPlateau = lignes.filter(l => l.plateau).length;
        const nAutres = lignes.length - nPlateau;
        html += '</tbody></table>'
             + (total > 0 ? '<div class="pdt-note">Préminutage placé : <strong>' + PlanningBoards._hms(total)
                  + '</strong> — soit ' + PlanningBoards._hms(moyenne)
                  + ' par jour de tournage en moyenne.</div>' : '')
             + '<div class="pdt-note">' + nPlateau + ' jour' + (nPlateau > 1 ? 's' : '') + ' de tournage'
             + (nAutres ? ' · ' + nAutres + ' autre' + (nAutres > 1 ? 's journées' : ' journée') + ' (repérage, essais, probable…), sans numéro : seuls les jours de plateau se comptent.' : '')
             + '</div></div>';
        return html;
    },

    renderWorkPlan: () => {
        const shootDays = (state.data.shootingDays || []).slice().sort((a, b) => {
            const dateA = new Date(a.startDate || a.date);
            const dateB = new Date(b.startDate || b.date);
            return dateA - dateB;
        });
        
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
        
        // Créer mapping présences : qui travaille quel jour
        const buildPresenceMap = () => {
            const map = {};
            
            // Init pour chaque acteur
            actors.forEach(actor => {
                map[`actor_${actor.id}`] = { type: 'actor', person: actor, days: {} };
            });
            
            // Init pour chaque technicien
            crew.forEach(member => {
                map[`crew_${member.id}`] = { type: 'crew', person: member, days: {} };
            });
            
            // Parcourir les jours et leurs callSheets
            shootDays.forEach((day, dayIdx) => {
                (day.callSheet || []).forEach(call => {
                    const key = `${call.type}_${call.personId}`;
                    if(map[key]) {
                        map[key].days[dayIdx] = { callTime: call.callTime, notes: call.notes };
                    }
                });
            });
            
            return map;
        };
        
        const presenceMap = buildPresenceMap();
        
        // Déterminer le code pour chaque cellule (SW, W, WF, H, etc.)
        const getCellCode = (personKey, dayIdx) => {
            const data = presenceMap[personKey];
            
            // Vérifier s'il y a un override manuel (V, R, H ajoutés manuellement)
            const overrideKey = `${personKey}_${dayIdx}`;
            const override = (state.data.workplanOverrides || {})[overrideKey];
            if(override) return override;
            
            if(!data) return '';
            
            const days = Object.keys(data.days).map(Number).sort((a,b) => a - b);
            if(days.length === 0) return '';
            
            const firstDay = days[0];
            const lastDay = days[days.length - 1];
            const isWorkingThisDay = data.days[dayIdx] !== undefined;
            
            // Hors période de contrat
            if(dayIdx < firstDay || dayIdx > lastDay) return '';
            
            // Un seul jour de travail total
            if(days.length === 1 && isWorkingThisDay) return 'T';
            
            // Premier jour
            if(dayIdx === firstDay) return 'SW';
            
            // Dernier jour
            if(dayIdx === lastDay) return 'WF';
            
            // Entre premier et dernier jour
            if(isWorkingThisDay) return 'W'; // Travaille
            return 'H'; // Hold (pas convoqué mais sous contrat)
        };
        
        // Trouver le personnage associé à un acteur
        const getCharacterForActor = (actorId) => {
            const char = characters.find(c => c.actorId === actorId);
            return char ? char.name : '';
        };
        
        // Compter les jours de travail
        const countWorkDays = (personKey) => {
            const data = presenceMap[personKey];
            if(!data) return 0;
            return Object.keys(data.days).length;
        };
        
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

        // La grille des presences (SW / W / WF / T) : qui travaille quand.
        html += '<div class="pdt-bloc"><h3 class="pdt-titre">🎭 Qui travaille quand</h3></div>';
        html += '<table class="workplan-table"><thead><tr>';
        html += '<th class="workplan-col-num">N°</th>';
        html += '<th class="workplan-col-role">RÔLE</th>';
        html += '<th class="workplan-col-actor">COMÉDIEN.NE</th>';
        
        // En-têtes des jours
        shootDays.forEach((day, idx) => {
            const date = new Date(day.startDate || day.date);
            const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' }).substring(0, 2);
            const dayNum = date.getDate();
            const month = date.toLocaleDateString('fr-FR', { month: 'short' }).substring(0, 3);
            html += `<th class="workplan-col-day" title="J${idx + 1} - ${date.toLocaleDateString('fr-FR')}">${dayName}<br>${dayNum}<br>${month}</th>`;
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
        
        html += '</tbody></table>';
        
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
                <div class="workplan-actions">
                    <button onclick="app.Planning.printWorkPlan()">🖨️ Imprimer</button>
                    <button onclick="app.Planning.renderWorkPlan()">🔄 Actualiser</button>
                </div>
            </div>`;
        
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
                menu.remove();
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
        if(menu) menu.remove();
        
        // Sauvegarder et rafraîchir
        Store.save();
        Planning.renderWorkPlan();
        
        Utils.toast(`Statut mis à jour : ${value || 'effacé'}`, 'success');
    },
    
    // Récupérer les éléments du dépouillement pour une personne selon son département
    // Planning.getBreakdownItemsForPerson (31 l.) retirée v569, jamais appelée.
    
    // Imprimer le Plan de Travail
    printWorkPlan: () => {
        const content = document.getElementById('workplanContent').innerHTML;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Plan de Travail - ${Utils.escape(state.data.title || 'Film')}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .workplan-wrapper { background: white; }
                    .workplan-header-box { border: 2px solid #333; padding: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; }
                    .workplan-header-title { font-size: 1.4rem; font-weight: bold; }
                    .workplan-header-subtitle { font-size: 0.9rem; color: #666; }
                    .workplan-header-info { font-size: 0.85rem; }
                    .workplan-header-version { text-align: right; font-size: 0.85rem; }
                    .workplan-table { width: 100%; border-collapse: collapse; font-size: 9px; }
                    .workplan-table th, .workplan-table td { border: 1px solid #999; padding: 3px 4px; text-align: center; }
                    .workplan-table thead th { background: #f0f0f0; font-weight: 600; }
                    .workplan-cell-num, .workplan-col-num { background: #f5f5f5; }
                    .workplan-cell-role, .workplan-col-role { text-align: left; width: 100px; }
                    .workplan-cell-actor, .workplan-col-actor { text-align: left; width: 110px; font-size: 8px; }
                    .workplan-cell-total, .workplan-col-total { background: #f5f5f5; font-weight: 600; }
                    .workplan-bar-T, .workplan-bar-SW, .workplan-bar-W, .workplan-bar-WF { background: #c0392b !important; color: white; font-weight: bold; }
                    .workplan-bar-H { background: #f39c12 !important; color: white; }
                    .workplan-bar-R { background: #3498db !important; color: white; }
                    .workplan-bar-V { background: #9b59b6 !important; color: white; }
                    .workplan-section-row td { background: #d5d5d5 !important; font-weight: 600; text-align: left; }
                    .workplan-footer { margin-top: 15px; }
                    .workplan-legend { display: flex; gap: 15px; flex-wrap: wrap; font-size: 10px; }
                    .workplan-legend-item { display: flex; align-items: center; gap: 4px; }
                    .workplan-legend-box { width: 20px; height: 14px; border: 1px solid #999; font-size: 8px; display: flex; align-items: center; justify-content: center; color: white; }
                    .workplan-actions { display: none; }
                    @page { size: landscape; margin: 10mm; }
                </style>
            </head>
            <body>${content}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    },
    
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