
// --- MODULE FICHELINKS (v580 : le lien scene <-> fiche passe par l'identifiant) ---
// Jusqu'ici le lien passait par le NOM : s.perso etait du texte libre
// (« MARIE; PAUL ») et le decor etait DEVINE en decoupant le titre de la
// scene. Renommer une fiche cassait donc tous les liens — d'ou le garde-fou
// qui interdisait le renommage depuis la fiche. Desormais chaque scene porte
// la SOURCE DE VERITE en identifiants : s.persoIds (fiches personnage) et
// s.locationId (fiche decor). Les champs texte s.perso et s.location ne sont
// plus que des CACHES d'affichage, regeneres depuis les identifiants — les
// dizaines de lectures de s.perso dans le fichier restent donc justes sans
// etre touchees. Renommer une fiche se repercute partout : sequencier,
// scenario, depouillement, feuille de service.
const FicheLinks = {
    // Decoupe un champ perso en noms — memes separateurs que syncCharacters.
    splitNames: (text) => String(text || '').split(/[,;]|\bet\b/i).map(n => n.trim()).filter(n => n.length),

    findChar: (name) => {
        const t = String(name || '').trim().toLowerCase();
        if(!t) return null;
        return (state.data.characters || []).find(c => c && String(c.name || '').trim().toLowerCase() === t) || null;
    },

    // Retrouve OU CREE la fiche personnage, meme forme que syncCharacters :
    // saisir un nom inconnu cree la fiche, c'est la regle actuelle (le
    // chantier 3 « pas de creation automatique » ne vise que les decors).
    ensureChar: (name) => {
        let c = FicheLinks.findChar(name);
        if(!c) {
            if(!Array.isArray(state.data.characters)) state.data.characters = [];
            c = { id: 'char_' + Utils.generateUniqueId(), name: String(name).trim(), bio: "", group_id: "", gender: "" };
            state.data.characters.push(c);
        }
        return c;
    },

    charName: (id) => {
        const c = (state.data.characters || []).find(x => x && x.id === id);
        return c ? c.name : null;
    },

    // CACHE : reconstruit s.perso depuis les identifiants. Les ids dont la
    // fiche a disparu sont purges au passage.
    refreshPerso: (scene) => {
        if(!scene || !Array.isArray(scene.persoIds)) return;
        const names = [];
        scene.persoIds = scene.persoIds.filter(id => {
            const n = FicheLinks.charName(id);
            if(n === null) return false;
            names.push(n);
            return true;
        });
        scene.perso = names.join('; ');
    },

    // SOURCE : recalcule les identifiants depuis le texte de s.perso, en
    // creant les fiches inconnues. Ne touche PAS au texte : c'est la brique
    // de la migration douce (aucun changement visible au premier passage).
    syncIdsFromText: (scene) => {
        if(!scene) return;
        const ids = [];
        FicheLinks.splitNames(scene.perso).forEach(n => {
            const c = FicheLinks.ensureChar(n);
            if(c && c.id && !ids.includes(c.id)) ids.push(c.id);
        });
        scene.persoIds = ids;
    },

    // Saisie du champ perso par l'utilisateur : le texte fait foi une fois,
    // les ids sont poses, puis le cache repart des noms canoniques des fiches.
    setPersoFromText: (scene, text) => {
        if(!scene) return;
        scene.perso = String(text == null ? '' : text).trim();
        FicheLinks.syncIdsFromText(scene);
        FicheLinks.refreshPerso(scene);
    },

    // Ajoute UN personnage (par id) a une scene, sans toucher aux autres.
    addCharToScene: (scene, charId) => {
        if(!scene || !charId) return;
        if(!Array.isArray(scene.persoIds)) FicheLinks.syncIdsFromText(scene);
        if(!scene.persoIds.includes(charId)) scene.persoIds.push(charId);
        FicheLinks.refreshPerso(scene);
    },

    findLoc: (name) => {
        const t = String(name || '').trim().toLowerCase();
        if(!t) return null;
        return (state.data.locations || []).find(l => l && String(l.name || '').trim().toLowerCase() === t) || null;
    },

    // DECOR : pose s.locationId depuis le decor effectif de la scene
    // (surcharge explicite s.location, sinon titre — c'est PlanningFDS.decor
    // qui arbitre, comme partout). CHANTIER 3 (v580) : cette resolution NE
    // CREE PLUS JAMAIS de fiche — un meme decor peut servir plusieurs lieux
    // de scene, la creation est un geste explicite (bouton « ➕ Décor »).
    // Le mot LIEU du titre par defaut n'est pas un decor : jamais de lien.
    resolveDecor: (scene) => {
        if(!scene) return;
        const name = String(PlanningFDS.decor(scene) || '').trim();
        if(!name || name.toUpperCase() === 'LIEU') { scene.locationId = null; return; }
        const l = FicheLinks.findLoc(name);
        scene.locationId = l ? l.id : null;
    },

    // CREATION EXPLICITE d'un decor (chantier 3). Retourne la fiche (ou
    // l'existante si le nom est deja pris — jamais de doublon). Relie au
    // passage les scenes encore sans lien dont le decor porte ce nom.
    createDecor: (name) => {
        const t = String(name || '').trim();
        if(!t || t.toUpperCase() === 'LIEU') return null;
        const existed = FicheLinks.findLoc(t);
        if(existed) return existed;
        if(!Array.isArray(state.data.locations)) state.data.locations = [];
        const l = { id: 'loc_' + Utils.generateUniqueId(), name: t.toUpperCase(), desc: "", group_id: "" };
        state.data.locations.push(l);
        History.log('ADD', `Ajout décor : ${l.name}`, { target: { kind: 'location', id: l.id, label: l.name }, link: { kind: 'location', id: l.id } });
        (state.data.scenes || []).forEach(s => {
            if(s && (s.locationId === undefined || s.locationId === null)) FicheLinks.resolveDecor(s);
        });
        return l;
    },

    // Bouton « ➕ Décor » de la fiche scene : le lieu du champ en cours de
    // saisie prime sur le titre enregistre (c'est lui que l'utilisateur
    // vient de taper) ; le titre est committe si besoin par le meme geste
    // que la validation du champ, et le selecteur 🏠 se rafraichit SANS
    // fermer la fiche (demande explicite).
    createDecorFromScene: (sceneId) => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('location')) return;
        const sc = (state.data.scenes || []).find(x => x && String(x.id) === String(sceneId));
        if(!sc) return;
        const inp = document.getElementById('fsc-loc');
        const tp = Utils.sceneTitleParts(sc.title);
        const name = String((inp && inp.value) || tp.loc || '').trim();
        if(!name || name.toUpperCase() === 'LIEU') { Utils.toast('Entrez d\'abord un lieu.', 'warning'); return; }
        const existed = FicheLinks.findLoc(name);
        const l = existed || FicheLinks.createDecor(name);
        if(!l) return;
        if(inp && String(inp.value || '').trim() && String(inp.value).trim().toUpperCase() !== String(tp.loc || '').toUpperCase()) {
            // Le champ porte un lieu pas encore valide : on le committe, et
            // setSceneTitlePart resout le lien en trouvant la fiche neuve.
            CardModal.setSceneTitlePart(String(sc.id), 'loc', inp.value);
        } else {
            sc.locationId = l.id;
            Store.save();
        }
        FicheLinks.refreshDecorSelect(sc);
        try { GroupDnD.rerender('locations'); } catch(e) {}
        Utils.toast(existed ? `Décor « ${l.name} » existait déjà : lié à la scène.` : `Décor « ${l.name} » créé et lié à la scène.`, 'success');
    },

    // Bouton « ➕ Décor » de la modale BeatBoard : la scene n'existe pas
    // encore, on ne cree que la fiche — le lien se posera a l'ajout de la
    // scene (resolveDecor de la fabrique la trouvera).
    createDecorFromBeatBoard: () => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('location')) return;
        const inp = document.getElementById('bb-inpLoc');
        const name = inp ? String(inp.value || '').trim() : '';
        if(!name) { Utils.toast('Entrez d\'abord un lieu.', 'warning'); return; }
        const existed = FicheLinks.findLoc(name);
        const l = existed || FicheLinks.createDecor(name);
        if(!l) return;
        Store.save();
        Utils.toast(existed ? `Décor « ${l.name} » existe déjà.` : `Décor « ${l.name} » créé.`, 'success');
    },

    // Reconstruit le selecteur 🏠 Décor de la fiche scene en place — memes
    // options et meme selection que le rendu d'origine de la fiche.
    refreshDecorSelect: (sc) => {
        const sel = document.getElementById('fsc-decor');
        if(!sel || !sc) return;
        const decor = PlanningFDS.decor(sc);
        const names = (state.data.locations || []).map(l => l.name).filter(Boolean);
        if(decor && !names.includes(decor)) names.unshift(decor);
        sel.innerHTML = '<option value="">-- déduit du titre --</option>' + names.map(n => `<option value="${Utils.escape(n)}" ${decor === n ? 'selected' : ''}>${Utils.escape(n)}</option>`).join('');
    },

    // ===== LECTURES PAR IDENTIFIANT (audit v580 : « tout par id ») =====
    // La scene connait ses fiches par identifiant ; le nom ne sert plus que
    // de repli pour une donnee jamais migree. Ces trois lecteurs remplacent
    // les comparaisons de noms dispersees dans le fichier.
    sceneHasChar: (scene, ch) => {
        if(!scene || !ch) return false;
        if(ch.id && Array.isArray(scene.persoIds) && scene.persoIds.includes(ch.id)) return true;
        const nm = String(ch.name || '').trim().toLowerCase();
        if(!nm || !scene.perso) return false;
        return scene.perso.split(/[,;]|\bet\b/i).map(n => n.trim().toLowerCase()).includes(nm);
    },
    charsOfScene: (scene) => {
        if(!scene) return [];
        const out = [];
        if(Array.isArray(scene.persoIds)) {
            scene.persoIds.forEach(cid => { const c = (state.data.characters || []).find(x => x && x.id === cid); if(c && !out.includes(c)) out.push(c); });
        }
        // Repli : noms du champ perso que les ids ne couvrent pas (donnee ancienne).
        FicheLinks.splitNames(scene.perso).forEach(n => { const c = FicheLinks.findChar(n); if(c && !out.includes(c)) out.push(c); });
        return out;
    },
    locOfScene: (scene) => {
        if(!scene) return null;
        if(scene.locationId) {
            const l = (state.data.locations || []).find(x => x && x.id === scene.locationId);
            if(l) return l;
        }
        return FicheLinks.findLoc(PlanningFDS.decor(scene));
    },

    // ===== CHANTIER 4 : GROUPE AUTOMATIQUE « SANS SCENE » =====
    // Une fiche (personnage, comedien, decor, ressource) qui n'apparait dans
    // aucune scene bascule dans un groupe automatique de son onglet, pour
    // etre retrouvee et supprimee facilement. Elle ne peut pas etre rangee
    // ailleurs tant qu'elle est sans scene — sauf a cocher l'exemption
    // « Classement manuel » (item.keepGroup) sur sa fiche.
    inAnyScene: (kind, id) => {
        if(!kind || !id) return true; // dans le doute, ne jamais sequestrer.
        try { return (UI.scenesForFiche(kind, id) || []).length > 0; }
        catch(e) { return true; }
    },

    // La collection -> la famille de fiche, pour les quatre onglets vises.
    KIND4: { characters: 'character', actors: 'actor', locations: 'location', resources: 'resource' },

    // Vrai si la fiche doit etre sequestree dans « Sans scène ».
    isSansScene: (coll, item) => {
        const kind = FicheLinks.KIND4[coll];
        if(!kind || !item || !item.id || item.keepGroup) return false;
        return !FicheLinks.inAnyScene(kind, item.id);
    },

    setKeepGroup: (coll, id, val) => {
        const kind = FicheLinks.KIND4[coll];
        if(kind && typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche(kind)) return;
        const it = (state.data[coll] || []).find(x => x && x.id === id);
        if(!it) return;
        if(val) it.keepGroup = true; else delete it.keepGroup;
        Store.save();
        if(coll === 'resources') { try { Resources.render(); } catch(e) {} }
        else { try { GroupDnD.rerender(coll); } catch(e) {} }
    },

    // Case « Classement manuel », affichee sur la fiche quand elle est sans
    // scene (ou deja exemptee, pour pouvoir decocher).
    pinToggleHtml: (coll, item, isView) => {
        const kind = FicheLinks.KIND4[coll];
        if(!kind || !item || !item.id || isView) return '';
        if(!item.keepGroup && FicheLinks.inAnyScene(kind, item.id)) return '';
        return `<label style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:0.8rem; color:var(--text-sec); cursor:pointer;" onclick="event.stopPropagation()"><input type="checkbox" ${item.keepGroup ? 'checked' : ''} onchange="app.FicheLinks.setKeepGroup('${coll}', ${Utils.jsArg(String(item.id))}, this.checked)"> 📌 Classement manuel (ne pas ranger dans « Sans scène »)</label>`;
    },

    // MIGRATION, idempotente, appelee au chargement du projet juste apres
    // bdNormalizeData (meme logique : non gardee par un drapeau, elle doit
    // aussi rattraper ce qui arrive par un import ou une vieille synchro).
    // Retourne le nombre de scenes touchees pour declencher une sauvegarde.
    migrate: () => {
        let n = 0;
        try {
            ((state.data && state.data.scenes) || []).forEach(s => {
                if(!s) return;
                let touched = false;
                if(!Array.isArray(s.persoIds)) { FicheLinks.syncIdsFromText(s); touched = true; }
                // Chantier 3 : la migration LIE aux fiches existantes, elle
                // n'en cree plus (les projets anciens ont deja leurs decors,
                // crees par syncLocations a chaque ouverture de l'onglet).
                if(s.locationId === undefined) { FicheLinks.resolveDecor(s); touched = true; }
                if(touched) n++;
            });
        } catch(e) { console.warn('FicheLinks.migrate:', e); }
        return n;
    },

    // ===== RENOMMAGE — le coeur du chantier =====
    renameCharacter: (id, newNameRaw) => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('character')) return false;
        const c = (state.data.characters || []).find(x => x && x.id === id);
        if(!c) return false;
        const newName = String(newNameRaw == null ? '' : newNameRaw).trim();
        if(!newName) { Utils.toast('Le nom ne peut pas être vide.', 'warning'); FicheLinks.rerender('characters'); return false; }
        if(newName === c.name) return true;
        const dbl = (state.data.characters || []).find(x => x && x.id !== id && String(x.name || '').trim().toLowerCase() === newName.toLowerCase());
        if(dbl) { Utils.toast('Un personnage porte déjà ce nom.', 'warning'); FicheLinks.rerender('characters'); return false; }
        const oldName = c.name;
        c.name = newName;
        (state.data.scenes || []).forEach(s => {
            if(!s) return;
            // Cache perso des scenes liees par identifiant.
            if(Array.isArray(s.persoIds) && s.persoIds.includes(id)) FicheLinks.refreshPerso(s);
            // Etiquettes du depouillement visant cette fiche, sur TOUTES les
            // scenes : une occurrence peut exister hors du champ perso.
            if(s.breakdown && Array.isArray(s.breakdown['PERSONNAGES'])) {
                s.breakdown['PERSONNAGES'].forEach(it => { if(it && typeof it === 'object' && it.id === id) it.t = newName; });
            }
        });
        History.log('EDIT', `Personnage renommé : ${oldName} → ${newName}`, { target: { kind: 'character', id: id, label: newName }, link: { kind: 'character', id: id } });
        Store.save();
        FicheLinks.rerender('characters');
        Utils.toast(`« ${oldName} » renommé en « ${newName} » partout.`, 'success');
        RenameReview.check(oldName, newName);
        return true;
    },

    renameLocation: (id, newNameRaw) => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('location')) return false;
        const l = (state.data.locations || []).find(x => x && x.id === id);
        if(!l) return false;
        // Convention des titres de scenario : le decor s'ecrit en majuscules.
        const newName = String(newNameRaw == null ? '' : newNameRaw).trim().toUpperCase();
        if(!newName) { Utils.toast('Le nom ne peut pas être vide.', 'warning'); FicheLinks.rerender('locations'); return false; }
        if(newName === l.name) return true;
        const dbl = (state.data.locations || []).find(x => x && x.id !== id && String(x.name || '').trim().toLowerCase() === newName.toLowerCase());
        if(dbl) { Utils.toast('Un décor porte déjà ce nom.', 'warning'); FicheLinks.rerender('locations'); return false; }
        const oldName = l.name;
        const oldLow = String(oldName || '').trim().toLowerCase();
        l.name = newName;
        (state.data.scenes || []).forEach(s => {
            if(!s) return;
            // Etiquettes du depouillement, sur toutes les scenes.
            if(s.breakdown && Array.isArray(s.breakdown['DECORS-LIEUX'])) {
                s.breakdown['DECORS-LIEUX'].forEach(it => { if(it && typeof it === 'object' && it.id === id) it.t = newName; });
            }
            if(s.locationId !== id) return;
            // Surcharge explicite : le cache suit la fiche.
            if(s.location && String(s.location).trim().toLowerCase() === oldLow) s.location = newName;
            // Titre : reecrit UNIQUEMENT si son decor est exactement l'ancien
            // nom — on ne touche jamais un titre qui ne correspond pas.
            const tp = Utils.sceneTitleParts(s.title);
            if(String(tp.loc || '').trim().toLowerCase() === oldLow) {
                s.title = (tp.pre || 'EXT') + '. ' + newName + ' - ' + (tp.suff || 'JOUR');
            }
        });
        History.log('EDIT', `Décor renommé : ${oldName} → ${newName}`, { target: { kind: 'location', id: id, label: newName }, link: { kind: 'location', id: id } });
        Store.save();
        FicheLinks.rerender('locations');
        Utils.toast(`« ${oldName} » renommé en « ${newName} » partout.`, 'success');
        RenameReview.check(oldName, newName);
        return true;
    },

    // Apres un renommage, tout ce qui affiche un nom en cache doit etre
    // redessine : la grille des fiches, le sequencier, le scenario, et le
    // depouillement si c'est l'onglet ouvert (meme logique que CardModal.close).
    rerender: (coll) => {
        try { GroupDnD.rerender(coll); } catch(e) {}
        try { UI.renderBoard(); } catch(e) {}
        try { UI.renderScript(); } catch(e) {}
        try {
            const activeTab = document.querySelector('.tab-content.active');
            if(activeTab && activeTab.id === 'tab-breakdown' && typeof Breakdown !== 'undefined' && Breakdown.init) Breakdown.init();
        } catch(e) {}
        // Fiche ouverte en modale : son contenu porte l'ancien nom, on la
        // reconstruit si c'est la collection concernee.
        try {
            if(CardModal.currentType === coll && CardModal.currentId != null && typeof UI.openFiche === 'function') {
                const kind = coll === 'characters' ? 'character' : (coll === 'locations' ? 'location' : null);
                if(kind) UI.openFiche(kind, CardModal.currentId);
            }
        } catch(e) {}
    }
};
