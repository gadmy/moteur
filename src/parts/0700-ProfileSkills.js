
  // ===== LANGUES ET SPORTS AVEC NIVEAUX (v600) =====
  // Ces listes servent la RECHERCHE de l'Univers : elles ne sont pas un
  // decor. Elles vivaient dans l'ancien formulaire de profil, supprime en
  // v600 ; elles reviennent ici sous forme de BRIQUE de fiche, greffee sur la
  // fiche de profil (comedien et technicien), comme prevu au RESTE A FAIRE.
  // CE QUI EST EDITE : la COPIE en cours (PublicProfile._engineProfile), jamais
  // le profil reel — c'est « Enregistrer » qui commet, comme pour tout le reste
  // de la fiche.
  // DEUX ECRITURES A CHAQUE CHANGEMENT, et c'est volontaire :
  //   - languagesWithLevels / sportsWithLevels : la liste detaillee, affichee ;
  //   - languages / sports : le MEME contenu en texte libre.
  // Le texte libre reste la reference pour l'Univers, les autres ecrans et les
  // PDF, qui ne connaissent que lui. Le desynchroniser reviendrait a rendre un
  // profil introuvable alors qu'il est rempli.
  const ProfileSkills = {
    LANGUES: ['Français', 'Anglais', 'Espagnol', 'Allemand', 'Italien', 'Portugais', 'Arabe',
              'Chinois', 'Japonais', 'Russe', 'Néerlandais', 'Polonais', 'Turc', 'Coréen',
              'Hindi', 'Occitan', 'Breton', 'Corse', 'Catalan', 'Langue des signes (LSF)'],
    SPORTS: ['Équitation', 'Natation', 'Arts martiaux', 'Danse', 'Yoga', 'Tennis', 'Football',
             'Basketball', 'Rugby', 'Boxe', 'Escalade', 'Ski', 'Snowboard', 'Surf', 'Cyclisme',
             'Course à pied', 'Gymnastique', 'Escrime', 'Tir', 'Tir à l\'arc', 'Conduite sportive',
             'Moto', 'Plongée', 'Voile', 'Aviron', 'Patinage', 'Roller', 'Skateboard', 'Parachutisme',
             'Chant', 'Instrument de musique', 'Jonglage', 'Acrobatie', 'Trapèze'],
    languageLevels: {
        'notions': '📘 Notions',
        'intermediaire': '📗 Intermédiaire',
        'courant': '📙 Courant',
        'bilingue': '📕 Bilingue',
        'maternelle': '🏠 Maternelle'
    },
    sportLevels: {
        'debutant': '🌱 Débutant',
        'amateur': '⭐ Amateur',
        'confirme': '⭐⭐ Confirmé',
        'competition': '🏆 Compétition',
        'professionnel': '👑 Pro'
    },

    // La fiche de profil edite une copie ; hors de ce mode, rien a faire.
    _cible: () => PublicProfile._engineProfile || null,
    _cle: (quoi) => quoi === 'lang' ? 'languagesWithLevels' : 'sportsWithLevels',
    _cleTexte: (quoi) => quoi === 'lang' ? 'languages' : 'sports',
    _niveaux: (quoi) => quoi === 'lang' ? ProfileSkills.languageLevels : ProfileSkills.sportLevels,

    // Texte libre reconstruit depuis la liste : « Anglais (courant), Espagnol (notions) ».
    _texte: (liste) => (liste || []).map(x => x.name + ' (' + x.level + ')').join(', '),

    // MIGRATION DOUCE, reprise de l'ancien module : un profil qui n'a que du
    // texte libre retrouve des entrees avec un niveau par defaut, sans quoi
    // ouvrir la fiche donnerait une liste vide au-dessus d'un texte rempli.
    migrer: (obj) => {
        if(!obj) return;
        if(obj.languages && typeof obj.languages === 'string' && !Array.isArray(obj.languagesWithLevels)) {
            obj.languagesWithLevels = ProfileSkills._depuisTexte(obj.languages, 'courant');
        }
        if(obj.sports && typeof obj.sports === 'string' && !Array.isArray(obj.sportsWithLevels)) {
            obj.sportsWithLevels = ProfileSkills._depuisTexte(obj.sports, 'confirme');
        }
    },
    // « Anglais (courant), Espagnol » -> entrees avec niveau. Le niveau ecrit
    // entre parentheses est repris quand il fait partie des niveaux connus.
    _depuisTexte: (texte, defaut) => String(texte).split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s);
        const nom = m ? m[1].trim() : s;
        const niv = m ? m[2].trim().toLowerCase() : '';
        const connus = Object.assign({}, ProfileSkills.languageLevels, ProfileSkills.sportLevels);
        return { name: nom, level: connus[niv] ? niv : defaut };
    }),

    // HTML de la brique. avecSports : seulement pour la casquette comedien —
    // les sports appartiennent au comedien, pas au poste technique.
    blocHtml: (avecSports) => {
        let h = ProfileSkills._sousBloc('lang', '🗣️ Langues parlées', 'Ajouter une langue', ProfileSkills.LANGUES, 'courant');
        if(avecSports) h += ProfileSkills._sousBloc('sport', '🏃 Sports & compétences', 'Ajouter un sport', ProfileSkills.SPORTS, 'confirme');
        return h;
    },
    _sousBloc: (quoi, titre, invite, options, defaut) => {
        const niveaux = ProfileSkills._niveaux(quoi);
        const opts = '<option value="">— ' + invite + ' —</option>'
            + options.map(o => '<option value="' + Utils.escape(o) + '">' + Utils.escape(o) + '</option>').join('')
            + '<option value="__custom__">➕ Autre…</option>';
        const nivOpts = Object.keys(niveaux).map(k =>
            '<option value="' + k + '"' + (k === defaut ? ' selected' : '') + '>' + Utils.escape(niveaux[k]) + '</option>').join('');
        return '<div class="fid-field" style="margin-bottom:10px;">'
            + '<span class="fid-label">' + titre + '</span>'
            + '<div id="psk-' + quoi + '-list" style="display:flex; flex-wrap:wrap; gap:8px; margin:6px 0 8px;"></div>'
            + '<div style="display:flex; gap:8px; align-items:center;">'
            +   '<select class="actor-input" id="psk-' + quoi + '-select" style="flex:1; min-width:0;">' + opts + '</select>'
            +   '<select class="actor-input" id="psk-' + quoi + '-level" style="width:auto;">' + nivOpts + '</select>'
            +   '<button type="button" class="btn btn--primary btn--sm" onclick="app.ProfileSkills.ajouter(\'' + quoi + '\')">+</button>'
            + '</div>'
        + '</div>';
    },

    // Redessine les puces ET remet le texte libre a jour. Appelee apres chaque
    // ajout / retrait, et une fois a l'ouverture de la fiche.
    render: () => {
        const obj = ProfileSkills._cible();
        if(!obj) return;
        ['lang', 'sport'].forEach(quoi => {
            const bac = document.getElementById('psk-' + quoi + '-list');
            // Pas d'editeur a l'ecran = pas cette donnee-la sur cette fiche (les
            // sports sont du comedien). On n'y touche pas : ecrire un texte vide
            // poserait une cle parasite sur la casquette technicien.
            if(!bac) return;
            const liste = obj[ProfileSkills._cle(quoi)] || [];
            obj[ProfileSkills._cleTexte(quoi)] = ProfileSkills._texte(liste);
            const niveaux = ProfileSkills._niveaux(quoi);
            bac.innerHTML = liste.length ? liste.map((x, i) =>
                '<span style="display:inline-flex; align-items:center; gap:6px; background:var(--panel-bg); border:1px solid var(--border); border-radius:14px; padding:3px 10px; font-size:0.82rem;">'
                + '<strong>' + Utils.escape(x.name) + '</strong>'
                + '<span style="color:var(--text-sec);">' + Utils.escape(niveaux[x.level] || x.level) + '</span>'
                + '<span onclick="app.ProfileSkills.retirer(\'' + quoi + '\', ' + i + ')" style="cursor:pointer; color:var(--danger);">✖</span>'
                + '</span>').join('')
                : '<span style="color:var(--text-sec); font-size:0.85rem;">Rien pour l\'instant</span>';
        });
    },

    ajouter: async (quoi) => {
        const obj = ProfileSkills._cible();
        const sel = document.getElementById('psk-' + quoi + '-select');
        const niv = document.getElementById('psk-' + quoi + '-level');
        if(!obj || !sel) return;
        let nom = sel.value;
        if(!nom) return;
        if(nom === '__custom__') {
            nom = await ConfirmModal.prompt(
                quoi === 'lang' ? 'Nom de la langue :' : 'Nom du sport ou de la compétence :',
                quoi === 'lang' ? 'Ajouter une langue' : 'Ajouter une compétence',
                quoi === 'lang' ? 'Ex : Mandarin…' : 'Ex : Trampoline…');
            if(!nom || !nom.trim()) { sel.value = ''; return; }
            nom = nom.trim();
        }
        const cle = ProfileSkills._cle(quoi);
        if(!Array.isArray(obj[cle])) obj[cle] = [];
        if(obj[cle].some(x => String(x.name).toLowerCase() === nom.toLowerCase())) {
            Utils.toast(quoi === 'lang' ? 'Cette langue est déjà dans la liste.' : 'Ce sport est déjà dans la liste.', 'warning');
            sel.value = '';
            return;
        }
        obj[cle].push({ name: nom, level: (niv && niv.value) || (quoi === 'lang' ? 'courant' : 'confirme') });
        sel.value = '';
        ProfileSkills.render();
    },

    retirer: (quoi, i) => {
        const obj = ProfileSkills._cible();
        const cle = ProfileSkills._cle(quoi);
        if(!obj || !Array.isArray(obj[cle])) return;
        obj[cle].splice(i, 1);
        ProfileSkills.render();
    },
  };
