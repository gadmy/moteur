
  const PlanningAvailability = {
    // ========== CALENDRIER VISUEL V1.4.6 ==========
    availMonth: new Date().getMonth(),
    availYear: new Date().getFullYear(),

    // ==================================================================
    //  QUI EST AFFICHE, ET QUELS JOURS SONT LIBRES POUR TOUT LE MONDE
    // ==================================================================
    //  v601 - Tout le monde est affiche par defaut ; on retire les gens du
    //  tableau pour repondre a « et sans lui, ca donne quoi ? ».
    //  CE QU'ON RETIRE SORT AUSSI DU CALCUL : c'est tout l'interet. Un
    //  tableau ou masquer quelqu'un ne changerait pas la ligne du haut ne
    //  servirait qu'a gagner de la place.
    voirComediens: true,
    voirEquipe: true,
    masques: {},                 // { idPersonne: true } — retires a la main
    basculerGroupe: (quoi) => {
        if(quoi === 'actor') PlanningAvailability.voirComediens = !PlanningAvailability.voirComediens;
        else PlanningAvailability.voirEquipe = !PlanningAvailability.voirEquipe;
        PlanningAvailability.renderAvailabilityCalendar();
    },
    basculerPersonne: (id) => {
        if(PlanningAvailability.masques[id]) delete PlanningAvailability.masques[id];
        else PlanningAvailability.masques[id] = true;
        PlanningAvailability.renderAvailabilityCalendar();
    },
    toutAfficher: () => {
        PlanningAvailability.voirComediens = true;
        PlanningAvailability.voirEquipe = true;
        PlanningAvailability.masques = {};
        PlanningAvailability.renderAvailabilityCalendar();
    },
    //  L'etat d'une personne un jour donne : 'non' (indisponible), 'oui'
    //  (disponible), '' (rien de dit). Une seule facon de lire les plages.
    _etatJour: (personne, dateStr) => {
        const dans = (plages) => (plages || []).some(r => r && r.from && r.to && dateStr >= r.from && dateStr <= r.to);
        if(dans(personne.unavailabilityDates)) return 'non';
        if(dans(personne.availabilityDates)) return 'oui';
        return '';
    },
    //  EST-ELLE LIBRE CE JOUR-LA ? Une case non remplie compte comme
    //  DISPONIBLE : personne ne remplit son calendrier a l'annee, et exiger
    //  une confirmation pour chaque jour ferait un tableau vide toute
    //  l'annee. Seul un « indisponible » ECRIT bloque une journee.
    _estLibre: (personne, dateStr) => PlanningAvailability._etatJour(personne, dateStr) !== 'non',
    //  Les mois ou cette personne a ecrit quelque chose. Sert a ne pas laisser
    //  croire « rien de renseigne » quand tout est dans un autre mois — c'est
    //  exactement ce qui s'est passe : deux comediens, l'un en avril, l'autre
    //  en septembre, et une ligne vide chacun leur tour.
    _moisRemplis: (personne) => {
        const vus = {};
        [].concat(personne.availabilityDates || [], personne.unavailabilityDates || [])
          .forEach(r => { if(r && r.from) vus[String(r.from).slice(0, 7)] = 1;
                          if(r && r.to) vus[String(r.to).slice(0, 7)] = 1; });
        return Object.keys(vus).sort();
    },
    NOMS_MOIS: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    _nomMois: (aaaaMm) => {
        const m = /^(\d{4})-(\d{2})$/.exec(String(aaaaMm || ''));
        if(!m) return String(aaaaMm || '');
        return PlanningAvailability.NOMS_MOIS[Number(m[2]) - 1] + ' ' + m[1];
    },
    //  « Ses dates sont ailleurs ». Une ligne vide ne veut pas dire « rien de
    //  renseigne » : elle peut vouloir dire « tout est dans un autre mois ».
    //  Le cas s'est presente pour de vrai — un comedien en avril, un autre en
    //  septembre, et chacun son tour une ligne vide qui semblait perdue.
    _ailleurs: (personne, year, month) => {
        const ici = year + '-' + String(month + 1).padStart(2, '0');
        const mois = PlanningAvailability._moisRemplis(personne).filter(m => m !== ici);
        if(!mois.length) return '';
        const rienIci = !PlanningAvailability._moisRemplis(personne).some(m => m === ici);
        if(!rienIci) return '';   // il y a deja quelque chose ce mois-ci : on n'encombre pas
        const trois = mois.slice(0, 3);
        const libelles = trois.map(m => '<button class="dispo-ailleurs-lien" onclick="event.stopPropagation(); app.PlanningAvailability.allerAuMois(\'' + m + '\')">'
            + Utils.escape(PlanningAvailability._nomMois(m)) + '</button>').join(' ');
        return '<span class="dispo-ailleurs" title="Rien ce mois-ci, mais des dates existent ailleurs">↪ ' + libelles
             + (mois.length > 3 ? ' <span>+' + (mois.length - 3) + '</span>' : '') + '</span>';
    },
    allerAuMois: (aaaaMm) => {
        const m = /^(\d{4})-(\d{2})$/.exec(String(aaaaMm || ''));
        if(!m) return;
        PlanningAvailability.availYear = Number(m[1]);
        PlanningAvailability.availMonth = Number(m[2]) - 1;
        PlanningAvailability.renderAvailabilityCalendar();
    },
    
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
        const tous = [
            ...actors.map(a => ({ ...a, _type: '🎭', _personType: 'actor' })),
            ...crew.map(c => ({ ...c, _type: '🎬', _personType: 'crew' }))
        ];
        const PA = PlanningAvailability;
        const visible = (p) => (p._personType === 'actor' ? PA.voirComediens : PA.voirEquipe)
                            && !PA.masques[p.id];
        const people = tous.filter(visible);
        const retires = tous.length - people.length;
        
        // Jours de tournage
        const shootingDays = state.data.shootingDays || [];
        const shootingDates = new Set(shootingDays.map(d => d.date));
        
        // Barre de commandes : on retire des gens pour voir ce que ca donne.
        const nbCom = tous.filter(p => p._personType === 'actor').length;
        const nbEqu = tous.filter(p => p._personType === 'crew').length;
        let html = `<div class="dispo-cmd">
            <button class="dispo-cmd-btn${PA.voirComediens ? ' est-on' : ''}" onclick="app.PlanningAvailability.basculerGroupe('actor')">🎭 Comédien·nes (${nbCom})</button>
            <button class="dispo-cmd-btn${PA.voirEquipe ? ' est-on' : ''}" onclick="app.PlanningAvailability.basculerGroupe('crew')">🎬 Équipe (${nbEqu})</button>
            ${retires ? `<button class="dispo-cmd-btn dispo-cmd-reset" onclick="app.PlanningAvailability.toutAfficher()">↺ Tout réafficher (${retires} retiré${retires > 1 ? 's' : ''})</button>` : ''}
            <span class="dispo-cmd-note">Retirez quelqu’un pour voir ce que ça donne sans lui : la ligne verte suit.</span>
        </div>`;

        // Construire le tableau
        html += `<div style="overflow-x: auto;">
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

        // ---- LA LIGNE DU HAUT : les jours ou TOUT LE MONDE peut venir.
        //  Trois etats par personne, donc deux verts : le vert PLEIN quand
        //  chacun a dit oui, le vert PALE quand personne n'a dit non mais que
        //  tout le monde n'a pas repondu. Les confondre ferait promettre une
        //  journee que personne n'a confirmee.
        if(people.length) {
            html += `<tr class="dispo-ligne-tous">
                <td style="padding: 8px; border: 1px solid var(--border); position: sticky; left: 0; background: var(--panel-bg); z-index: 1; white-space: nowrap; font-weight: 700;">
                    ✅ Tout le monde (${people.length})
                </td>`;
            for(let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                // Une case non remplie compte comme DISPONIBLE : seul un
                // « indisponible » ecrit bloque une journee.
                const bloque = people.filter(p => !PlanningAvailability._estLibre(p, dateStr));
                const libre = bloque.length === 0;
                const fond = libre ? 'rgba(76,175,80,0.45)' : 'transparent';
                const titre = libre
                    ? 'Tout le monde peut venir'
                    : ('Indisponible : ' + bloque.map(p => p.name).join(', '));
                html += `<td title="${Utils.escape(titre)}" style="padding:5px; border:1px solid var(--border); text-align:center; background:${fond};">${libre ? '✓' : bloque.length}</td>`;
            }
            html += `</tr>`;
        }
        
        // Lignes pour chaque personne
        people.forEach(person => {
            html += `<tr>
                <td style="padding: 8px; border: 1px solid var(--border); position: sticky; left: 0; background: var(--panel-bg); z-index: 1; white-space: nowrap;">
                    <button class="dispo-oeil" title="Retirer du tableau" onclick="app.PlanningAvailability.basculerPersonne('${Utils.escape(String(person.id))}')">✕</button>
                    ${person._type} ${Utils.escape(person.name)}
                    ${PlanningAvailability._ailleurs(person, year, month)}
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
            // « Il n'y a personne » et « vous avez tout retire » ne sont pas la
            // meme chose : dire la premiere quand c'est la seconde ferait
            // croire a une perte de donnees.
            const rien = tous.length === 0;
            html = `<div style="text-align: center; padding: 40px; color: var(--text-sec);">`
                + (rien
                    ? 'Ajoutez des comédien·ne·s ou technicien·ne·s avec leurs disponibilités pour voir le calendrier.'
                    : 'Tout le monde est retiré du tableau. <button class="dispo-cmd-btn dispo-cmd-reset" onclick="app.PlanningAvailability.toutAfficher()">↺ Tout réafficher</button>')
                + `</div>`;
        }
        
        container.innerHTML = html;
    },
  };
