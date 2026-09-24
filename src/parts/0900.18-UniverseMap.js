
const UniverseMap = {
    // Initialiser la carte
    initMap: async () => {
        await LazyLib.load('leaflet');
        if(Universe.map) return; // Déjà initialisée
        
        const mapContainer = document.getElementById('universe-map');
        if(!mapContainer) return;
        
        // Créer la carte centrée sur la France
        Universe.map = L.map('universe-map', {
            center: [46.603354, 1.888334],
            zoom: 5,
            minZoom: 2,
            maxZoom: 18,
            zoomControl: true
        });
        
        // Tuiles selon le thème
        UniverseMap.updateMapTheme();
        
        // Groupe de marqueurs avec clustering
        Universe.markersLayer = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 14,
            spiderfyDistanceMultiplier: 1.5,
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                let size = 'small';
                if(count > 10) size = 'medium';
                if(count > 50) size = 'large';
                return L.divIcon({
                    html: `<div>${count}</div>`,
                    className: `marker-cluster marker-cluster-${size}`,
                    iconSize: [40, 40]
                });
            }
        });
        
        Universe.map.addLayer(Universe.markersLayer);
        
        // Événement hover sur cluster
        Universe.markersLayer.on('clustermouseover', (e) => {
            const cluster = e.layer;
            const markers = cluster.getAllChildMarkers();
            if(markers.length > 0) {
                const randomMarker = markers[Math.floor(Math.random() * markers.length)];
                UniverseMap.showHoverCard(randomMarker.options.profileData, e.originalEvent);
            }
        });
        
        Universe.markersLayer.on('clustermouseout', () => {
            UniverseMap.hideHoverCard();
        });
        
        // NOTE: On ne recharge plus les marqueurs au déplacement/zoom
        // car les positions sont maintenant fixes (déterministes)
    },
    
    // Ajoute un léger décalage aléatoire pour éviter la superposition
    addCoordOffset: (lat, lng) => {
        const offset = 0.002; // ~200m de décalage max
        const randomLat = lat + (Math.random() - 0.5) * offset;
        const randomLng = lng + (Math.random() - 0.5) * offset;
        return { lat: randomLat, lng: randomLng };
    },
    
    // Génère un décalage déterministe basé sur l'ID du profil (toujours le même pour un même profil)
    getDeterministicOffset: (profileId, lat, lng) => {
        // Hash simple basé sur l'ID pour générer un nombre pseudo-aléatoire reproductible
        let hash = 0;
        const str = String(profileId);
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Utiliser le hash pour générer un décalage entre -0.003 et +0.003 (~300m)
        const offsetRange = 0.003;
        const latOffset = ((hash % 1000) / 1000 - 0.5) * offsetRange * 2;
        const lngOffset = (((hash >> 10) % 1000) / 1000 - 0.5) * offsetRange * 2;
        
        return {
            lat: lat + latOffset,
            lng: lng + lngOffset
        };
    },
    
    // Détermine si l'adresse doit être masquée pour ce profil
    shouldHideAddress: (profile) => {
        // Comédiens et techniciens : toujours masqué dans l'Univers
        if (profile.type === 'actor' || profile.type === 'crew') {
            return true;
        }
        // Associations et entreprises : selon leur choix
        if (profile.type === 'association' || profile.type === 'enterprise') {
            return profile.hideAddress === true;
        }
        // Projets : hérite du porteur de projet
        if (profile.type === 'project') {
            return true; // On masque par défaut pour les projets
        }
        return false;
    },
    
    // Géocoder une ville : DB > cache mémoire > localStorage > Nominatim (throttlé)
    geocodeCity: async (city) => {
        if(!city) return null;
        
        const cityKey = city.toLowerCase().trim();
        
        // 1) Cache mémoire (le plus rapide)
        if(Universe.geoCache[cityKey]) {
            return Universe.geoCache[cityKey];
        }
        
        // 2) localStorage (persistant entre sessions)
        try {
            const cached = localStorage.getItem('fmp_geocache');
            if(cached) {
                const cacheData = JSON.parse(cached);
                if(cacheData[cityKey]) {
                    Universe.geoCache[cityKey] = cacheData[cityKey];
                    return cacheData[cityKey];
                }
            }
        } catch(e) {}
        
        // 3) Base Supabase — coordonnées pré-calculées côté serveur
        //    (colonnes latitude/longitude ajoutées via patch_C1 + remplies via patch_C2)
        try {
            // v602 : les coordonnees ne se lisent plus en direct ; la
            // fonction serveur ne rend que celles d'une ville.
            const { data: _coords, error: dbErr } = await supabase.rpc('coordonnees_ville', { p_ville: city.trim() });
            const dbRow = (_coords && _coords[0]) || null;
            
            if(!dbErr && dbRow && dbRow.latitude != null && dbRow.longitude != null) {
                const result = { lat: dbRow.latitude, lng: dbRow.longitude };
                Universe.geoCache[cityKey] = result;
                // Persister dans localStorage pour accélérer la prochaine fois
                try {
                    const cached = localStorage.getItem('fmp_geocache');
                    const cacheData = cached ? JSON.parse(cached) : {};
                    cacheData[cityKey] = result;
                    localStorage.setItem('fmp_geocache', JSON.stringify(cacheData));
                } catch(e) {}
                return result;
            }
        } catch(e) {
            console.warn('DB geocoding lookup failed:', e);
        }
        
        // 4) Fallback Nominatim avec throttle 1.1s (respect usage policy OSM)
        //    File d'attente globale pour ne jamais dépasser 1 requête/seconde
        if(!Universe._nominatimQueue) Universe._nominatimQueue = Promise.resolve();
        
        const task = Universe._nominatimQueue.then(async () => {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`, {
                    headers: { 'Accept': 'application/json' }
                });
                if(!response.ok) {
                    console.warn(`Nominatim HTTP ${response.status} pour "${city}"`);
                    return null;
                }
                const data = await response.json();
                
                if(data && data.length > 0) {
                    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                    Universe.geoCache[cityKey] = result;
                    try {
                        const cached = localStorage.getItem('fmp_geocache');
                        const cacheData = cached ? JSON.parse(cached) : {};
                        cacheData[cityKey] = result;
                        localStorage.setItem('fmp_geocache', JSON.stringify(cacheData));
                    } catch(e) {}
                    return result;
                }
            } catch(e) {
                console.warn('Geocoding error:', e);
            }
            return null;
        });
        
        // Délai de 1100ms avant de libérer la file pour la prochaine requête
        Universe._nominatimQueue = task.then(() => new Promise(r => setTimeout(r, 1100)));
        
        return task;
    },
    
    // Créer un marqueur pour un profil
    createMapMarker: (profile, coords) => {
        const vf = profile.visibleFacets || (PublicProfile._typeToFacet(profile.type) ? [PublicProfile._typeToFacet(profile.type)] : []);
        const isProject = profile.type === 'project';
        const isActor = vf.includes('actor');
        const isCrew = vf.includes('crew');
        const isAssociation = vf.includes('asso');
        const isEnterprise = vf.includes('ent');
        
        let markerClass = 'map-profile-marker';
        if(isProject) markerClass += ' project-marker';
        else if(isActor) markerClass += ' actor-marker';
        else if(isCrew) markerClass += ' crew-marker';
        else if(isAssociation) markerClass += ' association-marker';
        else if(isEnterprise) markerClass += ' enterprise-marker';
        
        const photoUrl = profile.photo || profile.photoURL || profile.mainPhoto || '';
        const FACET_ICONS = { actor: '🎭', crew: '🎥', asso: '🏛️', ent: '🏢' };
        const defaultIcon = isProject ? '🎬' : (FACET_ICONS[vf[0]] || '🎥');
        const name = profile.displayName || profile.title || profile.name || 'Sans nom';
        const facetBadges = (!isProject && vf.length > 1) ? `<div class="marker-facet-badges">${vf.map(k => FACET_ICONS[k]).join('')}</div>` : '';
        
        const iconHtml = `
            <div class="${markerClass}">
                ${facetBadges}
                ${photoUrl ? `<img src="${Utils.safeMediaUrl(photoUrl)}" alt="${Utils.escape(name)}" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:40px;display:flex;align-items:center;justify-content:center;background:var(--panel-bg);border-radius:6px;font-size:20px;\\'>${defaultIcon}</div>'">` : `<div style="width:100%;height:40px;display:flex;align-items:center;justify-content:center;background:var(--panel-bg);border-radius:6px;border:2px solid var(--primary);font-size:20px;">${defaultIcon}</div>`}
                <div class="marker-label">${Utils.escape(name)}</div>
            </div>
        `;
        
        const icon = L.divIcon({
            html: iconHtml,
            className: 'map-marker-container',
            iconSize: [40, 50],
            iconAnchor: [20, 50]
        });
        
        // Ajouter un léger décalage pour éviter la superposition
        const offsetCoords = UniverseMap.addCoordOffset(coords.lat, coords.lng);
        // I6: mémoriser la position réelle du marker dans un dict indexé par id (pour tracer les lignes frères)
        if(profile.id) {
            Universe.markerPositions[profile.id] = { lat: offsetCoords.lat, lng: offsetCoords.lng };
        }
        const marker = L.marker([offsetCoords.lat, offsetCoords.lng], { 
            icon: icon,
            profileData: profile
        });
        
        // Événements hover
        marker.on('mouseover', (e) => {
            UniverseMap.showHoverCard(profile, e.originalEvent);
            // I6: au survol, tracer des lignes vers les profils frères (si ce n'est pas un projet)
        });
        
        marker.on('mouseout', () => {
            UniverseMap.hideHoverCard();
        });
        
        // Clic pour ouvrir le profil ou projet
        marker.on('click', () => {
            UniverseMap.hideHoverCard();
            if(isProject) {
                Universe.openProjectModal(profile);
            } else {
                Universe.openProfileModal(profile);
            }
        });
        
        return marker;
    },
    
    // Afficher la modale de profil (pour tous les profils)
    // UniverseMap.showProfileModal retirée v569 : orpheline en cascade
    // depuis le retrait de sa façade Universe (étape 3). openProfileModal
    // (UniverseFan) est le chemin réel utilisé pour ouvrir un profil.


    // Afficher la carte de survol
    showHoverCard: (profile, event) => {
        // v601 — LA CARTE DE SURVOL SE RECREE SI ELLE A DISPARU. Elle est
        // declaree dans le HTML, DANS la scene de l'Univers — or la vue Liste
        // remplace le contenu de cette scene. Apres un passage par la liste,
        // l'element n'existait plus et le survol des marqueurs ne montrait
        // plus rien, sans la moindre erreur. Trouve en eprouvant le survol,
        // et c'est un defaut ANCIEN : il ne demandait pas la recherche par
        // projet pour se produire, juste d'etre alle voir la liste.
        let hoverDiv = document.getElementById('map-hover-card');
        if(!hoverDiv) {
            const scene = document.getElementById('universe-scene') || document.body;
            hoverDiv = document.createElement('div');
            hoverDiv.id = 'map-hover-card';
            hoverDiv.className = 'map-hover-card';
            scene.appendChild(hoverDiv);
        }
        
        const card = Universe.createFanCard(profile, false);
        hoverDiv.innerHTML = '';
        hoverDiv.appendChild(card);
        // v601 — QUAND UNE RECHERCHE PAR PROJET EST EN COURS, LE SURVOL DIT
        // POUR QUEL POSTE cette personne ressort. C'est la seule chose qui
        // manque a un marqueur : on voit OU elle est, pas POURQUOI elle est
        // la. Le nom plutot qu'un symbole — « cadreur » et « perchman » ne se
        // devinent pas dans un pictogramme.
        try {
            if(typeof CastingMatch !== 'undefined' && CastingMatch.actif()) {
                const postes = CastingMatch.postesDe(profile);
                if(postes.length) {
                    const ligne = document.createElement('div');
                    ligne.className = 'hover-postes';
                    ligne.textContent = '🎯 ' + postes.join(' · ');
                    card.appendChild(ligne);
                }
            }
        } catch(e) {}
        
        // Positionner près de la souris
        const x = event.clientX + 15;
        const y = event.clientY - 100;
        
        hoverDiv.style.left = Math.min(x, window.innerWidth - 220) + 'px';
        hoverDiv.style.top = Math.max(y, 10) + 'px';
        hoverDiv.style.display = 'block';
    },
    
    // Masquer la carte de survol
    hideHoverCard: () => {
        const hoverDiv = document.getElementById('map-hover-card');
        if(hoverDiv) hoverDiv.style.display = 'none';
    },
    
    // Charger les marqueurs sur la carte
    loadMapMarkers: async () => {
        // Si des filtres sont actifs, utiliser les résultats filtrés
        if(Universe.searchActive) {
            await Universe.loadFilteredMapMarkers();
        } else {
            await UniverseMap.loadMapMarkersInView();
        }
    },
    
    // Charge max 100 profils visibles dans la zone de la carte
    loadMapMarkersInView: async () => {
        if(!Universe.map || !Universe.markersLayer) return;
        
        Universe.markersLayer.clearLayers();
        Universe.cityPositionCounters = {}; // Reset des compteurs
        
        // Récupérer le type sélectionné pour filtrer même sans recherche
        const selectedType = document.getElementById('universe-type')?.value;
        
        let profiles = [...Universe.allProfiles];
        let projects = [...Universe.allProjects];
        
        // Filtrer par type si sélectionné
        if(selectedType) {
            if(selectedType === 'project') {
                profiles = [];
            } else {
                profiles = profiles.filter(p => (p.visibleFacets || []).some(k => PublicProfile._facetKind(k) === PublicProfile._typeToFacet(selectedType)) || p.type === selectedType);
                projects = [];
            }
        }
        
        // Combiner les résultats filtrés
        const allItems = [...profiles, ...projects];
        
        // Mélanger aléatoirement
        const shuffled = Universe.shuffleArray(allItems);
        
        // Limiter à 500 profils max
        const maxProfiles = 500;
        const limitedItems = shuffled.slice(0, maxProfiles);
        
        // Obtenir les bounds actuels de la carte
        const bounds = Universe.map.getBounds();
        
        // Charger les marqueurs par batch
        // Batch plus grand car coords désormais pré-calculées (DB + profil.latitude/longitude)
        const batchSize = 50;
        
        for(let i = 0; i < limitedItems.length; i += batchSize) {
            const batch = limitedItems.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (item) => {
                const city = item.city || item.location || '';
                
                // Priorité 1 : coordonnées précises stockées directement sur le profil
                let coords = null;
                if(item.latitude != null && item.longitude != null) {
                    coords = { lat: item.latitude, lng: item.longitude };
                }
                
                // Priorité 2 : géocodage via la ville (DB → cache → Nominatim)
                if(!coords && city) {
                    coords = await UniverseMap.geocodeCity(city);
                }
                
                if(coords) {
                    // Décalage déterministe basé sur l'ID du profil (fixe, pas aléatoire)
                    const shouldHide = UniverseMap.shouldHideAddress(item);
                    let finalCoords;
                    if(shouldHide) {
                        finalCoords = UniverseMap.getDeterministicOffset(item.id, coords.lat, coords.lng);
                        item._hasApproximateLocation = true;
                    } else {
                        finalCoords = { lat: coords.lat, lng: coords.lng };
                        item._hasApproximateLocation = false;
                    }
                    
                    const marker = UniverseMap.createMapMarker(item, finalCoords);
                    Universe.markersLayer.addLayer(marker);
                }
            }));
            
            // Pas de délai entre batches : coords déjà pré-calculées, plus besoin de ménager Nominatim
            // Le throttle reste actif dans geocodeCity pour les rares villes inconnues (fallback)
        }
    },
    
    // Mettre à jour le thème de la carte
    updateMapTheme: () => {
        if(!Universe.map) return;
        
        const isDark = document.body.classList.contains('dark-mode');
        
        // Supprimer l'ancien layer
        if(Universe.tileLayer) {
            Universe.map.removeLayer(Universe.tileLayer);
        }
        
        // TUILES — OpenStreetMap standard, sans cle.
        // Jusqu'ici : CARTO (dark_all / light_all). Fin aout 2026, CARTO s'est
        // mis a tatouer « API KEY REQUIRED » sur toute tuile demandee sans cle,
        // et annonce le retrait de son service raster. Une cle gratuite existe
        // mais elle est reservee a un usage NON COMMERCIAL : inadaptee ici.
        // On passe donc au fond OSM, deja utilise par l'autre carte du site.
        //
        // CARTO offrait deux fonds, clair et sombre. OSM n'en a qu'un : le mode
        // sombre est obtenu par un filtre CSS pose sur la seule couche des
        // tuiles (.leaflet-tile-pane), donc SANS toucher aux marqueurs, qui
        // vivent dans une autre couche et gardent leurs couleurs.
        Universe.tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19
        });
        
        Universe.tileLayer.addTo(Universe.map);
        
        // Mettre à jour le fond du conteneur
        const mapContainer = document.getElementById('universe-map');
        if(mapContainer) {
            mapContainer.style.background = isDark ? '#1a1a2e' : '#f4f6f8';
            mapContainer.classList.toggle('map-tiles-dark', isDark);
        }
    },

    // Changer le mode de vue
    setViewMode: async (mode) => {
        Universe.viewMode = mode;
        
        const mapBtn = document.getElementById('view-mode-map');
        const fanBtn = document.getElementById('view-mode-fan');
        const triBtn = document.getElementById('view-mode-tri');
        let mapContainer = document.getElementById('universe-map');
        const scene = document.getElementById('universe-scene');

        // v601 — TROISIEME VUE : LE TRI AU POUCE. Elle ne montre pas l'Univers
        // entier mais le RESULTAT d'une recherche pour un projet : une pile de
        // cartes qu'on garde ou qu'on ecarte. Elle est donc traitee a part, et
        // elle range les deux autres plutot que de cohabiter avec elles.
        const allumer = (btn, actif) => {
            if(!btn) return;
            btn.style.background = actif ? 'var(--primary)' : 'var(--bg)';
            btn.style.color = actif ? 'white' : 'var(--text-main)';
            btn.style.border = actif ? 'none' : '1px solid var(--border)';
        };
        let tri = document.getElementById('universe-tri');
        if(mode === 'tri') {
            allumer(mapBtn, false); allumer(fanBtn, false); allumer(triBtn, true);
            if(mapContainer) mapContainer.style.display = 'none';
            const fanContainer = scene.querySelector('.universe-fan-container');
            if(fanContainer) fanContainer.remove();
            if(!tri) {
                tri = document.createElement('div');
                tri.id = 'universe-tri';
                tri.className = 'universe-tri';
                scene.appendChild(tri);
            }
            tri.style.display = 'flex';
            // v601 — ON NE REFAIT PAS LA RECHERCHE EN REVENANT. La vue Liste
            // remplace le contenu de la scene, donc le conteneur du tri est
            // DETRUIT quand on la quitte — et avec lui tout ce qui etait
            // affiche. Le resultat, lui, n'a jamais bouge : il vit dans
            // CastingMatch. On le redessine, c'est tout. Signale a l'essai :
            // « des que je quitte l'onglet tri, il faut refaire la recherche ».
            try { if(typeof CastingMatch !== 'undefined' && CastingMatch.actif()) CastingMatch.rendre(); } catch(e) {}
            return;
        }
        if(tri) tri.style.display = 'none';
        allumer(triBtn, false);
        
        if(mode === 'map') {
            mapBtn.style.background = 'var(--primary)';
            mapBtn.style.color = 'white';
            mapBtn.style.border = 'none';
            fanBtn.style.background = 'var(--bg)';
            fanBtn.style.color = 'var(--text-main)';
            fanBtn.style.border = '1px solid var(--border)';
            
            // Retirer le contenu fan s'il existe
            const fanContainer = scene.querySelector('.universe-fan-container');
            if(fanContainer) fanContainer.remove();
            
            // Recréer le conteneur de carte s'il n'existe plus
            if(!mapContainer) {
                mapContainer = document.createElement('div');
                mapContainer.id = 'universe-map';
                scene.insertBefore(mapContainer, scene.firstChild);
                
                // Réinitialiser la carte
                Universe.map = null;
                Universe.markersLayer = null;
            }
            
            mapContainer.style.display = 'block';
            
            // Init si besoin (attendre le lazy-load Leaflet) PUIS charger les marqueurs.
            // #universe-map existe en dur dans le HTML : sans cet await, le 1er affichage
            // tombait sur Universe.map encore null (Leaflet pas pret en 100 ms) -> carte vide.
            if(!Universe.map) await UniverseMap.initMap();
            if(Universe.map) {
                Universe.map.invalidateSize();
                // v601 : meme regle que la liste — la carte montre les trouves
                // de la recherche par projet, chacun avec l'icone de son poste.
                if(typeof CastingMatch !== 'undefined' && CastingMatch.actif()) await CastingMatch.rendreCarte();
                else await UniverseMap.loadMapMarkers();
            }
        } else {
            fanBtn.style.background = 'var(--primary)';
            fanBtn.style.color = 'white';
            fanBtn.style.border = 'none';
            mapBtn.style.background = 'var(--bg)';
            mapBtn.style.color = 'var(--text-main)';
            mapBtn.style.border = '1px solid var(--border)';
            
            // LE CONTENEUR DE CARTE PEUT NE PLUS EXISTER : la vue Liste remplace
            // le contenu de la scene, et la vue Tri la met de cote. Y toucher
            // sans regarder plantait des qu'on naviguait entre les trois
            // (« mapContainer is null »), signale a l'essai. On ne cache que ce
            // qui est la — la vue Carte le recree quand on y revient.
            if(mapContainer) mapContainer.style.display = 'none';
            // v601 : une recherche par projet est en cours ? La liste montre
            // SON resultat, groupe par poste — pas l'Univers entier.
            if(typeof CastingMatch !== 'undefined' && CastingMatch.actif()) CastingMatch.rendreListe(scene);
            else if(Universe.searchActive) UniverseSearch.renderSearchResultsFan(scene);
            else Universe.renderFanView(scene);
        }
    },
};
