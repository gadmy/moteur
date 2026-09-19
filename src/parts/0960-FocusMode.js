
  const FocusMode = {
      isActive: false,
      tabOrder: ['presentation', 'synopsis', 'board', 'titlepage', 'script', 'moodboard', 'storyboard', 'chars', 'actors', 'locs', 'resources', 'crew', 'breakdown', 'stats', 'planning', 'scriptreport', 'expenses'],
      tabNames: {
          'presentation': '📋 Présentation',
          'synopsis': '📝 Synopsis', 
          'board': '🎬 Séquencier / BB',
          'titlepage': '🎞️ Page de Titre',
          'script': '📄 Scénario',
          'moodboard': '🎨 Mood Board',
          'storyboard': '🖼️ Storyboard',
          'chars': '👤 Personnages',
          'actors': '🎭 Comédiens',
          'locs': '🏠 Décors',
          'resources': '📦 Ressources',
          'crew': '👥 Équipes',
          'breakdown': '📋 Dépouillement',
          'stats': '📊 Statistiques',
          'planning': '📅 Planning',
          'scriptreport': '📝 Rapport',
          'expenses': '💰 Dépenses'
      },
      
      toggle: () => {
          if(FocusMode.isActive) {
              FocusMode.exit();
          } else {
              FocusMode.enter();
          }
      },
      
      enter: () => {
          FocusMode.isActive = true;
          document.body.classList.add('focus-mode');
          document.getElementById('focus-toolbar').style.display = 'flex';
          FocusMode.updateTitle();
          document.getElementById('focus-project-title').textContent = state.data.title || 'Mon Film';
          Utils.toast('Mode Focus activé (Échap pour quitter)', 'info');
      },
      
      exit: () => {
          FocusMode.isActive = false;
          document.body.classList.remove('focus-mode');
          document.getElementById('focus-toolbar').style.display = 'none';
      },
      
      updateTitle: () => {
          const activeTab = document.querySelector('.tab-content.active');
          if(activeTab) {
              const tabId = activeTab.id.replace('tab-', '');
              document.getElementById('focus-tab-title').textContent = FocusMode.tabNames[tabId] || tabId;
          }
      },
      
      getCurrentIndex: () => {
          const activeTab = document.querySelector('.tab-content.active');
          if(activeTab) {
              const tabId = activeTab.id.replace('tab-', '');
              return FocusMode.tabOrder.indexOf(tabId);
          }
          return 0;
      },
      
      nextTab: () => {
          const currentIdx = FocusMode.getCurrentIndex();
          const nextIdx = (currentIdx + 1) % FocusMode.tabOrder.length;
          app.UI.switchTab(FocusMode.tabOrder[nextIdx]);
          FocusMode.updateTitle();
      },
      
      prevTab: () => {
          const currentIdx = FocusMode.getCurrentIndex();
          const prevIdx = (currentIdx - 1 + FocusMode.tabOrder.length) % FocusMode.tabOrder.length;
          app.UI.switchTab(FocusMode.tabOrder[prevIdx]);
          FocusMode.updateTitle();
      }
  };

  // ====================================================================
  // BeatBoard — tableau de séquences en cartes (canvas interactif pan/zoom/drag).
  // Module cohérent à état canvas fortement couplé : organisé en sections internes
  // (état, rendu, cartes/scènes, drag&drop, lignes, pan&zoom, layout/export) plutôt
  // qu'éclaté en sous-modules, car zoom/pan/draggedCard/selectedCards sont manipulés
  // ensemble par presque toutes les méthodes.
  // ====================================================================