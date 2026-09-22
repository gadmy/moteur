
// =====================================================================
// Adresse et cle PUBLIQUE de la base. Declarees ici, en dehors de
// l'application, parce que le capteur d'erreurs ci-dessous doit pouvoir
// envoyer AVANT que l'application n'ait demarre — et surtout quand c'est
// justement son demarrage qui a echoue. L'application les reprend telles
// quelles : une seule source, pas de copie a tenir a jour.
// =====================================================================
const MOTEUR_SUPABASE = {
    url: 'https://txjuniuzqxpxghubluxm.supabase.co',
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4anVuaXV6cXhweGdodWJsdXhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MDk1MjMsImV4cCI6MjA4NDk4NTUyM30.QcuA9EdDFBSuzLvUVPiB9a3lPZLFzYBccw99pI71AhQ'
};

// =====================================================================
// ErrorLogger — capteur global d'erreurs JS pour diagnostic des bugs
// =====================================================================
const ErrorLogger = {
    STORAGE_KEY: 'moteur_error_log',
    MAX_ERRORS: 20,
    _lastToastTime: 0,
    _toastThrottle: 3000, // max 1 toast toutes les 3 secondes pour éviter le spam
    
    // Récupère la liste des erreurs stockées
    getErrors: () => {
        try {
            const raw = localStorage.getItem(ErrorLogger.STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
    },
    
    // Ajoute une erreur au log
    addError: (type, message, source, line, col, stack) => {
        try {
            const errors = ErrorLogger.getErrors();
            const entry = {
                ts: new Date().toISOString(),
                url: (window.location.pathname || '') + (window.location.hash || ''),
                type: type,
                message: String(message || 'Erreur inconnue').substring(0, 500),
                source: source ? String(source).substring(0, 200) : '',
                line: line || 0,
                col: col || 0,
                stack: stack ? String(stack).substring(0, 2000) : ''
            };
            errors.unshift(entry);
            // Limiter à MAX_ERRORS
            if(errors.length > ErrorLogger.MAX_ERRORS) errors.length = ErrorLogger.MAX_ERRORS;
            localStorage.setItem(ErrorLogger.STORAGE_KEY, JSON.stringify(errors));
            return entry;
        } catch(e) {
            console.error('ErrorLogger.addError failed:', e);
            return null;
        }
    },
    
    // Vide le log
    clear: () => {
        localStorage.removeItem(ErrorLogger.STORAGE_KEY);
        console.log('[ErrorLogger] Log vidé');
    },
    
    // Affiche un résumé dans la console
    show: () => {
        const errors = ErrorLogger.getErrors();
        if(errors.length === 0) {
            console.log('%c[ErrorLogger] ✅ Aucune erreur enregistrée', 'color:green; font-weight:bold');
            return;
        }
        console.log(`%c[ErrorLogger] ${errors.length} erreur(s) récente(s)`, 'color:red; font-weight:bold; font-size:14px');
        errors.forEach((e, i) => {
            console.group(`#${i+1} - ${e.ts} - ${e.type}`);
            console.log('Message:', e.message);
            console.log('Source:', e.source + ':' + e.line + ':' + e.col);
            if(e.stack) console.log('Stack:', e.stack);
            console.groupEnd();
        });
        console.log('%cCommandes utiles:', 'font-weight:bold');
        console.log('  ErrorLogger.clear()  - Vider le log');
        console.log('  ErrorLogger.copy()   - Copier le log dans le presse-papier');
    },
    
    // Copie le log dans le presse-papier (pour envoyer facilement)
    copy: async () => {
        const errors = ErrorLogger.getErrors();
        const text = errors.map((e, i) => 
            `#${i+1} [${e.ts}] ${e.type}\n  ${e.message}\n  ${e.source}:${e.line}:${e.col}\n  ${e.url}\n${e.stack ? '  Stack:\n' + e.stack.split('\n').map(l => '    '+l).join('\n') : ''}`
        ).join('\n\n');
        try {
            await navigator.clipboard.writeText(text || 'Aucune erreur enregistrée');
            console.log('%c✅ Log copié dans le presse-papier', 'color:green');
        } catch(e) {
            console.log('Copie impossible, voici le texte :');
            console.log(text);
        }
    },
    
    // =================================================================
    // REMONTEE VERS LA BASE (v600)
    // =================================================================
    // Sans ca, une erreur survenue chez quelqu'un d'autre reste dans SON
    // navigateur et personne ne la voit jamais. On la depose donc dans la
    // table client_errors (voir sql/remontee_erreurs.sql).
    // CE QU'ON ENVOIE : le message, le fichier, la ligne, la pile, la page,
    // la version affichee et un navigateur abrege. NI compte, NI projet :
    // on veut reparer le bug, pas savoir qui l'a eu.
    // ENVOI DIRECT, sans le SDK Supabase, et c'est le point important : les
    // erreurs les plus utiles sont justement celles du demarrage, quand le
    // SDK n'est pas encore la — ou quand c'est lui qui a echoue.
    REMONTEE: {
        MAX_PAR_SESSION: 10,   // plafond dur : une boucle d'erreurs ne doit pas inonder la base
        _envoyees: 0,
        _vues: {},             // empreintes deja envoyees pendant cette session
        // Bruit connu, sans valeur de diagnostic :
        // - les extensions du navigateur ne sont pas notre code ;
        // - « Script error. » est ce que rend un script d'un autre domaine,
        //   sans message ni ligne : il n'apprend rien ;
        // - la boucle ResizeObserver est un avertissement sans consequence.
        IGNORER: [/^chrome-extension:/, /^moz-extension:/, /^safari-web-extension:/],
        MESSAGES_IGNORES: [/^Script error\.?$/i, /ResizeObserver loop/i]
    },

    // Empreinte de regroupement : meme erreur, meme endroit. Les nombres sont
    // remplaces par # pour que deux occurrences ne differant que par un
    // identifiant ou un index se regroupent au lieu de compter pour deux.
    _empreinte: (e) => (e.type + '|' + String(e.message).replace(/\d+/g, '#') + '|'
        + String(e.source || '').split('/').pop() + '|' + (e.line || 0)).substring(0, 120),

    _version: () => {
        try { return (document.getElementById('app-version') || {}).textContent || ''; }
        catch (err) { return ''; }
    },
    // Navigateur en clair et court. L'agent complet n'apprend rien de plus et
    // sert surtout a pister les gens.
    _navigateur: () => {
        const ua = navigator.userAgent || '';
        const nom = /Edg\//.test(ua) ? 'Edge'
            : /OPR\//.test(ua) ? 'Opera'
            : /Chrome\//.test(ua) ? 'Chrome'
            : /Firefox\//.test(ua) ? 'Firefox'
            : /Safari\//.test(ua) ? 'Safari' : 'Autre';
        const os = /Windows/.test(ua) ? 'Windows'
            : /Android/.test(ua) ? 'Android'
            : /iPhone|iPad/.test(ua) ? 'iOS'
            : /Mac OS X/.test(ua) ? 'macOS'
            : /Linux/.test(ua) ? 'Linux' : '';
        return (nom + (os ? ' / ' + os : '')).substring(0, 120);
    },

    envoyer: (e) => {
        try {
            if(!e) return;
            const R = ErrorLogger.REMONTEE;
            // En local (double-clic sur le fichier), on est en train de tester :
            // rien a remonter, ca ne ferait que brouiller le tableau.
            if(location.protocol === 'file:') return;
            if(R._envoyees >= R.MAX_PAR_SESSION) return;
            if(R.IGNORER.some(rx => rx.test(e.source || ''))) return;
            if(R.MESSAGES_IGNORES.some(rx => rx.test(e.message || ''))) return;
            const empreinte = ErrorLogger._empreinte(e);
            if(R._vues[empreinte]) return;   // une fois par session suffit
            R._vues[empreinte] = true;
            R._envoyees++;
            fetch(MOTEUR_SUPABASE.url + '/rest/v1/client_errors', {
                method: 'POST',
                keepalive: true,             // survit a la fermeture de l'onglet
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': MOTEUR_SUPABASE.anon,
                    'Authorization': 'Bearer ' + MOTEUR_SUPABASE.anon,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    empreinte: empreinte,
                    type: String(e.type || '').substring(0, 40),
                    message: String(e.message || '').substring(0, 500),
                    source: String(e.source || '').substring(0, 300),
                    ligne: e.line || 0,
                    colonne: e.col || 0,
                    pile: String(e.stack || '').substring(0, 2000),
                    page: String(e.url || '').substring(0, 300),
                    version: ErrorLogger._version().substring(0, 20),
                    navigateur: ErrorLogger._navigateur()
                })
            }).catch(() => {});   // un envoi rate ne doit JAMAIS relancer une erreur
        } catch (err) { /* le capteur ne plante pas l'application */ }
    },

    // Affiche un toast d'alerte visible dans l'UI
    showToast: (message) => {
        const now = Date.now();
        if(now - ErrorLogger._lastToastTime < ErrorLogger._toastThrottle) return; // throttling
        ErrorLogger._lastToastTime = now;
        
        // Essayer d'utiliser Utils.toast si disponible
        try {
            if(typeof app !== 'undefined' && app.Utils && app.Utils.toast) {
                app.Utils.toast('⚠️ Erreur JS détectée — Tape ErrorLogger.show() en console (F12)', 'error', 6000);
                return;
            }
        } catch(e) {}
        
        // Fallback : toast custom si Utils.toast pas encore dispo
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed; top:20px; right:20px; background:#dc2626; color:white; padding:12px 20px; border-radius:8px; z-index:var(--z-toast); box-shadow:0 4px 15px rgba(0,0,0,0.3); font-family:system-ui, sans-serif; font-size:14px; max-width:400px;';
        div.innerHTML = '⚠️ <strong>Erreur JS détectée</strong><br><span style="font-size:0.85em; opacity:0.9;">Tape <code>ErrorLogger.show()</code> en console (F12)</span>';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 6000);
    }
};

// Installer le capteur global d'erreurs JS
window.addEventListener('error', function(event) {
    const entry = ErrorLogger.addError(
        'JS Error',
        event.message,
        event.filename,
        event.lineno,
        event.colno,
        event.error && event.error.stack ? event.error.stack : null
    );
    if(entry) { ErrorLogger.envoyer(entry); ErrorLogger.showToast(); }
});

// Installer le capteur des promesses rejetées non gérées
window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    const msg = reason && reason.message ? reason.message : String(reason);
    const stack = reason && reason.stack ? reason.stack : null;
    const entry = ErrorLogger.addError('Promise rejetée', msg, '', 0, 0, stack);
    if(entry) { ErrorLogger.envoyer(entry); ErrorLogger.showToast(); }
});

// Exposer en global pour usage console
window.ErrorLogger = ErrorLogger;
console.log('%c[ErrorLogger] ✅ Capteur d\'erreurs actif - tape ErrorLogger.show() pour voir le log', 'color:#2b6ef6; font-weight:bold');

const app = (function(){

  // --- CONFIGURATION SUPABASE ---
  // Reprises de MOTEUR_SUPABASE, declare en tete de fichier (le capteur
  // d'erreurs en a besoin avant le demarrage de l'application).
  const SUPABASE_URL = MOTEUR_SUPABASE.url;
  const SUPABASE_ANON_KEY = MOTEUR_SUPABASE.anon;
  
  var supabase;
  // ==========================================================================
  //  UNE ATTENTE QUI NE FINIT JAMAIS EST UN ECRAN NOIR (v601)
  // ==========================================================================
  //  La bibliotheque Supabase arrive d'un CDN. Si elle n'arrive PAS — pas de
  //  reseau, CDN bloque, fichier ouvert dans un avion — cette fonction se
  //  rappelait toutes les cent millisecondes POUR TOUJOURS. Le demarrage
  //  restait bloque sur son « await », plus rien n'etait affiche, et la page
  //  restait NOIRE : pas de message, pas d'erreur en console, rien a quoi se
  //  raccrocher. Signale en ouvrant le fichier en local.
  //  C'est le meme defaut que les trois de septembre — un mecanisme qui
  //  attend sans jamais conclure — et il se corrige pareil : on lui donne une
  //  echeance, et on DIT ce qui s'est passe.
  const MOTEUR_ATTENTE_MAX = 20000;   // 20 s : large, meme sur une connexion lente
  function moteurEcranPanne(message) {
      try {
          if(document.getElementById('moteur-panne')) return;
          const d = document.createElement('div');
          d.id = 'moteur-panne';
          d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;'
              + 'align-items:center;justify-content:center;padding:24px;'
              + 'background:#121212;color:#e8e8e8;font-family:system-ui,sans-serif;text-align:center;';
          d.innerHTML = '<div style="max-width:520px;line-height:1.55">'
              + '<div style="font-size:2.6rem;margin-bottom:12px">&#128268;</div>'
              + '<div style="font-size:1.15rem;font-weight:700;margin-bottom:10px">Moteur n\'a pas pu démarrer</div>'
              + '<div style="opacity:.85;font-size:.95rem">' + message + '</div>'
              + '<button style="margin-top:18px;padding:10px 18px;border-radius:8px;border:1px solid #444;'
              + 'background:#1e1e1e;color:#e8e8e8;cursor:pointer" onclick="location.reload()">Réessayer</button>'
              + '</div>';
          (document.body || document.documentElement).appendChild(d);
      } catch(e) { /* si meme ceci echoue, la console reste le dernier recours */ }
  }
  function initSupabase() {
      return new Promise((resolve) => {
          const depart = Date.now();
          function tryInit() {
              if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
                  const isFileProtocol = window.location.protocol === 'file:';
                  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                      auth: {
                          storageKey: 'moteur-auth-token',
                          flowType: 'pkce',
                          detectSessionInUrl: true,
                          persistSession: true,
                          autoRefreshToken: !isFileProtocol,
                          // Verrou d'auth SÉRIALISÉ EN MÉMOIRE (chaîne de promesses) :
                          // chaque opération d'auth s'exécute une seule fois, jusqu'au bout, l'une après l'autre.
                          // Supprime tout navigator.locks (verrou orphelin + le motif abort-puis-rejeu qui
                          // corrompait l'état interne de supabase-js et gelait getSession() définitivement).
                          lock: (() => {
                              let chain = Promise.resolve();
                              let seq = 0;
                              let lockHeld = false;
                              const log = (window.__sbLock = window.__sbLock || []);
                              return (name, acquireTimeout, fn) => {
                                  const op = { id: ++seq, name: name, acquireTimeout: acquireTimeout, queuedAt: Date.now(), state: 'queued' };
                                  log.push(op); if(log.length > 40) log.shift();
                                  // Reentrance : supabase-js re-acquiert le verrou alors qu'il le detient deja
                                  // (initialize -> _onVisibilityChanged -> _acquireLock au reveil de visibilite).
                                  // La serialiser deadlock (l'op parente attend cette sous-op, qui attend la file).
                                  // On l'execute donc directement, hors file.
                                  if(lockHeld) {
                                      op.state = 'reentrant'; op.startAt = Date.now();
                                      const r = Promise.resolve().then(fn);
                                      r.then(() => { op.state = 'done'; op.ms = Date.now() - op.startAt; },
                                             (e) => { op.state = 'error'; op.err = e && e.message; });
                                      return r;
                                  }
                                  const exec = () => {
                                      lockHeld = true; op.state = 'running'; op.startAt = Date.now();
                                      let to;
                                      // Filet ultime : si fn() ne repond pas en 15 s, on REJETTE le run (fn n'est PAS
                                      // annule, il poursuit en arriere-plan) pour ne jamais geler. Pas d'abort-puis-rejeu.
                                      const guard = new Promise((_, rej) => { to = setTimeout(() => { op.timedOut = true; rej(new Error('auth lock op #' + op.id + ' timeout')); }, 15000); });
                                      return Promise.race([ Promise.resolve().then(fn), guard ]).finally(() => { clearTimeout(to); lockHeld = false; });
                                  };
                                  const run = chain.then(exec, exec);
                                  run.then(() => { op.state = 'done'; op.ms = Date.now() - (op.startAt || op.queuedAt); },
                                           (e) => { op.state = op.timedOut ? 'timeout' : 'error'; op.err = e && e.message; console.warn('[LOCK] op #' + op.id + ' "' + name + '" ' + op.state + ' : ' + op.err); });
                                  // Chain STRICTE : la file attend la VRAIE fin de l'op (resolue OU rejetee).
                                  chain = run.then(() => {}, () => {});
                                  return run;
                              };
                          })()
                      },
                      global: {
                          headers: { 'x-application-name': 'moteur' }
                      }
                  });
                  supabase = client;
                  window.supabase = client;
                      if(isFileProtocol) {
                      // Mode fichier local détecté
                      supabase.realtime.disconnect();
                      supabase.removeAllChannels();
                      // Empêcher toute reconnexion websocket
                      supabase.realtime.connect = () => {};
                      supabase.realtime.reconnect = () => {};
                      supabase.channel = () => ({ on: function(){return this;}, subscribe: function(){return this;}, track: function(){return this;}, send: function(){return this;} });
                  }
                  // Supabase initialisé
                  resolve(true);
              } else if(Date.now() - depart < MOTEUR_ATTENTE_MAX) {
                  // Attente de Supabase
                  setTimeout(tryInit, 100);
              } else {
                  // ON RENONCE, ET ON LE DIT. Mieux vaut un message franc qu'une
                  // page noire : la personne peut agir sur sa connexion, pas sur
                  // une attente invisible.
                  console.error('[Moteur] La bibliotheque Supabase n\'a pas pu etre chargee (CDN injoignable ?).');
                  moteurEcranPanne('La bibliothèque de connexion n\'a pas pu être téléchargée.<br>'
                      + 'Vérifiez votre connexion internet : même ouvert depuis votre disque, '
                      + 'Moteur a besoin du réseau pour vous connecter.');
                  resolve(false);
              }
          }
          tryInit();
      });
  }
  initSupabase();
  
const CONFIG = { 
    themeKey: 'fmp_theme_pref',
    // ========== ADMIN ==========
    adminEmails: ['contact@moteur.studio'],  // Emails ayant accès au tableau de bord admin
    internalEmails: ['contact@moteur.studio', 'ga.dmy@ikmail.com', 'ga.demauroy@gmail.com'],  // B4 : connexions internes (exclues des stats)
    
    // ========== INSCRIPTIONS ==========
    // Ouvertes à tous. maxUsers: null => aucune limite. enabled/whitelist
    // conservés comme interrupteur : repasser enabled à true + remplir la
    // whitelist pour re-fermer les inscriptions si besoin.
    preAlpha: {
        enabled: false,
        maxUsers: null,
        whitelist: []
    },
    
    // Types de journées de travail : source unique dans Planning.dayTypes
    	 bdCategories: ["TECHNICIENS", "COMEDIENS", "PERSONNAGES", "DECORS-LIEUX", "FIGURATION", "ACCESSOIRES", "COSTUMES", "MAQUILLAGE-COIFFURE", "VEHICULES", "ANIMAUX", "SON-MUSIQUE", "EFFETS SPECIAUX (SFX)", "EFFETS VISUELS (VFX)", "LUMIERE", "MACHINERIE", "LOGISTIQUE"],
     shotTypes: ["Gros plan (GP)", "Plan moyen (PM)", "Plan américain (PA)", "Plan large (PL)", "Plan d'ensemble (PE)", "Très gros plan (TGP)", "Plan rapproché (PR)", "Plan italien (PI)"],
    cameraMoves: ["Fixe (FX)", "Travelling avant (TAV)", "Travelling arrière (TAR)", "Travelling latéral (TL)", "Panoramique horizontal (PH)", "Panoramique vertical (PV)", "Zoom avant (ZA)", "Zoom arrière (ZR)", "Plan-séquence (PS)"],
    cameraModes: ["Pied (PD)", "Épaule (EP)", "Steadicam (STD)", "Drone (DR)", "Dolly (DY)", "Grue (GR)", "Gimbal (GM)", "Caméra portée (CP)", "Voiture (VT)", "Rail (RL)"],
    // Mapping groupe technicien → catégories dépouillement
    crewToBreakdownMap: {
    'gc5': ['ACCESSOIRES', 'DECORS-LIEUX'],      // Décoration
    'gc6': ['COSTUMES'],                          // Costumes
    'gc7': ['MAQUILLAGE-COIFFURE'],              // Maquillage/Coiffure
    'gc12': ['VEHICULES', 'LOGISTIQUE'],         // Transport/Logistique
    'gc4': ['SON-MUSIQUE'],                       // Son
    'gc2': ['LUMIERE'],                           // Lumière
    'gc18': ['MACHINERIE'],                      // Machinerie
    'gc9': ['FIGURATION', 'ANIMAUX'],            // Régie
    'gc16': ['EFFETS SPECIAUX (SFX)'],           // Cascades/Stunts
    'gc13': ['EFFETS VISUELS (VFX)'],            // Post-production (VFX)
},
crewGroups: [
    {id: 'gc1', name: '📹 Image', type: 'crew'},
    {id: 'gc2', name: '💡 Lumière', type: 'crew'},
    {id: 'gc18', name: '🏗️ Machinerie', type: 'crew'},
    {id: 'gc3', name: '🎬 Réalisation', type: 'crew'},
    {id: 'gc4', name: '🎤 Son', type: 'crew'},
    {id: 'gc5', name: '🎨 Décoration', type: 'crew'},
    {id: 'gc6', name: '👗 Costumes', type: 'crew'},
    {id: 'gc7', name: '💄 Maquillage/Coiffure', type: 'crew'},
    {id: 'gc8', name: '📝 Script/Continuité', type: 'crew'},
    {id: 'gc9', name: '🎭 Régie', type: 'crew'},
    {id: 'gc10', name: '💼 Production', type: 'crew'},
    {id: 'gc11', name: '🍴 Catering', type: 'crew'},
    {id: 'gc12', name: '🚗 Transport/Logistique', type: 'crew'},
    {id: 'gc13', name: '🎞️ Post-production', type: 'crew'},
    {id: 'gc14', name: '✍️ Scénario/Écriture', type: 'crew'},
    {id: 'gc15', name: '🎵 Musique', type: 'crew'},
    {id: 'gc16', name: '🦺 Cascades/Stunts', type: 'crew'},
    {id: 'gc17', name: '➕ Autre', type: 'crew'}
],
// Types d'associations
associationTypes: [
    {id: 'asso_video', name: '🎬 Vidéo / Cinéma'},
    {id: 'asso_comediens', name: '🎭 Comédiens / Acteurs'},
    {id: 'asso_realisateurs', name: '🎥 Réalisateurs'},
    {id: 'asso_techniciens', name: '🔧 Techniciens'},
    {id: 'asso_scenaristes', name: '✍️ Scénaristes / Auteurs'},
    {id: 'asso_producteurs', name: '💼 Producteurs'},
    {id: 'asso_figurants', name: '👥 Figurants'},
    {id: 'asso_court_metrage', name: '🎞️ Court-métrage'},
    {id: 'asso_documentaire', name: '📹 Documentaire'},
    {id: 'asso_animation', name: '🎨 Animation'},
    {id: 'asso_musique', name: '🎵 Musique / Clip'},
    {id: 'asso_theatre', name: '🎪 Théâtre'},
    {id: 'asso_formation', name: '📚 Formation'},
    {id: 'asso_autre', name: '➕ Autre'}
],
// Types d'entreprises
enterpriseTypes: [
    {id: 'ent_production', name: '🎬 Production'},
    {id: 'ent_postprod', name: '🎞️ Post-production'},
    {id: 'ent_montage', name: '✂️ Montage'},
    {id: 'ent_vfx', name: '✨ Effets spéciaux / VFX'},
    {id: 'ent_doublage', name: '🎙️ Doublage / Voix-off'},
    {id: 'ent_son', name: '🔊 Son / Mixage'},
    {id: 'ent_musique', name: '🎵 Musique / Composition'},
    {id: 'ent_location', name: '📦 Location de matériel'},
    {id: 'ent_vente', name: '🛒 Vente de matériel'},
    {id: 'ent_studio', name: '🏢 Studio / Plateau'},
    {id: 'ent_casting', name: '🎭 Casting'},
    {id: 'ent_distribution', name: '📽️ Distribution'},
    {id: 'ent_technique', name: '🔧 Services techniques'},
    {id: 'ent_formation', name: '📚 Formation'},
    {id: 'ent_autre', name: '➕ Autre'}
],
crewRoles: {
    // 'Chef·fe électro' a quitte ce departement le 20 septembre : il appartient a
    // 'gc2' (Lumiere), ou il existe deja sous « Chef·fe électricien·ne ». Verifie
    // en base avant de bouger : AUCUN profil ne l'avait choisi, le retrait ne rend
    // donc personne introuvable. Regle generale inchangee — un libelle de poste est
    // une VALEUR STOCKEE : on en ajoute, on n'en renomme pas a la legere.
    'gc1': ['Directeur·rice de la photographie', 'Cadreur·euse', 'Assistant·e caméra', '1er·ère assistant·e opérateur·rice', '2ème assistant·e opérateur·rice', 'Steadicamer', 'Pilote drone', 'DIT', 'Photographe plateau', 'Autre'],
    'gc2': ['Chef·fe électricien·ne', 'Électricien·ne', 'Groupiste', 'Best Boy/Girl', 'Pupitreur·euse', 'Autre'],
    'gc18': ['Chef·fe machiniste', 'Sous-chef·fe machiniste', 'Machiniste', 'Grutier·ère', 'Autre'],
    'gc3': ['Réalisateur·rice', 'Réalisateur·rice 2ème équipe', '1er·ère assistant·e réalisateur·rice', '2ème assistant·e réalisateur·rice', '3ème assistant·e réalisateur·rice', 'Directeur·rice de casting', 'Coach acting', 'Autre'],
    'gc4': ['Chef·fe opérateur·rice son', 'Perchiste', 'Assistant·e son', 'Sound designer', 'Ingénieur·e du son', 'Autre'],
    'gc5': ['Chef·fe décorateur·rice', 'Ensemblier·ère', 'Accessoiriste', 'Constructeur·rice', 'Peintre', 'Tapissier·ère', 'Staffeur·euse', 'Régisseur·euse d\'extérieurs', 'Autre'],
    'gc6': ['Chef·fe costumier·ère', 'Costumier·ère', 'Habilleur·euse', 'Couturier·ère', 'Autre'],
    'gc7': ['Chef·fe maquilleur·euse', 'Maquilleur·euse', 'Chef·fe coiffeur·euse', 'Coiffeur·euse', 'Prothésiste', 'SFX Makeup', 'Autre'],
    'gc8': ['Scripte', 'Assistant·e scripte', 'Autre'],
    'gc9': ['Régisseur·euse général·e', 'Régisseur·euse adjoint·e', 'Assistant·e régisseur·euse', 'Régisseur·euse d\'extérieurs', 'Runner', 'Stagiaire régie', 'Autre'],
    'gc10': ['Producteur·rice', 'Producteur·rice exécutif·ve', 'Directeur·rice de production', 'Administrateur·rice de production', 'Comptable', 'Assistant·e de production', 'Coordinateur·rice', 'Chargé·e de figuration', 'Autre'],
    'gc11': ['Chef·fe cuisinier·ère', 'Cuisinier·ère', 'Serveur·euse', 'Responsable craft', 'Autre'],
    'gc12': ['Chef·fe transport', 'Chauffeur·euse', 'Chauffeur·euse camion', 'Responsable logistique', 'Autre'],
    'gc13': ['Monteur·euse', 'Assistant·e monteur·euse', 'Étalonneur·euse', 'Mixeur·euse', 'Sound designer', 'Compositeur·rice', 'Superviseur·euse VFX', 'Graphiste VFX', 'Conformateur·rice', 'Infographiste', 'Autre'],
    'gc14': ['Scénariste', 'Co-scénariste', 'Dialoguiste', 'Script doctor', 'Adaptateur·rice', 'Consultant·e scénario', 'Story-boarder', 'Autre'],
    'gc15': ['Compositeur·rice', 'Directeur·rice musical·e', 'Superviseur·euse musical·e', 'Arrangeur·euse', 'Musicien·ne', 'Autre'],
    'gc16': ['Coordinateur·rice cascades', 'Cascadeur·euse', 'Doublure cascade', 'Maître·sse d\'armes', 'Pyrotechnicien·ne', 'Autre'],
    'gc17': ['Autre']
},
    
    // Permissions par défaut selon le rôle
    // Niveaux: 'none' = pas d'accès, 'read' = lecture seule, 'write' = modification
    defaultPermissions: {
        // Propriétaire du projet - accès total
        'owner': {
            synopsis: 'write', scenario: 'write', sequencier: 'write', storyboard: 'write',
            storyboard_lighting: 'write', storyboard_camera: 'write', storyboard_actors: 'write',
            personnages: 'write', lieux: 'write', comediens: 'write', equipe: 'write',
            depouillement: 'write', planning: 'write', stats: 'read',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'write'
        },
        // Réalisateur
        'Réalisateur·rice': {
            synopsis: 'write', scenario: 'write', sequencier: 'write', storyboard: 'write',
            storyboard_lighting: 'read', storyboard_camera: 'read', storyboard_actors: 'read',
            personnages: 'write', lieux: 'read', comediens: 'read', equipe: 'read',
            depouillement: 'write', planning: 'read', stats: 'read',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'write'
        },
        // 1er Assistant Réalisateur
        '1er·ère assistant·e réalisateur·rice': {
            synopsis: 'read', scenario: 'read', sequencier: 'read', storyboard: 'read',
            storyboard_lighting: 'read', storyboard_camera: 'read', storyboard_actors: 'read',
            personnages: 'read', lieux: 'read', comediens: 'read', equipe: 'read',
            depouillement: 'write', planning: 'write', stats: 'read',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'write'
        },
        // 2ème Assistant Réalisateur
        '2ème assistant·e réalisateur·rice': {
            synopsis: 'read', scenario: 'read', sequencier: 'read', storyboard: 'read',
            storyboard_lighting: 'read', storyboard_camera: 'read', storyboard_actors: 'read',
            personnages: 'read', lieux: 'read', comediens: 'read', equipe: 'read',
            depouillement: 'read', planning: 'write', stats: 'read',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'read'
        },
        // Directeur de casting
        'Directeur·rice de casting': {
            synopsis: 'read', scenario: 'read', sequencier: 'read', storyboard: 'none',
            storyboard_lighting: 'none', storyboard_camera: 'none', storyboard_actors: 'none',
            personnages: 'write', lieux: 'none', comediens: 'write', equipe: 'none',
            depouillement: 'read', planning: 'read', stats: 'none',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'none', chat_comediens: 'write'
        },
        // Directeur de la photographie
        'Directeur·rice de la photographie': {
            synopsis: 'read', scenario: 'read', sequencier: 'read', storyboard: 'write',
            storyboard_lighting: 'read', storyboard_camera: 'read', storyboard_actors: 'read',
            personnages: 'none', lieux: 'read', comediens: 'none', equipe: 'read',
            depouillement: 'write', planning: 'read', stats: 'none',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'none'
        },
        // Chefs de poste (par défaut)
        'chef_de_poste': {
            synopsis: 'read', scenario: 'read', sequencier: 'read', storyboard: 'read',
            storyboard_lighting: 'read', storyboard_camera: 'read', storyboard_actors: 'read',
            personnages: 'none', lieux: 'read', comediens: 'none', equipe: 'read',
            depouillement: 'read', planning: 'read', stats: 'none',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'none'
        },
        // Scripte
        'Scripte': {
            synopsis: 'read', scenario: 'read', sequencier: 'read', storyboard: 'read',
            storyboard_lighting: 'read', storyboard_camera: 'read', storyboard_actors: 'read',
            personnages: 'read', lieux: 'read', comediens: 'read', equipe: 'none',
            depouillement: 'write', planning: 'read', stats: 'none',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'read'
        },
        // Producteur
        'Producteur·rice': {
            synopsis: 'read', scenario: 'read', sequencier: 'read', storyboard: 'read',
            storyboard_lighting: 'read', storyboard_camera: 'read', storyboard_actors: 'read',
            personnages: 'read', lieux: 'read', comediens: 'read', equipe: 'write',
            depouillement: 'read', planning: 'write', stats: 'read',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'read', chat_comediens: 'read'
        },
        // Régisseur général
        'Régisseur·euse général·e': {
            synopsis: 'none', scenario: 'none', sequencier: 'read', storyboard: 'none',
            storyboard_lighting: 'none', storyboard_camera: 'none', storyboard_actors: 'none',
            personnages: 'none', lieux: 'write', comediens: 'read', equipe: 'read',
            depouillement: 'read', planning: 'write', stats: 'none',
            chat_general: 'write', chat_chefs: 'write', chat_technique: 'write', chat_comediens: 'read'
        },
        // Technicien standard
        'technicien': {
            synopsis: 'none', scenario: 'none', sequencier: 'none', storyboard: 'none',
            storyboard_lighting: 'none', storyboard_camera: 'none', storyboard_actors: 'none',
            personnages: 'none', lieux: 'none', comediens: 'none', equipe: 'none',
            depouillement: 'none', planning: 'read', stats: 'none',
            chat_general: 'write', chat_chefs: 'none', chat_technique: 'write', chat_comediens: 'none'
        },
        // Comédien
        'comedien': {
            synopsis: 'none', scenario: 'read', sequencier: 'none', storyboard: 'none',
            storyboard_lighting: 'none', storyboard_camera: 'none', storyboard_actors: 'none',
            personnages: 'none', lieux: 'none', comediens: 'none', equipe: 'none',
            depouillement: 'none', planning: 'read', stats: 'none',
            chat_general: 'write', chat_chefs: 'none', chat_technique: 'none', chat_comediens: 'write'
        }
    },
    
    // Liste des sections avec leurs labels
    permissionSections: [
        // v570 : 'presentation' et 'ressources' etaient citees par le mapping de
        // switchTab mais absentes d'ici ET de tous les presets — canAccess renvoyait
        // donc toujours faux et CES DEUX ONGLETS ETAIENT INACCESSIBLES a tout
        // non-proprietaire, editeur compris. Ajoutees.
        { id: 'presentation', label: '🎬 Fiche projet' },
        { id: 'synopsis', label: '📝 Synopsis' },
        { id: 'scenario', label: '📜 Scénario' },
        { id: 'sequencier', label: '🎬 Séquencier' },
        { id: 'storyboard', label: '🎨 Storyboard' },
        { id: 'storyboard_lighting', label: '💡 Lumière (storyboard)' },
        { id: 'storyboard_camera', label: '🎥 Caméra (storyboard)' },
        { id: 'storyboard_actors', label: '🎭 Acteurs (storyboard)' },
        { id: 'moodboard', label: '🖼️ Mood Board' },
        { id: 'personnages', label: '👥 Personnages' },
        { id: 'lieux', label: '📍 Lieux' },
        { id: 'ressources', label: '🎒 Ressources' },
        { id: 'comediens', label: '🎭 Comédiens' },
        { id: 'equipe', label: '🎥 Technicien.nes' },
        { id: 'depouillement', label: '📋 Dépouillement' },
        { id: 'scriptreport', label: '🎞️ Rapport de script' },
        { id: 'planning', label: '📅 Planning' },
        { id: 'stats', label: '📊 Statistiques' },
        { id: 'depenses', label: '💶 Dépenses' },
        { id: 'contrats', label: '📄 Contrats' }
    ],
    
    // Phase 3 Storyboard : catalogue d'objets pré-remplis pour les annotations
    // Chaque objet : { type: identifiant unique, emoji: rendu visuel, label: nom affiché, category: 'lighting'|'camera'|'actors'|'machinery' }
    // Les objets de la catégorie 'machinery' sont visibles dans toutes les palettes (lumière, caméra, acteurs)
    // Phase 4B : 44 objets avec SVG dessinés à la main (plan technique, vue de dessus)
    // - emoji = fallback si le SVG ne se charge pas
    // - svg = contenu SVG à rendre (utilise stroke="currentColor" pour s'adapter au thème)
    // - category : lighting / camera / actors / tools / machinery
    //   * tools : commun à toutes les palettes (outils électriques + grip)
    //   * machinery : visible UNIQUEMENT dans la palette caméra (mouvements caméra)
    annotationObjects: [
        // ===== LUMIÈRE (10 objets) =====
        { type: 'spot', emoji: '🔦', label: 'Spot', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="18" r="6"/><circle cx="24" cy="18" r="2.5" fill="currentColor" stroke="none"/><path d="M 18 22 L 12 42 M 30 22 L 36 42"/><path d="M 12 42 L 36 42" stroke-dasharray="2 2" opacity="0.5"/><line x1="24" y1="12" x2="24" y2="9"/></svg>` },
        { type: 'projecteur', emoji: '💡', label: 'Projecteur', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="10" width="20" height="14" rx="1.5"/><line x1="14" y1="14" x2="34" y2="14"/><circle cx="24" cy="18" r="3"/><path d="M 14 24 L 6 42 M 34 24 L 42 42"/><path d="M 6 42 L 42 42" stroke-dasharray="2 2" opacity="0.5"/><line x1="12" y1="24" x2="14" y2="24"/><line x1="34" y1="24" x2="36" y2="24"/></svg>` },
        { type: 'kino', emoji: '🟨', label: 'Kino flo', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="14" width="36" height="20" rx="1.5"/><line x1="10" y1="20" x2="38" y2="20"/><line x1="10" y1="24" x2="38" y2="24"/><line x1="10" y1="28" x2="38" y2="28"/><line x1="9" y1="18" x2="9" y2="30"/><line x1="39" y1="18" x2="39" y2="30"/></svg>` },
        { type: 'par', emoji: '🟧', label: 'PAR', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="18" r="9"/><circle cx="24" cy="18" r="6"/><circle cx="24" cy="18" r="3" fill="currentColor" stroke="none" opacity="0.3"/><path d="M 17 26 L 14 42 M 31 26 L 34 42"/><path d="M 14 42 L 34 42" stroke-dasharray="2 2" opacity="0.5"/></svg>` },
        { type: 'fresnel', emoji: '🔆', label: 'Fresnel', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="9" width="22" height="18" rx="1.5"/><circle cx="24" cy="18" r="6"/><circle cx="24" cy="18" r="4"/><circle cx="24" cy="18" r="2"/><line x1="11" y1="12" x2="13" y2="14"/><line x1="37" y1="12" x2="35" y2="14"/><path d="M 13 27 L 8 42 M 35 27 L 40 42"/><path d="M 8 42 L 40 42" stroke-dasharray="2 2" opacity="0.5"/></svg>` },
        { type: 'neon', emoji: '🟦', label: 'Néon / LED', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="20" width="40" height="8" rx="2"/><line x1="10" y1="24" x2="11" y2="24" stroke-width="2"/><line x1="16" y1="24" x2="17" y2="24" stroke-width="2"/><line x1="22" y1="24" x2="23" y2="24" stroke-width="2"/><line x1="28" y1="24" x2="29" y2="24" stroke-width="2"/><line x1="34" y1="24" x2="35" y2="24" stroke-width="2"/><line x1="14" y1="32" x2="14" y2="36" opacity="0.5"/><line x1="24" y1="32" x2="24" y2="36" opacity="0.5"/><line x1="34" y1="32" x2="34" y2="36" opacity="0.5"/></svg>` },
        { type: 'drapeau', emoji: '⬛', label: 'Drapeau noir', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="32" height="22" fill="currentColor" opacity="0.85"/><rect x="8" y="8" width="32" height="22"/><line x1="24" y1="30" x2="24" y2="38"/><circle cx="24" cy="40" r="2.5"/><line x1="22" y1="42" x2="20" y2="44"/><line x1="26" y1="42" x2="28" y2="44"/><line x1="24" y1="42.5" x2="24" y2="45"/></svg>` },
        { type: 'reflecteur', emoji: '⬜', label: 'Réflecteur', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="24" cy="22" rx="14" ry="6"/><ellipse cx="24" cy="22" rx="11" ry="4" stroke-dasharray="1.5 1.5" opacity="0.5"/><path d="M 14 14 L 11 11 L 14 9 M 11 11 L 18 11"/><path d="M 34 14 L 37 11 L 34 9 M 37 11 L 30 11"/><line x1="24" y1="28" x2="24" y2="38"/><circle cx="24" cy="40" r="2.5"/></svg>` },
        { type: 'gelatine', emoji: '🟥', label: 'Gélatine', category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 10 8 L 36 8 L 40 12 L 40 40 L 10 40 Z"/><path d="M 36 8 L 36 12 L 40 12"/><line x1="14" y1="18" x2="18" y2="14" opacity="0.4"/><line x1="14" y1="24" x2="22" y2="16" opacity="0.4"/><line x1="14" y1="30" x2="28" y2="16" opacity="0.4"/><line x1="16" y1="34" x2="34" y2="16" opacity="0.4"/><line x1="22" y1="34" x2="36" y2="20" opacity="0.4"/><line x1="28" y1="34" x2="36" y2="26" opacity="0.4"/></svg>` },
        { type: 'ambiance', emoji: '🌟', label: "Lumière d'ambiance", category: 'lighting',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="12" width="24" height="24" rx="3"/><rect x="16" y="16" width="16" height="16" rx="2" stroke-dasharray="2 2" opacity="0.5"/><line x1="24" y1="10" x2="24" y2="6" opacity="0.6"/><line x1="24" y1="38" x2="24" y2="42" opacity="0.6"/><line x1="10" y1="24" x2="6" y2="24" opacity="0.6"/><line x1="38" y1="24" x2="42" y2="24" opacity="0.6"/><line x1="14" y1="14" x2="11" y2="11" opacity="0.5"/><line x1="34" y1="14" x2="37" y2="11" opacity="0.5"/><line x1="14" y1="34" x2="11" y2="37" opacity="0.5"/><line x1="34" y1="34" x2="37" y2="37" opacity="0.5"/></svg>` },
        
        // ===== CAMÉRA (8 objets) =====
        { type: 'camera_principale', emoji: '🎥', label: 'Caméra principale', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="6" width="20" height="14" rx="1.5"/><rect x="16" y="8" width="6" height="4" rx="0.5"/><rect x="22" y="20" width="4" height="3"/><circle cx="24" cy="22" r="1.5" fill="currentColor" stroke="none"/><path d="M 20 23 L 8 42 M 28 23 L 40 42"/><path d="M 8 42 L 40 42" stroke-dasharray="2 2" opacity="0.5"/><text x="24" y="14" text-anchor="middle" font-size="6" font-family="sans-serif" font-weight="bold" fill="currentColor" stroke="none">1</text></svg>` },
        { type: 'camera_secondaire', emoji: '📹', label: 'Caméra secondaire', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="7" width="18" height="13" rx="1.5"/><rect x="17" y="9" width="5" height="3.5" rx="0.5"/><rect x="22" y="20" width="4" height="3"/><circle cx="24" cy="22" r="1.5" fill="currentColor" stroke="none"/><path d="M 21 23 L 12 42 M 27 23 L 36 42"/><path d="M 12 42 L 36 42" stroke-dasharray="2 2" opacity="0.5"/><text x="24" y="14" text-anchor="middle" font-size="6" font-family="sans-serif" font-weight="bold" fill="currentColor" stroke="none">2</text></svg>` },
        { type: 'axe_vue', emoji: '➡️', label: 'Axe de vue', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="14" cy="24" rx="6" ry="4"/><circle cx="14" cy="24" r="2" fill="currentColor" stroke="none"/><line x1="22" y1="24" x2="40" y2="24"/><path d="M 36 20 L 40 24 L 36 28"/><line x1="22" y1="20" x2="40" y2="14" stroke-dasharray="2 2" opacity="0.4"/><line x1="22" y1="28" x2="40" y2="34" stroke-dasharray="2 2" opacity="0.4"/></svg>` },
        { type: 'zoom', emoji: '🔍', label: 'Zoom', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="14" width="14" height="14" rx="1.5"/><rect x="27" y="17" width="14" height="8"/><line x1="30" y1="17" x2="30" y2="25" opacity="0.5"/><line x1="33" y1="17" x2="33" y2="25" opacity="0.5"/><line x1="36" y1="17" x2="36" y2="25" opacity="0.5"/><path d="M 30 32 L 26 32 L 28 30 M 26 32 L 28 34"/><path d="M 36 32 L 40 32 L 38 30 M 40 32 L 38 34"/><circle cx="41" cy="21" r="1" fill="currentColor" stroke="none"/></svg>` },
        { type: 'pano_horizontal', emoji: '↔️', label: 'Pano horizontal', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="20" width="8" height="6" rx="1"/><rect x="22" y="26" width="4" height="2"/><path d="M 8 22 Q 24 4 40 22"/><path d="M 11 19 L 8 22 L 11 25"/><path d="M 37 19 L 40 22 L 37 25"/><circle cx="16" cy="14" r="0.8" fill="currentColor" stroke="none"/><circle cx="24" cy="10" r="0.8" fill="currentColor" stroke="none"/><circle cx="32" cy="14" r="0.8" fill="currentColor" stroke="none"/></svg>` },
        { type: 'pano_vertical', emoji: '↕️', label: 'Tilt vertical', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="20" width="8" height="6" rx="1"/><rect x="22" y="22" width="2" height="2"/><path d="M 30 8 Q 42 24 30 40"/><path d="M 27 11 L 30 8 L 33 11"/><path d="M 27 37 L 30 40 L 33 37"/><circle cx="36" cy="14" r="0.8" fill="currentColor" stroke="none"/><circle cx="40" cy="24" r="0.8" fill="currentColor" stroke="none"/><circle cx="36" cy="34" r="0.8" fill="currentColor" stroke="none"/></svg>` },
        { type: 'tripode', emoji: '🦿', label: 'Trépied', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="24" y1="24" x2="24" y2="6"/><line x1="24" y1="24" x2="9" y2="34"/><line x1="24" y1="24" x2="39" y2="34"/><circle cx="24" cy="6" r="2"/><circle cx="9" cy="34" r="2"/><circle cx="39" cy="34" r="2"/><circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.15"/><circle cx="24" cy="24" r="4"/><circle cx="24" cy="24" r="1.5" fill="currentColor" stroke="none"/></svg>` },
        { type: 'epaule', emoji: '💪', label: 'Caméra épaule', category: 'camera',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="24" r="4"/><path d="M 18 22 Q 22 21 24 19 L 24 14 Q 22 12 18 13 Q 14 13 12 16"/><path d="M 18 26 Q 22 27 24 29 L 24 34 Q 22 36 18 35 Q 14 35 12 32"/><rect x="22" y="18" width="14" height="12" rx="1"/><rect x="36" y="22" width="3" height="4"/><path d="M 39 21 L 44 16 M 39 27 L 44 32"/><path d="M 44 16 L 44 32" stroke-dasharray="2 2" opacity="0.5"/></svg>` },
        
        // ===== ACTEURS (9 objets) =====
        { type: 'acteur_homme', emoji: '🚶', label: 'Acteur (homme)', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 12 28 Q 12 22 18 22 L 30 22 Q 36 22 36 28 L 36 32 Q 36 36 30 36 L 18 36 Q 12 36 12 32 Z"/><circle cx="24" cy="16" r="6"/><path d="M 22 10 L 24 7 L 26 10" fill="currentColor" stroke="none"/></svg>` },
        { type: 'acteur_femme', emoji: '🚶‍♀️', label: 'Actrice (femme)', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 8 36 Q 12 22 18 22 L 30 22 Q 36 22 40 36 Q 36 36 24 36 Q 12 36 8 36 Z"/><path d="M 16 14 Q 14 10 16 7 Q 20 4 24 4 Q 28 4 32 7 Q 34 10 32 14 Q 34 18 32 22 L 30 22 Q 28 18 28 16 L 28 13 Q 24 13 20 13 L 20 16 Q 20 18 18 22 L 16 22 Q 14 18 16 14 Z" fill="currentColor" opacity="0.15"/><path d="M 16 14 Q 14 10 16 7 Q 20 4 24 4 Q 28 4 32 7 Q 34 10 32 14 Q 34 18 32 22 L 30 22 Q 28 18 28 16 L 28 13 Q 24 13 20 13 L 20 16 Q 20 18 18 22 L 16 22 Q 14 18 16 14 Z"/><circle cx="24" cy="16" r="6"/><path d="M 22 10 L 24 7 L 26 10" fill="currentColor" stroke="none"/></svg>` },
        { type: 'petite_fille', emoji: '👧', label: 'Petite fille', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 12 38 Q 16 27 21 27 L 27 27 Q 32 27 36 38 Q 32 38 24 38 Q 16 38 12 38 Z"/><path d="M 18 18 Q 16 13 19 10 Q 22 8 24 8 Q 26 8 29 10 Q 32 13 30 18 Q 32 21 30 26 L 28 26 Q 27 22 27 20 L 27 18 Q 24 18 21 18 L 21 20 Q 21 22 20 26 L 18 26 Q 16 21 18 18 Z"/><circle cx="24" cy="20" r="5"/><path d="M 22 15 L 24 12 L 26 15" fill="currentColor" stroke="none"/></svg>` },
        { type: 'petit_garcon', emoji: '🧒', label: 'Petit garçon', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 16 32 Q 16 27 21 27 L 27 27 Q 32 27 32 32 L 32 35 Q 32 38 27 38 L 21 38 Q 16 38 16 35 Z"/><circle cx="24" cy="20" r="5"/><path d="M 22 15 L 24 12 L 26 15" fill="currentColor" stroke="none"/></svg>` },
        { type: 'marque_sol', emoji: '❌', label: 'Marque au sol', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="14" y1="14" x2="34" y2="34"/><line x1="34" y1="14" x2="14" y2="34"/><circle cx="24" cy="24" r="3" fill="currentColor" stroke="none" opacity="0.2"/><circle cx="24" cy="24" r="3"/></svg>` },
        { type: 'deplacement', emoji: '➡️', label: 'Déplacement', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="34" r="3"/><path d="M 13 32 Q 24 14 35 14" stroke-dasharray="3 2"/><path d="M 31 11 L 35 14 L 32 18"/><circle cx="35" cy="14" r="2" fill="currentColor" stroke="none" opacity="0.3"/></svg>` },
        { type: 'entree', emoji: '🚪', label: 'Entrée', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="8" x2="6" y2="40" stroke-dasharray="3 2" opacity="0.5"/><line x1="10" y1="24" x2="22" y2="24"/><path d="M 18 20 L 22 24 L 18 28"/><circle cx="32" cy="24" r="6"/><path d="M 30 18 L 32 15 L 34 18" fill="currentColor" stroke="none"/></svg>` },
        { type: 'sortie', emoji: '🏃', label: 'Sortie', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="24" r="6"/><path d="M 14 18 L 16 15 L 18 18" fill="currentColor" stroke="none"/><line x1="26" y1="24" x2="38" y2="24"/><path d="M 34 20 L 38 24 L 34 28"/><line x1="42" y1="8" x2="42" y2="40" stroke-dasharray="3 2" opacity="0.5"/></svg>` },
        { type: 'regard', emoji: '👁️', label: 'Direction du regard', category: 'actors',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="24" r="5"/><path d="M 18 21 L 38 12 M 18 27 L 38 36"/><path d="M 38 12 L 38 36" stroke-dasharray="2 2" opacity="0.5"/><line x1="19" y1="24" x2="38" y2="24" stroke-dasharray="2 1" opacity="0.5"/></svg>` },
        
        // ===== OUTILS (10 objets, visible dans toutes les palettes) =====
        { type: 'pied', emoji: '🔱', label: 'Pied', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="24" y1="24" x2="24" y2="6"/><line x1="24" y1="24" x2="9" y2="34"/><line x1="24" y1="24" x2="39" y2="34"/><circle cx="24" cy="6" r="1.8"/><circle cx="9" cy="34" r="1.8"/><circle cx="39" cy="34" r="1.8"/><circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.2"/><circle cx="24" cy="24" r="3"/><circle cx="24" cy="24" r="1" fill="currentColor" stroke="none"/></svg>` },
        { type: 'pont', emoji: '🌉', label: 'Pont (truss)', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="16" x2="42" y2="16"/><line x1="6" y1="32" x2="42" y2="32"/><line x1="6" y1="16" x2="14" y2="32"/><line x1="14" y1="32" x2="22" y2="16"/><line x1="22" y1="16" x2="30" y2="32"/><line x1="30" y1="32" x2="38" y2="16"/><line x1="38" y1="16" x2="42" y2="24"/><circle cx="6" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="42" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="6" cy="32" r="1.5" fill="currentColor" stroke="none"/><circle cx="42" cy="32" r="1.5" fill="currentColor" stroke="none"/></svg>` },
        { type: 'prise', emoji: '🔌', label: 'Multiprise', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="18" width="32" height="14" rx="2"/><circle cx="14" cy="25" r="3.5"/><circle cx="12.5" cy="24" r="0.7" fill="currentColor" stroke="none"/><circle cx="15.5" cy="24" r="0.7" fill="currentColor" stroke="none"/><circle cx="22" cy="25" r="3.5"/><circle cx="20.5" cy="24" r="0.7" fill="currentColor" stroke="none"/><circle cx="23.5" cy="24" r="0.7" fill="currentColor" stroke="none"/><circle cx="30" cy="25" r="3.5"/><circle cx="28.5" cy="24" r="0.7" fill="currentColor" stroke="none"/><circle cx="31.5" cy="24" r="0.7" fill="currentColor" stroke="none"/><path d="M 38 25 Q 42 25 42 30 Q 42 36 36 38"/></svg>` },
        { type: 'sandbag', emoji: '🪨', label: 'Sandbag', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 10 18 Q 12 14 16 14 L 32 14 Q 36 14 38 18 L 40 36 Q 38 40 34 40 L 14 40 Q 10 40 8 36 Z" fill="currentColor" opacity="0.1"/><path d="M 10 18 Q 12 14 16 14 L 32 14 Q 36 14 38 18 L 40 36 Q 38 40 34 40 L 14 40 Q 10 40 8 36 Z"/><path d="M 18 14 Q 18 8 24 8 Q 30 8 30 14"/><line x1="14" y1="20" x2="34" y2="20" stroke-dasharray="2 2" opacity="0.5"/><circle cx="16" cy="28" r="0.8" fill="currentColor" stroke="none" opacity="0.5"/><circle cx="22" cy="32" r="0.8" fill="currentColor" stroke="none" opacity="0.5"/><circle cx="28" cy="28" r="0.8" fill="currentColor" stroke="none" opacity="0.5"/><circle cx="32" cy="34" r="0.8" fill="currentColor" stroke="none" opacity="0.5"/></svg>` },
        { type: 'apple_box', emoji: '📦', label: 'Apple box', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 8 16 L 8 38 L 32 38 L 32 16 Z"/><path d="M 8 16 L 16 8 L 40 8 L 32 16"/><path d="M 32 16 L 40 8 L 40 30 L 32 38"/><ellipse cx="20" cy="22" rx="6" ry="2"/><line x1="12" y1="30" x2="28" y2="30" opacity="0.4"/><line x1="12" y1="34" x2="28" y2="34" opacity="0.4"/></svg>` },
        { type: 'cstand', emoji: '🪧', label: 'C-stand', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="14" y1="42" x2="20" y2="36"/><line x1="20" y1="42" x2="20" y2="36"/><line x1="26" y1="42" x2="20" y2="36"/><line x1="20" y1="36" x2="20" y2="14"/><circle cx="20" cy="14" r="2.5"/><line x1="20" y1="14" x2="38" y2="14"/><circle cx="38" cy="14" r="2"/><line x1="38" y1="14" x2="42" y2="10"/><line x1="38" y1="14" x2="42" y2="18"/></svg>` },
        { type: 'gaffer', emoji: '🩹', label: 'Gaffer', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="20" cy="24" rx="12" ry="8"/><ellipse cx="20" cy="24" rx="4" ry="3" fill="currentColor" opacity="0.15"/><ellipse cx="20" cy="24" rx="4" ry="3"/><path d="M 32 24 L 42 26 L 42 30 L 32 28"/><ellipse cx="20" cy="24" rx="8" ry="5.5" opacity="0.3"/></svg>` },
        { type: 'boite_outils', emoji: '🧰', label: 'Boîte à outils', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="20" width="32" height="20" rx="1"/><line x1="8" y1="26" x2="40" y2="26"/><path d="M 16 20 L 16 16 Q 16 12 24 12 Q 32 12 32 16 L 32 20"/><rect x="13" y="24" width="3" height="4" fill="currentColor" stroke="none" opacity="0.3"/><rect x="32" y="24" width="3" height="4" fill="currentColor" stroke="none" opacity="0.3"/><circle cx="24" cy="34" r="1.5"/></svg>` },
        { type: 'praticable', emoji: '📦', label: 'Praticable', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="22" width="36" height="16" rx="1"/><path d="M 6 22 L 14 14 L 50 14" transform="translate(-8,0)"/><path d="M 6 22 L 14 14 M 42 22 L 50 14" transform="translate(-8,0)"/><line x1="14" y1="14" x2="42" y2="14"/><line x1="42" y1="14" x2="42" y2="22"/><line x1="6" y1="38" x2="14" y2="30"/><line x1="42" y1="38" x2="34" y2="30"/></svg>` },
        { type: 'echelle', emoji: '🪜', label: 'Échelle', category: 'tools',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="6" x2="16" y2="42"/><line x1="32" y1="6" x2="32" y2="42"/><line x1="16" y1="12" x2="32" y2="12"/><line x1="16" y1="20" x2="32" y2="20"/><line x1="16" y1="28" x2="32" y2="28"/><line x1="16" y1="36" x2="32" y2="36"/></svg>` },
        
        // ===== MACHINERIE (7 objets, visible UNIQUEMENT dans la palette caméra) =====
        { type: 'dolly', emoji: '🛞', label: 'Dolly', category: 'machinery',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="14" width="28" height="20" rx="2"/><circle cx="14" cy="14" r="3"/><circle cx="34" cy="14" r="3"/><circle cx="14" cy="34" r="3"/><circle cx="34" cy="34" r="3"/><circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.15"/><circle cx="24" cy="24" r="4"/><circle cx="24" cy="24" r="1.5" fill="currentColor" stroke="none"/></svg>` },
        { type: 'travelling_rail', emoji: '🛤️', label: 'Rail droit', category: 'machinery',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="14" x2="42" y2="14"/><line x1="6" y1="34" x2="42" y2="34"/><line x1="10" y1="14" x2="10" y2="34"/><line x1="18" y1="14" x2="18" y2="34"/><line x1="30" y1="14" x2="30" y2="34"/><line x1="38" y1="14" x2="38" y2="34"/><rect x="20" y="18" width="10" height="12" rx="1" fill="currentColor" opacity="0.2"/><rect x="20" y="18" width="10" height="12" rx="1"/><circle cx="25" cy="24" r="1.2" fill="currentColor" stroke="none"/></svg>` },
        { type: 'travelling_rail_45', emoji: '🛤️', label: 'Rail 45° (courbe)', category: 'machinery',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 6 8 Q 40 8 40 42"/><path d="M 6 24 Q 24 24 24 42"/><line x1="10" y1="8" x2="10" y2="24"/><line x1="14" y1="9" x2="13" y2="25"/><line x1="20" y1="11" x2="17" y2="26"/><line x1="28" y1="14" x2="22" y2="29"/><line x1="35" y1="20" x2="24" y2="35"/><line x1="40" y1="28" x2="24" y2="38"/><line x1="40" y1="36" x2="24" y2="42"/><g transform="rotate(35 27 22)"><rect x="22" y="17" width="10" height="10" rx="1" fill="currentColor" opacity="0.2"/><rect x="22" y="17" width="10" height="10" rx="1"/><circle cx="27" cy="22" r="1.2" fill="currentColor" stroke="none"/></g></svg>` },
        { type: 'grue', emoji: '🏗️', label: 'Grue', category: 'machinery',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="36" width="14" height="6" rx="1"/><circle cx="9" cy="42" r="1.5"/><circle cx="17" cy="42" r="1.5"/><line x1="13" y1="36" x2="13" y2="14"/><circle cx="13" cy="14" r="2"/><line x1="13" y1="14" x2="42" y2="10"/><rect x="38" y="6" width="6" height="5" rx="0.5"/><rect x="3" y="13" width="6" height="4" rx="0.5" fill="currentColor" opacity="0.3"/><rect x="3" y="13" width="6" height="4" rx="0.5"/></svg>` },
        { type: 'steadicam', emoji: '🎿', label: 'Steadicam', category: 'machinery',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="6" width="14" height="8" rx="1"/><rect x="28" y="9" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="38"/><ellipse cx="21" cy="40" rx="6" ry="3"/><path d="M 21 22 L 32 24 L 36 28"/><path d="M 26 22 L 28 25 L 30 22 L 32 25" opacity="0.5"/><circle cx="21" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="36" cy="28" r="1.5" fill="currentColor" stroke="none"/></svg>` },
        { type: 'gimbal', emoji: '🎯', label: 'Gimbal', category: 'machinery',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="24" y1="36" x2="24" y2="42"/><rect x="22" y="40" width="4" height="3" rx="0.5"/><rect x="18" y="33" width="12" height="4" rx="1"/><circle cx="24" cy="33" r="1.2" fill="currentColor" stroke="none"/><line x1="24" y1="32" x2="24" y2="22"/><path d="M 14 22 L 14 12 L 34 12 L 34 22"/><rect x="18" y="14" width="12" height="8" rx="1"/><circle cx="24" cy="18" r="2"/><circle cx="14" cy="22" r="1.2" fill="currentColor" stroke="none"/><circle cx="34" cy="22" r="1.2" fill="currentColor" stroke="none"/></svg>` },
        { type: 'drone', emoji: '🚁', label: 'Drone', category: 'machinery',
          svg: `<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="20" width="8" height="8" rx="1"/><line x1="20" y1="20" x2="10" y2="10"/><line x1="28" y1="20" x2="38" y2="10"/><line x1="20" y1="28" x2="10" y2="38"/><line x1="28" y1="28" x2="38" y2="38"/><circle cx="10" cy="10" r="4" stroke-dasharray="2 1"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="38" cy="10" r="4" stroke-dasharray="2 1"/><circle cx="38" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="38" r="4" stroke-dasharray="2 1"/><circle cx="10" cy="38" r="1" fill="currentColor" stroke="none"/><circle cx="38" cy="38" r="4" stroke-dasharray="2 1"/><circle cx="38" cy="38" r="1" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.3"/></svg>` }
    ],
    
    currencies: ['€', '$', '£', 'CHF'],
    
    // v593 : CONFIG.icons (liste d'emoji pour un ancien sélecteur de groupes/chats) retirée —
    // orpheline depuis le retrait de Utils.showIconPicker le 31 août (v529).

    rateTypes: ['Jour', 'Semaine', 'Forfait', 'Heure'],
    availabilityColors: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b', '#8e44ad', '#27ae60'],
	 defaultTags: [ {id: 't1', name: 'Standard', color: 'transparent'} ],
      // Ratios indicatifs de conversion salaire (estimations affichées en placeholder, ajustables ici)
      salaryRatios: { netFromGross: 0.78, budgetFromGross: 1.45 },
      defaultGroups: [
          {id: 'gp1', name: 'Protagonistes', type: 'perso'},
          {id: 'gp2', name: 'Antagonistes', type: 'perso'},
          {id: 'gp3', name: 'Secondaires', type: 'perso'},
          {id: 'ga1', name: 'Casting Principal', type: 'actor'},
          {id: 'ga2', name: 'Rôles Secondaires', type: 'actor'},
          {id: 'ga3', name: 'Figuration', type: 'actor'},
          {id: 'ga4', name: 'Silhouettes', type: 'actor'},
          {id: 'ga5', name: 'Doublures', type: 'actor'},
          {id: 'gl1', name: 'Intérieurs', type: 'lieu'},
          {id: 'gl2', name: 'Extérieurs', type: 'lieu'},
          {id: 'go1', name: 'Partenaires', type: 'org'},
          {id: 'go2', name: 'Financeurs', type: 'org'},
          {id: 'go3', name: 'Prestataires', type: 'org'}
      ]
  };

  // === RÉMUNÉRATION : trio Budget HT / Brut / Net (fallback sur l'ancien tarif unique dailyRate) ===