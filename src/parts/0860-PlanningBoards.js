
  const PlanningBoards = {
    // Afficher le Plan de Travail
    // Afficher le Plan de Travail (DOOD)
    renderWorkPlan: () => {
        const shootDays = (state.data.shootingDays || []).slice().sort((a, b) => {
            const dateA = new Date(a.startDate || a.date);
            const dateB = new Date(b.startDate || b.date);
            return dateA - dateB;
        });
        
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const characters = state.data.characters || [];
        
        // État vide
        if(shootDays.length === 0) {
            document.getElementById('workplanContent').innerHTML = `
                <div class="workplan-empty">
                    <div class="workplan-empty-icon">📋</div>
                    <h3 class="mb-10">Aucun jour de tournage planifié</h3>
                    <p style="color: #666; margin-bottom: 20px;">Ajoutez des jours de tournage dans le calendrier pour générer le plan de travail.</p>
                    <button onclick="app.Planning.setMode('calendar')" class="n8-badge-15">📅 Aller au calendrier</button>
                </div>`;
            return;
        }
        
        // Créer mapping présences : qui travaille quel jour
        const buildPresenceMap = () => {
            const map = {};
            
            // Init pour chaque acteur
            actors.forEach(actor => {
                map[`actor_${actor.id}`] = { type: 'actor', person: actor, days: {} };
            });
            
            // Init pour chaque technicien
            crew.forEach(member => {
                map[`crew_${member.id}`] = { type: 'crew', person: member, days: {} };
            });
            
            // Parcourir les jours et leurs callSheets
            shootDays.forEach((day, dayIdx) => {
                (day.callSheet || []).forEach(call => {
                    const key = `${call.type}_${call.personId}`;
                    if(map[key]) {
                        map[key].days[dayIdx] = { callTime: call.callTime, notes: call.notes };
                    }
                });
            });
            
            return map;
        };
        
        const presenceMap = buildPresenceMap();
        
        // Déterminer le code pour chaque cellule (SW, W, WF, H, etc.)
        const getCellCode = (personKey, dayIdx) => {
            const data = presenceMap[personKey];
            
            // Vérifier s'il y a un override manuel (V, R, H ajoutés manuellement)
            const overrideKey = `${personKey}_${dayIdx}`;
            const override = (state.data.workplanOverrides || {})[overrideKey];
            if(override) return override;
            
            if(!data) return '';
            
            const days = Object.keys(data.days).map(Number).sort((a,b) => a - b);
            if(days.length === 0) return '';
            
            const firstDay = days[0];
            const lastDay = days[days.length - 1];
            const isWorkingThisDay = data.days[dayIdx] !== undefined;
            
            // Hors période de contrat
            if(dayIdx < firstDay || dayIdx > lastDay) return '';
            
            // Un seul jour de travail total
            if(days.length === 1 && isWorkingThisDay) return 'T';
            
            // Premier jour
            if(dayIdx === firstDay) return 'SW';
            
            // Dernier jour
            if(dayIdx === lastDay) return 'WF';
            
            // Entre premier et dernier jour
            if(isWorkingThisDay) return 'W'; // Travaille
            return 'H'; // Hold (pas convoqué mais sous contrat)
        };
        
        // Trouver le personnage associé à un acteur
        const getCharacterForActor = (actorId) => {
            const char = characters.find(c => c.actorId === actorId);
            return char ? char.name : '';
        };
        
        // Compter les jours de travail
        const countWorkDays = (personKey) => {
            const data = presenceMap[personKey];
            if(!data) return 0;
            return Object.keys(data.days).length;
        };
        
        // Dates du tournage
        const firstDate = new Date(shootDays[0].startDate || shootDays[0].date);
        const lastDate = new Date(shootDays[shootDays.length - 1].startDate || shootDays[shootDays.length - 1].date);
        const formatDate = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // Construction HTML
        let html = '<div class="workplan-wrapper">';
        
        // En-tête avec infos film
        html += `
            <div class="workplan-header-box">
                <div>
                    <div class="workplan-header-title">${Utils.escape(state.data.title || 'Sans titre')}</div>
                    <div class="workplan-header-subtitle">Plan de travail</div>
                </div>
                <div class="workplan-header-info">
                    <strong>Tournage :</strong> Du ${formatDate(firstDate)} au ${formatDate(lastDate)}<br>
                    <strong>Jours :</strong> ${shootDays.length} jour${shootDays.length > 1 ? 's' : ''} de tournage<br>
                    <strong>Comédiens :</strong> ${actors.length}
                </div>
                <div class="workplan-header-version">
                    <strong>Version n°1</strong><br>
                    Généré le ${formatDate(new Date())}
                </div>
            </div>`;
        
        // Tableau principal
        html += '<table class="workplan-table"><thead><tr>';
        html += '<th class="workplan-col-num">N°</th>';
        html += '<th class="workplan-col-role">RÔLE</th>';
        html += '<th class="workplan-col-actor">COMÉDIEN.NE</th>';
        
        // En-têtes des jours
        shootDays.forEach((day, idx) => {
            const date = new Date(day.startDate || day.date);
            const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' }).substring(0, 2);
            const dayNum = date.getDate();
            const month = date.toLocaleDateString('fr-FR', { month: 'short' }).substring(0, 3);
            html += `<th class="workplan-col-day" title="J${idx + 1} - ${date.toLocaleDateString('fr-FR')}">${dayName}<br>${dayNum}<br>${month}</th>`;
        });
        
        html += '<th class="workplan-col-total">TOTAL</th>';
        html += '</tr></thead><tbody>';
        
        // Section Comédiens
        if(actors.length > 0) {
            html += `<tr class="workplan-section-row"><td colspan="${shootDays.length + 4}">🎭 COMÉDIEN.NES</td></tr>`;
            
            actors.forEach((actor, idx) => {
                const personKey = `actor_${actor.id}`;
                const character = getCharacterForActor(actor.id);
                const totalDays = countWorkDays(personKey);
                
                html += '<tr>';
                html += `<td class="workplan-cell-num">${idx + 1}</td>`;
                html += `<td class="workplan-cell-role">${Utils.escape(character || '—')}</td>`;
                html += `<td class="workplan-cell-actor">${Utils.escape(actor.name || 'Sans nom')}</td>`;
                
                // Cellules des jours
                shootDays.forEach((day, dayIdx) => {
                    const code = getCellCode(personKey, dayIdx);
                    const cellClass = code ? `workplan-bar-${code}` : 'workplan-bar-empty';
                    const isEditable = !['T', 'SW', 'W', 'WF'].includes(code);
                    const clickAttr = isEditable ? `onclick="app.Planning.openWorkplanMenu(event, '${personKey}', ${dayIdx})"` : '';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    html += `<td class="${cellClass}" style="${cursorStyle}" ${clickAttr}>${code}</td>`;
                });
                
                html += `<td class="workplan-cell-total">${totalDays}</td>`;
                html += '</tr>';
            });
        }
        
        // Section Techniciens
        if(crew.length > 0) {
            html += `<tr class="workplan-section-row"><td colspan="${shootDays.length + 4}">🎥 TECHNICIEN.NES</td></tr>`;
            
            crew.forEach((member, idx) => {
                const personKey = `crew_${member.id}`;
                const totalDays = countWorkDays(personKey);
                
                html += '<tr>';
                html += `<td class="workplan-cell-num">${idx + 1}</td>`;
                html += `<td class="workplan-cell-role">${Utils.escape(member.role || '—')}</td>`;
                html += `<td class="workplan-cell-actor">${Utils.escape(member.name || 'Sans nom')}</td>`;
                
                // Cellules des jours
                shootDays.forEach((day, dayIdx) => {
                    const code = getCellCode(personKey, dayIdx);
                    const cellClass = code ? `workplan-bar-${code}` : 'workplan-bar-empty';
                    const isEditable = !['T', 'SW', 'W', 'WF'].includes(code);
                    const clickAttr = isEditable ? `onclick="app.Planning.openWorkplanMenu(event, '${personKey}', ${dayIdx})"` : '';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    html += `<td class="${cellClass}" style="${cursorStyle}" ${clickAttr}>${code}</td>`;
                });
                
                html += `<td class="workplan-cell-total">${totalDays}</td>`;
                html += '</tr>';
            });
        }
        
        html += '</tbody></table>';
        
        // Footer avec légende et actions
        html += `
            <div class="workplan-footer">
                <div class="workplan-legend">
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-SW">SW</div> Début</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-W">W</div> Travaille</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-WF">WF</div> Fin</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-T">T</div> Travaille (1 jour)</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-H">H</div> Hold/Retenue</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-R">R</div> Repos</div>
                    <div class="workplan-legend-item"><div class="workplan-legend-box workplan-bar-V">V</div> Voyage</div>
                </div>
                <div class="workplan-actions">
                    <button onclick="app.Planning.printWorkPlan()">🖨️ Imprimer</button>
                    <button onclick="app.Planning.renderWorkPlan()">🔄 Actualiser</button>
                </div>
            </div>`;
        
        html += '</div>';
        
        document.getElementById('workplanContent').innerHTML = html;
    },
    
    // Ouvrir le menu pour modifier une cellule du plan de travail
    openWorkplanMenu: (event, personKey, dayIdx) => {
        event.stopPropagation();
        
        // Fermer un menu existant
        const existingMenu = document.getElementById('workplan-cell-menu');
        if(existingMenu) existingMenu.remove();
        
        // Créer le menu
        const menu = document.createElement('div');
        menu.id = 'workplan-cell-menu';
        menu.className = 'workplan-cell-menu';
        menu.innerHTML = `
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, 'H')"><span class="workplan-bar-H" style="padding: 2px 6px; border-radius: 3px;">H</span> Hold</div>
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, 'V')"><span class="workplan-bar-V" style="padding: 2px 6px; border-radius: 3px;">V</span> Voyage</div>
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, 'R')"><span class="workplan-bar-R" style="padding: 2px 6px; border-radius: 3px;">R</span> Repos</div>
            <div class="workplan-menu-divider"></div>
            <div class="workplan-menu-item" onclick="app.Planning.setWorkplanOverride('${personKey}', ${dayIdx}, null)">✕ Effacer</div>
        `;
        
        // Positionner le menu
        menu.style.position = 'absolute';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        
        document.body.appendChild(menu);
        
        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 10);
    },
    
    // Définir une valeur manuelle dans le plan de travail
    setWorkplanOverride: (personKey, dayIdx, value) => {
        if(!state.data.workplanOverrides) state.data.workplanOverrides = {};
        
        const overrideKey = `${personKey}_${dayIdx}`;
        
        if(value === null) {
            delete state.data.workplanOverrides[overrideKey];
        } else {
            state.data.workplanOverrides[overrideKey] = value;
        }
        
        // Fermer le menu
        const menu = document.getElementById('workplan-cell-menu');
        if(menu) menu.remove();
        
        // Sauvegarder et rafraîchir
        Store.save();
        Planning.renderWorkPlan();
        
        Utils.toast(`Statut mis à jour : ${value || 'effacé'}`, 'success');
    },
    
    // Récupérer les éléments du dépouillement pour une personne selon son département
    // Planning.getBreakdownItemsForPerson (31 l.) retirée v569, jamais appelée.
    
    // Imprimer le Plan de Travail
    printWorkPlan: () => {
        const content = document.getElementById('workplanContent').innerHTML;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Plan de Travail - ${Utils.escape(state.data.title || 'Film')}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    .workplan-wrapper { background: white; }
                    .workplan-header-box { border: 2px solid #333; padding: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; }
                    .workplan-header-title { font-size: 1.4rem; font-weight: bold; }
                    .workplan-header-subtitle { font-size: 0.9rem; color: #666; }
                    .workplan-header-info { font-size: 0.85rem; }
                    .workplan-header-version { text-align: right; font-size: 0.85rem; }
                    .workplan-table { width: 100%; border-collapse: collapse; font-size: 9px; }
                    .workplan-table th, .workplan-table td { border: 1px solid #999; padding: 3px 4px; text-align: center; }
                    .workplan-table thead th { background: #f0f0f0; font-weight: 600; }
                    .workplan-cell-num, .workplan-col-num { background: #f5f5f5; }
                    .workplan-cell-role, .workplan-col-role { text-align: left; width: 100px; }
                    .workplan-cell-actor, .workplan-col-actor { text-align: left; width: 110px; font-size: 8px; }
                    .workplan-cell-total, .workplan-col-total { background: #f5f5f5; font-weight: 600; }
                    .workplan-bar-T, .workplan-bar-SW, .workplan-bar-W, .workplan-bar-WF { background: #c0392b !important; color: white; font-weight: bold; }
                    .workplan-bar-H { background: #f39c12 !important; color: white; }
                    .workplan-bar-R { background: #3498db !important; color: white; }
                    .workplan-bar-V { background: #9b59b6 !important; color: white; }
                    .workplan-section-row td { background: #d5d5d5 !important; font-weight: 600; text-align: left; }
                    .workplan-footer { margin-top: 15px; }
                    .workplan-legend { display: flex; gap: 15px; flex-wrap: wrap; font-size: 10px; }
                    .workplan-legend-item { display: flex; align-items: center; gap: 4px; }
                    .workplan-legend-box { width: 20px; height: 14px; border: 1px solid #999; font-size: 8px; display: flex; align-items: center; justify-content: center; color: white; }
                    .workplan-actions { display: none; }
                    @page { size: landscape; margin: 10mm; }
                </style>
            </head>
            <body>${content}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    },
    
    // Afficher le Kanban
    renderKanban: () => {
        const scenes = state.data.scenes || [];
        const shootDays = state.data.shootingDays || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Récupérer le filtre de type
        const kanbanTypeSel = document.getElementById('kanban-type-filter');
        if(kanbanTypeSel && kanbanTypeSel.options.length <= 1) {
            kanbanTypeSel.insertAdjacentHTML('beforeend', Planning.dayTypeOptionsHtml(''));
        }
        const typeFilter = kanbanTypeSel?.value || 'all';
        
        // Filtrer les jours par type si nécessaire
        const filteredDays = typeFilter === 'all' 
            ? shootDays 
            : shootDays.filter(day => (day.dayType || 'tournage') === typeFilter);
        
        // Créer un mapping scène -> date de tournage (uniquement pour les jours filtrés)
        const sceneToDate = {};
        const sceneToDay = {}; // Pour récupérer les infos du jour
        filteredDays.forEach(day => {
            const dateStr = day.startDate || day.date;
            if(dateStr && day.scenes) {
                day.scenes.forEach(sceneRef => {
                    const sceneId = sceneRef.sceneId || sceneRef;
                    sceneToDate[sceneId] = new Date(dateStr);
                    sceneToDay[sceneId] = day;
                });
            }
        });
        
        // Catégoriser les scènes
        const todo = [];
        const planned = [];
        const shooting = [];
        const done = [];
        
        scenes.forEach(scene => {
            const sceneDate = sceneToDate[scene.id];
            
            if(!sceneDate) {
                // Pas dans le calendrier
                todo.push({ scene, date: null });
            } else {
                sceneDate.setHours(0, 0, 0, 0);
                if(sceneDate.getTime() === today.getTime()) {
                    // Aujourd'hui
                    shooting.push({ scene, date: sceneDate });
                } else if(sceneDate > today) {
                    // Futur
                    planned.push({ scene, date: sceneDate });
                } else {
                    // Passé
                    done.push({ scene, date: sceneDate });
                }
            }
        });
        
        // Fonction pour créer une carte
        const createCard = (item) => {
            const scene = item.scene;
            const sceneIndex = scenes.findIndex(s => s.id === scene.id) + 1;
            const dateStr = item.date ? item.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
            const intExt = scene.intExt || '';
            const dayNight = scene.dayNight || '';
            
            // Récupérer le type de journée
            const day = sceneToDay[scene.id];
            const dayTypeInfo = day ? Planning.getDayTypeInfo(day.dayType) : null;
            const typeTag = dayTypeInfo ? `<span style="background:${dayTypeInfo.color}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${dayTypeInfo.icon} ${dayTypeInfo.label}</span>` : '';
            
            return `
                <div class="kanban-card" onclick="app.UI.switchTab('board')">
                    <div class="kanban-card-title">Sc. ${sceneIndex} - ${Utils.escape(scene.title || 'Sans titre')}</div>
                    <div class="kanban-card-info">
                        ${intExt ? `<span class="kanban-card-tag ${intExt.toLowerCase()}">${intExt}</span>` : ''}
                        ${dayNight ? `<span class="kanban-card-tag ${dayNight.toLowerCase()}">${dayNight}</span>` : ''}
                        ${typeTag}
                    </div>
                    ${scene.location ? `<div style="font-size: 0.75rem; color: var(--text-sec); margin-top: 4px;">📍 ${Utils.escape(scene.location)}</div>` : ''}
                    ${dateStr ? `<div class="kanban-card-date">📅 ${dateStr}</div>` : ''}
                </div>
            `;
        };
        
        // Remplir les colonnes
        document.getElementById('kanban-body-todo').innerHTML = todo.length ? todo.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        document.getElementById('kanban-body-planned').innerHTML = planned.length ? planned.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        document.getElementById('kanban-body-shooting').innerHTML = shooting.length ? shooting.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        document.getElementById('kanban-body-done').innerHTML = done.length ? done.map(createCard).join('') : '<div class="empty-state-sm">Aucune scène</div>';
        
        // Mettre à jour les compteurs
        document.getElementById('kanban-count-todo').textContent = todo.length;
        document.getElementById('kanban-count-planned').textContent = planned.length;
        document.getElementById('kanban-count-shooting').textContent = shooting.length;
        document.getElementById('kanban-count-done').textContent = done.length;
    }
};
  
  // ============== PLANNING - VUES CALENDRIER (MOIS / SEMAINE / JOUR) ==============
  // Extrait du coeur de Planning (v578). Ces trois fonctions ne font que
  // FABRIQUER du HTML a partir de state.data ; elles ne modifient rien.
  // Les aides communes (getWeekStart, formatDate, getShootDay) restent dans
  // Planning : elles servent aussi ailleurs.