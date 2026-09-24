
const UniverseSearch = {
    // ---- Autocompletion de lieu (ville / adresse / pays) via Nominatim ----
    // Choisir une suggestion fixe des coordonnees CERTAINES (amorcees dans le
    // cache), qui servent ensuite de centre au filtre par rayon.
    _locTimer: null,
    _locSuggest: [],
    onLocationInput: (value) => {
        const box = document.getElementById('universe-city-suggest');
        const q = (value || '').trim();
        if(UniverseSearch._locTimer) clearTimeout(UniverseSearch._locTimer);
        if(q.length < 3) { if(box) { box.style.display = 'none'; box.innerHTML = ''; } return; }
        UniverseSearch._locTimer = setTimeout(async () => {
            try {
                const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`, { headers: { 'Accept': 'application/json' } });
                if(!r.ok) return;
                const data = await r.json();
                UniverseSearch._locSuggest = (data || []).map(d => ({
                    label: ((d.display_name || '').split(',')[0].trim()) || (d.display_name || ''),
                    full: d.display_name || '',
                    lat: parseFloat(d.lat), lng: parseFloat(d.lon)
                })).filter(s => s.label && !isNaN(s.lat) && !isNaN(s.lng));
                UniverseSearch._renderLocSuggest();
            } catch(_) {}
        }, 450);
    },
    _renderLocSuggest: () => {
        const box = document.getElementById('universe-city-suggest');
        if(!box) return;
        const list = UniverseSearch._locSuggest || [];
        if(!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
        const esc = Utils.escape;
        box.innerHTML = list.map((s, i) =>
            `<div onmousedown="event.preventDefault(); app.Universe.pickLocation(${i})" onmouseover="this.style.background='var(--highlight)'" onmouseout="this.style.background='transparent'" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--border);"><span style="font-weight:600;">${esc(s.label)}</span><span style="display:block; font-size:0.75rem; color:var(--text-sec); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(s.full)}</span></div>`
        ).join('');
        box.style.display = 'block';
    },
    pickLocation: (idx) => {
        const s = (UniverseSearch._locSuggest || [])[idx];
        if(!s) return;
        const input = document.getElementById('universe-city');
        if(input) input.value = s.label;
        // Coordonnees certaines : amorcer le cache (memoire + localStorage) pour
        // que geocodeCity renvoie CE point exact au filtre par rayon.
        const key = s.label.toLowerCase().trim();
        Universe.geoCache[key] = { lat: s.lat, lng: s.lng };
        try {
            const cached = localStorage.getItem('fmp_geocache');
            const cacheData = cached ? JSON.parse(cached) : {};
            cacheData[key] = { lat: s.lat, lng: s.lng };
            localStorage.setItem('fmp_geocache', JSON.stringify(cacheData));
        } catch(_) {}
        UniverseSearch.hideLocationSuggest(true);
    },
    hideLocationSuggest: (now) => {
        const hide = () => { const box = document.getElementById('universe-city-suggest'); if(box) box.style.display = 'none'; };
        if(now) hide(); else setTimeout(hide, 200);
    },
    onLocationKey: (e) => {
        if(e.key === 'Escape') { UniverseSearch.hideLocationSuggest(true); return; }
        if(e.key === 'Enter') {
            const box = document.getElementById('universe-city-suggest');
            const open = box && box.style.display !== 'none' && (UniverseSearch._locSuggest || []).length;
            if(open) { e.preventDefault(); UniverseSearch.pickLocation(0); }
            else Universe.search();
        }
    },
    // Distance a vol d'oiseau entre deux points {lat,lng}, en km (haversine).
    _distanceKm: (a, b) => {
        const R = 6371, toRad = (d) => d * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    },
    // Filtre une liste (profils ou projets) autour de la ville CENTRE, dans le
    // rayon donne (km). Quand le rayon est actif, la ville sert de centre et non
    // de filtre texte. Coordonnees : lat/lng du profil si presentes, sinon
    // geocodage de sa ville (cache memoire/localStorage/DB/Nominatim).
    _applyRadius: async (list, cityCenter, radiusStr) => {
        const radius = parseInt(radiusStr, 10);
        if(!cityCenter || isNaN(radius) || radius <= 0 || radius >= 500) return list;
        const center = await Universe.geocodeCity(cityCenter);
        if(!center) { Utils.toast('Ville introuvable — filtre distance ignoré', 'warning'); return list; }
        const out = [];
        for(const item of list) {
            let coords = null;
            if(item.latitude != null && item.longitude != null) coords = { lat: item.latitude, lng: item.longitude };
            else { const c = item.city || item.location || ''; if(c) coords = await Universe.geocodeCity(c); }
            if(coords && UniverseSearch._distanceKm(center, coords) <= radius) out.push(item);
        }
        return out;
    },
    // Recherche
    search: async () => {
        const type = document.getElementById('universe-type').value;
        const city = document.getElementById('universe-city').value.trim().toLowerCase();
        // Rayon (km) autour de la ville. 500 = ∞ (pas de limite). Quand il est
        // actif, la ville devient le CENTRE et non un filtre texte.
        const distEl = document.getElementById('universe-distance');
        const radiusStr = distEl ? distEl.value : '';
        const radiusKm = parseInt(radiusStr, 10);
        const radiusActive = !!city && !isNaN(radiusKm) && radiusKm > 0 && radiusKm < 500;
        Universe.searchActive = true;
        
        // Si on cherche des projets
        if(type === 'project') {
            let results = [...Universe.allProjects];
            
            const projectType = document.getElementById('universe-project-type')?.value;
            const projectGenre = document.getElementById('universe-project-genre')?.value;
            const hasActorNeeds = document.getElementById('universe-project-has-actor-needs')?.checked;
            const hasCrewNeeds = document.getElementById('universe-project-has-crew-needs')?.checked;
            
            if(projectType) {
                results = results.filter(p => p.projectType === projectType);
            }
            if(projectGenre) {
                results = results.filter(p => p.genre === projectGenre);
            }
            if(hasActorNeeds) {
                results = results.filter(p => p.actorNeeds && p.actorNeeds.length > 0);
            }
            if(hasCrewNeeds) {
                results = results.filter(p => {
                    const crewCount = Object.values(p.crewNeeds || {}).filter(n => n.needed).length;
                    const customCount = (p.customCrewNeeds || []).length;
                    return crewCount + customCount > 0;
                });
            }
            if(city && !radiusActive) {
                results = results.filter(p => p.city && p.city.toLowerCase().includes(city));
            }
            
            // Filtre type de production
            const productionType = document.getElementById('universe-production-type')?.value;
            if(productionType) {
                results = results.filter(p => p.productionType === productionType);
            }
            
            if(radiusActive) results = await UniverseSearch._applyRadius(results, city, radiusStr);
            Universe.filteredProjects = results;
            Universe.filteredProfiles = [];
            UniverseSearch.renderSearchResults();
            
            // Toast de résultats projets
            const count = results.length;
            if(count === 0) {
                Utils.toast('Aucun projet trouvé', 'warning');
            } else {
                Utils.toast(`${count} projet${count > 1 ? 's' : ''} trouvé${count > 1 ? 's' : ''}`, 'success');
            }
            return;
        }
        
        // Sinon on cherche des profils (comédiens ou techniciens)
        let results = [...Universe.allProfiles];
        
        // Filtrer par type
        if(type) {
            results = results.filter(p => (p.visibleFacets || []).some(k => PublicProfile._facetKind(k) === PublicProfile._typeToFacet(type)) || p.type === type || p.accountType === type);
        }
        
        // Filtrer par ville
        if(city && !radiusActive) {
            results = results.filter(p => p.city && p.city.toLowerCase().includes(city));
        }
        
        // Filtre véhicule (commun)
        const hasVehicle = document.getElementById('universe-has-vehicle')?.checked;
        if(hasVehicle) {
            results = results.filter(p => p.hasVehicle === true);
        }
        
        // Filtre type de collaboration (commun acteurs/techniciens)
        const collabType = document.getElementById('universe-collab-type')?.value;
        if(collabType) {
            results = results.filter(p => {
                // collabTypes est un tableau (ex: ['pro', 'semi-pro', 'benevole'])
                if(Array.isArray(p.collabTypes)) {
                    return p.collabTypes.includes(collabType);
                }
                // Compatibilité ancienne structure (collabType string)
                return p.collabType === collabType;
            });
        }
        
        // Filtre statut professionnel (commun acteurs/techniciens)
        const statusType = document.getElementById('universe-status-type')?.value;
        if(statusType) {
            results = results.filter(p => p.professionalStatus === statusType);
        }
        
        // Filtres techniciens
        if(type === 'crew') {
            const dept = document.getElementById('universe-department')?.value;
            const role = document.getElementById('universe-crew-role')?.value;
            
            // v600 : on interroge TOUTES les fiches technicien de la personne, pas
            // seulement les champs plats. Depuis v597 un compte peut en porter
            // plusieurs (cadreur ET electro) ; les champs plats n'en decrivent
            // qu'une, la deuxieme etait donc introuvable par departement ou par
            // fonction. Les champs plats restent testes : ils sont les seuls
            // remplis sur les profils d'avant les casquettes.
            if(dept) {
                results = results.filter(p => p.department === dept
                    || Universe._fichesCrew(p).some(f => (f.department || f.group_id) === dept));
            }
            if(role) {
                results = results.filter(p => (p.role && p.role.toLowerCase().includes(role))
                    || Universe._fichesCrew(p).some(f => f.role && f.role.toLowerCase().includes(role)));
            }
        }
        
        // v601 : L'AGE N'EST PLUS UN FILTRE DE COMEDIEN, c'en est un pour
        // tout le monde — on cherche aussi un chef op de moins de 40 ans.
        // Il est donc applique AVANT le tri par type, et le champ vit
        // desormais dans les filtres communs.
        const ageMin = document.getElementById('universe-age-min')?.value;
        const ageMax = document.getElementById('universe-age-max')?.value;
        if(ageMin) results = results.filter(p => p.age && parseInt(p.age) >= parseInt(ageMin));
        if(ageMax) results = results.filter(p => p.age && parseInt(p.age) <= parseInt(ageMax));

        // Filtres comédiens
        if(type === 'actor') {
            const gender = document.getElementById('universe-actor-gender')?.value;
            const heightMin = document.getElementById('universe-actor-height-min')?.value;
            const heightMax = document.getElementById('universe-actor-height-max')?.value;
            const weightMin = document.getElementById('universe-actor-weight-min')?.value;
            const weightMax = document.getElementById('universe-actor-weight-max')?.value;
            const eyes = document.getElementById('universe-actor-eyes')?.value;
            const hair = document.getElementById('universe-actor-hair')?.value;
            const hairLength = document.getElementById('universe-actor-hair-length')?.value;
            const ethnicity = document.getElementById('universe-actor-ethnicity')?.value;
            const corpulence = document.getElementById('universe-actor-corpulence')?.value;
            const sports = document.getElementById('universe-actor-sports')?.value.trim().toLowerCase();
            const languages = document.getElementById('universe-actor-languages')?.value.trim().toLowerCase();
            
            if(gender) results = results.filter(p => p.gender === gender);
            if(heightMin) results = results.filter(p => p.height && parseInt(p.height) >= parseInt(heightMin));
            if(heightMax) results = results.filter(p => p.height && parseInt(p.height) <= parseInt(heightMax));
            if(weightMin) results = results.filter(p => p.weight && parseInt(p.weight) >= parseInt(weightMin));
            if(weightMax) results = results.filter(p => p.weight && parseInt(p.weight) <= parseInt(weightMax));
            if(eyes) results = results.filter(p => p.eyeColor === eyes);
            if(hair) results = results.filter(p => p.hairColor === hair);
            if(hairLength) results = results.filter(p => p.hairLength === hairLength);
            if(ethnicity) results = results.filter(p => p.ethnicity === ethnicity);
            if(corpulence) results = results.filter(p => p.corpulence === corpulence);
            if(sports) results = results.filter(p => p.sports && p.sports.toLowerCase().includes(sports));
            if(languages) results = results.filter(p => p.languages && p.languages.toLowerCase().includes(languages));
            
            const bonnet = document.getElementById('universe-actor-bonnet')?.value;
            const bustType = document.getElementById('universe-actor-bust-type')?.value;
            
            if(bonnet) results = results.filter(p => p.bonnet === bonnet);
            if(bustType) results = results.filter(p => p.bustType === bustType);
        }
        
        // Filtres associations
        if(type === 'association') {
            const assoType = document.getElementById('universe-association-type')?.value;
            if(assoType) {
                results = results.filter(p => p.assoType === assoType);
            }
        }
        
        // Filtres entreprises
        if(type === 'enterprise') {
            const entType = document.getElementById('universe-enterprise-type')?.value;
            if(entType) {
                results = results.filter(p => p.entType === entType);
            }
        }
        
        if(radiusActive) results = await UniverseSearch._applyRadius(results, city, radiusStr);
        Universe.filteredProfiles = results;
        Universe.filteredProjects = [];
        UniverseSearch.renderSearchResults();
        
        // Toast de résultats
        const count = results.length;
        if(count === 0) {
            Utils.toast('Aucun résultat trouvé', 'warning');
        } else {
            Utils.toast(`${count} profil${count > 1 ? 's' : ''} trouvé${count > 1 ? 's' : ''}`, 'success');
        }
    },
    
    // Affiche les résultats de recherche
    renderSearchResults: async () => {
        const scene = document.getElementById('universe-scene');
        if(!scene) return;
        
        // Arrêter l'animation précédente
        Universe.animationRunning = false;
        Universe.cards = [];
        
        // Si mode carte, mettre à jour les marqueurs filtrés
        if(Universe.viewMode === 'map') {
            await UniverseSearch.loadFilteredMapMarkers();
            return;
        }
        
        // Sinon afficher en mode éventail
        scene.innerHTML = '';
        UniverseSearch.renderSearchResultsFan(scene);
    },
    
    // Charger les marqueurs filtrés sur la carte
    loadFilteredMapMarkers: async () => {
        if(!Universe.map || !Universe.markersLayer) return;
        
        Universe.markersLayer.clearLayers();
        Universe.cityPositionCounters = {}; // Reset des compteurs
        
        // Utiliser les résultats filtrés
        const items = [...Universe.filteredProfiles, ...Universe.filteredProjects];
        
        if(items.length === 0) {
            Utils.toast('Aucun résultat à afficher sur la carte', 'info');
            return;
        }
        
        for(let i = 0; i < items.length; i += 10) {
            const batch = items.slice(i, i + 10);
            
            await Promise.all(batch.map(async (item) => {
                const city = item.city || item.location || '';
                
                // Priorité 1 : coordonnées précises stockées directement sur le profil
                let coords = null;
                if(item.latitude != null && item.longitude != null) {
                    coords = { lat: item.latitude, lng: item.longitude };
                }
                
                // Priorité 2 : géocodage via la ville (DB → cache → Nominatim)
                if(!coords && city) {
                    coords = await Universe.geocodeCity(city);
                }
                
                if(!city && !coords) return;
                if(coords) {
                    // Décalage déterministe basé sur l'ID du profil (fixe, pas aléatoire)
                    const shouldHide = Universe.shouldHideAddress(item);
                    let finalCoords;
                    if(shouldHide) {
                        finalCoords = Universe.getDeterministicOffset(item.id, coords.lat, coords.lng);
                        item._hasApproximateLocation = true;
                    } else {
                        finalCoords = { lat: coords.lat, lng: coords.lng };
                        item._hasApproximateLocation = false;
                    }
                    
                    const marker = Universe.createMapMarker(item, finalCoords);
                    Universe.markersLayer.addLayer(marker);
                }
            }));
            
            if(i + 10 < items.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // Zoomer sur les résultats
        if(Universe.markersLayer.getLayers().length > 0) {
            Universe.map.fitBounds(Universe.markersLayer.getBounds(), { padding: [50, 50] });
        }
    },
    
    // Rendu des résultats de recherche en mode Éventail
    renderSearchResultsFan: (scene) => {
        scene.innerHTML = '';
        scene.style.overflow = 'auto';
        
        const container = document.createElement('div');
        container.className = 'universe-fan-container';
        
        // Séparer profils et projets des résultats
        const actors = Universe.filteredProfiles.filter(p => p.type === 'actor');
        const crew = Universe.filteredProfiles.filter(p => p.type === 'crew');
        const associations = Universe.filteredProfiles.filter(p => p.type === 'association');
        const enterprises = Universe.filteredProfiles.filter(p => p.type === 'enterprise');
        const projects = Universe.filteredProjects;
        
        // Message si aucun résultat
        if(actors.length === 0 && crew.length === 0 && associations.length === 0 && enterprises.length === 0 && projects.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px; color: var(--text-sec);">
                    <div style="font-size: 3rem; margin-bottom: 15px;">🔍</div>
                    <h3>Aucun résultat</h3>
                    <p>Essayez avec d'autres critères de recherche.</p>
                </div>
            `;
            scene.appendChild(container);
            return;
        }
        
        // Catégorie Comédiens trouvés
        if(actors.length > 0) {
            const actorCategory = Universe.createFanCategory(`🎭 Comédiens trouvés`, actors.slice(0, 20), false);
            container.appendChild(actorCategory);
        }
        
        // Catégorie Techniciens trouvés
        if(crew.length > 0) {
            const crewCategory = Universe.createFanCategory(`🎥 Techniciens trouvés`, crew.slice(0, 20), false);
            container.appendChild(crewCategory);
        }
        
        // Catégorie Associations trouvées
        if(associations.length > 0) {
            const assoCategory = Universe.createFanCategory(`🏛️ Associations trouvées`, associations.slice(0, 20), false);
            container.appendChild(assoCategory);
        }
        
        // Catégorie Entreprises trouvées
        if(enterprises.length > 0) {
            const entCategory = Universe.createFanCategory(`🏢 Entreprises trouvées`, enterprises.slice(0, 20), false);
            container.appendChild(entCategory);
        }
        
        // Catégorie Projets trouvés
        if(projects.length > 0) {
            const projectCategory = Universe.createFanCategory(`🎬 Projets trouvés`, projects.slice(0, 15), false);
            container.appendChild(projectCategory);
        }
        
        scene.appendChild(container);
    },
    
    // Reset la recherche
    reset: () => {
        // v601 : « Reinitialiser » efface AUSSI la recherche par projet —
        // sinon la carte et la liste continueraient de ne montrer que ses
        // trouves, et l'on se demanderait ou sont passes les autres.
        try { if(typeof CastingMatch !== 'undefined') CastingMatch.effacer(); } catch(e) {}
        document.getElementById('universe-type').value = '';
        document.getElementById('universe-department').value = '';
        document.getElementById('universe-city').value = '';
        document.getElementById('universe-distance').value = '500';
        document.getElementById('universe-distance-label').textContent = '∞';
        
        // Reset filtres comédiens
        if(document.getElementById('universe-actor-gender')) document.getElementById('universe-actor-gender').value = '';
        if(document.getElementById('universe-age-min')) document.getElementById('universe-age-min').value = '';
        if(document.getElementById('universe-age-max')) document.getElementById('universe-age-max').value = '';
        if(document.getElementById('universe-actor-height-min')) document.getElementById('universe-actor-height-min').value = '';
        if(document.getElementById('universe-actor-height-max')) document.getElementById('universe-actor-height-max').value = '';
        if(document.getElementById('universe-actor-weight-min')) document.getElementById('universe-actor-weight-min').value = '';
        if(document.getElementById('universe-actor-weight-max')) document.getElementById('universe-actor-weight-max').value = '';
        if(document.getElementById('universe-actor-eyes')) document.getElementById('universe-actor-eyes').value = '';
        if(document.getElementById('universe-actor-hair')) document.getElementById('universe-actor-hair').value = '';
        if(document.getElementById('universe-actor-hair-length')) document.getElementById('universe-actor-hair-length').value = '';
        if(document.getElementById('universe-actor-ethnicity')) document.getElementById('universe-actor-ethnicity').value = '';
        if(document.getElementById('universe-actor-corpulence')) document.getElementById('universe-actor-corpulence').value = '';
        if(document.getElementById('universe-actor-sports')) document.getElementById('universe-actor-sports').value = '';
        if(document.getElementById('universe-actor-languages')) document.getElementById('universe-actor-languages').value = '';
        if(document.getElementById('universe-actor-bonnet')) document.getElementById('universe-actor-bonnet').value = '';
        if(document.getElementById('universe-actor-bust-type')) document.getElementById('universe-actor-bust-type').value = '';
        
        // Reset filtres techniciens
        if(document.getElementById('universe-crew-role')) document.getElementById('universe-crew-role').value = '';
        
        // Reset filtres projets
        if(document.getElementById('universe-project-type')) document.getElementById('universe-project-type').value = '';
        if(document.getElementById('universe-project-genre')) document.getElementById('universe-project-genre').value = '';
        if(document.getElementById('universe-project-has-actor-needs')) document.getElementById('universe-project-has-actor-needs').checked = false;
        if(document.getElementById('universe-project-has-crew-needs')) document.getElementById('universe-project-has-crew-needs').checked = false;
        
        // Reset filtres associations
        if(document.getElementById('universe-association-type')) document.getElementById('universe-association-type').value = '';
        
        // Reset filtres entreprises
        if(document.getElementById('universe-enterprise-type')) document.getElementById('universe-enterprise-type').value = '';
        
        // Masquer les filtres spécifiques
        document.getElementById('universe-filters-crew').style.display = 'none';
        document.getElementById('universe-filters-actor').style.display = 'none';
        document.getElementById('universe-filters-project').style.display = 'none';
        document.getElementById('universe-filters-association').style.display = 'none';
        document.getElementById('universe-filters-enterprise').style.display = 'none';
        
        Universe.searchActive = false;
        Universe.filteredProfiles = [];
        Universe.filteredProjects = [];
        Universe.render();
    },
};
