
  const UI = {
	// ===================== ÉTAT & CALENDRIER DE DISPONIBILITÉS =====================
  // ====================================================================
  //  DE QUI PARLE CE CALENDRIER ? UNE SEULE REPONSE (v601)
  // ====================================================================
  //  La question etait posee a TROIS endroits, toujours de la meme facon :
  //  « state.data.actors[idx] ». Dans un PROJET c'est juste. Dans « Mon
  //  profil », l'index vaut -1 (il n'y a pas de tableau, il y a MA fiche) :
  //  la reponse etait undefined, et le calendrier se contentait de ne rien
  //  dessiner. D'ou le planning disparu des fiches de mes profils, sans la
  //  moindre erreur a l'ecran.
  _personneCalendrier: (personType, personIdx) => {
      try {
          if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) {
              return PublicProfile._engineProfile || null;
          }
      } catch(e) {}
      return (personType === 'actor') ? state.data.actors[personIdx] : state.data.crew[personIdx];
  },

  //  Ce qui tombe ce jour-la dans MES projets. Hors « Mon profil », rien :
  //  dans un projet, la fiche d'un comedien n'a pas a afficher les tournages
  //  qu'il fait ailleurs.
  // ====================================================================
  //  SE DIRE INDISPONIBLE UN JOUR OU L'ON TOURNE (v601)
  // ====================================================================
  //  On ne BLOQUE pas : c'est la vie de la personne, pas celle du projet.
  //  On previent, on demande, et si elle confirme, la production l'apprend
  //  le jour meme plutot que la veille du tournage.
  //  LES BOUTONS DISENT CE QU'ILS FONT. « Continuer / Annuler » dans une
  //  fenetre qui parle de tournage se lit dans les deux sens : continuer
  //  quoi, mon indispo ou mon tournage ? Chaque bouton porte donc sa phrase
  //  entiere, et la case a cocher oblige a lire avant de confirmer.
  _sansDemande: false,
  _tournagesHeurtes: (dates) => {
      const vus = {}, out = [];
      (dates || []).forEach(d => {
          UI._joursProjetsAuJour(d).forEach(j => {
              if(vus[j.id]) return;
              vus[j.id] = 1;
              out.push(j);
          });
      });
      return out;
  },
  demanderConflit: (heurts, dates, siJeConfirme) => {
      const ov = document.createElement('div');
      ov.className = 'confirm-modal-overlay';
      ov.id = 'conflit-modal';
      const jour = (d) => { try { return Planning.jolieDate(d); } catch(e) { return d; } };
      const quand = (dates.length === 1) ? jour(dates[0])
                  : ('du ' + jour(dates[0]) + ' au ' + jour(dates[dates.length - 1]));
      const lignes = heurts.map(j => {
          const sc = (!j.probable && j.scenes && j.scenes.length)
              ? '<span>Vous étiez prévu·e sur : ' + Utils.escape(j.scenes.join(', ')) + '</span>' : '';
          const quoi = j.probable ? '❓ Tournage probable' : '🎬 Tournage';
          return '<div class="conflit-ligne"><strong>' + quoi + ' — ' + Utils.escape(j.titre || 'projet') + '</strong>'
               + '<span>' + Utils.escape(jour(j.date)) + '</span>' + sc + '</div>';
      }).join('');
      ov.innerHTML = '<div class="confirm-modal-box" style="max-width:520px;">'
          + '<h3 style="margin:0 0 4px;">Vous jouez pour un projet ce jour-là</h3>'
          + '<p style="margin:0 0 12px; font-size:.82rem; color:var(--text-sec);">Vous êtes en train de vous déclarer <strong>indisponible</strong> ' + Utils.escape(quand) + '.</p>'
          + '<div class="conflit-liste">' + lignes + '</div>'
          + '<label class="conflit-sur"><input type="checkbox" id="conflit-sur"> J’ai compris : la production sera prévenue que je ne suis plus disponible.</label>'
          + '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-wrap:wrap;">'
            + '<button class="btn btn--secondary btn--sm" data-act="rien">Non, laisser mon calendrier comme avant</button>'
            + '<button class="btn btn--primary btn--sm" data-act="ok" id="conflit-ok" disabled>Oui, je ne suis plus disponible</button>'
          + '</div>'
      + '</div>';
      document.body.appendChild(ov);
      const fermer = () => { const m = document.getElementById('conflit-modal'); if(m) m.remove(); };
      const sur = ov.querySelector('#conflit-sur'), ok = ov.querySelector('#conflit-ok');
      if(sur && ok) sur.addEventListener('change', () => { ok.disabled = !sur.checked; });
      ov.addEventListener('click', (e) => {
          const act = e.target && e.target.dataset ? e.target.dataset.act : null;
          if(e.target === ov || act === 'rien') { fermer(); return; }
          if(act !== 'ok' || (sur && !sur.checked)) return;
          fermer();
          try { siJeConfirme(); } catch(err) { console.warn('[Dispos] conflit:', err && err.message); }
      });
  },
  //  Le message part a CHAQUE projet concerne, au porteur et a l'assistant
  //  realisateur s'il y en a un. Le texte dit la date et, quand il y a une
  //  feuille de service, les scenes ou la personne etait prevue — sans elle
  //  (blocage de journee), il n'y a rien a dire de plus.
  prevenirProduction: async (heurts, dates) => {
      if(typeof Notifications === 'undefined' || !Notifications.send) return;
      let moi = '';
      try {
          const p = PublicProfile.profiles[PublicProfile.currentProfileIndex];
          moi = (p && p.name) || (state.currentUser && state.currentUser.email) || 'Quelqu’un';
      } catch(e) { moi = 'Quelqu’un'; }
      let envoyes = 0;
      for(const j of heurts) {
          const sc = (!j.probable && j.scenes && j.scenes.length)
              ? ' Il/elle était prévu·e sur : ' + j.scenes.join(', ') + '.' : '';
          const texte = moi + ' n’est plus disponible le ' + j.date + '.' + sc;
          for(const dest of (j.destinataires || [])) {
              try { await Notifications.send(dest, 'dispo_annulee', texte, j.projet); envoyes++; }
              catch(e) { console.warn('[Dispos] envoi:', e && e.message); }
          }
      }
      Utils.toast(envoyes
          ? 'Indisponibilité enregistrée. La production a été prévenue.'
          : 'Indisponibilité enregistrée. Aucun contact de production n’a pu être prévenu — prévenez-les directement.',
          envoyes ? 'success' : 'warning', 8000);
  },

  _joursProjetsAuJour: (dateStr) => {
      try {
          if(typeof PublicProfile === 'undefined' || !PublicProfile._engineMode) return [];
          const p = PublicProfile.profiles[PublicProfile.currentProfileIndex];
          if(!p || !p.id) return [];
          return PublicProfile.joursAuJour(p.id, dateStr);
      } catch(e) { return []; }
  },
  //  L'infobulle : « tournage probable — nom du projet », et les scenes
  //  quand il y a une feuille de service.
  _texteJoursProjets: (jours) => (jours || []).map(j => {
      const tete = j.probable ? '❓ Tournage probable' : '🎬 Tournage';
      const sc = (!j.probable && j.scenes && j.scenes.length) ? ' — ' + j.scenes.join(', ') : '';
      return tete + ' — ' + (j.titre || 'projet') + sc;
  }).join('\n'),

	renderAvailabilityCalendar: (containerId, personType, personIdx) => {
      const container = document.getElementById(containerId);
      if(!container) return;
      
      const person = UI._personneCalendrier(personType, personIdx);
      if(!person) return;
      
      // Vérifier si le profil est verrouillé (revendiqué)
      const isLocked = !!person.publicProfileId;
      
      const today = new Date();
      const currentMonth = person._calendarMonth !== undefined ? person._calendarMonth : today.getMonth();
      const currentYear = person._calendarYear !== undefined ? person._calendarYear : today.getFullYear();
      
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
      
      const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
      const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
      
      const availDates = person.availabilityDates || [];
      const unavailDates = person.unavailabilityDates || [];
      const shootDates = person.shootingDates || [];
      
      const isDateShooting = (dateStr) => {
          return shootDates.find(sd => sd.date === dateStr);
      };
      
      const isDateAvailable = (dateStr) => {
          return availDates.some(range => {
              const from = new Date(range.from);
              const to = new Date(range.to);
              const check = new Date(dateStr);
              return check >= from && check <= to;
          });
      };
      
      const isDateUnavailable = (dateStr) => {
          return unavailDates.some(range => {
              const from = new Date(range.from);
              const to = new Date(range.to);
              const check = new Date(dateStr);
              return check >= from && check <= to;
          });
      };
      
      let html = `<div class="availability-calendar">
          <div class="availability-calendar-header">
              <button onclick="app.UI.changeCalendarMonth('${containerId}', '${personType}', ${personIdx}, -1)">◀</button>
              <strong>${monthNames[currentMonth]} ${currentYear}</strong>
              <button onclick="app.UI.changeCalendarMonth('${containerId}', '${personType}', ${personIdx}, 1)">▶</button>
          </div>
          ${isLocked ? `<div style="font-size:0.7rem; text-align:center; margin-bottom:5px; color:var(--text-sec);">🔒 Calendrier en lecture seule</div>` : `<div style="font-size:0.7rem; text-align:center; margin-bottom:5px; color:var(--text-sec);">🟢 dispo | 🔴 indispo | 🎬 tournage</div>`}
          <div class="availability-calendar-grid">`;
      
      dayNames.forEach(d => {
          html += `<div class="availability-calendar-day-header">${d}</div>`;
      });
      
      for(let i = 0; i < startDay; i++) {
          html += `<div class="availability-calendar-day empty"></div>`;
      }
      
      for(let day = 1; day <= lastDay.getDate(); day++) {
          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;
          const isAvail = isDateAvailable(dateStr);
          const isUnavail = isDateUnavailable(dateStr);
          
          const shootingInfo = isDateShooting(dateStr);
          // v601 : dans MON profil, les jours viennent des projets dont je
          // suis membre — personne n'ecrit dans mon agenda, c'est mon agenda
          // qui va les lire (voir PublicProfile.profileDays).
          const desProjets = UI._joursProjetsAuJour(dateStr);
          const probable = desProjets.some(j => j.probable);
          const arrete = desProjets.some(j => !j.probable);
          
          let dayClass = 'availability-calendar-day';
          if(probable && !arrete) dayClass += ' tournage-probable';
          if(arrete) dayClass += ' tournage-prevu';
          if(isToday) dayClass += ' today';
          if(shootingInfo) dayClass += ' shooting';
          else if(isAvail) dayClass += ' available';
          if(isUnavail) dayClass += ' unavailable';
          if(isLocked) dayClass += ' locked';
          
          let shootTitle = shootingInfo ? `title="🎬 J${shootingInfo.dayNumber} - ${shootingInfo.projectName}${shootingInfo.callTime ? ' | Convoc: ' + shootingInfo.callTime : ''}${shootingInfo.location ? ' | ' + shootingInfo.location : ''}"` : '';
          if(desProjets.length) shootTitle = `title="${Utils.escape(UI._texteJoursProjets(desProjets))}"`;
          const marque = arrete ? '🎬' : (probable ? '❓' : '');
          
          html += `<div class="${dayClass}" 
              data-date="${dateStr}"
              ${shootTitle}
              ${!isLocked ? `onmousedown="app.UI.startCalendarDrag('${containerId}', '${personType}', ${personIdx}, '${dateStr}', event)"
              onmouseenter="app.UI.continueCalendarDrag('${dateStr}')"
              onmouseup="app.UI.endCalendarDrag()"` : ''}
              oncontextmenu="return false;">${day}${marque ? `<span class="jour-marque">${marque}</span>` : ''}</div>`;
      }
      
      html += `</div></div>`;
      container.innerHTML = html;
  },
  
  changeCalendarMonth: (containerId, personType, personIdx, delta) => {
      const person = UI._personneCalendrier(personType, personIdx);
      if(!person) return;
      
      const today = new Date();
      let currentMonth = person._calendarMonth !== undefined ? person._calendarMonth : today.getMonth();
      let currentYear = person._calendarYear !== undefined ? person._calendarYear : today.getFullYear();
      
      currentMonth += delta;
      if(currentMonth > 11) { currentMonth = 0; currentYear++; }
      if(currentMonth < 0) { currentMonth = 11; currentYear--; }
      
      person._calendarMonth = currentMonth;
      person._calendarYear = currentYear;
      
      UI.renderAvailabilityCalendar(containerId, personType, personIdx);
  },
  
  _calendarDrag: { active: false, containerId: null, personType: null, personIdx: null, startDate: null, dates: [], isRightClick: false },
  
  startCalendarDrag: (containerId, personType, personIdx, dateStr, event) => {
      // 31 aout — QUATRIEME ANGLE MORT SOURIS. Les disponibilites se peignent en
      // BALAYANT le calendrier ; le verrou visuel, qui ne connait que le clic,
      // laissait un lecteur repeindre les dates d'un comedien. Le droit est
      // celui de la fiche concernee (comediens ou equipe).
      const kindCal = (personType === 'actor') ? 'actor' : 'crew';
      if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche(kindCal)) return;
      event.preventDefault();
      const isRightClick = event.button === 2;
      UI._calendarDrag = { active: true, containerId, personType, personIdx, startDate: dateStr, dates: [dateStr], isRightClick };
      document.addEventListener('mouseup', UI.endCalendarDrag);
  },
  
  continueCalendarDrag: (dateStr) => {
      if(!UI._calendarDrag.active) return;
      if(!UI._calendarDrag.dates.includes(dateStr)) {
          UI._calendarDrag.dates.push(dateStr);
      }
      const container = document.getElementById(UI._calendarDrag.containerId);
      if(container) {
          const color = UI._calendarDrag.isRightClick ? '#f44336' : '#4CAF50';
          container.querySelectorAll('.availability-calendar-day').forEach(el => {
              if(UI._calendarDrag.dates.includes(el.dataset.date)) {
                  el.style.background = color;
                  el.style.color = 'white';
              }
          });
      }
  },
  
  endCalendarDrag: () => {
      if(!UI._calendarDrag.active) return;
      
      const { personType, personIdx, dates, isRightClick } = UI._calendarDrag;
      const kindCal = (personType === 'actor') ? 'actor' : 'crew';
      if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche(kindCal)) {
          UI._calendarDrag = { active: false, containerId: null, personType: null, personIdx: null, startDate: null, dates: [], isRightClick: false };
          document.removeEventListener('mouseup', UI.endCalendarDrag);
          return;
      }
      if(dates.length > 0) {
          dates.sort();
          const from = dates[0];
          const to = dates[dates.length - 1];
          
          // v601 : se declarer INDISPONIBLE un jour ou l'on tourne se demande
          // AVANT de poser la plage. On ne bloque pas — on previent, et si la
          // personne confirme, la production l'apprend le jour meme plutot
          // que la veille du tournage.
          if(isRightClick && !UI._sansDemande) {
              const heurts = UI._tournagesHeurtes(dates);
              if(heurts.length) {
                  UI._calendarDrag = { active: false, containerId: UI._calendarDrag.containerId, personType, personIdx, startDate: null, dates: [], isRightClick: false };
                  document.removeEventListener('mouseup', UI.endCalendarDrag);
                  UI.demanderConflit(heurts, dates, () => {
                      UI._calendarDrag = { active: true, containerId: UI._calendarDrag.containerId, personType, personIdx, startDate: from, dates: dates.slice(), isRightClick: true };
                      UI._sansDemande = true;
                      UI.endCalendarDrag();
                      UI._sansDemande = false;
                      UI.prevenirProduction(heurts, dates);
                  });
                  return;
              }
          }
          
          const person = UI._personneCalendrier(personType, personIdx);
          if(person) {
              // Initialiser les tableaux si nécessaire
              if(!person.availabilityDates) person.availabilityDates = [];
              if(!person.unavailabilityDates) person.unavailabilityDates = [];
              
              const targetArray = isRightClick ? person.unavailabilityDates : person.availabilityDates;
              const otherArray = isRightClick ? person.availabilityDates : person.unavailabilityDates;
              
              // Vérifier si on clique sur une date déjà dans le même état (pour la désélectionner)
              if(dates.length === 1) {
                  const existingIdx = targetArray.findIndex(range => {
                      const checkDate = new Date(dates[0]);
                      return checkDate >= new Date(range.from) && checkDate <= new Date(range.to);
                  });
                  if(existingIdx > -1) {
                      // Désélectionner
                      targetArray.splice(existingIdx, 1);
                  } else {
                      // Retirer de l'autre état si présent
                      const otherIdx = otherArray.findIndex(range => {
                          const checkDate = new Date(dates[0]);
                          return checkDate >= new Date(range.from) && checkDate <= new Date(range.to);
                      });
                      if(otherIdx > -1) {
                          otherArray.splice(otherIdx, 1);
                      }
                      // Ajouter au nouvel état
                      targetArray.push({ from, to });
                  }
              } else {
                  // Sélection multiple : ajouter la plage
                  targetArray.push({ from, to });
              }
              
              // En mode profil il n'y a pas de projet a enregistrer ni
              // d'onglet a redessiner : la fiche se sauve avec le profil.
              const enProfil = (typeof PublicProfile !== 'undefined' && PublicProfile._engineMode);
              if(!enProfil) Store.save();
              UI.renderAvailabilityCalendar(UI._calendarDrag.containerId, personType, personIdx);
              if(enProfil) {
                  // rien d'autre : la carte reste a l'ecran, le calendrier vient
                  // d'etre redessine avec les nouvelles dates.
              } else if(personType === 'actor') {
                  UIData.renderDataTab('actors', els.actorContainer);
              } else {
                  UI.renderCrewTab();
              }
          }
      }
      
      UI._calendarDrag = { active: false, containerId: null, personType: null, personIdx: null, startDate: null, dates: [], isRightClick: false };
      document.removeEventListener('mouseup', UI.endCalendarDrag);
  },
	
	// ===================== PERMISSIONS, VERROUS & DÉLÉGATIONS ONGLETS =====================
	applyTabPermissions: () => {
        if(state.currentRole === 'owner') {
            // Le propriétaire voit tout
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            });
            return;
        }
        
        // v570 : carte centralisee dans Permissions.SECTION_BY_TAB (cette copie-ci
        // ignorait 'presentation', 'titlepage', 'moodboard', 'scriptreport' et 'contrats').
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const tabName = btn.dataset.tab;
            const section = Permissions.sectionOf(tabName);
            
            if(section && !Permissions.canAccess(section)) {
                btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
                btn.title = '🔒 Accès restreint';
            } else {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
                btn.title = '';
                
                // Indiquer si lecture seule
                if(section && !Permissions.canEdit(section)) {
                    btn.title = '👁️ Lecture seule';
                }
            }
        });
    },
	
	initCategoriesDragDrop: (...a) => UICategories.initCategoriesDragDrop(...a),
    saveCategoriesOrder: (...a) => UICategories.saveCategoriesOrder(...a),
    loadCategoriesOrder: (...a) => UICategories.loadCategoriesOrder(...a),
    loadCategoryTabsOrder: (...a) => UICategories.loadCategoryTabsOrder(...a),
    initTabsDragDrop: (...a) => UICategories.initTabsDragDrop(...a),
    updateTabNumbers: (...a) => UICategories.updateTabNumbers(...a),
	
      // ===== THÈME / DROPDOWNS / NAV ONGLETS — délégué à UITheme =====
      toggleTheme: (...a) => UITheme.toggleTheme(...a),
      toggleNavDropdown: (...a) => UITheme.toggleNavDropdown(...a),
      toggleMenuDropdown: (...a) => UITheme.toggleMenuDropdown(...a),
      toggleTabsPositionMenu: (...a) => UITheme.toggleTabsPositionMenu(...a),
      closeAllDropdowns: (...a) => UITheme.closeAllDropdowns(...a),
      // setTabsMode / setTabsPosition / setNavModeFromMenu / setTabsModeFromMenu
      // retirées v569 : leurs boutons de menu (Position, Mode, Classique) ont
      // été retirés à l'étape 4, plus aucun appelant.
      togglePositionMenu: (...a) => UITheme.togglePositionMenu(...a),
      updatePositionMenuState: (...a) => UITheme.updatePositionMenuState(...a),
      initTabsMode: (...a) => UITheme.initTabsMode(...a),
      
// ===== CATÉGORIES / NAVIGATION / COULEURS ONGLETS — délégué à UICategories =====
      get currentCategory() { return UICategories.currentCategory; },
      set currentCategory(v) { UICategories.currentCategory = v; },
      get categoryTabs() { return UICategories.categoryTabs; },
      set categoryTabs(v) { UICategories.categoryTabs = v; },
      get categoryLabels() { return UICategories.categoryLabels; },
      set categoryLabels(v) { UICategories.categoryLabels = v; },
      get currentTabTarget() { return UICategories.currentTabTarget; },
      set currentTabTarget(v) { UICategories.currentTabTarget = v; },
      get subnavDraggedTab() { return UICategories.subnavDraggedTab; },
      set subnavDraggedTab(v) { UICategories.subnavDraggedTab = v; },
      get subnavDraggedCategory() { return UICategories.subnavDraggedCategory; },
      set subnavDraggedCategory(v) { UICategories.subnavDraggedCategory = v; },
      setNavMode: (...a) => UICategories.setNavMode(...a),
      switchCategory: (...a) => UICategories.switchCategory(...a),
      getCategoryForTab: (...a) => UICategories.getCategoryForTab(...a),
      closeTabColorMenu: (...a) => UICategories.closeTabColorMenu(...a),
      setTabColor: (...a) => UICategories.setTabColor(...a),
      openTabHelp: (...a) => UICategories.openTabHelp(...a),
      loadTabColors: (...a) => UICategories.loadTabColors(...a),
      initTabsContextMenu: (...a) => UICategories.initTabsContextMenu(...a),
      resetTabsOrder: (...a) => UICategories.resetTabsOrder(...a),

      // ============================================================
      // ===== VUES : bascule d'affichage & lancement éditeur =====
      // ============================================================
      hideAllViews: () => {
          document.getElementById('hub-content').style.display = '';
          document.getElementById('landing-view').style.display = 'none';
          document.getElementById('dashboard-view').style.display = 'none';
          document.getElementById('universe-view').style.display = 'none';
          document.getElementById('app-view').style.display = 'none';
          const adminV = document.getElementById('admin-view');
          if(adminV) adminV.style.display = 'none';
          document.getElementById('public-profile-view').classList.remove('active');
          document.getElementById('contacts-view').classList.remove('active');
          document.getElementById('forum-view').classList.remove('active');
          document.getElementById('courses-view').classList.remove('active');
          try { ScriptReview.close(); } catch(e) {}
          Router.sync();
          },
		  
// ===== DASHBOARD / LISTE PROJETS — délégué à UIDashboard =====
      showDashboard: (...a) => UIDashboard.showDashboard(...a),
      renderDashboard: (...a) => UIDashboard.renderDashboard(...a),
      renderProjectList: (...a) => UIDashboard.renderProjectList(...a),
      toggleSidebarContent: () => { if(els.toggleSynop.checked) els.blockSynop.classList.add('visible'); else els.blockSynop.classList.remove('visible'); if(els.toggleShort.checked) els.blockShort.classList.add('visible'); else els.blockShort.classList.remove('visible'); if(els.toggleLong.checked) els.blockLong.classList.add('visible'); else els.blockLong.classList.remove('visible'); },
      
      
      // setBoardMode / loadBoardMode retirees le 26 aout avec la bascule
      // « Normal / Compact » : le sequencier est desormais une grille de fiches.
      // La preference fmp_board_mode n'est plus ni lue ni ecrite.
      
      launchEditor: () => { 
          els.dashboardView.style.display = 'none'; 
          els.appView.style.display = 'flex';
          Router.sync();
          Router.applyPendingTab();
          setTimeout(() => { try { WindowManager.restoreSaved(); } catch(_) {} }, 400);
          
          // Appliquer les permissions sur les onglets visibles
          UI.applyTabPermissions(); 
          let roleTxt = state.currentRole === 'owner' ? 'PROPRIÉTAIRE' : (state.currentRole === 'editor' ? 'ÉDITEUR' : 'LECTEUR');
          
          // Afficher le rôle métier si disponible
          const userEmail = state.currentUser?.email;
          if(userEmail && state.currentRole !== 'owner') {
              const crew = state.data?.crew?.find(c => c.email === userEmail);
              const actor = state.data?.actors?.find(a => a.email === userEmail);
              if(crew && crew.role) {
                  roleTxt = crew.role;
              } else if(actor) {
                  roleTxt = 'Comédien.ne';
              }
          }
          
          els.roleBadge.innerText = roleTxt; 
          if(state.currentRole === 'viewer') { document.body.classList.add('read-only'); els.title.disabled = true; } else { document.body.classList.remove('read-only'); els.title.disabled = false; }
          
          // Appliquer les permissions sur les champs synopsis
          const canEditSynopsis = state.currentRole === 'owner' || Permissions.canEdit('synopsis');
          // Synopsis en mode chapitres - permissions gérées différemment
          state.canEditSynopsis = canEditSynopsis;
          
          if(!canEditSynopsis) {
              // Synopsis en mode chapitres
          } else {
              // Synopsis en mode chapitres
          } 
          
          if(!window.appListenersAttached) { 
              els.title.addEventListener('input', () => { 
                  state.data.title = els.title.value; 
                  Store.updateTitle(els.title.value); 
                  // Synchroniser avec le titre du scénario
                  if(!state.data.titlePage) state.data.titlePage = {};
                  state.data.titlePage.title = els.title.value;
                  const tpTitleEl = document.getElementById('tp-title');
                  if(tpTitleEl) tpTitleEl.value = els.title.value;
              }); 
              // Synopsis en mode chapitres - événements gérés par le module Synopsis 
        
          
          // Protection contre la fermeture pendant une sauvegarde
          window.addEventListener('beforeunload', (e) => {
              // Flush des modifs debouncées en attente avant de quitter
              if(Store._saveDebounceTimer) {
                  Store.saveFlush();
              }
              if(state.savingInProgress || Store._saveDebounceTimer) {
                  e.preventDefault();
                  e.returnValue = 'Une sauvegarde est en cours. Voulez-vous vraiment quitter ?';
                  return e.returnValue;
              }
          });  
              els.fileInput.addEventListener('change', Store.importJSON);  
              // L'autocompletion decor / personnages est desormais posee a
              // l'ouverture de la fiche de scene (CardModal.openScene), les
              // champs n'existant plus au chargement de la page.
              els.boardList.addEventListener('dragover', e => UI.handleDragOver(e, els.boardList, '.card')); 
              document.addEventListener('click', (e) => { 
                  if(state.scriptAC.active && !els.scriptACList.contains(e.target)) ScriptEditor.hideAC(); 
                  if(els.bdCtxMenu.style.display === 'block' && !els.bdCtxMenu.contains(e.target)) els.bdCtxMenu.style.display = 'none'; 
                  if(els.tagCtxMenu.style.display === 'block' && !els.tagCtxMenu.contains(e.target)) els.tagCtxMenu.style.display = 'none'; 
                  if(!e.target.closest('.nav-dropdown')) document.querySelectorAll('.nav-dropdown .dropdown-menu.show').forEach(m => m.classList.remove('show')); 
                  if(!e.target.closest('.menu-dropdown-container')) UITheme.closeAllDropdowns(); 
                  if(!e.target.closest('.tabs-position-dropdown')) { const tpMenu = document.getElementById('tabs-position-menu'); if(tpMenu && tpMenu.style.display === 'block') tpMenu.style.display = 'none'; } 
              }); 
              window.appListenersAttached = true; 
          } 
          UI.renderAll(); UI.initHiddenTabs(); UI.switchTab('synopsis'); UI.initTabsDragDrop(); UI.initCategoriesDragDrop(); UI.loadCategoriesOrder(); UI.loadCategoryTabsOrder(); UI.initTabsMode(); UI.loadTabColors(); UI.initTabsContextMenu(); Synopsis.init();
          // Mettre à jour les notifications et le badge de rôle
          Notifications.updateBadge();
          // updateRoleBadge retiree le 1er septembre (voir son emplacement).
      },
      
      // ===== RENDU GLOBAL =====
      renderAll: () => { 
          if(!state.data.titlePage) state.data.titlePage = state.data.scriptMeta;
          els.title.value = state.data.title || ""; 
          // Synopsis avec éditeur riche
          Synopsis.load('synopsis');
          Synopsis.load('short');
          Synopsis.load('long');
          Synopsis.load('intent');
          Synopsis.load('director');
          Synopsis.load('producer');
          Synopsis.applyDormantState();
          Synopsis.updateCounts();
          Synopsis.updateBoard();
          ScriptEditor.initEpisodeSelector(); UI.renderBoard(); UI.renderScript(); ScriptEditor.initViewMode(); UI.renderDataTab('characters', els.charContainer); UI.renderDataTab('actors', els.actorContainer); UI.renderDataTab('locations', els.locContainer); 
      },
      
      // V62: Affichage de la liste des snapshots dans la modale
      // [Phase D] renderVersionList supprimé : remplacé par le journal d'actions enrichi

// ===== ONGLETS/CATÉGORIES MASQUÉS — délégué à UIHidden =====
      get hiddenTabs() { return UIHidden.hiddenTabs; },
      set hiddenTabs(v) { UIHidden.hiddenTabs = v; },
      get hiddenCategories() { return UIHidden.hiddenCategories; },
      set hiddenCategories(v) { UIHidden.hiddenCategories = v; },
      // ===== ONGLETS/CATÉGORIES MASQUÉS — délégué à UIHidden =====
      initHiddenTabs: (...a) => UIHidden.initHiddenTabs(...a),
      loadHiddenCategories: (...a) => UIHidden.loadHiddenCategories(...a),
      hideTab: (...a) => UIHidden.hideTab(...a),
      hideCategory: (...a) => UIHidden.hideCategory(...a),
      applyHiddenCategories: (...a) => UIHidden.applyHiddenCategories(...a),
      toggleHiddenCategoriesMenu: (...a) => UIHidden.toggleHiddenCategoriesMenu(...a),
      // UI.showTab retirée v569 : rien ne l'appelle, le menu réel utilise
      // app.UIHidden.showTab directement.
      applyHiddenTabs: (...a) => UIHidden.applyHiddenTabs(...a),
      // toggleHiddenTabsMenu retirée v569 : sa cible n'existe plus.

      // ============================================================
      // ===== OUVRIR UNE FICHE DEPUIS N'IMPORTE OU (7d) =====
      // ============================================================
      // Point d'entree unique : un element de depouillement, une ligne de
      // feuille de service ou une pastille de scene appelle openFiche(kind, id)
      // et la bonne fenetre s'ouvre, quel que soit l'onglet d'ou l'on vient.
      // Les fiches ne vivent pas toutes au meme endroit — personnages, comediens
      // et decors passent par CardModal.open(collection, index), l'equipe par
      // openCrew, les ressources par Resources.edit(id) — d'ou ce routage.
      // ON NE CHANGE PAS D'ONGLET : consulter une fiche depuis le depouillement
      // ne doit pas faire perdre sa place. CardModal construit sa carte dans un
      // conteneur temporaire, l'onglet proprietaire n'a pas besoin d'etre
      // affiche pour que la fenetre soit correcte.
      FICHE_TAB: { resource: 'resources', character: 'characters', actor: 'actors', crew: 'crew', location: 'locations' },
      openFiche: (kind, id) => {
          if(!kind || !id) return;
          // v601 — OUVRIR UNE FICHE, C'EST LA PRENDRE. Le verrou fin se prenait
          // quand le curseur entrait dans un champ : on pouvait donc ouvrir la
          // meme fiche a deux sans que rien ne s'allume, puisqu'on peut la lire
          // et la parcourir sans jamais poser le curseur. C'est l'OUVERTURE qui
          // marque l'intention, pas la frappe.
          // Le refus est pose APRES le controle d'acces ci-dessous : inutile de
          // reserver une fiche qu'on n'a pas le droit d'ouvrir.
          // GARDE UNIQUE (26 aout) : l'acces se verifie ICI, pour les onze
          // familles. Avant, seuls le jour, la depense et le plan etaient
          // controles — on pouvait ouvrir une fiche comedien depuis le
          // depouillement alors que l'onglet Comediens etait ferme (❌).
          if(typeof Permissions !== 'undefined' && Permissions.canOpenFiche && !Permissions.canOpenFiche(kind)) {
              const noms = { character: 'aux personnages', actor: 'aux comédiens', crew: "à l'équipe",
                             location: 'aux décors', resource: 'aux ressources', org: "à l'équipe",
                             vehicle: "à l'équipe", scene: 'au séquencier', day: 'au planning',
                             expense: 'aux dépenses', shot: 'au storyboard' };
              Utils.toast("Vous n'avez pas accès " + (noms[kind] || 'à cette section') + '.', 'error');
              return;
          }
          // v601 — ON PREVIENT AVANT D'ENTRER. Si quelqu'un d'autre tient la
          // fiche, on ne l'ouvre pas du tout : entrer pour decouvrir ensuite
          // qu'on ne peut rien enregistrer est la pire des deux solutions.
          try { if(typeof FicheLock !== 'undefined' && FicheLock.ouvrir(kind, id) === false) return; } catch(e) {}
          // ETAPE 8b / 8c (25 aout) — CINQ FAMILLES QUI N'AVAIENT PAS DE PORTE.
          // Elles sont traitees AVANT la resolution par FICHE_TAB : leur fenetre
          // ne vit pas dans une collection state.data ouverte par CardModal, et
          // ajouter 'day' ou 'expense' a FICHE_TAB casserait Expenses.linkLabel,
          // qui traite deja le jour en cas particulier.
          //   day      -> la feuille de service EST la fiche du jour (decision de
          //               Guillaume, coherente avec v565 : elle est l'editeur du
          //               jour depuis le retrait du pane Formulaire). Fabriquer un
          //               recapitulatif separe aurait recree un second ecran a
          //               tenir a jour pour les memes donnees.
          //   expense  -> la fenetre de depense existe deja et vit dans le HTML
          //               statique : elle s'ouvre de n'importe ou sans changer
          //               d'onglet. C'est le raccourci prevu en 8c (faire de la
          //               depense une CIBLE sans refaire sa fenetre).
          //   scene / org / vehicle -> fenetres existantes, jusqu'ici joignables
          //               seulement depuis leur propre ecran ou depuis la feuille
          //               de service.
          if(kind === 'day') {
              if(!(state.data.shootingDays || []).some(d => d && d.id === id)) { Utils.toast('Jour de tournage introuvable (supprimé depuis ?)', 'info'); return; }
              // GARDE : un jour deja ouvert porte des saisies non enregistrees dans
              // Planning.tempShootDay ; en ouvrir un autre les ecraserait en silence.
              const pm = document.getElementById('planning-modal');
              if(pm && pm.classList.contains('active')) {
                  if(Planning.editingDayId === id) return;
                  Utils.toast('Enregistre ou ferme le jour ouvert avant d\u2019en ouvrir un autre.', 'info');
                  return;
              }
              if(typeof Planning !== 'undefined' && Planning.editShootDay) Planning.editShootDay(id);
              return;
          }
          if(kind === 'expense') {
              if(!(state.data.expenses || []).some(e => e && e.id === id)) { Utils.toast('Dépense introuvable (supprimée depuis ?)', 'info'); return; }
              if(typeof Expenses !== 'undefined' && Expenses.editExpense) Expenses.editExpense(id);
              return;
          }
          if(kind === 'scene') {
              if(typeof CardModal !== 'undefined' && CardModal.openScene) CardModal.openScene(id);
              return;
          }
          if(kind === 'shot') {
              if(typeof CardModal !== 'undefined' && CardModal.openShot) CardModal.openShot(id);
              return;
          }
          if(kind === 'org') {
              const l = (typeof Orgs !== 'undefined' && Orgs._list) ? Orgs._list() : [];
              const i = l.findIndex(x => x && x.id === id);
              if(i < 0) { Utils.toast('Fiche introuvable (supprimée depuis ?)', 'info'); return; }
              Orgs.edit(i);
              return;
          }
          if(kind === 'vehicle') {
              const i = (state.data.vehicles || []).findIndex(v => v && v.id === id);
              if(i < 0) { Utils.toast('Véhicule introuvable (supprimé depuis ?)', 'info'); return; }
              if(typeof Crew !== 'undefined' && Crew.editVehicle) Crew.editVehicle(i);
              return;
          }
          const tab = UI.FICHE_TAB[kind];
          if(!tab) return;
          if(kind === 'resource') {
              if(!(state.data.resources || []).some(r => r.id === id)) { Utils.toast('Fiche introuvable', 'info'); return; }
              if(typeof Resources !== 'undefined' && Resources.edit) Resources.edit(id);
              return;
          }
          const idx = (state.data[tab] || []).findIndex(x => x && x.id === id);
          if(idx < 0) { Utils.toast('Fiche introuvable (supprimée depuis ?)', 'info'); return; }
          if(typeof CardModal === 'undefined') return;
          if(kind === 'crew') { if(CardModal.openCrew) CardModal.openCrew(idx); }
          else if(CardModal.open) CardModal.open(tab, idx);
      },

      // ============================================================
      // ===== NAVIGATION ONGLETS (cœur) =====
      // ============================================================
      switchTab: (tabName) => { 
    // v601 — LE SENS DE LA PAGE SUIT LE SENS DU DEPLACEMENT. Une page qui se
    // tourne toujours du meme cote quand on REVIENT en arriere sonne faux :
    // c'est le seul detail qui separe le geste d'un simple effet. On lit le
    // rang des deux onglets dans la barre AVANT de toucher aux classes, qui
    // sont justement ce qui nous dit d'ou l'on vient.
    let _sensPage = 1;
    try {
        const boutons = [...document.querySelectorAll('.tab-subbtn[data-tab], .tab-btn[data-tab]')]
            .filter(b => b.getClientRects && b.getClientRects().length > 0);
        const avant = boutons.findIndex(b => b.classList.contains('active'));
        const apres = boutons.findIndex(b => b.dataset.tab === tabName);
        if(avant >= 0 && apres >= 0 && apres < avant) _sensPage = -1;
    } catch(e) {}
    // Persister pour F5
    try { NavMemory.setTab(UI.currentCategory || null, tabName); } catch(e) {}
    
    // v570 : la carte onglet -> section vit desormais dans Permissions.SECTION_BY_TAB
    // (elle existait en double ici et dans WindowManager, deja desynchronisee :
    // il manquait 'presentation', 'moodboard', 'scriptreport' et 'contrats').
    const section = (typeof Permissions !== 'undefined') ? Permissions.sectionOf(tabName) : null;
    
    // Vérifier les permissions (sauf pour le propriétaire)
    if(state.currentRole !== 'owner' && section && !Permissions.canAccess(section)) {
        Utils.toast('Vous n\'avez pas accès à cette section.', 'error');
        return;
    }
    
    // Garde : onglet dont le contenu n'existe pas/plus (ex. memorise par NavMemory puis demoli) -> sortie silencieuse
    if(!document.getElementById('tab-' + tabName)) { console.warn('[UI] switchTab: onglet inconnu, ignore ->', tabName); return; }
    
    // Changer d'onglet ferme le panneau de commentaires (il appartient a l'onglet quitte).
    try { ScriptReview.close(); } catch(e) {}
    // LOT 4 : bulle « commentaires invites non vus » sur l'onglet Scenario.
    // Arriver sur le scenario eteint la bulle (marque vu) ; sinon on la reevalue.
    try { if(tabName === 'script') ScriptReview.markSeen('scenario'); else if(tabName === 'synopsis') ScriptReview.markSeen('synopsis'); else if(tabName === 'board') ScriptReview.markSeen('sequencier'); else if(tabName === 'storyboard') ScriptReview.markSeen('storyboard'); else if(tabName === 'moodboard') ScriptReview.markSeen('moodboard'); else ScriptReview.refreshBadge(); } catch(e) {}
    
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); 
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); 
    const _page = document.getElementById('tab-' + tabName);
    _page.classList.toggle('page-retour', _sensPage < 0);
    _page.classList.add('active'); 
    // v569 : ciblage par data-tab (fiable même après réorganisation par glisser-déposer),
    // remplace un ancien ciblage par position dans une liste figée et incomplète
    // (il manquait moodboard et scriptreport), qui aurait pu marquer le mauvais
    // bouton comme actif après un réordonnancement.
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    // Synchroniser avec le mode catégories si actif
    const tabsCategories = document.getElementById('tabsCategories');
    if(tabsCategories && tabsCategories.classList.contains('active')) {
        const category = UI.getCategoryForTab(tabName);
        if(category !== UI.currentCategory) {
            UI.currentCategory = category;
            document.querySelectorAll('.tab-category').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.category === category);
            });
            // Reconstruire la sous-nav (memes filtres que switchCategory : masques + episodes/saisons hors serie)
            const subnav = document.getElementById('tabsSubnav');
            const tabs = UI.categoryTabs[category] || [];
            const labels = UI.categoryLabels[category] || {};
            let visibleTabs = tabs.filter(t => !(UI.hiddenTabs || []).includes(t));
            if(state.currentProjectType !== 'series') visibleTabs = visibleTabs.filter(t => t !== 'episodes' && t !== 'seasons');
            subnav.innerHTML = visibleTabs.map(tab => {
                return `<button class="tab-subbtn${tab === tabName ? ' active' : ''}" data-tab="${tab}" onclick="app.UI.switchTab('${tab}')">${labels[tab] || tab}</button>`;
            }).join('');
            subnav.dataset.category = category;
            try { if(typeof LockManager !== 'undefined') LockManager.applyUI(); } catch(_) {}
        }
        // Mettre à jour le bouton actif dans la sous-nav
        document.querySelectorAll('.tab-subbtn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
    }
          
          if(tabName === 'board' || tabName === 'script') {
              els.quickNav.style.display = 'flex';
              document.body.classList.add('has-quicknav');
              UI.updateQuickNav();
          } else {
              els.quickNav.style.display = 'none';
              document.body.classList.remove('has-quicknav');
          }
          if(tabName === 'script') { ScriptEditor.initEpisodeSelector(); UI.renderScript(); } 
          if(tabName === 'board') { ScriptEditor.initEpisodeSelector(); UI.renderBoard(); } 
          if(tabName === 'chars') { Actions.syncCharacters(); Store.save(); UI.renderDataTab('characters', els.charContainer); } 
          if(tabName === 'actors') { UI.renderDataTab('actors', els.actorContainer); Actions.syncActorsFromPublicProfiles().then(() => UI.renderDataTab('actors', els.actorContainer)); } 
          if(tabName === 'locs') { Actions.syncLocations(); Store.save(); UI.renderDataTab('locations', els.locContainer); } 
          if(tabName === 'resources') { Resources.init(); }
          if(tabName === 'breakdown') { Crew.syncEssentialCrewToScenes(); Store.save(); Breakdown.init(); } 
          if(tabName === 'planning') { Planning.init(); Planning.applyPermissions(); }
          if(tabName === 'scriptreport') { ScriptReport.init(); }
          if(tabName === 'episodes') { Episodes.render(); }
          if(tabName === 'seasons') { Seasons.render(); }
          if(tabName === 'stats') Stats.render();
          if(tabName === 'titlepage') TitlePage.load(); 
          if(tabName === 'storyboard') Storyboard.init();
          if(tabName === 'moodboard') MoodBoard.init();
          if(tabName === 'crew') { UI.renderCrewTab(); Actions.syncCrewFromPublicProfiles().then(() => UI.renderCrewTab()); }
          if(tabName === 'expenses') Expenses.init();
          if(tabName === 'contracts') Contracts.renderTab();
          if(tabName === 'orgs') { Orgs.render(); Orgs.syncFromUniverse().then(() => Orgs.render()); }
          if(tabName === 'presentation') Presentation.init();
          if(typeof LockManager !== 'undefined') LockManager.onTabEnter(tabName);
          // v601 : les images de CET onglet se prechauffent en arrivant, plus
          // celles de tout le projet a l'ouverture (voir Utils.prechaufferOnglet).
          try { if(typeof Utils !== 'undefined' && Utils.prechaufferOnglet) Utils.prechaufferOnglet(tabName); } catch(e) {}
          // v570 : verrouillage visuel des champs si l'onglet n'est qu'en lecture (👁️).
          // Apres le rendu de l'onglet, sinon la banniere serait effacee par celui-ci.
          if(typeof Permissions !== 'undefined') Permissions.applyReadOnlyUI();
          Router.sync(true);
      },
      
      // ============================================================
      // ===== SÉQUENCIER : statut scènes, quick-nav, rendu board =====
      // ============================================================
      // Ouvre le menu déroulant pour changer le statut d'une scène
      toggleSceneStatus: (sceneId, event) => {
          if(state.currentRole === 'viewer') return;
          event.stopPropagation();
          
          // Fermer tout menu ouvert et le supprimer
          document.querySelectorAll('.scene-status-dropdown').forEach(d => d.remove());
          
          // Créer le dropdown dans le body pour éviter les problèmes d'overflow
          const rect = event.target.getBoundingClientRect();
          
          const dropdown = document.createElement('div');
          dropdown.className = 'scene-status-dropdown visible';
          dropdown.style.top = (rect.bottom + 5) + 'px';
          dropdown.style.left = rect.left + 'px';
          dropdown.innerHTML = `
              <div class="scene-status-option" onclick="event.stopPropagation(); app.UI.setSceneStatus('${sceneId}', 'not-verified')">
                  <span class="status-dot not-verified"></span> Non vérifié
              </div>
              <div class="scene-status-option" onclick="event.stopPropagation(); app.UI.setSceneStatus('${sceneId}', 'to-work')">
                  <span class="status-dot to-work"></span> À travailler
              </div>
              <div class="scene-status-option" onclick="event.stopPropagation(); app.UI.setSceneStatus('${sceneId}', 'verified')">
                  <span class="status-dot verified"></span> Vérifié
              </div>
          `;
          document.body.appendChild(dropdown);
          
          // Fermer au clic ailleurs
          setTimeout(() => {
              const closeHandler = (e) => {
                  if(!dropdown.contains(e.target)) {
                      dropdown.remove();
                      document.removeEventListener('click', closeHandler);
                  }
              };
              document.addEventListener('click', closeHandler);
          }, 10);
      },
      
      // Changer le statut d'une scène via menu
      setSceneStatus: (sceneId, status) => {
          if(state.currentRole === 'viewer') return;
          
          const scene = state.data.scenes.find(s => s.id === sceneId);
          if(!scene) return;
          
          scene.status = status;
          Store.save();
          
          // Supprimer le dropdown
          document.querySelectorAll('.scene-status-dropdown').forEach(d => d.remove());
          
          UI.renderScript();
          UI.renderBoard();
          Breakdown.init();
          Storyboard.renderScenesList();
          Storyboard.renderScenesList();
          
          const statusMessages = { 'not-verified': 'Non vérifié', 'to-work': 'À travailler', 'verified': 'Vérifié' };
          Utils.toast(`Scène : ${statusMessages[status]}`, 'success');
      },
      
      // Les deux boutons d'ordre sont eteints quand leur pile est vide : un
      // bouton actif qui ne fait rien est pire que pas de bouton.
      // Les deux vues (sequencier et beat board) ont chacune leur paire de
      // boutons, mais elles partagent les MEMES piles : un deplacement fait
      // dans une vue s'annule depuis l'autre.
      updateSceneOrderButtons: () => {
          const set = (id, vide) => {
              const b = document.getElementById(id);
              if(!b) return;
              b.disabled = vide;
              b.style.opacity = vide ? '0.4' : '1';
              b.style.cursor = vide ? 'default' : 'pointer';
          };
          set('btn-order-undo', !Actions.orderUndo.length);
          set('btn-order-redo', !Actions.orderRedo.length);
          set('btn-order-undo-bb', !Actions.orderUndo.length);
          set('btn-order-redo-bb', !Actions.orderRedo.length);
      },
      
      updateQuickNav: () => {
          els.quickNav.innerHTML = '';
          state.data.scenes.forEach((s, i) => {
              const a = document.createElement('div');
              a.className = 'qn-link';
              a.innerText = (i + 1);
              a.title = s.title;
              // UX-2 : drag-and-drop des scènes entièrement dans la quick-nav (chaque .qn-link est draggable + target de drop)
              if(state.currentRole !== 'viewer') {
                  a.draggable = true;
                  a.addEventListener('dragstart', (e) => {
                      ScriptEditor.draggedSceneId = s.id;
                      e.dataTransfer.effectAllowed = 'move';
                      a.classList.add('dragging');
                      ScriptEditorContinuous.startAutoScroll();
                  });
                  a.addEventListener('dragend', () => {
                      a.classList.remove('dragging');
                      ScriptEditor.draggedSceneId = null;
                      ScriptEditorContinuous.stopAutoScroll();
                      document.querySelectorAll('.qn-link.drag-over').forEach(el => el.classList.remove('drag-over'));
                  });
                  // Cible de drop : drop sur ce numéro = la scène draguée prend cette place
                  a.addEventListener('dragover', (e) => {
                      e.preventDefault();
                      if(ScriptEditor.draggedSceneId && ScriptEditor.draggedSceneId !== s.id) {
                          a.classList.add('drag-over');
                      }
                  });
                  a.addEventListener('dragleave', () => a.classList.remove('drag-over'));
                  a.addEventListener('drop', (e) => {
                      e.preventDefault();
                      a.classList.remove('drag-over');
                      if(ScriptEditor.draggedSceneId && ScriptEditor.draggedSceneId !== s.id) {
                          ScriptEditorContinuous.reorderSceneContinuous(ScriptEditor.draggedSceneId, s.id);
                      }
                  });
              }
              a.onclick = () => {
                  const activeTab = document.querySelector('.tab-content.active').id;
                  if(activeTab === 'tab-script') {
                      const el = document.querySelector(`.script-continuous-scene[data-scene-id="${s.id}"]`);
                      if(el) {
                          el.scrollIntoView({behavior: "smooth", block: "start"});
                          ScriptEditor.setActiveScene(s.id, i);
                      }
                  } else if (activeTab === 'tab-board') {
                       const el = document.querySelector(`.card[data-id="${s.id}"]`);
                       if(el) el.scrollIntoView({behavior: "smooth", block: "center"});
                  }
              };
              els.quickNav.appendChild(a);
          });
      },
      
      // ===================== RENDU, MODALES & DIVERS =====================
      renderBoard: () => { 
          els.boardList.innerHTML = ''; 
          els.boardList.className = 'seq-grid';
          const isView = state.currentRole === 'viewer'; 
          // S4 : filtrer par épisode actif pour les séries
          const scenesToRender = UI.getScenesForCurrentView();
          // FORMAT BEAT BOARD (26 aout). Le sequencier et le beat board
          // montraient la meme chose de deux facons differentes ; ils partagent
          // desormais le meme dessin de carte (bandeau de couleur du tag, pastille
          // du numero, titre, personnages, resume, statut). Seule difference :
          // ici les cartes sont rangees en grille, la-bas elles sont posees
          // librement sur un canvas.
          scenesToRender.forEach((s, idx) => { 
              const el = document.createElement('div'); 
              const isFinal = s.isFinal === true;
              el.className = 'card seq-card ' + (isFinal ? 'is-final' : 'is-draft'); 
              el.draggable = !isView; el.dataset.id = s.id; el.dataset.sceneId = s.id; 
              const tag = state.data.tags.find(t => t.id === s.tag_id) || {name:'', color: 'transparent'}; 
              const status = s.status || 'not-verified';
              // Infobulle : le RESUME seul. Le titre, les personnages et la
              // duree sont deja lisibles sur la carte ; les repeter au survol
              // n'apportait rien et noyait la seule chose qui manque vraiment,
              // le resume coupe a trois lignes.
              el.title = s.resume || '';
              const actions = isView ? '' : `<div class="compact-card-actions">
                    <button class="merge-btn" onclick="event.stopPropagation(); app.ScriptReview.open('${s.id}')" title="Commentaires">💬</button>
                    <button class="edit-btn" onclick="event.stopPropagation(); app.Actions.${isFinal ? 'unfinalizeScene' : 'finalizeScene'}('${s.id}')" title="${isFinal ? 'Repasser en brouillon' : 'Finaliser'}">${isFinal ? '📝' : '✅'}</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.Actions.deleteScene('${s.id}')" title="Supprimer">🗑️</button>
                </div>`; 
              el.innerHTML = `
                  <div class="beatboard-card-tag" style="background: ${tag.color !== 'transparent' ? tag.color : 'var(--border)'}"></div>
                  <div class="beatboard-card-number">${UI.formatSceneNumber(s, idx)}</div>
                  ${actions}
                  <div class="beatboard-card-title">${Utils.escape(s.title)}</div>
                  <div class="beatboard-card-meta">${Utils.escape(s.perso || '-')} • ${s.time || '?'} min</div>
                  <div class="beatboard-card-resume">${Utils.escape(s.resume || '')}</div>
                  <div class="seq-card-badges">
                      <span class="scene-status-badge ${isFinal ? 'final' : 'draft'}">${isFinal ? '✅ Finale' : '📝 Brouillon'}</span>
                      <span class="scene-status-badge ${status}" onclick="event.stopPropagation(); app.UI.toggleSceneStatus('${s.id}', event)">${SCENE_STATUS_LABELS[status]}</span>
                      <span class="comment-badge d-none" data-scene="${s.id}" onclick="event.stopPropagation(); app.ScriptReview.open('${s.id}')" title="Commentaires">0</span>
                  </div>`; 
              if(!isView) el.addEventListener('click', () => UI.openFiche('scene', s.id));
              else el.style.cursor = 'default';
              if(!isView) { 
                  el.addEventListener('contextmenu', (e) => Actions.openTagMenu(e, s.id)); 
                  el.addEventListener('dragstart', ()=>{ el.classList.add('dragging'); els.boardList._seqDropTarget = undefined; }); 
                  el.addEventListener('dragend', ()=>{
                      // v596 : la carte glissée n'a pas bougé pendant le survol —
                      // on la place maintenant réellement à l'emplacement du
                      // fantôme, qui matérialisait où elle allait atterrir.
                      const placeholder = els.boardList.querySelector('.seq-drop-placeholder');
                      if(placeholder) {
                          els.boardList.insertBefore(el, placeholder);
                          placeholder.remove();
                      }
                      el.classList.remove('dragging');
                      Actions.updateOrder('board');
                  }); 
              } 
              els.boardList.appendChild(el); 
          }); 
          UI.updateQuickNav();
          Comments.updateAllBadges();
          UI.updateSceneOrderButtons();
      },
      
      // ===== IMPRESSION SÉQUENCIER — délégué à UIPrint =====
      printBoard: (...a) => UIPrint.printBoard(...a),
      printChars: (...a) => UIPrint.printChars(...a),
      printActors: (...a) => UIPrint.printActors(...a),
      printLocations: (...a) => UIPrint.printLocations(...a),
      printStats: (...a) => UIPrint.printStats(...a),
      
      // ===== MODALE GÉNÉRIQUE pour formulaires custom (Resources, etc.) =====
      // Usage : UI.showModal({ title, html, confirmText, onConfirm })
      // - title : titre affiché en haut
      // - html : contenu HTML du formulaire (string)
      // - confirmText : texte du bouton de validation (défaut "OK")
      // - cancelText : texte du bouton de gauche (défaut "Annuler")
      // - onConfirm : callback exécuté au clic OK ; si retourne false, la modale ne se ferme pas
      showModal: (opts) => {
          opts = opts || {};
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:560px;width:90%;padding:24px;max-height:85vh;display:flex;flex-direction:column;">
              <div style="font-size:1.1rem;font-weight:bold;margin-bottom:16px;flex-shrink:0;">${opts.title || ''}</div>
              <div style="overflow-y:auto;flex:1;text-align:left;padding-right:4px;">${opts.html || ''}</div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-shrink:0;border-top:1px solid var(--border);padding-top:12px;">
                  <button class="confirm-modal-btn cancel" id="um-cancel" style="margin:0;">${opts.cancelText || 'Annuler'}</button>
                  <button class="confirm-modal-btn confirm" id="um-ok" style="margin:0;">${opts.confirmText || 'OK'}</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.querySelector('#um-cancel').onclick = () => overlay.remove();
          overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
          overlay.querySelector('#um-ok').onclick = async () => {
              if(typeof opts.onConfirm === 'function') {
                  const result = await opts.onConfirm();
                  if(result === false) return; // permettre d'annuler la fermeture si validation échoue
              }
              overlay.remove();
          };
          return overlay;
      },
      
      // ============================================================
      // ===== SCÉNARIO : scope scènes, numérotation, rendu script =====
      // ============================================================
      // S4 : retourne les scènes à afficher selon l'épisode actif (ou toutes si projet film)
      getScenesForCurrentView: () => {
          const allScenes = state.data.scenes || [];
          // Pour les films : toutes les scènes
          if(state.currentProjectType !== 'series') return allScenes;
          // Pour les séries : scènes de l'épisode actif uniquement (+ legacy sans episodeId = visibles partout ? non, invisibles)
          if(!state.currentEpisodeId) return allScenes; // Sécurité
          return allScenes.filter(s => s.episodeId === state.currentEpisodeId);
      },
      
      // S7 : formate le numéro d'une scène selon le type de projet
      // idx = index dans le tableau filtré (commence à 0)
      // - Film : "#17"
      // - Série : "S01E03-SC05"
      // ============================================================
      // ===== SCENES D'UNE FICHE (7d) =====
      // ============================================================
      // Repond a "ou apparait cette fiche ?" pour les cinq familles, a partir
      // du depouillement par IDENTIFIANT. Trois sections separees existaient,
      // chacune avec sa propre source : les personnages lisaient scene.perso
      // (du texte libre), les decors devinaient le lieu en analysant le titre de
      // la scene, les comediens lisaient le depouillement. Resultat, trois
      // reponses differentes a la meme question. Tout passe maintenant par le
      // lien ; le texte ne sert que de repli pour les elements pas encore
      // rattaches a une fiche.
      // Le COMEDIEN est le cas particulier demande : il herite des scenes de
      // son personnage, car dépouiller "MARIE" doit convoquer la comedienne qui
      // la joue meme si son nom a elle n'apparait nulle part dans le scenario.
      scenesForFiche: (kind, id) => {
          if(!kind || !id) return [];
          const all = state.data.scenes || [];
          const fiche = (typeof Links !== 'undefined') ? Links.record(kind, id) : null;
          if(!fiche) return [];
          const nm = String(fiche.name || '').trim().toLowerCase();
          // Categories a fouiller selon la famille visee.
          const cats = ({
              resource:  ['ACCESSOIRES', 'COSTUMES', 'VEHICULES'],
              character: ['PERSONNAGES'],
              actor:     ['COMEDIENS', 'FIGURATION'],
              crew:      ['TECHNICIENS'],
              location:  ['DECORS-LIEUX'],
              // Deux familles ouvertes au depouillement le 26 aout : le vehicule
              // de regie et la structure prestataire.
              vehicle:   ['VEHICULES', 'LOGISTIQUE'],
              org:       ['LOGISTIQUE', 'DECORS-LIEUX']
          })[kind] || [];
          // Pour un comedien, les personnages qu'il interprete comptent aussi.
          const charIds = (kind === 'actor')
              ? (state.data.characters || []).filter(c => c.actor_id === id).map(c => c.id)
              : [];
          const charNames = (kind === 'actor')
              ? (state.data.characters || []).filter(c => c.actor_id === id).map(c => String(c.name || '').trim().toLowerCase())
              : [];
          const hitsIn = (arr, wantId, wantNames) => (arr || []).some(it => {
              const iid = Utils.bdId(it);
              if(iid) return wantId.includes(iid);
              return wantNames.includes(Utils.bdText(it).trim().toLowerCase());
          });
          return all.filter(s => {
              // v580 : les liens par identifiant portes par la scene comptent
              // toujours, qu'elle soit depouillee ou non.
              if(kind === 'character' && Array.isArray(s.persoIds) && s.persoIds.includes(id)) return true;
              if(kind === 'location' && s.locationId === id) return true;
              if(kind === 'actor' && charIds.length && Array.isArray(s.persoIds) && s.persoIds.some(x => charIds.includes(x))) return true;
              if(!s.breakdown) {
                  // Repli pour une scene jamais depouillee : le champ perso du
                  // sequencier reste la seule trace des personnages.
                  if(kind === 'character' && s.perso) {
                      return s.perso.split(/[,;]/).map(n => n.trim().toLowerCase()).includes(nm);
                  }
                  return false;
              }
              for(const c of cats) {
                  if(hitsIn(s.breakdown[c], [id], [nm])) return true;
              }
              if(kind === 'actor' && (charIds.length || charNames.length)) {
                  if(hitsIn(s.breakdown['PERSONNAGES'], charIds, charNames)) return true;
              }
              if(kind === 'character') {
                  // Le lien par identifiant est deja teste en tete du filtre ;
                  // ne reste que le repli par nom.
                  if(s.perso && s.perso.split(/[,;]/).map(n => n.trim().toLowerCase()).includes(nm)) return true;
              }
              return false;
          });
      },
      
      // Bloc HTML "apparait dans", partage par toutes les fiches. Chaque pastille
      // ouvre la scene concernee : c'est la contrepartie de la navigation vers
      // les fiches depuis le depouillement, dans l'autre sens.
      // Bloc « Depenses liees » d'une fiche, en LECTURE SEULE : la fiche ne modifie
      // aucune depense, elle en rend compte. Rien ne s'affiche si la personne n'a
      // pas acces a la section Depenses -- un invite restreint ouvrant une fiche
      // accessoire n'a pas a decouvrir les montants du projet.
      renderCost: (kind, id) => {
          if(!kind || !id) return '';
          if(typeof Expenses === 'undefined' || !Expenses.linkedExpenses) return '';
          if(typeof Permissions !== 'undefined' && Permissions.canAccess && state.currentRole !== 'owner') {
              if(!Permissions.canAccess('depenses')) return '';
          }
          // Passe par le socle (voir renderAppearances). Le TOTAL, lui, reste
          // calcule par Expenses.linkedTotal : c'est une somme d'argent, elle
          // suit le mode TVA du projet, et l'onglet Depenses doit annoncer le
          // meme chiffre. Deux additions independantes finiraient par
          // diverger, exactement ce que le socle cherche a empecher.
          const list = (typeof Links !== 'undefined' && Links.recordsOfKind)
              ? Links.recordsOfKind(kind, id, 'expense')
              : Expenses.linkedExpenses(kind, id);
          if(!list.length) return '';
          const cur = state.data.budget?.currency || '€';
          const mode = (state.data.budget?.vatMode || 'HT');
          const total = Expenses.linkedTotal(kind, id);
          // Une depense de scene ne pese que sur le PREMIER jour ou la scene est
          // programmee. Quand elle est etalee, on le dit : sans cela on
          // chercherait pourquoi le jour 2 n'affiche rien.
          let note = '';
          if(kind === 'scene' && Expenses.dayCountOfScene) {
              const n = Expenses.dayCountOfScene(id);
              if(n === 0) note = '<div style="font-size:0.75rem; color:var(--text-sec); margin-top:4px;">Cette scène n\'est programmée sur aucun jour daté : ces dépenses n\'apparaissent pas encore dans le coût par jour.</div>';
              else if(n > 1) note = '<div style="font-size:0.75rem; color:var(--text-sec); margin-top:4px;">Scène étalée sur ' + n + ' jours : ces dépenses sont comptées une seule fois, sur le premier.</div>';
          }
          // 8c : la depense est desormais une CIBLE de lien comme une autre. Ces
          // etiquettes etaient purement decoratives : on lisait « caution studio
          // 250 EUR » sur la fiche sans pouvoir ouvrir la depense pour voir la
          // facture. Le clic passe par UI.openFiche, qui reverifie l'existence et
          // la permission avant d'ouvrir.
          const tags = list.map(e => {
              const t = Utils.escape(String(e.title || 'Dépense'));
              const eid = Utils.escape(String(e.id || ''));
              if(!eid) return `<span class="appearance-tag" title="${t}">${t}</span>`;
              return `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('expense', '${eid}')" title="Ouvrir la dépense : ${t}">${t}</span>`;
          }).join(' ');
          return `<div class="appearances-section">
                        <span class="appearances-label">💶 Dépenses liées (${list.length}) : ${total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur} ${mode} —</span>
                        ${tags}
                        ${note}
                    </div>`;
      },
      
      // ===== JOURS DE TOURNAGE D'UNE FICHE (8b) =====
      // Le jour existait uniquement dans le planning : une fiche de comedien
      // disait dans quelles SCENES il jouait, jamais QUELS JOURS il etait
      // convoque, alors que c'est la premiere question qu'on pose a une fiche.
      // Trois familles seulement ont une reponse fiable : comedien et technicien
      // par la feuille de convocation du jour, decor par le lien locationId.
      // Aucune deduction : on ne remonte pas un jour parce qu'une scene du jour
      // contient l'accessoire — ce serait recreer la reventilation ecartee cote
      // depenses. Rien ne s'affiche a qui n'a pas acces au planning.
      shootDaysForFiche: (kind, id) => {
          if(!id) return [];
          const days = state.data.shootingDays || [];
          if(kind === 'location') return days.filter(d => d && d.locationId === id);
          if(kind === 'actor' || kind === 'crew') {
              const want = kind === 'actor' ? 'actor' : 'crew';
              return days.filter(d => d && Array.isArray(d.callSheet)
                  && d.callSheet.some(c => c && c.type === want && c.personId === id));
          }
          return [];
      },
      renderShootDays: (kind, id, label) => {
          if(typeof Permissions !== 'undefined' && Permissions.canAccess && state.currentRole !== 'owner') {
              if(!Permissions.canAccess('planning')) return '';
          }
          // Passe par le socle (voir renderAppearances). La garde de
          // permission ci-dessus reste ici : le socle ne filtre pas les droits.
          const days = (typeof Links !== 'undefined' && Links.recordsOfKind)
              ? Links.recordsOfKind(kind, id, 'day')
              : UI.shootDaysForFiche(kind, id);
          if(!days.length) return '';
          const all = state.data.shootingDays || [];
          const tags = days.map(d => {
              const n = Planning.dayLabel(d);
              const dt = d.date || d.startDate || '';
              const t = Utils.escape(dt ? (n + ' — ' + dt) : n);
              return `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('day', '${Utils.escape(String(d.id))}')" title="Ouvrir la feuille de service : ${t}">${t}</span>`;
          }).join(' ');
          return `<div class="appearances-section">
                        <span class="appearances-label">${label} (${days.length}) :</span>
                        ${tags}
                    </div>`;
      },
      
      // Bloc « Prete au tournage » (1er septembre) — LE SEUL SENS DE LECTURE
      // QUE LE SOCLE CONNAISSAIT ET QU'AUCUNE FICHE N'AFFICHAIT. La fiche
      // d'une ressource dit a qui elle appartient, mais la reciproque
      // n'existait nulle part : impossible de savoir, en ouvrant la fiche de
      // Sami, qu'il apporte son propre trepied et deux objectifs. C'est
      // pourtant l'information qu'on cherche la veille du tournage.
      // Rien d'invente ici : la donnee vit deja dans resource.owner, elle
      // n'etait simplement lue que dans un sens.
      // Passe par Links.neighbors et non par recordsOfKind, parce qu'on veut
      // filtrer sur la RELATION (proprietaire) et pas seulement sur la
      // famille — un comedien peut etre relie a une ressource pour une autre
      // raison un jour, elle n'aurait rien a faire dans ce bloc.
      renderLent: (kind, id) => {
          if(kind !== 'actor' && kind !== 'crew') return '';
          if(typeof Links === 'undefined' || !Links.neighbors) return '';
          // Meme regle que les deux autres blocs : qui n'a pas acces aux
          // ressources ne decouvre pas leur existence en ouvrant une fiche.
          if(typeof Permissions !== 'undefined' && Permissions.canAccess && state.currentRole !== 'owner') {
              if(!Permissions.canAccess('ressources')) return '';
          }
          const prets = Links.neighbors(kind, id)
              .filter(n => n.kind === 'resource' && n.linked && (n.rel || []).indexOf('proprietaire') >= 0);
          if(!prets.length) return '';
          const tags = prets.map(n => {
              const t = Utils.escape(String(n.label || ''));
              return `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('resource', '${Utils.escape(String(n.id))}')" title="Ouvrir la fiche : ${t}">${t}</span>`;
          }).join(' ');
          return `<div class="appearances-section">
                        <span class="appearances-label">📦 Prête au tournage (${prets.length}) :</span>
                        ${tags}
                    </div>`;
      },
      
      renderAppearances: (kind, id, label, emptyLabel) => {
          // 1er septembre — passe par le socle (Links.recordsOfKind) au lieu
          // d'appeler UI.scenesForFiche directement. Meme resultat, meme
          // ordre : le socle delegue a cette lecture-la. Repli conserve si
          // Links n'est pas encore defini a l'appel.
          const scenes = (typeof Links !== 'undefined' && Links.recordsOfKind)
              ? Links.recordsOfKind(kind, id, 'scene')
              : UI.scenesForFiche(kind, id);
          if(!scenes.length) {
              return `<div class="appearances-section">
                        <span class="appearances-label" style="font-style:italic;">${Utils.escape(emptyLabel || 'Aucune scène')}</span>
                    </div>`;
          }
          const all = state.data.scenes || [];
          const isSeries = state.currentProjectType === 'series';
          const tags = scenes.map(s => {
              let lbl;
              if(isSeries) {
                  const ep = (state.data.episodes || []).find(e => e.id === s.episodeId);
                  if(ep) {
                      const scenesInEp = all.filter(x => x.episodeId === ep.id);
                      lbl = UI.formatSceneNumber(s, scenesInEp.indexOf(s));
                  } else { lbl = '#' + (all.indexOf(s) + 1); }
              } else { lbl = '#' + (all.indexOf(s) + 1); }
              const t = s.title ? String(s.title).slice(0, 60) : '';
              return `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('scene', '${s.id}')" title="${Utils.escape(t)}">${lbl}</span>`;
          }).join(' ');
          return `<div class="appearances-section">
                        <span class="appearances-label">${label} (${scenes.length}) :</span>
                        ${tags}
                    </div>`;
      },
      
      formatSceneNumber: (scene, idx) => {
          const sceneNum = String(idx + 1).padStart(2, '0');
          if(state.currentProjectType !== 'series') {
              return '#' + (idx + 1);
          }
          // Retrouver l'épisode et la saison de la scène
          const ep = (state.data.episodes || []).find(e => e.id === scene.episodeId);
          if(!ep) return '#' + (idx + 1); // fallback scène orpheline
          const season = (state.data.seasons || []).find(s => s.id === ep.seasonId);
          const seasonNum = season ? String(season.number).padStart(2, '0') : '00';
          const epNum = String(ep.number).padStart(2, '0');
          return `S${seasonNum}E${epNum}-SC${sceneNum}`;
      },
      
      renderScript: () => { 
          // v619 : Vue Scènes retirée. On ne construit plus la liste de cartes
          // .script-row (gain de perf au passage : ça reconstruisait tout un
          // DOM jamais affiché à chaque sauvegarde, même pour qui ne l'a
          // jamais ouverte).
          ScriptEditor.renderContinuous();
          // Le compteur se recalcule a chaque rendu du scenario : ajouter,
          // supprimer ou etoffer une scene le fait bouger immediatement.
          if(typeof ScriptEditor !== 'undefined' && ScriptEditor.updateCount) ScriptEditor.updateCount();
          UI.updateQuickNav();
          Comments.updateAllBadges();
          if(typeof RenameReview !== 'undefined') RenameReview.paint();
      },
      
      // ===== RENDU ONGLETS DATA (persos/lieux/équipes) — délégué à UIData =====
      renderDataTab: (...a) => UIData.renderDataTab(...a),
      renderCrewTab: (...a) => UIData.renderCrewTab(...a),
      renderDataCards: (...a) => UIData.renderDataCards(...a),
      createCrewCard: (...a) => UIData.createCrewCard(...a),
      handleDragOver: (...a) => UIData.handleDragOver(...a),
      goToStoryboard: (...a) => UIData.goToStoryboard(...a),
      
      // ===== PERMISSIONS / VISIBILITÉ SECTIONS =====
      // Vérifie si une section est visible pour un profil dans le contexte projet
      isSectionVisibleForProject: (item, section) => {
          if(!item || !item.hiddenProject) return true;
          return !item.hiddenProject.includes(section);
      }
  };
  
 const Actions = {
      // ===================== SCÈNES =====================
      openShareModal: () => { if(!Permissions.canEdit('presentation')) return Utils.toast("Vous n'avez pas l'autorisation d'inviter sur ce projet (il faut pouvoir modifier la fiche projet).", "warning"); els.shareModal.style.display = 'flex'; },
      
      // V62: NOUVELLE GESTION DES VERSIONS
      // [Phase D] Fonctions snapshot (openVersionModal, createManualSnapshot, createAutoSnapshot,
      // shouldAutoSnapshot, restoreSnapshot, deleteSnapshot) supprimées : 
      // remplacées par le journal d'actions enrichi (state.data.history avec recoverable)

      // CREATION D'UNE SCENE (refonte du 26 aout).
      // Avant : la fonction lisait six champs d'un formulaire, servait A LA FOIS
      // a creer et a modifier (selon state.currentEditingId), et deplacait ce
      // formulaire dans le DOM. Elle ne fait plus qu'une chose : creer une scene
      // vide et ouvrir sa fiche. La modification passe par la fiche, au fil de
      // l'eau, comme partout ailleurs.
      // CE QUI EST CONSERVE : le pre-remplissage du depouillement avec les
      // techniciens des postes essentiels (Image, Realisation, Son), qui evite
      // de les ressaisir sur chaque scene.
      addScene: () => { 
          if(state.currentRole === 'viewer') return; 
          
          const initialBreakdown = { 'TECHNICIENS': [] };
          const essentialGroups = ['gc1', 'gc3', 'gc4']; // Image, Réalisation, Son
          essentialGroups.forEach(groupId => {
              (state.data.crew || []).filter(c => c.group_id === groupId).forEach(member => {
                  if(!member || !member.name) return;
                  if(!initialBreakdown['TECHNICIENS'].some(it => Utils.bdId(it) === member.id || Utils.bdSameText(it, member.name))) {
                      initialBreakdown['TECHNICIENS'].push(Utils.bdItem(member.name, 'TECHNICIENS', member.id));
                  }
              });
          });
          
          const scene = {
              id: Utils.generateUniqueId(),
              title: 'EXT. LIEU - JOUR',
              perso: '', time: '', chrono: '', resume: '',
              persoIds: [], locationId: null,
              scriptContent: "<div class='sc-action'><br></div>",
              breakdown: initialBreakdown,
              tag_id: 't1',
              lastModified: Date.now(),
              lastModifiedBy: state.currentUser.email,
              episodeId: (state.currentProjectType === 'series' ? (state.currentEpisodeId || null) : null)
          };
          
          state.data.scenes.push(scene);
          History.log('ADD', `Ajout scène : ${scene.title}`);
          Store.save();
          UI.renderBoard();
          UI.renderScript();
          if(typeof Breakdown !== 'undefined' && Breakdown.init) { try { Breakdown.init(); } catch(e) {} }
          // La fiche s'ouvre sur une scene deja enregistree : c'est ce qui
          // permet l'ecriture au fil de l'eau, sans bouton « Ajouter ».
          UI.openFiche('scene', scene.id);
      },
      
      // editScene ne remplit plus un formulaire : elle ouvre la fiche. Elle est
      // conservee parce que d'autres ecrans l'appellent encore par ce nom.
      editScene: (id) => { 
          if(state.currentRole === 'viewer') return; 
          UI.openFiche('scene', id);
      },
      
      finalizeScene: async (id) => {
          if(state.currentRole === 'viewer') return;
          const scene = state.data.scenes.find(s => s.id === id);
          if(!scene) return;
          
          const confirmed = await ConfirmModal.show({
              title: '✅ Finaliser cette scène ?',
              message: `Le texte de "${Utils.escape(scene.title)}" sera considéré comme définitif et vous pourrez commencer le dépouillement.\n\nVous pourrez toujours repasser en brouillon plus tard (le dépouillement sera réinitialisé).`,
              icon: '✅',
              confirmText: 'Finaliser'
          });
          
          if(confirmed) {
              scene.isFinal = true;
              scene.finalizedAt = new Date().toISOString();
              scene.finalizedBy = state.currentUser?.email || 'Inconnu';
              Store.save();
              UI.renderBoard();
              UI.renderScript();
              Breakdown.init();
              // [Phase D - Bug 3] Refresh du storyboard si on est dessus et que la scène concernée est sélectionnée
              if(typeof Storyboard !== 'undefined' && Storyboard.currentSceneId === id) {
                  Storyboard.renderShots();
              }
              if(typeof Storyboard !== 'undefined' && Storyboard.renderScenesList) {
                  Storyboard.renderScenesList();
              }
              Utils.toast(`"${scene.title}" est maintenant finale`, 'success');
          }
      },
      
      unfinalizeScene: async (id) => {
          if(state.currentRole === 'viewer') return;
          const scene = state.data.scenes.find(s => s.id === id);
          if(!scene) return;
          
          // Vérifier si la scène a un dépouillement
          const hasBreakdown = scene.breakdown && Object.values(scene.breakdown).some(arr => arr && arr.length > 0);
          const breakdownCount = hasBreakdown ? Object.values(scene.breakdown).flat().length : 0;
          
          // UX-3 — Étape 1 : confirmation simple "repasser en brouillon ?"
          const confirmed = await ConfirmModal.show({
              title: '📝 Repasser en brouillon ?',
              message: `"${Utils.escape(scene.title)}" repassera en mode brouillon. Vous pourrez à nouveau modifier le texte.`,
              icon: '📝',
              confirmText: 'Repasser en brouillon'
          });
          
          if(!confirmed) return;
          
          // UX-3 — Étape 2 : si dépouillement existe, demander s'il faut le supprimer
          let resetBreakdown = false;
          if(hasBreakdown) {
              resetBreakdown = await ConfirmModal.show({
                  title: '🗂️ Annuler le dépouillement ?',
                  message: `Cette scène a un dépouillement (${breakdownCount} éléments). Voulez-vous le supprimer ?\n\nGarder le dépouillement permet de conserver le travail déjà fait, mais il peut devenir incohérent si vous modifiez beaucoup le texte.`,
                  icon: '🗂️',
                  dangerous: true,
                  confirmText: 'Supprimer le dépouillement',
                  cancelText: 'Garder le dépouillement'
              });
          }
          
          // Application des changements
          scene.isFinal = false;
          
          if(resetBreakdown) {
              scene.breakdown = {};
              Utils.toast('Dépouillement supprimé', 'info');
          }
          
          // [Phase D - Bug 3] Refresh storyboard si on est dessus
          if(typeof Storyboard !== 'undefined' && Storyboard.currentSceneId === id) {
              Storyboard.renderShots();
          }
          if(typeof Storyboard !== 'undefined' && Storyboard.renderScenesList) {
              Storyboard.renderScenesList();
          }
          
          Store.save();
          UI.renderBoard();
          UI.renderScript();
          Breakdown.init();
          Utils.toast(`"${scene.title}" est maintenant en brouillon`, 'success');
      },
      
      deleteScene: async (id) => { 
          if(state.currentRole==='viewer') return; 
          // v601 — LE SEUL CAS DE PERTE QUI RESTAIT. Supprimer une scene passe par
          // la sauvegarde COMPLETE (tout le tableau), qui ne passe donc pas par le
          // refus pose sur saveScene. Sans ce test, quelqu'un pouvait effacer la
          // scene qu'un autre est en train d'ecrire, et le texte partait avec.
          if(typeof SceneLock !== 'undefined' && !SceneLock.peutEcrire(id)) {
              const q = SceneLock.qui(id);
              Utils.toast('Impossible : ' + (q || 'quelqu\'un') + ' écrit cette scène en ce moment. Réessayez dans un instant.', 'warning', 8000);
              return;
          }
          const sceneToDelete = state.data.scenes.find(s => s.id === id || String(s.id) === String(id));
          if(!sceneToDelete) return;
          
          // Vérifier si la scène est dans une feuille de service
          const affectedDays = (state.data.shootingDays || []).filter(day => 
              day.scenes && day.scenes.some(ref => ref.sceneId === id || String(ref.sceneId) === String(id))
          );
          
          let confirmMessage = 'Supprimer cette scène ?';
          if(affectedDays.length > 0) {
              const dayNames = affectedDays.map(d => d.name || Utils.formatDate(d.date || d.startDate)).join(', ');
              confirmMessage = `⚠️ ATTENTION !\n\nCette scène est programmée dans ${affectedDays.length} jour(s) de tournage :\n${dayNames}\n\nLa scène sera automatiquement retirée de ces feuilles de service.\n\nVoulez-vous vraiment supprimer cette scène ?`;
          }
          
          if(await ConfirmModal.show({ title: 'Supprimer cette scène ?', message: confirmMessage, icon: '🗑️', dangerous: true, confirmText: 'Supprimer' })){ 
              // [Phase D] Capturer les shots associés AVANT la cascade de suppression
              const associatedShots = (state.data.shots || []).filter(shot => 
                  shot.sceneId === id || String(shot.sceneId) === String(id)
              );
              
              // 1. Supprimer les plans storyboard associés
              if(state.data.shots) {
                  state.data.shots = state.data.shots.filter(shot => shot.sceneId !== id && String(shot.sceneId) !== String(id));
              }
              
              // 2. Retirer la scène du planning (journées de tournage)
              if(state.data.shootingDays) {
                  state.data.shootingDays.forEach(day => {
                      if(day.scenes) {
                          day.scenes = day.scenes.filter(ref => ref.sceneId !== id && String(ref.sceneId) !== String(id));
                      }
                  });
                  // Supprimer les jours de tournage vides — v602 : seulement pour
                  // qui a le droit de supprimer une journee (sinon la base
                  // refuserait TOUT l'enregistrement). Pour les autres, la
                  // journee reste, vide, et l'assistant·e la retirera.
                  if(Planning.peutSupprimerJour()) {
                      state.data.shootingDays = state.data.shootingDays.filter(day => day.scenes && day.scenes.length > 0);
                  }
              }
              
              // 3. Supprimer les commentaires (stockés dans data.comments)
              if(state.data.comments && state.data.comments[id]) {
                  delete state.data.comments[id];
              }
              
              // 4. Supprimer la scène
              state.data.scenes = state.data.scenes.filter(s => s.id !== id && String(s.id) !== String(id)); 
              // Vidage du formulaire d'edition retire le 26 aout : il n'y a plus
              // de formulaire. En revanche la FICHE peut etre ouverte sur la
              // scene qu'on vient de supprimer (on supprime justement depuis sa
              // carte) : on la referme, sinon elle resterait a l'ecran a editer
              // un objet disparu.
              if(state.currentEditingId === id) state.currentEditingId = null;
              if(typeof CardModal !== 'undefined' && CardModal.closeIfShowing) CardModal.closeIfShowing('scenes', id);
              
              // [Phase D] Capturer le recoverable enrichi : la scène + tous ses shots associés
              const sceneLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
              const sceneRecoverable = await History.captureRecoverable(sceneToDelete, 'scene', sceneLogId);
              // Enrichir avec les shots associés (chacun avec ses médias)
              if(sceneRecoverable && associatedShots.length > 0) {
                  sceneRecoverable.metadata = sceneRecoverable.metadata || {};
                  sceneRecoverable.metadata.shotsCount = associatedShots.length;
                  // Pour chaque shot associé, capturer son recoverable et fusionner les médias dans celui de la scène
                  for(const sh of associatedShots) {
                      const shotRecov = await History.captureRecoverable(sh, 'shot', sceneLogId);
                      if(shotRecov && Array.isArray(shotRecov.media)) {
                          sceneRecoverable.media = sceneRecoverable.media || [];
                          // Préfixer chaque média avec l'ID du shot pour le retrouver
                          shotRecov.media.forEach(m => {
                              m.label = `[${sh.name || 'Plan ' + (sh.id || '?')}] ${m.label}`;
                              sceneRecoverable.media.push(m);
                          });
                      }
                  }
              }
              if(sceneRecoverable && affectedDays.length > 0) {
                  sceneRecoverable.metadata = sceneRecoverable.metadata || {};
                  sceneRecoverable.metadata.affectedShootingDays = affectedDays.length;
              }
              
              // Log historique enrichi (Phase D)
              History.log('DELETE', `Suppression scène : ${sceneToDelete?.title || 'Sans titre'}`, {
                  target: { kind: 'scene', id: id, label: sceneToDelete?.title || 'Sans titre' },
                  recoverable: sceneRecoverable
              });
              UI.renderBoard(); 
              UI.renderScript(); 
              Store.save();
              Utils.notifyImpact('board', ['script', 'breakdown', 'storyboard', 'planning'], 'supprimé');
              
              // Vérifier si le lieu est devenu orphelin
              const locParts = sceneToDelete.title.match(/^[^\.]+\.\s*(.+?)\s*-/);
              if(locParts && locParts[1]) {
                  const locName = locParts[1].trim().toUpperCase();
                  if(!Actions.isLocationUsed(locName)) {
                      Actions.askDeleteOrphanLocation(locName);
                  }
              }
              
              // Vérifier si des personnages sont devenus orphelins
              // v580 : les personnages de la scene sont lus par identifiant.
              {
                  const charNames = FicheLinks.charsOfScene(sceneToDelete).map(c => c.name);
                  const orphanChars = charNames.filter(name => !Actions.isCharacterUsed(name));
                  if(orphanChars.length > 0) {
                      setTimeout(() => Actions.askDeleteOrphanCharacters(orphanChars), 500); // Délai pour laisser la première modale se fermer
                  }
              }
          } 
      },
      
      // ===== ANNULER / RETABLIR L'ORDRE DES SCENES (26 aout) =====
      // Un glisser-depose rate est difficile a rattraper a la main : renumeroter
      // vingt scenes pour revenir en arriere n'est pas une option, et l'ordre
      // des scenes se propage au scenario, au depouillement et aux feuilles de
      // service. Deux piles d'ordres (des listes d'identifiants, rien de plus)
      // suffisent : ce n'est PAS un annuler general, seul l'ordre est concerne.
      // Les piles vivent le temps de la session et sont bornees a 30 crans.
      orderUndo: [],
      orderRedo: [],
      // Un cran retient l'ORDRE des scenes et leur appartenance au fil rouge
      // (inTimeline), plus leur position sur le beat board POUR CE SEUL CAS :
      // sortir une scene du fil rouge la deplace dans la zone du bas, la
      // remettre sans lui rendre sa place la laisserait en bas du tableau.
      _orderSnap: () => (state.data.scenes || []).map(s => ({
          i: s.id, t: s.inTimeline !== false, x: s.beatboardX, y: s.beatboardY
      })),
      // Memorise l'etat courant et ferme la branche « refaire » : apres un
      // nouveau deplacement, les crans qu'on avait annules ne menent plus
      // nulle part. Un seul point d'entree pour le sequencier ET le beat board.
      pushOrderSnapshot: () => {
          Actions.orderUndo.push(Actions._orderSnap());
          if(Actions.orderUndo.length > 30) Actions.orderUndo.shift();
          Actions.orderRedo = [];
      },
      // Reapplique un ordre donne. Une scene absente de la liste (supprimee
      // depuis) est ignoree ; une scene apparue depuis est laissee a la fin,
      // sinon rejouer un ordre ancien ferait disparaitre les nouvelles scenes.
      _applyOrder: (snap) => {
          const byId = new Map((state.data.scenes || []).map(s => [String(s.id), s]));
          const out = [];
          (snap || []).forEach(e => {
              const s = byId.get(String(e.i));
              if(!s) return;
              // La position n'est rendue QUE si l'appartenance au fil rouge
              // change : sinon annuler un ordre ancien ferait aussi sauter
              // toutes les cartes deplacees depuis, ce qu'on n'annule pas.
              if((s.inTimeline !== false) !== e.t) {
                  s.inTimeline = e.t;
                  if(e.x !== undefined) s.beatboardX = e.x;
                  if(e.y !== undefined) s.beatboardY = e.y;
              }
              out.push(s);
              byId.delete(String(e.i));
          });
          byId.forEach(s => out.push(s));
          state.data.scenes = out;
          Store.save();
          UI.renderBoard();
          UI.renderScript();
          if(typeof BeatBoard !== 'undefined' && BeatBoard.viewMode === 'beatboard') BeatBoard.render();
          UI.updateSceneOrderButtons();
      },
      undoOrder: () => {
          if(!Actions.orderUndo.length) return;
          Actions.orderRedo.push(Actions._orderSnap());
          Actions._applyOrder(Actions.orderUndo.pop());
          Utils.toast('Ordre précédent rétabli', 'info');
      },
      redoOrder: () => {
          if(!Actions.orderRedo.length) return;
          Actions.orderUndo.push(Actions._orderSnap());
          Actions._applyOrder(Actions.orderRedo.pop());
          Utils.toast('Ordre refait', 'info');
      },
      
      updateOrder: (fromTab) => { 
          const newIds = Array.from(els.boardList.children).map(c => c.dataset.id); 
          
          const newScenes = []; 
          newIds.forEach(id => { const s = state.data.scenes.find(x => String(x.id) === String(id)); if(s) newScenes.push(s); }); 
          
          if(newScenes.length === state.data.scenes.length) {
              // Vérifier si des scènes planifiées ont changé de numéro
              const plannedScenes = [];
              if(state.data.shootingDays) {
                  state.data.shootingDays.forEach(day => {
                      (day.scenes || []).forEach(ref => {
                          const oldIdx = state.data.scenes.findIndex(s => s.id === ref.sceneId);
                          const newIdx = newScenes.findIndex(s => s.id === ref.sceneId);
                          if(oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                              const scene = newScenes[newIdx];
                              plannedScenes.push({
                                  title: scene.title,
                                  oldNum: oldIdx + 1,
                                  newNum: newIdx + 1,
                                  day: day.name || Utils.formatDate(day.date || day.startDate)
                              });
                          }
                      });
                  });
              }
              
              // Memoriser l'ordre AVANT de le remplacer.
              Actions.pushOrderSnapshot();
              
              state.data.scenes = newScenes; 
              if(fromTab === 'script') UI.renderScript(); else UI.renderBoard(); 
              Store.save();
              
              // Notifier si des scènes planifiées ont changé de numéro
              if(plannedScenes.length > 0) {
                  const details = plannedScenes.slice(0, 3).map(p => `#${p.oldNum}→#${p.newNum} (${p.day})`).join(', ');
                  const more = plannedScenes.length > 3 ? ` +${plannedScenes.length - 3} autres` : '';
                  Utils.toast(`⚠️ Scènes planifiées renumérotées : ${details}${more}`, 'warning', 5000);
              }
          } else {
              console.error("Erreur de tri : décalage d'IDs détecté.", newIds, newScenes.length, state.data.scenes.length);
          }
      },
      
      // ===================== SYNCHRONISATION PERSONNAGES & LIEUX =====================
      syncCharacters: () => { const found = new Set(); state.data.scenes.forEach(s => { if(!s.perso) return; s.perso.split(/[,;]|\bet\b/i).map(n=>n.trim()).filter(n=>n.length).forEach(n=>found.add(n)); }); found.forEach(name => { if(!state.data.characters.find(c => c.name.toLowerCase() === name.toLowerCase())) state.data.characters.push({ id: 'char_' + Utils.generateUniqueId(), name: name, bio: "", group_id: "", gender: "" }); }); },
      // Chantier 3 (v580) : syncLocations CREAIT une fiche decor pour chaque
      // lieu de titre — c'est fini, un decor ne nait que par le bouton
      // « ➕ Décor ». La fonction ne fait plus que RELIER les scenes encore
      // sans lien aux fiches existantes (idempotent, a l'ouverture de l'onglet).
      syncLocations: () => { (state.data.scenes || []).forEach(s => { if(s && (s.locationId === undefined || s.locationId === null)) FicheLinks.resolveDecor(s); }); },
      
      // Vérifie si un lieu est utilisé dans d'autres scènes (exclut la scène passée en paramètre)
      isLocationUsed: (locationName, excludeSceneId = null) => {
          const locUpper = locationName.toUpperCase();
          return state.data.scenes.some(s => {
              if(excludeSceneId && (s.id === excludeSceneId || String(s.id) === String(excludeSceneId))) return false;
              const parts = s.title.match(/^[^\.]+\.\s*(.+?)\s*-/);
              return parts && parts[1].trim().toUpperCase() === locUpper;
          });
      },
      
      // Vérifie si un personnage est utilisé dans d'autres scènes (exclut la scène passée en paramètre)
      isCharacterUsed: (characterName, excludeSceneId = null) => {
          // v580 : resolution nom -> fiche UNE fois, puis test par identifiant
          // sur chaque scene (sceneHasChar garde le nom en repli).
          const fiche = FicheLinks.findChar(characterName);
          const charUpper = String(characterName || '').toUpperCase();
          return state.data.scenes.some(s => {
              if(excludeSceneId && (s.id === excludeSceneId || String(s.id) === String(excludeSceneId))) return false;
              if(fiche) return FicheLinks.sceneHasChar(s, fiche);
              if(!s.perso) return false;
              const chars = s.perso.split(/[,;]|\bet\b/i).map(n => n.trim().toUpperCase());
              return chars.includes(charUpper);
          });
      },
      
      // Propose de supprimer un lieu orphelin
      askDeleteOrphanLocation: async (locationName) => {
          // v601 : meme regle que pour le depouillement — si les scenes me sont
          // cachees, je ne peux pas conclure qu'un decor n'y sert plus. Proposer
          // de le supprimer serait proposer d'effacer ce que je ne vois pas.
          if(typeof Links !== 'undefined' && Links.masquee('scene')) return;
          const loc = state.data.locations.find(l => l.name.toUpperCase() === locationName.toUpperCase());
          if(!loc) return;
          
          const confirmed = await ConfirmModal.show({
              title: 'Décor inutilisé',
              message: `Le décor "${locationName}" n'est plus utilisé dans aucune scène.\n\nVoulez-vous le supprimer de la liste des décors ?`,
              icon: '📍',
              confirmText: 'Supprimer',
              cancelText: 'Garder',
              dangerous: false
          });
          
          if(confirmed) {
              state.data.locations = state.data.locations.filter(l => l.name.toUpperCase() !== locationName.toUpperCase());
              Store.save();
              Utils.toast(`Décor "${locationName}" supprimé`, 'success');
          }
      },
      
      // Propose de supprimer des personnages orphelins
      askDeleteOrphanCharacters: async (characterNames) => {
          if(!characterNames || characterNames.length === 0) return;
          // v601 : voir askDeleteOrphanLocation. Sans acces aux scenes, « plus
          // utilise dans aucune scene » ne veut rien dire.
          if(typeof Links !== 'undefined' && Links.masquee('scene')) return;
          
          const orphans = characterNames.filter(name => {
              return state.data.characters.find(c => c.name.toUpperCase() === name.toUpperCase());
          });
          
          if(orphans.length === 0) return;
          
          const listText = orphans.map(n => `• ${n}`).join('\n');
          const confirmed = await ConfirmModal.show({
              title: 'Personnage(s) inutilisé(s)',
              message: `${orphans.length > 1 ? 'Ces personnages ne sont' : 'Ce personnage n\'est'} plus utilisé(s) dans aucune scène :\n\n${listText}\n\nVoulez-vous ${orphans.length > 1 ? 'les' : 'le'} supprimer de la liste des personnages ?`,
              icon: '👤',
              confirmText: 'Supprimer',
              cancelText: 'Garder',
              dangerous: false
          });
          
          if(confirmed) {
              orphans.forEach(name => {
                  state.data.characters = state.data.characters.filter(c => c.name.toUpperCase() !== name.toUpperCase());
              });
              Store.save();
              Utils.toast(`${orphans.length} personnage(s) supprimé(s)`, 'success');
          }
      },
      // ===================== DONNÉES & GROUPES =====================
      // Garde d'ecriture : voir updateActorMeta.
      updateDataItem: (type, idx, val) => { const k = { characters:'character', actors:'actor', locations:'location', crew:'crew' }[type]; if(k && !Permissions.canEditFiche(k)) return; const _it = state.data[type][idx]; if(_it && _it.publicProfileId) return; if(state.data[type][idx]) { const key = (type === 'characters' || type === 'actors') ? 'bio' : 'desc'; state.data[type][idx][key] = val; Store.saveDebounced(); } },
      deleteDataItem: async (type, idx) => { 
          if(PublicProfile._engineMode) return; // fiche moteur : pas de suppression ici
          // v601 : on n'efface pas une fiche pendant que quelqu'un ecrit une
          // scene qui s'en sert (voir SceneLock.autoriseSuppression). Refus
          // temporaire : la suppression redevient possible des que la scene est
          // liberee.
          if(typeof SceneLock !== 'undefined' && !SceneLock.autoriseSuppression(type, state.data[type] && state.data[type][idx] && state.data[type][idx].id)) return;
          if(await ConfirmModal.confirmDelete("Cet élément sera supprimé.")) { 
              if(typeof CardModal !== 'undefined' && CardModal.closeIfShowing) CardModal.closeIfShowing(type, state.data[type][idx]?.id);
              // Si on supprime un acteur, délier les personnages associés
              if(type === 'actors') {
                  const actorId = state.data.actors[idx]?.id;
                  const actorName = state.data.actors[idx]?.name;
                  let impactedTabs = [];
                  if(actorId) {
                      // Vérifier si le comédien était planifié
                      let plannedDays = 0;
                      if(state.data.shootingDays) {
                          state.data.shootingDays.forEach(day => {
                              if(day.callSheet && day.callSheet.some(call => call.personId === actorId && call.type === 'actor')) {
                                  plannedDays++;
                              }
                          });
                      }
                      if(plannedDays > 0) impactedTabs.push('planning');
                      
                      // Délier les personnages
                      let linkedChars = 0;
                      state.data.characters.forEach(char => {
                          if(char.actor_id === actorId) {
                              delete char.actor_id;
                              linkedChars++;
                          }
                      });
                      if(linkedChars > 0) impactedTabs.push('chars');
                      
                      // Retirer des feuilles de service (callSheet)
                      if(state.data.shootingDays) {
                          state.data.shootingDays.forEach(day => {
                              if(day.callSheet) {
                                  day.callSheet = day.callSheet.filter(
                                      call => !(call.personId === actorId && call.type === 'actor')
                                  );
                              }
                          });
                      }
                      // Supprimer les dépenses de salaire associées
                      if(state.data.expenses) {
                          const hadExpenses = state.data.expenses.some(e => e.salaryPersonId === actorId && e.salaryPersonType === 'actor');
                          if(hadExpenses) impactedTabs.push('expenses');
                          state.data.expenses = state.data.expenses.filter(
                              e => !(e.salaryPersonId === actorId && e.salaryPersonType === 'actor')
                          );
                      }
                      
                      // Notification si impacts
                      if(impactedTabs.length > 0) {
                          Utils.notifyImpact('actors', impactedTabs, 'supprimé');
                      }
                  }
              }
              
              // Si on supprime un personnage, le retirer du breakdown de toutes les scènes
              if(type === 'characters') {
                  const charName = state.data.characters[idx]?.name;
                  const charId = state.data.characters[idx]?.id;
                  if(charName) {
                      let hadBreakdown = false;
                      state.data.scenes.forEach(scene => {
                          if(scene.breakdown && scene.breakdown["PERSONNAGES"]) {
                              const before = scene.breakdown["PERSONNAGES"].length;
                              scene.breakdown["PERSONNAGES"] = scene.breakdown["PERSONNAGES"].filter(
                                  it => !(Utils.bdId(it) === charId || (!Utils.bdId(it) && Utils.bdText(it).toLowerCase() === charName.toLowerCase()))
                              );
                              if(scene.breakdown["PERSONNAGES"].length < before) hadBreakdown = true;
                          }
                      });
                      if(hadBreakdown) Utils.notifyImpact('chars', 'breakdown', 'supprimé');
                      // v580 : le personnage sort aussi du champ perso des
                      // scenes. L'id est retire AVANT le splice de la fiche
                      // (refreshPerso seul le garderait, la fiche existant
                      // encore a cet instant), puis le cache est reecrit.
                      // C'est la racine du chantier 2 : le nom ne trainera
                      // plus dans s.perso, syncCharacters ne recreera plus
                      // la fiche supprimee, l'autocompletion ne le proposera plus.
                      state.data.scenes.forEach(scene => {
                          if(Array.isArray(scene.persoIds) && scene.persoIds.includes(charId)) {
                              scene.persoIds = scene.persoIds.filter(x => x !== charId);
                              FicheLinks.refreshPerso(scene);
                          }
                      });
                  }
              }
              
              // Si on supprime un lieu, le retirer du breakdown de toutes les scènes
              if(type === 'locations') {
                  const locName = state.data.locations[idx]?.name;
                  const locId = state.data.locations[idx]?.id;
                  if(locName) {
                      let hadBreakdown = false;
                      state.data.scenes.forEach(scene => {
                          if(scene.breakdown && scene.breakdown["DECORS-LIEUX"]) {
                              const before = scene.breakdown["DECORS-LIEUX"].length;
                              scene.breakdown["DECORS-LIEUX"] = scene.breakdown["DECORS-LIEUX"].filter(
                                  it => !(Utils.bdId(it) === locId || (!Utils.bdId(it) && Utils.bdText(it).toLowerCase() === locName.toLowerCase()))
                              );
                              if(scene.breakdown["DECORS-LIEUX"].length < before) hadBreakdown = true;
                          }
                      });
                      if(hadBreakdown) Utils.notifyImpact('locs', 'breakdown', 'supprimé');
                  }
              }
              
              // Capturer l'item entier AVANT splice pour le journal enrichi (Phase D)
              const deletedItem = state.data[type][idx];
              const deletedItemName = deletedItem?.name || 'Sans nom';
              const typeLabel = type === 'characters' ? 'personnage' : (type === 'actors' ? 'comédien' : 'décor');
              const recoverableKind = type === 'characters' ? 'character' : (type === 'actors' ? 'actor' : 'location');
              
              // Générer un logId à l'avance pour permettre l'upload des médias dans history/<logId>_*
              const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
              const recoverable = await History.captureRecoverable(deletedItem, recoverableKind, logId);
              
              state.data[type].splice(idx, 1); 
              History.log('DELETE', `Suppression ${typeLabel} : ${deletedItemName}`, {
                  target: { kind: recoverableKind, id: deletedItem?.id, label: deletedItemName },
                  recoverable: recoverable
              });
              Store.save(); 
              type === 'characters' ? UI.renderDataTab('characters', els.charContainer) : (type === 'actors' ? UI.renderDataTab('actors', els.actorContainer) : UI.renderDataTab('locations', els.locContainer)); 
          } 
      },
      addGroup: (type) => { 
        // v602 : comediens et techniciens ont une liste FERMEE (voir
        // CastFamilies et CrewDepartements) — la feuille de service les lit.
        if(type === 'crew') { Utils.toast('Les départements techniques sont ceux du métier : la feuille de service s\'en sert. Pour ce qui ne rentre nulle part, il y a « Autre ».', 'info'); return; }
        if(type === 'actor') { Utils.toast('Les groupes de comédiens sont ceux du métier, chacun avec sa numérotation officielle : on n\'en crée pas d\'autre.', 'info'); return; }
        const typeLabel = type === 'perso' ? 'personnages' : (type === 'actor' ? 'comédiens' : (type === 'org' ? 'structures' : (type === 'crew' ? 'techniciens' : (type === 'resource' ? 'ressources' : 'lieux'))));
        
        const modal = document.createElement('div');
        modal.id = 'add-group-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div style="background:var(--panel-bg);border-radius:12px;padding:25px;max-width:400px;width:90%;">
                <h3 class="mt-0">➕ Nouveau groupe de ${typeLabel}</h3>
                <!-- 31 aout — LE SELECTEUR D'ICONE EST RETIRE. Il proposait de
                     choisir une emoticone qu'AUCUN ecran n'affichait jamais :
                     elle n'apparaissait qu'en etant collee dans le NOM du
                     groupe, ce qui produisait des titres du genre « (palmier)
                     Seconds roles creoles » impossibles a nettoyer sans
                     renommer le groupe, et rendait le groupe invisible aux
                     tests qui le cherchaient par son nom exact. Un reglage qui
                     ne sert a rien mais casse quelque chose vaut mieux
                     supprime que corrige. -->
                <div class="mb-20">
                    <label class="label-bold">Nom du groupe</label>
                    <input type="text" id="new-group-name" placeholder="Ex: Protagonistes, Décors nuit..." data-tooltip="Ex: Protagonistes, Décors nuit..." class="n8-input-13">
                </div>
                <div class="flex-end-compact">
                    <button onclick="this.closest('div[style*=fixed]').remove()" class="btn btn--outline">Annuler</button>
                    <button onclick="app.Actions.confirmAddGroup('${type}')" class="btn btn--success">Créer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.getElementById('new-group-name').focus();
    },
    
    confirmAddGroup: (type) => {
        const name = document.getElementById('new-group-name').value.trim();
        if(!name) {
            Utils.toast('Veuillez entrer un nom pour le groupe.', 'warning');
            return;
        }
        
        // 31 aout — PLUS D'ICONE DU TOUT. Le groupe naissait avec
        // name = icone + ' ' + nom : l'emoticone faisait partie du NOM, en
        // double avec un champ icon que rien n'affichait. Trois consequences,
        // toutes constatees le meme jour : un titre qu'on ne pouvait nettoyer
        // sans renommer le groupe, une recherche sur « Figuration » qui ne
        // trouvait pas « (palmier) Figuration », et cinq tests du fichier qui
        // reconnaissaient le groupe Figuration par egalite stricte sur son nom.
        // Decision de Guillaume : on retire les icones, selecteur compris.
        const newGroup = { id: 'g'+Utils.generateUniqueId(), name: name, type: type };
        state.data.groups.push(newGroup);
        History.log('ADD', `Ajout groupe : ${name}`, {
            target: { kind: 'group', id: newGroup.id, label: name }
        });
        Store.save();
        
        // Fermer le modal
        const modal = document.getElementById('add-group-modal');
        if(modal) modal.remove();
        
        if(type==='perso') UI.renderDataTab('characters', els.charContainer); 
        else if(type==='actor') UI.renderDataTab('actors', els.actorContainer); 
        else if(type==='org') Orgs.render(); 
        else if(type==='crew') UI.renderCrewTab(); 
        else if(type==='resource') Resources.render(); 
        else UI.renderDataTab('locations', els.locContainer);
    },
      changeGroup: (type, idx, gid) => { const k = { characters:'character', actors:'actor', locations:'location', crew:'crew', orgs:'org', resources:'resource' }[type]; if(k && !Permissions.canEditFiche(k)) return; if(!state.data[type] || !state.data[type][idx]) return;
          // Chantier 4 : une fiche sans scene reste dans « Sans scène » tant
          // que l'exemption n'est pas cochee sur sa fiche. Le re-rendu remet
          // le selecteur en place.
          if(gid && FicheLinks.isSansScene(type, state.data[type][idx])) {
              Utils.toast('Cette fiche n\'apparaît dans aucune scène : elle reste dans « Sans scène ». Cochez « 📌 Classement manuel » sur sa fiche pour la ranger ailleurs.', 'warning');
              try { GroupDnD.rerender(type); } catch(e) {}
              return;
          }
          state.data[type][idx].group_id = gid; Store.save(); if(type==='characters') UI.renderDataTab(type, els.charContainer); else if(type==='actors') UI.renderDataTab(type, els.actorContainer); else if(type==='orgs') Orgs.render(); else if(type==='crew') UI.renderCrewTab(); else if(type==='resources') Resources.render(); else UI.renderDataTab(type, els.locContainer); },
      // Vérifie si un profil public existe pour cet email et propose de le lier
      // ===================== LIAISON PROFILS PUBLICS =====================
      checkAndLinkPublicProfile: async (email, type, idx) => {
          if(!email || !email.includes('@')) return false;
          
          const typeLabel = type === 'actor' ? 'comédien' : 'technicien';
          const dataArray = type === 'actor' ? state.data.actors : state.data.crew;
          
          try {
              // Chercher dans user_profiles
              // v602 : par la porte unique des profils (Utils.profils).
              const { data: _trouves, error } = await Utils.profils({ emails: [email.toLowerCase()] });
              const profiles = _trouves.filter(p => String(p.email || '').toLowerCase() === email.toLowerCase());
              
              if(!error && profiles && profiles.length > 0) {
                  const existingProfile = profiles[0];
                  const profileId = existingProfile.id;
                  
                  // Créer le modal de confirmation
                  const modal = document.createElement('div');
                  modal.id = 'link-profile-modal';
                  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;justify-content:center;align-items:center;z-index: var(--z-modal);';
                  modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
                  
                  const photoHtml = existingProfile.photo 
                      ? `<img src="${Utils.safeMediaUrl(existingProfile.photo)}" alt="Photo de profil" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:10px;">` 
                      : `<div style="width:80px;height:80px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:2rem;color:white;margin-bottom:10px;">${Utils.escape((existingProfile.name || '?')[0].toUpperCase())}</div>`;
                  
                  modal.innerHTML = `
                      <div style="background:var(--panel-bg);border-radius:12px;padding:25px;width:450px;max-width:90%;text-align:center;">
                          <h3 style="margin:0 0 20px;color:var(--text-main);">🔍 Profil existant trouvé !</h3>
                          
                          <p style="color:var(--text-sec);margin-bottom:20px;">Un profil ${typeLabel} existe déjà à l'adresse <strong>${Utils.escape(email)}</strong></p>
                          
                          <div style="background:var(--bg);border-radius:10px;padding:20px;margin-bottom:20px;">
                              ${photoHtml}
                              <div style="font-size:1.2rem;font-weight:bold;color:var(--text-main);">${Utils.escape(existingProfile.name || 'Sans nom')}</div>
                              <div style="color:var(--text-sec);margin-top:5px;">${Utils.escape(existingProfile.city || '')} ${existingProfile.age ? '• ' + existingProfile.age + ' ans' : ''}</div>
                              ${existingProfile.role ? `<div style="color:var(--primary);margin-top:5px;">${Utils.escape(existingProfile.role)}</div>` : ''}
                              ${existingProfile.department ? `<div style="color:var(--text-sec);font-size:0.9rem;">${Utils.escape(existingProfile.department)}</div>` : ''}
                          </div>
                          
                          <p style="color:var(--text-main);margin-bottom:20px;">Est-ce la bonne personne ?</p>
                          
                          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                              <button onclick="app.Actions.confirmLinkProfile('${profileId}', '${type}', ${idx})" style="padding:12px 25px;background:var(--success);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">✅ Oui, lier ce profil</button>
                              <button onclick="document.getElementById('link-profile-modal').remove()" style="padding:12px 25px;background:var(--bg);color:var(--text-main);border:1px solid var(--border);border-radius:8px;cursor:pointer;">❌ Non, ce n'est pas lui/elle</button>
                          </div>
                          
                          <p style="color:var(--text-sec);font-size:0.85rem;margin-top:15px;">Si ce n'est pas la bonne personne, vérifiez l'adresse email.</p>
                      </div>
                  `;
                  
                  document.body.appendChild(modal);
                  return true; // Profil trouvé
              }
              return false; // Pas de profil trouvé
          } catch(e) {
              console.warn('Erreur vérification profil:', e);
              return false;
          }
      },
      
      // Confirme la liaison d'un profil public
      confirmLinkProfile: async (profileId, type, idx) => {
          const dataArray = type === 'actor' ? state.data.actors : state.data.crew;
          
          try {
              const { data: publicData, error } = await Utils.profils({ ids: [profileId] }).then(r => ({ data: r.data[0] || null, error: r.error }));
              
              if (error) throw error;
              
              if(publicData && dataArray[idx]) {
                  // Lier le profil
                  dataArray[idx].publicProfileId = profileId;
                  
                  // Mettre à jour les données
                  dataArray[idx].name = publicData.name || dataArray[idx].name;
                  dataArray[idx].photo = publicData.photo || dataArray[idx].photo;
                  dataArray[idx].phone = publicData.phone || dataArray[idx].phone;
                  dataArray[idx].city = publicData.city || dataArray[idx].city;
                  dataArray[idx].bio = publicData.bio || dataArray[idx].bio;
                  
                  Store.save();
                  
                  // Fermer le modal
                  document.getElementById('link-profile-modal')?.remove();
                  
                  // Re-render
                  if(type === 'actor') {
                      UI.renderDataTab('actors', els.actorContainer);
                  } else {
                      UI.renderCrewTab();
                  }
                  
                  Utils.toast('Profil lié avec succès !', 'success');
                  
                  // Proposer de notifier
                  const person = dataArray[idx];
                  setTimeout(async () => {
                      if(await ConfirmModal.show({ title: 'Prévenir cette personne ?', message: `Envoyer une notification à ${Utils.escape(person.name)} pour l'informer qu'il/elle a été ajouté(e) au projet ?`, icon: '📧', confirmText: 'Envoyer' })) {
                          Actions.notifyNewProfile(person, type);
                      }
                  }, 300);
              }
          } catch(e) {
              console.error('Erreur liaison profil:', e);
              Utils.toast('Erreur lors de la liaison', 'error');
          }
      },
      
      // Synchronise les acteurs du projet avec leurs profils publics
      syncActorsFromPublicProfiles: async () => {
          if(!state.data.actors) return;
          
          let hasChanges = false;
          
          // D'abord, vérifier si des acteurs sans publicProfileId correspondent à un profil public existant
          for(let i = 0; i < state.data.actors.length; i++) {
              const actor = state.data.actors[i];
              if(!actor.publicProfileId && actor.email) {
                  try {
                      // Chercher par email dans user_profiles
                      const { data: profiles, error: errSyncA } = await supabase
                          .from('user_profiles')
                          .select('id')
                          .eq('email', actor.email.toLowerCase());
                      if(errSyncA) console.warn('[PublicProfile] sync actors (recherche):', errSyncA);
                      if(profiles && profiles.length > 0) {
                          actor.publicProfileId = profiles[0].id;
                          hasChanges = true;
                      }
                  } catch(e) {
                      console.warn('Erreur vérification profil public:', e);
                  }
              }
          }
          
          // Ensuite, synchroniser les données des profils liés
          for(let i = 0; i < state.data.actors.length; i++) {
              const actor = state.data.actors[i];
              if(actor.publicProfileId) {
                  try {
                      const { data: publicData, error: errSyncAD } = await Utils.profils({ ids: [actor.publicProfileId] }).then(r => ({ data: r.data[0] || null, error: r.error }));
                      if(errSyncAD) console.warn('[PublicProfile] sync actors (données):', errSyncAD);
                      if(publicData) {
                          // Extraire les données du champ JSONB
                          const extraData = publicData.data || {};
                          // CASQUETTE comédien : source par-casquette (repli sur l'ancien emplacement à plat).
                          const facet = (extraData.facets && extraData.facets.actor) || {};
                          // CASQUETTE masquee/desactivee dans l'Univers : on GARDE le dernier instantane
                          // (pas d'ecrasement) et on marque la fiche hors ligne.
                          const offline = facet.visible === false || facet.enabled === false;
                          actor._offline = offline;
                          if(!offline) {
                          // --- Champs PAR CASQUETTE (facets.actor d'abord) ---
                          actor.name = facet.name || publicData.name || actor.name;
                          actor.photo = facet.photo || publicData.photo || actor.photo;
                          actor.phone = facet.phone || publicData.phone || actor.phone;
                          actor.email = facet.contactEmail || actor.email; // email de CONTACT public
                          actor.bio = facet.bio || publicData.bio || actor.bio;
                          actor.gender = facet.gender || publicData.gender || actor.gender;
                          actor.city = facet.city || publicData.city || actor.city;
                          actor.demoreel = facet.demoreel || extraData.demoreel || actor.demoreel;
                          actor.professionalStatus = facet.professionalStatus || extraData.professionalStatus || actor.professionalStatus;
                          actor.numSecu = facet.numSecu || extraData.numSecu || actor.numSecu;
                          actor.numCongesSpectacles = facet.numCongesSpectacles || extraData.numCongesSpectacles || actor.numCongesSpectacles;
                          actor.siret = facet.siret || extraData.siret || actor.siret;
                          actor.collabType = facet.collabType || extraData.collabType || actor.collabType;
                          actor.languages = facet.languages || extraData.languages || actor.languages;
                          actor.availabilityText = facet.availabilityText || publicData.availability || actor.availabilityText;
                          actor.availabilityDates = facet.availabilityDates || extraData.availabilityDates || actor.availabilityDates;
                          actor.unavailabilityDates = facet.unavailabilityDates || extraData.unavailabilityDates || actor.unavailabilityDates;
                          actor.hasVehicle = facet.hasVehicle || publicData.vehicle || actor.hasVehicle;
                          actor.vehicleType = facet.vehicleType || extraData.vehicleType || actor.vehicleType;
                          actor.vehiclePlate = facet.vehiclePlate || extraData.vehiclePlate || actor.vehiclePlate;
                          actor.vehicleSeats = facet.vehicleSeats || extraData.vehicleSeats || actor.vehicleSeats;
                          actor.vehicleTrunk = facet.vehicleTrunk || extraData.vehicleTrunk || actor.vehicleTrunk;
                          actor.vehicleNotes = facet.vehicleNotes || extraData.vehicleNotes || actor.vehicleNotes;
                          actor.vehicleUsage = facet.vehicleUsage || extraData.vehicleUsage || actor.vehicleUsage;
                          actor.licenses = facet.licenses || extraData.licenses || actor.licenses;
                          actor.galleryPhotos = facet.galleryPhotos || extraData.galleryPhotos || actor.galleryPhotos || [];
                          // --- Champs COMMUNS (physique, site web) : partagés au niveau profil ---
                          actor.height = extraData.height || actor.height;
                          actor.age = extraData.age || actor.age;
                          actor.eyeColor = extraData.eyeColor || actor.eyeColor;
                          actor.hairColor = extraData.hairColor || actor.hairColor;
                          actor.hairLength = extraData.hairLength || actor.hairLength;
                          actor.ethnicity = extraData.ethnicity || actor.ethnicity;
                          actor.corpulence = extraData.corpulence || actor.corpulence;
                          actor.weight = extraData.weight || actor.weight;
                          actor.sports = extraData.sports || actor.sports;
                          actor.website = facet.website || extraData.website || actor.website;
                          // Préférences de visibilité
                          actor.hiddenProject = extraData.hiddenProject || [];
                          }
                          // Marquer comme synchronisé
                          actor.lastSyncedAt = Date.now();
                      }
                  } catch(e) {
                      console.warn('Erreur sync profil public:', e);
                  }
              }
          }
          // Sauvegarder les données mises à jour
          Store.save();
      },
      
      // Synchronise les techniciens du projet avec leurs profils publics
      syncCrewFromPublicProfiles: async () => {
          if(!state.data.crew) return;
          
          let hasChanges = false;
          
          // D'abord, vérifier si des techniciens sans publicProfileId correspondent à un profil public existant
          for(let i = 0; i < state.data.crew.length; i++) {
              const member = state.data.crew[i];
              if(!member.publicProfileId && member.email) {
                  try {
                      // Chercher par email dans user_profiles
                      const { data: profiles, error: errSyncC } = await supabase
                          .from('user_profiles')
                          .select('id')
                          .eq('email', member.email.toLowerCase());
                      if(errSyncC) console.warn('[PublicProfile] sync crew (recherche):', errSyncC);
                      if(profiles && profiles.length > 0) {
                          member.publicProfileId = profiles[0].id;
                          hasChanges = true;
                      }
                  } catch(e) {
                      console.warn('Erreur vérification profil public:', e);
                  }
              }
          }
          
          // Ensuite, synchroniser les données des profils liés
          for(let i = 0; i < state.data.crew.length; i++) {
              const member = state.data.crew[i];
              if(member.publicProfileId) {
                  try {
                      const { data: publicData, error: errSyncCD } = await Utils.profils({ ids: [member.publicProfileId] }).then(r => ({ data: r.data[0] || null, error: r.error }));
                      if(errSyncCD) console.warn('[PublicProfile] sync crew (données):', errSyncCD);
                      if(publicData) {
                          // Extraire les données du champ JSONB
                          const extraData = publicData.data || {};
                          // CASQUETTE technicien : source par-casquette (repli sur l'ancien emplacement).
                          // v598 : plusieurs fiches technicien possibles -> on prend celle dont le
                          // departement correspond au poste choisi dans CE projet, sinon la premiere active.
                          const crewFacetsArr = PublicProfile.crewArr(extraData.facets);
                          const memberDept = member.department || member.group_id;
                          const facet = crewFacetsArr.find(f => f && f.enabled && memberDept && (f.department === memberDept || f.group_id === memberDept))
                              || crewFacetsArr.find(f => f && f.enabled) || crewFacetsArr[0] || {};
                          // CASQUETTE masquee/desactivee dans l'Univers : on GARDE le dernier instantane et on marque hors ligne.
                          const offline = facet.visible === false || facet.enabled === false;
                          member._offline = offline;
                          if(!offline) {
                          member.name = facet.name || publicData.name || member.name;
                          member.photo = facet.photo || publicData.photo || member.photo;
                          member.phone = facet.phone || publicData.phone || member.phone;
                          member.email = facet.contactEmail || member.email; // email de CONTACT public
                          member.gender = facet.gender || publicData.gender || member.gender;
                          member.city = facet.city || publicData.city || member.city;
                          member.address = facet.address || extraData.address || member.address;
                          member.role = facet.role || extraData.role || member.role;
                          member.department = facet.department || facet.group_id || extraData.department || member.department;
                          member.group_id = facet.group_id || facet.department || member.group_id;
                          member.availabilityText = facet.availabilityText || publicData.availability || member.availabilityText;
                          member.availabilityDates = facet.availabilityDates || extraData.availabilityDates || member.availabilityDates;
                          member.unavailabilityDates = facet.unavailabilityDates || extraData.unavailabilityDates || member.unavailabilityDates;
                          member.demoreel = facet.demoreel || extraData.demoreel || member.demoreel;
                          member.professionalStatus = facet.professionalStatus || extraData.professionalStatus || member.professionalStatus;
                          member.numSecu = facet.numSecu || extraData.numSecu || member.numSecu;
                          member.numCongesSpectacles = facet.numCongesSpectacles || extraData.numCongesSpectacles || member.numCongesSpectacles;
                          member.siret = facet.siret || extraData.siret || member.siret;
                          member.collabType = facet.collabType || extraData.collabType || member.collabType;
                          member.galleryPhotos = facet.galleryPhotos || extraData.crewGalleryPhotos || extraData.galleryPhotos || member.galleryPhotos || [];
                          member.hasVehicle = facet.hasVehicle || publicData.vehicle || member.hasVehicle;
                          member.vehicleType = facet.vehicleType || extraData.vehicleType || member.vehicleType;
                          member.vehiclePlate = facet.vehiclePlate || extraData.vehiclePlate || member.vehiclePlate;
                          member.vehicleSeats = facet.vehicleSeats || extraData.vehicleSeats || member.vehicleSeats;
                          member.vehicleTrunk = facet.vehicleTrunk || extraData.vehicleTrunk || member.vehicleTrunk;
                          member.vehicleNotes = facet.vehicleNotes || extraData.vehicleNotes || member.vehicleNotes;
                          member.licenses = facet.licenses || extraData.licenses || member.licenses;
                          member.vehicleUsage = facet.vehicleUsage || extraData.vehicleUsage || member.vehicleUsage;
                          // Préférences de visibilité
                          member.hiddenProject = extraData.hiddenProject || [];
                          }
                          // Marquer comme synchronisé
                          member.lastSyncedAt = Date.now();
                      }
                  } catch(e) {
                      console.warn('Erreur sync profil public crew:', e);
                  }
              }
          }
          // Sauvegarder les données mises à jour
          Store.save();
      },
      
      linkActor: (charIdx, actorId) => { 
          if(!state.data.characters[charIdx]) return; 
          state.data.characters[charIdx].actor_id = actorId; 
          
          const character = state.data.characters[charIdx];
          
          // Mettre à jour le sexe du personnage selon le comédien lié
          if(actorId) {
              const actor = state.data.actors.find(a => a.id === actorId || String(a.id) === String(actorId));
              if(actor && actor.gender) {
                  state.data.characters[charIdx].gender = actor.gender;
              }
              
              // Synchroniser le comédien dans le dépouillement des scènes où ce personnage apparaît
              if(actor && actor.name && character.name) {
                  const charNameUpper = character.name.toUpperCase();
                  state.data.scenes.forEach(scene => {
                      // Vérifier si le personnage est dans cette scène
                      const hasCharacter = scene.perso && scene.perso.toUpperCase().includes(charNameUpper);
                      // Le personnage est reconnu par son ID des qu'il est lie ;
                      // le repli sur le nom ne sert plus qu'aux elements pas
                      // encore rattaches a une fiche.
                      const inBreakdown = scene.breakdown && scene.breakdown['PERSONNAGES'] && 
                          scene.breakdown['PERSONNAGES'].some(p => Utils.bdId(p) === character.id || Utils.bdText(p).toUpperCase() === charNameUpper);
                      
                      if(hasCharacter || inBreakdown) {
                          if(!scene.breakdown) scene.breakdown = {};
                          if(!scene.breakdown['COMEDIENS']) scene.breakdown['COMEDIENS'] = [];
                          if(!scene.breakdown['COMEDIENS'].some(it => Utils.bdId(it) === actor.id || Utils.bdSameText(it, actor.name))) {
                              scene.breakdown['COMEDIENS'].push(Utils.bdItem(actor.name, 'COMEDIENS', actor.id));
                          }
                      }
                  });
              }
          }
          
          Store.save(); 
          UI.renderDataTab('characters', els.charContainer);
          if(actorId) {
              Utils.notifyImpact('chars', 'breakdown', 'lié');
          }
      },
      // ===================== ACTEURS =====================
      addActor: async () => { 
          if(state.currentRole !== 'owner' && !Permissions.canEdit('comediens')) {
              Utils.toast('Vous n\'avez pas la permission d\'ajouter des comédiens.', 'error');
              return;
          }
          const newActor = { id: 'act_'+Utils.generateUniqueId(), name: '', gender: "", bio: "", email: "", phone: "", address: "", city: "", website: "", photo: "", group_id: "", hasVehicle: false, vehicleType: "", vehiclePlate: "", vehicleSeats: "", vehicleTrunk: false, vehicleNotes: "", salaryGross: "", salaryNet: "", salaryBudget: "", dailyRate: "", rateCurrency: "€", rateType: "Jour", availabilityText: "", availabilityDates: [], color: "", height: "", weight: "", age: "", eyeColor: "", hairColor: "", hairLength: "", ethnicity: "", corpulence: "", sports: "", languages: "", demoreel: "", galleryPhotos: [] }; state.data.actors.push(newActor); History.log('ADD', `Ajout comédien`, { target: { kind: 'actor', id: newActor.id, label: 'Nouveau comédien' }, link: { kind: 'actor', id: newActor.id } }); Store.save(); UI.renderDataTab('actors', els.actorContainer); CardModal.open('actors', state.data.actors.length - 1); },
      addDataItem: async (type) => {
          if(type === 'actors') { Actions.addActor(); return; }
          const labels = { characters: { perm: 'personnages', singular: 'personnage', title: 'Nouveau personnage', placeholder: 'Nom du personnage…' }, locations: { perm: 'decors', singular: 'décor', title: 'Nouveau décor', placeholder: 'Nom du décor (ex: GRENIER MAISON PATERNELLE)…' } };
          const cfg = labels[type];
          if(!cfg) { Utils.toast('Type inconnu', 'error'); return; }
          if(state.currentRole !== 'owner' && !Permissions.canEdit(cfg.perm)) { Utils.toast(`Vous n'avez pas la permission d'ajouter des ${cfg.perm}.`, 'error'); return; }
          const name = await ConfirmModal.prompt(`Entrez le nom du ${cfg.singular}.`, cfg.title, cfg.placeholder);
          if(!name) return;
          const trimmed = name.trim();
          if(!trimmed) return;
          if(type === 'characters') {
              const exists = state.data.characters.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
              if(exists) { Utils.toast('Ce personnage existe déjà', 'warning'); return; }
              const newChar = { id: 'char_'+Utils.generateUniqueId(), name: trimmed, bio: '', group_id: '', gender: '' };
              state.data.characters.push(newChar);
              History.log('ADD', `Ajout personnage : ${trimmed}`, { target: { kind: 'character', id: newChar.id, label: trimmed }, link: { kind: 'character', id: newChar.id } });
              Store.save();
              UI.renderDataTab('characters', els.charContainer);
          } else if(type === 'locations') {
              const upperName = trimmed.toUpperCase();
              const exists = state.data.locations.find(l => l.name.toUpperCase() === upperName);
              if(exists) { Utils.toast('Ce décor existe déjà', 'warning'); return; }
              const newLoc = { id: 'loc_'+Utils.generateUniqueId(), name: upperName, desc: '', group_id: '', realName: '', address: '', contactName: '', contactPhone: '', accessNotes: '', galleryPhotos: [] };
              state.data.locations.push(newLoc);
              History.log('ADD', `Ajout décor : ${upperName}`, { target: { kind: 'location', id: newLoc.id, label: upperName }, link: { kind: 'location', id: newLoc.id } });
              Store.save();
              UI.renderDataTab('locations', els.locContainer);
          }
      },
      toggleActorLicense: (idx, key, checked) => {
          const a = state.data.actors[idx];
          if(!a) return;
          let lic = Array.isArray(a.licenses) ? a.licenses.slice() : [];
          if(checked) { if(!lic.includes(key)) lic.push(key); } else { lic = lic.filter(k => k !== key); }
          Actions.updateActorMeta(idx, 'licenses', lic);
      },
      updateActorMeta: (idx, field, val) => { 
          // FUSION : en mode « fiche moteur », on ecrit DIRECTEMENT dans l'objet
          // casquette comedien (une copie), jamais sur un comedien de projet ni sur
          // les champs communs. idx (=-1) est ignore.
          if(PublicProfile._engineMode) {
              const p = PublicProfile._engineProfile;
              if(p) p[field] = val;
              if((field === 'professionalStatus' || field === 'collabType') && typeof PublicProfile._engineRerenderCard === 'function') PublicProfile._engineRerenderCard();
              return;
          }
          // GARDE D'ECRITURE (26 aout) : le droit se verifie AUSSI ici. Griser
          // un champ n'est qu'un affichage — tant que la fonction qui enregistre
          // ne verifie rien, le droit n'existe pas vraiment.
          if(!Permissions.canEditFiche('actor')) return;
          // P1 (audit) : fiche revendiquee = lecture seule, meme si le champ a ete de-grise cote client.
          if(state.data.actors[idx] && state.data.actors[idx].publicProfileId && ['salaryGross','salaryNet','salaryBudget','dailyRate','rateCurrency','rateType','rateNegotiable'].indexOf(field) === -1) return;
          if(state.data.actors[idx]) { 
              const oldVal = state.data.actors[idx][field];
              state.data.actors[idx][field] = val; 
              Store.saveDebounced(); 
              if(field === 'photo') UI.renderDataTab('actors', els.actorContainer);
              
              // Si on ajoute un email valide, vérifier si un profil public existe
              if(field === 'email' && val && val.includes('@') && val !== oldVal) {
                  Actions.checkAndLinkPublicProfile(val, 'actor', idx).then(found => {
                      if(!found) {
                          // Pas de profil existant, proposer de notifier pour créer
                          const actor = state.data.actors[idx];
                          setTimeout(async () => {
                              if(await ConfirmModal.show({ title: 'Envoyer une invitation ?', message: `Aucun profil comédien trouvé pour ${val}.\n\nEnvoyer une invitation à ${Utils.escape(actor.name)} pour créer son profil ?`, icon: '📨', confirmText: 'Inviter' })) {
                                  Actions.notifyNewProfile(actor, 'actor');
                              }
                          }, 300);
                      }
                  });
              }
          } 
      },
      updateCharacterMeta: (idx, field, val) => { if(!Permissions.canEditFiche('character')) return; if(state.data.characters[idx]) { state.data.characters[idx][field] = val; Store.saveDebounced(); } },
      toggleActorVehicle: (idx, hasVehicle) => { if(state.data.actors[idx]) { state.data.actors[idx].hasVehicle = hasVehicle; Store.save(); const vehicleDetails = document.getElementById(`actor-vehicle-${idx}`); if(vehicleDetails) { if(hasVehicle) { vehicleDetails.classList.add('visible'); } else { vehicleDetails.classList.remove('visible'); } } } },
      uploadActorPhoto: async (idx, input) => {
          if(PublicProfile._engineMode) { await PublicProfile._engineUploadPhoto(input); return; }
          if(!state.data.actors[idx]) return;
          if(!input.files || !input.files[0]) return;
          const file = input.files[0];
          input.value = ''; // reset pour permettre re-sélection du même fichier (avant async pour éviter race)
          // Toast loading pendant l'upload
          Utils.toast('Envoi de la photo...', 'info', 1500);
          // Upload vers Storage (compression + upload Supabase)
          const actor = state.data.actors[idx];
          const url = await Utils.uploadProjectFile(file, {
              category: 'actors',
              entityId: actor.id || `idx${idx}`,
              kind: 'photo',
              maxDimension: 1920, quality: 0.92, maxKb: 1500
          });
          if(!url) return; // erreur déjà signalée
          // Supprimer l'ancienne photo Storage si elle existait
          const hadPhoto = !!actor.photo;
          if(actor.photo) await Utils.deleteProjectFile(actor.photo);
          actor.photo = url;
          const actorPhotoName = actor.name || 'comédien';
          History.log('EDIT', `${hadPhoto ? 'Modification' : 'Ajout'} photo principale de ${actorPhotoName}`, { target: { kind: 'actor', id: actor.id, label: actorPhotoName }, link: { kind: 'actor', id: actor.id } });
          Store.save();
          UI.renderDataTab('actors', els.actorContainer);
          CardModal.refresh();
      },
      addActorGalleryPhoto: async (idx) => {
          if(PublicProfile._engineMode) { await PublicProfile._engineAddGalleryPhoto(idx); return; }
          if(!state.data.actors[idx]) return;
          const input = document.getElementById(`actor-gallery-input-${idx}`);
          if(!input || !input.files || !input.files[0]) { Utils.toast('Veuillez sélectionner une photo.', 'warning'); return; }
          if(!state.data.actors[idx].galleryPhotos) state.data.actors[idx].galleryPhotos = [];
          // Le nombre vient de CONFIG.maxGaleriePhotos : il etait ecrit ici,
          // dans le libelle du bouton et dans le profil public — trois copies
          // du meme chiffre, donc trois occasions qu'il diverge.
          if(state.data.actors[idx].galleryPhotos.length >= CONFIG.maxGaleriePhotos) {
              Utils.toast('Maximum ' + CONFIG.maxGaleriePhotos + ' photos dans la galerie comédien. Supprimez-en une avant d\'en ajouter une nouvelle.', 'warning');
              input.value = '';
              return;
          }
          const file = input.files[0];
          input.value = ''; // reset pour permettre re-sélection du même fichier
          // Toast loading
          Utils.toast('Envoi de la photo...', 'info', 1500);
          const actor = state.data.actors[idx];
          const url = await Utils.uploadProjectFile(file, {
              category: 'actors',
              entityId: actor.id || `idx${idx}`,
              kind: 'gallery',
              maxDimension: 1920, quality: 0.92, maxKb: 1500
          });
          if(!url) return;
          actor.galleryPhotos.push(url);
          const actorNameLog = actor.name || 'comédien';
          History.log('ADD', `Ajout photo galerie pour ${actorNameLog}`, { target: { kind: 'actor', id: actor.id, label: actorNameLog }, link: { kind: 'actor', id: actor.id } });
          Store.save();
          UI.renderDataTab('actors', els.actorContainer);
          CardModal.refresh();
      },
      removeActorGalleryPhoto: async (actorIdx, photoIdx) => {
          if(PublicProfile._engineMode) {
              const d = PublicProfile._engineProfile;
              if(d && Array.isArray(d.galleryPhotos)) {
                  const url = d.galleryPhotos[photoIdx];
                  d.galleryPhotos.splice(photoIdx, 1);
                  if(url && url.includes('/gallery/')) { const path = url.split('/gallery/')[1]; if(path) { try { await supabase.storage.from('gallery').remove([path]); } catch(e) {} } }
                  PublicProfile._engineRerenderCard();
              }
              return;
          }
          if(state.data.actors[actorIdx] && state.data.actors[actorIdx].galleryPhotos) {
              const actor = state.data.actors[actorIdx];
              const actorName = actor.name || 'comédien';
              const removedUrl = actor.galleryPhotos[photoIdx];
              actor.galleryPhotos.splice(photoIdx, 1);
              // [Phase D] On ne supprime PAS le fichier Storage : on le garde référencé dans le journal
              // Il sera supprimé automatiquement par cleanupExpiredEntry quand l'entrée sortira du cap
              const recoverable = removedUrl ? {
                  text: null,
                  media: [{ kind: 'gallery', label: `Photo galerie de ${actorName}`, url: removedUrl }],
                  metadata: { actorId: actor.id, actorName: actorName, photoIndex: photoIdx }
              } : null;
              History.log('DELETE', `Suppression photo galerie de ${actorName}`, {
                  target: { kind: 'actor', id: actor.id, label: actorName },
                  recoverable: recoverable
              });
              Store.save();
              UI.renderDataTab('actors', els.actorContainer);
              CardModal.refresh();
          }
      },
      
      removeActorAvailability: (actorIdx, dateIdx) => {
          if(state.data.actors[actorIdx] && state.data.actors[actorIdx].availabilityDates) {
              state.data.actors[actorIdx].availabilityDates.splice(dateIdx, 1);
              Store.save();
              UI.renderDataTab('actors', els.actorContainer);
          }
      },

      
      removeActorUnavailability: (actorIdx, dateIdx) => {
          if(state.data.actors[actorIdx] && state.data.actors[actorIdx].unavailabilityDates) {
              state.data.actors[actorIdx].unavailabilityDates.splice(dateIdx, 1);
              Store.save();
              UI.renderDataTab('actors', els.actorContainer);
          }
      },
      
      // === DÉCORS (locations) ===
      updateLocationMeta: (idx, field, value) => {
          if(!Permissions.canEditFiche('location')) return;
          if(state.data.locations[idx]) {
              state.data.locations[idx][field] = value;
              Store.saveDebounced();
          }
      },
      addLocationPhoto: async (idx, input) => {
          if(!state.data.locations[idx]) return;
          if(!input || !input.files || !input.files[0]) return;
          const file = input.files[0];
          input.value = ''; // reset pour permettre re-sélection du même fichier (avant async)
          Utils.toast('Envoi de la photo...', 'info', 1500);
          const loc = state.data.locations[idx];
          const url = await Utils.uploadProjectFile(file, {
              category: 'locations',
              entityId: loc.id || `idx${idx}`,
              kind: 'gallery',
              maxDimension: 1280, quality: 0.85, maxKb: 400
          });
          if(!url) return;
          if(!loc.galleryPhotos) loc.galleryPhotos = [];
          loc.galleryPhotos.push(url);
          const locName = loc.name || 'décor';
          History.log('ADD', `Ajout photo galerie pour ${locName}`, { target: { kind: 'location', id: loc.id, label: locName }, link: { kind: 'location', id: loc.id } });
          Store.save();
          UI.renderDataTab('locations', els.locContainer);
          CardModal.refresh();
          Utils.toast('Photo ajoutée', 'success');
      },
      removeLocationPhoto: async (locIdx, photoIdx) => {
          if(state.data.locations[locIdx] && state.data.locations[locIdx].galleryPhotos) {
              const loc = state.data.locations[locIdx];
              const locNameRm = loc.name || 'décor';
              const removedUrl = loc.galleryPhotos[photoIdx];
              loc.galleryPhotos.splice(photoIdx, 1);
              // [Phase D] On ne supprime PAS le fichier Storage (gardé dans le journal)
              const recoverable = removedUrl ? {
                  text: null,
                  media: [{ kind: 'gallery', label: `Photo de ${locNameRm}`, url: removedUrl }],
                  metadata: { locationId: loc.id, locationName: locNameRm, photoIndex: photoIdx }
              } : null;
              History.log('DELETE', `Suppression photo galerie de ${locNameRm}`, {
                  target: { kind: 'location', id: loc.id, label: locNameRm },
                  recoverable: recoverable
              });
              Store.save();
              UI.renderDataTab('locations', els.locContainer);
              CardModal.refresh();
          }
      },
      locationSearchTimeout: null,
      searchLocationAddress: (idx, query) => {
          clearTimeout(Actions.locationSearchTimeout);
          const suggestions = document.getElementById('loc-suggestions-' + idx);
          if(!suggestions) return;
          
          // Sauvegarder la valeur saisie
          if(state.data.locations[idx]) {
              state.data.locations[idx].address = query;
          }
          
          if(!query || query.length < 3) {
              suggestions.classList.remove('visible');
              return;
          }
          
          Actions.locationSearchTimeout = setTimeout(async () => {
              try {
                  // Utiliser l'API Adresse du gouvernement français (plus précise)
                  const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
                  const data = await response.json();
                  
                  if(data.features && data.features.length > 0) {
                      suggestions.innerHTML = data.features.map(f => {
                          const props = f.properties;
                          const coords = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : [null, null];
                          const label = props.label || '';
                          const context = props.context || '';
                          return `<div class="address-suggestion" onclick="app.Actions.selectLocationAddress(${idx}, '${Utils.escape(label).replace(/'/g, "\\'")}', ${coords[1]}, ${coords[0]})">
                              <div class="address-suggestion-main">${Utils.escape(props.name || label.split(',')[0])}</div>
                              <div class="address-suggestion-secondary">${Utils.escape(context)}</div>
                          </div>`;
                      }).join('');
                      suggestions.classList.add('visible');
                  } else {
                      suggestions.innerHTML = '<div class="address-suggestion" style="color:var(--text-sec); cursor:default;">Aucun résultat</div>';
                      suggestions.classList.add('visible');
                  }
              } catch(e) {
                  console.error('Erreur recherche adresse:', e);
                  suggestions.classList.remove('visible');
              }
          }, 300);
      },
      selectLocationAddress: (idx, address, lat, lng) => {
          if(state.data.locations[idx]) {
              state.data.locations[idx].address = address;
              // Coordonnées conservées : elles alimentent la carte du jour de
              // tournage et le lever / coucher du soleil de la feuille de service.
              if(lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
                  state.data.locations[idx].lat = lat;
                  state.data.locations[idx].lng = lng;
              }
              Store.save();
              document.getElementById('loc-address-' + idx).value = address;
              document.getElementById('loc-suggestions-' + idx).classList.remove('visible');
              Utils.toast('Adresse enregistrée', 'success');
          }
      },
      
      // ===================== NOTIFICATIONS & TAGS =====================
      notifyNewProfile: async (person, type) => {
          try {
              const projectTitle = document.getElementById('projectTitle')?.value || 'Un projet';
              const senderName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0] || 'Un réalisateur';
              const typeLabel = type === 'actor' ? 'comédien.ne' : 'technicien.ne';
              
              // Créer un pending claim dans Supabase
              const recipientEmailKey = Utils.sanitizeEmail(person.email);
              const claimId = 'claim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
              
              const claimData = {
                  id: claimId,
                  type: type,
                  localId: person.id,
                  name: person.name,
                  email: person.email,
                  phone: person.phone || '',
                  photo: person.photo || '',
                  bio: person.bio || '',
                  gender: person.gender || '',
                  // Données spécifiques acteur
                  height: person.height || '',
                  age: person.age || '',
                  eyeColor: person.eyeColor || '',
                  hairColor: person.hairColor || '',
                  ethnicity: person.ethnicity || '',
                  languages: person.languages || '',
                  sports: person.sports || '',
                  // Données spécifiques technicien
                  role: person.role || '',
                  department: person.group_id || '',
                  dailyRate: person.dailyRate || '',
                  rateCurrency: person.rateCurrency || '€',
                  // Métadonnées
                  createdBy: state.currentUser.email,
                  createdByName: senderName,
                  projectId: state.currentProjectId,
                  projectTitle: projectTitle,
                  createdAt: new Date().toISOString()
              };
              
              // Stocker la demande de revendication dans les notifications
              const {error: notifErr} = await supabase.from('notifications').insert({
                  user_email: person.email.toLowerCase(),
                  type: 'profile_claim',
                  title: `🎁 Un profil ${typeLabel} a été créé à votre nom`,
                  message: JSON.stringify(claimData),
                  link: state.currentProjectId,
                  read: false
              });
              if(notifErr) { console.error('Erreur envoi notification:', notifErr); }
              
// Email externe direct (plus de message interne : la boite mail est le canal)
              await Messages.sendEmailPing(person.email, person.name, 'claim', {
                  senderName: senderName,
                  projectTitle: projectTitle,
                  typeLabel: typeLabel
              });
              
              Utils.toast(`${person.name} a été notifié(e) par email !`, 'success');
          } catch(e) {
              console.error('Erreur notification:', e);
              Utils.toast('Erreur lors de l\'envoi de la notification', 'error');
          }
      },
      openTagMenu: (e, sceneId) => { e.preventDefault(); if(state.currentRole === 'viewer') return; state.contextSceneId = sceneId; els.tagCtxMenu.innerHTML = ''; state.data.tags.forEach(t => { const div = document.createElement('div'); div.innerHTML = `<span class="tag-dot" style="background:${t.color}"></span> ${Utils.escape(t.name)}`; div.onclick = () => { Actions.setTag(t.id); }; els.tagCtxMenu.appendChild(div); }); const hr = document.createElement('hr'); hr.style.margin="5px 0"; hr.style.border="none"; hr.style.borderTop="1px solid var(--border)"; els.tagCtxMenu.appendChild(hr); const newDiv = document.createElement('div'); newDiv.innerHTML = `<span>➕ Créer un Tag...</span>`; newDiv.onclick = Actions.openTagModal; els.tagCtxMenu.appendChild(newDiv); els.tagCtxMenu.style.display = 'block'; const menuRect = els.tagCtxMenu.getBoundingClientRect(); let top = e.clientY; let left = e.clientX; if(left + 150 > window.innerWidth) left = window.innerWidth - 160; if(top + 200 > window.innerHeight) top = window.innerHeight - 210; if(left < 10) left = 10; if(top < 10) top = 10; els.tagCtxMenu.style.top = top + 'px'; els.tagCtxMenu.style.left = left + 'px'; },
      setTag: (tagId) => { const s = state.data.scenes.find(x => x.id === state.contextSceneId); if(s) { s.tag_id = tagId; Store.save(); UI.renderBoard(); UI.renderScript(); } els.tagCtxMenu.style.display = 'none'; },
      openTagModal: () => { els.tagCtxMenu.style.display='none'; els.tagModal.style.display='flex'; document.getElementById('tag-new-name').value=''; document.getElementById('tag-new-color').value = Actions.tagPalette[0]; Actions.renderTagManagerList(); Actions.renderNewTagPalette(); },
      saveNewTag: () => { const name = document.getElementById('tag-new-name').value.trim(); const color = document.getElementById('tag-new-color').value; if(!name) return Utils.toast("Nom requis", "warning"); const newTag = { id: 't' + Utils.generateUniqueId(), name: name, color: color }; state.data.tags.push(newTag); Store.save(); Actions.setTag(newTag.id); els.tagModal.style.display='none'; },
      // Palette unifiée pour la création ET la recoloration d'un tag existant —
      // un seul jeu de couleurs, choisi une fois pour rester lisible sur fond clair/sombre.
      tagPalette: ['#f44336','#e91e63','#9c27b0','#673ab7','#3f51b5','#2196f3','#00bcd4','#009688','#4caf50','#8bc34a','#ffc107','#ff9800','#795548','#607d8b'],
      pickNewTagColor: (hex) => {
          const input = document.getElementById('tag-new-color');
          if(input) input.value = hex;
          document.querySelectorAll('#tag-new-palette .tag-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.color.toLowerCase() === hex.toLowerCase()));
      },
      renderNewTagPalette: () => {
          const container = document.getElementById('tag-new-palette');
          const input = document.getElementById('tag-new-color');
          if(!container || !input) return;
          const active = input.value || Actions.tagPalette[0];
          container.innerHTML = Actions.tagPalette.map(c => `<span class="tag-swatch${c.toLowerCase() === active.toLowerCase() ? ' active' : ''}" data-color="${c}" style="background:${c};" title="${c}" onclick="app.Actions.pickNewTagColor('${c}')"></span>`).join('');
      },
      // Gestionnaire des tags existants — l'id fait foi (même principe que les fiches
      // depuis v580) : renommer ou recolorer ne touche que name/color, jamais l'id,
      // donc aucune scène liée par tag_id n'est jamais affectée par ces deux actions.
      renderTagManagerList: () => {
          const container = document.getElementById('tag-manager-list');
          if(!container) return;
          container.innerHTML = (state.data.tags || []).map(t => {
              const count = state.data.scenes.filter(s => (s.tag_id || 't1') === t.id).length;
              const locked = t.id === 't1'; // Standard : sentinelle "sans tag" utilisée partout via color==='transparent', ne se recolore ni ne se supprime.
              return `
                  <div style="display:flex; align-items:center; gap:8px; padding:6px 4px; border-bottom:1px solid var(--border);">
                      <input type="color" value="${t.color === 'transparent' ? '#cccccc' : t.color}" title="${locked ? 'Couleur réservée' : 'Changer la couleur'}" style="width:24px; height:24px; padding:0; border:none; border-radius:50%; cursor:${locked ? 'not-allowed' : 'pointer'}; opacity:${locked ? '0.4' : '1'};" ${locked ? 'disabled' : ''} onchange="app.Actions.recolorTagDef('${t.id}', this.value)">
                      <span style="flex:1; font-size:0.9rem;">${Utils.escape(t.name)}</span>
                      <span style="font-size:0.75rem; color:var(--text-sec);">${count} scène${count > 1 ? 's' : ''}</span>
                      <button onclick="app.Actions.renameTagDef('${t.id}')" title="Renommer" style="background:none; border:none; cursor:pointer; font-size:0.95rem;">✏️</button>
                      <button onclick="app.Actions.deleteTagDef('${t.id}')" title="${locked ? 'Le tag Standard ne peut pas être supprimé' : 'Supprimer'}" style="background:none; border:none; cursor:${locked ? 'not-allowed' : 'pointer'}; font-size:0.95rem; opacity:${locked ? '0.3' : '1'};" ${locked ? 'disabled' : ''}>🗑️</button>
                  </div>
              `;
          }).join('');
      },
      renameTagDef: async (tagId) => {
          const tag = (state.data.tags || []).find(t => t.id === tagId);
          if(!tag) return;
          const newName = await ConfirmModal.prompt('Nom du tag :', 'Renommer le tag', 'Nom...', tag.name);
          if(newName !== null && newName.trim()) {
              tag.name = newName.trim();
              Actions.refreshAfterTagChange();
              Utils.toast('Tag renommé', 'success');
          }
      },
      recolorTagDef: (tagId, color) => {
          if(tagId === 't1') return;
          const tag = (state.data.tags || []).find(t => t.id === tagId);
          if(!tag) return;
          tag.color = color;
          Actions.refreshAfterTagChange();
      },
      deleteTagDef: async (tagId) => {
          if(tagId === 't1') return;
          const tag = (state.data.tags || []).find(t => t.id === tagId);
          if(!tag) return;
          const affected = state.data.scenes.filter(s => (s.tag_id || 't1') === tagId);
          const msg = affected.length > 0
              ? `${affected.length} scène${affected.length > 1 ? 's' : ''} porte${affected.length > 1 ? 'nt' : ''} ce tag : ${affected.length > 1 ? 'elles repasseront' : 'elle repassera'} au tag Standard.`
              : `Ce tag n'est utilisé par aucune scène.`;
          if(!await ConfirmModal.show({ title: `Supprimer le tag « ${tag.name} » ?`, message: msg, icon: '🗑️', confirmText: 'Supprimer' })) return;
          affected.forEach(s => { s.tag_id = 't1'; });
          state.data.tags = state.data.tags.filter(t => t.id !== tagId);
          Actions.refreshAfterTagChange();
          Utils.toast('Tag supprimé', 'success');
      },
      refreshAfterTagChange: () => {
          Store.save();
          if(typeof UI !== 'undefined') { if(UI.renderBoard) UI.renderBoard(); if(UI.renderScript) UI.renderScript(); }
          if(typeof BeatBoard !== 'undefined') { if(BeatBoard.renderTagList) BeatBoard.renderTagList(); if(BeatBoard.renderTagLinesList) BeatBoard.renderTagLinesList(); if(BeatBoard.drawTagLines) BeatBoard.drawTagLines(); }
          Actions.renderTagManagerList();
      },
      // ===================== EXPORT PDF (délégué à ActionsExport) =====================
      openExportModal: (...a) => ActionsExport.openExportModal(...a),
      expToggleGroupFold: (...a) => ActionsExport.expToggleGroupFold(...a),
      expOpenStoryboardOptions: (...a) => ActionsExport.expOpenStoryboardOptions(...a),
      expOpenStoryboardScenes: (...a) => ActionsExport.expOpenStoryboardScenes(...a),
      expOpenPlanningDays: (...a) => ActionsExport.expOpenPlanningDays(...a),
      expOpenMoodboardBoards: (...a) => ActionsExport.expOpenMoodboardBoards(...a),
      expOpenModeOptions: (...a) => ActionsExport.expOpenModeOptions(...a),
      expOpenCheckOptions: (...a) => ActionsExport.expOpenCheckOptions(...a),
      expOpenWorkplanOptions: (...a) => ActionsExport.expOpenWorkplanOptions(...a),
      expOpenBoardSeasons: (...a) => ActionsExport.expOpenBoardSeasons(...a),
      expApplyPermissions: (...a) => ActionsExport.expApplyPermissions(...a),
      expToggleAll: (...a) => ActionsExport.expToggleAll(...a),
      expToggleAllCovers: (...a) => ActionsExport.expToggleAllCovers(...a),
      expToggleMerged: (...a) => ActionsExport.expToggleMerged(...a),
      get _expDefaultOrder() { return ActionsExport._expDefaultOrder; },
      get _EXP_ORDER_STORAGE_KEY() { return ActionsExport._EXP_ORDER_STORAGE_KEY; },
      _expReadOrderFromDOM: (...a) => ActionsExport._expReadOrderFromDOM(...a),
      expSaveOrder: (...a) => ActionsExport.expSaveOrder(...a),
      expRestoreOrder: (...a) => ActionsExport.expRestoreOrder(...a),
      expResetOrder: (...a) => ActionsExport.expResetOrder(...a),
      expSetupDragAndDrop: (...a) => ActionsExport.expSetupDragAndDrop(...a),
      confirmExportPDF: (...a) => ActionsExport.confirmExportPDF(...a),
      // Correctif v569 : ces deux façades manquaient. Les boutons radio
      // "Rapports de script" du modal Export (onclick="app.Actions.expToggleSrScenes()")
      // appelaient une fonction inexistante et échouaient silencieusement ;
      // la liste des scènes ne se peuplait jamais à l'ouverture du modal
      // (le garde "if(Actions.expPopulateSrScenes)" était toujours faux).
      expToggleSrScenes: (...a) => ActionsExport.expToggleSrScenes(...a),
      expPopulateSrScenes: (...a) => ActionsExport.expPopulateSrScenes(...a),
  };
