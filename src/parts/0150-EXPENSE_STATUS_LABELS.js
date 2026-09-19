
  const EXPENSE_STATUS_LABELS = { pending: 'En attente', approved: 'Validé', rejected: 'Refusé', done: 'Payé', escalated: 'Remonté', returned: 'Renvoyé' };

  let state = { 
      data: null, 
      currentUser: null, 
      currentProjectId: null, 
      currentRole: 'viewer', 
      // v578 (cloisonnement) : ce que le SERVEUR m'a accorde sur ce projet.
      // dataScope    = mon niveau ('none' / 'read' / 'write') par section.
      // dataMissingKeys = les cles que le serveur a retirees de la reponse.
      // Les deux sont poses par Store.loadProject et remis a null a la
      // fermeture. Ne jamais les deduire du navigateur : ils viennent de la
      // base, c'est tout leur interet.
      dataScope: null,
      dataMissingKeys: [], 
      currentEditingId: null, 
      activeBdSceneId: null, 
      scriptAC: { active: false, index: -1, colIndex: 0, columns: [], items: [], enabled: (localStorage.getItem('moteur_scriptAC_enabled') !== 'false') }, 
      scriptBdEnabled: (localStorage.getItem('moteur_scriptBd_enabled') !== 'false'), 
      scriptPrefs: (() => {
          // Préférences éditeur scénario : comportement Tab/Enter personnalisable
          const defaults = {
              enterAfterDialog: 'sc-perso',  // 'sc-perso' (défaut moteur) ou 'sc-action' (standard Final Draft)
              enterAfterAction: 'sc-action', // 'sc-action' (défaut) ou 'sc-perso' (style ping-pong dialogue)
              tabFromDialog: 'sc-perso',     // 'sc-perso' (défaut moteur) ou 'sc-action' (standard)
              doubleTapTabToNote: true,      // Double Tab → Note
              doubleEnterToTransition: true  // Double Enter sur Action → Transition
          };
          try {
              const stored = localStorage.getItem('moteur_script_prefs');
              if(stored) return Object.assign({}, defaults, JSON.parse(stored));
          } catch(e) {}
          return defaults;
      })(), 
      dbListener: null, 
      // v593 : presenceRef / locksListener retirés (état mort, ancien système Presence
      // jamais fonctionnel sur ce projet — remplacé par DBPresence, voir en tête).
      contextSceneId: null,
      contacts: { actors: [], crew: [] },
      userProfile: null
  };
  
  const els = {
    authView: document.getElementById('auth-view'), dashboardView: document.getElementById('dashboard-view'), appView: document.getElementById('app-view'), projectList: document.getElementById('project-list'), contactsView: document.getElementById('contacts-view'), contactsList: document.getElementById('contacts-list'), publicProfileView: document.getElementById('public-profile-view'),
    loginForm: document.getElementById('login-form'), signupForm: document.getElementById('signup-form'), forgotForm: document.getElementById('forgot-form'),
    loginEmail: document.getElementById('login-email'), loginPass: document.getElementById('login-pass'), signupEmail: document.getElementById('signup-email'), signupPass: document.getElementById('signup-pass'), signupConfirm: document.getElementById('signup-confirm'), forgotEmail: document.getElementById('forgot-email'),
    loginError: document.getElementById('login-error'), loginSuccess: document.getElementById('login-success'), signupError: document.getElementById('signup-error'), forgotError: document.getElementById('forgot-error'), forgotSuccess: document.getElementById('forgot-success'),
    
    title: document.getElementById('projectTitle'), roleBadge: document.getElementById('role-badge'), presenceList: document.getElementById('presence-list'),
    synopsisEditor: document.getElementById('synopsisEditor'),
    shortEditor: document.getElementById('shortEditor'),
    longEditor: document.getElementById('longEditor'),
    intentEditor: document.getElementById('intentEditor'),
    directorEditor: document.getElementById('directorEditor'),
    producerEditor: document.getElementById('producerEditor'),
    
    boardList: document.getElementById('boardList'), boardSynopsis: document.getElementById('boardSynopsisDisplay'), boardShort: document.getElementById('boardShortDisplay'), boardLong: document.getElementById('boardLongDisplay'), boardIntent: document.getElementById('boardIntentDisplay'), boardDirector: document.getElementById('boardDirectorDisplay'), boardProducer: document.getElementById('boardProducerDisplay'),
    toggleSynop: document.getElementById('toggleSynop'), toggleShort: document.getElementById('toggleShort'), toggleLong: document.getElementById('toggleLong'), blockSynop: document.getElementById('boardSynopBlock'), blockShort: document.getElementById('boardShortBlock'), blockLong: document.getElementById('boardLongBlock'),
    
    charContainer: document.getElementById('charContainer'), actorContainer: document.getElementById('actorContainer'), locContainer: document.getElementById('locContainer'),
    bdScriptContent: document.getElementById('bdScriptContent'), bdRightContent: document.getElementById('bdRightContent'), bdCtxMenu: document.getElementById('breakdown-ctx-menu'), tagCtxMenu: document.getElementById('tag-ctx-menu'),
     fileInput: document.getElementById('fileInput'), importInput: document.getElementById('importInput'), 
    // inpPre/inpLoc/inpSuff/inpPerso/inpTime/inpChrono/inpResume/acListLoc :
    // champs de la bande de saisie du sequencier, retiree le 26 aout.
    // acList retiree le 1er septembre : #autocomplete-list n'existe plus (il
    // appartenait a la bande de saisie du sequencier). Elle valait null et
    // servait de VALEUR PAR DEFAUT a setupAutocomplete : le premier appelant
    // qui aurait oublie son listEl aurait plante a la premiere frappe.
    scriptACList: document.getElementById('script-ac-list'),
    exportModal: document.getElementById('export-modal'), shareModal: document.getElementById('share-modal'), tagModal: document.getElementById('tag-modal'),
    
    visualWizard: document.getElementById('visual-wizard'),
    wizPageView: document.getElementById('wizard-page-view'),
    wizTitle: document.getElementById('wiz-step-title'),
    wizDesc: document.getElementById('wiz-step-desc'),
    wizSkip: document.getElementById('wiz-skip-btn'),
    // v593 : wizSceneBox retiré (référence DOM cachée jamais relue ailleurs).
    cleanupToast: document.getElementById('cleanup-toast'),
    quickNav: document.getElementById('quick-nav'),
    
    // NOUVEAUX ELEMENTS V62
    // versionList retiree le 1er septembre : #version-list a disparu avec
    // renderVersionList, remplacee par le journal d'actions.
  };

  // Module de confirmation/prompt moderne