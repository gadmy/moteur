
  // ==========================================================================
  //  MISE A JOUR FORCEE, SANS COUPER PERSONNE (v602)
  // ==========================================================================
  //  POURQUOI : le 23 septembre, un onglet ouvert depuis le matin faisait
  //  encore tourner l'ANCIENNE version de l'appli, gardee en cache. Quand la
  //  base a ferme une porte que cette ancienne version utilisait, le
  //  developpeur a « perdu tous ses profils » (rien n'etait perdu, l'ancienne
  //  version ne savait plus les lire). Attendre la fin du deploiement ne
  //  suffit donc pas : il faut que les anciennes versions se RECHARGENT.
  //  COMMENT : REVISION ci-dessous est le numero de CE code. La base porte
  //  dans app_config la « revision_minimale ». Quand on s'apprete a changer
  //  la base d'une facon que l'ancien code ne supporterait pas, on augmente
  //  REVISION, on deploie, puis on monte revision_minimale — et seulement
  //  ENSUITE on touche a la base.
  //  LA REGLE DU DEVELOPPEUR : « ne pas couper l'utilisateur au milieu d'un
  //  truc important ». Donc on ne recharge JAMAIS si :
  //    - une sauvegarde est en attente ou en cours ;
  //    - on a tape quelque chose depuis moins de 2 minutes ;
  //    - une fenetre est ouverte (fiche, journee, dessin, export...) ;
  //    - le curseur est dans un champ de saisie.
  //  Et meme quand rien de tout cela n'est vrai, on ne recharge d'office QUE
  //  si l'onglet est en arriere-plan (la personne regarde ailleurs). Sinon,
  //  un bandeau propose « Recharger maintenant », et la personne choisit.
  const MiseAJour = {
    REVISION: 1,
    VERIF_MS: 5 * 60 * 1000,
    CALME_MS: 2 * 60 * 1000,
    _requise: false,
    _derniereAction: Date.now(),
    _plusTardJusqua: 0,
    _demarre: false,
    demarrer: () => {
        if(MiseAJour._demarre) return;
        MiseAJour._demarre = true;
        const noteAction = () => { MiseAJour._derniereAction = Date.now(); };
        ['keydown', 'input', 'pointerdown', 'wheel'].forEach(ev => document.addEventListener(ev, noteAction, true));
        document.addEventListener('visibilitychange', () => {
            if(document.visibilityState === 'hidden') MiseAJour.tenter();
            else MiseAJour.verifier();
        });
        setInterval(() => MiseAJour.verifier(), MiseAJour.VERIF_MS);
        MiseAJour.verifier();
    },
    verifier: async () => {
        try {
            if(typeof supabase === 'undefined' || !supabase) return;
            const { data } = await supabase.from('app_config').select('value').eq('key', 'revision_minimale').maybeSingle();
            const min = parseInt(data && data.value, 10);
            if(isFinite(min) && min > MiseAJour.REVISION) {
                MiseAJour._requise = true;
                MiseAJour.tenter();
            }
        } catch(e) { /* hors ligne : on reessaiera */ }
    },
    // Pourquoi ne PAS recharger maintenant (rien = on peut).
    occupe: () => {
        if(state.savingInProgress || state.pendingSave) return 'sauvegarde en cours';
        if(typeof StoreSave !== 'undefined' && StoreSave._saveDebounceTimer) return 'sauvegarde en attente';
        if(Date.now() - MiseAJour._derniereAction < MiseAJour.CALME_MS) return 'activite recente';
        const a = document.activeElement;
        if(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return 'saisie en cours';
        const fenetres = document.querySelectorAll('[id$="-modal"], [id$="modal-overlay"], .modal-overlay, .profile-modal-overlay, .confirm-modal');
        for(const el of fenetres) {
            const cs = getComputedStyle(el);
            if(cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0) return 'fenetre ouverte';
        }
        return '';
    },
    tenter: () => {
        if(!MiseAJour._requise) return;
        const cache = document.visibilityState === 'hidden';
        if(cache && !MiseAJour.occupe()) { MiseAJour.recharger(); return; }
        if(Date.now() >= MiseAJour._plusTardJusqua) MiseAJour.bandeau();
    },
    recharger: async () => {
        try { if(typeof Store !== 'undefined' && Store.saveFlush) await Store.saveFlush(); } catch(e) {}
        // Une sauvegarde partie juste avant : on la laisse finir (10 s max).
        const debut = Date.now();
        while(state.savingInProgress && Date.now() - debut < 10000) {
            await new Promise(r => setTimeout(r, 300));
        }
        if(state.savingInProgress) { MiseAJour.bandeau(); return; }
        location.reload();
    },
    plusTard: () => {
        MiseAJour._plusTardJusqua = Date.now() + 15 * 60 * 1000;
        const b = document.getElementById('maj-bandeau');
        if(b) b.remove();
    },
    bandeau: () => {
        if(document.getElementById('maj-bandeau')) return;
        const b = document.createElement('div');
        b.id = 'maj-bandeau';
        b.setAttribute('role', 'status');
        b.style.cssText = 'position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:100000;'
            + ' background:var(--bg-card, #fff); color:var(--text, #222); border:1px solid var(--primary, #2b6ef6);'
            + ' border-radius:10px; padding:10px 14px; box-shadow:0 6px 24px rgba(0,0,0,.2);'
            + ' display:flex; gap:10px; align-items:center; flex-wrap:wrap; max-width:calc(100vw - 32px); font-size:0.9rem;';
        b.innerHTML = '<span>🔄 Une nouvelle version de Moteur est disponible. Termine ce que tu fais, puis recharge.</span>'
            + '<button type="button" class="btn btn--primary btn--sm" onclick="app.MiseAJour.recharger()">Recharger maintenant</button>'
            + '<button type="button" class="btn btn--secondary btn--sm" onclick="app.MiseAJour.plusTard()">Plus tard</button>';
        document.body.appendChild(b);
    }
  };
  try { setTimeout(() => MiseAJour.demarrer(), 8000); } catch(e) {}
