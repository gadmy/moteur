
  const PlanningAvailPicker = {
    selectedAvailability: { actors: [], crew: [] },

    // v598 — UNE PERSONNE, UN AGENDA. Une meme personne peut tenir plusieurs
    // postes sur un projet : elle a donc plusieurs lignes d'equipe, mais un seul
    // calendrier de disponibilites. Sans regroupement, elle apparaissait deux
    // fois dans la liste et posait deux barres identiques sur chaque journee.
    // Cle du CORPS ; a defaut d'empreinte, la ligne n'est qu'elle-meme.
    _corps: (type, id) => PersonIdentity.fingerprint(PersonIdentity.recordOf(type, id)) || (type + '_' + id),

    // Les fonctions tenues par une personne sur ce projet, pour l'etiquette de
    // la liste : « Bob - Cadreur, Electro » plutot que deux lignes « Bob ».
    _fonctions: (id) => {
        const noms = PersonIdentity.peers('crew', id)
            .filter(p => p.type === 'crew')
            .map(p => (state.data.crew || []).find(c => String(c.id) === p.personId))
            .map(c => (c && c.role) ? String(c.role) : '')
            .filter(Boolean);
        return noms.filter((r, i, a) => a.indexOf(r) === i);
    },
    
    renderAvailabilitySelectors: () => {
        Planning.renderAvailabilityTags('actors');
        Planning.renderAvailabilityTags('crew');
        
        // Ajouter les event listeners pour focus/blur
        const actorsSearch = document.getElementById('planning-actors-search');
        const crewSearch = document.getElementById('planning-crew-search');
        
        if(actorsSearch && !actorsSearch.dataset.init) {
            actorsSearch.dataset.init = 'true';
            actorsSearch.addEventListener('focus', () => Planning.showDropdown('actors'));
            actorsSearch.addEventListener('blur', () => setTimeout(() => Planning.hideDropdown('actors'), 200));
        }
        if(crewSearch && !crewSearch.dataset.init) {
            crewSearch.dataset.init = 'true';
            crewSearch.addEventListener('focus', () => Planning.showDropdown('crew'));
            crewSearch.addEventListener('blur', () => setTimeout(() => Planning.hideDropdown('crew'), 200));
        }
    },
    
    renderAvailabilityTags: (type) => {
        const tagsContainer = document.getElementById(`planning-${type}-tags`);
        if(!tagsContainer) return;
        
        const selectedIds = type === 'actors' ? Planning.selectedAvailability.actors : Planning.selectedAvailability.crew;
        const dataArray = type === 'actors' ? state.data.actors : state.data.crew;
        
        if(selectedIds.length === 0) {
            tagsContainer.innerHTML = '<span class="text-sec-sm2">Aucune sélection</span>';
            return;
        }
        
        // v598 : une etiquette par personne, meme si plusieurs de ses postes
        // ont ete choisis (selection heritee d'avant le regroupement).
        const personType = (type === 'actors') ? 'actor' : 'crew';
        const vus = new Set();
        let html = '';
        selectedIds.forEach(id => {
            const person = dataArray?.find(p => p.id === id);
            const corps = PlanningAvailPicker._corps(personType, id);
            if(vus.has(corps)) return;
            if(person) {
                vus.add(corps);
                if(!person.color) person.color = CONFIG.availabilityColors[dataArray.indexOf(person) % CONFIG.availabilityColors.length];
                html += `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: linear-gradient(135deg, ${person.color}22, ${person.color}11); border: 1px solid ${person.color}; border-radius: 20px; font-size: 0.85rem;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${person.color};"></span>
                    ${Utils.escape(person.name)}
                    <button onclick="app.Planning.toggleAvailabilityPerson('${type === 'actors' ? 'actor' : 'crew'}', '${id}')" style="background: none; border: none; cursor: pointer; padding: 0; margin-left: 2px; color: var(--text-sec); font-size: 1rem; line-height: 1;">&times;</button>
                </span>`;
            }
        });
        tagsContainer.innerHTML = html;
    },
    
    showDropdown: (type) => {
        const dropdown = document.getElementById(`planning-${type}-dropdown`);
        if(dropdown) {
            dropdown.style.display = 'block';
            Planning.filterAvailabilityList(type);
        }
    },
    
    hideDropdown: (type) => {
        const dropdown = document.getElementById(`planning-${type}-dropdown`);
        if(dropdown) dropdown.style.display = 'none';
    },
    
    filterAvailabilityList: (type) => {
        const searchInput = document.getElementById(`planning-${type}-search`);
        const dropdown = document.getElementById(`planning-${type}-dropdown`);
        if(!searchInput || !dropdown) return;
        
        const query = searchInput.value.toLowerCase().trim();
        const dataArray = type === 'actors' ? state.data.actors : state.data.crew;
        const selectedIds = type === 'actors' ? Planning.selectedAvailability.actors : Planning.selectedAvailability.crew;
        
        if(!dataArray || dataArray.length === 0) {
            dropdown.innerHTML = '<div style="padding: 10px; color: var(--text-sec); text-align: center;">Aucun ' + (type === 'actors' ? 'comédien' : 'technicien') + '</div>';
            dropdown.style.display = 'block';
            return;
        }
        
        // v598 : une personne, une entree. Elle est ecartee si l'un QUELCONQUE de
        // ses postes est deja choisi, et n'est proposee qu'une fois meme si elle
        // en tient plusieurs — c'est le meme agenda.
        const personType = (type === 'actors') ? 'actor' : 'crew';
        const dejaChoisis = new Set(selectedIds.map(id => PlanningAvailPicker._corps(personType, id)));
        const dejaProposes = new Set();
        const filtered = dataArray.filter(person => {
            if(!person) return false;
            if(query && !String(person.name || '').toLowerCase().includes(query)) return false;
            const corps = PlanningAvailPicker._corps(personType, person.id);
            if(dejaChoisis.has(corps) || dejaProposes.has(corps)) return false;
            dejaProposes.add(corps);
            return true;
        });
        
        if(filtered.length === 0) {
            dropdown.innerHTML = '<div style="padding: 10px; color: var(--text-sec); text-align: center;">' + (query ? 'Aucun résultat' : 'Tous sélectionnés') + '</div>';
            dropdown.style.display = 'block';
            return;
        }
        
        let html = '';
        filtered.forEach((person, idx) => {
            if(!person.color) person.color = CONFIG.availabilityColors[dataArray.indexOf(person) % CONFIG.availabilityColors.length];
            const fonctions = (type === 'actors') ? [] : PlanningAvailPicker._fonctions(person.id);
            const role = fonctions.length ? ` - ${Utils.escape(fonctions.join(', '))}` : '';
            html += `<div onclick="app.Planning.selectFromDropdown('${type}', '${person.id}')" 
                         style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s;"
                         onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${person.color};"></span>
                <span class="flex-1">${Utils.escape(person.name)}${role}</span>
                <span style="color: var(--text-sec); font-size: 0.8rem;">+ Ajouter</span>
            </div>`;
        });
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
    },
    
    selectFromDropdown: (type, id) => {
        const personType = type === 'actors' ? 'actor' : 'crew';
        Planning.toggleAvailabilityPerson(personType, id);
        
        // Vider la recherche et mettre à jour
        const searchInput = document.getElementById(`planning-${type}-search`);
        if(searchInput) searchInput.value = '';
        Planning.filterAvailabilityList(type);
    },
    
    toggleAvailabilityPerson: (type, id) => {
        const list = type === 'actor' ? Planning.selectedAvailability.actors : Planning.selectedAvailability.crew;
        const idx = list.indexOf(id);
        if(idx > -1) {
            list.splice(idx, 1);
        } else {
            list.push(id);
        }
        Planning.renderAvailabilitySelectors();
        Planning.render();
    },
    
    getAvailabilityBarsForDate: (dateStr) => {
        let bars = [];
        // v598 : une barre par PERSONNE. Quelqu'un qui tient deux postes en
        // posait deux, identiques, sur chaque journee.
        const poses = new Set();
        
        // Vérifier les acteurs sélectionnés
        Planning.selectedAvailability.actors.forEach(actorId => {
            const actor = state.data.actors.find(a => a.id === actorId);
            if(actor && actor.availabilityDates) {
                const isAvailable = actor.availabilityDates.some(range => {
                    const from = new Date(range.from);
                    const to = new Date(range.to);
                    const check = new Date(dateStr);
                    return check >= from && check <= to;
                });
                const corps = PlanningAvailPicker._corps('actor', actor.id);
                if(isAvailable && !poses.has(corps)) {
                    poses.add(corps);
                    bars.push({ name: actor.name, color: actor.color, type: 'actor', hasVehicle: actor.hasVehicle, vehicleSeats: actor.vehicleSeats, vehicleTrunk: actor.vehicleTrunk });
                }
            }
        });
        
        // Vérifier les techniciens sélectionnés
        Planning.selectedAvailability.crew.forEach(crewId => {
            const member = state.data.crew.find(c => c.id === crewId);
            if(member && member.availabilityDates) {
                const isAvailable = member.availabilityDates.some(range => {
                    const from = new Date(range.from);
                    const to = new Date(range.to);
                    const check = new Date(dateStr);
                    return check >= from && check <= to;
                });
                const corps = PlanningAvailPicker._corps('crew', member.id);
                if(isAvailable && !poses.has(corps)) {
                    poses.add(corps);
                    bars.push({ name: member.name, color: member.color, type: 'crew', hasVehicle: member.hasVehicle, vehicleSeats: member.vehicleSeats, vehicleTrunk: member.vehicleTrunk });
                }
            }
        });
        
        return bars;
    }
};
  