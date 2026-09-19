
  const DBPresence = {
      timer: null,
      channel: null,
      where: null, // id du projet courant, ou null = dashboard
      _byeBound: false,

      start: (pid) => {
          if(window.location.protocol === 'file:') return;
          if(!state.currentUser) return;
          DBPresence.where = pid || null;
          DBPresence.beat();
          if(!DBPresence.timer) DBPresence.timer = setInterval(DBPresence.beat, 50000);
          if(!DBPresence._byeBound) {
              DBPresence._byeBound = true;
              window.addEventListener('pagehide', DBPresence._bye);
          }
          if(!DBPresence.channel) {
              DBPresence.channel = supabase.channel('db_presence')
                  .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => { DBPresence.fetch(); })
                  .subscribe();
          }
      },

      // Domaines que JE regarde en ce moment (onglet principal + fenetres flottantes)
      _watching: () => {
          const out = {};
          try {
              if(!state.currentProjectId) return [];
              const act = document.querySelector('.tab-content.active:not(.wm-hosted)');
              if(act && typeof LockDomains !== 'undefined') {
                  const d = LockDomains.forTab(act.id.replace('tab-',''));
                  if(d) out[d] = true;
              }
              if(typeof WindowManager !== 'undefined' && typeof LockDomains !== 'undefined') {
                  Object.keys(WindowManager.poppedTabs || {}).forEach(t => {
                      const d = LockDomains.forTab(t);
                      if(d) out[d] = true;
                  });
              }
          } catch(_) {}
          return Object.keys(out).sort();
      },

      _lastWatch: '',
      _soonT: null,
      // Battement anticipe si ce que je regarde a change (debounce 1,2 s)
      beatSoon: () => {
          try {
              const w = JSON.stringify(DBPresence._watching());
              if(w === DBPresence._lastWatch) return;
          } catch(_) {}
          clearTimeout(DBPresence._soonT);
          DBPresence._soonT = setTimeout(DBPresence.beat, 1200);
      },

      beat: async () => {
          if(!state.currentUser) return;
          try { const s = await supabase.auth.getSession(); state._jwt = s && s.data && s.data.session && s.data.session.access_token; } catch(e) {}
          try {
              await supabase.rpc('presence_beat', { p_project: DBPresence.where, p_name: (state.currentUser.email||'').split('@')[0] });
          } catch(e) {}
          try {
              const w = DBPresence._watching();
              DBPresence._lastWatch = JSON.stringify(w);
              await supabase.rpc('presence_watching', { p_watching: w });
          } catch(e) {}
          DBPresence.fetch();
      },

      // Adieu propre à la fermeture de page : libère verrous + présence + session active via fetch keepalive (survit au déchargement).
      _bye: () => {
          try {
              const url = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : null;
              const key = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : null;
              const jwt = state._jwt;
              if(!url || !key || !jwt) return;
              const H = { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + jwt };
              const held = (typeof LockManager !== 'undefined' && LockManager.held) ? Object.keys(LockManager.held) : [];
              held.forEach(k => {
                  fetch(url + '/rest/v1/rpc/lock_release', { method: 'POST', headers: H, keepalive: true,
                      body: JSON.stringify({ p_id: state.currentProjectId, p_key: k, p_uid: LockManager._uid() }) });
              });
              fetch(url + '/rest/v1/rpc/presence_leave', { method: 'POST', headers: H, keepalive: true, body: '{}' });
              // v594 : fermer l'onglet libère aussi la ligne active_sessions (sinon elle traine
              // jusqu'a la prochaine connexion, source de faux "session ouverte ailleurs").
              if(typeof SessionManager !== 'undefined' && SessionManager.sessionToken) {
                  fetch(url + '/rest/v1/active_sessions?session_token=eq.' + encodeURIComponent(SessionManager.sessionToken),
                      { method: 'DELETE', headers: H, keepalive: true });
              }
          } catch(e) {}
      },

      fetch: async () => {
          try {
              const { data, error } = await supabase.from('user_presence').select('*');
              if(error) return;
              const now = Date.now();
              state.dbPresence = (data || []).filter(r => r.heartbeat_at && (now - new Date(r.heartbeat_at).getTime()) < 120000);
              try { if(state._renderPresenceNow) state._renderPresenceNow(); } catch(e) {}
              try { if(typeof GlobalPresence !== 'undefined') GlobalPresence.renderBadges(); } catch(e) {}
              try { if(typeof LockManager !== 'undefined' && state.currentProjectId) LockManager.onPresenceChange(); } catch(e) {}
          } catch(e) {}
      }
  };

  // Diag — trappe de diagnostic, appelable depuis la console : app.Diag().
  // Affiche d'un coup l'etat de la presence et des verrous. Ajoutee le 23 aout
  // parce que rien de tout cela n'etait observable de l'exterieur (state,
  // DBPresence et LockManager vivent dans la fermeture du module).
  const Diag = () => {
      const moi = (state.currentUser && state.currentUser.email) || '(non connecte)';
      const pid = state.currentProjectId || null;
      const rows = state.dbPresence || [];
      const surCeProjet = rows.filter(r => r.project_id === pid);
      const info = {
          'mon compte': moi,
          'projet ouvert (state.currentProjectId)': pid,
          'projet declare a la presence (DBPresence.where)': (typeof DBPresence !== 'undefined' ? DBPresence.where : '(module absent)'),
          'les deux concordent ?': (typeof DBPresence !== 'undefined' && DBPresence.where === pid) ? 'OUI' : '*** NON — c\'est la panne ***',
          'lignes de presence vues au total': rows.length,
          'dont sur CE projet': surCeProjet.length,
          'personnes vues sur ce projet': surCeProjet.map(r => r.user_email).join(', ') || '(aucune)',
          'app me croit seul(e) ?': (typeof LockManager !== 'undefined' ? (LockManager.isAlone() ? 'OUI (aucun verrou ne sera pose)' : 'non') : '?'),
          'mon role': state.currentRole || null,
          'domaine de l\'onglet courant': (typeof LockManager !== 'undefined' ? LockManager.currentDomain : null),
          'verrous connus': Object.keys(state.domainLocks || {}).join(', ') || '(aucun)',
          'ce que je declare regarder': (typeof DBPresence !== 'undefined' ? DBPresence._watching().join(', ') : '?')
      };
      console.table(info);
      return info;
  };

  // MiniChat — talkie-walkie de projet : messages éphémères entre les personnes connectées
  // en même temps sur le même projet. AUCUN stockage : pur Supabase Realtime broadcast.
  // Les messages vivent au plus MAX_AGE_MS (~50 min) et au plus MAX_MESSAGES en mémoire.