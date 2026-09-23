
  const StoreSave = {
      // ====================================================================
      // ECRITURE D'UNE SEULE SCENE : saveScene (RPC patch_project_scene,
      // sql/ecriture_par_scene.sql) n'etait appelee par aucun ecran ; retiree
      // en v602 (code mort). Toute ecriture de scene passe par save(). La
      // retrouver dans l'historique git le jour du verrou par scene.
      // ====================================================================

      // ====================================================================
      //  LE VERROU DE SAUVEGARDE NE PEUT PLUS RESTER COINCE (v601)
      // ====================================================================
      //  savingInProgress empeche deux sauvegardes de se chevaucher. Il etait
      //  leve a la main au debut et rabaisse a la main a la fin — SANS filet.
      //  La moindre exception entre les deux (une donnee circulaire que
      //  JSON.stringify refuse, une migration qui echoue, un module absent) le
      //  laissait leve POUR TOUJOURS. Et des lors, toute sauvegarde suivante
      //  ressortait aussitot, en silence : pas d'erreur, pas de message, rien
      //  dans la console. L'ecran annonce « enregistre », rien ne part, et ca
      //  ne se repare qu'en rechargeant la page.
      //  C'est ce qui a ete signale sur « Gerer les acces » — mais ca touchait
      //  TOUTE l'application, le scenario comme le planning.
      //  MEME FAMILLE QUE LE MODE FICHE DE TOUT A L'HEURE : un etat tenu a la
      //  main finit toujours par rester coince. Ici on ne peut pas le LIRE
      //  ailleurs — alors on garantit sa descente par un « finally », qui
      //  s'execute meme quand tout casse, et on ajoute une limite de temps au
      //  cas ou un chemin nous echapperait encore.
      VERROU_MAX_MS: 30000,

      // A taper dans la console quand « ca dit enregistre mais rien ne bouge ».
      // Dit en trois lignes ce qui, autrement, demande de lire le code.
      etat: () => ({
          sauvegarde_en_cours: !!state.savingInProgress,
          depuis_secondes: state.savingInProgress ? Math.round((Date.now() - (state._savingDepuis || 0)) / 1000) : 0,
          demande_en_attente: !!state.pendingSave,
          mode_fiche_profil: !!(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode),
          projet_ouvert: !!state.currentProjectId,
          sections_non_recues: (state.dataMissingKeys || []).slice()
      }),
      save: async () => {
          // RENVOIE false, et ne se tait plus : un appelant qui annonce « enregistre »
          // doit pouvoir savoir que rien n'est parti (voir Permissions.saveAll).
          if(typeof PublicProfile !== 'undefined' && PublicProfile._engineActif()) return false; // fiche moteur profil : jamais de sauvegarde projet
          if(!state.currentProjectId || !state.currentUser || state.currentRole === 'viewer') return;

          if(state.savingInProgress) {
              // Verrou anti-concurrence : une sauvegarde est en cours, on note la
              // demande et elle repartira a la fin de celle-la.
              if(Date.now() - (state._savingDepuis || 0) < StoreSave.VERROU_MAX_MS) {
                  state.pendingSave = true;
                  return;
              }
              // Passe ce delai, la sauvegarde precedente n'a pas pu se terminer
              // normalement. On repart plutot que de se taire indefiniment.
              console.warn('[Store] verrou de sauvegarde jamais relache (' + StoreSave.VERROU_MAX_MS + ' ms) : on repart.');
          }
          state.savingInProgress = true;
          state._savingDepuis = Date.now();
          try {
              return await StoreSave._sauvegarder();
          } catch(e) {
              // Une exception ici ne doit plus disparaitre sans laisser de trace.
              console.error('[Store] sauvegarde interrompue :', e);
              try { Utils.toast('La sauvegarde a été interrompue. Vos modifications ne sont pas enregistrées.', 'error', 9000); } catch(_) {}
              return false;
          } finally {
              state.savingInProgress = false;
              if(state.pendingSave) { state.pendingSave = false; StoreSave.save(); }
          }
      },

      // Le corps de la sauvegarde. Il ne touche plus au verrou : c'est save()
      // ci-dessus qui le tient et garantit sa descente.
      _sauvegarder: async () => {
          
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
              if(Object.keys(savePatch).length === 0) return; // rien n'a changé : pas d'écriture inutile
              // v601 — SECTIONS DU SYNOPSIS TENUES PAR QUELQU'UN D'AUTRE.
              // Plus simple que pour les scenes, et pour une bonne raison : les
              // six textes du synopsis sont six CLES SEPAREES. Il n'y a donc
              // rien a recoudre — on retire du paquet la cle qu'on n'a pas le
              // droit d'ecrire, et on remet a l'ecran la derniere version connue
              // du serveur. Pas de relecture, pas de fusion.
              if(typeof SynopsisLock !== 'undefined' && saveBase) {
                  try {
                      const interdites = SynopsisLock.clesInterdites();
                      const rendues = [];
                      for(const cle in interdites) {
                          if(!(cle in savePatch)) continue;
                          delete savePatch[cle];
                          state.data[cle] = saveBase[cle];
                          rendues.push(interdites[cle]);
                      }
                      if(rendues.length) {
                          Utils.toast('Section verrouillée par ' + rendues[0]
                              + ' : vos modifications n\'ont pas été enregistrées.', 'warning', 9000);
                          try { ['synopsis','short','long','intent','director','producer'].forEach(t => Synopsis.renderTree(t)); } catch(e) {}
                      }
                      if(Object.keys(savePatch).length === 0) return;
                  } catch(e) { console.warn('[Store] sections verrouillees :', e && e.message); }
              }
              // ==============================================================
              //  UNE SEULE REGLE POUR TOUTES LES LISTES (v601)
              // ==============================================================
              //  Scenes, personnages, comediens, decors, equipe, ressources,
              //  structures, plans, planches, contrats, modeles : ce sont tous
              //  des TABLEAUX D'OBJETS A IDENTIFIANT, et ils partagent deux
              //  dangers. D'abord, envoyer le tableau entier pour changer UN
              //  element renvoie aussi notre copie des autres — si quelqu'un
              //  vient d'en modifier un, on l'efface. Ensuite, un element tenu
              //  par quelqu'un d'autre ne doit jamais partir avec.
              //  ON RELIT DONC LE SERVEUR UNE FOIS, avant d'envoyer, et on
              //  reprend SA version de ce qu'on n'a pas touche et de ce qu'il
              //  tient — en gardant NOTRE ordre et nos ajouts.
              //  CELA COUVRE AUSSI CE QUI N'A PAS DE VERROU : les modeles de
              //  contrat ne s'editent pas, on les cree et on les applique. Deux
              //  creations simultanees ne peuvent plus s'annuler, sans qu'il
              //  ait fallu inventer un verrou pour ca.
              //  ET SEULEMENT A PLUSIEURS : seul sur le projet, on n'ajoute pas
              //  une lecture a chaque enregistrement.
              //  CETTE REGLE REMPLACE DEUX BLOCS SEPARES — un pour les scenes,
              //  un pour les fiches — qui faisaient la meme chose a deux
              //  endroits, avec deux lectures du serveur au lieu d'une.
              const LISTES = ['scenes','characters','actors','locations','crew','resources',
                              'orgs','shots','moodboards','contracts','contractTemplates'];
              let seulSurLeProjet = true;
              try { seulSurLeProjet = LockManager.isAlone(); } catch(e) {}
              const aRelire = seulSurLeProjet ? [] : LISTES.filter(c => Array.isArray(savePatch[c]));
              // Les rapports de script sont ranges dans un dictionnaire et non
              // dans une liste ; meme regle, autre fusion (voir _carteAJour).
              const carteARelire = (!seulSurLeProjet && savePatch.scriptReports
                                    && typeof savePatch.scriptReports === 'object') ? 'scriptReports' : null;
              if(aRelire.length || carteARelire) {
                  // Qui tient quoi, par collection : les scenes d'un cote, les
                  // fiches de l'autre — deux familles de verrous, une seule
                  // table d'interdits.
                  const interdits = {};
                  try {
                      if(typeof FicheLock !== 'undefined') {
                          const parColl = FicheLock.interdites();
                          for(const c in parColl) interdits[c] = parColl[c];
                      }
                      if(typeof SceneLock !== 'undefined') {
                          const sc = {};
                          Object.keys(SceneLock.tous()).forEach(sid => {
                              if(!SceneLock.tenuParMoi(sid)) sc[sid] = SceneLock.qui(sid);
                          });
                          if(Object.keys(sc).length) interdits.scenes = sc;
                      }
                  } catch(e) {}
                  try {
                      const { data: frais, error: errFrais } = await supabase.rpc('project_data_for_me', { p_id: id });
                      if(!errFrais && frais) {
                          const refuses = [];
                          if(carteARelire && frais[carteARelire] && typeof frais[carteARelire] === 'object') {
                              const bloques = Object.keys(interdits[carteARelire] || {});
                              const fusion = StoreRealtime._carteAJour(
                                  savePatch[carteARelire], (saveBase && saveBase[carteARelire]) || {},
                                  frais[carteARelire], bloques);
                              savePatch[carteARelire] = fusion;
                              state.data[carteARelire] = fusion;
                              (fusion._refusees || []).forEach(k => refuses.push((interdits[carteARelire] || {})[k]));
                          }
                          aRelire.forEach(coll => {
                              if(!Array.isArray(frais[coll])) return;
                              const bloques = Object.keys(interdits[coll] || {});
                              const fusion = StoreRealtime._listeAJour(
                                  savePatch[coll], (saveBase && saveBase[coll]) || [], frais[coll], bloques);
                              savePatch[coll] = fusion;
                              state.data[coll] = fusion;
                              (fusion._refusees || []).forEach(eid => refuses.push((interdits[coll] || {})[eid]));
                          });
                          if(refuses.length) {
                              Utils.toast('Verrouillé par ' + refuses[0]
                                  + ' : vos modifications n\'ont pas été enregistrées.', 'warning', 9000);
                              try { UI.renderAll(); } catch(e) {}
                          }
                      }
                  } catch(e) {
                      // Relecture impossible : on envoie quand meme. Renoncer a
                      // sauvegarder ferait perdre a coup sur ce qu'on essaie de
                      // proteger par precaution.
                      console.warn('[Store] relecture avant envoi impossible :', e && e.message);
                  }
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
              // v601 — UN REFUS DE DROIT N'EST PAS UNE PANNE DE RESEAU. Le
              // serveur refuse par exemple d'ecrire les droits des membres a
              // qui n'est pas proprietaire (code 42501) : dire « verifiez votre
              // connexion » envoie chercher du cote du wifi pendant des heures.
              // On rend alors la phrase du serveur, qui dit ce qui s'est passe.
              const refus = lastError && (String(lastError.code) === '42501'
                  || /refus|forbidden|permission|droit/i.test(String(lastError.message || '')));
              Utils.toast(refus
                  ? (String(lastError.message || 'Modification refusée.').replace(/^.*?:\s*/, '') + ' Rien n\'a été enregistré.')
                  : `Erreur de sauvegarde après ${attempt} tentatives. Vérifiez votre connexion.`,
                  'error', refus ? 9000 : 4000);
              if(syncIndicator) {
                  syncIndicator.textContent = '❌';
                  syncIndicator.title = 'Échec de la sauvegarde';
                  setTimeout(() => {
                      syncIndicator.textContent = '☁️';
                      syncIndicator.style.opacity = '0.4';
                      syncIndicator.title = '';
                  }, 4000);
              }
              // Une nouvelle demande arrivee pendant l'echec sera relancee par
              // save(), qui reprend la main juste apres.
              return false;
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
          
          
          // Notifier les autres onglets de la modification
          if(typeof SessionManager !== 'undefined') {
              SessionManager.notifyDataUpdate();
          }
          
          // Une demande arrivee pendant la sauvegarde est relancee par save(),
          // qui reprend la main juste apres — ici on ne touche plus au verrou.
          return true;
      },
      
      // Debounce timer pour saveDebounced
      _saveDebounceTimer: null,
      _saveDebounceWait: 800, // ms
      
      // saveDebounced : à utiliser pour les modifs en rafales (saisies texte, cases à cocher, drag…)
      // Au lieu d'envoyer une requête à chaque modif, on attend 800ms d'inactivité avant d'envoyer la dernière version.
      // Pour les actions "définitives" (suppression, validation modale, fin d'édition), continuer à utiliser Store.save().
      saveDebounced: () => {
          if(typeof PublicProfile !== 'undefined' && PublicProfile._engineActif()) return; // fiche moteur profil : pas de sauvegarde projet
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