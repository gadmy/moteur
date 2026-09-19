
  const PlanningAvailability = {
    // ========== CALENDRIER VISUEL V1.4.6 ==========
    availMonth: new Date().getMonth(),
    availYear: new Date().getFullYear(),
    
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
    
    // Afficher la vue des disponibilités
    showAvailabilityView: () => {
        const modal = document.getElementById('availability-modal');
        modal.style.display = 'flex';
        PlanningAvailability.renderAvailabilityCalendar();
    },
    
    prevAvailMonth: () => {
        PlanningAvailability.availMonth--;
        if(PlanningAvailability.availMonth < 0) {
            PlanningAvailability.availMonth = 11;
            PlanningAvailability.availYear--;
        }
        PlanningAvailability.renderAvailabilityCalendar();
    },
    
    nextAvailMonth: () => {
        PlanningAvailability.availMonth++;
        if(PlanningAvailability.availMonth > 11) {
            PlanningAvailability.availMonth = 0;
            PlanningAvailability.availYear++;
        }
        PlanningAvailability.renderAvailabilityCalendar();
    },
    
    renderAvailabilityCalendar: () => {
        const container = document.getElementById('availability-calendar-container');
        const monthYearEl = document.getElementById('avail-month-year');
        
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        monthYearEl.textContent = `${monthNames[PlanningAvailability.availMonth]} ${PlanningAvailability.availYear}`;
        
        const year = PlanningAvailability.availYear;
        const month = PlanningAvailability.availMonth;
        
        // Premier jour du mois et nombre de jours
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        let startWeekDay = firstDay.getDay();
        if(startWeekDay === 0) startWeekDay = 7; // Lundi = 1
        
        // Récupérer les personnes (acteurs + techniciens)
        const actors = (state.data.actors || []).filter(a => a.name);
        const crew = (state.data.crew || []).filter(c => c.name);
        const people = [
            ...actors.map(a => ({ ...a, _type: '🎭', _personType: 'actor' })),
            ...crew.map(c => ({ ...c, _type: '🎬', _personType: 'crew' }))
        ];
        
        // Jours de tournage
        const shootingDays = state.data.shootingDays || [];
        const shootingDates = new Set(shootingDays.map(d => d.date));
        
        // Construire le tableau
        let html = `<div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 800px;">
                <thead>
                    <tr class="bg-base">
                        <th style="padding: 10px; border: 1px solid var(--border); position: sticky; left: 0; background: var(--bg); z-index: 1;">Personne</th>`;
        
        for(let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][date.getDay()];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isShooting = shootingDates.has(dateStr);
            
            html += `<th style="padding: 8px 5px; border: 1px solid var(--border); text-align: center; min-width: 45px; font-size: 0.8rem; ${isWeekend ? 'background: rgba(0,0,0,0.05);' : ''} ${isShooting ? 'background: rgba(76,175,80,0.3);' : ''}">
                ${dayName}<br><strong>${d}</strong>
                ${isShooting ? '<br>🎬' : ''}
            </th>`;
        }
        
        html += `</tr></thead><tbody>`;
        
        // Lignes pour chaque personne
        people.forEach(person => {
            html += `<tr>
                <td style="padding: 8px; border: 1px solid var(--border); position: sticky; left: 0; background: var(--panel-bg); z-index: 1; white-space: nowrap;">
                    ${person._type} ${Utils.escape(person.name)}
                </td>`;
            
            const availDates = person.availabilityDates || [];
            const unavailDates = person.unavailabilityDates || [];
            
            for(let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const date = new Date(year, month, d);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isShooting = shootingDates.has(dateStr);
                
                // Vérifier disponibilité
                let isAvailable = false;
                availDates.forEach(range => {
                    if(range.from && range.to) {
                        if(dateStr >= range.from && dateStr <= range.to) {
                            isAvailable = true;
                        }
                    }
                });
                
                // Vérifier indisponibilité
                let isUnavailable = false;
                unavailDates.forEach(range => {
                    if(range.from && range.to) {
                        if(dateStr >= range.from && dateStr <= range.to) {
                            isUnavailable = true;
                        }
                    }
                });
                
                let cellStyle = 'padding: 5px; border: 1px solid var(--border); text-align: center;';
                let cellContent = '';
                
                if(isWeekend) cellStyle += ' background: rgba(0,0,0,0.03);';
                
                // Priorité : Indisponible > Disponible > Non renseigné
                if(isUnavailable) {
                    cellStyle += ' background: rgba(244, 67, 54, 0.3);';
                    cellContent = '✗';
                } else if(isAvailable) {
                    cellStyle += ' background: rgba(33, 150, 243, 0.3);';
                    cellContent = '✓';
                }
                
                // Jour de tournage
                if(isShooting) {
                    if(isUnavailable) {
                        cellStyle = 'padding: 5px; border: 1px solid var(--border); text-align: center; background: rgba(244, 67, 54, 0.5);';
                        cellContent = '⚠️';
                    } else if(isAvailable) {
                        cellStyle = 'padding: 5px; border: 1px solid var(--border); text-align: center; background: rgba(76, 175, 80, 0.4);';
                        cellContent = '🎬';
                    } else {
                        cellContent = '🎬';
                    }
                }
                
                html += `<td style="${cellStyle}">${cellContent}</td>`;
            }
            
            html += `</tr>`;
        });
        
        html += `</tbody></table></div>`;
        
        if(people.length === 0) {
            html = `<div style="text-align: center; padding: 40px; color: var(--text-sec);">
                Ajoutez des comédien·ne·s ou technicien·ne·s avec leurs disponibilités pour voir le calendrier.
            </div>`;
        }
        
        container.innerHTML = html;
    },
  };
