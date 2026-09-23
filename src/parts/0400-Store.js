
  const Store = {
      // D2 : versioning du schéma de données.
      // À chaque évolution structurelle de state.data : incrémenter SCHEMA_VERSION
      // et ajouter une fonction au registre _schemaMigrations (clé = version cible).
      SCHEMA_VERSION: 1,
      _schemaMigrations: {
          // 2: (data) => { /* migration v1 -> v2 */ },
      },
      runSchemaMigrations: (data) => {
          let v = (typeof data._schemaVersion === 'number') ? data._schemaVersion : 1;
          while(v < Store.SCHEMA_VERSION) {
              v++;
              const fn = Store._schemaMigrations[v];
              if(typeof fn === 'function') {
                  try { fn(data); } catch(e) { console.error('[Schema] Migration vers v' + v + ' échouée :', e); }
              }
              data._schemaVersion = v;
          }
      },
      // V62: Initialisation du tableau snapshots
      getEmpty: () => ({ _schemaVersion: Store.SCHEMA_VERSION, title: "Nouveau Film", filmId: 'film_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11), synopsis: "", synopsisShort: "", synopsisLong: "", synopsisIntent: "", directorNote: "", producerNote: "", scriptMeta: { author: "", coAuthor: "", contact: "", copyright: "", draft: "Premier jet", draftDate: "", source: "", notes: "" }, snapshots: [], scenes: [], characters: [], actors: [], locations: [], resources: [], crew: [], shootingDays: [], tags: CONFIG.defaultTags, groups: [...CONFIG.defaultGroups, ...CONFIG.crewGroups], shots: [], counter: 1, uiConfig: { tabColors: {}, categoryColors: {}, subColors: {}, tabsOrder: [], categoriesOrder: [], hiddenTabs: [] }, budget: { total: 0, currency: '€', manager: '', managerEmailNotif: true, envelopes: {}, deptManagers: {} }, expenses: [], /* needsCrew / needsActors retires le 1er septembre : doublons morts de crewNeeds / actorNeeds, les seuls que l'ecran ecrit. Leur presence ici a fait ecrire l'export PDF sur les mauvaises clefs pendant des mois. */ presentation: { title: '', genre: '', format: '', duration: '', productionType: '', description: '', team: [], associations: [], enterprises: [], crewNeeds: {}, actorNeeds: [], image: '' }, memberPermissions: {}, chatChannels: [], chatExtraMembers: [], workplanOverrides: {}, scriptReports: {}, contracts: [], episodes: [], seasons: [] }),
      getProjectsList: async () => { 
          if(!state.currentUser) return []; 
          const myEmail = state.currentUser.email.toLowerCase();
          const activeProfileId = ActiveProfile.getId();
          
          // I5e : récupérer les projets où je suis membre AVEC le profil actif
          // (fallback sur email si profile_id est NULL pour les anciens projets)
          // v570 : les invitations en attente d'acceptation n'apparaissent PAS dans la liste
          // des projets (elles apparaissent en cartes grisees, voir Invitations.buildCard).
          let membershipQuery = supabase
              .from('project_members')
              .select('project_id, role, profile_id')
              .eq('email', myEmail)
              .eq('status', 'accepted');
          
          const { data: memberships, error: memberError } = await membershipQuery;
          
          if (memberError || !memberships) return [];
          
          // Filtrer par profil actif : garder les memberships où profile_id matche OU où profile_id est NULL (legacy)
          const filteredMemberships = memberships; // mono-profil : plus de filtre par profil
          
          // v578 (cloisonnement) : l'ecran d'accueil chargeait le JSON COMPLET de
          // chaque projet, juste pour en tirer trois valeurs — la priorite, l'ordre
          // et le poids. Tous les projets partages etaient donc entierement dans la
          // page AVANT qu'on en ouvre un seul. On demande maintenant ces trois
          // valeurs, et rien d'autre, a projects_meta_for_me.
          const metaFor = async (ids) => {
              const out = {};
              if(!ids || ids.length === 0) return out;
              try {
                  const { data: rows, error } = await supabase.rpc('projects_meta_for_me', { p_ids: ids });
                  if(error) { console.warn('[Cloisonnement] projects_meta_for_me:', error.message); return out; }
                  (rows || []).forEach(r => { out[r.id] = r; });
              } catch(e) { console.warn('[Cloisonnement] projects_meta_for_me:', e && e.message); }
              return out;
          };
          
          if (filteredMemberships.length === 0) {
              // Fallback : projets dont je suis owner mais pas encore dans project_members
              const { data: ownedProjects, error: errOwned } = await supabase
                  .from('projects')
                  .select('id, title, created_at, owner_email, owner_profile_id, project_type, episode_count')
                  .eq('owner_email', myEmail)
                  .is('deleted_at', null);
              if(errOwned) console.warn('[Projects] fallback ownedProjects:', errOwned);
              
              if (!ownedProjects) return [];
              
              const filtered = ownedProjects; // mono-profil
              const metaOwned = await metaFor(filtered.map(p => p.id));
              
              return filtered.map(p => ({ 
                  id: p.id, 
                  title: p.title, 
                  date: new Date(p.created_at).toLocaleDateString(), 
                  owner: p.owner_email, 
                  role: 'owner',
                  project_type: p.project_type || 'film',
                  episodeCount: p.episode_count || 0,
                  priority: metaOwned[p.id]?.priority || null,
                  order: metaOwned[p.id]?.sort_order,
                  weightBytes: metaOwned[p.id]?.weight_bytes || 0
              }));
          }
          
          const projectIds = filteredMemberships.map(m => m.project_id);
          const { data: projects, error: projError } = await supabase
              .from('projects')
              .select('id, title, created_at, owner_email, owner_profile_id, project_type, episode_count')
              .in('id', projectIds)
              .is('deleted_at', null);
          
          if (projError || !projects) return [];
          const metaShared = await metaFor(projects.map(p => p.id));
          
          return projects.map(p => {
              const membership = filteredMemberships.find(m => m.project_id === p.id);
              return { 
                  id: p.id, 
                  title: p.title, 
                  date: new Date(p.created_at).toLocaleDateString(), 
                  owner: p.owner_email, 
                  role: membership?.role || 'member',
                  project_type: p.project_type || 'film',
                  episodeCount: p.episode_count || 0,
                  priority: metaShared[p.id]?.priority || null,
                  order: metaShared[p.id]?.sort_order,
                  weightBytes: metaShared[p.id]?.weight_bytes || 0
              };
          });
      },
      createNewProject: async () => { 
          if(!state.currentUser) return; 
          Store.showProjectTypeModal();
      },
      
      // Phase S2 + S7 : modale de choix Film / Série
      showProjectTypeModal: () => {
          // Reset du choix précédent
          Store._pendingProjectType = null;
          Store._pendingEpisodeCount = 1;
          Store._pendingSeasonCount = 1;
          
          const modal = document.createElement('div');
          modal.id = 'project-type-modal';
          modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
          
          modal.innerHTML = `
              <div class="modal-panel-450">
                  <h3 style="margin:0 0 15px; color:var(--text-main);">🎬 Nouveau projet</h3>
                  <p style="color:var(--text-sec); margin-bottom:20px; font-size:0.9rem;">Quel type de projet veux-tu créer ?</p>
                  
                  <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
                      <label style="display:flex; align-items:flex-start; gap:12px; cursor:pointer; padding:14px; border-radius:8px; border:2px solid var(--primary); background:rgba(43, 110, 246, 0.08); transition: all 0.2s;">
                          <input type="radio" name="proj-type" value="film" checked style="width:18px; height:18px; margin-top:2px;" onchange="app.Store.onProjectTypeChange('film')">
                          <div>
                              <div style="font-weight:600; font-size:1rem;">🎬 Film / Court-métrage / Clip</div>
                              <div style="font-size:0.85rem; color:var(--text-sec); margin-top:3px;">Un projet unique avec son scénario, son dépouillement, son planning.</div>
                          </div>
                      </label>
                      
                      <label style="display:flex; align-items:flex-start; gap:12px; cursor:pointer; padding:14px; border-radius:8px; border:1px solid var(--border); background:var(--bg); transition: all 0.2s;">
                          <input type="radio" name="proj-type" value="series" style="width:18px; height:18px; margin-top:2px;" onchange="app.Store.onProjectTypeChange('series')">
                          <div>
                              <div style="font-weight:600; font-size:1rem;">📺 Série / Mini-série / Web-série</div>
                              <div style="font-size:0.85rem; color:var(--text-sec); margin-top:3px;">Plusieurs épisodes partageant le même casting, décors, équipe...</div>
                          </div>
                      </label>
                  </div>
                  
                  <div id="proj-type-episodes" style="display:none; margin-bottom:20px; padding:12px; background:var(--bg); border-radius:8px; border:1px solid var(--border);">
                      <div style="display:flex; gap:20px; flex-wrap:wrap;">
                          <div>
                              <label style="display:block; font-weight:600; margin-bottom:8px; font-size:0.9rem;">📺 Nombre de saisons :</label>
                              <input type="number" id="proj-season-count" min="1" max="20" value="1" style="width:80px; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main); font-size:1rem;" onchange="app.Store._pendingSeasonCount = parseInt(this.value) || 1">
                          </div>
                          <div>
                              <label style="display:block; font-weight:600; margin-bottom:8px; font-size:0.9rem;">🎬 Épisodes par saison :</label>
                              <input type="number" id="proj-episode-count" min="1" max="50" value="1" style="width:80px; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main); font-size:1rem;" onchange="app.Store._pendingEpisodeCount = parseInt(this.value) || 1">
                          </div>
                      </div>
                      <div style="font-size:0.8rem; color:var(--text-sec); margin-top:10px;">Tu pourras en ajouter/supprimer plus tard. Chaque saison aura le même nombre d'épisodes au départ.</div>
                  </div>
                  
                  <div class="flex-end-mt20">
                      <button onclick="document.getElementById('project-type-modal').remove()" class="btn btn--outline">Annuler</button>
                      <button onclick="app.Store.confirmProjectType()" class="btn btn--success">✓ Continuer</button>
                  </div>
              </div>
          `;
          
          document.body.appendChild(modal);
          Store._pendingProjectType = 'film';
      },
      
      // Appelé quand on change le radio Film/Série
      onProjectTypeChange: (type) => {
          Store._pendingProjectType = type;
          document.getElementById('proj-type-episodes').style.display = (type === 'series') ? 'block' : 'none';
          // Mise à jour visuelle des labels
          document.querySelectorAll('input[name="proj-type"]').forEach(rb => {
              const lbl = rb.closest('label');
              if(rb.checked) {
                  lbl.style.background = 'rgba(43, 110, 246, 0.08)';
                  lbl.style.borderColor = 'var(--primary)';
                  lbl.style.borderWidth = '2px';
              } else {
                  lbl.style.background = 'var(--bg)';
                  lbl.style.borderColor = 'var(--border)';
                  lbl.style.borderWidth = '1px';
              }
          });
      },
      
      // Valide le choix du type et enchaîne sur la modale de profil
      confirmProjectType: () => {
          const modal = document.getElementById('project-type-modal');
          if(modal) modal.remove();
          // _pendingProjectType et _pendingEpisodeCount sont déjà remplis
          // On enchaîne sur la modale de choix du profil propriétaire
          Store.showOwnerRoleModal();
      },
      doCreateProject: async (selectedProfiles) => {
          const myEmail = state.currentUser.email.toLowerCase();
          const empty = Store.getEmpty();
          
          // Phase S2 + S7 : prendre en compte le type de projet choisi
          const projectType = Store._pendingProjectType || 'film';
          const episodeCount = Math.max(1, Math.min(50, parseInt(Store._pendingEpisodeCount) || 1));
          const seasonCount = Math.max(1, Math.min(20, parseInt(Store._pendingSeasonCount) || 1));
          
          if(projectType === 'series') {
              empty.title = "Nouvelle Série";
              // Créer les saisons + leurs épisodes
              empty.seasons = [];
              empty.episodes = [];
              for(let s = 1; s <= seasonCount; s++) {
                  const seasonId = crypto.randomUUID();
                  empty.seasons.push({
                      id: seasonId,
                      number: s,
                      title: '',
                      description: ''
                  });
                  // Créer episodeCount épisodes dans cette saison
                  for(let e = 1; e <= episodeCount; e++) {
                      empty.episodes.push({
                          id: crypto.randomUUID(),
                          seasonId: seasonId,
                          number: e,
                          title: '',
                          synopsis: '',
                          status: 'draft'
                      });
                  }
              }
          }
          
          // Nettoyer le state temporaire
          Store._pendingProjectType = null;
          Store._pendingEpisodeCount = 1;
          Store._pendingSeasonCount = 1;
          
          const ownerName = state.userProfile?.displayName || state.userProfile?.name || myEmail.split('@')[0];
          const ownerRoles = []; // Pour les badges sur l'avatar
          
          // Ajouter chaque profil sélectionné dans la bonne section
          selectedProfiles.forEach((profile, idx) => {
              if(profile.type === 'actor') {
                  const actorEntry = {
                      id: 'actor_owner_' + Date.now() + '_' + idx,
                      name: profile.data.name || ownerName,
                      email: myEmail,
                      photo: profile.data.photo || '',
                      phone: profile.data.phone || '',
                      gender: profile.data.gender || '',
                      age: profile.data.age || '',
                      height: profile.data.height || '',
                      city: profile.data.city || '',
                      languages: profile.data.languages || '',
                      skills: profile.data.skills || '',
                      experience: profile.data.experience || '',
                      notes: profile.data.notes || '',
                      isOwner: true,
                      publicProfileId: profile.data.id || myEmail,
                      claimedAt: new Date().toISOString(),
                      claimedBy: myEmail,
                      createdAt: new Date().toISOString()
                  };
                  empty.actors.push(actorEntry);
                  ownerRoles.push({ icon: profile.icon, name: profile.name });
              } else if(profile.type === 'crew') {
                  const crewEntry = {
                      id: 'crew_owner_' + Date.now() + '_' + idx,
                      name: profile.data.name || ownerName,
                      email: myEmail,
                      role: profile.data.role || profile.name,
                      photo: profile.data.photo || '',
                      phone: profile.data.phone || '',
                      department: profile.data.department || '',
                      rate: profile.data.rate || '',
                      notes: profile.data.notes || '',
                      isOwner: true,
                      publicProfileId: profile.data.id || myEmail,
                      claimedAt: new Date().toISOString(),
                      claimedBy: myEmail,
                      createdAt: new Date().toISOString()
                  };
                  empty.crew.push(crewEntry);
                  ownerRoles.push({ icon: profile.icon, name: profile.name });
              }
          });
          
          if(selectedProfiles.length === 0) {
              empty.crew.push({
                  id: 'crew_owner_' + Utils.generateUniqueId(),
                  name: ownerName,
                  email: myEmail,
                  role: 'Porteur de projet',
                  phone: state.userProfile?.phone || '',
                  photo: state.userProfile?.photo || '',
                  isOwner: true,
                  ownerRoles: [],
                  createdAt: new Date().toISOString()
              });
          } else {
              const firstCrew = empty.crew.find(c => c.isOwner);
              if(firstCrew) {
                  firstCrew.ownerRoles = ownerRoles;
              }
          }
          
          // I5d : récupérer l'id du profil propriétaire (premier profil passé, ou null si aucun)
          const ownerProfileId = (selectedProfiles && selectedProfiles[0]?.profileId) || null;
          
          // Garde : session réellement valide (sinon la requête part en anon -> RLS 42501)
          let _sess = null;
          try { const { data: _sd, error: _errSess } = await supabase.auth.getSession(); if(_errSess) console.warn('[Projects] getSession:', _errSess); _sess = _sd && _sd.session; } catch(_) {}
          if(!_sess || !_sess.access_token) {
              Utils.toast('Session expirée. Reconnecte-toi puis réessaie.', 'error', 9000);
              return;
          }
          const _jwtEmail = (_sess.user && _sess.user.email || '').toLowerCase();
          if(_jwtEmail && _jwtEmail !== myEmail) {
              console.warn('[Projects] email session != email state', _jwtEmail, myEmail);
          }

          // Créer le projet dans Supabase
          const { data: newProject, error } = await supabase
              .from('projects')
              .insert({
                  owner_email: _jwtEmail || myEmail,
                  owner_profile_id: ownerProfileId, // I5d : profil propriétaire
                  project_type: projectType, // S2 : film ou series
                  title: empty.title,
                  description: '',
                  type: 'film',
                  status: 'draft',
                  data: empty
              })
              .select()
              .single();
          
          if (error) {
              console.error('Erreur création projet:', error);
              Utils.toast('Erreur création projet : ' + (error.message || error.code || 'inconnue'), 'error', 10000);
              return;
          }
          
          // Ajouter le propriétaire comme membre (avec son profil)
          const {error: memErr} = await supabase.from('project_members').insert({
              project_id: newProject.id,
              email: myEmail,
              profile_id: ownerProfileId, // I5d : profil avec lequel on est owner
              role: 'owner'
          });
          if(memErr) { console.error('Erreur ajout membre:', memErr); Utils.toast('Erreur ajout membre : ' + (memErr.message || ''), 'error', 8000); }
          
          Store.loadProject(newProject.id);
          History.log('ADD', 'Création du projet');
      },
      showOwnerRoleModal: async () => {
          // I5c : utiliser PublicProfile.profiles (multi-profils)
          // S'assurer qu'ils sont chargés
          if(!PublicProfile.profiles || PublicProfile.profiles.length === 0) {
              try { await PublicProfile.loadProfiles(); } catch(e) { console.warn('[Projects] Chargement des profils échoué (modale rôle):', e && e.message); }
          }
          
          const userProfiles = (PublicProfile.profiles || []).map(p => {
              const icon = p.type === 'actor' ? '🎭' 
                        : p.type === 'crew' ? '🎥' 
                        : p.type === 'association' ? '🏛️' 
                        : p.type === 'enterprise' ? '🏢' 
                        : '👤';
              const label = p.type === 'actor' ? 'Comédien·ne'
                         : p.type === 'crew' ? 'Technicien·ne'
                         : p.type === 'association' ? 'Association'
                         : p.type === 'enterprise' ? 'Entreprise'
                         : 'Profil';
              const name = p.name || p.assoName || p.entName || 'Sans nom';
              return { type: p.type, icon, name, label, profileId: p.id, data: p };
          });
          
          const modal = document.createElement('div');
          modal.id = 'owner-role-modal';
          modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
          
          let contentHtml = '';
          if(userProfiles.length === 0) {
              // Pas de profil créé : on autorise quand même la création, mais sans owner_profile_id
              contentHtml = `
                  <div style="padding:15px; background:rgba(245, 158, 11, 0.1); border-left:3px solid #f59e0b; border-radius:6px; margin-bottom:15px;">
                      <p style="margin:0 0 8px; font-weight:bold; color:#78350f;">⚠️ Aucun profil public trouvé</p>
                      <p style="margin:0; font-size:0.85rem; color:var(--text-sec);">Le projet sera créé sans être rattaché à un profil précis. Pour une meilleure expérience, créez d'abord votre profil dans "Mon Profil".</p>
                  </div>
              `;
          } else {
              // I5c : radio unique (un seul propriétaire)
              const preselectedId = ActiveProfile.getId() || userProfiles[0].profileId;
              contentHtml = `
                  <p style="color:var(--text-sec); margin-bottom:15px; font-size:0.9rem;">Depuis quel profil créez-vous ce projet ?</p>
                  <div style="display:flex; flex-direction:column; gap:10px; max-height:300px; overflow-y:auto; padding:5px;">
              `;
              userProfiles.forEach((p, idx) => {
                  const isSelected = p.profileId === preselectedId;
                  contentHtml += `
                      <label style="display:flex; align-items:center; gap:12px; cursor:pointer; padding:12px; border-radius:8px; border:1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}; background:${isSelected ? 'rgba(43, 110, 246, 0.1)' : 'var(--bg)'}; transition: all 0.2s;">
                          <input type="radio" name="owner-profile" class="owner-profile-radio" data-index="${idx}" data-profile-id="${p.profileId}" ${isSelected ? 'checked' : ''} style="width:18px; height:18px;">
                          <span class="fs-15">${p.icon}</span>
                          <div>
                              <div class="fw-600">${Utils.escape(p.name)}</div>
                              <div style="font-size:0.8rem; color:var(--text-sec);">${p.label}</div>
                          </div>
                      </label>
                  `;
              });
              contentHtml += '</div>';
          }
          
          modal.innerHTML = `
              <div class="modal-panel-450">
                  <h3 style="margin:0 0 15px; color:var(--text-main);">🎬 Nouveau Projet</h3>
                  <p class="mb-10">Vous serez <strong class="text-primary">👑 Propriétaire</strong> de ce projet.</p>
                  
                  ${contentHtml}
                  
                  <div class="flex-end-mt20">
                      <button onclick="document.getElementById('owner-role-modal').remove()" class="btn btn--outline">Annuler</button>
                      <button onclick="app.Store.confirmOwnerRole()" class="btn btn--success">✓ Créer le projet</button>
                  </div>
              </div>
          `;
          
          document.body.appendChild(modal);
          modal.userProfiles = userProfiles;
          
          // Style visuel pour le radio sélectionné
          modal.querySelectorAll('.owner-profile-radio').forEach(rb => {
              rb.addEventListener('change', () => {
                  // Réinitialiser tous les labels
                  modal.querySelectorAll('.owner-profile-radio').forEach(r => {
                      const lbl = r.closest('label');
                      lbl.style.background = 'var(--bg)';
                      lbl.style.borderColor = 'var(--border)';
                  });
                  // Activer le sélectionné
                  if(rb.checked) {
                      const lbl = rb.closest('label');
                      lbl.style.background = 'rgba(43, 110, 246, 0.1)';
                      lbl.style.borderColor = 'var(--primary)';
                  }
              });
          });
      },
      confirmOwnerRole: () => {
          const modal = document.getElementById('owner-role-modal');
          const userProfiles = modal.userProfiles || [];
          const checkedRadio = modal.querySelector('.owner-profile-radio:checked');
          
          let ownerProfile = null;
          if(checkedRadio) {
              const idx = parseInt(checkedRadio.dataset.index);
              if(userProfiles[idx]) {
                  ownerProfile = userProfiles[idx];
              }
          }
          
          modal.remove();
          // Si aucun profil n'a été sélectionné mais qu'il y en a, prendre le premier
          // Si aucun profil du tout, ownerProfile reste null (création sans owner_profile_id)
          if(!ownerProfile && userProfiles.length > 0) {
              ownerProfile = userProfiles[0];
          }
          Store.doCreateProject(ownerProfile ? [ownerProfile] : []);
      },
      createNewProjectFromImport: async (importedData) => {
          if(!state.currentUser) return;
          const myEmail = state.currentUser.email.toLowerCase();
          
          if(!importedData.groups || importedData.groups.length === 0) importedData.groups = CONFIG.defaultGroups;
          if(!importedData.tags || importedData.tags.length === 0) importedData.tags = CONFIG.defaultTags;
          if(!importedData.actors) importedData.actors = [];
          if(!importedData.snapshots) importedData.snapshots = [];
          
          // Créer le projet dans Supabase
          const { data: newProject, error } = await supabase
              .from('projects')
              .insert({
                  owner_email: myEmail,
                  title: importedData.title,
                  description: '',
                  type: 'film',
                  status: 'draft',
                  data: importedData
              })
              .select()
              .single();
          
          if (error) {
              console.error('Erreur import:', error);
              Utils.toast("Erreur lors de l'importation", "error");
              return;
          }
          
          // Ajouter le propriétaire comme membre
          const {error: memErr2} = await supabase.from('project_members').insert({
              project_id: newProject.id,
              email: myEmail,
              role: 'owner'
          });
          if(memErr2) { console.error('Erreur ajout membre:', memErr2); Utils.toast('Erreur ajout membre : ' + (memErr2.message || ''), 'error', 8000); }
          
          Utils.toast("Importation Wizard réussie !", "success");
          Store.loadProject(newProject.id);
      },
      // Sortir volontairement d'un projet vers le dashboard (oublie la mémoire de navigation)
      exitToDashboard: () => {
          NavMemory.clear();
          UI.showDashboard();
          // I5f: rafraîchir le sélecteur de profils (sortie du contexte projet)
          try { ActiveProfile.renderAllSelectors(); } catch(e) {}
      },
      
      // v578 (cloisonnement) : ce projet m'est-il transmis PARTIELLEMENT ?
      // Vrai des que le serveur a retire au moins une cle. Toute operation qui
      // remplace ou exporte le projet ENTIER doit s'y refuser : elle
      // travaillerait sur une copie amputee sans le savoir. Une seule question,
      // posee au meme endroit par tout le monde.
      isPartial: () => (state.dataMissingKeys || []).length > 0,

      loadProject: async (id) => {
          if(!state.currentUser) return;
          // Flush immédiat des modifs debouncées du projet courant (si on change de projet)
          if(state.currentProjectId && state.currentProjectId !== id) {
              await Store.saveFlush();
          }
          LoadingScreen.show("Ouverture du projet...");
          try {
              const myEmail = state.currentUser.email.toLowerCase();
              const activeProfileId = ActiveProfile.getId();
              
              // I5g: récupérer TOUTES les memberships (peut y en avoir plusieurs pour le même email)
              const { data: memberships, error: errMemb2 } = await supabase
                  .from('project_members')
                  .select('role, profile_id')
                  .eq('project_id', id)
                  .eq('email', myEmail)
                  .eq('status', 'accepted'); // v570 : une invitation en attente n'ouvre rien
              if(errMemb2) console.warn('[Projects] openProject memberships:', errMemb2);
              
              // Vérifier si owner
              // v578 (cloisonnement) : la colonne 'data' N'EST PLUS LUE ICI. On ne
              // demande que les colonnes d'identite du projet ; le contenu arrive
              // separement, filtre par le serveur (voir plus bas). Tant qu'on lisait
              // 'data' directement, les ❌ du tableau des acces ne cachaient les
              // onglets QUE dans le navigateur : le budget et les contrats etaient
              // deja dans la page, lisibles depuis la console.
              const { data: project, error: projError } = await supabase
                  .from('projects')
                  .select('id, title, created_at, owner_email, owner_profile_id, project_type, episode_count, deleted_at')
                  .eq('id', id)
                  .maybeSingle();
              
              if (projError || !project) throw new Error("Projet introuvable");
              
              // I5g: déterminer le rôle effectif selon le profil actif
              // Priorité 1: membership qui correspond exactement au profil actif
              // Priorité 2: membership owner (le plus permissif)
              // Priorité 3: n'importe quelle membership (fallback)
              // Priorité 4: owner si owner_email match (legacy)
              let role = null;
              let matchedProfileId = null;
              
              if(memberships && memberships.length > 0) {
                  // Chercher match exact avec profil actif
                  const exactMatch = memberships.find(m => m.profile_id === activeProfileId);
                  if(exactMatch) {
                      role = exactMatch.role;
                      matchedProfileId = exactMatch.profile_id;
                  } else {
                      // Prendre la plus permissive (owner > editor > viewer)
                      const roleOrder = { owner: 3, editor: 2, viewer: 1 };
                      memberships.sort((a, b) => (roleOrder[b.role] || 0) - (roleOrder[a.role] || 0));
                      role = memberships[0].role;
                      matchedProfileId = memberships[0].profile_id;
                      
                      // Si le profil actif n'est pas le bon, basculer dessus
                      if(matchedProfileId && matchedProfileId !== activeProfileId) {
                          ActiveProfile.setId(matchedProfileId);
                      }
                  }
              }
              
              if (!role && project.owner_email === myEmail) role = 'owner';
              if (!role) throw new Error("Accès refusé.");
              state.currentRole = role;
              // v582 : le droit d'inviter n'est plus un drapeau delegue
              // (can_invite) mais LA REGLE « on n'invite que si on peut
              // modifier la fiche projet ». Il se teste en direct au clic
              // (Permissions.canEdit('presentation'), adosse a _scope) et en
              // base par la policy INSERT (my_section_level). Plus de
              // snapshot currentCanInvite a maintenir.
              
              // v578 (cloisonnement) : le contenu du projet est demande au serveur,
              // qui retire les cles des onglets fermes AVANT de repondre. La reponse
              // porte aussi _scope : mon niveau sur chaque section. Sans lui,
              // l'application ne saurait pas distinguer « il n'y a pas de depenses »
              // de « je n'ai pas le droit de les voir » — et afficherait un budget a
              // zero au lieu d'un onglet absent.
              const { data: scoped, error: scopeErr } = await supabase
                  .rpc('project_data_for_me', { p_id: id });
              if(scopeErr || !scoped) {
                  console.error('[Cloisonnement] project_data_for_me:', scopeErr);
                  throw new Error("Projet vide ou introuvable");
              }
              const parsed = scoped;
              state.dataScope = parsed._scope || null;
              // Quelles cles le serveur a-t-il retirees ? C'est LUI qui le dit
              // (_withheld), on ne le devine pas : le navigateur ne connait pas la
              // liste complete des cles possibles, et celle qu'il oublierait serait
              // justement celle qu'une sauvegarde de secours effacerait. Cette liste
              // interdit ensuite l'ecriture complete (voir StoreSave.save).
              state.dataMissingKeys = Array.isArray(parsed._withheld) ? parsed._withheld : [];
              // Ni la carte des droits ni la liste ne font partie du projet : elles
              // ne doivent jamais partir en sauvegarde ni entrer dans la baseline.
              delete parsed._scope;
              delete parsed._withheld;
              const safeData = { ...Store.getEmpty(), ...parsed };
              // v578 (cloisonnement) : Store.getEmpty ne connait pas toutes les cles
              // du projet — orgs, vehicles, moodboards, titlePage et les modeles de
              // contrat n'y figurent pas. Retirees par le serveur, elles vaudraient
              // « indefini » et feraient planter les ecrans qui les parcourent. On
              // leur redonne une forme vide, la meme que sur un projet neuf : l'ecran
              // affiche « rien », ce qui est exactement le message voulu.
              const FORMES_VIDES = {
                  orgs: [], vehicles: [], moodboards: [], titlePage: {},
                  contractTemplates: [], contractTemplatesHidden: [],
                  figurants: [], figurantGroups: []
              };
              (state.dataMissingKeys || []).forEach(k => {
                  if(safeData[k] === undefined && FORMES_VIDES[k] !== undefined) {
                      safeData[k] = JSON.parse(JSON.stringify(FORMES_VIDES[k]));
                  }
              });
              
              if(!safeData.actors) safeData.actors = [];
              if(!safeData.snapshots) safeData.snapshots = []; // V62 Security
              if(!Array.isArray(safeData.contracts)) safeData.contracts = [];
			  if(!safeData.shots) safeData.shots = [];
			  if(!safeData.crew) safeData.crew = [];
			  if(!safeData.shootingDays) safeData.shootingDays = [];
			  // Migration : ancien type de journée a underscore -> tiret (aligne sur Planning.dayTypes)
			  safeData.shootingDays.forEach(d => { if(d && d.dayType === 'essai_costume') d.dayType = 'essai-costume'; });
			  // Migration : trio salaires — l'ancien tarif unique (dailyRate) devient le salaire brut
			  (safeData.actors || []).forEach(a => { if(a && a.dailyRate && !a.salaryGross) a.salaryGross = a.dailyRate; });
			  (safeData.crew || []).forEach(m => { if(m && m.dailyRate && !m.salaryGross) m.salaryGross = m.dailyRate; });
// Ajouter les groupes crew manquants
CONFIG.crewGroups.forEach(defaultGrp => {
    if(!safeData.groups.some(g => g.id === defaultGrp.id)) {
        safeData.groups.push(defaultGrp);
    }
});
              if(!safeData.groups.some(g => g.type === 'actor')) { safeData.groups.push({id: 'ga1', name: 'Casting Principal', type: 'actor'}); safeData.groups.push({id: 'ga2', name: 'Rôles Secondaires', type: 'actor'}); safeData.groups.push({id: 'ga3', name: 'Figuration', type: 'actor'}); }
              if(!safeData.groups.some(g => g.type === 'org')) { safeData.groups.push({id: 'go1', name: 'Partenaires', type: 'org'}); safeData.groups.push({id: 'go2', name: 'Financeurs', type: 'org'}); safeData.groups.push({id: 'go3', name: 'Prestataires', type: 'org'}); }
              if(!safeData.tags || safeData.tags.length === 0) safeData.tags = CONFIG.defaultTags;
              ['scenes', 'characters', 'locations'].forEach(k => { if(!Array.isArray(safeData[k])) safeData[k] = []; });
              
              // Générer un filmId si absent (anciens projets)
              if(!safeData.filmId) {
                  safeData.filmId = 'film_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
                  // FilmId généré pour ancien projet
              }
              
              // S7.1 : migration saisons pour les séries
              // Si c'est une série et qu'il n'y a pas de saisons, créer Saison 1 et rattacher tous les épisodes existants
              let needsMigrationSave = false;
              // D2 : versioning du schéma — tamponner les anciens projets, rejouer les migrations manquantes
              if(typeof safeData._schemaVersion !== 'number') { safeData._schemaVersion = 1; needsMigrationSave = true; }
              if(safeData._schemaVersion > Store.SCHEMA_VERSION) {
                  console.warn('[Schema] Projet en v' + safeData._schemaVersion + ', app en v' + Store.SCHEMA_VERSION);
                  Utils.toast("Ce projet a été enregistré avec une version plus récente de l'app. Recharge la page (Ctrl+F5).", 'warning');
              } else if(safeData._schemaVersion < Store.SCHEMA_VERSION) {
                  Store.runSchemaMigrations(safeData);
                  needsMigrationSave = true;
              }
              if(project.project_type === 'series') {
                  if(!Array.isArray(safeData.seasons)) { safeData.seasons = []; needsMigrationSave = true; }
                  if(!Array.isArray(safeData.episodes)) { safeData.episodes = []; needsMigrationSave = true; }
                  
                  if(safeData.seasons.length === 0) {
                      // Créer Saison 1 auto
                      const season1Id = crypto.randomUUID();
                      safeData.seasons.push({
                          id: season1Id,
                          number: 1,
                          title: '',
                          description: ''
                      });
                      // Rattacher tous les épisodes existants à Saison 1
                      safeData.episodes.forEach(ep => {
                          if(!ep.seasonId) ep.seasonId = season1Id;
                      });
                      needsMigrationSave = true;
                  } else {
                      // Sécurité : si certains épisodes n'ont pas de seasonId, les rattacher à la 1ère saison
                      const defaultSeasonId = safeData.seasons[0].id;
                      safeData.episodes.forEach(ep => {
                          if(!ep.seasonId || !safeData.seasons.find(s => s.id === ep.seasonId)) {
                              ep.seasonId = defaultSeasonId;
                              needsMigrationSave = true;
                          }
                      });
                  }
              }
              
              // Phase 1 Storyboard : migration des shots vers la structure `drawings` (4 zones)
              // Les shots existants ont `imageType`/`imageUrl`/`drawingData` au niveau racine.
              // On clone ces données dans `drawings.original` sans toucher à l'existant.
              if(Array.isArray(safeData.shots)) {
                  safeData.shots.forEach(shot => {
                      if(!shot.drawings) {
                          shot.drawings = {
                              original: null,
                              lighting: null,
                              camera: null,
                              actors: null
                          };
                          // Si le plan a déjà un dessin/image, on le clone dans drawings.original
                          if(shot.imageType && (shot.drawingData || shot.imageUrl)) {
                              shot.drawings.original = {
                                  imageType: shot.imageType,
                                  imageUrl: shot.imageUrl || null,
                                  drawingData: shot.drawingData || null,
                                  objects: []  // Phase 3 : objets vectoriels (vide à la migration)
                              };
                          }
                          needsMigrationSave = true;
                      }
                      if(!shot.drawingsVisibility) {
                          shot.drawingsVisibility = {
                              original: true,
                              lighting: false,
                              camera: false,
                              actors: false
                          };
                          needsMigrationSave = true;
                      }
                      // Phase 3 Storyboard : ajouter `objects: []` aux zones existantes qui n'en ont pas
                      ['original', 'lighting', 'camera', 'actors'].forEach(zoneKind => {
                          if(shot.drawings[zoneKind] && !Array.isArray(shot.drawings[zoneKind].objects)) {
                              shot.drawings[zoneKind].objects = [];
                              needsMigrationSave = true;
                          }
                      });
                  });
              }
              
              // V7.6-bis (R7) : auto-réparation des scriptContent mal formés (HTML legacy corrompu).
              // Cause possible : ancien bug ayant produit "<br class='sc-action'>" au lieu de "<div class='sc-action'><br></div>".
              // Symptôme : Tab/Enter ne fonctionnent plus une fois qu'on tape du texte (getBlockNode renvoie null).
              if(Array.isArray(safeData.scenes)) {
                  safeData.scenes.forEach(sc => {
                      if(typeof sc.scriptContent !== 'string') return;
                      const raw = sc.scriptContent.trim();
                      // Cas 1 : vide → wrap par défaut
                      if(!raw) {
                          sc.scriptContent = "<div class='sc-action'><br></div>";
                          needsMigrationSave = true;
                          return;
                      }
                      // Cas 2 : commence par <br class="sc-XXX"> → bloc orphelin sans wrapper DIV
                      // Cas 3 : commence par du texte brut (pas de balise DIV)
                      if(!raw.startsWith('<div')) {
                          // Tenter de récupérer la classe sc-XXX d'un éventuel <br class="sc-XXX">
                          const m = raw.match(/^<br\s+class=["']([^"']+)["']\s*\/?>/i);
                          let cls = (m && m[1]) || 'sc-action';
                          // Retirer le <br class="..."> initial s'il y est, et tout autre <br class="..."> orphelin
                          let body = raw.replace(/<br\s+class=["'][^"']*["']\s*\/?>/gi, '<br>').trim();
                          sc.scriptContent = `<div class="${cls}">${body || '<br>'}</div>`;
                          needsMigrationSave = true;
                      }
                  });
              }
              
              state.data = safeData; state.currentProjectId = id;
              // v601 : ouvrir un projet met fin au mode « fiche moteur », quoi qu'il
              // se soit passe sur la page Profil. Deuxieme filet apres
              // PublicProfile._engineActif : un drapeau reste a true bloquait
              // TOUTE sauvegarde du projet, en silence.
              try { if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) PublicProfile._engineRecoller(); } catch(e) {}
              state.savedBaseline = JSON.parse(JSON.stringify(safeData)); // Phase 0 : état de référence pour sauvegarde partielle / merge sélectif
              // v602 : les huit groupes officiels de comediens, et eux seuls (voir
              // CastFamilies). APRES la baseline, comme les migrations qui suivent :
              // la reprise est alors une vraie difference, enregistree une fois,
              // au lieu d'etre refaite en memoire a chaque ouverture.
              if(CastFamilies.completerGroupes(safeData, (state.dataMissingKeys || []).indexOf('actors') < 0)) needsMigrationSave = true;
              // v602 : meme regle pour les departements techniques (voir CrewDepartements).
              if(CrewDepartements.fermer(safeData, (state.dataMissingKeys || []).indexOf('crew') < 0)) needsMigrationSave = true;
              // Lot 4 : migration hygiène URLs publiques 'projects' -> paths (one-shot, idempotent, gated par flag). APRÈS la baseline => la diff URL->path est réelle et sera persistée au prochain save.
              // v599 — LE DRAPEAU DEVIENT VERSIONNE. Il valait true/false : une
              // fois pose, la migration ne repassait PLUS JAMAIS. Les medias
              // ajoutes APRES ce passage gardaient donc une URL de forme
              // /object/public/ sur le bucket 'projects', qui est PRIVE —
              // c'est-a-dire une adresse systematiquement refusee par le
              // serveur. C'est ce qui empechait les images inserees dans le
              // storyboard de s'afficher (constate en base : 32 objets image
              // d'un projet, tous en forme publique, drapeau deja a true).
              // Passer a 2 rejoue la migration UNE fois pour tout le monde ;
              // elle est idempotente et ne touche que les URLs 'projects'.
              if(state.data._mediaPathsMigrated !== 2) {
                  try {
                      const _ancien = state.data._mediaPathsMigrated;
                      const _migN = Utils.migrateProjPathsInData(state.data);
                      state.data._mediaPathsMigrated = 2;
                      if(_migN > 0 || _ancien !== 2) needsMigrationSave = true;
                  } catch(e) { console.warn('migrateProjPathsInData:', e); }
              }
              // 7d : passage du depouillement a la forme { t, k, id }. Non gardee
              // par un drapeau, contrairement a la migration ci-dessus : elle est
              // idempotente et doit aussi rattraper les elements arrivant par un
              // import ou une synchro venue d'une version anterieure.
              try {
                  const _bdN = Utils.bdNormalizeData(state.data);
                  if(_bdN > 0) needsMigrationSave = true;
              } catch(e) { console.warn('bdNormalizeData:', e); }
              // v580 : pose des identifiants de lien scene <-> fiche
              // (persoIds, locationId). Idempotente, non gardee par un
              // drapeau, pour les memes raisons que bdNormalizeData.
              try {
                  const _flN = FicheLinks.migrate();
                  if(_flN > 0) needsMigrationSave = true;
              } catch(e) { console.warn('FicheLinks.migrate:', e); }
              // v599 : les blobs de dessin gardes en memoire appartiennent au
              // projet qu'on quitte — on repart propre.
              if(typeof StoryboardExport !== 'undefined' && StoryboardExport.videBlobCache) StoryboardExport.videBlobCache();
              await Utils.refreshSignedCache(state.data); // Lot D6 : pré-signe les médias 'projects' avant rendu
              Utils.startImgResolver(); // Lot D6 : résolveur DOM des <img> signées
              // v601 — LE PRECHAUFFAGE NE PART PLUS A L'OUVERTURE DU PROJET.
              // Il lancait TOUTES les images du Storyboard ET du Mood Board des
              // qu'on entrait dans un projet — meme pour quelqu'un qui venait
              // ecrire une scene et n'ouvrirait jamais ces deux onglets. Il suit
              // desormais la personne : voir Utils.prechaufferOnglet, appele
              // quand on ENTRE dans l'onglet concerne.
              Utils._ongletsPrechauffes = {};
              state.currentProjectType = project.project_type || 'film'; // S3.4
              state.statsFilter = { scope: 'all', seasonId: null, episodeId: null }; // Stats: filtre de scope par défaut
              NavMemory.setProject(id); // Persistance pour F5
              LoadingScreen.setProgress(95);
              UI.launchEditor(); Store.startRealtimeListener(id); Store.initPresence(id); LockManager.init(id); if(typeof VerrouFin !== 'undefined') VerrouFin.init(); if(typeof DBPresence !== 'undefined') DBPresence.start(id); if(typeof MiniChat !== 'undefined') MiniChat.start(id);
              // S7.1 : forcer la sauvegarde si migration saisons effectuée
              if(needsMigrationSave) setTimeout(() => Store.save(), 1000);
              LoadingScreen.hide();
              // I5f: rafraîchir le sélecteur (on est maintenant dans un projet, filtrage profils)
              setTimeout(() => { try { ActiveProfile.renderAllSelectors(); } catch(e){} }, 100);
              // Message d'accueil, une seule fois (drapeau global). Differe pour laisser
              // l'editeur s'afficher d'abord.
              setTimeout(() => { try { ProjectWelcome.maybeShow(); } catch(e){} }, 700);
          } catch(e) { LoadingScreen.hide(); Utils.toast("Erreur: " + e.message, "error"); console.error(e); UI.showDashboard(); }
      },
      // ========== TEMPS RÉEL & CHARGEMENT (B.1.4 → StoreRealtime) ==========
      startRealtimeListener: (id) => StoreRealtime.startRealtimeListener(id),
      loadFromSupabase: (projectId) => StoreRealtime.loadFromSupabase(projectId),
      initPresence: (id) => StoreRealtime.initPresence(id),
      // ========== HELPERS IDENTITÉ (B.1.1 → StoreMigrations) ==========
	  
      // ========== UPDATES CIBLÉS DEBOUNCED (B.1.2 → StoreUpdates) ==========
      updateScene: (sceneId, content) => StoreUpdates.updateScene(sceneId, content),
      updateTitle: (val) => StoreUpdates.updateTitle(val),
      // ========== MIGRATIONS DE DONNÉES (B.1.1 → StoreMigrations) ==========
      // ========== SAUVEGARDE (B.1.5 → StoreSave) ==========
      save: () => StoreSave.save(),
      deleteProject: async (id, role, e) => { 
          if(e) e.stopPropagation(); 
          if(role !== 'owner') return; 
          if(await ConfirmModal.confirmDelete("Le projet ira à la corbeille, récupérable 30 jours, puis supprimé définitivement.", "Supprimer ce projet ?")) { 
              // Soft-delete : marque deleted_at (corbeille). Membres conservés pour restauration ; purge réelle + buckets à J+30 (Edge Function).
              const {error: delErr} = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
              if(delErr) { Utils.toast('Erreur mise à la corbeille', 'error'); return; }
              Utils.toast('Projet mis à la corbeille (récupérable 30 jours)', 'success');
              await UI.renderProjectList();
              await UI.renderDashboard(); 
          } 
      },
      // v570 — Quitter un projet auquel on a ete invite. La policy DELETE de
      // project_members autorise deja « le proprietaire OU soi-meme » : rien a
      // ajouter cote base. Le proprietaire, lui, ne peut pas quitter son propre
      // projet (le bouton ne lui est pas propose) : il le supprime.
      leaveProject: async (id, role, e) => {
          if(e) e.stopPropagation();
          if(!id || !state.currentUser) return;
          if(role === 'owner') { Utils.toast('Vous êtes propriétaire de ce projet : supprimez-le au lieu de le quitter.', 'warning'); return; }
          const card = document.querySelector('.project-card[data-project-id="' + id + '"] .p-title');
          const titre = (card && card.textContent) || 'ce projet';
          const ok = await ConfirmModal.show({
              title: 'Quitter ce projet ?',
              message: 'Vous perdrez l\'accès à « ' + Utils.escape(titre) +' ». Le projet et votre travail ne sont pas supprimés : le propriétaire pourra vous réinviter.',
              icon: '🚪',
              dangerous: true,
              confirmText: 'Quitter'
          });
          if(!ok) return;
          const { error } = await supabase
              .from('project_members')
              .delete()
              .eq('project_id', id)
              .eq('email', state.currentUser.email.toLowerCase());
          if(error) { console.error(error); Utils.toast('Erreur : impossible de quitter le projet.', 'error'); return; }
          Utils.toast('Vous avez quitté « ' + titre + ' ».', 'success');
          await UI.renderDashboard();
      },

      getTrashedProjects: async () => {
          if(!state.currentUser) return [];
          const myEmail = state.currentUser.email.toLowerCase();
          const { data: projects, error } = await supabase
              .from('projects')
              .select('id, title, deleted_at')
              .eq('owner_email', myEmail)
              .not('deleted_at', 'is', null)
              .order('deleted_at', { ascending: false });
          if(error || !projects) return [];
          return projects.map(p => ({
              id: p.id,
              title: p.title,
              deletedAt: p.deleted_at,
              purgeAt: new Date(new Date(p.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
          }));
      },

      restoreProject: async (id) => {
          const { error } = await supabase.from('projects').update({ deleted_at: null }).eq('id', id);
          if(error) { Utils.toast('Erreur restauration', 'error'); return false; }
          Utils.toast('Projet restauré', 'success');
          return true;
      },

      clearCurrent: async () => { if(state.currentRole === 'viewer') return; if(Store.isPartial()) { Utils.toast("Ce projet vous est transmis partiellement : vous ne pouvez pas le vider. Seul le propriétaire le peut.", 'error', 8000); return; } if(await ConfirmModal.confirmDelete("Toutes les données du projet seront effacées.", "Vider tout ?")){ state.data = Store.getEmpty(); Store.save(); UI.renderAll(); } },
      importJSON: (e) => { if(state.currentRole === 'viewer') return; if(Store.isPartial()) { Utils.toast("Ce projet vous est transmis partiellement : un import remplacerait tout le contenu par une copie incomplète. Opération refusée.", 'error', 9000); e.target.value=''; return; } const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{ try{ state.data = JSON.parse(ev.target.result); Store.save(); UI.renderAll(); UI.switchTab('synopsis'); Utils.toast('Import réussi !', 'success'); } catch(x){ Utils.toast('Erreur fichier.', 'error'); } }; r.readAsText(f); e.target.value=''; },
      
      // saveDebounced / saveFlush (B.1.5 → StoreSave)
      saveDebounced: () => StoreSave.saveDebounced(),
      saveFlush: () => StoreSave.saveFlush()
  };
  
  // ==================== MODULE ICONS ====================