
// ==================== MODULE EDITOR (Formatage texte) ====================
const Editor = {
    // v593 : currentTarget retiré (jamais lu).
    
    format: (command, btn) => {
        document.execCommand(command, false, null);
        // Mettre à jour l'état des boutons après le formatage
        Editor.updateToolbarState();
    },
    
    // Met à jour l'état visuel de tous les boutons de la toolbar
    updateToolbarState: () => {
        document.querySelectorAll('.editor-toolbar button[data-command]').forEach(btn => {
            const command = btn.dataset.command;
            if(command && document.queryCommandState(command)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },
    
    };
