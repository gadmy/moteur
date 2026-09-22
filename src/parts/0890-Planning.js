
  const Planning = {
    // ========================= ÉTAT & CONFIG =========================
    currentView: 'month',
    currentMode: 'calendar',
    currentDate: new Date(),
    editingDayId: null,
    
    // Types de journées avec leurs couleurs et icônes
    dayTypes: {
        'tournage': { icon: '🎬', color: '#FF9800', label: 'Tournage' },
        'repetition': { icon: '🎭', color: '#9C27B0', label: 'Répétition' },
        'reperage': { icon: '🔍', color: '#00BCD4', label: 'Repérage' },
        'essai-costume': { icon: '👗', color: '#E91E63', label: 'Essai costume' },
        'essai-maquillage': { icon: '💄', color: '#F06292', label: 'Essai maquillage' },
        'formation': { icon: '📚', color: '#3F51B5', label: 'Formation' },
        'reunion': { icon: '📋', color: '#607D8B', label: 'Réunion' },
        'autre': { icon: '📌', color: '#795548', label: 'Autre' },
        'preparation': { icon: '🧰', color: '#009688', label: 'Préparation' },
        'essais-camera': { icon: '📷', color: '#2196F3', label: 'Essais caméra' },
        'essais-lumiere': { icon: '💡', color: '#F9A825', label: 'Essais lumière' },
        // v601 - UN JOUR QU'ON PRESSENT SANS L'AVOIR ARRETE. Il se pose d'un
        // clic droit sur une case vide, sans feuille de service ni scenes :
        // c'est justement ce qui le distingue d'un jour de tournage, et ce
        // qu'on veut pouvoir dire a l'equipe avant d'avoir tout cale.
        // Il porte « probable: true » : c'est SUR CE DRAPEAU que tout le reste
        // decide (la pastille dans les agendas, le ton du message), jamais sur
        // la chaine « probable » — une cle de stockage se compare, elle ne
        // s'ecrit pas deux fois.
        'probable': { icon: '❓', color: '#9E9E9E', label: 'Tournage probable', probable: true }
    },

    // Ce jour est-il un simple « probable » ? Une seule facon de le demander.
    estProbable: (jour) => !!(jour && (jour.dayType === 'probable'
        || (Planning.dayTypes[jour.dayType] && Planning.dayTypes[jour.dayType].probable))),

    // Clés triées alphabétiquement par label (Autre en dernier) : source unique des selects
    dayTypesSorted: () => {
        return Object.keys(Planning.dayTypes).sort((a, b) => {
            if(a === 'autre') return 1;
            if(b === 'autre') return -1;
            return Planning.dayTypes[a].label.localeCompare(Planning.dayTypes[b].label, 'fr');
        });
    },

    // Options HTML pour un select de type de journée
    dayTypeOptionsHtml: (selected) => {
        return Planning.dayTypesSorted().map(k => {
            const t = Planning.dayTypes[k];
            return '<option value="' + k + '"' + (selected === k ? ' selected' : '') + '>' + t.icon + ' ' + t.label + '</option>';
        }).join('');
    },
    
    getDayTypeInfo: (dayType) => {
        return Planning.dayTypes[dayType] || Planning.dayTypes['tournage'];
    },
    
    // ===== NUMEROTATION DES JOURS (31 aout) =====
    // dayNumber comptait l'ORDRE DE SAISIE : le sixieme jour cree portait le
    // numero 6, meme s'il se tournait en premier, et un reperage saisi entre
    // deux jours de tournage volait un numero au tournage. Deux regles, decidees
    // avec Guillaume :
    //   1. le numero suit la DATE, pas la saisie ;
    //   2. seuls les jours de type 'tournage' sont numerotes (J1, J2...). Les
    //      dix autres types (reperage, essais, repetition, reunion...) se
    //      designent par leur nature et leur date — c'est l'usage sur un
    //      plateau, et numeroter un essai maquillage « J4 » faisait croire a
    //      un quatrieme jour de tournage.
    // Consequence ASSUMEE (Guillaume, 31/08) : sur un projet en cours, les
    // numeros deja imprimes sur des feuilles de service publiees vont bouger.
    // La fonction ne SAUVEGARDE PAS : elle corrige les objets en memoire et dit
    // si quelque chose a change. C'est a l'appelant de decider s'il enregistre —
    // sinon un simple affichage du planning declencherait une ecriture, et un
    // lecteur en 👁️ pousserait des donnees sans le savoir.
    renumberDays: () => {
        const all = state.data.shootingDays || [];
        let change = false;
        const tournage = all.filter(d => d && (d.dayType || 'tournage') === 'tournage');
        tournage.sort((a, b) => String(a.startDate || a.date || '\uffff').localeCompare(String(b.startDate || b.date || '\uffff')));
        tournage.forEach((d, i) => { if(d.dayNumber !== i + 1) { d.dayNumber = i + 1; change = true; } });
        all.forEach(d => {
            if(d && (d.dayType || 'tournage') !== 'tournage' && d.dayNumber != null) { d.dayNumber = null; change = true; }
        });
        return change;
    },
    
    // Renumerote ET enregistre si besoin. A appeler apres toute operation qui
    // touche a une date, a un type de journee ou a l'existence d'un jour.
    renumberAndSave: () => {
        if(!Planning.renumberDays()) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('day')) return;
        Store.save();
    },
    
    // Comment on NOMME un jour partout dans l'application : « J3 » pour un jour
    // de tournage, « Repérage du 12 mars » pour les autres. Une seule fonction,
    // sinon chaque ecran reinvente sa formule et elles divergent.
    dayShortLabel: (d) => {
        if(!d) return '';
        const type = d.dayType || 'tournage';
        const dt = d.startDate || d.date || '';
        if(type === 'tournage') return d.dayNumber ? ('J' + d.dayNumber) : 'Jour';
        const info = Planning.getDayTypeInfo(type);
        if(!dt) return info.label;
        const o = new Date(dt);
        const jour = isNaN(o) ? dt : o.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        return info.label + ' du ' + jour;
    },
    // Version longue, pour les listes et les menus : le nom donne au jour s'il
    // en a un, sinon le libelle court.
    dayLabel: (d) => (d && d.name) ? d.name : Planning.dayShortLabel(d),
    
    // Numero PROVISOIRE d'un jour en cours de saisie. renumberDays ne tourne
    // qu'a l'enregistrement : un jour neuf, ou un jour dont on vient de changer
    // la date dans la feuille, n'a pas encore son numero definitif. Celui-ci se
    // calcule sans rien ecrire, pour que le bandeau reagisse en direct.
    previewDayNumber: (id, startDate, dayType) => {
        if((dayType || 'tournage') !== 'tournage') return null;
        const d = String(startDate || '');
        if(!d) return null;
        const autres = (state.data.shootingDays || []).filter(x =>
            x && x.id !== id && (x.dayType || 'tournage') === 'tournage'
            && String(x.startDate || x.date || '') && String(x.startDate || x.date || '') < d);
        return autres.length + 1;
    },
    
    init: () => {
        // Rattrapage des projets anterieurs : leurs numeros suivent encore
        // l'ordre de saisie. Idempotent — sur un projet deja propre, rien ne
        // change et rien n'est enregistre.
        Planning.renumberAndSave();
        Planning.render();
    },
    
    // ========================= PLAN DE TRAVAIL & KANBAN =========================
    // Basculer entre Calendrier et Kanban
    setMode: (mode) => {
        Planning.currentMode = mode;
        
        // Mettre à jour les boutons
        document.getElementById('planning-mode-calendar').classList.toggle('active', mode === 'calendar');
        document.getElementById('planning-mode-kanban').classList.toggle('active', mode === 'kanban');
        document.getElementById('planning-mode-workplan').classList.toggle('active', mode === 'workplan');
        
        // Afficher/masquer les vues
        document.getElementById('planningContainer').style.display = mode === 'calendar' ? 'block' : 'none';
        document.getElementById('kanbanContainer').style.display = mode === 'kanban' ? 'block' : 'none';
        document.getElementById('workplanContainer').style.display = mode === 'workplan' ? 'block' : 'none';
        // v577 : navigation et vues mois/semaine/jour sont REGROUPEES sur une
        // seule ligne, montree en Calendrier et cachee ailleurs. Le Kanban
        // affiche tous les jours d'un coup et le plan de travail toute la
        // duree du tournage : un bouton « mois precedent » n'y voulait rien
        // dire, il etait pourtant clique. Le menu Documents, lui, reste
        // accessible dans les trois modes.
        const barreCal = document.getElementById('planning-calendar-bar');
        if(barreCal) barreCal.style.display = mode === 'calendar' ? 'flex' : 'none';
        // Le panneau de disponibilites suit le meme sort : il ne fait que
        // colorer LE CALENDRIER. Au-dessus d'un Kanban ou d'un plan de
        // travail, c'est une ligne qui ne promet rien.
        const panneauDispo = document.querySelector('.planning-avail');
        if(panneauDispo) panneauDispo.style.display = mode === 'calendar' ? 'block' : 'none';
        
        if(mode === 'kanban') {
            Planning.renderKanban();
        } else if(mode === 'workplan') {
            Planning.renderWorkPlan();
        }
    },
    
    // ===== PLAN DE TRAVAIL (DOOD) ET KANBAN — delegues a PlanningBoards =====
    renderWorkPlan: (...a) => PlanningBoards.renderWorkPlan(...a),
    openWorkplanMenu: (...a) => PlanningBoards.openWorkplanMenu(...a),
    setWorkplanOverride: (...a) => PlanningBoards.setWorkplanOverride(...a),
    printWorkPlan: (...a) => PlanningBoards.printWorkPlan(...a),
    renderKanban: (...a) => PlanningBoards.renderKanban(...a),
    
    // ========================= VUES CALENDRIER (mois / semaine / jour) =========================
    applyPermissions: () => {
        const canEdit = state.currentRole === 'owner' || Permissions.canEdit('planning');
        
        // Désactiver les boutons d'ajout si pas de permission
        const addButtons = document.querySelectorAll('#tab-planning button[onclick*="addShootingDay"], #tab-planning button[onclick*="editDay"]');
        addButtons.forEach(btn => {
            if(!canEdit) {
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
                btn.title = '🔒 Lecture seule';
            }
        });
        
        // Désactiver les clics sur les jours
        if(!canEdit) {
            const dayCells = document.querySelectorAll('.planning-day');
            dayCells.forEach(cell => {
                cell.style.cursor = 'default';
                const originalOnclick = cell.onclick;
                cell.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                };
            });
        }
    },
    
    setView: (view) => {
        Planning.currentView = view;
        document.querySelectorAll('.planning-view-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        Planning.render();
    },
    
    prev: () => {
        if(Planning.currentView === 'month') {
            Planning.currentDate.setMonth(Planning.currentDate.getMonth() - 1);
        } else if(Planning.currentView === 'week') {
            Planning.currentDate.setDate(Planning.currentDate.getDate() - 7);
        } else {
            Planning.currentDate.setDate(Planning.currentDate.getDate() - 1);
        }
        Planning.render();
    },
    
    next: () => {
        if(Planning.currentView === 'month') {
            Planning.currentDate.setMonth(Planning.currentDate.getMonth() + 1);
        } else if(Planning.currentView === 'week') {
            Planning.currentDate.setDate(Planning.currentDate.getDate() + 7);
        } else {
            Planning.currentDate.setDate(Planning.currentDate.getDate() + 1);
        }
        Planning.render();
    },
    
    goToday: () => {
        Planning.currentDate = new Date();
        Planning.render();
    },
    
    render: () => {
        Planning.renderAvailabilitySelectors();
        const container = document.getElementById('planningContainer');
        const titleEl = document.getElementById('planningTitle');
        
        const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        
        if(Planning.currentView === 'month') {
            titleEl.innerText = months[Planning.currentDate.getMonth()] + ' ' + Planning.currentDate.getFullYear();
            container.innerHTML = Planning.renderMonthView();
        } else if(Planning.currentView === 'week') {
            const weekStart = Planning.getWeekStart(Planning.currentDate);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            titleEl.innerText = `${weekStart.getDate()} - ${weekEnd.getDate()} ${months[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
            container.innerHTML = Planning.renderWeekView();
        } else {
            titleEl.innerText = `${days[Planning.currentDate.getDay()]} ${Planning.currentDate.getDate()} ${months[Planning.currentDate.getMonth()]} ${Planning.currentDate.getFullYear()}`;
            container.innerHTML = Planning.renderDayView();
        }
    },
    
    getWeekStart: (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    },
    
    formatDate: (date) => {
        const d = new Date(date);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    
    getShootDay: (dateStr) => {
        if(!state.data.shootingDays) return null;
        return state.data.shootingDays.find(sd => {
            const start = sd.startDate || sd.date;
            const end = sd.endDate || sd.startDate || sd.date;
            return dateStr >= start && dateStr <= end;
        });
    },
    
    // ===== VUES CALENDRIER MOIS / SEMAINE / JOUR — deleguees a PlanningCalendarViews =====
    renderMonthView: (...a) => PlanningCalendarViews.renderMonthView(...a),
    renderWeekView: (...a) => PlanningCalendarViews.renderWeekView(...a),
    renderDayView: (...a) => PlanningCalendarViews.renderDayView(...a),
    
    // ==================================================================
    //  MARQUER UN JOUR « TOURNAGE PROBABLE » (v601)
    // ==================================================================
    //  Clic droit sur une case vide du calendrier. On ne demande rien
    //  d'autre : un jour probable n'a ni scenes ni feuille de service, et
    //  c'est le but — on previent l'equipe avant d'avoir tout cale.
    menuJourVide: (ev, dateStr) => {
        if(ev) { ev.preventDefault(); ev.stopPropagation(); }
        Planning.fermerMenuJour();
        if(state.currentRole === 'viewer') return;
        const menu = document.createElement('div');
        menu.id = 'menu-jour-vide';
        menu.className = 'menu-jour-vide';
        const t = Planning.dayTypes['probable'];
        menu.innerHTML = '<div class="menu-jour-tete">' + Utils.escape(Planning.jolieDate(dateStr)) + '</div>'
            + '<button class="menu-jour-item" data-act="probable">' + t.icon + ' Marquer « ' + t.label + ' »</button>'
            + '<button class="menu-jour-item" data-act="ouvrir">✏️ Créer une journée complète…</button>';
        let x = ev ? ev.clientX : 40, y = ev ? ev.clientY : 40;
        if(x + 250 > window.innerWidth) x = window.innerWidth - 260;
        if(y + 120 > window.innerHeight) y = window.innerHeight - 130;
        menu.style.left = Math.max(8, x) + 'px';
        menu.style.top = Math.max(8, y) + 'px';
        menu.addEventListener('click', (e) => {
            const act = e.target && e.target.dataset ? e.target.dataset.act : null;
            if(!act) return;
            Planning.fermerMenuJour();
            if(act === 'probable') Planning.poserProbable(dateStr);
            else Planning.openDay(dateStr);
        });
        document.body.appendChild(menu);
        setTimeout(() => { document.addEventListener('click', Planning.fermerMenuJour, { once: true }); }, 10);
    },
    fermerMenuJour: () => { const m = document.getElementById('menu-jour-vide'); if(m) m.remove(); },
    jolieDate: (dateStr) => {
        try {
            const d = new Date(String(dateStr) + 'T12:00:00');
            if(isNaN(d.getTime())) return String(dateStr || '');
            return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } catch(e) { return String(dateStr || ''); }
    },
    poserProbable: (dateStr) => {
        if(state.currentRole === 'viewer') return;
        if(!state.data.shootingDays) state.data.shootingDays = [];
        if(Planning.getShootDay(dateStr)) { Utils.toast('Il y a déjà une journée ce jour-là.', 'info'); return; }
        const t = Planning.dayTypes['probable'];
        const jour = {
            id: 'day_' + Utils.generateUniqueId(),
            date: dateStr, startDate: dateStr, endDate: dateStr,
            dayType: 'probable', name: t.label,
            scenes: [], callSheet: [], validated: false
        };
        state.data.shootingDays.push(jour);
        try { History.log('ADD', 'Tournage probable le ' + dateStr, { link: { kind: 'day', id: jour.id } }); } catch(e) {}
        Store.save();
        Planning.render();
        Utils.toast(t.icon + ' Tournage probable posé le ' + Planning.jolieDate(dateStr)
            + ' — il apparaît dans l’agenda des membres du projet.', 'success', 7000);
    },

    openDay: (dateStr) => {
        const shootDay = Planning.getShootDay(dateStr);
        if(shootDay) {
            Planning.editShootDay(shootDay.id);
        } else {
            // 31 aout — une case VIDE du calendrier CREE un jour. Ce n'est donc
            // pas une lecture : sans ce garde-fou, rendre le calendrier cliquable
            // pour un lecteur lui aurait fait fabriquer des jours de tournage.
            if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('day')) {
                Utils.toast('Aucun jour de tournage à cette date.', 'info');
                return;
            }
            Planning.addShootDay(dateStr);
        }
    },
    
    // ========================= CRUD JOURS DE TOURNAGE =========================
    // La date est OBLIGATOIRE depuis le 25 aout. Elle etait facultative, avec
    // repli sur la date de navigation du calendrier : on croyait ouvrir une
    // feuille vierge et on creait un jour au hasard du mois affiche. Un jour
    // naît en cliquant la journee voulue dans l'agenda, point.
    addShootDay: (dateStr) => {
        if(state.currentRole === 'viewer') return;
        
        const date = dateStr || '';
        if(!date) { Utils.toast('Choisis d\u2019abord un jour dans l\u2019agenda.', 'info'); return; }
        
        // 31 aout : plus de compteur de saisie. Le numero est attribue par
        // Planning.renumberDays() a l'enregistrement, en fonction de la DATE.
        const newDay = {
            id: Utils.generateUniqueId(),
            date: date,
            dayNumber: null,
            dayType: 'tournage', // cf. Planning.dayTypes (source unique)
            location: '',
            locationAddress: '',
            crewCall: '07:00',
            readyToShoot: '08:30',
            lunchStart: '13:00',
            lunchEnd: '14:00',
            estimatedWrap: '19:00',
            scenes: [],
            callSheet: [],
            notes: '',
            previsions: '',
            extraStaff: '',
            weather: null,
            customWeather: ''
        };
        
        Planning.editingDayId = 'new';
        Planning.showEditModal(newDay);
    },
    
    editShootDay: (dayId) => {
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(!shootDay) return;
        
        // S'assurer que scenes et callSheet sont des tableaux
        if(!shootDay.scenes) shootDay.scenes = [];
        if(!shootDay.callSheet) shootDay.callSheet = [];
        
        Planning.editingDayId = dayId;
        Planning.showEditModal(shootDay);
    },
    
    showEditModal: (...a) => PlanningDayEdit.showEditModal(...a),
    closeModal: (...a) => PlanningDayEdit.closeModal(...a),
    
    // Les dix facades transport / « Avec qui » ont disparu avec leurs cibles
    // (nettoyage v566) : la feuille de service parle au modele directement.
    
// ========== SYNC DATES + SAUVEGARDE JOUR — délégué à PlanningDayEdit ==========
    syncShootingDatesToProfiles: (...a) => PlanningDayEdit.syncShootingDatesToProfiles(...a),
    saveShootDay: (...a) => PlanningDayEdit.saveShootDay(...a),
    switchFDSTab: (...a) => PlanningDayEdit.switchFDSTab(...a),
    refreshFDSTabs: (...a) => PlanningDayEdit.refreshFDSTabs(...a),
    
    deleteShootDay: async (dayId) => {
        if(!await ConfirmModal.confirmDelete("Ce jour de tournage sera supprimé.")) return;
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        // [Phase D] Capturer le recoverable AVANT suppression
        const sdLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const sdRecoverable = shootDay ? await History.captureRecoverable(shootDay, 'shootingDay', sdLogId) : null;
        
        state.data.shootingDays = state.data.shootingDays.filter(sd => sd.id !== dayId);
        History.log('DELETE', `Suppression ${Planning.dayShortLabel(shootDay)} (${shootDay?.date || '?'})`, {
            target: { kind: 'shootingDay', id: dayId, label: Planning.dayShortLabel(shootDay) },
            recoverable: sdRecoverable
        });
        
        // Synchroniser les calendriers des profils
        // On renumerote AVANT la synchro : elle recopie dayNumber dans les fiches.
        Planning.renumberDays();
        Planning.syncShootingDatesToProfiles();
        
        Store.save();
        Planning.closeModal();
        Planning.render();
    },
    
    deleteShootDayFromList: async (dayId) => {
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(!await ConfirmModal.confirmDelete(`Le tournage "${shootDay?.name || 'Tournage'}" (${shootDay?.startDate || shootDay?.date || '?'}) sera supprimé.`)) return;
        
        // [Phase D] Capturer le recoverable AVANT suppression
        const sdLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const sdRecoverable = shootDay ? await History.captureRecoverable(shootDay, 'shootingDay', sdLogId) : null;
        
        state.data.shootingDays = state.data.shootingDays.filter(sd => sd.id !== dayId);
        History.log('DELETE', `Suppression tournage "${shootDay?.name || '?'}" (${shootDay?.startDate || shootDay?.date || '?'})`, {
            target: { kind: 'shootingDay', id: dayId, label: shootDay?.name || 'Tournage' },
            recoverable: sdRecoverable
        });
        
        // Synchroniser les calendriers des profils
        Planning.syncShootingDatesToProfiles();
        
        Planning.renumberDays();
        Store.save();
        Planning.openCallSheets(); // Rafraîchir la liste
        Planning.render();
        Utils.toast('Jour de tournage supprimé', 'success');
    },
    
    showDayContextMenu: (event, dayId) => {
        // Supprimer un ancien menu s'il existe
        const oldMenu = document.getElementById('planning-context-menu');
        if(oldMenu) oldMenu.remove();
        
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(!shootDay) return;
        
        const menu = document.createElement('div');
        menu.id = 'planning-context-menu';
        let menuTop = event.clientY;
        let menuLeft = event.clientX;
        if(menuLeft + 200 > window.innerWidth) menuLeft = window.innerWidth - 210;
        if(menuTop + 180 > window.innerHeight) menuTop = window.innerHeight - 190;
        if(menuLeft < 10) menuLeft = 10;
        if(menuTop < 10) menuTop = 10;
        menu.style.cssText = `
            position: fixed;
            top: ${menuTop}px;
            left: ${menuLeft}px;
            background: var(--panel-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: var(--z-modal);
            min-width: 180px;
            overflow: hidden;
        `;
        
        menu.innerHTML = `
            <div style="padding: 10px 15px; border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text-sec); font-size: 0.85rem;">
                📅 ${Utils.escape(shootDay.name || 'Tournage').substring(0, 20)} - ${new Date(shootDay.startDate || shootDay.date).toLocaleDateString('fr-FR')}
            </div>
            <div class="context-menu-item" onclick="event.stopPropagation(); app.Planning.hideContextMenu(); app.Planning.editShootDay('${dayId}');" style="padding: 12px 15px; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                <span>✏️</span> Modifier
            </div>
            <div class="context-menu-item" onclick="event.stopPropagation(); app.Planning.hideContextMenu(); app.Planning.duplicateShootDay('${dayId}');" style="padding: 12px 15px; cursor: pointer; display: flex; align-items: center; gap: 10px;">
                <span>📋</span> Dupliquer
            </div>
            <div class="context-menu-item" onclick="event.stopPropagation(); app.Planning.hideContextMenu(); app.Planning.deleteShootDayFromCalendar('${dayId}');" style="padding: 12px 15px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: var(--danger);">
                <span>🗑️</span> Supprimer
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Fermer le menu en cliquant ailleurs
        setTimeout(() => {
            document.addEventListener('click', Planning.hideContextMenu, { once: true });
        }, 10);
    },
    
    hideContextMenu: () => {
        const menu = document.getElementById('planning-context-menu');
        if(menu) menu.remove();
    },
    
    deleteShootDayFromCalendar: async (dayId) => {
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(!await ConfirmModal.confirmDelete(`Le tournage "${shootDay?.name || 'Tournage'}" (${shootDay?.startDate || shootDay?.date || '?'}) sera supprimé.`)) return;
        
        // [Phase D] Capturer le recoverable AVANT suppression
        const sdLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const sdRecoverable = shootDay ? await History.captureRecoverable(shootDay, 'shootingDay', sdLogId) : null;
        
        state.data.shootingDays = state.data.shootingDays.filter(sd => sd.id !== dayId);
        History.log('DELETE', `Suppression tournage "${shootDay?.name || '?'}" (${shootDay?.startDate || shootDay?.date || '?'})`, {
            target: { kind: 'shootingDay', id: dayId, label: shootDay?.name || 'Tournage' },
            recoverable: sdRecoverable
        });
        
        Planning.renumberDays();
        Planning.syncShootingDatesToProfiles();
        Store.save();
        Planning.render();
        Utils.toast('Jour de tournage supprimé', 'success');
    },
    
    // Le double naît sur le LENDEMAIN de l'original (25 aout). Il naissait sans
    // date, deja enregistre : refermer la feuille sans rien valider laissait un
    // jour fantome, invisible dans l'agenda mais bien present dans les totaux.
    // Une date fausse mais visible se corrige d'un glisser-deposer ; une date
    // absente ne se corrige nulle part.
    duplicateShootDay: (dayId) => {
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(!shootDay) return;
        
        const newDay = JSON.parse(JSON.stringify(shootDay));
        newDay.id = Utils.generateUniqueId();
        // Le numero du double est recalcule d'apres sa DATE, comme les autres.
        newDay.dayNumber = null;
        const base = shootDay.startDate || shootDay.date || '';
        let next = '';
        if(base) {
            const d = new Date(base + 'T12:00:00');
            if(!isNaN(d.getTime())) { d.setDate(d.getDate() + 1); next = Planning.formatDate(d); }
        }
        if(!next) next = Planning.formatDate(new Date());
        newDay.date = next;
        newDay.startDate = next;
        newDay.endDate = next;
        // Le nom auto porte le numero des scenes, pas la date : recopie tel quel
        // il ferait deux jours au meme nom. On le vide pour qu'il soit refait.
        if(newDay.name && /^Tournage /.test(newDay.name)) newDay.name = '';
        newDay.validated = false;
        
        state.data.shootingDays.push(newDay);
        Planning.renumberDays();
        Store.save();
        
        // Ouvrir la modale pour ajuster la date proposee
        Planning.editShootDay(newDay.id);
        Utils.toast('Jour dupliqué sur le ' + next + ' — ajuste la date si besoin', 'info');
    },
    
// ========== DRAG & DROP / REDIMENSIONNEMENT — délégué à PlanningDragResize ==========
    get draggedDayId() { return PlanningDragResize.draggedDayId; },
    set draggedDayId(v) { PlanningDragResize.draggedDayId = v; },
    get resizingDayId() { return PlanningDragResize.resizingDayId; },
    set resizingDayId(v) { PlanningDragResize.resizingDayId = v; },
    get resizeDirection() { return PlanningDragResize.resizeDirection; },
    set resizeDirection(v) { PlanningDragResize.resizeDirection = v; },
    get resizeStartY() { return PlanningDragResize.resizeStartY; },
    set resizeStartY(v) { PlanningDragResize.resizeStartY = v; },
    get resizeStartHour() { return PlanningDragResize.resizeStartHour; },
    set resizeStartHour(v) { PlanningDragResize.resizeStartHour = v; },
    get resizeHorizontalDayId() { return PlanningDragResize.resizeHorizontalDayId; },
    set resizeHorizontalDayId(v) { PlanningDragResize.resizeHorizontalDayId = v; },
    get resizeHorizontalStartX() { return PlanningDragResize.resizeHorizontalStartX; },
    set resizeHorizontalStartX(v) { PlanningDragResize.resizeHorizontalStartX = v; },
    get resizeHorizontalDirection() { return PlanningDragResize.resizeHorizontalDirection; },
    set resizeHorizontalDirection(v) { PlanningDragResize.resizeHorizontalDirection = v; },
    get resizeHorizontalOriginalStartDate() { return PlanningDragResize.resizeHorizontalOriginalStartDate; },
    set resizeHorizontalOriginalStartDate(v) { PlanningDragResize.resizeHorizontalOriginalStartDate = v; },
    get resizeHorizontalOriginalEndDate() { return PlanningDragResize.resizeHorizontalOriginalEndDate; },
    set resizeHorizontalOriginalEndDate(v) { PlanningDragResize.resizeHorizontalOriginalEndDate = v; },
    onDragStart: (...a) => PlanningDragResize.onDragStart(...a),
    onDragOver: (...a) => PlanningDragResize.onDragOver(...a),
    onDrop: (...a) => PlanningDragResize.onDrop(...a),
    onDragOverWeek: (...a) => PlanningDragResize.onDragOverWeek(...a),
    onDragLeave: (...a) => PlanningDragResize.onDragLeave(...a),
    onDropWeek: (...a) => PlanningDragResize.onDropWeek(...a),
    startResize: (...a) => PlanningDragResize.startResize(...a),
    startResizeHorizontal: (...a) => PlanningDragResize.startResizeHorizontal(...a),
    
    // ========================= ADRESSE & CARTE =========================
    // searchAddress / selectAddress / showMiniMap sont supprimees (nettoyage
    // v566) : leurs conteneurs #address-suggestions et #location-minimap
    // vivaient dans le pane Formulaire, retire en v565. La feuille de service
    // a sa propre recherche d'adresse (FDSLive.searchAddress) et sa propre
    // carte Leaflet (FDSLive.mountMapWeather).
    
    tempShootDay: null,
    
// ========== SCÈNES & DÉPOUILLEMENT DU JOUR — délégué à PlanningBreakdown ==========
    addSceneToDay: (...a) => PlanningBreakdown.addSceneToDay(...a),
    removeSceneFromDay: (...a) => PlanningBreakdown.removeSceneFromDay(...a),
    autoSelectActorsForScenes: (...a) => PlanningBreakdown.autoSelectActorsForScenes(...a),
    autoSelectCrewForBreakdown: (...a) => PlanningBreakdown.autoSelectCrewForBreakdown(...a),
    _bdEnsure: () => {
        const d = Planning.tempShootDay;
        // Elargi le 1er septembre : le test portait sur le role GLOBAL, il
        // laissait donc ecrire un editeur qui n'a que la lecture sur le
        // planning. C'est le droit de la SECTION qui compte.
        if(!d || !PlanningDayEdit.canWrite()) return null;
        if(!d.bdNotes) d.bdNotes = {};
        if(!d.bdExtra) d.bdExtra = {};
        if(!d.bdHidden) d.bdHidden = [];
        return d;
    },
    // Ces boutons vivaient dans le pane Formulaire, retire en v565 : ils sont
    // rebranches en v566 sur le tableau DEPOUILLEMENT de la feuille de service,
    // qui est donc ce qu'il faut rejouer apres chaque changement.
    bdRefresh: () => {
        if(document.getElementById('fds-pane-live')) FDSLive.render();
    },
    bdSetNote: (i, val) => {
        const d = Planning._bdEnsure(); if(!d) return;
        const cat = CONFIG.bdCategories[i]; if(!cat) return;
        d.bdNotes[cat] = val;
    },
    bdAddExtra: (i) => {
        const d = Planning._bdEnsure(); if(!d) return;
        const cat = CONFIG.bdCategories[i]; if(!cat) return;
        const inp = document.getElementById('bd-extra-input-' + i);
        if(!inp) return;
        const val = inp.value.trim();
        if(!val) return;
        if(!d.bdExtra[cat]) d.bdExtra[cat] = [];
        if(!d.bdExtra[cat].includes(val)) d.bdExtra[cat].push(val);
        inp.value = '';
        Planning.bdRefresh();
    },
    bdRemoveExtra: (i, j) => {
        const d = Planning._bdEnsure(); if(!d) return;
        const cat = CONFIG.bdCategories[i]; if(!cat) return;
        if(d.bdExtra[cat]) { d.bdExtra[cat].splice(j, 1); Planning.bdRefresh(); }
    },
    bdHide: (i) => {
        const d = Planning._bdEnsure(); if(!d) return;
        const cat = CONFIG.bdCategories[i]; if(!cat) return;
        if(!d.bdHidden.includes(cat)) d.bdHidden.push(cat);
        Planning.bdRefresh();
    },
    bdShow: (i) => {
        const d = Planning._bdEnsure(); if(!d) return;
        const cat = CONFIG.bdCategories[i]; if(!cat) return;
        d.bdHidden = d.bdHidden.filter(c => c !== cat);
        Planning.bdRefresh();
    },
	
    // ===== SELECTEURS DE DISPONIBILITES — delegues a PlanningAvailPicker =====
    get selectedAvailability() { return PlanningAvailPicker.selectedAvailability; },
    set selectedAvailability(v) { PlanningAvailPicker.selectedAvailability = v; },
    renderAvailabilitySelectors: (...a) => PlanningAvailPicker.renderAvailabilitySelectors(...a),
    renderAvailabilityTags: (...a) => PlanningAvailPicker.renderAvailabilityTags(...a),
    toutSelectionner: (...a) => PlanningAvailPicker.toutSelectionner(...a),
    journeeLibrePourTous: (...a) => PlanningAvailPicker.journeeLibrePourTous(...a),
    toutEnlever: (...a) => PlanningAvailPicker.toutEnlever(...a),
    showDropdown: (...a) => PlanningAvailPicker.showDropdown(...a),
    hideDropdown: (...a) => PlanningAvailPicker.hideDropdown(...a),
    filterAvailabilityList: (...a) => PlanningAvailPicker.filterAvailabilityList(...a),
    selectFromDropdown: (...a) => PlanningAvailPicker.selectFromDropdown(...a),
    toggleAvailabilityPerson: (...a) => PlanningAvailPicker.toggleAvailabilityPerson(...a),
    getAvailabilityBarsForDate: (...a) => PlanningAvailPicker.getAvailabilityBarsForDate(...a),
    
    // ========== FEUILLES DE SERVICE / CONVOCATIONS — délégué à PlanningCallSheets ==========
    openCallSheets: (...a) => PlanningCallSheets.openCallSheets(...a),
    closeCallSheets: (...a) => PlanningCallSheets.closeCallSheets(...a),
    validateCallSheet: (...a) => PlanningCallSheets.validateCallSheet(...a),
    sendCallSheet: (...a) => PlanningCallSheets.sendCallSheet(...a),
	
    // ========== FEUILLE DE SERVICE (FDS) — délégué à PlanningFDS ==========
    get currentFDSDay() { return PlanningFDS.currentFDSDay; },
    set currentFDSDay(v) { PlanningFDS.currentFDSDay = v; },
    get currentFDSMap() { return PlanningFDS.currentFDSMap; },
    set currentFDSMap(v) { PlanningFDS.currentFDSMap = v; },
    generateFDS: (...a) => PlanningFDS.generateFDS(...a),
    
// ========== CALENDRIER VISUEL DISPONIBILITÉS — délégué à PlanningAvailability ==========
    exportICS: (...a) => PlanningAvailability.exportICS(...a),
    // v601 : showAvailabilityView / prevAvailMonth / nextAvailMonth et le mois
    // courant du tableau sont partis avec le tableau lui-meme. Ce qu'il
    // apportait — « quel jour est libre pour tout le monde ? » — est
    // desormais dans le calendrier, en vert.
 // ===== EXPORT PDF PLANNING — délégué à PlanningExport =====
    openExportModal: (...a) => PlanningExport.openExportModal(...a),
    exportPlanningPDF: (...a) => PlanningExport.exportPlanningPDF(...a)
};
  
const Stats = {
      render: () => {
          // Init/refresh du sélecteur de scope (affiché uniquement pour les séries)
          Stats.initScopeSelector();
          Stats.refreshScopeBadges();
          
          const scenes = Stats.getFilteredScenes();
          document.getElementById('stat-total-scenes').innerText = scenes.length;
          let totalTime = 0; 
          scenes.forEach(s => totalTime += parseFloat(s.time||0));
          document.getElementById('stat-total-time').innerText = Math.round(totalTime) + " min";
          
          let totalDial = 0; 
          const charCounts = {}; 
          const tagCounts = {};
          
          scenes.forEach(s => {
              const tid = s.tag_id || 't1'; 
              tagCounts[tid] = (tagCounts[tid] || 0) + 1;
              const div = document.createElement('div'); 
              div.innerHTML = s.scriptContent;
              const dials = div.querySelectorAll('.sc-dial'); 
              totalDial += dials.length;
              dials.forEach(d => {
                 const text = d.innerText.trim(); 
                 const words = text.split(/\s+/).filter(w => w.length > 0).length;
                 let prev = d.previousElementSibling; 
                 while(prev && !prev.classList.contains('sc-perso')) prev = prev.previousElementSibling;
                 if(prev) { 
                     const name = prev.innerText.trim().replace(/\(.*\)/,'').trim().toUpperCase(); 
                     charCounts[name] = (charCounts[name] || 0) + words; 
                 }
              });
          });
          
          document.getElementById('stat-total-dials').innerText = totalDial;
          Stats.drawBarChart('chart-chars', charCounts, 100);
          
          const tagData = {}; 
          state.data.tags.forEach(t => { 
              if(tagCounts[t.id]) tagData[t.name] = tagCounts[t.id]; 
          });
          Stats.drawBarChart('chart-tags', tagData, 10);
          
          // Lieux stats
          Stats.renderLieuxStats();
          
          // Crew stats
          Stats.renderCrewStats();
          
          // Shots stats
          Stats.renderShotsStats();
          
          // Actor days stats
          Stats.renderActorDaysStats();
          
          // Stats avancées V1.4.3
          Stats.renderAdvanced();
          
          // Stats par saison (séries uniquement)
          Stats.renderSeasonsStats();
      },
      
      // Retourne les scènes filtrées selon state.statsFilter
      getFilteredScenes: () => {
          const allScenes = state.data.scenes || [];
          // Films ou pas de filtre actif → toutes les scènes
          if(state.currentProjectType !== 'series') return allScenes;
          if(!state.statsFilter) return allScenes;
          
          const f = state.statsFilter;
          if(f.scope === 'all') return allScenes;
          
          if(f.scope === 'season' && f.seasonId) {
              const epIds = (state.data.episodes || [])
                  .filter(ep => ep.seasonId === f.seasonId)
                  .map(ep => ep.id);
              return allScenes.filter(sc => epIds.includes(sc.episodeId));
          }
          
          if(f.scope === 'episode' && f.episodeId) {
              return allScenes.filter(sc => sc.episodeId === f.episodeId);
          }
          
          return allScenes;
      },
      
      // Retourne un libellé court du scope actif (pour affichage)
      getScopeLabel: () => {
          if(state.currentProjectType !== 'series' || !state.statsFilter) return '';
          const f = state.statsFilter;
          if(f.scope === 'all') return '';
          
          if(f.scope === 'season' && f.seasonId) {
              const s = (state.data.seasons || []).find(x => x.id === f.seasonId);
              if(!s) return '';
              return `S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + s.title : ''}`;
          }
          
          if(f.scope === 'episode' && f.episodeId) {
              const ep = (state.data.episodes || []).find(x => x.id === f.episodeId);
              if(!ep) return '';
              const s = (state.data.seasons || []).find(x => x.id === ep.seasonId);
              const sNum = s ? String(s.number).padStart(2,'0') : '01';
              const eNum = String(ep.number || 0).padStart(2,'0');
              return `S${sNum}E${eNum}${ep.title ? ' — ' + ep.title : ''}`;
          }
          return '';
      },
      
      // Change le scope du filtre
      setScope: (scope) => {
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          state.statsFilter.scope = scope;
          
          // Auto-sélection de la première saison/premier épisode si nécessaire
          if(scope === 'season' && !state.statsFilter.seasonId) {
              const firstSeason = (state.data.seasons || [])[0];
              if(firstSeason) state.statsFilter.seasonId = firstSeason.id;
          }
          if(scope === 'episode' && !state.statsFilter.episodeId) {
              const firstEp = (state.data.episodes || [])[0];
              if(firstEp) {
                  state.statsFilter.episodeId = firstEp.id;
                  state.statsFilter.seasonId = firstEp.seasonId;
              }
          }
          
          Stats.initScopeSelector();
          Stats.render();
      },
      
      // Change la saison filtrée
      setSeasonFilter: (seasonId) => {
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          state.statsFilter.seasonId = seasonId;
          Stats.render();
      },
      
      // Change l'épisode filtré
      setEpisodeFilter: (episodeId) => {
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          state.statsFilter.episodeId = episodeId;
          // Synchroniser seasonId avec l'épisode choisi
          const ep = (state.data.episodes || []).find(x => x.id === episodeId);
          if(ep) state.statsFilter.seasonId = ep.seasonId;
          Stats.render();
      },
      
      // Initialise (ou rafraîchit) le sélecteur de scope dans l'UI
      initScopeSelector: () => {
          const wrapper = document.getElementById('stats-scope-selector');
          if(!wrapper) return;
          
          // Films : sélecteur masqué, comportement inchangé
          if(state.currentProjectType !== 'series') {
              wrapper.style.display = 'none';
              return;
          }
          
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          const f = state.statsFilter;
          
          wrapper.style.display = 'block';
          
          // Style des boutons radio
          wrapper.querySelectorAll('.stats-scope-btn').forEach(btn => {
              const isActive = btn.dataset.scope === f.scope;
              btn.style.background = isActive ? 'var(--primary)' : 'transparent';
              btn.style.color = isActive ? 'white' : 'var(--text-main)';
              btn.classList.toggle('active', isActive);
          });
          
          // Afficher / masquer les selects selon scope
          const seasonWrap = document.getElementById('stats-scope-season-wrap');
          const episodeWrap = document.getElementById('stats-scope-episode-wrap');
          if(seasonWrap) seasonWrap.style.display = (f.scope === 'season') ? 'flex' : 'none';
          if(episodeWrap) episodeWrap.style.display = (f.scope === 'episode') ? 'flex' : 'none';
          
          // Remplir le select des saisons
          const seasonSelect = document.getElementById('stats-scope-season-select');
          if(seasonSelect && f.scope === 'season') {
              const seasons = [...(state.data.seasons || [])].sort((a,b) => (a.number||0) - (b.number||0));
              seasonSelect.innerHTML = seasons.map(s => 
                  `<option value="${s.id}" ${s.id === f.seasonId ? 'selected' : ''}>S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + Utils.escape(s.title) : ''}</option>`
              ).join('');
          }
          
          // Remplir le select des épisodes
          const episodeSelect = document.getElementById('stats-scope-episode-select');
          if(episodeSelect && f.scope === 'episode') {
              const seasons = state.data.seasons || [];
              const episodes = [...(state.data.episodes || [])].sort((a,b) => {
                  const sA = seasons.find(x => x.id === a.seasonId);
                  const sB = seasons.find(x => x.id === b.seasonId);
                  const nA = (sA?.number || 0) * 1000 + (a.number || 0);
                  const nB = (sB?.number || 0) * 1000 + (b.number || 0);
                  return nA - nB;
              });
              episodeSelect.innerHTML = episodes.map(ep => {
                  const s = seasons.find(x => x.id === ep.seasonId);
                  const sNum = s ? String(s.number).padStart(2,'0') : '01';
                  const eNum = String(ep.number || 0).padStart(2,'0');
                  return `<option value="${ep.id}" ${ep.id === f.episodeId ? 'selected' : ''}>S${sNum}E${eNum}${ep.title ? ' — ' + Utils.escape(ep.title) : ''}</option>`;
              }).join('');
          }
          
          // Libellé contextuel à droite
          const labelEl = document.getElementById('stats-scope-label');
          if(labelEl) {
              const scopeLabel = Stats.getScopeLabel();
              labelEl.textContent = scopeLabel ? `Filtré sur ${scopeLabel}` : '';
          }
      },
      
      // Ajoute/retire le badge "niveau projet" sur les sections non-filtrables
      refreshScopeBadges: () => {
          const tab = document.getElementById('tab-stats');
          if(!tab) return;
          
          const f = state.statsFilter;
          const filterActive = (state.currentProjectType === 'series') 
              && f && f.scope !== 'all';
          
          tab.querySelectorAll('[data-stats-scope="project"]').forEach(el => {
              // Retirer un éventuel badge précédent
              const oldBadge = el.querySelector('.stats-scope-badge');
              if(oldBadge) oldBadge.remove();
              
              if(!filterActive) return;
              
              // Ajouter le badge
              const badge = document.createElement('span');
              badge.className = 'stats-scope-badge';
              badge.textContent = '— niveau projet';
              badge.style.cssText = 'margin-left: 8px; font-size: 0.75em; font-weight: normal; opacity: 0.6; font-style: italic;';
              el.appendChild(badge);
          });
      },
      
      renderSeasonsStats: () => {
          const section = document.getElementById('stats-seasons-section');
          const tbody = document.getElementById('seasons-stats-tbody');
          if(!section || !tbody) return;
          
          // Visible uniquement pour les séries
          if(state.currentProjectType !== 'series') {
              section.style.display = 'none';
              return;
          }
          
          // Masquée si un filtre saison/épisode est actif (info redondante avec les autres stats)
          const f = state.statsFilter;
          if(f && f.scope !== 'all') {
              section.style.display = 'none';
              return;
          }
          
          const seasons = state.data.seasons || [];
          const episodes = state.data.episodes || [];
          const scenes = state.data.scenes || [];
          
          if(seasons.length === 0) {
              section.style.display = 'none';
              return;
          }
          
          section.style.display = 'block';
          
          // Trier les saisons par numéro
          const sortedSeasons = [...seasons].sort((a, b) => (a.number || 0) - (b.number || 0));
          
          const rows = sortedSeasons.map(s => {
              const seasonEpisodes = episodes.filter(ep => ep.seasonId === s.id);
              const epIds = seasonEpisodes.map(ep => ep.id);
              const seasonScenes = scenes.filter(sc => epIds.includes(sc.episodeId));
              const totalTime = seasonScenes.reduce((sum, sc) => sum + (parseFloat(sc.time) || 0), 0);
              
              return `
                  <tr style="border-bottom: 1px solid var(--border);">
                      <td style="padding: 10px; font-weight: 600;">S${String(s.number).padStart(2, '0')}</td>
                      <td style="padding: 10px; opacity: 0.85;">${Utils.escape(s.title || '—')}</td>
                      <td style="padding: 10px; text-align: right;">${seasonEpisodes.length}</td>
                      <td style="padding: 10px; text-align: right;">${seasonScenes.length}</td>
                      <td style="padding: 10px; text-align: right;">${Math.round(totalTime)} min</td>
                  </tr>
              `;
          }).join('');
          
          // Ligne de total
          const totalEpisodes = episodes.length;
          const totalScenes = scenes.filter(sc => sc.episodeId).length;
          const grandTotalTime = scenes
              .filter(sc => sc.episodeId)
              .reduce((sum, sc) => sum + (parseFloat(sc.time) || 0), 0);
          
          const totalRow = `
              <tr style="border-top: 2px solid var(--border); font-weight: 600; background: rgba(127,127,127,0.05);">
                  <td style="padding: 10px;" colspan="2">TOTAL (${seasons.length} saison${seasons.length>1?'s':''})</td>
                  <td style="padding: 10px; text-align: right;">${totalEpisodes}</td>
                  <td style="padding: 10px; text-align: right;">${totalScenes}</td>
                  <td style="padding: 10px; text-align: right;">${Math.round(grandTotalTime)} min</td>
              </tr>
          `;
          
          tbody.innerHTML = rows + totalRow;
      },
      
      renderCrewStats: () => {
          const container = document.getElementById('chart-crew');
          if(!container) return;
          
          if(!state.data.crew || state.data.crew.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun technicien</div>';
              document.getElementById('stat-total-crew').innerText = '0';
              document.getElementById('stat-total-budget').innerText = '0 €';
              return;
          }
          
          document.getElementById('stat-total-crew').innerText = state.data.crew.length;
          
          let totalBudget = 0;
          state.data.crew.forEach(m => {
              const mRate = Pay.cost(m);
              if(mRate > 0) {
                  totalBudget += mRate;
              }
          });
          document.getElementById('stat-total-budget').innerText = totalBudget.toLocaleString() + ' €/jour';
          
          const crewGroups = state.data.groups.filter(g => g.type === 'crew');
          const deptCounts = {};
          
          crewGroups.forEach(grp => {
              const count = state.data.crew.filter(m => m.group_id === grp.id).length;
              if(count > 0) {
                  deptCounts[grp.name] = count;
              }
          });
          
          const unassigned = state.data.crew.filter(m => !m.group_id).length;
          if(unassigned > 0) {
              deptCounts['Non classé'] = unassigned;
          }
          
          Stats.drawBarChart('chart-crew', deptCounts, 15);
      },
      
	  renderActorDaysStats: () => {
          const container = document.getElementById('chart-actor-days');
          if(!container) return;
          
          const shootingDays = state.data.shootingDays || [];
          const actors = state.data.actors || [];
          
          if(actors.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun comédien</div>';
              return;
          }
          
          if(shootingDays.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun jour de tournage planifié</div>';
              return;
          }
          
          // Compter les jours par comédien
          const daysByActor = {};
          
          shootingDays.forEach(day => {
              if(!day.callSheet || day.callSheet.length === 0) return;
              
              day.callSheet.forEach(call => {
                  if(call.type === 'actor') {
                      const actor = actors.find(a => a.id === call.personId);
                      if(actor) {
                          const name = actor.name || 'Sans nom';
                          daysByActor[name] = (daysByActor[name] || 0) + 1;
                      }
                  }
              });
          });
          
          if(Object.keys(daysByActor).length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun comédien convoqué</div>';
              return;
          }
          
          Stats.drawBarChart('chart-actor-days', daysByActor, 20);
      },
      
	  renderLieuxStats: () => {
          const container = document.getElementById('chart-lieux');
          if(!container) return;
          
          const lieuxCounts = {};
          Stats.getFilteredScenes().forEach(s => {
              if(!s.title) return;
              const locMatch = s.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
              if(locMatch && locMatch[1]) {
                  const lieu = locMatch[1].trim().toUpperCase();
                  lieuxCounts[lieu] = (lieuxCounts[lieu] || 0) + 1;
              }
          });
          
          Stats.drawBarChart('chart-lieux', lieuxCounts, 100);
      },
	  
      renderShotsStats: () => {
          const container = document.getElementById('chart-shots');
          if(!container) return;
          
          if(!state.data.shots || state.data.shots.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun plan</div>';
              document.getElementById('stat-total-shots').innerText = '0';
              return;
          }
          
          document.getElementById('stat-total-shots').innerText = state.data.shots.length;
          
          const shotTypeCounts = {};
          state.data.shots.forEach(s => {
              if(s.shotType) {
                  shotTypeCounts[s.shotType] = (shotTypeCounts[s.shotType] || 0) + 1;
              }
          });
          
          Stats.drawBarChart('chart-shots', shotTypeCounts, 10);
      },
      
      drawBarChart: (id, dataObj, limit) => {
          const container = document.getElementById(id); 
          container.innerHTML = '';
          const sorted = Object.entries(dataObj).sort((a,b) => b[1] - a[1]).slice(0, limit);
          if(sorted.length === 0) { 
              container.innerHTML = '<div class="text-muted-center">Pas de données</div>'; 
              return; 
          }
          const max = sorted[0][1];
          sorted.forEach(([label, val]) => {
              const pct = (val / max) * 100; 
              const row = document.createElement('div'); 
              row.className = 'bar-row';
              row.innerHTML = `<div class="bar-label">${Utils.escape(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-val">${val}</div>`;
              
              // Rendre cliquable selon le type de chart
              if(id === 'chart-chars') {
                  row.style.cursor = 'pointer';
                  row.title = 'Cliquer pour voir les personnages';
                  row.onclick = () => {
                      app.UI.switchTab('personnages');
                  };
              } else if(id === 'chart-lieux') {
                  row.style.cursor = 'pointer';
                  row.title = 'Cliquer pour voir les lieux';
                  row.onclick = () => {
                      app.UI.switchTab('lieux');
                  };
              } else if(id === 'chart-crew') {
                  row.style.cursor = 'pointer';
                  row.title = 'Cliquer pour voir l\'équipe';
                  row.onclick = () => {
                      app.UI.switchTab('equipe');
                  };
              }
              
              container.appendChild(row);
          });
      },
      
      // ===== STATISTIQUES AVANCÉES V1.4.3 =====
      chartInstances: {},
      
      renderAdvanced: async () => {
          await LazyLib.load('chart');
          Stats.renderProgressScenes();
          Stats.renderIntExtChart();
          Stats.renderJourNuitChart();
          Stats.renderPariteCharts();
          Stats.renderBudgetChart();
          Stats.renderTimeTagsChart();
      },
      
      destroyChart: (chartId) => {
          if(Stats.chartInstances[chartId]) {
              Stats.chartInstances[chartId].destroy();
              delete Stats.chartInstances[chartId];
          }
      },
      
      // Barre de progression scènes planifiées
      renderProgressScenes: () => {
          const totalScenes = state.data.scenes?.length || 0;
          const shootingDays = state.data.shootingDays || [];
          const plannedSceneIds = new Set();
          shootingDays.forEach(day => {
              (day.scenes || []).forEach(s => plannedSceneIds.add(s.sceneId));
          });
          const plannedCount = plannedSceneIds.size;
          const pct = totalScenes > 0 ? Math.round((plannedCount / totalScenes) * 100) : 0;
          
          const bar = document.getElementById('progress-scenes-planned');
          if(bar) {
              bar.style.width = pct + '%';
              bar.textContent = pct + '%';
          }
          
          const legend = document.getElementById('legend-scenes-planned');
          if(legend) {
              legend.innerHTML = `
                  <div class="stats-legend-item"><span class="stats-legend-color" style="background:#4CAF50"></span> Planifiées: ${plannedCount}</div>
                  <div class="stats-legend-item"><span class="stats-legend-color" style="background:#ddd"></span> Total: ${totalScenes}</div>
              `;
          }
      },
      
      // Camembert INT/EXT
      renderIntExtChart: () => {
          const canvas = document.getElementById('chart-int-ext');
          if(!canvas) return;
          
          Stats.destroyChart('intExt');
          
          let intCount = 0, extCount = 0;
          Stats.getFilteredScenes().forEach(s => {
              const title = (s.title || '').toUpperCase();
              if(title.startsWith('INT')) intCount++;
              else if(title.startsWith('EXT')) extCount++;
          });
          
          if(intCount === 0 && extCount === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          
          Stats.chartInstances['intExt'] = new Chart(canvas, {
              type: 'doughnut',
              data: {
                  labels: ['Intérieur', 'Extérieur'],
                  datasets: [{
                      data: [intCount, extCount],
                      backgroundColor: ['#2196F3', '#FF9800'],
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      // Camembert JOUR/NUIT
      renderJourNuitChart: () => {
          const canvas = document.getElementById('chart-jour-nuit');
          if(!canvas) return;
          
          Stats.destroyChart('jourNuit');
          
          let jourCount = 0, nuitCount = 0, aubeCount = 0;
          Stats.getFilteredScenes().forEach(s => {
              const title = (s.title || '').toUpperCase();
              if(title.includes('JOUR')) jourCount++;
              else if(title.includes('NUIT')) nuitCount++;
              else if(title.includes('AUBE') || title.includes('CRÉPUSCULE')) aubeCount++;
          });
          
          if(jourCount === 0 && nuitCount === 0 && aubeCount === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          
          const labels = ['Jour', 'Nuit'];
          const data = [jourCount, nuitCount];
          const colors = ['#FFC107', '#3F51B5'];
          
          if(aubeCount > 0) {
              labels.push('Aube/Crépuscule');
              data.push(aubeCount);
              colors.push('#FF5722');
          }
          
          Stats.chartInstances['jourNuit'] = new Chart(canvas, {
              type: 'doughnut',
              data: {
                  labels: labels,
                  datasets: [{
                      data: data,
                      backgroundColor: colors,
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      // ===== PARITÉ =====
      _pariteBucket: (g) => {
          if(g === 'homme') return 'Homme';
          if(g === 'femme') return 'Femme';
          if(g === 'non-binaire') return 'Non-binaire';
          return 'Non renseigné';
      },
      
      _paritePie: (canvasId, chartKey, counts) => {
          const canvas = document.getElementById(canvasId);
          if(!canvas) return;
          Stats.destroyChart(chartKey);
          const colorMap = { 'Homme': '#2196F3', 'Femme': '#E91E63', 'Non-binaire': '#9C27B0', 'Non renseigné': '#9E9E9E' };
          const labels = Object.keys(counts).filter(k => counts[k] > 0);
          if(labels.length === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          Stats.chartInstances[chartKey] = new Chart(canvas, {
              type: 'doughnut',
              data: {
                  labels: labels,
                  datasets: [{
                      data: labels.map(l => counts[l]),
                      backgroundColor: labels.map(l => colorMap[l] || '#607D8B'),
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      renderPariteCharts: () => {
          const chars = state.data.characters || [];
          const actors = state.data.actors || [];
          const bucketOf = Stats._pariteBucket;
          // Genre effectif d'un personnage : son champ Sexe, sinon celui du comédien lié
          const charGender = (c) => {
              if(c.gender) return bucketOf(c.gender);
              const a = c.actor_id ? actors.find(x => x.id === c.actor_id) : null;
              return bucketOf(a ? a.gender : '');
          };
          const newCounts = () => ({ 'Homme': 0, 'Femme': 0, 'Non-binaire': 0, 'Non renseigné': 0 });
          
          // 1. Parité des personnages
          const charCounts = newCounts();
          chars.forEach(c => charCounts[charGender(c)]++);
          Stats._paritePie('chart-parite-chars', 'pariteChars', charCounts);
          
          // Index nom → genre (même matching que charScenes)
          const genderByName = {};
          chars.forEach(c => { if(c.name) genderByName[c.name.trim().toUpperCase()] = charGender(c); });
          
          const scenes = Stats.getFilteredScenes();
          
          // 2. Répliques de dialogue par genre
          const dialCounts = newCounts();
          scenes.forEach(s => {
              if(!s.scriptContent) return;
              const div = document.createElement('div');
              div.innerHTML = s.scriptContent;
              div.querySelectorAll('.sc-dial').forEach(d => {
                  let prev = d.previousElementSibling;
                  while(prev && !prev.classList.contains('sc-perso')) prev = prev.previousElementSibling;
                  if(prev) {
                      const name = prev.innerText.trim().replace(/\(.*\)/,'').trim().toUpperCase();
                      dialCounts[genderByName[name] || 'Non renseigné']++;
                  }
              });
          });
          Stats._paritePie('chart-parite-dialogues', 'pariteDialogues', dialCounts);
          
          // 3-4. Rôles principaux / secondaires (via le groupe du comédien lié : ga1 / ga2)
          const principCounts = newCounts();
          const secondCounts = newCounts();
          chars.forEach(c => {
              if(!c.actor_id) return;
              const a = actors.find(x => x.id === c.actor_id);
              if(!a) return;
              if(a.group_id === 'ga1') principCounts[charGender(c)]++;
              else if(a.group_id === 'ga2') secondCounts[charGender(c)]++;
          });
          Stats._paritePie('chart-parite-principaux', 'paritePrincipaux', principCounts);
          Stats._paritePie('chart-parite-secondaires', 'pariteSecondaires', secondCounts);
          
          // 5. Apparitions en scène par genre
          const appearCounts = newCounts();
          // v580 : apparitions comptees par identifiant de fiche.
          scenes.forEach(s => {
              FicheLinks.charsOfScene(s).forEach(ch => {
                  appearCounts[genderByName[String(ch.name || '').trim().toUpperCase()] || 'Non renseigné']++;
              });
          });
          Stats._paritePie('chart-parite-scenes', 'pariteScenes', appearCounts);
          
          // 6. Technicien·nes par genre
          const crewCounts = newCounts();
          (state.data.crew || []).forEach(m => crewCounts[bucketOf(m.gender)]++);
          Stats._paritePie('chart-parite-crew', 'pariteCrew', crewCounts);
      },
      
      // Budget par catégorie + comparaison
      renderBudgetChart: () => {
          const canvas = document.getElementById('chart-budget-cat');
          if(!canvas) return;
          
          Stats.destroyChart('budgetCat');
          
          const expenses = state.data.expenses || [];
          const categories = {};
          let totalDepense = 0;
          
          expenses.forEach(exp => {
              if(exp.status === 'validated' || exp.status === 'pending') {
                  const cat = exp.category || 'Autre';
                  const amount = parseFloat(exp.amount) || 0;
                  categories[cat] = (categories[cat] || 0) + amount;
                  totalDepense += amount;
              }
          });
          
          // Budget prévu (depuis présentation ou estimé)
          // Source canonique : Budget.total (nombre). Repli : presentation.budget
          // assaini (pouvait être une string "1 800 000" -> parseFloat donnait 1).
          const budgetPrevu = parseFloat(state.data.budget?.total)
              || parseFloat(String(state.data.presentation?.budget ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'))
              || 0;
          const reste = budgetPrevu - totalDepense;
          
          // Mise à jour des valeurs
          document.getElementById('budget-prevu').textContent = budgetPrevu.toLocaleString('fr-FR') + ' €';
          document.getElementById('budget-depense').textContent = totalDepense.toLocaleString('fr-FR') + ' €';
          
          const resteEl = document.getElementById('budget-reste');
          resteEl.textContent = reste.toLocaleString('fr-FR') + ' €';
          resteEl.className = 'budget-item-value ' + (reste >= 0 ? 'positive' : 'negative');
          
          // Barre de progression budget
          const pctBudget = budgetPrevu > 0 ? Math.min(100, Math.round((totalDepense / budgetPrevu) * 100)) : 0;
          const barBudget = document.getElementById('progress-budget');
          if(barBudget) {
              barBudget.style.width = pctBudget + '%';
              barBudget.textContent = pctBudget + '% utilisé';
              barBudget.style.background = pctBudget > 90 ? 'linear-gradient(90deg, #f44336, #E91E63)' : 'linear-gradient(90deg, #2196F3, #03A9F4)';
          }
          
          // Camembert catégories
          const catLabels = Object.keys(categories);
          const catData = Object.values(categories);
          
          if(catLabels.length === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Aucune dépense</div>';
              return;
          }
          
          const catColors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#f44336', '#00BCD4', '#795548', '#607D8B'];
          
          Stats.chartInstances['budgetCat'] = new Chart(canvas, {
              type: 'pie',
              data: {
                  labels: catLabels,
                  datasets: [{
                      data: catData,
                      backgroundColor: catColors.slice(0, catLabels.length),
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      // Temps par tag (barres horizontales)
      renderTimeTagsChart: () => {
          const canvas = document.getElementById('chart-time-tags');
          if(!canvas) return;
          
          Stats.destroyChart('timeTags');
          
          const tagTimes = {};
          const tagColors = {};
          
          (state.data.tags || []).forEach(t => {
              tagTimes[t.name] = 0;
              tagColors[t.name] = t.color || '#999';
          });
          
          Stats.getFilteredScenes().forEach(s => {
              const tag = (state.data.tags || []).find(t => t.id === s.tag_id);
              if(tag) {
                  tagTimes[tag.name] += parseFloat(s.time) || 0;
              }
          });
          
          const labels = Object.keys(tagTimes).filter(k => tagTimes[k] > 0);
          const data = labels.map(l => Math.round(tagTimes[l]));
          const colors = labels.map(l => tagColors[l]);
          
          if(labels.length === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          
          Stats.chartInstances['timeTags'] = new Chart(canvas, {
              type: 'bar',
              data: {
                  labels: labels,
                  datasets: [{
                      label: 'Minutes',
                      data: data,
                      backgroundColor: colors,
                      borderWidth: 0,
                      borderRadius: 5
                  }]
              },
              options: {
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { display: false }
                  },
                  scales: {
                      x: {
                          beginAtZero: true,
                          title: { display: true, text: 'Minutes' }
                      }
                  }
              }
          });
      },
    
    // ============================================================
    // ===== EXPORT PDF STATS (jsPDF natif) =====
    // ============================================================
    // Stratégie hybride :
    // 1. Force un Stats.render() pour s'assurer que tous les canvas Chart.js sont à jour
    // 2. Capture les canvas Chart.js en PNG via toDataURL
    // 3. Recompute les bar-charts "maison" et le tableau saisons en jsPDF natif
    // 4. Une seule modale : page de garde oui/non
    
    openExportModal: () => {
        Actions.openExportModal('stats');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'stats');
        });
    },
    
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        
        // ========= S'assurer que les canvas Chart.js sont à jour =========
        Utils.toast('Préparation des graphiques...', 'info');
        try {
            Stats.render();
            // Laisser le temps à Chart.js de finir le rendu
            await new Promise(r => setTimeout(r, 400));
        } catch(e) {
            console.warn('[Stats.exportPDF] render failed :', e);
        }
        
        // ========= Page de garde =========
        if(opts.includeCover !== false && typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) {
            FichesPDF._drawCoverPage(doc, 'Statistiques');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Helpers internes =========
        const isSeries = state.currentProjectType === 'series';
        const scopeLabel = Stats.getScopeLabel();
        
        const ensureSpace = (space) => {
            if(y + space > pageHeight - margin - 5) {
                doc.addPage();
                y = margin;
            }
        };
        
        const drawSectionHeader = (title) => {
            ensureSpace(14);
            doc.setFillColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.rect(margin, y, usableWidth, 8, 'F');
            doc.setFillColor(...PdfTheme.accentFor('Statistiques'));
            doc.rect(margin, y, 1.8, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text(title.toUpperCase(), margin + 5, y + 5.5);
            y += 8 + 4;
        };
        
        // Capture d'un canvas Chart.js → dataURL PNG
        const captureCanvas = (canvasId) => {
            try {
                const cv = document.getElementById(canvasId);
                if(!cv || cv.width === 0 || cv.height === 0) return null;
                if(!cv.toDataURL) return null;
                return { dataUrl: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
            } catch(e) {
                console.warn('[Stats.exportPDF] capture failed for', canvasId, e);
                return null;
            }
        };
        
        // Insère une image Chart.js capturée, redimensionnée pour le PDF
        const insertChartImage = (img, maxWidthMm, maxHeightMm) => {
            if(!img) return false;
            const ratio = img.w / img.h;
            let w = maxWidthMm;
            let h = w / ratio;
            if(h > maxHeightMm) {
                h = maxHeightMm;
                w = h * ratio;
            }
            ensureSpace(h + 4);
            const x = margin + (usableWidth - w) / 2;
            try {
                doc.addImage(img.dataUrl, 'PNG', x, y, w, h);
                y += h + 4;
                return true;
            } catch(e) {
                console.warn('[Stats.exportPDF] addImage failed :', e);
                return false;
            }
        };
        
        // Dessine un bar-chart horizontal natif jsPDF
        const drawHBarChart = (dataObj, limit) => {
            const sorted = Object.entries(dataObj).sort((a, b) => b[1] - a[1]).slice(0, limit);
            if(sorted.length === 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                ensureSpace(6);
                doc.text('Pas de données', margin, y + 4);
                y += 8;
                return;
            }
            const max = sorted[0][1];
            const labelW = 50;
            const valW = 12;
            const barAreaW = usableWidth - labelW - valW - 4;
            const rowH = 5.5;
            
            sorted.forEach(([label, val]) => {
                ensureSpace(rowH);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                // Nettoyer les emojis (jsPDF latin1 only) - les noms de groupes crew/types de plans en contiennent
                let txtLabel = (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText)
                    ? PdfTheme.cleanText(String(label)).trim() || String(label)
                    : String(label);
                while(doc.getTextWidth(txtLabel) > labelW - 2 && txtLabel.length > 4) {
                    txtLabel = txtLabel.substring(0, txtLabel.length - 2) + '…';
                }
                doc.text(txtLabel, margin, y + 3.8);
                
                doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.rect(margin + labelW, y + 1.5, barAreaW, rowH - 2, 'F');
                
                const pct = max > 0 ? val / max : 0;
                doc.setFillColor(...PdfTheme.COLORS.STAT_GREEN);
                doc.rect(margin + labelW, y + 1.5, barAreaW * pct, rowH - 2, 'F');
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                doc.text(String(val), margin + usableWidth, y + 3.8, { align: 'right' });
                
                y += rowH;
            });
            y += 2;
        };
        
        // Carte stat (compteur)
        const drawStatCard = (x, y, w, h, label, value) => {
            const accent = PdfTheme.accentFor('Statistiques');
            doc.setFillColor(246, 246, 246);
            doc.rect(x, y, w, h, 'F');
            doc.setFillColor(...accent);
            doc.rect(x, y, w, 1.2, 'F');
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
            doc.setLineWidth(0.2);
            doc.rect(x, y, w, h);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(PdfTheme.cleanText(String(label)).toUpperCase(), x + w/2, y + 5, { align: 'center' });
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...accent);
            doc.text(PdfTheme.cleanText(String(value)), x + w/2, y + h - 4, { align: 'center' });
        };
        
        // ========= EN-TÊTE EN BANDEAU GRIS (cohérent avec les autres sections) =========
        y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                        title: 'Rapport de statistiques',
                                        accent: PdfTheme.accentFor('Statistiques') });
        if(scopeLabel) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            doc.text('Périmètre : ' + scopeLabel, margin, y + 4);
            y += 8;
        } else {
            y += 2;
        }
        
        // ========= CARTES COMPTEURS =========
        const readStat = (id) => {
            const el = document.getElementById(id);
            return el ? (el.innerText || el.textContent || '—').trim() : '—';
        };
        const counters = [
            { label: 'Total Scènes',     value: readStat('stat-total-scenes') },
            { label: 'Total Dialogues',  value: readStat('stat-total-dials') },
            { label: 'Durée Estimée',    value: readStat('stat-total-time') },
            { label: 'Total Plans',      value: readStat('stat-total-shots') }
        ];
        const isProjectScope = !state.statsFilter || state.statsFilter.scope === 'all';
        if(isProjectScope) {
            counters.push({ label: 'Équipe Technique', value: readStat('stat-total-crew') });
            counters.push({ label: 'Budget Équipe',    value: readStat('stat-total-budget') });
        }
        
        const perRow = 3;
        const cardH = 18;
        const cardGap = 4;
        const cardW = (usableWidth - cardGap * (perRow - 1)) / perRow;
        const rowCount = Math.ceil(counters.length / perRow);
        ensureSpace(rowCount * (cardH + cardGap));
        counters.forEach((c, i) => {
            const col = i % perRow;
            const row = Math.floor(i / perRow);
            const cx = margin + col * (cardW + cardGap);
            const cy = y + row * (cardH + cardGap);
            drawStatCard(cx, cy, cardW, cardH, c.label, c.value);
        });
        y += rowCount * (cardH + cardGap) + 2;
        
        // ========= SECTION : AVANCEMENT =========
        if(isProjectScope) {
            drawSectionHeader('Avancement du projet');
            
            const totalScenes = state.data.scenes?.length || 0;
            const plannedSceneIds = new Set();
            (state.data.shootingDays || []).forEach(day => {
                (day.scenes || []).forEach(s => plannedSceneIds.add(s.sceneId));
            });
            const plannedCount = plannedSceneIds.size;
            const pctPlanned = totalScenes > 0 ? Math.round((plannedCount / totalScenes) * 100) : 0;
            
            ensureSpace(16);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
            doc.text('Scènes planifiées', margin, y + 4);
            y += 6;
            const barH = 6;
            doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
            doc.rect(margin, y, usableWidth, barH, 'F');
            doc.setFillColor(...PdfTheme.COLORS.STAT_GREEN);
            doc.rect(margin, y, usableWidth * (pctPlanned / 100), barH, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.text(`${pctPlanned}%  —  ${plannedCount} / ${totalScenes} scènes`, margin + usableWidth/2, y + 4.2, { align: 'center' });
            y += barH + 4;
        }
        
        // Camemberts INT/EXT et Jour/Nuit côte à côte
        drawSectionHeader('Répartition INT/EXT  et  JOUR/NUIT');
        const chartIntExt = captureCanvas('chart-int-ext');
        const chartJourNuit = captureCanvas('chart-jour-nuit');
        if(chartIntExt || chartJourNuit) {
            const halfW = (usableWidth - 8) / 2;
            const targetH = 60;
            ensureSpace(targetH + 4);
            const yStart = y;
            if(chartIntExt) {
                const ratio = chartIntExt.w / chartIntExt.h;
                let h = targetH;
                let w = h * ratio;
                if(w > halfW) { w = halfW; h = w / ratio; }
                const x = margin + (halfW - w) / 2;
                try { doc.addImage(chartIntExt.dataUrl, 'PNG', x, yStart, w, h); } catch(e){}
            }
            if(chartJourNuit) {
                const ratio = chartJourNuit.w / chartJourNuit.h;
                let h = targetH;
                let w = h * ratio;
                if(w > halfW) { w = halfW; h = w / ratio; }
                const x = margin + halfW + 8 + (halfW - w) / 2;
                try { doc.addImage(chartJourNuit.dataUrl, 'PNG', x, yStart, w, h); } catch(e){}
            }
            y = yStart + targetH + 4;
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            doc.text('Pas de données disponibles', margin, y + 4);
            y += 8;
        }
        
        // ========= SECTION : PARITÉ =========
        drawSectionHeader('Parité');
        const pariteCharts = [
            { id: 'chart-parite-chars', label: 'Personnages' },
            { id: 'chart-parite-dialogues', label: 'Répliques de dialogue' },
            { id: 'chart-parite-principaux', label: 'Rôles principaux' },
            { id: 'chart-parite-secondaires', label: 'Rôles secondaires' },
            { id: 'chart-parite-scenes', label: 'Apparitions en scène' },
            { id: 'chart-parite-crew', label: 'Technicien·nes' }
        ].map(p => ({ label: p.label, img: captureCanvas(p.id) })).filter(p => p.img);
        if(pariteCharts.length) {
            const halfWP = (usableWidth - 8) / 2;
            const targetHP = 55;
            for(let i = 0; i < pariteCharts.length; i += 2) {
                const pair = pariteCharts.slice(i, i + 2);
                ensureSpace(targetHP + 12);
                const yStartP = y;
                pair.forEach((p, col) => {
                    const xBase = margin + col * (halfWP + 8);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                    doc.text(p.label, xBase + halfWP / 2, yStartP + 3, { align: 'center' });
                    const ratio = p.img.w / p.img.h;
                    let h = targetHP;
                    let w = h * ratio;
                    if(w > halfWP) { w = halfWP; h = w / ratio; }
                    const x = xBase + (halfWP - w) / 2;
                    try { doc.addImage(p.img.dataUrl, 'PNG', x, yStartP + 5, w, h); } catch(e){}
                });
                y = yStartP + targetHP + 12;
            }
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            ensureSpace(6);
            doc.text('Pas de données', margin, y + 4);
            y += 8;
        }
        
        // ========= SECTION : BUDGET =========
        if(isProjectScope) {
            drawSectionHeader('Budget');
            
            const budgetPrevu = readStat('budget-prevu');
            const budgetDepense = readStat('budget-depense');
            const budgetReste = readStat('budget-reste');
            
            ensureSpace(20);
            const bCardH = 16;
            const bCardW = (usableWidth - 8) / 3;
            drawStatCard(margin, y, bCardW, bCardH, 'Budget prévu', budgetPrevu);
            drawStatCard(margin + bCardW + 4, y, bCardW, bCardH, 'Dépensé', budgetDepense);
            drawStatCard(margin + (bCardW + 4) * 2, y, bCardW, bCardH, 'Reste', budgetReste);
            y += bCardH + 4;
            
            const chartBudget = captureCanvas('chart-budget-cat');
            if(chartBudget) {
                insertChartImage(chartBudget, usableWidth * 0.7, 70);
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                ensureSpace(6);
                doc.text('Aucune dépense enregistrée', margin, y + 4);
                y += 8;
            }
        }
        
        // ========= SECTION : TEMPS PAR TAG =========
        drawSectionHeader('Temps par tag/acte');
        const chartTimeTags = captureCanvas('chart-time-tags');
        if(chartTimeTags) {
            insertChartImage(chartTimeTags, usableWidth, 80);
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            ensureSpace(6);
            doc.text('Pas de données', margin, y + 4);
            y += 8;
        }
        
        // ========= SECTION : PERSONNAGES & LIEUX & TAGS =========
        drawSectionHeader('Personnages — Nombre de mots prononcés');
        const charCounts = {};
        const tagCounts = {};
        Stats.getFilteredScenes().forEach(s => {
            const tid = s.tag_id || 't1';
            tagCounts[tid] = (tagCounts[tid] || 0) + 1;
            const div = document.createElement('div');
            div.innerHTML = s.scriptContent || '';
            const dials = div.querySelectorAll('.sc-dial');
            dials.forEach(d => {
                const text = d.innerText.trim();
                const words = text.split(/\s+/).filter(w => w.length > 0).length;
                let prev = d.previousElementSibling;
                while(prev && !prev.classList.contains('sc-perso')) prev = prev.previousElementSibling;
                if(prev) {
                    const name = prev.innerText.trim().replace(/\(.*\)/, '').trim().toUpperCase();
                    charCounts[name] = (charCounts[name] || 0) + words;
                }
            });
        });
        drawHBarChart(charCounts, 15);
        
        drawSectionHeader('Répartition par axe (tags)');
        const tagData = {};
        (state.data.tags || []).forEach(t => {
            if(tagCounts[t.id]) tagData[t.name] = tagCounts[t.id];
        });
        drawHBarChart(tagData, 10);
        
        drawSectionHeader('Lieux — Nombre de scènes');
        const lieuxCounts = {};
        Stats.getFilteredScenes().forEach(s => {
            if(!s.title) return;
            const m = s.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
            if(m && m[1]) {
                const lieu = m[1].trim().toUpperCase();
                lieuxCounts[lieu] = (lieuxCounts[lieu] || 0) + 1;
            }
        });
        drawHBarChart(lieuxCounts, 15);
        
        // ========= SECTION : ÉQUIPE & STORYBOARD =========
        if(isProjectScope) {
            drawSectionHeader('Équipe par département');
            const crewGroups = (state.data.groups || []).filter(g => g.type === 'crew');
            const deptCounts = {};
            crewGroups.forEach(grp => {
                const count = (state.data.crew || []).filter(m => m.group_id === grp.id).length;
                if(count > 0) deptCounts[grp.name] = count;
            });
            const unassigned = (state.data.crew || []).filter(m => !m.group_id).length;
            if(unassigned > 0) deptCounts['Non classé'] = unassigned;
            drawHBarChart(deptCounts, 15);
            
            drawSectionHeader('Plans par type');
            const shotTypeCounts = {};
            (state.data.shots || []).forEach(s => {
                if(s.shotType) shotTypeCounts[s.shotType] = (shotTypeCounts[s.shotType] || 0) + 1;
            });
            drawHBarChart(shotTypeCounts, 15);
            
            drawSectionHeader('Jours de tournage par comédien');
            const daysByActor = {};
            (state.data.shootingDays || []).forEach(day => {
                if(!day.callSheet || day.callSheet.length === 0) return;
                day.callSheet.forEach(call => {
                    if(call.type === 'actor') {
                        const actor = (state.data.actors || []).find(a => a.id === call.personId);
                        if(actor) {
                            const name = actor.name || 'Sans nom';
                            daysByActor[name] = (daysByActor[name] || 0) + 1;
                        }
                    }
                });
            });
            drawHBarChart(daysByActor, 20);
        }
        
        // ========= TABLEAU SAISONS (séries, scope projet uniquement) =========
        if(isSeries && isProjectScope) {
            const seasons = state.data.seasons || [];
            if(seasons.length > 0) {
                drawSectionHeader('Statistiques par saison');
                const sortedSeasons = [...seasons].sort((a, b) => (a.number || 0) - (b.number || 0));
                const episodes = state.data.episodes || [];
                const allScenes = state.data.scenes || [];
                
                const colSx = [margin, margin + 18, margin + 90, margin + 120, margin + 150];
                ensureSpace(8);
                doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
                doc.rect(margin, y, usableWidth, 6, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.WHITE);
                doc.text('Saison', colSx[0] + 1, y + 4);
                doc.text('Titre',  colSx[1] + 1, y + 4);
                doc.text('Épisodes', colSx[2], y + 4);
                doc.text('Scènes',   colSx[3], y + 4);
                doc.text('Durée',    colSx[4], y + 4);
                y += 6;
                
                let totalEpisodes = 0, totalScenesCount = 0, grandTotalTime = 0;
                sortedSeasons.forEach((s, idx) => {
                    const seasonEpisodes = episodes.filter(ep => ep.seasonId === s.id);
                    const epIds = seasonEpisodes.map(ep => ep.id);
                    const seasonScenes = allScenes.filter(sc => epIds.includes(sc.episodeId));
                    const totalTime = seasonScenes.reduce((sum, sc) => sum + (parseFloat(sc.time) || 0), 0);
                    totalEpisodes += seasonEpisodes.length;
                    totalScenesCount += seasonScenes.length;
                    grandTotalTime += totalTime;
                    
                    ensureSpace(6);
                    if(idx % 2 === 0) {
                        doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
                        doc.rect(margin, y, usableWidth, 5.5, 'F');
                    }
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.5);
                    doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                    doc.text('S' + String(s.number).padStart(2, '0'), colSx[0] + 1, y + 3.8);
                    doc.setFont('helvetica', 'normal');
                    let title = s.title || '—';
                    while(doc.getTextWidth(title) > 70 && title.length > 4) title = title.substring(0, title.length - 2) + '…';
                    doc.text(title, colSx[1] + 1, y + 3.8);
                    doc.text(String(seasonEpisodes.length), colSx[2], y + 3.8);
                    doc.text(String(seasonScenes.length), colSx[3], y + 3.8);
                    doc.text(Math.round(totalTime) + ' min', colSx[4], y + 3.8);
                    y += 5.5;
                });
                
                ensureSpace(6);
                doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.rect(margin, y, usableWidth, 6, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                doc.text(`TOTAL (${seasons.length} saison${seasons.length > 1 ? 's' : ''})`, colSx[0] + 1, y + 4);
                doc.text(String(totalEpisodes), colSx[2], y + 4);
                doc.text(String(totalScenesCount), colSx[3], y + 4);
                doc.text(Math.round(grandTotalTime) + ' min', colSx[4], y + 4);
                y += 6 + 4;
            }
        }
        
        // ========= Footer =========
        if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) {
            FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        }
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Statistiques')
            : `${state.data.title || 'Projet'} - Statistiques - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Statistiques PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Statistiques PDF généré');
    }
  };
  
 // ====================================================================
 // === PdfTheme [Phase C.1] : helper unifié pour tous les exports PDF ===
 // ====================================================================
 // - coverPage(doc, opts) : génère une page de garde façon Final Draft
 // - footer(doc, pageNum, totalPages) : footer minimaliste (n° page en bas droite)
 // - filename(section) : nom de fichier standardisé "{projet} - {section} - moteur.studio.pdf"
 // - cleanText(str) : retire les emojis qui plantent en latin-1 (jsPDF)
 // - getAuthorForSection(section) : récupère l'auteur contextuel selon le type de document
 //
 // Tous les exports PDF de l'app doivent passer par ces helpers pour uniformité.
 const PdfTheme = {
    // ============================================================
    // PALETTE DE COULEURS (R4) - Source de vérité unique pour les PDFs
    // ============================================================
    // Format : [r, g, b] - utilisable via doc.setFillColor(...PdfTheme.COLORS.TEXT_DARK)
    // Ou en destructuring : const [r,g,b] = PdfTheme.COLORS.BANNER_DARK;
    COLORS: {
        // Texte (du plus foncé au plus clair)
        TEXT_DARK:      [30, 30, 30],     // titres principaux, accentué
        TEXT_PRIMARY:   [50, 50, 50],     // texte normal sombre (le plus utilisé)
        TEXT_BODY:      [60, 60, 60],     // texte body courant
        TEXT_MUTED:     [80, 80, 80],     // texte un peu effacé
        TEXT_SECONDARY: [100, 100, 100],  // texte secondaire (sous-titres, dates)
        TEXT_LIGHT:     [120, 120, 120],  // texte légèrement effacé
        TEXT_FAINT:     [150, 150, 150],  // texte très clair (placeholders, mentions)
        
        // Fonds (bandeaux et zones colorées)
        BANNER_DARK:    [40, 40, 40],     // bandeaux gris foncé identitaires (Dossier Prod)
        BANNER_BLUE:    [43, 110, 246],   // bandeau d'en-tête bleu identitaire
        BG_LIGHT:       [240, 240, 240],  // fond gris très clair (alternance lignes)
        BG_LIGHTER:     [245, 245, 245],  // fond gris extra-clair
        
        // Bordures
        BORDER:         [200, 200, 200],  // bordure standard
        BORDER_LIGHT:   [225, 225, 225],  // bordure très claire
        BORDER_DARK:    [180, 180, 180],  // bordure plus foncée
        
        // Couleurs de base
        WHITE:          [255, 255, 255],
        BLACK:          [0, 0, 0],
        
        // Statuts (badges, alertes)
        SUCCESS:        [40, 167, 69],    // vert "Validé"
        WARNING:        [255, 193, 7],    // jaune "En attente"
        STAT_GREEN:     [76, 175, 80]     // vert Material (utilisé dans Stats, jauges)
    },
    
    // ============================================================
    // COULEURS PAR SECTION (V558) — code couleur du Dossier de Production
    // ============================================================
    SECTION_COLORS: {
        'Synopsis': [43, 110, 246], 'Séquencier': [43, 110, 246], 'Scénario': [43, 110, 246],
        'Présentation': [43, 110, 246], 'Page de titre': [43, 110, 246],
        'Mood Board': [124, 77, 255], 'Storyboard': [124, 77, 255],
        'Personnages': [67, 160, 71], 'Comédiens': [67, 160, 71], 'Équipe': [67, 160, 71], 'Figuration': [67, 160, 71],
        'Lieux': [121, 85, 72], 'Décors': [121, 85, 72], 'Ressources': [121, 85, 72], 'Asso / Entreprises': [121, 85, 72],
        'Planning': [230, 110, 0], 'Dépouillement': [230, 110, 0],
        'Budget': [0, 137, 123], 'Statistiques': [0, 137, 123], 'Production': [0, 137, 123], 'Rapport de production': [0, 137, 123], 'Rapports script': [0, 137, 123]
    },
    // Couleur d'accent d'une section (repli : bleu identitaire)
    accentFor: (sectionName) => PdfTheme.SECTION_COLORS[sectionName] || PdfTheme.COLORS.BANNER_BLUE,

    // Eclaircit une couleur vers le blanc. f = 0 rend la couleur, f = 1 le blanc.
    tint: (c, f) => [Math.round(c[0] + (255 - c[0]) * f),
                     Math.round(c[1] + (255 - c[1]) * f),
                     Math.round(c[2] + (255 - c[2]) * f)],

    // ============================================================
    // TITRE DE SECTION (v601) — UNE SEULE PORTE
    // ============================================================
    // Remplace le bandeau gris fonce pleine largeur, juge trop lourd : une page
    // de dossier en comptait parfois cinq, et le noir plein mange l'encre a
    // l'impression sans rien apporter a la lecture.
    // Le dessin reprend le vocabulaire DEJA pose sur les pages de garde : une
    // barre a la couleur de la section, le titre en gris tres fonce, un filet
    // fin dessous. Rien de neuf a apprendre en feuilletant le dossier.
    // TOUS LES EXPORTS PASSENT PAR ICI : changer le style se fait en un endroit,
    // au lieu des quinze copies du bandeau qui existaient avant.
    // Renvoie le y SUIVANT (apres le titre et son espace), pour que l'appelant
    // ecrive « y = PdfTheme.sectionBand(...) » sans recalculer l'avance.
    HEADER_H: 13.5,
    sectionBand: (doc, o = {}) => {
        const x = (o.x !== undefined) ? o.x : 25;
        const y = o.y || 0;
        const w = o.width || (doc.internal.pageSize.getWidth() - x * 2);
        const accent = o.accent || PdfTheme.COLORS.BANNER_BLUE;
        const clean = (t) => PdfTheme.cleanText ? PdfTheme.cleanText(t || '') : (t || '');
        const titre = clean(o.title).toUpperCase();

        // Barre d'accent, a gauche du titre
        doc.setFillColor(...accent);
        doc.rect(x, y, 2.4, 7.4, 'F');

        // Texte secondaire a droite (date, effectif...), mesure D'ABORD : il
        // decide de la place qui reste au titre.
        const droite = o.right ? clean(o.right) : '';
        let largeurDroite = 0;
        if(droite) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            largeurDroite = doc.getTextWidth(droite) + 4;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(o.size || 11.5);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
        // TITRE TRONQUE SI BESOIN, et ici plutot que chez chaque appelant : un
        // titre de scene un peu long debordait de sa bande et venait s'imprimer
        // PAR-DESSUS le badge « BROUILLON » place a cote. On raccourcit d'un
        // caractere a la fois, suite comprise dans la mesure (meme regle que les
        // deux troncatures du recapitulatif, pour la meme raison : retirer n
        // caracteres pour en rajouter autant tourne en rond).
        const placeTitre = w - 5.4 - largeurDroite;
        let titreAffiche = titre;
        if(doc.getTextWidth(titreAffiche) > placeTitre) {
            while(titreAffiche.length > 2 && doc.getTextWidth(titreAffiche + '…') > placeTitre) titreAffiche = titreAffiche.slice(0, -1);
            titreAffiche += '…';
        }
        doc.text(titreAffiche, x + 5.4, y + 5.6);

        if(droite) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(droite, x + w, y + 5.6, { align: 'right' });
        }

        // Filet fin sous toute la largeur, a la couleur de la section eclaircie
        doc.setDrawColor(...PdfTheme.tint(accent, 0.55));
        doc.setLineWidth(0.4);
        doc.line(x, y + 8.6, x + w, y + 8.6);

        // On rend au suivant un etat neutre : sans cela, le premier appelant qui
        // oubliait de reposer sa couleur ecrivait son paragraphe en gris clair.
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
        doc.setDrawColor(...PdfTheme.COLORS.BORDER);
        doc.setLineWidth(0.2);
        return y + PdfTheme.HEADER_H;
    },
    
    // Mapping section → rôles à chercher dans state.data.crew (par ordre de priorité)
    AUTHOR_ROLES: {
        'Scénario':       ['Scénariste', 'Co-scénariste', 'Dialoguiste'],
        'Séquencier':     ['Scénariste', 'Co-scénariste'],
        'Storyboard':     ['Story-boarder', 'Storyboardeur', 'Réalisateur·rice'],
        'Dépouillement':  ['1er·ère assistant·e réalisateur·rice', 'Réalisateur·rice'],
        'Budget':         ['Producteur·rice', 'Producteur·rice exécutif·ve', 'Directeur·rice de production', 'Administrateur·rice de production'],
        'Équipe':         ['Producteur·rice', 'Directeur·rice de production', 'Régisseur·euse général·e'],
        'Production':     ['Producteur·rice', 'Producteur·rice exécutif·ve', 'Directeur·rice de production'],
        'Planning':       ['1er·ère assistant·e réalisateur·rice', 'Régisseur·euse général·e'],
        'Ressources':     ['Régisseur·euse général·e', 'Chef·fe décorateur·rice', 'Accessoiriste'],
        'Mood Board':     ['Réalisateur·rice', 'Directeur·rice de la photographie'],
        'Page de titre':  ['Scénariste', 'Réalisateur·rice'],
        'Présentation':   ['Producteur·rice', 'Réalisateur·rice']
    },
    
    // Alias vers Utils.stripPdfUnsafe (source de vérité unique pour le nettoyage texte PDF).
    // Conservé pour rétrocompat avec les 20+ appels PdfTheme.cleanText(...) dans le code.
    // Idempotente : cleanText(cleanText(x)) === cleanText(x). Trim final inclus.
    cleanText: (str) => Utils.stripPdfUnsafe(str).trim(),
    
    // Récupère l'auteur contextuel selon le type de document
    // Cherche dans state.data.crew le premier technicien avec un rôle qui matche
    // Retourne { name, role } ou null
    getAuthorForSection: (sectionName) => {
        if(!state.data || !state.data.crew) return null;
        const roles = PdfTheme.AUTHOR_ROLES[sectionName] || [];
        if(roles.length === 0) return null;
        
        // Chercher par ordre de priorité dans les rôles
        for(const wantedRole of roles) {
            const member = state.data.crew.find(m => {
                if(!m.role) return false;
                // Match sans accents, sans majuscules, sans points
                const r1 = String(m.role).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                const r2 = wantedRole.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                return r1 === r2 || r1.includes(r2) || r2.includes(r1);
            });
            if(member) return { name: member.name, role: member.role };
        }
        
        // Fallback : pour les sections autre que Page de titre, on prend le scriptMeta.author
        if(state.data.scriptMeta && state.data.scriptMeta.author) {
            return { name: state.data.scriptMeta.author, role: 'Auteur' };
        }
        
        // Dernier fallback : le réalisateur même s'il n'est pas dans la liste prioritaire
        const director = state.data.crew.find(m => {
            if(!m.role) return false;
            const r = String(m.role).toLowerCase();
            return r.includes('réalisateur') || r.includes('realisateur');
        });
        if(director) return { name: director.name, role: director.role };
        
        return null;
    },
    
    // Construit un nom de fichier propre : "{titre projet} - {section} - moteur.studio.pdf"
    filename: (sectionName) => {
        const title = (state.data && state.data.title) ? state.data.title : 'Projet';
        // Nettoyer les caractères problématiques pour les noms de fichiers
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim();
        const safeSec = sectionName.replace(/[\\/:*?"<>|]/g, '_').trim();
        return `${safeTitle} - ${safeSec} - moteur.studio.pdf`;
    },
    
    // Page de garde façon Final Draft
    // opts: { doc, sectionName, customAuthor?, customSubtitle? }
    coverPage: (doc, opts = {}) => {
        // Page de garde unifiée — Modèle B (label SECTION en majuscules + "Établi par X")
        // Pour cohérence avec toutes les sections du Dossier de Production.
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const sectionName = opts.sectionName || 'Document';
        const projectTitle = (state.data && state.data.title) ? state.data.title : 'Projet sans titre';
        const meta = (state.data && state.data.scriptMeta) ? state.data.scriptMeta : {};
        
        // Auteur contextuel : opts.customAuthor a priorité, sinon PdfTheme.getAuthorForSection
        let author = opts.customAuthor;
        if(!author) {
            const found = PdfTheme.getAuthorForSection(sectionName);
            author = found ? found.name : null;
        }
        if(!author && meta.author) author = meta.author;
        
        // === Bande verticale à la couleur de la section ===
        doc.setFillColor(...PdfTheme.accentFor(sectionName));
        doc.rect(0, 0, 5, pageHeight, 'F');
        
        // === Titre projet centré au tiers supérieur, souligné ===
        const titleY = pageHeight * 0.35;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
        const titleUpper = PdfTheme.cleanText(projectTitle).toUpperCase();
        // Rétrécir la police jusqu'à tenir dans la page (évite le titre tronqué)
        let coverFs = 28;
        while(doc.getTextWidth(titleUpper) > pageWidth - margin * 2 && coverFs > 14) {
            coverFs -= 1;
            doc.setFontSize(coverFs);
        }
        doc.text(titleUpper, pageWidth / 2, titleY, { align: 'center' });
        const titleWidth = doc.getTextWidth(titleUpper);
        doc.setLineWidth(0.5);
        doc.line(pageWidth/2 - titleWidth/2, titleY + 2, pageWidth/2 + titleWidth/2, titleY + 2);
        
        // === Label section en majuscules, à la couleur de la section ===
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...PdfTheme.accentFor(sectionName));
        doc.text(PdfTheme.cleanText(sectionName).toUpperCase(), pageWidth / 2, titleY + 14, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
        
        // === "Établi par X" (ou customSubtitle) ===
        if(opts.customSubtitle) {
            doc.setFontSize(13);
            doc.text(PdfTheme.cleanText(opts.customSubtitle), pageWidth / 2, titleY + 28, { align: 'center' });
        } else if(author) {
            doc.setFontSize(13);
            doc.text('Établi par ' + PdfTheme.cleanText(author), pageWidth / 2, titleY + 28, { align: 'center' });
        }
        
        // === "Basé sur X" en italique ===
        if(meta.source) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'italic');
            doc.text('Basé sur ' + PdfTheme.cleanText(meta.source), pageWidth / 2, titleY + 42, { align: 'center' });
            doc.setFont('helvetica', 'normal');
        }
        
        // === Date de génération en bas centré ===
        const today = new Date();
        const dateLong = today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
        doc.text('Document établi le ' + dateLong, pageWidth / 2, pageHeight - 50, { align: 'center' });
        
        // === Contact / copyright en bas à gauche ===
        let cy = pageHeight - 35;
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
        if(meta.contact)   { doc.text(PdfTheme.cleanText(meta.contact), margin, cy); cy += 5; }
        if(meta.copyright) { doc.text(PdfTheme.cleanText(meta.copyright), margin, cy); cy += 5; }
    },
    
    // Footer minimaliste : numéro de page seul, en bas à droite
    // À appeler en boucle après génération du document
    // doc.internal.pages.length - 1 = nombre total de pages
    // Hauteur de la zone réservée au footer unifié (en mm)
    // Tous les modules doivent considérer cette zone comme "interdite au contenu"
    FOOTER_ZONE_MM: 14,
    
    /**
     * Footer unifié minimaliste : "X / N" centré en bas, gris discret.
     * À appeler à la fin de chaque export PDF, juste avant le save/blob.
     * 
     * En mode Dossier de Production fusionné (forDossier:true), la fonction
     * NE DESSINE RIEN : la phase 7ter de buildDossierProd écrira la pagination
     * globale. Évite les superpositions et les masquages incertains via pdf-lib.
     *
     * @param {jsPDF} doc - instance jsPDF
     * @param {object} opts - { 
     *     skipFirstPage: true|false (par défaut true, saute la cover),
     *     forDossier: true|false (par défaut false, pas de footer si true)
     *   }
     */
    applyFooters: (doc, opts = {}) => {
        // En mode Dossier de Production : ne rien dessiner.
        // La pagination globale sera dessinée par buildDossierProd phase 7ter.
        if(opts.forDossier) return;
        
        const pageCount = doc.internal.pages.length - 1;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const skipFirstPage = opts.skipFirstPage !== false; // par défaut on saute la page de garde
        
        for(let i = 1; i <= pageCount; i++) {
            if(skipFirstPage && i === 1) continue;
            
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            // Pagination locale "X / N" centrée en bas
            doc.text(`${i} / ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }
    },
    
    /**
     * Post-traite un blob PDF pour tourner les pages paysage à 270°.
     * Toutes les pages paysage (largeur > hauteur) sont tournées dans le sens horaire
     * pour qu'à l'impression, le lecteur garde la feuille en portrait et tourne juste
     * la tête vers la droite. Idem que phase 7quater de buildDossierProd.
     * 
     * @param {Blob} blob - blob PDF d'entrée
     * @returns {Promise<Blob>} blob PDF avec les paysages tournés (ou blob initial si échec)
     */
    rotateLandscapePages: async (blob) => {
        try {
            if(typeof PDFLib === 'undefined' && typeof window.PDFLib === 'undefined') {
                console.warn('[PdfTheme.rotateLandscapePages] pdf-lib non chargé, blob retourné tel quel');
                return blob;
            }
            const lib = typeof PDFLib !== 'undefined' ? PDFLib : window.PDFLib;
            const { PDFDocument, degrees } = lib;
            const arrayBuffer = await blob.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const pages = pdfDoc.getPages();
            for(let i = 0; i < pages.length; i++) {
                const p = pages[i];
                const { width: w, height: h } = p.getSize();
                if(w > h) {
                    p.setRotation(degrees(270));
                }
            }
            const bytes = await pdfDoc.save();
            return new Blob([bytes], { type: 'application/pdf' });
        } catch(e) {
            console.warn('[PdfTheme.rotateLandscapePages] échec :', e);
            return blob;
        }
    },
    
    // Helper pour récupérer un libellé propre d'un groupe (technique ou perso)
    // Ex: 'gc3' → '🎬 Réalisation' (ou juste 'Réalisation' si stripEmoji = true)
    getGroupLabel: (groupId, stripEmoji = false) => {
        if(!groupId) return '';
        const allGroups = (state.data && state.data.groups) ? state.data.groups : [];
        const grp = allGroups.find(g => g.id === groupId);
        if(!grp) return groupId; // fallback : afficher l'id si rien trouvé
        const name = grp.name || '';
        return stripEmoji ? PdfTheme.cleanText(name) : name;
    },
    
    // ============================================================
    // R6 - MODE DEBUG PDF (outil dev pour visualiser positions/zones)
    // ============================================================
    // Activation : dans la console, faire `PdfTheme.DEBUG = true` avant
    // de déclencher un export PDF. Les helpers debugRect/debugText/debugGrid
    // deviennent alors actifs et dessinent des bordures rouges pointillées
    // avec labels de coordonnées. Désactivation : `PdfTheme.DEBUG = false`.
    //
    // En production (DEBUG = false), tous les helpers sont des no-ops : aucun
    // surcoût. On peut donc les insérer sans crainte dans les fonctions de
    // dessin PDF (Synopsis, Crew, Storyboard, etc.) pour les debugger plus tard.
    DEBUG: false,
    
    // Dessine un rectangle rouge pointillé autour d'une zone, avec label optionnel.
    // Utile pour visualiser l'emprise d'un bloc : `PdfTheme.debugRect(doc, x, y, w, h, 'titre')`
    debugRect: (doc, x, y, w, h, label = '') => {
        if(!PdfTheme.DEBUG) return;
        const prevDraw = doc.getDrawColor();
        const prevLine = doc.getLineWidth();
        const prevDash = doc.internal.write ? null : undefined; // best effort
        try {
            doc.setDrawColor(255, 0, 0);
            doc.setLineWidth(0.2);
            if(typeof doc.setLineDashPattern === 'function') {
                doc.setLineDashPattern([1, 1], 0);
            }
            doc.rect(x, y, w, h, 'S');
            if(typeof doc.setLineDashPattern === 'function') {
                doc.setLineDashPattern([], 0); // reset
            }
            if(label) {
                doc.setFontSize(6);
                doc.setTextColor(255, 0, 0);
                doc.text(`${label} (${x.toFixed(1)},${y.toFixed(1)} ${w.toFixed(1)}x${h.toFixed(1)})`, x, y - 0.5);
            }
        } catch(e) {
            console.warn('[PdfTheme.debugRect]', e);
        }
        // Reset
        try {
            doc.setDrawColor(prevDraw);
            doc.setLineWidth(prevLine);
        } catch(_) {}
    },
    
    // Dessine un marqueur de position (croix rouge + label coordonnées).
    // Utile pour visualiser un point précis : `PdfTheme.debugText(doc, x, y, 'titre Y')`
    debugText: (doc, x, y, label = '') => {
        if(!PdfTheme.DEBUG) return;
        try {
            doc.setDrawColor(255, 0, 0);
            doc.setLineWidth(0.15);
            // Petite croix de 2mm
            doc.line(x - 1, y, x + 1, y);
            doc.line(x, y - 1, x, y + 1);
            doc.setFontSize(6);
            doc.setTextColor(255, 0, 0);
            doc.text(`${label} (${x.toFixed(1)},${y.toFixed(1)})`, x + 1.5, y - 0.5);
        } catch(e) {
            console.warn('[PdfTheme.debugText]', e);
        }
    },
    
    // Dessine une grille de coordonnées (pas en mm) sur la page courante.
    // Utile pour repérer rapidement les zones : `PdfTheme.debugGrid(doc, 10)`
    // step : pas en mm (10 = grille tous les cm, 5 = tous les 5mm)
    debugGrid: (doc, step = 10) => {
        if(!PdfTheme.DEBUG) return;
        try {
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            doc.setDrawColor(255, 200, 200);
            doc.setLineWidth(0.05);
            doc.setFontSize(5);
            doc.setTextColor(255, 100, 100);
            // Lignes verticales + labels X
            for(let x = 0; x <= pageW; x += step) {
                doc.line(x, 0, x, pageH);
                if(x > 0) doc.text(String(x), x + 0.3, 3);
            }
            // Lignes horizontales + labels Y
            for(let y = 0; y <= pageH; y += step) {
                doc.line(0, y, pageW, y);
                if(y > 0) doc.text(String(y), 0.5, y - 0.3);
            }
        } catch(e) {
            console.warn('[PdfTheme.debugGrid]', e);
        }
    }
};

// ============================================================================
// === Patch jsPDF.getTextWidth() pour cohérence avec PdfTheme.cleanText ======
// ============================================================================
// Le rendu PDF utilise cleanText sur le texte affiché. Si on mesurait la
// largeur du texte BRUT (avec emojis), le soulignement / cadre dessiné autour
// serait trop large par rapport au texte effectivement rendu (vide à droite).
// On patche donc getTextWidth pour qu'il mesure le texte post-cleanText.
// (Pas de PubSub interne sur getTextWidth, contrairement à text() — patch safe.)
window.__patchJsPDF = function patchJsPDFGetTextWidth() {
    try {
        const jsPDFLib = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
        if(!jsPDFLib) {
            console.warn('[PdfTheme] jsPDF non détecté, patch getTextWidth non installé.');
            return;
        }
        if(jsPDFLib.__getTextWidthPatched) return; // idempotent
        
        // Dans jsPDF 2.5.1, getTextWidth peut être une propriété d'instance OU sur le prototype.
        // On parcourt toute la chaîne de prototypes pour trouver où il vit réellement.
        const probe = new jsPDFLib('p', 'mm', 'a4');
        let targetObj = null;
        let originalGetTextWidth = null;
        
        // 1) Direct sur l'instance ?
        if(Object.prototype.hasOwnProperty.call(probe, 'getTextWidth') && typeof probe.getTextWidth === 'function') {
            targetObj = probe;
            originalGetTextWidth = probe.getTextWidth;
        } else {
            // 2) Remonter la chaîne de prototypes
            let proto = Object.getPrototypeOf(probe);
            while(proto && proto !== Object.prototype) {
                if(Object.prototype.hasOwnProperty.call(proto, 'getTextWidth') && typeof proto.getTextWidth === 'function') {
                    targetObj = proto;
                    originalGetTextWidth = proto.getTextWidth;
                    break;
                }
                proto = Object.getPrototypeOf(proto);
            }
        }
        
        if(!originalGetTextWidth) {
            console.warn('[PdfTheme] getTextWidth introuvable dans la chaîne de prototypes, patch annulé.');
            return;
        }
        
        // Patch : appeler cleanText avant la mesure
        const cleanWrapper = function(text) {
            const clean = (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText : (s => s);
            const cleaned = Array.isArray(text) ? text.map(t => clean(t)) : clean(text);
            return originalGetTextWidth.call(this, cleaned);
        };
        
        // Si on a trouvé sur l'instance, on doit patcher le CONSTRUCTEUR pour intercepter
        // toutes les futures instances. Sinon (prototype), on patche directement.
        if(targetObj === probe) {
            // Solution : wrapper le constructeur pour ajouter le patch à chaque nouvelle instance
            const OriginalCtor = window.jspdf.jsPDF;
            window.jspdf.jsPDF = function(...args) {
                const instance = new OriginalCtor(...args);
                if(typeof instance.getTextWidth === 'function' && !instance.__getTextWidthWrapped) {
                    const _orig = instance.getTextWidth.bind(instance);
                    instance.getTextWidth = function(text) {
                        const clean = (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText : (s => s);
                        const cleaned = Array.isArray(text) ? text.map(t => clean(t)) : clean(text);
                        return _orig(cleaned);
                    };
                    instance.__getTextWidthWrapped = true;
                }
                return instance;
            };
            // Préserver le prototype et les propriétés statiques
            window.jspdf.jsPDF.prototype = OriginalCtor.prototype;
            Object.setPrototypeOf(window.jspdf.jsPDF, OriginalCtor);
        } else {
            // Patch direct sur le prototype trouvé
            targetObj.getTextWidth = cleanWrapper;
        }
        
        jsPDFLib.__getTextWidthPatched = true;
    } catch(e) {
        console.warn('[PdfTheme] Erreur patch getTextWidth:', e);
    }
};

// ============================================================================
// === MoteurArchive [Phase B] : helper d'export/import ZIP "moteur" complet ===
// ============================================================================
// Crée des archives ZIP signées (.moteur.zip) contenant :
//   - moteur-manifest.json : signature, version, date, hash
//   - project.json         : tout state.data (avec URLs Storage RÉÉCRITES en chemins relatifs)
//   - storage/             : toutes les images Storage downloadées en local
//
// Une archive est dite "moteur" si elle contient un moteur-manifest.json
// avec la clé "signature" === "MOTEUR_PROJECT_ARCHIVE_V1"
const MoteurArchive = {
    SIGNATURE: 'MOTEUR_PROJECT_ARCHIVE_V1',
    VERSION: '1.0',
    EXTENSION: '.moteur.zip',
    
    // === Charge JSZip à la demande ===
    ensureJSZip: () => {
        return new Promise((resolve, reject) => {
            if(typeof JSZip !== 'undefined') { resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('JSZip introuvable'));
            document.head.appendChild(script);
        });
    },
    
    // === Trouve récursivement toutes les URLs Storage dans state.data ===
    // Retourne [{ path: 'chemin.dans.objet', url: 'https://...' }, ...]
    findAllStorageUrls: (obj, pathPrefix = '') => {
        const results = [];
        if(!obj) return results;
        
        const isStorageUrl = (s) => {
            if(typeof s !== 'string') return false;
            // URLs Supabase Storage publiques
            return s.startsWith('http') && (s.includes('/storage/v1/object/public/') || s.includes('.supabase.co'));
        };
        
        if(typeof obj === 'string') {
            if(isStorageUrl(obj)) results.push({ path: pathPrefix, url: obj });
            return results;
        }
        
        if(Array.isArray(obj)) {
            obj.forEach((item, idx) => {
                results.push(...MoteurArchive.findAllStorageUrls(item, `${pathPrefix}[${idx}]`));
            });
            return results;
        }
        
        if(typeof obj === 'object') {
            Object.entries(obj).forEach(([key, val]) => {
                const newPath = pathPrefix ? `${pathPrefix}.${key}` : key;
                results.push(...MoteurArchive.findAllStorageUrls(val, newPath));
            });
        }
        
        return results;
    },
    
    // === Génère un nom de fichier local depuis une URL ===
    // ex: "https://xxx.supabase.co/storage/v1/object/public/projects/abc/photo.jpg"
    //     → "storage/abc/photo.jpg"
    urlToLocalPath: (url) => {
        try {
            const u = new URL(url);
            // Extraire la partie après /public/<bucket>/
            const match = u.pathname.match(/\/public\/[^/]+\/(.+)$/);
            if(match) return 'storage/' + decodeURIComponent(match[1]);
            // Fallback : juste le nom de fichier
            const fn = u.pathname.split('/').pop();
            return 'storage/' + (fn || 'unknown.bin');
        } catch(e) {
            return 'storage/' + Date.now() + '.bin';
        }
    },
    
    // === Calcule un hash simple du JSON (pour vérification d'intégrité) ===
    simpleHash: (str) => {
        let h = 0;
        for(let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return 'h' + Math.abs(h).toString(36);
    },
    
    // === Modal de progression ===
    // Retourne un objet { update, close, isCancelled }
    showProgressModal: (titleText) => {
        // Supprimer toute modale précédente
        const existing = document.getElementById('moteurArchiveProgress');
        if(existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'moteurArchiveProgress';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index: var(--z-modal); display:flex; align-items:center; justify-content:center;';
        overlay.innerHTML = `
            <div style="background:var(--panel-bg, #fff); color:var(--text-main, #222); border-radius:12px; padding:30px; min-width:420px; max-width:90vw; box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 20px 0; font-size:1.2rem;">${titleText}</h3>
                <div id="moteurArchiveCurrent" style="font-size:0.9rem; color:var(--text-sec, #666); margin-bottom:10px; min-height:1.2em; word-break:break-all;">Initialisation…</div>
                <div style="background:#e0e0e0; height:10px; border-radius:5px; overflow:hidden; margin-bottom:8px;">
                    <div id="moteurArchiveBar" style="background:var(--primary, #2b6ef6); height:100%; width:0%; transition:width 0.2s;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-sec, #666); margin-bottom:20px;">
                    <span id="moteurArchivePct">0%</span>
                    <span id="moteurArchiveCount"></span>
                </div>
                <div style="text-align:right;">
                    <button id="moteurArchiveCancel" style="padding:8px 18px; background:#dc3545; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Annuler</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const state = { cancelled: false };
        document.getElementById('moteurArchiveCancel').onclick = () => {
            state.cancelled = true;
            document.getElementById('moteurArchiveCurrent').textContent = 'Annulation en cours…';
        };
        
        return {
            update: (current, done, total) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const bar = document.getElementById('moteurArchiveBar');
                const pctEl = document.getElementById('moteurArchivePct');
                const countEl = document.getElementById('moteurArchiveCount');
                const curEl = document.getElementById('moteurArchiveCurrent');
                if(bar) bar.style.width = pct + '%';
                if(pctEl) pctEl.textContent = pct + '%';
                if(countEl && total > 0) countEl.textContent = `${done} / ${total}`;
                if(curEl && current) curEl.textContent = current;
            },
            close: () => { 
                const o = document.getElementById('moteurArchiveProgress'); 
                if(o) o.remove(); 
            },
            isCancelled: () => state.cancelled
        };
    }
};

 const Exporter = {
    toPDF: (opts) => { 
        // [FIX state-not-defined] Fallback automatique : si opts.author absent, lire depuis scriptMeta
        opts = opts || {};
        const meta = (state.data && state.data.scriptMeta) ? state.data.scriptMeta : {};
        if(!opts.author && meta.author) {
            opts.author = meta.author;
        }
        document.body.className = state.currentRole === 'viewer' ? 'read-only' : ''; 
        if(document.body.classList.contains('dark-mode')) document.body.classList.remove('dark-mode'); 
        
        // [Scénario PDF] Page de garde enrichie style Final Draft / Celtx
        const _esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        document.getElementById('pc-title').innerText = state.data.title || '';
        
        // Ligne auteur : "Auteur : Prénom Nom" + co-auteur éventuel
        let authorLine = '';
        if(opts.author || meta.author) {
            authorLine = 'Auteur : ' + _esc(opts.author || meta.author);
            if(meta.coAuthor) authorLine += ' & ' + _esc(meta.coAuthor);
        }
        document.getElementById('pc-author').innerText = authorLine;
        
        // Source : "Adapté de ..."
        const pcSource = document.getElementById('pc-source');
        if(pcSource) pcSource.innerText = meta.source ? 'Adapté de : ' + meta.source : '';
        
        // Brouillon + date : "Premier jet — 12/03/2026"
        const pcDraft = document.getElementById('pc-draft');
        if(pcDraft) {
            let draftLine = '';
            if(meta.draft) draftLine = meta.draft;
            if(meta.draftDate) {
                const d = new Date(meta.draftDate);
                if(!isNaN(d)) draftLine += (draftLine ? ' — ' : '') + d.toLocaleDateString('fr-FR');
            }
            pcDraft.innerText = draftLine;
        }
        
        // Numéro CNC / dépôt (depuis opts.reg si fourni via modale, sinon depuis copyright si formaté)
        const pcCnc = document.getElementById('pc-cnc');
        if(pcCnc) {
            let cncLine = '';
            if(opts.reg) cncLine = 'N° de dépôt CNC : ' + opts.reg;
            pcCnc.innerText = cncLine;
        }
        
        // Bloc contact bas-gauche : reproduit une page de garde Celtx/Final Draft
        // Affiche TOUJOURS les libellés (même vides) sauf si tout est absent
        let contactHtml = '';
        const contactValue = opts.phone || meta.contact || '';
        const webValue = opts.web || '';
        const copyrightValue = meta.copyright || '';
        const notesValue = meta.notes || '';
        contactHtml += '<p>Contact auteur : ' + _esc(contactValue) + '</p>';
        if(webValue) contactHtml += '<p>Web : ' + _esc(webValue) + '</p>';
        if(copyrightValue) contactHtml += '<p>' + _esc(copyrightValue) + '</p>';
        if(notesValue) contactHtml += '<p>' + _esc(notesValue) + '</p>';
        document.getElementById('pc-contact').innerHTML = contactHtml;
        
        // [Scénario PDF] Footer en bas à droite de chaque page
        // Stratégie : @page @bottom-right natif pour Chromium (date + X/Y), 
        // overlay HTML simple pour Firefox/Safari (date seule, plus fiable que la pagination JS)
        const today = new Date();
        const dateFr = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + today.getFullYear();
        
        // Nettoyer anciens styles
        const _oldStyle = document.getElementById('dynamic-print-footer');
        if(_oldStyle) _oldStyle.remove();
        const _oldOverlayStyle = document.getElementById('dynamic-print-footer-overlay');
        if(_oldOverlayStyle) _oldOverlayStyle.remove();
        
        // ── Couche 1 : @page @bottom-right natif (Chromium 131+ : Chrome/Edge/Opera/Brave) ──
        const _printStyle = document.createElement('style');
        _printStyle.id = 'dynamic-print-footer';
        _printStyle.textContent = `
            @media print {
                @page {
                    @bottom-right {
                        content: "${dateFr} — " counter(page) "/" counter(pages);
                        font-family: 'Courier Prime', 'Courier', monospace;
                        font-size: 9pt;
                        color: #555;
                        margin-bottom: 10mm;
                    }
                }
            }
        `;
        document.head.appendChild(_printStyle);
        
        // ── Couche 2 : Overlay HTML "date seule" pour Firefox/Safari (date sans pagination, fiable) ──
        // Position fixed à l'impression : répété automatiquement sur chaque page par le navigateur.
        // En Chromium, cet overlay sera caché car @bottom-right occupe déjà la place.
        const _overlayStyle = document.createElement('style');
        _overlayStyle.id = 'dynamic-print-footer-overlay';
        _overlayStyle.textContent = `
            @media screen { .print-footer-overlay { display: none !important; } }
            @media print {
                .print-footer-overlay {
                    position: fixed;
                    bottom: 10mm;
                    right: 25mm;
                    font-family: 'Courier Prime', 'Courier', monospace;
                    font-size: 9pt;
                    color: #555 !important;
                    background: transparent !important;
                    z-index: 9999;
                }
                /* Masquer l'overlay en Chromium 131+ : il a déjà @page @bottom-right */
                @supports (page-orientation: portrait) {
                    .print-footer-overlay { display: none !important; }
                }
            }
        `;
        document.head.appendChild(_overlayStyle);
        
        // Injecter l'élément overlay (un seul, le navigateur le répète sur chaque page via position:fixed)
        document.querySelectorAll('.print-footer-overlay').forEach(el => el.remove());
        if(opts.script) {
            const _footerEl = document.createElement('div');
            _footerEl.className = 'print-footer-overlay';
            _footerEl.textContent = dateFr;
            document.body.appendChild(_footerEl);
        }
        
        // Modale d'information avant impression (uniquement pour le scénario)
        // → Confirme à l'utilisateur ce qui va se passer et donne les conseils navigateur
        if(opts.script) {
            const _isChromiumBrowser = /Chrome|Chromium|Edg|OPR|Brave/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent);
            const _footerDescription = _isChromiumBrowser
                ? `Footer : <strong>Date + numéro de page</strong> (ex : ${dateFr} — 3/33)`
                : `Footer : <strong>Date</strong> uniquement (Date + numérotation des pages n'est supportée que sur Chrome/Edge)`;
            
            const _confirmHtml = `
                <div id="print-confirm-modal" style="position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index: var(--z-modal); display:flex; align-items:center; justify-content:center;">
                    <div style="background:var(--panel-bg, #fff); color:var(--text-main, #222); border-radius:12px; padding:30px; max-width:520px; width:90vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); font-family:system-ui,-apple-system,sans-serif;">
                        <h2 style="margin:0 0 16px 0; font-size:1.3rem;">📄 Export PDF du scénario</h2>
                        <p style="margin:0 0 12px 0; line-height:1.5;">Une fenêtre d'impression va s'ouvrir. Pour un PDF propre style Final Draft :</p>
                        <ul style="margin:0 0 16px 0; padding-left:24px; line-height:1.7;">
                            <li><strong>Destination</strong> : « Enregistrer au format PDF »</li>
                            <li><strong>Décochez</strong> « En-têtes et pieds de page »</li>
                            <li><strong>Marges</strong> : « Par défaut » (le CSS gère la mise en page)</li>
                        </ul>
                        <div style="background:rgba(0,0,0,0.04); border-left:3px solid var(--primary, #2b6ef6); padding:10px 14px; margin:0 0 16px 0; font-size:0.9rem; border-radius:4px;">
                            ${_footerDescription}
                        </div>
                        <div style="display:flex; gap:10px; justify-content:flex-end;">
                            <button id="print-confirm-cancel" style="padding:10px 20px; background:transparent; color:var(--text-main, #222); border:1px solid var(--border, #ccc); border-radius:6px; cursor:pointer; font-weight:500;">Annuler</button>
                            <button id="print-confirm-ok" style="padding:10px 20px; background:var(--primary, #2b6ef6); color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Imprimer</button>
                        </div>
                    </div>
                </div>
            `;
            
            // Injecter et attendre la décision utilisateur
            const _wrapper = document.createElement('div');
            _wrapper.innerHTML = _confirmHtml;
            document.body.appendChild(_wrapper.firstElementChild);
            
            // Cleanup function pour rétablir l'UI si Annuler
            const _cleanupPrint = () => {
                const _modal = document.getElementById('print-confirm-modal');
                if(_modal) _modal.remove();
                document.body.classList.remove('print-script');
                document.querySelectorAll('.print-footer-overlay').forEach(el => el.remove());
                const _s1 = document.getElementById('dynamic-print-footer');
                if(_s1) _s1.remove();
                const _s2 = document.getElementById('dynamic-print-footer-overlay');
                if(_s2) _s2.remove();
                try { if(localStorage.getItem(CONFIG.themeKey) === 'dark') document.body.classList.add('dark-mode'); } catch(e) {}
            };
            
            return new Promise((resolve) => {
                document.getElementById('print-confirm-cancel').onclick = () => {
                    _cleanupPrint();
                    resolve();
                };
                document.getElementById('print-confirm-ok').onclick = () => {
                    document.getElementById('print-confirm-modal').remove();
                    // Continuer le flow normal : ajouter print-script et déclencher l'impression
                    document.body.classList.add('print-script');
                    const _origTitle = document.title;
                    document.title = `${state.data.title || 'Projet'} - Scénario - moteur.studio`;
                    setTimeout(() => {
                        window.print();
                        document.title = _origTitle;
                        try { if(localStorage.getItem(CONFIG.themeKey) === 'dark') document.body.classList.add('dark-mode'); } catch(e) {}
                        if(state.currentRole === 'viewer') document.body.classList.add('read-only');
                        document.body.className = document.body.className.replace(/print-\w+/g, "").trim();
                        document.querySelectorAll('.print-footer-overlay').forEach(el => el.remove());
                        resolve();
                    }, 100);
                };
            });
        }
        
        if(opts.synop) document.body.classList.add('print-synopsis'); 
        if(opts.board) { setTimeout(() => UI.printBoard(), 100); return; } 
        if(opts.script) document.body.classList.add('print-script'); 
        if(opts.chars) { setTimeout(() => UI.printChars(), 100); return; } 
        if(opts.actors) { setTimeout(() => UI.printActors(), 100); return; }
        if(opts.locs) { setTimeout(() => UI.printLocations(), 100); return; } 
        const _origTitle = document.title;
        if(opts.storyboard) { setTimeout(() => Storyboard.exportPDF(), 100); return; }
        if(opts.scriptreports) { setTimeout(() => ScriptReport.openPrintChooser(), 100); return; }
        if(opts.crew) document.body.classList.add('print-crew');
        if(opts.breakdown) document.body.classList.add('print-breakdown'); 
        if(opts.stats) { setTimeout(() => UI.printStats(), 100); return; }
        
        // [Phase C.2.5] Changer le titre HTML pour que le header navigateur soit propre
        // (au lieu de "Moteur - Logiciel d'écriture...")
        let sectionLabel = 'Scénario';
        if(opts.synop) sectionLabel = 'Synopsis';
        else if(opts.crew) sectionLabel = 'Équipe';
        else if(opts.breakdown) sectionLabel = 'Dépouillement';
        document.title = `${state.data.title || 'Projet'} - ${sectionLabel} - moteur.studio`;
        
        window.print(); 
        document.title = _origTitle;
        try { if(localStorage.getItem(CONFIG.themeKey) === 'dark') document.body.classList.add('dark-mode'); } catch(e) {} 
        if(state.currentRole === 'viewer') document.body.classList.add('read-only'); 
        document.body.className = document.body.className.replace(/print-\w+/g, "").trim();
    },
    
    // ========== [Phase Scénario jsPDF] EXPORT PDF SCÉNARIO STYLE FINAL DRAFT ==========
    // Police Courier Prime via CDN (320Ko, chargée 1× par session)
    // Spec : A4, marges 25mm haut/bas/droite, 35mm gauche, Courier 12pt, line-height 1.0
    // Format Final Draft : page de garde + scènes avec heading souligné, perso/dial/paren/trans
    
    _courierPrimeLoaded: false,
    _courierPrimeLoading: null,
    
    // Charge Courier Prime depuis CDN et l'enregistre dans une instance jsPDF
    // Retourne true si OK, false si échec → fallback sur Courier built-in
    loadCourierPrime: async (doc) => {
        // Si déjà chargée dans cette session, on enregistre juste dans le doc passé
        if(Exporter._courierPrimeFonts) {
            try {
                doc.addFileToVFS('CourierPrime-Regular.ttf', Exporter._courierPrimeFonts.regular);
                doc.addFont('CourierPrime-Regular.ttf', 'CourierPrime', 'normal');
                doc.addFileToVFS('CourierPrime-Bold.ttf', Exporter._courierPrimeFonts.bold);
                doc.addFont('CourierPrime-Bold.ttf', 'CourierPrime', 'bold');
                doc.addFileToVFS('CourierPrime-Italic.ttf', Exporter._courierPrimeFonts.italic);
                doc.addFont('CourierPrime-Italic.ttf', 'CourierPrime', 'italic');
                doc.addFileToVFS('CourierPrime-BoldItalic.ttf', Exporter._courierPrimeFonts.boldItalic);
                doc.addFont('CourierPrime-BoldItalic.ttf', 'CourierPrime', 'bolditalic');
                return true;
            } catch(e) {
                console.warn('[Scenario PDF] Échec injection police déjà téléchargée :', e);
                return false;
            }
        }
        
        // Si un chargement est déjà en cours, on l'attend
        if(Exporter._courierPrimeLoading) {
            try { await Exporter._courierPrimeLoading; return Exporter.loadCourierPrime(doc); }
            catch(e) { return false; }
        }
        
        // Premier chargement : on télécharge les 4 variantes en base64 via fetch
        const urls = {
            regular:    'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-400-normal.ttf',
            bold:       'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-700-normal.ttf',
            italic:     'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-400-italic.ttf',
            boldItalic: 'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-700-italic.ttf'
        };
        
        const ttfToBase64 = async (url) => {
            const res = await fetch(url);
            if(!res.ok) throw new Error('HTTP ' + res.status + ' on ' + url);
            const buf = await res.arrayBuffer();
            // ArrayBuffer → base64 (sans utiliser btoa avec chaîne longue qui plante en stack overflow)
            let binary = '';
            const bytes = new Uint8Array(buf);
            const chunk = 0x8000;
            for(let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
        };
        
        const downloadCourierPrime = async () => {
            const fonts = {};
            await Promise.all(Object.entries(urls).map(async ([variant, url]) => {
                fonts[variant] = await ttfToBase64(url);
            }));
            Exporter._courierPrimeFonts = fonts;
            Exporter._courierPrimeLoaded = true;
        };
        Exporter._courierPrimeLoading = downloadCourierPrime();
        
        try {
            await Exporter._courierPrimeLoading;
            return Exporter.loadCourierPrime(doc); // recurse pour injecter dans le doc
        } catch(e) {
            console.warn('[Scenario PDF] Échec téléchargement Courier Prime, fallback Courier built-in :', e);
            Exporter._courierPrimeLoading = null;
            return false;
        }
    },
    
    // Ouvre la modale de configuration du PDF scénario.
    // Pour les séries multi-épisodes : popup choix saisons d'abord.
    openScenarioPdfModal: () => {
        if(!state.data.scenes || state.data.scenes.length === 0) {
            Utils.toast('Aucune scène à exporter', 'warning');
            return;
        }
        const isSeries = state.currentProjectType === 'series';
        if(isSeries) {
            Exporter._openScenarioSeasonChooser();
        } else {
            Exporter._openScenarioOptionsModal(null);
        }
    },
    
    // Étape série : choix des saisons à inclure (modèle identique à openBoardPrintEpisodeChooser)
    _openScenarioSeasonChooser: () => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { Exporter._openScenarioOptionsModal(null); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="scenseachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">📄 Scénario PDF — Choix des saisons</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="scen-sea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="scen-sea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="scen-sea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="scen-sea-ok" style="margin:0;">Suivant →</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#scen-sea-all').onclick = () => overlay.querySelectorAll('.scenseachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#scen-sea-none').onclick = () => overlay.querySelectorAll('.scenseachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#scen-sea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#scen-sea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.scenseachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => Exporter._openScenarioOptionsModal(epIds), 100);
        };
    },
    
    // Étape commune : options de mise en forme (numérotation scènes, etc.)
    _openScenarioOptionsModal: (episodeIds) => {
        const meta = state.data.scriptMeta || {};
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        // Style "toggle bouton bleu en surbrillance" — réutilise .fmt-btn / .fmt-btn.active de la barre scénario
        // Chaque option a son propre <button class="fmt-btn"> avec data-active="0|1" qu'on toggle au clic
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:520px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:14px;">📄 Scénario PDF — Options</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin-bottom:14px;">
                <button type="button" class="fmt-btn active" id="scen-opt-cover" data-active="1" style="padding:10px 14px;font-size:0.85rem;text-align:left;">📋 Inclure la page de titre</button>
                <button type="button" class="fmt-btn" id="scen-opt-numbers" data-active="0" style="padding:10px 14px;font-size:0.85rem;text-align:left;">🔢 Numéroter les scènes (#1, #2…) — style production</button>
                <button type="button" class="fmt-btn" id="scen-opt-notes" data-active="0" style="padding:10px 14px;font-size:0.85rem;text-align:left;">📝 Inclure les notes de production (sc-note)</button>
            </div>
            <div style="text-align:left;font-size:0.78rem;color:var(--text-sec);margin-bottom:14px;font-style:italic;">
                💡 Police Courier Prime téléchargée au 1ᵉʳ usage (~320 Ko, mis en cache ensuite)
            </div>
            <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;">
                <button type="button" class="confirm-modal-btn" id="scen-opt-share" style="margin:0;">🔗 Partager le scénario</button>
                <div style="display:flex;gap:8px;">
                    <button class="confirm-modal-btn cancel" id="scen-opt-cancel" style="margin:0;">Annuler</button>
                    <button class="confirm-modal-btn confirm" id="scen-opt-ok" style="margin:0;">📄 Générer le PDF</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        
        // Toggle des options : clic sur un .fmt-btn bascule sa classe .active et son data-active
        ['scen-opt-cover', 'scen-opt-numbers', 'scen-opt-notes'].forEach(id => {
            overlay.querySelector('#' + id).onclick = (e) => {
                const btn = e.currentTarget;
                const isActive = btn.classList.toggle('active');
                btn.dataset.active = isActive ? '1' : '0';
            };
        });
        
        overlay.querySelector('#scen-opt-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        const _shareBtn = overlay.querySelector('#scen-opt-share');
        if(_shareBtn) _shareBtn.onclick = () => { overlay.remove(); setTimeout(() => ScriptShare.openShareModal('scenario', episodeIds), 100); };
        overlay.querySelector('#scen-opt-ok').onclick = async () => {
            const sceneNumbers = overlay.querySelector('#scen-opt-numbers').dataset.active === '1';
            const includeCover = overlay.querySelector('#scen-opt-cover').dataset.active === '1';
            const includeNotes = overlay.querySelector('#scen-opt-notes').dataset.active === '1';
            overlay.remove();
            await Exporter.scenarioToPDF({ sceneNumbers, includeCover, includeNotes, episodeIds });
        };
    },
    
    // === GÉNÉRATION JSPDF DU SCÉNARIO ===
    // opts = { returnBlob, sceneNumbers, includeCover, includeNotes, episodeIds }
    scenarioToPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
        const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
        
        // Marges Final Draft : 25mm haut/droite/bas, 35mm gauche (reliure)
        const marginLeft = 35;
        const marginRight = 25;
        const marginTop = 25;
        const marginBottom = 25;
        const usableWidth = pageWidth - marginLeft - marginRight; // 150 mm
        
        // Toast pendant le téléchargement de la police
        let toast = null;
        if(!Exporter._courierPrimeLoaded && !opts.returnBlob) {
            toast = Utils.toast('Téléchargement de la police Courier Prime…', 'info');
        }
        
        // Charger Courier Prime (ou fallback Courier built-in)
        const usingPrime = await Exporter.loadCourierPrime(doc);
        const FONT = usingPrime ? 'CourierPrime' : 'courier';
        
        // Métriques Final Draft : Courier 12pt → 10 char/inch → 2.54mm par char
        // 60 caractères de largeur action = 152mm → tient dans 150mm utile (avec petite tolérance)
        const fontSize = 12;
        const lineHeight = 5.0; // mm — équivaut à line-height 1.0 en 12pt
        doc.setFontSize(fontSize);
        doc.setFont(FONT, 'normal');
        
        // ===== HELPERS =====
        let y = marginTop;
        let pageNum = 0; // sera incrémenté à chaque addPage
        const projectTitle = state.data.title || 'Projet sans titre';
        // Lecture des métadonnées du film : priorité à titlePage (onglet "Titre"),
        // fallback sur scriptMeta. Mapping : tp.coauthor → meta.coAuthor, tp.date → meta.draftDate
        const _sm = state.data.scriptMeta || {};
        const _tp = state.data.titlePage || {};
        const meta = {
            author:    _tp.author    || _sm.author    || '',
            coAuthor:  _tp.coauthor  || _sm.coAuthor  || '',
            contact:   _tp.contact   || _sm.contact   || '',
            draft:     _tp.draft     || _sm.draft     || '',
            draftDate: _tp.date      || _sm.draftDate || '',
            source:    _tp.source    || _sm.source    || '',
            copyright: _tp.copyright || _sm.copyright || '',
            notes:     _tp.notes     || _sm.notes     || ''
        };
        
        // Ajoute un saut de page et inscrit le numéro en bas à droite
        // (skipFirstPage : la page de garde n'a pas de numéro)
        const newPage = (firstPage = false) => {
            if(!firstPage) doc.addPage();
            pageNum++;
            y = marginTop;
        };
        
        // Footer "Date — N/Total" en bas à droite (style production)
        // Pas de footer sur la page de garde (Final Draft)
        const drawPageNumbers = () => {
            // Délègue au footer unifié PdfTheme pour cohérence avec les autres exports
            if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
                PdfTheme.applyFooters(doc, { 
                    skipFirstPage: opts.includeCover !== false,
                    forDossier: !!opts.returnBlob
                });
                return;
            }
            // Fallback si PdfTheme indisponible
            const totalPages = doc.internal.getNumberOfPages();
            for(let i = 1; i <= totalPages; i++) {
                if(opts.includeCover !== false && i === 1) continue;
                doc.setPage(i);
                doc.setFont(FONT, 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(`${i} / ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
            }
        };
        
        // Assure qu'on a la place pour `linesNeeded` lignes ; sinon nouvelle page
        const ensureSpace = (linesNeeded) => {
            const required = linesNeeded * lineHeight;
            if(y + required > pageHeight - marginBottom) {
                newPage();
                return true;
            }
            return false;
        };
        
        // Écrit un bloc texte multilignes à une indentation donnée, avec wrapping
        // indentMm : décalage horizontal en mm depuis marginLeft
        // widthMm : largeur de wrap en mm
        // align : 'left' | 'right' | 'center'
        // style : 'normal' | 'bold' | 'italic' | 'bolditalic'
        // returns true si le bloc a été coupé en deux pages (utile pour widows/orphans)
        const writeBlock = (text, opts2 = {}) => {
            const indent = opts2.indent || 0;
            const width = opts2.width || (usableWidth - indent);
            const align = opts2.align || 'left';
            const style = opts2.style || 'normal';
            const upper = opts2.upper || false;
            const underline = opts2.underline || false;
            const spaceBefore = opts2.spaceBefore || 0;
            const spaceAfter = opts2.spaceAfter || 0;
            const avoidBreakBefore = opts2.avoidBreakBefore || false; // ne pas casser AVANT la 1ère ligne
            
            let txt = String(text || '');
            if(upper) txt = txt.toUpperCase();
            
            doc.setFont(FONT, style);
            doc.setFontSize(fontSize);
            doc.setTextColor(...PdfTheme.COLORS.BLACK);
            
            // Espace avant (sauf en début de page)
            if(spaceBefore > 0 && y > marginTop) y += spaceBefore;
            
            // Wrapping
            const lines = doc.splitTextToSize(txt, width);
            if(lines.length === 0) return;
            
            // Vérifie le saut de page anticipé (pour heading/perso : on ne veut pas qu'ils soient isolés en bas)
            if(avoidBreakBefore) {
                // S'il ne reste pas la place pour cette ligne + au moins 1 ligne suivante
                if(y + (Math.max(2, lines.length + 1)) * lineHeight > pageHeight - marginBottom) {
                    newPage();
                }
            }
            
            const x = marginLeft + indent;
            lines.forEach((line, idx) => {
                // Si on déborde, saut de page
                if(y + lineHeight > pageHeight - marginBottom) {
                    newPage();
                }
                
                let drawX = x;
                if(align === 'right') drawX = marginLeft + indent + width;
                else if(align === 'center') drawX = marginLeft + indent + (width / 2);
                
                doc.text(line, drawX, y, { align });
                
                if(underline) {
                    const txtWidth = doc.getTextWidth(line);
                    let underlineX = drawX;
                    if(align === 'right') underlineX = drawX - txtWidth;
                    else if(align === 'center') underlineX = drawX - (txtWidth / 2);
                    doc.setLineWidth(0.2);
                    doc.line(underlineX, y + 0.8, underlineX + txtWidth, y + 0.8);
                }
                
                y += lineHeight;
            });
            
            if(spaceAfter > 0) y += spaceAfter;
        };
        
        // ===== PAGE DE GARDE FINAL DRAFT (optionnelle) =====
        if(opts.includeCover !== false) {
            newPage(true); // 1ère page sans addPage
            
            // Titre centré au tiers supérieur, gras MAJUSCULES souligné
            const titleY = pageHeight * 0.35;
            doc.setFont(FONT, 'bold');
            doc.setFontSize(28);
            doc.setTextColor(...PdfTheme.COLORS.BLACK);
            const titleUpper = projectTitle.toUpperCase();
            doc.text(titleUpper, pageWidth / 2, titleY, { align: 'center' });
            // Souligné sous le titre
            const titleWidth = doc.getTextWidth(titleUpper);
            doc.setLineWidth(0.5);
            doc.line(pageWidth/2 - titleWidth/2, titleY + 2, pageWidth/2 + titleWidth/2, titleY + 2);
            
            // Sous-titre "Un scénario de" + auteur
            doc.setFont(FONT, 'normal');
            doc.setFontSize(14);
            doc.text('Un scénario de', pageWidth / 2, titleY + 18, { align: 'center' });
            if(meta.author) {
                doc.text(PdfTheme.cleanText(meta.author), pageWidth / 2, titleY + 28, { align: 'center' });
                if(meta.coAuthor) {
                    doc.text(PdfTheme.cleanText('& ' + meta.coAuthor), pageWidth / 2, titleY + 38, { align: 'center' });
                }
            }
            
            // Source / Basé sur (si présent)
            if(meta.source) {
                doc.setFontSize(12);
                doc.text(PdfTheme.cleanText('Basé sur ' + meta.source), pageWidth / 2, titleY + 55, { align: 'center' });
            }
            
            // Brouillon / Date (centré bas)
            doc.setFontSize(11);
            const draftY = pageHeight - 50;
            if(meta.draft) doc.text(PdfTheme.cleanText(meta.draft), pageWidth / 2, draftY, { align: 'center' });
            if(meta.draftDate) doc.text(PdfTheme.cleanText(meta.draftDate), pageWidth / 2, draftY + 6, { align: 'center' });
            
            // Contact bas-gauche
            doc.setFontSize(10);
            const contactY = pageHeight - 35;
            let contactLine = 0;
            const writeContact = (txt) => { if(txt) { doc.text(txt, marginLeft, contactY + (contactLine++ * 5)); } };
            writeContact(meta.contact || '');
            writeContact(meta.copyright || '');
            writeContact(meta.notes || '');
        }
        
        // ===== SCÈNES =====
        // Filtrer par épisodes si demandé (séries)
        let scenes = state.data.scenes || [];
        if(opts.episodeIds && Array.isArray(opts.episodeIds) && opts.episodeIds.length > 0) {
            scenes = scenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        if(scenes.length === 0) {
            if(toast && toast.remove) toast.remove();
            Utils.toast('Aucune scène à exporter dans la sélection', 'warning');
            return;
        }
        
        // 1ère page de contenu
        if(opts.includeCover === false) {
            newPage(true);
        } else {
            newPage();
        }
        
        scenes.forEach((scene, sceneIdx) => {
            const sceneNum = sceneIdx + 1;
            
            // Heading de scène : INT./EXT. ... — JOUR/NUIT
            // Format Final Draft : gras MAJUSCULES souligné, espace 24pt avant, 12pt après, page-break-after avoid
            const headingText = scene.title || `SCÈNE ${sceneNum}`;
            
            // Numérotation optionnelle en marge (à gauche et à droite)
            if(opts.sceneNumbers && y > marginTop) {
                // ensureSpace pour la ligne suivante avant d'inscrire les marqueurs
                if(y + lineHeight * 3 > pageHeight - marginBottom) {
                    newPage();
                }
            }
            
            // Avoid break before heading + au moins 2 lignes après
            writeBlock(headingText, {
                style: 'bold',
                upper: true,
                underline: true,
                spaceBefore: sceneIdx === 0 ? 0 : 10, // 10mm ≈ 24pt
                spaceAfter: 5,                         // 5mm ≈ 12pt
                avoidBreakBefore: true
            });
            
            // Numéros de scène inscrits en marge SI option activée
            if(opts.sceneNumbers) {
                // Position de la 1ère ligne du heading qu'on vient d'écrire
                const headingY = y - 5 - lineHeight; // remonter pour pointer la ligne du heading
                doc.setFont(FONT, 'normal');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                const numLabel = '#' + sceneNum;
                // Marge gauche (sur la marge de reliure)
                doc.text(numLabel, marginLeft - 8, headingY, { align: 'right' });
                // Marge droite
                doc.text(numLabel, pageWidth - marginRight + 2, headingY, { align: 'left' });
                doc.setTextColor(...PdfTheme.COLORS.BLACK);
            }
            
            // Parse le scriptContent pour obtenir les blocs typés
            const blocks = ScriptExport.parseScriptContent(scene.scriptContent || '');
            
            blocks.forEach((blk, blkIdx) => {
                const txt = blk.text;
                if(!txt) return;
                const nextBlk = blocks[blkIdx + 1];
                
                switch(blk.type) {
                    case 'action':
                        // Indent 0, largeur pleine, espace 12pt avant/après
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            spaceBefore: 5,
                            spaceAfter: 0
                        });
                        break;
                    
                    case 'character':
                        // Indent 40% de la largeur utile, MAJUSCULES, espace 12pt avant, avoid break (perso ne doit pas être isolé)
                        writeBlock(txt, {
                            indent: usableWidth * 0.40,
                            width: usableWidth * 0.50,
                            upper: true,
                            spaceBefore: 5,
                            spaceAfter: 0,
                            avoidBreakBefore: true
                        });
                        break;
                    
                    case 'dialogue':
                        // Indent 20%, largeur 60%
                        writeBlock(txt, {
                            indent: usableWidth * 0.20,
                            width: usableWidth * 0.60,
                            spaceBefore: 0,
                            spaceAfter: 0
                        });
                        break;
                    
                    case 'parenthetical':
                        // Indent 30%, largeur 40%, italique, avoid break
                        // Wrapper avec ( ) si pas déjà présent
                        const parenTxt = txt.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
                        writeBlock('(' + parenTxt + ')', {
                            indent: usableWidth * 0.30,
                            width: usableWidth * 0.40,
                            style: 'italic',
                            spaceBefore: 0,
                            spaceAfter: 0,
                            avoidBreakBefore: true
                        });
                        break;
                    
                    case 'transition':
                        // Aligné à droite, MAJUSCULES, espace 12pt avant et après
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            align: 'right',
                            upper: true,
                            spaceBefore: 5,
                            spaceAfter: 5
                        });
                        break;
                    
                    case 'centered':
                        // Centré, MAJUSCULES, espace 24pt
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            align: 'center',
                            upper: true,
                            spaceBefore: 10,
                            spaceAfter: 10
                        });
                        break;
                    
                    case 'general':
                        // Italique gris, espace 12pt
                        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            style: 'italic',
                            spaceBefore: 5,
                            spaceAfter: 0
                        });
                        doc.setTextColor(...PdfTheme.COLORS.BLACK);
                        break;
                    
                    case 'note':
                        // Optionnel : si opts.includeNotes, on imprime en gris encadré ; sinon on saute
                        if(!opts.includeNotes) break;
                        const noteTxt = txt.replace(/^\{\s*/, '').replace(/\s*\}$/, '');
                        doc.setTextColor(...PdfTheme.COLORS.WARNING);
                        writeBlock('[NOTE] ' + noteTxt, {
                            indent: 0,
                            width: usableWidth,
                            style: 'italic',
                            spaceBefore: 3,
                            spaceAfter: 3
                        });
                        doc.setTextColor(...PdfTheme.COLORS.BLACK);
                        break;
                    
                    default:
                        // Fallback action
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            spaceBefore: 5,
                            spaceAfter: 0
                        });
                }
            });
        });
        
        // ===== FOOTERS / NUMÉROS DE PAGE =====
        drawPageNumbers();
        
        // Toast d'achèvement
        if(toast && toast.remove) toast.remove();
        
        // ===== SORTIE =====
        if(opts.returnBlob) return doc.output('blob');
        
        // Nom de fichier : utiliser PdfTheme si dispo, sinon fallback.
        // Si un filtre saison(s) est actif (série), le nom le reflète — sinon
        // deux exports de saisons différentes portaient le même nom.
        let scenarioSection = 'Scénario';
        if(opts.episodeIds && Array.isArray(opts.episodeIds) && opts.episodeIds.length > 0) {
            const epIdSet = new Set(opts.episodeIds);
            const seasonIdSet = new Set((state.data.episodes || []).filter(e => epIdSet.has(e.id)).map(e => e.seasonId));
            const seasonLabels = (state.data.seasons || [])
                .filter(s => seasonIdSet.has(s.id))
                .sort((a, b) => (a.number || 0) - (b.number || 0))
                .map(s => 'S' + String(s.number || 0).padStart(2, '0'));
            if(seasonLabels.length > 0) scenarioSection = 'Scénario - ' + seasonLabels.join('+');
        }
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename(scenarioSection)
            : `${projectTitle} - ${scenarioSection} - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Scénario PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Scénario PDF (Final Draft) généré');
    },
    
    // ========== RAPPORT DE PRODUCTION PDF ==========
    productionReport: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = margin;
        
        const projectTitle = state.data.title || 'Projet sans titre';
        
        // Helper formatage : évite les espaces insécables qui s'affichent en "/"
        const fmt = (n) => {
            const num = parseFloat(n) || 0;
            return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        };
        
        // ===== PAGE DE GARDE (Phase C.1) — optionnelle =====
        if(opts.includeCover !== false) {
            PdfTheme.coverPage(doc, { sectionName: 'Production' });
        }
        
        // ===== FONCTION UTILITAIRES =====
        const addSection = (title, yPos) => {
            if(yPos > pageHeight - 40) {
                doc.addPage();
                yPos = margin;
            }
            const yApres = PdfTheme.sectionBand(doc, { x: margin, y: yPos, width: pageWidth - margin * 2,
                                                      title, size: 12,
                                                      accent: PdfTheme.accentFor('Rapport de production') });
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            return yApres + 1.5;
        };
        
        const addKeyValue = (key, value, yPos) => {
            if(yPos > pageHeight - 20) {
                doc.addPage();
                yPos = margin;
            }
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            const keyText = key + ' :';
            doc.text(keyText, margin, yPos);
            // Largeur réelle du texte clé pour éviter le chevauchement de la valeur
            const keyW = doc.getTextWidth(keyText);
            const valueX = margin + Math.max(45, keyW + 3);
            doc.setFont('helvetica', 'normal');
            doc.text(String(value || '-'), valueX, yPos);
            return yPos + 6;
        };
        
        const addTable = (headers, rows, yPos, colWidths) => {
            const totalWidth = pageWidth - margin * 2;
            const rowHeight = 7;
            
            if(yPos > pageHeight - 40) {
                doc.addPage();
                yPos = margin;
            }
            
            // Header
            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
            doc.rect(margin, yPos, totalWidth, rowHeight, 'F');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            let xPos = margin + 2;
            headers.forEach((h, i) => {
                doc.text(h, xPos, yPos + 5);
                xPos += colWidths[i];
            });
            yPos += rowHeight;
            
            // Rows
            doc.setFont('helvetica', 'normal');
            rows.forEach((row, idx) => {
                if(yPos > pageHeight - 20) {
                    doc.addPage();
                    yPos = margin;
                }
                if(idx % 2 === 1) {
                    doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
                    doc.rect(margin, yPos, totalWidth, rowHeight, 'F');
                }
                xPos = margin + 2;
                row.forEach((cell, i) => {
                    const text = String(cell || '-').substring(0, 40);
                    doc.text(text, xPos, yPos + 5);
                    xPos += colWidths[i];
                });
                yPos += rowHeight;
            });
            
            return yPos + 5;
        };
        
        // ===== PAGE 2 : RÉSUMÉ GÉNÉRAL =====
        if(opts.includeCover !== false) doc.addPage();
        y = margin;
        
        y = addSection('RÉSUMÉ GÉNÉRAL', y);
        
        const scenes = state.data.scenes || [];
        const characters = state.data.characters || [];
        const actors = state.data.actors || [];
        const locations = state.data.locations || [];
        const crew = state.data.crew || [];
        const shots = state.data.shots || [];
        const expenses = state.data.expenses || [];
        const shootingDays = state.data.shootingDays || [];
        
        y = addKeyValue('Titre du projet', PdfTheme.cleanText(projectTitle), y);
        y = addKeyValue('Nombre de scènes', scenes.length, y);
        y = addKeyValue('Nombre de plans (storyboard)', shots.length, y);
        y = addKeyValue('Personnages', characters.length, y);
        y = addKeyValue('Comédiens', actors.length, y);
        y = addKeyValue('Décors', locations.length, y);
        y = addKeyValue('Techniciens', crew.length, y);
        y = addKeyValue('Jours de tournage prévus', shootingDays.length, y);
        
        // Durée estimée
        const totalMinutes = scenes.reduce((sum, s) => sum + (parseFloat(s.time) || 0), 0);
        y = addKeyValue('Durée estimée', `${Math.floor(totalMinutes)} min`, y);
        
        // Budget (Phase C.2.4 : fix [object Object] — budget est un objet, pas un nombre)
        const budgetObj = state.data.budget || {};
        const budgetTotal = parseFloat(budgetObj.total) || 0;
        const currency = budgetObj.currency || '€';
        const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amountTTC) || parseFloat(e.amount) || 0), 0);
        y = addKeyValue('Budget prévu', `${fmt(budgetTotal)} ${currency}`, y);
        y = addKeyValue('Dépenses engagées', `${fmt(totalExpenses)} ${currency}`, y);
        y = addKeyValue('Reste disponible', `${fmt(budgetTotal - totalExpenses)} ${currency}`, y);
        
        // Statistiques scènes
        y += 5;
        y = addSection('STATISTIQUES SCÈNES', y);
        
        const intScenes = scenes.filter(s => s.title && s.title.toUpperCase().startsWith('INT')).length;
        const extScenes = scenes.filter(s => s.title && s.title.toUpperCase().startsWith('EXT')).length;
        const dayScenes = scenes.filter(s => s.title && s.title.toUpperCase().includes('JOUR')).length;
        const nightScenes = scenes.filter(s => s.title && s.title.toUpperCase().includes('NUIT')).length;
        const finalizedScenes = scenes.filter(s => s.isFinal).length;
        
        y = addKeyValue('Intérieur / Extérieur', `${intScenes} INT / ${extScenes} EXT`, y);
        y = addKeyValue('Jour / Nuit', `${dayScenes} JOUR / ${nightScenes} NUIT`, y);
        y = addKeyValue('Scènes finalisées', `${finalizedScenes} / ${scenes.length}`, y);
        
        // ===== PERSONNAGES =====
        // Phase C.2.4 : fix doublon "Nora" — utiliser characterId proprement
        if(characters.length > 0) {
            y += 5;
            y = addSection('PERSONNAGES', y);
            const charRows = characters.map(c => {
                // Chercher le comédien qui joue ce personnage (peut être plusieurs : prendre le premier)
                const actorPlaying = actors.find(a => a.characterId === c.id);
                return [
                    PdfTheme.cleanText(c.name || '-'),
                    c.age || '-',
                    c.gender || '-',
                    actorPlaying ? PdfTheme.cleanText(actorPlaying.name) : '(non casté)'
                ];
            });
            y = addTable(['Personnage', 'Âge', 'Genre', 'Comédien'], charRows, y, [50, 25, 25, 60]);
        }
        
        // ===== COMÉDIENS =====
        // Phase C.2.4 : utilise le bon champ "role" du comédien (pas le perso lié)
        if(actors.length > 0) {
            y += 5;
            y = addSection('COMÉDIENS', y);
            const actorRows = actors.map(a => {
                // Le rôle peut être : (1) un personnage lié via characterId, (2) un texte libre dans a.role
                const char = characters.find(c => c.id === a.characterId);
                const roleLabel = char ? char.name : (a.role || '-');
                return [
                    PdfTheme.cleanText(a.name || '-'),
                    PdfTheme.cleanText(roleLabel),
                    a.phone || '-',
                    a.email || '-'
                ];
            });
            y = addTable(['Nom', 'Rôle', 'Téléphone', 'Email'], actorRows, y, [45, 40, 40, 55]);
        }
        
        // ===== ÉQUIPE TECHNIQUE =====
        // Phase C.2.4 : fix département (group_id au lieu de department inexistant)
        if(crew.length > 0) {
            y += 5;
            y = addSection('ÉQUIPE TECHNIQUE', y);
            const crewRows = crew.map(c => [
                PdfTheme.cleanText(c.name || '-'),
                PdfTheme.cleanText(c.role || '-'),
                PdfTheme.getGroupLabel(c.group_id, true) || '-',
                c.phone || '-'
            ]);
            y = addTable(['Nom', 'Poste', 'Département', 'Téléphone'], crewRows, y, [45, 45, 40, 50]);
        }
        
        // ===== DÉCORS =====
        if(locations.length > 0) {
            y += 5;
            y = addSection('DÉCORS', y);
            const locRows = locations.map(l => {
                const sceneCount = scenes.filter(s => s.locationId === l.id).length;
                return [
                    PdfTheme.cleanText(l.name || '-'),
                    PdfTheme.cleanText(l.realLocation || '-'),
                    PdfTheme.cleanText(l.address || '-'),
                    sceneCount + ' scène(s)'
                ];
            });
            y = addTable(['Décor', 'Lieu réel', 'Adresse', 'Scènes'], locRows, y, [40, 45, 55, 30]);
        }
        
        // ===== PLANNING =====
        if(shootingDays.length > 0) {
            y += 5;
            y = addSection('PLANNING DE TOURNAGE', y);
            const planRows = shootingDays.map(d => {
                const date = d.startDate ? new Date(d.startDate).toLocaleDateString('fr-FR') : '-';
                const scenesList = (d.scenes || []).map(ref => {
                    // Phase C.2.4 : ref est { sceneId, ... } pas un id direct
                    const sId = typeof ref === 'string' ? ref : ref.sceneId;
                    const scene = scenes.find(s => s.id === sId);
                    return scene ? `#${scenes.indexOf(scene) + 1}` : '';
                }).filter(Boolean).join(', ');
                return [
                    PdfTheme.cleanText(d.name || 'Jour'),
                    date,
                    PdfTheme.cleanText(d.location || '-'),
                    scenesList || '-'
                ];
            });
            y = addTable(['Nom', 'Date', 'Lieu', 'Scènes'], planRows, y, [40, 30, 50, 50]);
        }
        
        // ===== BUDGET DÉTAILLÉ =====
        // Phase C.2.4 : fix "61 /150" (espace insécable) avec fmt()
        if(expenses.length > 0) {
            y += 5;
            y = addSection('BUDGET & DÉPENSES', y);
            
            // Par catégorie
            const byCategory = {};
            expenses.forEach(e => {
                const cat = e.category || 'Autre';
                if(!byCategory[cat]) byCategory[cat] = 0;
                byCategory[cat] += parseFloat(e.amountTTC) || parseFloat(e.amount) || 0;
            });
            
            const budgetRows = Object.entries(byCategory).map(([cat, amount]) => [
                PdfTheme.cleanText(cat),
                `${fmt(amount)} ${currency}`
            ]);
            budgetRows.push(['TOTAL', `${fmt(totalExpenses)} ${currency}`]);
            y = addTable(['Catégorie', 'Montant'], budgetRows, y, [100, 70]);
        }
        
        // ===== FOOTERS UNIFIÉS (Phase C.1) =====
        PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
        
        // ===== TÉLÉCHARGEMENT (nom unifié) =====
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Rapport de production'));
        
        Utils.toast('Rapport de production exporté !', 'success');
        History.log('EXPORT', 'Rapport de production PDF généré');
    },
    
    // ========== [Phase D Dossier Prod] Fusion PDF avec page de garde + sommaire ==========
    // sections = [{ label: 'Synopsis', blob: Blob }, ...]  (ordre = ordre de fusion)
    // Génère un PDF unique :
    //   1. Cover "DOSSIER DE PRODUCTION" (1 page)
    //   2. Sommaire avec n° de pages (1+ pages)
    //   3. Pages fusionnées de chaque section
    buildDossierProd: async (sections) => {
        if(!window.PDFLib) {
            Utils.toast('Erreur : pdf-lib non chargée', 'error');
            return;
        }
        if(!sections || sections.length === 0) {
            Utils.toast('Aucun PDF à fusionner', 'warning');
            return;
        }
        
        const { PDFDocument, StandardFonts, rgb, PDFName, PDFArray, PDFDict, degrees } = window.PDFLib;
        
        // Filtrer les sections sans blob (erreurs lors de la génération individuelle)
        const validSections = sections.filter(s => s.blob);
        if(validSections.length === 0) {
            Utils.toast('Aucun PDF valide à fusionner', 'error');
            return;
        }
        
        // ===== 1. Charger tous les PDFs et noter le nombre de pages de chacun =====
        const loadedSections = [];
        for(const s of validSections) {
            try {
                const arrayBuffer = await s.blob.arrayBuffer();
                const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                loadedSections.push({ label: s.label, srcDoc, pageCount: srcDoc.getPageCount() });
            } catch(e) {
                console.error(`[Dossier Prod] Échec chargement ${s.label} :`, e);
            }
        }
        if(loadedSections.length === 0) {
            Utils.toast('Échec du chargement des PDFs', 'error');
            return;
        }
        
        // ===== 2. Calculer le nombre de pages du sommaire =====
        // Approximation : ~25 sections par page de sommaire. Pour < 25 on prévoit 1 page,
        // sinon ceil(count/25). En pratique 1 page suffit largement.
        const summaryPageCount = Math.max(1, Math.ceil(loadedSections.length / 25));
        const coverPageCount = 1;
        const prefixPages = coverPageCount + summaryPageCount;
        
        // ===== 3. Calculer les n° de pages de chaque section =====
        let currentPage = prefixPages + 1; // la 1ère section commence après cover + sommaire
        const toc = loadedSections.map(s => {
            const entry = { label: s.label, startPage: currentPage };
            currentPage += s.pageCount;
            return entry;
        });
        
        // ===== 4. Créer le PDF maître =====
        const masterDoc = await PDFDocument.create();
        const fontHelv = await masterDoc.embedFont(StandardFonts.Helvetica);
        const fontHelvBold = await masterDoc.embedFont(StandardFonts.HelveticaBold);
        const fontHelvOblique = await masterDoc.embedFont(StandardFonts.HelveticaOblique);
        
        const A4_W = 595.28; // points = 210mm
        const A4_H = 841.89; // points = 297mm
        
        // ===== 5. PAGE DE GARDE "DOSSIER DE PRODUCTION" =====
        const projectTitle = state.data.title || 'Projet sans titre';
        const tp = state.data.titlePage || {};
        const authorCombined = [tp.author, tp.coauthor].filter(Boolean).join(' & ');
        const cleanStr = (s) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(s || '') : (s || '');
        
        const cover = masterDoc.addPage([A4_W, A4_H]);
        
        // Bande de couleur en haut
        cover.drawRectangle({ x: 0, y: A4_H - 12, width: A4_W, height: 12, color: rgb(43/255, 110/255, 246/255) });
        
        // Mention "DOSSIER DE PRODUCTION"
        const tagline = 'DOSSIER DE PRODUCTION';
        const taglineW = fontHelvBold.widthOfTextAtSize(tagline, 18);
        cover.drawText(tagline, { x: (A4_W - taglineW) / 2, y: A4_H * 0.66, size: 18, font: fontHelvBold, color: rgb(0.2, 0.2, 0.2) });
        
        // Trait de séparation
        cover.drawLine({ start: { x: A4_W / 2 - 90, y: A4_H * 0.66 - 14 }, end: { x: A4_W / 2 + 90, y: A4_H * 0.66 - 14 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
        
        // Titre du projet (XXL)
        const titleStr = cleanStr(projectTitle).toUpperCase();
        let titleSize = titleStr.length > 30 ? 28 : (titleStr.length > 18 ? 36 : 44);
        let titleW = fontHelvBold.widthOfTextAtSize(titleStr, titleSize);
        // Rétrécir jusqu'à tenir dans la page (évitait un titre tronqué à droite)
        while(titleW > A4_W - 80 && titleSize > 14) {
            titleSize -= 2;
            titleW = fontHelvBold.widthOfTextAtSize(titleStr, titleSize);
        }
        cover.drawText(titleStr, { x: (A4_W - titleW) / 2, y: A4_H * 0.50, size: titleSize, font: fontHelvBold, color: rgb(0.1, 0.1, 0.1) });
        
        // Auteur (si renseigné)
        if(authorCombined) {
            const authorStr = `Un projet de ${cleanStr(authorCombined)}`;
            const authorW = fontHelv.widthOfTextAtSize(authorStr, 14);
            cover.drawText(authorStr, { x: (A4_W - authorW) / 2, y: A4_H * 0.40, size: 14, font: fontHelv, color: rgb(0.35, 0.35, 0.35) });
        }
        
        // Date de génération
        const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        const dateStr = `Document généré le ${today}`;
        const dateW = fontHelvOblique.widthOfTextAtSize(dateStr, 10);
        cover.drawText(dateStr, { x: (A4_W - dateW) / 2, y: A4_H * 0.32, size: 10, font: fontHelvOblique, color: rgb(0.5, 0.5, 0.5) });
        
        // Récap nombre de sections
        const recap = `${loadedSections.length} section${loadedSections.length > 1 ? 's' : ''} — ${toc[toc.length-1].startPage + loadedSections[loadedSections.length-1].pageCount - prefixPages - 1} pages de contenu`;
        const recapW = fontHelv.widthOfTextAtSize(recap, 10);
        cover.drawText(recap, { x: (A4_W - recapW) / 2, y: A4_H * 0.18, size: 10, font: fontHelv, color: rgb(0.5, 0.5, 0.5) });
        
        // (Mention "moteur.studio" retirée pour uniformiser les pages de garde)
        
        // Bande de couleur en bas
        cover.drawRectangle({ x: 0, y: 0, width: A4_W, height: 6, color: rgb(43/255, 110/255, 246/255) });
        
        // ===== 6. PAGE(S) DE SOMMAIRE =====
        const marginX = 60;
        const titleSomY = A4_H - 80;
        let sumPage = masterDoc.addPage([A4_W, A4_H]);
        const summaryFirstPageRef = sumPage.ref; // référence pour le lien "Sommaire" en bas de chaque page
        
        // Titre "SOMMAIRE"
        sumPage.drawText('SOMMAIRE', { x: marginX, y: titleSomY, size: 22, font: fontHelvBold, color: rgb(0.15, 0.15, 0.15) });
        sumPage.drawLine({ start: { x: marginX, y: titleSomY - 8 }, end: { x: A4_W - marginX, y: titleSomY - 8 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
        const sumSubtitle = cleanStr(projectTitle) + ' — Dossier de production';
        sumPage.drawText(sumSubtitle, { x: marginX, y: titleSomY - 24, size: 10, font: fontHelvOblique, color: rgb(0.45, 0.45, 0.45) });
        
        // Lignes du sommaire + zones cliquables (liens hypertextes ajoutés en étape 7bis)
        let sumY = titleSomY - 46;
        const lineH = 18;
        const maxY = 60;
        const tocLinkAreas = []; // { page, x1, y1, x2, y2, sectionIndex }
        
        toc.forEach((entry, sectionIndex) => {
            if(sumY < maxY) {
                // Nouvelle page de sommaire
                sumPage = masterDoc.addPage([A4_W, A4_H]);
                sumY = A4_H - 60;
            }
            const labelStr = cleanStr(entry.label);
            const pageStr = String(entry.startPage);
            
            // Couleur bleu liens hypertextes pour le label (indique cliquable)
            const linkColor = rgb(0.16, 0.43, 0.96);
            
            // Label à gauche (sombre — le n° de page reste en bleu lien)
            sumPage.drawText(labelStr, { x: marginX, y: sumY, size: 11, font: fontHelv, color: rgb(0.18, 0.18, 0.18) });
            
            // Points de remplissage entre label et numéro
            const labelW = fontHelv.widthOfTextAtSize(labelStr, 11);
            const pageW = fontHelv.widthOfTextAtSize(pageStr, 11);
            const dotStart = marginX + labelW + 4;
            const dotEnd = A4_W - marginX - pageW - 4;
            const dotCount = Math.floor((dotEnd - dotStart) / 4);
            if(dotCount > 0) {
                let dots = '';
                for(let i = 0; i < dotCount; i++) dots += '.';
                sumPage.drawText(dots, { x: dotStart, y: sumY, size: 11, font: fontHelv, color: rgb(0.7, 0.7, 0.7) });
            }
            
            // Numéro de page à droite (en bleu liens)
            sumPage.drawText(pageStr, { x: A4_W - marginX - pageW, y: sumY, size: 11, font: fontHelvBold, color: linkColor });
            
            // Mémoriser la zone cliquable de toute la ligne (de marginX à A4_W - marginX)
            // Coords PDF : x1/y1 = bas-gauche, x2/y2 = haut-droite
            tocLinkAreas.push({
                page: sumPage,
                x1: marginX - 2,
                y1: sumY - 3,
                x2: A4_W - marginX + 2,
                y2: sumY + 13, // hauteur ≈ taille de police 11
                sectionIndex: sectionIndex
            });
            
            sumY -= lineH;
        });
        
        // Si le sommaire a moins de pages prévues que summaryPageCount, ajouter des pages blanches
        // (pour que les n° de pages restent cohérents même si peu de sections)
        while(masterDoc.getPageCount() < prefixPages) {
            masterDoc.addPage([A4_W, A4_H]);
        }
        
        // ===== 7. FUSIONNER TOUS LES PDFs SOURCES =====
        // On mémorise la référence de la 1ère page de chaque section pour les liens du sommaire
        const sectionFirstPageRefs = {}; // { sectionIndex: pageRef }
        for(let i = 0; i < loadedSections.length; i++) {
            const s = loadedSections[i];
            try {
                const pageIndices = s.srcDoc.getPageIndices();
                const copiedPages = await masterDoc.copyPages(s.srcDoc, pageIndices);
                copiedPages.forEach((p, idx) => {
                    const added = masterDoc.addPage(p);
                    if(idx === 0) {
                        // Mémoriser la référence à la première page ajoutée pour cette section
                        sectionFirstPageRefs[i] = added.ref;
                    }
                });
            } catch(e) {
                console.error(`[Dossier Prod] Échec copie pages ${s.label} :`, e);
            }
        }
        
        // ===== 7bis. AJOUTER LES LIENS HYPERTEXTES AU SOMMAIRE =====
        // Pour chaque ligne enregistrée dans tocLinkAreas, créer une annotation Link
        // qui pointe vers la première page de la section correspondante.
        try {
            tocLinkAreas.forEach(area => {
                const targetRef = sectionFirstPageRefs[area.sectionIndex];
                if(!targetRef) return;
                
                // Construire la destination : [pageRef, /Fit] (ouvre la page entière)
                const destArray = masterDoc.context.obj([
                    targetRef,
                    PDFName.of('Fit')
                ]);
                
                // Construire l'action GoTo
                const action = masterDoc.context.obj({
                    Type: PDFName.of('Action'),
                    S: PDFName.of('GoTo'),
                    D: destArray
                });
                
                // Construire l'annotation Link
                const linkAnnot = masterDoc.context.obj({
                    Type: PDFName.of('Annot'),
                    Subtype: PDFName.of('Link'),
                    Rect: masterDoc.context.obj([area.x1, area.y1, area.x2, area.y2]),
                    Border: masterDoc.context.obj([0, 0, 0]), // pas de bordure visible
                    A: action
                });
                const linkAnnotRef = masterDoc.context.register(linkAnnot);
                
                // Ajouter l'annotation à la page de sommaire concernée
                const pageNode = area.page.node;
                let annots = pageNode.lookup(PDFName.of('Annots'), PDFArray);
                if(!annots) {
                    annots = masterDoc.context.obj([]);
                    pageNode.set(PDFName.of('Annots'), annots);
                }
                annots.push(linkAnnotRef);
            });
        } catch(e) {
            console.warn('[Dossier Prod] Échec ajout liens hypertextes au sommaire :', e);
        }
        
        // ===== 7ter. NUMÉROTATION GLOBALE + LIEN "Sommaire" sur toutes les pages =====
        // Pour chaque page après la cover et le sommaire :
        // - Dessiner un rectangle blanc sur la bande du bas (masque les footers individuels)
        // - Réécrire le numéro de page global "X / N"
        // - Ajouter un lien "← Sommaire" en bas à droite (clic = retour au sommaire)
        try {
            const allPages = masterDoc.getPages();
            const totalPages = allPages.length;
            const linkSommaireText = 'Sommaire';
            const linkSommaireSize = 9;
            const linkSommaireW = fontHelv.widthOfTextAtSize(linkSommaireText, linkSommaireSize);
            
            for(let i = 0; i < totalPages; i++) {
                // Skip la cover (i=0) et les pages de sommaire (i < prefixPages)
                if(i < prefixPages) continue;
                
                const pg = allPages[i];
                const { width: pw, height: ph } = pg.getSize();
                const isLandscape = pw > ph;
                
                const pageStr = `${i + 1} / ${totalPages}`;
                const pageStrW = fontHelv.widthOfTextAtSize(pageStr, 9);
                
                let linkX, linkY;
                
                if(!isLandscape) {
                    // ===== PAGE PORTRAIT (cas normal) =====
                    // Tous les modules réservent désormais 14mm (~40pt) en bas pour le footer
                    // unifié et y dessinent "X / N" à pageHeight - 6mm (~17pt du bas).
                    // Une bande blanche de 40pt masque ce footer local pour pouvoir
                    // réécrire la pagination GLOBALE (par rapport au Dossier de Production).
                    pg.drawRectangle({
                        x: 0, y: 0, width: pw, height: 40,
                        color: rgb(1, 1, 1), opacity: 1
                    });
                    
                    // Numéro de page global centré en bas
                    pg.drawText(pageStr, {
                        x: (pw - pageStrW) / 2,
                        y: 14,
                        size: 9,
                        font: fontHelv,
                        color: rgb(0.5, 0.5, 0.5)
                    });
                    
                    // Nom de la section courante en bas à gauche
                    const curSect = toc.filter(t => t.startPage <= i + 1).pop();
                    if(curSect) {
                        const [ar, ag, ab] = PdfTheme.accentFor(curSect.label);
                        pg.drawText(cleanStr(curSect.label), { x: 40, y: 14, size: 8, font: fontHelvBold, color: rgb(ar / 255, ag / 255, ab / 255) });
                    }
                    
                    // Lien "Sommaire" en bas à droite
                    linkX = pw - 40 - linkSommaireW;
                    linkY = 14;
                    pg.drawText(linkSommaireText, {
                        x: linkX,
                        y: linkY,
                        size: linkSommaireSize,
                        font: fontHelv,
                        color: rgb(0.16, 0.43, 0.96)
                    });
                } else {
                    // ===== PAGE PAYSAGE (sera tournée 270° à la phase 7quater) =====
                    // Pour qu'après rotation 270°, le footer apparaisse en bas centré,
                    // on le dessine sur le BORD GAUCHE, texte tourné 90° (anti-trigo).
                    // Bande blanche de 40pt sur le bord gauche (= bas après rotation 270°)
                    pg.drawRectangle({
                        x: 0, y: 0, width: 40, height: ph,
                        color: rgb(1, 1, 1), opacity: 1
                    });
                    
                    // Texte tourné 270° (= -90°) pour qu'après rotation 270° de la
                    // page entière, le footer apparaisse droit (lisible normalement).
                    // Avec rotate:270°, le texte part vers le BAS depuis le point
                    // d'ancrage (x,y) ; on positionne donc y au-dessus de la zone visée.
                    const rotFooter = degrees(270);
                    
                    // Numéro de page : centré verticalement sur la page logique
                    // (= centre horizontal visuel après rotation 270° de la page)
                    pg.drawText(pageStr, {
                        x: 14,
                        y: (ph + pageStrW) / 2,
                        size: 9,
                        font: fontHelv,
                        color: rgb(0.5, 0.5, 0.5),
                        rotate: rotFooter
                    });
                    
                    // Lien "Sommaire" : positionné vers le bas du bord gauche logique
                    // (= bas droit visuel après rotation 270°)
                    linkX = 14;
                    linkY = 40 + linkSommaireW;
                    pg.drawText(linkSommaireText, {
                        x: linkX,
                        y: linkY,
                        size: linkSommaireSize,
                        font: fontHelv,
                        color: rgb(0.16, 0.43, 0.96),
                        rotate: rotFooter
                    });
                }
                
                // Annotation Link sur cette zone
                if(summaryFirstPageRef) {
                    const destArr = masterDoc.context.obj([summaryFirstPageRef, PDFName.of('Fit')]);
                    const act = masterDoc.context.obj({
                        Type: PDFName.of('Action'),
                        S: PDFName.of('GoTo'),
                        D: destArr
                    });
                    const linkAnnot = masterDoc.context.obj({
                        Type: PDFName.of('Annot'),
                        Subtype: PDFName.of('Link'),
                        Rect: masterDoc.context.obj([linkX - 2, linkY - 2, linkX + linkSommaireW + 2, linkY + linkSommaireSize + 2]),
                        Border: masterDoc.context.obj([0, 0, 0]),
                        A: act
                    });
                    const linkRef = masterDoc.context.register(linkAnnot);
                    let annots = pg.node.lookup(PDFName.of('Annots'), PDFArray);
                    if(!annots) {
                        annots = masterDoc.context.obj([]);
                        pg.node.set(PDFName.of('Annots'), annots);
                    }
                    annots.push(linkRef);
                }
            }
        } catch(e) {
            console.warn('[Dossier Prod] Échec numérotation globale + lien sommaire :', e);
        }
        
        // ===== 7quater. ROTATION DES PAGES PAYSAGE pour impression cohérente =====
        // Toutes les pages paysage (Mood Board large, Storyboard, Planning, etc.) sont
        // tournées de 90° pour qu'à l'impression, l'utilisateur garde la feuille en
        // portrait et tourne juste la tête pour lire le contenu paysage.
        // L'orientation logique du contenu n'est PAS modifiée, seul l'attribut /Rotate du PDF.
        try {
            const { degrees } = window.PDFLib;
            const rotPages = masterDoc.getPages();
            for(let i = 0; i < rotPages.length; i++) {
                const p = rotPages[i];
                const { width: w, height: h } = p.getSize();
                if(w > h) {
                    // Page paysage : rotation 270° (= -90°) pour impression portrait
                    // L'utilisateur tourne la tête vers la droite pour lire
                    p.setRotation(degrees(270));
                }
            }
        } catch(e) {
            console.warn('[Dossier Prod] Échec rotation pages paysage :', e);
        }
        
        // ===== 8. SAUVEGARDER ET TÉLÉCHARGER =====
        const pdfBytes = await masterDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Dossier de production')
            : `${cleanStr(projectTitle) || 'Projet'} - Dossier de production - moteur.studio.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        Utils.toast(`Dossier de production généré ! (${masterDoc.getPageCount()} pages)`, 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `Dossier de Production PDF généré (${loadedSections.length} sections, ${masterDoc.getPageCount()} pages)`);
    },
    
    // ========== [Phase B] EXPORT ZIP MOTEUR COMPLET ==========
    // Génère un fichier .moteur.zip qui peut être réimporté pour restaurer le projet complet.
    // Inclut : project.json + toutes les images Storage + manifest signé.
    exportMoteurZip: async () => {
        // v578 (cloisonnement) : cette archive se presente comme une sauvegarde
        // COMPLETE, « en cas de crash ». Sur un projet transmis partiellement elle
        // serait silencieusement amputee — et c'est le pire des cas, parce qu'on ne
        // s'en apercevrait qu'au moment de restaurer, quand il est trop tard.
        // Mieux vaut ne rien donner qu'une sauvegarde qui ment.
        if(typeof Store !== 'undefined' && Store.isPartial && Store.isPartial()) {
            Utils.toast("Ce projet vous est transmis partiellement : l'archive serait incomplète. Seul le propriétaire peut en faire une sauvegarde complète.", 'error', 9000);
            return;
        }
        try {
            await MoteurArchive.ensureJSZip();
        } catch(e) {
            Utils.toast('Impossible de charger JSZip', 'error');
            return;
        }
        
        const progress = MoteurArchive.showProgressModal('📦 Téléchargement Moteur complet');
        
        try {
            // 1. Cloner state.data pour ne pas le polluer
            progress.update('Préparation des données…', 0, 100);
            await new Promise(r => setTimeout(r, 50));
            const dataClone = JSON.parse(JSON.stringify(state.data));
            
            // 2. Trouver toutes les URLs Storage
            progress.update('Inventaire des images…', 5, 100);
            await new Promise(r => setTimeout(r, 50));
            const urlsFound = MoteurArchive.findAllStorageUrls(dataClone);
            // Dédupliquer par URL (une même image peut être référencée plusieurs fois)
            const uniqueUrls = [];
            const seenUrls = new Set();
            urlsFound.forEach(item => {
                if(!seenUrls.has(item.url)) {
                    seenUrls.add(item.url);
                    uniqueUrls.push(item);
                }
            });
            
            // 3. Préparer mapping URL → chemin local
            const urlToLocal = {};
            uniqueUrls.forEach(item => {
                urlToLocal[item.url] = MoteurArchive.urlToLocalPath(item.url);
            });
            
            // 4. Télécharger toutes les images
            const zip = new JSZip();
            const totalImages = uniqueUrls.length;
            let downloaded = 0;
            let failed = 0;
            
            for(const item of uniqueUrls) {
                if(progress.isCancelled()) {
                    progress.close();
                    Utils.toast('Export annulé', 'info');
                    return;
                }
                
                const localPath = urlToLocal[item.url];
                const fileName = localPath.split('/').pop();
                progress.update(`Téléchargement: ${fileName}`, downloaded, totalImages);
                
                try {
                    const response = await fetch(Utils.signedUrlFor(item.url));
                    if(!response.ok) throw new Error('HTTP ' + response.status);
                    const blob = await response.blob();
                    zip.file(localPath, blob);
                    downloaded++;
                } catch(e) {
                    console.warn('Échec download:', item.url, e.message);
                    failed++;
                }
            }
            
            // 5. Réécrire les URLs dans le clone vers les chemins locaux relatifs
            // On parcourt l'objet et on remplace toute string qui est une URL Storage par son chemin local
            progress.update('Réécriture des chemins…', totalImages, totalImages + 3);
            await new Promise(r => setTimeout(r, 50));
            const rewriteUrls = (obj) => {
                if(typeof obj === 'string') {
                    return urlToLocal[obj] ? './' + urlToLocal[obj] : obj;
                }
                if(Array.isArray(obj)) return obj.map(rewriteUrls);
                if(obj && typeof obj === 'object') {
                    const out = {};
                    Object.entries(obj).forEach(([k, v]) => { out[k] = rewriteUrls(v); });
                    return out;
                }
                return obj;
            };
            const dataRewritten = rewriteUrls(dataClone);
            
            // 6. Écrire project.json
            const projectJson = JSON.stringify(dataRewritten, null, 2);
            zip.file('project.json', projectJson);
            
            // 7. Écrire manifest signé
            progress.update('Génération du manifest…', totalImages + 1, totalImages + 3);
            await new Promise(r => setTimeout(r, 50));
            const manifest = {
                signature: MoteurArchive.SIGNATURE,
                version: MoteurArchive.VERSION,
                generatedAt: new Date().toISOString(),
                generatedBy: state.currentUser?.email || 'unknown',
                projectTitle: state.data.title || 'Sans titre',
                projectId: state.currentProjectId || null,
                stats: {
                    imagesTotal: totalImages,
                    imagesDownloaded: downloaded,
                    imagesFailed: failed
                },
                checksum: MoteurArchive.simpleHash(projectJson)
            };
            zip.file('moteur-manifest.json', JSON.stringify(manifest, null, 2));
            
            // 8. README
            zip.file('README.txt', 
                `Archive Moteur — ${state.data.title || 'Sans titre'}\n` +
                `Générée le : ${new Date().toLocaleString('fr-FR')}\n\n` +
                `Cette archive contient une sauvegarde complète de votre projet, ` +
                `incluant toutes les images. Elle ne peut être réouverte que dans moteur.studio.\n\n` +
                `Pour la restaurer : Menu Fichier > Importer un projet > sélectionnez ce fichier.\n\n` +
                `⚠️ Ne modifiez pas le contenu de ce ZIP, l'import vérifiera la signature.\n`
            );
            
            // 9. Générer le ZIP
            progress.update('Compression du ZIP…', totalImages + 2, totalImages + 3);
            await new Promise(r => setTimeout(r, 50));
            const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
            
            // 10. Téléchargement
            const safeTitle = (state.data.title || 'projet').replace(/[\\/:*?"<>|]/g, '_').trim();
            const filename = `${safeTitle}${MoteurArchive.EXTENSION}`;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
            
            progress.close();
            
            // Message final
            const summary = failed > 0 
                ? `Export terminé. ${downloaded} images sauvegardées, ${failed} échouées.`
                : `Export complet ! ${downloaded} image(s) sauvegardée(s).`;
            Utils.toast(summary, failed > 0 ? 'warning' : 'success');
            History.log('EXPORT', 'Téléchargement Moteur complet généré');
            
        } catch(err) {
            console.error('Erreur export Moteur ZIP:', err);
            progress.close();
            Utils.toast('Erreur : ' + (err.message || 'inconnu'), 'error');
        }
    }
};
