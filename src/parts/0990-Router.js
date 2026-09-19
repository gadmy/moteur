
  const Router = {
      suppressNavMemory: false,
      _pending: null,
      _muted: false,

      routes: {
          '/hub':         () => UI.showDashboard(),
          '/monprofil':   () => PublicProfile.open(),
          '/contacts':    () => Contacts.open(),
          '/univers':     () => Universe.openFromMenu(),
          '/forum':       () => Forum.open(),
          '/cours':       () => Courses.open(),
          '/admin':       () => { if(Admin.isAdmin && Admin.isAdmin()) Admin.show(); else UI.showDashboard(); },
          '/connexion':   () => Landing.showAuth('login'),
          '/inscription': () => Landing.showAuth('signup')
      },

      path: () => {
          const p = (window.location.pathname || '/').replace(/\/+$/, '');
          return p === '' ? '/' : p;
      },

      isPublic: (p) => (p === '/' || p === '/connexion' || p === '/inscription'),

      // Onglets projet : clé interne -> slug d'URL
      tabSlugs: {
          presentation: 'presentation', seasons: 'saisons', episodes: 'episodes', synopsis: 'synopsis',
          board: 'sequencier', titlepage: 'titre', script: 'scenario', moodboard: 'moodboard',
          storyboard: 'storyboard', chars: 'personnages', actors: 'comediens', locs: 'decors',
          resources: 'ressources', crew: 'equipes', orgs: 'structures', contracts: 'contrats',
          stats: 'statistiques', breakdown: 'depouillement', planning: 'planning',
          scriptreport: 'rapport', expenses: 'depenses'
      },
      _pendingTab: null,

      tabFromSlug: (slug) => {
          const keys = Object.keys(Router.tabSlugs);
          for(let i = 0; i < keys.length; i++) { if(Router.tabSlugs[keys[i]] === slug) return keys[i]; }
          return null;
      },

      // Bascule catégorie + onglet (même séquence que la restauration NavMemory)
      goTab: (tab) => {
          if(!tab) return;
          try {
              UI.switchCategory(UI.getCategoryForTab(tab));
              setTimeout(() => { try { UI.switchTab(tab); } catch(e) {} }, 150);
          } catch(e) { console.warn('[Router] onglet:', e); }
      },

      // Onglet demandé par l'URL, appliqué une fois le projet ouvert
      applyPendingTab: () => {
          const t = Router._pendingTab;
          Router._pendingTab = null;
          if(t) setTimeout(() => Router.goTab(t), 300);
      },

      // Route déduite de l'affichage réel (le DOM fait foi)
      current: () => {
          const vis = (id) => { const e = document.getElementById(id); return !!e && window.getComputedStyle(e).display !== 'none'; };
          const act = (id) => { const e = document.getElementById(id); return !!e && e.classList.contains('active'); };
          if(vis('landing-view')) return '/';
          if(vis('auth-view')) {
              const sf = document.getElementById('signup-form');
              return (sf && window.getComputedStyle(sf).display !== 'none') ? '/inscription' : '/connexion';
          }
          if(act('public-profile-view')) return '/monprofil';
          if(act('contacts-view')) return '/contacts';
          if(act('forum-view')) return '/forum';
          if(act('courses-view')) return '/cours';
          if(vis('admin-view')) return '/admin';
          if(vis('universe-view')) return '/univers';
          if(vis('app-view')) {
              if(!state.currentProjectId) return '/hub';
              let r = '/projet/' + state.currentProjectId;
              const ct = document.querySelector('#app-view .tab-content.active');
              if(ct && ct.id && ct.id.indexOf('tab-') === 0) {
                  const slug = Router.tabSlugs[ct.id.slice(4)];
                  if(slug) r += '/' + slug;
              }
              return r;
          }
          if(vis('dashboard-view')) return '/hub';
          return null;
      },

      // Aligne l'URL sur l'écran affiché
      sync: (replace) => { setTimeout(() => Router._syncNow(replace), 0); },
      _syncNow: (replace) => {
          if(Router._muted) return;
          try {
              const r = Router.current();
              if(r) { try { document.title = Router._title(r); } catch(e) {} }
              if(!r || r === Router.path()) return;
              // v598 : en protocole file:, l'origine du document est « null » et
              // le navigateur refuse toute URL applicative dans l'historique. La
              // synchro ne pouvait pas aboutir et n'inondait la console que de
              // SecurityError. Le titre de la page, lui, vient d'etre pose.
              if(window.location.protocol === 'file:') return;
              if(replace) window.history.replaceState({ r: r }, '', r);
              else window.history.pushState({ r: r }, '', r);
          } catch(e) { console.warn('[Router] sync:', e); }
      },

      // Ouvre l'écran correspondant à un chemin
      apply: (p) => {
          p = (p || '/').replace(/\/+$/, '') || '/';
          if(!state.currentUser && !Router.isPublic(p)) { Router._pending = p; Landing.showAuth('login'); return true; }
          const m = p.match(/^\/projet\/([^\/]+)(?:\/([^\/]+))?/);
          if(m) {
              const pid = decodeURIComponent(m[1]);
              const tab = m[2] ? Router.tabFromSlug(m[2]) : null;
              const appV = document.getElementById('app-view');
              const opened = state.currentProjectId === pid && appV && window.getComputedStyle(appV).display !== 'none';
              if(opened) { Router.goTab(tab); return true; }
              Router._pendingTab = tab;
              Store.loadProject(pid);
              return true;
          }
          if(p === '/') { if(state.currentUser) UI.showDashboard(); else Landing.show(); return true; }
          if(state.currentUser && Router.isPublic(p)) { UI.showDashboard(); return true; }
          const fn = Router.routes[p];
          if(fn) { fn(); return true; }
          return false;
      },

      // Démarrage post-connexion : applique la route de l'URL
      boot: () => {
          const p = Router._pending || Router.path();
          Router._pending = null;
          const deep = (!Router.isPublic(p) && p !== '/hub');
          Router._muted = true;
          Router.suppressNavMemory = !Router.isPublic(p);
          UI.showDashboard();
          setTimeout(() => {
              Router._muted = false;
              try { if(deep) { if(!Router.apply(p)) Router.sync(); } else Router.sync(); }
              catch(e) { console.warn('[Router] boot:', e); Router.sync(); }
          }, deep ? 450 : 60);
      },

      // Titre d'onglet navigateur selon la route
      _titles: { '/connexion':'Connexion', '/inscription':'Inscription', '/hub':'Mes projets', '/monprofil':'Mon profil', '/contacts':'Contacts', '/univers':'Univers', '/forum':'Forum', '/cours':'Cours', '/admin':'Administration' },
      _title: (r) => {
          if(r && r.indexOf('/projet/') === 0) return ((state.data && state.data.title) ? state.data.title : 'Projet') + ' — Moteur';
          if(Router._titles[r]) return Router._titles[r] + ' — Moteur';
          return "Moteur - Logiciel d'écriture de scénario et gestion de production film";
      },

      // Mémorise la route demandée avant l'écran de connexion (deep link)
      capturePending: () => {
          const p = Router.path();
          if(!Router.isPublic(p)) Router._pending = p;
      }
  };

  window.addEventListener('popstate', () => { try { Router.apply(Router.path()); } catch(e) { console.warn('[Router] popstate:', e); } });

  // ==================== MODULE TERMS ====================