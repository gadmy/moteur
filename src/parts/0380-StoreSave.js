
  const StoreSave = {
      // ====================================================================
      // ECRITURE D'UNE SEULE SCENE (v601) — PREALABLE AU VERROU PAR SCENE
      // ====================================================================
      // save() envoie la LISTE COMPLETE des scenes. Deux personnes qui ecrivent
      // chacune la sienne s'ecrasent, la derniere gagne. Aujourd'hui le verrou
      // par DOMAINE l'empeche, en bloquant d'un coup Scenario, Sequencier et
      // Depouillement. Descendre le verrou a la scene sans descendre l'ecriture
      // ferait donc PERDRE de la securite, pas en gagner.
      // saveScene n'ecrit que LA scene donnee, cote serveur, sans toucher aux
      // autres (fonction patch_project_scene, sql/ecriture_par_scene.sql).
      //
      // REPLI AUTOMATIQUE : si la fonction n'existe pas encore sur la base, on
      // retombe sur save(). Le code peut donc partir avant le SQL sans rien
      // casser, et l'ecriture fine s'active d'elle-meme le jour ou le SQL est
      // applique. Le repli ne se declenche QUE sur « fonction inconnue » : une
      // erreur de droit ou de reseau ne doit pas se transformer en reecriture
      // complete, silencieuse et bien plus large que demande.
      _sceneRpcAbsente: false,
      saveScene: async (scene) => {
          if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) return false;
          if(!scene || !scene.id || !state.currentProjectId) return false;
          if(StoreSave._sceneRpcAbsente) { StoreSave.save(); return false; }
          try {
              const propre = JSON.parse(JSON.stringify(scene, (k, v) => v === undefined ? null : v));
              const { error } = await supabase.rpc('patch_project_scene', {
                  p_id: state.currentProjectId,
                  p_scene: propre
              });
              if(error) {
                  const msg = String(error.message || '');
                  // 42883 = fonction inconnue cote Postgres ; PostgREST renvoie
                  // aussi un 404 avec « Could not find the function ».
                  if(error.code === '42883' || /could not find the function|does not exist/i.test(msg)) {
                      StoreSave._sceneRpcAbsente = true;
                      console.warn('[Store] patch_project_scene absente : ecriture par scene desactivee, repli sur la sauvegarde complete.');
                      StoreSave.save();
                      return false;
                  }
                  console.warn('[Store] saveScene :', msg);
                  return false;
              }
              // La baseline doit suivre, sinon la fusion temps reel croirait que
              // cette scene est encore « modifiee localement » et refuserait les
              // versions suivantes venues des autres.
              if(state.savedBaseline && Array.isArray(state.savedBaseline.scenes)) {
                  const i = state.savedBaseline.scenes.findIndex(x => x && String(x.id) === String(scene.id));
                  const copie = JSON.parse(JSON.stringify(scene));
                  if(i >= 0) state.savedBaseline.scenes[i] = copie;
                  else state.savedBaseline.scenes.push(copie);
              }
              StoreRealtime.broadcastPatch();
              return true;
          } catch(e) {
              console.warn('[Store] saveScene :', e && e.message);
              return false;
          }
      },

      save: async () => { 
          if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) return; // fiche moteur profil : jamais de sauvegarde projet
          if(!state.currentProjectId || !state.currentUser || state.currentRole === 'viewer') return;
          
          // Verrou anti-concurrence : si un save est déjà en cours, on note la demande et on sortira
          // Quand le save courant se termine, on relance automatiquement (cf. fin de la fonction)
          if(state.savingInProgress) {
              state.pendingSave = true;
              return;
          }
          
          // Marquer qu'une sauvegarde est en cours
          state.savingInProgress = true; 
          
          // [Phase D] Snapshots auto désactivés : remplacés par le journal d'actions enrichi
          
          const syncIndicator = document.getElementById('sync-indicator');
          
          StoreMigrations.migrateBreakdownKeys();
          StoreMigrations.migrateShootingDays(); 
          
          // Nettoyer les valeurs undefined (Postgres n'accepte pas undefined)
          const cleanData = JSON.parse(JSON.stringify(state.data, (key, value) => value === undefined ? null : value));
          
          const id = state.currentProjectId; 
          
          // Phase 0 : sauvegarde partielle — on ne pousse que les clés modifiées depuis la baseline.
          // Repli sur écriture complète si pas de baseline (ex. juste après import).
          const saveBase = state.savedBaseline;
          let savePatch = null;
          if(saveBase) {
              savePatch = {};
              for(const k in cleanData) {
                  if(JSON.stringify(cleanData[k]) !== JSON.stringify(saveBase[k])) savePatch[k] = cleanData[k];
              }
              // v578 (cloisonnement) : une cle que le serveur ne m'a PAS envoyee a
              // ete recreee vide par Store.getEmpty. Normalement elle ne bouge pas et
              // ne rentre donc pas dans le patch — mais si un ecran la touchait par
              // megarde, on renverrait un tableau vide et on EFFACERAIT en base le
              // budget ou les contrats de tout le monde, sans erreur ni message.
              // On les retire du patch de force. Le declencheur SQL dit la meme chose
              // cote serveur : deux verrous valent mieux qu'un pour une perte de
              // donnees silencieuse.
              (state.dataMissingKeys || []).forEach(k => { delete savePatch[k]; });
              if(Object.keys(savePatch).length === 0) {
                  // Rien n'a changé : pas d'écriture inutile
                  state.savingInProgress = false;
                  if(state.pendingSave) { state.pendingSave = false; StoreSave.save(); }
                  return;
              }
          } 
          
          // Tentatives avec retry exponentiel : 1ère immédiate, puis attente 1s, puis 3s
          // Une erreur réseau / 5xx / timeout déclenche un retry. Une erreur métier (RLS, schéma) ne retry pas.
          const maxAttempts = 3;
          let lastError = null;
          let attempt = 0;
          let success = false;
          
          while(attempt < maxAttempts && !success) {
              attempt++;
              
              // Afficher l'indicateur de tentative
              if(syncIndicator) {
                  syncIndicator.textContent = attempt === 1 ? '🔄' : `🔄${attempt}`;
                  syncIndicator.style.opacity = '1';
                  syncIndicator.title = attempt === 1 ? 'Sauvegarde…' : `Nouvelle tentative (${attempt}/${maxAttempts})…`;
              }
              
              try {
                  let error;
                  if(savePatch) {
                      // Écriture partielle côté serveur (merge jsonb) : ne touche que les clés modifiées
                      const res = await supabase.rpc('patch_project_data', { p_id: id, p_patch: savePatch });
                      error = res.error;
                  } else if((state.dataMissingKeys || []).length > 0) {
                      // v578 : ECRITURE COMPLETE INTERDITE sur un projet ampute.
                      // Sans baseline, la voie de secours pousse cleanData EN ENTIER,
                      // donc aussi les cles vides recreees par getEmpty : elle
                      // effacerait ce qu'on n'a jamais eu le droit de lire. On refuse
                      // plutot que d'ecraser, et on le dit.
                      error = { code: 'CLOISON', message: 'Sauvegarde complete impossible : ce projet vous est transmis partiellement. Rechargez la page.' };
                  } else {
                      const res = await supabase
                          .from('projects')
                          .update({ 
                              data: cleanData,
                              title: state.data.title,
                              updated_at: new Date().toISOString()
                          })
                          .eq('id', id);
                      error = res.error;
                  }
                  
                  if(!error) { success = true; break; }
                  
                  // Erreur Supabase : on regarde si c'est récupérable (réseau/timeout/5xx) ou pas (auth/RLS)
                  lastError = error;
                  const isTransient = !error.code || /^5\d\d$/.test(String(error.code)) || /network|fetch|timeout/i.test(error.message || '');
                  if(!isTransient) break; // erreur métier : pas la peine de retenter
              } catch(e) {
                  // Exception réseau (TypeError: NetworkError) : retry
                  lastError = { message: e.message || 'Erreur réseau' };
              }
              
              // Attendre avant retry (sauf si dernière tentative)
              if(attempt < maxAttempts) {
                  const delayMs = attempt === 1 ? 1000 : 3000;
                  await new Promise(resolve => setTimeout(resolve, delayMs));
              }
          }
          
          if(!success) {
              console.error('Erreur sauvegarde après', attempt, 'tentatives:', lastError);
              Utils.toast(`Erreur de sauvegarde après ${attempt} tentatives. Vérifiez votre connexion.`, 'error');
              if(syncIndicator) {
                  syncIndicator.textContent = '❌';
                  syncIndicator.title = 'Échec de la sauvegarde';
                  setTimeout(() => {
                      syncIndicator.textContent = '☁️';
                      syncIndicator.style.opacity = '0.4';
                      syncIndicator.title = '';
                  }, 4000);
              }
              state.savingInProgress = false;
              // Si une nouvelle demande arrive après l'échec, on tentera quand même
              if(state.pendingSave) {
                  state.pendingSave = false;
                  setTimeout(() => StoreSave.save(), 5000); // retry après 5s
              }
              return;
          }
          
          // Indicateur de sync : terminé (avec mention du retry si applicable)
          if(syncIndicator) {
              syncIndicator.textContent = '✅';
              syncIndicator.title = attempt > 1 ? `Sauvegardé (après ${attempt} tentatives)` : 'Sauvegardé';
              setTimeout(() => {
                  syncIndicator.textContent = '☁️';
                  syncIndicator.style.opacity = '0.4';
                  syncIndicator.title = '';
              }, 2000);
          }
          
          // Phase 0 : la baseline reflète désormais l'état persisté
          state.savedBaseline = JSON.parse(JSON.stringify(cleanData));
          
          // Diffusion du diff aux autres onglets (canal broadcast : quelques Ko, indépendant du poids du projet)
          StoreRealtime.broadcastPatch(savePatch);
          
          // Marquer que la sauvegarde est terminée
          state.savingInProgress = false;
          
          // Notifier les autres onglets de la modification
          if(typeof SessionManager !== 'undefined') {
              SessionManager.notifyDataUpdate();
          }
          
          // Verrou anti-concurrence : si une demande de save a eu lieu pendant qu'on sauvegardait,
          // on relance maintenant pour ne pas perdre la modif
          if(state.pendingSave) {
              state.pendingSave = false;
              StoreSave.save();
          }
      },
      
      // Debounce timer pour saveDebounced
      _saveDebounceTimer: null,
      _saveDebounceWait: 800, // ms
      
      // saveDebounced : à utiliser pour les modifs en rafales (saisies texte, cases à cocher, drag…)
      // Au lieu d'envoyer une requête à chaque modif, on attend 800ms d'inactivité avant d'envoyer la dernière version.
      // Pour les actions "définitives" (suppression, validation modale, fin d'édition), continuer à utiliser Store.save().
      saveDebounced: () => {
          if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) return; // fiche moteur profil : pas de sauvegarde projet
          if(StoreSave._saveDebounceTimer) clearTimeout(StoreSave._saveDebounceTimer);
          // Indicateur visuel "en attente" : opacity réduite
          const syncIndicator = document.getElementById('sync-indicator');
          if(syncIndicator) {
              syncIndicator.textContent = '⏱️';
              syncIndicator.style.opacity = '0.6';
              syncIndicator.title = 'Sauvegarde différée…';
          }
          StoreSave._saveDebounceTimer = setTimeout(() => {
              StoreSave._saveDebounceTimer = null;
              StoreSave.save();
          }, StoreSave._saveDebounceWait);
      },
      
      // saveFlush : force un flush immédiat des modifs debouncées en attente
      // À appeler avant des actions critiques (changement de projet, déconnexion, fermeture page).
      saveFlush: () => {
          if(StoreSave._saveDebounceTimer) {
              clearTimeout(StoreSave._saveDebounceTimer);
              StoreSave._saveDebounceTimer = null;
              return StoreSave.save();
          }
          return Promise.resolve();
      }
  };

  // ConnectionStatus — v593 : détecte la perte/reprise de connexion réseau via les
  // événements natifs du navigateur, plutôt que de laisser l'utilisateur découvrir
  // le problème seulement à l'échec (et aux 3 tentatives) d'une sauvegarde.