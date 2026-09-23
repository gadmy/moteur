
  const UITheme = {
    toggleTheme: () => { document.body.classList.toggle('dark-mode'); const _v = document.body.classList.contains('dark-mode') ? 'dark' : 'light'; try { localStorage.setItem(CONFIG.themeKey, _v); } catch(e) {} PreferencesSync.pushAll(); if(Universe.map) Universe.updateMapTheme(); },
    
    // Ouverture au clic (et non au survol) : toggle + fermeture des autres menus
    toggleNavDropdown: (container) => {
        const menu = container ? container.querySelector('.dropdown-menu') : null;
        if(!menu) return;
        const wasOpen = menu.classList.contains('show');
        document.querySelectorAll('.nav-dropdown .dropdown-menu.show').forEach(m => m.classList.remove('show'));
        if(!wasOpen) menu.classList.add('show');
    },

    toggleMenuDropdown: (name) => {
        const dropdown = document.getElementById('dropdown-' + name);
        if(!dropdown) return;
        const wasOpen = dropdown.classList.contains('visible');
        UITheme.closeAllDropdowns();
        if(!wasOpen) dropdown.classList.add('visible');
    },

    toggleTabsPositionMenu: () => {
        const menu = document.getElementById('tabs-position-menu');
        if(!menu) return;
        // Un menu en train de se fermer est deja ferme pour l'utilisateur,
        // meme s'il est encore affiche le temps de son animation.
        const enFermeture = !!menu.__ferme;
        const wasOpen = menu.style.display === 'block' && !enFermeture;
        if(wasOpen) { Utils.fermerMenu(menu); }
        else { Utils.annulerFermeture(menu); menu.style.display = 'block'; }
        if(!wasOpen && UI.updatePositionMenuState) UI.updatePositionMenuState();
    },

    // UITheme.showDropdown / hideDropdown retirées v569 : orphelines en
    // cascade depuis le retrait de leur façade UI (étape 3). Les menus
    // déroulants réels passent par closeAllDropdowns / la classe .visible
    // posée ailleurs.
    
    closeAllDropdowns: () => {
        document.querySelectorAll('.menu-dropdown.visible').forEach(d =>
            Utils.fermerMenu(d, () => d.classList.remove('visible')));
    },
    
    // 1er septembre — closeMobileSidebar RETIREE, avec tout le tiroir mobile.
    // RIEN dans le fichier n'ajoutait jamais la classe mobile-open : le tiroir
    // ne pouvait donc pas s'ouvrir, et cette fonction ne pouvait pas servir.
    // Elle portait en prime un plantage en embuscade — overlay.classList sur
    // un #mobile-overlay qui n'existe pas non plus, a l'interieur d'un if qui
    // ne testait QUE la barre laterale. Retires avec elle : le raccourci
    // Echap qui la cherchait, son relais dans app, et les regles CSS
    // .board-sidebar.mobile-open / .mobile-overlay.
    
    // Mode d'affichage des onglets
    setTabsMode: (mode) => {
        const tabsNav = document.getElementById('tabsNav');
        if(mode === 'adaptive') {
            tabsNav.classList.add('adaptive');
        } else {
            tabsNav.classList.remove('adaptive');
        }
        PreferencesSync.save('fmp_tabs_mode', mode);
    },
    
    // Position des onglets (haut, bas, gauche, droite)
    setTabsPosition: (position) => {
        // Position "droite" desactivee : le menu a droite faisait basculer la quick-nav a gauche
        // (recouvrement des panneaux). On la convertit en "gauche".
        if(position === 'right') position = 'left';
        const tabsNav = document.getElementById('tabsNav');
        const body = document.body;
        const main = document.querySelector('main');
        
        // Retirer toutes les classes de position
        tabsNav.classList.remove('position-top', 'position-bottom', 'position-left', 'position-right');
        body.classList.remove('tabs-left', 'tabs-right', 'tabs-bottom');
        
        // Reset des marges du main
        if(main) {
            main.style.marginLeft = '';
            main.style.marginRight = '';
            main.style.marginBottom = '';
        }
        
        // Appliquer la nouvelle position
        tabsNav.classList.add('position-' + position);
        if(position === 'left') body.classList.add('tabs-left');
        if(position === 'right') body.classList.add('tabs-right');
        if(position === 'bottom') body.classList.add('tabs-bottom');
        
        // En position latérale, forcer le mode Défilant (pas d'Adaptatif)
        if(position === 'left' || position === 'right') {
            tabsNav.classList.remove('adaptive');
            PreferencesSync.save('fmp_tabs_mode', 'scroll');
        }
        
        // Mettre à jour l'état du menu
        UITheme.updatePositionMenuState();
        
        PreferencesSync.save('fmp_tabs_position', position);
    },
    
    togglePositionMenu: () => {
        const menu = document.getElementById('tabs-position-menu');
        if(menu) {
            const isVisible = menu.style.display !== 'none';
            menu.style.display = isVisible ? 'none' : 'block';
            
            // Mettre à jour les états actifs
            if(!isVisible) {
                UITheme.updatePositionMenuState();
                setTimeout(() => {
                    const closeHandler = (e) => {
                        if(!e.target.closest('.tabs-position-dropdown')) {
                            menu.style.display = 'none';
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    document.addEventListener('click', closeHandler);
                }, 10);
            }
        }
    },
    
    updatePositionMenuState: () => {
        // Mettre à jour Navigation
        const currentNav = (() => { try { const v = localStorage.getItem('fmp_nav_mode'); return v === 'classic' ? 'categories' : (v || 'categories'); } catch(e) { return 'categories'; } })();
        document.querySelectorAll('.position-menu-item[data-nav]').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-nav') === currentNav);
        });
        
        // Vérifier si on est en mode Catégories
        const isCategories = currentNav === 'categories';
        
        // Mettre à jour Position (griser si Catégories)
        const currentPos = (() => { try { return localStorage.getItem('fmp_tabs_position') || 'top'; } catch(e) { return 'top'; } })();
        document.querySelectorAll('.position-menu-item[data-pos]').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-pos') === currentPos && !isCategories);
            item.classList.toggle('disabled', isCategories);
            item.style.opacity = isCategories ? '0.4' : '1';
            item.style.pointerEvents = isCategories ? 'none' : 'auto';
        });
        
        // Mettre à jour Mode (griser si Catégories)
        const currentMode = (() => { try { return localStorage.getItem('fmp_tabs_mode') || 'adaptive'; } catch(e) { return 'adaptive'; } })();
        document.querySelectorAll('.position-menu-item[data-mode]').forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-mode') === currentMode && !isCategories);
            item.classList.toggle('disabled', isCategories);
            item.style.opacity = isCategories ? '0.4' : '1';
            item.style.pointerEvents = isCategories ? 'none' : 'auto';
        });
        
        // 31 aout : #tabs-mode-section, #position-section-label et
        // #position-disabled-hint n'existent plus (menu Classique retire a
        // l'etape 4). Leurs trois lectures gardees sont purgees ; currentPos
        // reste utilise plus haut dans la fonction.
    },
    
    // setNavModeFromMenu / setTabsModeFromMenu retirées v569 : orphelines en
    // cascade depuis le retrait de leur façade UI (menu Classique/Mode
    // supprimé à l'étape 4).
    
    initTabsMode: () => {
        // Init position des onglets (doit être fait en premier)
        const savedPosition = (() => { try { return localStorage.getItem('fmp_tabs_position') || 'top'; } catch(e) { return 'top'; } })();
        UITheme.setTabsPosition(savedPosition);
        
        // Init mode (seulement si position haut/bas, sinon forcer défilant)
        const savedMode = (() => { try { return localStorage.getItem('fmp_tabs_mode') || 'adaptive'; } catch(e) { return 'adaptive'; } })();
        if(savedPosition === 'top' || savedPosition === 'bottom') {
            UITheme.setTabsMode(savedMode);
        } else {
            UITheme.setTabsMode('scroll');
        }
        
        // Tooltips : moteur unifié (module Tooltip). Init global au DOMContentLoaded ; sécurité ici (idempotent).
        Tooltip.init();
        
        // Init mode navigation - Catégories uniquement (v569 : Classique retiré du menu, ancienne valeur migrée automatiquement)
        const savedNavMode = (() => { try { const v = localStorage.getItem('fmp_nav_mode'); return v === 'classic' ? 'categories' : (v || 'categories'); } catch(e) { return 'categories'; } })();
        UI.setNavMode(savedNavMode, true);
        
        // Charger et appliquer les catégories masquées
        UI.loadHiddenCategories();
        UI.applyHiddenCategories();
    },
  };

  // ==================== TOOLTIP — bulle d'aide unifiée (survol) ====================
  // Une seule bulle (position:fixed sur <body>) : jamais coupée par un overflow ni posée
  // par-dessus un menu ouvert. Gère [data-tooltip] ET les title= natifs (neutralisés le temps
  // du survol puis restaurés). Placement auto avec bascule si pas de place + clamp à l'écran.