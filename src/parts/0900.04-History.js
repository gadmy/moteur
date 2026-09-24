
const History = {
    // Cap global d'entrées dans le journal (partagé tous users)
    MAX_ENTRIES: 50,
    
    // Types d'actions
    TYPES: {
        ADD: { icon: '➕', label: 'Ajout', class: 'add' },
        EDIT: { icon: '✏️', label: 'Modification', class: 'edit' },
        DELETE: { icon: '🗑️', label: 'Suppression', class: 'delete' },
        SHARE: { icon: '👥', label: 'Partage', class: 'share' },
        EXPORT: { icon: '📤', label: 'Export', class: 'export' },
        REORDER: { icon: '🔀', label: 'Réorganisation', class: 'reorder' },
        PERMISSIONS: { icon: '🔐', label: 'Permissions', class: 'permissions' },
        MERGE: { icon: '🔗', label: 'Fusion', class: 'merge' }
    },
    
    // === Helper : extrait tous les champs scalaires d'un item (auto-extensible) ===
    // Exclut id et les champs passés dans excludeKeys (typiquement les médias gérés séparément)
    // Capture aussi les arrays courts d'éléments simples (ex: availabilityDates) en JSON
    _extractScalars: (item, excludeKeys = []) => {
        if(!item || typeof item !== 'object') return {};
        const result = {};
        const skip = new Set(['id', ...(excludeKeys || [])]);
        for(const [k, v] of Object.entries(item)) {
            if(skip.has(k)) continue;
            if(v === null || v === undefined || v === '') continue;
            if(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                result[k] = v;
            } else if(Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' || typeof x === 'number')) {
                result[k] = v;
            }
            // Objets et tableaux complexes ignorés (évite de capturer breakdown, drawings, etc.)
        }
        return result;
    },
    
    // === Helper D1 : capturer le contenu récupérable AVANT suppression ===
    // Retourne un objet "recoverable" prêt à être inclus dans une entrée d'historique
    // kind : 'scene', 'actor', 'character', 'location', 'resource', 'crew', 'shot', 'expense', 'episode', 'season'
    // Le tableau "media" contient des URLs (déjà en Storage). Si l'item a des base64, ils sont uploadés vers history/
    captureRecoverable: async (item, kind, logId) => {
        if(!item) return null;
        const recoverable = { text: null, media: [], metadata: {} };
        
        // Helper local : upload un base64 vers history/ Storage
        const uploadToHistory = async (dataUrl, label) => {
            if(!dataUrl || !state.currentProjectId) return null;
            // Si déjà une URL (Storage), on garde tel quel (pas besoin de re-uploader)
            if(typeof dataUrl === 'string' && dataUrl.startsWith('http')) return dataUrl;
            // Sinon c'est du base64, on uploade
            if(typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
            try {
                const blob = await (await fetch(dataUrl)).blob();
                const ext = blob.type === 'image/png' ? 'png' : (blob.type === 'image/svg+xml' ? 'svg' : 'jpg');
                const filename = `${logId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
                const filePath = `${state.currentProjectId}/history/${filename}`;
                const { error } = await supabase.storage.from('projects').upload(filePath, blob, { contentType: blob.type, upsert: false });
                if(error) { console.warn('Upload history media failed:', error.message); return null; }
                const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
                return urlData?.publicUrl || null;
            } catch(e) {
                console.warn('Exception upload history media:', e);
                return null;
            }
        };
        
        try {
            // Spécialisation par type d'item
            if(kind === 'scene') {
                recoverable.text = {
                    label: 'Contenu de la scène',
                    preview: (item.scriptContent || '').replace(/<[^>]+>/g, '').substring(0, 200),
                    content: item.scriptContent || ''
                };
                recoverable.metadata = {
                    title: item.title || '',
                    seasonId: item.seasonId, episodeId: item.episodeId,
                    breakdown: item.breakdown || {}
                };
            } else if(kind === 'actor') {
                const photoUrl = item.photo ? await uploadToHistory(item.photo, 'photo') : null;
                if(photoUrl) recoverable.media.push({ kind: 'photo', label: 'Photo principale', url: photoUrl });
                if(Array.isArray(item.galleryPhotos)) {
                    for(let i = 0; i < item.galleryPhotos.length; i++) {
                        const url = await uploadToHistory(item.galleryPhotos[i], 'gallery');
                        if(url) recoverable.media.push({ kind: 'gallery', label: `Photo galerie ${i+1}`, url });
                    }
                }
                // Capture exhaustive de tous les champs scalaires (auto-extensible)
                recoverable.metadata = History._extractScalars(item, ['photo', 'galleryPhotos', 'availabilityDates']);
                if(item.bio) recoverable.text = { label: 'Bio', preview: item.bio.substring(0, 200), content: item.bio };
            } else if(kind === 'character') {
                recoverable.metadata = History._extractScalars(item, []);
                if(item.bio) recoverable.text = { label: 'Bio', preview: item.bio.substring(0, 200), content: item.bio };
            } else if(kind === 'location') {
                if(Array.isArray(item.galleryPhotos)) {
                    for(let i = 0; i < item.galleryPhotos.length; i++) {
                        const url = await uploadToHistory(item.galleryPhotos[i], 'gallery');
                        if(url) recoverable.media.push({ kind: 'gallery', label: `Photo ${i+1}`, url });
                    }
                }
                recoverable.metadata = History._extractScalars(item, ['galleryPhotos']);
                if(item.desc) recoverable.text = { label: 'Description', preview: item.desc.substring(0, 200), content: item.desc };
            } else if(kind === 'resource') {
                const photoUrl = item.photo ? await uploadToHistory(item.photo, 'photo') : null;
                if(photoUrl) recoverable.media.push({ kind: 'photo', label: 'Photo', url: photoUrl });
                recoverable.metadata = History._extractScalars(item, ['photo']);
                if(item.description) recoverable.text = { label: 'Description', preview: item.description.substring(0, 200), content: item.description };
            } else if(kind === 'crew') {
                const photoUrl = item.photo ? await uploadToHistory(item.photo, 'photo') : null;
                if(photoUrl) recoverable.media.push({ kind: 'photo', label: 'Photo principale', url: photoUrl });
                if(Array.isArray(item.galleryPhotos)) {
                    for(let i = 0; i < item.galleryPhotos.length; i++) {
                        const url = await uploadToHistory(item.galleryPhotos[i], 'gallery');
                        if(url) recoverable.media.push({ kind: 'gallery', label: `Photo galerie ${i+1}`, url });
                    }
                }
                recoverable.metadata = History._extractScalars(item, ['photo', 'galleryPhotos', 'availabilityDates']);
            } else if(kind === 'shot') {
                if(item.imageUrl) {
                    const url = await uploadToHistory(item.imageUrl, 'main');
                    if(url) recoverable.media.push({ kind: 'main', label: 'Image principale du plan', url });
                }
                // Calques + objets vectoriels par zone
                if(item.drawings) {
                    for(const zoneKind of ['original', 'lighting', 'camera', 'actors']) {
                        const zone = item.drawings[zoneKind];
                        if(!zone) continue;
                        if(Array.isArray(zone.objects)) {
                            for(let i = 0; i < zone.objects.length; i++) {
                                const obj = zone.objects[i];
                                if(obj.type === 'image' && obj.imageData) {
                                    const url = await uploadToHistory(obj.imageData, `${zoneKind}_obj`);
                                    if(url) recoverable.media.push({ kind: `${zoneKind}_obj`, label: `Image insérée (${zoneKind})`, url });
                                }
                            }
                        }
                        if(zone.drawingData && Array.isArray(zone.drawingData.layers)) {
                            for(let i = 0; i < zone.drawingData.layers.length; i++) {
                                const layer = zone.drawingData.layers[i];
                                if(layer.imageData) {
                                    const url = await uploadToHistory(layer.imageData, `${zoneKind}_layer`);
                                    if(url) recoverable.media.push({ kind: `${zoneKind}_layer`, label: `Calque ${zoneKind} : ${layer.name || i+1}`, url });
                                }
                            }
                        }
                    }
                }
                recoverable.metadata = { sceneId: item.sceneId, name: item.name, description: item.description, shotType: item.shotType, cameraMove: item.cameraMove };
                if(item.description) recoverable.text = { label: 'Description du plan', preview: item.description.substring(0, 200), content: item.description };
            } else if(kind === 'expense') {
                recoverable.metadata = { title: item.title, amount: item.amountTTC || item.amount, category: item.category, date: item.date, note: item.note };
            } else if(kind === 'episode' || kind === 'season') {
                recoverable.metadata = { number: item.number, title: item.title, description: item.description || item.synopsis };
                if(item.synopsis) recoverable.text = { label: 'Synopsis', preview: item.synopsis.substring(0, 200), content: item.synopsis };
            } else {
                // Type non spécialisé : on stocke un dump basique
                recoverable.metadata = Object.fromEntries(
                    Object.entries(item).filter(([k, v]) => 
                        typeof v !== 'object' && typeof v !== 'function' && k !== 'id'
                    ).slice(0, 10)
                );
            }
        } catch(e) {
            console.warn('captureRecoverable error:', e);
        }
        
        return recoverable;
    },
    
    // === Helper D1 : nettoyer les médias Storage d'une entrée de log expirée ===
    // Appelée quand une entrée sort du cap (50 entrées) pour libérer le Storage
    cleanupExpiredEntry: async (entry) => {
        if(!entry || !entry.recoverable || !Array.isArray(entry.recoverable.media)) return;
        for(const media of entry.recoverable.media) {
            if(media.url && typeof Utils !== 'undefined' && Utils.deleteProjectFile) {
                Utils.deleteProjectFile(media.url);
            }
        }
    },
    
    // === Enregistrer une action dans l'historique (signature v2 Phase D) ===
    // Signature moderne (recommandée) :
    //   History.log(type, description, { link, recoverable, target, details })
    // Signature legacy (encore supportée pour compatibilité) :
    //   History.log(type, description, details, level)
    //   → le 3e arg est un objet "détails" libre, le 4e level est ignoré
    //
    // type : ADD | EDIT | DELETE | SHARE | EXPORT | REORDER | PERMISSIONS | MERGE
    // options :
    //   - link : { tab, id }  → bouton "Aller à" dans la modale Journal
    //   - recoverable : { text, media, metadata }  → contenu récupérable après suppression
    //   - target : { kind, id, label }  → l'objet visé
    //   - details : objet libre pour compat
    log: async (type, description, options = {}) => {
        if(!state.currentProjectId || !state.currentUser) return;
        
        // Compatibilité backward : si options ressemble à un ancien "details" (n'a pas link/recoverable/target),
        // on le considère comme details. Sinon c'est la nouvelle signature.
        const isLegacy = options && typeof options === 'object' 
                         && !('link' in options) 
                         && !('recoverable' in options) 
                         && !('target' in options) 
                         && !('details' in options);
        const normalized = isLegacy 
            ? { details: options, link: null, recoverable: null, target: null }
            : {
                link: options.link || null,
                recoverable: options.recoverable || null,
                target: options.target || null,
                details: options.details || {}
            };
        
        const entry = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: type,
            description: description,
            user: {
                email: state.currentUser.email,
                name: state.currentUser.displayName || state.currentUser.email.split('@')[0]
            },
            timestamp: Date.now(),
            // Nouveaux champs v2
            link: normalized.link,
            recoverable: normalized.recoverable,
            target: normalized.target,
            // Champ legacy conservé
            details: normalized.details
        };
        
        try {
            // Stocker l'historique dans les données du projet
            if(!state.data.history) state.data.history = [];
            state.data.history.unshift(entry);
            
            // Cap à MAX_ENTRIES (50) avec cleanup Storage pour les entrées qui sortent
            if(state.data.history.length > History.MAX_ENTRIES) {
                const expired = state.data.history.slice(History.MAX_ENTRIES);
                state.data.history = state.data.history.slice(0, History.MAX_ENTRIES);
                // Nettoyer les médias Storage des entrées expirées (async, sans bloquer)
                for(const exp of expired) {
                    History.cleanupExpiredEntry(exp).catch(() => {});
                }
            }
            // Ne pas appeler Store.save() ici pour éviter les boucles
        } catch(e) {
            console.error('Erreur historique:', e);
        }
    },
    
    // Charger l'historique
    load: async () => {
        if(!state.currentProjectId) return [];
        
        try {
            return state.data.history || [];
        } catch(e) {
            console.error('Erreur chargement historique:', e);
            return [];
        }
    },
    
    // Ouvrir la modale [Phase D - refonte]
    openModal: async () => {
        if(!state.currentProjectId) {
            Utils.toast('Ouvrez un projet d\'abord', 'warning');
            return;
        }
        
        const entries = await History.load();
        const users = [...new Set(entries.map(e => e.user?.email).filter(Boolean))];
        
        const modal = document.createElement('div');
        modal.className = 'history-modal';
        modal.id = 'history-modal';
        modal.onclick = (e) => { if(e.target === modal) History.closeModal(); };
        
        // Par défaut : afficher "Mes actions" si l'utilisateur a au moins une action, sinon "Toutes"
        const myEmail = state.currentUser?.email || '';
        const hasMyActions = entries.some(e => e.user?.email === myEmail);
        const defaultTab = hasMyActions ? 'mine' : 'all';
        
        modal.innerHTML = `
            <div class="history-box">
                <div class="history-header">
                    <h3>📜 Journal des modifications</h3>
                    <button class="history-close-btn" onclick="app.History.closeModal()">✕</button>
                </div>
                <div class="history-tabs" style="display:flex; gap:8px; padding:0 16px; border-bottom:1px solid var(--border);">
                    <button id="history-tab-mine" onclick="app.History.switchTab('mine')" class="history-tab ${defaultTab === 'mine' ? 'active' : ''}" style="padding:10px 18px; background:none; border:none; border-bottom:3px solid ${defaultTab === 'mine' ? 'var(--primary)' : 'transparent'}; cursor:pointer; color:var(--text-main); font-weight:${defaultTab === 'mine' ? '600' : '400'};">
                        👤 Mes actions
                    </button>
                    <button id="history-tab-all" onclick="app.History.switchTab('all')" class="history-tab ${defaultTab === 'all' ? 'active' : ''}" style="padding:10px 18px; background:none; border:none; border-bottom:3px solid ${defaultTab === 'all' ? 'var(--primary)' : 'transparent'}; cursor:pointer; color:var(--text-main); font-weight:${defaultTab === 'all' ? '600' : '400'};">
                        🌐 Tout le projet
                    </button>
                </div>
                <div class="history-filters" style="padding:12px 16px; display:flex; gap:8px;">
                    <select id="history-filter-type" onchange="app.History.applyFilters()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg);">
                        <option value="">Tous les types</option>
                        <option value="ADD">➕ Ajouts</option>
                        <option value="EDIT">✏️ Modifications</option>
                        <option value="DELETE">🗑️ Suppressions</option>
                        <option value="MERGE">🔗 Fusions</option>
                        <option value="REORDER">🔀 Réorganisations</option>
                        <option value="PERMISSIONS">🔐 Permissions</option>
                        <option value="SHARE">👥 Partages</option>
                        <option value="EXPORT">📤 Exports</option>
                    </select>
                    <select id="history-filter-user" onchange="app.History.applyFilters()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg);">
                        <option value="">Tous les utilisateurs</option>
                        ${users.map(u => `<option value="${Utils.escape(u)}">${Utils.escape(u)}</option>`).join('')}
                    </select>
                </div>
                <div class="history-list" id="history-list">
                    ${History.renderEntries(History.filterByTab(entries, defaultTab))}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        state.historyEntries = entries;
        state.historyCurrentTab = defaultTab;
    },
    
    // Basculer entre les onglets "Mes actions" / "Tout"
    switchTab: (tab) => {
        if(tab !== 'mine' && tab !== 'all') return;
        state.historyCurrentTab = tab;
        // Mettre à jour le style des onglets
        ['mine', 'all'].forEach(t => {
            const btn = document.getElementById('history-tab-' + t);
            if(btn) {
                const isActive = t === tab;
                btn.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
                btn.style.fontWeight = isActive ? '600' : '400';
            }
        });
        History.applyFilters();
    },
    
    // Filtrer selon l'onglet courant (mine = mes actions, all = toutes)
    filterByTab: (entries, tab) => {
        if(tab === 'all') return entries;
        const myEmail = state.currentUser?.email || '';
        return (entries || []).filter(e => e.user?.email === myEmail);
    },
    
    // Fermer la modale
    closeModal: () => {
        const modal = document.getElementById('history-modal');
        if(modal) modal.remove();
    },
    
    // Appliquer les filtres
    applyFilters: () => {
        const typeFilter = document.getElementById('history-filter-type')?.value || '';
        const userFilter = document.getElementById('history-filter-user')?.value || '';
        const currentTab = state.historyCurrentTab || 'all';
        
        let filtered = History.filterByTab(state.historyEntries || [], currentTab);
        
        if(typeFilter) {
            filtered = filtered.filter(e => e.type === typeFilter);
        }
        if(userFilter) {
            filtered = filtered.filter(e => e.user?.email === userFilter);
        }
        
        const listEl = document.getElementById('history-list');
        if(listEl) {
            listEl.innerHTML = History.renderEntries(filtered);
        }
    },
    
    // Rendre les entrées HTML [Phase D - enrichi]
    renderEntries: (entries) => {
        if(!entries || entries.length === 0) {
            return '<div class="history-empty">📭 Aucune modification enregistrée</div>';
        }
        
        return entries.map(entry => {
            const typeInfo = History.TYPES[entry.type] || History.TYPES.EDIT;
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString('fr-FR');
            const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const entryId = entry.id || ('legacy_' + entry.timestamp);
            
            // Boutons d'action selon le type
            let actionButtons = '';
            if(entry.type === 'DELETE' && entry.recoverable) {
                const hasContent = (entry.recoverable.text?.content) 
                                 || (Array.isArray(entry.recoverable.media) && entry.recoverable.media.length > 0)
                                 || (entry.recoverable.metadata && Object.keys(entry.recoverable.metadata).length > 0);
                if(hasContent) {
                    actionButtons = `<button onclick="app.History.toggleDetails('${entryId}')" class="history-action-btn" style="margin-top:6px; padding:4px 10px; background:var(--bg); border:1px solid var(--border); border-radius:4px; cursor:pointer; font-size:0.85rem;">📋 Voir les conséquences</button>`;
                }
            } else if(entry.link && (entry.link.kind || entry.link.tab)) {
                // [Phase A] Le link peut être { kind, id, ... } ou legacy { tab, id }
                actionButtons = `<button onclick="app.History.goToLink('${entryId}')" class="history-action-btn" style="margin-top:6px; padding:4px 10px; background:var(--bg); border:1px solid var(--border); border-radius:4px; cursor:pointer; font-size:0.85rem;">🔗 Aller à la fiche</button>`;
            }
            
            // Section détails (accordéon) cachée par défaut, contient le contenu recoverable
            let detailsHtml = '';
            if(entry.type === 'DELETE' && entry.recoverable) {
                detailsHtml = `<div id="history-details-${entryId}" class="history-details" style="display:none; margin-top:10px; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:6px;">${History.renderRecoverable(entry.recoverable, entryId)}</div>`;
            }
            
            return `
                <div class="history-item" data-entry-id="${entryId}">
                    <div class="history-icon ${typeInfo.class}">${typeInfo.icon}</div>
                    <div class="history-content">
                        <div class="history-action">${Utils.escape(entry.description)}</div>
                        <div class="history-meta">
                            <span>👤 ${Utils.escape(entry.user?.name || 'Inconnu')}</span>
                            <span>📅 ${dateStr} à ${timeStr}</span>
                        </div>
                        ${actionButtons}
                        ${detailsHtml}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Rendre le contenu récupérable d'une entrée DELETE
    renderRecoverable: (recoverable, entryId) => {
        if(!recoverable) return '<em style="color:var(--text-sec);">Aucun contenu récupérable.</em>';
        
        let html = '';
        
        // Métadonnées (infos contextuelles)
        if(recoverable.metadata && Object.keys(recoverable.metadata).length > 0) {
            const metaItems = Object.entries(recoverable.metadata)
                .filter(([k, v]) => v !== null && v !== undefined && v !== '')
                .map(([k, v]) => {
                    let displayVal = v;
                    if(Array.isArray(v)) {
                        if(v.length === 0) return null;
                        displayVal = v.length > 5 ? v.slice(0, 5).join(', ') + ` ... (+${v.length-5})` : v.join(', ');
                    } else if(typeof v === 'object') {
                        displayVal = JSON.stringify(v);
                    }
                    return `<div style="margin:4px 0;"><strong style="color:var(--text-sec); font-size:0.85rem;">${Utils.escape(k)} :</strong> <span style="font-size:0.9rem;">${Utils.escape(String(displayVal))}</span></div>`;
                })
                .filter(Boolean);
            if(metaItems.length > 0) {
                html += `<div style="margin-bottom:12px;"><div style="font-weight:600; margin-bottom:6px; color:var(--text-main);">📋 Informations</div>${metaItems.join('')}</div>`;
            }
        }
        
        // Texte récupérable
        if(recoverable.text && recoverable.text.content) {
            const safeContent = Utils.escape(recoverable.text.content);
            html += `
                <div style="margin-bottom:12px;">
                    <div style="font-weight:600; margin-bottom:6px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                        <span>📝 ${Utils.escape(recoverable.text.label || 'Texte')}</span>
                        <button onclick="app.History.copyText('${entryId}_text')" style="padding:3px 8px; background:var(--primary); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">📋 Copier</button>
                    </div>
                    <textarea id="history-text-${entryId}_text" readonly style="width:100%; min-height:80px; max-height:200px; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--input-bg); color:var(--text-main); font-family:inherit; font-size:0.85rem; resize:vertical;">${safeContent}</textarea>
                </div>
            `;
        }
        
        // Médias (images)
        if(Array.isArray(recoverable.media) && recoverable.media.length > 0) {
            const mediaItems = recoverable.media.map((m, i) => {
                if(!m.url) return '';
                const safeUrl = Utils.escape(m.url);
                const safeLabel = Utils.escape(m.label || `Média ${i+1}`);
                return `
                    <div style="display:flex; align-items:center; gap:10px; padding:6px; background:var(--input-bg); border-radius:4px; margin-bottom:6px;">
                        <img src="${safeUrl}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; flex-shrink:0;" alt="${safeLabel}" onerror="this.style.display='none'">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeLabel}</div>
                        </div>
                        <button onclick="app.History.viewImage('${safeUrl}', '${safeLabel.replace(/'/g, '&#39;')}')" style="padding:4px 10px; background:var(--bg); border:1px solid var(--border); border-radius:4px; cursor:pointer; font-size:0.8rem; flex-shrink:0;">👁️ Voir</button>
                        <button onclick="app.History.downloadImage('${safeUrl}', '${safeLabel.replace(/'/g, '&#39;')}')" style="padding:4px 10px; background:var(--primary); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem; flex-shrink:0;">⬇️ Télécharger</button>
                    </div>
                `;
            }).filter(Boolean).join('');
            if(mediaItems) {
                html += `<div style="margin-bottom:12px;"><div style="font-weight:600; margin-bottom:6px; color:var(--text-main);">🖼️ Images récupérables (${recoverable.media.length})</div>${mediaItems}</div>`;
            }
        }
        
        return html || '<em style="color:var(--text-sec);">Aucun contenu récupérable.</em>';
    },
    
    // Basculer l'affichage de l'accordéon des détails
    toggleDetails: (entryId) => {
        const el = document.getElementById('history-details-' + entryId);
        if(!el) return;
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
    },
    
    // Copier le texte d'une entrée dans le presse-papier
    copyText: (textKey) => {
        const ta = document.getElementById('history-text-' + textKey);
        if(!ta) return;
        ta.select();
        try {
            navigator.clipboard.writeText(ta.value).then(() => {
                Utils.toast('Texte copié dans le presse-papier', 'success', 2000);
            }).catch(() => {
                // Fallback : execCommand (deprecated mais marche encore)
                document.execCommand('copy');
                Utils.toast('Texte copié', 'success', 2000);
            });
        } catch(e) {
            Utils.toast('Erreur copie', 'error');
        }
    },
    
    // Ouvrir une image en grand dans une lightbox
    viewImage: (url, label) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal); cursor:pointer; padding:20px;';
        overlay.onclick = () => overlay.remove();
        overlay.innerHTML = `
            <div style="max-width:90%; max-height:90%; display:flex; flex-direction:column; align-items:center;">
                <img src="${url}" alt="Image agrandie" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; box-shadow:0 8px 30px rgba(0,0,0,0.5);">
                <div style="margin-top:12px; color:#fff; font-size:0.9rem; text-align:center;">${label}</div>
                <div style="margin-top:10px; color:#aaa; font-size:0.8rem;">(cliquer pour fermer)</div>
            </div>
        `;
        document.body.appendChild(overlay);
    },
    
    // Téléchargement réel d'une image (fetch + blob pour bypass le bug cross-origin de <a download>)
    downloadImage: async (url, label) => {
        try {
            Utils.toast('Téléchargement...', 'info', 1500);
            const response = await fetch(Utils.signedUrlFor(url), { mode: 'cors' });
            if(!response.ok) throw new Error('HTTP ' + response.status);
            const blob = await response.blob();
            // Déterminer l'extension
            const ext = blob.type === 'image/png' ? 'png' : (blob.type === 'image/svg+xml' ? 'svg' : (blob.type === 'image/gif' ? 'gif' : 'jpg'));
            // Construire un nom de fichier propre
            const cleanLabel = (label || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
            const filename = `${cleanLabel}.${ext}`;
            // Trigger download
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            Utils.toast(`Téléchargé : ${filename}`, 'success');
        } catch(e) {
            console.error('Download error:', e);
            Utils.toast('Erreur téléchargement. Essayez clic-droit sur "Voir" → Enregistrer', 'error', 4000);
        }
    },
    
    // Naviguer vers la fiche/zone concernée par une action (ADD/EDIT) [Phase A enrichie]
    // link peut être :
    //   { kind: 'actor'|'character'|'location', id: 'xxx' }      → ouvre CardModal
    //   { kind: 'crew', id: 'xxx' }                              → ouvre CardModal.openCrew
    //   { kind: 'resource', id: 'xxx' }                          → Resources.edit
    //   { kind: 'scene', id: 'xxx' }                             → tab script + scroll
    //   { kind: 'shot', id: 'xxx', sceneId: 'xxx' }              → tab storyboard + sélection
    //   { kind: 'shootingDay', id: 'xxx' }                       → Planning.editShootDay
    //   { kind: 'expense'|'season'|'episode', id: 'xxx' }        → tab + scroll
    //   { tab: 'xxx' }                                            → simple switch tab
    goToLink: (entryId) => {
        const entry = (state.historyEntries || []).find(e => (e.id || ('legacy_' + e.timestamp)) === entryId);
        if(!entry || !entry.link) {
            Utils.toast('Lien non disponible pour cette entrée', 'warning');
            return;
        }
        const link = entry.link;
        const kind = link.kind;
        const targetId = link.id;
        
        // Fermer la modale du journal
        History.closeModal();
        
        // Helper : scroller vers un élément + highlight
        const scrollAndHighlight = (selector, delay = 300) => {
            setTimeout(() => {
                const targetEl = document.querySelector(selector);
                if(targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.style.transition = 'box-shadow 0.3s';
                    targetEl.style.boxShadow = '0 0 0 3px var(--primary)';
                    setTimeout(() => { targetEl.style.boxShadow = ''; }, 2000);
                } else {
                    Utils.toast('Élément introuvable (peut-être supprimé depuis)', 'info');
                }
            }, delay);
        };
        
        // ALIGNEMENT SUR LA PORTE UNIQUE (26 aout). L'historique avait son
        // propre aiguillage : il ouvrait bien les fiches personne, decor et
        // ressource, mais pour une SCENE, une DEPENSE ou un PLAN il se contentait
        // de faire defiler la page jusqu'a l'element — trois familles qui
        // s'ouvrent partout ailleurs et pas depuis l'historique. Il change
        // toujours d'onglet (c'est un journal : on veut voir le contexte), puis
        // laisse UI.openFiche decider de la fenetre ET des droits.
        // NB : les onglets s'appellent 'chars' et 'locs', PAS 'characters' /
        // 'locations' (noms des collections). L'ancien aiguillage de
        // l'historique faisait deja cette confusion : switchTab sortait en
        // silence sur sa garde « onglet inconnu » et la fiche s'ouvrait sans
        // changement d'onglet — bug latent jamais vu parce que muet.
        const ONGLET = { actor: 'actors', character: 'chars', location: 'locs',
                         crew: 'crew', resource: 'resources', scene: 'board', shot: 'storyboard',
                         shootingDay: 'planning', expense: 'expenses', org: 'orgs', vehicle: 'crew' };
        const FAMILLE = { shootingDay: 'day' };
        if(ONGLET[kind]) {
            const tab = ONGLET[kind];
            const famille = FAMILLE[kind] || kind;
            if(typeof Permissions !== 'undefined' && Permissions.canOpenFiche && !Permissions.canOpenFiche(famille)) {
                Utils.toast("Vous n'avez pas accès à cette section.", 'error');
                return;
            }
            UI.switchTab(tab);
            // Le delai laisse a l'onglet le temps de se rendre : la fenetre de
            // plan a besoin de sa scene, celle du jour de son calendrier.
            setTimeout(() => {
                if(kind === 'shot' && link.sceneId && typeof Storyboard !== 'undefined' && Storyboard.selectScene) {
                    try { Storyboard.selectScene(link.sceneId); } catch(e) {}
                }
                UI.openFiche(famille, targetId);
            }, 200);
            return;
        }
        
        // Switch selon le type
        switch(kind) {
            case 'season': {
                UI.switchTab('seasons');
                scrollAndHighlight(`[data-season-id="${targetId}"], [data-id="${targetId}"]`);
                break;
            }
            case 'episode': {
                UI.switchTab('episodes');
                scrollAndHighlight(`[data-episode-id="${targetId}"], [data-id="${targetId}"]`);
                break;
            }
            default: {
                // Fallback : simple switch tab si fourni
                if(link.tab && typeof UI !== 'undefined' && UI.switchTab) {
                    UI.switchTab(link.tab);
                    if(targetId) scrollAndHighlight(`[data-id="${targetId}"], #${CSS.escape(targetId)}`);
                } else {
                    Utils.toast('Type de lien inconnu', 'warning');
                }
            }
        }
    }
};
