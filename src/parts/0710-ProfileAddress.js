
  const ProfileAddress = {
    // Recherche d'adresse avec autocomplétion (API adresse.data.gouv.fr)
    // Géocodage international via Nominatim (fallback si BAN ne trouve pas + profils étrangers)
    // Utilise la file d'attente Universe._nominatimQueue pour respecter 1 req/s
    geocodeAddressInternational: async (address) => {
        if(!address || !address.trim()) return null;
        
        // Réutilise la file d'attente globale de Universe pour respecter le rate limit OSM
        if(typeof Universe === 'undefined') return null;
        if(!Universe._nominatimQueue) Universe._nominatimQueue = Promise.resolve();
        
        const task = Universe._nominatimQueue.then(async () => {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=0`, {
                    headers: { 'Accept': 'application/json' }
                });
                if(!response.ok) {
                    console.warn(`Nominatim HTTP ${response.status} pour "${address}"`);
                    return null;
                }
                const data = await response.json();
                if(data && data.length > 0) {
                    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                }
            } catch(e) {
                console.warn('Nominatim error:', e);
            }
            return null;
        });
        
        Universe._nominatimQueue = task.then(() => new Promise(r => setTimeout(r, 1100)));
        return task;
    },
    
    // Autocomplétion des sièges (asso / entreprise) — même BAN que l'adresse perso
    searchHqAddress: async (facet, query) => {
        const suggestions = document.getElementById('profile-' + facet + '-hq-suggestions');
        if(!suggestions) return;
        if(!query || query.length < 3) { suggestions.classList.remove('visible'); return; }
        try {
            const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
            const data = await response.json();
            if(data.features && data.features.length > 0) {
                suggestions.innerHTML = data.features.map(f => {
                    const props = f.properties;
                    const label = props.label || '';
                    const coords = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : [null, null];
                    return `<div class="address-suggestion" onclick="app.ProfileAddress.selectHqAddress('${facet}', '${Utils.escape(label).replace(/'/g, "\\'")}', ${coords[1]}, ${coords[0]})">
                        <div class="address-suggestion-main">${Utils.escape(props.name || label.split(',')[0])}</div>
                        <div class="address-suggestion-secondary">${Utils.escape(props.context || '')}</div>
                    </div>`;
                }).join('');
                suggestions.classList.add('visible');
            } else {
                suggestions.innerHTML = '<div class="address-suggestion" style="color:var(--text-sec); cursor:default;">Aucun résultat</div>';
                suggestions.classList.add('visible');
            }
        } catch(e) {
            console.error('Erreur recherche adresse siège:', e);
            suggestions.classList.remove('visible');
        }
    },

    selectHqAddress: (facet, address, lat, lng) => {
        const input = document.getElementById('profile-' + facet + '-hq');
        if(!input) return;
        input.value = address;
        if(lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
            input.dataset.lat = lat;
            input.dataset.lng = lng;
        } else {
            delete input.dataset.lat;
            delete input.dataset.lng;
        }
        const sg = document.getElementById('profile-' + facet + '-hq-suggestions');
        if(sg) sg.classList.remove('visible');
    },

    searchAddress: async (query) => {
        const suggestions = document.getElementById('profile-address-suggestions');
        if(!suggestions) return;
        
        if(!query || query.length < 3) {
            suggestions.classList.remove('visible');
            return;
        }
        
        try {
            const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
            const data = await response.json();
            
            if(data.features && data.features.length > 0) {
                suggestions.innerHTML = data.features.map(f => {
                    const props = f.properties;
                    const label = props.label || '';
                    const context = props.context || '';
                    // Les coords BAN sont dans geometry.coordinates = [lng, lat]
                    const coords = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : [null, null];
                    const lng = coords[0];
                    const lat = coords[1];
                    return `<div class="address-suggestion" onclick="app.ProfileAddress.selectAddress('${Utils.escape(label).replace(/'/g, "\\'")}', '${props.city || ''}', ${lat}, ${lng})">
                        <div class="address-suggestion-main">${Utils.escape(props.name || label.split(',')[0])}</div>
                        <div class="address-suggestion-secondary">${Utils.escape(context)}</div>
                    </div>`;
                }).join('');
                suggestions.classList.add('visible');
            } else {
                suggestions.innerHTML = '<div class="address-suggestion" style="color:var(--text-sec); cursor:default;">Aucun résultat</div>';
                suggestions.classList.add('visible');
            }
        } catch(e) {
            console.error('Erreur recherche adresse:', e);
            suggestions.classList.remove('visible');
        }
    },
    
    // Sélectionner une adresse (stocke aussi lat/lng via dataset pour sauvegarde ultérieure)
    selectAddress: (address, city, lat, lng) => {
        const addressInput = document.getElementById('profile-address');
        addressInput.value = address;
        // Stocker les coordonnées dans le dataset de l'input pour que saveFormToCurrentProfile les récupère
        if(lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
            addressInput.dataset.lat = lat;
            addressInput.dataset.lng = lng;
        } else {
            delete addressInput.dataset.lat;
            delete addressInput.dataset.lng;
        }
        if(city && !document.getElementById('profile-city').value) {
            document.getElementById('profile-city').value = city;
        }
        document.getElementById('profile-address-suggestions').classList.remove('visible');
    },
    
    // Met à jour les options de confidentialité selon le type de profil
    updateAddressPrivacyOptions: () => {
        const isActor = document.getElementById('profile-type-actor')?.checked || false;
        const isCrew = document.getElementById('profile-type-crew')?.checked || false;
        const isAssociation = document.getElementById('profile-type-association')?.checked || false;
        const isEnterprise = document.getElementById('profile-type-enterprise')?.checked || false;
        
        const privacyDiv = document.getElementById('profile-address-privacy');
        const hideAddressLabel = document.getElementById('profile-hide-address-label');
        const hideAddressProjectsLabel = document.getElementById('profile-hide-address-projects-label');
        const addressInfo = document.getElementById('profile-address-info');
        
        if(!privacyDiv) return;
        
        // Afficher le bloc de confidentialité
        privacyDiv.style.display = 'flex';
        
        if(isActor || isCrew) {
            // Comédiens/Techniciens : adresse toujours masquée dans l'Univers, option pour projets
            hideAddressLabel.style.display = 'none';
            hideAddressProjectsLabel.style.display = 'flex';
            addressInfo.style.display = 'block';
        } else if(isAssociation || isEnterprise) {
            // Associations/Entreprises : choix de masquer ou non
            hideAddressLabel.style.display = 'flex';
            hideAddressProjectsLabel.style.display = 'none';
            addressInfo.style.display = 'none';
        } else {
            privacyDiv.style.display = 'none';
        }
    },
  };
