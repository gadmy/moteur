
// ==================== MODULE FORUM COMMUNAUTAIRE ====================
const Forum = {
    // ===================== ÉTAT & CATÉGORIES =====================
    currentCategory: 'general',
    currentSort: 'recent',
    searchQuery: '',
    threads: [],
    
    categories: {
        general: { icon: '💬', name: 'Général', desc: 'Discussions libres' },
        comediens: { icon: '🎭', name: 'Comédiens', desc: 'Auditions, conseils, retours' },
        techniciens: { icon: '🎥', name: 'Techniciens', desc: 'Matériel, techniques, formations' },
        scenario: { icon: '📝', name: 'Scénario', desc: 'Écriture, structure, dialogues' },
        realisation: { icon: '🎬', name: 'Réalisation', desc: 'Mise en scène, direction' },
        production: { icon: '💼', name: 'Production', desc: 'Financement, logistique' },
        postprod: { icon: '✂️', name: 'Post-production', desc: 'Montage, VFX, son' }
    },
    
    // ===================== NAVIGATION & CHARGEMENT =====================
    // Forum temporairement suspendu : passer à false pour le rouvrir.
    suspended: true,
    open: () => {
        if(Forum.suspended) {
            Utils.toast('Le forum est temporairement suspendu.', 'info');
            UI.showDashboard();
            return;
        }
        UI.hideAllViews();
        document.getElementById('forum-view').classList.add('active');
        Forum.loadThreads();
    },
    
    close: () => {
        UI.hideAllViews();
        document.getElementById('dashboard-view').style.display = 'flex';
    },
    
    switchCategory: (category) => {
        Forum.currentCategory = category;
        Forum.searchQuery = '';
        const _si = document.getElementById('forum-search-input'); if(_si) _si.value = '';
        const _sc = document.getElementById('forum-search-clear'); if(_sc) _sc.style.display = 'none';
        document.querySelectorAll('.forum-category').forEach(c => c.classList.remove('active'));
        document.querySelector(`.forum-category[data-category="${category}"]`).classList.add('active');
        const cat = Forum.categories[category];
        document.getElementById('forum-category-title').textContent = `${cat.icon} ${cat.name}`;
        Forum.renderThreads();
    },
    
    sort: (sortType) => {
        Forum.currentSort = sortType;
        document.querySelectorAll('.forum-sort-btn').forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');
        Forum.renderThreads();
    },
    
    _badgeByEmail: {},
    _loadBadges: async (emails) => {
        const uniq = [...new Set((emails || []).filter(Boolean).map(e => e.toLowerCase()))];
        if(uniq.length === 0) return;
        try {
            // v602 : par la fonction serveur (les auteurs ont souvent un
            // profil prive, illisible en direct).
            const { data: tous, error: errBadgesF } = await supabase.rpc('profils_minimaux', { p_emails: uniq, p_ids: null });
            const data = (tous || []).filter(p => p.moderation_badge);
            if(errBadgesF) console.warn('[Forum] _loadBadges:', errBadgesF);
            (data || []).forEach(p => {
                if(p.email) Forum._badgeByEmail[p.email.toLowerCase()] = p.moderation_badge;
                if(p.owner_email) Forum._badgeByEmail[p.owner_email.toLowerCase()] = p.moderation_badge;
            });
        } catch(e) { /* affichage du badge non bloquant */ }
    },
    _badgeDot: (email) => {
        const b = Forum._badgeByEmail[(email || '').toLowerCase()];
        const dot = { yellow: '🟡', red: '🔴', black: '⚫' }[b];
        if(!dot) return '';
        return ` <span title="Profil sous avertissement de modération" style="font-size:0.8em; vertical-align:middle;">${dot}</span>`;
    },
    loadThreads: async () => {
        try {
            const { data: threads, error } = await supabase
                .from('forum_threads')
                .select('*')
                .order('created_at', { ascending: false });
            
            if(error) throw error;
            
            Forum.threads = (threads || []).map(t => ({
                id: t.id,
                title: t.title,
                content: t.content,
                image: t.image,
                category: t.category,
                authorEmail: t.author_email,
                authorName: t.author_name,
                createdAt: t.created_at,
                votes: t.votes || 0,
                replyCount: t.reply_count || 0,
                resolved: t.resolved || false,
                pinned: t.pinned || false
            }));
            
            Forum.updateCounts();
            Forum._badgeByEmail = {};
            await Forum._loadBadges(Forum.threads.map(t => t.authorEmail));
            Forum.renderThreads();
        } catch(e) {
            console.error('Erreur chargement forum:', e);
        }
    },
    
    updateCounts: () => {
        Object.keys(Forum.categories).forEach(cat => {
            const count = Forum.threads.filter(t => t.category === cat).length;
            const el = document.getElementById(`forum-count-${cat}`);
            if(el) el.textContent = count;
        });
    },
    
    search: (q) => {
        Forum.searchQuery = q || '';
        const clr = document.getElementById('forum-search-clear');
        if(clr) clr.style.display = Forum.searchQuery.trim() ? 'block' : 'none';
        Forum.renderThreads();
    },
    
    clearSearch: () => {
        Forum.searchQuery = '';
        const input = document.getElementById('forum-search-input');
        if(input) input.value = '';
        const clr = document.getElementById('forum-search-clear');
        if(clr) clr.style.display = 'none';
        Forum.renderThreads();
    },
    
    renderThreads: () => {
        const q = (Forum.searchQuery || '').trim().toLowerCase();
        let threads = q
            ? Forum.threads.filter(t => ((t.title || '') + ' ' + (t.content || '') + ' ' + (t.authorName || '')).toLowerCase().includes(q))
            : Forum.threads.filter(t => t.category === Forum.currentCategory);
        
        if(Forum.currentSort === 'popular') {
            threads.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        } else if(Forum.currentSort === 'unresolved') {
            threads = threads.filter(t => !t.resolved);
            threads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else {
            threads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        
        const container = document.getElementById('forum-threads-list');
        if(threads.length === 0) {
            container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-sec);">${q ? 'Aucun résultat pour « ' + Utils.escape(Forum.searchQuery.trim()) + ' ».' : 'Aucun sujet dans cette catégorie. Soyez le premier à créer un sujet !'}</div>`;
            return;
        }
        
        const head = q ? `<div style="padding:4px 2px 10px; color:var(--text-sec); font-size:0.85rem;">${threads.length} résultat${threads.length > 1 ? 's' : ''} pour « ${Utils.escape(Forum.searchQuery.trim())} » (toutes catégories)</div>` : '';
        container.innerHTML = head + threads.map(t => `
            <div class="forum-thread" onclick="app.Forum.openThread('${t.id}')">
                <div class="forum-thread-title">
                    ${t.pinned ? '<span class="badge pinned">📌 Épinglé</span>' : ''}
                    ${t.resolved ? '<span class="badge resolved">✅ Résolu</span>' : ''}
                    ${Utils.escape(t.title)}
                </div>
                <div class="forum-thread-meta">
                    <div class="forum-thread-votes">
                        <span class="upvote" onclick="event.stopPropagation(); app.Forum.vote('${t.id}', 1)">▲</span>
                        <span class="score">${t.votes || 0}</span>
                        <span class="downvote" onclick="event.stopPropagation(); app.Forum.vote('${t.id}', -1)">▼</span>
                    </div>
                    <span>👤 ${Utils.escape(t.authorName || 'Anonyme')}${Forum._badgeDot(t.authorEmail)}</span>
                    <span>💬 ${t.replyCount || 0} réponses</span>
                    <span>🕐 ${Utils.timeAgo(t.createdAt)}</span>
                    ${q ? `<span>📂 ${Utils.escape((Forum.categories[t.category] && Forum.categories[t.category].name) || t.category)}</span>` : ''}
                </div>
            </div>
        `).join('');
    },
    
    // ===================== VOTES & FILS =====================
    vote: async (threadId, value) => {
        if(!state.currentUser) return;
        
        try {
            // Vérifier le vote actuel
            const { data: existingVote, error: errVote } = await supabase
                .from('forum_votes')
                .select('vote_type')
                .eq('thread_id', threadId)
                .eq('user_email', state.currentUser.email)
                .maybeSingle();
            if(errVote) throw errVote;
            
            const currentVote = existingVote?.vote_type || 0;
            const newVote = currentVote === value ? 0 : value;
            const diff = newVote - currentVote;
            
            // Upsert le vote
            if(newVote === 0) {
                await supabase
                    .from('forum_votes')
                    .delete()
                    .eq('thread_id', threadId)
                    .eq('user_email', state.currentUser.email);
            } else {
                await supabase
                    .from('forum_votes')
                    .upsert({
                        thread_id: threadId,
                        user_email: state.currentUser.email,
                        vote_type: newVote
                    }, { onConflict: 'thread_id,user_email' });
            }
            
            // Mettre à jour le compteur du thread
            const thread = Forum.threads.find(t => t.id === threadId);
            if(thread) {
                const newTotal = (thread.votes || 0) + diff;
                await supabase
                    .from('forum_threads')
                    .update({ votes: newTotal })
                    .eq('id', threadId);
                thread.votes = newTotal;
                Forum.renderThreads();
            }
        } catch(e) {
            console.error('Erreur vote:', e);
        }
    },
    
    selectedImage: null,
    
    openNewThread: () => {
        const cat = Forum.categories[Forum.currentCategory];
        Forum.selectedImage = null;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:700px; width:90%;">
                <div class="modal-header">
                    <h2>${cat.icon} Nouveau sujet - ${cat.name}</h2>
                    <button onclick="this.closest('.modal-overlay').remove()" class="modal-close">✖</button>
                </div>
                <div class="p-20">
                    <input type="text" id="new-thread-title" placeholder="Titre du sujet" data-tooltip="Titre du sujet" class="n8-input-1">
                    <div class="editor-box">
                        <div class="editor-toolbar">
                            <button data-command="bold" onclick="app.Editor.format('bold')" title="Gras"><b>G</b></button>
                            <button data-command="italic" onclick="app.Editor.format('italic')" title="Italique"><i>I</i></button>
                            <button data-command="underline" onclick="app.Editor.format('underline')" title="Souligné"><u>S</u></button>
                            <div class="separator"></div>
                            <button data-command="insertUnorderedList" onclick="app.Editor.format('insertUnorderedList')" title="Liste à puces">•</button>
                        </div>
                        <div id="new-thread-content" class="editor-content" contenteditable="true" data-placeholder="Votre message..." style="min-height:150px;" onkeyup="app.Editor.updateToolbarState()" onmouseup="app.Editor.updateToolbarState()"></div>
                        <div id="forum-image-preview"></div>
                        <div class="editor-actions">
                            <div class="editor-actions-left">
                                <button class="editor-btn" onclick="document.getElementById('forum-image-input').click()">🖼️ Image</button>
                                <input type="file" id="forum-image-input" accept="image/*" class="d-none" onchange="app.Forum.handleImageSelect(event)">
                            </div>
                            <button class="editor-btn editor-btn-primary" onclick="app.Forum.createThread()">📤 Publier</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    handleImageSelect: async (event) => {
        const file = event.target.files[0];
        if(!file) return;
        
        // Compression automatique : 1280px max + JPEG 0.85, max 400 Ko en sortie
        const dataUrl = await Utils.compressImage(file, { maxDimension: 1280, maxKb: 400 });
        if(!dataUrl) return; // erreur ou refus → toast déjà affiché par compressImage
        
        Forum.selectedImage = dataUrl;
        document.getElementById('forum-image-preview').innerHTML = `
            <div class="image-preview-container">
                <img src="${dataUrl}" class="image-preview" alt="Aperçu">
                <button class="remove-image" onclick="app.Forum.removeImage()">✕</button>
            </div>
        `;
    },
    
    removeImage: () => {
        Forum.selectedImage = null;
        const preview = document.getElementById('forum-image-preview');
        if(preview) preview.innerHTML = '';
        const input = document.getElementById('forum-image-input');
        if(input) input.value = '';
    },
    
    createThread: () => {
        const title = document.getElementById('new-thread-title').value.trim();
        const contentEl = document.getElementById('new-thread-content');
        const content = contentEl.innerHTML.trim();
        
        if(!title || !content || content === '<br>') {
            Utils.toast('Veuillez remplir le titre et le contenu', 'warning');
            return;
        }
        
        const thread = {
            title: title,
            content: content,
            image: Forum.selectedImage || null,
            category: Forum.currentCategory,
            authorEmail: state.currentUser.email,
            authorName: state.userProfile?.displayName || state.currentUser.email.split('@')[0],
            createdAt: new Date().toISOString(),
            votes: 0,
            replyCount: 0,
            resolved: false,
            pinned: false
        };
        
        supabase
            .from('forum_threads')
            .insert({
                title: thread.title,
                content: thread.content,
                image: thread.image,
                category: thread.category,
                author_email: thread.authorEmail,
                author_name: thread.authorName,
                votes: 0,
                resolved: false
            })
            .then(({ error }) => {
                if(error) {
                    console.error('Erreur création thread:', error);
                    Utils.toast('Erreur lors de la création', 'error');
                    return;
                }
                document.querySelector('.modal-overlay').remove();
                Forum.selectedImage = null;
                Forum.loadThreads();
                Utils.toast('Sujet créé !', 'success');
            });
    },
    
    // Signaler un post du forum (sujet ou réponse) -> table reports (réutilise l'infra de modération)
    reportPost: async (kind, id) => {
        if(!state.currentUser) { Utils.toast('Vous devez être connecté pour signaler', 'warning'); return; }
        let post;
        if(kind === 'forum_thread') post = (Forum.threads || []).find(t => String(t.id) === String(id)) || Forum._openThread;
        else post = (Forum._openReplies || []).find(r => String(r.id) === String(id));
        if(!post) { Utils.toast('Post introuvable', 'error'); return; }
        const reporterEmail = state.currentUser.email.toLowerCase();
        const authorEmail = (post.authorEmail || '').toLowerCase();
        if(authorEmail && authorEmail === reporterEmail) { Utils.toast('Vous ne pouvez pas signaler votre propre post', 'warning'); return; }
        const reasons = [
            { id: 'inappropriate', label: '🚫 Contenu inapproprié' },
            { id: 'spam', label: '📧 Spam / Publicité' },
            { id: 'harassment', label: '⚠️ Harcèlement' },
            { id: 'scam', label: '💰 Arnaque' },
            { id: 'other', label: '❓ Autre raison' }
        ];
        const reasonHtml = reasons.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
        const isThread = kind === 'forum_thread';
        const result = await ConfirmModal.show({
            title: '🚩 Signaler ' + (isThread ? 'ce sujet' : 'cette réponse'),
            message: `
                <p class="mb-15">Signaler le post de <strong>${Utils.escape(post.authorName || 'Anonyme')}</strong> ?</p>
                <label class="label-bold-block-5">Motif :</label>
                <select id="forum-report-reason" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;">${reasonHtml}</select>
                <label class="label-bold-block-5">Détails (optionnel) :</label>
                <textarea id="forum-report-details" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;min-height:80px;" placeholder="Décrivez le problème..." data-tooltip="Décrivez le problème..."></textarea>
            `,
            confirmText: 'Envoyer le signalement',
            icon: '🚩'
        });
        if(!result) return;
        const reason = document.getElementById('forum-report-reason')?.value || 'other';
        const freeText = document.getElementById('forum-report-details')?.value || '';
        try {
            const { data: myReportCount, error: cErr } = await supabase.rpc('count_my_reports');
            if(!cErr && typeof myReportCount === 'number' && myReportCount >= 5) { Utils.toast('Limite de 5 signalements par semaine atteinte.', 'warning', 6000); return; }
        } catch(_) {}
        const excerpt = String(post.content || '').replace(/<[^>]*>/g, '').slice(0, 240);
        const header = '[' + (isThread ? 'SUJET' : 'RÉPONSE') + (isThread && post.title ? ' « ' + post.title + ' »' : '') + '] ';
        const details = header + excerpt + (freeText ? ('\n\nMotif libre : ' + freeText) : '');
        const { error } = await supabase.from('reports').insert({
            reporter_email: reporterEmail,
            reported_type: kind,
            reported_id: String(id),
            reported_name: post.authorName || 'Anonyme',
            reported_email: authorEmail,
            reason: reason,
            details: details,
            status: 'pending',
            created_at: new Date().toISOString()
        });
        if(error) { console.error('reportPost:', error); Utils.toast('Erreur lors du signalement', 'error'); return; }
        Utils.toast('Signalement envoyé. Merci !', 'success');
    },

    openThread: async (threadId) => {
        const thread = Forum.threads.find(t => t.id === threadId);
        if(!thread) return;
        
        try {
            const { data: repliesData, error } = await supabase
                .from('forum_replies')
                .select('*')
                .eq('thread_id', threadId)
                .order('created_at', { ascending: true });
            
            if(error) throw error;
            
            const replies = (repliesData || []).map(r => ({
                id: r.id,
                content: r.content,
                authorEmail: r.author_email,
                authorName: r.author_name,
                createdAt: r.created_at
            }));
            
            await Forum._loadBadges([thread.authorEmail, ...replies.map(r => r.authorEmail)]);
            Forum.showThreadModal(thread, replies);
        } catch(e) {
            console.error('Erreur chargement réponses:', e);
        }
    },
    
    // ===================== MODALE FIL & RÉPONSES =====================
    showThreadModal: (thread, replies) => {
        Forum._openThread = thread; Forum._openReplies = replies;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:800px; max-height:90vh; overflow-y:auto;">
                <div class="modal-header">
                    <h2>${Utils.escape(thread.title)}</h2>
                    <button onclick="this.closest('.modal-overlay').remove()" class="modal-close">✖</button>
                </div>
                <div class="p-20">
                    <div class="forum-post">
                        <div class="forum-post-header">
                            <div class="forum-post-avatar">${Utils.escape((thread.authorName || '?')[0].toUpperCase())}</div>
                            <div>
                                <div class="forum-post-author">${Utils.escape(thread.authorName || 'Anonyme')}${Forum._badgeDot(thread.authorEmail)}</div>
                                <div class="forum-post-date">${Utils.timeAgo(thread.createdAt)}</div>
                            </div>
                        </div>
                        <div class="forum-post-content">${Utils.sanitizeRich(thread.content)}</div>
                        ${thread.image ? `<img src="${Utils.safeMediaUrl(thread.image)}" style="max-width:100%; border-radius:8px; margin-bottom:15px;" alt="Image">` : ''}
                        <div class="forum-post-actions">
                            <span class="forum-post-action" onclick="app.Forum.vote('${thread.id}', 1)">▲ ${thread.votes || 0}</span>
                            ${thread.authorEmail === state.currentUser?.email ? `<span class="forum-post-action" onclick="app.Forum.markResolved('${thread.id}')">✅ Marquer résolu</span>` : ''}
                            <span class="forum-post-action" onclick="app.Forum.reportPost('forum_thread', '${thread.id}')">🚩 Signaler</span>
                            ${Forum.canDelete(thread.authorEmail) ? `<span class="forum-post-action" style="color:var(--danger, #e74c3c);" onclick="app.Forum.deleteThread('${thread.id}')">🗑️ Supprimer</span>` : ''}
                        </div>
                    </div>
                    <h3 style="margin:20px 0 15px;">💬 ${replies.length} réponse${replies.length > 1 ? 's' : ''}</h3>
                    <div class="forum-replies">
                        ${replies.map(r => `
                            <div class="forum-post mb-10">
                                <div class="forum-post-header">
                                    <div class="forum-post-avatar" style="width:32px; height:32px; font-size:0.9rem;">${Utils.escape((r.authorName || '?')[0].toUpperCase())}</div>
                                    <div>
                                        <div class="forum-post-author fs-09">${Utils.escape(r.authorName || 'Anonyme')}${Forum._badgeDot(r.authorEmail)}</div>
                                        <div class="forum-post-date" style="font-size:0.8rem;">${Utils.timeAgo(r.createdAt)}</div>
                                    </div>
                                </div>
                                <div class="forum-post-content" style="font-size:0.95rem;">${Utils.escape(r.content).replace(/\n/g, '<br>')}</div>
                                <div style="margin-top:6px;"><span class="forum-post-action" style="font-size:0.8rem;" onclick="app.Forum.reportPost('forum_reply', '${r.id}')">🚩 Signaler</span>${Forum.canDelete(r.authorEmail) ? ` <span class="forum-post-action" style="font-size:0.8rem; color:var(--danger, #e74c3c);" onclick="app.Forum.deleteReply('${r.id}', '${thread.id}')">🗑️ Supprimer</span>` : ''}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-20">
                        <textarea id="reply-content" placeholder="Votre réponse..." data-tooltip="Votre réponse..." style="width:100%; min-height:80px; padding:12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--text-main);"></textarea>
                        <button onclick="app.Forum.postReply('${thread.id}')" style="margin-top:10px; padding:10px 20px; background:var(--primary); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Répondre</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    postReply: async (threadId) => {
        const content = document.getElementById('reply-content').value.trim();
        if(!content) return;
        
        try {
            // Insérer la réponse
            await supabase
                .from('forum_replies')
                .insert({
                    thread_id: threadId,
                    content: content,
                    author_email: state.currentUser.email,
                    author_name: state.userProfile?.displayName || state.currentUser.email.split('@')[0]
                });
            
            // Mettre à jour le compteur de réponses
            const thread = Forum.threads.find(t => t.id === threadId);
            if(thread) {
                const newCount = (thread.replyCount || 0) + 1;
                await supabase
                    .from('forum_threads')
                    .update({ reply_count: newCount })
                    .eq('id', threadId);
            }
            
            document.querySelector('.modal-overlay').remove();
            Forum.loadThreads();
            Forum.openThread(threadId);
            Utils.toast('Réponse publiée !', 'success');
        } catch(e) {
            console.error('Erreur réponse:', e);
            Utils.toast('Erreur lors de la publication', 'error');
        }
    },
    
    // A6 - Droits de suppression : auteur du post, ou admin (CONFIG.adminEmails)
    canDelete: (authorEmail) => {
        const me = state.currentUser?.email?.toLowerCase();
        if(!me) return false;
        return me === (authorEmail || '').toLowerCase() || Admin.isAdmin();
    },

    deleteThread: async (threadId) => {
        if(!await ConfirmModal.show({ title: 'Supprimer le sujet ?', message: 'Supprimer définitivement ce sujet ET toutes ses réponses ?', icon: '🗑️', confirmText: 'Supprimer' })) return;
        document.querySelector('.modal-overlay')?.remove();
        try {
            try { await supabase.from('forum_votes').delete().eq('thread_id', threadId); } catch(_) {}
            await supabase.from('forum_replies').delete().eq('thread_id', threadId);
            const { data, error } = await supabase.from('forum_threads').delete().eq('id', threadId).select();
            if(error) throw error;
            if(!data || data.length === 0) { Utils.toast('Suppression bloquée par les droits (RLS).', 'error', 6000); return; }
            Utils.toast('Sujet supprimé', 'success');
            Forum.loadThreads();
        } catch(e) {
            console.error('Erreur suppression sujet:', e);
            Utils.toast('Erreur lors de la suppression', 'error');
        }
    },

    deleteReply: async (replyId, threadId) => {
        if(!await ConfirmModal.show({ title: 'Supprimer la réponse ?', message: 'Supprimer définitivement cette réponse ?', icon: '🗑️', confirmText: 'Supprimer' })) return;
        document.querySelector('.modal-overlay')?.remove();
        try {
            const { data, error } = await supabase.from('forum_replies').delete().eq('id', replyId).select();
            if(error) throw error;
            if(!data || data.length === 0) { Utils.toast('Suppression bloquée par les droits (RLS).', 'error', 6000); return; }
            const thread = Forum.threads.find(t => String(t.id) === String(threadId));
            const newCount = Math.max(0, (thread?.replyCount || 1) - 1);
            try { await supabase.from('forum_threads').update({ reply_count: newCount }).eq('id', threadId); } catch(_) {}
            if(thread) thread.replyCount = newCount;
            Utils.toast('Réponse supprimée', 'success');
            Forum.openThread(threadId);
        } catch(e) {
            console.error('Erreur suppression réponse:', e);
            Utils.toast('Erreur lors de la suppression', 'error');
        }
    },

    markResolved: async (threadId) => {
        try {
            await supabase
                .from('forum_threads')
                .update({ resolved: true })
                .eq('id', threadId);
            
            const thread = Forum.threads.find(t => t.id === threadId);
            if(thread) thread.resolved = true;
            
            Forum.renderThreads();
            Utils.toast('Sujet marqué comme résolu', 'success');
        } catch(e) {
            console.error('Erreur:', e);
        }
    }
};
