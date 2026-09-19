
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
    
    hideTab: (tabName) => {
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
        UIHidden.closeHiddenCategoriesMenu();
        Utils.toast('Catégorie restaurée', 'success');
    },
    
    showAllHidden: () => {
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
            cat.style.display = (UIHidden.hiddenCategories.includes(catName) || rienDeVisible) ? 'none' : '';
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
        if(menu) menu.classList.remove('visible');
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
            tab.style.display = (UIHidden.hiddenTabs.includes(tabName) || interdit) ? 'none' : '';
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
