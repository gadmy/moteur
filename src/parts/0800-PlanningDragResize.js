
  const PlanningDragResize = {
    draggedDayId: null,
    
    // 31 aout — TROISIEME ANGLE MORT SOURIS. Faire glisser un jour d'une case a
    // l'autre du calendrier, ou tirer son bord pour l'allonger, DEPLACE une date
    // de tournage et enregistre. Aucun de ces gestes n'est un clic : le verrou
    // visuel les laissait passer entiers. Une seule reponse pour les cinq
    // points d'entree (glisser, deposer, deposer en vue semaine, les deux
    // redimensionnements).
    peutEcrire: () => {
        if(typeof Permissions === 'undefined' || !Permissions.canEditFiche) return true;
        return Permissions.canEditFiche('day');
    },
    
    onDragStart: (event, dayId) => {
        if(!PlanningDragResize.peutEcrire()) { try { event.preventDefault(); } catch(_) {} return; }
        PlanningDragResize.draggedDayId = dayId;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dayId);
        event.target.style.opacity = '0.5';
    },
    
    onDragOver: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        event.currentTarget.style.background = 'rgba(43, 110, 246, 0.2)';
    },
    
    onDrop: async (event, targetDate) => {
        event.preventDefault();
        if(!PlanningDragResize.peutEcrire()) return;
        event.currentTarget.style.background = '';
        
        if(!PlanningDragResize.draggedDayId) return;
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === PlanningDragResize.draggedDayId);
        if(!shootDay) return;
        
        // Calculer la durée du tournage
        const oldStartDate = shootDay.startDate || shootDay.date;
        const oldEndDate = shootDay.endDate || oldStartDate;
        const startDateObj = new Date(oldStartDate);
        const endDateObj = new Date(oldEndDate);
        const duration = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        
        // Calculer les nouvelles dates
        const newStartDate = targetDate;
        const newStartDateObj = new Date(newStartDate);
        const newEndDateObj = new Date(newStartDateObj);
        newEndDateObj.setDate(newEndDateObj.getDate() + duration);
        const newEndDate = Planning.formatDate(newEndDateObj);
        
        // Vérifier si un jour existe déjà à cette date
        const existingDay = state.data.shootingDays.find(sd => {
            if(sd.id === PlanningDragResize.draggedDayId) return false;
            const start = sd.startDate || sd.date;
            const end = sd.endDate || start;
            return (newStartDate >= start && newStartDate <= end) || (newEndDate >= start && newEndDate <= end);
        });
        
        if(existingDay) {
            if(!await ConfirmModal.show({ title: 'Jour existant', message: 'Un jour de tournage existe déjà sur cette période.\n\nVoulez-vous continuer ?', icon: '📅', confirmText: 'Continuer' })) {
                PlanningDragResize.draggedDayId = null;
                Planning.render();
                return;
            }
        }
        
        shootDay.startDate = newStartDate;
        shootDay.endDate = newEndDate;
        // Supprimer l'ancien format si présent
        delete shootDay.date;
        
        History.log('EDIT', `Déplacement tournage "${shootDay.name}" : ${oldStartDate} → ${newStartDate}`, { target: { kind: 'shootingDay', id: shootDay.id, label: shootDay.name }, link: { kind: 'shootingDay', id: shootDay.id } });
        Planning.renumberDays();
        Planning.syncShootingDatesToProfiles();
        Store.save();
        Planning.render();
        Utils.toast('Tournage déplacé', 'success');
        
        PlanningDragResize.draggedDayId = null;
    },
    
    onDragOverWeek: (event, hour) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        event.currentTarget.style.background = 'rgba(43, 110, 246, 0.3)';
    },
    
    onDragLeave: (event) => {
        event.currentTarget.style.background = '';
    },
    
    onDropWeek: async (event, targetDate, hour) => {
        if(!PlanningDragResize.peutEcrire()) return;
        event.preventDefault();
        event.currentTarget.style.background = '';
        
        if(!PlanningDragResize.draggedDayId) return;
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === PlanningDragResize.draggedDayId);
        if(!shootDay) return;
        
        // Calculer la durée en jours
        const oldStartDate = shootDay.startDate || shootDay.date;
        const oldEndDate = shootDay.endDate || oldStartDate;
        const startDateObj = new Date(oldStartDate);
        const endDateObj = new Date(oldEndDate);
        const durationDays = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        
        // Calculer la durée en heures
        const oldStartHour = shootDay.crewCall ? parseInt(shootDay.crewCall.split(':')[0]) : 7;
        const oldEndHour = shootDay.estimatedWrap ? parseInt(shootDay.estimatedWrap.split(':')[0]) : 19;
        const durationHours = oldEndHour - oldStartHour;
        
        // Nouvelles dates
        const newStartDate = targetDate;
        const newStartDateObj = new Date(newStartDate);
    const newEndDateObj = new Date(newStartDateObj);
        newEndDateObj.setDate(newEndDateObj.getDate() + durationDays);
        const newEndDate = Planning.formatDate(newEndDateObj);
        
        // Nouvelle heure de début et fin
        const newStartHour = hour;
        const newEndHour = Math.min(hour + durationHours, 22);
        
        // Vérifier si un jour existe déjà à cette date
        const existingDay = state.data.shootingDays.find(sd => {
            if(sd.id === PlanningDragResize.draggedDayId) return false;
            const start = sd.startDate || sd.date;
            const end = sd.endDate || start;
            return (newStartDate >= start && newStartDate <= end) || (newEndDate >= start && newEndDate <= end);
        });
        
        if(existingDay) {
            if(!await ConfirmModal.show({ title: 'Tournage existant', message: 'Un tournage existe déjà sur cette période.\n\nVoulez-vous continuer ?', icon: '📅', confirmText: 'Continuer' })) {
                PlanningDragResize.draggedDayId = null;
                Planning.render();
                return;
            }
        }
        
        shootDay.startDate = newStartDate;
        shootDay.endDate = newEndDate;
        delete shootDay.date;
        shootDay.crewCall = String(newStartHour).padStart(2, '0') + ':00';
        shootDay.estimatedWrap = String(newEndHour).padStart(2, '0') + ':00';
        
        // Mettre à jour readyToShoot (30 min après crewCall)
        shootDay.readyToShoot = String(newStartHour).padStart(2, '0') + ':30';
        
        History.log('EDIT', `Déplacement tournage "${shootDay.name}" : ${oldStartDate} → ${newStartDate} (${shootDay.crewCall} - ${shootDay.estimatedWrap})`, { target: { kind: 'shootingDay', id: shootDay.id, label: shootDay.name }, link: { kind: 'shootingDay', id: shootDay.id } });
        Planning.renumberDays();
        Planning.syncShootingDatesToProfiles();
        Store.save();
        Planning.render();
        Utils.toast(`Tournage déplacé au ${newStartDate} (${shootDay.crewCall} - ${shootDay.estimatedWrap})`, 'success');
        
        PlanningDragResize.draggedDayId = null;
    },
    
    // Resize des événements
    resizingDayId: null,
    resizeDirection: null,
    resizeStartY: 0,
    resizeStartHour: 0,
    
    startResize: (event, dayId, direction) => {
        if(!PlanningDragResize.peutEcrire()) return;
        event.preventDefault();
        event.stopPropagation();
        
        PlanningDragResize.resizingDayId = dayId;
        PlanningDragResize.resizeDirection = direction;
        PlanningDragResize.resizeStartY = event.clientY;
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(shootDay) {
            if(direction === 'top') {
                PlanningDragResize.resizeStartHour = shootDay.crewCall ? parseInt(shootDay.crewCall.split(':')[0]) : 7;
            } else {
                PlanningDragResize.resizeStartHour = shootDay.estimatedWrap ? parseInt(shootDay.estimatedWrap.split(':')[0]) : 19;
            }
        }
        
        document.addEventListener('mousemove', PlanningDragResize.onResizeMove);
        document.addEventListener('mouseup', PlanningDragResize.onResizeEnd);
    },
    
    onResizeMove: (event) => {
        if(!PlanningDragResize.resizingDayId) return;
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === PlanningDragResize.resizingDayId);
        if(!shootDay) return;
        
        // Calculer le delta en heures (30px = 1 heure approximativement)
        const deltaY = event.clientY - PlanningDragResize.resizeStartY;
        const deltaHours = Math.round(deltaY / 30);
        
        let newHour = PlanningDragResize.resizeStartHour + deltaHours;
        newHour = Math.max(6, Math.min(22, newHour));
        
        if(PlanningDragResize.resizeDirection === 'top') {
            const endHour = shootDay.estimatedWrap ? parseInt(shootDay.estimatedWrap.split(':')[0]) : 19;
            if(newHour < endHour) {
                shootDay.crewCall = String(newHour).padStart(2, '0') + ':00';
                shootDay.readyToShoot = String(newHour).padStart(2, '0') + ':30';
            }
        } else {
            const startHour = shootDay.crewCall ? parseInt(shootDay.crewCall.split(':')[0]) : 7;
            if(newHour > startHour) {
                shootDay.estimatedWrap = String(newHour).padStart(2, '0') + ':00';
            }
        }
        
        Planning.render();
    },
    
    onResizeEnd: () => {
        if(PlanningDragResize.resizingDayId) {
            const shootDay = state.data.shootingDays.find(sd => sd.id === PlanningDragResize.resizingDayId);
            if(shootDay) {
    History.log('EDIT', `Modification horaires ${Planning.dayShortLabel(shootDay)} : ${shootDay.crewCall} - ${shootDay.estimatedWrap}`, { target: { kind: 'shootingDay', id: shootDay.id, label: `Jour #${shootDay.dayNumber}` }, link: { kind: 'shootingDay', id: shootDay.id } });
                Planning.syncShootingDatesToProfiles();
                Store.save();
                Utils.toast(`Horaires modifiés : ${shootDay.crewCall} - ${shootDay.estimatedWrap}`, 'success');
            }
        }
        
        PlanningDragResize.resizingDayId = null;
        PlanningDragResize.resizeDirection = null;
        document.removeEventListener('mousemove', PlanningDragResize.onResizeMove);
        document.removeEventListener('mouseup', PlanningDragResize.onResizeEnd);
    },
    
    // Resize horizontal (étendre sur plusieurs jours)
    resizeHorizontalDayId: null,
    resizeHorizontalStartX: 0,
    resizeHorizontalDirection: null,
    resizeHorizontalOriginalStartDate: null,
    resizeHorizontalOriginalEndDate: null,
    
    startResizeHorizontal: (event, dayId, direction) => {
        if(!PlanningDragResize.peutEcrire()) return;
        event.preventDefault();
        event.stopPropagation();
        
        PlanningDragResize.resizeHorizontalDayId = dayId;
        PlanningDragResize.resizeHorizontalStartX = event.clientX;
        PlanningDragResize.resizeHorizontalDirection = direction;
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(shootDay) {
            PlanningDragResize.resizeHorizontalOriginalStartDate = shootDay.startDate || shootDay.date;
            PlanningDragResize.resizeHorizontalOriginalEndDate = shootDay.endDate || shootDay.startDate || shootDay.date;
        }
        
        document.addEventListener('mousemove', PlanningDragResize.onResizeHorizontalMove);
        document.addEventListener('mouseup', PlanningDragResize.onResizeHorizontalEnd);
    },
    
    onResizeHorizontalMove: (event) => {
        if(!PlanningDragResize.resizeHorizontalDayId) return;
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === PlanningDragResize.resizeHorizontalDayId);
        if(!shootDay) return;
        
        // Trouver la cellule sous le curseur
        const elementUnderCursor = document.elementFromPoint(event.clientX, event.clientY);
        const dayCell = elementUnderCursor?.closest('.planning-day, .planning-week-cell');
        
        if(dayCell) {
            const targetDate = dayCell.dataset?.date || dayCell.getAttribute('onclick')?.match(/'(\d{4}-\d{2}-\d{2})'/)?.[1];
            
            if(targetDate) {
                const startDate = new Date(shootDay.startDate || shootDay.date);
                const targetDateObj = new Date(targetDate);
                
                if(PlanningDragResize.resizeHorizontalDirection === 'right') {
                    // Ne pas permettre endDate < startDate
                    if(targetDateObj >= startDate) {
                        if(shootDay.endDate !== targetDate) {
                            shootDay.endDate = targetDate;
                            Planning.render();
                        }
                    }
                } else if(PlanningDragResize.resizeHorizontalDirection === 'left') {
                    const endDate = new Date(shootDay.endDate || shootDay.startDate || shootDay.date);
                    // Ne pas permettre startDate > endDate
                    if(targetDateObj <= endDate) {
                        if(shootDay.startDate !== targetDate) {
                            shootDay.startDate = targetDate;
                            Planning.render();
                        }
                    }
                }
            }
        }
    },
    
    onResizeHorizontalEnd: () => {
        if(PlanningDragResize.resizeHorizontalDayId) {
            const shootDay = state.data.shootingDays.find(sd => sd.id === PlanningDragResize.resizeHorizontalDayId);
            if(shootDay) {
                const startDate = shootDay.startDate || shootDay.date;
                const endDate = shootDay.endDate || startDate;
                
                History.log('EDIT', `Modification durée tournage "${shootDay.name || 'Sans nom'}" : ${startDate} → ${endDate}`, { target: { kind: 'shootingDay', id: shootDay.id, label: shootDay.name || 'Sans nom' }, link: { kind: 'shootingDay', id: shootDay.id } });
                Planning.syncShootingDatesToProfiles();
                Store.save();
                
                const start = new Date(startDate);
                const end = new Date(endDate);
                const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
                Utils.toast(`Tournage étendu sur ${days} jour(s)`, 'success');
            }
        }
        
        PlanningDragResize.resizeHorizontalDayId = null;
        PlanningDragResize.resizeHorizontalDirection = null;
        document.removeEventListener('mousemove', PlanningDragResize.onResizeHorizontalMove);
        document.removeEventListener('mouseup', PlanningDragResize.onResizeHorizontalEnd);
    },
  };

  // ===== IDENTITE PHYSIQUE D'UNE PERSONNE (v598) =====
  // Une meme personne peut occuper PLUSIEURS postes sur un projet : Bob cadreur
  // ET Bob electro sont deux lignes d'equipe distinctes — deux salaires, deux
  // contrats, deux convocations — mais UN SEUL corps. Tout ce qui tient au
  // corps (heure d'arrivee, transport, place dans une voiture) doit donc etre
  // commun a ses lignes ; tout ce qui tient au POSTE (consigne, PAT, salaire)
  // reste separe.
  // RECONNAISSANCE : par le COMPTE, c'est-a-dire publicProfileId — l'adresse
  // mail avec laquelle la personne a cree son compte. Surtout PAS par l'email
  // porte par la ligne d'equipe : la synchronisation y ecrit l'email de
  // CONTACT de la fiche, different d'une fiche a l'autre. L'email ne sert donc
  // de repli que pour les personnes saisies a la main, jamais rattachees a un
  // compte.