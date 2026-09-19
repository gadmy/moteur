
  const StoreRealtime = {
      // Identifiant de cet onglet : évite d'appliquer son propre broadcast
      clientId: 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36),
      _lastBroadcastAt: 0,
      _refetchTimer: null,
      // v578 : plus utilise depuis que le canal rapide n'envoie qu'un signal et
      // non plus le contenu (cloisonnement). Conserve : le jour ou l'on saura
      // tailler un patch par destinataire, c'est ce plafond qu'il faudra respecter.
      BROADCAST_MAX: 180000, // ~180 Ko : marge sous le plafond broadcast (256 Ko en plan Free)

      // Applique un jeu de clés distantes sur state.data (merge sélectif + rendu)
      applyRemote: (val) => {
          if(!val) return;
          // Phase 0 : merge sélectif — n'écrase pas une clé modifiée localement et non encore sauvegardée
          const base_ = state.savedBaseline;
          if(base_) {
              for(const k in val) {
                  if(JSON.stringify(state.data[k]) !== JSON.stringify(base_[k])) continue; // modif locale en cours : on protège
                  state.data[k] = val[k];
                  base_[k] = JSON.parse(JSON.stringify(val[k]));
              }
          } else {
              state.data = { ...state.data, ...val };
          }
          if(document.activeElement !== els.title) els.title.value = state.data.title;
          // Ne pas re-rendre un éditeur synopsis en cours de saisie (l'écho du save remettrait le curseur au début)
          const _synFocusId = (document.activeElement || {}).id;
          if(_synFocusId !== 'synopsisEditor') Synopsis.renderTree('synopsis');
          if(_synFocusId !== 'shortEditor') Synopsis.renderTree('short');
          if(_synFocusId !== 'longEditor') Synopsis.renderTree('long');
          if(_synFocusId !== 'intentEditor') Synopsis.renderTree('intent');
          if(_synFocusId !== 'directorEditor') Synopsis.renderTree('director');
          if(_synFocusId !== 'producerEditor') Synopsis.renderTree('producer');
          Synopsis.updateBoard();
          // v620 : Vue Scènes retirée — plus besoin de vérifier .script-row,
          // seule la Vue Script (.script-continuous-content) existe encore.
          const activeContinuous = document.activeElement && document.activeElement.closest('.script-continuous-content');
          if(state.currentRole !== 'viewer') { 
              const activeTab = document.querySelector('.tab-content.active').id; 
              if(activeTab === 'tab-board') UI.renderBoard(); 
              if(activeTab === 'tab-script' && !activeContinuous) UI.renderScript();
              if(activeTab === 'tab-stats') Stats.render();
              if(activeTab === 'tab-actors') UI.renderDataTab('actors', els.actorContainer);
          } else { UI.renderAll(); }
          // v570 : un re-rendu efface les bannieres, qui vivent DANS l'onglet, alors que
          // la classe de blocage reste sur le conteneur — on se retrouverait bloque sans
          // explication. On les repose.
          try { if(typeof LockManager !== 'undefined') LockManager.applyUI(); } catch(e) {}
          try { if(typeof Permissions !== 'undefined') Permissions.applyReadOnlyUI(); } catch(e) {}
          // v570 : une mise a jour distante peut porter memberPermissions (le proprietaire
          // vient de changer les acces) — on relit nos droits et on reconstruit la
          // navigation, sans rechargement de page.
          try { if(typeof Permissions !== 'undefined' && val && val.memberPermissions) Permissions.refreshLive(); } catch(e) {}
      },

      // Filet de sécurité : recharge le projet quand le diff n'a pas pu être transmis
      // (patch trop gros, écriture hors save(), payload postgres_changes tronqué)
      refetchRemote: () => {
          if(StoreRealtime._refetchTimer) clearTimeout(StoreRealtime._refetchTimer);
          StoreRealtime._refetchTimer = setTimeout(async () => {
              try {
                  const id = state.currentProjectId;
                  if(!id) return;
                  // v578 (cloisonnement) : on repasse par la fonction serveur, jamais
                  // par la colonne. Un rechargement qui court-circuiterait le filtre
                  // rendrait tout le reste inutile — il suffirait d'attendre qu'un
                  // collegue sauvegarde pour recevoir le projet entier.
                  const { data: row, error } = await supabase.rpc('project_data_for_me', { p_id: id });
                  if(error || !row) return;
                  const scoped = { ...row };
                  if(scoped._scope) { state.dataScope = scoped._scope; }
                  if(Array.isArray(scoped._withheld)) { state.dataMissingKeys = scoped._withheld; }
                  delete scoped._scope; delete scoped._withheld;
                  StoreRealtime.applyRemote(scoped);
              } catch(e) { console.warn('[Realtime] refetch:', e && e.message); }
          }, 400);
      },

      // Diffuse le diff calculé par StoreSave.save aux autres onglets connectés
      broadcastPatch: (patch) => {
          try {
              if(!state.dbListener) return;
              // v616 : le canal broadcast est configuré self:false (on ne reçoit
              // jamais son propre message), donc ce garde-fou ne se déclenchait
              // JAMAIS pour sa propre sauvegarde — seulement pour celle reçue d'un
              // autre onglet. Résultat : l'événement Postgres généré par NOTRE
              // PROPRE écriture déclenchait quand même un rechargement complet du
              // projet, qui pouvait arriver pendant qu'une sauvegarde suivante
              // était encore en vol et ramener une version antérieure (v615). On
              // se marque nous-mêmes ici : inutile de se relire, on sait déjà ce
              // qu'on vient d'écrire.
              StoreRealtime._lastBroadcastAt = Date.now();
              // v578 (cloisonnement) : ON N'ENVOIE PLUS LE CONTENU, seulement le
              // signal. Le canal rapide diffusait le patch tel quel a tous les
              // abonnes du projet : celui qui modifiait le budget l'envoyait donc
              // aussi a ceux qui n'ont pas acces aux Depenses. Le filtre depend du
              // DESTINATAIRE, pas de l'emetteur — un patch juste ne peut pas etre
              // taille a l'avance pour chacun. Chaque poste recharge par la
              // fonction serveur, qui sait pour qui elle repond.
              // COUT ASSUME : un rechargement (debounce 400 ms) au lieu d'une
              // fusion locale. On garde le canal parce qu'il reste bien plus
              // rapide que d'attendre l'evenement Postgres.
              const payload = { from: StoreRealtime.clientId, full: true };
              state.dbListener.send({ type: 'broadcast', event: 'patch', payload: payload });
          } catch(e) { console.warn('[Realtime] broadcast:', e && e.message); }
      },

      startRealtimeListener: (id) => {
          // Pas de realtime en mode fichier local
          if(window.location.protocol === 'file:') return;
          // Supabase Realtime - écouter les changements sur le projet
          if(state.dbListener) {
              supabase.removeChannel(state.dbListener);
          }
          
          state.dbListener = supabase
              .channel('project_' + id, { config: { broadcast: { self: false } } })
              .on('postgres_changes', 
                  { event: 'UPDATE', schema: 'public', table: 'projects', filter: 'id=eq.' + id },
                  (payload) => {
                      // Un broadcast vient d'appliquer ce changement : on ne le refait pas
                      if(Date.now() - StoreRealtime._lastBroadcastAt < 1500) return;
                      // v578 (cloisonnement) : on N'UTILISE PLUS payload.new.data, meme
                      // s'il arrive. Postgres diffusait le projet ENTIER a tous les
                      // abonnes a chaque sauvegarde : filtrer l'ouverture sans fermer
                      // cette porte-la n'aurait servi a rien. La publication est
                      // desormais restreinte aux colonnes de signalement (bloc 5 du
                      // fichier SQL) ; ce message ne dit plus que « ca a bouge », et
                      // c'est la fonction filtree qui fournit le contenu.
                      StoreRealtime.refetchRemote();
                  }
              )
              .on('broadcast', { event: 'patch' },
                  (msg) => {
                      const p = msg && msg.payload;
                      if(!p || p.from === StoreRealtime.clientId) return;
                      StoreRealtime._lastBroadcastAt = Date.now();
                      if(p.full) { StoreRealtime.refetchRemote(); return; }
                      StoreRealtime.applyRemote(p.patch);
                  }
              )
              .subscribe();
      },
      
      loadFromSupabase: async (projectId) => {
          // v578 (cloisonnement) : passe par la fonction serveur comme tous les
          // autres chemins de lecture. On retire _scope avant de fusionner : la
          // carte des droits n'est pas une donnee du projet et n'a rien a faire
          // dans state.data, d'ou elle repartirait en sauvegarde.
          const { data: project, error } = await supabase.rpc('project_data_for_me', { p_id: projectId });
          if(error) console.warn('[Store] loadFromSupabase:', error);
          if(project) {
              const scoped = { ...project };
              if(scoped._scope) { state.dataScope = scoped._scope; }
              if(Array.isArray(scoped._withheld)) { state.dataMissingKeys = scoped._withheld; }
              delete scoped._scope; delete scoped._withheld;
              state.data = { ...state.data, ...scoped };
              UI.renderAll();
          }
      },
      initPresence: (id) => { 
          // Pas de presence en mode fichier local
          if(window.location.protocol === 'file:') return;
          // La présence vient de la table user_presence (module DBPresence) ; ici on définit seulement le rendu des avatars de l'en-tête.
          const renderPresenceNow = () => {
                  const presenceState = {};
                  (state.dbPresence || []).forEach(r => {
                      if(r.project_id === state.currentProjectId) presenceState[r.user_email] = [{ email: r.user_email }];
                  });
                  // Verrous d'abord : ne doit JAMAIS être bloqué par le rendu des avatars
                  try { if(typeof LockManager !== 'undefined' && LockManager.onPresenceChange) LockManager.onPresenceChange(); } catch(e) {}
                  try {
                  els.presenceList.innerHTML = '';
                  const seen = new Set();
                  
                  Object.keys(presenceState).forEach(key => {
                      const users = presenceState[key];
                      users.forEach(u => {
                          const userEmail = u.email || key;
                          if(seen.has(userEmail)) return;
                          seen.add(userEmail);
                          const initials = Utils.getInitials(userEmail);
                          const bg = Utils.getColor(userEmail);
                          const wrapper = document.createElement('div');
                          wrapper.className = 'presence-avatar-wrapper';
                          let roleInfo = { text: '', icon: '', class: '', extraRoles: [] };
                          let personInfo = { name: userEmail.split('@')[0] };
                          try { roleInfo = StoreMigrations.getUserRoleInfo(userEmail) || roleInfo; } catch(err) { console.warn('[Presence] roleInfo KO pour', userEmail, err); }
                          try { personInfo = StoreMigrations.getPersonInfo(userEmail) || personInfo; } catch(err) { console.warn('[Presence] personInfo KO pour', userEmail, err); }
                          if(roleInfo.class) wrapper.classList.add(roleInfo.class);
                          const div = document.createElement('div');
                          div.className = 'presence-avatar';
                          div.style.backgroundColor = bg;
                          div.innerText = initials;
                          wrapper.appendChild(div);
                          if(roleInfo.icon) {
                              const badge = document.createElement('span');
                              badge.className = 'role-icon';
                              badge.innerText = roleInfo.icon;
                              wrapper.appendChild(badge);
                          }
                          if(roleInfo.extraRoles && roleInfo.extraRoles.length > 0) {
                              roleInfo.extraRoles.forEach((r, idx) => {
                                  const extraBadge = document.createElement('span');
                                  extraBadge.className = 'role-icon extra-role';
                                  extraBadge.style.right = (-2 + (idx + 1) * 12) + 'px';
                                  extraBadge.innerText = r.icon;
                                  wrapper.appendChild(extraBadge);
                              });
                          }
                          const tooltip = document.createElement('div');
                          tooltip.className = 'avatar-tooltip';
                          let tooltipHtml = '<div class="avatar-tooltip-name">' + Utils.escape(personInfo.name || userEmail.split('@')[0]) + '</div>';
                          if(roleInfo.text) tooltipHtml += '<div class="avatar-tooltip-role">' + Utils.escape(roleInfo.text) + '</div>';
                          if(roleInfo.extraRoles && roleInfo.extraRoles.length > 0) {
                              roleInfo.extraRoles.forEach(r => {
                                  tooltipHtml += '<div class="avatar-tooltip-role">' + r.icon + ' ' + Utils.escape(r.name) + '</div>';
                              });
                          }
                          tooltip.innerHTML = tooltipHtml;
                          wrapper.appendChild(tooltip);
                          els.presenceList.appendChild(wrapper);
                      });
                  });
                  } catch(e) { console.warn('[Presence] rendu avatars échoué:', e); }
          };
          state._renderPresenceNow = renderPresenceNow;
          renderPresenceNow();
      }
  };

  // StoreSave — sous-module B.1.5 : sauvegarde Supabase avec retry exponentiel + debounce + flush