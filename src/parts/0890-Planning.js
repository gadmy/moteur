
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
    fermerMenuJour: () => {
        const m = document.getElementById('menu-jour-vide');
        if(!m) return;
        // ON LUI RETIRE SON IDENTIFIANT TOUT DE SUITE. Pendant la fermeture il
        // est encore dans la page ; un menu rouvert aussitot porterait le meme
        // identifiant, et deux elements pour un identifiant, c'est toujours le
        // mauvais qu'on retrouve. Pour tout le reste de l'application, le menu
        // est ferme des maintenant — il ne fait plus que s'effacer.
        m.removeAttribute('id');
        Utils.fermerMenu(m, () => m.remove());
    },
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
    
    //  ==================================================================
    //  QUI PEUT SUPPRIMER UNE JOURNEE (ET SA FEUILLE DE SERVICE) — v602
    //  ==================================================================
    //  Decision du developpeur : le CREATEUR du projet, ou l'ASSISTANT·E
    //  REALISATEUR s'il a l'ecriture sur le Planning. Modifier une journee
    //  reste ouvert a tous ceux qui ecrivent le Planning ; seule la
    //  suppression est reservee. La meme regle est posee EN BASE
    //  (projects_suppressions_guard, peut_supprimer_fds) : ceci n'est que
    //  l'affichage, qui evite de proposer un bouton qui serait refuse.
    //  L'assistant se reconnait a sa fiche dans l'equipe (meme adresse que
    //  le compte), comme pour les alertes de desistement.
    peutSupprimerJour: () => {
        if(state.currentRole === 'owner') return true;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('planning')) return false;
        const me = String((state.currentUser && state.currentUser.email) || '').toLowerCase();
        if(!me) return false;
        return (state.data.crew || []).some(m => m && String(m.email || '').toLowerCase() === me
            && PublicProfile.estAssistantReal(m));
    },
    _refusSuppression: () => {
        if(Planning.peutSupprimerJour()) return false;
        Utils.toast('Supprimer une journée de tournage est réservé au créateur du projet et à l\'assistant·e réalisateur.', 'warning');
        return true;
    },
    deleteShootDay: async (dayId) => {
        if(Planning._refusSuppression()) return;
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
        if(Planning._refusSuppression()) return;
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
            ${Planning.peutSupprimerJour() ? `<div class="context-menu-item" onclick="event.stopPropagation(); app.Planning.hideContextMenu(); app.Planning.deleteShootDayFromCalendar('${dayId}');" style="padding: 12px 15px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: var(--danger);">
                <span>🗑️</span> Supprimer
            </div>` : ''}
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
        if(Planning._refusSuppression()) return;
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
