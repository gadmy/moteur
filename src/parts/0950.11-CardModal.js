
const CardModal = {
    currentType: null,
    currentIdx: null,
    
    // Verrou de lecture seule de la FENETRE, pose par chaque ouverture selon la
    // famille de la fiche. La fenetre ne vit pas dans l'onglet actif : elle
    // echappait donc au verrou pose par switchTab, et une fiche ouverte depuis
    // un onglet en 👁️ apparaissait modifiable. Appele par les sept portes.
    applyRights: (kind) => {
        const body = document.getElementById('card-edit-modal-body');
        if(!body) return true;
        const ok = (typeof Permissions === 'undefined' || !Permissions.canEditFiche) ? true : Permissions.canEditFiche(kind);
        const b = body.querySelector('.perm-ro-banner');
        if(b) b.remove();
        body.classList.toggle('is-perm-readonly', !ok);
        if(!ok) {
            const d = document.createElement('div');
            d.className = 'perm-ro-banner';
            d.textContent = '👁 Lecture seule — vous n\'avez pas les droits de modification sur cette fiche.';
            body.prepend(d);
        }
        return ok;
    },
    
    open: (type, idx) => {
        const item = state.data[type][idx];
        if(!item) return;
        // v601 — C'EST UNE PORTE. On y entrait sans rien prendre : cliquer une
        // vignette de Casting ou de Decors n'allumait donc rien chez les
        // autres, alors que UI.openFiche — l'autre chemin vers la meme fiche —
        // prenait bien le verrou. Deux entrees pour une meme piece, une seule
        // gardee.
        {
            const esp = { characters: 'character', actors: 'actor', locations: 'location' }[type];
            const nom = { characters: 'Ce personnage', actors: 'Cette fiche comédien', locations: 'Ce décor' }[type];
            if(esp) {
                try { if(typeof FicheLock !== 'undefined'
                         && FicheLock.ouvrir(esp, item.id, nom) === false) return; } catch(e) {}
            }
        }
        CardModal.currentType = type;
        CardModal.currentIdx = idx;
        CardModal.currentId = item.id;
        
        const modal = document.getElementById('card-edit-modal');
        const title = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        
        const typeLabels = { characters: '🎭 Personnage', actors: '🎬 Comédien·ne', locations: '🏠 Décor' };
        // v581 : personnage, comedien et decor portent leur propre en-tete
        // (nom + type + numero de fiche) dans le gabarit universel — la barre
        // de la fenetre ne repete que la famille.
        title.textContent = typeLabels[type];
        
        // Réutiliser le même code que les fiches détaillées
        const tempContainer = document.createElement('div');
        tempContainer.className = 'data-grid';
        
        let groupType = '';
        if(type === 'characters') groupType = 'perso';
        else if(type === 'actors') groupType = 'actor';
        else if(type === 'locations') groupType = 'lieu';
        const relevantGroups = state.data.groups.filter(g => g.type === groupType);
        
        // Utiliser exactement le même rendu que le mode détaillé
        // Le rendu de la carte consulte lui-meme le droit de la SECTION
        // D'ORIGINE (voir renderDataCards) : rien a lui imposer ici.
        UI.renderDataCards([item], type, tempContainer, relevantGroups);
        
        // Extraire et adapter la carte pour le modal
        const cardContent = tempContainer.querySelector('.data-card');
        body.innerHTML = '';
        if(cardContent) {
            cardContent.style.border = 'none';
            cardContent.style.boxShadow = 'none';
            cardContent.style.maxWidth = 'none';
            cardContent.style.margin = '0';
            body.appendChild(cardContent);
        }
        
        CardModal.applyRights({ characters: 'character', actors: 'actor', locations: 'location' }[type]);
        modal.classList.add('visible');
        // v581 : les fiches en briques (fid-blocks) sont equilibrees par
        // hauteur une fois visibles (mesure reelle du DOM).
        requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
        
        // Initialiser les calendriers si nécessaire
        if(type === 'actors') {
            setTimeout(() => {
                const calContainer = document.getElementById('actor-calendar-' + idx);
                if(calContainer && state.currentRole !== 'viewer') {
                    UI.renderAvailabilityCalendar('actor-calendar-' + idx, 'actor', idx);
                }
            }, 100);
        }
    },
    
    close: () => {
        const modal = document.getElementById('card-edit-modal');
        Utils.fermetureDouce(modal);   // v601 : elle s'en va en fondu
        CardModal.currentType = null;
        CardModal.currentIdx = null;
        CardModal.currentId = null;
        // Rafraîchir les vues compactes après fermeture
        const activeTab = document.querySelector('.tab-content.active');
        if(activeTab) {
            const tabId = activeTab.id;
            if(tabId === 'tab-chars') UI.renderDataTab('characters', els.charContainer);
            else if(tabId === 'tab-actors') UI.renderDataTab('actors', els.actorContainer);
            else if(tabId === 'tab-locs') UI.renderDataTab('locations', els.locContainer);
            else if(tabId === 'tab-crew') UI.renderCrewTab();
            // 7d : une fiche peut desormais s'ouvrir depuis le depouillement
            // sans changer d'onglet. Si son nom a ete modifie, les etiquettes
            // et les infobulles doivent suivre.
            else if(tabId === 'tab-breakdown' && typeof Breakdown !== 'undefined' && Breakdown.init) Breakdown.init();
            // Idem pour le storyboard : renommer un plan depuis sa fiche doit se
            // voir sur sa carte, sans quoi l'ancien nom reste a l'ecran.
            else if(tabId === 'tab-storyboard' && typeof Storyboard !== 'undefined' && Storyboard.renderShots && Storyboard.currentSceneId) {
                try { Storyboard.renderShots(); } catch(e) { console.error('CardModal.close/renderShots', e); }
            }
        }
    },
    
    // Fiche de scène. Le séquencier, la feuille de service et le PDF lisent
    // tous le résumé, les personnages, la durée, le décor et le jour de récit
    // d'une scène, mais rien ne permettait de les corriger sans repasser par le
    // formulaire du séquencier — d'où les cases rouges non cliquables de la
    // feuille. Écrit champ par champ, sans jamais remplacer l'objet scène.
    openScene: (id) => {
        const scenes = state.data.scenes || [];
        const idx = scenes.findIndex(x => x && String(x.id) === String(id));
        if(idx < 0) { Utils.toast('Scène introuvable.', 'error'); return; }
        const sc = scenes[idx];
        CardModal.currentType = 'scenes';
        CardModal.currentIdx = idx;
        CardModal.currentId = sc.id;
        const modal = document.getElementById('card-edit-modal');
        const titleEl = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        // Une scene appartient au sequencier : c'est son droit qui commande,
        // pas seulement le role global.
        const dis = (typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('scene')) ? 'disabled' : '';
        const decor = PlanningFDS.decor(sc);
        const names = (state.data.locations || []).map(l => l.name).filter(Boolean);
        if(decor && !names.includes(decor)) names.unshift(decor);
        // v581/v582 : la barre de la fenetre ne repete que la famille, le nom
        // vit dans l'en-tete du gabarit universel (FicheUI.headHtml).
        if(titleEl) titleEl.textContent = '🎬 Scène';
        // Le titre d'une scene n'est pas un texte libre : c'est un triptyque
        // effet / decor / moment, ecrit « INT. CUISINE - JOUR » par convention.
        // Il n'etait editable que par la bande de saisie du sequencier ; depuis
        // le 26 aout cette bande n'existe plus et la fiche porte les trois
        // morceaux. Ils s'ecrivent au fil de l'eau comme le reste.
        // v582 : la fiche scene rejoint le gabarit en BRIQUES de v581 (en-tete
        // commun + carres gris repliables, equilibres apres affichage). Le nom
        // d'en-tete n'est PAS editable ici : le titre est COMPOSE du triptyque,
        // un champ libre ouvrirait une divergence avec la convention.
        const tp = Utils.sceneTitleParts(sc.title);
        const scid = Utils.escape(String(sc.id));
        const delBtn = dis ? '' : `<button onclick="app.Actions.deleteScene('${scid}')" style="color:var(--danger);border:none;background:none;cursor:pointer" title="Supprimer la scène">🗑️</button>`;
        const blocks = [];

        // Brique « Dans le projet » — epinglee en haut a droite, comme sur les
        // six autres familles : tournee le, plans, cout.
        // Plans de la scene, dans leur ordre de storyboard. Chaque pastille
        // ouvre la fiche du plan : c'est la seule facon d'y acceder sans
        // passer par l'onglet Storyboard et sa grille.
        const shots = (state.data.shots || []).filter(s => s && s.sceneId === sc.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        let plansHtml = '';
        if(shots.length) {
            const tags = shots.map((s, i) => {
                const lbl = 'Plan ' + (i + 1) + (s.name ? ' — ' + String(s.name).slice(0, 30) : '');
                return `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('shot',${Utils.jsArg(String(s.id))})" title="${Utils.escape(s.shotType || '')}">${Utils.escape(lbl)}</span>`;
            }).join(' ');
            plansHtml = `<div class="appearances-section"><span class="appearances-label">🎬 Plans (${shots.length}) :</span> ${tags}</div>`;
        }
        let projHtml = UI.renderShootDays('scene', sc.id, '📅 Tournée le') + plansHtml + UI.renderCost('scene', sc.id);
        if(!projHtml) projHtml = '<span class="text-sec-xs">Pas encore planifiée ni découpée en plans</span>';
        blocks.push(FicheUI.block('scene', 'projet', '🎬 Dans le projet', projHtml, { pin: 'right' }));

        // Brique « Titre & reperes » — le triptyque (colonnes resserrees pour
        // la demi-largeur d'une brique), la duree et le chrono.
        const idHtml = `
            <div style="display:grid; grid-template-columns:55px minmax(0,1fr) 105px; gap:8px; align-items:end; margin-bottom:10px;">
                <div>
                    <label class="form-label-block">Effet</label>
                    <input class="actor-input" id="fsc-pre" list="fsc-pre-list" placeholder="INT" data-tooltip="INT" value="${Utils.escape(tp.pre)}" onchange="app.CardModal.setSceneTitlePart('${scid}','pre',this.value)" ${dis}>
                    <datalist id="fsc-pre-list"><option value="INT"></option><option value="EXT"></option><option value="INT./EXT."></option></datalist>
                </div>
                <div class="autocomplete-wrapper" style="position:relative; margin-bottom:0;">
                    <label class="form-label-block" style="display:flex; align-items:center; gap:5px;">Décor (titre) <button type="button" onclick="app.FicheLinks.createDecorFromScene('${scid}')" ${dis} title="Enregistrer ce lieu comme nouveau décor et le lier à la scène" style="width:15px; height:15px; padding:0; border:none; border-radius:50%; background:var(--primary); color:#fff; font-size:11px; line-height:1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">+</button></label>
                    <input class="actor-input" id="fsc-loc" placeholder="LIEU" data-tooltip="LIEU" style="width:100%;" value="${Utils.escape(tp.loc)}" onchange="app.CardModal.setSceneTitlePart('${scid}','loc',this.value)" ${dis}>
                    <div id="fsc-loc-ac" class="autocomplete-list ac-fiche"></div>
                </div>
                <div>
                    <label class="form-label-block">Moment</label>
                    <input class="actor-input" id="fsc-suff" list="fsc-suff-list" placeholder="JOUR" data-tooltip="JOUR" value="${Utils.escape(tp.suff)}" onchange="app.CardModal.setSceneTitlePart('${scid}','suff',this.value)" ${dis}>
                    <datalist id="fsc-suff-list"><option value="JOUR"></option><option value="NUIT"></option><option value="AUBE"></option><option value="CRÉPUSCULE"></option><option value="MATIN"></option><option value="SOIR"></option></datalist>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; align-items:end;">
                <div>
                    <label class="form-label-block">⏱️ Durée estimée (min)</label>
                    <input class="actor-input" placeholder="Ex: 2.5" data-tooltip="Ex: 2.5" value="${Utils.escape(sc.time || '')}" onchange="app.CardModal.setSceneField('${scid}', 'time', this.value)" ${dis}>
                </div>
                <div>
                    <label class="form-label-block">📅 CHRONO — jour de récit</label>
                    <input class="actor-input" placeholder="Ex: J1, J+2, Nuit 3" data-tooltip="Ex: J1, J+2, Nuit 3" value="${Utils.escape(sc.chrono || '')}" onchange="app.CardModal.setSceneField('${scid}', 'chrono', this.value)" ${dis}>
                </div>
            </div>`;
        blocks.push(FicheUI.block('scene', 'identite', '🎞️ Titre & repères', idHtml));

        // Brique « Decor & personnages » — le lien explicite vers une fiche
        // decor (surcharge du titre) et les personnages presents.
        const liensHtml = `
            <label class="form-label-block">🏠 Décor</label>
            <select class="actor-input" id="fsc-decor" onchange="app.CardModal.setSceneField('${scid}', 'location', this.value)" ${dis} style="margin-bottom:10px;">
                <option value="">-- déduit du titre --</option>
                ${names.map(n => `<option value="${Utils.escape(n)}" ${decor === n ? 'selected' : ''}>${Utils.escape(n)}</option>`).join('')}
            </select>
            <label class="form-label-block">🎭 Personnages présents</label>
            <div class="autocomplete-wrapper" style="position:relative;">
                <input class="actor-input" id="fsc-perso" placeholder="Séparés par des points-virgules (ex: ALIX BERGER; CLARA)" data-tooltip="Séparés par des points-virgules (ex: ALIX BERGER; CLARA)" value="${Utils.escape(sc.perso || '')}" onchange="app.CardModal.setSceneField('${scid}', 'perso', this.value)" ${dis}>
                <div id="fsc-perso-ac" class="autocomplete-list ac-fiche"></div>
            </div>`;
        blocks.push(FicheUI.block('scene', 'liens', '🔗 Décor & personnages', liensHtml));

        // Brique « Resume ».
        const resumeHtml = `<textarea class="data-desc" style="min-height:90px; width:100%;" placeholder="Ce qui se passe dans la scène..." data-tooltip="Ce qui se passe dans la scène..." onchange="app.CardModal.setSceneField('${scid}', 'resume', this.value)" ${dis}>${Utils.escape(sc.resume || '')}</textarea>`;
        blocks.push(FicheUI.block('scene', 'resume', '📝 Résumé', resumeHtml));

        // v601 — LA FICHE DIT DE QUELLE SCENE ELLE PARLE. L'identifiant est pose
        // sur une ENVELOPPE a l'interieur du corps, pas sur le corps lui-meme :
        // ouvrir ensuite la fiche d'un comedien remplace ce contenu, donc
        // l'enveloppe disparait d'elle-meme. Sur le corps, l'attribut serait
        // reste en place et la fiche du comedien se serait crue verrouillee.
        if(body) body.innerHTML = '<div class="fiche-scene" data-scene-id="' + scid + '">'
            + FicheUI.headHtml({
                name: sc.title || 'Sans titre', id: sc.id, kindLabel: 'Scène', photo: '',
                badgesHtml: '', delBtnHtml: delBtn
            }) + FicheBlocks.renderTabbed(blocks, 'scene')
            + '</div>';
        CardModal.applyRights('scene');
        try { if(typeof VerrouFin !== 'undefined') VerrouFin.marquerTout(); } catch(e) {}
        if(modal) modal.classList.add('visible');
        // v581 : les briques sont equilibrees par hauteur une fois visibles
        // (mesure reelle du DOM), meme mecanique que les six autres familles.
        requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
        // AUTOCOMPLETION RECABLEE (26 aout). Elle vivait sur les champs de la
        // bande de saisie du sequencier, qui n'existe plus. Les champs de la
        // fiche etant reconstruits a chaque ouverture, l'ecouteur doit etre
        // repose a chaque fois — d'ou l'appel ici et non a l'initialisation.
        if(state.currentRole !== 'viewer') {
            const il = document.getElementById('fsc-loc');
            const ip = document.getElementById('fsc-perso');
            if(il) Utils.setupAutocomplete(il, { source: () => state.data.locations || [], listEl: document.getElementById('fsc-loc-ac'), multi: false });
            if(ip) Utils.setupAutocomplete(ip, { source: () => state.data.characters || [], listEl: document.getElementById('fsc-perso-ac'), multi: true });
        }
    },
    // Ecrit UN morceau du titre et recompose « EFFET. DECOR - MOMENT ».
    // Les trois morceaux passent en majuscules comme le faisait la bande de
    // saisie : le titre est une convention de scenario, pas une phrase libre.
    setSceneTitlePart: (id, part, value) => {
        if(state.currentRole === 'viewer') return;
        const sc = (state.data.scenes || []).find(x => x && String(x.id) === String(id));
        if(!sc) return;
        const tp = Utils.sceneTitleParts(sc.title);
        tp[part] = String(value == null ? '' : value).trim().toUpperCase();
        const titre = (tp.pre || 'EXT') + '. ' + (tp.loc || 'LIEU') + ' - ' + (tp.suff || 'JOUR');
        if(titre === sc.title) return;
        sc.title = titre;
        // v580 : le decor de la scene suit le titre — le lien par identifiant
        // est recalcule (la surcharge explicite s.location garde la main).
        FicheLinks.resolveDecor(sc);
        sc.lastModified = Date.now();
        if(state.currentUser && state.currentUser.email) sc.lastModifiedBy = state.currentUser.email;
        Store.save();
        // v582 : le titre compose vit dans l'en-tete du gabarit (fid-name),
        // la barre de la fenetre ne porte que la famille. On ne re-rend pas
        // la fiche entiere : l'utilisateur est en train de remplir le
        // triptyque, un re-rendu lui volerait le focus.
        const nameEl = document.querySelector('#card-edit-modal-body .fid-name');
        if(nameEl && nameEl.tagName !== 'INPUT') nameEl.textContent = titre;
        try { UI.renderBoard(); } catch(e) { console.error('setSceneTitlePart/renderBoard', e); }
    },
    setSceneField: (id, field, value) => {
        if(!Permissions.canEditFiche('scene')) return;
        const sc = (state.data.scenes || []).find(x => x && String(x.id) === String(id));
        if(!sc) return;
        const v = String(value == null ? '' : value).trim();
        if(String(sc[field] == null ? '' : sc[field]) === v) return;
        sc[field] = v;
        // v580 : perso et decor portent des liens par identifiant. Le texte
        // saisi fait foi une fois, les ids sont recalcules, puis le cache
        // repart des noms canoniques des fiches (le champ affiche suit).
        if(field === 'perso') {
            FicheLinks.setPersoFromText(sc, v);
            const ip = document.getElementById('fsc-perso');
            if(ip) ip.value = sc.perso || '';
        }
        if(field === 'location') FicheLinks.resolveDecor(sc);
        sc.lastModified = Date.now();
        if(state.currentUser && state.currentUser.email) sc.lastModifiedBy = state.currentUser.email;
        Store.save();
        try { UI.renderBoard(); } catch(e) { console.error('openScene/renderBoard', e); }
    },
    
    // ===== FICHE PLAN (25 aout) =====
    // Le plan etait la derniere entite du modele sans fiche : il ne vivait que
    // dans la grille du storyboard, qu'il fallait ouvrir a la bonne scene et
    // faire defiler. Or il est deja relie ailleurs — les jours de tournage
    // retiennent les plans retenus pour la journee (selectedShots) — et on veut
    // pouvoir le consulter depuis la fiche de scene ou la feuille de service.
    // ECRITURE : champ par champ, jamais par remplacement de l'objet, et via
    // Storyboard.updateShot qui porte deja le controle de permission. Le dessin
    // n'est PAS editable ici : l'editeur de dessin appartient au storyboard, le
    // dupliquer dans une modale posee sur une autre modale serait un piege.
    openShot: (id) => {
        const shots = state.data.shots || [];
        const shot = shots.find(x => x && String(x.id) === String(id));
        if(!shot) { Utils.toast('Plan introuvable.', 'error'); return; }
        CardModal.currentType = 'shots';
        CardModal.currentIdx = shots.indexOf(shot);
        CardModal.currentId = shot.id;
        const esc = Utils.escape;
        const scene = (state.data.scenes || []).find(s => s && s.id === shot.sceneId) || null;
        const sceneIdx = scene ? (state.data.scenes || []).indexOf(scene) : -1;
        // Rang du plan DANS SA SCENE : « Plan 3 » n'a de sens que rapporte a la
        // scene, pas au projet entier.
        const sisters = shots.filter(s => s && s.sceneId === shot.sceneId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const rang = sisters.indexOf(shot) + 1;
        const dis = (state.currentRole === 'viewer' || (typeof Permissions !== 'undefined' && !Permissions.canEdit('storyboard'))) ? 'disabled' : '';
        
        // Apercu : seule l'image televersee est affichable telle quelle ; un
        // dessin vit dans un canvas que seul le storyboard sait rejouer.
        let apercu = '';
        const up = (shot.drawings && shot.drawings.original && shot.drawings.original.imageUrl) || (shot.imageType === 'upload' ? shot.imageUrl : '');
        if(up) apercu = `<img src="${up}" alt="Aperçu du plan" style="width:100%; max-height:220px; object-fit:contain; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:12px;">`;
        
        // Jours de tournage ayant retenu ce plan.
        const days = (state.data.shootingDays || []).filter(d => {
            if(!d || !(d.date || d.startDate)) return false;
            return (d.scenes || []).some(sc => sc && typeof sc === 'object'
                && sc.sceneId === shot.sceneId && (sc.selectedShots || []).includes(shot.id));
        });
        const daysHtml = days.length
            ? `<div class="appearances-section"><span class="appearances-label">📅 Retenu pour (${days.length}) :</span> `
              + days.map(d => `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('day',${Utils.jsArg(String(d.id))})">${esc(String(d.date || d.startDate))}</span>`).join(' ')
              + `</div>`
            : '';
        
        const modal = document.getElementById('card-edit-modal');
        const titleEl = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        if(titleEl) titleEl.textContent = '🎬 Plan ' + (rang > 0 ? rang : '') + (shot.name ? ' — ' + shot.name : '');
        // v601 : le plan se modifie dans cette fenetre. L'identifiant y est pose
        // pour le verrou par fiche (voir FicheLock) ; l'enveloppe vit dans le
        // contenu, elle disparait donc quand on ouvre autre chose.
        if(body) body.innerHTML = `
            <div class="fiche-fenetre" data-fiche="shot:${Utils.escape(String(shot.id))}">
            ${apercu}
            <div style="padding:10px 12px; background:var(--bg); border-radius:8px; border:1px solid var(--border); margin-bottom:12px;">
                ${scene
                    ? `<span style="font-size:0.85rem; color:var(--text-sec);">Scène :</span> <span class="appearance-tag is-clickable" onclick="app.UI.openFiche('scene',${Utils.jsArg(String(scene.id))})">#${sceneIdx + 1}${scene.title ? ' — ' + esc(String(scene.title).slice(0, 50)) : ''}</span>`
                    : `<span style="font-size:0.85rem; color:var(--danger);">Ce plan n'est rattaché à aucune scène.</span>`}
                <div style="font-size:0.78rem; color:var(--text-sec); margin-top:6px;">Le dessin et les annotations se modifient dans l'onglet Storyboard.</div>
            </div>
            <label class="form-label-block">🏷️ Nom du plan</label>
            <input class="actor-input" placeholder="Ex: Arrivée en voiture" data-tooltip="Ex: Arrivée en voiture" value="${esc(shot.name || '')}" onchange="app.CardModal.setShotField(${Utils.jsArg(String(shot.id))},'name',this.value)" ${dis} style="margin-bottom:10px;">
            <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:150px;">
                    <label class="form-label-block">🎥 Type de plan</label>
                    <select class="actor-input" onchange="app.CardModal.setShotField(${Utils.jsArg(String(shot.id))},'shotType',this.value)" ${dis}>
                        <option value="">—</option>
                        ${CONFIG.shotTypes.map(t => `<option value="${esc(t)}" ${shot.shotType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1; min-width:150px;">
                    <label class="form-label-block">↔️ Mouvement</label>
                    <select class="actor-input" onchange="app.CardModal.setShotField(${Utils.jsArg(String(shot.id))},'cameraMove',this.value)" ${dis}>
                        <option value="">—</option>
                        ${CONFIG.cameraMoves.map(m => `<option value="${esc(m)}" ${shot.cameraMove === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1; min-width:150px;">
                    <label class="form-label-block">📷 Mode caméra</label>
                    <select class="actor-input" onchange="app.CardModal.setShotField(${Utils.jsArg(String(shot.id))},'cameraMode',this.value)" ${dis}>
                        <option value="">—</option>
                        ${(CONFIG.cameraModes || []).map(m => `<option value="${esc(m)}" ${shot.cameraMode === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <label class="form-label-block">📝 Description</label>
            <textarea class="data-desc" style="min-height:70px;" placeholder="Ce que montre le plan..." data-tooltip="Ce que montre le plan..." onchange="app.CardModal.setShotField(${Utils.jsArg(String(shot.id))},'description',this.value)" ${dis}>${esc(shot.description || '')}</textarea>
            <label class="form-label-block">🎭 Direction des acteurs</label>
            <textarea class="data-desc" style="min-height:60px;" onchange="app.CardModal.setShotField(${Utils.jsArg(String(shot.id))},'actorDirection',this.value)" ${dis}>${esc(shot.actorDirection || '')}</textarea>
            <label class="form-label-block">🔧 Direction technique</label>
            <textarea class="data-desc" style="min-height:60px;" onchange="app.CardModal.setShotField(${Utils.jsArg(String(shot.id))},'technicalDirection',this.value)" ${dis}>${esc(shot.technicalDirection || '')}</textarea>
            ${daysHtml}
            </div>
        `;
        CardModal.applyRights('shot');
        if(modal) modal.classList.add('visible');
    },
    setShotField: (id, field, value) => {
        if(typeof Storyboard === 'undefined' || !Storyboard.updateShot) return;
        // updateShot porte deja le refus pour lecteur et permission insuffisante.
        Storyboard.updateShot(id, field, String(value == null ? '' : value));
        // Le storyboard n'est rejoue que s'il est A L'ECRAN et sur la bonne
        // scene : le rejouer depuis un autre onglet reconstruirait une grille
        // que personne ne regarde, sur une scene qui n'est peut-etre pas celle-la.
        const shot = (state.data.shots || []).find(s => s && String(s.id) === String(id));
        const active = document.querySelector('.tab-content.active');
        if(shot && active && active.id === 'tab-storyboard' && Storyboard.currentSceneId === shot.sceneId) {
            try { Storyboard.renderShots(); } catch(e) { console.error('setShotField/renderShots', e); }
        }
    },
    
    // Ferme silencieusement la modale si elle affiche la fiche en cours de suppression
    closeIfShowing: (type, id) => {
        const modal = document.getElementById('card-edit-modal');
        if(!modal || !modal.classList.contains('visible')) return;
        if(CardModal.currentType !== type) return;
        if(id && CardModal.currentId && CardModal.currentId !== id) return;
        Utils.fermetureDouce(modal);
        CardModal.currentType = null;
        CardModal.currentIdx = null;
        CardModal.currentId = null;
    },

    // Re-render la modale si elle est ouverte (pour refléter une modif faite dans la fiche comme l'ajout d'une photo)
    refresh: () => {
        const modal = document.getElementById('card-edit-modal');
        if(!modal || !modal.classList.contains('visible')) return; // pas ouverte
        const type = CardModal.currentType;
        let idx = CardModal.currentIdx;
        if(!type || idx == null) return;
        // Re-résolution par ID : les index bougent quand une fiche est supprimée (localement ou par un collaborateur)
        const coll = type === 'crew' ? state.data.crew : state.data[type];
        if(CardModal.currentId && Array.isArray(coll)) {
            const newIdx = coll.findIndex(x => x && x.id === CardModal.currentId);
            if(newIdx === -1) { CardModal.close(); return; } // la fiche n'existe plus
            idx = newIdx;
            CardModal.currentIdx = newIdx;
        }
        if(type === 'crew') {
            // Crew utilise une autre fonction d'ouverture
            if(typeof CardModal.openCrew === 'function') CardModal.openCrew(idx);
        } else if(type === 'scenes') {
            // Les scènes aussi : rouvrir par identifiant, pas par index
            if(typeof CardModal.openScene === 'function') CardModal.openScene(CardModal.currentId);
        } else if(type === 'shots') {
            if(typeof CardModal.openShot === 'function') CardModal.openShot(CardModal.currentId);
        } else {
            CardModal.open(type, idx);
        }
    },
    
    // Rendu des cartes compactes pour l'équipe
    renderCompactCrewCards: (members, container, isView) => {
        members.forEach((member) => {
            const idx = state.data.crew.indexOf(member);
            const card = document.createElement('div');
            card.className = 'compact-card';
            if(member && member.id) card.dataset.fiche = 'crew:' + member.id;   // v601 : voir ci-dessus
            card.onclick = () => CardModal.openCrew(idx);
            if(!isView) { card.setAttribute('draggable', 'true'); card.dataset.dndColl = 'crew'; card.dataset.dndIdx = idx; }
            
            const photoContent = member.photo ? `<img src="${member.photo}" alt="Photo du membre de l'équipe">` : '👤';
            const roleInfo = member.role || '<em style="opacity:0.6">Fonction non définie</em>';
            const badge = member.publicProfileId ? (member._offline ? '🚧' : '🔒') : '';
            
            card.innerHTML = `
                ${!isView ? `
                <div class="compact-card-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); app.CardModal.openCrew(${idx})" title="Modifier">✏️</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.Crew.deleteMember(${idx})" title="Supprimer">🗑️</button>
                    ${CardModal._groupRoundHtml(member, idx, 'crew')}
                    <button class="casting-btn est-equipe" onclick="event.stopPropagation(); app.GlobalSearch.openForCrewMember(${idx})" title="Recrutement — trier les technicien·nes pour ce poste">🎥</button>
                    <button class="web-btn" onclick="event.stopPropagation(); app.Web.open('crew', '${member.id}')" title="Voir dans la toile">🕸️</button>
                </div>
                ` : ''}
                ${badge ? `<div class="compact-card-badge${member._offline ? ' card-offline' : ''}"${member._offline ? ' title="Hors ligne — masqué de l’Univers"' : ''}>${badge}</div>` : ''}
                <div class="compact-card-photo">${photoContent}</div>
                <div class="compact-card-name">${Utils.escape(member.name || 'Sans nom')}</div>
                <div class="compact-card-role">${roleInfo}</div>
            `;
            
            container.appendChild(card);
        });
    },
    
    // Ouvrir le modal pour un membre de l'équipe
    openCrew: (idx) => {
        const member = state.data.crew[idx];
        if(!member) return;
        try { if(typeof FicheLock !== 'undefined'
                 && FicheLock.ouvrir('crew', member.id, 'Cette fiche') === false) return; } catch(e) {}
        CardModal.currentType = 'crew';
        CardModal.currentIdx = idx;
        CardModal.currentId = member.id;
        
        const modal = document.getElementById('card-edit-modal');
        const title = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        
        title.textContent = '🎥 Technicien·ne';
        
        // Réutiliser le même code que les fiches détaillées
        const isView = state.currentRole === 'viewer' || !Permissions.canEdit('equipe');
        const crewGroups = state.data.groups.filter(g => g.type === 'crew');
        const cardElement = UI.createCrewCard(member, idx, crewGroups, isView);
        
        // Adapter le style pour le modal
        cardElement.style.border = 'none';
        cardElement.style.boxShadow = 'none';
        cardElement.style.maxWidth = 'none';
        cardElement.style.margin = '0';
        
        body.innerHTML = '';
        body.appendChild(cardElement);
        
        CardModal.applyRights('crew');
        modal.classList.add('visible');
        requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
        
        // Initialiser le calendrier
        setTimeout(() => {
            const calContainer = document.getElementById('crew-calendar-' + idx);
            if(calContainer && state.currentRole !== 'viewer') {
                UI.renderAvailabilityCalendar('crew-calendar-' + idx, 'crew', idx);
            }
        }, 100);
    },
    
    // CardModal.updateField retirée v569, jamais appelée.
    
    // Rendu des cartes compactes
    _groupRoundHtml: (item, idx, dataType) => {
        dataType = dataType || 'actors';
        const groupType = { actors: 'actor', crew: 'crew', characters: 'perso', locations: 'lieu', resources: 'resource', orgs: 'org' }[dataType] || 'actor';
        let opts = '<option value="">-- Groupe --</option>';
        state.data.groups.filter(g => g.type === groupType).forEach(g => { opts += `<option value="${g.id}" ${item.group_id === g.id ? 'selected' : ''}>${Utils.escape(g.name)}</option>`; });
        return `<div class="group-round-wrap" title="Changer de groupe"><button class="group-btn" type="button" tabindex="-1">👥</button><select class="group-round-select" onclick="event.stopPropagation();" onchange="event.stopPropagation(); app.Actions.changeGroup('${dataType}', ${idx}, this.value)">${opts}</select></div>`;
    },
    renderCompactCards: (items, type, container) => {
        const isView = state.currentRole === 'viewer';
        
        items.forEach((item) => {
            const idx = state.data[type].indexOf(item);
            const card = document.createElement('div');
            card.className = 'compact-card';
            // v601 — LA VIGNETTE DIT DE QUELLE FICHE ELLE PARLE. Casting et
            // Decors s'affichent par defaut en vignettes, et c'est CETTE
            // fonction qui les dessine — pas renderDataCards, qui ne sert
            // qu'au mode detaille et a la fenetre. Sans cet identifiant, le
            // cadenas n'avait nulle part ou se poser : on n'apprenait qu'une
            // fiche etait occupee qu'en essayant de l'ouvrir. Meme defaut, et
            // meme cause, que la grille du storyboard.
            {
                const esp = { characters: 'character', actors: 'actor', locations: 'location' }[type];
                if(esp && item && item.id) card.dataset.fiche = esp + ':' + item.id;
            }
            card.onclick = () => CardModal.open(type, idx);
            if(!isView) { card.setAttribute('draggable', 'true'); card.dataset.dndColl = type; card.dataset.dndIdx = idx; }
            
            let photoContent = '';
            let roleInfo = '';
            let badge = '';
            
            if(type === 'characters') {
                const linkedActor = state.data.actors.find(a => a.id === item.actor_id);
                photoContent = (linkedActor && linkedActor.photo) ? `<img src="${Utils.safeMediaUrl(linkedActor.photo)}" alt="Photo du comédien">` : '🎭';
                roleInfo = linkedActor ? Utils.escape(linkedActor.name) : '<em style="opacity:0.5">Non casté</em>';
            } else if(type === 'actors') {
                photoContent = item.photo ? `<img src="${item.photo}" alt="Photo">` : '🎬';
                const linkedChar = state.data.characters.find(c => c.actor_id === item.id);
                roleInfo = linkedChar ? '🎭 ' + Utils.escape(linkedChar.name) : '<em style="opacity:0.5">Pas de rôle</em>';
                if(item.publicProfileId) badge = item._offline ? '🚧' : '🔒';
            } else if(type === 'locations') {
                photoContent = item.photo ? `<img src="${item.photo}" alt="Photo du décor">` : '🏠';
                roleInfo = item.realLocationName ? Utils.escape(item.realLocationName) : '<em style="opacity:0.5">Lieu non défini</em>';
            }
            
            card.innerHTML = `
                ${!isView ? `
                <div class="compact-card-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); app.CardModal.open('${type}', ${idx})" title="Modifier">✏️</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.Actions.deleteDataItem('${type}', ${idx})" title="Supprimer">🗑️</button>
                    ${CardModal._groupRoundHtml(item, idx, type)}
                    ${(type === 'characters' || type === 'locations') ? `<button class="board-btn" onclick="event.stopPropagation(); app.Board.openSatellites('${type === 'characters' ? 'character' : 'location'}', '${item.id}')" title="Idées (planche)">💡</button>` : ''}
                    ${type === 'characters' ? `<button class="casting-btn" onclick="event.stopPropagation(); app.GlobalSearch.openForCharacter(${idx})" title="Casting — trier les comédiens pour ce rôle">🎭</button>` : ''}
                    <button class="web-btn" onclick="event.stopPropagation(); app.Web.open('${({characters:'character',actors:'actor',locations:'location'})[type]}', '${item.id}')" title="Voir dans la toile">🕸️</button>
                </div>
                ` : ''}
                ${badge ? `<div class="compact-card-badge${item._offline ? ' card-offline' : ''}"${item._offline ? ' title="Hors ligne — masqué de l’Univers"' : ''}>${badge}</div>` : ''}
                <div class="compact-card-photo">${photoContent}</div>
                <div class="compact-card-name">${Utils.escape(item.name || 'Sans nom')}</div>
                <div class="compact-card-role">${roleInfo}</div>
            `;
            
            container.appendChild(card);
        });
    }
};
