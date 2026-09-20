
  // ===== MATERIEL DU TECHNICIEN : CAMERAS ET OBJECTIFS (v601) =====
  // Meme histoire que les langues et les sports : ces deux listes servent la
  // RECHERCHE (filtres « Camera » et « Materiel » de la recherche globale et
  // des Contacts), elles ne sont pas un decor. Elles vivaient dans l'ancien
  // formulaire de profil, supprime en v600 — depuis, on les CHERCHAIT sans que
  // personne puisse plus les REMPLIR. Un filtre qui ne trouve rien fait croire
  // que personne ne correspond : c'est pire que pas de filtre du tout.
  //
  // DEUX LISTES, ET PAS SIX. Le profil gardait aussi lumiere, son, machinerie
  // et maquillage. Ecartes a la demande du developpeur : on cherche un boitier
  // ou une serie d'optiques, pratiquement jamais un projecteur ou une perche.
  //
  // DEUX ECRITURES A CHAQUE CHANGEMENT, comme pour les langues : la casquette
  // (la fiche qu'on edite) ET le profil PLAT, seul endroit que la recherche
  // regarde. Sans la seconde, on remplirait sa fiche sans jamais ressortir
  // dans les resultats — exactement le defaut du departement en v600.
  const ProfileGear = {
    CAMERAS: ['ARRI Alexa 35', 'ARRI Alexa Mini LF', 'ARRI Alexa Mini', 'ARRI Amira',
              'RED Komodo', 'RED V-Raptor', 'RED Helium', 'Sony Venice', 'Sony Venice 2',
              'Sony FX3', 'Sony FX6', 'Sony FX9', 'Sony A7S III', 'Sony A7 IV',
              'Blackmagic Pocket 6K', 'Blackmagic URSA Mini Pro', 'Blackmagic Pyxis',
              'Canon C70', 'Canon C300 Mark III', 'Canon C400', 'Canon R5', 'Canon R6',
              'Panasonic GH6', 'Panasonic GH7', 'Panasonic S5 II', 'Panasonic Varicam',
              'Nikon Z6 III', 'Fujifilm X-H2S', 'Lumix BS1H', 'DJI Ronin 4D',
              'GoPro (embarquee)', 'Drone (DJI ou autre)', 'Camera argentique 16mm',
              'Camera argentique 35mm'],
    OBJECTIFS: ['Zeiss Supreme Prime', 'Zeiss CP.3', 'Zeiss Master Prime', 'Zeiss Ultra Prime',
                'Cooke S4', 'Cooke S7', 'Cooke Panchro', 'ARRI Signature Prime',
                'ARRI Master Anamorphic', 'Angenieux Optimo', 'Angenieux EZ',
                'Canon CN-E', 'Canon L (photo)', 'Sigma Cine', 'Sigma Art (photo)',
                'Sony G Master (photo)', 'Tokina Vista', 'Leica Summilux-C',
                'Laowa (grand angle / macro)', 'Samyang / Rokinon Cine',
                'Atlas Orion (anamorphique)', 'Kowa (anamorphique)',
                'Serie vintage (Helios, Takumar...)', 'Zoom polyvalent 24-70',
                'Zoom telephoto 70-200'],

    // La fiche de profil edite une COPIE ; hors de ce mode, rien a faire.
    _cible: () => PublicProfile._engineProfile || null,
    _cle: (quoi) => quoi === 'cam' ? 'cameras' : 'lenses',
    _options: (quoi) => quoi === 'cam' ? ProfileGear.CAMERAS : ProfileGear.OBJECTIFS,

    // Les deux listes existent toujours sur une fiche, sinon l'editeur n'aurait
    // rien a dessiner.
    migrer: (fiche) => {
        if(!fiche) return;
        ['cameras', 'lenses'].forEach(k => { if(!Array.isArray(fiche[k])) fiche[k] = []; });
    },

    // REPRISE DES PROFILS D'AVANT, au CHARGEMENT. Ces listes vivaient A PLAT sur
    // le profil, en un seul exemplaire ; elles vivent desormais DANS la fiche
    // technicien, une par fiche. La sauvegarde recalculant les champs plats
    // depuis les fiches, il fallait descendre AVANT toute sauvegarde : un profil
    // enregistre sans avoir ouvert sa fiche technicien aurait vu son materiel
    // efface sans jamais avoir ete repris.
    // SEULE LA PREMIERE FICHE est servie : la liste plate est unique, la recopier
    // sur chacune inventerait du materiel en double.
    // « otherEquipment », champ libre qui n'a plus d'editeur, est verse dans les
    // cameras plutot que laisse invisible — l'effacer ferait perdre une saisie
    // que la personne a faite pour de bon.
    descendre: (profil) => {
        if(!profil || !profil.facets) return;
        const fiches = PublicProfile.crewArr(profil.facets);
        const fiche = fiches && fiches[0];
        if(!fiche) return;
        ProfileGear.migrer(fiche);
        const verser = (source, cible) => {
            (Array.isArray(source) ? source : []).forEach(x => {
                const v = String(x || '').trim();
                if(v && !cible.some(c => String(c).toLowerCase() === v.toLowerCase())) cible.push(v);
            });
        };
        if(!fiche.cameras.length) { verser(profil.cameras, fiche.cameras); verser(profil.otherEquipment, fiche.cameras); }
        if(!fiche.lenses.length) verser(profil.lenses, fiche.lenses);
    },

    blocHtml: () => ProfileGear._sousBloc('cam', '🎥 Caméras', 'Ajouter une caméra')
                  + ProfileGear._sousBloc('obj', '🔭 Séries d\'objectifs', 'Ajouter une série'),

    _sousBloc: (quoi, titre, invite) => {
        const opts = '<option value="">— ' + invite + ' —</option>'
            + ProfileGear._options(quoi).map(o => '<option value="' + Utils.escape(o) + '">' + Utils.escape(o) + '</option>').join('')
            + '<option value="__custom__">➕ Autre…</option>';
        return '<div class="fid-field" style="margin-bottom:10px;">'
            + '<span class="fid-label">' + titre + '</span>'
            + '<div id="pgr-' + quoi + '-list" style="display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 8px;"></div>'
            + '<div style="display:flex; gap:8px; align-items:center;">'
            +   '<select class="actor-input" id="pgr-' + quoi + '-select" style="flex:1; min-width:0;">' + opts + '</select>'
            +   '<button type="button" class="btn btn--primary btn--sm" onclick="app.ProfileGear.ajouter(\'' + quoi + '\')">+</button>'
            + '</div>'
        + '</div>';
    },

    render: () => {
        const obj = ProfileGear._cible();
        if(!obj) return;
        ['cam', 'obj'].forEach(quoi => {
            const bac = document.getElementById('pgr-' + quoi + '-list');
            // Pas d'editeur a l'ecran = pas cette donnee-la sur cette fiche. On
            // n'y touche pas : ecrire un tableau vide poserait une cle parasite
            // sur la casquette comedien, qui n'a pas de materiel.
            if(!bac) return;
            const liste = obj[ProfileGear._cle(quoi)] || [];
            bac.innerHTML = liste.length ? liste.map((nom, i) =>
                '<span style="display:inline-flex; align-items:center; gap:6px; background:var(--panel-bg); border:1px solid var(--border); border-radius:14px; padding:3px 10px; font-size:0.82rem;">'
                + '<strong>' + Utils.escape(nom) + '</strong>'
                + '<span onclick="app.ProfileGear.retirer(\'' + quoi + '\', ' + i + ')" style="cursor:pointer; color:var(--danger);">✖</span>'
                + '</span>').join('')
                : '<span style="color:var(--text-sec); font-size:0.85rem;">Rien pour l\'instant</span>';
        });
    },

    ajouter: async (quoi) => {
        const obj = ProfileGear._cible();
        const sel = document.getElementById('pgr-' + quoi + '-select');
        if(!obj || !sel) return;
        let nom = sel.value;
        if(!nom) return;
        if(nom === '__custom__') {
            // ATTENDU (await) : la saisie est asynchrone. Sans cela on
            // enregistrerait « [object Promise] », defaut deja rencontre en v600
            // sur les postes saisis a la main.
            nom = await ConfirmModal.prompt(
                quoi === 'cam' ? 'Modèle de caméra :' : 'Série d\'objectifs :',
                quoi === 'cam' ? 'Ajouter une caméra' : 'Ajouter une série',
                quoi === 'cam' ? 'Ex : Bolex H16…' : 'Ex : Lomo Round Front…');
            if(!nom || !nom.trim()) { sel.value = ''; return; }
            nom = nom.trim();
        }
        const cle = ProfileGear._cle(quoi);
        if(!Array.isArray(obj[cle])) obj[cle] = [];
        if(obj[cle].some(x => String(x).toLowerCase() === nom.toLowerCase())) {
            Utils.toast(quoi === 'cam' ? 'Cette caméra est déjà dans la liste.' : 'Cette série est déjà dans la liste.', 'warning');
            sel.value = '';
            return;
        }
        obj[cle].push(nom);
        sel.value = '';
        ProfileGear.render();
    },

    retirer: (quoi, i) => {
        const obj = ProfileGear._cible();
        const cle = ProfileGear._cle(quoi);
        if(!obj || !Array.isArray(obj[cle])) return;
        obj[cle].splice(i, 1);
        ProfileGear.render();
    },
  };
