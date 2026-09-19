
  const ActiveProfile = {
      KEY: 'moteur_active_profile_id',
      MULTI: false, // mono-profil : un compte = un profil (sélecteur et bascule désactivés)
      _currentId: null,
      
      // Renvoie l'id du profil actif (localStorage ou premier profil si rien)
      getId: () => {
          // Mono-profil : l'unique profil du compte fait foi (le localStorage n'est plus une source)
          try { return (PublicProfile && PublicProfile.profiles && PublicProfile.profiles[0] && PublicProfile.profiles[0].id) || null; } catch(e) { return null; }
      },
      
      setId: (profileId) => {
          try {
              if(profileId) localStorage.setItem(ActiveProfile.KEY, profileId);
              else localStorage.removeItem(ActiveProfile.KEY);
          } catch(e) {}
          ActiveProfile._currentId = profileId;
          ActiveProfile.renderAllSelectors();
      },
      
      clear: () => {
          ActiveProfile.setId(null);
      },
      
      // S'assure qu'un profil actif est bien défini (au minimum le premier)
      ensureValid: () => {
          if(!PublicProfile || !PublicProfile.profiles || PublicProfile.profiles.length === 0) return;
          const currentId = ActiveProfile.getId();
          const exists = PublicProfile.profiles.some(p => p.id === currentId);
          if(!exists) {
              ActiveProfile.setId(PublicProfile.profiles[0].id);
          }
      },
      
      // Génère le HTML du bouton+menu à injecter
      // I5f fix: si on est dans un projet, ne montrer que les profils qui y sont membres
      buildSelectorHtml: async () => {
          if(!ActiveProfile.MULTI) return ''; // mono-profil : pas de sélecteur de profil actif
          let profiles = PublicProfile?.profiles || [];
          if(profiles.length === 0) return '';
          
          // Si on est dans un projet ouvert, filtrer sur les profils qui sont membres
          let inProject = false;
          if(state.currentProjectId && state.currentUser?.email) {
              try {
                  const { data: memberships, error: errMemb } = await supabase
                      .from('project_members')
                      .select('profile_id')
                      .eq('project_id', state.currentProjectId)
                      .eq('email', state.currentUser.email.toLowerCase());
                  if(errMemb) console.warn('[PublicProfile] memberships:', errMemb);
                  
                  if(memberships && memberships.length > 0) {
                      inProject = true;
                      const allowedIds = memberships
                          .map(m => m.profile_id)
                          .filter(id => id != null);
                      
                      if(allowedIds.length > 0) {
                          profiles = profiles.filter(p => allowedIds.includes(p.id));
                      }
                      // Si memberships existent mais tous avec profile_id NULL (ancien projet),
                      // on laisse tous les profils dispo (fallback legacy)
                  }
              } catch(e) {
                  console.warn('Erreur filtrage profils projet:', e);
              }
          }
          
          if(profiles.length === 0) {
              // Cas rare : on est dans un projet mais aucun de nos profils n'y est lié
              return `<button class="theme-btn" disabled style="opacity:0.7; cursor:default;" title="Aucun profil rattaché à ce projet">👤 —</button>`;
          }
          
          // Si le profil actif n'est plus dans la liste filtrée, le remplacer par le premier dispo
          const activeId = ActiveProfile.getId();
          if(inProject && activeId && !profiles.some(p => p.id === activeId)) {
              ActiveProfile.setId(profiles[0].id);
          }
          
          // Prendre le profil actif dans la liste filtrée
          const current = profiles.find(p => p.id === ActiveProfile.getId()) || profiles[0];
          const currentName = current ? (current.name || current.assoName || current.entName || 'Profil') : 'Profil';
          const currentType = current ? current.type : '';
          const typeIcon = { actor: '🎭', crew: '🎥', association: '🏛️', enterprise: '🏢' }[currentType] || '👤';
          
          // Si un seul profil, pas besoin de menu
          if(profiles.length === 1) {
              const title = inProject ? 'Seul profil rattaché à ce projet' : 'Profil actif (unique)';
              return `<button class="theme-btn" disabled style="opacity:0.9; cursor:default;" title="${title}">${typeIcon} ${Utils.escape(currentName)}</button>`;
          }
          
          // Plusieurs profils : menu déroulant
          const options = profiles.map(p => {
              const name = p.name || p.assoName || p.entName || 'Sans nom';
              const icon = { actor: '🎭', crew: '🎥', association: '🏛️', enterprise: '🏢' }[p.type] || '👤';
              const isActive = current && p.id === current.id;
              return `<div class="active-profile-option" data-profile-id="${p.id}" onclick="app.ActiveProfile.selectAndClose('${p.id}')" style="padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border); ${isActive ? 'background:var(--bg); font-weight:bold;' : ''}">${icon} ${Utils.escape(name)} ${isActive ? ' ✓' : ''}</div>`;
          }).join('');
          
          const titleText = inProject ? 'Profils rattachés à ce projet' : 'Profil actif utilisé sur le site';
          const headerText = inProject ? 'PROFILS DU PROJET' : 'PROFIL ACTIF';
          
          return `
              <div class="active-profile-selector" style="position:relative; display:inline-block;">
                  <button class="theme-btn" onclick="app.ActiveProfile.toggleMenu(this)" title="${titleText}">${typeIcon} ${Utils.escape(currentName)} ▾</button>
                  <div class="active-profile-menu" style="display:none; position:absolute; top:100%; right:0; margin-top:4px; min-width:240px; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:var(--z-dropdown);">
                      <div style="padding:8px 12px; font-size:0.75rem; color:var(--text-sec); border-bottom:1px solid var(--border); font-weight:bold;">${headerText}</div>
                      ${options}
                  </div>
              </div>
          `;
      },
      
      toggleMenu: (btn) => {
          const menu = btn.parentElement.querySelector('.active-profile-menu');
          if(!menu) return;
          const isOpen = menu.style.display === 'block';
          // Fermer tous les menus ouverts d'abord
          document.querySelectorAll('.active-profile-menu').forEach(m => m.style.display = 'none');
          menu.style.display = isOpen ? 'none' : 'block';
          if(!isOpen) {
              // Fermer au clic extérieur
              setTimeout(() => {
                  const closeOnClickOutside = (e) => {
                      if(!menu.parentElement.contains(e.target)) {
                          menu.style.display = 'none';
                          document.removeEventListener('click', closeOnClickOutside);
                      }
                  };
                  document.addEventListener('click', closeOnClickOutside);
              }, 0);
          }
      },
      
      selectAndClose: (profileId) => {
          ActiveProfile.setId(profileId);
          document.querySelectorAll('.active-profile-menu').forEach(m => m.style.display = 'none');
          const profile = PublicProfile.profiles.find(p => p.id === profileId);
          const name = profile ? (profile.name || profile.assoName || profile.entName || 'Profil') : 'Profil';
          Utils.toast(`Profil actif : ${name}`, 'info', 2000);
          
          // I5e: recharger la liste des projets (si la vue Mes Projets est ouverte)
          try {
              if(typeof UI?.renderProjectList === 'function') UI.renderProjectList();
          } catch(e) { /* silencieux */ }
      },
      
      // Injecte le sélecteur à côté de tous les boutons "🌓 Mode" du DOM
      renderAllSelectors: async () => {
          const html = await ActiveProfile.buildSelectorHtml();
          // On ne ré-injecte QUE dans des conteneurs marqués pour éviter les doublons
          document.querySelectorAll('.active-profile-slot').forEach(slot => {
              slot.innerHTML = html;
          });
      },
      
      // Crée (si absent) un slot à côté de chaque bouton Mode et y injecte le sélecteur
      // Appelé après le chargement des profils
      attachToDom: () => {
          document.querySelectorAll('button.theme-btn[onclick*="toggleTheme"]').forEach(btn => {
              // Vérifier qu'il n'y a pas déjà un slot juste après
              if(btn.nextElementSibling && btn.nextElementSibling.classList && btn.nextElementSibling.classList.contains('active-profile-slot')) return;
              const slot = document.createElement('span');
              slot.className = 'active-profile-slot';
              slot.style.marginLeft = '8px';
              btn.parentElement.insertBefore(slot, btn.nextSibling);
          });
          ActiveProfile.renderAllSelectors();
      }
  };

  // ========== SESSION MANAGER ==========
  // Gère la session unique par compte (multi-onglets OK, multi-ordinateurs bloqué)
  // ========== WINDOW MANAGER (sous-onglets en fenêtres flottantes) — Phase A ==========