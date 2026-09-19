
  const SessionManager = {
      // ===================== ÉTAT =====================
      sessionToken: null,
      tabId: null,
      channel: null,
      heartbeatInterval: null,
      leaderInterval: null,         // S12 : id du setInterval d'élection (clearInterval au cleanup)
      isLeaderTab: false,
      // v593 : missedChecks retiré (compteur jamais lu, décrivait un mécanisme
      // de tolérance qui n'a pas été implémenté).
      
      // ===================== INIT & CANAL INTER-ONGLETS =====================
      init: () => {
          // Générer un ID unique pour cet onglet
          SessionManager.tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
          
          // Initialiser BroadcastChannel pour la communication entre onglets
          if(typeof BroadcastChannel !== 'undefined') {
              SessionManager.channel = new BroadcastChannel('moteur_session');
              SessionManager.channel.onmessage = SessionManager.handleChannelMessage;
          }
          
          // Élection du leader (premier onglet ouvert)
          SessionManager.electLeader();
      },
      
      // Communication entre onglets du même navigateur
      handleChannelMessage: (event) => {
          const { type, tabId, data } = event.data;
          
          switch(type) {
              case 'NEW_TAB':
                  // Un nouvel onglet s'annonce, lui envoyer l'état actuel
                  if(SessionManager.isLeaderTab) {
                      SessionManager.broadcast('SYNC_STATE', { 
                          projectId: state.currentProjectId,
                          projectData: state.data 
                      });
                  }
                  break;
                  
              case 'SYNC_STATE':
                  // Recevoir l'état synchronisé
                  if(data.projectId === state.currentProjectId && data.projectData) {
                      state.data = data.projectData;
                      if(typeof UI !== 'undefined' && UI.renderAll) {
                          UI.renderAll();
                      }
                  }
                  break;
                  
              case 'DATA_UPDATED':
                  // Un autre onglet a modifié les données
                  if(data.projectId === state.currentProjectId) {
                      Store.loadFromSupabase(state.currentProjectId);
                  }
                  break;
                  
              case 'LEADER_CHECK':
                  // Répondre pour confirmer qu'on est actif
                  if(SessionManager.isLeaderTab) {
                      SessionManager.broadcast('LEADER_ALIVE', {});
                  }
                  break;
                  
              case 'SESSION_CLAIMED':
                  // Un autre onglet du MÊME navigateur a pris la session -> on se neutralise
                  // (sans déconnexion : token partagé, déconnecter tuerait aussi le gagnant)
                  if(data && data.token && data.token !== SessionManager.sessionToken) {
                      SessionManager._supersede(false);
                  }
                  break;
                  
              case 'LOGOUT':
                  // Déconnexion depuis un autre onglet
                  supabase.auth.signOut().then(() => location.reload());
                  break;
          }
      },
      
      broadcast: (type, data) => {
          if(SessionManager.channel) {
              try {
                  SessionManager.channel.postMessage({
                      type: type,
                      tabId: SessionManager.tabId,
                      data: data
                  });
              } catch(err) {
                  // BroadcastChannel peut devenir invalide si l'onglet a été inactif/fermé
                  console.warn('[SessionManager] Channel invalidé, recréation:', err.message);
                  SessionManager.channel = null;
                  // Tentative de recréation pour les broadcasts suivants
                  try {
                      if(typeof BroadcastChannel !== 'undefined') {
                          SessionManager.channel = new BroadcastChannel('moteur_session');
                          SessionManager.channel.onmessage = SessionManager.handleChannelMessage;
                      }
                  } catch(_) { /* silent */ }
              }
          }
      },
      
      electLeader: () => {
          // Le premier onglet devient leader
          const leaderKey = 'moteur_leader_tab';
          const existingLeader = localStorage.getItem(leaderKey);
          
          if(!existingLeader) {
              localStorage.setItem(leaderKey, SessionManager.tabId);
              SessionManager.isLeaderTab = true;
          }
          
          // Vérifier périodiquement si le leader est toujours actif
          if(SessionManager.leaderInterval) clearInterval(SessionManager.leaderInterval);   // S12 : pas de doublon si ré-appelé
          SessionManager.leaderInterval = setInterval(() => {
              const currentLeader = localStorage.getItem(leaderKey);
              if(currentLeader === SessionManager.tabId) {
                  // Mettre à jour le timestamp
                  localStorage.setItem('moteur_leader_timestamp', Date.now().toString());
              } else {
                  // Vérifier si le leader est mort (pas de mise à jour depuis 5s)
                  const lastTimestamp = parseInt(localStorage.getItem('moteur_leader_timestamp') || '0');
                  if(Date.now() - lastTimestamp > 5000) {
                      // Prendre le leadership
                      localStorage.setItem(leaderKey, SessionManager.tabId);
                      SessionManager.isLeaderTab = true;
                  }
              }
          }, 2000);
          
          // Nettoyer à la fermeture
          window.addEventListener('beforeunload', () => {
              if(SessionManager.isLeaderTab) {
                  localStorage.removeItem(leaderKey);
                  localStorage.removeItem('moteur_leader_timestamp');
              }
          });
      },
      
      // Configuration sessions
      MAX_SESSIONS: 1,              // Nombre max de sessions actives simultanées par user
      // v593 : ZOMBIE_TIMEOUT_MS / HEARTBEAT_INTERVAL_MS retirés — décrivaient un
      // modèle heartbeat/zombie jamais implémenté (le vrai mécanisme est "revendication
      // + surveillance toutes les 7s", sans heartbeat ni notion de session zombie).
      
      // Helper : timeout sur une promesse (Supabase peut pendre indéfiniment si JWT révoqué)
      _withTimeout: (promise, ms = 10000) => Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
      ]),
      
      // Démarrer le suivi de session (MAX_SESSIONS sessions actives max par user)
      // Multi-onglets du même navigateur = 1 seule session (token partagé via localStorage)
      // Au-delà de MAX_SESSIONS, la plus ancienne est supprimée → kick au prochain heartbeat
      // ===================== VÉRIFICATION & DÉCONNEXION =====================
      // ===================== SESSION UNIQUE (1 seule active par compte) =====================
      // Le plus récent gagne. À la connexion on "revendique" la session côté serveur
      // (active_sessions, 1 ligne par user). Chaque session vérifie que le token serveur est
      // toujours le sien ; sinon : déconnexion (autre appareil) ou écran de blocage (autre
      // onglet du même navigateur — token partagé, on ne déconnecte pas pour ne pas tuer le gagnant).
      _superseded: false,
      _watchTimer: null,

      startSessionCheck: async (userId) => {
          SessionManager.currentUserId = userId;
          SessionManager._superseded = false;
          SessionManager.sessionToken = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
          // Marqueur local : permet de savoir si le "gagnant" est ce navigateur (token partagé)
          try { localStorage.setItem('moteur_active_session', SessionManager.sessionToken); } catch(_) {}
          // 1) Revendiquer la session (écrase la précédente du même compte -> le plus récent gagne)
          try {
              await SessionManager._withTimeout(
                  supabase.from('active_sessions').upsert(
                      { user_id: userId, session_token: SessionManager.sessionToken, last_seen: new Date().toISOString() },
                      { onConflict: 'user_id' }
                  ), 10000);
          } catch(e) { console.warn('[SessionManager] revendication session echouee:', e && e.message); }
          // 2) Kick instantane des autres onglets du meme navigateur (sans deconnexion)
          SessionManager.broadcast('SESSION_CLAIMED', { token: SessionManager.sessionToken });
          // 3) Surveillance periodique
          SessionManager._startWatch();
          return true;
      },

      _startWatch: () => {
          if(SessionManager._watchTimer) clearInterval(SessionManager._watchTimer);
          SessionManager._watchTimer = setInterval(async () => {
              if(SessionManager._superseded || !SessionManager.currentUserId || !SessionManager.sessionToken) return;
              try {
                  const { data, error } = await SessionManager._withTimeout(
                      supabase.from('active_sessions').select('session_token').eq('user_id', SessionManager.currentUserId).maybeSingle(), 8000);
                  if(error || !data || !data.session_token) return;   // jamais de kick sur erreur/absence
                  if(data.session_token !== SessionManager.sessionToken) {
                      let localTok = null; try { localTok = localStorage.getItem('moteur_active_session'); } catch(_) {}
                      const sameBrowser = localTok && localTok === data.session_token;
                      SessionManager._supersede(!sameBrowser);
                  }
              } catch(e) { /* timeout/reseau : on retente au prochain tick */ }
          }, 7000);
      },

      // crossDevice=true -> autre appareil : vraie deconnexion + accueil.
      // crossDevice=false -> autre onglet du meme navigateur : on neutralise sans deconnecter.
      _supersede: (crossDevice) => {
          if(SessionManager._superseded) return;
          SessionManager._superseded = true;
          if(SessionManager._watchTimer) { clearInterval(SessionManager._watchTimer); SessionManager._watchTimer = null; }
          SessionManager._showLockOverlay(crossDevice);
          if(crossDevice) {
              try { supabase.auth.signOut().finally(() => setTimeout(() => { try { location.reload(); } catch(_) {} }, 1800)); }
              catch(_) { setTimeout(() => { try { location.reload(); } catch(_) {} }, 1800); }
          }
      },

      _showLockOverlay: (crossDevice) => {
          if(document.getElementById('session-lock-overlay')) return;
          const ov = document.createElement('div');
          ov.id = 'session-lock-overlay';
          ov.style.cssText = 'position:fixed; inset:0; z-index:var(--z-modal-top); background:linear-gradient(135deg,#0f172a,#1e293b); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:30px; font-family:inherit;';
          ov.innerHTML = '<div style="font-size:3rem; margin-bottom:16px;">🔒</div>'
              + '<h2 style="margin:0 0 12px; font-size:1.5rem;">Session ouverte ailleurs</h2>'
              + '<p style="max-width:440px; color:rgba(255,255,255,0.75); line-height:1.6; margin:0 0 24px;">Ton compte vient d\'être ouvert ' + (crossDevice ? 'sur un autre appareil' : 'dans un autre onglet') + '. Une seule session active est autorisée.' + (crossDevice ? ' Tu vas être déconnecté ici.' : '') + '</p>'
              + '<button onclick="window.location.reload()" style="padding:12px 28px; border:none; border-radius:8px; background:#3b82f6; color:#fff; font-weight:600; font-size:0.95rem; cursor:pointer;">Retour à l\'accueil</button>';
          document.body.appendChild(ov);
      },
      
      // Prévient les autres onglets du même navigateur qu'on a modifié les données.
      notifyDataUpdate: () => {
          try { SessionManager.broadcast('DATA_UPDATED', { projectId: state.currentProjectId }); } catch(_) {}
      },

      // Supprime notre propre session en base (best-effort, non bloquant).
      // Évite de laisser une session "fantôme" qui compterait dans MAX_SESSIONS
      // et pourrait provoquer un kick injustifié à la reconnexion suivante.
      deleteOwnSession: () => {
          if(!SessionManager.sessionToken || typeof supabase === 'undefined') return;
          try {
              supabase.from('active_sessions')
                  .delete()
                  .eq('session_token', SessionManager.sessionToken)
                  .then(() => {}, () => {});
          } catch(_) { /* silencieux */ }
      },
      
      cleanup: () => {
          if(SessionManager.channel) {
              SessionManager.channel.close();
          }
          if(SessionManager.heartbeatInterval) {
              clearInterval(SessionManager.heartbeatInterval);
          }
          if(SessionManager.leaderInterval) {   // S12 : stopper l'élection (sinon le timer fuit après déconnexion)
              clearInterval(SessionManager.leaderInterval);
              SessionManager.leaderInterval = null;
          }
          SessionManager.isLeaderTab = false;
          SessionManager.deleteOwnSession();
      }
  };
