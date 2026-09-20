
  const Contacts = {
    // ===================== ÉTAT & NAVIGATION =====================
    currentTab: 'actors',
    currentMode: 'favorites',
    directoryResults: [],
    
    open: () => {
        UI.hideAllViews();
        els.contactsView.classList.add('active');
        Contacts.currentMode = 'favorites';
        Contacts.currentTab = 'actors';
        Contacts.updateUI();
        Contacts.loadAndRender();
    },
    
    close: () => {
        UI.hideAllViews();
        els.dashboardView.style.display = 'flex';
    },
    
    switchMode: (mode) => {
        Contacts.currentMode = mode;
        Contacts.updateUI();
        if(mode === 'favorites') {
            Contacts.render();
        } else {
            Contacts.searchDirectory();
        }
    },
    
    switchTab: (tab) => {
        Contacts.currentTab = tab;
        // Mettre à jour les sous-onglets
        document.querySelectorAll('#contacts-sub-tabs .contacts-tab').forEach(t => t.classList.remove('active'));
        const activeTab = document.querySelector(`#contacts-sub-tabs .contacts-tab[onclick*="${tab}"]`);
        if(activeTab) activeTab.classList.add('active');
        
        if(Contacts.currentMode === 'favorites') {
            Contacts.render();
        } else {
            Contacts.updateFilters();
            Contacts.searchDirectory();
        }
    },
    
    updateUI: () => {
        const isFavorites = Contacts.currentMode === 'favorites';
        
        // Titre
        document.getElementById('contacts-title').textContent = isFavorites ? '⭐ Mes Favoris' : '🌐 Annuaire';
        
        // Onglets principaux
        document.querySelectorAll('.contacts-body > .contacts-tabs:first-child .contacts-tab').forEach(t => t.classList.remove('active'));
        const modeTab = document.querySelector(`.contacts-body > .contacts-tabs:first-child .contacts-tab[onclick*="${Contacts.currentMode}"]`);
        if(modeTab) modeTab.classList.add('active');
        
        // Filtres
        const filtersDiv = document.getElementById('contacts-filters');
        if(isFavorites) {
            filtersDiv.style.display = 'none';
        } else {
            filtersDiv.style.display = 'block';
            Contacts.updateFilters();
        }
    },
    
    // ===================== ANNUAIRE : RECHERCHE & AFFICHAGE =====================
    updateFilters: () => {
        const filtersDiv = document.getElementById('contacts-filters');
        const tab = Contacts.currentTab;
        
        if(tab === 'actors') {
            filtersDiv.innerHTML = `
                <div class="flex-wrap-gap10">
                    <input type="text" class="global-search-input min-w-150" id="contact-filter-name" placeholder="🔍 Nom..." data-tooltip="🔍 Nom..." oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-city" placeholder="📍 Ville..." data-tooltip="📍 Ville..." oninput="app.Contacts.searchDirectory()">
                    <select class="global-search-input" id="contact-filter-gender" onchange="app.Contacts.searchDirectory()">
                        <option value="">Tous sexes</option>
                        <option value="homme">Homme</option>
                        <option value="femme">Femme</option>
                        <option value="non-binaire">Non-binaire</option>
                    </select>
                    <select class="global-search-input" id="contact-filter-ethnicity" onchange="app.Contacts.searchDirectory()">
                        <option value="">Toutes origines</option>
                        <option value="caucasien">Caucasien</option>
                        <option value="africain">Africain</option>
                        <option value="asiatique">Asiatique</option>
                        <option value="latino">Latino</option>
                        <option value="maghrebin">Maghrébin</option>
                        <option value="metis">Métis</option>
                    </select>
                    <input type="text" class="global-search-input" id="contact-filter-sports" placeholder="🏇 Sport..." data-tooltip="🏇 Sport..." style="width:120px;" oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-languages" placeholder="🗣️ Langue..." data-tooltip="🗣️ Langue..." style="width:120px;" oninput="app.Contacts.searchDirectory()">
                </div>
            `;
        } else if(tab === 'crew') {
            filtersDiv.innerHTML = `
                <div class="flex-wrap-gap10">
                    <input type="text" class="global-search-input min-w-150" id="contact-filter-name-crew" placeholder="🔍 Nom..." data-tooltip="🔍 Nom..." oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-city-crew" placeholder="📍 Ville..." data-tooltip="📍 Ville..." oninput="app.Contacts.searchDirectory()">
                    <select class="global-search-input" id="contact-filter-department" onchange="app.Contacts.searchDirectory()">
                        <option value="">Tous départements</option>
                        ${CONFIG.crewGroups.map(g => '<option value="' + g.id + '">' + g.name + '</option>').join('')}
                    </select>
                    <input type="text" class="global-search-input" id="contact-filter-role" placeholder="Fonction..." data-tooltip="Fonction..." style="width:130px;" oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-camera" placeholder="📷 Caméra..." data-tooltip="📷 Caméra..." style="width:130px;" oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-equipment" placeholder="🔧 Matériel (caméra, objectifs...)" data-tooltip="🔧 Matériel (caméra, objectifs...)" style="width:130px;" oninput="app.Contacts.searchDirectory()">
                </div>
            `;
        } else if(tab === 'projects') {
            filtersDiv.innerHTML = `
                <div class="flex-wrap-gap10">
                    <input type="text" class="global-search-input min-w-150" id="contact-filter-name-projects" placeholder="🔍 Titre..." data-tooltip="🔍 Titre..." oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-city-projects" placeholder="📍 Lieu..." data-tooltip="📍 Lieu..." oninput="app.Contacts.searchDirectory()">
                    <select class="global-search-input" id="contact-filter-projectType" onchange="app.Contacts.searchDirectory()">
                        <option value="">Tous types</option>
                        <option value="court-metrage">Court-métrage</option>
                        <option value="long-metrage">Long-métrage</option>
                        <option value="serie">Série</option>
                        <option value="documentaire">Documentaire</option>
                        <option value="clip">Clip</option>
                        <option value="pub">Publicité</option>
                    </select>
                    <select class="global-search-input" id="contact-filter-genre" onchange="app.Contacts.searchDirectory()">
                        <option value="">Tous genres</option>
                        <option value="drame">Drame</option>
                        <option value="comedie">Comédie</option>
                        <option value="thriller">Thriller</option>
                        <option value="horreur">Horreur</option>
                        <option value="sf">Science-Fiction</option>
                        <option value="fantastique">Fantastique</option>
                    </select>
                </div>
            `;
        } else if(tab === 'associations') {
            filtersDiv.innerHTML = `
                <div class="flex-wrap-gap10">
                    <input type="text" class="global-search-input min-w-150" id="contact-filter-name-associations" placeholder="🔍 Nom..." data-tooltip="🔍 Nom..." oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-city-associations" placeholder="📍 Ville..." data-tooltip="📍 Ville..." oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-activity-associations" placeholder="🎯 Activité..." data-tooltip="🎯 Activité..." style="width:150px;" oninput="app.Contacts.searchDirectory()">
                </div>
            `;
        } else if(tab === 'enterprises') {
            filtersDiv.innerHTML = `
                <div class="flex-wrap-gap10">
                    <input type="text" class="global-search-input min-w-150" id="contact-filter-name-enterprises" placeholder="🔍 Nom..." data-tooltip="🔍 Nom..." oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-city-enterprises" placeholder="📍 Ville..." data-tooltip="📍 Ville..." oninput="app.Contacts.searchDirectory()">
                    <input type="text" class="global-search-input" id="contact-filter-activity-enterprises" placeholder="🎯 Activité..." data-tooltip="🎯 Activité..." style="width:150px;" oninput="app.Contacts.searchDirectory()">
                </div>
            `;
        }
    },
    
    searchDirectory: async () => {
        const tab = Contacts.currentTab;
        const profileTypes = {
            actors: 'actor',
            crew: 'crew',
            projects: 'project',
            associations: 'association',
            enterprises: 'enterprise'
        };
        const profileType = profileTypes[tab] || 'actor';
        
        els.contactsList.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-sec);">🔄 Recherche...</div>';
        
        try {
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
            
            // Filtrer profils complets uniquement
            results = results.filter(r => r.is_public);
            
            // Appliquer filtres
            const suffix = (tab === 'actors') ? '' : '-' + tab;
            const name = (document.getElementById('contact-filter-name' + suffix)?.value || '').toLowerCase();
            const city = (document.getElementById('contact-filter-city' + suffix)?.value || '').toLowerCase();
            
            // Recherche logique : correspondance en debut de mot (et non n'importe ou dans le texte)
            const wordMatch = (txt, q) => { const t = (txt || '').toLowerCase(); return t.startsWith(q) || t.split(/\s+/).some(w => w.startsWith(q)); };
            if(name) results = results.filter(r => wordMatch(r.name, name));
            if(city) results = results.filter(r => wordMatch(r.city, city));
            
            // Respect du reglage de visibilite de la casquette (facets)
            const facetKeyDir = PublicProfile._typeToFacet(profileType);
            if(facetKeyDir) results = results.filter(r => { const f = r.facets && r.facets[facetKeyDir]; return !f || (f.enabled !== false && f.visible !== false); });
            
            if(tab === 'actors') {
                const gender = document.getElementById('contact-filter-gender')?.value;
                const ethnicity = document.getElementById('contact-filter-ethnicity')?.value;
                const sports = (document.getElementById('contact-filter-sports')?.value || '').toLowerCase();
                const languages = (document.getElementById('contact-filter-languages')?.value || '').toLowerCase();
                
                if(gender) results = results.filter(r => r.gender === gender);
                if(ethnicity) results = results.filter(r => r.ethnicity === ethnicity);
                if(sports) results = results.filter(r => (r.sports || '').toLowerCase().includes(sports));
                if(languages) results = results.filter(r => (r.languages || '').toLowerCase().includes(languages));
            } else if(tab === 'crew') {
                const department = document.getElementById('contact-filter-department')?.value;
                const role = (document.getElementById('contact-filter-role')?.value || '').toLowerCase();
                const camera = (document.getElementById('contact-filter-camera')?.value || '').toLowerCase();
                const equipment = (document.getElementById('contact-filter-equipment')?.value || '').toLowerCase();
                
                if(department) results = results.filter(r => r.department === department);
                if(role) results = results.filter(r => (r.role || '').toLowerCase().includes(role));
                if(camera) results = results.filter(r => (r.cameras || []).some(c => c.toLowerCase().includes(camera)));
                if(equipment) {
                    results = results.filter(r => {
                        // v601 : deux listes seulement (cf. ProfileGear).
                        const allEquip = [...(r.cameras || []), ...(r.lenses || [])].join(' ').toLowerCase();
                        return allEquip.includes(equipment);
                    });
                }
            } else if(tab === 'projects') {
                const projectType = document.getElementById('contact-filter-projectType')?.value;
                const genre = document.getElementById('contact-filter-genre')?.value;
                
                if(projectType) results = results.filter(r => r.projectType === projectType);
                if(genre) results = results.filter(r => r.genre === genre);
            } else if(tab === 'associations' || tab === 'enterprises') {
                const activity = (document.getElementById('contact-filter-activity-' + tab)?.value || '').toLowerCase();
                
                if(activity) results = results.filter(r => (r.activity || r.description || '').toLowerCase().includes(activity));
            }
            
            Contacts.directoryResults = results;
            Contacts.renderDirectory();
            
        } catch(e) {
            console.error('Erreur recherche annuaire:', e);
            els.contactsList.innerHTML = '<div style="text-align:center; padding:40px; color:var(--danger);">❌ Erreur de recherche</div>';
        }
    },
    
    renderDirectory: () => {
        const results = Contacts.directoryResults;
        const tab = Contacts.currentTab;
        
        if(results.length === 0) {
            els.contactsList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-sec);">
                <p style="font-size: 1.2rem; margin-bottom: 10px;">Aucun profil trouvé</p>
                <p class="fs-09">Essayez d'élargir vos critères de recherche</p>
            </div>`;
            return;
        }
        
        let html = `<div style="grid-column: 1/-1; margin-bottom:10px; color:var(--text-sec);">${results.length} profil${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}</div>`;
        
        results.forEach((person, idx) => {
            const photoHTML = person.photo 
                ? `<img src="${Utils.safeMediaUrl(person.photo)}" alt="${Utils.escape(person.name)}">`
                : '👤';
            
            let metaHTML = '';
            let defaultIcon = '👤';
            if(tab === 'actors') {
                const details = [];
                if(person.age) details.push(Utils.escape(person.age + ' ans'));
                if(person.city) details.push('📍 ' + Utils.escape(person.city));
                metaHTML = details.join(' • ');
                defaultIcon = '🎭';
            } else if(tab === 'crew') {
                metaHTML = Utils.escape(person.role || '');
                if(person.city) metaHTML += ' • 📍 ' + Utils.escape(person.city);
                defaultIcon = '🎥';
            } else if(tab === 'projects') {
                metaHTML = Utils.escape(person.projectType || '');
                if(person.genre) metaHTML += ' • ' + Utils.escape(person.genre);
                if(person.city) metaHTML += ' • 📍 ' + Utils.escape(person.city);
                defaultIcon = '🎬';
            } else if(tab === 'associations') {
                metaHTML = Utils.escape(person.activity || '');
                if(person.city) metaHTML += ' • 📍 ' + Utils.escape(person.city);
                defaultIcon = '🏛️';
            } else if(tab === 'enterprises') {
                metaHTML = Utils.escape(person.activity || '');
                if(person.city) metaHTML += ' • 📍 ' + Utils.escape(person.city);
                defaultIcon = '🏢';
            }
            
            // Vérifier si déjà dans favoris
            const isInFavorites = state.contacts && state.contacts[Contacts.currentTab] && 
                state.contacts[Contacts.currentTab].some(c => c.email === person.email);
            
            html += `<div class="contact-card">
                <div class="contact-card-header">
                    <div class="contact-card-photo">${photoHTML}</div>
                    <div>
                        <div class="contact-card-name">${Utils.escape(person.name || person.title || person.assoName || person.entName || 'Sans nom')}</div>
                        <div class="contact-card-role">${metaHTML}</div>
                    </div>
                </div>
                <div class="contact-card-info">
                    ${person.email ? `📧 ${Utils.escape(person.email)}<br>` : ''}
                    ${person.phone ? `📱 ${Utils.escape(person.phone)}<br>` : ''}
                    ${person.hasVehicle ? '🚗 Véhicule disponible' : ''}
                </div>
                <div class="contact-card-actions">
                    <button onclick="app.Contacts.viewDirectoryProfile(${idx})">👁️ Voir</button>
                    <button onclick="app.Contacts.addToFavorites(${idx})" style="${isInFavorites ? 'opacity:0.5; cursor:not-allowed;' : ''}" ${isInFavorites ? 'disabled' : ''}>${isInFavorites ? '⭐ Déjà favori' : '⭐ Ajouter aux favoris'}</button>
                </div>
            </div>`;
        });
        
        els.contactsList.innerHTML = html;
    },
    
    viewDirectoryProfile: (idx) => {
        const person = Contacts.directoryResults[idx];
        if(!person) return;
        
        const tab = Contacts.currentTab;
        const displayName = person.name || person.title || person.assoName || person.entName || 'Sans nom';
        let defaultIcon = '👤';
        
        let detailsHTML = '';
        if(tab === 'actors') {
            defaultIcon = '🎭';
            detailsHTML = `
                <p><strong>Âge:</strong> ${Utils.escape(String(person.age || 'N/A'))} ans</p>
                <p><strong>Taille:</strong> ${Utils.escape(String(person.height || 'N/A'))} cm</p>
                <p><strong>Yeux:</strong> ${Utils.escape(person.eyeColor || 'N/A')}</p>
                <p><strong>Cheveux:</strong> ${Utils.escape(person.hairColor || 'N/A')}</p>
                <p><strong>Origine:</strong> ${Utils.escape(person.ethnicity || 'N/A')}</p>
                ${person.sports ? `<p><strong>Sports:</strong> ${Utils.escape(person.sports)}</p>` : ''}
                ${person.languages ? `<p><strong>Langues:</strong> ${Utils.escape(person.languages)}</p>` : ''}
            `;
        } else if(tab === 'crew') {
            defaultIcon = '🎥';
            detailsHTML = `
                <p><strong>Département:</strong> ${Utils.escape(person.department || 'N/A')}</p>
                <p><strong>Fonction:</strong> ${Utils.escape(person.role || 'N/A')}</p>
                ${person.cameras && person.cameras.length > 0 ? `<p><strong>Caméras:</strong> ${Utils.escape(person.cameras.join(', '))}</p>` : ''}
                ${person.lenses && person.lenses.length > 0 ? `<p><strong>Objectifs:</strong> ${Utils.escape(person.lenses.join(', '))}</p>` : ''}
            `;
        } else if(tab === 'projects') {
            defaultIcon = '🎬';
            detailsHTML = `
                <p><strong>Type:</strong> ${Utils.escape(person.projectType || 'N/A')}</p>
                <p><strong>Genre:</strong> ${Utils.escape(person.genre || 'N/A')}</p>
                ${person.director ? `<p><strong>Réalisateur:</strong> ${Utils.escape(person.director)}</p>` : ''}
                ${person.producer ? `<p><strong>Producteur:</strong> ${Utils.escape(person.producer)}</p>` : ''}
                ${person.status ? `<p><strong>Statut:</strong> ${Utils.escape(person.status)}</p>` : ''}
            `;
        } else if(tab === 'associations') {
            defaultIcon = '🏛️';
            detailsHTML = `
                <p><strong>Activité:</strong> ${Utils.escape(person.activity || 'N/A')}</p>
                ${person.members ? `<p><strong>Membres:</strong> ${Utils.escape(person.members)}</p>` : ''}
                ${person.website ? `<p><strong>Site web:</strong> <a href="${Utils.safeUrl(person.website)}" target="_blank" rel="noopener">${Utils.escape(person.website)}</a></p>` : ''}
            `;
        } else if(tab === 'enterprises') {
            defaultIcon = '🏢';
            detailsHTML = `
                <p><strong>Activité:</strong> ${Utils.escape(person.activity || 'N/A')}</p>
                ${person.siret ? `<p><strong>SIRET:</strong> ${Utils.escape(person.siret)}</p>` : ''}
                ${person.website ? `<p><strong>Site web:</strong> <a href="${Utils.safeUrl(person.website)}" target="_blank" rel="noopener">${Utils.escape(person.website)}</a></p>` : ''}
            `;
        }
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        const isInFavorites = state.contacts && state.contacts[Contacts.currentTab] && 
            state.contacts[Contacts.currentTab].some(c => c.email === person.email);
        
        modal.innerHTML = `
            <div class="modal-panel">
                <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
                    <div class="n8-avatar-4">
                        ${person.photo ? `<img src="${Utils.safeMediaUrl(person.photo)}" alt="Photo de profil" style="width:100%;height:100%;object-fit:cover;">` : defaultIcon}
                    </div>
                    <div>
                        <h2 class="m-0">${Utils.escape(displayName)}</h2>
                        <p style="margin:5px 0 0;color:var(--text-sec);">📍 ${Utils.escape(person.city || 'Non précisé')}</p>
                    </div>
                </div>
                ${person.bio || person.description ? `<p class="mb-15">${Utils.escape(person.bio || person.description)}</p>` : ''}
                <div class="box-bg">
                    ${detailsHTML}
                </div>
                <div class="box-bg">
                    <p><strong>📧 Email:</strong> ${Utils.escape(person.email || 'N/A')}</p>
                    <p><strong>📱 Téléphone:</strong> ${Utils.escape(person.phone || 'N/A')}</p>
                    <p><strong>💰 Tarif:</strong> ${Utils.escape(String(person.dailyRate || 'N/A'))} ${Utils.escape(person.rateCurrency || '€')} / jour</p>
                    ${person.hasVehicle ? `<p><strong>🚗 Véhicule:</strong> ${Utils.escape(person.vehicleType || 'Oui')}</p>` : ''}
                </div>
                <div style="display:flex;gap:10px;">
                    <button onclick="this.closest('div[style*=fixed]').remove()" style="flex:1;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;">Fermer</button>
                    <button onclick="app.Contacts.addToFavorites(${idx}); this.closest('div[style*=fixed]').remove();" style="flex:1;padding:12px;background:var(--primary);color:white;border:none;border-radius:6px;cursor:pointer;" ${isInFavorites ? 'disabled style="flex:1;padding:12px;background:var(--text-sec);color:white;border:none;border-radius:6px;cursor:not-allowed;"' : ''}>${isInFavorites ? '⭐ Déjà dans favoris' : '⭐ Ajouter aux favoris'}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    addToFavorites: async (idx) => {
        const person = Contacts.directoryResults[idx];
        if(!person) return;
        
        const type = Contacts.currentTab;
        const email = state.currentUser.email.toLowerCase();
        
        // Créer l'entrée contact
        const contactData = {
            owner_email: email,
            contact_email: person.email || '',
            contact_type: type,
            name: person.name || person.title || person.assoName || person.entName,
            notes: JSON.stringify(person),
            created_at: new Date().toISOString()
        };
        
        try {
            const { data, error } = await supabase.from('contacts').insert(contactData).select().single();
            
            if(error) throw error;
            
            // Mettre à jour en local
            if(!state.contacts) state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
            if(!state.contacts[type]) state.contacts[type] = [];
            state.contacts[type].push({ ...person, id: data.id });
            
            Utils.toast(`${person.name || 'Contact'} ajouté(e) à vos favoris !`, 'success');
            Contacts.renderDirectory();
        } catch(e) {
            console.error('Erreur ajout favoris:', e);
            Utils.toast('Erreur lors de l\'ajout', 'error');
        }
    },
    
    // ===================== MES CONTACTS : CHARGEMENT & RENDU =====================
    loadAndRender: async () => {
        const email = state.currentUser.email.toLowerCase();
        try {
            const { data: contacts, error } = await supabase
                .from('contacts')
                .select('*')
                .eq('owner_email', email);
            
            if(!error && contacts) {
                // Enrichir chaque contact avec publicProfileId depuis notes
                const enrichedContacts = contacts.map(c => {
                    let enriched = { ...c };
                    try {
                        const notesData = JSON.parse(c.notes || '{}');
                        if(notesData.publicProfileId) {
                            enriched.publicProfileId = notesData.publicProfileId;
                        }
                    } catch(e) {}
                    return enriched;
                });
                
                state.contacts = {
                    actors: enrichedContacts.filter(c => c.contact_type === 'actor'),
                    crew: enrichedContacts.filter(c => c.contact_type === 'crew'),
                    projects: enrichedContacts.filter(c => c.contact_type === 'project'),
                    associations: enrichedContacts.filter(c => c.contact_type === 'association'),
                    enterprises: enrichedContacts.filter(c => c.contact_type === 'enterprise')
                };
            } else {
                state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
            }
        } catch(e) {
            console.error('Erreur chargement contacts:', e);
            state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
        }
        Contacts.render();
    },
    
    render: () => {
        const tab = Contacts.currentTab;
        const list = state.contacts[tab] || [];
        
        const tabLabels = {
            actors: 'comédien.ne',
            crew: 'technicien.ne',
            projects: 'projet',
            associations: 'association',
            enterprises: 'entreprise'
        };
        const tabIcons = {
            actors: '🎭',
            crew: '🎥',
            projects: '🎬',
            associations: '🏛️',
            enterprises: '🏢'
        };
        
        if(!list || list.length === 0) {
            els.contactsList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-sec);">
                <p style="font-size: 1.2rem; margin-bottom: 10px;">Aucun ${tabLabels[tab] || 'contact'} en favoris</p>
                <p class="fs-09">Ajoutez des favoris depuis l'Annuaire ou l'Univers en cliquant sur ⭐</p>
            </div>`;
            return;
        }
        
        let html = '';
        list.forEach((contact, idx) => {
            const displayName = contact.name || contact.title || contact.assoName || contact.entName || 'Sans nom';
            const photoHTML = contact.photo 
                ? `<img src="${contact.photo}" alt="${displayName}">`
                : tabIcons[tab] || '👤';
            
            let roleOrDept = '';
            if(tab === 'actors') {
                roleOrDept = contact.linkedCharacter || contact.city || '';
            } else if(tab === 'crew') {
                roleOrDept = contact.role || contact.department || '';
            } else if(tab === 'projects') {
                roleOrDept = contact.projectType || contact.genre || '';
            } else if(tab === 'associations' || tab === 'enterprises') {
                roleOrDept = contact.activity || contact.city || '';
            }
            
            html += `<div class="contact-card">
                <div class="contact-card-header">
                    <div class="contact-card-photo">${photoHTML}</div>
                    <div>
                        <div class="contact-card-name">${Utils.escape(displayName)}</div>
                        <div class="contact-card-role">${Utils.escape(roleOrDept)}</div>
                    </div>
                </div>
                <div class="contact-card-info">
                    ${contact.email ? `📧 ${Utils.escape(contact.email)}<br>` : ''}
                    ${contact.phone ? `📱 ${Utils.escape(contact.phone)}<br>` : ''}
                    ${contact.website ? `🌐 ${contact.website}<br>` : ''}
                    ${contact.hasVehicle ? '🚗 Véhicule disponible' : ''}
                </div>
                <div class="contact-card-actions">
                    <button onclick="app.Contacts.edit('${tab}', ${idx})">✏️ Modifier</button>
                    <button onclick="app.Contacts.delete('${tab}', ${idx})" class="text-danger">🗑️ Supprimer</button>
                </div>
            </div>`;
        });
        
        els.contactsList.innerHTML = html;
    },
    
    // ===================== SAUVEGARDE & ÉDITION =====================
    saveActorToContacts: async (idx) => {
        const data = state.data.actors[idx];
        if(!data) return;
        await Contacts.saveToContacts('actors', data);
        UI.renderDataTab('actors', els.actorContainer);
    },
    
    saveCrewToContacts: async (idx) => {
        const data = state.data.crew[idx];
        if(!data) return;
        await Contacts.saveToContacts('crew', data);
        UI.renderCrewTab();
    },
    
    saveToContacts: async (type, data) => {
        const emailKey = Utils.sanitizeEmail(state.currentUser.email);
        const contactData = {
            id: data.id || ('contact_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
            name: data.name,
            gender: data.gender || '',
            photo: data.photo || '',
            email: data.email || '',
            phone: data.phone || '',
            address: data.address || '',
            website: data.website || '',
            bio: data.bio || '',
            hasVehicle: data.hasVehicle || false,
            vehicleType: data.vehicleType || '',
            vehiclePlate: data.vehiclePlate || '',
            vehicleSeats: data.vehicleSeats || '',
            vehicleTrunk: data.vehicleTrunk || false,
            vehicleNotes: data.vehicleNotes || '',
            dailyRate: data.dailyRate || '',
            rateCurrency: data.rateCurrency || '€',
            rateType: data.rateType || 'Jour',
            availabilityText: data.availabilityText || '',
            availabilityDates: data.availabilityDates || [],
            height: data.height || '',
            weight: data.weight || '',
            age: data.age || '',
            eyeColor: data.eyeColor || '',
            hairColor: data.hairColor || '',
            hairLength: data.hairLength || '',
            ethnicity: data.ethnicity || '',
            bustSize: data.bustSize || '',
            bustType: data.bustType || '',
            corpulence: data.corpulence || '',
            sports: data.sports || '',
            languages: data.languages || '',
            savedAt: new Date().toISOString()
        };
        
        if(type === 'crew') {
            contactData.role = data.role || '';
            contactData.department = data.group_id || '';
        }
        
        try {
            // Sauvegarder dans Supabase
            const { error } = await supabase.from('contacts').upsert({
                id: contactData.id,
                owner_email: state.currentUser.email.toLowerCase(),
                contact_email: contactData.email || '',
                contact_type: type,
                name: contactData.name,
                notes: JSON.stringify(contactData)
            }, { onConflict: 'id' });
            
            if (error) throw error;
            
            // Recharger les contacts en mémoire
            if(!state.contacts) state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
            if(!state.contacts[type]) state.contacts[type] = [];
            const list = state.contacts[type];
            const existingIdx = list.findIndex(c => c.id === contactData.id);
            if(existingIdx > -1) {
                list[existingIdx] = contactData;
            } else {
                list.push(contactData);
            }
            Utils.toast('Contact sauvegardé !', 'success');
            return true;
        } catch(e) {
            console.error('Erreur sauvegarde contact:', e);
            Utils.toast('Erreur lors de la sauvegarde', 'error');
            return false;
        }
    },
    
    delete: async (type, idx) => {
        if(!await ConfirmModal.confirmDelete("Ce contact sera supprimé.")) return;
        
        const list = state.contacts[type] || [];
        const contact = list[idx];
        if(!contact) return;
        
        try {
            const {error: delCtcErr} = await supabase.from('contacts').delete().eq('id', contactToRemove.id);
            if(delCtcErr) { Utils.toast('Erreur suppression contact', 'error'); return; }
            btn.textContent = '☆';
            Contacts.render();
        } catch(e) {
            console.error('Erreur suppression contact:', e);
            Utils.toast('Erreur lors de la suppression', 'error');
        }
    },
    
    edit: (type, idx) => {
        Utils.toast('Fonctionnalité d\'édition à venir !', 'info');
    },
    
    // Contacts.isInContacts retirée v569, jamais appelée : la même logique
    // est recalculée en ligne à chaque rendu de carte plutôt que d'appeler
    // ce helper.
    
    // ===================== IMPORT VERS PROJET =====================
    importToProject: async (type) => {
        if(!state.contacts) await Contacts.loadAndRender();
        
        const list = type === 'actors' ? state.contacts.actors : state.contacts.crew;
        if(!list || list.length === 0) {
            Utils.toast('Aucun contact à importer. Ajoutez d\'abord des contacts depuis vos projets.', 'warning');
            return;
        }
        
        let html = `<div style="max-height: 400px; overflow-y: auto;">`;
        list.forEach((contact, idx) => {
            const alreadyInProject = type === 'actors' 
                ? state.data.actors.some(a => a.id === contact.id)
                : state.data.crew.some(c => c.id === contact.id);
            
            html += `<label style="display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid var(--border); cursor: ${alreadyInProject ? 'not-allowed' : 'pointer'}; opacity: ${alreadyInProject ? '0.5' : '1'};">
                <input type="checkbox" ${alreadyInProject ? 'disabled checked' : ''} data-idx="${idx}">
                <span>${Utils.escape(contact.name)}</span>
                ${alreadyInProject ? '<span class="text-sec-sm">(déjà ajouté)</span>' : ''}
            </label>`;
        });
        html += `</div>`;
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index: var(--z-modal);';
        modal.innerHTML = `<div style="background:var(--panel-bg);border-radius:12px;padding:20px;max-width:500px;width:90%;">
            <h3 style="margin:0 0 15px 0;">📇 Importer des contacts</h3>
            ${html}
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:15px;">
                <button onclick="this.closest('div[style*=fixed]').remove()" style="padding:10px 20px;border:1px solid var(--border);background:var(--bg);border-radius:6px;cursor:pointer;">Annuler</button>
                <button onclick="app.Contacts.doImport('${type}', this.closest('div[style*=fixed]'))" style="padding:10px 20px;background:var(--primary);color:white;border:none;border-radius:6px;cursor:pointer;">Importer</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    },
    
    doImport: (type, modal) => {
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked:not([disabled])');
        const list = type === 'actors' ? state.contacts.actors : state.contacts.crew;
        
        checkboxes.forEach(cb => {
            const idx = parseInt(cb.dataset.idx);
            const contact = list[idx];
            if(!contact) return;
            
            const newEntry = { ...contact };
            newEntry.availabilityDates = [];
            newEntry.availabilityText = '';
            delete newEntry.savedAt;
            
            if(type === 'actors') {
                state.data.actors.push(newEntry);
            } else {
                state.data.crew.push(newEntry);
            }
        });
        
        Store.save();
        modal.remove();
        
        if(type === 'actors') {
            UI.renderDataTab('actors', els.actorContainer);
        } else {
            UI.renderCrewTab();
        }
        
        Utils.toast(`${checkboxes.length} contact(s) importé(s) !`, 'success');
    }
};
  