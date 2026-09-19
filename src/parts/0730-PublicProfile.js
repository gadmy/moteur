
  const PublicProfile = {
    // ============================================================
    // ===== ÉTAT & CYCLE DE VIE DES PROFILS =====
    // ============================================================
    profiles: [], // Liste des profils de l'utilisateur
    currentProfileIndex: -1, // Index du profil actuellement affiché
    profileProjects: {}, // Mapping profileId -> [{projectId, projectTitle, role}]
    
    // ===== PROJETS ASSOCIÉS / VISIBILITÉ =====
    // Charge les projets associés à chaque profil
    loadProfileProjects: async () => {
        PublicProfile.profileProjects = {};
        if(!state.currentUser || PublicProfile.profiles.length === 0) return;
        
        try {
            const projectsList = await Store.getProjectsList();
            
            for(const project of projectsList) {
                // Charger les données complètes du projet (actors + crew)
                // v578 (cloisonnement) : la fonction serveur repond ce a quoi j'ai
                // droit. Sur un projet ou l'onglet Comediens ou Equipe m'est ferme,
                // la liste correspondante n'arrive pas — et c'est le comportement
                // voulu : je n'y apparais pas non plus.
                const { data: projectData, error: errPd } = await supabase.rpc('project_data_for_me', { p_id: project.id });
                if(errPd) console.warn('[Search] project_data_for_me:', errPd);
                const data = projectData || null;
                if(!data) continue;
                
                const projectInfo = { projectId: project.id, projectTitle: project.title || 'Sans titre', ownership: project.role };
                
                // Vérifier les acteurs
                if(data.actors && Array.isArray(data.actors)) {
                    data.actors.forEach(actor => {
                        if(actor.publicProfileId) {
                            if(!PublicProfile.profileProjects[actor.publicProfileId]) {
                                PublicProfile.profileProjects[actor.publicProfileId] = [];
                            }
                            // Éviter les doublons
                            if(!PublicProfile.profileProjects[actor.publicProfileId].some(p => p.projectId === project.id)) {
                                PublicProfile.profileProjects[actor.publicProfileId].push({ ...projectInfo, role: 'actor' });
                            }
                        }
                    });
                }
                
                // Vérifier les techniciens
                if(data.crew && Array.isArray(data.crew)) {
                    data.crew.forEach(member => {
                        if(member.publicProfileId) {
                            if(!PublicProfile.profileProjects[member.publicProfileId]) {
                                PublicProfile.profileProjects[member.publicProfileId] = [];
                            }
                            // Éviter les doublons
                            if(!PublicProfile.profileProjects[member.publicProfileId].some(p => p.projectId === project.id)) {
                                PublicProfile.profileProjects[member.publicProfileId].push({ ...projectInfo, role: 'crew' });
                            }
                        }
                    });
                }
            }
        } catch(e) {
            console.error('Erreur chargement projets profils:', e);
        }
    },
    
    open: async () => {
        UI.hideAllViews();
        els.publicProfileView.classList.add('active');
        
        // Afficher l'onglet profil par défaut
        PublicProfile.showTab('profile');
        
document.getElementById('profile-title').textContent = '🎭 Mon Profil Public';
        
        // Charger les profils depuis Supabase
        await PublicProfile.loadProfiles();
        ActiveProfile.ensureValid();
        setTimeout(() => ActiveProfile.attachToDom(), 100);
        
        // Charger les projets liés aux profils
        await PublicProfile.loadProfileProjects();
        
        // Charger les profils à revendiquer
        await PublicProfile.loadPendingClaims();
        
        // Afficher les onglets de profils
        PublicProfile.renderProfileTabs();
        
        // Afficher le premier profil ou le message "nouveau profil"
        if(PublicProfile.profiles.length > 0) {
            // Mono-profil : ouvrir directement le profil, sans clic sur la carte
            PublicProfile.currentProfileIndex = -1;
            PublicProfile.switchToProfile(0);
        } else {
            PublicProfile.currentProfileIndex = -1;
            document.getElementById('no-profile-message').style.display = 'block';
            document.getElementById('profile-all-sections').style.display = 'none';
        }
        // Afficher le conteneur maintenant que tout est chargé
        document.getElementById('current-profile-content').style.display = 'block';
        
    },
    
    close: () => {
        UI.hideAllViews();
        els.dashboardView.style.display = 'flex';
    },
    
	deleteAccount: async () => {
        const confirm1 = await ConfirmModal.show({ title: '⚠️ Supprimer votre compte ?', message: 'Vous allez supprimer définitivement votre compte.\n\nTous vos projets dont vous êtes propriétaire seront supprimés.\n\nCette action est IRRÉVERSIBLE.', icon: '☠️', dangerous: true, confirmText: 'Continuer' });
        if(!confirm1) return;
        
        const pwd = await ConfirmModal.show({ title: '🔒 Confirmation par mot de passe', message: 'Entrez le mot de passe de votre compte pour confirmer la suppression.', icon: '🔒', type: 'prompt', inputType: 'password', inputPlaceholder: 'Mot de passe', confirmText: 'Supprimer définitivement', dangerous: true });
        if(pwd == null) { Utils.toast('Suppression annulée.', 'info'); return; }
        if(!String(pwd).trim()) { Utils.toast('Mot de passe requis.', 'warning'); return; }
        const email = state.currentUser.email.toLowerCase();
        // Reauthentification : on verifie le mot de passe AVANT toute suppression.
        const { error: pwdErr } = await supabase.auth.signInWithPassword({ email: email, password: pwd });
        if(pwdErr) { Utils.toast('Mot de passe incorrect. Suppression annulée.', 'error'); return; }
        
        try {
            
            // 1. Supprimer les projets dont l'utilisateur est propriétaire
            await supabase.from('projects').delete().eq('owner_email', email);
            
            // 2. Supprimer les participations aux projets
            await supabase.from('project_members').delete().eq('email', email);
            
            // 3. Supprimer le profil utilisateur
            await supabase.from('user_profiles').delete().eq('email', email);
            
            // 4. Supprimer les messages
            const {error: msgDelErr} = await supabase.from('messages').delete().or(`from_email.eq.${Utils.pgSafe(email)},to_email.eq.${Utils.pgSafe(email)}`);
            if(msgDelErr) console.error('Erreur suppression messages:', msgDelErr);
            
            // 5. Supprimer les notifications
            const {error: notifDelErr} = await supabase.from('notifications').delete().eq('user_email', email);
            if(notifDelErr) console.error('Erreur suppression notifications:', notifDelErr);
            
            // 6. Supprimer les contacts
            const {error: ctcDelErr} = await supabase.from('contacts').delete().eq('owner_email', email);
            if(ctcDelErr) console.error('Erreur suppression contacts:', ctcDelErr);
            
            // 7. Supprimer le compte Supabase Auth
            // Note: La suppression du compte auth doit être faite côté serveur ou via le dashboard
            await supabase.auth.signOut();
            
            // Compte supprimé avec succès
            
            Utils.toast('Votre compte a été supprimé. Au revoir !', 'success');
            window.location.reload();
            
        } catch(e) {
            console.error('Erreur suppression compte:', e);
            if(e.code === 'auth/requires-recent-login') {
                Utils.toast('Pour des raisons de sécurité, veuillez vous déconnecter, vous reconnecter, puis réessayer.', 'warning');
            } else {
                Utils.toast('Erreur lors de la suppression : ' + e.message, 'error');
            }
        }
    },
    
	// Affiche les onglets de profils
    renderProfileTabs: () => {
        const container = document.getElementById('profile-tabs-container');
        if(!container) return;
        
        let html = '';
        
        PublicProfile.profiles.forEach((profile, idx) => {
            const isActive = idx === PublicProfile.currentProfileIndex;
            const icon = profile.type === 'actor' ? '🎭' : profile.type === 'crew' ? '🎥' : profile.type === 'association' ? '🏛️' : profile.type === 'enterprise' ? '🏢' : '⏳';
            const name = profile.type === 'association' ? (profile.assoName || 'Association')
                       : profile.type === 'enterprise' ? (profile.entName || 'Entreprise')
                       : (profile.name || 'Sans nom');
            const photoHtml = profile.photo
                ? `<img src="${Utils.escape(profile.photo)}" alt="">`
                : `<span class="profile-circle-ph">${icon}</span>`;
            
            let projectsHtml = '';
            if(isActive) {
                const linkedProjects = PublicProfile.profileProjects[profile.id] || [];
                if(linkedProjects.length > 0) {
                    projectsHtml = '<div class="profile-circle-projects">' +
                        linkedProjects.map(p => {
                            const isOwner = p.ownership === 'owner';
                            const roleLabel = isOwner ? 'propriétaire' : 'invité';
                            const roleColor = isOwner ? 'var(--primary)' : 'var(--text-sec)';
                            return `<div style="display:flex; align-items:center; gap:5px; margin-bottom:3px;">🎬 <span onclick="event.stopPropagation(); app.Store.loadProject('${p.projectId}')" style="cursor:pointer; text-decoration:underline;" title="Ouvrir ${Utils.escape(p.projectTitle)}">${Utils.escape(p.projectTitle)}</span> <span style="font-size:0.7rem; color:${roleColor};">${roleLabel}</span></div>`;
                        }).join('') +
                    '</div>';
                }
            }
            
            // Identité de compte : photo + nom (communication interne), projets à droite
            const accountName = (state.userProfile && state.userProfile.displayName) || name;
            html += `<div class="profile-circle-card ${isActive ? 'active' : ''}" onclick="app.PublicProfile.switchToProfile(${idx})">
                <div style="display:flex; align-items:center; gap:25px;">
                    <div style="display:flex; flex-direction:column; align-items:center;">
                        <div class="profile-circle-photo">${photoHtml}</div>
                        <div class="profile-circle-name">${Utils.escape(accountName)}</div>
                    </div>
                    ${projectsHtml}
                </div>
            </div>`;
        });
        
        if(PublicProfile.profiles.length < 1) {
            html += `<div class="profile-circle-card profile-circle-add" onclick="app.PublicProfile.createNewProfile()">
                <div class="profile-circle-photo"><span class="profile-circle-ph">＋</span></div>
                <div class="profile-circle-name">Créer mon profil</div>
            </div>`;
        }
        
        container.innerHTML = html;
    },
    
    // Crée un nouveau profil
    createNewProfile: () => {
        // Mono-profil : un seul profil par compte
        if(PublicProfile.profiles.length >= 1) {
            Utils.toast('Un seul profil par compte. Modifiez votre profil existant depuis cette page.', 'warning', 5000);
            return;
        }
        
        // Générer les disponibilités par défaut (lun-ven pour les 3 prochains mois)
        const defaultAvailability = PublicProfile.generateDefaultAvailability();
        
        const newProfile = {
            id: crypto.randomUUID(),
            type: '', // sera défini par l'utilisateur
            name: '',
            photo: '',
            gender: '',
            phone: '',
            city: '',
            website: '',
            bio: '',
            // Champs comédien
            galleryPhotos: [],
            height: '',
            weight: '',
            age: '',
            eyeColor: '',
            hairColor: '',
            hairLength: '',
            ethnicity: '',
            corpulence: '',
            sports: '',
            languages: '',
            // Champs technicien
            department: '',
            role: '',
            cameras: [],
            lenses: [],
            lights: [],
            sounds: [],
            grips: [],
            makeups: [],
            otherEquipment: [],
            // Commun
            dailyRate: '',
            rateCurrency: '€',
            availabilityText: '',
            availabilityDates: defaultAvailability,
            unavailabilityDates: [],
            hasVehicle: false,
            vehicleType: '',
            vehicleSeats: '',
            vehicleTrunk: false,
            profileComplete: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        PublicProfile.profiles.push(newProfile);
        PublicProfile.currentProfileIndex = PublicProfile.profiles.length - 1;
        PublicProfile.renderProfileTabs();
        PublicProfile.refreshProfileScreen(newProfile);
        
        // Afficher le formulaire
        document.getElementById('no-profile-message').style.display = 'none';
        document.getElementById('profile-all-sections').style.display = 'block';
    },
    
    // Génère les disponibilités par défaut (lun-ven pour les 3 prochains mois)
    generateDefaultAvailability: () => {
        const availability = [];
        const today = new Date();
        const endDate = new Date(today);
        endDate.setFullYear(endDate.getFullYear() + 1); // 1 an au lieu de 3 mois
        
        let currentWeekStart = null;
        let currentWeekEnd = null;
        
        const formatDate = (d) => d.toISOString().split('T')[0];
        
        // Parcourir chaque jour de la prochaine année
        const current = new Date(today);
        while(current <= endDate) {
            const dayOfWeek = current.getDay(); // 0=dim, 1=lun, ..., 5=ven, 6=sam
            
            if(dayOfWeek >= 1 && dayOfWeek <= 5) { // Lundi à Vendredi
                if(currentWeekStart === null) {
                    currentWeekStart = new Date(current);
                }
                currentWeekEnd = new Date(current);
            } else {
                // Weekend : finaliser la période en cours
                if(currentWeekStart !== null) {
                    availability.push({
                        from: formatDate(currentWeekStart),
                        to: formatDate(currentWeekEnd)
                    });
                    currentWeekStart = null;
                    currentWeekEnd = null;
                }
            }
            
            current.setDate(current.getDate() + 1);
        }
        
        // Finaliser la dernière période si nécessaire
        if(currentWeekStart !== null) {
            availability.push({
                from: formatDate(currentWeekStart),
                to: formatDate(currentWeekEnd)
            });
        }
        
        return availability;
    },
    
    // Change de profil
    switchToProfile: (index) => {
        if(index < 0 || index >= PublicProfile.profiles.length) return;
        
        // v599 : plus de relecture du formulaire avant de changer de profil.
        // Il n'y a rien en attente — chaque fiche enregistre elle-meme, et
        // relire un formulaire perime ecrivait des valeurs d'un autre profil
        // par-dessus celui qu'on quitte.
        
        PublicProfile.currentProfileIndex = index;
        PublicProfile.renderProfileTabs();
        PublicProfile.refreshProfileScreen(PublicProfile.profiles[index]);
        
        document.getElementById('no-profile-message').style.display = 'none';
        document.getElementById('profile-all-sections').style.display = 'block';
    },
    
    // ============================================================
    // ===== ECRAN « MON PROFIL » (rafraichissement) =====
    // ============================================================
    // v600 : ne remplit plus aucun formulaire. L'ancien formulaire a 54 champs
    // est SUPPRIME — chaque casquette s'edite dans sa propre fiche. Il ne reste
    // ici que ce qui est VIVANT : les tuiles de casquettes et le bandeau de
    // statut. Ancien nom : loadProfileToForm.
    refreshProfileScreen: (profile) => {
        if(!profile) return;
        profile.facets = PublicProfile._normalizeFacets(profile.facets, { profile_type: profile.type, is_public: profile.is_public });
        const enabled = PublicProfile._enabledFacets(profile);
        // Onglet courant : celui affiche s'il est encore actif, sinon la premiere
        // casquette active hors technicien (le technicien se choisit par tuile).
        if(!enabled.includes(PublicProfile.currentFacetTab)) {
            PublicProfile.currentFacetTab = enabled.find(k => k !== 'crew') || null;
        }
        PublicProfile.renderFacetTabs(enabled);
        PublicProfile.updateStatus();
    },
    
    // Change le type de profil (comédien/technicien)
    // ===== Casquettes : sections par facette + barre d'onglets =====
    currentFacetTab: null,
    FACET_LABELS: { actor: '🎭 Comédien·ne', crew: '🎥 Technicien·ne', asso: '🏛️ Association', ent: '🏢 Entreprise' },
    // FUSION : mode « fiche moteur » pour la creation de profil. Actif, la fiche
    // comedien affichee via le moteur du projet lit/ecrit DIRECTEMENT la casquette
    // comedien (objet facets.actor), sur une COPIE ; rien n'est ecrit sur les champs
    // communs ni les autres casquettes. Eteint par defaut.
    _engineMode: false,
    _engineProfile: null,

    // Champs qui appartiennent à la FICHE (comédien/technicien), plus au profil commun
    FACET_SWAP_KEYS: ['name','photo','gender','hidePhone','agentPhone','bio','address','city','latitude','longitude','hideAddress','hideAddressInProjects','contactEmail','dailyRate','rateCurrency','rateNegotiable','collabTypes','role','demoreel','demoreels','experience','languages','languagesWithLevels'],

    // ===== CHAMPS DU CORPS, COMMUNS A TOUTES LES CASQUETTES (v598) =====
    // Une personne n'a qu'un telephone, qu'un vehicule et qu'un agenda. Ces
    // champs vivaient dans CHAQUE casquette : dupliquer une fiche technicien
    // dupliquait l'agenda, et corriger ses indispos sur une fiche laissait les
    // autres perimees. Ils habitent desormais le PROFIL, en un seul exemplaire,
    // et ne sont donc plus dans FACET_SWAP_KEYS — ni bascules d'une fiche a
    // l'autre, ni effaces par le bouton « Effacer » d'une carte : vider sa carte
    // comedien n'a pas a supprimer son numero de telephone.
    // RESTENT PAR CASQUETTE a dessein : hidePhone (choix d'affichage public,
    // carte par carte) et agentPhone (un agent ne concerne que le comedien).
    FACET_COMMON_KEYS: ['phone','availabilityText','availabilityDates','unavailabilityDates','hasVehicle','vehicleType','vehiclePlate','vehicleSeats','vehicleTrunk','vehicleNotes','licenses','vehicleUsage'],

    // MIGRATION DOUCE des profils d'avant, qui portent ces champs dans leurs
    // casquettes : on remonte au profil la premiere valeur trouvee quand le
    // profil n'a rien, puis on EFFACE la cle de toutes les casquettes. Cet
    // effacement n'est pas un detail : partout, la lecture est « casquette,
    // sinon profil » ; une copie oubliee continuerait de gagner — y compris un
    // TABLEAU VIDE, qui est vrai en JavaScript et masquerait l'agenda remonte.
    _liftCommonToProfile: (profile) => {
        if(!profile || !profile.facets) return profile;
        const plein = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
        const cartes = [];
        if(profile.facets.actor) cartes.push(profile.facets.actor);
        PublicProfile.crewArr(profile.facets).forEach(c => { if(c) cartes.push(c); });
        ['asso', 'ent'].forEach(k => { if(profile.facets[k]) cartes.push(profile.facets[k]); });
        PublicProfile.FACET_COMMON_KEYS.forEach(k => {
            if(!plein(profile[k])) {
                const source = cartes.find(c => plein(c[k]));
                if(source) profile[k] = PublicProfile._cloneFacetVal(source[k]);
            }
            cartes.forEach(c => { delete c[k]; });
        });
        return profile;
    },

    // Clés basculées par fiche : tout pour comédien/technicien, la collaboration seule pour asso/entreprise
    _facetKeysFor: (facet) => (facet === 'actor' || facet === 'crew') ? PublicProfile.FACET_SWAP_KEYS : ['collabTypes'],

    // Copie profonde des valeurs basculées : les tableaux/objets (langues, bandes démo...)
    // sont mutés en place par les éditeurs — sans clone, deux fiches finiraient par
    // partager la même référence et toute modification de l'une toucherait l'autre.
    _cloneFacetVal: (v) => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v,

    // Charge la fiche donnée dans les champs plats (avec héritage des anciennes valeurs communes)
    _loadFacetToFlat: (profile, facet) => {
        if(!profile || !facet) return;
        PublicProfile._facetKeysFor(facet).forEach(k => {
            const v = PublicProfile.getFacetField(profile, facet, k);
            if(v !== undefined) profile[k] = PublicProfile._cloneFacetVal(v);
        });
    },

    // Casquettes actives, lues sur le PROFIL (et non plus sur des cases cachees
    // du formulaire supprime). Le technicien compte des qu'UNE de ses fiches
    // est active.
    _enabledFacets: (profile) => {
        const f = (profile && profile.facets) || {};
        return PublicProfile.FACET_KEYS.filter(k => k === 'crew'
            ? PublicProfile.crewAnyEnabled(f)
            : !!(f[k] && f[k].enabled));
    },

    renderFacetTabs: (enabled) => {
        const bar = document.getElementById('facet-tabs');
        if(!bar) return;
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex] || {};
        enabled = enabled || PublicProfile._enabledFacets(profile);
        const name = profile.name || 'Mon profil';
        const photo = profile.photo || '';
        const ICONS = { actor: '🎭', crew: '🎥', asso: '🏛️', ent: '🏢' };
        // En-tete du hub : photo + nom + projets ou le profil apparait.
        const hub = document.getElementById('profile-hub-header');
        if(hub) {
            const projs = PublicProfile.profileProjects[profile.id] || [];
            const projHtml = projs.length
                ? '<div class="hub-projects">' + projs.map(p => '<span class="hub-project-chip" onclick="event.stopPropagation(); app.Store.loadProject(\'' + p.projectId + '\')" title="Ouvrir ce projet">🎬 ' + Utils.escape(p.projectTitle) + '</span>').join('') + '</div>'
                : '<div class="hub-projects hub-projects-empty">Aucun projet pour l\'instant</div>';
            hub.innerHTML = '<div class="hub-head">'
                + '<div class="hub-avatar">' + (photo ? '<img src="' + Utils.escape(photo) + '" alt="">' : '👤') + '</div>'
                + '<div class="hub-id"><div class="hub-name">' + Utils.escape(name) + '</div>' + projHtml + '</div>'
            + '</div>';
        }
        // Les 4 cartes de casquette : grisee si non activee, active sinon.
        // Clic sur une grisee -> active + ouvre la fiche ; croix -> regrise ;
        // bascule 👁 -> visible dans l'Univers ; Effacer -> vide les champs.
        bar.innerHTML = '<div class="compact-cards-grid facet-cards-grid">' + PublicProfile.FACET_KEYS.map(k => {
            if(k === 'crew') {
                // v598 : plusieurs fiches technicien possibles - une tuile par fiche REMPLIE,
                // suivie d'une tuile « + ». Les emplacements vides n'ont plus de tuile a eux :
                // la tuile « + » les remplace et reprend d'elle-meme le premier libre, ce qui
                // evite d'afficher une case vide a cote d'un bouton qui fait la meme chose.
                const crewArr = PublicProfile.crewArr(profile.facets);
                const actifs = crewArr.filter(f => f && f.enabled).length;
                let rang = 0;
                const tuiles = crewArr.map((cf, i) => {
                    if(!cf || !cf.enabled) return '';
                    rang++;
                    // Le numero affiche suit les fiches REMPLIES (pas l'index du tableau) :
                    // sans cela, un emplacement laisse vide donnait un « n°2 » sans « n°1 ».
                    const nameSuffix = actifs > 1 ? (' n°' + rang) : '';
                    const visOn = cf.visible !== false;
                    const xBtn = (actifs > 1)
                        ? '<button type="button" class="facet-card-x" title="Supprimer cette fiche" onclick="event.stopPropagation(); app.PublicProfile.deleteCrewCard(' + i + ')">✕</button>'
                        : '<button type="button" class="facet-card-x" title="Refermer (regriser)" onclick="event.stopPropagation(); app.PublicProfile.deactivateCrewCard(' + i + ')">✕</button>';
                    return '<div class="compact-card facet-card" onclick="app.PublicProfile.openFicheCard(\'crew\', ' + i + ')">'
                        + xBtn
                        + '<div class="compact-card-photo">' + (photo ? '<img src="' + Utils.escape(photo) + '" alt="">' : '🎥') + '</div>'
                        + '<div class="compact-card-name">' + Utils.escape(name) + '</div>'
                        + '<div class="compact-card-role">🎥 Technicien·ne' + nameSuffix + '</div>'
                        + '<label class="facet-card-vis" onclick="event.stopPropagation();"><input type="checkbox" ' + (visOn ? 'checked' : '') + ' onchange="app.PublicProfile.toggleCrewVisible(' + i + ', this.checked)"> 👁 Univers</label>'
                        + '<button type="button" class="facet-card-erase" onclick="event.stopPropagation(); app.PublicProfile.effaceCrewCard(' + i + ')">🧹 Effacer</button>'
                    + '</div>';
                }).join('');
                return tuiles
                    + '<div class="compact-card facet-card is-grey" onclick="app.PublicProfile.addCrewCard()" title="Créer une nouvelle fiche technicien">'
                        + '<div class="compact-card-photo" style="font-size:2rem; line-height:1; font-weight:300;">+</div>'
                        + '<div class="compact-card-name">Ajouter un profil technicien</div>'
                        + '<div class="compact-card-role">' + (actifs ? 'Identité et véhicule repris' : 'Nouvelle spécialité') + '</div>'
                    + '</div>';
            }
            const label = PublicProfile.FACET_LABELS[k];
            if(!enabled.includes(k)) {
                return '<div class="compact-card facet-card is-grey" onclick="app.PublicProfile.activateFacetCard(\'' + k + '\')" title="Activer et remplir">'
                    + '<div class="compact-card-photo">' + (ICONS[k] || '👤') + '</div>'
                    + '<div class="compact-card-name">' + label + '</div>'
                    + '<div class="compact-card-role">Cliquer pour activer</div>'
                + '</div>';
            }
            const visOn = (profile.facets && profile.facets[k]) ? (profile.facets[k].visible !== false) : true;
            return '<div class="compact-card facet-card" onclick="app.PublicProfile.openFicheCard(\'' + k + '\')">'
                + '<button type="button" class="facet-card-x" title="Refermer (regriser)" onclick="event.stopPropagation(); app.PublicProfile.deactivateFacetCard(\'' + k + '\')">✕</button>'
                + '<div class="compact-card-photo">' + (photo ? '<img src="' + Utils.escape(photo) + '" alt="">' : (ICONS[k] || '👤')) + '</div>'
                + '<div class="compact-card-name">' + Utils.escape(name) + '</div>'
                + '<div class="compact-card-role">' + label + '</div>'
                + '<label class="facet-card-vis" onclick="event.stopPropagation();"><input type="checkbox" ' + (visOn ? 'checked' : '') + ' onchange="app.PublicProfile.toggleFacetVisible(\'' + k + '\', this.checked)"> 👁 Univers</label>'
                + '<button type="button" class="facet-card-erase" onclick="event.stopPropagation(); app.PublicProfile.effaceFacetCard(\'' + k + '\')">🧹 Effacer</button>'
            + '</div>';
        }).join('') + '</div>';
    },

    // Clic sur une carte de casquette : ouvre SA fiche. Les quatre casquettes
    // passent par le moteur de fiche du projet ; l'ancienne modale, doublon
    // inatteignable depuis la fusion des fiches, a ete supprimee (v600).
    openFicheCard: (facet, crewIdx) => {
        PublicProfile.currentFacetTab = facet;
        if(facet === 'actor') { PublicProfile.openComedienEngine(); return; }
        if(facet === 'crew') { PublicProfile.openTechnicienEngine(crewIdx || 0); return; }
        if(facet === 'asso') { PublicProfile.openAssoEngine(); return; }
        if(facet === 'ent') { PublicProfile.openEntrepriseEngine(); return; }
    },

    // ===== FUSION : fiche comedien via le MOTEUR DU PROJET =====
    // Bouton de test. Ouvre la casquette comedien dans le meme moteur que la fiche de
    // projet, EN EDITION, sur une COPIE de facets.actor. Enregistrer recopie la copie
    // dans facets.actor puis persiste : SEULE la casquette comedien change, jamais les
    // champs communs ni les autres casquettes. Fermer sans enregistrer = aucun effet.
    // Recette d'affichage reprise de UniverseProfileModal._renderFicheInModal.
    openComedienEngine: () => PublicProfile._openProfileEngine('actor'),
    openTechnicienEngine: (idx) => PublicProfile._openProfileEngine('crew', idx || 0),
    // Moteur commun aux casquettes comedien ('actor') et technicien ('crew').
    // idx : index de la fiche technicien concernee (v598, plusieurs technicien.nes possibles ; sans objet pour 'actor').
    _openProfileEngine: (kind, idx) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile) { Utils.toast('Aucun profil chargé.', 'warning'); return; }
        if(!profile.facets) profile.facets = {};
        PublicProfile._engineKind = kind;
        PublicProfile._engineCrewIndex = idx || 0;
        let source;
        if(kind === 'crew') {
            if(!Array.isArray(profile.facets.crew)) profile.facets.crew = PublicProfile.crewArr(profile.facets);
            if(!profile.facets.crew[PublicProfile._engineCrewIndex]) profile.facets.crew[PublicProfile._engineCrewIndex] = { enabled: true, visible: true };
            source = profile.facets.crew[PublicProfile._engineCrewIndex];
        } else {
            if(!profile.facets[kind]) profile.facets[kind] = { enabled: true };
            source = profile.facets[kind];
        }
        // On edite une COPIE de la casquette : le profil reel n'est touche qu'au save.
        const draft = JSON.parse(JSON.stringify(source || {}));
        // Vocabulaire : la fiche projet dit 'email', le profil dit 'contactEmail'.
        if(!draft.email) draft.email = draft.contactEmail || '';
        // Champs COMMUNS (partages entre casquettes) lus depuis le profil : physique (comedien
        // seulement, le technicien n'a pas d'onglet physique) + site web.
        // v598 : les champs de CORPS (telephone, vehicule, agenda) rejoignent les
        // champs communs — la fiche les lit sur le profil et les y réécrit, au
        // lieu d'en garder un exemplaire par casquette.
        const commonKeys = ((kind === 'actor')
            ? ['website','height','weight','eyeColor','hairColor','hairLength','ethnicity','corpulence','sports','sportsWithLevels']
            : ['website']).concat(PublicProfile.FACET_COMMON_KEYS);
        // v598 : CLONE et non prêt de reference. Les champs communs comptent
        // desormais des tableaux (agenda des dispos, permis) que les editeurs
        // mutent en place : sans clone, modifier le calendrier dans la fiche
        // touchait deja le profil, meme en refermant sans enregistrer.
        commonKeys.forEach(k => { if(profile[k] !== undefined) draft[k] = PublicProfile._cloneFacetVal(profile[k]); });
        PublicProfile._engineCommonKeys = commonKeys;
        // Technicien : le profil range le departement dans 'department' (gcX), la fiche projet
        // dans 'group_id'. On fait le pont pour que le selecteur Departement se preselectionne.
        if(kind === 'crew' && !draft.group_id && draft.department) draft.group_id = draft.department;
        // Langues / sports : un profil qui n'a que du texte libre retrouve des
        // entrees avec un niveau par defaut, sinon la liste s'afficherait vide
        // au-dessus d'un texte pourtant rempli.
        ProfileSkills.migrer(draft);
        PublicProfile._engineMode = true;
        PublicProfile._engineProfile = draft;
        // Le moteur suppose un projet ouvert (state.data + role). Sur la page profil il n'y en
        // a pas : on prete un decor vide, la copie placee a l'index 0 du bon tableau (comediens
        // ou equipe), pour que tout le moteur (calendrier, vehicule, galerie) marche par index.
        // Le vrai state.data eventuel est garde par reference et restaure a la fermeture ;
        // aucune sauvegarde projet ne part (garde _engineMode sur StoreSave).
        PublicProfile._engineSavedData = state.data;
        PublicProfile._engineSavedRole = state.currentRole;
        const blank = { actors:[], characters:[], locations:[], scenes:[], shootingDays:[], episodes:[], expenses:[], resources:[], crew:[], orgs:[], groups:[], vehicles:[], plans:[], contracts:[], seasons:[], budget:{}, history:[] };
        blank[kind === 'actor' ? 'actors' : 'crew'] = [draft];
        state.data = blank;
        state.currentRole = 'owner';
        const card = PublicProfile._engineBuildCard();
        if(!card) { PublicProfile._closeComedienEngine(); Utils.toast('Impossible d\'afficher la fiche moteur.', 'error'); return; }
        const overlay = document.createElement('div');
        overlay.id = 'comedien-engine-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.55); overflow:auto; display:block;';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--panel, var(--surface, var(--bg, #ffffff))); color:inherit; max-width:660px; width:92%; margin:5vh auto; max-height:88vh; overflow:auto; border-radius:12px; padding:16px; box-shadow:0 10px 40px rgba(0,0,0,.4);';
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; padding:0 0 10px;';
        const crewIdxLabel = (PublicProfile._engineKind === 'crew' && PublicProfile._engineCrewIndex) ? (' n°' + (PublicProfile._engineCrewIndex + 1)) : '';
        // v598 : le bouton « Dupliquer » a quitte la fiche. On ajoute une fiche
        // technicien depuis la grille de Mon Profil (tuile « + »), la ou on les
        // voit toutes — pas depuis l'interieur de l'une d'elles.
        bar.innerHTML = '<span style="font-weight:600;">' + (PublicProfile._engineKind === 'crew' ? ('🎥 Technicien·ne' + crewIdxLabel) : '🎭 Comédien·ne') + '</span>'
            + '<span style="display:flex; gap:8px;">'
            + '<button class="btn btn--primary btn--sm" id="comedien-engine-save">💾 Enregistrer</button>'
            + '<button class="btn btn--sm" id="comedien-engine-close">Fermer</button>'
            + '</span>';
        box.appendChild(bar);
        box.appendChild(card);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.getElementById('comedien-engine-save').onclick = () => PublicProfile._engineDoSave(true);
        document.getElementById('comedien-engine-close').onclick = () => PublicProfile._closeComedienEngine();
    },
    // Enregistre la COPIE en cours d'edition dans la vraie casquette (facets.crew[idx] ou facets.actor), puis persiste.
    // silent=false : n'affiche pas le toast de confirmation (utilise quand un autre message suit, ex: duplication).
    _engineDoSave: async (showToast) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        const d = PublicProfile._engineProfile;
        const kind = PublicProfile._engineKind || 'actor';
        if(!profile || !d) return;
        // Retraduction : email (fiche) -> contactEmail (profil), sans laisser de cle parasite.
        d.contactEmail = d.email || d.contactEmail || '';
        delete d.email;
        // Champs COMMUNS -> profil (partages entre casquettes), retires de la casquette.
        (PublicProfile._engineCommonKeys || []).forEach(k => { if(d[k] !== undefined) { profile[k] = d[k]; delete d[k]; } });
        // IDENTITE DU CORPS -> profil (v598). Nom, telephone, ville et sexe sont
        // la PERSONNE, pas la casquette. Ils vivaient uniquement dans la fiche,
        // alors que saveCurrentProfile les valide sur les champs PLATS et que la
        // base range ces quatre-la en COLONNES (recherche de l'Univers). Un profil
        // rempli entierement depuis la fiche restait donc bloque sur « Veuillez
        // remplir les champs obligatoires » — champs pourtant remplis — et serait
        // parti en base avec un nom vide. On RECOPIE sans jamais effacer : une
        // valeur vide dans la fiche ne chasse pas celle deja connue du profil, et
        // la casquette garde la sienne (aucune fiche existante ne perd rien).
        ['name', 'phone', 'city', 'gender'].forEach(k => {
            if(d[k] !== undefined && String(d[k]).trim() !== '') profile[k] = d[k];
        });
        if(kind === 'crew') {
            d.department = d.group_id || d.department || ''; // pont group_id -> department (profil/sync)
            // v600 : le DEPARTEMENT remonte aussi au profil PLAT. La base le range
            // dans sa colonne de donnees, et c'est celle-la que l'Univers filtre.
            // Il n'est pas dans FACET_SWAP_KEYS (l'y mettre donnerait un
            // departement a la casquette comedien, qui l'effacerait en passant),
            // donc rien ne le recopiait : un technicien qui choisissait son
            // departement dans sa fiche restait introuvable par departement.
            // Meme regle que pour le nom : on n'ecrase jamais par du vide.
            if(d.department) profile.department = d.department;
            if(d.role) profile.role = d.role;
            profile.facets.crew[PublicProfile._engineCrewIndex] = d;
        } else {
            profile.facets[kind] = d;
        }
        // v598 : saveCurrentProfile peut REFUSER (validation, limite de profils,
        // erreur reseau). On annoncait « Casquette enregistree » dans tous les cas,
        // d'ou deux messages contradictoires a l'ecran et un utilisateur persuade
        // d'avoir sauvegarde alors que rien n'etait parti.
        const saved = await PublicProfile.saveCurrentProfile();
        if(saved === false) return false;
        if(showToast) Utils.toast((kind === 'crew' ? 'Casquette technicien' : 'Casquette comédien') + ' enregistrée.', 'success');
        return true;
    },
    _closeComedienEngine: () => {
        PublicProfile._engineMode = false;
        PublicProfile._engineProfile = null;
        if('_engineSavedData' in PublicProfile) { state.data = PublicProfile._engineSavedData; delete PublicProfile._engineSavedData; }
        if('_engineSavedRole' in PublicProfile) { state.currentRole = PublicProfile._engineSavedRole; delete PublicProfile._engineSavedRole; }
        const ov = document.getElementById('comedien-engine-overlay');
        if(ov) ov.remove();
        // v600 — l'ancien formulaire est SUPPRIME : il n'y a plus de champs a
        // l'ecran a realigner en sortant de la fiche, et le pansement qui le
        // declarait « non charge » pour la deuxieme fiche technicien n'a plus
        // d'objet. Reste utile : aligner les champs PLATS du profil sur la fiche
        // qui vient d'etre editee — ils alimentent les tuiles et les colonnes de
        // la base —, puis rafraichir l'ecran.
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(profile) {
            const kind = PublicProfile._engineKind || 'actor';
            const idx = PublicProfile._engineCrewIndex || 0;
            if(kind !== 'crew' || idx === 0) {
                PublicProfile.currentFacetTab = kind;
                PublicProfile._loadFacetToFlat(profile, kind);
            }
            PublicProfile.refreshProfileScreen(profile);
        }
    },

    // Construit la carte fiche comedien (moteur du projet) a partir de la copie en cours,
    // avec les retraits/injections propres au profil. Le decor de projet prete et le role
    // doivent deja etre en place (openComedienEngine).
    _engineBuildCard: () => {
        const draft = PublicProfile._engineProfile;
        const kind = PublicProfile._engineKind || 'actor';
        let card = null;
        try {
            if(kind === 'crew') {
                // DEPARTEMENTS : lus dans le REFERENTIEL (CONFIG.crewGroups), jamais dans le
                // DOM. Ils etaient pris dans un selecteur de l'ancien formulaire ; celui-ci
                // supprime (v600), la liste revenait VIDE et la fiche technicien n'offrait plus
                // aucun departement — donc plus aucune fonction, et un profil introuvable dans
                // l'Univers. Corrige aussitot. Les fonctions, elles, viennent deja du meme
                // referentiel (Crew.getRolesForGroup -> CONFIG.crewRoles).
                const groups = (CONFIG.crewGroups || []).filter(g => g.type === 'crew').map(g => ({ id: g.id, name: g.name }));
                card = UI.createCrewCard(draft, 0, groups, false);
            } else {
                const temp = document.createElement('div');
                UI.renderDataCards([draft], 'actors', temp, [], false);
                card = temp.firstElementChild;
            }
        } catch(e) { console.warn('Fiche moteur:', e); }
        if(!card) return null;
        const tabs = card.querySelector('.fid-tabs');
        if(tabs) {
            const pB = tabs.querySelector(':scope > .fid-tabbar > .fid-tab[data-tab="projet"]');
            const pP = tabs.querySelector(':scope > .fid-tabpanel[data-tab="projet"]');
            if(pB) pB.remove();
            if(pP) pP.remove();
            tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab.is-active, :scope > .fid-tabpanel.is-active').forEach(el => el.classList.remove('is-active'));
            const fB = tabs.querySelector(':scope > .fid-tabbar > .fid-tab');
            if(fB) {
                fB.classList.add('is-active');
                const fP = tabs.querySelector(':scope > .fid-tabpanel[data-tab="' + fB.dataset.tab + '"]');
                if(fP) fP.classList.add('is-active');
            }
        }
        card.querySelectorAll('.save-contact-btn, .group-select').forEach(el => el.remove());
        // La brique « Cachet & statut » reste sur le profil : le SALAIRE est masqué (wrap _engineMode),
        // mais statut/paie (intermittent, Sécu, SIRET) + mode de collaboration restent éditables par la personne.
        // « Notes générales » (crew) : note interne, sans objet dans une casquette publique.
        card.querySelectorAll('.fid-block[data-block-id="notes"]').forEach(el => el.remove());
        // LANGUES ET SPORTS AVEC NIVEAUX (v600). Greffes sur une brique existante
        // plutot qu'ajoutes comme brique a part : la carte est deja rendue et
        // equilibree ici, y inserer un bloc de plus derangerait la disposition.
        // Comedien : dans « Description physique », a la place des deux champs
        // texte libre — deux sources pour la meme donnee finiraient par diverger.
        // Technicien : dans « Bio & expérience », et sans les sports, qui sont du
        // comedien.
        const pskCible = card.querySelector('.fid-block[data-block-id="' + (kind === 'crew' ? 'bio' : 'physique') + '"] .fid-block-body');
        if(pskCible) {
            if(kind !== 'crew') {
                const champSports = pskCible.querySelector('input[onchange*="\'sports\'"]');
                const rang = champSports ? champSports.closest('.actor-input-row') : null;
                if(rang) rang.remove();
            }
            const bloc = document.createElement('div');
            bloc.innerHTML = ProfileSkills.blocHtml(kind !== 'crew');
            pskCible.appendChild(bloc);
            setTimeout(() => ProfileSkills.render(), 0);
        }
        const contactBody = card.querySelector('.fid-block[data-block-id="contact"] .fid-block-body');
        if(contactBody) {
            const extra = document.createElement('div');
            extra.innerHTML = FicheUI.field('Téléphone de l\'agent', '<input class="actor-input" value="' + Utils.escape(draft.agentPhone || '') + '" placeholder="Affiché à la place du téléphone perso" data-tooltip="Affiché à la place du téléphone perso" onchange="app.Actions.updateActorMeta(-1, \'agentPhone\', this.value)">')
                + '<label style="display:flex; gap:8px; align-items:center; margin-top:6px;"><input type="checkbox" ' + (draft.hidePhone ? 'checked' : '') + ' onchange="app.Actions.updateActorMeta(-1, \'hidePhone\', this.checked)"> Ne pas afficher mon téléphone perso sur mon profil public</label>';
            contactBody.appendChild(extra);
        }
        return card;
    },
    // Redessine la carte dans la fenetre ouverte (apres un changement de photo, etc.).
    _engineRerenderCard: () => {
        const overlay = document.getElementById('comedien-engine-overlay');
        if(!overlay) return;
        const box = overlay.firstElementChild;
        if(!box) return;
        // Memoriser la position de defilement pour ne pas remonter en haut apres le re-dessin.
        const _scrollBox = box.scrollTop, _scrollOv = overlay.scrollTop;
        // Memoriser l'onglet actif pour ne pas renvoyer l'utilisateur au premier onglet.
        let activeTab = null;
        const oldActive = box.querySelector('.fid-tabs > .fid-tabbar > .fid-tab.is-active');
        if(oldActive) activeTab = oldActive.getAttribute('data-tab');
        const card = PublicProfile._engineBuildCard();
        if(!card) return;
        // Restaurer l'onglet actif s'il existe encore dans la nouvelle carte.
        if(activeTab) {
            const tabs = card.querySelector('.fid-tabs');
            if(tabs) {
                const tb = tabs.querySelector(':scope > .fid-tabbar > .fid-tab[data-tab="' + activeTab + '"]');
                const tp = tabs.querySelector(':scope > .fid-tabpanel[data-tab="' + activeTab + '"]');
                if(tb && tp) {
                    tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab.is-active, :scope > .fid-tabpanel.is-active').forEach(el => el.classList.remove('is-active'));
                    tb.classList.add('is-active');
                    tp.classList.add('is-active');
                }
            }
        }
        if(box.children.length >= 2) box.replaceChild(card, box.lastElementChild); else box.appendChild(card);
        box.scrollTop = _scrollBox; overlay.scrollTop = _scrollOv;
        setTimeout(() => {
            box.scrollTop = _scrollBox; overlay.scrollTop = _scrollOv;
            card.querySelectorAll('[id^="actor-calendar-"],[id^="crew-calendar-"]').forEach(cal => {
                const m = cal.id.match(/(actor|crew)-calendar-(-?\d+)/);
                if(m) { try { UI.renderAvailabilityCalendar(cal.id, m[1], parseInt(m[2], 10)); } catch(e) {} }
            });
        }, 60);
    },
    // Photo en mode profil : envoi vers le bucket avatars (le profil n'a pas de projet).
    _engineUploadPhoto: async (input) => {
        if(!input || !input.files || !input.files[0]) return;
        const file = input.files[0];
        input.value = '';
        if(!file.type.startsWith('image/')) { Utils.toast('Fichier image invalide.', 'warning'); return; }
        Utils.toast('Envoi de la photo…', 'info', 1500);
        try {
            const blob = await PublicProfile.compressImageToBlob(file, 800, 0.85);
            const userId = state.currentUser.id;
            const filePath = userId + '/avatar_' + Date.now() + '.jpg';
            const { error } = await supabase.storage.from('avatars').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
            if(error) throw error;
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const url = (urlData && urlData.publicUrl) ? urlData.publicUrl : '';
            if(!url) throw new Error('URL vide');
            const p = PublicProfile.profiles[PublicProfile.currentProfileIndex];
            if(p) p.photo = url;                                        // avatar commun du profil
            if(PublicProfile._engineProfile) PublicProfile._engineProfile.photo = url; // + copie en cours
            PublicProfile._engineRerenderCard();
            Utils.toast('Photo mise à jour.', 'success');
        } catch(e) { console.warn('Photo profil (moteur):', e); Utils.toast('Erreur envoi photo : ' + ((e && e.message) || 'inconnue'), 'error'); }
    },
    // Galerie en mode profil : envoi vers le bucket gallery (max 3), stockee sur la copie.
    _engineAddGalleryPhoto: async (idx) => {
        const prefix = (PublicProfile._engineKind === 'crew') ? 'crew-gallery-input-' : 'actor-gallery-input-';
        const input = document.getElementById(prefix + idx);
        if(!input || !input.files || !input.files[0]) { Utils.toast('Veuillez sélectionner une photo.', 'warning'); return; }
        const file = input.files[0]; input.value = '';
        if(!file.type.startsWith('image/')) { Utils.toast('Fichier image invalide.', 'warning'); return; }
        const d = PublicProfile._engineProfile;
        if(!d) return;
        if(!Array.isArray(d.galleryPhotos)) d.galleryPhotos = [];
        if(d.galleryPhotos.length >= 3) { Utils.toast('3 photos maximum.', 'warning'); return; }
        Utils.toast('Envoi de la photo…', 'info', 1500);
        try {
            const blob = await PublicProfile.compressImageToBlob(file, 800, 0.8);
            const userId = state.currentUser.id;
            const filePath = userId + '/gallery_' + Date.now() + '.jpg';
            const { error } = await supabase.storage.from('gallery').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
            if(error) throw error;
            const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(filePath);
            const url = (urlData && urlData.publicUrl) ? urlData.publicUrl : '';
            if(!url) throw new Error('URL vide');
            d.galleryPhotos.push(url);
            PublicProfile._engineRerenderCard();
            Utils.toast('Photo ajoutée.', 'success');
        } catch(e) { console.warn('Galerie profil (moteur):', e); Utils.toast('Erreur envoi : ' + ((e && e.message) || 'inconnue'), 'error'); }
    },

    // ===== FUSION VOLET 2 : fiche asso / entreprise via le MOTEUR DU PROJET =====
    // Ouvre la casquette structure dans le meme moteur que la fiche Orgs d'un projet,
    // EN EDITION, sur une COPIE (stub jetable) construite depuis les champs a plat du
    // profil (Orgs._ficheFrom). Enregistrer remappe la copie vers les champs a plat +
    // facets.<kind>.hqAddress : SEULE la casquette concernee change, jamais les autres
    // (les champs non exposes par la fiche sont preserves). Fermer sans enregistrer = rien.
    openAssoEngine: () => PublicProfile._openOrgEngine('asso'),
    openEntrepriseEngine: () => PublicProfile._openOrgEngine('ent'),
    _openOrgEngine: (kind) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile) { Utils.toast('Aucun profil chargé.', 'warning'); return; }
        if(!profile.facets) profile.facets = {};
        if(!profile.facets[kind]) profile.facets[kind] = { enabled: true, visible: true, hqAddress: '', hqLatitude: null, hqLongitude: null };
        PublicProfile._engineKind = kind;
        // Stub d'org EDITABLE (pas de profileId -> branche editable de _detailHtml),
        // construit depuis les champs a plat du profil et le siege (facets.<kind>.hqAddress).
        const fiche = Orgs._ficheFrom(profile, profile.facets, kind);
        const stub = { id: profile.id || Utils.generateUniqueId(), type: kind, name: fiche.name || '', fiche: fiche, department: '', role: '', notes: '', profileId: null, srcId: null };
        PublicProfile._engineMode = true;
        PublicProfile._engineProfile = stub;
        // Le moteur suppose un projet ouvert (state.data + role). On prete un decor vide,
        // le stub place a l'index 0 de orgs, role 'owner' ; restaure a la fermeture.
        // Aucune sauvegarde projet ne part (garde _engineMode sur StoreSave).
        PublicProfile._engineSavedData = state.data;
        PublicProfile._engineSavedRole = state.currentRole;
        const blank = { actors:[], characters:[], locations:[], scenes:[], shootingDays:[], episodes:[], expenses:[], resources:[], crew:[], orgs:[], groups:[], vehicles:[], plans:[], contracts:[], seasons:[], budget:{}, history:[] };
        blank.orgs = [stub];
        state.data = blank;
        state.currentRole = 'owner';
        const card = PublicProfile._orgEngineBuildCard();
        if(!card) { PublicProfile._closeOrgEngine(); Utils.toast('Impossible d\'afficher la fiche structure.', 'error'); return; }
        const overlay = document.createElement('div');
        overlay.id = 'org-engine-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.55); overflow:auto; display:block;';
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--panel, var(--surface, var(--bg, #ffffff))); color:inherit; max-width:660px; width:92%; margin:5vh auto; max-height:88vh; overflow:auto; border-radius:12px; padding:16px; box-shadow:0 10px 40px rgba(0,0,0,.4);';
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; padding:0 0 10px;';
        bar.innerHTML = '<span style="font-weight:600;">' + (kind === 'ent' ? '🏢 Entreprise' : '🏛️ Association') + '</span>'
            + '<span style="display:flex; gap:8px;">'
            + '<button class="btn btn--primary btn--sm" id="org-engine-save">💾 Enregistrer</button>'
            + '<button class="btn btn--sm" id="org-engine-close">Fermer</button>'
            + '</span>';
        box.appendChild(bar);
        box.appendChild(card);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.getElementById('org-engine-save').onclick = async () => {
            const d = PublicProfile._engineProfile;
            const k = PublicProfile._engineKind || 'asso';
            const fc = (d && d.fiche) || {};
            const pre = (k === 'asso') ? 'asso' : 'ent';
            // Champs communs a la structure, exposes par la fiche projet -> champs a plat du profil.
            profile[pre + 'Name'] = fc.name || '';
            profile[pre + 'Type'] = fc.type || '';
            profile[pre + 'Siret'] = fc.siret || '';
            profile[pre + 'Year'] = fc.year || '';
            profile[pre + 'Phone'] = fc.phone || '';
            profile[pre + 'Website'] = fc.website || '';
            profile[pre + 'Email'] = fc.email || '';
            // Siege -> facets.<kind>.hqAddress (reinit des coordonnees si l'adresse change).
            if(!profile.facets[k]) profile.facets[k] = { enabled: true, visible: true };
            const prevHq = profile.facets[k].hqAddress || '';
            if((fc.hq || '') !== prevHq) { profile.facets[k].hqLatitude = null; profile.facets[k].hqLongitude = null; }
            profile.facets[k].hqAddress = fc.hq || '';
            // Logo, reseaux sociaux, bande demo (communs, exposes par la fiche).
            profile[pre + 'Logo'] = fc.logo || '';
            profile[pre + 'Facebook'] = fc.facebook || '';
            profile[pre + 'Instagram'] = fc.instagram || '';
            profile[pre + 'Youtube'] = fc.youtube || '';
            profile[pre + 'Linkedin'] = fc.linkedin || '';
            profile[pre + 'Demoreel'] = fc.demoreel || '';
            { const arr = Array.isArray(profile[pre + 'Demoreels']) ? profile[pre + 'Demoreels'].slice() : []; if(fc.demoreel) arr[0] = fc.demoreel; else arr.shift(); profile[pre + 'Demoreels'] = arr.filter(Boolean); }
            if(k === 'asso') {
                profile.assoMembers = fc.size || '';
                profile.assoPresident = fc.leader || '';
                profile.assoMission = fc.mission || '';
                profile.assoActivities = fc.activities || '';
                profile.assoContact = fc.contactPerson || '';
            } else {
                profile.entEmployees = fc.size || '';
                profile.entDirector = fc.leader || '';
                profile.entLegal = fc.legalForm || '';
                profile.entDescription = fc.mission || '';
                profile.entServices = fc.activities || '';
                profile.entContact = fc.contactPerson || '';
                profile.entVimeo = fc.vimeo || '';
                profile.entImdb = fc.imdb || '';
            }
            profile.name = profile[pre + 'Name'] || profile.name;
            if(!profile.type) profile.type = (k === 'asso') ? 'association' : 'enterprise';
            await PublicProfile.saveCurrentProfile();
            Utils.toast((k === 'asso' ? 'Casquette association' : 'Casquette entreprise') + ' enregistrée.', 'success');
        };
        document.getElementById('org-engine-close').onclick = () => PublicProfile._closeOrgEngine();
    },
    _closeOrgEngine: () => {
        PublicProfile._engineMode = false;
        PublicProfile._engineProfile = null;
        if('_engineSavedData' in PublicProfile) { state.data = PublicProfile._engineSavedData; delete PublicProfile._engineSavedData; }
        if('_engineSavedRole' in PublicProfile) { state.currentRole = PublicProfile._engineSavedRole; delete PublicProfile._engineSavedRole; }
        const ov = document.getElementById('org-engine-overlay');
        if(ov) ov.remove();
    },
    // Redessine la carte structure dans la fenetre (apres upload de logo), onglet actif conserve.
    _orgEngineRerenderCard: () => {
        const overlay = document.getElementById('org-engine-overlay');
        if(!overlay) return;
        const box = overlay.firstElementChild;
        if(!box) return;
        const _scrollBox = box.scrollTop, _scrollOv = overlay.scrollTop;
        let activeTab = null;
        const oldActive = box.querySelector('.fid-tabs > .fid-tabbar > .fid-tab.is-active');
        if(oldActive) activeTab = oldActive.getAttribute('data-tab');
        const card = PublicProfile._orgEngineBuildCard();
        if(!card) return;
        if(activeTab) {
            const tabs = card.querySelector('.fid-tabs');
            if(tabs) {
                const tb = tabs.querySelector(':scope > .fid-tabbar > .fid-tab[data-tab="' + activeTab + '"]');
                const tp = tabs.querySelector(':scope > .fid-tabpanel[data-tab="' + activeTab + '"]');
                if(tb && tp) {
                    tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab.is-active, :scope > .fid-tabpanel.is-active').forEach(el => el.classList.remove('is-active'));
                    tb.classList.add('is-active');
                    tp.classList.add('is-active');
                }
            }
        }
        if(box.children.length >= 2) box.replaceChild(card, box.lastElementChild); else box.appendChild(card);
        box.scrollTop = _scrollBox; overlay.scrollTop = _scrollOv;
    },
    // Construit la carte fiche structure (moteur Orgs) depuis le stub, avec les retraits
    // propres au profil : onglets « Sur ce projet » + « Origine » otes, bouton supprimer ote,
    // selecteur asso/entreprise remplace par le selecteur de TYPE (categorie, champ requis).
    _orgEngineBuildCard: () => {
        const stub = PublicProfile._engineProfile;
        const kind = PublicProfile._engineKind || 'asso';
        let card = null;
        try {
            const temp = document.createElement('div');
            temp.innerHTML = Orgs._detailHtml(stub, 0);
            card = temp.firstElementChild;
        } catch(e) { console.warn('Fiche structure (moteur):', e); }
        if(!card) return null;
        const tabs = card.querySelector('.fid-tabs');
        if(tabs) {
            ['projet', 'origine'].forEach(t => {
                const b = tabs.querySelector(':scope > .fid-tabbar > .fid-tab[data-tab="' + t + '"]');
                const p = tabs.querySelector(':scope > .fid-tabpanel[data-tab="' + t + '"]');
                if(b) b.remove();
                if(p) p.remove();
            });
            tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab.is-active, :scope > .fid-tabpanel.is-active').forEach(el => el.classList.remove('is-active'));
            const fB = tabs.querySelector(':scope > .fid-tabbar > .fid-tab');
            if(fB) {
                fB.classList.add('is-active');
                const fP = tabs.querySelector(':scope > .fid-tabpanel[data-tab="' + fB.dataset.tab + '"]');
                if(fP) fP.classList.add('is-active');
            }
        }
        // Pas de suppression depuis le profil.
        card.querySelectorAll('.fid-head-side button').forEach(el => el.remove());
        const ficheBody = card.querySelector('.fid-block[data-block-id="fiche"] .fid-block-body');
        if(ficheBody) {
            // Le selecteur asso/entreprise (Orgs.update 'type') n'a pas lieu d'etre : la carte est dediee.
            const kindField = ficheBody.querySelector('.fid-field');
            if(kindField) kindField.remove();
            // Selecteur de TYPE (categorie) = champ requis a la sauvegarde ; ecrit sur fiche.type.
            const cats = (kind === 'ent') ? (CONFIG.enterpriseTypes || []) : (CONFIG.associationTypes || []);
            const cur = (stub.fiche && stub.fiche.type) || '';
            const opts = '<option value="">— Type —</option>' + cats.map(t => '<option value="' + Utils.escape(t.id) + '"' + (t.id === cur ? ' selected' : '') + '>' + Utils.escape(t.name) + '</option>').join('');
            const wrap = document.createElement('div');
            wrap.innerHTML = FicheUI.field((kind === 'ent' ? 'Type d\'entreprise' : 'Type d\'association'), '<select class="actor-input" onchange="app.Orgs.updateFiche(0, \'type\', this.value)">' + opts + '</select>');
            if(wrap.firstElementChild) ficheBody.insertBefore(wrap.firstElementChild, ficheBody.firstChild);
        }
        return card;
    },

    // Activer une casquette depuis sa carte grisee, puis ouvrir sa fiche.
    // v600 : l'etat s'ecrit sur le PROFIL. Avant, il n'etait pose que sur une
    // case cachee du formulaire, et seul ce formulaire — devenu mort — le
    // recopiait vers le profil : activer ou refermer une casquette ne
    // survivait donc plus a un enregistrement.
    activateFacetCard: (k) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile) { Utils.toast('Aucun profil chargé.', 'warning'); return; }
        profile.facets = PublicProfile._normalizeFacets(profile.facets, { profile_type: profile.type, is_public: profile.is_public });
        if(profile.facets[k]) profile.facets[k].enabled = true;
        PublicProfile.renderFacetTabs(PublicProfile._enabledFacets(profile));
        PublicProfile.openFicheCard(k);
    },
    // Refermer une casquette : la carte redevient grisee (donnees gardees).
    deactivateFacetCard: (k) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile || !profile.facets || !profile.facets[k]) return;
        profile.facets[k].enabled = false;
        PublicProfile.renderFacetTabs(PublicProfile._enabledFacets(profile));
    },
    // Bascule « Visible dans l'Univers » d'une casquette.
    toggleFacetVisible: (k, checked) => {
        const p = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(p && p.facets && p.facets[k]) p.facets[k].visible = checked;
    },
    // Vider les champs d'une casquette (ancien « Remettre a zero cette carte »).
    effaceFacetCard: (k) => {
        PublicProfile.currentFacetTab = k;
        PublicProfile.resetCurrentFacet();
    },

    // ===== v598 : plusieurs fiches technicien par compte — actions par index =====
    // Ce qu'une NOUVELLE fiche technicien reprend de la personne : identite,
    // contact et vehicule. Pas le metier (departement, fonction, parcours, bande
    // demo, tarif), pas l'email de CONTACT — il est propre a chaque fiche. L'age
    // et la date de naissance ne sont pas listes : ils vivent deja sur le profil,
    // communs a toutes les casquettes, donc rien a recopier.
    // v598 : telephone, vehicule, permis et agenda ont QUITTE cette liste — ils
    // sont desormais communs au profil (FACET_COMMON_KEYS), donc deja presents
    // sur une fiche neuve. Les recopier ici en refabriquerait des exemplaires
    // par casquette, exactement ce qu'on vient de supprimer.
    CREW_NEW_INHERIT: ['name','photo','gender','hidePhone','agentPhone','city','address','latitude','longitude','hideAddress','hideAddressInProjects'],

    // Une fiche technicien porte-t-elle autre chose que ses deux interrupteurs ?
    // Sert a distinguer un emplacement JAMAIS rempli d'une fiche simplement
    // refermee, dont les donnees doivent etre rendues intactes.
    _crewCardHasContent: (f) => !!f && Object.keys(f).some(k =>
        k !== 'enabled' && k !== 'visible'
        && f[k] !== undefined && f[k] !== null && f[k] !== ''
        && !(Array.isArray(f[k]) && f[k].length === 0)),

    // v598 — tuile « + Ajouter un profil technicien » de la grille Mon Profil.
    // Remplace le bouton « Dupliquer » qui vivait DANS une fiche. Le modele est
    // la premiere fiche technicien remplie ; a defaut la casquette comedien.
    // Aucun emplacement technicien occupe ? On prend le PREMIER LIBRE au lieu
    // d'en ouvrir un de plus a cote d'une case vide.
    addCrewCard: () => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        if(!profile) { Utils.toast('Aucun profil chargé.', 'warning'); return; }
        if(!profile.facets) profile.facets = {};
        if(!Array.isArray(profile.facets.crew)) profile.facets.crew = PublicProfile.crewArr(profile.facets);
        const arr = profile.facets.crew;
        const actorFacet = profile.facets.actor;
        const src = arr.find(f => f && f.enabled)
            || ((actorFacet && actorFacet.enabled) ? actorFacet : null);
        const fiche = { enabled: true, visible: true };
        if(src) {
            PublicProfile.CREW_NEW_INHERIT.forEach(k => {
                const v = src[k];
                if(v !== undefined && v !== null && v !== '') fiche[k] = PublicProfile._cloneFacetVal(v);
            });
        }
        let idx = arr.findIndex(f => !f || !f.enabled);
        let reprise = false;
        if(idx === -1) { arr.push(fiche); idx = arr.length - 1; }
        else if(PublicProfile._crewCardHasContent(arr[idx])) {
            // Emplacement REFERME mais pas vide : « Refermer (regriser) » promet de
            // garder les donnees. On le rouvre tel quel — l'ecraser avec une fiche
            // neuve reviendrait a trahir cette promesse.
            arr[idx].enabled = true;
            if(arr[idx].visible === undefined) arr[idx].visible = true;
            reprise = true;
        }
        else arr[idx] = fiche;
        PublicProfile.renderFacetTabs();
        if(reprise) Utils.toast('Fiche technicien rouverte telle qu\'elle avait été refermée.', 'success', 5000);
        else if(src) Utils.toast('Nouvelle fiche technicien — identité, contact et véhicule repris. Choisis son département.', 'success', 5000);
        PublicProfile.openTechnicienEngine(idx);
    },

    // Refermer une fiche technicien (regrisee, donnees gardees) — uniquement quand il n'y en a qu'une.
    deactivateCrewCard: (idx) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        const arr = profile && profile.facets && Array.isArray(profile.facets.crew) ? profile.facets.crew : null;
        if(!arr || !arr[idx]) return;
        arr[idx].enabled = false;
        PublicProfile.renderFacetTabs();
    },
    // Bascule « Visible dans l'Univers » d'une fiche technicien precise.
    toggleCrewVisible: (idx, checked) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        const arr = profile && profile.facets && Array.isArray(profile.facets.crew) ? profile.facets.crew : null;
        if(arr && arr[idx]) arr[idx].visible = checked;
    },
    // Vider les champs d'une fiche technicien precise (garde enabled/visible, efface le reste).
    effaceCrewCard: async (idx) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        const arr = profile && profile.facets && Array.isArray(profile.facets.crew) ? profile.facets.crew : null;
        if(!arr || !arr[idx]) return;
        if(!await ConfirmModal.confirmDelete('Tous les champs de cette fiche technicien seront effacés.', 'Remettre à zéro cette fiche ?')) return;
        arr[idx] = { enabled: arr[idx].enabled, visible: arr[idx].visible };
        PublicProfile.renderFacetTabs();
        Utils.toast('Fiche technicien remise à zéro — pensez à Sauvegarder pour confirmer.', 'success', 5000);
    },
    // Supprime definitivement une fiche technicien en trop (jamais la derniere restante).
    deleteCrewCard: async (idx) => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        const arr = profile && profile.facets && Array.isArray(profile.facets.crew) ? profile.facets.crew : null;
        if(!arr || arr.length < 2) return;
        if(!await ConfirmModal.confirmDelete('Cette fiche technicien sera définitivement supprimée.', 'Supprimer cette fiche ?')) return;
        arr.splice(idx, 1);
        PublicProfile.renderFacetTabs();
        await PublicProfile.saveCurrentProfile();
    },

    // ===== ADRESSE / GÉOLOCALISATION — délégué à ProfileAddress =====
    geocodeAddressInternational: (...a) => ProfileAddress.geocodeAddressInternational(...a),
	
    showTab: (tab) => {
        const profileContent = document.getElementById('profile-content');
        if(profileContent) profileContent.style.display = 'block';
    },
    
 // ===== REVENDICATION DE PROFIL (claims) — délégué à ProfileClaims =====
    get pendingClaims() { return ProfileClaims.pendingClaims; },
    set pendingClaims(v) { ProfileClaims.pendingClaims = v; },
    loadPendingClaims: (...a) => ProfileClaims.loadPendingClaims(...a),
    
    // ===== Facettes : 1 personne, 4 casquettes (comédien / technicien / asso / entreprise) =====
    FACET_KEYS: ['actor', 'crew', 'asso', 'ent'],

    _facetDefaults: () => ({
        actor: { enabled: false, visible: true },
        crew:  [{ enabled: false, visible: true }],
        asso:  { enabled: false, visible: true, hqAddress: '', hqLatitude: null, hqLongitude: null },
        ent:   { enabled: false, visible: true, hqAddress: '', hqLatitude: null, hqLongitude: null }
    }),

    _typeToFacet: (t) => (t === 'actor' ? 'actor' : t === 'crew' ? 'crew' : t === 'association' ? 'asso' : t === 'enterprise' ? 'ent' : null),
    _facetToType: (k) => (k === 'actor' ? 'actor' : k === 'crew' ? 'crew' : k === 'asso' ? 'association' : k === 'ent' ? 'enterprise' : ''),

    // v598 : plusieurs fiches technicien par compte. facets.crew est TOUJOURS un tableau
    // apres normalisation (au moins un element). Cle composite pour le pager Univers :
    // 'crew' = index 0, 'crew:N' = index N (les 3 autres casquettes restent un objet unique).
    _facetKind: (compositeKey) => (compositeKey || '').split(':')[0],
    _facetIdx: (compositeKey) => { const p = (compositeKey || '').split(':'); return p[1] ? parseInt(p[1], 10) : 0; },
    _facetKey: (kind, idx) => (kind === 'crew' && idx) ? ('crew:' + idx) : kind,
    crewArr: (facets) => (facets && Array.isArray(facets.crew)) ? facets.crew : (facets && facets.crew ? [facets.crew] : [{ enabled: false, visible: true }]),
    crewAnyEnabled: (facets) => PublicProfile.crewArr(facets).some(f => f && f.enabled),
    // Lit une fiche par cle composite ('crew:1', 'asso'...) dans un objet facets deja normalise.
    facetByKey: (facets, key) => {
        const kind = PublicProfile._facetKind(key);
        if(kind === 'crew') return PublicProfile.crewArr(facets)[PublicProfile._facetIdx(key)] || {};
        return (facets && facets[kind]) || {};
    },

    // Charge data.facets si présent, sinon migration douce depuis profile_type (anciens profils)
    _normalizeFacets: (saved, row) => {
        const f = PublicProfile._facetDefaults();
        if(saved && typeof saved === 'object') {
            PublicProfile.FACET_KEYS.forEach(k => {
                if(!saved[k]) return;
                if(k === 'crew') {
                    // Ancien format (objet unique) migre en douceur vers un tableau d'une entree ;
                    // nouveau format deja tableau (plusieurs fiches technicien).
                    const arr = (Array.isArray(saved.crew) ? saved.crew : [saved.crew]).filter(x => x && typeof x === 'object');
                    f.crew = arr.length ? arr.map(x => Object.assign({ enabled: false, visible: true }, x)) : f.crew;
                } else {
                    Object.assign(f[k], saved[k]);
                }
            });
            return f;
        }
        const k = PublicProfile._typeToFacet(row && row.profile_type);
        if(k === 'crew') { f.crew[0].enabled = true; f.crew[0].visible = (row.is_public !== false); }
        else if(k) { f[k].enabled = true; f[k].visible = (row.is_public !== false); }
        return f;
    },

    // À la sauvegarde : les facettes suivent (au minimum) le type courant du formulaire
    _syncFacetsWithType: (profile) => {
        const f = PublicProfile._normalizeFacets(profile.facets, { profile_type: profile.type, is_public: true });
        const k = PublicProfile._typeToFacet(profile.type);
        if(k === 'crew') f.crew[0].enabled = true;
        else if(k) f[k].enabled = true;
        return f;
    },

    // ===== Champs par fiche (casquette) =====
    // Lecture : valeur propre à la fiche si elle existe, sinon héritage de l'ancien champ commun.
    // C'est la « migration douce » : tant qu'une fiche n'a pas surchargé un champ, elle hérite
    // de la valeur historique partagée ; dès qu'on l'édite dans son onglet, elle devient autonome.
    getFacetField: (profile, facet, key) => {
        const f = profile && profile.facets && profile.facets[facet];
        if(f && f[key] !== undefined && f[key] !== null) return f[key];
        return profile ? profile[key] : undefined;
    },

    // Écriture : toujours dans la fiche (jamais dans le champ commun).
    setFacetField: (profile, facet, key, value) => {
        if(!profile) return;
        profile.facets = profile.facets || PublicProfile._facetDefaults();
        if(!profile.facets[facet]) profile.facets[facet] = {};
        profile.facets[facet][key] = value;
    },

    // Première facette active (compatibilité avec l'ancien profile_type)
    firstEnabledFacet: (profile) => {
        const f = (profile && profile.facets) || {};
        // v599 : facets.crew est un TABLEAU depuis v597. Tester f.crew.enabled
        // interrogeait le tableau lui-meme, jamais les fiches qu'il contient :
        // un compte purement technicien n'avait donc AUCUNE casquette active
        // aux yeux de cette fonction, et le type du profil s'en trouvait fausse.
        return PublicProfile.FACET_KEYS.find(k => k === 'crew'
            ? PublicProfile.crewAnyEnabled(f)
            : (f[k] && f[k].enabled)) || null;
    },

    loadProfiles: async () => {
        const email = state.currentUser.email.toLowerCase();
        
        try {
            // I2 : charger TOUS les profils où je suis owner (tableau au lieu d'un seul)
            const { data: userProfiles, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('owner_email', email)
                .order('created_at', { ascending: true });
            
            if(error) {
                console.error('Erreur chargement profils:', error);
                PublicProfile.profiles = [];
                return;
            }
            
            if(!userProfiles || userProfiles.length === 0) {
                PublicProfile.profiles = [];
                return;
            }
            
            // Mapper chaque ligne DB vers un objet profil utilisable par le front
            PublicProfile.profiles = userProfiles
                .filter(up => up.name)  // ignorer les profils sans nom (brouillons)
                .map(userProfile => {
                    const extraData = userProfile.data || {};
                    return {
                        id: userProfile.id,
                        type: userProfile.profile_type || 'crew',
                        name: userProfile.name,
                        email: userProfile.email,
                        phone: userProfile.phone || '',
                        photo: userProfile.photo || '',
                        bio: userProfile.bio || '',
                        gender: userProfile.gender || '',
                        city: userProfile.city || '',
                        birthdate: userProfile.birthdate || '',
                        hasVehicle: userProfile.vehicle || false,
                        vehicle: userProfile.vehicle || false,
                        acting_styles: userProfile.acting_styles || [],
                        technical_skills: userProfile.technical_skills || [],
                        experience: userProfile.experience || '',
                        availabilityText: userProfile.availability || '',
                        is_public: userProfile.is_public,
                        profileComplete: userProfile.is_public,
                        facets: PublicProfile._normalizeFacets(extraData.facets, userProfile),
                        // Commun
                        address: extraData.address || '',
                        hideAddress: extraData.hideAddress || false,
                        hideAddressInProjects: extraData.hideAddressInProjects || false,
                        hidePhone: extraData.hidePhone === true,
                        agentPhone: extraData.agentPhone || '',
                        website: extraData.website || '',
                        dailyRate: extraData.dailyRate || '',
                        rateCurrency: extraData.rateCurrency || '€',
                        rateNegotiable: extraData.rateNegotiable || false,
                        collabTypes: extraData.collabTypes || [],
                        availabilityDates: extraData.availabilityDates || [],
                        unavailabilityDates: extraData.unavailabilityDates || [],
                        // Véhicule
                        vehicleType: extraData.vehicleType || '',
                        vehiclePlate: extraData.vehiclePlate || '',
                        vehicleSeats: extraData.vehicleSeats || '',
                        vehicleTrunk: extraData.vehicleTrunk || false,
                        vehicleNotes: extraData.vehicleNotes || '',
                        // Comédien
                        height: extraData.height || '',
                        weight: extraData.weight || '',
                        age: extraData.age || '',
                        eyeColor: extraData.eyeColor || '',
                        hairColor: extraData.hairColor || '',
                        hairLength: extraData.hairLength || '',
                        ethnicity: extraData.ethnicity || '',
                        corpulence: extraData.corpulence || '',
                        sports: extraData.sports || '',
                        languages: extraData.languages || '',
                        languagesWithLevels: extraData.languagesWithLevels || [],
                        sportsWithLevels: extraData.sportsWithLevels || [],
                        galleryPhotos: extraData.galleryPhotos || [],
                        demoreel: extraData.demoreel || '',
                        // Technicien
                        department: extraData.department || '',
                        role: extraData.role || '',
                        cameras: extraData.cameras || [],
                        lenses: extraData.lenses || [],
                        lights: extraData.lights || [],
                        sounds: extraData.sounds || [],
                        grips: extraData.grips || [],
                        makeups: extraData.makeups || [],
                        otherEquipment: extraData.otherEquipment || [],
                        crewGalleryPhotos: extraData.crewGalleryPhotos || [],
                        // Association
                        assoName: extraData.assoName || '',
                        assoLogo: extraData.assoLogo || '',
                        assoType: extraData.assoType || '',
                        assoSiret: extraData.assoSiret || '',
                        assoMembers: extraData.assoMembers || '',
                        assoYear: extraData.assoYear || '',
                        assoPresident: extraData.assoPresident || '',
                        assoMission: extraData.assoMission || '',
                        assoActivities: extraData.assoActivities || '',
                        assoServices: extraData.assoServices || {},
                        assoFacebook: extraData.assoFacebook || '',
                        assoInstagram: extraData.assoInstagram || '',
                        assoYoutube: extraData.assoYoutube || '',
                        assoLinkedin: extraData.assoLinkedin || '',
                        assoEmail: extraData.assoEmail || '',
                        assoPhone: extraData.assoPhone || '',
                        assoWebsite: extraData.assoWebsite || '',
                        assoDemoreel: extraData.assoDemoreel || '',
                        assoDemoreels: extraData.assoDemoreels || [],
                        // Entreprise
                        entName: extraData.entName || '',
                        entLogo: extraData.entLogo || '',
                        entType: extraData.entType || '',
                        entSiret: extraData.entSiret || '',
                        entLegal: extraData.entLegal || '',
                        entYear: extraData.entYear || '',
                        entEmployees: extraData.entEmployees || '',
                        entDirector: extraData.entDirector || '',
                        entContact: extraData.entContact || '',
                        entDescription: extraData.entDescription || '',
                        entServices: extraData.entServices || '',
                        entSpecialties: extraData.entSpecialties || {},
                        entFacebook: extraData.entFacebook || '',
                        entInstagram: extraData.entInstagram || '',
                        entYoutube: extraData.entYoutube || '',
                        entLinkedin: extraData.entLinkedin || '',
                        entVimeo: extraData.entVimeo || '',
                        entImdb: extraData.entImdb || '',
                        entEmail: extraData.entEmail || '',
                        entPhone: extraData.entPhone || '',
                        entWebsite: extraData.entWebsite || '',
                        entDemoreel: extraData.entDemoreel || '',
                        entDemoreels: extraData.entDemoreels || []
                    };
                });

            // v598 : remontee des champs de corps (telephone, vehicule, agenda)
            // des casquettes vers le profil, pour les profils d'avant. Ce qui est
            // remonte ici repart en base a la prochaine sauvegarde.
            PublicProfile.profiles.forEach(p => PublicProfile._liftCommonToProfile(p));

            // S'assurer que currentProfileIndex est valide
            if(PublicProfile.currentProfileIndex >= PublicProfile.profiles.length) {
                PublicProfile.currentProfileIndex = PublicProfile.profiles.length > 0 ? 0 : -1;
            }
        } catch(e) {
            console.error('Erreur chargement profils:', e);
            PublicProfile.profiles = [];
        }
    },
    
// Ancienne fonction load pour compatibilité
    load: async () => {
        await PublicProfile.loadProfiles();
        ActiveProfile.ensureValid();
        setTimeout(() => ActiveProfile.attachToDom(), 100);
    },
    
    // Sauvegarde le profil actuel
    saveCurrentProfile: async () => {
        if(PublicProfile.currentProfileIndex < 0) {
            Utils.toast('Aucun profil à sauvegarder. Créez d\'abord un profil.', 'warning');
            return false;
        }
        
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];

        // v599 — ON NE RELIT PLUS L'ANCIEN FORMULAIRE. Les QUATRE casquettes
        // s'editent desormais chacune dans sa propre fiche : openFicheCard les
        // intercepte toutes (actor, crew, asso, ent) et chaque fiche ecrit
        // directement dans l'objet profil. Le vieux formulaire n'est donc plus
        // affiche nulle part — le relire ici ne pouvait plus qu'ecraser ce que la
        // fiche venait d'enregistrer. C'est la cause commune des DEUX bugs du
        // 19 septembre : « champs obligatoires » refuses alors qu'ils etaient
        // remplis, et champ efface qui revenait apres enregistrement. Les deux
        // avaient ete rustines ; la cause part ici.
        // Seul le type courant restait a en tirer : il se deduit des casquettes
        // actives, donc du PROFIL, sans passer par le DOM.
        if(profile) profile.type = PublicProfile._facetToType(PublicProfile.firstEnabledFacet(profile)) || profile.type || '';
        
        if(!profile.type) {
            Utils.toast('Veuillez choisir un type de profil.', 'warning');
            return false;
        }
        
        // Validation selon le type
        if(profile.type === 'actor' || profile.type === 'crew') {
            if(!profile.name || !profile.phone || !profile.city || !profile.gender) {
                Utils.toast('Veuillez remplir les champs obligatoires (Nom, Sexe, Téléphone, Ville).', 'warning');
                return false;
            }
        } else if(profile.type === 'association') {
            if(!profile.assoName || !profile.assoType || !profile.assoMission) {
                Utils.toast('Veuillez remplir les champs obligatoires (Nom, Type, Mission).', 'warning');
                return false;
            }
        } else if(profile.type === 'enterprise') {
            if(!profile.entName || !profile.entType || !profile.entDescription) {
                Utils.toast('Veuillez remplir les champs obligatoires (Nom, Type, Description).', 'warning');
                return false;
            }
        }
        
        // v600 — STATUT « profil complet ». Il n'etait recalcule que par
        // saveFormToCurrentProfile, mort depuis la fusion des fiches : le bouton
        // du tableau de bord restait donc fige sur « Compléter mon profil ». Le
        // calcul revient ici, ou les memes champs viennent d'etre valides.
        profile.profileComplete = !!(profile.type && (
            profile.type === 'association' ? (profile.assoName && profile.assoType && profile.assoMission)
            : profile.type === 'enterprise' ? (profile.entName && profile.entType && profile.entDescription)
            : (profile.name && profile.phone && profile.city && profile.gender)
        ));
        profile.updatedAt = new Date().toISOString();

        const btn = document.querySelector('button[onclick="app.PublicProfile.saveCurrentProfile()"]');
        const originalText = btn ? btn.innerHTML : '';
        if(btn) { btn.innerHTML = '<span class="spinner"></span>Sauvegarde...'; btn.classList.add('btn-loading'); }
        
        const email = state.currentUser.email.toLowerCase();
        
        try {
            // Si on a une adresse mais pas de coords (édition manuelle, ou adresse étrangère non BAN) :
            // fallback Nominatim international avant sauvegarde
            if(profile.address && (profile.latitude == null || profile.longitude == null)) {
                try {
                    const intlCoords = await PublicProfile.geocodeAddressInternational(profile.address);
                    if(intlCoords) {
                        profile.latitude = intlCoords.lat;
                        profile.longitude = intlCoords.lng;
                    }
                } catch(e) {
                    console.warn('Fallback géocodage international échoué:', e);
                }
            }
            // Sièges asso / entreprise : géocoder si renseignés et sans coordonnées
            for(const fk of ['asso', 'ent']) {
                const f = profile.facets && profile.facets[fk];
                if(f && f.enabled && f.hqAddress && (f.hqLatitude == null || f.hqLongitude == null)) {
                    try {
                        const c = await PublicProfile.geocodeAddressInternational(f.hqAddress);
                        if(c) { f.hqLatitude = c.lat; f.hqLongitude = c.lng; }
                    } catch(e) { console.warn('Géocodage siège échoué (' + fk + '):', e); }
                }
            }
            
            // Sauvegarder le profil dans Supabase
            const dataToSave = {
                name: profile.name,
                phone: profile.phone,
                city: profile.city,
                gender: profile.gender,
                photo: profile.photo,
                bio: profile.bio,
                birthdate: profile.birthdate || null,
                vehicle: profile.hasVehicle || profile.vehicle || false,
                profile_type: profile.type,
                acting_styles: profile.acting_styles || [],
                technical_skills: profile.technical_skills || [],
                experience: profile.experience || '',
                availability: profile.availabilityText || profile.availability || '',
                latitude: profile.latitude != null ? profile.latitude : null,
                longitude: profile.longitude != null ? profile.longitude : null,
                is_public: true,
                updated_at: new Date().toISOString(),
                data: {
                    // Facettes (1 personne, 4 casquettes)
                    facets: PublicProfile._syncFacetsWithType(profile),
                    // Commun
                    address: profile.address || '',
                    hideAddress: profile.hideAddress || false,
                    hideAddressInProjects: profile.hideAddressInProjects || false,
                    // v578 (audit) : lus EN BASE par public_profiles_for_me
                    hidePhone: profile.hidePhone === true,
                    agentPhone: profile.agentPhone || '',
                    website: profile.website || '',
                    dailyRate: profile.dailyRate || '',
                    rateCurrency: profile.rateCurrency || '€',
                    rateNegotiable: profile.rateNegotiable || false,
                    collabTypes: profile.collabTypes || [],
                    availabilityDates: profile.availabilityDates || [],
                    unavailabilityDates: profile.unavailabilityDates || [],
                    // Véhicule
                    vehicleType: profile.vehicleType || '',
                    vehiclePlate: profile.vehiclePlate || '',
                    vehicleSeats: profile.vehicleSeats || '',
                    vehicleTrunk: profile.vehicleTrunk || false,
                    vehicleNotes: profile.vehicleNotes || '',
                    licenses: profile.licenses || [],
                    vehicleUsage: profile.vehicleUsage || '',
                    // Comédien
                    height: profile.height || '',
                    weight: profile.weight || '',
                    age: profile.age || '',
                    eyeColor: profile.eyeColor || '',
                    hairColor: profile.hairColor || '',
                    hairLength: profile.hairLength || '',
                    ethnicity: profile.ethnicity || '',
                    corpulence: profile.corpulence || '',
                    sports: profile.sports || '',
                    languages: profile.languages || '',
                    languagesWithLevels: profile.languagesWithLevels || [],
                    sportsWithLevels: profile.sportsWithLevels || [],
                    galleryPhotos: profile.galleryPhotos || [],
                    demoreel: profile.demoreel || '',
                    // Technicien
                    department: profile.department || '',
                    role: profile.role || '',
                    cameras: profile.cameras || [],
                    lenses: profile.lenses || [],
                    lights: profile.lights || [],
                    sounds: profile.sounds || [],
                    grips: profile.grips || [],
                    makeups: profile.makeups || [],
                    otherEquipment: profile.otherEquipment || [],
                    crewGalleryPhotos: profile.crewGalleryPhotos || [],
                    // Association
                    assoName: profile.assoName || '',
                    assoLogo: profile.assoLogo || '',
                    assoType: profile.assoType || '',
                    assoSiret: profile.assoSiret || '',
                    assoMembers: profile.assoMembers || '',
                    assoYear: profile.assoYear || '',
                    assoPresident: profile.assoPresident || '',
                    assoMission: profile.assoMission || '',
                    assoActivities: profile.assoActivities || '',
                    assoServices: profile.assoServices || {},
                    assoFacebook: profile.assoFacebook || '',
                    assoInstagram: profile.assoInstagram || '',
                    assoYoutube: profile.assoYoutube || '',
                    assoLinkedin: profile.assoLinkedin || '',
                    assoEmail: profile.assoEmail || '',
                    assoPhone: profile.assoPhone || '',
                    assoWebsite: profile.assoWebsite || '',
                    assoDemoreel: profile.assoDemoreel || '',
                    assoDemoreels: profile.assoDemoreels || [],
                    // Entreprise
                    entName: profile.entName || '',
                    entLogo: profile.entLogo || '',
                    entType: profile.entType || '',
                    entSiret: profile.entSiret || '',
                    entLegal: profile.entLegal || '',
                    entYear: profile.entYear || '',
                    entEmployees: profile.entEmployees || '',
                    entDirector: profile.entDirector || '',
                    entContact: profile.entContact || '',
                    entDescription: profile.entDescription || '',
                    entServices: profile.entServices || '',
                    entSpecialties: profile.entSpecialties || {},
                    entFacebook: profile.entFacebook || '',
                    entInstagram: profile.entInstagram || '',
                    entYoutube: profile.entYoutube || '',
                    entLinkedin: profile.entLinkedin || '',
                    entVimeo: profile.entVimeo || '',
                    entImdb: profile.entImdb || '',
                    entEmail: profile.entEmail || '',
                    entPhone: profile.entPhone || '',
                    entWebsite: profile.entWebsite || '',
                    entDemoreel: profile.entDemoreel || '',
                    entDemoreels: profile.entDemoreels || []
                }
            };
            
            // I2 : upsert par id (UUID du profil) et non plus par email,
            // pour supporter plusieurs profils par utilisateur.
            // owner_email = compte propriétaire, email = email public du profil (peut différer)
            const {error: upErr} = await supabase.from('user_profiles').upsert({
                id: profile.id,
                owner_email: email,
                email: email,  // mono-profil : l'email du profil est toujours celui du compte
                ...dataToSave
            }, { onConflict: 'id' });
            if(upErr) {
                // Détection du trigger de limite 3 profils
                if((upErr.message || '').includes('LIMIT_3_PROFILES')) {
                    Utils.toast('Limite de 3 profils atteinte.', 'warning', 5000);
                } else {
                   Utils.toast('Erreur sauvegarde : ' + (upErr.message || 'inconnue'), 'error', 8000);
                }
                console.error('Profil upsert:', upErr);
                if(btn) { btn.innerHTML = originalText; btn.classList.remove('btn-loading'); }
                return false;
            }
            
            // Mettre à jour state.userProfile pour le bouton du dashboard
            if(profile.profileComplete) {
                state.userProfile = state.userProfile || {};
                state.userProfile.profileComplete = true;
            }
            
            PublicProfile.renderProfileTabs();
            PublicProfile.updateStatus();
            if(btn) { btn.innerHTML = originalText; btn.classList.remove('btn-loading'); }
            Utils.toast('Profil sauvegardé !', 'success');
            return true;
        } catch(e) {
            if(btn) { btn.innerHTML = originalText; btn.classList.remove('btn-loading'); }
            Utils.toast('Erreur lors de la sauvegarde', 'error');
            return false;
        }
    },
    
    // Supprime le profil actuel
    // Remet à zéro la casquette affichée (les autres fiches ne sont pas touchées)
    resetCurrentFacet: async () => {
        const profile = PublicProfile.profiles[PublicProfile.currentProfileIndex];
        const facet = PublicProfile.currentFacetTab;
        if(!profile || !facet) { Utils.toast('Aucune carte affichée.', 'info'); return; }
        const label = (PublicProfile.FACET_LABELS[facet] || facet);
        if(!await ConfirmModal.confirmDelete('Tous les champs de la carte ' + label + ' seront effacés. Les autres casquettes ne seront pas touchées.', 'Remettre à zéro cette carte ?')) return;
        const zero = (v) => Array.isArray(v) ? [] : (typeof v === 'boolean' ? false : (v && typeof v === 'object' ? {} : ''));
        // Champs basculés par fiche : on vide la fiche ET les plats affichés
        PublicProfile._facetKeysFor(facet).forEach(k => {
            const z = zero(profile[k]);
            PublicProfile.setFacetField(profile, facet, k, z);
            profile[k] = z;
        });
        // Champs spécifiques à la casquette (stockés à plat)
        const SPEC = {
            actor: ['height','weight','age','eyeColor','hairColor','hairLength','ethnicity','corpulence','sports','sportsWithLevels','actingStyles','galleryPhotos'],
            crew:  ['department','cameras','lenses','lights','sounds','grips','makeups','otherEquipment','crewGalleryPhotos'],
            asso:  ['assoName','assoLogo','assoType','assoSiret','assoYear','assoPresident','assoMembers','assoMission','assoActivities','assoServices','assoFacebook','assoInstagram','assoLinkedin','assoYoutube','assoEmail','assoPhone','assoWebsite','assoDemoreel','assoDemoreels'],
            ent:   ['entName','entLogo','entType','entSiret','entLegal','entYear','entEmployees','entDirector','entContact','entDescription','entServices','entEmail','entPhone','entWebsite','entVimeo','entImdb','entDemoreel','entDemoreels']
        };
        (SPEC[facet] || []).forEach(k => { profile[k] = zero(profile[k]); });
        // Siège (asso / entreprise)
        if((facet === 'asso' || facet === 'ent') && profile.facets && profile.facets[facet]) {
            profile.facets[facet].hqAddress = '';
            profile.facets[facet].hqLatitude = null;
            profile.facets[facet].hqLongitude = null;
        }
        PublicProfile.refreshProfileScreen(profile);
        Utils.toast('Carte ' + label + ' remise à zéro — pensez à Sauvegarder pour confirmer.', 'success', 5000);
    },
    
    // Ancienne fonction save conservée pour compatibilité
    save: async () => {
        await PublicProfile.saveCurrentProfile();
    },

    compressImage: (file, maxSize, quality) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // Redimensionner si nécessaire
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = Math.round(height * maxSize / width);
                            width = maxSize;
                        } else {
                            width = Math.round(width * maxSize / height);
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convertir en JPEG compressé
                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(base64);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    
    // Compresse et retourne un Blob (pour upload Supabase Storage)
    compressImageToBlob: (file, maxSize, quality) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = Math.round(height * maxSize / width);
                            width = maxSize;
                        } else {
                            width = Math.round(width * maxSize / height);
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    
    // v600 : lit le PROFIL et non plus les champs du formulaire supprime.
    updateStatus: () => {
        const p = PublicProfile.profiles[PublicProfile.currentProfileIndex] || {};
        const name = (p.name || '').trim();
        const phone = (p.phone || '').trim();
        const city = (p.city || '').trim();
        const gender = p.gender || '';
        
        const isComplete = name && phone && city && gender;
        const statusDiv = document.getElementById('profile-status');
        if(!statusDiv) return;
        
        if(isComplete) {
            statusDiv.className = 'profile-status complete';
            statusDiv.innerHTML = '✅ Votre profil est complet et visible dans les recherches !';
        } else {
            statusDiv.className = 'profile-status incomplete';
            const missing = [];
            if(!name) missing.push('nom');
            if(!gender) missing.push('sexe');
            if(!phone) missing.push('téléphone');
            if(!city) missing.push('ville');
            statusDiv.innerHTML = `⚠️ Profil incomplet. Champs manquants : ${missing.join(', ')}`;
        }
    },
    // ============================================================
    // ===== LOGIQUE D'ACCÈS (calcul des droits) =====
    // ============================================================
    // Obtenir les permissions d'un membre du projet
    renderInvitesTable: async (members, opts) => {
        const div = document.getElementById('perm-invites-table');
        if(!div) return;
        div.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Chargement…</p>';
        try {
            members = members || [];
            const myEmail = (state.currentUser?.email || '').toLowerCase();
            const actorEmails = new Set((state.data.actors || []).map(a => (a.email || '').toLowerCase()).filter(Boolean));
            const crewEmails = new Set((state.data.crew || []).map(c => (c.email || '').toLowerCase()).filter(Boolean));
            const pure = (members || []).filter(m => {
                const e = (m.email || '').toLowerCase();
                if(!e || m.role === 'owner' || e === myEmail) return false;
                if(actorEmails.has(e) || crewEmails.has(e)) return false;
                return true;
            });
            if(pure.length === 0) {
                div.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Aucun invité. Utilise « Partager » pour inviter une personne.</p>';
                return;
            }
            const profileIds = [...new Set(pure.map(m => m.profile_id).filter(Boolean))];
            const nameById = {};
            if(profileIds.length > 0) {
                const { data: profs, error: errProfs } = await supabase.from('user_profiles').select('id, name').in('id', profileIds);
                if(errProfs) console.warn('[Invites] noms des profils:', errProfs);
                (profs || []).forEach(p => { nameById[p.id] = p.name || ''; });
            }
            const inviteMembers = pure.map(m => ({
                email: m.email,
                name: nameById[m.profile_id] || m.email,
                // v570 : une invitation non acceptee ne donne aucun acces — le dire ici.
                role: (m.status === 'pending')
                    ? '⏳ En attente de réponse'
                    : (m.role === 'editor' ? 'Invité · Éditeur' : 'Invité · Lecture'),
                _rawRole: m.role,
                _pending: (m.status === 'pending'),
                photo: null,
                _memberId: m.id
            }));
            div.innerHTML = Permissions.buildTable(inviteMembers, 'invite', Object.assign({ revoke: true }, opts || {}, {
                accessEmails: (opts && opts.accessEmails) || new Set(inviteMembers.map(m => (m.email || '').toLowerCase()))
            }));
        } catch(e) {
            console.error('renderInvitesTable:', e);
            div.innerHTML = '<p style="color:var(--danger,#dc2626);">Erreur de chargement des invités.</p>';
        }
    },

    // v570 — Cellule « rôle ». Le rôle n'est PLUS choisi : il est DEDUIT des cases de
    // la ligne (au moins une ✏️ = Éditeur) et pousse en base a la sauvegarde. Regler
    // les deux separement permettait de se contredire — 15 ✏️ sur un « lecteur »
    // n'avaient aucun effet, la lecture seule etant testee avant la permission fine.
    _roleCell: (member, type, emailKey) => {
        if(type !== 'invite') {
            return Utils.escape(type === 'actor' ? 'Comédien.ne' : (member.role || 'Technicien'));
        }
        if(member._pending) {
            return '<span title="Tant que la personne n\'a pas accepté, elle n\'a aucun accès">' + Utils.escape(member.role) + '</span>';
        }
        const lab = (member._rawRole === 'editor') ? '✏️ Éditeur' : '👁️ Lecture seule';
        return '<span id="perm-derived-' + emailKey + '" title="Rôle déduit des cases de cette ligne : au moins une ✏️ donne Éditeur.">' + lab + '</span>';
    },

    // v582 — La colonne « Peut inviter » a ete RETIREE (decision de
    // Guillaume, option A) : le droit d'inviter se deduit desormais du
    // crayon sur la colonne Fiche projet (section 'presentation'), teste en
    // direct au clic et en base par la policy INSERT (my_section_level).
    // La colonne project_members.can_invite reste en base, dormante et
    // epinglee a false par la policy, mais plus rien ne la lit.

    revokeAccess: async (email) => {
        if(state.currentRole !== 'owner') { Utils.toast('Seul le propriétaire peut révoquer un accès.', 'error'); return; }
        const ok = await ConfirmModal.show({ title: 'Révoquer cet accès ?', message: `${email} n'aura plus accès à ce projet.`, icon: '🚫', dangerous: true, confirmText: 'Révoquer' });
        if(!ok) return;
        const { error } = await supabase.from('project_members').delete().eq('project_id', state.currentProjectId).eq('email', email);
        if(error) { console.error(error); Utils.toast('Erreur lors de la révocation.', 'error'); return; }
        if(typeof History !== 'undefined' && History.log) History.log('SHARE', 'Accès révoqué : ' + email);
        Utils.toast(`${email} n'a plus accès au projet.`, 'success');
        Permissions.renderTables();
    },

    // v570 — PRESETS DE ROLE. Le tableau devient le SEUL reglage : on remplit une
    // ligne d'un coup, et le role en base (project_members.role) se DEDUIT ensuite
    // des cases (voir _deriveRole). Avant, role et cases se reglaient separement et
    // pouvaient se contredire — cocher 15 ✏️ sur un « lecteur » n'avait aucun effet.
    // v570 — Carte ONGLET -> SECTION de permission, centralisee ici. Elle existait en
    // trois exemplaires recopies dans le fichier (switchTab, Tutorial...) ; celle-ci
    // fait desormais reference pour la visibilite et les verrous.
    SECTION_BY_TAB: {
        'presentation': 'presentation', 'synopsis': 'synopsis', 'board': 'sequencier',
        'titlepage': 'scenario', 'script': 'scenario', 'storyboard': 'storyboard',
        'moodboard': 'moodboard', 'chars': 'personnages', 'locs': 'lieux',
        'actors': 'comediens', 'resources': 'ressources', 'crew': 'equipe', 'orgs': 'equipe',
        'breakdown': 'depouillement', 'scriptreport': 'scriptreport',
        'stats': 'stats', 'planning': 'planning',
        'expenses': 'depenses', 'contracts': 'contrats',
        // Saisons et Episodes structurent les scenes : ils suivent le Sequencier
        // plutot que d'occuper deux colonnes inutiles sur un projet film.
        'seasons': 'sequencier', 'episodes': 'sequencier'
    },

    sectionOf: (tabName) => Permissions.SECTION_BY_TAB[tabName] || null,

    // TROIS NIVEAUX, decides le 23 aout :
    //   ❌  l'onglet N'APPARAIT PAS dans sa navigation (et pas seulement « bloque au clic ») ;
    //   👁️  l'onglet apparait, consultable, et NE POSE AUCUN VERROU — regarder ne gene personne ;
    //   ✏️  l'onglet apparait, modifiable, et pose un verrou.
    // Un onglet sans section connue (moodboard, episodes, contracts...) reste visible :
    // ne jamais faire disparaitre un onglet par simple absence de la carte ci-dessus.
    tabVisible: (tabName) => {
        if(state.currentRole === 'owner') return true;
        const sec = Permissions.sectionOf(tabName);
        if(!sec) return true;
        return Permissions.canAccess(sec);
    },

    // Cet onglet me donne-t-il le droit d'ecrire (donc de poser un verrou) ?
    tabWritable: (tabName) => {
        if(state.currentRole === 'owner') return true;
        if(state.currentRole === 'viewer') return false;
        const sec = Permissions.sectionOf(tabName);
        if(!sec) return true;
        return Permissions.canEdit(sec);
    },

    // v570 — Verrouille VISUELLEMENT l'onglet actif quand il n'est qu'en lecture (👁️).
    // Sans cela les champs restaient cliquables et modifiables : rien n'etait
    // enregistre, mais on pouvait saisir n'importe quoi et en faire une capture.
    applyReadOnlyUI: () => {
        try {
            const active = document.querySelector('.tab-content.active');
            if(!active) return;
            const tabName = active.id.replace('tab-', '');
            const ro = !Permissions.tabWritable(tabName);
            const dejaPose = active.classList.contains('is-perm-readonly');
            const banniere = active.querySelector('.perm-ro-banner');
            // Appelee aussi au battement : ne rien remuer si l'etat n'a pas bouge.
            if(ro === dejaPose && !!banniere === ro) return;
            if(banniere) banniere.remove();
            active.classList.toggle('is-perm-readonly', ro);
            if(ro) {
                const b = document.createElement('div');
                b.className = 'perm-ro-banner';
                b.textContent = '👁 Lecture seule — vous n\'avez pas les droits de modification sur cet onglet.';
                active.prepend(b);
            }
        } catch(e) { console.warn('[Permissions] applyReadOnlyUI:', e && e.message); }
    },

    // v570 — Prise en compte SANS RECHARGEMENT d'un changement d'accès. Le rôle et le
    // droit d'inviter ne vivent pas dans le projet mais dans project_members : ils ne
    // remontent donc pas par la synchro temps réel du projet, il faut les relire.
    // Appelée après chaque mise à jour distante du projet et par le battement des verrous.
    _liveBusy: false,
    refreshLive: async () => {
        if(Permissions._liveBusy || !state.currentProjectId || !state.currentUser) return;
        if(state.currentRole === 'owner') { Permissions.applyReadOnlyUI(); return; }
        Permissions._liveBusy = true;
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('role')
                .eq('project_id', state.currentProjectId)
                .eq('email', state.currentUser.email.toLowerCase())
                .eq('status', 'accepted');
            if(error) console.warn('[Permissions] refreshLive:', error);
            if(data && data.length) {
                const roleOrder = { owner: 3, editor: 2, viewer: 1 };
                const best = data.slice().sort((a, b) => (roleOrder[b.role] || 0) - (roleOrder[a.role] || 0))[0];
                if(best.role && best.role !== state.currentRole) {
                    state.currentRole = best.role;
                    Utils.toast('Vos droits sur ce projet viennent de changer.', 'info', 5000);
                }
                // v582 : plus de drapeau can_invite a relire, le droit
                // d'inviter suit la fiche projet (voir openShareModal).
            }
        } catch(e) { console.warn('[Permissions] refreshLive:', e && e.message); }
        Permissions._liveBusy = false;
        Permissions.applyAccessUI();
    },

    // Reconstruit la navigation selon les accès courants, et évacue l'onglet ouvert
    // s'il vient d'être fermé (sinon on resterait sur un contenu devenu interdit).
    applyAccessUI: () => {
        try { UIHidden.applyHiddenTabs(); } catch(e) {}
        try { UIHidden.applyHiddenCategories(); } catch(e) {}
        const active = document.querySelector('.tab-content.active');
        const tabName = active ? active.id.replace('tab-', '') : null;
        if(tabName && !Permissions.tabVisible(tabName)) {
            const cats = (typeof UI !== 'undefined' && UI.categoryTabs) || {};
            let cible = null;
            for(const c in cats) {
                const t = cats[c].find(x => Permissions.tabVisible(x) && !(UI.hiddenTabs || []).includes(x)
                    && (state.currentProjectType === 'series' || (x !== 'episodes' && x !== 'seasons')));
                if(t) { cible = t; break; }
            }
            Utils.toast('Cet onglet ne vous est plus accessible.', 'warning', 5000);
            if(cible) UI.switchTab(cible);
            return;
        }
        Permissions.applyReadOnlyUI();
        // Ne re-declencher la logique de verrou que si le droit d'ecrire a REELLEMENT
        // change : cette fonction tourne aussi au battement (toutes les minutes), et
        // rappeler onTabEnter a vide relacherait puis reprendrait le verrou pour rien.
        try {
            if(typeof LockManager !== 'undefined' && tabName
               && LockManager.currentEditable !== Permissions.tabWritable(tabName)) {
                LockManager.onTabEnter(tabName);
            }
        } catch(e) {}
    },

    _emailByKey: {},

    ROLE_PRESETS: {
        '__viewer': { label: 'Lecteur (tout en lecture)',        mode: 'read' },
        '__editor': { label: 'Éditeur (tout en modification)',   mode: 'write' },
        '__guest':  { label: 'Invité restreint (fiche projet seule)', mode: 'guest' }
    },

    _rolePresetPerms: (mode) => {
        const out = {};
        CONFIG.permissionSections.forEach(s => {
            if(mode === 'read') out[s.id] = 'read';
            else if(mode === 'write') out[s.id] = (s.id === 'stats') ? 'read' : 'write';
            else out[s.id] = (s.id === 'presentation') ? 'read' : 'none';
        });
        return out;
    },

    // Une section absente des permissions enregistrees vaut LECTURE, jamais blocage :
    // sans cela, ajouter une section au tableau la rendrait inaccessible a tous les
    // membres deja enregistres (c'est ce qui est arrive a 'presentation' et
    // 'ressources', citees par switchTab mais jamais definies).
    _normalize: (perms) => {
        const out = Object.assign({}, perms || {});
        CONFIG.permissionSections.forEach(s => { if(!out[s.id]) out[s.id] = 'read'; });
        return out;
    },

    // Le role decoule des cases : au moins une modification -> editeur, sinon lecteur.
    _deriveRole: (perms) => {
        return CONFIG.permissionSections.some(s => (perms || {})[s.id] === 'write') ? 'editor' : 'viewer';
    },

    getForMember: (member, type) => {
        // type = 'actor' ou 'crew'
        if(type === 'actor') {
            return CONFIG.defaultPermissions['comedien'];
        }
        
        // Pour les techniciens, chercher par rôle
        const role = member.role || '';
        
        // Chercher une correspondance exacte
        if(CONFIG.defaultPermissions[role]) {
            return CONFIG.defaultPermissions[role];
        }
        
        // Vérifier si c'est un chef de poste (contient "Chef" ou "Directeur")
        if(role.includes('Chef') || role.includes('Directeur') || role.includes('Réalisateur')) {
            return CONFIG.defaultPermissions['chef_de_poste'];
        }
        
        // Par défaut, technicien standard
        return CONFIG.defaultPermissions['technicien'];
    },
    
    // Obtenir les permissions actuelles d'un utilisateur sur le projet
    getCurrentUserPermissions: () => {
        if(state.currentRole === 'owner') {
            return CONFIG.defaultPermissions['owner'];
        }
        
        // Chercher l'utilisateur dans les membres du projet
        const userEmail = state.currentUser?.email;
        if(!userEmail) return CONFIG.defaultPermissions['technicien'];
        
        // Vérifier dans les permissions personnalisées du projet
        if(state.data?.memberPermissions?.[Utils.sanitizeEmail(userEmail)]) {
            return Permissions._normalize(state.data.memberPermissions[Utils.sanitizeEmail(userEmail)]);
        }
        
        // Chercher dans les comédiens
        const actor = state.data?.actors?.find(a => a.email === userEmail);
        if(actor) return Permissions._normalize(Permissions.getForMember(actor, 'actor'));
        
        // Chercher dans l'équipe
        const crew = state.data?.crew?.find(c => c.email === userEmail);
        if(crew) return Permissions._normalize(Permissions.getForMember(crew, 'crew'));
        
        // Par défaut selon le rôle ACL
        if(state.currentRole === 'editor') {
            return Permissions._normalize(CONFIG.defaultPermissions['chef_de_poste']);
        }
        
        return CONFIG.defaultPermissions['technicien'];
    },
    
    // v578 (cloisonnement) — LE SERVEUR FAIT FOI.
    // A l'ouverture du projet, la base renvoie sa propre carte des droits
    // (state.dataScope). Quand elle est la, on la croit ELLE et non plus le
    // calcul local : c'est la meme fonction SQL qui a decide quelles cles
    // envoyer. Sans cela le navigateur pourrait s'accorder un acces que le
    // serveur a refuse, et afficher un onglet vide en guise d'explication.
    // Repli sur le calcul local tant que dataScope n'existe pas (tableau de
    // bord, projet pas encore ouvert).
    serverLevel: (section) => {
        const sc = state.dataScope;
        if(!sc || !section) return null;
        return sc[section] || null;
    },

    // Vérifier si l'utilisateur peut accéder à une section
    canAccess: (section) => {
        if(state.currentRole === 'owner') return true;
        const lvl = Permissions.serverLevel(section);
        if(lvl) return lvl !== 'none';
        const perms = Permissions.getCurrentUserPermissions();
        return perms[section] && perms[section] !== 'none';
    },
    
    // Vérifier si l'utilisateur peut modifier une section
    canEdit: (section) => {
        if(state.currentRole === 'owner') return true;
        const lvl = Permissions.serverLevel(section);
        if(lvl) return lvl === 'write';
        const perms = Permissions.getCurrentUserPermissions();
        return perms[section] === 'write';
    },
    
    // ============================================================
    // ===== DROITS PAR FAMILLE DE FICHE (26 aout) =====
    // ============================================================
    // UNE FICHE APPARTIENT A SON ONGLET D'ORIGINE, OU QU'ON L'OUVRE.
    // Le depouillement, la toile et la feuille de service sont des CHEMINS vers
    // elle, pas des proprietaires : ils ne changent pas ses droits. Le droit a
    // appliquer est toujours celui de sa section d'origine — « comediens » pour
    // un comedien, meme quand on arrive du depouillement.
    // Avant cette table, une seule fenetre sur sept consultait le droit de sa
    // section (celle des techniciens) ; les six autres ne regardaient que le
    // role global. Un collaborateur en lecture seule sur Comediens pouvait donc
    // ouvrir la fiche depuis le depouillement et y ecrire pour de bon.
    FICHE_SECTION: {
        character: 'personnages', actor: 'comediens', crew: 'equipe',
        location: 'lieux', resource: 'ressources', org: 'equipe',
        vehicle: 'equipe', scene: 'sequencier', day: 'planning',
        expense: 'depenses', shot: 'storyboard'
    },
    sectionOfFiche: (kind) => Permissions.FICHE_SECTION[kind] || null,
    // Ai-je le droit de VOIR cette fiche ?
    canOpenFiche: (kind) => {
        if(state.currentRole === 'owner') return true;
        const s = Permissions.sectionOfFiche(kind);
        if(!s) return true;
        return Permissions.canAccess(s);
    },
    // Ai-je le droit d'y ECRIRE ? Verifie a l'ouverture (pour griser les champs)
    // ET dans les fonctions d'enregistrement : un champ grise n'est qu'un
    // affichage, tant que l'ecriture ne verifie rien le droit n'existe pas.
    canEditFiche: (kind) => {
        if(state.currentRole === 'owner') return true;
        if(state.currentRole === 'viewer') return false;
        const s = Permissions.sectionOfFiche(kind);
        if(!s) return true;
        return Permissions.canEdit(s);
    },

    // ============================================================
    // ===== MODALE & UI DE GESTION DES PERMISSIONS =====
    // ============================================================
    // Ouvrir le modal de gestion des permissions
    openModal: () => {
        if(state.currentRole !== 'owner') {
            Utils.toast('Seul le propriétaire peut gérer les accès.', 'error');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'permissions-modal';
        modal.id = 'permissions-modal';
        modal.onclick = (e) => { if(e.target === modal) Permissions.closeModal(); };
        
        modal.innerHTML = `
            <div class="permissions-container">
                <div class="permissions-header">
                    <h2>🔐 Gérer les accès au projet</h2>
                    <button onclick="app.Permissions.closeModal()" class="icon-btn">✖</button>
                </div>
                <div class="permissions-body">
                    <p class="text-sec-mb20">
                        Définissez les permissions pour chaque membre du projet. Les permissions par défaut sont basées sur le rôle de chacun.
                    </p>
                    
                    <div class="perm-tabs" style="display:flex; gap:4px; border-bottom:1px solid var(--border); margin-bottom:16px;">
                        <button id="perm-tabbtn-actors" onclick="app.Permissions.switchTab('actors')" style="padding:10px 16px; background:none; border:none; border-bottom:3px solid var(--primary); color:var(--text-main); font-weight:600; cursor:pointer; font-size:0.95rem;">🎭 Comédien·nes</button>
                        <button id="perm-tabbtn-crew" onclick="app.Permissions.switchTab('crew')" style="padding:10px 16px; background:none; border:none; border-bottom:3px solid transparent; color:var(--text-sec); font-weight:400; cursor:pointer; font-size:0.95rem;">🎥 Équipe technique</button>
                        <button id="perm-tabbtn-invites" onclick="app.Permissions.switchTab('invites')" style="padding:10px 16px; background:none; border:none; border-bottom:3px solid transparent; color:var(--text-sec); font-weight:400; cursor:pointer; font-size:0.95rem;">📨 Invités</button>
                    </div>

                    <div class="perm-tab-pane" id="perm-tab-actors">
                        <div id="perm-actors-table"></div>
                    </div>
                    
                    <div class="perm-tab-pane" id="perm-tab-crew" style="display:none;">
                        <div id="perm-crew-table"></div>
                    </div>

                    <div class="perm-tab-pane" id="perm-tab-invites" style="display:none;">
                        <div id="perm-invites-table"><p style="color:var(--text-sec); font-style:italic;">(Liste des invités — à venir)</p></div>
                    </div>
                    
                    <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px;">
                        <button onclick="app.Permissions.closeModal()" style="padding:10px 20px; background:var(--bg); border:1px solid var(--border); border-radius:6px; cursor:pointer;">Fermer</button>
                        <button onclick="app.Permissions.saveAll()" style="padding:10px 20px; background:var(--success); color:white; border:none; border-radius:6px; cursor:pointer;">💾 Sauvegarder</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        Permissions.renderTables();
    },
    
    closeModal: () => {
        const modal = document.getElementById('permissions-modal');
        if(modal) modal.remove();
    },

    switchTab: (tab) => {
        ['actors','crew','invites'].forEach(t => {
            const pane = document.getElementById('perm-tab-' + t);
            if(pane) pane.style.display = (t === tab) ? '' : 'none';
            const btn = document.getElementById('perm-tabbtn-' + t);
            if(btn) {
                const active = (t === tab);
                btn.style.borderBottom = active ? '3px solid var(--primary)' : '3px solid transparent';
                btn.style.color = active ? 'var(--text-main)' : 'var(--text-sec)';
                btn.style.fontWeight = active ? '600' : '400';
            }
        });
    },
    
    renderTables: async () => {
        let _members = [];
        try {
            const { data, error } = await supabase.from('project_members').select('id, email, profile_id, role, status').eq('project_id', state.currentProjectId);
            if(error) console.error('renderTables members:', error);
            _members = data || [];
        } catch(e) { console.error('renderTables members:', e); }
        const _accessEmails = new Set(_members.map(m => (m.email || '').toLowerCase()).filter(Boolean));
        const _ownerEmails = new Set(_members.filter(m => m.role === 'owner').map(m => (m.email || '').toLowerCase()));
        const _pendingEmails = new Set(_members.filter(m => m.status === 'pending').map(m => (m.email || '').toLowerCase()));
        const _opts = { revoke: true, accessEmails: _accessEmails,
                        ownerEmails: _ownerEmails, pendingEmails: _pendingEmails };

        // Table des comédiens
        const actorsDiv = document.getElementById('perm-actors-table');
        if(actorsDiv) {
            if(!state.data.actors || state.data.actors.length === 0) {
                actorsDiv.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Aucun comédien dans le projet</p>';
            } else {
                actorsDiv.innerHTML = Permissions.buildTable(state.data.actors, 'actor', _opts);
            }
        }
        
        // Table de l'équipe
        const crewDiv = document.getElementById('perm-crew-table');
        if(crewDiv) {
            if(!state.data.crew || state.data.crew.length === 0) {
                crewDiv.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Aucun technicien dans le projet</p>';
            } else {
                crewDiv.innerHTML = Permissions.buildTable(state.data.crew, 'crew', _opts);
            }
        }

        // Table des invités (asynchrone : project_members)
        Permissions.renderInvitesTable(_members, _opts);
    },
    
    buildTable: (members, type, options = {}) => {
        const sections = CONFIG.permissionSections;
        
        let html = `<div style="overflow-x:auto; padding-top: 10px;"><table class="permissions-table">
            <thead>
                <tr>
                    <th style="min-width:180px; height: 140px; vertical-align: bottom;">Membre</th>
                    <th style="height: 140px; vertical-align: bottom;">Preset</th>
                    ${sections.map(s => {
                        // Sépare l'emoji initial du texte (si label commence par un emoji)
                        const label = s.label || '';
                        const match = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\S+)\s+(.+)$/u);
                        const emoji = match ? match[1] : '';
                        const text = match ? match[2] : label;
                        return `<th class="rotated-header" title="${Utils.escape(label)}">
                            <span class="rotated-header-inner">
                                ${Utils.escape(text)}
                            </span>
                        </th>`;
                    }).join('')}

                    ${options.revoke ? '<th style="height:140px; vertical-align:bottom;">Action</th>' : ''}
                </tr>
            </thead>
            <tbody>`;
        
        members.forEach((member, idx) => {
            const emailKey = member.email ? Utils.sanitizeEmail(member.email) : `${type}_${idx}`;
            // v570 : la cle est une adresse assainie ; on garde l'adresse reelle pour
            // pouvoir ecrire le role deduit dans project_members a la sauvegarde.
            if(member.email) Permissions._emailByKey[emailKey] = member.email;
            const currentPerms = state.data.memberPermissions?.[emailKey] || Permissions.getForMember(member, type);
            const photoHTML = member.photo ? `<img src="${member.photo}" alt="Photo du membre de l'équipe">` : '👤';
            // v570 : le libellé du rôle passe par Permissions._roleCell (sélecteur pour les invités).
            
            html += `<tr>
                <td>
                    <div class="permissions-user-info">
                        <div class="permissions-user-photo">${photoHTML}</div>
                        <div>
                            <div class="permissions-user-name">${Utils.escape(member.name)}</div>
                            <div class="permissions-user-role">${Permissions._roleCell(member, type, emailKey)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <select class="perm-select" onchange="app.Permissions.applyPreset('${emailKey}', '${type}', ${idx}, this.value)">
                        <option value="">Personnalisé</option>
                        <option value="__viewer">👁️ Lecteur (tout)</option>
                        <option value="__editor">✏️ Éditeur (tout)</option>
                        <option value="__guest">🚪 Invité restreint</option>
                        <option value="comedien" ${type === 'actor' ? 'selected' : ''}>Comédien</option>
                        <option value="technicien">Technicien</option>
                        <option value="chef_de_poste">Chef de poste</option>
                        <option value="Scripte">Scripte</option>
                        <option value="1er·ère assistant·e réalisateur·rice">1er Assistant Réal</option>
                        <option value="Directeur·rice de casting">Dir. Casting</option>
                        <option value="Réalisateur·rice">Réalisateur</option>
                        <option value="Producteur·rice">Producteur</option>
                    </select>
                </td>
                ${sections.map(s => `
                    <td class="rotated-cell">
                        <select class="perm-select" id="perm-${emailKey}-${s.id}" data-email="${emailKey}" data-section="${s.id}" title="${Utils.escape(s.label)}" onchange="app.Permissions._refreshDerived('${emailKey}')">
                            <option value="none" ${currentPerms[s.id] === 'none' ? 'selected' : ''}>❌</option>
                            <option value="read" ${currentPerms[s.id] === 'read' ? 'selected' : ''}>👁️</option>
                            <option value="write" ${currentPerms[s.id] === 'write' ? 'selected' : ''}>✏️</option>
                        </select>
                    </td>
                `).join('')}

                ${options.revoke ? `<td style="text-align:center; vertical-align:middle;">${ (member.email && options.accessEmails && options.accessEmails.has((member.email || '').toLowerCase()) && (member.email || '').toLowerCase() !== (state.currentUser?.email || '').toLowerCase()) ? `<button onclick="app.Permissions.revokeAccess('${Utils.escape(member.email)}')" style="padding:4px 10px; background:var(--danger,#dc2626); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">Révoquer</button>` : '' }</td>` : ''}
            </tr>`;
        });
        
        html += '</tbody></table></div>';
        
        // Légende
        html += `<div style="margin-top:10px; font-size:0.8rem; color:var(--text-sec);">
            <span style="margin-right:15px;">❌ Aucun accès</span>
            <span style="margin-right:15px;">👁️ Lecture seule</span>
            <span style="margin-right:15px;">✏️ Modification</span>
            <span style="margin-right:15px;">Le rôle se déduit de la ligne : au moins une ✏️ = Éditeur, sinon Lecture seule.</span>

        </div>`;
        
        return html;
    },
    
    applyPreset: (emailKey, type, idx, preset) => {
        if(!preset) return;
        
        // v570 : les trois presets de role remplissent la ligne entiere.
        const rp = Permissions.ROLE_PRESETS[preset];
        const perms = rp ? Permissions._rolePresetPerms(rp.mode) : CONFIG.defaultPermissions[preset];
        if(!perms) return;
        
        CONFIG.permissionSections.forEach(s => {
            const select = document.getElementById(`perm-${emailKey}-${s.id}`);
            if(select) {
                select.value = perms[s.id] || 'none';
            }
        });
        Permissions._refreshDerived(emailKey);
    },

    // Met a jour l'etiquette de role deduite d'une ligne, sans attendre la sauvegarde.
    _refreshDerived: (emailKey) => {
        const cell = document.getElementById('perm-derived-' + emailKey);
        if(!cell) return;
        const perms = {};
        CONFIG.permissionSections.forEach(s => {
            const sel = document.getElementById(`perm-${emailKey}-${s.id}`);
            if(sel) perms[s.id] = sel.value;
        });
        const r = Permissions._deriveRole(perms);
        cell.textContent = (r === 'editor') ? '✏️ Éditeur' : '👁️ Lecture seule';
        cell.title = 'Rôle déduit des cases de cette ligne : au moins une ✏️ donne Éditeur.';
    },
    
    saveAll: async () => {
        if(!state.data.memberPermissions) {
            state.data.memberPermissions = {};
        }
        
        // Récupérer toutes les permissions depuis les selects
        const allSelects = document.querySelectorAll('.permissions-table select[data-email]');
        const permsByEmail = {};
        
        allSelects.forEach(select => {
            const email = select.dataset.email;
            const section = select.dataset.section;
            if(!permsByEmail[email]) permsByEmail[email] = {};
            permsByEmail[email][section] = select.value;
        });
        
        // Ajouter les permissions de chat par défaut
        Object.keys(permsByEmail).forEach(email => {
            permsByEmail[email].chat_general = 'write';
            permsByEmail[email].chat_chefs = permsByEmail[email].scenario === 'write' ? 'write' : 'none';
            permsByEmail[email].chat_technique = permsByEmail[email].depouillement !== 'none' ? 'write' : 'none';
            permsByEmail[email].chat_comediens = permsByEmail[email].comediens !== 'none' ? 'write' : 'none';
        });
        
        state.data.memberPermissions = permsByEmail;
        
        // v570 — LE ROLE SE DEDUIT DES CASES. Au moins une ✏️ = editeur en base, sinon
        // lecteur. C'est ce qui rend les deux reglages impossibles a contredire : plus
        // besoin de penser au role, il suit. Ne concerne que les vrais membres du projet.
        let rolesChanges = 0;
        try {
            const { data: membres, error: errMembres } = await supabase
                .from('project_members')
                .select('id, email, role')
                .eq('project_id', state.currentProjectId);
            if(errMembres) console.warn('[Permissions] déduction du rôle:', errMembres);
            for(const m of (membres || [])) {
                if(m.role === 'owner') continue;
                const key = Utils.sanitizeEmail(m.email || '');
                const p = permsByEmail[key];
                if(!p) continue; // personne sans ligne dans le tableau : on ne touche a rien
                const voulu = Permissions._deriveRole(p);
                if(voulu === m.role) continue;
                const { error } = await supabase.from('project_members').update({ role: voulu }).eq('id', m.id);
                if(!error) rolesChanges++;
            }
        } catch(e) { console.warn('[Permissions] mise à jour des rôles:', e && e.message); }
        
        try {
            await Store.save();
            // v570 : les ❌ font disparaitre des onglets — reconstruire la navigation
            // pour que le proprietaire voie l'effet, et surtout pour l'auto-attribution.
            try { UIHidden.applyHiddenTabs(); UIHidden.applyHiddenCategories(); } catch(e) {}
            const memberCount = Object.keys(permsByEmail).length;
            History.log('PERMISSIONS', `Permissions modifiées pour ${memberCount} membre${memberCount > 1 ? 's' : ''}`);
            Utils.toast('Permissions sauvegardées !' + (rolesChanges > 0
                ? ' ' + rolesChanges + ' rôle(s) mis à jour — les personnes concernées doivent rouvrir le projet.'
                : ''), 'success', rolesChanges > 0 ? 7000 : 3000);
            Permissions.closeModal();
        } catch(e) {
            console.error('Erreur sauvegarde permissions:', e);
            Utils.toast('Erreur lors de la sauvegarde', 'error');
        }
    },
    
    };

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
    
    // Ouvre la recherche comedien PRE-REMPLIE depuis la physique d'un personnage
    // (memes valeurs d'options des deux cotes) pour trouver des comediens ressemblants.
    openForCharacter: async (charIdx) => {
        const c = state.data.characters && state.data.characters[charIdx];
        if(!c) return;
        const uv = document.getElementById('universe-view');
        if(!uv || typeof WindowManager === 'undefined') return;
        // Personnage d'ou part le casting : sert au « Ajouter a l'idee » sur les
        // profils trouves (ajout a SA planche d'idees). Efface a la fermeture.
        GlobalSearch._castingCharId = c.id;
        // On n'ouvre PAS l'Univers en plein ecran : on charge ses profils puis on
        // DEPLACE sa carte dans une FENETRE flottante (systeme WindowManager,
        // comme un sous-onglet detache), sans quitter le projet — elle est remise
        // a sa place a la fermeture. Vue CARTE, filtres pre-remplis avec la
        // physique du personnage.
        if(!(Universe.allProfiles && Universe.allProfiles.length) && Universe.loadAllProfiles) {
            await Universe.loadAllProfiles();
        }
        const origParent = uv.parentNode, origNext = uv.nextSibling;
        WindowManager.open('universe-casting', '🎭 Casting — chercher un comédien', uv, {
            w: 960, h: 640,
            onClose: () => {
                if(origParent) origParent.insertBefore(uv, origNext);
                uv.style.display = 'none';
                GlobalSearch._castingCharId = null;
                if(Universe.setViewMode) Universe.setViewMode('map');
            }
        });
        uv.style.display = 'flex';
        // Pre-remplir les filtres comedien AVANT tout rendu, pour etre sur que les
        // valeurs prennent (les champs sont statiques dans la colonne de gauche).
        const typeSel = document.getElementById('universe-type');
        if(typeSel) typeSel.value = 'actor';
        const set = (id, v) => { const el = document.getElementById(id); if(el) el.value = (v == null ? '' : v); };
        set('universe-actor-gender', c.gender);
        set('universe-actor-eyes', c.eyeColor);
        set('universe-actor-hair', c.hairColor);
        set('universe-actor-hair-length', c.hairLength);
        set('universe-actor-corpulence', c.corpulence);
        set('universe-actor-ethnicity', c.ethnicity);
        set('universe-actor-sports', c.sports);
        set('universe-actor-languages', c.languages);
        const h = parseInt(c.height, 10);
        if(h > 0) { set('universe-actor-height-min', String(h - 5)); set('universe-actor-height-max', String(h + 5)); }
        const am = String(c.storyAge || '').match(/\d{1,3}/);
        if(am) { const a = parseInt(am[0], 10); set('universe-actor-age-min', String(Math.max(0, a - 3))); set('universe-actor-age-max', String(a + 3)); }
        // Vue CARTE dans la fenetre : init Leaflet, on revele le bloc de filtres
        // comedien (onTypeChange), puis recherche -> marqueurs filtres sur la carte.
        if(Universe.setViewMode) await Universe.setViewMode('map');
        if(Universe.onTypeChange) Universe.onTypeChange();
        if(typeof UniverseSearch !== 'undefined' && UniverseSearch.search) UniverseSearch.search();
        // La fenetre vient d'apparaitre : Leaflet doit recalculer sa taille.
        setTimeout(() => { try { if(Universe.map) Universe.map.invalidateSize(); } catch(_) {} }, 150);
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
                <input type="text" class="global-search-input min-w-200" id="gs-equipment" placeholder="🔧 Matériel (stabilisateur, drone...)" data-tooltip="🔧 Matériel (stabilisateur, drone...)" oninput="app.GlobalSearch.search()">
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
                    results = results.filter(r => {
                        const allEquip = [...(r.cameras || []), ...(r.lenses || []), ...(r.otherEquipment || [])].join(' ').toLowerCase();
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
                ${person.otherEquipment && person.otherEquipment.length > 0 ? `<p><strong>Autre matériel:</strong> ${Utils.escape(person.otherEquipment.join(', '))}</p>` : ''}
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
  