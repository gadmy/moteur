
const Comments = {
    currentSceneId: null,
    
    close: () => {
        document.getElementById('comments-panel').classList.remove('open');
        Comments.currentSceneId = null;
    },
    
    load: async () => {
        if(!Comments.currentSceneId || !state.currentProjectId) return;
        
        const listEl = document.getElementById('comments-list');
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sec);">Chargement...</div>';
        
        try {
            // Les commentaires sont stockés dans state.data.comments (chargés avec le projet)
            const allComments = state.data?.comments || {};
            const comments = allComments[Comments.currentSceneId] || {};
            
            const sortedComments = Object.entries(comments)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => b.date - a.date);
            
            if(sortedComments.length === 0) {
                listEl.innerHTML = '<div class="no-comments">Aucun commentaire pour cette scène.<br>Soyez le premier à commenter !</div>';
                return;
            }
            
            listEl.innerHTML = sortedComments.map(c => Comments.renderComment(c)).join('');
        } catch(e) {
            console.error('Erreur chargement commentaires:', e);
            listEl.innerHTML = '<div class="no-comments">Erreur de chargement</div>';
        }
    },
    
    renderComment: (comment) => {
        const date = new Date(comment.date).toLocaleString();
        const isOwn = state.currentUser?.email === comment.author;
        const canResolve = state.currentRole === 'owner' || state.currentRole === 'editor';
        const canDelete = isOwn || state.currentRole === 'owner';
        
        const replies = comment.replies ? Object.entries(comment.replies)
            .map(([id, r]) => ({ id, ...r }))
            .sort((a, b) => a.date - b.date)
            .map(r => `
                <div class="comment-item" style="margin-top: 8px; padding: 8px;">
                    <div class="comment-author">
                        <span class="comment-author-name">${Utils.escape(r.authorName || r.author)}</span>
                        <span class="comment-date">${new Date(r.date).toLocaleString()}</span>
                    </div>
                    <div class="comment-text">${Utils.escape(r.text)}</div>
                </div>
            `).join('') : '';
        
        return `
            <div class="comment-item ${comment.resolved ? 'resolved' : ''}" data-id="${comment.id}">
                <div class="comment-author">
                    <span class="comment-author-name">${Utils.escape(comment.authorName || comment.author)}</span>
                    <span class="comment-date">${date} ${comment.resolved ? '✅ Résolu' : ''}</span>
                </div>
                <div class="comment-text">${Utils.escape(comment.text)}</div>
                <div class="comment-actions">
                    <button class="comment-action-btn" onclick="app.Comments.toggleReply('${comment.id}')">↩️ Répondre</button>
                    ${canResolve && !comment.resolved ? `<button class="comment-action-btn" onclick="app.Comments.resolve('${comment.id}')">✅ Résoudre</button>` : ''}
                    ${canDelete ? `<button class="comment-action-btn" onclick="app.Comments.delete('${comment.id}')" class="text-danger">🗑️ Supprimer</button>` : ''}
                </div>
                <div class="comment-reply-input" id="reply-${comment.id}">
                    <textarea class="comment-input" rows="2" placeholder="Votre réponse..." data-tooltip="Votre réponse..." id="reply-text-${comment.id}"></textarea>
                    <button class="comment-submit" style="margin-top:5px; padding:8px;" onclick="app.Comments.addReply('${comment.id}')">Répondre</button>
                </div>
                ${replies ? `<div class="comment-replies">${replies}</div>` : ''}
            </div>
        `;
    },
    
    add: async () => {
        const text = document.getElementById('comment-input').value.trim();
        if(!text || !Comments.currentSceneId || !state.currentProjectId) return;
        
        const commentId = 'cmt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const comment = {
            author: state.currentUser.email,
            authorName: state.userProfile?.displayName || state.currentUser.email.split('@')[0],
            date: Date.now(),
            text: text,
            resolved: false
        };
        
        try {
            // Ajouter le commentaire dans state.data.comments
            if(!state.data.comments) state.data.comments = {};
            if(!state.data.comments[Comments.currentSceneId]) state.data.comments[Comments.currentSceneId] = {};
            state.data.comments[Comments.currentSceneId][commentId] = comment;
            
            // Sauvegarder dans Supabase
            // v578 (cloisonnement) : on ne pousse que les commentaires. Ces quatre
            // ecritures renvoyaient state.data en entier, ce qui, sur un projet
            // transmis partiellement, aurait efface les cles non recues.
            await supabase.rpc('patch_project_data', {
                p_id: state.currentProjectId,
                p_patch: { comments: state.data.comments }
            });
            
            document.getElementById('comment-input').value = '';
            Comments.load();
            Comments.updateBadge(Comments.currentSceneId);
            Utils.toast('Commentaire ajouté', 'success');
        } catch(e) {
            console.error('Erreur ajout commentaire:', e);
            Utils.toast('Erreur lors de l\'ajout', 'error');
        }
    },
    
    toggleReply: (commentId) => {
        const replyDiv = document.getElementById(`reply-${commentId}`);
        replyDiv.classList.toggle('active');
    },
    
    addReply: async (commentId) => {
        const text = document.getElementById(`reply-text-${commentId}`).value.trim();
        if(!text) return;
        
        const replyId = 'rpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const reply = {
            author: state.currentUser.email,
            authorName: state.userProfile?.displayName || state.currentUser.email.split('@')[0],
            date: Date.now(),
            text: text
        };
        
        try {
            // Ajouter la réponse dans state.data.comments
            if(!state.data.comments[Comments.currentSceneId][commentId].replies) {
                state.data.comments[Comments.currentSceneId][commentId].replies = {};
            }
            state.data.comments[Comments.currentSceneId][commentId].replies[replyId] = reply;
            
            // Sauvegarder dans Supabase
            // v578 (cloisonnement) : on ne pousse que les commentaires. Ces quatre
            // ecritures renvoyaient state.data en entier, ce qui, sur un projet
            // transmis partiellement, aurait efface les cles non recues.
            await supabase.rpc('patch_project_data', {
                p_id: state.currentProjectId,
                p_patch: { comments: state.data.comments }
            });
            
            Comments.load();
            Utils.toast('Réponse ajoutée', 'success');
        } catch(e) {
            Utils.toast('Erreur lors de l\'ajout', 'error');
        }
    },
    
    resolve: async (commentId) => {
        try {
            // Marquer comme résolu dans state.data.comments
            if(state.data.comments?.[Comments.currentSceneId]?.[commentId]) {
                state.data.comments[Comments.currentSceneId][commentId].resolved = true;
            }
            
            // Sauvegarder dans Supabase
            // v578 (cloisonnement) : on ne pousse que les commentaires. Ces quatre
            // ecritures renvoyaient state.data en entier, ce qui, sur un projet
            // transmis partiellement, aurait efface les cles non recues.
            await supabase.rpc('patch_project_data', {
                p_id: state.currentProjectId,
                p_patch: { comments: state.data.comments }
            });
            
            Comments.load();
            Comments.updateBadge(Comments.currentSceneId);
            Utils.toast('Commentaire marqué comme résolu', 'success');
        } catch(e) {
            Utils.toast('Erreur', 'error');
        }
    },
    
    delete: async (commentId) => {
        if(!await ConfirmModal.confirmDelete("Ce commentaire sera supprimé.")) return;
        
        try {
            // Supprimer le commentaire dans state.data.comments
            if(state.data.comments?.[Comments.currentSceneId]?.[commentId]) {
                delete state.data.comments[Comments.currentSceneId][commentId];
            }
            
            // Sauvegarder dans Supabase
            // v578 (cloisonnement) : on ne pousse que les commentaires. Ces quatre
            // ecritures renvoyaient state.data en entier, ce qui, sur un projet
            // transmis partiellement, aurait efface les cles non recues.
            await supabase.rpc('patch_project_data', {
                p_id: state.currentProjectId,
                p_patch: { comments: state.data.comments }
            });
            
            Comments.load();
            Comments.updateBadge(Comments.currentSceneId);
            Utils.toast('Commentaire supprimé', 'success');
        } catch(e) {
            Utils.toast('Erreur', 'error');
        }
    },
    
    getCount: async (sceneId) => {
        if(!state.currentProjectId) return { total: 0, unresolved: 0 };
        
        try {
            // Les commentaires sont stockés dans state.data.comments
            const allComments = state.data?.comments || {};
            const comments = allComments[sceneId] || {};
            const list = Object.values(comments);
            return {
                total: list.length,
                unresolved: list.filter(c => !c.resolved).length
            };
        } catch(e) {
            return { total: 0, unresolved: 0 };
        }
    },
    
    updateBadge: async (sceneId) => {
        const count = await Comments.getCount(sceneId);
        const badge = document.querySelector(`.comment-badge[data-scene="${sceneId}"]`);
        if(badge) {
            if(count.total === 0) {
                badge.style.display = 'none';
            } else {
                badge.style.display = 'inline-flex';
                badge.innerText = count.unresolved || '✓';
                badge.classList.toggle('resolved', count.unresolved === 0);
            }
        }
    },
    
    updateAllBadges: async () => {
        for(const scene of state.data.scenes) {
            await Comments.updateBadge(scene.id);
        }
    }
};
