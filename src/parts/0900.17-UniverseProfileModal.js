
const UniverseProfileModal = {
    // Vérifie si une section est visible selon le contexte (public ou projet)
    isSectionVisible: (profile, section, context = 'public') => {
        // Un seul interrupteur de visibilité par carte (👁 par casquette) : les masquages par section sont retirés
        return true;
    },
    
    // Pager de casquettes : feuilleter les facettes d'un même profil dans la modale
    _pagerProfile: null,
    _pagerFacet: null,
    _tmpHqMarker: null,
    _clearHqMarker: () => {
        if(UniverseProfileModal._tmpHqMarker && Universe.map) {
            try { Universe.map.removeLayer(UniverseProfileModal._tmpHqMarker); } catch(e) {}
        }
        UniverseProfileModal._tmpHqMarker = null;
    },
    switchFacet: (dir) => {
        const p = UniverseProfileModal._pagerProfile;
        if(!p) return;
        const vf = p.visibleFacets || [];
        if(vf.length < 2) return;
        const i = Math.max(0, vf.indexOf(UniverseProfileModal._pagerFacet));
        const next = vf[(i + dir + vf.length) % vf.length];
        UniverseProfileModal.openProfileModal(p, next);
    },

    // 3b — Rend un profil comedien/technicien dans le MEME moteur que la fiche
    // de projet (lecture seule), et retire l'onglet « Dans le projet » (sans
    // objet pour un profil public). asso / entreprise / projet gardent l'affichage
    // classique (sections fixes du modal).
    _renderFicheInModal: (fullProfile, cur) => {
        const host = document.getElementById('pm-fiche');
        const body = host ? host.parentElement : null;
        if(!host || !body) return false;
        const curKind = PublicProfile._facetKind(cur);
        if(curKind !== 'actor' && curKind !== 'crew') { host.innerHTML = ''; body.classList.remove('pm-mode-fiche'); return false; }
        host.innerHTML = '';
        PublicProfile._publicView = true;
        let card = null;
        try {
            if(curKind === 'actor') {
                const temp = document.createElement('div');
                UI.renderDataCards([fullProfile], 'actors', temp, [], true);
                card = temp.firstElementChild;
            } else {
                card = UI.createCrewCard(fullProfile, -1, [], true);
            }
        } catch(e) { console.warn('Fiche Univers:', e); }
        PublicProfile._publicView = false;
        if(!card) { body.classList.remove('pm-mode-fiche'); return false; }
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
        host.appendChild(card);
        body.classList.add('pm-mode-fiche');
        return true;
    },

    openProfileModal: async (profile, facetView) => {
        // Casquette affichée : celle demandée par le pager, sinon la première visible
        const vf = profile.visibleFacets || (PublicProfile._typeToFacet(profile.type) ? [PublicProfile._typeToFacet(profile.type)] : []);
        const cur = (facetView && vf.includes(facetView)) ? facetView : (vf[0] || null);
        UniverseProfileModal._pagerProfile = profile;
        UniverseProfileModal._pagerFacet = cur;
        const curKind = PublicProfile._facetKind(cur);
        const isProject = profile.type === 'project';
        const isActor = curKind === 'actor';
        const isCrew = curKind === 'crew';
        const isAssociation = curKind === 'asso';
        const isEnterprise = curKind === 'ent';
        // Charger les données complètes depuis Supabase si nécessaire
        let fullProfile = profile;
        if(!isProject) {
            try {
                const { data: profileData, error: errPd2 } = await Utils.profils({ ids: [profile.id] }).then(r => ({ data: r.data[0] || null, error: r.error }));
                if(errPd2) { console.warn('[PublicProfile] chargement profil:', errPd2); Utils.toast('Certaines informations du profil n\u2019ont pas pu être chargées.', 'warning'); }
                
                if(profileData) {
                    // Extraire les données du champ JSONB
                    const extraData = profileData.data || {};
                    fullProfile = { 
                        ...profileData, 
                        ...extraData,
                        id: profile.id, 
                        type: profileData.profile_type || profile.type,
                        hasVehicle: profileData.vehicle || false,
                        availabilityText: profileData.availability || ''
                    };
                }
            } catch(e) { console.warn('Erreur chargement profil:', e); }
        }
        
        // Fiche affichée : ses champs priment sur les anciens champs plats
        if(!isProject && (curKind === 'actor' || curKind === 'crew')) {
            const fAll = PublicProfile._normalizeFacets((fullProfile.data || {}).facets || fullProfile.facets, fullProfile);
            const ff = PublicProfile.facetByKey(fAll, cur);
            PublicProfile.FACET_SWAP_KEYS.forEach(k => { if(ff[k] !== undefined && ff[k] !== null) fullProfile[k] = ff[k]; });
            if(ff.collabType !== undefined && ff.collabType !== null) fullProfile.collabType = ff.collabType; // mode de collaboration : visible sur le profil public
            fullProfile.facets = fAll;
        }
        
        Universe.currentProfile = fullProfile;
        UniverseProfileModal._renderFicheInModal(fullProfile, cur);
        
        // Photo
        const photoEl = document.getElementById('pm-photo');
        const photo = fullProfile.photo || fullProfile.photoURL || fullProfile.mainPhoto || fullProfile.poster || null;
        let defaultIcon = '👤';
        if(isProject) defaultIcon = '🎬';
        else if(isActor) defaultIcon = '🎭';
        else if(isCrew) defaultIcon = '🎥';
        else if(isAssociation) defaultIcon = '🏛️';
        else if(isEnterprise) defaultIcon = '🏢';
        
        // Logo de la structure (asso / entreprise) : prioritaire sur l'icône
        const extraD = fullProfile.data || {};
        const structLogo = isAssociation ? (fullProfile.assoLogo || extraD.assoLogo || '')
                          : (isEnterprise ? (fullProfile.entLogo || extraD.entLogo || '') : '');
        if(structLogo) {
            photoEl.innerHTML = `<img src="${Utils.safeMediaUrl(structLogo)}" alt="Logo" onerror="this.parentElement.innerHTML='${defaultIcon}'">`;
        } else if(photo && !isAssociation && !isEnterprise) {
            photoEl.innerHTML = `<img src="${Utils.safeMediaUrl(photo)}" alt="${Utils.escape(fullProfile.name || fullProfile.title || '')}" onerror="this.parentElement.innerHTML='${defaultIcon}'">`;
        } else {
            photoEl.innerHTML = defaultIcon; // casquette asso/entreprise : logo si fourni, sinon icône de la structure
        }
        
        // Nom
        // Identité par casquette : l'asso/entreprise porte sa propre identité
        let name = fullProfile.name || fullProfile.displayName || fullProfile.title || 'Sans nom';
        if(isAssociation) name = fullProfile.assoName || name;
        if(isEnterprise) name = fullProfile.entName || name;
        document.getElementById('pm-name').textContent = name;
        
        // Rôle / Type - chercher dans data si pas trouvé directement
        const extraData = fullProfile.data || {};
        let roleText = '';
        if(isProject) roleText = fullProfile.projectType || 'Projet';
        else if(isActor) roleText = fullProfile.role || extraData.role || 'Comédien·ne';
        else if(isCrew) roleText = fullProfile.role || extraData.role || extraData.department || 'Technicien·ne';
        else if(isAssociation) roleText = fullProfile.assoType || extraData.assoType || 'Association';
        else if(isEnterprise) roleText = fullProfile.entType || extraData.entType || 'Entreprise';
        document.getElementById('pm-role').textContent = roleText;
        
        // Pager ‹ › entre les casquettes du profil
        let pager = document.getElementById('pm-facet-pager');
        if(!pager) {
            pager = document.createElement('div');
            pager.id = 'pm-facet-pager';
            const roleEl = document.getElementById('pm-role');
            if(roleEl && roleEl.parentElement) roleEl.parentElement.insertBefore(pager, roleEl.nextSibling);
        }
        if(!isProject && vf.length > 1) {
            const FACET_ICONS = { actor: '🎭', crew: '🎥', asso: '🏛️', ent: '🏢' };
            pager.innerHTML = '';
            pager.style.display = 'flex';
            const mkArrow = (txt, dir) => {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'pm-facet-arrow'; b.textContent = txt;
                b.onclick = () => UniverseProfileModal.switchFacet(dir);
                return b;
            };
            const lab = document.createElement('span');
            lab.style.cssText = 'font-size:12px;opacity:.8;';
            lab.textContent = (FACET_ICONS[curKind] || '') + ' ' + (vf.indexOf(cur) + 1) + '/' + vf.length;
            pager.appendChild(mkArrow('‹', -1));
            pager.appendChild(lab);
            pager.appendChild(mkArrow('›', 1));
        } else {
            pager.style.display = 'none';
        }
        
        // Téléportation : au changement de casquette via le pager, voler vers l'adresse de la facette
        if(facetView && Universe.map) {
            try {
                UniverseProfileModal._clearHqMarker();
                let dest = null;
                let isHq = false;
                const fc = PublicProfile.facetByKey(profile.facets, cur);
                if((curKind === 'asso' || curKind === 'ent') && fc && fc.hqLatitude != null && fc.hqLongitude != null) {
                    dest = [fc.hqLatitude, fc.hqLongitude]; // siège de l'asso / entreprise
                    isHq = true;
                } else if(profile.latitude != null && profile.longitude != null) {
                    dest = [profile.latitude, profile.longitude]; // adresse de la personne
                }
                if(dest) {
                    // Marqueur temporaire « 📍 Siège » tant qu'on regarde la casquette asso/entreprise
                    if(isHq) {
                        const hqName = (curKind === 'asso' ? (profile.assoName || 'Siège') : (profile.entName || 'Siège'));
                        const hqIcon = L.divIcon({
                            className: '',
                            html: '<div class="tmp-hq-marker">📍 <span>' + Utils.escape(hqName) + '</span></div>',
                            iconSize: [10, 10],
                            iconAnchor: [5, 10]
                        });
                        UniverseProfileModal._tmpHqMarker = L.marker(dest, { icon: hqIcon, interactive: false, zIndexOffset: 2000 }).addTo(Universe.map);
                    }
                    const center = Universe.map.getCenter();
                    const moved = Math.abs(center.lat - dest[0]) > 0.0005 || Math.abs(center.lng - dest[1]) > 0.0005;
                    if(moved) Universe.map.flyTo(dest, Math.max(Universe.map.getZoom(), 12));
                }
            } catch(e) {}
        }
        
        // Ville : siège pour asso/entreprise, ville de la personne sinon
        let city = fullProfile.city || fullProfile.location || '';
        const curFacetData = (fullProfile.facets || profile.facets || {})[cur];
        if((isAssociation || isEnterprise) && curFacetData && curFacetData.hqAddress) city = curFacetData.hqAddress;
        document.getElementById('pm-city').textContent = city ? '📍 ' + city : '';
        
        // Badge de modération (visible par tous)
        const badgeEl = document.getElementById('pm-moderation-badge');
        if(badgeEl) {
            const badge = fullProfile.moderation_badge;
            if(badge) {
                const badgeConfigs = {
                    yellow: { icon: '🟡', label: 'Profil signalé', color: '#f59e0b', bg: '#fef3c7', textColor: '#78350f' },
                    red: { icon: '🔴', label: 'Profil signalé — attention', color: '#dc2626', bg: '#fee2e2', textColor: '#7f1d1d' },
                    black: { icon: '⚫', label: 'Profil en cours de vérification', color: '#1f2937', bg: '#d1d5db', textColor: '#111827' }
                };
                const cfg = badgeConfigs[badge] || badgeConfigs.yellow;
                const reason = fullProfile.badge_reason;
                badgeEl.style.display = 'block';
                badgeEl.style.background = cfg.bg;
                badgeEl.style.borderLeft = '4px solid ' + cfg.color;
                badgeEl.style.color = cfg.textColor;
                badgeEl.innerHTML = `
                    <div style="font-weight:bold; margin-bottom:${reason ? '6px' : '0'};">${cfg.icon} ${cfg.label}</div>
                    ${reason ? `<div style="font-size:0.8rem; opacity:0.85;">${Utils.escape(reason)}</div>` : ''}
                `;
            } else {
                badgeEl.style.display = 'none';
            }
        }
        
        // Galerie photos (vérifier visibilité)
        let galleryHtml = '';
        const gallerySection = fullProfile.type === 'crew' ? 'crew-gallery' : 'gallery';
        const photos = fullProfile.galleryPhotos || fullProfile.crewGalleryPhotos || fullProfile.gallery || fullProfile.photos || [];
        if(photos.length > 0 && UniverseProfileModal.isSectionVisible(fullProfile, gallerySection, 'public')) {
            galleryHtml = '<div style="display: flex; gap: 10px; margin-bottom: 20px; justify-content: center; flex-wrap: wrap;">';
            photos.slice(0, 5).forEach(url => {
                if(url) {
                    galleryHtml += `<div style="width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border);">
                        <img src="${Utils.safeMediaUrl(url)}" alt="Photo de la galerie" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="window.open('${Utils.safeMediaUrl(url)}', '_blank')" onerror="this.parentElement.style.display='none'">
                    </div>`;
                }
            });
            galleryHtml += '</div>';
        }
        
        // Bio / Description
        const bioSection = document.getElementById('pm-bio-section');
        const bioEl = document.getElementById('pm-bio');
        const bioText = fullProfile.bio || fullProfile.description || fullProfile.synopsis || '';
        if(bioText || galleryHtml) {
            bioSection.style.display = 'block';
            bioEl.innerHTML = galleryHtml + (bioText ? '<p>' + Utils.escape(bioText) + '</p>' : '');
        } else {
            bioSection.style.display = 'none';
        }
        
        // Infos selon le type
        const infoEl = document.getElementById('pm-info');
        let infoHtml = '';
        
        if(isActor) {
            // Section Identité (toujours visible sauf si cachée)
            if(fullProfile.gender && UniverseProfileModal.isSectionVisible(fullProfile, 'identity', 'public')) infoHtml += `<div class="profile-modal-info-item"><label>Genre</label><span>${Utils.escape(fullProfile.gender)}</span></div>`;
            
            // Section Description Physique
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'physical', 'public')) {
                const _ageTxt = PublicProfile.ageTexte(fullProfile);   // v601 : calcule
                if(_ageTxt) infoHtml += `<div class="profile-modal-info-item"><label>Âge</label><span>${Utils.escape(_ageTxt)}</span></div>`;
                if(fullProfile.height) infoHtml += `<div class="profile-modal-info-item"><label>Taille</label><span>${Utils.escape(fullProfile.height)} cm</span></div>`;
                if(fullProfile.weight) infoHtml += `<div class="profile-modal-info-item"><label>Poids</label><span>${Utils.escape(fullProfile.weight)} kg</span></div>`;
                if(fullProfile.eyeColor) infoHtml += `<div class="profile-modal-info-item"><label>Yeux</label><span>${Utils.escape(fullProfile.eyeColor)}</span></div>`;
                if(fullProfile.hairColor) infoHtml += `<div class="profile-modal-info-item"><label>Cheveux</label><span>${Utils.escape(fullProfile.hairColor)}${fullProfile.hairLength ? ' (' + Utils.escape(fullProfile.hairLength) + ')' : ''}</span></div>`;
                if(fullProfile.corpulence) infoHtml += `<div class="profile-modal-info-item"><label>Corpulence</label><span>${Utils.escape(fullProfile.corpulence)}</span></div>`;
                if(fullProfile.bonnet || fullProfile.bustSize) infoHtml += `<div class="profile-modal-info-item"><label>Poitrine</label><span>${fullProfile.bonnet ? 'Bonnet ' + Utils.escape(fullProfile.bonnet) : ''}${fullProfile.bustSize ? ' (' + Utils.escape(fullProfile.bustSize) + ' cm)' : ''}${fullProfile.bustType ? ' - ' + Utils.escape(fullProfile.bustType) : ''}</span></div>`;
                if(fullProfile.ethnicity) infoHtml += `<div class="profile-modal-info-item"><label>Origine</label><span>${Utils.escape(fullProfile.ethnicity)}</span></div>`;
            }
            if(fullProfile.languages) infoHtml += `<div class="profile-modal-info-item"><label>Langues</label><span>${Utils.escape(fullProfile.languages)}</span></div>`;
            if(fullProfile.sports) infoHtml += `<div class="profile-modal-info-item"><label>Sports</label><span>${Utils.escape(fullProfile.sports)}</span></div>`;
            
            // Section Tarif
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'tarif', 'public')) {
                if(fullProfile.dailyRate) infoHtml += `<div class="profile-modal-info-item"><label>Tarif</label><span>${Utils.escape(fullProfile.dailyRate)} ${Utils.escape(fullProfile.rateCurrency || '€')}/${Utils.escape(fullProfile.rateType || 'Jour')}</span></div>`;
            }
            
            // Section Véhicule
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'vehicle', 'public')) {
                if(fullProfile.hasVehicle) infoHtml += `<div class="profile-modal-info-item"><label>Véhicule</label><span>🚗 ${Utils.escape(fullProfile.vehicleType || 'Oui')}${fullProfile.vehicleSeats ? ' (' + Utils.escape(fullProfile.vehicleSeats) + ' places)' : ''}</span></div>`;
            }
        } else if(isCrew) {
            // Section Identité
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'identity', 'public')) {
                if(fullProfile.gender) infoHtml += `<div class="profile-modal-info-item"><label>Genre</label><span>${Utils.escape(fullProfile.gender)}</span></div>`;
            }
            
            // Section Métier & Compétences
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'skills', 'public')) {
                if(fullProfile.department) {
                    const deptName = CONFIG.crewGroups.find(g => g.id === fullProfile.department)?.name || fullProfile.department;
                    infoHtml += `<div class="profile-modal-info-item"><label>Département</label><span>${Utils.escape(deptName)}</span></div>`;
                }
                if(fullProfile.experience) infoHtml += `<div class="profile-modal-info-item"><label>Expérience</label><span>${Utils.escape(fullProfile.experience)}</span></div>`;
                if(fullProfile.languages) infoHtml += `<div class="profile-modal-info-item"><label>Langues</label><span>${Utils.escape(fullProfile.languages)}</span></div>`;
            }
            
            // Section Tarif
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'tarif', 'public')) {
                if(fullProfile.dailyRate) infoHtml += `<div class="profile-modal-info-item"><label>Tarif</label><span>${Utils.escape(fullProfile.dailyRate)} ${Utils.escape(fullProfile.rateCurrency || '€')}/${Utils.escape(fullProfile.rateType || 'Jour')}</span></div>`;
            }
            
            // Section Véhicule
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'vehicle', 'public')) {
                if(fullProfile.hasVehicle) infoHtml += `<div class="profile-modal-info-item"><label>Véhicule</label><span>🚗 ${Utils.escape(fullProfile.vehicleType || 'Oui')}${fullProfile.vehicleSeats ? ' (' + Utils.escape(fullProfile.vehicleSeats) + ' places)' : ''}</span></div>`;
            }
        } else if(isProject) {
            if(fullProfile.genre) infoHtml += `<div class="profile-modal-info-item"><label>Genre</label><span>${Utils.escape(fullProfile.genre)}</span></div>`;
            if(fullProfile.director) infoHtml += `<div class="profile-modal-info-item"><label>Réalisateur</label><span>${Utils.escape(fullProfile.director)}</span></div>`;
            if(fullProfile.producer) infoHtml += `<div class="profile-modal-info-item"><label>Producteur</label><span>${Utils.escape(fullProfile.producer)}</span></div>`;
            if(fullProfile.status) infoHtml += `<div class="profile-modal-info-item"><label>Statut</label><span>${Utils.escape(fullProfile.status)}</span></div>`;
        } else if(isAssociation || isEnterprise) {
            if(fullProfile.siret) infoHtml += `<div class="profile-modal-info-item"><label>SIRET</label><span>${Utils.escape(fullProfile.siret)}</span></div>`;
            if(fullProfile.services) infoHtml += `<div class="profile-modal-info-item col-span-2"><label>Services</label><span>${Utils.escape(fullProfile.services)}</span></div>`;
        }
        
        if(fullProfile.availabilityText) infoHtml += `<div class="profile-modal-info-item col-span-2"><label>Disponibilité</label><span>${Utils.escape(fullProfile.availabilityText)}</span></div>`;
        
        infoEl.innerHTML = infoHtml || '<p class="text-sec">Pas d\'informations supplémentaires</p>';
        
        // Contact (vérifier visibilité de la section identité)
        const contactEl = document.getElementById('pm-contact');
        let contactHtml = '';
        if(UniverseProfileModal.isSectionVisible(fullProfile, 'identity', 'public')) {
            const email = fullProfile.email || fullProfile.ownerEmail || '';
            const phone = fullProfile.phone || '';
            const website = fullProfile.website || '';
            if(email) contactHtml += `<div class="profile-modal-info-item"><label>Email</label><span>${Utils.escape(email)}</span></div>`;
            if(phone) contactHtml += `<div class="profile-modal-info-item"><label>${fullProfile.phone_is_agent ? 'Téléphone (agent)' : 'Téléphone'}</label><span>${Utils.escape(phone)}</span></div>`;
            if(website) contactHtml += `<div class="profile-modal-info-item col-span-2"><label>Site web</label><span><a href="${Utils.safeUrl(website)}" target="_blank" rel="noopener">${Utils.escape(website)}</a></span></div>`;
        }
        contactEl.innerHTML = contactHtml || '<p class="text-sec">Pas de contact public</p>';
        
        // Dates de tournage prévues
        const shootingSection = document.getElementById('pm-shooting-section');
        const shootingEl = document.getElementById('pm-shooting-dates');
        const shootingDates = fullProfile.shootingDates || [];
        
        // Filtrer les dates futures uniquement
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureDates = shootingDates.filter(sd => new Date(sd.date) >= today).sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if(futureDates.length > 0) {
            shootingSection.style.display = 'block';
            let shootingHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
            futureDates.slice(0, 5).forEach(sd => {
                const dateObj = new Date(sd.date);
                const dateStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                shootingHtml += `<div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; border-radius: 6px;">
                    <span style="font-size: 1.2rem;">🎬</span>
                    <div class="flex-1">
                        <div class="fw-bold">${dateStr}</div>
                        <div style="font-size: 0.85rem; opacity: 0.9;">${Utils.escape(sd.projectName || 'Projet')}${sd.location ? ' - ' + Utils.escape(sd.location) : ''}</div>
                    </div>
                    ${sd.callTime ? `<div class="fs-085">⏰ ${sd.callTime}</div>` : ''}
                </div>`;
            });
            if(futureDates.length > 5) {
                shootingHtml += `<div style="text-align: center; color: var(--text-sec); font-size: 0.85rem;">+ ${futureDates.length - 5} autre(s) date(s)...</div>`;
            }
            shootingHtml += '</div>';
            shootingEl.innerHTML = shootingHtml;
        } else {
            shootingSection.style.display = 'none';
            shootingEl.innerHTML = '';
        }
        
        // Bande Démo (vérifier visibilité)
        const demoreelSection = document.getElementById('pm-demoreel-section');
        const demoreelEl = document.getElementById('pm-demoreel');
        const demoreelSectionKey = fullProfile.type === 'crew' ? 'crew-demoreel' : 'demoreel';
        if(fullProfile.demoreel && UniverseProfileModal.isSectionVisible(fullProfile, demoreelSectionKey, 'public')) {
            demoreelSection.style.display = 'block';
            const embedUrl = ProfileRenderer.getEmbedUrl(fullProfile.demoreel);
            demoreelEl.innerHTML = `<iframe src="${embedUrl}" width="100%" height="250" frameborder="0" allowfullscreen class="br-8"></iframe>`;
        } else {
            demoreelSection.style.display = 'none';
            demoreelEl.innerHTML = '';
        }
        
        // Actualité du profil (filtrée sur le profil précis, H3)
        const actualiteSection = document.getElementById('pm-actualite-section');
        const actualiteEl = document.getElementById('pm-actualite');
        try {
            const { data: actualites, error: errActu } = await supabase
                .from('profile_actualites')
                .select('*')
                .eq('profile_id', fullProfile.id)
                .order('created_at', { ascending: false })
                .limit(5);
            if(errActu) console.warn('[PublicProfile] actualités:', errActu);
            
            if(actualites && actualites.length > 0) {
                actualiteSection.style.display = 'block';
                actualiteEl.innerHTML = actualites.map(a => `
                    <div style="display: inline-block; min-width: 250px; max-width: 300px; padding: 15px; margin-right: 10px; background: var(--bg); border-radius: 10px; border: 1px solid var(--border); white-space: normal; vertical-align: top;">
                        <div style="font-size: 0.8rem; color: var(--text-sec); margin-bottom: 8px;">${Utils.timeAgo(a.created_at)}</div>
                        <div style="font-size: 0.95rem;">${Utils.escape(a.content)}</div>
                        ${a.image ? `<img src="${Utils.safeMediaUrl(a.image)}" alt="Image de l'actualité" style="width: 100%; border-radius: 6px; margin-top: 10px;">` : ''}
                    </div>
                `).join('');
            } else {
                actualiteSection.style.display = 'none';
            }
        } catch(e) {
            actualiteSection.style.display = 'none';
        }
        
        const _ideaBtn = document.getElementById('pm-idea-btn');
        if(_ideaBtn) _ideaBtn.style.display = (typeof GlobalSearch !== 'undefined' && GlobalSearch._castingCharId) ? '' : 'none';
        document.getElementById('profile-modal-overlay').style.display = 'flex';
        UniverseProfileModal.updateFavoriteButton();
    },
    
    // Ferme le modal
    closeProfileModal: () => {
        UniverseProfileModal._clearHqMarker();
        document.getElementById('profile-modal-overlay').style.display = 'none';
        Universe.currentProfile = null;
    },
    
    // Export PDF du profil
    exportProfilePDF: async () => {
        const profile = Universe.currentProfile;
        if(!profile) return;
        
        Utils.toast('Génération du PDF en cours...', 'info');
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = 0;
        
        const isActor = profile.type === 'actor';
        const isCrew = profile.type === 'crew';
        const isAssociation = profile.type === 'association';
        const isEnterprise = profile.type === 'enterprise';
        
        const name = profile.name || profile.displayName || profile.assoName || profile.entName || 'Sans nom';
        const extraData = profile.data || {};
        let roleText = '';
        if(isActor) roleText = profile.role || extraData.role || 'Comédien·ne';
        else if(isCrew) roleText = profile.role || extraData.role || extraData.department || 'Technicien·ne';
        else if(isAssociation) roleText = profile.assoType || extraData.assoType || 'Association';
        else if(isEnterprise) roleText = profile.entType || extraData.entType || 'Entreprise';
        const city = profile.city || profile.location || '';
        const photoUrl = profile.photo || profile.photoURL || profile.mainPhoto || null;
        
        // ===== HELPER : Charger image en base64 =====
        const loadImg = (url) => new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    c.getContext('2d').drawImage(img, 0, 0);
                    resolve(c.toDataURL('image/jpeg', 0.85));
                } catch(e) { resolve(null); }
            };
            img.onerror = () => resolve(null);
            setTimeout(() => resolve(null), 5000);
            img.src = Utils.signedUrlFor(url);
        });
        
        // ===== HELPER : Section colorée =====
        const addSection = (title, rgb) => {
            if(y > pageHeight - 30) { doc.addPage(); y = margin; }
            doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            doc.roundedRect(margin, y, pageWidth - margin * 2, 9, 1.5, 1.5, 'F');
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin + 5, y + 6.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.setFont('helvetica', 'normal');
            y += 14;
        };
        
        // ===== HELPER : Ligne label/valeur =====
        const addInfo = (label, value, opts) => {
            if(!value) return;
            if(y > pageHeight - 15) { doc.addPage(); y = margin; }
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            doc.text(label, margin + 3, y);
            doc.setFont('helvetica', 'normal');
            if(opts && opts.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
            else doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const val = String(value);
            if(val.length > 55) {
                const lines = doc.splitTextToSize(val, pageWidth - margin - 50);
                doc.text(lines, margin + 45, y);
                y += lines.length * 4.5 + 2;
            } else {
                doc.text(val, margin + 45, y);
                y += 6;
            }
        };
        
        // ===== HEADER BLEU =====
        doc.setFillColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.rect(0, 0, pageWidth, 55, 'F');
        doc.setFillColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.rect(0, 50, pageWidth, 5, 'F');
        
        // Photo de profil
        let photoLoaded = false;
        if(photoUrl) {
            try {
                const imgData = await loadImg(photoUrl);
                if(imgData) {
                    doc.setFillColor(...PdfTheme.COLORS.WHITE);
                    doc.roundedRect(margin + 1, 9, 32, 37, 3, 3, 'F');
                    doc.addImage(imgData, 'JPEG', margin + 2, 10, 30, 35);
                    photoLoaded = true;
                }
            } catch(e) {}
        }
        
        const textX = photoLoaded ? margin + 40 : pageWidth / 2;
        const textAlign = photoLoaded ? { align: 'left' } : { align: 'center' };
        
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(name.length > 30 ? name.substring(0, 30) + '...' : name, textX, 24, textAlign);
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.text(roleText, textX, 33, textAlign);
        
        if(city) {
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text(city, textX, 42, textAlign);
        }
        
        y = 65;
        
        // ===== BIO / DESCRIPTION =====
        const bio = profile.bio || profile.description || profile.assoMission || profile.entDescription || '';
        if(bio) {
            addSection(isAssociation ? 'MISSION' : isEnterprise ? 'DESCRIPTION' : 'BIOGRAPHIE', [43, 110, 246]);
            doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
            const bioLines = doc.splitTextToSize(bio, pageWidth - margin * 2 - 6);
            bioLines.forEach(line => {
                if(y > pageHeight - 15) { doc.addPage(); y = margin; }
                doc.text(line, margin + 3, y);
                y += 4.8;
            });
            y += 6;
        }
        
        // ===== INFOS COMÉDIEN =====
        if(isActor) {
            const hasPhysical = profile.gender || profile.age || profile.height || profile.weight || profile.eyeColor || profile.hairColor || profile.corpulence || profile.ethnicity;
            if(hasPhysical) {
                addSection('DESCRIPTION PHYSIQUE', [76, 175, 80]);
                addInfo('Genre', profile.gender);
                addInfo('Âge', PublicProfile.ageTexte(profile));   // v601 : calcule
                addInfo('Taille', profile.height ? profile.height + ' cm' : '');
                addInfo('Poids', profile.weight ? profile.weight + ' kg' : '');
                addInfo('Yeux', profile.eyeColor);
                addInfo('Cheveux', profile.hairColor ? profile.hairColor + (profile.hairLength ? ' (' + profile.hairLength + ')' : '') : '');
                addInfo('Corpulence', profile.corpulence);
                addInfo('Origine', profile.ethnicity);
                y += 4;
            }
            if(profile.languages || profile.sports) {
                addSection('COMPÉTENCES', [156, 39, 176]);
                addInfo('Langues', profile.languages);
                addInfo('Sports', profile.sports);
                y += 4;
            }
        }
        
        // ===== INFOS TECHNICIEN =====
        if(isCrew) {
            addSection('COMPÉTENCES & MÉTIER', [76, 175, 80]);
            if(profile.department) {
                const deptName = CONFIG.crewGroups.find(g => g.id === profile.department)?.name || profile.department;
                addInfo('Département', deptName);
            }
            addInfo('Expérience', profile.experience);
            // v601 : « equipment » n'a jamais existe sur un profil — la ligne ne
            // s'est donc jamais affichee. Les vrais champs sont cameras et lenses.
            if(profile.cameras && profile.cameras.length > 0) addInfo('Caméras', profile.cameras.join(', '));
            if(profile.lenses && profile.lenses.length > 0) addInfo('Objectifs', profile.lenses.join(', '));
            y += 4;
        }
        
        // ===== INFOS ASSOCIATION =====
        if(isAssociation) {
            addSection('INFORMATIONS', [76, 175, 80]);
            addInfo('Type', profile.assoType);
            addInfo('SIRET', profile.siret);
            addInfo('Services', profile.services);
            y += 4;
        }
        
        // ===== INFOS ENTREPRISE =====
        if(isEnterprise) {
            addSection('INFORMATIONS', [76, 175, 80]);
            addInfo('Type', profile.entType);
            addInfo('SIRET', profile.siret);
            addInfo('Services', profile.services);
            y += 4;
        }
        
        // ===== TARIF & DISPONIBILITÉ =====
        if(profile.dailyRate || profile.availabilityText || profile.hasVehicle) {
            addSection('TARIF & DISPONIBILITÉ', [255, 152, 0]);
            addInfo('Tarif', profile.dailyRate ? profile.dailyRate + ' ' + (profile.rateCurrency || '€') + ' / ' + (profile.rateType || 'Jour') : '');
            addInfo('Disponibilité', profile.availabilityText);
            if(profile.hasVehicle) addInfo('Véhicule', (profile.vehicleType || 'Oui') + (profile.vehicleSeats ? ' (' + profile.vehicleSeats + ' places)' : ''));
            y += 4;
        }
        
        // ===== CONTACT =====
        const email = profile.email || profile.ownerEmail || '';
        const phone = profile.phone || '';
        const website = profile.website || '';
        const demoreel = profile.demoreel || '';
        if(email || phone || website || demoreel) {
            addSection('CONTACT', [96, 125, 139]);
            addInfo('Email', email, { color: [43, 110, 246] });
            addInfo(profile.phone_is_agent ? 'Téléphone (agent)' : 'Téléphone', phone);
            addInfo('Site web', website, { color: [43, 110, 246] });
            addInfo('Bande démo', demoreel, { color: [43, 110, 246] });
            y += 4;
        }
        
        // ===== GALERIE PHOTOS =====
        const galleryPhotos = profile.galleryPhotos || profile.crewGalleryPhotos || [];
        if(galleryPhotos.length > 0) {
            addSection('GALERIE', [233, 30, 99]);
            let photoX = margin + 3;
            for(const url of galleryPhotos.slice(0, 3)) {
                if(!url) continue;
                try {
                    const imgData = await loadImg(url);
                    if(imgData) {
                        if(y + 52 > pageHeight - 15) { doc.addPage(); y = margin; }
                        doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                        doc.roundedRect(photoX - 0.5, y - 0.5, 51, 51, 2, 2, 'S');
                        doc.addImage(imgData, 'JPEG', photoX, y, 50, 50);
                        photoX += 55;
                    }
                } catch(e) {}
            }
            if(photoX > margin + 3) y += 58;
        }
        
        // ===== FOOTER sur toutes les pages =====
        const totalPages = doc.internal.getNumberOfPages();
        for(let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
            doc.setFontSize(7.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            doc.text('Généré par Moteur — moteur.studio', margin, pageHeight - 7);
            doc.text(new Date().toLocaleDateString('fr-FR'), pageWidth / 2, pageHeight - 7, { align: 'center' });
            doc.text('Page ' + i + '/' + totalPages, pageWidth - margin, pageHeight - 7, { align: 'right' });
        }
        
        // Télécharger
        const safeProfileName = name.replace(/[\\/:*?"<>|]/g, '_').trim();
        doc.save(`${safeProfileName} - Profil - moteur.studio.pdf`);
        Utils.toast('PDF profil exporté !', 'success');
    },
    
    // Favoris (utilise maintenant state.contacts via Contacts.loadAndRender)
    isFavorite: (profileId, profileType) => {
        if(!state.contacts) return false;
        const typeMap = {
            actor: 'actors',
            crew: 'crew',
            project: 'projects',
            association: 'associations',
            enterprise: 'enterprises'
        };
        const contactType = typeMap[profileType] || 'actors';
        if(!state.contacts[contactType]) return false;
        return state.contacts[contactType].some(c => c.publicProfileId === profileId || c.contact_email === profileId);
    },
    
    toggleFavorite: async () => {
        const profile = Universe.currentProfile;
        if(!profile || !state.currentUser) return;
        
        const btn = document.getElementById('pm-favorite-btn');
        const emailKey = Utils.sanitizeEmail(state.currentUser.email);
        
        // Déterminer le type de contact
        const typeMap = {
            actor: 'actors',
            crew: 'crew',
            project: 'projects',
            association: 'associations',
            enterprise: 'enterprises'
        };
        const contactType = typeMap[profile.type] || 'actors';
        
        // S'assurer que state.contacts existe
        if(!state.contacts) state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
        if(!state.contacts[contactType]) state.contacts[contactType] = [];
        
        // Vérifier si déjà en favoris
        const profileId = profile.id || profile.projectId;
        const existingIndex = state.contacts[contactType].findIndex(c => c.publicProfileId === profileId || c.contact_email === profileId || c.publicProfileId === profile.projectId);
        
        if(existingIndex >= 0) {
            // Retirer des favoris
            const contactToRemove = state.contacts[contactType][existingIndex];
            state.contacts[contactType].splice(existingIndex, 1);
            const {error: delFavErr2} = await supabase.from('contacts').delete().eq('id', contactToRemove.id);
            if(delFavErr2) { console.error('Erreur suppression favori:', delFavErr2); Toast.show('Erreur suppression favori', 'error'); return; }
            btn.textContent = '☆';
            btn.classList.remove('active');
            Utils.toast('Retiré des favoris', 'info');
        } else {
            // Ajouter aux favoris
            // Convertir le type pluriel en singulier pour la base de données
            const dbTypeMap = { actors: 'actor', crew: 'crew', projects: 'project', associations: 'association', enterprises: 'enterprise' };
            const dbContactType = dbTypeMap[contactType] || profile.type || 'actor';
            
            const contactData = {
                owner_email: state.currentUser.email.toLowerCase(),
                contact_email: profile.email || profile.id || '',
                contact_type: dbContactType,
                name: profile.name || profile.title || profile.assoName || profile.entName || '',
                notes: JSON.stringify({ ...profile, publicProfileId: profile.id }),
                created_at: new Date().toISOString()
            };
            
            const { data: newContact, error } = await supabase
                .from('contacts')
                .upsert(contactData, { onConflict: 'owner_email,contact_email' })
                .select()
                .single();
            
            if(error) {
                if(error.code === '23505') {
                    btn.textContent = '★';
                    btn.classList.add('active');
                    Utils.toast('Déjà dans vos favoris !', 'info');
                    return;
                }
                console.error('Erreur ajout favori:', error);
                Utils.toast('Erreur lors de l\'ajout', 'error');
                return;
            }
            
            if(newContact) {
                state.contacts[contactType].push({ ...profile, id: newContact.id, publicProfileId: profile.id });
            }
            btn.textContent = '★';
            btn.classList.add('active');
            Utils.toast('Ajouté aux favoris !', 'success');
        }
    },
    
    updateFavoriteButton: () => {
        const profile = Universe.currentProfile;
        const btn = document.getElementById('pm-favorite-btn');
        if(!profile || !btn) return;
        
        if(UniverseProfileModal.isFavorite(profile.id, profile.type)) {
            btn.textContent = '★';
            btn.classList.add('active');
        } else {
            btn.textContent = '☆';
            btn.classList.remove('active');
        }
    },
    
    
    
    // Contacter un profil : on affiche l'email de contact PUBLIC de la fiche (jamais l'email du compte)
    contactProfile: async () => {
        if(!Universe.currentProfile) return;
        const profile = Universe.currentProfile;
        const profileName = profile.name || profile.assoName || profile.entName || 'ce profil';
        const isAsso = profile.type === 'association';
        const isEnt = profile.type === 'enterprise';
        const publicEmail = ((isAsso ? profile.assoEmail : isEnt ? profile.entEmail : profile.contactEmail) || '').trim();
        const publicPhone = ((isAsso ? profile.assoPhone : isEnt ? profile.entPhone : profile.phone) || '').trim();

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
        if(publicEmail) inner += row('Adresse de contact', publicEmail, 'contact-public-email', 'mailto:' + Utils.escape(publicEmail), '✉️ Écrire un email');
        if(publicPhone) inner += row(profile.phone_is_agent ? 'Téléphone (agent)' : 'Téléphone', publicPhone, 'contact-public-phone', 'tel:' + Utils.escape(publicPhone.replace(/\s/g, '')), '📞 Appeler');
        if(!inner) inner = `<p style="color: var(--text-sec); margin: 0;">${Utils.escape(profileName)} n'a pas indiqué de contact public sur cette fiche.</p>`;

        modal.innerHTML = `
            <div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 460px; padding: 20px;">
                <div class="section-header-20">
                    <h3 class="m-0">📧 Contacter ${Utils.escape(profileName)}</h3>
                    <button onclick="document.getElementById('contact-profile-modal').remove()" class="icon-btn-sec">✖</button>
                </div>
                <div class="mb-15">${inner}</div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    copyContactValue: (elId) => {
        const el = document.getElementById(elId);
        if(!el) return;
        const val = el.textContent;
        const done = () => Utils.toast('Copié !', 'success');
        if(navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(val).then(done).catch(() => Utils.toast('Copie impossible, sélectionnez manuellement.', 'warning'));
        } else {
            Utils.toast('Copie impossible, sélectionnez manuellement.', 'warning');
        }
    },

    // Ajouter à un projet
    addToProject: async () => {
        if(!Universe.currentProfile) return;
        
        // Charger mes projets où je suis owner
        const { data: memberData, error } = await supabase
            .from('project_members')
            .select('project_id, role, projects(id, title)')
            .eq('user_id', state.currentUser.id)
            .eq('role', 'owner');
        
        if(error) {
            console.error('Erreur chargement projets:', error);
            return;
        }
        
        const myProjects = (memberData || [])
            .filter(m => m.projects)
            .map(m => ({ id: m.project_id, title: m.projects.title }));
        
        if(myProjects.length === 0) {
            Utils.toast('Vous n\'avez pas encore de projet. Créez-en un d\'abord !', 'warning');
            return;
        }
        
        // Afficher la liste des projets
        const listEl = document.getElementById('select-project-list');
        listEl.innerHTML = '';
        
        myProjects.forEach(p => {
            const btn = document.createElement('button');
            btn.style.cssText = 'width: 100%; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; text-align: left; font-size: 0.95rem;';
            btn.innerHTML = `📁 ${Utils.escape(p.title)}`;
            btn.onmouseover = () => btn.style.borderColor = 'var(--primary)';
            btn.onmouseout = () => btn.style.borderColor = 'var(--border)';
            btn.onclick = () => UniverseProfileModal.sendProjectRequest(p);
            listEl.appendChild(btn);
        });
        
        document.getElementById('select-project-modal').style.display = 'flex';
    },
    
    // Envoyer une demande de participation
    sendProjectRequest: async (project) => {
        const profile = Universe.currentProfile;
        if(!profile) return;
        
        try {
    // Cloche in-app + email externe direct (plus de message interne)
            const requesterName = state.userProfile?.displayName || state.currentUser.email.split('@')[0];
            await Notifications.send(profile.email, 'invite', `${requesterName} souhaite vous ajouter au projet \"${project.title}\"`, project.id);
            
            await Messages.sendEmailPing(profile.email, profile.name, 'invitation', {
                senderName: state.userProfile?.displayName || state.currentUser.email.split('@')[0],
                projectTitle: project.title,
                role: 'collaborateur'
            });
            
            document.getElementById('select-project-modal').style.display = 'none';
            UniverseProfileModal.closeProfileModal();
            
            Utils.toast(`Demande envoyée à ${profile.name} !`, 'success');
            
        } catch(e) {
            console.error('Erreur envoi demande:', e);
            Utils.toast('Erreur lors de l\'envoi de la demande', 'error');
        }
    },
    
};
