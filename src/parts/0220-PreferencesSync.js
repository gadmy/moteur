
  const PreferencesSync = {
      SYNC_KEYS: [
          'fmp_theme_pref', 'fmp_design', 'fmp_nav_mode', 'fmp_tabs_mode',
          'fmp_tabs_position', 'fmp_board_mode', 'fmp_script_view_mode',
          'moteur_icon_style',
          'moteur_script_prefs', 'moteur_scriptAC_enabled',
          'moteur_scriptBd_enabled', 'moteur_contract_templates', 'moteur_project_folders', 'moteur_tour_done',
          'moteur_project_welcome_done'
      ],
      _pushTimer: null,

      load: async () => {
          if (!state.currentUser?.email) return;
          try {
              // Multi-profils : plusieurs lignes possibles, on prend la première qui a des préférences
              const email = state.currentUser.email.toLowerCase();
              // v602 : par la porte unique des profils ; les preferences ne
              // se lisent plus en direct.
              const _p = await Utils.profils({ emails: [email] });
              const error = _p.error;
              const data = _p.data.filter(p => p && p.preferences);
              if (error) { console.warn('[PreferencesSync] load error:', error.message); return; }
              const remote = data && data.length > 0 ? data[0].preferences : null;
              if (remote && Object.keys(remote).length > 0) {
                  PreferencesSync.SYNC_KEYS.forEach(key => {
                      if (remote[key] !== undefined) {
                          try { localStorage.setItem(key, remote[key]); } catch(e) {}
                      }
                  });
              } else {
                  await PreferencesSync.pushAll();
              }
          } catch(e) { console.warn('[PreferencesSync] load exception:', e); }
      },

      save: (key, value) => {
          try { localStorage.setItem(key, value); } catch(e) {}
          clearTimeout(PreferencesSync._pushTimer);
          PreferencesSync._pushTimer = setTimeout(() => PreferencesSync.pushAll(), 2000);
      },

      pushAll: async () => {
          if (!state.currentUser?.email) return;
          const prefs = {};
          PreferencesSync.SYNC_KEYS.forEach(key => {
              try {
                  const val = localStorage.getItem(key);
                  if (val !== null) prefs[key] = val;
              } catch(e) {}
          });
          try {
              // Multi-profils : mettre à jour tous les profils du compte pour garder les préférences synchrones
              const email = state.currentUser.email.toLowerCase();
              const { error } = await supabase
                  .from('user_profiles')
                  .update({ preferences: prefs })
                  .or(`owner_email.eq.${Utils.pgSafe(email)},email.eq.${Utils.pgSafe(email)}`);
              if (error) console.warn('[PreferencesSync] push error:', error.message);
          } catch(e) { console.warn('[PreferencesSync] push exception:', e); }
      }
  };

  // ========== SESSION MANAGER ==========
  // Gère la session unique par compte (multi-onglets OK, multi-ordinateurs bloqué)
  // ============================================================
  // NavMemory - persistance de la navigation (projet + onglets)
  // Permet au F5 de rester sur la page où on était
  // ============================================================
  // ========== PROJECT FOLDERS (T6) ==========
  // Classement personnel des projets du hub en dossiers imbriques.
  // Stocke dans les preferences (PreferencesSync, cle moteur_project_folders) :
  // zero SQL, synchronise entre appareils. Modele :
  //   { folders: [ { id, name, color, priority, parentId } ], assignments: { projectId: folderId } }
  // Lot 1 : modele + CRUD + persistance (pas d'UI hub ici).