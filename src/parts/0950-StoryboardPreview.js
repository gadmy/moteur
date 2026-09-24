
  const StoryboardPreview = {
    currentSceneId: null,
    
    open: (sceneId) => {
        const _panel = document.getElementById('storyboard-preview-panel');
        if(_panel.classList.contains('open') && StoryboardPreview.currentSceneId === sceneId) { StoryboardPreview.close(); return; }
        StoryboardPreview.currentSceneId = sceneId;
        const scene = state.data.scenes.find(s => s.id === sceneId);
        document.getElementById('storyboard-preview-title').textContent = scene ? `Storyboard - ${scene.title}` : 'Storyboard';
        StoryboardPreview.load();
        document.getElementById('storyboard-preview-panel').classList.add('open');
    },
    
    close: () => {
        document.getElementById('storyboard-preview-panel').classList.remove('open');
        StoryboardPreview.currentSceneId = null;
    },
    
    load: () => {
        const container = document.getElementById('storyboard-preview-list');
        const sceneId = StoryboardPreview.currentSceneId;
        const scene = state.data.scenes.find(s => s.id === sceneId);
        const sceneIndex = state.data.scenes.indexOf(scene) + 1;
        const shots = state.data.shots ? state.data.shots.filter(s => s.sceneId === sceneId).sort((a, b) => a.order - b.order) : [];
        
        if(shots.length === 0) {
            container.innerHTML = '<div class="storyboard-preview-empty">Aucun plan pour cette scène<br><br><button onclick="app.UI.goToStoryboard(\'' + sceneId + '\'); app.StoryboardPreview.close();" style="padding:10px 20px; background:var(--primary); color:white; border:none; border-radius:4px; cursor:pointer;">+ Créer des plans</button></div>';
            return;
        }
        
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'sb-print-grid';
        
        shots.forEach((shot, idx) => {
            const card = Storyboard.createPrintShot(shot, sceneIndex, idx + 1);
            card.onclick = () => {
                app.UI.goToStoryboard(sceneId);
                app.StoryboardPreview.close();
            };
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
    }
};
