
  const PlanningCalendarViews = {
    renderMonthView: () => {
        const year = Planning.currentDate.getFullYear();
        const month = Planning.currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const today = Planning.formatDate(new Date());
        
        let html = '<div class="planning-calendar">';
        html += '<div class="planning-weekdays">';
        ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach(d => {
            html += `<div class="planning-weekday">${d}</div>`;
        });
        html += '</div>';
        html += '<div class="planning-days">';
        
        // Previous month days
        const prevMonth = new Date(year, month, 0);
        for(let i = startDay - 1; i >= 0; i--) {
            const day = prevMonth.getDate() - i;
            const dateStr = Planning.formatDate(new Date(year, month - 1, day));
            const shootDay = Planning.getShootDay(dateStr);
            html += `<div class="planning-day other-month" data-date="${dateStr}" onclick="app.Planning.openDay('${dateStr}')" oncontextmenu="app.Planning.menuJourVide(event, '${dateStr}')" ondragover="app.Planning.onDragOver(event)" ondrop="app.Planning.onDrop(event, '${dateStr}')">
                <div class="planning-day-number">${day}</div>
                ${shootDay ? (() => { const typeInfo = Planning.getDayTypeInfo(shootDay.dayType); return `<div class="planning-day-shoot" style="background: ${typeInfo.color};" draggable="true" ondragstart="app.Planning.onDragStart(event, '${shootDay.id}')" onclick="event.stopPropagation(); app.Planning.editShootDay('${shootDay.id}')" oncontextmenu="event.preventDefault(); event.stopPropagation(); app.Planning.showDayContextMenu(event, '${shootDay.id}')" title="${typeInfo.icon} ${Utils.escape(shootDay.name || typeInfo.label)}"><span class="month-resize-handle left" onmousedown="event.stopPropagation(); app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'left')"></span>${typeInfo.icon} ${Utils.escape(shootDay.name || typeInfo.label).substring(0, 10)}<span class="month-resize-handle right" onmousedown="event.stopPropagation(); app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'right')"></span></div>`; })() : ''}
            </div>`;
        }
        
        // Current month days
        for(let day = 1; day <= lastDay.getDate(); day++) {
            const dateStr = Planning.formatDate(new Date(year, month, day));
            const isToday = dateStr === today;
            const shootDay = Planning.getShootDay(dateStr);
            const hasShoot = shootDay !== null;
            
            // Récupérer les disponibilités
            const availBars = Planning.getAvailabilityBarsForDate(dateStr);
            let availHTML = '';
            if(availBars.length > 0) {
                availHTML = '<div class="planning-day-availability">';
                availBars.forEach(bar => {
                    let vehicleIcon = '';
                    if(bar.hasVehicle) {
                        let vehicleInfo = bar.vehicleSeats ? bar.vehicleSeats + ' place(s)' : '';
                        if(bar.vehicleTrunk) vehicleInfo += vehicleInfo ? ' + coffre dispo' : 'Coffre dispo';
                        vehicleIcon = `<span style="margin-left: auto; cursor: help;" title="${vehicleInfo || 'Véhicule disponible'}">🚗</span>`;
                    }
                    availHTML += `<div class="availability-bar" style="background: ${bar.color};">${Utils.escape(bar.name)}${vehicleIcon}</div>`;
                });
                availHTML += '</div>';
            }
            
            let classes = 'planning-day';
            if(isToday) classes += ' today';
            if(hasShoot) classes += ' has-shoot';
            
            html += `<div class="${classes}" data-date="${dateStr}" onclick="app.Planning.openDay('${dateStr}')" oncontextmenu="app.Planning.menuJourVide(event, '${dateStr}')" ondragover="app.Planning.onDragOver(event)" ondrop="app.Planning.onDrop(event, '${dateStr}')">
                <div class="planning-day-number">${day}</div>
                ${availHTML}
                ${shootDay ? (() => { const typeInfo = Planning.getDayTypeInfo(shootDay.dayType); return `<div class="planning-day-shoot" style="background: ${typeInfo.color};" draggable="true" ondragstart="app.Planning.onDragStart(event, '${shootDay.id}')" onclick="event.stopPropagation(); app.Planning.editShootDay('${shootDay.id}')" oncontextmenu="event.preventDefault(); event.stopPropagation(); app.Planning.showDayContextMenu(event, '${shootDay.id}')" title="${typeInfo.icon} ${Utils.escape(shootDay.name || typeInfo.label)}"><span class="month-resize-handle left" onmousedown="event.stopPropagation(); app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'left')"></span>${typeInfo.icon} ${Utils.escape(shootDay.name || typeInfo.label).substring(0, 10)}<span class="month-resize-handle right" onmousedown="event.stopPropagation(); app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'right')"></span></div>`; })() : ''}
            </div>`;
        }
        
        // Next month days
        const totalCells = startDay + lastDay.getDate();
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for(let day = 1; day <= remaining; day++) {
            const dateStr = Planning.formatDate(new Date(year, month + 1, day));
            const shootDay = Planning.getShootDay(dateStr);
            html += `<div class="planning-day other-month" data-date="${dateStr}" onclick="app.Planning.openDay('${dateStr}')" oncontextmenu="app.Planning.menuJourVide(event, '${dateStr}')" ondragover="app.Planning.onDragOver(event)" ondrop="app.Planning.onDrop(event, '${dateStr}')">
                <div class="planning-day-number">${day}</div>
                ${shootDay ? (() => { const typeInfo = Planning.getDayTypeInfo(shootDay.dayType); return `<div class="planning-day-shoot" style="background: ${typeInfo.color};" draggable="true" ondragstart="app.Planning.onDragStart(event, '${shootDay.id}')" onclick="event.stopPropagation(); app.Planning.editShootDay('${shootDay.id}')" oncontextmenu="event.preventDefault(); event.stopPropagation(); app.Planning.showDayContextMenu(event, '${shootDay.id}')" title="${typeInfo.icon} ${Utils.escape(shootDay.name || typeInfo.label)}"><span class="month-resize-handle left" onmousedown="event.stopPropagation(); app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'left')"></span>${typeInfo.icon} ${Utils.escape(shootDay.name || typeInfo.label).substring(0, 10)}<span class="month-resize-handle right" onmousedown="event.stopPropagation(); app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'right')"></span></div>`; })() : ''}
            </div>`;
        }
        
        html += '</div></div>';
        return html;
    },
    
    renderWeekView: () => {
        const weekStart = Planning.getWeekStart(Planning.currentDate);
        const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
        const today = Planning.formatDate(new Date());
        
        // Collecter les jours de tournage de la semaine
        const weekShootDays = [];
        
        // Créer un tableau des 7 dates de la semaine (format YYYY-MM-DD)
        const weekDates = [];
        for(let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            weekDates.push(Planning.formatDate(d));
        }
        
        // Parcourir tous les jours de tournage et voir lesquels sont dans cette semaine
        (state.data.shootingDays || []).forEach(shootDay => {
            const startDate = shootDay.startDate || shootDay.date;
            const endDate = shootDay.endDate || shootDay.startDate || shootDay.date;
            if(!startDate) return;
            
            const weekStartStr = weekDates[0];
            const weekEndStr = weekDates[6];
            
            // Vérifier si le tournage chevauche cette semaine
            // Le tournage chevauche si : startDate <= weekEnd ET endDate >= weekStart
            if(startDate > weekEndStr || endDate < weekStartStr) {
                // Pas de chevauchement, ignorer
                return;
            }
            
            // Calculer les indices de début et fin dans la semaine
            let startDayIndex = weekDates.indexOf(startDate);
            let endDayIndex = weekDates.indexOf(endDate);
            
            // Si le début est avant cette semaine, commencer au jour 0
            if(startDayIndex < 0 && startDate < weekStartStr) {
                startDayIndex = 0;
            }
            // Si la fin est après cette semaine, finir au jour 6
            if(endDayIndex < 0 && endDate > weekEndStr) {
                endDayIndex = 6;
            }
            
            // Si toujours -1, c'est que la date n'est pas dans la semaine (ne devrait pas arriver après le check ci-dessus)
            if(startDayIndex < 0 || endDayIndex < 0) return;
            
            const spanDays = endDayIndex - startDayIndex + 1;
            const startHour = shootDay.crewCall ? parseInt(shootDay.crewCall.split(':')[0]) : 7;
            const endHour = shootDay.estimatedWrap ? parseInt(shootDay.estimatedWrap.split(':')[0]) : 19;
            
            weekShootDays.push({ 
                ...shootDay, 
                dayIndex: startDayIndex, 
                spanDays: spanDays,
                startHour, 
                endHour, 
                dateStr: startDate 
            });
        });
        
        let html = '<div class="planning-week-view">';
        
        // Header
        html += '<div class="planning-week-header">';
        html += '<div class="planning-week-header-cell"></div>';
        for(let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            const dateStr = Planning.formatDate(d);
            const isToday = dateStr === today;
            html += `<div class="planning-week-header-cell" style="${isToday ? 'background: var(--primary); color: white;' : ''}">${days[i]} ${d.getDate()}</div>`;
        }
        html += '</div>';
        
        // Body - Time slots avec position relative pour les événements
        html += '<div class="planning-week-body pos-relative">';
        
        // Grille des heures
        for(let hour = 6; hour <= 22; hour++) {
            html += '<div class="planning-week-row">';
            html += `<div class="planning-week-time">${String(hour).padStart(2, '0')}:00</div>`;
            
            for(let i = 0; i < 7; i++) {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + i);
                const dateStr = Planning.formatDate(d);
                
                html += `<div class="planning-week-cell" data-hour="${hour}" data-day="${i}" data-date="${dateStr}" onclick="app.Planning.openDay('${dateStr}')" ondragover="app.Planning.onDragOverWeek(event, ${hour})" ondragleave="app.Planning.onDragLeave(event)" ondrop="app.Planning.onDropWeek(event, '${dateStr}', ${hour})"></div>`;
            }
            html += '</div>';
        }
        
        // Overlay des événements (positionnés absolument dans le body)
        html += '<div class="planning-week-events-overlay">';
        weekShootDays.forEach(shootDay => {
            const totalHours = 17; // de 6h à 22h + 1
            const topPercent = ((shootDay.startHour - 6) / totalHours) * 100;
            const heightPercent = Math.max(((shootDay.endHour - shootDay.startHour) / totalHours) * 100, 5);
            
            const spanDays = shootDay.spanDays || 1;
            const widthCalc = `calc((100% / 7) * ${spanDays} - 6px)`;
            
            // Pour les jours multi-jours, le bloc prend toute la hauteur
            let blockTop, blockHeight;
            if(spanDays > 1) {
                // Multi-jours : de l'heure de début du premier jour jusqu'à la fin de journée, puis journées complètes
                blockTop = ((shootDay.startHour - 6) / 17) * 100;
                blockHeight = 100 - blockTop; // Jusqu'en bas
            } else {
                blockTop = topPercent;
                blockHeight = heightPercent;
            }
            
            // Nom du tournage (basé sur les scènes ou le nom personnalisé)
            const displayName = shootDay.name || `Tournage`;
            
            html += `<div class="planning-week-event-block ${spanDays > 1 ? 'multi-day' : ''}" 
                style="top: ${blockTop}%; height: ${blockHeight}%; left: calc((100% / 7) * ${shootDay.dayIndex} + 3px); width: ${widthCalc};"
                draggable="true" 
                ondragstart="app.Planning.onDragStart(event, '${shootDay.id}')"
                onclick="event.stopPropagation(); app.Planning.editShootDay('${shootDay.id}')" 
                oncontextmenu="event.preventDefault(); event.stopPropagation(); app.Planning.showDayContextMenu(event, '${shootDay.id}')"
                title="${Utils.escape(displayName)} | ${shootDay.crewCall || '07:00'} - ${shootDay.estimatedWrap || '19:00'} | ${(shootDay.scenes || []).length} scène(s)">
                <div class="event-block-content">
                    <strong>${Utils.escape(displayName)}</strong>
                    <span>${shootDay.crewCall || '07:00'} - ${shootDay.estimatedWrap || '19:00'}</span>
                    <span>${(shootDay.scenes || []).length} scène(s)${spanDays > 1 ? ' • ' + spanDays + 'j' : ''}</span>
                </div>
                <div class="event-resize-handle-top" onmousedown="app.Planning.startResize(event, '${shootDay.id}', 'top')"></div>
                <div class="event-resize-handle-bottom" onmousedown="app.Planning.startResize(event, '${shootDay.id}', 'bottom')"></div>
                <div class="event-resize-handle-right" onmousedown="app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'right')"></div>
                <div class="event-resize-handle-left" onmousedown="app.Planning.startResizeHorizontal(event, '${shootDay.id}', 'left')"></div>
            </div>`;
        });
        html += '</div>'; // Ferme overlay
        
        html += '</div>'; // Ferme week-body
        
        html += '</div>'; // Ferme week-view
        return html;
    },
    
    renderDayView: () => {
        const dateStr = Planning.formatDate(Planning.currentDate);
        const shootDay = Planning.getShootDay(dateStr);
        const availBars = Planning.getAvailabilityBarsForDate(dateStr);
        
        let html = '<div class="planning-day-view">';
        
        // En-tête du jour
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:15px; border-bottom:2px solid var(--border);">
            <div>
                <div style="font-size:1.5rem; font-weight:bold;">📅 ${new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <div class="flex-gap10">
                ${shootDay ? `<button onclick="app.Planning.editShootDay('${shootDay.id}')" class="btn btn--primary">✏️ Modifier : ${Utils.escape(shootDay.name || 'Tournage')}</button>` : `<button onclick="app.Planning.addShootDay('${dateStr}')" class="btn btn--primary">➕ Planifier un tournage</button>`}
            </div>
        </div>`;
        
        // Section Jour de Tournage
        if(shootDay) {
            html += `<div style="background:rgba(40,167,69,0.1); border:2px solid var(--success); border-radius:8px; padding:15px; margin-bottom:20px;">
                <div class="flex-center-mb10">
                    <span class="fs-15">🎬</span>
                    <span style="font-weight:bold; font-size:1.1rem;">${Utils.escape(shootDay.name || 'Tournage')}</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; font-size:0.9rem;">
                    <div>📍 <strong>Lieu:</strong> ${shootDay.location || 'Non défini'}</div>
                    <div>⏰ <strong>Convocation:</strong> ${shootDay.crewCall || '--:--'}</div>
                    <div>🎬 <strong>Prêt à tourner:</strong> ${shootDay.readyToShoot || '--:--'}</div>
                    <div>🏁 <strong>Fin estimée:</strong> ${shootDay.estimatedWrap || '--:--'}</div>
                </div>
                <div style="margin-top:10px; font-size:0.9rem;">
                    <strong>Scènes:</strong> ${shootDay.scenes?.length || 0} • 
                    <strong>Convoqués:</strong> ${shootDay.callSheet?.length || 0}
                </div>
            </div>`;
        } else {
            html += `<div style="background:var(--bg); border:1px dashed var(--border); border-radius:8px; padding:20px; margin-bottom:20px; text-align:center; color:var(--text-sec);">
                <span class="fs-15">📭</span>
                <p style="margin:10px 0 0;">Aucun tournage planifié ce jour</p>
            </div>`;
        }
        
        // Section Disponibilités Comédiens
        html += `<div class="mb-20">
            <h3 class="title-primary">🎭 Disponibilités Comédien.nes</h3>`;
        
        const actorBars = availBars.filter(b => b.type === 'actor');
        if(actorBars.length > 0) {
            html += '<div class="flex-wrap-gap8">';
            actorBars.forEach(bar => {
                const bgColor = bar.color || '#4CAF50';
                html += `<div style="background:${bgColor}; color:#fff; padding:6px 12px; border-radius:20px; font-size:0.85rem; display:flex; align-items:center; gap:5px;">
                    ${bar.name}
                    ${bar.hasVehicle ? '<span title="Véhicule disponible">🚗</span>' : ''}
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="color:var(--text-sec); font-size:0.9rem; padding:10px; background:var(--bg); border-radius:6px;">Aucune disponibilité affichée. Sélectionnez des comédien.nes dans le panneau ci-dessus.</div>';
        }
        html += '</div>';
        
        // Section Disponibilités Techniciens
        html += `<div class="mb-20">
            <h3 class="title-primary">🎬 Disponibilités Équipe Technique</h3>`;
        
        const crewBars = availBars.filter(b => b.type === 'crew');
        if(crewBars.length > 0) {
            html += '<div class="flex-wrap-gap8">';
            crewBars.forEach(bar => {
                const bgColor = bar.color || '#2196F3';
                html += `<div style="background:${bgColor}; color:#fff; padding:6px 12px; border-radius:20px; font-size:0.85rem; display:flex; align-items:center; gap:5px;">
                    ${bar.name}
                    ${bar.hasVehicle ? '<span title="Véhicule disponible">🚗</span>' : ''}
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<div style="color:var(--text-sec); font-size:0.9rem; padding:10px; background:var(--bg); border-radius:6px;">Aucune disponibilité affichée. Sélectionnez des technicien.nes dans le panneau ci-dessus.</div>';
        }
        html += '</div>';
        
        // Résumé des véhicules disponibles
        const vehicleBars = availBars.filter(b => b.hasVehicle);
        if(vehicleBars.length > 0) {
            html += `<div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:15px;">
                <h3 class="title-primary">🚗 Véhicules Disponibles</h3>
                <div style="display:flex; flex-wrap:wrap; gap:10px;">`;
            vehicleBars.forEach(bar => {
                let vehicleInfo = bar.vehicleSeats ? `${bar.vehicleSeats} places` : '';
                if(bar.vehicleTrunk) vehicleInfo += vehicleInfo ? ' + coffre' : 'Coffre dispo';
                html += `<div style="background:var(--panel-bg); border:1px solid var(--border); padding:8px 12px; border-radius:6px; font-size:0.85rem;">
                    <strong>${Utils.escape(bar.name)}</strong> ${vehicleInfo ? `<span class="text-sec">• ${vehicleInfo}</span>` : ''}
                </div>`;
            });
            html += '</div></div>';
        }
        
        html += '</div>';
        return html;
    }
};
  
  // ================ PLANNING - SELECTEURS DE DISPONIBILITES ================
  // Extrait du coeur de Planning (v578). Le panneau « qui affiche-t-on sous le
  // calendrier » : la liste des personnes choisies et les barres de
  // disponibilite d'une date. L'ETAT selectedAvailability VIT ICI ;
  // Planning.selectedAvailability n'en est plus qu'un renvoi (get/set), pour
  // que le code existant continue de lire et d'ecrire au meme endroit.