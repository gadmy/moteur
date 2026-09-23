
  const PlanningFDS = {
    // ===== PARSEURS AFAR PARTAGÉS (PDF + éditeur WYSIWYG) =====
    // Effet d'une scène (INT/EXT + moment) déduit de son titre
    effet: (title) => {
        const t = String(title || '').toUpperCase();
        const ie = /\bI\s*\/\s*E\b|INT\.?\s*\/\s*EXT/.test(t) ? 'INT/EXT'
            : (/\bEXT\b/.test(t) ? 'EXT' : (/\bINT\b/.test(t) ? 'INT' : ''));
        const mm = t.match(/\b(JOUR|NUIT|AUBE|CRÉPUSCULE|CREPUSCULE|MATIN|SOIR|SOIRÉE|SOIREE)\b/);
        return [ie, mm ? mm[1] : ''].filter(Boolean).join(' ');
    },
    // Décor d'une scène : champ dédié, sinon extrait du titre
    decor: (sc) => {
        if(sc && sc.location) return sc.location;
        const raw = String((sc && sc.title) || '');
        let m = raw.replace(/^\s*\d+\s*[.\-)]?\s*/, '').replace(/^(?:INT\.?\/EXT\.?|I\s*\/\s*E|INT\.?|EXT\.?)\s*/i, '');
        m = m.replace(/\s*[-–]\s*(JOUR|NUIT|AUBE|CRÉPUSCULE|CREPUSCULE|MATIN|SOIR|SOIRÉE|SOIREE)\s*$/i, '');
        return m.trim() || raw;
    },
    // ===== IDENTITE DU FILM ET CONTACTS DE PRODUCTION (PDF + ecran) =====
    // Deuxieme bande de tete du modele AFAR : logo de la production, TITRE,
    // « un film de », puis le pave NOM / adresse / telephone de la production
    // et, en regard, sept contacts nommes avec leur telephone.
    // Rien n'est saisi sur la feuille : le titre vient de l'onglet Titre,
    // l'identite de la production de l'onglet Production > Presentation, et les
    // contacts des fiches de l'equipe.
    // Les roles reels portent des points medians et des formes feminines
    // (« 1er·ere assistant·e realisateur·rice », « Directrice de production »),
    // et peuvent etre saisis a la main : les motifs restent volontairement
    // laches, et \D* encaisse tout ce qui separe les mots-cles.
    PROD_CONTACTS: [
        { label: '1er assistant·e mise en scène',      g: ['gc3'], role: /^1\D*assistant/ },
        { label: '2ème assistant·e mise en scène',     g: ['gc3'], role: /^2\D*assistant/ },
        { label: 'Régisseur·se général·e',             g: ['gc9'], role: /regisseur.*general|general.*regisseur/ },
        { label: 'Régisseur·se adjoint·e',             g: ['gc9'], role: /regisseur.*adjoint|adjoint.*regisseur/ },
        { label: 'Directeur·rice de production',       g: ['gc10'], role: /direct(eur|rice|ion).*production|production.*direct/ },
        { label: 'Administrateur·rice de production',  g: ['gc10'], role: /administra/ },
        { label: 'Assistant·e de production',          g: ['gc10'], role: /assistant/ }
    ],
    filmIdentity: (allCrew) => {
        const p = (state.data.presentation) || {};
        const tp = state.data.titlePage || {};
        const sm = state.data.scriptMeta || {};
        const norm = (r) => String(r || '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/[\u00B7.]/g, ' ').replace(/\s+/g, ' ').trim();
        const contacts = PlanningFDS.PROD_CONTACTS.map(def => {
            const m = (allCrew || []).find(x => x && x.name
                && def.g.includes(x.group_id || '')
                && def.role.test(norm(x.role)));
            return { label: def.label, id: m ? m.id : '', name: m ? m.name : '', phone: m ? (m.phone || '') : '' };
        });
        return {
            logo: p.logo || '',
            title: tp.title || state.data.title || '',
            author: tp.author || sm.author || '',
            prodName: p.producer || '',
            prodAddress: p.addressLegal || '',
            prodPhone: p.phoneLegal || '',
            contacts: contacts
        };
    },
    // ===== BANDEAU D'EQUIPE AFAR PARTAGE (PDF + editeur WYSIWYG) =====
    // Bande de tete de la page 1 du modele officiel : neuf cases par corps de
    // metier, remplies avec les NOMS de l'equipe du film (« Prenoms NOMS » au
    // pluriel dans le modele : c'est tout le departement, pas le seul chef de
    // poste). Aucun telephone ici, ils appartiennent au bloc des contacts de
    // production, qui est un bloc distinct du modele.
    // Quatre cases sont subdivisees par le modele lui-meme, d'ou « parts ».
    TEAM_COLS: [
        { label: 'PRODUCTION',    parts: [{ g: ['gc10'] }] },
        { label: 'MISE EN SCÈNE', parts: [{ g: ['gc3', 'gc8'] }] },
        { label: 'RÉGIE',         parts: [{ g: ['gc9', 'gc12'] }] },
        { label: 'IMAGE',         parts: [{ g: ['gc1'] }] },
        { label: 'SON',           parts: [{ g: ['gc4'] }] },
        { label: 'ÉLEC./MACH.',   parts: [{ sub: 'Électricité', g: ['gc2'] },
                                          { sub: 'Machinerie', g: ['gc18'] }] },
        // L'app n'a qu'un groupe « Maquillage/Coiffure » la ou le modele
        // distingue les deux : la case porte le libelle double.
        { label: 'HMC',           parts: [{ sub: 'Habillage', g: ['gc6'] },
                                          { sub: 'Maquillage / Coiffure', g: ['gc7'] }] },
        // Pas de groupe « Accessoires » dans l'app : la separation se fait sur
        // le role, et tout ce qui n'est pas accessoiriste reste en decoration.
        { label: 'DÉCO/ACC.',     parts: [{ sub: 'Décoration', g: ['gc5'], roleNot: /accessoir/ },
                                          { sub: 'Accessoires', g: ['gc5'], role: /accessoir/ }] },
        { label: 'DIVERS',        parts: [{ sub: 'Cantine', g: ['gc11'] },
                                          { sub: 'Post-production', g: ['gc13'] },
                                          { sub: 'Autres', g: ['gc14', 'gc15', 'gc16', 'gc17'], rest: true }] }
    ],
    // Renvoie { cols:[{label, parts:[{sub, names:[]}], empty}], extraStaff, actors:[] }
    // « rest » ramasse les groupes cites nulle part ET les personnes sans
    // groupe : personne ne peut disparaitre du bandeau.
    teamBanner: (shootDay, allCrew, allActors) => {
        const day = shootDay || {};
        const crew = allCrew || [];
        const cited = {};
        PlanningFDS.TEAM_COLS.forEach(c => c.parts.forEach(p => (p.g || []).forEach(g => { cited[g] = true; })));
        const norm = (r) => String(r || '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/[\u00B7.]/g, '').trim();
        const pick = (part) => {
            const names = [];
            crew.forEach(m => {
                if(!m || !m.name) return;
                const gid = m.group_id || '';
                const inPart = (part.g || []).includes(gid);
                const orphan = !!part.rest && !cited[gid];
                if(!inPart && !orphan) return;
                const r = norm(m.role);
                if(part.role && !part.role.test(r)) return;
                if(part.roleNot && part.roleNot.test(r)) return;
                if(!names.includes(m.name)) names.push(m.name);
            });
            return names;
        };
        const cols = PlanningFDS.TEAM_COLS.map(c => {
            const parts = c.parts.map(p => ({ sub: p.sub || '', names: pick(p) }));
            return { label: c.label, parts: parts, empty: !parts.some(p => p.names.length) };
        });
        // Ligne COMEDIENS du modele : le casting du film, figuration exclue —
        // elle a ses propres tableaux et noierait la ligne.
        const figuIds = (state.data.groups || [])
            .filter(gr => gr.type === 'actor' && /figuration/i.test(gr.name || ''))
            .map(gr => gr.id);
        const actors = (allActors || [])
            .filter(a => a && a.name && !figuIds.includes(a.group_id))
            .map(a => a.name);
        return {
            cols: cols,
            extraStaff: (day.extraStaff && String(day.extraStaff).trim()) || '',
            actors: actors
        };
    },
    // ===== DÉPOUILLEMENT AFAR PARTAGÉ (PDF + éditeur WYSIWYG) =====
    // Correspondance créneau AFAR -> catégories de dépouillement de l'app
    SLOTS: [
        { label: 'CASCADEURS / PILOTES',     cats: [],                                                sub: 'SEQ :      S/P :      PAT :' },
        { label: 'CONSEILLERS / RÉGLEURS',   cats: [],                                                sub: 'SEQ :      S/P :      PAT :' },
        { label: 'ANIMAUX',                  cats: ['ANIMAUX'],                                       sub: 'SEQ :      S/P :      PAT :' },
        { label: 'VÉHICULES',                cats: ['VEHICULES'],                                     sub: 'SEQ :      S/P :      PAT :' },
        { label: 'ÉQUIPEMENTS SPÉCIAUX',     cats: ['EFFETS SPECIAUX (SFX)', 'EFFETS VISUELS (VFX)'], sub: 'SEQ :      S/P :      PAT :' },
        { label: 'MISE EN SCÈNE',            cats: [],                                                sub: 'SEQ :' },
        { label: 'DÉCORATION / ACCESSOIRES', cats: ['ACCESSOIRES', 'DECORS-LIEUX'],                   sub: 'SEQ :' },
        { label: 'COSTUMES',                 cats: ['COSTUMES'],                                      sub: 'SEQ :' },
        { label: 'MAQUILLAGE / COIFFURE',    cats: ['MAQUILLAGE-COIFFURE'],                           sub: 'SEQ :' },
        { label: 'IMAGE',                    cats: [],                                                sub: 'SEQ :' },
        { label: 'ÉLECTRICITÉ / MACHINERIE', cats: ['LUMIERE', 'MACHINERIE'],                         sub: 'SEQ :' },
        { label: 'SON',                      cats: ['SON-MUSIQUE'],                                   sub: 'SEQ :' },
        { label: 'PRODUCTION / RÉGIE',       cats: ['LOGISTIQUE', 'FIGURATION'],                      sub: '' }
    ],
    CAT_TO_GROUP: {
        'ACCESSOIRES': 'gc5', 'DECORS-LIEUX': 'gc5',
        'COSTUMES': 'gc6',
        'MAQUILLAGE-COIFFURE': 'gc7',
        'VEHICULES': 'gc12', 'LOGISTIQUE': 'gc12',
        'SON-MUSIQUE': 'gc4',
        'LUMIERE': 'gc2',
        'FIGURATION': 'gc9', 'ANIMAUX': 'gc9',
        'EFFETS SPECIAUX (SFX)': 'gc16',
        'EFFETS VISUELS (VFX)': 'gc13'
    },
    // Renvoie [{ label, sub, cats:[{cat, content, resp}] }] pour un jour donné.
    // Les catégories sans créneau AFAR sont reversées dans PRODUCTION / RÉGIE
    // pour ne rien perdre du dépouillement.
    breakdownSlots: (shootDay, allScenes, allCrew) => {
        const day = shootDay || {};
        const scenes = day.scenes || [];
        const bdHidden = day.bdHidden || [];
        const bdExtra = day.bdExtra || {};
        const bdNotes = day.bdNotes || {};
        const auto = {};
        const autoLinks = {};
        scenes.forEach(ref => {
            const sc = (allScenes || []).find(s => s.id === ref.sceneId);
            if(!sc || !sc.breakdown) return;
            Object.entries(sc.breakdown).forEach(([cat, items]) => {
                if(!Array.isArray(items) || !items.length) return;
                if(!auto[cat]) auto[cat] = new Map();
                if(!autoLinks[cat]) autoLinks[cat] = {};
                // On regroupe par TEXTE, mais on retient les FICHES distinctes
                // qui se cachent derriere. Deux chemises destinees a deux
                // comediens sont deux fiches : les afficher une seule fois
                // ferait croire au costumier qu'il n'y en a qu'une a preparer.
                // Une meme fiche revenant dans cinq scenes du jour reste UN
                // objet : on compte les fiches, jamais les occurrences.
                items.forEach(it => {
                    const txt = Utils.bdText(it);
                    if(!auto[cat].has(txt)) auto[cat].set(txt, new Set());
                    const id = Utils.bdId(it);
                    if(id) {
                        auto[cat].get(txt).add(id);
                        if(!autoLinks[cat][txt]) {
                            autoLinks[cat][txt] = { kind: Utils.bdKind(it) || Utils.bdKindOf(cat), id: id };
                        }
                    }
                });
            });
        });
        // Responsables d'une catégorie : TOUS les techniciens convoqués du groupe
        // correspondant, pas seulement le premier trouvé (une catégorie peut
        // relever de plusieurs personnes, ex. deux costumières sur la journée).
        const respFor = (cat) => {
            const gid = PlanningFDS.CAT_TO_GROUP[cat];
            if(!gid) return '';
            const names = [];
            (day.callSheet || []).forEach(cl => {
                if(cl.type !== 'crew') return;
                const m = (allCrew || []).find(x => x.id === cl.personId);
                if(m && m.group_id === gid && m.name && !names.includes(m.name)) names.push(m.name);
            });
            return names.join(', ');
        };
        // Libelles affichables d'une categorie : le texte, suivi de la quantite
        // quand plusieurs fiches distinctes le portent (« chemise x2 »). C'est
        // la seule information qui dise au costumier combien de pieces preparer.
        // Le signe x est un caractere latin1, sans danger pour le PDF.
        const labels = (cat) => {
            const m = auto[cat];
            if(!m) return [];
            return Array.from(m.entries()).map(([txt, ids]) => (ids && ids.size > 1) ? `${txt} x${ids.size}` : txt);
        };
        // Version detaillee pour l'ecran : le libelle affiche, le texte brut
        // (qui sert de cle pour retrouver la fiche liee) et le nombre de fiches.
        const labelsDetail = (cat) => {
            const m = auto[cat];
            if(!m) return [];
            return Array.from(m.entries()).map(([txt, ids]) => ({
                txt: txt,
                n: ids ? ids.size : 0,
                label: (ids && ids.size > 1) ? `${txt} x${ids.size}` : txt
            }));
        };
        const content = (cat) => {
            if(bdHidden.includes(cat)) return '';
            const items = labels(cat);
            (Array.isArray(bdExtra[cat]) ? bdExtra[cat] : []).forEach(it => { if(!items.includes(it)) items.push(it); });
            const note = bdNotes[cat] && String(bdNotes[cat]).trim();
            const bits = [];
            if(items.length) bits.push(items.join('  -  '));
            if(note) bits.push(note);
            return bits.join('  -  ');
        };
        const mapped = PlanningFDS.SLOTS.reduce((acc, s) => acc.concat(s.cats), []);
        const leftover = ['PERSONNAGES', 'COMEDIENS', 'TECHNICIENS'].concat(
            Object.keys(auto).concat(Object.keys(bdExtra), Object.keys(bdNotes))
        ).filter((cat, i, arr) => arr.indexOf(cat) === i && !mapped.includes(cat));
        return PlanningFDS.SLOTS.map(slot => {
            const cats = slot.label === 'PRODUCTION / RÉGIE' ? slot.cats.concat(leftover) : slot.cats;
            const filled = [];
            cats.forEach(cat => {
                const ct = content(cat);
                if(!ct) return;
                filled.push({ cat: cat, content: ct, resp: respFor(cat) });
            });
            // « all » porte TOUTES les categories du bloc, vides et masquees
            // comprises, avec leurs parties separees. L'editeur de la feuille en
            // a besoin : il doit distinguer ce qui vient des scenes de ce que
            // l'utilisateur a ajoute, de sa note et du masquage. « cats » reste
            // strictement inchange, c'est ce que lit le PDF.
            const all = cats.map(cat => ({
                cat: cat,
                auto: labels(cat),
                autoDetail: labelsDetail(cat),
                links: autoLinks[cat] || {},
                extra: Array.isArray(bdExtra[cat]) ? bdExtra[cat].slice() : [],
                note: bdNotes[cat] == null ? '' : String(bdNotes[cat]),
                hidden: bdHidden.includes(cat),
                resp: respFor(cat)
            }));
            return { label: slot.label, sub: slot.sub, cats: filled, all: all };
        });
    },
    // Durée en minutes décimales -> notation pré-minutage AFAR (2'30)
    min: (min) => {
        const v = parseFloat(String(min == null ? '' : min).replace(',', '.'));
        if(!isFinite(v) || v <= 0) return '';
        const mm = Math.floor(v);
        const ss = Math.round((v - mm) * 60);
        return mm + "'" + String(ss).padStart(2, '0');
    },
    // ===== LEVER / COUCHER DU SOLEIL (PDF + éditeur WYSIWYG) =====
    // Calcul astronomique local (algorithme NOAA) plutôt qu'appel réseau :
    // l'export PDF est synchrone, et une API de prévisions ne couvre que les
    // quinze prochains jours alors qu'un plan de travail se prépare des mois
    // à l'avance. Précision de l'ordre de la minute, suffisante pour une FDS.
    // Renvoie { sunrise, sunset } en 'HH:MM' heure de Paris, chaînes vides si
    // le calcul n'a pas de solution (nuit ou jour polaire) ou si les
    // coordonnées manquent.
    sun: (lat, lng, dateStr) => {
        const empty = { sunrise: '', sunset: '' };
        const la = parseFloat(lat), lo = parseFloat(lng);
        const ds = String(dateStr || '').slice(0, 10);
        if(!isFinite(la) || !isFinite(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) return empty;
        const base = new Date(ds + 'T12:00:00Z');
        if(isNaN(base.getTime())) return empty;
        const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
        const e = rad * 23.4397, J0 = 0.0009;
        const d = (base.valueOf() / dayMs - 0.5 + J1970) - J2000;
        const lw = rad * -lo, phi = rad * la;
        const n = Math.round(d - J0 - lw / (2 * Math.PI));
        const approx = (Ht) => J0 + (Ht + lw) / (2 * Math.PI) + n;
        const dsNoon = approx(0);
        const M = rad * (357.5291 + 0.98560028 * dsNoon);
        const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
        const dec = Math.asin(Math.sin(e) * Math.sin(L));
        const transit = (t) => J2000 + t + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
        const Jnoon = transit(dsNoon);
        const cosW = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
        if(!isFinite(cosW) || cosW > 1 || cosW < -1) return empty;
        const w0 = Math.acos(cosW);
        const Jset = transit(approx(w0));
        const Jrise = Jnoon - (Jset - Jnoon);
        const fmt = (j) => {
            const dt = new Date((j + 0.5 - J1970) * dayMs);
            if(isNaN(dt.getTime())) return '';
            try {
                return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(dt);
            } catch(err) {
                return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
            }
        };
        return { sunrise: fmt(Jrise), sunset: fmt(Jset) };
    },
    currentFDSDay: null,
    currentFDSMap: null,
    generateFDS: (scope) => {
        // Un jour bascule en feuille de figuration dediee produit DEUX
        // documents. Tant que le choix n'est pas fait, on le demande ; sinon
        // le bouton imprime directement, comme avant.
        const box = document.getElementById('fds-print-choice');
        // v602 : avec une equipe B, le jour a aussi deux feuilles (voir EquipeB).
        const vueA = Planning._jourComplet ? EquipeB.vue(EquipeB.rentrer(Planning._jourComplet, Planning.tempShootDay), 'A') : Planning.tempShootDay;
        const split = !!(vueA && vueA.figuSplit);
        const aB = !!Planning._jourComplet;
        if(!scope && (split || aB)) {
            const bF = document.getElementById('fds-print-figu'), bB = document.getElementById('fds-print-B');
            if(bF) bF.style.display = split ? '' : 'none';
            if(bB) { bB.style.display = aB ? '' : 'none'; bB.textContent = aB ? EquipeB.nom(Planning._jourComplet) : ''; }
            if(box) box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
            return;
        }
        if(box) box.style.display = 'none';
        const which = (split || aB) ? (scope || 'both') : 'main';

        // L'id doit etre capture AVANT la sauvegarde : saveShootDay ferme la
        // modale, ce qui remet editingDayId et tempShootDay a null.
        const wasNew = Planning.editingDayId === 'new';
        const dayId = Planning.editingDayId;
        const startDate = (Planning.tempShootDay || {}).startDate || '';
        Planning.saveShootDay();
        // saveShootDay refuse parfois (droits, date manquante) : la fenetre
        // reste alors ouverte, on n'imprime pas.

        // Trouver le jour sauvegardé par son ID
        const savedDay = (!wasNew ? state.data.shootingDays.find(sd => sd.id === dayId) : null)
            || (startDate ? state.data.shootingDays.filter(sd => sd.startDate === startDate).slice(-1)[0] : null);
        if(!savedDay) {
            Utils.toast('Jour de tournage non trouvé', 'error');
            return;
        }

        // La feuille figuration seule a deja son export : inutile de fabriquer
        // toute la feuille de service pour n'en garder qu'une page.
        if(which === 'figu') {
            Figuration.exportPDF({ dayId: savedDay.id, includeCover: false });
            return;
        }
        PlanningExport.exportPlanningPDF({ dayIds: [savedDay.id], includeCover: false, fdsScope: which });
    },
  };
