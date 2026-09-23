
  // ==========================================================================
  //  EQUIPE B EN PARALLELE : UNE DEUXIEME FEUILLE LE MEME JOUR (v602)
  // ==========================================================================
  //  Decision du 23 septembre : une DEUXIEME FEUILLE DE SERVICE sur la meme
  //  journee, pas une journee jumelle. Creer un second jour a la meme date
  //  faisait compter DEUX jours de tournage (J1 et J2) au plan de travail.
  //  CE QUI EST STOCKE : les scenes et les convocations de l'equipe B restent
  //  DANS day.scenes et day.callSheet, marquees « equipe: 'B' ». C'est le
  //  point d'architecture : la quinzaine d'endroits qui se demandent « cette
  //  scene est-elle planifiee ? » ou « qui est la ce jour-la ? » (liens,
  //  suppression d'une scene, presences, disponibilites, planning...)
  //  continuent de marcher SANS RETOUCHE. Seuls la feuille de service, son
  //  PDF et le plan de travail font le tri.
  //  day.equipeB ne porte que l'EN-TETE propre a la feuille B : son nom, son
  //  decor, ses horaires, ses notes, son depouillement. La date, le type et le
  //  numero du jour sont ceux de la journee — il n'y a qu'un jour.
  //  A L'ECRAN : quand une equipe B existe, la fenetre du jour travaille sur
  //  une VUE d'une equipe (Planning.tempShootDay), et le jour complet est
  //  garde a part (Planning._jourComplet). Changer d'onglet ou enregistrer
  //  RENTRE la vue dans le jour complet. Sans equipe B, rien de tout cela
  //  n'existe : la fenetre marche exactement comme avant.
  const EquipeB = {
    // Ce qui appartient a la JOURNEE, pas a une equipe.
    IDENTITE: ['id', 'startDate', 'endDate', 'date', 'dayType', 'dayNumber'],
    estB: (x) => !!(x && x.equipe === 'B'),
    existe: (day) => !!(day && day.equipeB),
    nom: (day) => ((day && day.equipeB && day.equipeB.name) || 'Équipe B'),
    scenesA: (day) => ((day && day.scenes) || []).filter(x => !EquipeB.estB(x)),
    scenesB: (day) => ((day && day.scenes) || []).filter(EquipeB.estB),
    // La vue d'une equipe : un jour « comme les autres », que la feuille de
    // service et le PDF savent deja dessiner.
    vue: (day, eq) => {
        if(!day) return day;
        if(eq === 'B') {
            const v = Object.assign({}, day.equipeB || {});
            EquipeB.IDENTITE.forEach(k => { v[k] = day[k]; });
            v.scenes = EquipeB.scenesB(day);
            v.callSheet = (day.callSheet || []).filter(EquipeB.estB);
            // La figuration de la feuille B est nommee sur la feuille B : la
            // feuille dediee reste un reglage de la feuille principale.
            v.figuration = day.figuration;
            v.figuSplit = false;
            v.name = EquipeB.nom(day);
            v._equipe = 'B';
            return v;
        }
        const v = Object.assign({}, day);
        v.scenes = EquipeB.scenesA(day);
        v.callSheet = (day.callSheet || []).filter(x => !EquipeB.estB(x));
        v._equipe = 'A';
        return v;
    },
    // Remet une vue dans le jour complet. Renvoie le jour complet.
    rentrer: (full, v) => {
        if(!full || !v || v === full) return full;
        const b = v._equipe === 'B';
        const marquer = (arr) => (arr || []).map(x => {
            const y = Object.assign({}, x);
            if(b) y.equipe = 'B'; else delete y.equipe;
            return y;
        });
        const autres = (arr) => (arr || []).filter(x => EquipeB.estB(x) !== b);
        full.scenes = b ? autres(full.scenes).concat(marquer(v.scenes)) : marquer(v.scenes).concat(autres(full.scenes));
        full.callSheet = b ? autres(full.callSheet).concat(marquer(v.callSheet)) : marquer(v.callSheet).concat(autres(full.callSheet));
        if(b) {
            const eb = {};
            Object.keys(v).forEach(k => {
                if(['scenes', 'callSheet', 'figuration', 'figuSplit', '_equipe'].indexOf(k) > -1) return;
                if(EquipeB.IDENTITE.indexOf(k) > -1) { full[k] = v[k]; return; }
                eb[k] = v[k];
            });
            full.equipeB = eb;
        } else {
            Object.keys(v).forEach(k => {
                if(['scenes', 'callSheet', 'equipeB', '_equipe'].indexOf(k) > -1) return;
                full[k] = v[k];
            });
        }
        return full;
    },
    // --- La fenetre du jour ---
    enCours: () => (Planning._jourComplet ? (Planning.tempShootDay && Planning.tempShootDay._equipe) || 'A' : 'A'),
    // Apres la copie du jour a l'ouverture de la fenetre.
    ouvrir: () => {
        Planning._jourComplet = null;
        const t = Planning.tempShootDay;
        if(EquipeB.existe(t)) {
            Planning._jourComplet = t;
            Planning.tempShootDay = EquipeB.vue(t, 'A');
        }
    },
    fermer: () => { Planning._jourComplet = null; },
    // Avant d'enregistrer : le jour complet redevient la seule copie.
    complet: () => {
        const full = Planning._jourComplet;
        if(!full) return Planning.tempShootDay;
        EquipeB.rentrer(full, Planning.tempShootDay);
        Planning.tempShootDay = full;
        Planning._jourComplet = null;
        return full;
    },
    basculer: (eq) => {
        const full = Planning._jourComplet;
        if(!full) return;
        if(EquipeB.enCours() === eq) return;
        EquipeB.rentrer(full, Planning.tempShootDay);
        Planning.tempShootDay = EquipeB.vue(full, eq);
    },
    creer: () => {
        if(typeof PlanningDayEdit !== 'undefined' && !PlanningDayEdit.canWrite()) {
            Utils.toast("Vous n'avez pas les droits de modification sur le planning.", 'error'); return false;
        }
        if(!Planning.tempShootDay) return false;
        const nom = prompt('Nom de la deuxième équipe :', 'Équipe B');
        if(nom === null) return false;
        const full = Planning.tempShootDay;
        full.equipeB = { name: String(nom).trim() || 'Équipe B' };
        Planning._jourComplet = full;
        Planning.tempShootDay = EquipeB.vue(full, 'B');
        return true;
    },
    // Supprimer l'equipe B ne perd rien : ses scenes et ses convocations
    // repassent sur la feuille principale.
    supprimer: () => {
        if(typeof PlanningDayEdit !== 'undefined' && !PlanningDayEdit.canWrite()) return;
        if(!Planning._jourComplet) return;
        const nom = EquipeB.nom(Planning._jourComplet);
        if(!confirm('Supprimer la feuille « ' + nom + ' » ? Ses scènes et ses convocations repassent sur la feuille principale.')) return;
        const full = EquipeB.complet();
        full.scenes = (full.scenes || []).map(x => { const y = Object.assign({}, x); delete y.equipe; return y; })
            .filter((x, i, arr) => arr.findIndex(z => String(z.sceneId) === String(x.sceneId)) === i);
        full.callSheet = (full.callSheet || []).map(x => { const y = Object.assign({}, x); delete y.equipe; return y; })
            .filter((x, i, arr) => arr.findIndex(z => z.type === x.type && String(z.personId) === String(x.personId)) === i);
        delete full.equipeB;
        Planning.switchFDSTab('live');
        Planning.refreshFDSTabs();
    },
    // --- Le PDF : une feuille par equipe ---
    // scope (celui du choix d'impression) : 'main' = la feuille principale
    // seule, 'B' = la feuille B seule, 'both' ou rien (export du planning) =
    // toutes les feuilles du jour.
    feuilles: (days, scope) => {
        const out = [];
        (days || []).forEach(d => {
            if(!EquipeB.existe(d)) { if(scope !== 'B') out.push(d); return; }
            if(scope !== 'B') out.push(EquipeB.vue(d, 'A'));
            if(scope !== 'main') out.push(EquipeB.vue(d, 'B'));
        });
        return out;
    }
  };
