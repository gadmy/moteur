
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
    
  };
