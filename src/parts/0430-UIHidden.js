
  const UIHidden = {
    // Onglets masqués (par utilisateur en localStorage, pas partagé entre membres)
    hiddenTabs: [],
    hiddenCategories: [],
    
    getUIStorageKey: (suffix) => {
        // Clé unique par projet et par utilisateur
        const projectId = state.currentProjectId || 'default';
        return `fmp_ui_${projectId}_${suffix}`;
    },
    
    initHiddenTabs: () => {
        // Charger depuis localStorage (préférence utilisateur, pas projet)
        try {
            const saved = localStorage.getItem(UIHidden.getUIStorageKey('hiddenTabs'));
            UIHidden.hiddenTabs = saved ? JSON.parse(saved) : [];
        } catch(e) {
            UIHidden.hiddenTabs = [];
        }
        UIHidden.applyHiddenTabs();
    },
    
    saveHiddenTabs: () => {
        // Sauvegarder en localStorage (par utilisateur)
        try {
            localStorage.setItem(UIHidden.getUIStorageKey('hiddenTabs'), JSON.stringify(UIHidden.hiddenTabs));
        } catch(e) {}
    },
    
    saveHiddenCategories: () => {
        // Sauvegarder en localStorage (par utilisateur)
        try {
            localStorage.setItem(UIHidden.getUIStorageKey('hiddenCategories'), JSON.stringify(UIHidden.hiddenCategories));
        } catch(e) {}
    },
    
    loadHiddenCategories: () => {
        // Charger depuis localStorage (préférence utilisateur)
        try {
            const saved = localStorage.getItem(UIHidden.getUIStorageKey('hiddenCategories'));
            UIHidden.hiddenCategories = saved ? JSON.parse(saved) : [];
        } catch(e) {
            UIHidden.hiddenCategories = [];
        }
    },
    
    // ==================================================================
    //  UN ONGLET QUI PART SE VOIT PARTIR (v601)
    // ==================================================================
    //  Il disparaissait d'un coup : le suivant sautait a sa place et on se
    //  demandait lequel on venait de fermer. Il se retracte maintenant sur
    //  place, en deux dixiemes de seconde — juste assez pour suivre l'oeil,
    //  pas assez pour attendre. Rien ne change pour qui a demande moins
    //  d'animations : le travail se fait dans tous les cas.
    //  DEFAUT VU A L'USAGE, ET CORRIGE : « l'animation n'est pas tres
    //  visible ». Elle ne l'etait pas parce que la largeur ne tombait a zero
    //  qu'a la DERNIERE image : l'onglet palissait sur place, puis toute la
    //  barre sautait d'un coup pour combler le trou. On ne voyait donc que le
    //  saut. La largeur se retracte maintenant sur toute la duree — les
    //  voisins se rabattent AVEC lui — et la duree passe a un tiers de
    //  seconde, le temps qu'il faut pour suivre un deplacement des yeux.
    DUREE_ONGLET: 320,
    DUREE_ECART: 300,
    SEL_ONGLETS: '.tab-subbtn[data-tab], .tab-btn[data-tab]',
    _sansAnimation: () => {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch(e) { return false; }
    },
    //  UN ONGLET QUI REVIENT ECARTE SES VOISINS. Sa largeur de destination
    //  depend du mot qu'il porte : elle ne peut pas s'ecrire dans une feuille
    //  de style, on la MESURE une fois pose, on le remet a zero, et on le
    //  laisse s'ouvrir. Les voisins suivent, puisque c'est la meme barre.
    ecarterOnglet: (tabName) => UIHidden._ecarter(
        '.tab-subbtn[data-tab="' + tabName + '"], .tab-btn[data-tab="' + tabName + '"]'),
    //  LES CATEGORIES DU HAUT SONT DES ONGLETS COMME LES AUTRES. Elles
    //  n'avaient aucune animation : « l'animation se fait bien sur la ligne du
    //  bas mais pas sur les categories du haut ». Elles passent par la meme
    //  porte — une seule reponse, sinon les deux barres finiront par ne plus
    //  se comporter pareil.
    ecarterCategorie: (cat) => UIHidden._ecarter('.tab-category[data-category="' + cat + '"]'),
    //  ON REND TOUJOURS L'ELEMENT A SA FEUILLE DE STYLE. L'animation de
    //  depart fige une largeur en pixels et pose une classe ; si personne ne
    //  les enleve, elles restent — et un onglet qui revient est mesure a ZERO,
    //  donc on renonce a l'animer... en le laissant invisible POUR DE BON.
    //  C'est exactement le bug signale sur la barre des categories : les
    //  onglets du bas y echappaient par chance, parce que leur barre est
    //  reconstruite a chaque changement de categorie, tandis que la barre des
    //  categories, elle, garde ses memes boutons du debut a la fin.
    _nettoyerPart: (btns) => {
        [...btns].forEach(b => {
            b.classList.remove('onglet-part');
            b.style.width = '';
            b.style.paddingLeft = ''; b.style.paddingRight = '';
            b.style.marginLeft = ''; b.style.marginRight = '';
        });
    },
    _ecarter: (selecteur) => {
        const btns = [...document.querySelectorAll(selecteur)];
        if(!btns.length) return;
        // D'abord rendre sa feuille de style, ENSUITE mesurer.
        UIHidden._nettoyerPart(btns);
        if(UIHidden._sansAnimation()) return;
        btns.forEach(b => {
            const large = b.offsetWidth;
            // Mesure a zero = rien de mesure : on preferera ne rien animer
            // plutot que d'ouvrir un onglet de zero pixel qui n'en sortirait
            // jamais.
            if(!large) return;
            const D = UIHidden.DUREE_ECART;
            b.classList.add('onglet-ecarte');
            b.style.transition = 'none';
            b.style.width = '0px';
            b.style.paddingLeft = '0px'; b.style.paddingRight = '0px';
            b.style.marginLeft = '0px'; b.style.marginRight = '0px';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                b.style.transition = 'width ' + D + 'ms cubic-bezier(.22,.7,.3,1), '
                                   + 'padding ' + D + 'ms cubic-bezier(.22,.7,.3,1), '
                                   + 'margin ' + D + 'ms cubic-bezier(.22,.7,.3,1)';
                b.style.width = large + 'px';
                b.style.paddingLeft = ''; b.style.paddingRight = '';
                b.style.marginLeft = ''; b.style.marginRight = '';
                setTimeout(() => {
                    // On rend l'onglet a sa feuille de style : une largeur
                    // figee en pixels ne survivrait pas a un changement de
                    // langue ni a un redimensionnement.
                    b.style.transition = ''; b.style.width = '';
                    b.classList.remove('onglet-ecarte');
                }, D + 40);
            }));
        });
    },
    //  LE REFUS SE VERIFIE AVANT L'ANIMATION, pas apres. On masquait d'abord
    //  l'onglet a l'ecran, puis on decouvrait que c'etait le dernier et on
    //  refusait : le bouton restait replie et invisible, alors que
    //  l'application le croyait affiche. C'est l'autre moitie du bug « toute
    //  la ligne du haut a disparu ».
    _dernierOnglet: (tabName) => {
        const tous = ['presentation', 'synopsis', 'board', 'titlepage', 'script', 'storyboard', 'chars',
                      'actors', 'locs', 'resources', 'crew', 'breakdown', 'stats', 'planning', 'expenses'];
        return tous.filter(t => !UIHidden.hiddenTabs.includes(t) && t !== tabName).length === 0;
    },
    _derniereCategorie: (cat) => ['ecriture', 'casting', 'production', 'admin']
        .filter(c => !UIHidden.hiddenCategories.includes(c) && c !== cat).length === 0,
    hideTab: (tabName) => {
        if(UIHidden.hiddenTabs.includes(tabName)) return;
        if(UIHidden._dernierOnglet(tabName)) { UIHidden._masquerVraiment(tabName); return; }
        const boutons = [...document.querySelectorAll('.tab-subbtn[data-tab="' + tabName + '"], .tab-btn[data-tab="' + tabName + '"]')];
        if(boutons.length && !UIHidden._enPartance) {
            UIHidden._enPartance = true;
            boutons.forEach(b => { b.style.width = b.offsetWidth + 'px'; b.classList.add('onglet-part'); });
            setTimeout(() => {
                UIHidden._enPartance = false;
                // Masquer D'ABORD, nettoyer ENSUITE : l'element est deja
                // hors de vue, donc on ne le voit pas reprendre sa taille.
                UIHidden._masquerVraiment(tabName);
                UIHidden._nettoyerPart(boutons);
            }, UIHidden.DUREE_ONGLET);
            return;
        }
        UIHidden._masquerVraiment(tabName);
    },
    _enPartance: false,
    _masquerVraiment: (tabName) => {
        if(UIHidden.hiddenTabs.includes(tabName)) return;
        
        // Empêcher de masquer le dernier onglet visible
        const allTabs = ['presentation', 'synopsis', 'board', 'titlepage', 'script', 'storyboard', 'chars', 'actors', 'locs', 'resources', 'crew', 'breakdown', 'stats', 'planning', 'expenses'];
        const visibleTabs = allTabs.filter(t => !UIHidden.hiddenTabs.includes(t) && t !== tabName);
        if(visibleTabs.length === 0) {
            Utils.toast('Impossible de masquer tous les onglets !', 'warning');
            return;
        }
        
        UIHidden.hiddenTabs.push(tabName);
        
        // Vérifier si tous les onglets d'une catégorie sont maintenant cachés
        for(const [cat, tabs] of Object.entries(UI.categoryTabs)) {
            const allTabsHidden = tabs.every(t => UIHidden.hiddenTabs.includes(t));
            if(allTabsHidden && !UIHidden.hiddenCategories.includes(cat)) {
                UIHidden.hiddenCategories.push(cat);
            }
        }
        
        UIHidden.saveHiddenTabs();
        UIHidden.saveHiddenCategories();
        UIHidden.applyHiddenTabs();
        UIHidden.applyHiddenCategories();
        
        // Rafraîchir la sous-navigation en mode catégories
        const navMode = (() => { try { const v = localStorage.getItem('fmp_nav_mode'); return v === 'classic' ? 'categories' : (v || 'categories'); } catch(e) { return 'categories'; } })();
        if(navMode === 'categories') {
            if(UI.currentCategory) UI.switchCategory(UI.currentCategory);
        }
        
        // Si l'onglet masqué était actif, basculer vers le premier visible
        const activeTab = document.querySelector('.tab-btn.active');
        if(activeTab && activeTab.getAttribute('data-tab') === tabName) {
            UI.switchTab(visibleTabs[0]);
        }
        
        Utils.toast('Onglet masqué', 'info');
    },
    
    // === GESTION DES CATÉGORIES MASQUÉES ===
    hideCategory: (category) => {
        if(UIHidden.hiddenCategories.includes(category)) return;
        if(UIHidden._derniereCategorie(category)) { UIHidden._masquerCategorie(category); return; }
        const boutons = [...document.querySelectorAll('.tab-category[data-category="' + category + '"]')];
        if(boutons.length && !UIHidden._enPartanceCat && !UIHidden._sansAnimation()) {
            UIHidden._enPartanceCat = true;
            boutons.forEach(b => { b.style.width = b.offsetWidth + 'px'; b.classList.add('onglet-part'); });
            setTimeout(() => {
                UIHidden._enPartanceCat = false;
                UIHidden._masquerCategorie(category);
                UIHidden._nettoyerPart(boutons);
            }, UIHidden.DUREE_ONGLET);
            return;
        }
        UIHidden._masquerCategorie(category);
    },
    _enPartanceCat: false,
    _masquerCategorie: (category) => {
        if(UIHidden.hiddenCategories.includes(category)) return;
        
        // Empêcher de masquer la dernière catégorie
        const allCategories = ['ecriture', 'casting', 'production', 'admin'];
        const visibleCategories = allCategories.filter(c => !UIHidden.hiddenCategories.includes(c) && c !== category);
        if(visibleCategories.length === 0) {
            Utils.toast('Impossible de masquer toutes les catégories !', 'warning');
            return;
        }
        
        UIHidden.hiddenCategories.push(category);
        
        // Cacher aussi tous les onglets de cette catégorie (pour synchroniser avec vue classique)
        const tabsInCategory = UI.categoryTabs[category] || [];
        tabsInCategory.forEach(tab => {
            if(!UIHidden.hiddenTabs.includes(tab)) {
                UIHidden.hiddenTabs.push(tab);
            }
        });
        
        UIHidden.saveHiddenCategories();
        UIHidden.saveHiddenTabs();
        UIHidden.applyHiddenCategories();
        UIHidden.applyHiddenTabs();
        
        // Si la catégorie masquée était active, basculer vers la première visible
        if(UI.currentCategory === category) {
            UI.switchCategory(visibleCategories[0]);
        }
        
        Utils.toast('Catégorie masquée', 'info');
    },
    
    showCategory: (category) => {
        UIHidden.hiddenCategories = UIHidden.hiddenCategories.filter(c => c !== category);
        
        // Restaurer aussi tous les onglets de cette catégorie
        const tabsInCategory = UI.categoryTabs[category] || [];
        UIHidden.hiddenTabs = UIHidden.hiddenTabs.filter(t => !tabsInCategory.includes(t));
        
        UIHidden.saveHiddenCategories();
        UIHidden.saveHiddenTabs();
        UIHidden.applyHiddenCategories();
        UIHidden.applyHiddenTabs();
        UI.switchCategory(category);
        // Apres le re-rendu, pas avant : le bouton n'existe qu'a ce moment-la.
        setTimeout(() => UIHidden.ecarterCategorie(category), 20);
        UIHidden.closeHiddenCategoriesMenu();
        Utils.toast('Catégorie restaurée', 'success');
    },
    
    showAllHidden: () => {
        // MEME NETTOYAGE QUE POUR UNE RESTAURATION UNITAIRE : cette porte-ci
        // ne passait pas par ecarterOnglet, donc elle rendait des onglets qui
        // portaient encore une largeur figee a zero.
        UIHidden._nettoyerPart(document.querySelectorAll('.tab-category[data-category], '
            + '.tab-subbtn[data-tab], .tab-btn[data-tab]'));
        UIHidden.hiddenCategories = [];
        UIHidden.hiddenTabs = [];
        UIHidden.saveHiddenCategories();
        UIHidden.saveHiddenTabs();
        UIHidden.applyHiddenCategories();
        UIHidden.applyHiddenTabs();
        if(UI.currentCategory) UI.switchCategory(UI.currentCategory);
        UIHidden.closeHiddenCategoriesMenu();
        Utils.toast('Tous les éléments sont visibles', 'success');
    },
    
    applyHiddenCategories: () => {
        // Masquer/afficher les catégories
        document.querySelectorAll('.tab-category[data-category]').forEach(cat => {
            const catName = cat.getAttribute('data-category');
            // v570 : une categorie dont AUCUN onglet n'est autorise disparait aussi —
            // sinon un invite restreint verrait des categories qui s'ouvrent sur le vide.
            const tabs = (UI.categoryTabs && UI.categoryTabs[catName]) || [];
            const rienDeVisible = tabs.length > 0 && !tabs.some(t =>
                !UIHidden.hiddenTabs.includes(t)
                && ((typeof Permissions === 'undefined') || Permissions.tabVisible(t))
                && (state.currentProjectType === 'series' || (t !== 'episodes' && t !== 'seasons')));
            const cache = UIHidden.hiddenCategories.includes(catName) || rienDeVisible;
            cat.style.display = cache ? 'none' : '';
            // FILET DE SECURITE : ce qui redevient visible repart PROPRE. Une
            // largeur figee a zero, oubliee par une animation, rendrait le
            // bouton invisible alors que tout le reste le croit affiche —
            // c'est le bug « toute la ligne du haut a disparu ».
            if(!cache) UIHidden._nettoyerPart([cat]);
        });
        
        // Mettre à jour le bouton des éléments masqués (catégories + onglets)
        const toggle = document.getElementById('hiddenCategoriesToggle');
        const countBadge = document.getElementById('hiddenCategoriesCount');
        
        if(toggle && countBadge) {
            const totalHidden = UIHidden.hiddenCategories.length + UIHidden.hiddenTabs.length;
            if(totalHidden > 0) {
                toggle.style.display = 'flex';
                countBadge.textContent = totalHidden;
            } else {
                toggle.style.display = 'none';
            }
        }
    },
    
    toggleHiddenCategoriesMenu: (event) => {
        event.stopPropagation();
        
        const categoryLabels = {
            'ecriture': '📝 Écriture',
            'casting': '🎭 Casting & Décors',
            'production': '🎬 Production',
            'admin': '📊 Admin'
        };
        
        const tabLabels = {
            'presentation': 'Présentation', 'synopsis': 'Synopsis', 'board': 'Séquencier',
            'titlepage': 'Titre', 'script': 'Scénario', 'storyboard': 'Storyboard', 'chars': 'Personnages',
            'actors': 'Comédien.nes', 'locs': 'Décors', 'resources': 'Ressources', 'crew': 'Équipes',
            'breakdown': 'Dépouillement', 'stats': 'Statistiques', 'contracts': 'Contrats', 'orgs': 'Asso / Entreprises', 'planning': 'Planning',
            'scriptreport': 'Rapport', 'expenses': 'Dépenses'
        };
        
        const hasHiddenCategories = UIHidden.hiddenCategories.length > 0;
        const hasHiddenTabs = UIHidden.hiddenTabs.length > 0;
        
        if(!hasHiddenCategories && !hasHiddenTabs) return;
        
        // Créer ou récupérer le menu
        let menu = document.getElementById('hiddenCategoriesMenu');
        if(!menu) {
            menu = document.createElement('div');
            menu.id = 'hiddenCategoriesMenu';
            menu.className = 'hidden-tabs-menu';
            document.body.appendChild(menu);
        }
        
        // Positionner le menu
        const rect = event.target.getBoundingClientRect();
        menu.style.left = Math.min(rect.left, window.innerWidth - 250) + 'px';
        menu.style.top = (rect.bottom + 5) + 'px';
        
        // Générer le contenu
        let menuHtml = `
            <div class="hidden-tabs-menu-header">
                <span>Éléments masqués</span>
                <button onclick="app.UIHidden.showAllHidden()">Tout afficher</button>
            </div>
            <div class="hidden-tabs-menu-list">
        `;
        
        // Catégories masquées
        if(hasHiddenCategories) {
            menuHtml += `<div style="font-size:0.75rem; color:var(--text-sec); padding:8px 12px; border-bottom:1px solid var(--border);">📁 Catégories</div>`;
            UIHidden.hiddenCategories.forEach(catName => {
                menuHtml += `<div class="hidden-tabs-menu-item" onclick="app.UIHidden.showCategory('${catName}')">
                    <span>${categoryLabels[catName] || catName}</span>
                    <span class="text-primary">+ Afficher</span>
                </div>`;
            });
        }
        
        // Onglets masqués
        if(hasHiddenTabs) {
            menuHtml += `<div style="font-size:0.75rem; color:var(--text-sec); padding:8px 12px; border-bottom:1px solid var(--border); ${hasHiddenCategories ? 'margin-top:5px;' : ''}">📑 Onglets</div>`;
            UIHidden.hiddenTabs.forEach(tabName => {
                menuHtml += `<div class="hidden-tabs-menu-item" onclick="app.UIHidden.showTab('${tabName}')">
                    <span>${tabLabels[tabName] || tabName}</span>
                    <span class="text-primary">+ Afficher</span>
                </div>`;
            });
        }
        
        menuHtml += '</div>';
        menu.innerHTML = menuHtml;
        menu.classList.add('visible');
        
        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', UIHidden.closeHiddenCategoriesMenu, { once: true });
        }, 10);
    },
    
    closeHiddenCategoriesMenu: () => {
        const menu = document.getElementById('hiddenCategoriesMenu');
        if(!menu || !menu.classList.contains('visible')) return;
        Utils.fermerMenu(menu, () => menu.classList.remove('visible'));
    },
    
    showTab: (tabName) => {
        UIHidden.hiddenTabs = UIHidden.hiddenTabs.filter(t => t !== tabName);
        
        // Restaurer la catégorie correspondante si elle était cachée
        for(const [cat, tabs] of Object.entries(UI.categoryTabs)) {
            if(tabs.includes(tabName) && UIHidden.hiddenCategories.includes(cat)) {
                UIHidden.hiddenCategories = UIHidden.hiddenCategories.filter(c => c !== cat);
            }
        }
        
        UIHidden.saveHiddenTabs();
        UIHidden.saveHiddenCategories();
        UIHidden.applyHiddenTabs();
        UIHidden.applyHiddenCategories();
        UI.switchTab(tabName);
        // Apres le re-rendu, pas avant : le bouton n'existe qu'a ce moment-la.
        setTimeout(() => UIHidden.ecarterOnglet(tabName), 20);
        Utils.toast('Onglet restauré', 'success');
    },
    
    // UIHidden.showAllTabs retirée v569 : n'était appelée que depuis le menu
    // mort du bandeau classique. Utiliser showAllHidden (menu réel).
    
    applyHiddenTabs: () => {
        // Masquer/afficher les onglets (source lue par PresentMode et d'autres
        // systèmes, même en mode Catégories — voir plan RESTE À FAIRE, étape 4-bis)
        document.querySelectorAll('.tab-btn[data-tab]').forEach(tab => {
            const tabName = tab.getAttribute('data-tab');
            // v570 : masquage manuel OU permission fermee (❌)
            const interdit = (typeof Permissions !== 'undefined') && !Permissions.tabVisible(tabName);
            const cache = UIHidden.hiddenTabs.includes(tabName) || interdit;
            tab.style.display = cache ? 'none' : '';
            if(!cache) UIHidden._nettoyerPart([tab]);
        });
        // Construction du menu #hiddenTabsToggle/#hiddenTabsMenu retirée v569 :
        // ce menu vivait dans le bandeau classique, inatteignable (étape 4).
        
        // Synchroniser avec la vue catégories
        const navMode = (() => { try { const v = localStorage.getItem('fmp_nav_mode'); return v === 'classic' ? 'categories' : (v || 'categories'); } catch(e) { return 'categories'; } })();
        if(navMode === 'categories' && UI.currentCategory) {
            UI.switchCategory(UI.currentCategory);
        }
    },
    
    // toggleHiddenTabsMenu / closeHiddenTabsMenu retirées v569 : pilotaient
    // le menu mort ci-dessus, inatteignables (bouton dans un parent invisible).
  };
