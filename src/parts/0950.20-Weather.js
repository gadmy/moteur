
// ========== MODULE MÉTÉO (Open-Meteo API - 100% gratuit) ==========
const Weather = {
    cache: {},
    
    weatherCodes: {
        0: { icon: '☀️', desc: 'Ciel dégagé' },
        1: { icon: '🌤️', desc: 'Principalement dégagé' },
        2: { icon: '⛅', desc: 'Partiellement nuageux' },
        3: { icon: '☁️', desc: 'Couvert' },
        45: { icon: '🌫️', desc: 'Brouillard' },
        48: { icon: '🌫️', desc: 'Brouillard givrant' },
        51: { icon: '🌧️', desc: 'Bruine légère' },
        53: { icon: '🌧️', desc: 'Bruine modérée' },
        55: { icon: '🌧️', desc: 'Bruine dense' },
        61: { icon: '🌧️', desc: 'Pluie légère' },
        63: { icon: '🌧️', desc: 'Pluie modérée' },
        65: { icon: '🌧️', desc: 'Pluie forte' },
        71: { icon: '🌨️', desc: 'Neige légère' },
        73: { icon: '🌨️', desc: 'Neige modérée' },
        75: { icon: '🌨️', desc: 'Neige forte' },
        80: { icon: '🌦️', desc: 'Averses légères' },
        81: { icon: '🌦️', desc: 'Averses modérées' },
        82: { icon: '🌦️', desc: 'Averses violentes' },
        85: { icon: '🌨️', desc: 'Averses de neige' },
        95: { icon: '⛈️', desc: 'Orage' },
        96: { icon: '⛈️', desc: 'Orage avec grêle' },
        99: { icon: '⛈️', desc: 'Orage violent' }
    },
    
    getWindDirection: (degrees) => {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
        return directions[Math.round(degrees / 45) % 8];
    },
    
    fetch: async (lat, lng, date) => {
        if(!lat || !lng || !date) return null;
        
        const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${date}`;
        if(Weather.cache[cacheKey]) return Weather.cache[cacheKey];
        
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,windspeed_10m_max,winddirection_10m_dominant,sunrise,sunset&timezone=Europe/Paris&start_date=${date}&end_date=${date}`;
            
            const response = await fetch(url);
            if(!response.ok) throw new Error('Erreur API météo');
            
            const data = await response.json();
            if(!data.daily || !data.daily.time?.length) return null;
            
            const weatherCode = data.daily.weathercode[0];
            const weatherInfo = Weather.weatherCodes[weatherCode] || { icon: '❓', desc: 'Inconnu' };
            
            const result = {
                icon: weatherInfo.icon,
                description: weatherInfo.desc,
                tempMax: Math.round(data.daily.temperature_2m_max[0]),
                tempMin: Math.round(data.daily.temperature_2m_min[0]),
                feelsLike: Math.round(data.daily.apparent_temperature_max[0]),
                precipitation: data.daily.precipitation_sum[0],
                precipitationProb: data.daily.precipitation_probability_max[0],
                windSpeed: Math.round(data.daily.windspeed_10m_max[0]),
                windDirection: Weather.getWindDirection(data.daily.winddirection_10m_dominant[0]),
                sunrise: data.daily.sunrise[0]?.split('T')[1] || '--:--',
                sunset: data.daily.sunset[0]?.split('T')[1] || '--:--'
            };
            
            Weather.cache[cacheKey] = result;
            return result;
        } catch(e) {
            console.error('Erreur météo:', e);
            return null;
        }
    },
    
    // Weather.renderCard retirée v569, jamais appelée : la feuille de service
    // affiche la météo via son propre rendu FDSLive, pas via ce module.
};

  window.ColorWheel = ColorWheel;
  // ==================== MODULE BEAT BOARD ====================
  // ========== MODE FOCUS (Plein écran onglet) ==========