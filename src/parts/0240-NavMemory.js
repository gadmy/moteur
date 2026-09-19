
  const NavMemory = {
      KEY_PROJECT: 'moteur_nav_project_id',
      KEY_TAB: 'moteur_nav_tab',
      KEY_SUBTAB: 'moteur_nav_subtab',
      
      setProject: (projectId) => {
          try {
              if(projectId) localStorage.setItem(NavMemory.KEY_PROJECT, projectId);
              else localStorage.removeItem(NavMemory.KEY_PROJECT);
          } catch(e) {}
      },
      getProject: () => {
          try { return localStorage.getItem(NavMemory.KEY_PROJECT); }
          catch(e) { return null; }
      },
      
      setTab: (tab, subtab) => {
          try {
              if(tab) localStorage.setItem(NavMemory.KEY_TAB, tab);
              else localStorage.removeItem(NavMemory.KEY_TAB);
              if(subtab) localStorage.setItem(NavMemory.KEY_SUBTAB, subtab);
              else localStorage.removeItem(NavMemory.KEY_SUBTAB);
          } catch(e) {}
      },
      getTab: () => {
          try {
              return {
                  tab: localStorage.getItem(NavMemory.KEY_TAB),
                  subtab: localStorage.getItem(NavMemory.KEY_SUBTAB)
              };
          } catch(e) { return { tab: null, subtab: null }; }
      },
      
      clear: () => {
          try {
              localStorage.removeItem(NavMemory.KEY_PROJECT);
              localStorage.removeItem(NavMemory.KEY_TAB);
              localStorage.removeItem(NavMemory.KEY_SUBTAB);
          } catch(e) {}
      }
  };

  // ============================================================
  // Moderation - logique de blocage des badgés noirs
  // Un profil badgé noir ne peut plus communiquer avec des
  // personnes qui ne sont pas déjà en relation (projet commun
  // ou message échangé précédemment). Bidirectionnel.
  // ============================================================