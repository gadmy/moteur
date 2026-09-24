
const SceneVersions = {
    maxVersions: 10,
    
    // Copie independante du depouillement d'une scene. Les elements sont des
    // objets { texte, type, fiche } : une copie de surface ferait pointer la
    // version sur les memes objets que la scene, et toute modification
    // ulterieure du depouillement reecrirait l'historique.
    cloneBreakdown: (bd) => {
        const out = {};
        Object.keys(bd || {}).forEach(cat => {
            const arr = bd[cat];
            if(!Array.isArray(arr)) return;
            out[cat] = arr.map(it => (it && typeof it === 'object') ? { t: it.t, k: it.k, id: it.id } : it);
        });
        return out;
    },
    
    // Sauvegarder une version de la scène
    save: (sceneId) => {
        const scene = state.data.scenes.find(s => s.id === sceneId);
        if(!scene) return;
        
        if(!scene.versions) scene.versions = [];
        
        // Créer la version
        // Le DEPOUILLEMENT fait partie de la version. Sans lui, restaurer un
        // ancien texte laissait en place les accessoires de la version
        // remplacee : la feuille de service continuait de les imprimer, sans
        // que rien ne le signale. Copie profonde, sinon la version pointerait
        // sur les memes objets que la scene et suivrait ses modifications.
        const version = {
            id: 'v_' + Utils.generateUniqueId(),
            date: new Date().toISOString(),
            dateDisplay: new Date().toLocaleString('fr-FR'),
            title: scene.title,
            scriptContent: scene.scriptContent,
            resume: scene.resume,
            perso: scene.perso,
            time: scene.time,
            breakdown: SceneVersions.cloneBreakdown(scene.breakdown),
            savedBy: state.currentUser?.email?.split('@')[0] || 'Inconnu'
        };
        
        // Ajouter au début
        scene.versions.unshift(version);
        
        // Limiter à maxVersions
        if(scene.versions.length > SceneVersions.maxVersions) {
            scene.versions = scene.versions.slice(0, SceneVersions.maxVersions);
        }
        
        Store.save();
        UI.renderScript();
        Utils.toast(`Version sauvegardée (${scene.versions.length}/${SceneVersions.maxVersions})`, 'success');
    },
    
    // Ouvrir la modale des versions
    openModal: (sceneId) => {
        const scene = state.data.scenes.find(s => s.id === sceneId);
        if(!scene) return;
        
        const versions = scene.versions || [];
        
        let versionsHtml = '';
        
        if(versions.length === 0) {
            versionsHtml = `
                <div style="text-align: center; padding: 40px; color: var(--text-sec);">
                    <div style="font-size: 3rem; margin-bottom: 15px;">📜</div>
                    <p>Aucune version sauvegardée</p>
                    <p class="fs-085">Cliquez sur 📸 pour sauvegarder une version</p>
                </div>
            `;
        } else {
            versions.forEach((v, idx) => {
                const preview = SceneVersions.getTextPreview(v.scriptContent);
                const nBd = v.breakdown ? Object.values(v.breakdown).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) : -1;
                const bdTag = nBd < 0
                    ? `<span style="font-weight:normal; color:var(--text-sec); font-size:0.8rem;"> — sans dépouillement</span>`
                    : `<span style="font-weight:normal; color:var(--text-sec); font-size:0.8rem;"> — ${nBd} élément${nBd > 1 ? 's' : ''} dépouillé${nBd > 1 ? 's' : ''}</span>`;
                versionsHtml += `
                    <div class="scene-version-item">
                        <div class="scene-version-info">
                            <div class="scene-version-date">
                                ${v.dateDisplay || new Date(v.date).toLocaleString('fr-FR')}
                                <span style="font-weight: normal; color: var(--text-sec); font-size: 0.85rem;">par ${v.savedBy || 'Inconnu'}</span>${bdTag}
                            </div>
                            <div class="scene-version-preview">${Utils.escape(preview)}</div>
                        </div>
                        <div class="scene-version-actions">
                            <button class="scene-version-btn preview" onclick="app.SceneVersions.preview('${sceneId}', ${idx})">👁️</button>
                            <button class="scene-version-btn restore" onclick="app.SceneVersions.restore('${sceneId}', ${idx})">↩️ Restaurer</button>
                            <button class="scene-version-btn delete" onclick="app.SceneVersions.delete('${sceneId}', ${idx})">🗑️</button>
                        </div>
                    </div>
                `;
            });
        }
        
        const sceneIdx = state.data.scenes.findIndex(s => s.id === sceneId);
        
        const modal = document.createElement('div');
        modal.className = 'scene-versions-modal';
        modal.id = 'scene-versions-modal';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div class="scene-versions-box">
                <div class="scene-versions-header">
                    <h3>📜 Versions - Scène #${sceneIdx + 1}</h3>
                    <div class="flex-row-gap10">
                        <span class="text-sec-sm2">${versions.length}/${SceneVersions.maxVersions}</span>
                        <button onclick="app.SceneVersions.save('${sceneId}'); document.getElementById('scene-versions-modal').remove(); app.SceneVersions.openModal('${sceneId}');" class="n8-badge-10">📸 Nouvelle version</button>
                        <button onclick="this.closest('.scene-versions-modal').remove()" class="icon-btn-sec">✕</button>
                    </div>
                </div>
                <div class="scene-versions-content">
                    ${versionsHtml}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    // Extraire un aperçu texte du contenu HTML
    getTextPreview: (html) => {
        if(!html) return '(vide)';
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const text = temp.innerText.trim();
        return text.length > 100 ? text.substring(0, 100) + '...' : text;
    },
    
    // Prévisualiser une version
    preview: (sceneId, versionIdx) => {
        const scene = state.data.scenes.find(s => s.id === sceneId);
        if(!scene || !scene.versions || !scene.versions[versionIdx]) return;
        
        const v = scene.versions[versionIdx];
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 800px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <div class="n8-flex-5">
                    <h3 class="m-0">👁️ Aperçu - ${v.dateDisplay}</h3>
                    <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; flex: 1;">
                    <div class="mb-15-bg">
                        <strong>${Utils.escape(v.title)}</strong><br>
                        <span class="text-sec-sm2">${Utils.escape(v.perso)} • ${v.time} min</span>
                    </div>
                    <div class="mb-15">
                        <strong>Résumé :</strong><br>
                        <p class="text-sec">${Utils.escape(v.resume) || '(vide)'}</p>
                    </div>
                    <div style="background: var(--panel-bg); color: var(--text-main); padding: 20px; border-radius: 8px; font-family: 'Courier Prime', monospace;">
                        ${v.scriptContent || '<em style="color:var(--text-sec)">(vide)</em>'}
                    </div>
                </div>
                <div style="padding: 15px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px;">
                    <button onclick="this.closest('div[style*=fixed]').remove()" class="btn btn--outline">Fermer</button>
                    <button onclick="this.closest('div[style*=fixed]').remove(); app.SceneVersions.restore('${sceneId}', ${versionIdx})" class="btn btn--primary">↩️ Restaurer cette version</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    // Restaurer une version
    restore: async (sceneId, versionIdx) => {
        const scene = state.data.scenes.find(s => s.id === sceneId);
        if(!scene || !scene.versions || !scene.versions[versionIdx]) return;
        
        const v = scene.versions[versionIdx];
        const nBd = v.breakdown ? Object.values(v.breakdown).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) : 0;
        const msg = v.breakdown
            ? `Le texte, le titre, le résumé et le dépouillement (${nBd} élément${nBd > 1 ? 's' : ''}) de la scène seront remplacés. L'état actuel est conservé comme version.`
            : `Le contenu actuel de la scène sera remplacé. Cette version est antérieure à l'enregistrement du dépouillement : le dépouillement actuel sera conservé tel quel, vérifiez qu'il correspond toujours au texte.`;
        if(!await ConfirmModal.show({ title: 'Restaurer cette version ?', message: msg, icon: '📜', confirmText: 'Restaurer' })) return;
        
        // Sauvegarder l'état actuel avant restauration
        const currentVersion = {
            id: 'v_' + Utils.generateUniqueId(),
            date: new Date().toISOString(),
            dateDisplay: new Date().toLocaleString('fr-FR'),
            title: scene.title,
            scriptContent: scene.scriptContent,
            resume: scene.resume,
            perso: scene.perso,
            time: scene.time,
            breakdown: SceneVersions.cloneBreakdown(scene.breakdown),
            savedBy: state.currentUser?.email?.split('@')[0] || 'Inconnu',
            autoSave: true
        };
        scene.versions.unshift(currentVersion);
        
        // Restaurer
        scene.title = v.title;
        scene.scriptContent = v.scriptContent;
        scene.resume = v.resume;
        scene.perso = v.perso;
        // v580 : les liens par identifiant suivent le texte restaure. Un
        // personnage supprime depuis est recree, comme le ferait la saisie.
        FicheLinks.syncIdsFromText(scene);
        FicheLinks.resolveDecor(scene);
        scene.time = v.time;
        // Le depouillement suit le texte : restaurer l'un sans l'autre laisse
        // la scene incoherente. Les versions anterieures a ce changement n'en
        // portent pas ; dans ce cas on garde le depouillement actuel plutot que
        // de l'effacer, une perte etant pire qu'une incoherence signalee.
        if(v.breakdown) scene.breakdown = SceneVersions.cloneBreakdown(v.breakdown);
        
        // Limiter les versions
        if(scene.versions.length > SceneVersions.maxVersions) {
            scene.versions = scene.versions.slice(0, SceneVersions.maxVersions);
        }
        
        Store.save();
        UI.renderScript();
        UI.renderBoard();
        
        // Fermer la modale
        const modal = document.getElementById('scene-versions-modal');
        if(modal) modal.remove();
        
        Utils.toast('Version restaurée !', 'success');
        Utils.notifyImpact('script', ['board', 'breakdown'], 'restauré');
    },
    
    // Supprimer une version
    delete: async (sceneId, versionIdx) => {
        const scene = state.data.scenes.find(s => s.id === sceneId);
        if(!scene || !scene.versions || !scene.versions[versionIdx]) return;
        
        if(!await ConfirmModal.confirmDelete("Cette version sera supprimée.")) return;
        
        scene.versions.splice(versionIdx, 1);
        
        Store.save();
        
        // Rafraîchir la modale
        const modal = document.getElementById('scene-versions-modal');
        if(modal) {
            modal.remove();
            SceneVersions.openModal(sceneId);
        }
        
        Utils.toast('Version supprimée', 'success');
    }
};
