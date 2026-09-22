
  const UIData = {
    renderDataTab: (type, container) => {
        if(!container) container = ({ characters: els.charContainer, actors: els.actorContainer, locations: els.locContainer })[type];
        if(!container) return;
        const arr = state.data[type]; container.innerHTML = '';
        if(!arr || arr.length === 0) { 
            const emptyStates = {
                characters: {
                    icon: '🎭',
                    title: 'Aucun personnage',
                    desc: 'Ajoutez les personnages de votre histoire. Ils pourront ensuite être liés aux comédiens et apparaîtront dans le dépouillement.',
                    btn: '+ Ajouter un personnage',
                    action: 'app.Actions.addDataItem(\'characters\')'
                },
                actors: {
                    icon: '🎬',
                    title: 'Aucun comédien',
                    desc: 'Constituez votre casting en ajoutant des comédiens. Vous pourrez les associer aux personnages et gérer leurs disponibilités.',
                    btn: '+ Ajouter un comédien',
                    action: 'app.Actions.addDataItem(\'actors\')'
                },
                locations: {
                    icon: '🏠',
                    title: 'Aucun décor',
                    desc: 'Ajoutez les décors de votre scénario. Vous pourrez ensuite renseigner les lieux réels de tournage avec adresse et contact.',
                    btn: '+ Ajouter un décor',
                    action: 'app.Actions.addDataItem(\'locations\')'
                }
            };
            const es = emptyStates[type] || { icon: '📁', title: 'Aucune donnée', desc: '', btn: '+ Ajouter', action: '' };
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${es.icon}</div>
                    <div class="empty-state-title">${es.title}</div>
                    <div class="empty-state-desc">${es.desc}</div>
                    <button class="empty-state-btn" onclick="${es.action}">${es.btn}</button>
                    <div class="empty-state-tips">💡 <strong>Astuce :</strong> Vous pouvez aussi importer depuis un scénario existant via le menu Fichier.</div>
                </div>
            `;
            return; 
        } 
        
        // Déterminer les permissions selon le type
        const typeToSection = { 'characters': 'personnages', 'actors': 'comediens', 'locations': 'lieux' };
        const sectionName = typeToSection[type];
        const isView = state.currentRole === 'viewer' || (sectionName && !Permissions.canEdit(sectionName)); 
        let groupType = '';
        if(type === 'characters') groupType = 'perso'; else if(type === 'actors') groupType = 'actor'; else if(type === 'locations') groupType = 'lieu';

        const relevantGroups = state.data.groups.filter(g => g.type === groupType);
        
        {
            GroupDnD.init();
            // Chantier 4 (v580) : les fiches qui n'apparaissent dans AUCUNE
            // scene basculent dans le groupe automatique « Sans scène » —
            // sauf exemption cochee sur la fiche (keepGroup). Groupe VIRTUEL :
            // calcule au rendu, aucun enregistrement de groupe cree, pas une
            // cible de glisser-deposer.
            const sansScene = new Set();
            if(FicheLinks.KIND4[type]) arr.forEach(item => { if(FicheLinks.isSansScene(type, item)) sansScene.add(item); });
            // Vue compacte : grille de petites cartes
            relevantGroups.forEach(grp => {
                const itemsInGroup = arr.filter(item => item.group_id === grp.id && !sansScene.has(item));
                if(itemsInGroup.length > 0 || !isView) {
                    const section = document.createElement('div'); section.className = 'group-section' + (itemsInGroup.length ? '' : ' dnd-empty-target');
                    section.innerHTML = `<div class="group-header">${Utils.escape(grp.name)}${GroupDnD.delBtnHtml(type, grp.id, isView)}</div><div class="compact-cards-grid" data-dnd-coll="${type}" data-dnd-group="${grp.id}"></div>`;
                    const grid = section.querySelector('.compact-cards-grid');
                    CardModal.renderCompactCards(itemsInGroup, type, grid);
                    container.appendChild(section);
                }
            });
            const noGroup = arr.filter(item => (!item.group_id || !relevantGroups.find(g => g.id === item.group_id)) && !sansScene.has(item));
            if(noGroup.length > 0) {
                const section = document.createElement('div'); section.className = 'group-section';
                section.innerHTML = `<div class="group-header text-sec">Non classé</div><div class="compact-cards-grid" data-dnd-coll="${type}" data-dnd-group=""></div>`;
                const grid = section.querySelector('.compact-cards-grid');
                CardModal.renderCompactCards(noGroup, type, grid);
                container.appendChild(section);
            }
            if(sansScene.size > 0) {
                const list = arr.filter(item => sansScene.has(item));
                const section = document.createElement('div'); section.className = 'group-section';
                section.innerHTML = `<div class="group-header text-sec" title="Fiches n'apparaissant dans aucune scène. Cochez « Classement manuel » sur la fiche pour les ranger ailleurs.">🚫 Sans scène (${list.length})</div><div class="compact-cards-grid"></div>`;
                CardModal.renderCompactCards(list, type, section.querySelector('.compact-cards-grid'));
                container.appendChild(section);
            }
        }
    },
    
    // roImpose : lecture seule demandee par l'appelant (fiche ouverte depuis un
    // autre onglet, dont la section d'origine n'autorise pas l'ecriture).
    // Sans ce parametre, la carte ne regardait que le role global.
    renderDataCards: (items, type, container, availableGroups, roImpose) => {
        const kindOf = { characters: 'character', actors: 'actor', locations: 'location' }[type];
        const isView = state.currentRole === 'viewer' || roImpose === true
            || (kindOf && typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche(kindOf));
        items.forEach((item) => { 
            const idx = state.data[type].indexOf(item);
            const div = document.createElement('div'); div.className = 'data-card';
            // v601 — LA CARTE DIT DE QUELLE FICHE ELLE PARLE, pour le verrou fin
            // (voir FicheLock). Personnages et comediens seulement pour l'instant :
            // decors, ressources et equipe gardent leur verrou d'onglet, et poser
            // la marque sans retirer le verrou ferait dire deux choses a l'ecran.
            // Cette meme fonction sert la LISTE et la FICHE ouverte en fenetre
            // (CardModal.open reutilise ce rendu) : les deux sont donc couvertes
            // d'un coup, sans avoir a y penser deux fois.
            if(item && item.id && kindOf) div.dataset.fiche = kindOf + ':' + item.id;
            
            const delBtn = isView ? '' : `<button onclick="app.Actions.deleteDataItem('${type}', ${idx})" style="color:var(--danger);border:none;background:none;cursor:pointer">🗑️</button>`; 
            
            let groupSelect = '';
            if(!isView) {
                groupSelect = `<select class="group-select" onchange="app.Actions.changeGroup('${type}', ${idx}, this.value)">`;
                groupSelect += `<option value="">-- Groupe --</option>`;
                availableGroups.forEach(g => { groupSelect += `<option value="${g.id}" ${item.group_id === g.id ? 'selected' : ''}>${Utils.escape(g.name)}</option>`; });
                groupSelect += `</select>`;
            }

            let contentHtml = '';
            if (type === 'actors') {
                // COMEDIEN — briques repliables equilibrees (v581).
                const isLocked = !!item.publicProfileId;
                const isReadOnly = isView || isLocked;
                div.classList.add('fid-card');
                const linkedCharacter = state.data.characters.find(c => c.actor_id === item.id);
                const isInContacts = state.contacts && state.contacts.actors && state.contacts.actors.some(c => c.id === item.id);
                const starBtn = !isView ? `<button class="save-contact-btn ${isInContacts ? 'saved' : ''}" onclick="event.stopPropagation(); app.Contacts.saveActorToContacts(${idx})" title="${isInContacts ? 'Déjà dans vos contacts' : 'Sauvegarder dans contacts'}">${isInContacts ? '⭐' : '☆'}</button>` : '';
                const lockedBadge = isLocked ? FicheUI.badge('🔒 Profil revendiqué') : '';
                contentHtml += FicheUI.headHtml({
                    name: item.name, id: item.id, kindLabel: 'Comédien·ne',
                    placeholder: 'Nom du comédien', photo: item.photo || '',
                    onchangeAttr: isReadOnly ? '' : `onchange="app.Actions.updateActorMeta(${idx}, 'name', this.value)"`,
                    avatarClickAttr: isReadOnly ? '' : `onclick="document.getElementById('fid-photo-actor-${idx}').click()"`,
                    avatarInputHtml: isReadOnly ? '' : `<input type="file" id="fid-photo-actor-${idx}" accept="image/*" style="display:none;" onchange="app.Actions.uploadActorPhoto(${idx}, this)">`,
                    badgesHtml: (item._offline ? FicheUI.badge('🚧 Hors ligne') : '') + lockedBadge + starBtn, delBtnHtml: delBtn
                });
                const blocks = [];

                // Brique « Dans le projet » — epinglee en haut a droite.
                let projHtml = UI.renderAppearances('actor', item.id, '🎬 Joue dans', 'Ne joue dans aucune scène');
                let roleHtml;
                if(linkedCharacter) roleHtml = `<div style="color:var(--primary);">🎭 <strong>${Utils.escape(linkedCharacter.name)}</strong></div>`;
                else roleHtml = `<div style="color:var(--text-sec); font-style:italic;">Aucun personnage lié — le lien se fait depuis la fiche personnage</div>`;
                projHtml += FicheUI.field('Interprète', roleHtml);
                projHtml += UI.renderShootDays('actor', item.id, '📅 Convoqué·e le');
                projHtml += UI.renderLent('actor', item.id);
                projHtml += UI.renderCost('actor', item.id);
                blocks.push(FicheUI.block('actor', 'projet', '🎬 Dans le projet', projHtml, { pin: 'right' }));

                // Brique « Identité » : sexe + photo.
                let idHtml = FicheUI.field('Sexe', `<select class="actor-input" onchange="app.Actions.updateActorMeta(${idx}, 'gender', this.value)" ${isReadOnly ? 'disabled' : ''}>${ProfileRenderer.selectOptions.gender.map(o => '<option value="'+o.value+'" '+(item.gender === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>`);
                if(!isReadOnly) {
                    const photoBtnLabel = item.photo ? '🖼️ Changer la photo' : '📤 Importer une photo';
                    idHtml += `<div class="fid-field"><div class="flex-gap10" style="align-items:center;">
                        <input type="file" id="actor-photo-input-${idx}" accept="image/*" style="display:none;" onchange="app.Actions.uploadActorPhoto(${idx}, this)">
                        <button onclick="document.getElementById('actor-photo-input-${idx}').click()" class="btn btn--primary btn--sm" style="flex:0 0 auto;">${photoBtnLabel}</button>
                        ${item.photo ? `<button onclick="app.Actions.updateActorMeta(${idx}, 'photo', '')" class="btn-icon-sm" title="Supprimer la photo" style="background:var(--danger); color:white; border:none; border-radius:6px; padding:6px 10px; cursor:pointer;">✕</button>` : ''}
                    </div></div>`;
                }
                idHtml += FicheLinks.pinToggleHtml('actors', item, isView);
                blocks.push(FicheUI.block('actor', 'identite', '🪪 Identité', idHtml));

                // Brique « Contact ».
                let contactHtml = FicheUI.field('Email', `<input class="actor-input" value="${Utils.escape(item.email||'')}" onchange="app.Actions.updateActorMeta(${idx}, 'email', this.value)" ${isReadOnly?'disabled':''}>`);
                contactHtml += FicheUI.field('Téléphone', `<input class="actor-input" value="${Utils.escape(item.phone||'')}" onchange="app.Actions.updateActorMeta(${idx}, 'phone', this.value)" ${isReadOnly?'disabled':''}>`);
                contactHtml += FicheUI.field('Ville / Région', `<input class="actor-input" list="city-suggestions" value="${Utils.escape(item.city||'')}" oninput="app.Geo.suggestCities(this)" onchange="app.Actions.updateActorMeta(${idx}, 'city', this.value)" ${isReadOnly?'disabled':''}>`);
                contactHtml += FicheUI.field('Site web', `<input class="actor-input" value="${Utils.escape(item.website||'')}" onchange="app.Actions.updateActorMeta(${idx}, 'website', this.value)" ${isReadOnly?'disabled':''}>`);
                contactHtml += FicheUI.field('Adresse / notes', `<textarea class="data-desc" style="width:100%; min-height:50px;" oninput="app.Actions.updateActorMeta(${idx}, 'address', this.value)" ${isReadOnly?'disabled':''}>${Utils.escape(item.address || '')}</textarea>`);
                blocks.push(FicheUI.block('actor', 'contact', '📇 Contact', contactHtml));

                // Brique « Description physique ».
                if(UI.isSectionVisibleForProject(item, 'physical')) {
                    let phHtml = `<div class="actor-input-row mb-8">
                        <input class="actor-input" type="number" placeholder="Taille (cm)" data-tooltip="Taille (cm)" value="${Utils.escape(item.height || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'height', this.value)" ${isReadOnly ? 'disabled' : ''}>
                        <input class="actor-input" type="number" placeholder="Poids (kg)" data-tooltip="Poids (kg)" value="${Utils.escape(item.weight || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'weight', this.value)" ${isReadOnly ? 'disabled' : ''}>
                        <input class="actor-input" type="number" placeholder="Âge" data-tooltip="Âge" value="${Utils.escape(item.age || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'age', this.value)" ${isReadOnly ? 'disabled' : ''}>
                    </div>
                    <div class="actor-input-row mb-8">
                        <select class="actor-input" onchange="app.Actions.updateActorMeta(${idx}, 'eyeColor', this.value)" ${isReadOnly ? 'disabled' : ''}>${ProfileRenderer.selectOptions.eyeColor.map(o => '<option value="'+o.value+'" '+(item.eyeColor === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                        <select class="actor-input" onchange="app.Actions.updateActorMeta(${idx}, 'hairColor', this.value)" ${isReadOnly ? 'disabled' : ''}>${ProfileRenderer.selectOptions.hairColor.map(o => '<option value="'+o.value+'" '+(item.hairColor === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                        <select class="actor-input" onchange="app.Actions.updateActorMeta(${idx}, 'hairLength', this.value)" ${isReadOnly ? 'disabled' : ''}>${ProfileRenderer.selectOptions.hairLength.map(o => '<option value="'+o.value+'" '+(item.hairLength === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                    </div>
                    <div class="actor-input-row mb-8">
                        <select class="actor-input" onchange="app.Actions.updateActorMeta(${idx}, 'corpulence', this.value)" ${isReadOnly ? 'disabled' : ''}>${ProfileRenderer.selectOptions.corpulence.map(o => '<option value="'+o.value+'" '+(item.corpulence === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                        <select class="actor-input" onchange="app.Actions.updateActorMeta(${idx}, 'ethnicity', this.value)" ${isReadOnly ? 'disabled' : ''}>${ProfileRenderer.selectOptions.ethnicity.map(o => '<option value="'+o.value+'" '+(item.ethnicity === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                    </div>
                    <div class="actor-input-row">
                        <input class="actor-input" placeholder="Sports pratiqués (équitation, natation...)" data-tooltip="Sports pratiqués (équitation, natation...)" value="${Utils.escape(item.sports || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'sports', this.value)" ${isReadOnly ? 'disabled' : ''}>
                        <input class="actor-input" placeholder="Langues parlées (français, anglais...)" data-tooltip="Langues parlées (français, anglais...)" value="${Utils.escape(item.languages || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'languages', this.value)" ${isReadOnly ? 'disabled' : ''}>
                    </div>`;
                    blocks.push(FicheUI.block('actor', 'physique', '📏 Description physique', phHtml));
                }

                // Brique « Galerie ».
                if(UI.isSectionVisibleForProject(item, 'gallery')) {
                    const galleryPhotos = item.galleryPhotos || [];
                    const galleryHTML = galleryPhotos.map((url, i2) => `<div style="position:relative; width:80px; height:80px;"><img src="${Utils.safeMediaUrl(url)}" alt="Photo de la galerie" class="${(item.galleryFav||[]).includes(url) ? 'gallery-thumb-fav' : ''}" style="width:100%; height:100%; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:pointer;" onclick="app.PhotoViewer.open('actors', ${idx}, ${i2})">${(item.galleryFav||[]).includes(url) ? '<span class="gallery-fav-badge">❤</span>' : ''}${!isReadOnly ? `<button onclick="app.Actions.removeActorGalleryPhoto(${idx}, ${i2})" class="n8-avatar-3">✕</button>` : ''}</div>`).join('');
                    let galHtml = `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">${galleryHTML || '<span style="color:var(--text-sec); font-size:0.85rem;">Aucune photo</span>'}</div>
                        ${!isReadOnly ? `<div class="flex-gap10" style="align-items:center;"><input type="file" id="actor-gallery-input-${idx}" accept="image/*" style="display:none;" onchange="app.Actions.addActorGalleryPhoto(${idx})"><button onclick="document.getElementById('actor-gallery-input-${idx}').click()" class="btn btn--primary btn--sm" ${galleryPhotos.length >= CONFIG.maxGaleriePhotos ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>📤 Ajouter une photo${galleryPhotos.length > 0 ? ` (${galleryPhotos.length}/${CONFIG.maxGaleriePhotos})` : ''}</button></div>` : ''}`;
                    blocks.push(FicheUI.block('actor', 'galerie', '📸 Galerie photos', galHtml));
                }

                // Brique « Bande démo ».
                if(UI.isSectionVisibleForProject(item, 'demoreel')) {
                    let demoHtml = `<input class="actor-input" type="url" placeholder="URL YouTube ou Vimeo (https://...)" data-tooltip="URL YouTube ou Vimeo (https://...)" value="${Utils.escape(item.demoreel || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'demoreel', this.value)" ${isReadOnly ? 'disabled' : ''}>
                        ${item.demoreel ? `<div class="mt-10"><iframe src="${ProfileRenderer.getEmbedUrl(item.demoreel)}" width="100%" height="200" frameborder="0" allowfullscreen class="br-8"></iframe></div>` : ''}`;
                    blocks.push(FicheUI.block('actor', 'demoreel', '🎬 Bande démo', demoHtml));
                }

                // Brique « Cachet » + statut professionnel. Les lignes de tarif
                // passent en flex-wrap pour tenir dans une colonne etroite.
                if(UI.isSectionVisibleForProject(item, 'tarif')) {
                    const actorCurrencyOptions = (CONFIG.currencies || ['€', '$', '£', 'CHF']).map(cx => `<option value="${cx}" ${item.rateCurrency === cx ? 'selected' : ''}>${cx}</option>`).join('');
                    const actorRateTypeOptions = (CONFIG.rateTypes || ['Jour', 'Semaine', 'Forfait', 'Heure']).map(t => `<option value="${t}" ${item.rateType === t ? 'selected' : ''}>${t}</option>`).join('');
                    const actorPayEst = Pay.estimates(item);
                    const payRO = isView; // cachet editable par la prod meme sur fiche revendiquee
                    let payHtml = `${(!PublicProfile._engineMode && !PublicProfile._publicView) ? `<div style="display:flex; flex-wrap:wrap; gap:6px;">
                        <input type="number" class="actor-input" style="flex:1 1 90px; min-width:80px;" placeholder="${actorPayEst.gross}" title="Salaire brut (ce que la personne annonce)" value="${Utils.escape(item.salaryGross || item.dailyRate || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'salaryGross', this.value)" ${payRO ? 'disabled' : ''}>
                        <input type="number" class="actor-input" style="flex:1 1 90px; min-width:80px;" placeholder="${actorPayEst.net}" title="Salaire net (ce que la personne recevra) — estimation depuis le brut" value="${Utils.escape(item.salaryNet || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'salaryNet', this.value)" ${payRO ? 'disabled' : ''}>
                        <input type="number" class="actor-input" style="flex:1 1 90px; min-width:80px;" placeholder="${actorPayEst.budget}" title="Budget HT (coût total production) — estimation depuis le brut" value="${Utils.escape(item.salaryBudget || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'salaryBudget', this.value)" ${payRO ? 'disabled' : ''}>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; align-items:center;">
                        <span class="text-sec" style="font-size:0.72rem; flex:1 1 100%;">Brut · Net · Budget HT</span>
                        <select class="actor-input" style="flex:0 0 auto; width:auto;" onchange="app.Actions.updateActorMeta(${idx}, 'rateCurrency', this.value)" ${payRO ? 'disabled' : ''}>${actorCurrencyOptions}</select>
                        <select class="actor-input" style="flex:0 0 auto; width:auto;" onchange="app.Actions.updateActorMeta(${idx}, 'rateType', this.value)" ${payRO ? 'disabled' : ''}>${actorRateTypeOptions}</select>
                        <label style="display:flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;"><input type="checkbox" ${item.rateNegotiable ? 'checked' : ''} onchange="app.Actions.updateActorMeta(${idx}, 'rateNegotiable', this.checked)" ${payRO ? 'disabled' : ''}><span class="fs-085">🤝 Négociable</span></label>
                    </div>` : ''}
                    <div style="margin-top:10px; padding:10px; background:var(--panel-bg); border-radius:8px; border:1px solid var(--border);">
                        ${!PublicProfile._publicView ? `<strong class="fs-09">📋 Statut professionnel</strong>
                        <div class="actor-input-row mt-8"><select class="actor-input" onchange="app.Actions.updateActorMeta(${idx}, 'professionalStatus', this.value); app.UI.renderDataTab('actors');" ${isReadOnly ? 'disabled' : ''}>${ProfileRenderer.selectOptions.professionalStatus.map(o => '<option value="'+o.value+'" '+(item.professionalStatus === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select></div>
                        ${item.professionalStatus === 'intermittent' ? `<div class="actor-input-row mt-8"><input class="actor-input" placeholder="N° Sécurité Sociale" data-tooltip="N° Sécurité Sociale" value="${Utils.escape(item.numSecu || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'numSecu', this.value)" ${isReadOnly ? 'disabled' : ''}><input class="actor-input" placeholder="N° Congés Spectacles" data-tooltip="N° Congés Spectacles" value="${Utils.escape(item.numCongesSpectacles || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'numCongesSpectacles', this.value)" ${isReadOnly ? 'disabled' : ''}></div>` : ''}
                        ${item.professionalStatus === 'micro-entrepreneur' ? `<div class="actor-input-row mt-8"><input class="actor-input" placeholder="N° SIRET" data-tooltip="N° SIRET" value="${Utils.escape(item.siret || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'siret', this.value)" ${isReadOnly ? 'disabled' : ''}></div>` : ''}
                        ` : ''}<strong style="font-size:0.9rem; display:block; margin-top:15px;">🤝 Type de collaboration</strong>
                        <div class="collab-type-selector">
                            <div class="collab-type-btn pro ${item.collabType === 'pro' ? 'selected' : ''}" onclick="${!isReadOnly ? `app.Actions.updateActorMeta(${idx}, 'collabType', 'pro'); app.UIData.renderDataTab('actors');` : ''}" ${isReadOnly ? 'style="pointer-events:none;opacity:0.6;"' : ''}>🎬 Pro</div>
                            <div class="collab-type-btn semi-pro ${item.collabType === 'semi-pro' ? 'selected' : ''}" onclick="${!isReadOnly ? `app.Actions.updateActorMeta(${idx}, 'collabType', 'semi-pro'); app.UIData.renderDataTab('actors');` : ''}" ${isReadOnly ? 'style="pointer-events:none;opacity:0.6;"' : ''}>⚡ Semi-pro</div>
                            <div class="collab-type-btn benevole ${item.collabType === 'benevole' ? 'selected' : ''}" onclick="${!isReadOnly ? `app.Actions.updateActorMeta(${idx}, 'collabType', 'benevole'); app.UIData.renderDataTab('actors');` : ''}" ${isReadOnly ? 'style="pointer-events:none;opacity:0.6;"' : ''}>❤️ Bénévole</div>
                        </div>
                        <p class="text-sec-xs-mt8">${item.collabType === 'pro' ? '💼 Contrat classique, horaires et tarifs standards' : item.collabType === 'semi-pro' ? '🤝 Flexible sur les conditions mais rémunéré·e' : item.collabType === 'benevole' ? '🎁 Pas de rémunération, défraiement repas + transport' : 'Sélectionnez votre type de collaboration préféré'}</p>
                    </div>`;
                    blocks.push(FicheUI.block('actor', 'cachet', '💶 Cachet & statut', payHtml));
                }

                // Brique « Disponibilités » (souvent repliee au quotidien).
                if(UI.isSectionVisibleForProject(item, 'calendar')) {
                    const actorAvailDates = item.availabilityDates || [];
                    const actorAvailDatesHTML = actorAvailDates.map((d, i2) => `<span style="display:inline-flex; align-items:center; background:#E8F5E9; border:1px solid #4CAF50; color:#2E7D32; padding:3px 8px; border-radius:4px; margin:2px; font-size:0.8rem;">✓ ${d.from} → ${d.to} ${!isReadOnly ? `<span onclick="app.Actions.removeActorAvailability(${idx}, ${i2})" class="delete-link">✖</span>` : ''}</span>`).join('');
                    const actorUnavailDates = item.unavailabilityDates || [];
                    const actorUnavailDatesHTML = actorUnavailDates.map((d, i2) => `<span style="display:inline-flex; align-items:center; background:#FFEBEE; border:1px solid #f44336; color:#C62828; padding:3px 8px; border-radius:4px; margin:2px; font-size:0.8rem;">✗ ${d.from} → ${d.to} ${d.reason ? '(' + Utils.escape(d.reason) + ')' : ''} ${!isReadOnly ? `<span onclick="app.Actions.removeActorUnavailability(${idx}, ${i2})" class="delete-link">✖</span>` : ''}</span>`).join('');
                    let availHtml = `<textarea class="actor-input" style="min-height:50px; width:100%;" placeholder="Situation / Notes de disponibilité..." data-tooltip="Situation / Notes de disponibilité..." onchange="app.Actions.updateActorMeta(${idx}, 'availabilityText', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(item.availabilityText || '')}</textarea>
                        <div id="actor-calendar-${idx}"></div>`;
                    blocks.push(FicheUI.block('actor', 'dispos', '📅 Disponibilités', availHtml));
                }

                // Brique « Véhicule ».
                if(UI.isSectionVisibleForProject(item, 'vehicle')) {
                    let vehHtml = `<div class="form-label">Permis de conduire</div>
                        <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:10px;">${[['moto','Moto (A)'],['vl','VL (B)'],['pl','PL (C)'],['spl','SPL (CE)'],['tc','TC (D)']].map(([k,lbl]) => `<label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" ${(item.licenses||[]).includes(k) ? 'checked' : ''} onchange="app.Actions.toggleActorLicense(${idx}, '${k}', this.checked)" ${isReadOnly ? 'disabled' : ''}> ${lbl}</label>`).join('')}</div>
                        <label class="crew-vehicle-toggle"><input type="checkbox" ${item.hasVehicle ? 'checked' : ''} onchange="app.Actions.toggleActorVehicle(${idx}, this.checked)" ${isReadOnly ? 'disabled' : ''}><strong>🚗 Possède un véhicule</strong></label>
                        <div class="crew-vehicle-details ${item.hasVehicle ? 'visible' : ''}" id="actor-vehicle-${idx}">
                            <div class="actor-input-row mt-8"><select class="actor-input" style="grid-column:1 / -1;" onchange="app.Actions.updateActorMeta(${idx}, 'vehicleUsage', this.value)" ${isReadOnly ? 'disabled' : ''}>${[['','-- Utilisation sur un tournage --'],['free','À dispo gratuitement'],['compensation','Contre dédommagement'],['paid','En étant payé'],['private','Non visible par la prod']].map(([v,lbl]) => `<option value="${v}" ${(item.vehicleUsage||'')===v ? 'selected' : ''}>${lbl}</option>`).join('')}</select></div>
                            <div class="actor-input-row mt-8"><input class="actor-input" placeholder="Type de véhicule" data-tooltip="Type de véhicule" value="${Utils.escape(item.vehicleType || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'vehicleType', this.value)" ${isReadOnly ? 'disabled' : ''}><input class="actor-input" placeholder="Immatriculation" data-tooltip="Immatriculation" value="${Utils.escape(item.vehiclePlate || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'vehiclePlate', this.value)" ${isReadOnly ? 'disabled' : ''}></div>
                            <div class="actor-input-row mt-8"><input class="actor-input" type="number" min="1" max="9" placeholder="Nb places dispo" data-tooltip="Nb places dispo" value="${Utils.escape(item.vehicleSeats || '')}" onchange="app.Actions.updateActorMeta(${idx}, 'vehicleSeats', this.value)" ${isReadOnly ? 'disabled' : ''}><label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" ${item.vehicleTrunk ? 'checked' : ''} onchange="app.Actions.updateActorMeta(${idx}, 'vehicleTrunk', this.checked)" ${isReadOnly ? 'disabled' : ''}><span>🧳 Coffre disponible</span></label></div>
                            <textarea class="data-desc" style="margin-top:8px; min-height:40px; width:100%;" placeholder="Notes véhicule..." data-tooltip="Notes véhicule..." oninput="app.Actions.updateActorMeta(${idx}, 'vehicleNotes', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(item.vehicleNotes || '')}</textarea>
                        </div>`;
                    blocks.push(FicheUI.block('actor', 'vehicule', '🚗 Véhicule', vehHtml));
                }

                // Brique « Bio ».
                blocks.push(FicheUI.block('actor', 'bio', '📝 Bio & expérience',
                    FicheUI.field('Bio', `<textarea class="data-desc" style="width:100%; min-height:90px;" placeholder="Présentation, parcours en quelques mots..." data-tooltip="Présentation, parcours en quelques mots..." oninput="app.Actions.updateDataItem('${type}', ${idx}, this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(item.bio || '')}</textarea>`)
                  + FicheUI.field('Expérience', `<textarea class="data-desc" style="width:100%; min-height:90px;" placeholder="Filmographie, rôles, formations, expériences marquantes..." data-tooltip="Filmographie, rôles, formations, expériences marquantes..." oninput="app.Actions.updateActorMeta(${idx}, 'experience', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(item.experience || '')}</textarea>`)
                ));

                contentHtml += FicheBlocks.renderTabbed(blocks, 'actor');
                } else if(type === 'locations') {
                // DECORS — briques repliables equilibrees (v581).
                div.classList.add('fid-card');
                const elid = Utils.escape(String(item.id));
                contentHtml += FicheUI.headHtml({
                    name: item.name, id: item.id, kindLabel: 'Décor',
                    placeholder: 'Nom du décor',
                    photo: (item.galleryPhotos && item.galleryPhotos.length) ? item.galleryPhotos[0] : '',
                    onchangeAttr: isView ? '' : `onchange="app.FicheLinks.renameLocation('${elid}', this.value)"`,
                    avatarClickAttr: isView ? '' : `onclick="document.getElementById('fid-photo-loc-${idx}').click()"`,
                    avatarInputHtml: isView ? '' : `<input type="file" id="fid-photo-loc-${idx}" accept="image/*" style="display:none;" onchange="app.Actions.addLocationPhoto(${idx}, this)">`,
                    badgesHtml: '', delBtnHtml: delBtn
                });
                const blocks = [];

                // Brique « Dans le projet » — epinglee en haut a droite.
                let projHtml = UI.renderAppearances('location', item.id, '🎬 Scènes dans ce décor', 'Aucune scène dans ce décor');
                projHtml += UI.renderShootDays('location', item.id, '📅 Tourné ici le');
                projHtml += UI.renderCost('location', item.id);
                blocks.push(FicheUI.block('location', 'projet', '🎬 Dans le projet', projHtml, { pin: 'right' }));

                // Brique « Lieu de tournage ».
                let lieuHtml = FicheUI.field('Nom du lieu réel', `<input class="actor-input" placeholder="ex : Musée d'Histoire Naturelle" data-tooltip="ex : Musée d'Histoire Naturelle" value="${Utils.escape(item.realName || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'realName', this.value)" ${isView?'disabled':''}>`);
                lieuHtml += `<div class="fid-field"><span class="fid-label">Adresse</span><div class="address-autocomplete-container" style="position:relative;"><input class="actor-input" id="loc-address-${idx}" placeholder="Adresse complète (autocomplétion)" data-tooltip="Adresse complète (autocomplétion)" value="${Utils.escape(item.address || '')}" oninput="app.Actions.searchLocationAddress(${idx}, this.value)" ${isView?'disabled':''} autocomplete="off"><div id="loc-suggestions-${idx}" class="address-suggestions"></div></div></div>`;
                lieuHtml += `<div class="fid-field"><span class="fid-label">Contact sur place</span><div style="display:flex; gap:8px;"><input class="actor-input flex-1" placeholder="👤 Nom" data-tooltip="👤 Nom" value="${Utils.escape(item.contactName || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'contactName', this.value)" ${isView?'disabled':''}><input class="actor-input" placeholder="📞 Téléphone" data-tooltip="📞 Téléphone" value="${Utils.escape(item.contactPhone || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'contactPhone', this.value)" ${isView?'disabled':''} style="width:140px;"></div></div>`;
                lieuHtml += FicheUI.field("Notes d'accès", `<textarea class="data-desc" style="width:100%; min-height:40px;" placeholder="Code porte, parking, interphone..." data-tooltip="Code porte, parking, interphone..." oninput="app.Actions.updateLocationMeta(${idx}, 'accessNotes', this.value)" ${isView?'disabled':''}>${Utils.escape(item.accessNotes || '')}</textarea>`);
                blocks.push(FicheUI.block('location', 'lieu', '📍 Lieu de tournage', lieuHtml));

                // Brique « Logistique » (reprise dans la feuille de service).
                let logHtml = `<div style="font-size:0.8rem; color:var(--text-sec); margin-bottom:8px;">Repris automatiquement dans la feuille de service des jours tournés ici.</div>`;
                logHtml += FicheUI.field('Lieu de rdv figuration', `<input class="actor-input" placeholder="🎭 Lieu de rdv figuration" data-tooltip="🎭 Lieu de rdv figuration" value="${Utils.escape(item.rdvFiguration || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'rdvFiguration', this.value)" ${isView?'disabled':''}>`);
                logHtml += FicheUI.field('HMC (maquillage / coiffure / costumes)', `<input class="actor-input" placeholder="💄 Lieu HMC" data-tooltip="💄 Lieu HMC" value="${Utils.escape(item.hmcPlace || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'hmcPlace', this.value)" ${isView?'disabled':''}>`);
                logHtml += FicheUI.field('Bureau de production', `<input class="actor-input" placeholder="🏢 Bureau de production" data-tooltip="🏢 Bureau de production" value="${Utils.escape(item.prodOffice || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'prodOffice', this.value)" ${isView?'disabled':''}>`);
                logHtml += FicheUI.field('Stationnement véhicules techniques', `<input class="actor-input" placeholder="🚚 Stationnement technique" data-tooltip="🚚 Stationnement technique" value="${Utils.escape(item.techParking || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'techParking', this.value)" ${isView?'disabled':''}>`);
                logHtml += FicheUI.field('Stationnement véhicules perso', `<input class="actor-input" placeholder="🚗 Stationnement perso" data-tooltip="🚗 Stationnement perso" value="${Utils.escape(item.persoParking || '')}" oninput="app.Actions.updateLocationMeta(${idx}, 'persoParking', this.value)" ${isView?'disabled':''}>`);
                blocks.push(FicheUI.block('location', 'logistique', '🎬 Logistique de tournage', logHtml));

                // Brique « Photos de repérage ».
                let photosHtml = `<div id="location-gallery-${idx}" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    ${(item.galleryPhotos || []).map((photo, pIdx) => `<div style="position:relative; width:80px; height:80px;"><img src="${Utils.safeMediaUrl(photo)}" alt="Photo" class="${(item.galleryFav||[]).includes(photo) ? 'gallery-thumb-fav' : ''}" style="width:100%; height:100%; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="app.PhotoViewer.open('locations', ${idx}, ${pIdx})">${(item.galleryFav||[]).includes(photo) ? '<span class="gallery-fav-badge">❤</span>' : ''}${!isView ? `<button onclick="app.Actions.removeLocationPhoto(${idx}, ${pIdx})" style="position:absolute; top:-5px; right:-5px; background:var(--danger); color:white; border:none; border-radius:50%; width:18px; height:18px; cursor:pointer; font-size:10px;">✕</button>` : ''}</div>`).join('')}
                    ${(item.galleryPhotos || []).length === 0 ? '<span style="color:var(--text-sec); font-size:0.85rem; font-style:italic;">Aucune photo</span>' : ''}
                </div>
                ${!isView ? `<div class="flex-gap10" style="align-items:center;"><input type="file" id="loc-gallery-input-${idx}" accept="image/*" style="display:none;" onchange="app.Actions.addLocationPhoto(${idx}, this)"><button onclick="document.getElementById('loc-gallery-input-${idx}').click()" class="btn btn--primary btn--sm">📤 Ajouter une photo</button></div>` : ''}`;
                blocks.push(FicheUI.block('location', 'photos', '📸 Photos de repérage', photosHtml));

                // Brique « Classement » : groupe + classement manuel.
                let clsHtml = '';
                if(groupSelect) clsHtml += FicheUI.field('Groupe', groupSelect);
                else if(item.group_id) { const g = (relevantGroups || []).find(x => x.id === item.group_id); if(g) clsHtml += FicheUI.field('Groupe', `<div>${Utils.escape(g.name)}</div>`); }
                clsHtml += FicheLinks.pinToggleHtml('locations', item, isView);
                if(clsHtml.trim()) blocks.push(FicheUI.block('location', 'classement', '🗂️ Classement', clsHtml));

                // Brique « Description ».
                blocks.push(FicheUI.block('location', 'description', '📝 Description', FicheUI.field('Description du décor', `<textarea class="data-desc" style="width:100%; min-height:80px;" placeholder="Description du décor..." data-tooltip="Description du décor..." oninput="app.Actions.updateDataItem('${type}', ${idx}, this.value)" ${isView?'disabled':''}>${Utils.escape(item.desc || '')}</textarea>`)));
                blocks.push(FicheUI.block('location', 'ideas', '💡 Idées', Board.render('location', item.id, isView)));

                contentHtml += FicheBlocks.renderTabbed(blocks, 'location');
            } else {
                // PERSONNAGES (characters) — briques repliables equilibrees (v581).
                div.classList.add('fid-card');
                const eid = Utils.escape(String(item.id));
                const linkedActor = item.actor_id ? (state.data.actors || []).find(a => a.id === item.actor_id) : null;
                const castBadge = linkedActor ? FicheUI.badge('Casté', true) : FicheUI.badge('Non casté');
                contentHtml += FicheUI.headHtml({
                    name: item.name, id: item.id, kindLabel: 'Personnage',
                    placeholder: 'Nom du personnage', photo: (linkedActor && linkedActor.photo) ? linkedActor.photo : '',
                    onchangeAttr: isView ? '' : `onchange="app.FicheLinks.renameCharacter('${eid}', this.value)"`,
                    badgesHtml: castBadge, delBtnHtml: delBtn
                });

                const blocks = [];
                // Brique « Dans le projet » — epinglee en haut a droite.
                let projHtml = UI.renderAppearances('character', item.id, '📍 Apparaît dans', "N'apparaît dans aucune scène");
                let actorControl = '';
                if(!isView) {
                    actorControl = `<select class="actor-input" onchange="app.Actions.linkActor(${idx}, this.value)">`;
                    actorControl += `<option value="">— Lier comédien·ne —</option>`;
                    (state.data.actors || []).forEach(actor => { actorControl += `<option value="${actor.id}" ${item.actor_id === actor.id ? 'selected' : ''}>${Utils.escape(actor.name)}</option>`; });
                    actorControl += `</select>`;
                } else if(linkedActor) {
                    actorControl = `<div style="color:var(--primary);">🎭 ${Utils.escape(linkedActor.name)}</div>`;
                }
                projHtml += FicheUI.field('Interprété par', actorControl);
                // v601 : ce bouton ouvre desormais le TRI de l'Univers, sur ce
                // role. IL RESTE LA MEME QUAND LE ROLE EST DISTRIBUE : on
                // cherche aussi un remplacant, une doublure, un second choix.
                if(!isView) projHtml += `<div style="margin-top:6px;"><button class="btn btn--primary btn--sm" onclick="app.GlobalSearch.openForCharacter(${idx})">🎭 Trouver un·e comédien·ne pour ce rôle</button></div>`;
                projHtml += UI.renderCost('character', item.id);
                blocks.push(FicheUI.block('character', 'projet', '🎬 Dans le projet', projHtml, { pin: 'right' }));

                // Brique « Identité ».
                const genderSelect = `<select class="actor-input" onchange="app.Actions.updateCharacterMeta(${idx}, 'gender', this.value)" ${isView ? 'disabled' : ''}>
                    ${ProfileRenderer.selectOptions.gender.map(o => '<option value="'+o.value+'" '+(item.gender === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>`;
                let idHtml = FicheUI.field('Sexe', genderSelect);
                idHtml += FicheUI.field('Âge dans le récit', `<input class="actor-input" placeholder="ex : 34 ans, adolescent..." data-tooltip="ex : 34 ans, adolescent..." value="${Utils.escape(item.storyAge || '')}" onchange="app.Actions.updateCharacterMeta(${idx}, 'storyAge', this.value)" ${isView ? 'disabled' : ''}>`);
                if(groupSelect) idHtml += FicheUI.field('Groupe', groupSelect);
                else if(item.group_id) { const g = (relevantGroups || []).find(x => x.id === item.group_id); if(g) idHtml += FicheUI.field('Groupe', `<div>${Utils.escape(g.name)}</div>`); }
                idHtml += FicheLinks.pinToggleHtml('characters', item, isView);
                blocks.push(FicheUI.block('character', 'identite', '🪪 Identité', idHtml));

                // Brique « Description physique » — memes champs d'apparence que le
                // comedien (memes listes), pour permettre le match perso -> comedien.
                let phHtml = `<div class="actor-input-row mb-8">
                        <input class="actor-input" type="number" placeholder="Taille (cm)" data-tooltip="Taille (cm)" value="${Utils.escape(item.height || '')}" onchange="app.Actions.updateCharacterMeta(${idx}, 'height', this.value)" ${isView ? 'disabled' : ''}>
                    </div>
                    <div class="actor-input-row mb-8">
                        <select class="actor-input" onchange="app.Actions.updateCharacterMeta(${idx}, 'eyeColor', this.value)" ${isView ? 'disabled' : ''}>${ProfileRenderer.selectOptions.eyeColor.map(o => '<option value="'+o.value+'" '+(item.eyeColor === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                        <select class="actor-input" onchange="app.Actions.updateCharacterMeta(${idx}, 'hairColor', this.value)" ${isView ? 'disabled' : ''}>${ProfileRenderer.selectOptions.hairColor.map(o => '<option value="'+o.value+'" '+(item.hairColor === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                        <select class="actor-input" onchange="app.Actions.updateCharacterMeta(${idx}, 'hairLength', this.value)" ${isView ? 'disabled' : ''}>${ProfileRenderer.selectOptions.hairLength.map(o => '<option value="'+o.value+'" '+(item.hairLength === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                    </div>
                    <div class="actor-input-row mb-8">
                        <select class="actor-input" onchange="app.Actions.updateCharacterMeta(${idx}, 'corpulence', this.value)" ${isView ? 'disabled' : ''}>${ProfileRenderer.selectOptions.corpulence.map(o => '<option value="'+o.value+'" '+(item.corpulence === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                        <select class="actor-input" onchange="app.Actions.updateCharacterMeta(${idx}, 'ethnicity', this.value)" ${isView ? 'disabled' : ''}>${ProfileRenderer.selectOptions.ethnicity.map(o => '<option value="'+o.value+'" '+(item.ethnicity === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>
                    </div>
                    <div class="actor-input-row">
                        <input class="actor-input" placeholder="Sports pratiqués (équitation, natation...)" data-tooltip="Sports pratiqués (équitation, natation...)" value="${Utils.escape(item.sports || '')}" onchange="app.Actions.updateCharacterMeta(${idx}, 'sports', this.value)" ${isView ? 'disabled' : ''}>
                        <input class="actor-input" placeholder="Langues parlées (français, anglais...)" data-tooltip="Langues parlées (français, anglais...)" value="${Utils.escape(item.languages || '')}" onchange="app.Actions.updateCharacterMeta(${idx}, 'languages', this.value)" ${isView ? 'disabled' : ''}>
                    </div>`;
                blocks.push(FicheUI.block('character', 'physique', '📏 Description physique', phHtml));

                // Brique « Notes ».
                blocks.push(FicheUI.block('character', 'notes', '📝 Notes', FicheUI.field('Bio, intentions, remarques de mise en scène', `<textarea class="data-desc" style="width:100%; min-height:90px;" placeholder="Bio, intentions, remarques de mise en scène..." data-tooltip="Bio, intentions, remarques de mise en scène..." oninput="app.Actions.updateDataItem('${type}', ${idx}, this.value)" ${isView ? 'disabled' : ''}>${Utils.escape(item.bio || '')}</textarea>`)));

                // Brique « Casting » — planche d'idees (notes + photos de reference).
                blocks.push(FicheUI.block('character', 'casting', '🎭 Casting / Idées', Board.render('character', item.id, isView)));

                contentHtml += FicheBlocks.renderTabbed(blocks, 'character');
            }
            div.innerHTML = contentHtml; 
            container.appendChild(div); 
        });
        
        // Initialiser les calendriers pour les acteurs
        if(type === 'actors') {
            setTimeout(() => {
                items.forEach((item, i) => {
                    const idx = state.data.actors.indexOf(item);
                    const calContainer = document.getElementById('actor-calendar-' + idx);
                    if(calContainer && state.currentRole !== 'viewer') {
                        UI.renderAvailabilityCalendar('actor-calendar-' + idx, 'actor', idx);
                    }
                });
            }, 100);
        }
    },
    
	  renderCrewTab: () => {
        const container = document.getElementById('crewContainer');
        container.innerHTML = '';
        if(typeof Crew !== 'undefined' && Crew.renderVehicles) Crew.renderVehicles();
        
        if(!state.data.crew || state.data.crew.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎥</div>
                    <div class="empty-state-title">Aucun technicien</div>
                    <div class="empty-state-desc">Constituez votre équipe technique en ajoutant des membres. Vous pourrez gérer leurs rôles, tarifs et disponibilités.</div>
                    <button class="empty-state-btn" onclick="app.Crew.addMember()">+ Ajouter un technicien</button>
                    <div class="empty-state-tips">💡 <strong>Astuce :</strong> Organisez votre équipe par départements (Réalisation, Image, Son, etc.)</div>
                </div>
            `;
            return;
        }
        
        const isView = state.currentRole === 'viewer' || !Permissions.canEdit('equipe');
        const crewGroups = state.data.groups.filter(g => g.type === 'crew');
        
        {
            GroupDnD.init();
            // Vue compacte
            crewGroups.forEach(grp => {
                const membersInGroup = state.data.crew.filter(m => m.group_id === grp.id);
                if(membersInGroup.length > 0 || !isView) {
                    const section = document.createElement('div');
                    section.className = 'group-section' + (membersInGroup.length ? '' : ' dnd-empty-target');
                    section.innerHTML = `<div class="group-header">${Utils.escape(grp.name)}${GroupDnD.delBtnHtml('crew', grp.id, isView)}</div><div class="compact-cards-grid" data-dnd-coll="crew" data-dnd-group="${grp.id}"></div>`;
                    const grid = section.querySelector('.compact-cards-grid');
                    CardModal.renderCompactCrewCards(membersInGroup, grid, isView);
                    container.appendChild(section);
                }
            });
            
            const noGroup = state.data.crew.filter(m => !m.group_id || !crewGroups.find(g => g.id === m.group_id));
            if(noGroup.length > 0) {
                const section = document.createElement('div');
                section.className = 'group-section';
                section.innerHTML = `<div class="group-header text-sec">Non classé</div><div class="compact-cards-grid" data-dnd-coll="crew" data-dnd-group=""></div>`;
                const grid = section.querySelector('.compact-cards-grid');
                CardModal.renderCompactCrewCards(noGroup, grid, isView);
                container.appendChild(section);
            }
        }
    },
    
    createCrewCard: (member, idx, availableGroups, isView) => {
        // Vérifier si le profil est verrouillé (revendiqué par quelqu'un)
        const isLocked = !!member.publicProfileId;
        const isReadOnly = isView || isLocked;
        
        const card = document.createElement('div');
        card.className = 'crew-card fid-card';
        // v601 : verrou par fiche (voir FicheLock). La carte d'equipe porte DIX
        // champs modifiables directement dessus — le curseur s'y pose vraiment,
        // donc le verrou s'accroche vraiment. C'est la condition qu'on verifie
        // AVANT de retirer un verrou d'onglet, depuis l'affaire des scenes.
        if(member && member.id) card.dataset.fiche = 'crew:' + member.id;

        // v600 : une fonction DEJA ENREGISTREE mais absente du referentiel (saisie
        // a la main, ou departement change depuis) est ajoutee a la liste et
        // selectionnee. Sans cela le selecteur retombait sur « -- Fonction -- »
        // alors que la fiche en porte une : le premier passage dessus l'effacait.
        const roles = member.group_id ? Crew.getRolesForGroup(member.group_id).slice() : [];
        if(member.role && !roles.includes(member.role)) roles.unshift(member.role);
        let rolesOptions = '<option value="">-- Fonction --</option>';
        roles.forEach(r => { rolesOptions += `<option value="${Utils.escape(r)}" ${member.role === r ? 'selected' : ''}>${Utils.escape(r)}</option>`; });
        rolesOptions += '<option value="__custom__">➕ Autre...</option>';
        let groupOptions = '<option value="">-- Département --</option>';
        availableGroups.forEach(g => { groupOptions += `<option value="${g.id}" ${member.group_id === g.id ? 'selected' : ''}>${Utils.escape(g.name)}</option>`; });
        let currencyOptions = ''; CONFIG.currencies.forEach(cu => { currencyOptions += `<option value="${cu}" ${member.rateCurrency === cu ? 'selected' : ''}>${cu}</option>`; });
        let rateTypeOptions = ''; CONFIG.rateTypes.forEach(t => { rateTypeOptions += `<option value="${t}" ${member.rateType === t ? 'selected' : ''}>${t}</option>`; });
        const crewPayEst = Pay.estimates(member);

        let availDatesHTML = '';
        (member.availabilityDates || []).forEach((d, dIdx) => {
            const fromDate = new Date(d.from).toLocaleDateString();
            const toDate = d.to ? new Date(d.to).toLocaleDateString() : fromDate;
            availDatesHTML += `<span style="display:inline-flex; align-items:center; background:#E8F5E9; border:1px solid #4CAF50; color:#2E7D32; padding:3px 8px; border-radius:4px; margin:2px; font-size:0.8rem;">✓ ${fromDate} → ${toDate} ${!isReadOnly ? `<span onclick="app.Crew.removeAvailabilityDate(${idx}, ${dIdx})" class="delete-link">✖</span>` : ''}</span>`;
        });
        let unavailDatesHTML = '';
        (member.unavailabilityDates || []).forEach((d, dIdx) => {
            const fromDate = new Date(d.from).toLocaleDateString();
            const toDate = d.to ? new Date(d.to).toLocaleDateString() : fromDate;
            unavailDatesHTML += `<span style="display:inline-flex; align-items:center; background:#FFEBEE; border:1px solid #f44336; color:#C62828; padding:3px 8px; border-radius:4px; margin:2px; font-size:0.8rem;">✗ ${fromDate} → ${toDate} ${d.reason ? '(' + Utils.escape(d.reason) + ')' : ''} ${!isReadOnly ? `<span onclick="app.Crew.removeUnavailabilityDate(${idx}, ${dIdx})" class="delete-link">✖</span>` : ''}</span>`;
        });

        const delBtnC = !isView ? `<button onclick="app.Crew.deleteMember(${idx})" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem;">🗑️</button>` : '';
        const inContactsC = state.contacts && state.contacts.crew && state.contacts.crew.some(cc => cc.id === member.id);
        const starC = !isView ? `<button class="save-contact-btn ${inContactsC ? 'saved' : ''}" onclick="event.stopPropagation(); app.Contacts.saveCrewToContacts(${idx})" title="Sauvegarder dans contacts">${inContactsC ? '⭐' : '☆'}</button>` : '';
        const lockedC = isLocked ? FicheUI.badge('🔒 Profil revendiqué') : '';

        let html = FicheUI.headHtml({
            name: member.name, id: member.id, kindLabel: 'Technicien·ne',
            placeholder: 'Nom du technicien', photo: member.photo || '',
            onchangeAttr: isReadOnly ? '' : `onchange="app.Crew.updateMember(${idx}, 'name', this.value)"`,
            avatarClickAttr: isReadOnly ? '' : `onclick="document.getElementById('fid-photo-crew-${idx}').click()"`,
            avatarInputHtml: isReadOnly ? '' : `<input type="file" id="fid-photo-crew-${idx}" accept="image/*" style="display:none;" onchange="app.Crew.uploadPhoto(${idx}, this)">`,
            badgesHtml: (member._offline ? FicheUI.badge('🚧 Hors ligne') : '') + lockedC + starC, delBtnHtml: delBtnC
        });
        const blocks = [];

        // Brique « Dans le projet » — epinglee en haut a droite.
        let projHtml = UI.renderAppearances('crew', member.id, '🎬 Convoqué sur', "Sur aucune scène pour l'instant");
        projHtml += UI.renderShootDays('crew', member.id, '📅 Convoqué·e le');
        projHtml += UI.renderLent('crew', member.id);
        projHtml += UI.renderCost('crew', member.id);
        // v601 : tant que ce poste n'est relie a personne de l'Univers, on
        // peut partir d'ici pour trier les technicien·nes qui le tiennent.
        if(!isReadOnly) {
            projHtml += `<div style="margin-top:6px;"><button class="btn btn--primary btn--sm" onclick="app.GlobalSearch.openForCrewMember(${idx})">🎥 Trouver quelqu’un pour ce poste</button></div>`;
        }
        blocks.push(FicheUI.block('crew', 'projet', '🎬 Dans le projet', projHtml, { pin: 'right' }));

        // Brique « Identité » : fonction, departement, poste, sexe, photo.
        // v600 : la ligne « Fonction » n'apparait plus qu'en LECTURE SEULE. En
        // edition, le selecteur « Poste » juste en dessous porte exactement la
        // meme valeur — et ce doublon etait fige : change le poste, la ligne
        // gardait l'ancien, d'ou deux fonctions differentes a l'ecran.
        let idHtml = isView ? FicheUI.field('Fonction', `<div style="color:var(--text-sec);">${Utils.escape(member.role || 'Fonction non définie')}</div>`) : '';
        if(!isView) {
            idHtml += FicheUI.field('Département', `<select class="crew-input" onchange="app.Crew.updateMember(${idx}, 'group_id', this.value)" ${isLocked ? 'disabled' : ''}>${groupOptions}</select>`);
            idHtml += FicheUI.field('Poste', `<select class="crew-input" id="role-select-${idx}" onchange="app.UIData.handleRoleChange(${idx}, this.value)" ${isLocked ? 'disabled' : ''}>${rolesOptions}</select>`);
            idHtml += FicheUI.field('Sexe', `<select class="crew-input" onchange="app.Crew.updateMember(${idx}, 'gender', this.value)" ${isLocked ? 'disabled' : ''}>${ProfileRenderer.selectOptions.gender.map(o => '<option value="'+o.value+'" '+(member.gender === o.value ? 'selected' : '')+'>'+o.label+'</option>').join('')}</select>`);
        }
        if(!isReadOnly) {
            idHtml += `<div class="fid-field"><div class="flex-gap10" style="align-items:center;">
                <input type="file" id="crew-photo-input-${idx}" accept="image/*" style="display:none;" onchange="app.Crew.uploadPhoto(${idx}, this)">
                <button onclick="document.getElementById('crew-photo-input-${idx}').click()" class="btn btn--primary btn--sm" style="flex:0 0 auto;">${member.photo ? '🖼️ Changer la photo' : '📤 Importer une photo'}</button>
                ${member.photo ? `<button onclick="app.Crew.updateMember(${idx}, 'photo', ''); app.UI.renderCrewTab();" class="btn-icon-sm" title="Supprimer la photo" style="background:var(--danger); color:white; border:none; border-radius:6px; padding:6px 10px; cursor:pointer;">✕</button>` : ''}
            </div></div>`;
        }
        blocks.push(FicheUI.block('crew', 'identite', '🪪 Identité', idHtml));

        // Brique « Contact ».
        let contactHtml = FicheUI.field('Email', `<input class="crew-input" value="${Utils.escape(member.email || '')}" onchange="app.Crew.updateMember(${idx}, 'email', this.value)" ${isReadOnly ? 'disabled' : ''}>`);
        contactHtml += FicheUI.field('Téléphone', `<input class="crew-input" value="${Utils.escape(member.phone || '')}" onchange="app.Crew.updateMember(${idx}, 'phone', this.value)" ${isReadOnly ? 'disabled' : ''}>`);
        contactHtml += FicheUI.field('Ville / Région', `<input class="crew-input" list="city-suggestions" value="${Utils.escape(member.city || '')}" oninput="app.Geo.suggestCities(this)" onchange="app.Crew.updateMember(${idx}, 'city', this.value)" ${isReadOnly ? 'disabled' : ''}>`);
        contactHtml += FicheUI.field('Adresse', `<textarea class="crew-input" style="width:100%; min-height:50px;" onchange="app.Crew.updateMember(${idx}, 'address', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(member.address || '')}</textarea>`);
        blocks.push(FicheUI.block('crew', 'contact', '📇 Contact', contactHtml));

        // Brique « Galerie ».
        if(UI.isSectionVisibleForProject(member, 'crew-gallery')) {
            let galHtml = `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">${(member.galleryPhotos || []).map((url, i2) => `<div style="position:relative; width:80px; height:80px;"><img src="${Utils.safeMediaUrl(url)}" alt="Photo de la galerie" class="${(member.galleryFav||[]).includes(url) ? 'gallery-thumb-fav' : ''}" style="width:100%; height:100%; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:pointer;" onclick="app.PhotoViewer.open('crew', ${idx}, ${i2})">${(member.galleryFav||[]).includes(url) ? '<span class="gallery-fav-badge">❤</span>' : ''}${!isReadOnly ? `<button onclick="app.Crew.removeGalleryPhoto(${idx}, ${i2})" class="n8-avatar-3">✕</button>` : ''}</div>`).join('') || '<span style="color:var(--text-sec); font-size:0.85rem;">Aucune photo</span>'}</div>
                ${!isReadOnly ? `<div class="flex-gap10" style="align-items:center;"><input type="file" id="crew-gallery-input-${idx}" accept="image/*" style="display:none;" onchange="app.Crew.addGalleryPhoto(${idx})"><button onclick="document.getElementById('crew-gallery-input-${idx}').click()" class="btn btn--primary btn--sm">📤 Ajouter une photo</button></div>` : ''}`;
            blocks.push(FicheUI.block('crew', 'galerie', '📸 Galerie photos', galHtml));
        }

        // Brique « Bande démo ».
        if(UI.isSectionVisibleForProject(member, 'crew-demoreel')) {
            let demoHtml = `<input class="crew-input" type="url" placeholder="URL YouTube ou Vimeo (https://...)" data-tooltip="URL YouTube ou Vimeo (https://...)" value="${Utils.escape(member.demoreel || '')}" onchange="app.Crew.updateMember(${idx}, 'demoreel', this.value)" ${isReadOnly ? 'disabled' : ''}>
                ${member.demoreel ? `<div class="mt-10"><iframe src="${ProfileRenderer.getEmbedUrl(member.demoreel)}" width="100%" height="200" frameborder="0" allowfullscreen class="br-8"></iframe></div>` : ''}`;
            blocks.push(FicheUI.block('crew', 'demoreel', '🎬 Bande démo', demoHtml));
        }

        // Brique « Cachet » + statut (lignes en flex-wrap pour colonne etroite).
        if(UI.isSectionVisibleForProject(member, 'tarif')) {
            const payRO = isView; // cachet editable par la prod meme sur fiche revendiquee
            let payHtml = `${(!PublicProfile._engineMode && !PublicProfile._publicView) ? `<div style="display:flex; flex-wrap:wrap; gap:6px;">
                <input type="number" class="crew-input" style="flex:1 1 90px; min-width:80px;" placeholder="${crewPayEst.gross}" title="Salaire brut (ce que la personne annonce)" value="${Utils.escape(member.salaryGross || member.dailyRate || '')}" onchange="app.Crew.updateMember(${idx}, 'salaryGross', this.value)" ${payRO ? 'disabled' : ''}>
                <input type="number" class="crew-input" style="flex:1 1 90px; min-width:80px;" placeholder="${crewPayEst.net}" title="Salaire net — estimation depuis le brut" value="${Utils.escape(member.salaryNet || '')}" onchange="app.Crew.updateMember(${idx}, 'salaryNet', this.value)" ${payRO ? 'disabled' : ''}>
                <input type="number" class="crew-input" style="flex:1 1 90px; min-width:80px;" placeholder="${crewPayEst.budget}" title="Budget HT (coût total production) — estimation depuis le brut" value="${Utils.escape(member.salaryBudget || '')}" onchange="app.Crew.updateMember(${idx}, 'salaryBudget', this.value)" ${payRO ? 'disabled' : ''}>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; align-items:center;">
                <span class="text-sec" style="font-size:0.72rem; flex:1 1 100%;">Brut · Net · Budget HT</span>
                <select class="crew-input crew-rate-currency" style="flex:0 0 auto;" onchange="app.Crew.updateMember(${idx}, 'rateCurrency', this.value)" ${payRO ? 'disabled' : ''}>${currencyOptions}</select>
                <select class="crew-input crew-rate-type" style="flex:0 0 auto;" onchange="app.Crew.updateMember(${idx}, 'rateType', this.value)" ${payRO ? 'disabled' : ''}>${rateTypeOptions}</select>
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;"><input type="checkbox" ${member.rateNegotiable ? 'checked' : ''} onchange="app.Crew.updateMember(${idx}, 'rateNegotiable', this.checked)" ${payRO ? 'disabled' : ''}><span class="fs-085">🤝 Négociable</span></label>
            </div>` : ''}
            <div style="margin-top:10px; padding:10px; background:var(--panel-bg); border-radius:8px; border:1px solid var(--border);">
                ${!PublicProfile._publicView ? `<strong class="fs-09">📋 Statut professionnel</strong>
                <div class="mt-8"><select class="crew-input w-full" onchange="app.Crew.updateMember(${idx}, 'professionalStatus', this.value); app.UI.renderCrewTab();" ${isReadOnly ? 'disabled' : ''}>
                    <option value="" ${!member.professionalStatus ? 'selected' : ''}>-- Statut --</option>
                    <option value="intermittent" ${member.professionalStatus === 'intermittent' ? 'selected' : ''}>Intermittent·e du spectacle</option>
                    <option value="micro-entrepreneur" ${member.professionalStatus === 'micro-entrepreneur' ? 'selected' : ''}>Micro-entrepreneur·e</option>
                    <option value="amateur" ${member.professionalStatus === 'amateur' ? 'selected' : ''}>Amateur·rice (pas de statut)</option>
                </select></div>
                ${member.professionalStatus === 'intermittent' ? `<div class="crew-rate-row mt-8"><input class="crew-input" placeholder="N° Sécurité Sociale" data-tooltip="N° Sécurité Sociale" value="${Utils.escape(member.numSecu || '')}" onchange="app.Crew.updateMember(${idx}, 'numSecu', this.value)" ${isReadOnly ? 'disabled' : ''}><input class="crew-input" placeholder="N° Congés Spectacles" data-tooltip="N° Congés Spectacles" value="${Utils.escape(member.numCongesSpectacles || '')}" onchange="app.Crew.updateMember(${idx}, 'numCongesSpectacles', this.value)" ${isReadOnly ? 'disabled' : ''}></div>` : ''}
                ${member.professionalStatus === 'micro-entrepreneur' ? `<div class="mt-8"><input class="crew-input w-full" placeholder="N° SIRET" data-tooltip="N° SIRET" value="${Utils.escape(member.siret || '')}" onchange="app.Crew.updateMember(${idx}, 'siret', this.value)" ${isReadOnly ? 'disabled' : ''}></div>` : ''}
                ` : ''}<strong style="font-size:0.9rem; display:block; margin-top:15px;">🤝 Type de collaboration</strong>
                <div class="collab-type-selector">
                    <div class="collab-type-btn pro ${member.collabType === 'pro' ? 'selected' : ''}" onclick="${!isReadOnly ? `app.Crew.updateMember(${idx}, 'collabType', 'pro'); app.UI.renderCrewTab();` : ''}" ${isReadOnly ? 'style="pointer-events:none;opacity:0.6;"' : ''}>🎬 Pro</div>
                    <div class="collab-type-btn semi-pro ${member.collabType === 'semi-pro' ? 'selected' : ''}" onclick="${!isReadOnly ? `app.Crew.updateMember(${idx}, 'collabType', 'semi-pro'); app.UI.renderCrewTab();` : ''}" ${isReadOnly ? 'style="pointer-events:none;opacity:0.6;"' : ''}>⚡ Semi-pro</div>
                    <div class="collab-type-btn benevole ${member.collabType === 'benevole' ? 'selected' : ''}" onclick="${!isReadOnly ? `app.Crew.updateMember(${idx}, 'collabType', 'benevole'); app.UI.renderCrewTab();` : ''}" ${isReadOnly ? 'style="pointer-events:none;opacity:0.6;"' : ''}>❤️ Bénévole</div>
                </div>
                <p class="text-sec-xs-mt8">${member.collabType === 'pro' ? '💼 Contrat classique, horaires et tarifs standards' : member.collabType === 'semi-pro' ? '🤝 Flexible sur les conditions mais rémunéré·e' : member.collabType === 'benevole' ? '🎁 Pas de rémunération, défraiement repas + transport' : 'Sélectionnez votre type de collaboration préféré'}</p>
            </div>`;
            blocks.push(FicheUI.block('crew', 'cachet', '💶 Cachet & statut', payHtml));
        }

        // Brique « Disponibilités ».
        if(UI.isSectionVisibleForProject(member, 'calendar')) {
            let availHtml = `<textarea class="crew-input" style="min-height:50px; width:100%;" placeholder="Situation / Notes de disponibilité..." data-tooltip="Situation / Notes de disponibilité..." onchange="app.Crew.updateMember(${idx}, 'availabilityText', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(member.availabilityText || '')}</textarea>
                <div id="crew-calendar-${idx}"></div>`;
            blocks.push(FicheUI.block('crew', 'dispos', '📅 Disponibilités', availHtml));
        }

        // Brique « Véhicule ».
        if(UI.isSectionVisibleForProject(member, 'vehicle')) {
            let vehHtml = `<div class="form-label">Permis de conduire</div>
                <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:10px;">${[['moto','Moto (A)'],['vl','VL (B)'],['pl','PL (C)'],['spl','SPL (CE)'],['tc','TC (D)']].map(([k,lbl]) => `<label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" ${(member.licenses||[]).includes(k) ? 'checked' : ''} onchange="app.Crew.toggleCrewLicense(${idx}, '${k}', this.checked)" ${isReadOnly ? 'disabled' : ''}> ${lbl}</label>`).join('')}</div>
                <label class="crew-vehicle-toggle"><input type="checkbox" ${member.hasVehicle ? 'checked' : ''} onchange="app.Crew.toggleVehicle(${idx}, this.checked)" ${isReadOnly ? 'disabled' : ''}><strong>🚗 Possède un véhicule</strong></label>
                <div class="crew-vehicle-details ${member.hasVehicle ? 'visible' : ''}" id="crew-vehicle-${idx}">
                    <div class="crew-row"><select class="crew-input" style="grid-column:1 / -1;" onchange="app.Crew.updateMember(${idx}, 'vehicleUsage', this.value)" ${isReadOnly ? 'disabled' : ''}>${[['','-- Utilisation sur un tournage --'],['free','À dispo gratuitement'],['compensation','Contre dédommagement'],['paid','En étant payé'],['private','Non visible par la prod']].map(([v,lbl]) => `<option value="${v}" ${(member.vehicleUsage||'')===v ? 'selected' : ''}>${lbl}</option>`).join('')}</select></div>
                    <div class="crew-row"><input class="crew-input" placeholder="Type de véhicule" data-tooltip="Type de véhicule" value="${Utils.escape(member.vehicleType || '')}" onchange="app.Crew.updateMember(${idx}, 'vehicleType', this.value)" ${isReadOnly ? 'disabled' : ''}><input class="crew-input" placeholder="Immatriculation" data-tooltip="Immatriculation" value="${Utils.escape(member.vehiclePlate || '')}" onchange="app.Crew.updateMember(${idx}, 'vehiclePlate', this.value)" ${isReadOnly ? 'disabled' : ''}></div>
                    <div class="crew-row mt-10"><input class="crew-input" type="number" min="1" max="9" placeholder="Nb places dispo" data-tooltip="Nb places dispo" value="${Utils.escape(member.vehicleSeats || '')}" onchange="app.Crew.updateMember(${idx}, 'vehicleSeats', this.value)" ${isReadOnly ? 'disabled' : ''}><label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" ${member.vehicleTrunk ? 'checked' : ''} onchange="app.Crew.updateMember(${idx}, 'vehicleTrunk', this.checked)" ${isReadOnly ? 'disabled' : ''}><span>🧳 Coffre disponible</span></label></div>
                    <textarea class="crew-input" style="min-height:40px; margin-top:10px; width:100%;" placeholder="Notes véhicule..." data-tooltip="Notes véhicule..." onchange="app.Crew.updateMember(${idx}, 'vehicleNotes', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(member.vehicleNotes || '')}</textarea>
                </div>`;
            blocks.push(FicheUI.block('crew', 'vehicule', '🚗 Véhicule', vehHtml));
        }

        // Brique « Notes générales ».
        blocks.push(FicheUI.block('crew', 'bio', '📝 Bio & expérience',
            FicheUI.field('Bio', `<textarea class="data-desc" style="width:100%; min-height:90px;" placeholder="Présentation, parcours en quelques mots..." data-tooltip="Présentation, parcours en quelques mots..." onchange="app.Crew.updateMember(${idx}, 'bio', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(member.bio || '')}</textarea>`)
          + FicheUI.field('Expérience', `<textarea class="data-desc" style="width:100%; min-height:90px;" placeholder="Références, réalisations, matériel maîtrisé, formations..." data-tooltip="Références, réalisations, matériel maîtrisé, formations..." onchange="app.Crew.updateMember(${idx}, 'experience', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(member.experience || '')}</textarea>`)
        ));
        blocks.push(FicheUI.block('crew', 'notes', '📝 Notes générales', `<textarea class="crew-input" style="min-height:70px; width:100%;" placeholder="Notes générales..." data-tooltip="Notes générales..." onchange="app.Crew.updateMember(${idx}, 'notes', this.value)" ${isReadOnly ? 'disabled' : ''}>${Utils.escape(member.notes || '')}</textarea>`));

        card.innerHTML = FicheBlocks.renderTabbed(blocks, 'crew');
        return card;
    },
    
    // v600 : addCustomRole est ASYNC (elle ouvre une fenetre de saisie) et
    // n'etait pas ATTENDUE. On enregistrait donc la PROMESSE comme fonction —
    // un poste saisi a la main partait en « [object Promise] ». Corrige.
    // Au passage, la fiche de profil (moteur) n'a pas d'onglet Equipe a
    // redessiner : c'est sa propre carte qu'il faut rafraichir.
    handleRoleChange: async (idx, value) => {
        const member = PublicProfile._engineMode ? PublicProfile._engineProfile : state.data.crew[idx];
        if(!member) return;
        if(value === '__custom__') {
            const newRole = await Crew.addCustomRole(member.group_id);
            if(newRole) {
                Crew.updateMember(idx, 'role', newRole);
                if(PublicProfile._engineMode) PublicProfile._engineRerenderCard(); else UI.renderCrewTab();
            } else {
                const sel = document.getElementById(`role-select-${idx}`);
                if(sel) sel.value = member.role || '';
            }
        } else {
            Crew.updateMember(idx, 'role', value);
        }
    },

    // DEPOSE EN LISTE **ET** EN GRILLE (26 aout).
    // getDragAfterElement ne comparait que la coordonnee Y : correct pour une
    // liste verticale, faux des que plusieurs cartes partagent la meme ligne —
    // toutes celles de la ligne avaient le meme Y, la scene tombait donc
    // systematiquement en fin de ligne. Sur une grille, on cherche la carte la
    // plus proche du curseur EN DISTANCE, puis on se place avant ou apres elle
    // selon le cote ou l'on pointe.
    handleDragOver: (e, container, selector) => {
        e.preventDefault();
        if(state.currentRole === 'viewer') return;
        const drag = document.querySelector(selector + '.dragging');
        if(!drag) return;
        // v596bis : la carte glissée ne bouge plus dans le DOM à chaque pixel
        // de survol — seul un emplacement fantôme se déplace, et les autres
        // cartes glissent doucement (FLIP, voir _animateGridReflow) pour lui
        // faire de la place. Le déplacement réel n'a lieu qu'au relâchement.
        let placeholder = container.querySelector('.seq-drop-placeholder');
        if(!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'seq-drop-placeholder';
            const r = drag.getBoundingClientRect();
            placeholder.style.width = r.width + 'px';
            placeholder.style.height = r.height + 'px';
        }
        
        const others = [...container.querySelectorAll(selector + ':not(.dragging)')];
        let targetEl = null;
        if(others.length) {
            const r0 = others[0].getBoundingClientRect();
            const enGrille = others.some(el => Math.abs(el.getBoundingClientRect().top - r0.top) < 4 && el !== others[0]);
            if(!enGrille) {
                targetEl = Utils.getDragAfterElement(container, e.clientY, selector);
            } else {
                // Grille CSS multi-lignes : regrouper les cartes par ligne (même
                // "top" à quelques px près), choisir la ligne la plus proche du
                // curseur VERTICALEMENT, puis la carte selon la position
                // horizontale DANS cette ligne. L'ancien calcul (plus proche en
                // distance brute) mélangeait des cartes de lignes différentes
                // près d'une frontière de ligne — décisions erratiques,
                // décalage insuffisant en changeant de ligne.
                const rows = [];
                others.forEach(el => {
                    const b = el.getBoundingClientRect();
                    let row = rows.find(r => Math.abs(r.top - b.top) < 4);
                    if(!row) { row = { top: b.top, bottom: b.bottom, cards: [] }; rows.push(row); }
                    row.cards.push({ el, rect: b });
                    row.bottom = Math.max(row.bottom, b.bottom);
                });
                let bestRow = rows[0], bestRowD = Infinity;
                rows.forEach(row => {
                    const d = Math.abs(e.clientY - (row.top + row.bottom) / 2);
                    if(d < bestRowD) { bestRowD = d; bestRow = row; }
                });
                bestRow.cards.sort((a, b) => a.rect.left - b.rect.left);
                const found = bestRow.cards.find(c => e.clientX < c.rect.left + c.rect.width / 2);
                if(found) {
                    targetEl = found.el;
                } else {
                    const lastCard = bestRow.cards[bestRow.cards.length - 1];
                    let next = lastCard.el.nextElementSibling;
                    if(next === placeholder) next = next.nextElementSibling;
                    targetEl = next; // null = fin de grille
                }
            }
        }
        
        // Ne rien recalculer/animer si la cible n'a pas changé depuis le
        // dernier survol (évite un travail inutile à chaque pixel)
        if(container._seqDropTarget === targetEl && placeholder.parentElement) return;
        container._seqDropTarget = targetEl;
        
        UIData._animateGridReflow(container, selector, () => {
            if(targetEl) container.insertBefore(placeholder, targetEl); else container.appendChild(placeholder);
        });
    },
    
    // v596bis : FLIP (First-Last-Invert-Play) — anime un décalage de grille
    // CSS, qui n'est pas nativement animable (les positions de grid-item ne
    // s'interpolent pas). On capture les positions avant le changement, on
    // applique le changement, puis on rejoue la différence en transform CSS
    // pour donner l'impression d'un glissement fluide au lieu d'un saut brut.
    _animateGridReflow: (container, selector, mutateFn) => {
        const els = Array.from(container.querySelectorAll(selector + ', .seq-drop-placeholder'));
        const before = new Map();
        els.forEach(el => before.set(el, el.getBoundingClientRect()));
        
        mutateFn();
        
        els.forEach(el => {
            if(!el.isConnected) return;
            const prev = before.get(el);
            if(!prev) return;
            const now = el.getBoundingClientRect();
            const dx = prev.left - now.left;
            const dy = prev.top - now.top;
            if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = 'none';
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            void el.offsetWidth; // force le rendu de l'etat "avant" avant d'animer vers "apres"
            el.style.transition = 'transform 0.2s ease';
            el.style.transform = '';
            clearTimeout(el._seqFlipCleanup);
            el._seqFlipCleanup = setTimeout(() => { el.style.transition = ''; }, 220);
        });
    },
    goToStoryboard: (sceneId) => {
      UI.switchTab('storyboard');
      setTimeout(() => {
          const scene = state.data.scenes.find(s => s.id === sceneId || String(s.id) === String(sceneId));
          if(scene) {
              Storyboard.selectScene(scene.id);
          }
      }, 150);
  },
  };

  // ====================================================================
  // Links — SOCLE DES LIAISONS (etape 8a, 26 aout)
  // ====================================================================
  // UNE SEULE VOIX pour « a quoi cet objet est-il relie ? ». Avant ce module,
  // sept lectures repondaient a cette question, chacune sur son coin du modele
  // et dans un seul sens :
  //   1. le depouillement, sens scene -> fiche (Utils.bd*, Utils.lookup)
  //   2. le meme, sens fiche -> scenes (UI.scenesForFiche)
  //   3. le lien de depense (Expenses.linkedExpenses)
  //   4. scene -> jour de tournage (Expenses.firstDayOfScene)
  //   5. fiche -> jours de tournage (UI.shootDaysForFiche)
  //   6. le proprietaire d'une ressource (res.owner) — SANS reciproque
  //   7. le personnage joue par un comedien (character.actor_id) — relu a la
  //      main dans une douzaine d'endroits
  // Consequence : tout ecran transversal en ecrivait une huitieme. C'est
  // arrive trois fois les 25 et 26 aout sans que ce soit un choix.
  //
  // CE MODULE NE LIT QUE. Aucune ecriture, aucune donnee nouvelle, aucune
  // migration : c'est un miroir de l'existant, retirable sans sequelle.
  // Il DELEGUE aux lectures existantes partout ou elles existent, plutot que
  // de les reecrire : deux implementations d'une meme question finiraient par
  // diverger, et c'est precisement ce qu'on vient corriger.
  // Il n'ajoute de la logique QUE pour les sens qui manquaient : ce qu'un
  // comedien prete au tournage (reciproque de res.owner), les plans d'une
  // scene, les personnes convoquees un jour donne.
  //
  // ELEMENTS NON RATTACHES : un « VALISE » tape dans une scene sans fiche
  // derriere est rendu comme voisin, avec linked:false et id null. Les
  // ignorer ferait disparaitre d'un ecran de synthese des elements bien
  // presents dans le film. Ils n'ouvrent rien, c'est a l'appelant de le dire.