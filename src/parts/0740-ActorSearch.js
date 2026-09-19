
  const ActorSearch = {
    filtersVisible: false,
    
    toggleFilters: () => {
        ActorSearch.filtersVisible = !ActorSearch.filtersVisible;
        const filtersDiv = document.getElementById('actor-filters');
        if(filtersDiv) {
            filtersDiv.style.display = ActorSearch.filtersVisible ? 'block' : 'none';
        }
    },
    
    applyFilters: () => {
        const name = (document.getElementById('filter-name')?.value || '').toLowerCase();
        const gender = document.getElementById('filter-gender')?.value || '';
        const ethnicity = document.getElementById('filter-ethnicity')?.value || '';
        const hair = document.getElementById('filter-hair')?.value || '';
        const eyes = document.getElementById('filter-eyes')?.value || '';
        const ageMin = parseInt(document.getElementById('filter-age-min')?.value) || 0;
        const ageMax = parseInt(document.getElementById('filter-age-max')?.value) || 999;
        const heightMin = parseInt(document.getElementById('filter-height-min')?.value) || 0;
        const heightMax = parseInt(document.getElementById('filter-height-max')?.value) || 999;
        const sports = (document.getElementById('filter-sports')?.value || '').toLowerCase();
        const languages = (document.getElementById('filter-languages')?.value || '').toLowerCase();
        const hasVehicle = document.getElementById('filter-vehicle')?.checked || false;
        
        const cards = document.querySelectorAll('#actorContainer .data-card');
        let visibleCount = 0;
        
        cards.forEach((card, idx) => {
            const actor = state.data.actors[idx];
            if(!actor) return;
            
            let visible = true;
            
            // Filtre par nom
            if(name && !actor.name.toLowerCase().includes(name)) visible = false;
            
            // Filtre par sexe
            if(gender && actor.gender !== gender) visible = false;
            
            // Filtre par origine
            if(ethnicity && actor.ethnicity !== ethnicity) visible = false;
            
            // Filtre par cheveux
            if(hair && actor.hairColor !== hair) visible = false;
            
            // Filtre par yeux
            if(eyes && actor.eyeColor !== eyes) visible = false;
            
            // Filtre par âge
            const actorAge = parseInt(actor.age) || 0;
            if(ageMin > 0 && actorAge < ageMin) visible = false;
            if(ageMax < 999 && actorAge > ageMax) visible = false;
            
            // Filtre par taille
            const actorHeight = parseInt(actor.height) || 0;
            if(heightMin > 0 && actorHeight < heightMin) visible = false;
            if(heightMax < 999 && actorHeight > heightMax) visible = false;
            
            // Filtre par sport
            if(sports && !(actor.sports || '').toLowerCase().includes(sports)) visible = false;
            
            // Filtre par langue
            if(languages && !(actor.languages || '').toLowerCase().includes(languages)) visible = false;
            
            // Filtre par véhicule
            if(hasVehicle && !actor.hasVehicle) visible = false;
            
            card.style.display = visible ? '' : 'none';
            if(visible) visibleCount++;
        });
        
        const countDiv = document.getElementById('filter-results-count');
        if(countDiv) {
            const total = state.data.actors?.length || 0;
            countDiv.textContent = `${visibleCount} / ${total} comédien${visibleCount > 1 ? 's' : ''} affiché${visibleCount > 1 ? 's' : ''}`;
        }
    },
    
    resetFilters: () => {
        document.getElementById('filter-name').value = '';
        document.getElementById('filter-gender').value = '';
        document.getElementById('filter-ethnicity').value = '';
        document.getElementById('filter-hair').value = '';
        document.getElementById('filter-eyes').value = '';
        document.getElementById('filter-age-min').value = '';
        document.getElementById('filter-age-max').value = '';
        document.getElementById('filter-height-min').value = '';
        document.getElementById('filter-height-max').value = '';
        document.getElementById('filter-sports').value = '';
        document.getElementById('filter-languages').value = '';
        document.getElementById('filter-vehicle').checked = false;
        
        const cards = document.querySelectorAll('#actorContainer .data-card');
        cards.forEach(card => card.style.display = '');
        
        const countDiv = document.getElementById('filter-results-count');
        if(countDiv) countDiv.textContent = '';
    }
};
  