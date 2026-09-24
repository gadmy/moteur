
// ========== MODE PRÉSENTATION PLEIN ÉCRAN ==========
const PresentMode = {
    isActive: false,
    currentTabIndex: 0,
    tabs: [],
    
    start: () => {
        if(!state.currentProjectId) {
            Utils.toast('Ouvrez un projet d\'abord', 'warning');
            return;
        }
        
        // Collecter les onglets visibles
        PresentMode.tabs = [];
        document.querySelectorAll('#tabsNav .tab-btn').forEach((btn, idx) => {
            if(btn.style.display !== 'none') {
                PresentMode.tabs.push({
                    id: btn.dataset.tab,
                    name: btn.textContent.trim()
                });
            }
        });
        
        if(PresentMode.tabs.length === 0) {
            Utils.toast('Aucun onglet disponible', 'warning');
            return;
        }
        
        // Trouver l'onglet actuellement actif
        const activeTab = document.querySelector('#tabsNav .tab-btn.active');
        if(activeTab) {
            const activeId = activeTab.dataset.tab;
            const idx = PresentMode.tabs.findIndex(t => t.id === activeId);
            if(idx >= 0) PresentMode.currentTabIndex = idx;
        } else {
            PresentMode.currentTabIndex = 0;
        }
        
        // Activer le mode
        document.body.classList.add('presentation-mode');
        PresentMode.isActive = true;
        PresentMode.updateTabName();
        
        // Plein écran si supporté
        if(document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        
        Utils.toast('Mode Présentation activé - Échap pour quitter', 'info');
    },
    
    exit: () => {
        document.body.classList.remove('presentation-mode');
        PresentMode.isActive = false;
        
        // Quitter le plein écran
        if(document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        
        Utils.toast('Mode Présentation désactivé', 'info');
    },
    
    nextTab: () => {
        if(PresentMode.tabs.length === 0) return;
        PresentMode.currentTabIndex = (PresentMode.currentTabIndex + 1) % PresentMode.tabs.length;
        PresentMode.goToCurrentTab();
    },
    
    prevTab: () => {
        if(PresentMode.tabs.length === 0) return;
        PresentMode.currentTabIndex = (PresentMode.currentTabIndex - 1 + PresentMode.tabs.length) % PresentMode.tabs.length;
        PresentMode.goToCurrentTab();
    },
    
    goToCurrentTab: () => {
        const tab = PresentMode.tabs[PresentMode.currentTabIndex];
        if(tab) {
            // Activer l'onglet
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            const content = document.getElementById('tab-' + tab.id);
            const btn = document.querySelector(`.tab-btn[data-tab="${tab.id}"]`);
            if(content) content.classList.add('active');
            if(btn) btn.classList.add('active');
            
            PresentMode.updateTabName();
        }
    },
    
    updateTabName: () => {
        const nameEl = document.getElementById('presTabName');
        const tab = PresentMode.tabs[PresentMode.currentTabIndex];
        if(nameEl && tab) {
            nameEl.textContent = `${PresentMode.currentTabIndex + 1}/${PresentMode.tabs.length} - ${tab.name}`;
        }
    }
};
