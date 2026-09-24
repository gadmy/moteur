
const GlobalSearch = {
    // ============================================================
    // ===== ÉTAT & OUVERTURE =====
    // ============================================================
    currentType: 'actors',
    results: [],
    
    openActors: () => {
        GlobalSearch.currentType = 'actors';
        GlobalSearch.open();
    },
    
    openCrew: () => {
        GlobalSearch.currentType = 'crew';
        GlobalSearch.open();
    },
    
    // ==================================================================
    //  LE CASTING D'UNE FICHE OUVRE LE TRI (v601)
    // ==================================================================
    //  « Depuis une fiche personnage ou technicien non relie a quelqu'un, je
    //  veux que ca trie comme si j'etais dans l'Univers. »
    //  AVANT : on ouvrait la CARTE avec les filtres physiques du personnage
    //  pre-remplis. Un filtre est binaire — il EXCLUT. Le tri, lui, NOTE et
    //  classe : un comedien qui ne coche pas tout descend dans la pile au
    //  lieu de disparaitre. Pour un role a distribuer, c'est la bonne facon.
    //  ON NE QUITTE PAS LE PROJET : l'Univers est deplace dans une FENETRE
    //  flottante, puis remis a sa place a la fermeture. Le tri est efface en
    //  partant, sinon les vues Carte et Liste de l'Univers resteraient
    //  filtrees par une recherche qu'on a quittee.
    openForCharacter: async (charIdx) => {
        const c = state.data.characters && state.data.characters[charIdx];
        if(!c) return;
        if(c.actor_id) Utils.toast('Ce personnage a déjà un comédien — la recherche s’ouvre quand même.', 'info', 5000);
        await GlobalSearch._triDepuisFiche('character', c.id, '🎭 Casting — ' + (c.name || 'personnage'));
    },
    openForCrewMember: async (idx) => {
        const m = state.data.crew && state.data.crew[idx];
        if(!m) return;
        await GlobalSearch._triDepuisFiche('crew', m.id, '🎥 Recrutement — ' + (m.role || m.department || 'poste'));
    },
    _triDepuisFiche: async (espece, id, titre) => {
        const uv = document.getElementById('universe-view');
        if(!uv || typeof WindowManager === 'undefined') return;
        // Personnage d'ou part le casting : sert au « Ajouter a l'idee » sur
        // les profils trouves (ajout a SA planche d'idees). Efface en partant.
        GlobalSearch._castingCharId = (espece === 'character') ? id : null;
        const origParent = uv.parentNode, origNext = uv.nextSibling;
        WindowManager.open('universe-casting', titre, uv, {
            w: 980, h: 680,
            onClose: () => {
                if(origParent) origParent.insertBefore(uv, origNext);
                uv.style.display = 'none';
                GlobalSearch._castingCharId = null;
                try { if(typeof CastingMatch !== 'undefined') CastingMatch.effacer(); } catch(e) {}
                if(Universe.setViewMode) Universe.setViewMode('map');
            }
        });
        uv.style.display = 'flex';
        const typeSel = document.getElementById('universe-type');
        if(typeSel) typeSel.value = (espece === 'character') ? 'actor' : 'crew';
        if(Universe.onTypeChange) Universe.onTypeChange();
        await CastingMatch.pourFiche(espece, id);
    },
    
    open: (prefill) => {
        const isActors = GlobalSearch.currentType === 'actors';
        
        const modal = document.createElement('div');
        modal.className = 'global-search-modal';
        modal.id = 'global-search-modal';
        modal.onclick = (e) => { if(e.target === modal) GlobalSearch.close(); };
        
        modal.innerHTML = `
            <div class="global-search-container">
                <div class="global-search-header">
                    <h2>${isActors ? '🎭 Rechercher un.e comédien.ne' : '🎥 Rechercher un.e technicien.ne'}</h2>
                    <button onclick="app.GlobalSearch.close()" class="icon-btn">✖</button>
                </div>
                <div class="global-search-filters">
                    ${isActors ? GlobalSearch.getActorFiltersHTML() : GlobalSearch.getCrewFiltersHTML()}
                </div>
                <div class="global-search-results" id="global-search-results">
                    <div class="global-search-loading">🔄 Chargement...</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        if(prefill) { Object.keys(prefill).forEach(id => { const el = document.getElementById(id); if(el && prefill[id] != null && prefill[id] !== '') el.value = prefill[id]; }); }
        GlobalSearch.search();
    },
    
    close: () => {
        const modal = document.getElementById('global-search-modal');
        if(modal) modal.remove();
    },
    
    // ===== FILTRES & RECHERCHE =====
    getActorFiltersHTML: () => {
        return `
            <div class="global-search-filters-row">
                <input type="text" class="global-search-input min-w-200" id="gs-name" placeholder="🔍 Nom..." data-tooltip="🔍 Nom..." oninput="app.GlobalSearch.search()">
                <select class="global-search-input" id="gs-gender" onchange="app.GlobalSearch.search()">
                    <option value="">Tous sexes</option>
                    <option value="homme">Homme</option>
                    <option value="femme">Femme</option>
                    <option value="non-binaire">Non-binaire</option>
                </select>
                <select class="global-search-input" id="gs-ethnicity" onchange="app.GlobalSearch.search()">
                    <option value="">Toutes origines</option>
                    <option value="caucasien">Caucasien</option>
                    <option value="africain">Africain</option>
                    <option value="asiatique">Asiatique</option>
                    <option value="latino">Latino</option>
                    <option value="maghrebin">Maghrébin</option>
                    <option value="moyenorient">Moyen-Orient</option>
                    <option value="indien">Indien</option>
                    <option value="metis">Métis</option>
                </select>
                <select class="global-search-input" id="gs-hair" onchange="app.GlobalSearch.search()">
                    <option value="">Tous cheveux</option>
                    <option value="noir">Noir</option>
                    <option value="brun">Brun</option>
                    <option value="chatain">Châtain</option>
                    <option value="blond">Blond</option>
                    <option value="roux">Roux</option>
                    <option value="chauve">Chauve</option>
                </select>
                <select class="global-search-input" id="gs-eyes" onchange="app.GlobalSearch.search()">
                    <option value="">Tous yeux</option>
                    <option value="marron">Marron</option>
                    <option value="bleu">Bleu</option>
                    <option value="vert">Vert</option>
                    <option value="gris">Gris</option>
                    <option value="noir">Noir</option>
                </select>
            </div>
            <div class="global-search-filters-row">
                <input type="text" class="global-search-input" id="gs-city" placeholder="📍 Ville / Région..." data-tooltip="📍 Ville / Région..." oninput="app.GlobalSearch.search()">
                <input type="number" class="global-search-input" id="gs-age-min" placeholder="Âge min" data-tooltip="Âge min" style="width:80px;" oninput="app.GlobalSearch.search()">
                <input type="number" class="global-search-input" id="gs-age-max" placeholder="Âge max" data-tooltip="Âge max" style="width:80px;" oninput="app.GlobalSearch.search()">
                <input type="number" class="global-search-input" id="gs-height-min" placeholder="Taille min (cm)" data-tooltip="Taille min (cm)" style="width:110px;" oninput="app.GlobalSearch.search()">
                <input type="number" class="global-search-input" id="gs-height-max" placeholder="Taille max (cm)" data-tooltip="Taille max (cm)" style="width:110px;" oninput="app.GlobalSearch.search()">
                <input type="text" class="global-search-input" id="gs-sports" placeholder="🏇 Sport (équitation...)" data-tooltip="🏇 Sport (équitation...)" oninput="app.GlobalSearch.search()">
                <input type="text" class="global-search-input" id="gs-languages" placeholder="🗣️ Langue (anglais...)" data-tooltip="🗣️ Langue (anglais...)" oninput="app.GlobalSearch.search()">
                <select class="global-search-input" id="gs-collab" onchange="app.GlobalSearch.search()">
                    <option value="">Tous types collab</option>
                    <option value="pro">🎬 Pro</option>
                    <option value="semi-pro">⚡ Semi-pro</option>
                    <option value="benevole">❤️ Bénévole</option>
                </select>
            </div>
        `;
    },
    
    getCrewFiltersHTML: () => {
        return `
            <div class="global-search-filters-row">
                <input type="text" class="global-search-input min-w-200" id="gs-crew-name" placeholder="🔍 Nom..." data-tooltip="🔍 Nom..." oninput="app.GlobalSearch.search()">
                <select class="global-search-input" id="gs-department" onchange="app.GlobalSearch.search()">
                    <option value="">Tous départements</option>
                    ${CONFIG.crewGroups.map(g => '<option value="' + g.id + '">' + g.name + '</option>').join('')}
                </select>
                <input type="text" class="global-search-input" id="gs-role" placeholder="Fonction (Chef op, Cadreur...)" data-tooltip="Fonction (Chef op, Cadreur...)" oninput="app.GlobalSearch.search()">
                <input type="text" class="global-search-input" id="gs-crew-city" placeholder="📍 Ville / Région..." data-tooltip="📍 Ville / Région..." oninput="app.GlobalSearch.search()">
            </div>
            <div class="global-search-filters-row">
                <input type="text" class="global-search-input min-w-200" id="gs-camera" placeholder="📷 Caméra (RED, ARRI, Sony...)" data-tooltip="📷 Caméra (RED, ARRI, Sony...)" oninput="app.GlobalSearch.search()">
                <input type="text" class="global-search-input min-w-200" id="gs-equipment" placeholder="🔧 Matériel (caméra, objectifs...)" data-tooltip="🔧 Matériel (caméra, objectifs...)" oninput="app.GlobalSearch.search()">
                <label style="display:flex; align-items:center; gap:5px; padding:8px; background:var(--input-bg); border:1px solid var(--border); border-radius:6px; cursor:pointer;">
                    <input type="checkbox" id="gs-vehicle" onchange="app.GlobalSearch.search()"> 🚗 Véhicule
                </label>
                <select class="global-search-input" id="gs-crew-collab" onchange="app.GlobalSearch.search()">
                    <option value="">Tous types collab</option>
                    <option value="pro">🎬 Pro</option>
                    <option value="semi-pro">⚡ Semi-pro</option>
                    <option value="benevole">❤️ Bénévole</option>
                </select>
            </div>
        `;
    },
    
    search: async () => {
        const resultsDiv = document.getElementById('global-search-results');
        if(!resultsDiv) return;
        
        resultsDiv.innerHTML = '<div class="global-search-loading">🔄 Recherche en cours...</div>';
        
        const isActors = GlobalSearch.currentType === 'actors';
        
        try {
            // Rechercher dans user_profiles avec le bon type
            const profileType = isActors ? 'actor' : 'crew';
            // v578 (audit) : passe par la fonction serveur, qui applique la regle
            // du telephone (agent en priorite, sinon selon le choix du profil).
            const { data, error } = await supabase.rpc('public_profiles_for_me', { p_type: profileType });
            
            let results = [];
            if(!error && data) {
                // Extraire les données du champ JSONB pour chaque profil
                results = data.map(p => {
                    const extraData = p.data || {};
                    return {
                        ...p,
                        ...extraData,
                        type: p.profile_type || 'crew',
                        hasVehicle: p.vehicle || false,
                        availabilityText: p.availability || ''
                    };
                });
            }
            
            // Filtrer uniquement les profils complets
            results = results.filter(r => r.is_public);
            
            // Appliquer les filtres
            const nameId = isActors ? 'gs-name' : 'gs-crew-name';
            const cityId = isActors ? 'gs-city' : 'gs-crew-city';
            const name = (document.getElementById(nameId)?.value || '').toLowerCase();
            const city = (document.getElementById(cityId)?.value || '').toLowerCase();
            
            // Recherche logique : correspondance en debut de mot (et non n'importe ou dans le texte)
            const wordMatch = (txt, q) => { const t = (txt || '').toLowerCase(); return t.startsWith(q) || t.split(/\s+/).some(w => w.startsWith(q)); };
            if(name) results = results.filter(r => wordMatch(r.name, name));
            if(city) results = results.filter(r => wordMatch(r.city, city));
            
            // Respect du reglage de visibilite de la casquette (facets) : masque si la personne l'a desactivee
            const facetKey = isActors ? 'actor' : 'crew';
            results = results.filter(r => { const f = r.facets && r.facets[facetKey]; return !f || (f.enabled !== false && f.visible !== false); });
            
            const collabId = isActors ? 'gs-collab' : 'gs-crew-collab';
            const collab = document.getElementById(collabId)?.value;
            if(collab) results = results.filter(r => r.collabType === collab);
            
            if(isActors) {
                const gender = document.getElementById('gs-gender')?.value;
                const ethnicity = document.getElementById('gs-ethnicity')?.value;
                const hair = document.getElementById('gs-hair')?.value;
                const eyes = document.getElementById('gs-eyes')?.value;
                const ageMin = parseInt(document.getElementById('gs-age-min')?.value) || 0;
                const ageMax = parseInt(document.getElementById('gs-age-max')?.value) || 999;
                const heightMin = parseInt(document.getElementById('gs-height-min')?.value) || 0;
                const heightMax = parseInt(document.getElementById('gs-height-max')?.value) || 999;
                const sports = (document.getElementById('gs-sports')?.value || '').toLowerCase();
                const languages = (document.getElementById('gs-languages')?.value || '').toLowerCase();
                
                if(gender) results = results.filter(r => r.gender === gender);
                if(ethnicity) results = results.filter(r => r.ethnicity === ethnicity);
                if(hair) results = results.filter(r => r.hairColor === hair);
                if(eyes) results = results.filter(r => r.eyeColor === eyes);
                if(ageMin > 0) results = results.filter(r => parseInt(r.age) >= ageMin);
                if(ageMax < 999) results = results.filter(r => parseInt(r.age) <= ageMax);
                if(heightMin > 0) results = results.filter(r => parseInt(r.height) >= heightMin);
                if(heightMax < 999) results = results.filter(r => parseInt(r.height) <= heightMax);
                if(sports) results = results.filter(r => (r.sports || '').toLowerCase().includes(sports));
                if(languages) results = results.filter(r => (r.languages || '').toLowerCase().includes(languages));
            } else {
                const department = document.getElementById('gs-department')?.value;
                const role = (document.getElementById('gs-role')?.value || '').toLowerCase();
                const camera = (document.getElementById('gs-camera')?.value || '').toLowerCase();
                const equipment = (document.getElementById('gs-equipment')?.value || '').toLowerCase();
                const hasVehicle = document.getElementById('gs-vehicle')?.checked;
                
                if(department) results = results.filter(r => r.department === department);
                if(role) results = results.filter(r => (r.role || '').toLowerCase().includes(role));
                if(camera) results = results.filter(r => (r.cameras || []).some(c => c.toLowerCase().includes(camera)));
                if(equipment) {
                    // v601 : deux listes seulement, cameras et series d'objectifs.
                    // Lumiere, son, machinerie et maquillage ont ete ecartes — on
                    // cherche un boitier ou des optiques, presque jamais une perche.
                    results = results.filter(r => {
                        const allEquip = [...(r.cameras || []), ...(r.lenses || [])].join(' ').toLowerCase();
                        return allEquip.includes(equipment);
                    });
                }
                if(hasVehicle) results = results.filter(r => r.hasVehicle);
            }
            
            GlobalSearch.results = results;
            GlobalSearch.renderResults();
            
        } catch(e) {
            console.error('Erreur recherche:', e);
            resultsDiv.innerHTML = '<div class="global-search-empty">❌ Erreur lors de la recherche</div>';
        }
    },
    
    renderResults: () => {
        const resultsDiv = document.getElementById('global-search-results');
        if(!resultsDiv) return;
        
        const isActors = GlobalSearch.currentType === 'actors';
        const results = GlobalSearch.results;
        
        if(results.length === 0) {
            resultsDiv.innerHTML = `<div class="global-search-empty">
                <p style="font-size:1.2rem; margin-bottom:10px;">Aucun résultat trouvé</p>
                <p class="fs-09">Essayez d'élargir vos critères de recherche</p>
            </div>`;
            return;
        }
        
        let html = `<p class="text-sec-mb15-alt">${results.length} résultat${results.length > 1 ? 's' : ''}</p>`;
        html += '<div class="global-search-results-grid">';
        
        results.forEach((person, idx) => {
            const photoHTML = person.photo 
                ? `<img src="${Utils.safeMediaUrl(person.photo)}" alt="${Utils.escape(person.name || person.title || '')}">`
                : defaultIcon;
            
            let metaHTML = '';
            let tagsHTML = '';
            
            if(isActors) {
                const _pe = [person.email, person.owner_email].filter(Boolean).map(e => String(e).toLowerCase());
                if(_pe.length && (state.data.actors || []).some(a => [a.email, a.owner_email].filter(Boolean).some(e => _pe.includes(String(e).toLowerCase())))) {
                    tagsHTML += `<span class="global-search-card-tag" style="background:var(--primary);color:white;">✓ Déjà dans le projet</span>`;
                }
                const details = [];
                if(person.age) details.push(Utils.escape(person.age + ' ans'));
                if(person.height) details.push(Utils.escape(person.height + ' cm'));
                if(person.city) details.push('📍 ' + Utils.escape(person.city));
                metaHTML = details.join(' • ');
                
                if(person.collabType === 'pro') tagsHTML += `<span class="global-search-card-tag" style="background:#4CAF50;color:white;">🎬 Pro</span>`;
                if(person.collabType === 'semi-pro') tagsHTML += `<span class="global-search-card-tag" style="background:#FF9800;color:white;">⚡ Semi-pro</span>`;
                if(person.collabType === 'benevole') tagsHTML += `<span class="global-search-card-tag" style="background:#E91E63;color:white;">❤️ Bénévole</span>`;
                if(person.dailyRate) tagsHTML += `<span class="global-search-card-tag">💰 ${Utils.escape(String(person.dailyRate))}${Utils.escape(person.rateCurrency || '€')}</span>`;
                if(person.sports) tagsHTML += `<span class="global-search-card-tag">🏃 ${Utils.escape(person.sports)}</span>`;
                if(person.languages) tagsHTML += `<span class="global-search-card-tag">🗣️ ${Utils.escape(person.languages)}</span>`;
                if(person.hasVehicle) tagsHTML += `<span class="global-search-card-tag">🚗 Véhicule</span>`;
                if(person.demoreel) tagsHTML += `<span class="global-search-card-tag">🎬 Démo</span>`;
                if(person.galleryPhotos && person.galleryPhotos.length > 0) tagsHTML += `<span class="global-search-card-tag">📸 ${person.galleryPhotos.length} photos</span>`;
            } else {
                const deptLabels = {}; CONFIG.crewGroups.forEach(g => { deptLabels[g.id] = g.name; });
                metaHTML = Utils.escape(person.role || '') + (person.department ? ' • ' + (deptLabels[person.department] || Utils.escape(person.department)) : '');
                if(person.city) metaHTML += ' • 📍 ' + Utils.escape(person.city);
                
                if(person.collabType === 'pro') tagsHTML += `<span class="global-search-card-tag" style="background:#4CAF50;color:white;">🎬 Pro</span>`;
                if(person.collabType === 'semi-pro') tagsHTML += `<span class="global-search-card-tag" style="background:#FF9800;color:white;">⚡ Semi-pro</span>`;
                if(person.collabType === 'benevole') tagsHTML += `<span class="global-search-card-tag" style="background:#E91E63;color:white;">❤️ Bénévole</span>`;
                if(person.dailyRate) tagsHTML += `<span class="global-search-card-tag">💰 ${Utils.escape(String(person.dailyRate))}${Utils.escape(person.rateCurrency || '€')}</span>`;
                if(person.cameras && person.cameras.length > 0) {
                    person.cameras.slice(0, 3).forEach(c => tagsHTML += `<span class="global-search-card-tag">📷 ${Utils.escape(c)}</span>`);
                    if(person.cameras.length > 3) tagsHTML += `<span class="global-search-card-tag">+${person.cameras.length - 3}</span>`;
                }
                if(person.hasVehicle) tagsHTML += `<span class="global-search-card-tag">🚗 Véhicule</span>`;
                if(person.demoreel) tagsHTML += `<span class="global-search-card-tag">🎬 Démo</span>`;
                if((person.crewGalleryPhotos && person.crewGalleryPhotos.length > 0) || (person.galleryPhotos && person.galleryPhotos.length > 0)) tagsHTML += `<span class="global-search-card-tag">📸 Photos</span>`;
            }
            
            html += `
                <div class="global-search-card">
                    <div class="global-search-card-header">
                        <div class="global-search-card-photo">${photoHTML}</div>
                        <div>
                            <div class="global-search-card-name">${Utils.escape(person.name)}</div>
                            <div class="global-search-card-meta">${metaHTML}</div>
                        </div>
                    </div>
                    ${tagsHTML ? `<div class="global-search-card-tags">${tagsHTML}</div>` : ''}
                    <div class="global-search-card-actions">
                        <button onclick="app.GlobalSearch.viewProfile(${idx})" style="background:var(--bg); border:1px solid var(--border); color:var(--text-main);">👁️ Voir profil</button>
                        <button onclick="app.GlobalSearch.addToProject(${idx})" style="background:var(--primary); border:none; color:white;">➕ Ajouter au projet</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        resultsDiv.innerHTML = html;
    },
    
    // ===== ACTIONS (voir profil, ajouter au projet, notifier) =====
    viewProfile: (idx) => {
        const person = GlobalSearch.results[idx];
        if(!person) return;
        
        const isActors = GlobalSearch.currentType === 'actors';
        
        let detailsHTML = '';
        if(isActors) {
            detailsHTML = `
                <p><strong>Âge:</strong> ${Utils.escape(String(person.age || 'N/A'))} ans</p>
                <p><strong>Taille:</strong> ${Utils.escape(String(person.height || 'N/A'))} cm</p>
                <p><strong>Yeux:</strong> ${Utils.escape(person.eyeColor || 'N/A')}</p>
                <p><strong>Cheveux:</strong> ${Utils.escape(person.hairColor || 'N/A')} (${Utils.escape(person.hairLength || 'N/A')})</p>
                <p><strong>Origine:</strong> ${Utils.escape(person.ethnicity || 'N/A')}</p>
                ${person.sports ? `<p><strong>Sports:</strong> ${Utils.escape(person.sports)}</p>` : ''}
                ${person.languages ? `<p><strong>Langues:</strong> ${Utils.escape(person.languages)}</p>` : ''}
            `;
        } else {
            detailsHTML = `
                <p><strong>Département:</strong> ${Utils.escape(person.department || 'N/A')}</p>
                <p><strong>Fonction:</strong> ${Utils.escape(person.role || 'N/A')}</p>
                ${person.cameras && person.cameras.length > 0 ? `<p><strong>Caméras:</strong> ${Utils.escape(person.cameras.join(', '))}</p>` : ''}
                ${person.lenses && person.lenses.length > 0 ? `<p><strong>Objectifs:</strong> ${Utils.escape(person.lenses.join(', '))}</p>` : ''}
                ${person.lenses && person.lenses.length > 0 ? `<p><strong>Objectifs:</strong> ${Utils.escape(person.lenses.join(', '))}</p>` : ''}
            `;
        }
        
        const profileModal = document.createElement('div');
        profileModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;justify-content:center;align-items:center;z-index: var(--z-modal);';
        profileModal.onclick = (e) => { if(e.target === profileModal) profileModal.remove(); };
        
        profileModal.innerHTML = `
            <div class="modal-panel">
                <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
                    <div class="n8-avatar-4">
                        ${person.photo ? `<img src="${Utils.safeMediaUrl(person.photo)}" alt="Photo de profil" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                    </div>
                    <div>
                        <h2 class="m-0">${Utils.escape(person.name)}</h2>
                        <p style="margin:5px 0 0;color:var(--text-sec);">📍 ${Utils.escape(person.city || 'Non précisé')}</p>
                    </div>
                </div>
                ${person.bio ? `<p class="mb-15">${Utils.escape(person.bio)}</p>` : ''}
                <div class="box-bg">
                    ${detailsHTML}
                </div>
                <div class="box-bg">
                    <p><strong>💰 Tarif:</strong> ${Utils.escape(String(person.dailyRate || 'N/A'))} ${Utils.escape(person.rateCurrency || '€')}/${Utils.escape(person.rateType || 'jour')}</p>
                    ${person.hasVehicle ? `<p><strong>🚗 Véhicule:</strong> ${Utils.escape(person.vehicleType || 'Oui')} (${Utils.escape(String(person.vehicleSeats || '?'))} places)</p>` : ''}
                    ${person.availabilityText ? `<p><strong>📅 Disponibilités:</strong> ${Utils.escape(person.availabilityText)}</p>` : ''}
                </div>
                ${(person.galleryPhotos && person.galleryPhotos.length > 0) || (person.crewGalleryPhotos && person.crewGalleryPhotos.length > 0) ? `
                <div class="box-bg">
                    <p class="mb-10"><strong>📸 Galerie Photos</strong></p>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        ${(person.galleryPhotos || person.crewGalleryPhotos || []).map(url => url ? `<img src="${Utils.safeMediaUrl(url)}" alt="Photo de la galerie" style="width:80px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="window.open('${Utils.safeMediaUrl(url)}','_blank')">` : '').join('')}
                    </div>
                </div>` : ''}
                ${person.demoreel ? `
                <div class="box-bg">
                    <p class="mb-10"><strong>🎬 Bande Démo</strong></p>
                    <iframe src="${ProfileRenderer.getEmbedUrl(person.demoreel)}" width="100%" height="200" frameborder="0" allowfullscreen class="br-8"></iframe>
                </div>` : ''}
                <div style="display:flex;gap:10px;">
                    <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Fermer</button>
                    <button onclick="app.GlobalSearch.addToProject(${idx}); this.closest('div[style*=fixed]').remove();" style="flex:1;padding:12px;background:var(--primary);color:white;border:none;border-radius:6px;cursor:pointer;">➕ Ajouter au projet</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(profileModal);
    },
    
    addToProject: (idx) => {
        const person = GlobalSearch.results[idx];
        if(!person) return;
        
        const isActors = GlobalSearch.currentType === 'actors';
        
        // Créer une copie pour le projet
        const newEntry = { ...person };
        newEntry.id = (isActors ? 'act_' : 'crew_') + Utils.generateUniqueId();
        newEntry.availabilityDates = [];
        delete newEntry.profileComplete;
        delete newEntry.updatedAt;
        
        // Vérifier si déjà dans le projet
        const existingList = isActors ? state.data.actors : state.data.crew;
        const alreadyExists = existingList.some(e => e.email === person.email);
        
        if(alreadyExists) {
            Utils.toast('Cette personne est déjà dans le projet !', 'warning');
            return;
        }
        
if(isActors) {
            state.data.actors.push(newEntry);
            Store.save();
            UI.renderDataTab('actors', els.actorContainer);
        } else {
            state.data.crew.push(newEntry);
            Store.save();
            UI.renderCrewTab();
        }
        
        Utils.toast(`${person.name} ajouté(e) au projet !`, 'success');
        
        // Proposer d'avertir la personne si elle a un email
        if(person.email) {
            setTimeout(async () => {
                if(await ConfirmModal.show({ title: 'Prévenir cette personne ?', message: `Envoyer une notification à ${Utils.escape(person.name)} pour l'informer qu'il/elle a été ajouté(e) au projet ?`, icon: '📧', confirmText: 'Envoyer' })) {
                    GlobalSearch.notifyPerson(person);
                }
            }, 300);
        }
    },
    
    notifyPerson: async (person) => {
        try {
            const projectTitle = document.getElementById('projectTitle')?.value || 'Un projet';
            const senderName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0] || 'Quelqu\'un';
            
            // Cloche in-app + email externe direct (plus de message interne)
            await Notifications.send(person.email, 'invite', `${senderName} vous a ajouté(e) au projet \"${projectTitle}\"`, state.currentProjectId);
            
            await Messages.sendEmailPing(person.email, person.name, 'invitation', {
                senderName: senderName,
                projectTitle: projectTitle,
                role: 'collaborateur'
            });
            
            Utils.toast(`${person.name} a été notifié(e) !`, 'success');
        } catch(e) {
            console.error('Erreur notification:', e);
            Utils.toast('Erreur lors de l\'envoi de la notification', 'error');
        }
    }
};
  