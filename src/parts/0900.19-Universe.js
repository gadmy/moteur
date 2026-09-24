
const Universe = {
    // ===================== ÉTAT & CONFIG =====================
    filteredProfiles: [],
    searchActive: false, // recherche en cours : carte ET liste affichent le meme filtre
    allProjects: [],
    filteredProjects: [],
    currentProfile: null,
    cards: [],
    animationRunning: false,
    // v593 : sceneRect retiré (jamais lu).
    myProfiles: [], // Profils de l'utilisateur
    // v593 : myProjects retiré (jamais lu ; myProfiles ci-dessus reste, lui utilisé).
    
    // Carte Leaflet
    map: null,
    markersLayer: null,
    tileLayer: null,
    viewMode: 'map', // 'map' ou 'fan'
    geoCache: {}, // Cache des géolocalisations
    
    // Positions réelles des markers (écrites par UniverseMap)
    markerPositions: {}, // { "profile_id": {lat, lng} }
       
// Compteur de positions par ville pour la spirale (partagé : écrit par UniverseMap & UniverseSearch)
    cityPositionCounters: {},
    
    // Carte Leaflet — délégué à UniverseMap
    getDeterministicOffset: (...a) => UniverseMap.getDeterministicOffset(...a),
    shouldHideAddress: (...a) => UniverseMap.shouldHideAddress(...a),
    geocodeCity: (...a) => UniverseMap.geocodeCity(...a),
    createMapMarker: (...a) => UniverseMap.createMapMarker(...a),
    loadMapMarkers: (...a) => UniverseMap.loadMapMarkers(...a),
    loadMapMarkersInView: (...a) => UniverseMap.loadMapMarkersInView(...a),
    updateMapTheme: (...a) => UniverseMap.updateMapTheme(...a),
    setViewMode: (...a) => UniverseMap.setViewMode(...a),
	
	// ===================== FORMULAIRE & DROPDOWNS =====================
	// Données des rôles par département
    // Affiche/masque les filtres selon le type sélectionné
    onTypeChange: () => {
        const type = document.getElementById('universe-type').value;
        
        document.getElementById('universe-filters-crew').style.display = 'none';
        document.getElementById('universe-filters-actor').style.display = 'none';
        document.getElementById('universe-filters-project').style.display = 'none';
        document.getElementById('universe-filters-collab').style.display = 'none';
        document.getElementById('universe-filters-production-type').style.display = 'none';
        document.getElementById('universe-filters-association').style.display = 'none';
        document.getElementById('universe-filters-enterprise').style.display = 'none';
        
        // Réinitialiser les filtres pour forcer le rechargement par type
        Universe.searchActive = false;
        Universe.filteredProfiles = [];
        Universe.filteredProjects = [];
        
        // Mettre à jour l'affichage selon le type sélectionné
        if(Universe.viewMode === 'map') {
            Universe.loadMapMarkersInView();
        } else {
            Universe.render();
        }
        
        if(type === 'crew') {
            document.getElementById('universe-filters-crew').style.display = 'flex';
            document.getElementById('universe-filters-collab').style.display = 'flex';
            Universe.populateCrewRoles();
        } else if(type === 'actor') {
            document.getElementById('universe-filters-actor').style.display = 'flex';
            document.getElementById('universe-filters-collab').style.display = 'flex';
        } else if(type === 'project') {
            document.getElementById('universe-filters-project').style.display = 'flex';
            document.getElementById('universe-filters-production-type').style.display = 'flex';
        } else if(type === 'association') {
            document.getElementById('universe-filters-association').style.display = 'flex';
            Universe.populateAssociationTypes();
        } else if(type === 'enterprise') {
            document.getElementById('universe-filters-enterprise').style.display = 'flex';
            Universe.populateEnterpriseTypes();
        }
    },

    // Les fiches technicien VISIBLES d'un profil (une personne peut en avoir
    // plusieurs depuis v597). Rend un tableau vide pour un profil sans casquettes.
    _fichesCrew: (p) => {
        if(!p || !p.facets) return [];
        return PublicProfile.crewArr(p.facets).filter(f => f && f.enabled && f.visible !== false);
    },

    // Remplit la liste des fonctions techniciens selon le département.
    // v600 — LE MEME REFERENTIEL QUE PARTOUT AILLEURS (CONFIG.crewRoles).
    // Cette liste avait sa PROPRE table (crewRolesByDept), avec ses propres
    // identifiants de departement ('image', 'lumiere'…) et ses propres
    // orthographes ('Cadreur', 'Perchman'). Or le selecteur Departement, lui,
    // est rempli depuis CONFIG.crewGroups ('gc1', 'gc2'…) : choisir un
    // departement ne trouvait donc AUCUNE fonction, et sans departement la
    // liste proposait des libelles ('Cadreur') que pas un profil ne porte
    // ('Cadreur·euse'). La recherche par fonction ne pouvait pas aboutir.
    populateCrewRoles: (dept) => {
        const select = document.getElementById('universe-crew-role');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Fonction --</option>';
        
        const table = (typeof CONFIG !== 'undefined' && CONFIG.crewRoles) ? CONFIG.crewRoles : {};
        let roles = [];
        if(dept && table[dept]) {
            roles = table[dept].slice();
        } else {
            Object.values(table).forEach(r => { roles = roles.concat(r); });
        }
        // « Autre » n'est pas une fonction : c'est la porte de sortie du
        // formulaire de saisie, elle n'a rien a faire dans un filtre.
        roles = [...new Set(roles)].filter(r => r && r !== 'Autre');
        
        roles.sort((a, b) => a.localeCompare(b, 'fr')).forEach(role => {
            const opt = document.createElement('option');
            opt.value = role.toLowerCase();
            opt.textContent = role;
            select.appendChild(opt);
        });
    },

    // Quand on change le département
    onDepartmentChange: () => {
        const dept = document.getElementById('universe-department').value;
        Universe.populateCrewRoles(dept);
    },
    
    // Remplit la liste des types d'associations
    populateAssociationTypes: () => {
        const select = document.getElementById('universe-association-type');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Type d\'association --</option>';
        CONFIG.associationTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type.id;
            opt.textContent = type.name;
            select.appendChild(opt);
        });
    },
    
    // Remplit la liste des types d'entreprises
    populateEnterpriseTypes: () => {
        const select = document.getElementById('universe-enterprise-type');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Type d\'entreprise --</option>';
        CONFIG.enterpriseTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type.id;
            opt.textContent = type.name;
            select.appendChild(opt);
        });
    },
	
    // ===================== INIT & CHARGEMENT DONNÉES =====================
    // Initialise l'univers
    init: async () => {
        await Universe.loadAllProfiles();
        Universe.populateDepartments();
        
        // Réinitialiser le type à "Tous"
        const typeSelect = document.getElementById('universe-type');
        if(typeSelect) typeSelect.value = '';
        
        // Masquer tous les filtres spécifiques
        if(document.getElementById('universe-filters-crew')) document.getElementById('universe-filters-crew').style.display = 'none';
        if(document.getElementById('universe-filters-actor')) document.getElementById('universe-filters-actor').style.display = 'none';
        if(document.getElementById('universe-filters-association')) document.getElementById('universe-filters-association').style.display = 'none';
        if(document.getElementById('universe-filters-enterprise')) document.getElementById('universe-filters-enterprise').style.display = 'none';
        if(document.getElementById('universe-filters-project')) document.getElementById('universe-filters-project').style.display = 'none';
        
Universe.setViewMode('map');
    },
    
    // Charge tous les profils publics et projets
    loadAllProfiles: async () => {
        Universe.allProfiles = [];
        Universe.allProjects = [];
        
        try {
            // Charger tous les profils publics depuis Supabase
            // v578 (audit) : select('*') envoyait le telephone de chaque profil a tout
            // inscrit, affiche ou non. La fonction serveur rend les memes lignes avec
            // la regle du telephone deja appliquee (agent en priorite, ou masque).
            const { data: profiles, error } = await supabase.rpc('public_profiles_for_me', { p_type: null });
            if(error) { console.error('[Univers] public_profiles_for_me:', error); Utils.toast('Impossible de charger les profils de l\u2019Univers. Vérifie ta connexion et réessaie.', 'error', 6000); }

            if(!error && profiles) {
                profiles.forEach(p => {
                    if(p.name) {
                        const extraData = p.data || {};
                        // Facettes : normalisation (filet pour les profils jamais resauvegardés)
                        const facets = PublicProfile._normalizeFacets(extraData.facets, p);
                        // v598 : une entrée par fiche technicien active (clé composite 'crew', 'crew:1'...)
                        const visibleFacets = [];
                        PublicProfile.FACET_KEYS.forEach(k => {
                            if(k === 'crew') {
                                PublicProfile.crewArr(facets).forEach((cf, i) => { if(cf && cf.enabled && cf.visible !== false) visibleFacets.push(PublicProfile._facetKey('crew', i)); });
                            } else if(facets[k].enabled && facets[k].visible !== false) {
                                visibleFacets.push(k);
                            }
                        });
                        if(visibleFacets.length === 0) return; // aucune casquette visible : absent de l'Univers
                        const item = { 
                            ...p, 
                            ...extraData,
                            facets: facets,
                            visibleFacets: visibleFacets,
                            type: PublicProfile._facetToType(PublicProfile._facetKind(visibleFacets[0])) || p.profile_type || 'crew',
                            hasVehicle: p.vehicle || false,
                            availabilityText: p.availability || '',
                            profileComplete: true 
                        };
                        // v601 : L'AGE EST RECALCULE ICI, une fois, pour tout
                        // le monde. Tous ceux qui lisent « p.age » plus loin
                        // — filtres, carte, tri du casting, moteur de
                        // correspondance — recoivent donc un age juste
                        // AUJOURD'HUI, sans avoir a connaitre la date de
                        // naissance ni a la recalculer chacun de son cote.
                        const _age = PublicProfile.ageDe(item);
                        if(_age !== null) item.age = _age;
                        // Le marqueur porte les infos de la première casquette visible
                        const ff0 = PublicProfile.facetByKey(facets, visibleFacets[0]);
                        ['name', 'photo', 'city', 'latitude', 'longitude'].forEach(k => {
                            if(ff0[k] !== undefined && ff0[k] !== null) item[k] = ff0[k];
                        });
                        // Profil uniquement « moral » (asso/entreprise) avec siège géocodé : marqueur au siège
                        if(!visibleFacets.some(k => PublicProfile._facetKind(k) === 'actor' || PublicProfile._facetKind(k) === 'crew')) {
                            const hq = PublicProfile.facetByKey(facets, visibleFacets[0]);
                            if(hq && hq.hqLatitude != null && hq.hqLongitude != null) {
                                item.latitude = hq.hqLatitude;
                                item.longitude = hq.hqLongitude;
                            }
                        }
                        Universe.allProfiles.push(item);
                    }
                });
            }
            
            // Charger les projets publics depuis la table projects
            try {
                const { data: projects, error: projError } = await supabase
                    .rpc('get_public_projects');
                
                if(!projError && projects) {
                    projects.forEach(proj => {
                        const pubData = proj.public_data;
                        if(pubData) {
                            // v616 : projets factices de démo (recherches d'acteur pour
                            // présentation), réservés à un compte précis via un
                            // marqueur demoOnlyFor. get_public_projects() n'a pas cette
                            // notion côté serveur (pas d'équivalent du is_demo des
                            // profils) — filtré ici, côté client, avant affichage.
                            if(pubData.demoOnlyFor && (!state.currentUser || state.currentUser.email !== pubData.demoOnlyFor)) return;
                            Universe.allProjects.push({
                                ...pubData,
                                id: proj.id,
                                type: 'project',
                                title: pubData.title || proj.title || 'Sans titre',
                                location: pubData.city || '',
                                ownerEmail: pubData.ownerEmail || proj.owner_email,
                                projectId: proj.id
                            });
                        }
                    });
                    // Projets publics chargés
                }
            } catch(e) {
                console.error('Erreur chargement projets publics:', e);
            }
            
            // Stocker mes profils pour le matching
            const myEmail = state.currentUser?.email;
            const myEmailKey = myEmail ? Utils.sanitizeEmail(myEmail) : null;
            const myEmailLower = myEmail ? myEmail.toLowerCase() : null;
            Universe.myProfiles = Universe.allProfiles.filter(p => 
                p.ownerEmail === myEmail || 
                p.ownerEmail === myEmailLower ||
                p.email === myEmail ||
                p.email === myEmailLower ||
                p.id === myEmailKey ||
                (p.id && myEmailKey && p.id.toLowerCase() === myEmailKey.toLowerCase())
            );
            // Profils chargés
            
            // Initialiser le sélecteur : mes casquettes ET mes projets (v601).
            try { CastingMatch.remplirSelecteur(); }
            catch(e) { MatchingEngine.initProfileSelector(); }
            
        } catch(e) {
            console.error('Erreur chargement profils:', e);
            Utils.toast('Impossible de charger l\u2019Univers pour le moment.', 'error', 6000);
        }
        
        },
    populateDepartments: () => {
        const select = document.getElementById('universe-department');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Département --</option>';
        CONFIG.crewGroups.forEach(grp => {
            const opt = document.createElement('option');
            opt.value = grp.id;
            opt.textContent = grp.name;
            select.appendChild(opt);
        });
    },
    
  // Rendu principal
    render: () => {
        const scene = document.getElementById('universe-scene');
        if(!scene) return;
        
        // Si mode carte, mettre à jour les marqueurs
        if(Universe.viewMode === 'map') {
            Universe.loadMapMarkers();
            return;
        }
        
        // Mode fan/liste
        Universe.renderFanView(scene);
    },
    
    // Vue éventail animée — délégué à UniverseFan
    renderFanView: (...a) => UniverseFan.renderFanView(...a),
    createFanCategory: (...a) => UniverseFan.createFanCategory(...a),
    createFanCard: (...a) => UniverseFan.createFanCard(...a),
// Recherche & filtres — délégué à UniverseSearch
    search: (...a) => UniverseSearch.search(...a),
    loadFilteredMapMarkers: (...a) => UniverseSearch.loadFilteredMapMarkers(...a),
    reset: (...a) => UniverseSearch.reset(...a),
    onLocationInput: (...a) => UniverseSearch.onLocationInput(...a),
    onLocationKey: (...a) => UniverseSearch.onLocationKey(...a),
    pickLocation: (...a) => UniverseSearch.pickLocation(...a),
    hideLocationSuggest: (...a) => UniverseSearch.hideLocationSuggest(...a),
    // Ouvre le modal de profil
	// Ouvre le modal d'un projet
	
	
	
    // ===================== MODALE PROJET =====================
    openProjectModal: (project) => {
        const typeLabels = {
            'court-metrage': 'Court-métrage',
            'long-metrage': 'Long-métrage',
            'serie': 'Série',
            'documentaire': 'Documentaire',
            'clip': 'Clip',
            'pub': 'Publicité',
            'corporate': 'Corporate'
        };
        const genreLabels = {
            'drame': 'Drame', 'comedie': 'Comédie', 'thriller': 'Thriller',
            'horreur': 'Horreur', 'sf': 'Science-Fiction', 'fantastique': 'Fantastique',
            'action': 'Action', 'romance': 'Romance', 'animation': 'Animation',
            'experimental': 'Expérimental'
        };
        const productionTypeLabels = {
            'pro': '🎬 Production Professionnelle',
            'semi-pro': '⚡ Production Semi-pro',
            'benevole': '❤️ Production Bénévole'
        };
        
        const typeText = typeLabels[project.projectType] || project.projectType || '';
        const genreText = genreLabels[project.genre] || project.genre || '';
        
        // Options de visibilité (par défaut tout visible sauf legal)
        const vis = project.visibility || { description: true, team: true, dates: true, casting: true, crew: true, location: true, productionType: true, partners: true, legal: false };
        
        // Localisation
        let locationHtml = '';
        if(vis.location !== false && project.city) {
            locationHtml = `<div class="mb-15-bg">
                <strong>📍 Localisation :</strong> ${Utils.escape(project.city)}${project.region ? ', ' + Utils.escape(project.region) : ''}${project.country && project.country !== 'France' ? ' (' + Utils.escape(project.country) + ')' : ''}
            </div>`;
        }
        
        // Dates
        let datesHtml = '';
        if(vis.dates !== false && (project.datePreprodStart || project.dateShootingStart || project.dateRelease)) {
            datesHtml = '<div class="mb-15-bg"><strong>📅 Calendrier :</strong><div style="margin-top: 8px; display: grid; gap: 5px;">';
            // v602 (audit securite) : ces champs viennent de la fiche publique
            // d'un AUTRE utilisateur — tout s'echappe, meme une « date ».
            const e = Utils.escape;
            if(project.datePreprodStart) datesHtml += `<div>• Pré-prod : ${e(project.datePreprodStart)}${project.datePreprodEnd ? ' → ' + e(project.datePreprodEnd) : ''}</div>`;
            if(project.dateShootingStart) datesHtml += `<div>• Tournage : ${e(project.dateShootingStart)}${project.dateShootingEnd ? ' → ' + e(project.dateShootingEnd) : ''}</div>`;
            if(project.datePostprodStart) datesHtml += `<div>• Post-prod : ${e(project.datePostprodStart)}${project.datePostprodEnd ? ' → ' + e(project.datePostprodEnd) : ''}</div>`;
            if(project.dateRelease) datesHtml += `<div>• Sortie prévue : ${e(project.dateRelease)}</div>`;
            datesHtml += '</div></div>';
        }
        
        // Équipe
        let teamHtml = '';
        if(vis.team !== false && (project.director || project.producer || project.budget || (project.team && project.team.length > 0))) {
            teamHtml = '<div class="mb-15-bg"><strong>👥 Équipe :</strong><div style="margin-top: 8px; display: grid; gap: 5px;">';
            if(project.director) teamHtml += `<div>• Réalisateur : ${Utils.escape(project.director)}</div>`;
            if(project.producer) teamHtml += `<div>• Producteur : ${Utils.escape(project.producer)}</div>`;
            if(project.team && project.team.length > 0) {
                project.team.forEach(member => {
                    teamHtml += `<div>• ${Utils.escape(member.role || 'Membre')} : ${Utils.escape(member.name || '')}</div>`;
                });
            }
            if(project.budget) teamHtml += `<div style="margin-top: 8px; font-weight: 600;">💰 Budget : ${Number(project.budget).toLocaleString('fr-FR')} €</div>`;
            teamHtml += '</div></div>';
        }
        
        // Type de production
        let productionTypeHtml = '';
        if(vis.productionType !== false && project.productionType) {
            productionTypeHtml = `<div class="mb-15-bg">
                <strong>Type de production :</strong> ${Utils.escape(productionTypeLabels[project.productionType] || project.productionType)}
            </div>`;
        }
        
        // Partenaires
        let partnersHtml = '';
        if(vis.partners !== false && ((project.associations && project.associations.length > 0) || (project.enterprises && project.enterprises.length > 0))) {
            partnersHtml = '<div class="mb-15-bg"><strong>🤝 Partenaires :</strong><div class="mt-8">';
            if(project.associations && project.associations.length > 0) {
                partnersHtml += '<div style="margin-bottom: 5px;"><em>Associations :</em> ' + project.associations.map(a => Utils.escape(a.name || a)).join(', ') + '</div>';
            }
            if(project.enterprises && project.enterprises.length > 0) {
                partnersHtml += '<div><em>Entreprises :</em> ' + project.enterprises.map(e => Utils.escape(e.name || e)).join(', ') + '</div>';
            }
            partnersHtml += '</div></div>';
        }
        
        // Description
        let descriptionHtml = '';
        if(vis.description !== false && project.description) {
            descriptionHtml = `<div class="mb-15-bg">
                <strong>📝 Note d'intention :</strong>
                <div style="margin-top: 8px; color: var(--text-sec); line-height: 1.6; white-space: pre-wrap;">${Utils.escape(project.description)}</div>
            </div>`;
        }
        
        // Besoins comédiens
        let actorNeedsHtml = '';
        if(vis.casting !== false && project.actorNeeds && project.actorNeeds.length > 0) {
            actorNeedsHtml = '<div class="mt-15"><strong>🎭 Rôles recherchés :</strong><div class="mt-10">';
            project.actorNeeds.forEach(need => {
                const ageRange = (need.ageMin || need.ageMax) ? ` • ${need.ageMin || '?'}-${need.ageMax || '?'} ans` : '';
                actorNeedsHtml += `<div style="background: var(--bg); padding: 10px; border-radius: 6px; margin-bottom: 8px;">
                    <strong>${Utils.escape(need.roleName || 'Rôle')}</strong> (${Utils.escape(need.type || 'principal')})
                    ${need.gender ? ' • ' + Utils.escape(need.gender) : ''}${Utils.escape(ageRange)}
                    ${need.description ? `<div style="font-size: 0.85rem; color: var(--text-sec); margin-top: 5px;">${Utils.escape(need.description)}</div>` : ''}
                </div>`;
            });
            actorNeedsHtml += '</div></div>';
        }
        
        // Besoins techniciens
        let crewNeedsHtml = '';
        const crewNeeded = [];
        if(vis.crew !== false && project.crewNeeds) {
            Object.entries(project.crewNeeds).forEach(([id, need]) => {
                if(need.needed) {
                    const pos = Presentation.crewPositions.find(p => p.id === id);
                    crewNeeded.push(pos ? pos.name : id);
                }
            });
        }
        if(project.customCrewNeeds) {
            project.customCrewNeeds.forEach(c => crewNeeded.push(c.name));
        }
        if(crewNeeded.length > 0) {
            crewNeedsHtml = `<div class="mt-15"><strong>🎬 Postes recherchés :</strong><div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
                ${crewNeeded.map(n => `<span style="background: var(--primary); color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.85rem;">${Utils.escape(n)}</span>`).join('')}
            </div></div>`;
        }
        
        // Stocker le projet courant pour les favoris
        Universe.currentProfile = { ...project, type: 'project', id: project.id || project.projectId };
        const isFav = Universe.isFavorite(project.id || project.projectId, 'project');
        
        const modalHtml = `
            <div class="profile-modal-overlay" onclick="if(event.target === this) this.remove();">
                <div class="profile-modal-box">
                    <div class="profile-modal-header" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; position: relative;">
                        <button class="favorite-btn ${isFav ? 'active' : ''}" id="project-favorite-btn" onclick="app.Universe.toggleProjectFavorite()" style="position: absolute; top: 15px; left: 15px; background: rgba(255,255,255,0.2); border: none; font-size: 1.5rem; cursor: pointer; padding: 5px 10px; border-radius: 8px; color: ${isFav ? '#f59e0b' : 'white'};" title="Ajouter aux favoris">${isFav ? '★' : '☆'}</button>
                        <button class="report-btn" onclick="app.Universe.reportProject(${Utils.jsArg(project.id || project.projectId)})" style="position: absolute; top: 15px; left: 60px; background: rgba(255,255,255,0.2); border: none; font-size: 1.2rem; cursor: pointer; padding: 5px 10px; border-radius: 8px; color: white; opacity: 0.7;" title="Signaler ce projet">🚩</button>
                        <button class="profile-modal-close" onclick="this.closest('.profile-modal-overlay').remove()" style="color: white;">✕</button>
                        ${project.image ? `<img src="${Utils.safeMediaUrl(project.image)}" alt="Affiche du projet" style="width: 150px; height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 15px; border: 2px solid #e94560;">` : '<div style="font-size: 4rem; margin-bottom: 15px;">🎬</div>'}
                        <div class="profile-modal-name">${Utils.escape(project.title || 'Sans titre')}</div>
                        <div style="color: #e94560; font-weight: bold;">${Utils.escape(typeText)}${genreText ? ' • ' + Utils.escape(genreText) : ''}</div>
                        ${project.city ? `<div style="margin-top: 5px; opacity: 0.8;">📍 ${Utils.escape(project.city)}${project.region ? ', ' + Utils.escape(project.region) : ''}</div>` : ''}
                    </div>
                    <div class="profile-modal-body" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                        ${locationHtml}
                        ${datesHtml}
                        ${teamHtml}
                        ${productionTypeHtml}
                        ${partnersHtml}
                        ${descriptionHtml}
                        ${actorNeedsHtml}
                        ${crewNeedsHtml}
                        
                        <div class="profile-modal-actions mt-20">
                            <button onclick="app.Universe.contactProject(${Utils.jsArg(project.projectId)}, ${Utils.jsArg(project.title)}, ${Utils.jsArg(project.ownerEmail)})" style="flex: 1; padding: 12px; background: #e94560; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">📧 Contacter le projet</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    // Contacter un projet
    contactProject: async (projectId, projectTitle, ownerEmail) => {
        const oe = String(ownerEmail || '').toLowerCase();
        const owner = (Universe.allProfiles || []).find(p =>
            (p.email && String(p.email).toLowerCase() === oe) ||
            (p.owner_email && String(p.owner_email).toLowerCase() === oe));

        let email = '', phone = '';
        if(owner) {
            const f = owner.facets || {};
            const keys = (owner.visibleFacets && owner.visibleFacets.length) ? owner.visibleFacets : ['actor', 'crew', 'association', 'enterprise'];
            for(const k of keys) {
                const ff = f[k] || {};
                const e = (ff.contactEmail || ff.assoEmail || ff.entEmail || '').trim();
                const ph = (ff.phone || ff.assoPhone || ff.entPhone || '').trim();
                if(e || ph) { email = e; phone = ph; break; }
            }
            if(!email && !phone) {
                email = String(owner.contactEmail || owner.assoEmail || owner.entEmail || '').trim();
                phone = String(owner.phone || owner.assoPhone || owner.entPhone || '').trim();
            }
        }

        const modal = document.createElement('div');
        modal.id = 'contact-profile-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';

        const row = (label, value, id, href, hrefLabel) => `
            <p style="color: var(--text-sec); margin: 0 0 6px;">${label} :</p>
            <div style="display:flex; gap:8px; align-items:center; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 6px;">
                <code id="${id}" style="flex:1; font-size: 0.95rem; word-break: break-all;">${Utils.escape(value)}</code>
                <button onclick="app.UniverseProfileModal.copyContactValue('${id}')" class="btn btn--primary" style="white-space: nowrap;">📋 Copier</button>
            </div>
            <a href="${href}" style="color: var(--primary); display:inline-block; margin-bottom:16px;">${hrefLabel}</a>`;

        let inner = '';
        if(email) inner += row('Adresse de contact du porteur', email, 'contact-public-email', 'mailto:' + Utils.escape(email), '✉️ Écrire un email');
        if(phone) inner += row('Téléphone', phone, 'contact-public-phone', 'tel:' + Utils.escape(phone.replace(/\s/g, '')), '📞 Appeler');
        if(!inner) inner = `<p style="color: var(--text-sec); margin: 0;">Le porteur de ce projet n'a pas indiqué de contact public.</p>`;

        modal.innerHTML = `
            <div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 460px; padding: 20px;">
                <div class="section-header-20">
                    <h3 class="m-0">📧 Contacter le projet « ${Utils.escape(projectTitle)} »</h3>
                    <button onclick="document.getElementById('contact-profile-modal').remove()" class="icon-btn-sec">✖</button>
                </div>
                <div class="mb-15">${inner}</div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    // Toggle favori pour les projets
    toggleProjectFavorite: async () => {
        const project = Universe.currentProfile;
        if(!project || !state.currentUser) return;
        
        const btn = document.getElementById('project-favorite-btn');
        if(!btn) return;
        
        // S'assurer que state.contacts existe
        if(!state.contacts) state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
        if(!state.contacts.projects) state.contacts.projects = [];
        
        const projectId = project.id || project.projectId;
        const ownerEmail = project.ownerEmail || '';
        
        // Vérifier si déjà en favoris (vérifier toutes les possibilités)
        const existingIndex = state.contacts.projects.findIndex(c => {
            // Vérifier par publicProfileId
            if(c.publicProfileId === projectId) return true;
            // Vérifier par contact_email (peut être ownerEmail ou projectId)
            if(c.contact_email === projectId || c.contact_email === ownerEmail) return true;
            // Vérifier dans les notes parsées
            try {
                const notes = typeof c.notes === 'string' ? JSON.parse(c.notes) : c.notes;
                if(notes && (notes.projectId === projectId || notes.publicProfileId === projectId)) return true;
            } catch(e) {}
            return false;
        });
        
        if(existingIndex >= 0) {
            // Retirer des favoris
            const contactToRemove = state.contacts.projects[existingIndex];
            state.contacts.projects.splice(existingIndex, 1);
            await supabase.from('contacts').delete().eq('id', contactToRemove.id);
            btn.textContent = '☆';
            btn.style.color = 'white';
            btn.classList.remove('active');
            Utils.toast('Projet retiré des favoris', 'info');
        } else {
            // Ajouter aux favoris (utiliser projectId comme contact_email pour garantir l'unicité)
            const contactData = {
                owner_email: state.currentUser.email.toLowerCase(),
                contact_email: projectId || '',
                contact_type: 'project',
                name: project.title || 'Sans titre',
                notes: JSON.stringify({ 
                    publicProfileId: projectId,
                    projectId: projectId,
                    title: project.title,
                    type: 'project',
                    city: project.city,
                    projectType: project.projectType,
                    genre: project.genre,
                    ownerEmail: project.ownerEmail
                }),
                created_at: new Date().toISOString()
            };
            // Utiliser upsert pour éviter les doublons (basé sur owner_email + contact_email)
            const { data: newContact, error } = await supabase
                .from('contacts')
                .upsert(contactData, { onConflict: 'owner_email,contact_email' })
                .select()
                .single();
            if(error) {
                console.error('Erreur ajout favori:', error);
                // Si erreur de conflit, le favori existe déjà - on le considère comme ajouté
                if(error.code === '23505') {
                    btn.textContent = '★';
                    btn.style.color = '#f59e0b';
                    btn.classList.add('active');
                    Utils.toast('Projet déjà dans vos favoris !', 'info');
                    return;
                }
                Utils.toast('Erreur lors de l\'ajout aux favoris', 'error');
                return;
            }
            if(newContact) {
                state.contacts.projects.push({ 
                    ...project, 
                    id: newContact.id, 
                    publicProfileId: projectId,
                    type: 'project'
                });
            }
            btn.textContent = '★';
            btn.style.color = '#f59e0b';
            btn.classList.add('active');
            Utils.toast('Projet ajouté aux favoris !', 'success');
        }
    },
    
    // ===================== SIGNALEMENT =====================
    reportProfile: async () => {
        const profile = Universe.currentProfile;
        if(!profile || !state.currentUser) {
            Utils.toast('Vous devez être connecté pour signaler', 'warning');
            return;
        }
        
        const reasons = [
            { id: 'fake', label: '👤 Faux profil / Usurpation d\'identité' },
            { id: 'inappropriate', label: '🚫 Contenu inapproprié' },
            { id: 'spam', label: '📧 Spam / Publicité' },
            { id: 'harassment', label: '⚠️ Harcèlement' },
            { id: 'other', label: '❓ Autre raison' }
        ];
        
        const reasonHtml = reasons.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
        
        const result = await ConfirmModal.show({
            title: '🚩 Signaler ce profil',
            message: `
                <p class="mb-15">Vous êtes sur le point de signaler le profil <strong>${Utils.escape(profile.name || 'Sans nom')}</strong>.</p>
                <label class="label-bold-block-5">Motif du signalement :</label>
                <select id="report-profile-reason" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px;">
                    ${reasonHtml}
                </select>
                <label class="label-bold-block-5">Détails (optionnel) :</label>
                <textarea id="report-profile-details" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px;" placeholder="Décrivez le problème..." data-tooltip="Décrivez le problème..."></textarea>
            `,
            confirmText: 'Envoyer le signalement',
            icon: '🚩'
        });
        
        if(result) {
            const reason = document.getElementById('report-profile-reason')?.value || 'other';
            const details = document.getElementById('report-profile-details')?.value || '';
            const reporterEmail = state.currentUser.email.toLowerCase();
            
            // 1) Vérifier le quota : max 5 signalements / 7 jours glissants
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const { count: recentCount, error: countErr } = await supabase
                    .from('reports')
                    .select('id', { count: 'exact', head: true })
                    .eq('reporter_email', reporterEmail)
                    .gte('created_at', sevenDaysAgo);
                
                if(!countErr && recentCount !== null && recentCount >= 5) {
                    await ConfirmModal.show({
                        title: '⚠️ Quota atteint',
                        message: `
                            <p>Vous avez atteint la limite de <strong>5 signalements par semaine</strong>.</p>
                            <p class="mt-15">Veuillez réessayer plus tard. En cas d'urgence, contactez l'administrateur du site.</p>
                        `,
                        confirmText: 'OK',
                        icon: '⏳',
                        hideCancel: true
                    });
                    return;
                }
            } catch(e) {
                console.warn('Impossible de vérifier le quota de signalements:', e);
                // On continue quand même, la DB gardera la trace
            }
            
            // 2) Insérer le signalement
            const { error } = await supabase.from('reports').insert({
                reporter_email: reporterEmail,
                reported_type: profile.type || 'profile',
                reported_id: profile.id || profile.publicProfileId,
                reported_name: profile.name || 'Sans nom',
                reported_email: profile.email || '',
                reason: reason,
                details: details,
                status: 'pending',
                created_at: new Date().toISOString()
            });
            
            if(error) {
                // Code 23505 = violation de contrainte UNIQUE (= déjà signalé)
                if(error.code === '23505') {
                    await ConfirmModal.show({
                        title: 'Déjà signalé',
                        message: `<p>Vous avez déjà signalé ce profil. Votre signalement précédent est en cours de traitement par l'administrateur.</p>`,
                        confirmText: 'OK',
                        icon: '👁️',
                        hideCancel: true
                    });
                } else {
                    console.error('Erreur signalement:', error);
                    Utils.toast('Erreur lors du signalement', 'error');
                }
            } else {
                Utils.toast('Signalement envoyé. Merci !', 'success');
            }
        }
    },
    
    reportProject: async (projectId) => {
        const project = Universe.currentProfile;
        if(!state.currentUser) {
            Utils.toast('Vous devez être connecté pour signaler', 'warning');
            return;
        }
        
        const reasons = [
            { id: 'fake', label: '🎬 Faux projet / Arnaque' },
            { id: 'inappropriate', label: '🚫 Contenu inapproprié' },
            { id: 'spam', label: '📧 Spam / Publicité' },
            { id: 'scam', label: '💰 Tentative d\'escroquerie' },
            { id: 'other', label: '❓ Autre raison' }
        ];
        
        const reasonHtml = reasons.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
        
        const result = await ConfirmModal.show({
            title: '🚩 Signaler ce projet',
            message: `
                <p class="mb-15">Vous êtes sur le point de signaler le projet <strong>${Utils.escape(project?.title || 'Sans titre')}</strong>.</p>
                <label class="label-bold-block-5">Motif du signalement :</label>
                <select id="report-project-reason" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px;">
                    ${reasonHtml}
                </select>
                <label class="label-bold-block-5">Détails (optionnel) :</label>
                <textarea id="report-project-details" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px;" placeholder="Décrivez le problème..." data-tooltip="Décrivez le problème..."></textarea>
            `,
            confirmText: 'Envoyer le signalement',
            icon: '🚩'
        });
        
        if(result) {
            const reason = document.getElementById('report-project-reason')?.value || 'other';
            const details = document.getElementById('report-project-details')?.value || '';
            
            const { error } = await supabase.from('reports').insert({
                reporter_email: state.currentUser.email.toLowerCase(),
                reported_type: 'project',
                reported_id: projectId || project?.projectId || project?.id,
                reported_name: project?.title || 'Sans titre',
                reported_email: project?.ownerEmail || '',
                reason: reason,
                details: details,
                status: 'pending',
                created_at: new Date().toISOString()
            });
            
            if(error) {
                console.error('Erreur signalement:', error);
                Utils.toast('Erreur lors du signalement', 'error');
            } else {
                Utils.toast('Signalement envoyé. Merci !', 'success');
            }
        }
    },
	
// Modale profil, favoris & contact — délégué à UniverseProfileModal
    openProfileModal: (...a) => UniverseProfileModal.openProfileModal(...a),
    closeProfileModal: (...a) => UniverseProfileModal.closeProfileModal(...a),
    exportProfilePDF: (...a) => UniverseProfileModal.exportProfilePDF(...a),
    isFavorite: (...a) => UniverseProfileModal.isFavorite(...a),
    toggleFavorite: (...a) => UniverseProfileModal.toggleFavorite(...a),
    contactProfile: (...a) => UniverseProfileModal.contactProfile(...a),
    addToProject: (...a) => UniverseProfileModal.addToProject(...a),
    // Ajoute le profil ouvert aux idees de casting du personnage d'ou part la
    // recherche. Sans contexte de casting, on l'indique simplement.
    addCurrentProfileToIdea: () => {
        const cid = (typeof GlobalSearch !== 'undefined') ? GlobalSearch._castingCharId : null;
        if(!cid) { Utils.toast('Lance un casting depuis un personnage pour ajouter une idée.', 'info'); return; }
        if(Universe.currentProfile && typeof Board !== 'undefined') Board.addProfileIdea(cid, Universe.currentProfile);
    },
	
    // ===================== NAVIGATION & UTILITAIRES =====================
    // V2.1.6 : Ouvrir l'univers depuis le menu Communauté
    openFromMenu: async () => {
        UI.hideAllViews();
        document.getElementById('universe-view').style.display = 'flex';
        const _ub = document.getElementById('univers-welcome-banner');
        if(_ub) _ub.style.display = localStorage.getItem('moteur_univers_banner') ? 'none' : '';
        if(!Universe._initialized) {
            await Universe.init();
            Universe._initialized = true;
        } else {
            Universe.render();
            setTimeout(() => { if(Universe.map) Universe.map.invalidateSize(); }, 100);
        }
    },

    // V2.1.6 : Fermer l'univers → retour hub
    closeToHub: () => {
        UI.hideAllViews();
        document.getElementById('dashboard-view').style.display = 'flex';
    },

    // Universe.closeProjects retirée v569, jamais appelée : alias mort de
    // showProjects laissé par le passage à l'accueil "Projets d'abord" (B3 P1).

    // Universe.showProjects retirée v569 : orpheline en cascade depuis le
    // retrait de closeProjects (étape 2), son seul appelant.
    
    // Utilitaire : mélanger un tableau
    shuffleArray: (array) => {
        const arr = [...array];
        for(let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};
