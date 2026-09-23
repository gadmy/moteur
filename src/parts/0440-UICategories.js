
  const UICategories = {
    // Mode de navigation (classique ou catégories)
    currentCategory: 'ecriture',
    categoryTabs: {
        ecriture: ['seasons', 'episodes', 'synopsis', 'board', 'titlepage', 'script', 'moodboard', 'storyboard'],
        casting: ['chars', 'actors', 'locs', 'resources'],
        production: ['presentation', 'crew', 'orgs', 'breakdown', 'planning', 'scriptreport'],
        admin: ['stats', 'expenses', 'contracts']
    },
    categoryLabels: {
        ecriture: { seasons: '📺 Saisons', episodes: '🎬 Épisodes', synopsis: 'Synopsis', board: 'Séquencier', titlepage: 'Titre', script: 'Scénario', moodboard: 'Mood Board', storyboard: 'Storyboard' },
        casting: { chars: 'Personnages', actors: 'Comédien.nes', locs: 'Décors', resources: 'Ressources' },
        production: { presentation: 'Présentation', crew: 'Équipes', orgs: 'Asso / Entreprises', breakdown: 'Dépouillement', planning: 'Planning', scriptreport: 'Rapport' },
        admin: { stats: 'Statistiques', expenses: 'Dépenses', contracts: 'Contrats' }
    },
    
    setNavMode: (mode, init = false) => {
        const tabsNav = document.getElementById('tabsNav');
        const tabsCategories = document.getElementById('tabsCategories');
        const tabsSubnav = document.getElementById('tabsSubnav');
        // 31 aout : #classic-mode-options n'existe plus depuis le retrait du menu
        // Classique (etape 4). Les deux lignes qui le pilotaient sont retirees.
        
        if(mode === 'categories') {
            tabsNav.classList.add('hidden-by-categories');
            tabsCategories.classList.add('active');
            tabsSubnav.classList.add('active');
            document.body.classList.add('nav-categories');
            if(!init) UICategories.switchCategory(UICategories.currentCategory);
        } else {
            tabsNav.classList.remove('hidden-by-categories');
            tabsCategories.classList.remove('active');
            tabsSubnav.classList.remove('active');
            document.body.classList.remove('nav-categories');
        }
        PreferencesSync.save('fmp_nav_mode', mode);
        
        // Rafraîchir le bouton "Masqués" pour synchroniser entre les vues
        UI.applyHiddenTabs();
    },
    
    switchCategory: (category) => {
        UICategories.currentCategory = category;
        // Persister pour F5
        try { NavMemory.setTab(category, localStorage.getItem(NavMemory.KEY_SUBTAB)); } catch(e) {}
        
        // Mettre à jour les boutons catégorie
        document.querySelectorAll('.tab-category').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });
        
        // Mettre à jour la sous-navigation
        const subnav = document.getElementById('tabsSubnav');
        const tabs = UICategories.categoryTabs[category] || [];
        const labels = UICategories.categoryLabels[category] || {};
        
        // Filtrer les onglets masqués
        let visibleTabs = tabs.filter(t => !UI.hiddenTabs.includes(t));
        // v570 : et ceux que les permissions ferment (❌) — l'onglet n'apparait pas du tout.
        visibleTabs = visibleTabs.filter(t => (typeof Permissions === 'undefined') || Permissions.tabVisible(t));
        
        // Phase S3.4 + S7.3 : masquer 'episodes' et 'seasons' si ce n'est pas une série
        const isSeries = state.currentProjectType === 'series';
        if(!isSeries) {
            visibleTabs = visibleTabs.filter(t => t !== 'episodes' && t !== 'seasons');
        }
        
        
        let subnavHtml = visibleTabs.map(tab => {
            const isActive = document.getElementById('tab-' + tab)?.classList.contains('active');
            return `<button class="tab-subbtn${isActive ? ' active' : ''}" draggable="true" data-tab="${tab}" onclick="app.UI.switchTab('${tab}')">${labels[tab] || tab}<span class="tab-close" onclick="event.stopPropagation(); app.UI.hideTab('${tab}')" title="Masquer cet onglet">×</span></button>`;
        }).join('');
        
        subnav.innerHTML = subnavHtml;
        subnav.dataset.category = category;
        
        // v569 : la subnav reste visible en permanence (CSS .tabs-subnav.active) — plus de timer.
        
        // Réappliquer les couleurs sauvegardées sur les sous-onglets (depuis le projet)
        const subColors = state.data?.uiConfig?.subColors || {};
        Object.keys(subColors).forEach(tabName => {
            const tab = subnav.querySelector(`.tab-subbtn[data-tab="${tabName}"]`);
            if(tab) {
                tab.style.background = subColors[tabName];
                tab.style.color = '#ffffff';
                tab.style.borderRadius = '6px 6px 0 0';
            }
        });
        
        // Réattacher les événements contextmenu
        UICategories.initSubnavContextMenu();
        
        // Si aucun onglet visible de cette catégorie n'est actif, activer le premier visible ET ACCESSIBLE
        const activeInCategory = visibleTabs.some(tab => document.getElementById('tab-' + tab)?.classList.contains('active'));
        if(!activeInCategory && visibleTabs.length > 0) {
            if(typeof LockManager !== 'undefined') LockManager._viaCategory = true; // ouverture auto, pas un choix d'onglet
            const _t2s = { 'presentation': 'presentation', 'synopsis': 'synopsis', 'board': 'sequencier', 'titlepage': 'scenario', 'script': 'scenario', 'storyboard': 'storyboard', 'chars': 'personnages', 'locs': 'lieux', 'actors': 'comediens', 'resources': 'ressources', 'crew': 'equipe',
            'orgs': 'equipe', 'breakdown': 'depouillement', 'stats': 'stats', 'planning': 'planning', 'expenses': 'depenses' };
            const okTab = visibleTabs.find(t => {
                if(!document.getElementById('tab-' + t)) return false;
                if(state.currentRole === 'owner') return true;
                const sec = _t2s[t];
                return !sec || Permissions.canAccess(sec);
            });
            if(okTab) UI.switchTab(okTab);
        }
        
        try { localStorage.setItem('fmp_current_category', category); } catch(e) {}
    },
    
    // Trouver la catégorie d'un onglet
    getCategoryForTab: (tabName) => {
        for(const [cat, tabs] of Object.entries(UICategories.categoryTabs)) {
            if(tabs.includes(tabName)) return cat;
        }
        return 'ecriture';
    },
    
    // Couleur des onglets (clic droit)
    currentTabTarget: null,
    
    openTabColorMenu: (e, tab) => {
        e.preventDefault();
        UICategories.currentTabTarget = tab;
        UI.currentTabType = tab.classList.contains('tab-category') ? 'category' : 
                            tab.classList.contains('tab-subbtn') ? 'subbtn' : 'classic';
        const wmItem = document.getElementById('wm-open-item');
        if(wmItem) wmItem.style.display = (UI.currentTabType === 'subbtn') ? 'block' : 'none';
        const helpItem = document.getElementById('tab-help-item');
        if(helpItem) helpItem.style.display = (UI.currentTabType === 'category') ? 'none' : 'block';
        const menu = document.getElementById('tab-color-menu');
        menu.classList.add('visible');
        
        // Calculer la position pour ne pas sortir de l'écran
        const menuRect = menu.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        
        let left = e.clientX;
        let top = e.clientY;
        
        // Ajuster si le menu sort à droite
        if(left + menuRect.width > viewportW - 10) {
            left = viewportW - menuRect.width - 10;
        }
        // Ajuster si le menu sort en bas
        if(top + menuRect.height > viewportH - 10) {
            top = viewportH - menuRect.height - 10;
        }
        // Ne pas sortir à gauche ou en haut
        if(left < 10) left = 10;
        if(top < 10) top = 10;
        
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    },
    
    closeTabColorMenu: () => {
        const menu = document.getElementById('tab-color-menu');
        menu.classList.remove('visible');
        UICategories.currentTabTarget = null;
    },
    
    setTabColor: (color) => {
        if(UICategories.currentTabTarget) {
            const tabName = UICategories.currentTabTarget.getAttribute('data-tab') || UICategories.currentTabTarget.getAttribute('data-category');
            const isCategory = UI.currentTabType === 'category';
            
            // Initialiser uiConfig si nécessaire
            if(!state.data.uiConfig) state.data.uiConfig = { tabColors: {}, categoryColors: {}, subColors: {}, tabsOrder: [], categoriesOrder: [], hiddenTabs: [] };
            if(!state.data.uiConfig.tabColors) state.data.uiConfig.tabColors = {};
            if(!state.data.uiConfig.subColors) state.data.uiConfig.subColors = {};
            if(!state.data.uiConfig.categoryColors) state.data.uiConfig.categoryColors = {};
            
            // Appliquer le style visuellement
            const applyStyle = (el, col) => {
                if(col) {
                    el.style.background = col;
                    el.style.color = '#ffffff';
                    el.style.borderRadius = '6px 6px 0 0';
                } else {
                    el.style.background = '';
                    el.style.color = '';
                    el.style.borderRadius = '';
                }
            };
            
            applyStyle(UICategories.currentTabTarget, color);
            
            if(isCategory) {
                // C'est une catégorie - sauvegarder dans categoryColors
                if(color) {
                    state.data.uiConfig.categoryColors[tabName] = color;
                } else {
                    delete state.data.uiConfig.categoryColors[tabName];
                }
            } else {
                // C'est un onglet - synchroniser tabColors ET subColors
                if(color) {
                    state.data.uiConfig.tabColors[tabName] = color;
                    state.data.uiConfig.subColors[tabName] = color;
                } else {
                    delete state.data.uiConfig.tabColors[tabName];
                    delete state.data.uiConfig.subColors[tabName];
                }
                // Appliquer aussi à l'équivalent dans l'autre vue
                const classicTab = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
                const subTab = document.querySelector(`.tab-subbtn[data-tab="${tabName}"]`);
                if(classicTab) applyStyle(classicTab, color);
                if(subTab) applyStyle(subTab, color);
            }
            Store.save();
        }
        UICategories.closeTabColorMenu();
    },
    
    openTabHelp: () => {
        // Nom d'onglet -> section du guide complet (Tutorial.sections)
        const tabToSection = {
            'presentation': 'intro',
            'synopsis': 'synopsis',
            'titlepage': 'synopsis',
            'board': 'sequencier',
            'seasons': 'sequencier',
            'episodes': 'sequencier',
            'script': 'scenario',
            'moodboard': 'moodboard',
            'storyboard': 'storyboard',
            'chars': 'casting',
            'actors': 'casting',
            'locs': 'lieux',
            'resources': 'ressources',
            'crew': 'equipe',
            'orgs': 'orgs',
            'breakdown': 'depouillement',
            'planning': 'planning',
            'expenses': 'budget',
            'contracts': 'contrats',
            'stats': 'rapports',
            'scriptreport': 'rapports'
        };
        const target = UICategories.currentTabTarget;
        if(target) {
            const tabName = target.getAttribute('data-tab');
            UICategories.closeTabColorMenu(); // remet currentTabTarget a null, d'ou la capture au-dessus
            Tutorial.openAt(tabToSection[tabName] || null);
        }
    },
    
    loadTabColors: () => {
        // Réinitialiser tous les styles d'abord
        document.querySelectorAll('.tab-btn, .tab-category, .tab-subbtn').forEach(tab => {
            tab.style.background = '';
            tab.style.color = '';
            tab.style.borderRadius = '';
        });
        
        // Charger depuis le projet (ou vide si pas de config)
        const uiConfig = state.data?.uiConfig || {};
        
        // Onglets classiques
        const tabColors = uiConfig.tabColors || {};
        Object.keys(tabColors).forEach(tabName => {
            const tab = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
            if(tab) {
                tab.style.background = tabColors[tabName];
                tab.style.color = '#ffffff';
                tab.style.borderRadius = '6px 6px 0 0';
            }
        });
        // Catégories
        const categoryColors = uiConfig.categoryColors || {};
        Object.keys(categoryColors).forEach(catName => {
            const tab = document.querySelector(`.tab-category[data-category="${catName}"]`);
            if(tab) {
                tab.style.background = categoryColors[catName];
                tab.style.color = '#ffffff';
                tab.style.borderRadius = '6px 6px 0 0';
            }
        });
        // Sous-onglets
        const subColors = uiConfig.subColors || {};
        Object.keys(subColors).forEach(tabName => {
            const tab = document.querySelector(`.tab-subbtn[data-tab="${tabName}"]`);
            if(tab) {
                tab.style.background = subColors[tabName];
                tab.style.color = '#ffffff';
                tab.style.borderRadius = '6px 6px 0 0';
            }
        });
    },
    
    initTabsContextMenu: () => {
        UICategories._ensureCtxDelegation();
        // Fermer le menu au clic ailleurs
        document.addEventListener('click', (e) => {
            if(!e.target.closest('.tab-color-menu')) {
                UICategories.closeTabColorMenu();
            }
            // Fermer le panneau notifications si clic en dehors
            if(!e.target.closest('.notif-wrapper')) {
                Notifications.closePanel();
            }
        });
    },
    
    // Réattacher les événements après rebuild de la sous-nav
    _ctxDelegated: false,
    _ensureCtxDelegation: () => {
        if(UICategories._ctxDelegated) return;
        UICategories._ctxDelegated = true;
        // Délégation : survit aux re-rendus de la sous-barre (sinon clic droit -> menu du navigateur)
        document.addEventListener('contextmenu', (e) => {
            const tab = e.target.closest('.tab-subbtn, .tab-btn, .tab-category');
            if(tab) UICategories.openTabColorMenu(e, tab);
        });
        // Clic droit sur une carte de fiche : au lieu du survol, on revele ses
        // icones d'action (modifier, groupe, casting, toile...). Delegue au
        // document pour survivre a tous les re-rendus de cartes.
        document.addEventListener('contextmenu', (e) => {
            const card = e.target.closest('.compact-card');
            if(!card || !card.querySelector('.compact-card-actions')) return;
            e.preventDefault();
            document.querySelectorAll('.compact-card.ctx-open').forEach(c => { if(c !== card) c.classList.remove('ctx-open'); });
            card.classList.toggle('ctx-open');
            if(card.classList.contains('ctx-open')) UICategories._layoutCardStar(card);
        });
        // Un clic ailleurs, ou Echap, referme le menu d'actions ouvert.
        document.addEventListener('click', (e) => {
            if(e.target.closest('.compact-card-actions')) return;
            document.querySelectorAll('.compact-card.ctx-open').forEach(c => c.classList.remove('ctx-open'));
        });
        document.addEventListener('keydown', (e) => {
            if(e.key === 'Escape') document.querySelectorAll('.compact-card.ctx-open').forEach(c => c.classList.remove('ctx-open'));
        });
        // Le menu en etoile est place en pixels : on le recalcule si la fenetre
        // change de taille pendant qu'il est ouvert.
        window.addEventListener('resize', () => {
            const open = document.querySelector('.compact-card.ctx-open');
            if(open) UICategories._layoutCardStar(open);
        });
    },
    // Dispose les boutons d'action EN ETOILE autour de la carte. L'eventail
    // s'oriente vers le CENTRE de l'ecran (donc a l'oppose du bord le plus
    // proche) : pres d'un bord, les boutons restent visibles au lieu de sortir.
    _layoutCardStar: (card) => {
        const box = card.querySelector('.compact-card-actions');
        if(!box) return;
        const items = Array.from(box.children).filter(el => el.tagName === 'BUTTON' || (el.classList && el.classList.contains('group-round-wrap')));
        const n = items.length;
        if(!n) return;
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const vw = window.innerWidth, vh = window.innerHeight;
        const toCenter = Math.atan2((vh / 2) - cy, (vw / 2) - cx);
        const distNorm = Math.hypot(((vw / 2) - cx) / vw, ((vh / 2) - cy) / vh);
        const full = distNorm < 0.10 && n > 4;   // carte bien centree et assez de boutons -> cercle complet
        const spread = full ? Math.PI * 2 : (n <= 1 ? 0 : Math.PI * 1.5);
        const R = (Math.max(rect.width, rect.height) / 2) + 42;
        items.forEach((el, k) => {
            let ang;
            if(full) { ang = (-Math.PI / 2) + (k / n) * Math.PI * 2; }
            else { const t = (n === 1) ? 0 : (k / (n - 1) - 0.5); ang = toCenter + t * spread; }
            el.style.left = ((rect.width / 2) + R * Math.cos(ang)) + 'px';
            el.style.top = ((rect.height / 2) + R * Math.sin(ang)) + 'px';
        });
    },
    initSubnavContextMenu: () => {
        UICategories._ensureCtxDelegation();
        // Initialiser le drag & drop des sous-onglets
        UICategories.initSubnavDragDrop();
    },
    
    // Drag & drop des sous-onglets entre catégories
    subnavDraggedTab: null,
    subnavDraggedCategory: null,
    
    initSubnavDragDrop: () => {
        const subnav = document.getElementById('tabsSubnav');
        if(!subnav) return;
        
        subnav.querySelectorAll('.tab-subbtn').forEach(tab => {
            tab.addEventListener('dragstart', (e) => {
                UICategories.subnavDraggedTab = tab;
                UICategories.subnavDraggedCategory = UICategories.currentCategory;
                tab.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tab.dataset.tab);
            });
            
            tab.addEventListener('dragend', () => {
                tab.classList.remove('dragging');
                subnav.querySelectorAll('.tab-subbtn').forEach(t => t.classList.remove('drag-over'));
                document.querySelectorAll('.tab-category').forEach(c => c.classList.remove('drag-over'));
                UICategories.subnavDraggedTab = null;
                UICategories.subnavDraggedCategory = null;
            });
            
            tab.addEventListener('dragover', (e) => {
                e.preventDefault();
                if(UICategories.subnavDraggedTab && UICategories.subnavDraggedTab !== tab) {
                    tab.classList.add('drag-over');
                }
            });
            
            tab.addEventListener('dragleave', () => {
                tab.classList.remove('drag-over');
            });
            
            tab.addEventListener('drop', (e) => {
                e.preventDefault();
                tab.classList.remove('drag-over');
                if(UICategories.subnavDraggedTab && UICategories.subnavDraggedTab !== tab) {
                    const allTabs = [...subnav.querySelectorAll('.tab-subbtn')];
                    const draggedIdx = allTabs.indexOf(UICategories.subnavDraggedTab);
                    const targetIdx = allTabs.indexOf(tab);
                    
                    if(draggedIdx < targetIdx) {
                        tab.after(UICategories.subnavDraggedTab);
                    } else {
                        tab.before(UICategories.subnavDraggedTab);
                    }
                    
                    // Sauvegarder le nouvel ordre
                    UICategories.saveSubnavOrder();
                }
            });
        });
        
        // Permettre le drop sur les catégories pour changer de catégorie
        document.querySelectorAll('.tab-category').forEach(catBtn => {
            catBtn.addEventListener('dragover', (e) => {
                e.preventDefault();
                if(UICategories.subnavDraggedTab && catBtn.dataset.category !== UICategories.subnavDraggedCategory) {
                    catBtn.classList.add('drag-over');
                }
            });
            
            catBtn.addEventListener('dragleave', () => {
                catBtn.classList.remove('drag-over');
            });
            
            catBtn.addEventListener('drop', (e) => {
                e.preventDefault();
                catBtn.classList.remove('drag-over');
                
                if(UICategories.subnavDraggedTab && catBtn.dataset.category !== UICategories.subnavDraggedCategory) {
                    const tabName = UICategories.subnavDraggedTab.dataset.tab;
                    const fromCategory = UICategories.subnavDraggedCategory;
                    const toCategory = catBtn.dataset.category;
                    
                    // Déplacer l'onglet vers la nouvelle catégorie
                    UICategories.moveTabToCategory(tabName, fromCategory, toCategory);
                    UICategories.signalerArrivee(tabName);
                }
            });
        });
    },
    
    saveSubnavOrder: () => {
        const subnav = document.getElementById('tabsSubnav');
        const category = UICategories.currentCategory;
        const newOrder = [...subnav.querySelectorAll('.tab-subbtn')].map(t => t.dataset.tab);
        
        // Mettre à jour categoryTabs
        UICategories.categoryTabs[category] = newOrder;
        
        // Sauvegarder dans le projet
        if(state.data && state.data.uiConfig) {
            if(!state.data.uiConfig.categoryTabsOrder) state.data.uiConfig.categoryTabsOrder = {};
            state.data.uiConfig.categoryTabsOrder[category] = newOrder;
            Store.save();
        }
        
        Utils.toast('Ordre des onglets sauvegardé', 'success');
        if(UICategories.subnavDraggedTab && UICategories.subnavDraggedTab.dataset)
            UICategories.signalerArrivee(UICategories.subnavDraggedTab.dataset.tab);
    },
    
    //  v601 - UN ONGLET QUI ARRIVE SE VOIT ARRIVER. Apres un deplacement, la
    //  barre est redessinee : sans signe, on ne sait pas lequel a bouge ni
    //  ou il a atterri. On le fait apparaitre une fois a sa nouvelle place.
    signalerArrivee: (tabName) => {
        setTimeout(() => {
            document.querySelectorAll('.tab-subbtn[data-tab="' + tabName + '"], .tab-btn[data-tab="' + tabName + '"]')
                .forEach(b => {
                    b.classList.remove('onglet-arrive');
                    void b.offsetWidth;          // sans cette relecture, l'animation ne rejoue pas
                    b.classList.add('onglet-arrive');
                    setTimeout(() => b.classList.remove('onglet-arrive'), 500);
                });
        }, 30);
    },

    moveTabToCategory: (tabName, fromCategory, toCategory) => {
        // Retirer de l'ancienne catégorie
        UICategories.categoryTabs[fromCategory] = UICategories.categoryTabs[fromCategory].filter(t => t !== tabName);
        
        // Ajouter à la nouvelle catégorie
        if(!UICategories.categoryTabs[toCategory].includes(tabName)) {
            UICategories.categoryTabs[toCategory].push(tabName);
        }
        
        // Ajouter le label si pas déjà présent
        if(!UICategories.categoryLabels[toCategory][tabName]) {
            UICategories.categoryLabels[toCategory][tabName] = UICategories.categoryLabels[fromCategory][tabName];
        }
        
        // Sauvegarder dans le projet
        if(state.data && state.data.uiConfig) {
            if(!state.data.uiConfig.categoryTabsOrder) state.data.uiConfig.categoryTabsOrder = {};
            state.data.uiConfig.categoryTabsOrder[fromCategory] = UICategories.categoryTabs[fromCategory];
            state.data.uiConfig.categoryTabsOrder[toCategory] = UICategories.categoryTabs[toCategory];
            
            if(!state.data.uiConfig.categoryLabelsCustom) state.data.uiConfig.categoryLabelsCustom = {};
            if(!state.data.uiConfig.categoryLabelsCustom[toCategory]) state.data.uiConfig.categoryLabelsCustom[toCategory] = {};
            state.data.uiConfig.categoryLabelsCustom[toCategory][tabName] = UICategories.categoryLabels[fromCategory][tabName];
            
            Store.save();
        }
        
        // Rafraîchir la vue - aller à la nouvelle catégorie
        UICategories.switchCategory(toCategory);
        Utils.toast(`"${UICategories.categoryLabels[toCategory][tabName]}" déplacé vers ${toCategory}`, 'success');
    },
    
    // Réinitialiser l'ordre des onglets
    resetTabsOrder: () => {
        // Réinitialiser les onglets classiques
        const tabsNav = document.getElementById('tabsNav');
        const defaultOrder = [
            'presentation', 'synopsis', 'board', 'titlepage', 'script', 'storyboard', 
            'chars', 'actors', 'locs', 'resources', 'crew', 'breakdown', 
            'stats', 'planning', 'expenses'
        ];
        const tabs = Array.from(tabsNav.querySelectorAll('.tab-btn'));
        
        defaultOrder.forEach(tabName => {
            const tab = tabs.find(t => t.getAttribute('data-tab') === tabName);
            if(tab) tabsNav.appendChild(tab);
        });
        
        // Réinitialiser les catégories
        const catsNav = document.getElementById('tabsCategories');
        const defaultCatsOrder = ['ecriture', 'casting', 'production', 'admin'];
        const toggle = document.getElementById('hiddenCategoriesToggle');
        
        defaultCatsOrder.forEach(catName => {
            const cat = catsNav.querySelector(`.tab-category[data-category="${catName}"]`);
            if(cat) catsNav.insertBefore(cat, toggle);
        });
        
        // Réinitialiser les sous-onglets par catégorie (ordre par défaut)
        const defaultCategoryTabs = {
            ecriture: ['synopsis', 'board', 'titlepage', 'script', 'storyboard'],
            casting: ['chars', 'actors', 'locs', 'figuration', 'resources'],
            production: ['presentation', 'crew', 'orgs', 'breakdown', 'planning', 'scriptreport'],
            admin: ['stats', 'expenses', 'contracts']
        };
        const defaultCategoryLabels = {
            ecriture: { synopsis: 'Synopsis', board: 'Séquencier', titlepage: 'Titre', script: 'Scénario', storyboard: 'Storyboard' },
            casting: { chars: 'Personnages', actors: 'Comédien.nes', locs: 'Décors', resources: 'Ressources' },
            production: { presentation: 'Présentation', crew: 'Équipes', orgs: 'Asso / Entreprises', breakdown: 'Dépouillement', planning: 'Planning', scriptreport: 'Rapport' },
            admin: { stats: 'Statistiques', expenses: 'Dépenses', contracts: 'Contrats' }
        };
        
        // Restaurer les valeurs par défaut
        UICategories.categoryTabs = JSON.parse(JSON.stringify(defaultCategoryTabs));
        UICategories.categoryLabels = JSON.parse(JSON.stringify(defaultCategoryLabels));
        
        // Réinitialiser dans le projet
        if(state.data.uiConfig) {
            state.data.uiConfig.tabsOrder = [];
            state.data.uiConfig.categoriesOrder = [];
            state.data.uiConfig.categoryTabsOrder = {};
            state.data.uiConfig.categoryLabelsCustom = {};
            state.data.uiConfig.tabColors = {};
            state.data.uiConfig.categoryColors = {};
            state.data.uiConfig.subColors = {};
            Store.save();
        }
        
        // Réinitialiser les couleurs visuellement
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.style.background = '';
            tab.style.color = '';
            tab.style.borderRadius = '';
        });
        document.querySelectorAll('.tab-category').forEach(cat => {
            cat.style.background = '';
            cat.style.color = '';
            cat.style.borderRadius = '';
        });
        document.querySelectorAll('.tab-subbtn').forEach(sub => {
            sub.style.background = '';
            sub.style.color = '';
            sub.style.borderRadius = '';
        });
        
        // Rafraîchir la vue catégories si active
        const tabsCategories = document.getElementById('tabsCategories');
        if(tabsCategories && tabsCategories.classList.contains('active')) {
            UICategories.switchCategory(UICategories.currentCategory);
        }
        
        Utils.toast('Ordre et couleurs réinitialisés', 'success');
    },
initCategoriesDragDrop: () => {
      const nav = document.getElementById('tabsCategories');
      if(!nav) return;
      
      let draggedCat = null;
      
      nav.querySelectorAll('.tab-category').forEach(cat => {
          cat.addEventListener('dragstart', (e) => {
              draggedCat = cat;
              cat.classList.add('dragging');
              e.dataTransfer.effectAllowed = 'move';
          });
          
          cat.addEventListener('dragend', () => {
              cat.classList.remove('dragging');
              nav.querySelectorAll('.tab-category').forEach(c => c.classList.remove('drag-over'));
              draggedCat = null;
              UI.saveCategoriesOrder();
          });
          
          cat.addEventListener('dragover', (e) => {
              e.preventDefault();
              if(draggedCat && draggedCat !== cat) {
                  cat.classList.add('drag-over');
              }
          });
          
          cat.addEventListener('dragleave', () => {
              cat.classList.remove('drag-over');
          });
          
          cat.addEventListener('drop', (e) => {
              e.preventDefault();
              cat.classList.remove('drag-over');
              if(draggedCat && draggedCat !== cat) {
                  const allCats = [...nav.querySelectorAll('.tab-category')];
                  const draggedIdx = allCats.indexOf(draggedCat);
                  const targetIdx = allCats.indexOf(cat);
                  
                  if(draggedIdx < targetIdx) {
                      cat.after(draggedCat);
                  } else {
                      cat.before(draggedCat);
                  }
              }
          });
      });
  },
  
  saveCategoriesOrder: () => {
      const nav = document.getElementById('tabsCategories');
      if(!nav) return;
      const order = [...nav.querySelectorAll('.tab-category')].map(c => c.dataset.category);
      if(!state.data.uiConfig) state.data.uiConfig = { tabColors: {}, categoryColors: {}, subColors: {}, tabsOrder: [], categoriesOrder: [], hiddenTabs: [], hiddenCategories: [] };
      state.data.uiConfig.categoriesOrder = order;
      Store.save();
  },
  
  loadCategoriesOrder: () => {
      const uiConfig = state.data?.uiConfig || {};
      const order = uiConfig.categoriesOrder || [];
      if(order.length > 0) {
          const nav = document.getElementById('tabsCategories');
          if(!nav) return;
          const toggle = document.getElementById('hiddenCategoriesToggle');
          order.forEach(catName => {
              const cat = nav.querySelector(`.tab-category[data-category="${catName}"]`);
              if(cat) nav.insertBefore(cat, toggle);
          });
      }
  },
  
  loadCategoryTabsOrder: () => {
      const uiConfig = state.data?.uiConfig || {};
      const savedOrder = uiConfig.categoryTabsOrder || {};
      const savedLabels = uiConfig.categoryLabelsCustom || {};
      
      // Restaurer l'ordre des sous-onglets pour chaque catégorie
      // Fusion : l'ordre sauvegarde fait foi, MAIS les onglets par defaut absents de TOUT
      // ordre sauvegarde sont re-ajoutes en fin de leur categorie d'origine (sinon un
      // nouvel onglet livre dans une mise a jour resterait invisible a jamais).
      const everywhereSaved = {};
      Object.keys(savedOrder).forEach(cat => (savedOrder[cat] || []).forEach(t => { everywhereSaved[t] = true; }));
      Object.keys(savedOrder).forEach(category => {
          if(savedOrder[category] && savedOrder[category].length > 0) {
              // Assainissement : onglets demolis (chat...) potentiellement memorises dans le projet
              const merged = savedOrder[category].filter(t => t !== 'chat');
              (UI.categoryTabs[category] || []).forEach(t => {
                  if(!everywhereSaved[t] && merged.indexOf(t) === -1) merged.push(t);
              });
              UI.categoryTabs[category] = merged;
          }
      });
      
      // Restaurer les labels personnalisés (pour les onglets déplacés)
      Object.keys(savedLabels).forEach(category => {
          if(savedLabels[category]) {
              UI.categoryLabels[category] = { ...UI.categoryLabels[category], ...savedLabels[category] };
          }
      });
  },
  
	initTabsDragDrop: () => {
      const nav = document.getElementById('tabsNav');
      if(!nav) return;
      
      let draggedTab = null;
      
      nav.querySelectorAll('.tab-btn').forEach(tab => {
          tab.addEventListener('dragstart', (e) => {
              draggedTab = tab;
              tab.classList.add('dragging');
              e.dataTransfer.effectAllowed = 'move';
          });
          
          tab.addEventListener('dragend', () => {
              tab.classList.remove('dragging');
              nav.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('drag-over'));
              draggedTab = null;
              UI.updateTabNumbers();
          });
          
          tab.addEventListener('dragover', (e) => {
              e.preventDefault();
              if(draggedTab && draggedTab !== tab) {
                  tab.classList.add('drag-over');
              }
          });
          
          tab.addEventListener('dragleave', () => {
              tab.classList.remove('drag-over');
          });
          
          tab.addEventListener('drop', (e) => {
              e.preventDefault();
              tab.classList.remove('drag-over');
              if(draggedTab && draggedTab !== tab) {
                  const allTabs = [...nav.querySelectorAll('.tab-btn')];
                  const draggedIdx = allTabs.indexOf(draggedTab);
                  const targetIdx = allTabs.indexOf(tab);
                  
                  if(draggedIdx < targetIdx) {
                      tab.after(draggedTab);
                  } else {
                      tab.before(draggedTab);
                  }
              }
          });
      });
  },
  
  updateTabNumbers: () => {
      const nav = document.getElementById('tabsNav');
      if(!nav) return;
      
      nav.querySelectorAll('.tab-btn').forEach((tab, idx) => {
          const text = tab.textContent.replace(/^\d+\.\s*/, '');
          tab.textContent = `${idx + 1}. ${text}`;
      });
  },
  };
