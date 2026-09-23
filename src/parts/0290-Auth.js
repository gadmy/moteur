
  const Auth = {
      init: async () => { 
          try {
              const theme = localStorage.getItem(CONFIG.themeKey); 
              if(theme !== 'light') document.body.classList.add('dark-mode');
          } catch(e) { /* Navigation privée - localStorage indisponible */ } 
          // Initialiser le gestionnaire de session
          SessionManager.init();
          
          // 🎬 SECRET: Triple-clic sur l'indicateur sync (☁️) pour tester le loader !
          let moteurClicks = 0;
          let moteurClickTimer = null;
          document.addEventListener('click', (e) => {
              const syncIndicator = e.target.closest('#sync-indicator');
              const roleBadge = e.target.closest('#role-badge');
              if(syncIndicator || roleBadge) {
                  moteurClicks++;
                  if(moteurClicks === 3) {
                      moteurClicks = 0;
                      clearTimeout(moteurClickTimer);
                      // Afficher le loader pendant 8 secondes en démo
                      LoadingScreen.show("🎬 Mode démo loader !");
                      setTimeout(() => LoadingScreen.hide(), 8000);
                      console.log('🎬 Easter egg: Loader de test activé !');
                  } else {
                      clearTimeout(moteurClickTimer);
                      moteurClickTimer = setTimeout(() => { moteurClicks = 0; }, 500);
                  }
              }
          });
          
		  // Attendre que Supabase soit initialisé
          if(!supabase || !supabase.auth) {
              // Attente initialisation Supabase
              await initSupabase();
              if(!supabase || !supabase.auth) supabase = window.supabaseInitialized;
              if(!supabase?.auth) console.error('Supabase client: FAIL');
          }

          // Fix file:// : limiter les refresh tokens pour eviter les boucles.
          // v598 — CE REGLAGE VIVAIT UNE TRENTAINE DE LIGNES PLUS HAUT, donc
          // AVANT l'attente de initSupabase() ci-dessus : il touchait
          // supabase.auth alors que le client n'existait pas encore. Le bloc
          // n'etant joue qu'en protocole file:, le site en ligne ne voyait
          // jamais rien ; mais ouvrir le fichier en local finissait sur une
          // PAGE BLANCHE et un « supabase is undefined ». On configure le
          // client une fois qu'il est la, et seulement s'il est la.
          if(window.location.protocol === 'file:' && supabase && supabase.auth) {
              supabase.auth.startAutoRefresh = () => {};
          }
		  
		  
          // LOT 3 — lecteur de scenario partage (invite non inscrit) : si l'URL est
          // /scenario/<jeton>, on n'affiche QUE le scenario et on stoppe tout le flux
          // d'authentification (pas de landing, pas de dashboard, pas de session).
          if(ScriptReader.boot()) return;

          // Écouter les changements d'authentification Supabase
          supabase.auth.onAuthStateChange(async (event, session) => { 
              if (session && session.user) { 
                  state.currentUser = session.user;
                  // uid/email posés IMMÉDIATEMENT (avant tout await) : les verrous en dépendent à tout instant
                  state.currentUser.email = session.user.email.toLowerCase();
                  state.currentUser.uid = session.user.id;
                  state.currentUser.emailVerified = session.user.email_confirmed_at !== null;
                  
                  // Authentifier la connexion temps réel (sinon Realtime ne délivre ni présence ni changements)
                  try { if(session.access_token) supabase.realtime.setAuth(session.access_token); } catch(_) {}

                  // Logger la connexion - DIFFERE hors du verrou d'auth (aucun appel Supabase dans onAuthStateChange, sinon deadlock)
                  if (event === 'SIGNED_IN') {
                      setTimeout(() => { supabase.from('user_logins').insert({ user_email: session.user.email.toLowerCase() }).then(null, e => console.warn('Login log error:', e)); }, 0);
                  }
                  // Ne pas rediriger si déjà dans un projet ou sur le dashboard
                  if(els.appView.style.display === 'flex' || els.dashboardView.style.display === 'flex') {
                      return;
                  }
                  // Verifier la session unique - DIFFERE hors du verrou d'auth (anti-deadlock onAuthStateChange)
                  setTimeout(async () => { const sessionOk = await SessionManager.startSessionCheck(session.user.id); if(sessionOk) Auth.showDashboard(); }, 0);
              } 
              else { 
                  // En file://, ignorer les events de refresh échoués si déjà connecté
                  if(window.location.protocol === 'file:' && (els.dashboardView.style.display === 'flex' || els.appView.style.display === 'flex')) {
                      // Event auth ignoré (mode local)
                      return;
                  }
                  state.currentUser = null; 
                  setTimeout(() => SessionManager.cleanup(), 0);
                  Auth.showAuth(); 
              } 
          });
          
          // Charger le message pré-alpha depuis la config
          Admin.loadPrealphaConfig();
          
          // Vérifier s'il y a déjà une session active
          const { data: { session } } = await supabase.auth.getSession();
          if (session && session.user) {
              state.currentUser = session.user;
              state.currentUser.email = session.user.email.toLowerCase();
              state.currentUser.uid = session.user.id;
              try { if(session.access_token) supabase.realtime.setAuth(session.access_token); } catch(_) {}
              state.currentUser.emailVerified = session.user.email_confirmed_at !== null;
              Auth.showDashboard();
          } else {
              Auth.showAuth();
          }
      },
      showAuth: () => { Auth._dashboardShown = false; try { Feedback.unmount(); } catch(e) {} Landing.show(); els.dashboardView.style.display = 'none'; els.appView.style.display = 'none'; if(Notifications._channel) { try { supabase.removeChannel(Notifications._channel); } catch(e) {} Notifications._channel = null; } Landing.replayPending(); },
showDashboard: async () => { 
    if(Auth._dashboardShown) return; Auth._dashboardShown = true;   // S11 anti double-init boot
    // Un clic « Se connecter » fait sur la page d'accueil pendant le chargement
    // n'a plus de sens : la session existe, on part au hub.
    window.__moteurWanted = null;
    try { document.documentElement.style.cursor = ''; } catch(e) {}
    els.authView.style.display = 'none'; 
    // Charger le profil utilisateur depuis Supabase
    try {
        // v602 : lecture par la porte unique des profils (Utils.profils).
        const _mesProfils = await Utils.profils({ emails: [state.currentUser.email.toLowerCase()] });
        const error = _mesProfils.error;
        const data = _mesProfils.data.find(p => String(p.email || '').toLowerCase() === state.currentUser.email.toLowerCase()) || null;
        
        if (data) {
            state.userProfile = data;
            state.userProfile.accountType = data.profile_type || 'producer';
        } else {
            state.userProfile = { accountType: 'producer' };
            // Filet : compte auth sans fiche user_profiles. L'insert du formulaire
            // d'inscription part en session anonyme (confirmation d'email oblige)
            // et la RLS le refuse en silence : on crée la fiche ici, connecté.
            // Les comptes admin restent volontairement sans fiche.
            if(!CONFIG.adminEmails.includes(state.currentUser.email.toLowerCase())) {
                try {
                    const nowIso = new Date().toISOString();
                    const { data: created, error: insErr } = await supabase.from('user_profiles').insert({
                        email: state.currentUser.email.toLowerCase(),
                        owner_email: state.currentUser.email.toLowerCase(),
                        name: '',
                        terms_accepted: false,
                        profile_type: 'producer',
                        created_at: nowIso,
                        is_public: false
                    }).select('id, email, owner_email, name, profile_type, terms_accepted, is_public, created_at').maybeSingle();
                    if(!insErr && created) {
                        state.userProfile = created;
                        state.userProfile.accountType = created.profile_type || 'producer';
                    } else if(insErr) {
                        console.warn('[Profil] création de la fiche manquante refusée:', insErr);
                    }
                } catch(e) {
                    console.warn('[Profil] création de la fiche manquante échouée:', e);
                }
            }
        }
    } catch(e) {
        state.userProfile = { accountType: 'producer' };
    }
    // S1: Charger les préférences synchronisées
    await PreferencesSync.load();
    try { ProjectFolders.reload(); ProjectFolders.prune(); } catch(e) {}
    // B1: Ré-appliquer le thème synchronisé (le boot a lu localStorage avant la synchro distante)
    try {
        const _t = localStorage.getItem(CONFIG.themeKey);
        if(_t) {
            document.body.classList.toggle('dark-mode', _t === 'dark');
            if(Universe.map) Universe.updateMapTheme();
        }
    } catch(e) {}
    
    // I3: Charger les profils publics pour le sélecteur "Profil actif"
    try {
        await PublicProfile.loadProfiles();
        ActiveProfile.ensureValid();
        setTimeout(() => ActiveProfile.attachToDom(), 200);
        UIDashboard.renderUserWelcome(); // B6 : intitulés à jour une fois les fiches chargées
    } catch(e) { console.warn('Chargement profils pour ActiveProfile échoué:', e); }
    // Raccourcis clavier globaux pour le mode Focus
    if(!state.focusKeyListenerAttached) { state.focusKeyListenerAttached = true;
    document.addEventListener('keydown', (e) => {
        // F11 = Toggle Focus Mode
        if(e.key === 'F11') {
            e.preventDefault();
            FocusMode.toggle();
            return;
        }
        
        // En mode Focus uniquement
        if(FocusMode.isActive) {
            if(e.key === 'Escape') {
                FocusMode.exit();
            } else if(e.key === 'ArrowLeft' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                // Ne pas interférer si on est dans un input/textarea
                if(!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
                    e.preventDefault();
                    FocusMode.prevTab();
                }
            } else if(e.key === 'ArrowRight' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                if(!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
                    e.preventDefault();
                    FocusMode.nextTab();
                }
            }
        }
    });
    
    // Phase 4B v2 : listener clavier pour supprimer un objet sélectionné dans le DrawingEditor
    // (touche Suppr ou Backspace en mode transform)
    document.addEventListener('keydown', (e) => {
        if(typeof DrawingEditor !== 'undefined' && DrawingEditor.handleKeyDown) {
            DrawingEditor.handleKeyDown(e);
        }
    });

    // v617 : navigation clavier de la petite fenêtre d'autocomplétion du
    // scénario (personnages/décors/ressources), Vue Scène et Vue Script
    // confondues — un seul point d'écoute, en PHASE DE CAPTURE (avant que
    // l'éditeur ou le navigateur ne traitent la touche), pour que les
    // flèches pilotent la liste au lieu de déplacer le curseur dans le texte.
    document.addEventListener('keydown', (e) => {
        if(!state.scriptAC || !state.scriptAC.active) return;
        try {
            if(e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); state.scriptAC.index++; ScriptEditor.highlightAC(); return; }
            if(e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); state.scriptAC.index--; ScriptEditor.highlightAC(); return; }
            if(e.key === 'ArrowRight' && (state.scriptAC.columns||[]).length > 1) { e.preventDefault(); e.stopPropagation(); ScriptEditor.switchACColumn(1); return; }
            if(e.key === 'ArrowLeft' && (state.scriptAC.columns||[]).length > 1) { e.preventDefault(); e.stopPropagation(); ScriptEditor.switchACColumn(-1); return; }
            if(e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); ScriptEditor.selectAC(); return; }
            if(e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ScriptEditor.hideAC(); return; }
        } catch(err) { console.error('[ScriptAC] erreur navigation clavier:', err); }
    }, true);
    } // fin guard focusKeyListenerAttached

    // v570 : les invitations en attente sont chargees par UIDashboard.renderProjectList.
    // V1.4.2: Initialiser les notifications
    Notifications.init();
    // V2.1.2: Initialiser module Admin
    Admin.init();
    
    // CGU : bloque l'accès aux projets tant que non accepté (comptes admin exemptés)
    Terms.checkAndGate(() => {
        Router.boot();
        // Bulle de retour : montee une fois pour toute la session, hub compris.
        try { Feedback.mount(); } catch (e) {}
        setTimeout(function () { try { Tour.maybeAutoStart(); } catch (e) {} }, 700);
    });
},
      toggleMode: (mode) => { 
          document.querySelectorAll('.auth-error, .auth-success').forEach(e => e.style.display='none');
          if(mode === 'signup') { els.loginForm.style.display = 'none'; els.signupForm.style.display = 'block'; els.forgotForm.style.display = 'none'; } 
          else if(mode === 'login') { els.loginForm.style.display = 'block'; els.signupForm.style.display = 'none'; els.forgotForm.style.display = 'none'; }
      },
      toggleForgot: () => {
          document.querySelectorAll('.auth-error, .auth-success').forEach(e => e.style.display='none');
          els.loginForm.style.display = 'none'; els.signupForm.style.display = 'none'; els.forgotForm.style.display = 'block';
      },
      login: async () => { 
          const email = els.loginEmail.value.trim(); const pass = els.loginPass.value.trim(); 
          if(!email || !pass) return;
          const btn = els.loginForm.querySelector('button[type="submit"]');
          const originalText = btn.innerHTML;
          btn.innerHTML = '<span class="spinner"></span>Connexion...';
          btn.classList.add('btn-loading');
          els.loginError.style.display = 'none';
          
          const { data, error } = await supabase.auth.signInWithPassword({
              email: email,
              password: pass
          });
          
          if (error) {
              let message = error.message;
              if (message.includes('Invalid login')) message = "Email ou mot de passe incorrect.";
              if (message.includes('Email not confirmed')) message = "Veuillez valider votre email avant de vous connecter.";
              els.loginError.innerText = message;
              els.loginError.style.display = 'block';
              btn.innerHTML = originalText;
              btn.classList.remove('btn-loading');
          } else if (data.user && !data.user.email_confirmed_at) {
              await supabase.auth.signOut();
              els.loginError.innerText = "Veuillez valider votre email avant de vous connecter.";
              els.loginError.style.display = 'block';
              btn.innerHTML = originalText;
              btn.classList.remove('btn-loading');
          } else if (data.user) {
              // Login réussi - cacher immédiatement l'écran d'auth
              els.authView.style.display = 'none';
              btn.innerHTML = originalText;
              btn.classList.remove('btn-loading');
          }
      },
      signup: async () => { 
          const email = els.signupEmail.value.trim(); const pass = els.signupPass.value.trim(); const confirm = els.signupConfirm.value.trim(); 
          const accountType = 'new'; // Pas de type par défaut, l'utilisateur créera ses profils ensuite
          if(!email || !pass) return; 
          if(pass !== confirm) { els.signupError.innerText = "Mots de passe non identiques"; els.signupError.style.display = 'block'; return; }
          
          // CGU : le premier clic coche automatiquement la case, un second clic crée le compte
          const termsCk = document.getElementById('signup-terms-check');
          if(termsCk && !termsCk.checked) {
              termsCk.checked = true;
              Utils.toast("Case « conditions d'utilisation et mentions légales » cochée. Cliquez à nouveau pour créer votre compte.", 'info');
              return;
          }
          
          // ========== VÉRIFICATION LISTE BLANCHE PRÉ-ALPHA ==========
          if(CONFIG.preAlpha.enabled) {
              const emailLower = email.toLowerCase();
              if(!CONFIG.preAlpha.whitelist.includes(emailLower)) {
                  els.signupError.innerHTML = "🔒 <strong>Accès Pré-Alpha Réservé</strong><br><br>Moteur est actuellement en phase de test privée.<br><br>Seuls les testeurs invités peuvent créer un compte pour le moment.<br><br>Contactez l'équipe Moteur si vous souhaitez participer à la pré-alpha !";
                  els.signupError.style.display = 'block';
                  return;
              }
          }
          
          // ========== VÉRIFICATION LIMITE UTILISATEURS PRÉ-ALPHA ==========
          if(CONFIG.preAlpha.maxUsers) {
              try {
                  const { count, error } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true });
                  if(!error && count >= CONFIG.preAlpha.maxUsers) {
                      els.signupError.innerHTML = "🚫 <strong>Limite atteinte</strong><br><br>La pré-alpha de Moteur a atteint sa limite de " + CONFIG.preAlpha.maxUsers + " utilisateurs.<br><br>Les inscriptions reprendront bientôt. Merci de votre patience !";
                      els.signupError.style.display = 'block';
                      return;
                  }
              } catch(e) {
                  console.error('Erreur vérification limite:', e);
              }
          }
          
          const btn = els.signupForm.querySelector('button[type="submit"]');
          const originalText = btn.innerHTML;
          btn.innerHTML = '<span class="spinner"></span>Création...';
          btn.classList.add('btn-loading');
          els.signupError.style.display = 'none';
          
          const { data, error } = await supabase.auth.signUp({
              email: email,
              password: pass
          });
          
          if (error) {
              let message = error.message;
              if (message.includes('already registered')) message = "Cet email est déjà utilisé.";
              els.signupError.innerText = message;
              els.signupError.style.display = 'block';
              btn.innerHTML = originalText;
              btn.classList.remove('btn-loading');
              return;
          }
          
          // Créer le profil utilisateur dans la table user_profiles
          const { error: profileError } = await supabase.from('user_profiles').insert({
              email: email.toLowerCase(),
              owner_email: email.toLowerCase(),
              name: '',
              terms_accepted: true,
              terms_accepted_at: new Date().toISOString(),
              profile_type: accountType,
              created_at: new Date().toISOString(),
              is_public: false
          });
          
          if (profileError) {
              console.error('Erreur création profil:', profileError);
          }
          
          btn.innerHTML = originalText;
          btn.classList.remove('btn-loading');
          Auth.toggleMode('login');
          els.loginSuccess.innerText = "🎉 Bienvenue dans la pré-alpha ! Un lien de validation a été envoyé à " + email;
          els.loginSuccess.style.display = 'block';
          await supabase.auth.signOut();
      },
      resetPassword: async () => {
          const email = els.forgotEmail.value.trim();
          if(!email) { els.forgotError.innerText = "Veuillez entrer votre email."; els.forgotError.style.display = 'block'; return; }
          
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin
          });
          
          if (error) {
              els.forgotError.innerText = error.message;
              els.forgotError.style.display = 'block';
              els.forgotSuccess.style.display = 'none';
          } else {
              els.forgotSuccess.style.display = 'block';
              els.forgotError.style.display = 'none';
          }
      },
      logout: async () => { 
          NavMemory.clear(); // Vraie déconnexion : on oublie tout
          ActiveProfile.clear();
          try { await supabase.auth.signOut(); } catch(_) {}
          try { Object.keys(localStorage).filter(k => k.startsWith('moteur-auth-token')).forEach(k => localStorage.removeItem(k)); } catch(_) {}
          location.reload();
      }
  };
  
  // ========== PRICING ==========
  // Gestion des plans et limites d'utilisation
  // ========== PRICING - Modèle à l'usage ==========