
  const PlanningAvailability = {
    // ========== CALENDRIER VISUEL V1.4.6 ==========

    // ==================================================================
    //  LA REGLE DE DISPONIBILITE, ET RIEN QUE LA REGLE (v601)
    // ==================================================================
    //  LE TABLEAU « Disponibilites de l'equipe » A ETE SUPPRIME : il faisait
    //  doublon avec le selecteur de l'onglet Planning, qui pose les memes
    //  dispos directement sur le calendrier. Deux ecrans pour la meme
    //  question, ce sont deux ecrans qui divergent.
    //  CE QUI N'EXISTAIT QUE LA — « quel jour est libre pour tout le
    //  monde ? » — EST DESCENDU DANS LE CALENDRIER : une journee ou tous les
    //  gens affiches sont disponibles s'entoure de vert.
    //  Il ne reste donc ici que la REGLE, pour que le calendrier et tout ce
    //  qui viendra la lisent au meme endroit.
    //  L'etat d'une personne un jour donne : 'non' (indisponible), 'oui'
    //  (disponible), '' (rien de dit).
    _etatJour: (personne, dateStr) => {
        const dans = (plages) => (plages || []).some(r => r && r.from && r.to && dateStr >= r.from && dateStr <= r.to);
        if(dans(personne.unavailabilityDates)) return 'non';
        if(dans(personne.availabilityDates)) return 'oui';
        return '';
    },
    //  EST-ELLE LIBRE CE JOUR-LA ? Une case non remplie compte comme
    //  DISPONIBLE : personne ne remplit son calendrier a l'annee, et exiger
    //  une confirmation pour chaque jour rendrait toute journee douteuse.
    //  Seul un « indisponible » ECRIT bloque une journee.
    _estLibre: (personne, dateStr) => PlanningAvailability._etatJour(personne, dateStr) !== 'non',

    // Export ICS pour Google Calendar / Outlook
    exportICS: () => {
        const shootingDays = state.data.shootingDays || [];
        
        if(shootingDays.length === 0) {
            Utils.toast('Aucun jour de tournage à exporter', 'warning');
            return;
        }
        
        let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Moteur//Calendrier Tournage//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${state.data.title || 'Tournage'}
`;
        
        shootingDays.forEach(day => {
            const startDate = day.startDate || day.date;
            const endDate = day.endDate || startDate;
            if(!startDate) return;
            
            const startDateStr = startDate.replace(/-/g, '');
            // ICS DTEND est exclusif, donc on ajoute 1 jour
            const endDateObj = new Date(endDate);
            endDateObj.setDate(endDateObj.getDate() + 1);
            const endDateStr = Planning.formatDate(endDateObj).replace(/-/g, '');
            
            const sceneTitles = (day.scenes || []).map(s => {
                const scene = state.data.scenes.find(sc => sc.id === s.sceneId);
                return scene ? scene.title : '';
            }).filter(t => t).join(', ');
            
            const uid = `${day.id}@filmmanagerpro`;
            const summary = `${day.name || 'Tournage'} - ${state.data.title || 'Projet'}`;
            const description = sceneTitles ? `Scènes: ${sceneTitles}` : '';
            const location = day.location || '';
            
            icsContent += `BEGIN:VEVENT
UID:${uid}
DTSTART;VALUE=DATE:${startDateStr}
DTEND;VALUE=DATE:${endDateStr}
SUMMARY:${summary}
DESCRIPTION:${description.replace(/\n/g, '\\n')}
LOCATION:${location}
STATUS:CONFIRMED
END:VEVENT
`;
        });
        
        icsContent += 'END:VCALENDAR';
        
        // Télécharger le fichier
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(state.data.title || 'Tournage').replace(/\s+/g, '_')}_planning.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        Utils.toast(`${shootingDays.length} jour(s) exporté(s) en .ICS`, 'success');
        History.log('ADD', 'Export calendrier ICS');
    },
    
  };
