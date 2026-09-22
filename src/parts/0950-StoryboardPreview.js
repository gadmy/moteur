
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

const Comments = {
    currentSceneId: null,
    
    open: (sceneId) => {
        const _panel = document.getElementById('comments-panel');
        if(_panel.classList.contains('open') && Comments.currentSceneId === sceneId) { Comments.close(); return; }
        Comments.currentSceneId = sceneId;
        const scene = state.data.scenes.find(s => s.id === sceneId);
        const sceneIndex = state.data.scenes.findIndex(s => s.id === sceneId) + 1;
        document.getElementById('comments-scene-title').innerText = `Scène ${sceneIndex} - ${scene?.title || ''}`;
        document.getElementById('comments-panel').classList.add('open');
        document.getElementById('comment-input').value = '';
        Comments.load();
    },
    
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

// ==================== MODULE HELP ====================
const Courses = {
    currentTab: 'scenario',
    
    open: () => {
        UI.hideAllViews();
        document.getElementById('courses-view').classList.add('active');
        const s = document.getElementById('courses-search');
        if(s && !s._lie) {
            s._lie = true;
            s.addEventListener('input', () => Courses.onSearch(s.value));
            // Echap vide la recherche et rend le chapitre.
            s.addEventListener('keydown', (e) => { if(e.key === 'Escape') { s.value = ''; Courses.doSearch(''); } });
        }
        if(s) s.value = '';
        Courses.render();
    },
    
    close: () => {
        UI.hideAllViews();
        document.getElementById('dashboard-view').style.display = 'flex';
    },
    
    switchTab: (tabName) => {
        Courses.currentTab = tabName;
        document.querySelectorAll('.courses-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabName));
        const s = document.getElementById('courses-search');
        if(s) s.value = '';
        Courses.render();
    },
    
    render: () => {
        const content = document.getElementById('courses-content');
        const courses = Courses.getCourses();
        content.innerHTML = courses[Courses.currentTab] || '<p>Contenu à venir...</p>';
        content.style.display = '';
        const res = document.getElementById('courses-results');
        if(res) res.innerHTML = '';
        Courses.initNotions();
        Courses.buildToc();
        const main = document.getElementById('courses-main');
        if(main) main.scrollTop = 0;
    },

    // ---- SOMMAIRE DU CHAPITRE ----
    // Construit a partir des titres reels du contenu : rien a maintenir a la
    // main, un chapitre enrichi voit son sommaire suivre tout seul.
    buildToc: () => {
        const toc = document.getElementById('courses-toc');
        const content = document.getElementById('courses-content');
        if(!toc || !content) return;
        const titres = Array.from(content.querySelectorAll('h3'));
        if(titres.length < 3) { toc.innerHTML = ''; Courses._spy(null); return; }
        let html = '<div class="courses-toc-h">Dans ce chapitre</div>';
        titres.forEach((h, i) => {
            const id = 'crs-' + Courses.currentTab + '-' + i;
            h.id = id;
            html += '<a href="#' + id + '" data-i="' + i + '">' + Utils.escape(h.textContent.trim()) + '</a>';
        });
        toc.innerHTML = html;
        toc.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const cible = document.getElementById(a.getAttribute('href').slice(1));
                if(cible) cible.scrollIntoView({ block: 'start' });
            });
        });
        Courses._spy(titres);
    },

    // Marque dans le sommaire la section en cours de lecture.
    _obs: null,
    _spy: (titres) => {
        if(Courses._obs) { Courses._obs.disconnect(); Courses._obs = null; }
        if(!titres || !titres.length || !window.IntersectionObserver) return;
        const main = document.getElementById('courses-main');
        const toc = document.getElementById('courses-toc');
        if(!main || !toc) return;
        const vus = new Set();
        Courses._obs = new IntersectionObserver((entries) => {
            entries.forEach(en => { if(en.isIntersecting) vus.add(en.target.id); else vus.delete(en.target.id); });
            // La section active est la premiere visible dans l'ordre du texte.
            let actif = null;
            for(const h of titres) { if(vus.has(h.id)) { actif = h.id; break; } }
            toc.querySelectorAll('a').forEach(a => a.classList.toggle('here', a.getAttribute('href') === '#' + actif));
        }, { root: main, rootMargin: '0px 0px -70% 0px', threshold: 0 });
        titres.forEach(h => Courses._obs.observe(h));
    },

    // ---- RECHERCHE ----
    // Elle balaie les SEPT chapitres, pas seulement celui qui est ouvert :
    // c'est tout l'interet quand on cherche un mot sans savoir ou il se range.
    _searchTimer: null,
    onSearch: (valeur) => {
        clearTimeout(Courses._searchTimer);
        Courses._searchTimer = setTimeout(() => Courses.doSearch(valeur), 200);
    },
    LABELS: { scenario: 'Scénario', realisation: 'Réalisation', image: 'Image', son: 'Son', montage: 'Montage', production: 'Production', glossaire: 'Glossaire' },
    doSearch: (valeur) => {
        const res = document.getElementById('courses-results');
        const content = document.getElementById('courses-content');
        const toc = document.getElementById('courses-toc');
        if(!res || !content) return;
        const q = (valeur || '').trim().toLowerCase();
        if(q.length < 2) { res.innerHTML = ''; content.style.display = ''; if(toc) toc.style.display = ''; return; }
        content.style.display = 'none';
        if(toc) toc.style.display = 'none';
        const courses = Courses.getCourses();
        const bac = document.createElement('div');
        const trouves = [];
        Object.keys(courses).forEach(onglet => {
            bac.innerHTML = courses[onglet] || '';
            bac.querySelectorAll('h3').forEach((h, i) => {
                // Texte de la section = son titre plus tout ce qui le suit
                // jusqu'au titre suivant.
                let txt = h.textContent;
                let n = h.nextElementSibling;
                while(n && n.tagName !== 'H3' && n.tagName !== 'H2') { txt += ' ' + n.textContent; n = n.nextElementSibling; }
                if(txt.toLowerCase().includes(q)) {
                    const brut = txt.replace(/\s+/g, ' ').trim();
                    const pos = brut.toLowerCase().indexOf(q);
                    trouves.push({
                        onglet: onglet,
                        i: i,
                        titre: h.textContent.trim(),
                        extrait: (pos > 60 ? '…' : '') + brut.slice(Math.max(0, pos - 60), pos + 120) + '…'
                    });
                }
            });
        });
        if(!trouves.length) {
            res.innerHTML = '<p class="courses-res-h">Aucune section ne parle de « ' + Utils.escape(valeur) + ' ». Essayez un mot plus court.</p>';
            return;
        }
        res.innerHTML = '<p class="courses-res-h">' + trouves.length + ' section' + (trouves.length > 1 ? 's' : '') + ' trouvée' + (trouves.length > 1 ? 's' : '') + '</p>' +
            trouves.map(t =>
                '<button class="courses-res" data-onglet="' + t.onglet + '" data-i="' + t.i + '">' +
                    '<strong>' + Utils.escape(t.titre) + '</strong>' +
                    '<span>' + Utils.escape(Courses.LABELS[t.onglet] || t.onglet) + ' — ' + Utils.escape(t.extrait) + '</span>' +
                '</button>'
            ).join('');
        res.querySelectorAll('.courses-res').forEach(b => {
            b.addEventListener('click', () => Courses.goTo(b.getAttribute('data-onglet'), parseInt(b.getAttribute('data-i'), 10)));
        });
    },

    goTo: (onglet, i) => {
        Courses.switchTab(onglet);
        setTimeout(() => {
            const cible = document.getElementById('crs-' + onglet + '-' + i);
            if(cible) cible.scrollIntoView({ block: 'start' });
        }, 40);
    },
    
    // Système d'infobulles pour les notions
    initNotions: () => {
        document.querySelectorAll('.notion').forEach(el => {
            el.addEventListener('mouseenter', Courses.showNotion);
            el.addEventListener('mouseleave', Courses.scheduleHideNotion);
        });
    },
    
    scheduleHideNotion: () => {
        // Délai pour permettre à la souris d'aller sur le tooltip
        Courses.hideTimeout = setTimeout(() => {
            const tooltip = document.querySelector('.notion-tooltip');
            if (tooltip && !tooltip.matches(':hover')) {
                tooltip.remove();
            }
        }, 100);
    },
    
    showNotion: (e) => {
        const key = e.target.getAttribute('data-notion');
        const notion = Courses.notions[key];
        if (!notion) return;
        
        // Supprimer tooltip existant
        const existing = document.querySelector('.notion-tooltip');
        if (existing) existing.remove();
        
        // Créer tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'notion-tooltip';
        tooltip.innerHTML = `
            <div class="notion-tooltip-title">${notion.title}</div>
            <div class="notion-tooltip-content">
                ${notion.description}
                ${notion.image ? `<div class="notion-tooltip-image">${notion.image}</div>` : ''}
                ${notion.example ? `<div class="notion-tooltip-example">🎬 ${notion.example}</div>` : ''}
            </div>
        `;
        document.body.appendChild(tooltip);
        
        // Positionner - d'abord rendre visible pour calculer dimensions
        tooltip.style.visibility = 'hidden';
        tooltip.style.display = 'block';
        
        const rect = e.target.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        const margin = 15;
        
        let top = rect.bottom + 10;
        let left = rect.left;
        
        // Ajuster si dépasse à droite
        if (left + tooltipWidth > window.innerWidth - margin) {
            left = window.innerWidth - tooltipWidth - margin;
        }
        // Ajuster si dépasse à gauche
        if (left < margin) {
            left = margin;
        }
        // Ajuster si dépasse en bas - mettre au-dessus
        if (top + tooltipHeight > window.innerHeight - margin) {
            top = rect.top - tooltipHeight - 10;
        }
        // Ajuster si dépasse en haut (après avoir mis au-dessus)
        if (top < margin) {
            top = margin;
        }
        // Si vraiment trop grand, centrer verticalement
        if (tooltipHeight > window.innerHeight - 2 * margin) {
            top = margin;
            tooltip.style.maxHeight = (window.innerHeight - 2 * margin) + 'px';
            tooltip.style.overflowY = 'auto';
        }
        
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.style.visibility = 'visible';
        tooltip.classList.add('visible');
        
        // Garder le tooltip visible quand on le survole
        tooltip.addEventListener('mouseenter', () => {
            if (Courses.hideTimeout) {
                clearTimeout(Courses.hideTimeout);
            }
        });
        tooltip.addEventListener('mouseleave', () => {
            tooltip.remove();
        });
    },
    
    hideTimeout: null,
    
    // Dictionnaire des notions avec descriptions détaillées
    notions: {
        // === VALEURS DE PLAN ===
        'plan-ensemble': {
            title: 'Plan d\'ensemble (PE)',
            description: `<p>Le plan d'ensemble est le plus large des plans cinématographiques. Il embrasse un vaste espace et situe l'action dans son environnement global.</p>
            <p>Ce plan établit la <strong>géographie</strong> d'une scène et donne au spectateur tous les repères spatiaux nécessaires. Il répond aux questions : Où sommes-nous ? Quelle est l'atmosphère du lieu ?</p>
            <p>Souvent utilisé en ouverture de séquence (establishing shot), il permet de "poser le décor" avant de resserrer sur les personnages.</p>`,
            image: `<img src="/images/cours/plan-ensemble.jpeg" alt="Plan d'ensemble" class="w-full-r8">`,
            example: 'L\'ouverture de "Lawrence d\'Arabie" - le désert immense écrase le personnage.'
        },
        'plan-large': {
            title: 'Plan large / Plan de demi-ensemble (PL)',
            description: `<p>Le plan large montre les personnages en pied dans leur environnement, mais avec plus de proximité que le plan d'ensemble.</p>
            <p>Il permet de voir les <strong>interactions entre les personnages</strong> et leur espace, leurs déplacements, leur gestuelle corporelle complète.</p>
            <p>C'est le plan idéal pour les scènes de groupe, les chorégraphies, ou pour montrer un personnage qui entre dans un lieu.</p>`,
            image: `<img src="/images/cours/plan-large.jpeg" alt="Plan large" class="w-full-r8">`,
            example: 'Les duels dans les westerns de Sergio Leone.'
        },
        'plan-moyen': {
            title: 'Plan moyen (PM)',
            description: `<p>Le plan moyen cadre le personnage à mi-cuisse, parfois appelé "plan italien" car très utilisé dans le cinéma néoréaliste italien.</p>
            <p>Il établit un <strong>équilibre</strong> entre le personnage et son environnement. On voit suffisamment le corps pour percevoir la gestuelle, tout en gardant le contexte spatial.</p>
            <p>C'est un plan de transition, souvent utilisé pour les dialogues à plusieurs personnages ou les scènes de mouvement modéré.</p>`,
            image: `<img src="/images/cours/plan-moyen.jpeg" alt="Plan moyen" class="w-full-r8">`,
            example: 'Les scènes de marche et discussion dans les films d\'Aaron Sorkin.'
        },
        'plan-americain': {
            title: 'Plan américain (PA)',
            description: `<p>Le plan américain cadre le personnage à mi-cuisse, juste au-dessus des genoux. Son nom vient des westerns hollywoodiens où il permettait de voir le colt à la ceinture.</p>
            <p>Ce plan offre une <strong>proximité accrue</strong> avec le personnage tout en conservant une partie de sa gestuelle corporelle. Idéal pour les confrontations et les dialogues tendus.</p>
            <p>Il est légèrement plus serré que le plan moyen et crée une présence plus affirmée du personnage dans le cadre.</p>`,
            image: `<img src="/images/cours/plan-americain.jpeg" alt="Plan américain" class="w-full-r8">`,
            example: 'Les face-à-face dans "Le Bon, la Brute et le Truand".'
        },
        'plan-rapproche': {
            title: 'Plan rapproché (PR)',
            description: `<p>Le plan rapproché cadre le personnage à la poitrine ou aux épaules. On distingue parfois le "plan rapproché taille" et le "plan rapproché poitrine".</p>
            <p>Ce plan crée une véritable <strong>intimité</strong> avec le personnage. Les expressions du visage deviennent lisibles, les émotions plus palpables.</p>
            <p>C'est le plan privilégié pour les dialogues intimes, les révélations, les moments d'émotion. Le spectateur entre dans la sphère personnelle du personnage.</p>`,
            image: `<img src="/images/cours/plan-rapproche.jpeg" alt="Plan rapproché" class="w-full-r8">`,
            example: 'Les conversations entre Rick et Ilsa dans "Casablanca".'
        },
        'gros-plan': {
            title: 'Gros plan (GP)',
            description: `<p>Le gros plan isole le visage du personnage ou un objet significatif, remplissant la majeure partie du cadre.</p>
            <p>C'est le plan de l'<strong>émotion pure</strong>. Chaque micro-expression devient visible : un frémissement de paupière, une larme naissante, un sourire esquissé.</p>
            <p>Le gros plan crée une connexion émotionnelle intense avec le spectateur. Il est souvent réservé aux moments clés pour ne pas perdre son impact.</p>`,
            image: `<img src="/images/cours/gros-plan.jpeg" alt="Gros plan" class="w-full-r8">`,
            example: 'Le regard final d\'Antoine Doinel dans "Les 400 Coups".'
        },
        'tres-gros-plan': {
            title: 'Très gros plan / Insert (TGP)',
            description: `<p>Le très gros plan isole un détail : un œil, une bouche, une main, un objet. Il extrait un fragment de réalité pour lui donner une importance capitale.</p>
            <p>Ce plan crée un effet de <strong>loupe dramatique</strong>. Il dirige impérativement l'attention du spectateur vers ce détail et lui confère une signification narrative.</p>
            <p>L'insert sur un objet (lettre, arme, clé) est une variante narrative qui révèle une information cruciale.</p>`,
            image: `<img src="/images/cours/tres-gros-plan.jpeg" alt="Très gros plan" class="w-full-r8">`,
            example: 'L\'œil en ouverture de "Blade Runner" ou la douille dans "Il faut sauver le soldat Ryan".'
        },
        // === ANGLES ===
        'plongee': {
            title: 'Plongée',
            description: `<p>La caméra est placée au-dessus du sujet et regarde vers le bas. Cet angle écrase le personnage, le diminue visuellement.</p>
            <p>La plongée traduit souvent la <strong>vulnérabilité</strong>, la soumission, l'infériorité ou l'écrasement d'un personnage. Elle peut aussi représenter le point de vue d'un personnage dominant.</p>
            <p>Plus l'angle est prononcé, plus l'effet est dramatique. La plongée totale (90°) est parfois appelée "vue de Dieu".</p>`,
            image: `<img src="/images/cours/plongee.jpeg" alt="Plongée" class="w-full-r8">`,
            example: 'Norman Bates vu d\'en haut après le meurtre dans "Psychose".'
        },
        'contre-plongee': {
            title: 'Contre-plongée',
            description: `<p>La caméra est placée en dessous du sujet et regarde vers le haut. Cet angle grandit le personnage, lui confère puissance et autorité.</p>
            <p>La contre-plongée traduit la <strong>domination</strong>, la menace, l'héroïsme ou la supériorité. Elle peut créer un sentiment d'intimidation chez le spectateur.</p>
            <p>C'est l'angle classique pour filmer les figures d'autorité, les monuments, ou les moments de triomphe.</p>`,
            image: `<img src="/images/cours/contre-plongee.jpeg" alt="Contre-plongée" class="w-full-r8">`,
            example: 'Dark Vador dans toutes ses apparitions dans "Star Wars".'
        },
        'dutch-angle': {
            title: 'Dutch Angle (Angle néerlandais)',
            description: `<p>La caméra est inclinée sur son axe, créant un horizon penché. Le monde semble basculer, perdre son équilibre.</p>
            <p>Le dutch angle traduit le <strong>déséquilibre psychologique</strong>, la folie, le malaise, l'étrangeté. Il signale que quelque chose ne va pas.</p>
            <p>Son nom vient d'une déformation de "Deutsch" (allemand), car cette technique était populaire dans l'expressionnisme allemand des années 1920.</p>`,
            image: `<img src="/images/cours/dutch-angle.jpeg" alt="Dutch angle" class="w-full-r8">`,
            example: 'Omniprésent dans "Le Troisième Homme" et les films de Tim Burton.'
        },
        // === MOUVEMENTS ===
        'panoramique': {
            title: 'Panoramique',
            description: `<p>La caméra pivote sur son axe (horizontal ou vertical) sans se déplacer. Elle "balaie" l'espace comme une tête qui tourne.</p>
            <p>Le panoramique permet d'<strong>explorer un espace</strong>, de suivre un personnage en mouvement, ou de relier deux éléments dans le même plan.</p>
            <p>On distingue le panoramique horizontal (gauche-droite), vertical (haut-bas), et le panoramique filé (très rapide, créant un flou).</p>`,
            image: `<img src="/images/cours/panoramique.jpeg" alt="Panoramique" class="w-full-r8">`,
            example: 'Les panoramiques contemplatifs sur les paysages dans les films de Terrence Malick.'
        },
        'travelling': {
            title: 'Travelling',
            description: `<p>La caméra se déplace physiquement dans l'espace, généralement sur des rails, un chariot, ou tout autre support mobile.</p>
            <p>Le travelling crée une <strong>immersion dynamique</strong>. Il peut accompagner un personnage (travelling d'accompagnement), s'en approcher (travelling avant) ou s'en éloigner (travelling arrière).</p>
            <p>Le travelling latéral est particulièrement efficace pour les scènes de dialogue en marche ou pour révéler progressivement un décor.</p>`,
            image: `<img src="/images/cours/travelling.jpeg" alt="Travelling" class="w-full-r8">`,
            example: 'Le travelling arrière infini dans "Les Affranchis" (scène du Copacabana).'
        },
        'steadicam': {
            title: 'Steadicam',
            description: `<p>Système de stabilisation porté par l'opérateur, permettant des mouvements fluides et libres impossibles sur rails.</p>
            <p>Le Steadicam offre une <strong>fluidité onirique</strong> tout en permettant de suivre les acteurs dans des espaces complexes (escaliers, foules, couloirs).</p>
            <p>Inventé par Garrett Brown en 1975, il a révolutionné le cinéma en permettant des plans-séquences mobiles d'une fluidité inédite.</p>`,
            image: `<img src="/images/cours/steadicam.jpeg" alt="Steadicam" class="w-full-r8">`,
            example: 'La poursuite dans les couloirs de l\'Overlook Hotel dans "Shining".'
        },
        'zoom': {
            title: 'Zoom',
            description: `<p>Changement de focale optique qui rapproche ou éloigne le sujet sans déplacer la caméra. Contrairement au travelling, il modifie la perspective.</p>
            <p>Le zoom est souvent considéré comme moins "cinématographique" que le travelling car il <strong>aplatit l'image</strong>. Mais utilisé intentionnellement, il peut créer des effets puissants.</p>
            <p>Le zoom rapide était caractéristique des années 70 (films de kung-fu, gialli italiens). Il connaît un renouveau ironique ou stylistique.</p>`,
            image: `<img src="/images/cours/zoom.jpeg" alt="Zoom" class="w-full-r8">`,
            example: 'Les zooms brutaux de Quentin Tarantino en hommage aux films d\'exploitation.'
        },
        'vertigo-effect': {
            title: 'Effet Vertigo (Dolly Zoom)',
            description: `<p>Combinaison d'un travelling et d'un zoom en sens inverse. La caméra avance pendant que l'objectif dézoome (ou l'inverse).</p>
            <p>Le sujet garde la même taille mais le fond semble s'étirer ou se comprimer, créant un effet de <strong>vertige et de dissociation</strong>.</p>
            <p>Inventé par Irmin Roberts pour "Vertigo" d'Hitchcock (1958), il traduit visuellement le malaise, la prise de conscience brutale, ou le choc émotionnel.</p>`,
            image: `<img src="/images/cours/vertigo-effect.jpeg" alt="Effet Vertigo" class="w-full-r8">`,
            example: 'La scène du clocher dans "Vertigo" et la plage dans "Les Dents de la Mer".'
        },
        // === IMAGE - COMPOSITION ===
        'regle-tiers': {
            title: 'Règle des tiers',
            description: `<p>Principe de composition divisant l'image en 9 zones égales par 2 lignes horizontales et 2 verticales.</p>
            <p>Les éléments importants (visage, horizon, sujet principal) gagnent en <strong>dynamisme</strong> lorsqu'ils sont placés sur ces lignes ou à leurs intersections, appelées "points forts".</p>
            <p>Centrer le sujet crée une image statique ; le décentrer selon la règle des tiers crée tension et mouvement.</p>`,
            image: `<img src="/images/cours/regle-tiers.jpeg" alt="Règle des tiers" class="w-full-r8">`,
            example: 'Quasi tous les grands directeurs photo utilisent cette règle comme base.'
        },
        'profondeur-champ': {
            title: 'Profondeur de champ',
            description: `<p>Zone de netteté devant et derrière le point de mise au point. Peut être courte (flou d'arrière-plan) ou grande (tout net).</p>
            <p>Une <strong>faible profondeur</strong> isole le sujet et crée de l'intimité. Une <strong>grande profondeur</strong> permet de voir tous les plans simultanément.</p>
            <p>Contrôlée par l'ouverture (f/1.4 = faible, f/16 = grande), la focale et la distance au sujet.</p>`,
            image: `<img src="/images/cours/profondeur-champ.jpeg" alt="Profondeur de champ" class="w-full-r8">`,
            example: 'Wong Kar-wai utilise une très faible profondeur pour créer l intimité.'
        },
        'key-light': {
            title: 'Key Light (Lumière principale)',
            description: `<p>Source lumineuse principale qui définit la direction et la qualité de l'éclairage d'une scène.</p>
            <p>C'est elle qui crée les <strong>ombres principales</strong> et donne le "caractère" à l'image. Sa position détermine le modelé du visage.</p>
            <p>Généralement placée à 45° du sujet (horizontalement et verticalement), mais peut varier selon l'effet recherché.</p>`,
            image: `<img src="/images/cours/key-light.jpeg" alt="Key Light" class="w-full-r8">`,
            example: 'Position classique "Rembrandt" à 45° pour les portraits.'
        },
        'fill-light': {
            title: 'Fill Light (Lumière de remplissage)',
            description: `<p>Source secondaire qui adoucit les ombres créées par la Key Light, sans les éliminer complètement.</p>
            <p>Contrôle le <strong>ratio de contraste</strong> : plus elle est forte, plus l'image est douce. Absente, les ombres sont noires (low-key).</p>
            <p>Souvent placée du côté opposé à la Key, peut être un réflecteur plutôt qu'une vraie source.</p>`,
            image: `<img src="/images/cours/fill-light.jpeg" alt="Fill Light" class="w-full-r8">`,
            example: 'Un ratio Key:Fill de 2:1 donne un look naturel.'
        },
        'back-light': {
            title: 'Back Light (Contre-jour)',
            description: `<p>Lumière placée derrière le sujet qui crée un liseré lumineux sur les contours, séparant le sujet du fond.</p>
            <p>Apporte <strong>profondeur et relief</strong> à l'image. Sans elle, le sujet peut se "fondre" dans l'arrière-plan.</p>
            <p>Aussi appelée "rim light" ou "hair light" quand elle éclaire spécifiquement les cheveux.</p>`,
            image: `<img src="/images/cours/back-light.jpeg" alt="Back Light" class="w-full-r8">`,
            example: 'Indispensable dans les interviews pour décoller le sujet du fond.'
        },
        'high-key': {
            title: 'Éclairage High-Key',
            description: `<p>Style d'éclairage uniforme et lumineux avec très peu d'ombres. L'image est globalement claire.</p>
            <p>Crée une atmosphère <strong>légère, optimiste, accessible</strong>. Associé aux comédies, sitcoms, publicités, clips pop.</p>
            <p>Nécessite beaucoup de fill light pour éliminer les ombres. Ratio Key:Fill proche de 1:1.</p>`,
            image: `<img src="/images/cours/high-key.jpeg" alt="High-Key" class="w-full-r8">`,
            example: 'Les comédies romantiques, les pubs de cosmétiques.'
        },
        'low-key': {
            title: 'Éclairage Low-Key',
            description: `<p>Style d'éclairage contrasté avec des ombres profondes et des zones sombres dominantes.</p>
            <p>Crée une atmosphère <strong>dramatique, mystérieuse, menaçante</strong>. Signature du film noir, thriller, horreur.</p>
            <p>Peu ou pas de fill light. Les ombres sont noires, les sources souvent hors-champ.</p>`,
            image: `<img src="/images/cours/low-key.jpeg" alt="Low-Key" class="w-full-r8">`,
            example: 'Film noir, Se7en, Blade Runner, Le Parrain.'
        },
        'magic-hour': {
            title: 'Magic Hour (Heure dorée)',
            description: `<p>Période juste après le lever ou avant le coucher du soleil où la lumière est dorée, douce et directionnelle.</p>
            <p>Produit une lumière <strong>naturellement flatteuse</strong> avec des ombres longues et une qualité "magique" impossible à reproduire artificiellement.</p>
            <p>Fenêtre de tournage très courte (20-40 min). Demande une préparation minutieuse.</p>`,
            image: `<img src="/images/cours/magic-hour.jpeg" alt="Magic Hour" class="w-full-r8">`,
            example: 'Terrence Malick (Days of Heaven, The Tree of Life) tourne quasi exclusivement en magic hour.'
        },
        // === IMAGE - OPTIQUES ===
        'focale-courte': {
            title: 'Focale courte (Grand-angle)',
            description: `<p>Objectif de 16-35mm qui offre un champ de vision large et exagère les perspectives.</p>
            <p>Les objets proches paraissent <strong>plus grands</strong>, les distances semblent <strong>étirées</strong>. Déforme les bords de l'image.</p>
            <p>Idéal pour : espaces confinés, sentiment d'oppression, immensité des paysages, effets comiques (visage déformé).</p>`,
            image: `<img src="/images/cours/focale-courte.jpeg" alt="Focale courte" class="w-full-r8">`,
            example: 'Kubrick dans Orange Mécanique, les scènes de poursuite de Mad Max.'
        },
        'focale-longue': {
            title: 'Focale longue (Téléobjectif)',
            description: `<p>Objectif de 85-200mm+ qui compresse les distances et isole le sujet avec un fort flou d'arrière-plan.</p>
            <p>Les plans semblent <strong>rapprochés</strong> les uns des autres. Crée une sensation d'<strong>intimité</strong> ou d'<strong>écrasement</strong>.</p>
            <p>Idéal pour : portraits, isoler un sujet dans une foule, créer une sensation de surveillance ou filature.</p>`,
            image: `<img src="/images/cours/focale-longue.jpeg" alt="Focale longue" class="w-full-r8">`,
            example: 'Les portraits de Gordon Willis dans Le Parrain.'
        },
        'anamorphique': {
            title: 'Objectif anamorphique',
            description: `<p>Optique spéciale qui compresse l'image horizontalement à la prise de vue, puis l'étire à la projection.</p>
            <p>Produit le format <strong>CinemaScope 2.39:1</strong>, des flares horizontaux caractéristiques et un bokeh ovale.</p>
            <p>Considéré comme le "look cinéma" par excellence. Plus coûteux et complexe à utiliser.</p>`,
            image: `<img src="/images/cours/anamorphique.jpeg" alt="Anamorphique" class="w-full-r8">`,
            example: 'Blade Runner 2049, Star Wars, La La Land.'
        },
        // === IMAGE - RATIOS ===
        'grue-jib': {
            title: 'Grue / Jib',
            description: `<p>Dispositif mécanique permettant des mouvements de caméra verticaux amples et fluides.</p>
            <p>La <strong>grue</strong> peut porter l'opérateur, le <strong>jib</strong> est télécommandé. Permet des mouvements impossibles autrement.</p>
            <p>Idéal pour les révélations spectaculaires, les survols, les mouvements du sol au ciel.</p>`,
            image: `<img src="/images/cours/grue-jib.jpeg" alt="Grue / Jib" class="w-full-r8">`,
            example: 'Le plan final de La Haine, les survols de foule.'
        },
        'chiaroscuro': {
            title: 'Chiaroscuro (Clair-obscur)',
            description: `<p>Technique d'éclairage inspirée de la peinture baroque (Caravage, Rembrandt) utilisant des contrastes extrêmes.</p>
            <p>Des zones de <strong>lumière intense</strong> côtoient des <strong>ombres profondes</strong>, créant un effet dramatique et sculptural.</p>
            <p>Renforce le mystère, la tension, la dimension psychologique des personnages.</p>`,
            image: `<img src="/images/cours/chiaroscuro.jpeg" alt="Chiaroscuro" class="w-full-r8">`,
            example: 'Le Parrain, Blade Runner, les films de Fincher.'
        },
        'rembrandt-lighting': {
            title: 'Éclairage Rembrandt',
            description: `<p>Technique de portrait où la lumière crée un triangle lumineux sous l'œil du côté ombré du visage.</p>
            <p>Nommé d'après le peintre qui utilisait ce motif. Considéré comme l'<strong>éclairage portrait classique</strong> par excellence.</p>
            <p>La key light est placée à 45° en hauteur et sur le côté, créant ce triangle caractéristique.</p>`,
            image: `<img src="/images/cours/rembrandt-lighting.jpeg" alt="Éclairage Rembrandt" class="w-full-r8">`,
            example: 'Portraits classiques, interviews cinéma.'
        },
        'lumiere-pratique': {
            title: 'Lumière pratique',
            description: `<p>Source de lumière visible à l'écran : lampes, bougies, néons, écrans, phares de voiture.</p>
            <p>Justifie la lumière de la scène de manière <strong>diégétique</strong> (dans l'univers du film).</p>
            <p>Souvent renforcée par des sources cachées car les pratiques seules sont rarement suffisantes.</p>`,
            image: `<img src="/images/cours/lumiere-pratique.jpeg" alt="Lumière pratique" class="w-full-r8">`,
            example: 'Barry Lyndon (bougies), Taxi Driver (néons).'
        },
        'temperature-couleur': {
            title: 'Température de couleur',
            description: `<p>Mesure en Kelvin (K) de la teinte d'une source lumineuse, du chaud (orange) au froid (bleu).</p>
            <p><strong>2700-3200K</strong> = tungstène, bougie (chaud). <strong>5500-6500K</strong> = lumière du jour (neutre à froid).</p>
            <p>Mélanger des sources de températures différentes crée des dominantes colorées (voulues ou non).</p>`,
            image: `<img src="/images/cours/temperature-couleur.jpeg" alt="Température de couleur" class="w-full-r8">`,
            example: 'Mélange tungstène/daylight dans les scènes intérieur/fenêtre.'
        },
        'ratio-scope': {
            title: 'Format Scope (2.39:1)',
            description: `<p>Format cinématographique ultra-large, aussi appelé CinemaScope ou Panavision.</p>
            <p>Idéal pour les <strong>paysages épiques</strong>, les westerns, la science-fiction. Permet de composer avec beaucoup d'espace horizontal.</p>
            <p>Peut créer un sentiment d'isolement quand un personnage seul occupe ce format large.</p>`,
            image: `<img src="/images/cours/ratio-scope.jpeg" alt="Format Scope" class="w-full-r8">`,
            example: 'Lawrence d Arabie, Dune, les westerns de Leone.'
        },
        'ratio-185': {
            title: 'Format 1.85:1',
            description: `<p>Format standard du cinéma américain depuis les années 50. Plus large que le 16:9 TV.</p>
            <p>Bon <strong>compromis</strong> entre l'intimité du 4:3 et l'ampleur du Scope. Polyvalent pour tous les genres.</p>
            <p>Souvent appelé "Flat" par opposition au "Scope".</p>`,
            example: 'La majorité des films américains : Spielberg, Nolan (hors IMAX).'
        },
        'ratio-imax': {
            title: 'Format IMAX (1.43:1)',
            description: `<p>Format géant développé pour les écrans IMAX, presque carré, offrant une immersion maximale.</p>
            <p>Utilise des pellicules ou capteurs beaucoup plus grands que le 35mm standard. Résolution et détails exceptionnels.</p>
            <p>Certains films alternent entre IMAX et Scope selon les scènes (Nolan, Villeneuve).</p>`,
            image: `<img src="/images/cours/ratio-imax.jpeg" alt="Format IMAX" class="w-full-r8">`,
            example: 'Dunkirk, Oppenheimer, Interstellar (séquences IMAX).'
        },
        'cadre-ferme': {
            title: 'Cadre fermé',
            description: `<p>Composition où des éléments du décor (portes, fenêtres, barreaux) encadrent et "emprisonnent" le sujet.</p>
            <p>Crée un sentiment d'<strong>oppression, d'enfermement, de piège</strong>. Le personnage semble coincé.</p>
            <p>Contraste avec le cadre ouvert qui suggère la liberté et les possibilités.</p>`,
            image: `<img src="/images/cours/cadre-ferme.jpeg" alt="Cadre fermé" class="w-full-r8">`,
            example: 'Les plans à travers les barreaux dans Le Silence des Agneaux.'
        },
        'cadre-ouvert': {
            title: 'Cadre ouvert',
            description: `<p>Composition où le personnage dispose d'espace pour "sortir" du cadre, suggérant liberté et possibilités.</p>
            <p>Le regard ou le mouvement du personnage indique un <strong>hors-champ accessible</strong>.</p>
            <p>Crée une dynamique, une invitation au mouvement, un sentiment d'ouverture.</p>`,
            image: `<img src="/images/cours/cadre-ouvert.jpeg" alt="Cadre ouvert" class="w-full-r8">`,
            example: 'Plans larges de westerns, fins ouvertes.'
        },
        'log-raw': {
            title: 'LOG / RAW',
            description: `<p>Profils d'enregistrement qui capturent un maximum d'informations pour l'étalonnage en post-production.</p>
            <p><strong>LOG</strong> : image plate et désaturée, préserve les hautes et basses lumières. <strong>RAW</strong> : données brutes du capteur.</p>
            <p>Nécessite un étalonnage obligatoire mais offre une flexibilité créative maximale.</p>`,
            image: `<img src="/images/cours/log-raw.jpeg" alt="LOG / RAW" class="w-full-r8">`,
            example: 'Standard sur toutes les productions cinéma actuelles.'
        },
        'lut': {
            title: 'LUT (Look-Up Table)',
            description: `<p>Fichier de transformation colorimétrique appliquant un "look" prédéfini à l'image.</p>
            <p><strong>LUT technique</strong> : convertit LOG vers un espace standard. <strong>LUT créative</strong> : applique un style (film, vintage, etc.).</p>
            <p>Permet de prévisualiser le rendu final sur le plateau et d'accélérer l'étalonnage.</p>`,
            example: 'Rec709, Cineon, looks "Teal & Orange".'
        },
        'ratio-43': {
            title: 'Format 4:3 (1.33:1)',
            description: `<p>Format "Academy" classique, aussi format de la télévision ancienne. Presque carré.</p>
            <p>Ressenti <strong>intime, rétro, claustrophobe</strong>. Redécouvert par des cinéastes contemporains pour son caractère distinctif.</p>
            <p>Force à des compositions plus verticales, met l'accent sur les visages.</p>`,
            example: 'The Lighthouse, Elephant de Van Sant, First Reformed.'
        },
        // === IMAGE - CADRE NARRATIF ===
        'hors-champ': {
            title: 'Hors-champ',
            description: `<p>Tout ce qui existe dans l'univers du film mais n'est pas visible dans le cadre à un moment donné.</p>
            <p>Outil narratif <strong>puissant</strong> : ce qu'on ne voit pas peut être plus effrayant/intrigant que ce qu'on montre.</p>
            <p>Le regard d'un personnage, un son, une ombre peuvent suggérer une présence hors-champ.</p>`,
            image: `<img src="/images/cours/hors-champ.jpeg" alt="Hors-champ" class="w-full-r8">`,
            example: 'Alien - le monstre reste hors-champ la majorité du film.'
        },
        'amorce': {
            title: 'Amorce',
            description: `<p>Élément (souvent flou) placé au premier plan du cadre, partiellement visible, qui crée de la profondeur.</p>
            <p>Donne une sensation de <strong>voyeurisme</strong>, d'espionnage, ou simplement de profondeur spatiale.</p>
            <p>Souvent une épaule, une tête, un objet. Fréquent dans les champs/contre-champs.</p>`,
            image: `<img src="/images/cours/amorce.jpeg" alt="Amorce" class="w-full-r8">`,
            example: 'Quasi tous les champs/contre-champs utilisent des amorces.'
        },
        'surcadrage': {
            title: 'Surcadrage',
            description: `<p>Technique de composition où un cadre dans l'image (porte, fenêtre, miroir) encadre le sujet.</p>
            <p>Crée une <strong>mise en abyme</strong>, isole le personnage, peut suggérer l'enfermement ou le voyeurisme.</p>
            <p>Très utilisé par John Ford (portes) et Wong Kar-wai (fenêtres, miroirs).</p>`,
            image: `<img src="/images/cours/surcadrage.jpeg" alt="Surcadrage" class="w-full-r8">`,
            example: 'In the Mood for Love, La Prisonnière du désert (plan final).'
        },
        // === SON - MICROPHONES ===
        'micro-canon': {
            title: 'Micro canon (Shotgun)',
            description: `<p>Microphone très directionnel en forme de tube, conçu pour capter le son dans un angle étroit devant lui.</p>
            <p>Idéal pour <strong>isoler une source</strong> (voix d'un acteur) tout en rejetant les sons latéraux et arrière.</p>
            <p>Monté sur une perche tenue par le perchiste, il doit pointer vers la bouche de l'acteur, généralement par-dessus.</p>`,
            example: 'Standard sur tous les plateaux professionnels.'
        },
        'micro-cravate': {
            title: 'Micro cravate (Lavalier)',
            description: `<p>Microphone miniature omnidirectionnel qui se fixe sur le vêtement de l'acteur, près de la poitrine.</p>
            <p>Avantage : <strong>discret et sécurisant</strong> (toujours à distance constante). Inconvénient : risque de frottements, son moins naturel.</p>
            <p>Souvent utilisé en backup du micro perche, ou quand la perche ne peut pas atteindre l'acteur (plan large).</p>`,
            example: 'Indispensable pour les interviews et documentaires.'
        },
        // === SON - COUCHES SONORES ===
        'foley': {
            title: 'Foley (Bruitage)',
            description: `<p>Art de recréer en studio les sons synchrones du quotidien : pas, vêtements, manipulations d'objets.</p>
            <p>Nommé d'après <strong>Jack Foley</strong>, pionnier de la technique à Universal dans les années 1920.</p>
            <p>Le bruiteur (foley artist) regarde l'image et reproduit les sons en temps réel avec des accessoires variés.</p>`,
            example: 'Ben Burtt a créé le son de R2-D2 et le sabre laser.'
        },
        'ambiance-son': {
            title: 'Ambiance sonore (Room Tone)',
            description: `<p>Son continu caractéristique d'un lieu : rumeur de ville, vent, forêt, bourdonnement d'intérieur.</p>
            <p>Indispensable pour <strong>créer l'espace sonore</strong> et assurer la continuité entre les plans d'une même scène.</p>
            <p>On enregistre toujours 1-2 minutes de "silence" de chaque lieu pour avoir de l'ambiance de raccord.</p>`,
            example: 'Le bourdonnement oppressant dans No Country for Old Men.'
        },
        // === SON - DIÉGÈSE ===
        'son-diegetique': {
            title: 'Son diégétique',
            description: `<p>Son dont la source existe dans l'univers du film et que les personnages peuvent entendre.</p>
            <p>Exemples : radio à l'écran, musicien qui joue, dialogue, bruit de pas, klaxon dans la rue.</p>
            <p>Ancre le spectateur dans la <strong>réalité de la fiction</strong> et renforce l'immersion.</p>`,
            example: 'La radio dans le taxi de Travis Bickle (Taxi Driver).'
        },
        'son-extra-diegetique': {
            title: 'Son extra-diégétique',
            description: `<p>Son ajouté au film que les personnages n'entendent pas : musique de score, voix-off narrative.</p>
            <p>S'adresse <strong>directement au spectateur</strong>, guide ses émotions, commente l'action.</p>
            <p>Outil puissant mais son usage excessif peut devenir manipulateur ou envahissant.</p>`,
            example: 'La musique de John Williams dans Star Wars.'
        },
        // === SON - SOUND DESIGN ===
        'worldizing': {
            title: 'Worldizing',
            description: `<p>Technique inventée par Walter Murch consistant à rejouer un son dans un espace réel et le réenregistrer.</p>
            <p>Donne au son les <strong>caractéristiques acoustiques</strong> d'un lieu : réverbération, filtrage, coloration.</p>
            <p>Plus organique que les reverbs numériques car capture la vraie physique du son dans l'espace.</p>`,
            example: 'Utilisé pour les voix radio dans Apocalypse Now.'
        },
        'layering': {
            title: 'Layering (Superposition)',
            description: `<p>Technique de sound design consistant à superposer plusieurs sons pour en créer un nouveau, unique.</p>
            <p>Un son de monstre peut combiner : cri animal, métal, voix humaine ralentie, grondement...</p>
            <p>Permet de créer des sons <strong>inédits et évocateurs</strong> qui n'existent pas dans la réalité.</p>`,
            example: 'Le T-Rex de Jurassic Park = bébé éléphant + alligator + tigre.'
        },
        // === SON - FORMATS ===
        'surround-51': {
            title: '5.1 Surround',
            description: `<p>Format audio standard du cinéma avec 6 canaux : 5 enceintes + 1 caisson de basses (LFE).</p>
            <p>Configuration : Gauche, Centre, Droite (devant) + Surround Gauche, Surround Droite (arrière) + Subwoofer.</p>
            <p>Permet de <strong>placer les sons dans l'espace</strong> autour du spectateur pour une immersion totale.</p>`,
            example: 'Standard depuis Toy Story (1995) et Saving Private Ryan.'
        },
        'meta-diegetique': {
            title: 'Son méta-diégétique',
            description: `<p>Son subjectif représentant l'intériorité d'un personnage : pensées, souvenirs, hallucinations.</p>
            <p>Le personnage l'entend mais pas les autres : <strong>acouphène, battement de cœur, voix intérieure, flashback sonore</strong>.</p>
            <p>Permet d'accéder à la psychologie du personnage de manière immersive.</p>`,
            example: 'L acouphène après l explosion dans Saving Private Ryan.'
        },
        'wild-tracks': {
            title: 'Wild Tracks',
            description: `<p>Enregistrements sonores réalisés sans image, captant ambiances, effets ou dialogues séparément.</p>
            <p>Permet de <strong>compléter la bande-son</strong> en post-production avec des sons propres et isolés.</p>
            <p>L'ingénieur du son profite des pauses pour enregistrer l'ambiance du lieu, des sons spécifiques.</p>`,
            example: 'Ambiances de rue, bruits de machines, room tone.'
        },
        'pitch-shifting': {
            title: 'Pitch Shifting',
            description: `<p>Modification de la hauteur (fréquence) d'un son sans changer sa durée, ou inversement.</p>
            <p>Ralentir un son le rend plus <strong>grave et menaçant</strong>. L'accélérer le rend aigu et énergique.</p>
            <p>Technique fondamentale du sound design pour créer des sons de créatures, monstres, vaisseaux.</p>`,
            example: 'Le T-Rex (bébé éléphant ralenti), Godzilla.'
        },
        'leitmotiv-sonore': {
            title: 'Leitmotiv sonore',
            description: `<p>Son ou motif musical récurrent associé à un personnage, un lieu, une émotion ou un thème.</p>
            <p>Crée une <strong>association pavlovienne</strong> : le spectateur reconnaît le motif et anticipe.</p>
            <p>Peut être subtil (texture, fréquence) ou évident (thème musical complet).</p>`,
            example: 'La Marche Impériale (Vader), le thème des Dents de la Mer.'
        },
        'micro-omni': {
            title: 'Micro omnidirectionnel',
            description: `<p>Microphone captant le son de manière égale dans toutes les directions (360°).</p>
            <p>Idéal pour les <strong>ambiances</strong>, les enregistrements d'ensemble, ou quand la direction change constamment.</p>
            <p>Moins sensible aux bruits de manipulation mais capte aussi les sons indésirables environnants.</p>`,
            example: 'Enregistrement d ambiances, micros cravate.'
        },
        'double-systeme': {
            title: 'Double système',
            description: `<p>Enregistrement du son sur un appareil séparé de la caméra (enregistreur externe type Sound Devices).</p>
            <p>Qualité <strong>professionnelle supérieure</strong> aux préamplis intégrés des caméras. Standard sur les tournages pro.</p>
            <p>Nécessite une synchronisation en post (clap, timecode). Le son caméra sert de référence.</p>`,
            example: 'Standard sur tous les tournages cinéma.'
        },
        'ducking': {
            title: 'Ducking',
            description: `<p>Technique de mixage où un signal audio baisse automatiquement quand un autre est présent.</p>
            <p>Usage classique : la <strong>musique baisse sous les dialogues</strong> puis remonte quand ils s'arrêtent.</p>
            <p>Peut être fait manuellement ou via un compresseur side-chain en temps réel.</p>`,
            example: 'Toutes les scènes dialogue + musique au cinéma.'
        },
        'stems': {
            title: 'Stems (Prémix)',
            description: `<p>Groupes de pistes audio séparés par catégorie : Dialogues (DX), Musique (MX), Effets (FX).</p>
            <p>Permet de créer des <strong>versions internationales</strong> (VI) en remplaçant uniquement les dialogues.</p>
            <p>Livrables essentiels pour la distribution : le mixage final peut être reconstitué depuis les stems.</p>`,
            example: 'Livrable obligatoire pour toute distribution internationale.'
        },
        'dolby-atmos': {
            title: 'Dolby Atmos',
            description: `<p>Format audio immersif basé sur des "objets sonores" positionnables en 3D, incluant le plafond.</p>
            <p>Contrairement au 5.1/7.1 basé sur des canaux, Atmos place chaque son précisément dans l'espace <strong>x, y, z</strong>.</p>
            <p>Permet des effets de survol, de pluie tombant du plafond, de son qui se déplace avec précision.</p>`,
            example: 'Gravity, Blade Runner 2049, Dune.'
        },
        // === MONTAGE - RACCORDS ===
        'raccord-regard': {
            title: 'Raccord regard',
            description: `<p>Technique de montage où l'on montre d'abord un personnage qui regarde, puis ce qu'il voit.</p>
            <p>Crée un lien <strong>psychologique</strong> entre le spectateur et le personnage : on partage son point de vue.</p>
            <p>Le regard doit être cohérent en direction : s'il regarde à droite, l'objet doit "venir" de la gauche.</p>`,
            example: 'Hitchcock était maître du raccord regard (Fenêtre sur cour).'
        },
        'match-cut': {
            title: 'Match Cut',
            description: `<p>Raccord qui relie deux plans par une similarité visuelle : forme, mouvement, couleur ou composition.</p>
            <p>Crée une <strong>transition poétique</strong> et peut suggérer un lien thématique entre deux éléments distincts.</p>
            <p>Souvent utilisé pour les ellipses temporelles ou les associations d'idées.</p>`,
            example: '2001 de Kubrick : l os préhistorique → station spatiale.'
        },
        'jump-cut': {
            title: 'Jump Cut',
            description: `<p>Coupe entre deux plans très similaires du même sujet, créant un "saut" visuel perturbant.</p>
            <p>Traditionnellement considéré comme une <strong>erreur</strong>, il est devenu un outil stylistique depuis la Nouvelle Vague.</p>
            <p>Exprime l'urgence, le passage du temps, l'instabilité mentale, ou brise volontairement l'illusion.</p>`,
            example: 'Godard dans À bout de souffle - révolution stylistique.'
        },
        'champ-contrechamp': {
            title: 'Champ / Contre-champ',
            description: `<p>Alternance entre deux points de vue opposés, typiquement lors d'un dialogue entre deux personnages.</p>
            <p>Technique <strong>fondamentale</strong> du cinéma narratif. Chaque personnage est filmé séparément regardant vers l'autre.</p>
            <p>Doit respecter la règle des 180° pour maintenir la cohérence spatiale.</p>`,
            example: 'Présent dans 90% des scènes de dialogue au cinéma.'
        },
        // === MONTAGE - THÉORIES ===
        'effet-koulechov': {
            title: 'Effet Koulechov',
            description: `<p>Expérience de Lev Koulechov (années 1920) prouvant que le sens naît du montage, pas des plans isolés.</p>
            <p>Un même visage neutre juxtaposé à différentes images (soupe, cercueil, enfant) est perçu comme exprimant faim, tristesse ou tendresse.</p>
            <p>Démontre que le spectateur <strong>crée le sens</strong> en connectant mentalement les plans.</p>`,
            example: 'Fondement du cinéma soviétique (Eisenstein, Poudovkine).'
        },
        'montage-parallele': {
            title: 'Montage parallèle (Cross-cutting)',
            description: `<p>Alternance entre deux ou plusieurs actions se déroulant simultanément dans des lieux différents.</p>
            <p>Crée la <strong>tension</strong> (course contre la montre), la <strong>comparaison</strong> (riches vs pauvres) ou le <strong>suspense</strong>.</p>
            <p>Inventé par D.W. Griffith, c'est devenu un outil narratif fondamental.</p>`,
            example: 'Le Parrain : baptême + assassinats. Inception : rêves imbriqués.'
        },
        // === MONTAGE - TECHNIQUES ===
        'ellipse': {
            title: 'Ellipse',
            description: `<p>Saut temporel entre deux plans, omettant une partie de l'action jugée non essentielle.</p>
            <p>Permet l'<strong>économie narrative</strong> : on ne montre pas le trajet, la nuit de sommeil, les années qui passent.</p>
            <p>L'ellipse peut être de quelques secondes (sauter une action banale) ou de plusieurs années.</p>`,
            example: '2001 : l os lancé en l air → station spatiale (millions d années).'
        },
        'l-cut-j-cut': {
            title: 'L-Cut / J-Cut',
            description: `<p>Techniques où le son et l'image ne coupent pas au même moment, créant un chevauchement.</p>
            <p><strong>L-Cut</strong> : l'image change mais le son du plan précédent continue. <strong>J-Cut</strong> : le son du plan suivant commence avant l'image.</p>
            <p>Fluidifie les transitions et crée de l'anticipation ou de la continuité émotionnelle.</p>`,
            example: 'Omniprésent dans les dialogues de films modernes.'
        },
        // === MONTAGE - WORKFLOW ===
        'picture-lock': {
            title: 'Picture Lock',
            description: `<p>Moment où le montage image est définitivement validé. Plus aucune modification de durée ou d'ordre des plans.</p>
            <p>Étape <strong>cruciale</strong> car elle déclenche la post-production lourde : étalonnage, VFX, mixage son.</p>
            <p>Après le picture lock, tout changement coûte très cher car il impacte tous les départements.</p>`,
            example: 'Modifier après picture lock peut coûter des milliers d euros.'
        },
        'etalonnage': {
            title: 'Étalonnage (Color Grading)',
            description: `<p>Correction colorimétrique et création du "look" visuel final du film en post-production.</p>
            <p>Deux étapes : <strong>correction primaire</strong> (équilibrer les plans) et <strong>secondaire</strong> (créer l'atmosphère, styliser).</p>
            <p>Peut transformer radicalement l'ambiance : froid/chaud, désaturé, teal & orange, etc.</p>`,
            example: 'Le look orange/teal de Mad Max Fury Road. Le désaturé de Saving Private Ryan.'
        },
        // === SCÉNARIO - STRUCTURE ===
        'structure-3-actes': {
            title: 'Structure en 3 Actes',
            description: `<p>Modèle dramaturgique fondamental divisant le récit en trois parties : Exposition, Confrontation, Résolution.</p>
            <p>Hérité de la <strong>Poétique d'Aristote</strong> (début, milieu, fin), c'est la structure dominante du cinéma narratif classique.</p>
            <p>Proportions classiques : Acte I (25%), Acte II (50%), Acte III (25%).</p>`,
            example: 'Quasi tous les blockbusters suivent ce modèle.'
        },
        'protagoniste': {
            title: 'Protagoniste',
            description: `<p>Personnage principal de l'histoire, celui dont on suit le parcours et à travers lequel le spectateur vit l'aventure.</p>
            <p>Doit avoir un <strong>objectif clair</strong>, des <strong>obstacles</strong> à surmonter et des <strong>enjeux</strong> (ce qu'il risque de perdre).</p>
            <p>Son arc transformationnel (comment il change) est souvent le cœur émotionnel du film.</p>`,
            example: 'Luke Skywalker, Clarice Starling, Woody dans Toy Story.'
        },
        'antagoniste': {
            title: 'Antagoniste',
            description: `<p>Force qui s'oppose au protagoniste et l'empêche d'atteindre son objectif.</p>
            <p>Peut être une <strong>personne</strong> (méchant), une <strong>institution</strong>, la <strong>nature</strong>, la <strong>société</strong> ou le protagoniste <strong>lui-même</strong>.</p>
            <p>Un bon antagoniste croit avoir raison et a ses propres motivations compréhensibles.</p>`,
            example: 'Darth Vader, Hannibal Lecter, le requin dans Les Dents de la Mer.'
        },
        'voyage-heros': {
            title: 'Voyage du Héros',
            description: `<p>Structure narrative universelle en 12 étapes identifiée par Joseph Campbell dans "Le Héros aux mille visages" (1949).</p>
            <p>Décrit le parcours archétypal : départ du monde ordinaire, épreuves dans un monde extraordinaire, retour <strong>transformé</strong>.</p>
            <p>Adapté pour Hollywood par Christopher Vogler, c'est le squelette de nombreux blockbusters.</p>`,
            example: 'Star Wars, Le Seigneur des Anneaux, Matrix, Le Roi Lion.'
        },
        'plot-point': {
            title: 'Plot Point (Point de basculement)',
            description: `<p>Événement majeur qui fait basculer l'histoire dans une nouvelle direction, concept clé du paradigme de Syd Field.</p>
            <p><strong>Plot Point 1</strong> (fin Acte I) : Lance le protagoniste dans l'aventure. <strong>Plot Point 2</strong> (fin Acte II) : Propulse vers le climax.</p>
            <p>Ces moments sont des "portes" : une fois franchies, le protagoniste ne peut plus revenir en arrière.</p>`,
            example: 'Matrix : Neo choisit la pilule rouge (PP1).'
        },
        'midpoint': {
            title: 'Midpoint (Point médian)',
            description: `<p>Moment pivot au centre exact du film (vers la page 60) qui change la dynamique de l'histoire.</p>
            <p>Peut être une <strong>fausse victoire</strong> (tout semble gagné, mais...) ou une <strong>fausse défaite</strong> (tout semble perdu, mais...).</p>
            <p>Souvent le moment où le protagoniste passe de réactif à proactif, ou découvre une vérité importante.</p>`,
            example: 'Titanic : Jack et Rose font l amour (fausse victoire avant le naufrage).'
        },
        'arc-transformationnel': {
            title: 'Arc Transformationnel',
            description: `<p>Évolution intérieure du personnage au cours de l'histoire, sa transformation psychologique ou morale.</p>
            <p>Le personnage commence avec une <strong>croyance limitante</strong> (Lie) née d'une <strong>blessure</strong> (Ghost), et doit découvrir la <strong>vérité</strong> (Truth).</p>
            <p>Ce qu'il VEUT (désir) ≠ ce dont il a BESOIN. Le film réconcilie souvent les deux.</p>`,
            example: 'Scrooge dans A Christmas Carol, Carl dans Là-Haut.'
        },
        // === PRODUCTION - DOCUMENTS ===
        'feuille-service': {
            title: 'Feuille de service',
            description: `<p>Document quotidien distribué la veille à toute l'équipe, détaillant le programme du lendemain.</p>
            <p>Contient : horaires (convocations échelonnées), lieux, scènes tournées, comédiens nécessaires, besoins spéciaux.</p>
            <p>La "bible" de chaque journée. Préparée par le 2ème assistant réalisateur.</p>`,
            example: 'Envoyée chaque soir vers 19h pour le lendemain.'
        },
        'depouillement': {
            title: 'Dépouillement',
            description: `<p>Analyse détaillée du scénario pour lister tous les besoins de chaque scène.</p>
            <p>Répertorie : personnages, figurants, décors, accessoires, costumes, maquillages, véhicules, effets spéciaux...</p>
            <p>Base essentielle pour établir le budget et le plan de travail. Chaque département fait son propre dépouillement.</p>`,
            example: 'Un bon dépouillement évite les mauvaises surprises en tournage.'
        },
        // === PRODUCTION - POSTES ===
        'scripte': {
            title: 'Scripte (Script Supervisor)',
            description: `<p>Garant(e) de la continuité du film : raccords de gestes, positions, accessoires, costumes, maquillage entre les plans.</p>
            <p>Note chaque prise (durée, commentaires, sélection du réalisateur) et rédige le rapport image pour le montage.</p>
            <p>Mémoire vivante du tournage. Travaille en étroite collaboration avec le réalisateur et le monteur.</p>`,
            example: 'Le scripte note tout : verre plein ou vide, main gauche ou droite...'
        },
        'chef-op': {
            title: 'Directeur de la Photographie (Chef Op)',
            description: `<p>Responsable de l'image du film : éclairage, cadrage, choix des optiques, atmosphère visuelle.</p>
            <p>Traduit la vision du réalisateur en lumière. Supervise les équipes caméra et électricité.</p>
            <p>Collaboration créative étroite avec le réalisateur. Peut définir le "look" signature d'un film.</p>`,
            example: 'Roger Deakins (Skyfall, Blade Runner 2049), Emmanuel Lubezki (Gravity).'
        },
        // === PRODUCTION - BUDGET ===
        'above-below-line': {
            title: 'Above / Below the Line',
            description: `<p>Division traditionnelle du budget en deux catégories, séparées par une "ligne" symbolique.</p>
            <p><strong>Above the line</strong> : coûts créatifs (droits, scénario, réalisateur, producteur, acteurs principaux).</p>
            <p><strong>Below the line</strong> : coûts de fabrication (équipe technique, matériel, décors, post-production).</p>`,
            example: 'Un star-système gonflé = Above the line disproportionné.'
        },
        // === RÉALISATION - POINTS DE VUE ===
        'plan-subjectif': {
            title: 'Plan subjectif (POV)',
            description: `<p>La caméra prend la place des yeux d'un personnage. Le spectateur voit exactement ce que le personnage voit.</p>
            <p>Crée une <strong>identification forte</strong> et une immersion totale. Souvent précédé d'un plan sur le personnage qui regarde.</p>
            <p>Peut être troublant si prolongé (vertige, malaise). Utilisé pour les scènes de tension, découverte, poursuite.</p>`,
            example: 'Halloween (Michael Myers), Enter the Void, Strange Days.'
        },
        'plan-objectif': {
            title: 'Plan objectif',
            description: `<p>Point de vue neutre d'un observateur extérieur. La caméra ne représente les yeux d'aucun personnage.</p>
            <p>Position <strong>omnisciente</strong> classique du cinéma narratif. Le spectateur observe la scène comme un témoin invisible.</p>
            <p>Crée une distance analytique, permet de voir ce que les personnages ne voient pas.</p>`,
            example: 'La majorité des plans dans le cinéma classique.'
        },
        'plan-semi-subjectif': {
            title: 'Plan semi-subjectif',
            description: `<p>La caméra est proche d'un personnage, dans son espace, mais ne représente pas exactement ses yeux.</p>
            <p>Souvent <strong>par-dessus l'épaule</strong> (over-the-shoulder). Partage l'expérience sans l'identification totale.</p>
            <p>Compromis entre subjectivité et objectivité. Très utilisé dans les dialogues et scènes d'action.</p>`,
            example: 'Champs/contre-champs avec amorce d épaule.'
        },
        'ligne-180': {
            title: 'Ligne des 180° (Règle)',
            description: `<p>Axe imaginaire entre deux sujets qui ne doit pas être franchi sans transition pour maintenir la cohérence spatiale.</p>
            <p>Si la caméra passe de l'autre côté, les personnages semblent <strong>inverser leurs positions</strong> et le spectateur perd ses repères.</p>
            <p>Peut être franchie volontairement pour créer confusion ou malaise (Kubrick, Ozu).</p>`,
            example: 'Règle fondamentale du découpage classique hollywoodien.'
        },
        'plan-sequence': {
            title: 'Plan-séquence',
            description: `<p>Une scène entière tournée en un seul plan continu, sans aucune coupe de montage.</p>
            <p>Demande une <strong>chorégraphie parfaite</strong> des acteurs, de la caméra et de la technique. Très exigeant mais immersif.</p>
            <p>Crée une tension continue car le spectateur sait qu'il n'y a pas d'échappatoire au temps réel.</p>`,
            image: `<img src="/images/cours/plan-sequence.jpeg" alt="Plan-séquence" class="w-full-r8">`,
            example: 'La Corde (Hitchcock), Birdman, 1917, Copacabana dans Les Affranchis.'
        },
        'blocking': {
            title: 'Blocking (Mise en place)',
            description: `<p>Placement et déplacement des acteurs dans le décor. L'art de raconter l'histoire par les positions et mouvements.</p>
            <p>Un bon blocking <strong>exprime les relations</strong> sans dialogue : distance = froideur, rapprochement = intimité, dos tourné = rejet.</p>
            <p>Le réalisateur "chorégraphie" la scène avant même de placer la caméra.</p>`,
            example: 'David Fincher et ses blocking millimétrés.'
        },
        'staging': {
            title: 'Staging (Mise en cadre)',
            description: `<p>Organisation des éléments visuels dans le cadre pour guider le regard du spectateur.</p>
            <p>Combine <strong>blocking</strong> (acteurs) + <strong>décor</strong> + <strong>lumière</strong> + <strong>profondeur</strong> pour créer une composition signifiante.</p>
            <p>Chaque élément du cadre doit avoir une raison d'être et contribuer à la narration.</p>`,
            example: 'Les compositions géométriques de Wes Anderson.'
        },
        'oner': {
            title: 'Oner (Plan-séquence virtuose)',
            description: `<p>Plan-séquence techniquement complexe, souvent avec mouvements de caméra élaborés et chorégraphie précise.</p>
            <p>Différent du plan-séquence simple par son <strong>ambition technique</strong> et sa durée (parfois plusieurs minutes).</p>
            <p>Peut impliquer grues, steadicam, transitions cachées, coordination de dizaines de figurants.</p>`,
            example: 'Copacabana (Goodfellas), Atonement, 1917, Birdman.'
        },
        'split-focus': {
            title: 'Split Focus (Diopter)',
            description: `<p>Technique optique utilisant une lentille fendue pour avoir deux plans de netteté simultanés.</p>
            <p>Permet de garder nets à la fois un sujet <strong>très proche</strong> et un autre <strong>très éloigné</strong> dans le même plan.</p>
            <p>Signature visuelle de Brian De Palma. Crée une tension entre deux zones d'action.</p>`,
            example: 'Les films de Brian De Palma (Blow Out, Carrie).'
        },
        'camera-epaule': {
            title: 'Caméra épaule (Handheld)',
            description: `<p>Technique où l'opérateur porte la caméra sur l'épaule, créant une image légèrement instable.</p>
            <p>Apporte <strong>urgence, réalisme, immersion documentaire</strong>. Le spectateur ressent la présence physique du filmeur.</p>
            <p>Signature des frères Dardenne, Paul Greengrass. À utiliser avec intention, pas par défaut.</p>`,
            image: `<img src="/images/cours/camera-epaule.jpeg" alt="Caméra épaule" class="w-full-r8">`,
            example: 'La Haine, Bourne Identity, films des Dardenne.'
        },
        'storyboard': {
            title: 'Storyboard',
            description: `<p>Suite de dessins représentant chaque plan du film, comme une bande dessinée du découpage.</p>
            <p>Permet de <strong>visualiser</strong> le film avant le tournage et de communiquer la vision du réalisateur à l'équipe.</p>
            <p>Indispensable pour les scènes complexes (action, VFX). Peut être simple croquis ou très détaillé.</p>`,
            example: 'Hitchcock storyboardait chaque plan. Mad Max Fury Road entièrement dessiné.'
        },
        'reperages': {
            title: 'Repérages (Location Scouting)',
            description: `<p>Recherche et validation des lieux de tournage avant la production.</p>
            <p>Évalue : <strong>esthétique</strong>, lumière naturelle, acoustique, accessibilité, contraintes techniques et légales.</p>
            <p>Le réalisateur, chef op et régisseur visitent ensemble. Photos et vidéos pour préparer le découpage.</p>`,
            example: 'Le Seigneur des Anneaux : 3 ans de repérages en Nouvelle-Zélande.'
        },
        'ligne-30': {
            title: 'Règle des 30°',
            description: `<p>Entre deux plans consécutifs du même sujet, la caméra doit bouger d'au moins 30° pour éviter un jump cut.</p>
            <p>Un changement d'angle insuffisant crée une <strong>saute</strong> visuelle désagréable et désorientante.</p>
            <p>Alternative : changer significativement la valeur de plan (passer de PM à GP par exemple).</p>`,
            example: 'La Nouvelle Vague a volontairement brisé cette règle (À bout de souffle).'
        },
        'headroom': {
            title: 'Headroom (Air au-dessus)',
            description: `<p>Espace entre le haut de la tête du sujet et le bord supérieur du cadre.</p>
            <p><strong>Trop de headroom</strong> = sujet écrasé, perdu. <strong>Pas assez</strong> = sujet étouffé, tête coupée.</p>
            <p>Varie selon la valeur de plan : plus serré = moins de headroom nécessaire.</p>`,
            image: `<img src="/images/cours/headroom.jpeg" alt="Headroom" class="w-full-r8">`,
            example: 'Erreur fréquente des débutants : trop ou pas assez d air.'
        },
        'looking-room': {
            title: 'Looking Room (Regard)',
            description: `<p>Espace laissé devant le regard ou la direction du mouvement d'un sujet.</p>
            <p>Si le personnage regarde à droite, laisser de l'espace à droite. Sinon, il semble <strong>coincé</strong> contre le bord.</p>
            <p>Crée une composition équilibrée et suggère ce que le personnage regarde (hors-champ).</p>`,
            image: `<img src="/images/cours/looking-room.jpeg" alt="Looking Room" class="w-full-r8">`,
            example: 'Règle de base pour les interviews et dialogues.'
        },
        // === SCÉNARIO - ÉLÉMENTS DRAMATIQUES ===
        'enjeu': {
            title: 'Enjeu (Stakes)',
            description: `<p>Ce que le protagoniste risque de <strong>perdre</strong> s'il échoue dans sa quête.</p>
            <p>Plus l'enjeu est élevé (vie, amour, humanité), plus le spectateur est investi émotionnellement.</p>
            <p>Peut être externe (sauver le monde) ou interne (trouver sa place, se pardonner).</p>`,
            example: 'Titanic : l amour et la vie. Le Parrain : l âme de Michael.'
        },
        'conflit': {
            title: 'Conflit',
            description: `<p>Opposition fondamentale qui crée la <strong>tension dramatique</strong> et fait avancer l'histoire.</p>
            <p>Types : Homme vs Homme, Homme vs Nature, Homme vs Société, Homme vs Lui-même, Homme vs Technologie.</p>
            <p>Sans conflit, pas d'histoire. Le conflit révèle le vrai caractère des personnages.</p>`,
            example: 'Les Dents de la Mer : Homme vs Nature. Fight Club : Homme vs Lui-même.'
        },
        // === RÉALISATION - STYLES ===
        'casting': {
            title: 'Casting (Direction de casting)',
            description: `<p>Processus de sélection des comédiens pour les rôles du film.</p>
            <p>Comprend : lecture du scénario, auditions, essais caméra, chemistry reads (alchimie entre acteurs).</p>
            <p>Le directeur de casting propose, le réalisateur et producteur décident. Un bon casting = 90% du travail.</p>`,
            example: 'Heath Ledger choisi pour le Joker malgré les doutes initiaux.'
        },
        'decoupage-classique': {
            title: 'Découpage classique (Hollywood)',
            description: `<p>Méthode de tournage standard : un <strong>master shot</strong> (plan large de toute la scène) + coverage (plans rapprochés).</p>
            <p>Permet un montage fluide et "invisible". Le spectateur ne remarque pas les coupes.</p>
            <p>Sécurité maximale en post-production : toutes les options de montage sont couvertes.</p>`,
            example: 'Standard hollywoodien depuis les années 30.'
        },
        'decoupage-europeen': {
            title: 'Découpage européen',
            description: `<p>Approche privilégiant les <strong>plans longs</strong>, moins de coupes, laissant "respirer" les scènes.</p>
            <p>Fait confiance au jeu des acteurs et à la mise en scène plutôt qu'au montage.</p>
            <p>Moins de coverage, plus de risques, mais authenticité et immersion accrues.</p>`,
            example: 'Bergman, Tarkovski, Haneke, les frères Dardenne.'
        },
        'minimalisme': {
            title: 'Minimalisme cinématographique',
            description: `<p>Économie de moyens : cadres fixes, peu de mouvements, temps réel, peu de musique.</p>
            <p>Laisse l'<strong>espace et le temps</strong> aux spectateurs pour observer et réfléchir.</p>
            <p>Souvent associé au cinéma d'auteur iranien, japonais, ou européen contemplatif.</p>`,
            example: 'Kiarostami, Ozu, Haneke, Tsai Ming-liang.'
        },
        // === IMAGE - OPTIQUES ===
        'focale-normale': {
            title: 'Focale normale (50mm)',
            description: `<p>Objectif dont l'angle de champ est proche de la <strong>vision humaine</strong> (environ 46°).</p>
            <p>Rendu naturel, sans distorsion ni compression. Considérée comme "neutre" et polyvalente.</p>
            <p>La focale de référence, souvent recommandée pour apprendre la composition.</p>`,
            image: `<img src="/images/cours/focale-normale.jpeg" alt="Focale normale" class="w-full-r8">`,
            example: 'Kubrick adorait le 50mm. Idéal pour les portraits naturels.'
        },
        'macro': {
            title: 'Objectif Macro',
            description: `<p>Optique permettant des <strong>très gros plans</strong> sur de petits objets (ratio 1:1 ou plus).</p>
            <p>Révèle des détails invisibles à l'œil nu : textures, insectes, gouttes d'eau, mécanismes.</p>
            <p>Profondeur de champ extrêmement réduite. Demande stabilisation et éclairage précis.</p>`,
            image: `<img src="/images/cours/macro.jpeg" alt="Macro" class="w-full-r8">`,
            example: 'Microcosmos, les inserts de Se7en, Planet Earth.'
        },
        'balance-blancs': {
            title: 'Balance des blancs',
            description: `<p>Réglage de la caméra pour que le <strong>blanc apparaisse neutre</strong> quelle que soit la source lumineuse.</p>
            <p>Compense la température de couleur de la lumière (tungstène = chaud, daylight = froid).</p>
            <p>Peut être réglée manuellement (Kelvin) ou avec des presets (Daylight, Tungsten, Cloudy...).</p>`,
            example: 'Erreur fréquente : peau orange en intérieur tungstène.'
        },
        // === SON - COUCHES SONORES ===
        'silence-cinematographique': {
            title: 'Silence (outil dramatique)',
            description: `<p>Absence volontaire de son, utilisée comme <strong>outil narratif puissant</strong>.</p>
            <p>Crée tension, malaise, suspension. Amplifie l'impact du son qui suit.</p>
            <p>Souvent sous-estimé. Le silence avant un moment fort décuple son effet.</p>`,
            example: 'No Country for Old Men, A Quiet Place, 2001 l Odyssée.'
        },
        // === SCÉNARIO - FORMAT ===
        'entete-scene': {
            title: 'En-tête de scène (Slugline)',
            description: `<p>Première ligne de chaque scène indiquant : <strong>INT./EXT.</strong> (intérieur/extérieur) - <strong>LIEU</strong> - <strong>MOMENT</strong> (JOUR/NUIT).</p>
            <p>Exemple : INT. APPARTEMENT DE MARIE - CUISINE - NUIT</p>
            <p>Permet à l'équipe de production de planifier les décors, l'éclairage et le planning. Toujours en MAJUSCULES.</p>`,
            example: 'Standard universel dans tous les scénarios professionnels.'
        },
        'action-scenario': {
            title: 'Action (Description)',
            description: `<p>Paragraphes décrivant ce qu'on <strong>voit et entend</strong> à l'écran. Toujours au présent, style concis et visuel.</p>
            <p>Éviter : pensées des personnages, explications, adverbes inutiles. Écrire uniquement ce que la caméra peut capter.</p>
            <p>Maximum 4 lignes par paragraphe. Aérer pour faciliter la lecture et le rythme.</p>`,
            example: '"Marie entre. Elle pose ses clés. Regarde le répondeur. Trois messages."'
        },
        'dialogue-scenario': {
            title: 'Dialogue',
            description: `<p>Ce que dit le personnage. Précédé du nom du personnage en MAJUSCULES, centré.</p>
            <p>Un bon dialogue : révèle le caractère, fait avancer l'intrigue, semble naturel mais est travaillé.</p>
            <p>Éviter l'exposition maladroite ("Comme tu sais, nous sommes frères depuis 30 ans...").</p>`,
            example: 'Tarantino, Sorkin et Mamet sont maîtres du dialogue mémorable.'
        },
        'didascalie': {
            title: 'Didascalie (Parenthetical)',
            description: `<p>Indication de jeu entre parenthèses, placée entre le nom du personnage et son dialogue.</p>
            <p>Utilisée avec parcimonie pour : ton particulier (ironique), action pendant le dialogue (versant le café), ou destinataire (à Marie).</p>
            <p>Éviter de surcharger : faire confiance aux acteurs et au réalisateur pour l'interprétation.</p>`,
            example: '(murmurant) ou (sans lever les yeux) ou (à lui-même)'
        },
        // === SCÉNARIO - ARC PERSONNAGE ===
        'ghost': {
            title: 'Ghost (Blessure)',
            description: `<p>Trauma ou événement du passé qui <strong>définit les peurs</strong> et comportements actuels du personnage.</p>
            <p>Souvent révélé progressivement. Explique pourquoi le personnage est "cassé" au début de l'histoire.</p>
            <p>Le climax force généralement le personnage à affronter ce Ghost pour évoluer.</p>`,
            example: 'Bruce Wayne et le meurtre de ses parents. Will Hunting et la maltraitance.'
        },
        'lie': {
            title: 'Lie (Croyance limitante)',
            description: `<p>Ce que le personnage <strong>croit à tort</strong> sur lui-même ou le monde, conséquence du Ghost.</p>
            <p>"Je ne mérite pas d'être aimé", "Le monde est cruel", "Je dois tout contrôler pour survivre".</p>
            <p>L'arc transformationnel consiste à déconstruire cette croyance pour la remplacer par la Vérité.</p>`,
            example: 'Carl (Là-haut) croit que s aventurer seul trahit Ellie.'
        },
        'verite-personnage': {
            title: 'Truth (Vérité)',
            description: `<p>Ce que le personnage doit <strong>apprendre</strong> pour compléter son arc et trouver la paix/réussite.</p>
            <p>Opposée à la Lie. Souvent thématiquement liée au message du film.</p>
            <p>Le personnage l'accepte généralement au climax, ce qui lui permet de triompher (ou de tragiquement échouer s'il la refuse).</p>`,
            example: 'Marlin (Nemo) : "Je dois faire confiance à mon fils et le laisser grandir."'
        },
        'besoin-vs-desir': {
            title: 'Besoin vs Désir (Need vs Want)',
            description: `<p><strong>Désir (Want)</strong> : ce que le personnage poursuit consciemment (objectif externe visible).</p>
            <p><strong>Besoin (Need)</strong> : ce dont il a vraiment besoin pour être complet (souvent inconscient, interne).</p>
            <p>Les meilleures histoires créent une tension entre les deux. Le personnage obtient ce dont il a besoin, pas toujours ce qu'il veut.</p>`,
            example: 'Michael Corleone veut protéger sa famille, mais a besoin de ne pas devenir son père.'
        },
        // === RÉALISATION - DIRECTION D'ACTEURS ===
        'stanislavski': {
            title: 'Méthode Stanislavski',
            description: `<p>Système de jeu développé par Constantin Stanislavski, fondement du jeu moderne.</p>
            <p>Principes clés : <strong>mémoire affective</strong> (puiser dans ses émotions vécues), <strong>objectif</strong> (que veut le personnage ?), <strong>circonstances données</strong> (contexte complet).</p>
            <p>Recherche de la "vérité" du personnage plutôt que la simple imitation externe.</p>`,
            example: 'Base de formation de la plupart des écoles de théâtre mondiales.'
        },
        'actors-studio': {
            title: 'Actors Studio (Méthode)',
            description: `<p>École new-yorkaise fondée en 1947, célèbre pour la "Method Acting" de Lee Strasberg.</p>
            <p>Pousse le Stanislavski plus loin : <strong>immersion totale</strong> dans le personnage, parfois pendant des mois hors plateau.</p>
            <p>Critiquée pour ses excès mais a produit des performances iconiques.</p>`,
            example: 'De Niro (Taxi Driver), Day-Lewis, Brando, Pacino, Hoffman.'
        },
        'meisner': {
            title: 'Technique Meisner',
            description: `<p>Méthode développée par Sanford Meisner, axée sur la <strong>réaction instinctive</strong> et l'écoute du partenaire.</p>
            <p>Exercice clé : la répétition. Deux acteurs répètent une phrase en variant selon les réactions de l'autre.</p>
            <p>Moins d'introspection que Stanislavski, plus d'attention à l'instant présent et au partenaire.</p>`,
            example: 'Robert Duvall, Diane Keaton, Grace Kelly, Tom Cruise.'
        },
        'approche-bresson': {
            title: 'Approche Bresson',
            description: `<p>Philosophie radicale de Robert Bresson : utiliser des "modèles" (non-acteurs) plutôt que des acteurs professionnels.</p>
            <p>Répéter chaque prise jusqu'à <strong>épuisement du jeu conscient</strong>. Ce qui reste est authentique, dépouillé.</p>
            <p>Refus de la psychologie, de l'expressivité. Laisser le montage et le contexte créer l'émotion.</p>`,
            example: 'Pickpocket, Au hasard Balthazar, L Argent.'
        },
        'improvisation-dirigee': {
            title: 'Improvisation dirigée',
            description: `<p>Le réalisateur définit un <strong>cadre</strong> (situation, objectifs, enjeux) mais laisse les acteurs improviser le dialogue et les actions.</p>
            <p>Crée une spontanéité et un naturel impossibles à scénariser. Demande des acteurs très préparés et un réalisateur réactif.</p>
            <p>Le scénario final est parfois écrit après le tournage, à partir des rushes.</p>`,
            example: 'Cassavetes, Mike Leigh, Kechiche, les frères Dardenne.'
        },
        // === IMAGE - COMPOSITION ===
        'lignes-directrices': {
            title: 'Lignes directrices (Leading Lines)',
            description: `<p>Éléments visuels naturels (routes, rampes, regards, architecture) qui <strong>guident l'œil du spectateur</strong> vers le sujet principal.</p>
            <p>Peuvent converger vers un point (perspective), encadrer le sujet, ou créer une dynamique de mouvement.</p>
            <p>Outil fondamental de composition pour contrôler où le spectateur regarde dans le cadre.</p>`,
            example: 'Les couloirs de Kubrick, les rails dans Il était une fois dans l Ouest.'
        },
        // === SON - AVANCÉ ===
        'trans-diegetique': {
            title: 'Son trans-diégétique',
            description: `<p>Son qui <strong>passe d'un état à l'autre</strong> : de diégétique à extra-diégétique ou inversement.</p>
            <p>Exemple : une musique de film (extra-diégétique) qui devient la radio d'une voiture (diégétique), ou l'inverse.</p>
            <p>Crée des transitions élégantes et joue avec la frontière entre le monde du film et sa narration.</p>`,
            example: 'Apocalypse Now : "The End" passe de la bande-son à la radio de l hélico.'
        },
        'sound-metaphor': {
            title: 'Métaphore sonore',
            description: `<p>Son utilisé pour <strong>représenter une idée, une émotion ou un concept</strong> au-delà de sa source réelle.</p>
            <p>Le battement de cœur = tension/peur. Le tic-tac = temps qui presse. Le vent = solitude ou changement.</p>
            <p>Permet d'exprimer l'intériorité des personnages ou les thèmes du film de manière subtile.</p>`,
            example: 'Le battement de cœur révélateur dans The Tell-Tale Heart (Poe).'
        },
        // === SON - COUCHES ET TECHNIQUES ===
        'dialogues-son': {
            title: 'Dialogues',
            description: `<p>Voix des personnages, élément <strong>le plus important</strong> de la bande-son narrative.</p>
            <p>Doivent toujours être intelligibles sauf choix artistique délibéré. Priorité absolue lors de l'enregistrement et du mixage.</p>
            <p>Enregistrés sur le plateau (son direct) et/ou en post-synchronisation (ADR/doublage).</p>`,
            example: 'Un dialogue inaudible = spectateur perdu. Toujours protéger les voix.'
        },
        'musique-film': {
            title: 'Musique de film (Score)',
            description: `<p>Composition originale ou morceaux existants accompagnant l'image pour renforcer l'émotion.</p>
            <p><strong>Score</strong> = musique originale composée pour le film. <strong>Soundtrack</strong> = compilation de morceaux existants.</p>
            <p>Peut être diégétique (radio dans la scène) ou extra-diégétique (que le spectateur entend).</p>`,
            example: 'John Williams (Star Wars), Hans Zimmer (Inception), Ennio Morricone.'
        },
        'multi-pistes': {
            title: 'Enregistrement multi-pistes',
            description: `<p>Chaque source sonore (micro) enregistrée sur une <strong>piste séparée</strong> pour flexibilité au mixage.</p>
            <p>Permet d'ajuster individuellement chaque micro en post : niveau, égalisation, effets.</p>
            <p>Standard professionnel. Enregistreurs 4, 8 ou 16 pistes (Sound Devices, Zoom F8, etc.).</p>`,
            example: 'Un acteur avec cravate + perche = 2 pistes séparées pour choisir au mix.'
        },
        'ms-stereo': {
            title: 'MS (Mid-Side)',
            description: `<p>Configuration stéréo utilisant un micro cardioïde (Mid) et un micro bidirectionnel (Side).</p>
            <p>Avantage : la <strong>largeur stéréo est ajustable en post</strong>-production. Compatible mono parfait.</p>
            <p>Idéal pour les ambiances quand on ne connaît pas encore les besoins du mixage final.</p>`,
            example: 'Technique prisée des preneurs de son documentaire.'
        },
        'boom-vs-lav': {
            title: 'Boom vs Lavallier',
            description: `<p><strong>Perche (boom)</strong> : son naturel, perspective cohérente avec l'image, mais risque d'entrer dans le cadre.</p>
            <p><strong>Cravate (lav)</strong> : sécurité, toujours proche de la source, mais son moins naturel et risque de frottements.</p>
            <p>Idéalement : les deux en même temps pour avoir le choix au mixage.</p>`,
            example: 'Plan large = cravate en sécurité. Plan serré = perche privilégiée.'
        },
        'plant-mic': {
            title: 'Plant mic (Micro planté)',
            description: `<p>Micro <strong>caché dans le décor</strong>, fixe, pour capter le son quand la perche ne peut pas approcher.</p>
            <p>Utilisé pour les plans très larges, les scènes avec mouvement complexe, ou les décors difficiles.</p>
            <p>Placé stratégiquement : dans un bouquet, sous une table, derrière un objet.</p>`,
            example: 'Scène de dîner filmée en plan large avec plusieurs convives.'
        },
        'panning': {
            title: 'Panoramique audio (Panning)',
            description: `<p>Placement d'un son dans l'espace stéréo ou surround, de gauche à droite (et avant/arrière en surround).</p>
            <p>Doit généralement <strong>suivre l'image</strong> : un personnage à gauche de l'écran = voix légèrement à gauche.</p>
            <p>Les dialogues restent souvent centrés pour stabilité, les ambiances et effets sont spatialisés.</p>`,
            example: 'Une voiture traverse l écran : le son passe de gauche à droite.'
        },
        'formats-audio': {
            title: 'Formats audio (Mono/Stéréo/Surround)',
            description: `<p><strong>Mono</strong> : 1 canal, historique, encore utilisé pour dialogues centrés.</p>
            <p><strong>Stéréo (2.0)</strong> : Gauche/Droite, standard minimal TV et web.</p>
            <p><strong>5.1/7.1</strong> : Surround cinéma avec canaux arrière. <strong>Atmos</strong> : son 3D avec canaux au plafond.</p>`,
            example: 'Cinéma = minimum 5.1. Streaming = souvent stéréo avec option 5.1.'
        },
        'lfe': {
            title: 'LFE (Low Frequency Effects)',
            description: `<p>Canal dédié aux <strong>basses fréquences</strong> (20-120 Hz) dans les systèmes surround (le ".1" de 5.1).</p>
            <p>Reproduit par le caisson de basses (subwoofer). Utilisé pour les explosions, impacts, grondements, tension physique.</p>
            <p>Ressenti autant que entendu. Crée une expérience viscérale, physique.</p>`,
            example: 'Les explosions de Nolan, le rugissement du T-Rex dans Jurassic Park.'
        },
        // === MONTAGE - RACCORDS ===
        'raccord-axe': {
            title: 'Raccord dans l\'axe',
            description: `<p>Changement de valeur de plan (PE → PM → GP) en restant sur le <strong>même axe de caméra</strong>.</p>
            <p>Permet de se rapprocher ou s'éloigner du sujet sans changer d'angle, créant une intensification ou un recul émotionnel.</p>
            <p>Doit respecter la règle des 30° implicitement : le changement de valeur doit être suffisamment significatif.</p>`,
            example: 'Les zooms avant de Spielberg sur les visages en réaction.'
        },
        'raccord-mouvement': {
            title: 'Raccord mouvement',
            description: `<p>Coupe effectuée <strong>pendant une action</strong> (un geste, un déplacement) pour fluidifier la transition.</p>
            <p>Le mouvement commencé dans le plan A se poursuit dans le plan B. L'œil suit l'action et "oublie" la coupe.</p>
            <p>Technique fondamentale du montage invisible hollywoodien.</p>`,
            example: 'Un personnage se lève : coupe pendant le mouvement, pas avant ni après.'
        },
        'franchissement-axe': {
            title: 'Franchissement d\'axe',
            description: `<p>Passage de la caméra de l'autre côté de la <strong>ligne des 180°</strong>, inversant les positions apparentes des sujets.</p>
            <p>Généralement considéré comme une erreur désorientante. Mais peut être volontaire pour créer confusion, rupture ou malaise.</p>
            <p>Pour franchir proprement : plan neutre (sur la ligne), plan de coupe, ou mouvement de caméra visible.</p>`,
            example: 'Kubrick franchit volontairement dans Shining pour désorienter.'
        },
        'faux-raccord': {
            title: 'Faux raccord',
            description: `<p>Incohérence visuelle entre deux plans : accessoire qui change de place, niveau de verre différent, lumière incohérente.</p>
            <p>Erreur de <strong>continuité</strong> (script supervisor). Peut sortir le spectateur du film s'il est visible.</p>
            <p>Parfois inévitable (tourné sur plusieurs jours), le monteur essaie de les masquer ou les minimiser.</p>`,
            example: 'Les compilations de "movie mistakes" sur YouTube.'
        },
        // === MONTAGE - THÉORIES ===
        'montage-intellectuel': {
            title: 'Montage intellectuel (Eisenstein)',
            description: `<p>Théorie de Sergei Eisenstein : la <strong>collision</strong> de deux plans crée une idée nouvelle absente des deux.</p>
            <p>Plan A + Plan B = Concept C (thèse + antithèse = synthèse). Le sens émerge du choc, pas des images individuelles.</p>
            <p>Montage comme outil de pensée et d'argumentation, pas seulement de narration.</p>`,
            example: 'La séquence des escaliers d Odessa dans Le Cuirassé Potemkine.'
        },
        'montage-invisible': {
            title: 'Montage invisible (Classique)',
            description: `<p>Style hollywoodien classique où les coupes sont si <strong>fluides</strong> que le spectateur oublie qu'il regarde un film monté.</p>
            <p>Utilise : raccords regard, raccords mouvement, règle des 180°, continuité parfaite. Le montage sert l'histoire, pas lui-même.</p>
            <p>Objectif : immersion totale, suspension d'incrédulité maximale.</p>`,
            example: 'Les films de Spielberg, la plupart des blockbusters modernes.'
        },
        'montage-visible': {
            title: 'Montage visible (Moderne)',
            description: `<p>Style qui <strong>assume et exhibe</strong> les coupes : jump cuts, faux raccords volontaires, ruptures de rythme.</p>
            <p>Rappelle constamment au spectateur qu'il regarde un film. Associé à la Nouvelle Vague, au cinéma d'auteur.</p>
            <p>Peut créer énergie, malaise, modernité ou distanciation brechtienne.</p>`,
            example: 'À bout de souffle (Godard), les films de Wong Kar-wai.'
        },
        // === MONTAGE - MÉTHODES EISENSTEIN ===
        'montage-metrique': {
            title: 'Montage métrique',
            description: `<p>Coupes à <strong>intervalles réguliers</strong>, indépendamment du contenu des plans.</p>
            <p>Crée un rythme mécanique, hypnotique ou oppressant. La durée des plans est mathématiquement déterminée.</p>
            <p>Première des 5 méthodes de montage théorisées par Eisenstein.</p>`,
            example: 'Séquences de tension avec accélération progressive des coupes.'
        },
        'montage-rythmique': {
            title: 'Montage rythmique',
            description: `<p>Coupes dictées par le <strong>mouvement dans le plan</strong>, pas par une durée fixe.</p>
            <p>Le contenu visuel détermine le rythme : action rapide = coupe rapide, contemplation = plan long.</p>
            <p>Plus organique que le montage métrique, suit l'énergie interne des images.</p>`,
            example: 'Les poursuites en voiture, les scènes de combat.'
        },
        'montage-tonal': {
            title: 'Montage tonal',
            description: `<p>Coupes basées sur l'<strong>émotion dominante</strong> du plan : lumière, atmosphère, texture.</p>
            <p>Crée une continuité émotionnelle plutôt que narrative. Les plans "sonnent" ensemble.</p>
            <p>Utilisé pour les séquences poétiques, contemplatives ou expressionnistes.</p>`,
            example: 'Les séquences oniriques, les montages atmosphériques.'
        },
        // === MONTAGE - TECHNIQUES ===
        'montage-alterne': {
            title: 'Montage alterné (Cross-cutting)',
            description: `<p>Alternance entre <strong>deux actions simultanées</strong> dans des lieux différents.</p>
            <p>Crée suspense et tension : "Arrivera-t-il à temps ?" Les deux lignes convergent vers un climax commun.</p>
            <p>Inventé par D.W. Griffith. Outil fondamental du suspense cinématographique.</p>`,
            example: 'Le sauvetage de dernière minute, la course contre la montre.'
        },
        'flashback': {
            title: 'Flashback / Flash-forward',
            description: `<p><strong>Flashback</strong> : retour dans le passé pour révéler information, trauma ou souvenir.</p>
            <p><strong>Flash-forward</strong> : saut dans le futur, plus rare, crée anticipation ou ironie dramatique.</p>
            <p>Signalé visuellement (fondu, couleur différente) ou par le son (écho, musique spécifique).</p>`,
            example: 'Citizen Kane, Memento (structure inversée), Arrival.'
        },
        'sequence-montage': {
            title: 'Séquence de montage',
            description: `<p>Suite de plans courts <strong>condensant le temps</strong> : entraînement, transformation, passage des saisons.</p>
            <p>Souvent accompagnée de musique. Montre une évolution qui prendrait trop de temps en temps réel.</p>
            <p>Cliché quand mal utilisée, puissante quand justifiée narrativement.</p>`,
            example: 'Rocky (entraînement), Scarface (ascension), tout film de sport.'
        },
        'split-screen': {
            title: 'Split screen (Écran divisé)',
            description: `<p>Écran divisé en plusieurs zones montrant des <strong>actions simultanées</strong> visibles en même temps.</p>
            <p>Alternative au montage alterné : le spectateur voit tout sans coupe. Crée comparaison ou tension.</p>
            <p>Peut diviser en 2, 3, 4 zones ou plus. Signature de Brian De Palma.</p>`,
            example: 'Requiem for a Dream, 24 (série TV), Conversations secrètes.'
        },
        'smash-cut': {
            title: 'Smash cut',
            description: `<p>Coupe <strong>brutale et inattendue</strong>, souvent d'une scène calme vers une scène intense (ou l'inverse).</p>
            <p>Crée un effet de choc, de surprise, de rupture. Aucune transition, aucun avertissement.</p>
            <p>Souvent utilisé pour les réveils brutaux, les contrastes comiques ou dramatiques.</p>`,
            example: '"C est impossible !" SMASH CUT vers la scène où c est fait.'
        },
        // === MONTAGE - WORKFLOW ===
        'bout-a-bout': {
            title: 'Bout-à-bout (Assembly)',
            description: `<p>Premier assemblage chronologique des <strong>meilleures prises</strong> retenues.</p>
            <p>Pas encore du montage artistique : juste mettre les scènes dans l'ordre. Peut durer 3-4h pour un film de 2h.</p>
            <p>Permet de voir l'ensemble du matériel et d'identifier les problèmes majeurs.</p>`,
            example: 'Première étape après le dérushage et la synchronisation.'
        },
        'rough-cut': {
            title: 'Ours / Rough cut',
            description: `<p>Premier <strong>montage complet</strong> du film, encore long et imparfait.</p>
            <p>Structure narrative en place, mais rythme pas encore affiné. Contient souvent des scènes qui seront coupées.</p>
            <p>Base de travail pour les retours du réalisateur et des producteurs.</p>`,
            example: 'Généralement 20-30% plus long que le film final.'
        },
        'fine-cut': {
            title: 'Fine cut',
            description: `<p>Montage <strong>affiné</strong> : rythme ajusté, scènes inutiles supprimées, timing précis.</p>
            <p>Le film approche sa durée finale. Les choix majeurs sont faits, on peaufine les détails.</p>
            <p>Précède le picture lock (verrouillage image) après lequel on ne touche plus au montage.</p>`,
            example: 'Étape cruciale où chaque frame compte.'
        },
        // === PRODUCTION - ÉTAPES ===
        'developpement': {
            title: 'Développement',
            description: `<p>Première phase d'un projet : <strong>écriture du scénario</strong>, recherche de financements, montage du projet.</p>
            <p>Peut durer des mois ou des années. Inclut : traitement, versions du script, recherche de producteur, casting préliminaire.</p>
            <p>Phase la plus incertaine : beaucoup de projets ne dépassent jamais ce stade.</p>`,
            example: 'Certains scripts passent 10+ ans en développement avant d être tournés.'
        },
        'pre-production': {
            title: 'Pré-production',
            description: `<p>Phase de <strong>préparation</strong> entre le feu vert et le premier jour de tournage.</p>
            <p>Inclut : découpage technique, storyboard, casting, repérages, constitution de l'équipe, plan de travail, budget détaillé.</p>
            <p>Durée typique : 2-6 mois selon l'ampleur du projet. Une bonne prépa = un tournage serein.</p>`,
            example: '"Un film se gagne ou se perd en pré-production."'
        },
        'production-tournage': {
            title: 'Production (Tournage)',
            description: `<p>Phase de <strong>réalisation effective</strong> : caméra qui tourne, acteurs qui jouent.</p>
            <p>Période la plus intense et la plus coûteuse (équipe complète sur le terrain chaque jour).</p>
            <p>Durée typique : 4-12 semaines pour un long-métrage. Chaque jour de retard coûte très cher.</p>`,
            example: 'On dit "tourner un film" mais le tournage n est qu une phase parmi d autres.'
        },
        'post-production': {
            title: 'Post-production',
            description: `<p>Tout ce qui se passe <strong>après le tournage</strong> : montage, étalonnage, mixage, VFX, musique.</p>
            <p>Souvent plus longue que le tournage lui-même. C'est là que le film prend vraiment forme.</p>
            <p>Durée typique : 3-12 mois selon complexité (VFX lourds = plus long).</p>`,
            example: 'Un film Marvel peut passer 18 mois en post-production pour les VFX.'
        },
        'distribution': {
            title: 'Distribution',
            description: `<p>Phase de <strong>commercialisation</strong> : festivals, ventes internationales, sortie en salles, VOD, TV.</p>
            <p>Le distributeur achète les droits et gère : copies, marketing, programmation, relations presse.</p>
            <p>Un bon film mal distribué peut passer inaperçu. La distribution est cruciale pour le succès.</p>`,
            example: 'Cannes, Venise, Toronto = vitrines pour trouver des distributeurs.'
        },
        // === PRODUCTION - DOCUMENTS ===
        'budget-film': {
            title: 'Budget',
            description: `<p>Estimation détaillée de <strong>tous les coûts</strong> du film, divisée en postes et sous-postes.</p>
            <p><strong>Above the line</strong> : droits, scénario, réalisateur, producteur, acteurs principaux (coûts créatifs).</p>
            <p><strong>Below the line</strong> : équipe technique, matériel, décors, post-production (coûts de fabrication).</p>`,
            example: 'Un budget bien fait prévoit 10% de contingence pour les imprévus.'
        },
        'contrats-film': {
            title: 'Contrats',
            description: `<p>Documents juridiques <strong>encadrant les relations</strong> entre la production et tous les intervenants.</p>
            <p>Types : contrats d'engagement (équipe, acteurs), cession de droits (musique, scénario), accord de coproduction.</p>
            <p>Doivent préciser : rémunération, droits cédés, crédits, durée, territoire, obligations.</p>`,
            example: 'CDDU (intermittents), contrats de cession de droits d auteur.'
        },
        // === PRODUCTION - POSTES CLÉS ===
        'producteur': {
            title: 'Producteur',
            description: `<p>Responsable <strong>global du projet</strong> : financement, supervision créative et logistique.</p>
            <p>Trouve l'argent, engage le réalisateur, supervise la production, prend les décisions stratégiques.</p>
            <p>Plusieurs types : producteur délégué (patron), exécutif (supervise), associé (apporte quelque chose).</p>`,
            example: 'Le producteur a le final cut aux USA, le réalisateur en France (souvent).'
        },
        'directeur-production': {
            title: 'Directeur de production',
            description: `<p>Bras droit du producteur, gère le <strong>budget et la logistique</strong> au quotidien.</p>
            <p>Établit le budget détaillé, négocie les contrats, surveille les dépenses, résout les problèmes concrets.</p>
            <p>Interface entre les besoins artistiques et les contraintes financières.</p>`,
            example: 'C est lui qui dit "on n a pas le budget pour ça" (ou trouve comment l avoir).'
        },
        'premier-assistant': {
            title: '1er Assistant réalisateur',
            description: `<p><strong>Chef d'orchestre du plateau</strong> : gère le planning, le timing, la coordination de toute l'équipe.</p>
            <p>Établit le plan de travail, organise chaque journée, annonce les ordres ("Silence, on tourne !").</p>
            <p>Libère le réalisateur des contraintes logistiques pour qu'il se concentre sur l'artistique.</p>`,
            example: 'Le 1er AD connaît le plan de travail par cœur et anticipe tout.'
        },
        'regisseur': {
            title: 'Régisseur',
            description: `<p>Responsable de la <strong>logistique quotidienne</strong> : lieux, transports, repas, hébergement.</p>
            <p>Négocie les autorisations de tournage, organise les décors, gère les imprévus pratiques.</p>
            <p>Le "couteau suisse" de la production, doit résoudre tous les problèmes concrets.</p>`,
            example: 'Trouver 50 figurants pour demain, un camion de pompiers, et un repas végan.'
        },
        // === IMAGE - FORMAT ===
        'ratio-169': {
            title: 'Format 16:9 (1.78:1)',
            description: `<p>Ratio <strong>standard actuel</strong> pour la télévision HD, le streaming et la plupart des écrans.</p>
            <p>Compromis entre le 4:3 télévisuel historique et le 1.85:1 cinéma. Adopté mondialement depuis les années 2000.</p>
            <p>Format natif des capteurs HD, 4K, des écrans TV et ordinateurs modernes.</p>`,
            example: 'Netflix, YouTube, télévision HD, la majorité du contenu actuel.'
        },
        // === SCÉNARIO - FORMAT ===
        'personnage-scenario': {
            title: 'Personnage (Character cue)',
            description: `<p>Nom du personnage en <strong>MAJUSCULES</strong>, centré, avant chaque réplique de dialogue.</p>
            <p>Première apparition : nom suivi de (âge) et brève description. Ensuite : juste le nom.</p>
            <p>Cohérence obligatoire : toujours le même nom (pas "MARIE" puis "LA FEMME" pour le même personnage).</p>`,
            example: 'MARIE (30 ans, nerveuse, élégante malgré elle) entre dans le café.'
        },
        'sfx': {
            title: 'Effets sonores (SFX)',
            description: `<p>Sons ponctuels synchronisés à l'image : portes, pas, coups, véhicules, explosions.</p>
            <p>Peuvent être <strong>réalistes</strong> (enregistrés) ou <strong>stylisés</strong> (créés pour l'effet dramatique).</p>
            <p>Différent du Foley (bruitage en studio) : SFX = sons pré-enregistrés en bibliothèque ou créés en sound design.</p>`,
            example: 'Le sabre laser de Star Wars (SFX créé par Ben Burtt).'
        },
        'lumiere-naturelle': {
            title: 'Lumière naturelle',
            description: `<p>Utilisation exclusive ou principale du soleil comme source de lumière, sans éclairage artificiel.</p>
            <p>Crée un <strong>réalisme</strong> et une authenticité uniques. Demande une grande maîtrise des horaires et de la météo.</p>
            <p>Signature de Terrence Malick et Emmanuel Lubezki. Contraignant mais résultats organiques.</p>`,
            image: `<img src="/images/cours/lumiere-naturelle.jpeg" alt="Lumière naturelle" class="w-full-r8">`,
            example: 'The Tree of Life, The Revenant, Days of Heaven.'
        },
        'decoupage-technique': {
            title: 'Découpage technique',
            description: `<p>Document détaillant plan par plan comment le scénario sera filmé : valeurs de plan, mouvements, axes.</p>
            <p>Établi par le réalisateur en pré-production, c'est la <strong>partition</strong> du tournage.</p>
            <p>Peut être accompagné d'un storyboard pour visualiser les plans complexes.</p>`,
            example: 'Préparé par le réalisateur avec le 1er assistant.'
        },
        'plan-travail': {
            title: 'Plan de travail',
            description: `<p>Calendrier détaillé du tournage, jour par jour, répartissant les scènes du scénario.</p>
            <p>Optimisé par décor, disponibilité des comédiens, contraintes jour/nuit, météo, difficultés techniques.</p>
            <p>Document évolutif, constamment ajusté par le 1er assistant réalisateur. La colonne vertébrale du tournage.</p>`,
            example: 'On ne tourne JAMAIS dans l ordre du scénario.'
        }
    },
    
    getCourses: () => ({
        scenario: `
            <div class="courses-section">
                <h2>📝 Les Fondamentaux du Scénario</h2>
                
                <h3><span class="notion" data-notion="structure-3-actes">La Structure en 3 Actes</span></h3>
                <p>La structure classique d'un scénario se divise en trois actes :</p>
                <ul>
                    <li><strong>Acte I - L'Exposition (25%)</strong> : Présentation du personnage, de son monde et de l'élément déclencheur qui lance l'histoire.</li>
                    <li><strong>Acte II - La Confrontation (50%)</strong> : Le personnage fait face à des obstacles croissants. Contient le <span class="notion" data-notion="midpoint">point médian</span> et la crise.</li>
                    <li><strong>Acte III - La Résolution (25%)</strong> : Climax et dénouement. Le personnage atteint (ou non) son objectif.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Astuce :</strong> Une page de scénario = environ 1 minute de film. Un long-métrage fait généralement 90-120 pages.
                </div>
                
                <h3>Les Éléments Clés</h3>
                <ul>
                    <li><span class="notion" data-notion="protagoniste">Le protagoniste</span> : Personnage principal avec un objectif clair et des obstacles à surmonter.</li>
                    <li><span class="notion" data-notion="antagoniste">L'antagoniste</span> : Force qui s'oppose au protagoniste (personne, institution, nature, lui-même).</li>
                    <li><span class="notion" data-notion="enjeu">L'enjeu</span> : Ce que le protagoniste risque de perdre s'il échoue.</li>
                    <li><span class="notion" data-notion="conflit">Le conflit</span> : Moteur de l'histoire, crée la tension dramatique.</li>
                </ul>
                
                <h3>Le Format du Scénario</h3>
                <ul>
                    <li><span class="notion" data-notion="entete-scene">En-tête de scène</span> : INT./EXT. - LIEU - MOMENT (ex: INT. APPARTEMENT - JOUR)</li>
                    <li><span class="notion" data-notion="action-scenario">Action</span> : Description au présent, ce qu'on voit et entend.</li>
                    <li><span class="notion" data-notion="personnage-scenario">Personnage</span> : Nom en majuscules centré avant chaque dialogue.</li>
                    <li><span class="notion" data-notion="dialogue-scenario">Dialogue</span> : Ce que dit le personnage.</li>
                    <li><span class="notion" data-notion="didascalie">Didascalie</span> : Indication de jeu entre parenthèses.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Attention :</strong> N'écrivez jamais ce qu'on ne peut pas voir ou entendre (pensées, backstory non montrée).
                </div>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3><span class="notion" data-notion="voyage-heros">Le Voyage du Héros</span> (Joseph Campbell)</h3>
                <p>Théorisé dans <em>"Le Héros aux mille visages"</em> (1949), ce modèle universel décrit le parcours archétypal du héros en 12 étapes :</p>
                <ul>
                    <li><strong>1. Le monde ordinaire</strong> : Le héros dans son quotidien avant l'aventure.</li>
                    <li><strong>2. L'appel de l'aventure</strong> : Un événement perturbe l'équilibre.</li>
                    <li><strong>3. Le refus de l'appel</strong> : Hésitation, peur de l'inconnu.</li>
                    <li><strong>4. La rencontre avec le mentor</strong> : Un guide apporte sagesse ou outils.</li>
                    <li><strong>5. Le passage du premier seuil</strong> : Entrée dans le monde extraordinaire.</li>
                    <li><strong>6. Épreuves, alliés et ennemis</strong> : Apprentissage des nouvelles règles.</li>
                    <li><strong>7. L'approche de la caverne</strong> : Préparation à l'épreuve centrale.</li>
                    <li><strong>8. L'épreuve suprême</strong> : Confrontation avec la plus grande peur.</li>
                    <li><strong>9. La récompense</strong> : Le héros s'empare du trésor.</li>
                    <li><strong>10. Le chemin du retour</strong> : Course-poursuite vers le monde ordinaire.</li>
                    <li><strong>11. La résurrection</strong> : Dernière épreuve, transformation finale.</li>
                    <li><strong>12. Le retour avec l'élixir</strong> : Le héros revient changé avec un don pour les siens.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Application :</strong> Christopher Vogler a adapté ce modèle pour Hollywood dans <em>"The Writer's Journey"</em> (1992), devenu une référence dans les studios.
                </div>
                
                <h3>Le Paradigme de Syd Field</h3>
                <p>Dans <em>"Screenplay"</em> (1979), Syd Field formalise la structure en 3 actes avec des points précis :</p>
                <ul>
                    <li><span class="notion" data-notion="plot-point">Plot Point 1 (page 25-27)</span> : Événement qui fait basculer l'histoire vers l'Acte II.</li>
                    <li><span class="notion" data-notion="midpoint">Midpoint (page 60)</span> : Révélation ou retournement au milieu de l'Acte II.</li>
                    <li><span class="notion" data-notion="plot-point">Plot Point 2 (page 85-90)</span> : Lance le héros vers le climax de l'Acte III.</li>
                </ul>
                
                <h3>Save the Cat! (Blake Snyder)</h3>
                <p><em>"Save the Cat!"</em> (2005) propose une structure ultra-précise en 15 "beats" :</p>
                <ul>
                    <li><strong>Opening Image</strong> (p.1) : Ton et atmosphère du film.</li>
                    <li><strong>Theme Stated</strong> (p.5) : Le thème énoncé (souvent dans un dialogue).</li>
                    <li><strong>Set-Up</strong> (p.1-10) : Présentation du monde et des personnages.</li>
                    <li><strong>Catalyst</strong> (p.12) : L'élément déclencheur.</li>
                    <li><strong>Debate</strong> (p.12-25) : Hésitation du héros.</li>
                    <li><strong>Break into Two</strong> (p.25) : Choix d'entrer dans l'aventure.</li>
                    <li><strong>B Story</strong> (p.30) : Histoire secondaire (souvent l'amour).</li>
                    <li><strong>Fun and Games</strong> (p.30-55) : La "promesse du pitch".</li>
                    <li><strong>Midpoint</strong> (p.55) : Fausse victoire ou fausse défaite.</li>
                    <li><strong>Bad Guys Close In</strong> (p.55-75) : Pression croissante.</li>
                    <li><strong>All Is Lost</strong> (p.75) : Le point le plus bas.</li>
                    <li><strong>Dark Night of the Soul</strong> (p.75-85) : Désespoir avant la renaissance.</li>
                    <li><strong>Break into Three</strong> (p.85) : Solution trouvée.</li>
                    <li><strong>Finale</strong> (p.85-110) : Exécution du plan, climax.</li>
                    <li><strong>Final Image</strong> (p.110) : Miroir de l'image d'ouverture, preuve du changement.</li>
                </ul>
                
                <h3><span class="notion" data-notion="arc-transformationnel">L'Arc Transformationnel</span> du Personnage</h3>
                <p>Un personnage mémorable subit une transformation intérieure :</p>
                <ul>
                    <li><span class="notion" data-notion="ghost">La Blessure (Ghost)</span> : Trauma du passé qui définit ses peurs.</li>
                    <li><span class="notion" data-notion="lie">La Croyance limitante (Lie)</span> : Ce que le personnage croit à tort.</li>
                    <li><span class="notion" data-notion="besoin-vs-desir">Le Besoin vs le Désir</span> : Ce qu'il veut ≠ ce dont il a vraiment besoin.</li>
                    <li><span class="notion" data-notion="verite-personnage">La Vérité (Truth)</span> : Ce qu'il doit apprendre pour évoluer.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Attention :</strong> Certains films utilisent des arcs "négatifs" (le personnage empire) ou "plats" (il reste fidèle à ses valeurs malgré tout). Ces variations sont volontaires et puissantes.
                </div>
                
                <h3>Théories Alternatives</h3>
                <ul>
                    <li><strong>Structure en 4 Actes</strong> (Kristin Thompson) : Divise l'Acte II en deux parties distinctes.</li>
                    <li><strong>Séquences de 8</strong> (Frank Daniel) : 8 séquences de 12-15 minutes chacune.</li>
                    <li><strong>Story Circle</strong> (Dan Harmon) : Version simplifiée du voyage du héros en 8 étapes.</li>
                    <li><strong>Kishotenketsu</strong> : Structure japonaise en 4 parties sans conflit central.</li>
                    <li><strong>Anti-structure</strong> (Robert McKee) : Films d'auteur qui déconstruisent les conventions.</li>
                </ul>
                
                <h3>📚 Ouvrages de Référence</h3>
                <ul>
                    <li><strong>"Story"</strong> - Robert McKee (1997) : La bible de la narration, analyse approfondie des principes dramatiques.</li>
                    <li><strong>"Screenplay"</strong> - Syd Field (1979) : Le livre fondateur de la structure moderne.</li>
                    <li><strong>"Save the Cat!"</strong> - Blake Snyder (2005) : Approche pragmatique et commerciale.</li>
                    <li><strong>"The Writer's Journey"</strong> - Christopher Vogler (1992) : Adaptation du voyage du héros.</li>
                    <li><strong>"Into the Woods"</strong> - John Yorke (2013) : Pourquoi les histoires fonctionnent.</li>
                    <li><strong>"L'anatomie du scénario"</strong> - John Truby (2010) : 22 étapes pour une histoire organique.</li>
                    <li><strong>"Le Héros aux mille visages"</strong> - Joseph Campbell (1949) : L'œuvre mythologique originelle.</li>
                    <li><strong>"Poétique"</strong> - Aristote (~335 av. J.-C.) : Les fondements millénaires de la dramaturgie.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Conseil :</strong> Étudiez ces théories, puis oubliez-les en écrivant. Elles servent à analyser et réécrire, pas à brider la créativité du premier jet.
                </div>
            </div>
        `,
        
        realisation: `
            <div class="courses-section">
                <h2>🎬 Les Bases de la Réalisation</h2>
                
                <h3>La Préparation (Pré-production)</h3>
                <ul>
                    <li><span class="notion" data-notion="decoupage-technique">Découpage technique</span> : Transformer le scénario en plans à tourner.</li>
                    <li><span class="notion" data-notion="storyboard">Storyboard</span> : Dessiner chaque plan pour visualiser le film.</li>
                    <li><span class="notion" data-notion="reperages">Repérages</span> : Trouver et valider les lieux de tournage.</li>
                    <li><span class="notion" data-notion="casting">Casting</span> : Sélectionner les comédiens.</li>
                    <li><span class="notion" data-notion="plan-travail">Plan de travail</span> : Organiser les journées de tournage.</li>
                </ul>
                
                <h3>Les Valeurs de Plan</h3>
                <ul>
                    <li><span class="notion" data-notion="plan-ensemble">Plan d'ensemble (PE)</span> : Situe l'action dans un décor large.</li>
                    <li><span class="notion" data-notion="plan-large">Plan large (PL)</span> : Montre les personnages en pied dans leur environnement.</li>
                    <li><span class="notion" data-notion="plan-moyen">Plan moyen (PM)</span> : Personnage cadré à mi-cuisse.</li>
                    <li><span class="notion" data-notion="plan-americain">Plan américain (PA)</span> : Personnage cadré au niveau des genoux.</li>
                    <li><span class="notion" data-notion="plan-rapproche">Plan rapproché (PR)</span> : Cadré à la poitrine ou aux épaules.</li>
                    <li><span class="notion" data-notion="gros-plan">Gros plan (GP)</span> : Visage ou objet en entier.</li>
                    <li><span class="notion" data-notion="tres-gros-plan">Très gros plan (TGP)</span> : Détail (œil, main, objet).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Règle des 180°</strong> : Imaginez une ligne entre deux personnages. Restez toujours du même côté pour maintenir la cohérence spatiale.
                </div>
                
                <h3>Diriger les Comédiens</h3>
                <ul>
                    <li>Donnez des <strong>objectifs</strong> plutôt que des émotions ("tu veux le convaincre" vs "sois triste").</li>
                    <li>Créez un <strong>climat de confiance</strong> sur le plateau.</li>
                    <li>Faites des <strong>répétitions</strong> avant le tournage.</li>
                    <li>Laissez les acteurs <strong>proposer</strong> et ajustez.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>La Grammaire Cinématographique</h3>
                <p>Chaque choix de plan est un mot, chaque séquence une phrase. Le réalisateur construit un langage visuel :</p>
                <ul>
                    <li><span class="notion" data-notion="plan-subjectif">Plan subjectif (POV)</span> : La caméra devient les yeux du personnage. Crée identification et immersion.</li>
                    <li><span class="notion" data-notion="plan-objectif">Plan objectif</span> : Point de vue neutre, observateur extérieur.</li>
                    <li><span class="notion" data-notion="plan-semi-subjectif">Plan semi-subjectif</span> : Caméra proche du personnage, partage son espace sans être ses yeux.</li>
                    <li><span class="notion" data-notion="plongee">Plongée</span> : Caméra au-dessus du sujet. Écrase, diminue, rend vulnérable.</li>
                    <li><span class="notion" data-notion="contre-plongee">Contre-plongée</span> : Caméra en dessous. Grandit, héroïse, menace.</li>
                    <li><span class="notion" data-notion="dutch-angle">Dutch angle</span> : Caméra inclinée. Malaise, déséquilibre, folie.</li>
                </ul>
                
                <h3>Les Axes de Regard et la Géographie</h3>
                <ul>
                    <li><span class="notion" data-notion="ligne-180">Ligne des 180°</span> : Axe imaginaire entre deux sujets. Ne jamais la franchir sans transition.</li>
                    <li><span class="notion" data-notion="ligne-30">Ligne des 30°</span> : Entre deux plans, changez au minimum de 30° pour éviter le jump cut.</li>
                    <li><span class="notion" data-notion="raccord-regard">Raccord regard</span> : Si A regarde à droite, B doit regarder à gauche au plan suivant.</li>
                    <li><span class="notion" data-notion="champ-contrechamp">Champ/Contre-champ</span> : Alterner entre deux points de vue opposés (dialogue).</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Franchissement volontaire :</strong> Certains réalisateurs franchissent la ligne intentionnellement pour créer confusion ou rupture (ex: Kubrick dans Shining).
                </div>
                
                <h3>Les Techniques de Mise en Scène</h3>
                <ul>
                    <li><span class="notion" data-notion="blocking">Blocking</span> : Placement et déplacement des acteurs dans le décor. Un bon blocking raconte sans dialogue.</li>
                    <li><span class="notion" data-notion="staging">Staging</span> : Organisation des éléments dans le cadre pour guider le regard.</li>
                    <li><span class="notion" data-notion="plan-sequence">Plan-séquence</span> : Toute une scène en un seul plan. Demande chorégraphie parfaite.</li>
                    <li><span class="notion" data-notion="oner">Oner</span> : Plan-séquence virtuose souvent en travelling complexe.</li>
                    <li><span class="notion" data-notion="split-focus">Split focus (diopter)</span> : Deux plans de netteté simultanés (De Palma).</li>
                </ul>
                
                <h3>Styles et Approches de Réalisation</h3>
                <ul>
                    <li><span class="notion" data-notion="decoupage-classique">Découpage classique (Hollywood)</span> : Master shot + coverage. Montage fluide, invisible.</li>
                    <li><span class="notion" data-notion="decoupage-europeen">Découpage européen</span> : Plans plus longs, moins de coupes, respiration.</li>
                    <li><span class="notion" data-notion="camera-epaule">Caméra-épaule</span> : Immersion documentaire, urgence, réalisme (Dardenne, Greengrass).</li>
                    <li><span class="notion" data-notion="steadicam">Steadicam</span> : Fluidité onirique, exploration spatiale (Kubrick, Scorsese).</li>
                    <li><span class="notion" data-notion="oner">Style "oner"</span> : Tout ou partie du film en faux plan-séquence (Birdman, 1917).</li>
                    <li><span class="notion" data-notion="minimalisme">Minimalisme</span> : Économie de moyens, cadres fixes, temps réel (Kiarostami, Haneke).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Citation :</strong> "Un film se fait trois fois : à lécriture, au tournage et au montage." - Robert Bresson
                </div>
                
                <h3>Direction dActeurs : Méthodes Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="stanislavski">Méthode Stanislavski</span> : Recherche de la vérité émotionnelle, mémoire affective.</li>
                    <li><span class="notion" data-notion="actors-studio">Actors Studio (Lee Strasberg)</span> : Immersion totale dans le personnage.</li>
                    <li><span class="notion" data-notion="meisner">Technique Meisner</span> : Réaction instinctive, écoute du partenaire.</li>
                    <li><span class="notion" data-notion="approche-bresson">Approche Bresson</span> : "Modèles" non-acteurs, répétition jusquà épuisement du jeu.</li>
                    <li><span class="notion" data-notion="improvisation-dirigee">Improvisation dirigée</span> : Cadre défini, liberté dans lexécution (Cassavetes, Leigh).</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Hitchcock/Truffaut"</strong> - François Truffaut (1966) : Masterclass du maître du suspense.</li>
                    <li><strong>"Notes sur le cinématographe"</strong> - Robert Bresson (1975) : Aphorismes dun puriste.</li>
                    <li><strong>"Faire un film"</strong> - Sidney Lumet (1995) : Guide pratique dun vétéran.</li>
                    <li><strong>"In the Blink of an Eye"</strong> - Walter Murch (2001) : Réflexions sur le montage.</li>
                    <li><strong>"Rebel Without a Crew"</strong> - Robert Rodriguez (1995) : Cinéma guérilla et débrouille.</li>
                    <li><strong>"On Directing Film"</strong> - David Mamet (1991) : Approche minimaliste et efficace.</li>
                    <li><strong>"Le Plaisir des yeux"</strong> - François Truffaut : Écrits sur le cinéma.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Mise en Scène)</h3>
                <ul>
                    <li><strong>Citizen Kane</strong> (Welles, 1941) : Profondeur de champ, plongées, narration éclatée.</li>
                    <li><strong>Vertigo</strong> (Hitchcock, 1958) : Effet vertigo (zoom/travelling opposés), obsession visuelle.</li>
                    <li><strong>Les Affranchis</strong> (Scorsese, 1990) : Steadicam légendaire du Copacabana.</li>
                    <li><strong>Oldboy</strong> (Park Chan-wook, 2003) : Plan-séquence de combat latéral.</li>
                    <li><strong>Children of Men</strong> (Cuarón, 2006) : Longs plans-séquences immersifs.</li>
                    <li><strong>Birdman</strong> (Iñárritu, 2014) : Faux plan-séquence intégral.</li>
                </ul>
            </div>
        `,
        
        image: `
            <div class="courses-section">
                <h2>📷 L'Image Cinématographique</h2>
                
                <h3>La Composition</h3>
                <ul>
                    <li><span class="notion" data-notion="regle-tiers">Règle des tiers</span> : Placez les éléments importants sur les intersections d'une grille 3×3.</li>
                    <li><span class="notion" data-notion="lignes-directrices">Lignes directrices</span> : Utilisez les lignes naturelles pour guider le regard.</li>
                    <li><span class="notion" data-notion="profondeur-champ">Profondeur de champ</span> : Jouez avec le flou pour isoler le sujet.</li>
                    <li><span class="notion" data-notion="headroom">Headroom</span> : Espace au-dessus de la tête du sujet.</li>
                    <li><span class="notion" data-notion="looking-room">Looking room</span> : Espace devant le regard du personnage.</li>
                </ul>
                
                <h3>L'Éclairage - Le Triangle de Base</h3>
                <ul>
                    <li><span class="notion" data-notion="key-light">Key Light (lumière principale)</span> : Source principale, définit les ombres.</li>
                    <li><span class="notion" data-notion="fill-light">Fill Light (lumière de remplissage)</span> : Adoucit les ombres créées par la key.</li>
                    <li><span class="notion" data-notion="back-light">Back Light (contre-jour)</span> : Sépare le sujet du fond, crée du relief.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Ratio d'éclairage :</strong> Pour un look naturel, la fill light est 2 stops en dessous de la key. Pour un look dramatique, augmentez l'écart.
                </div>
                
                <h3>Les Mouvements de Caméra</h3>
                <ul>
                    <li><span class="notion" data-notion="panoramique">Panoramique</span> : Rotation horizontale ou verticale sur pied fixe.</li>
                    <li><span class="notion" data-notion="travelling">Travelling</span> : Déplacement physique de la caméra (avant, arrière, latéral).</li>
                    <li><span class="notion" data-notion="zoom">Zoom</span> : Changement de focale (différent du travelling !).</li>
                    <li><span class="notion" data-notion="steadicam">Steadicam</span> : Travelling fluide avec harnais stabilisateur.</li>
                    <li><span class="notion" data-notion="grue-jib">Grue/Jib</span> : Mouvements verticaux amples.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Les Optiques et Leurs Effets</h3>
                <ul>
                    <li><span class="notion" data-notion="focale-courte">Focale courte (grand-angle, 16-35mm)</span> : Exagère les perspectives, déforme les bords, agrandit les espaces. Idéal pour oppression ou immensité.</li>
                    <li><span class="notion" data-notion="focale-normale">Focale normale (50mm)</span> : Proche de la vision humaine, naturelle et neutre.</li>
                    <li><span class="notion" data-notion="focale-longue">Focale longue (85-200mm)</span> : Compresse les distances, isole le sujet, flou darrière-plan prononcé. Portrait, intimité.</li>
                    <li><span class="notion" data-notion="anamorphique">Objectifs anamorphiques</span> : Ratio 2.39:1, flares horizontaux caractéristiques, bokeh ovale. Look "cinéma".</li>
                    <li><span class="notion" data-notion="macro">Macro</span> : Très gros plans sur petits objets (insectes, textures).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Astuce focale :</strong> Spielberg utilise souvent des focales courtes près des visages pour créer malaise. Kubrick préférait les focales très courtes (9.8mm dans Barry Lyndon).
                </div>
                
                <h3>Techniques dÉclairage Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="high-key">High-key</span> : Éclairage uniforme, peu dombres. Comédies, sitcoms, publicité.</li>
                    <li><span class="notion" data-notion="low-key">Low-key</span> : Forts contrastes, ombres marquées. Film noir, thriller, horreur.</li>
                    <li><span class="notion" data-notion="chiaroscuro">Chiaroscuro</span> : Clair-obscur inspiré de la peinture (Caravage). Drame intense.</li>
                    <li><span class="notion" data-notion="rembrandt-lighting">Rembrandt lighting</span> : Triangle de lumière sous un œil. Portrait classique.</li>
                    <li><span class="notion" data-notion="lumiere-pratique">Lumière pratique</span> : Sources visibles à lécran (lampes, bougies, écrans).</li>
                    <li><span class="notion" data-notion="lumiere-naturelle">Lumière naturelle</span> : Utilisation exclusive du soleil (Malick, Lubezki).</li>
                    <li><span class="notion" data-notion="magic-hour">Magic hour</span> : Tournage à laube ou au crépuscule pour lumière dorée.</li>
                </ul>
                
                <h3>La Colorimétrie</h3>
                <ul>
                    <li><span class="notion" data-notion="temperature-couleur">Température de couleur</span> : Kelvin (K). 3200K = tungstène chaud, 5600K = lumière du jour.</li>
                    <li><span class="notion" data-notion="balance-blancs">Balance des blancs</span> : Calibrer la caméra pour que le blanc soit neutre.</li>
                    <li><span class="notion" data-notion="lut">LUT (Look-Up Table)</span> : Préréglage de correction colorimétrique.</li>
                    <li><span class="notion" data-notion="log-raw">LOG / RAW</span> : Profils plats qui conservent maximum dinformations pour létalonnage.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Mélange de sources :</strong> Attention aux mélanges tungstène/daylight non voulus. Utilisez des gélatines (CTO/CTB) pour harmoniser.
                </div>
                
                <h3>Formats et Ratios dImage</h3>
                <ul>
                    <li><span class="notion" data-notion="ratio-43">1.33:1 (4:3)</span> : Format classique, télévision ancienne, intimiste.</li>
                    <li><span class="notion" data-notion="ratio-185">1.85:1</span> : Standard cinéma américain.</li>
                    <li><span class="notion" data-notion="ratio-scope">2.39:1 (Scope)</span> : Cinémascope, épique, paysages.</li>
                    <li><span class="notion" data-notion="ratio-169">16:9 (1.78:1)</span> : Standard HD/TV actuel.</li>
                    <li><span class="notion" data-notion="ratio-imax">IMAX (1.43:1)</span> : Format géant immersif.</li>
                </ul>
                
                <h3>Le Cadre comme Outil Narratif</h3>
                <ul>
                    <li><span class="notion" data-notion="cadre-ferme">Cadre fermé</span> : Éléments qui emprisonnent (portes, fenêtres). Oppression.</li>
                    <li><span class="notion" data-notion="cadre-ouvert">Cadre ouvert</span> : Espace libre, personnage peut sortir du champ. Liberté.</li>
                    <li><span class="notion" data-notion="surcadrage">Surcadrage</span> : Cadre dans le cadre (miroir, écran, porte). Mise en abyme.</li>
                    <li><span class="notion" data-notion="amorce">Amorce</span> : Élément flou au premier plan. Profondeur, voyeurisme.</li>
                    <li><span class="notion" data-notion="hors-champ">Hors-champ</span> : Ce quon ne voit pas mais devine. Suggestion puissante.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Painting with Light"</strong> - John Alton (1949) : Bible de léclairage hollywoodien.</li>
                    <li><strong>"Cinematography: Theory and Practice"</strong> - Blain Brown : Manuel technique complet.</li>
                    <li><strong>"Masters of Light"</strong> - Dennis Schaefer : Interviews de grands directeurs photo.</li>
                    <li><strong>"FilmCraft: Cinematography"</strong> - Mike Goodridge : Témoignages contemporains.</li>
                    <li><strong>"The Visual Story"</strong> - Bruce Block : Narration visuelle et composition.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Direction Photo)</h3>
                <ul>
                    <li><strong>Blade Runner</strong> (Jordan Cronenweth, 1982) : Néons, fumée, low-key futuriste.</li>
                    <li><strong>Barry Lyndon</strong> (John Alcott, 1975) : Éclairage à la bougie, lumière naturelle.</li>
                    <li><strong>The Revenant</strong> (Emmanuel Lubezki, 2015) : Lumière naturelle exclusive.</li>
                    <li><strong>In the Mood for Love</strong> (Christopher Doyle, 2000) : Couleurs saturées, surcadrages.</li>
                    <li><strong>Skyfall</strong> (Roger Deakins, 2012) : Silhouettes, contre-jours, couleurs symboliques.</li>
                    <li><strong>Amélie Poulain</strong> (Bruno Delbonnel, 2001) : Palette verte/rouge distinctive.</li>
                </ul>
            </div>
        `,
        
        son: `
            <div class="courses-section">
                <h2>🎤 La Prise de Son</h2>
                
                <h3>Les Types de Microphones</h3>
                <ul>
                    <li><span class="notion" data-notion="micro-canon">Canon (shotgun)</span> : Directionnel, idéal pour isoler une source. Utilisé sur perche.</li>
                    <li><span class="notion" data-notion="micro-cravate">Cravate (lavalier)</span> : Micro miniature fixé sur le comédien. Discret mais risque de frottements.</li>
                    <li><span class="notion" data-notion="micro-omni">Omnidirectionnel</span> : Capte dans toutes les directions. Bon pour les ambiances.</li>
                </ul>
                
                <h3>Règles de Base</h3>
                <ul>
                    <li><strong>Proximité</strong> : Plus le micro est proche, meilleur est le son (sans entrer dans le cadre !).</li>
                    <li><strong>Orientation</strong> : Le micro canon doit pointer vers la bouche de l'acteur.</li>
                    <li><strong>Ambiance</strong> : Toujours enregistrer 1-2 min de "silence" de chaque lieu.</li>
                    <li><strong>Son témoin</strong> : Le son de la caméra sert uniquement à la synchronisation.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Ennemis du son :</strong> Climatisation, frigos, néons, avions, circulation, vent, vêtements synthétiques.
                </div>
                
                <h3>Les Niveaux</h3>
                <ul>
                    <li>Dialogues : viser <strong>-12 dB à -6 dB</strong> en crête.</li>
                    <li>Ne jamais dépasser <strong>0 dB</strong> (saturation = irrécupérable).</li>
                    <li>Toujours surveiller au <strong>casque</strong> pendant l'enregistrement.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Les Couches Sonores dun Film</h3>
                <p>Le son au cinéma se compose de plusieurs éléments superposés :</p>
                <ul>
                    <li><span class="notion" data-notion="dialogues-son">Dialogues</span> : Voix des personnages, élément principal à protéger.</li>
                    <li><span class="notion" data-notion="ambiance-son">Ambiances</span> : Son continu dun lieu (ville, forêt, intérieur). Crée lespace.</li>
                    <li><span class="notion" data-notion="sfx">Effets sonores (SFX)</span> : Sons ponctuels synchronisés (portes, pas, objets).</li>
                    <li><span class="notion" data-notion="foley">Foley</span> : Bruitages recréés en studio (pas, vêtements, manipulations).</li>
                    <li><span class="notion" data-notion="musique-film">Musique</span> : Score original ou morceaux existants.</li>
                    <li><span class="notion" data-notion="silence-cinematographique">Silence</span> : Outil dramatique puissant, souvent sous-estimé.</li>
                </ul>
                
                <h3>Son Diégétique vs Extra-diégétique</h3>
                <ul>
                    <li><span class="notion" data-notion="son-diegetique">Diégétique</span> : Source sonore présente dans lunivers du film (radio, musicien à lécran).</li>
                    <li><span class="notion" data-notion="son-extra-diegetique">Extra-diégétique</span> : Son ajouté que les personnages nentendent pas (musique de film, voix-off).</li>
                    <li><span class="notion" data-notion="meta-diegetique">Meta-diégétique</span> : Son subjectif (acouphène, battement de cœur, souvenir sonore).</li>
                    <li><span class="notion" data-notion="trans-diegetique">Trans-diégétique</span> : Passage dun état à lautre (musique qui devient diégétique).</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Exemple :</strong> Dans Apocalypse Now, "The End" des Doors passe de musique extra-diégétique à la radio de lhélicoptère (diégétique).
                </div>
                
                <h3>Techniques de Prise de Son Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="double-systeme">Double système</span> : Enregistrement séparé caméra/enregistreur. Qualité professionnelle.</li>
                    <li><span class="notion" data-notion="multi-pistes">Multi-pistes</span> : Chaque micro sur une piste séparée pour flexibilité au mixage.</li>
                    <li><span class="notion" data-notion="ms-stereo">MS (Mid-Side)</span> : Configuration stéréo avec contrôle de largeur en post.</li>
                    <li><span class="notion" data-notion="boom-vs-lav">Boom vs Lav</span> : Perche = naturel mais risqué / Cravate = sécurité mais moins naturel.</li>
                    <li><span class="notion" data-notion="plant-mic">Plant mic</span> : Micro caché dans le décor pour plans larges.</li>
                    <li><span class="notion" data-notion="wild-tracks">Wild tracks</span> : Enregistrements sonores sans image (ambiances, effets).</li>
                </ul>
                
                <h3>Le Sound Design</h3>
                <ul>
                    <li><span class="notion" data-notion="worldizing">Worldizing</span> : Rejouer un son dans un espace réel et le réenregistrer (Walter Murch).</li>
                    <li><span class="notion" data-notion="layering">Layering</span> : Superposer plusieurs sons pour en créer un nouveau.</li>
                    <li><span class="notion" data-notion="pitch-shifting">Pitch shifting</span> : Modifier la hauteur (ralentir un cri animal = monstre).</li>
                    <li><span class="notion" data-notion="sound-metaphor">Sound metaphor</span> : Son qui représente une idée (battement = tension).</li>
                    <li><span class="notion" data-notion="leitmotiv-sonore">Leitmotiv sonore</span> : Son récurrent associé à un personnage ou thème.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Piège fréquent :</strong> Trop de musique tue lémotion. Le silence avant un moment fort amplifie limpact.
                </div>
                
                <h3>Le Mixage - Équilibrer les Éléments</h3>
                <ul>
                    <li><span class="notion" data-notion="dialogues-son">Priorité dialogues</span> : Toujours intelligibles sauf choix artistique.</li>
                    <li><span class="notion" data-notion="ducking">Ducking</span> : Baisser automatiquement la musique sous les dialogues.</li>
                    <li><span class="notion" data-notion="panning">Panoramique (panning)</span> : Placer les sons dans lespace stéréo/surround.</li>
                    <li><span class="notion" data-notion="lfe">LFE (caisson de basses)</span> : Canal dédié aux basses fréquences (explosions, impacts).</li>
                    <li><span class="notion" data-notion="stems">Stems</span> : Groupes séparés (DX, MX, FX) pour versions internationales.</li>
                </ul>
                
                <h3>Formats Audio au Cinéma</h3>
                <ul>
                    <li><span class="notion" data-notion="formats-audio">Mono</span> : Un seul canal. Historique.</li>
                    <li><span class="notion" data-notion="formats-audio">Stéréo (2.0)</span> : Gauche/Droite. Standard minimal.</li>
                    <li><span class="notion" data-notion="surround-51">5.1 Surround</span> : 5 canaux + 1 LFE. Standard cinéma actuel.</li>
                    <li><span class="notion" data-notion="formats-audio">7.1</span> : Ajout de surrounds latéraux.</li>
                    <li><span class="notion" data-notion="dolby-atmos">Dolby Atmos</span> : Son objet, placement 3D précis, plafond.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Sound Design"</strong> - David Sonnenschein : Théorie et pratique du design sonore.</li>
                    <li><strong>"The Filmmaker Handbook"</strong> - Ascher & Pincus : Chapitre son très complet.</li>
                    <li><strong>"Audio-Vision"</strong> - Michel Chion (1990) : Théorie du son au cinéma, référence académique.</li>
                    <li><strong>"Sound for Film and Television"</strong> - Tomlinson Holman : Manuel technique.</li>
                    <li><strong>"Practical Art of Motion Picture Sound"</strong> - David Yewdall : Expérience de terrain.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Sound Design)</h3>
                <ul>
                    <li><strong>Apocalypse Now</strong> (Walter Murch, 1979) : Révolution du sound design, premier 5.1.</li>
                    <li><strong>Gravity</strong> (Glenn Freemantle, 2013) : Son dans le vide, vibrations par contact.</li>
                    <li><strong>A Quiet Place</strong> (2018) : Le silence comme tension, son subjectif.</li>
                    <li><strong>No Country for Old Men</strong> (Skip Lievsay, 2007) : Absence quasi-totale de musique.</li>
                    <li><strong>WALL-E</strong> (Ben Burtt, 2008) : Personnages définis par leurs sons.</li>
                    <li><strong>Dunkirk</strong> (Richard King, 2017) : Son immersif, Shepard tone.</li>
                </ul>
            </div>
        `,
        
        montage: `
            <div class="courses-section">
                <h2>✂️ Le Montage</h2>
                
                <h3>Les Types de Raccords</h3>
                <ul>
                    <li><span class="notion" data-notion="raccord-axe">Raccord dans l'axe</span> : Changement de valeur sur le même axe (PE → GP).</li>
                    <li><span class="notion" data-notion="raccord-regard">Raccord regard</span> : On montre ce que voit le personnage.</li>
                    <li><span class="notion" data-notion="raccord-mouvement">Raccord mouvement</span> : Coupe pendant une action pour fluidifier.</li>
                    <li><span class="notion" data-notion="champ-contrechamp">Champ/Contre-champ</span> : Alternance entre deux personnages qui dialoguent.</li>
                    <li><span class="notion" data-notion="match-cut">Match cut</span> : Raccord sur une forme ou mouvement similaire.</li>
                </ul>
                
                <h3>Erreurs à Éviter</h3>
                <ul>
                    <li><span class="notion" data-notion="jump-cut">Jump cut</span> : Saute dans le temps sur le même plan (sauf effet voulu).</li>
                    <li><span class="notion" data-notion="franchissement-axe">Franchissement d'axe</span> : Passer de l'autre côté de la ligne des 180°.</li>
                    <li><span class="notion" data-notion="faux-raccord">Faux raccord</span> : Incohérence d'accessoire, position, lumière entre deux plans.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Règle du 30°</strong> : Entre deux plans de la même scène, changez l'angle d'au moins 30° pour éviter le jump cut.
                </div>
                
                <h3>Le Rythme</h3>
                <ul>
                    <li>Coupez sur l'<strong>action</strong>, pas avant ni après.</li>
                    <li>Laissez les plans <strong>respirer</strong> - ne coupez pas trop vite.</li>
                    <li>Le rythme suit l'<strong>émotion</strong> : rapide = tension, lent = contemplation.</li>
                    <li>Utilisez les <strong>réactions</strong> autant que les actions.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Les Théories du Montage</h3>
                <p>Le montage nest pas quune technique, cest un langage avec ses théoriciens :</p>
                <ul>
                    <li><span class="notion" data-notion="effet-koulechov">Effet Koulechov</span> : Un même visage neutre + images différentes = émotions différentes perçues. Le montage crée le sens.</li>
                    <li><span class="notion" data-notion="montage-intellectuel">Montage intellectuel (Eisenstein)</span> : La collision de deux plans crée une idée nouvelle (thèse + antithèse = synthèse).</li>
                    <li><span class="notion" data-notion="montage-invisible">Montage invisible (Hollywood classique)</span> : Coupes fluides, le spectateur oublie quil regarde un film.</li>
                    <li><span class="notion" data-notion="montage-visible">Montage visible (Godard, Nouvelle Vague)</span> : Jump cuts assumés, rappel constant du médium.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Citation :</strong> "Le cinéma, cest 24 fois la vérité par seconde" - Jean-Luc Godard. Mais le montage choisit quelles vérités.
                </div>
                
                <h3>Les 5 Types de Montage selon Eisenstein</h3>
                <ul>
                    <li><span class="notion" data-notion="montage-metrique">Métrique</span> : Coupe à intervalles réguliers, indépendamment du contenu. Crée un rythme mécanique.</li>
                    <li><span class="notion" data-notion="montage-rythmique">Rythmique</span> : Coupe selon le mouvement dans le plan. Le contenu dicte le rythme.</li>
                    <li><span class="notion" data-notion="montage-tonal">Tonal</span> : Coupe selon lémotion dominante du plan (lumière, atmosphère).</li>
                    <li><strong>Harmonique</strong> : Combinaison de tous les éléments (rythme, ton, mouvement).</li>
                    <li><span class="notion" data-notion="montage-intellectuel">Intellectuel</span> : Juxtaposition pour créer une métaphore ou une idée abstraite.</li>
                </ul>
                
                <h3>Techniques de Montage Avancées</h3>
                <ul>
                    <li><span class="notion" data-notion="montage-parallele">Montage parallèle (cross-cutting)</span> : Alterner entre deux actions simultanées. Tension, comparaison.</li>
                    <li><span class="notion" data-notion="montage-alterne">Montage alterné</span> : Deux temporalités différentes entrelacées.</li>
                    <li><span class="notion" data-notion="flashback">Flashback / Flash-forward</span> : Rupture temporelle vers le passé ou le futur.</li>
                    <li><span class="notion" data-notion="ellipse">Ellipse</span> : Saut dans le temps. Économie narrative.</li>
                    <li><span class="notion" data-notion="sequence-montage">Séquence de montage</span> : Condensation du temps (entraînement, transformation).</li>
                    <li><span class="notion" data-notion="split-screen">Split screen</span> : Écran divisé, actions simultanées visibles.</li>
                    <li><span class="notion" data-notion="smash-cut">Smash cut</span> : Coupe brutale et inattendue pour effet de choc.</li>
                    <li><span class="notion" data-notion="l-cut-j-cut">L-cut / J-cut</span> : Le son précède ou suit limage. Fluidité, anticipation.</li>
                </ul>
                
                <h3>Le Workflow de Post-production</h3>
                <ul>
                    <li><strong>Synchro/Dérushage</strong> : Synchroniser son et image, organiser les médias.</li>
                    <li><span class="notion" data-notion="bout-a-bout">Bout-à-bout</span> : Premier assemblage chronologique des prises retenues.</li>
                    <li><span class="notion" data-notion="rough-cut">Ours (rough cut)</span> : Premier montage complet, encore long.</li>
                    <li><span class="notion" data-notion="fine-cut">Fine cut</span> : Montage affiné, rythme ajusté.</li>
                    <li><span class="notion" data-notion="picture-lock">Picture lock</span> : Montage image validé, plus de modifications.</li>
                    <li><strong>Conformation</strong> : Remplacement des proxies par les fichiers haute qualité.</li>
                    <li><span class="notion" data-notion="etalonnage">Étalonnage</span> : Correction colorimétrique et création du look.</li>
                    <li><strong>Mixage</strong> : Équilibrage final de toutes les pistes audio.</li>
                    <li><strong>Mastering</strong> : Export final dans les formats de diffusion.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Kill your darlings :</strong> Parfois les meilleures scènes doivent être coupées pour le bien du film. Le monteur doit être objectif.
                </div>
                
                <h3>Psychologie du Montage</h3>
                <ul>
                    <li><strong>Point de coupe idéal</strong> : Souvent sur un clignement dyeux ou un mouvement de tête.</li>
                    <li><strong>Regard du spectateur</strong> : Guider lœil dun plan à lautre (eye trace).</li>
                    <li><strong>Règle des 6 (Walter Murch)</strong> : Émotion (51%) > Histoire (23%) > Rythme (10%) > Eye trace (7%) > Planéité 2D (5%) > Espace 3D (4%).</li>
                    <li><strong>Durée des plans</strong> : Plus le plan est complexe visuellement, plus il peut durer.</li>
                </ul>
                
                <h3>Outils et Logiciels</h3>
                <ul>
                    <li><strong>Adobe Premiere Pro</strong> : Standard industrie, intégration Creative Cloud.</li>
                    <li><strong>DaVinci Resolve</strong> : Gratuit et pro, excellent étalonnage intégré.</li>
                    <li><strong>Final Cut Pro X</strong> : Écosystème Apple, timeline magnétique.</li>
                    <li><strong>Avid Media Composer</strong> : Standard cinéma/TV haut de gamme.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"In the Blink of an Eye"</strong> - Walter Murch (2001) : Philosophie du montage par un maître.</li>
                    <li><strong>"The Technique of Film Editing"</strong> - Karel Reisz (1953) : Classique technique britannique.</li>
                    <li><strong>"Film Editing: Theory and Practice"</strong> - Christopher Llewellyn Reed : Manuel contemporain.</li>
                    <li><strong>"The Conversations"</strong> - Michael Ondaatje & Walter Murch : Dialogue fascinant sur le métier.</li>
                    <li><strong>"Cut by Cut"</strong> - Gael Chandler : Guide pratique moderne.</li>
                </ul>
                
                <h3>🎬 Films à Étudier (Montage)</h3>
                <ul>
                    <li><strong>Le Cuirassé Potemkine</strong> (Eisenstein, 1925) : Escalier dOdessa, montage intellectuel.</li>
                    <li><strong>À bout de souffle</strong> (Godard, 1960) : Jump cuts révolutionnaires.</li>
                    <li><strong>Apocalypse Now</strong> (Walter Murch, 1979) : Montage et son visionnaires.</li>
                    <li><strong>Requiem for a Dream</strong> (2000) : Montage hip-hop, split screens.</li>
                    <li><strong>Mad Max: Fury Road</strong> (2015) : Centre du cadre constant, rythme effréné.</li>
                    <li><strong>Whiplash</strong> (2014) : Montage musical, tension rythmique.</li>
                </ul>
            </div>
        `,
        
        production: `
            <div class="courses-section">
                <h2>💼 La Production</h2>
                
                <h3>Les Étapes d'un Film</h3>
                <ul>
                    <li><span class="notion" data-notion="developpement">Développement</span> : Écriture, recherche de financements, montage du projet.</li>
                    <li><span class="notion" data-notion="pre-production">Pré-production</span> : Casting, repérages, planning, constitution de l'équipe.</li>
                    <li><span class="notion" data-notion="production-tournage">Production (tournage)</span> : Réalisation effective du film.</li>
                    <li><span class="notion" data-notion="post-production">Post-production</span> : Montage, étalonnage, mixage, VFX.</li>
                    <li><span class="notion" data-notion="distribution">Distribution</span> : Festivals, vente, diffusion.</li>
                </ul>
                
                <h3>Documents Essentiels</h3>
                <ul>
                    <li><span class="notion" data-notion="plan-travail">Plan de travail</span> : Calendrier détaillé du tournage jour par jour.</li>
                    <li><span class="notion" data-notion="feuille-service">Feuille de service</span> : Programme quotidien (horaires, lieux, scènes, équipe).</li>
                    <li><span class="notion" data-notion="depouillement">Dépouillement</span> : Liste des besoins par scène (décors, costumes, accessoires).</li>
                    <li><span class="notion" data-notion="budget-film">Budget</span> : Estimation détaillée des coûts.</li>
                    <li><span class="notion" data-notion="contrats-film">Contrats</span> : Engagements avec l'équipe et les comédiens.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Ordre de tournage :</strong> On ne tourne pas dans l'ordre du scénario ! On regroupe par lieu, disponibilité des acteurs, et conditions (jour/nuit).
                </div>
                
                <h3>Postes Clés</h3>
                <ul>
                    <li><span class="notion" data-notion="producteur">Producteur</span> : Finance et supervise l'ensemble du projet.</li>
                    <li><span class="notion" data-notion="directeur-production">Directeur de production</span> : Gère le budget et la logistique.</li>
                    <li><span class="notion" data-notion="premier-assistant">1er assistant réalisateur</span> : Organise le tournage, gère le planning.</li>
                    <li><span class="notion" data-notion="regisseur">Régisseur</span> : Logistique quotidienne (lieux, repas, transport).</li>
                    <li><span class="notion" data-notion="scripte">Scripte</span> : Garant de la continuité entre les plans.</li>
                </ul>
            </div>
            
            <div class="courses-section">
                <h2>🎓 Pour Aller Plus Loin</h2>
                
                <h3>Organigramme Complet dun Tournage</h3>
                <p><strong>Département Réalisation :</strong></p>
                <ul>
                    <li><strong>Réalisateur</strong> : Vision artistique, direction des acteurs et de léquipe.</li>
                    <li><strong>1er Assistant Réalisateur</strong> : Planning, organisation plateau, annonces.</li>
                    <li><strong>2ème Assistant Réalisateur</strong> : Feuilles de service, coordination comédiens.</li>
                    <li><strong>3ème Assistant / Stagiaire</strong> : Appui logistique, clap.</li>
                    <li><strong>Scripte</strong> : Continuité, raccords, chronométrage, rapport image.</li>
                </ul>
                
                <p><strong>Département Image :</strong></p>
                <ul>
                    <li><span class="notion" data-notion="chef-op">Directeur de la Photographie (Chef Op)</span> : Éclairage, cadre, look.</li>
                    <li><strong>Cadreur</strong> : Opère la caméra selon les directives.</li>
                    <li><strong>1er Assistant Caméra (Pointeur)</strong> : Mise au point, gestion optiques.</li>
                    <li><strong>2ème Assistant Caméra</strong> : Clap, rapport caméra, médias.</li>
                    <li><strong>Chef Électricien</strong> : Installation et réglage des éclairages.</li>
                    <li><strong>Chef Machiniste</strong> : Mouvements de caméra, grip.</li>
                    <li><strong>DIT (Digital Imaging Technician)</strong> : Gestion des médias, backups, LUTs.</li>
                </ul>
                
                <p><strong>Département Son :</strong></p>
                <ul>
                    <li><strong>Chef Opérateur Son</strong> : Mixage plateau, choix des micros.</li>
                    <li><strong>Perchiste</strong> : Manipulation de la perche.</li>
                </ul>
                
                <p><strong>Département Artistique :</strong></p>
                <ul>
                    <li><strong>Chef Décorateur</strong> : Conception et réalisation des décors.</li>
                    <li><strong>Accessoiriste</strong> : Objets manipulés par les acteurs.</li>
                    <li><strong>Chef Costumier</strong> : Conception et gestion des costumes.</li>
                    <li><strong>Habilleur</strong> : Aide les comédiens, entretien costumes.</li>
                    <li><strong>Chef Maquilleur</strong> : Maquillage beauté et effets.</li>
                    <li><strong>Chef Coiffeur</strong> : Coiffures et perruques.</li>
                </ul>
                
                <div class="courses-tip">
                    <strong>💡 Hiérarchie :</strong> Sur un plateau, on sadresse toujours au chef de département, jamais directement à son équipe (sauf urgence).
                </div>
                
                <h3>Le Financement en France</h3>
                <ul>
                    <li><strong>Apport producteur</strong> : Fonds propres de la société de production.</li>
                    <li><strong>Avance sur recettes (CNC)</strong> : Aide sélective sur scénario et réalisateur.</li>
                    <li><strong>Aides régionales</strong> : Fonds des régions (tournage local requis).</li>
                    <li><strong>SOFICA</strong> : Sociétés dinvestissement défiscalisées.</li>
                    <li><strong>Crédit dimpôt cinéma</strong> : 30% des dépenses françaises éligibles.</li>
                    <li><strong>Préventes TV</strong> : Chaînes qui préachètent les droits de diffusion.</li>
                    <li><strong>Minimum garanti distributeur</strong> : Avance du distributeur salle.</li>
                    <li><strong>Coproduction internationale</strong> : Partenaires étrangers (accès à leurs aides).</li>
                    <li><strong>Crowdfunding</strong> : Financement participatif (courts-métrages, documentaires).</li>
                </ul>
                
                <h3>Les Conventions Collectives</h3>
                <ul>
                    <li><strong>Convention Production Cinéma</strong> : Salaires minimums, heures supplémentaires.</li>
                    <li><strong>Convention Production Audiovisuelle</strong> : TV, publicité, clips.</li>
                    <li><strong>Heures de travail</strong> : Base 8h/jour, 39h/semaine. Au-delà = heures sup majorées.</li>
                    <li><strong>Repos</strong> : 11h minimum entre deux journées de travail.</li>
                    <li><strong>Repas</strong> : Obligatoires, max 6h entre deux repas.</li>
                </ul>
                
                <div class="courses-warning">
                    <strong>⚠️ Assurances obligatoires :</strong> Responsabilité civile, accidents du travail, matériel, négatif/médias, interruption de tournage.
                </div>
                
                <h3>Gestion du Budget</h3>
                <ul>
                    <li><span class="notion" data-notion="above-below-line">Above the line</span> : Droits, scénario, réalisateur, acteurs principaux (coûts créatifs).</li>
                    <li><span class="notion" data-notion="above-below-line">Below the line</span> : Équipe technique, matériel, décors, post-prod (coûts de fabrication).</li>
                    <li><strong>Contingence</strong> : Réserve de 5-10% pour imprévus.</li>
                    <li><strong>Frais généraux</strong> : 5-7% pour la structure de production.</li>
                    <li><strong>Completion bond</strong> : Garantie de bonne fin (gros budgets).</li>
                </ul>
                
                <h3>Le Plan de Travail - Principes dOptimisation</h3>
                <ul>
                    <li><strong>Regrouper par décor</strong> : Minimiser les déménagements.</li>
                    <li><strong>Disponibilité acteurs</strong> : Concentrer les scènes dun même comédien.</li>
                    <li><strong>Jour/Nuit</strong> : Regrouper les nuits (éviter alternances épuisantes).</li>
                    <li><strong>Ordre de difficulté</strong> : Scènes complexes en milieu de tournage (équipe rodée).</li>
                    <li><strong>Météo</strong> : Prévoir des scènes de repli en intérieur.</li>
                    <li><strong>Enfants</strong> : Restrictions horaires légales strictes.</li>
                </ul>
                
                <h3>Distribution et Exploitation</h3>
                <ul>
                    <li><strong>Agent de ventes (Sales Agent)</strong> : Vend le film à linternational.</li>
                    <li><strong>Distributeur</strong> : Commercialise le film sur un territoire.</li>
                    <li><strong>Exploitant</strong> : Propriétaire des salles de cinéma.</li>
                    <li><strong>Chronologie des médias</strong> : Salle → VOD → TV payante → TV gratuite → SVOD.</li>
                    <li><strong>P&A (Prints and Advertising)</strong> : Budget copies et publicité.</li>
                </ul>
                
                <h3>📚 Ouvrages et Ressources</h3>
                <ul>
                    <li><strong>"Producing for the Screen"</strong> - Kathi Lipman : Guide pratique de production.</li>
                    <li><strong>"The Independent Film Producers Survival Guide"</strong> - Gunnar Erickson : Juridique et financier.</li>
                    <li><strong>"Film Production Management"</strong> - Bastian Cleve : Organisation et logistique.</li>
                    <li><strong>"Le Guide du producteur"</strong> - CNC : Référence française (téléchargeable).</li>
                    <li><strong>"Movie Money"</strong> - Bill Daniels : Comprendre léconomie du cinéma.</li>
                </ul>
                
                <h3>🔗 Ressources Utiles</h3>
                <ul>
                    <li><strong>CNC (cnc.fr)</strong> : Aides, réglementations, statistiques France.</li>
                    <li><strong>Film France</strong> : Commission du film nationale, autorisations.</li>
                    <li><strong>Commissions du film régionales</strong> : Aides locales, repérages.</li>
                    <li><strong>CST (Commission Supérieure Technique)</strong> : Normes techniques.</li>
                    <li><strong>SACD / SCAM</strong> : Droits dauteur scénaristes/réalisateurs.</li>
                </ul>
            </div>
        `,
        
        glossaire: `
            <div class="courses-section">
                <h2>📖 Glossaire du Cinéma</h2>
                
                <div class="courses-term"><dt>Axe</dt><dd>Direction dans laquelle la caméra regarde le sujet.</dd></div>
                <div class="courses-term"><dt>Champ</dt><dd>Ce qui est visible dans le cadre.</dd></div>
                <div class="courses-term"><dt>Hors-champ</dt><dd>Ce qui est en dehors du cadre mais fait partie de la scène.</dd></div>
                <div class="courses-term"><dt>Diégèse</dt><dd>L'univers fictif du film, tout ce qui "existe" dans l'histoire.</dd></div>
                <div class="courses-term"><dt>Diégétique</dt><dd>Son ou musique dont la source est dans l'univers du film (radio, personnage qui chante).</dd></div>
                <div class="courses-term"><dt>Extra-diégétique</dt><dd>Son ajouté (musique de film, voix-off narrative).</dd></div>
                <div class="courses-term"><dt>Clap</dt><dd>Ardoise identifiant chaque prise. Le claquement permet la synchronisation son/image.</dd></div>
                <div class="courses-term"><dt>Rushes</dt><dd>Images brutes tournées, non montées.</dd></div>
                <div class="courses-term"><dt>Bout-à-bout</dt><dd>Premier assemblage chronologique des rushes sélectionnés.</dd></div>
                <div class="courses-term"><dt>Ours</dt><dd>Premier montage complet mais non finalisé.</dd></div>
                <div class="courses-term"><dt>Étalonnage</dt><dd>Correction colorimétrique pour harmoniser l'image et créer une ambiance.</dd></div>
                <div class="courses-term"><dt>Mixage</dt><dd>Équilibrage final de toutes les pistes audio.</dd></div>
                <div class="courses-term"><dt>DCP</dt><dd>Digital Cinema Package - Format de diffusion en salle.</dd></div>
                <div class="courses-term"><dt>Ratio</dt><dd>Rapport largeur/hauteur de l'image (1.85:1, 2.39:1 Scope, 16:9...).</dd></div>
                <div class="courses-term"><dt>Amorce</dt><dd>Partie d'un personnage ou objet au premier plan, partiellement visible.</dd></div>
                <div class="courses-term"><dt>Insert</dt><dd>Gros plan sur un détail significatif (objet, main, texte).</dd></div>
                <div class="courses-term"><dt>Plan-séquence</dt><dd>Scène tournée en un seul plan sans coupe.</dd></div>
                <div class="courses-term"><dt>Raccord</dt><dd>Cohérence visuelle et sonore entre deux plans consécutifs.</dd></div>
            </div>
        `
    })
};

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
            const list = uniq.map(e => Utils.pgSafe(e)).join(',');
            const { data, error: errBadgesF } = await supabase
                .from('user_profiles')
                .select('email, owner_email, moderation_badge')
                .or(`email.in.(${list}),owner_email.in.(${list})`)
                .not('moderation_badge', 'is', null);
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

// --- MODULE FICHELINKS (v580 : le lien scene <-> fiche passe par l'identifiant) ---
// Jusqu'ici le lien passait par le NOM : s.perso etait du texte libre
// (« MARIE; PAUL ») et le decor etait DEVINE en decoupant le titre de la
// scene. Renommer une fiche cassait donc tous les liens — d'ou le garde-fou
// qui interdisait le renommage depuis la fiche. Desormais chaque scene porte
// la SOURCE DE VERITE en identifiants : s.persoIds (fiches personnage) et
// s.locationId (fiche decor). Les champs texte s.perso et s.location ne sont
// plus que des CACHES d'affichage, regeneres depuis les identifiants — les
// dizaines de lectures de s.perso dans le fichier restent donc justes sans
// etre touchees. Renommer une fiche se repercute partout : sequencier,
// scenario, depouillement, feuille de service.
const FicheLinks = {
    // Decoupe un champ perso en noms — memes separateurs que syncCharacters.
    splitNames: (text) => String(text || '').split(/[,;]|\bet\b/i).map(n => n.trim()).filter(n => n.length),

    findChar: (name) => {
        const t = String(name || '').trim().toLowerCase();
        if(!t) return null;
        return (state.data.characters || []).find(c => c && String(c.name || '').trim().toLowerCase() === t) || null;
    },

    // Retrouve OU CREE la fiche personnage, meme forme que syncCharacters :
    // saisir un nom inconnu cree la fiche, c'est la regle actuelle (le
    // chantier 3 « pas de creation automatique » ne vise que les decors).
    ensureChar: (name) => {
        let c = FicheLinks.findChar(name);
        if(!c) {
            if(!Array.isArray(state.data.characters)) state.data.characters = [];
            c = { id: 'char_' + Utils.generateUniqueId(), name: String(name).trim(), bio: "", group_id: "", gender: "" };
            state.data.characters.push(c);
        }
        return c;
    },

    charName: (id) => {
        const c = (state.data.characters || []).find(x => x && x.id === id);
        return c ? c.name : null;
    },

    // CACHE : reconstruit s.perso depuis les identifiants. Les ids dont la
    // fiche a disparu sont purges au passage.
    refreshPerso: (scene) => {
        if(!scene || !Array.isArray(scene.persoIds)) return;
        const names = [];
        scene.persoIds = scene.persoIds.filter(id => {
            const n = FicheLinks.charName(id);
            if(n === null) return false;
            names.push(n);
            return true;
        });
        scene.perso = names.join('; ');
    },

    // SOURCE : recalcule les identifiants depuis le texte de s.perso, en
    // creant les fiches inconnues. Ne touche PAS au texte : c'est la brique
    // de la migration douce (aucun changement visible au premier passage).
    syncIdsFromText: (scene) => {
        if(!scene) return;
        const ids = [];
        FicheLinks.splitNames(scene.perso).forEach(n => {
            const c = FicheLinks.ensureChar(n);
            if(c && c.id && !ids.includes(c.id)) ids.push(c.id);
        });
        scene.persoIds = ids;
    },

    // Saisie du champ perso par l'utilisateur : le texte fait foi une fois,
    // les ids sont poses, puis le cache repart des noms canoniques des fiches.
    setPersoFromText: (scene, text) => {
        if(!scene) return;
        scene.perso = String(text == null ? '' : text).trim();
        FicheLinks.syncIdsFromText(scene);
        FicheLinks.refreshPerso(scene);
    },

    // Ajoute UN personnage (par id) a une scene, sans toucher aux autres.
    addCharToScene: (scene, charId) => {
        if(!scene || !charId) return;
        if(!Array.isArray(scene.persoIds)) FicheLinks.syncIdsFromText(scene);
        if(!scene.persoIds.includes(charId)) scene.persoIds.push(charId);
        FicheLinks.refreshPerso(scene);
    },

    findLoc: (name) => {
        const t = String(name || '').trim().toLowerCase();
        if(!t) return null;
        return (state.data.locations || []).find(l => l && String(l.name || '').trim().toLowerCase() === t) || null;
    },

    // DECOR : pose s.locationId depuis le decor effectif de la scene
    // (surcharge explicite s.location, sinon titre — c'est PlanningFDS.decor
    // qui arbitre, comme partout). CHANTIER 3 (v580) : cette resolution NE
    // CREE PLUS JAMAIS de fiche — un meme decor peut servir plusieurs lieux
    // de scene, la creation est un geste explicite (bouton « ➕ Décor »).
    // Le mot LIEU du titre par defaut n'est pas un decor : jamais de lien.
    resolveDecor: (scene) => {
        if(!scene) return;
        const name = String(PlanningFDS.decor(scene) || '').trim();
        if(!name || name.toUpperCase() === 'LIEU') { scene.locationId = null; return; }
        const l = FicheLinks.findLoc(name);
        scene.locationId = l ? l.id : null;
    },

    // CREATION EXPLICITE d'un decor (chantier 3). Retourne la fiche (ou
    // l'existante si le nom est deja pris — jamais de doublon). Relie au
    // passage les scenes encore sans lien dont le decor porte ce nom.
    createDecor: (name) => {
        const t = String(name || '').trim();
        if(!t || t.toUpperCase() === 'LIEU') return null;
        const existed = FicheLinks.findLoc(t);
        if(existed) return existed;
        if(!Array.isArray(state.data.locations)) state.data.locations = [];
        const l = { id: 'loc_' + Utils.generateUniqueId(), name: t.toUpperCase(), desc: "", group_id: "" };
        state.data.locations.push(l);
        History.log('ADD', `Ajout décor : ${l.name}`, { target: { kind: 'location', id: l.id, label: l.name }, link: { kind: 'location', id: l.id } });
        (state.data.scenes || []).forEach(s => {
            if(s && (s.locationId === undefined || s.locationId === null)) FicheLinks.resolveDecor(s);
        });
        return l;
    },

    // Bouton « ➕ Décor » de la fiche scene : le lieu du champ en cours de
    // saisie prime sur le titre enregistre (c'est lui que l'utilisateur
    // vient de taper) ; le titre est committe si besoin par le meme geste
    // que la validation du champ, et le selecteur 🏠 se rafraichit SANS
    // fermer la fiche (demande explicite).
    createDecorFromScene: (sceneId) => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('location')) return;
        const sc = (state.data.scenes || []).find(x => x && String(x.id) === String(sceneId));
        if(!sc) return;
        const inp = document.getElementById('fsc-loc');
        const tp = Utils.sceneTitleParts(sc.title);
        const name = String((inp && inp.value) || tp.loc || '').trim();
        if(!name || name.toUpperCase() === 'LIEU') { Utils.toast('Entrez d\'abord un lieu.', 'warning'); return; }
        const existed = FicheLinks.findLoc(name);
        const l = existed || FicheLinks.createDecor(name);
        if(!l) return;
        if(inp && String(inp.value || '').trim() && String(inp.value).trim().toUpperCase() !== String(tp.loc || '').toUpperCase()) {
            // Le champ porte un lieu pas encore valide : on le committe, et
            // setSceneTitlePart resout le lien en trouvant la fiche neuve.
            CardModal.setSceneTitlePart(String(sc.id), 'loc', inp.value);
        } else {
            sc.locationId = l.id;
            Store.save();
        }
        FicheLinks.refreshDecorSelect(sc);
        try { GroupDnD.rerender('locations'); } catch(e) {}
        Utils.toast(existed ? `Décor « ${l.name} » existait déjà : lié à la scène.` : `Décor « ${l.name} » créé et lié à la scène.`, 'success');
    },

    // Bouton « ➕ Décor » de la modale BeatBoard : la scene n'existe pas
    // encore, on ne cree que la fiche — le lien se posera a l'ajout de la
    // scene (resolveDecor de la fabrique la trouvera).
    createDecorFromBeatBoard: () => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('location')) return;
        const inp = document.getElementById('bb-inpLoc');
        const name = inp ? String(inp.value || '').trim() : '';
        if(!name) { Utils.toast('Entrez d\'abord un lieu.', 'warning'); return; }
        const existed = FicheLinks.findLoc(name);
        const l = existed || FicheLinks.createDecor(name);
        if(!l) return;
        Store.save();
        Utils.toast(existed ? `Décor « ${l.name} » existe déjà.` : `Décor « ${l.name} » créé.`, 'success');
    },

    // Reconstruit le selecteur 🏠 Décor de la fiche scene en place — memes
    // options et meme selection que le rendu d'origine de la fiche.
    refreshDecorSelect: (sc) => {
        const sel = document.getElementById('fsc-decor');
        if(!sel || !sc) return;
        const decor = PlanningFDS.decor(sc);
        const names = (state.data.locations || []).map(l => l.name).filter(Boolean);
        if(decor && !names.includes(decor)) names.unshift(decor);
        sel.innerHTML = '<option value="">-- déduit du titre --</option>' + names.map(n => `<option value="${Utils.escape(n)}" ${decor === n ? 'selected' : ''}>${Utils.escape(n)}</option>`).join('');
    },

    // ===== LECTURES PAR IDENTIFIANT (audit v580 : « tout par id ») =====
    // La scene connait ses fiches par identifiant ; le nom ne sert plus que
    // de repli pour une donnee jamais migree. Ces trois lecteurs remplacent
    // les comparaisons de noms dispersees dans le fichier.
    sceneHasChar: (scene, ch) => {
        if(!scene || !ch) return false;
        if(ch.id && Array.isArray(scene.persoIds) && scene.persoIds.includes(ch.id)) return true;
        const nm = String(ch.name || '').trim().toLowerCase();
        if(!nm || !scene.perso) return false;
        return scene.perso.split(/[,;]|\bet\b/i).map(n => n.trim().toLowerCase()).includes(nm);
    },
    charsOfScene: (scene) => {
        if(!scene) return [];
        const out = [];
        if(Array.isArray(scene.persoIds)) {
            scene.persoIds.forEach(cid => { const c = (state.data.characters || []).find(x => x && x.id === cid); if(c && !out.includes(c)) out.push(c); });
        }
        // Repli : noms du champ perso que les ids ne couvrent pas (donnee ancienne).
        FicheLinks.splitNames(scene.perso).forEach(n => { const c = FicheLinks.findChar(n); if(c && !out.includes(c)) out.push(c); });
        return out;
    },
    locOfScene: (scene) => {
        if(!scene) return null;
        if(scene.locationId) {
            const l = (state.data.locations || []).find(x => x && x.id === scene.locationId);
            if(l) return l;
        }
        return FicheLinks.findLoc(PlanningFDS.decor(scene));
    },

    // ===== CHANTIER 4 : GROUPE AUTOMATIQUE « SANS SCENE » =====
    // Une fiche (personnage, comedien, decor, ressource) qui n'apparait dans
    // aucune scene bascule dans un groupe automatique de son onglet, pour
    // etre retrouvee et supprimee facilement. Elle ne peut pas etre rangee
    // ailleurs tant qu'elle est sans scene — sauf a cocher l'exemption
    // « Classement manuel » (item.keepGroup) sur sa fiche.
    inAnyScene: (kind, id) => {
        if(!kind || !id) return true; // dans le doute, ne jamais sequestrer.
        try { return (UI.scenesForFiche(kind, id) || []).length > 0; }
        catch(e) { return true; }
    },

    // La collection -> la famille de fiche, pour les quatre onglets vises.
    KIND4: { characters: 'character', actors: 'actor', locations: 'location', resources: 'resource' },

    // Vrai si la fiche doit etre sequestree dans « Sans scène ».
    isSansScene: (coll, item) => {
        const kind = FicheLinks.KIND4[coll];
        if(!kind || !item || !item.id || item.keepGroup) return false;
        return !FicheLinks.inAnyScene(kind, item.id);
    },

    setKeepGroup: (coll, id, val) => {
        const kind = FicheLinks.KIND4[coll];
        if(kind && typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche(kind)) return;
        const it = (state.data[coll] || []).find(x => x && x.id === id);
        if(!it) return;
        if(val) it.keepGroup = true; else delete it.keepGroup;
        Store.save();
        if(coll === 'resources') { try { Resources.render(); } catch(e) {} }
        else { try { GroupDnD.rerender(coll); } catch(e) {} }
    },

    // Case « Classement manuel », affichee sur la fiche quand elle est sans
    // scene (ou deja exemptee, pour pouvoir decocher).
    pinToggleHtml: (coll, item, isView) => {
        const kind = FicheLinks.KIND4[coll];
        if(!kind || !item || !item.id || isView) return '';
        if(!item.keepGroup && FicheLinks.inAnyScene(kind, item.id)) return '';
        return `<label style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:0.8rem; color:var(--text-sec); cursor:pointer;" onclick="event.stopPropagation()"><input type="checkbox" ${item.keepGroup ? 'checked' : ''} onchange="app.FicheLinks.setKeepGroup('${coll}', '${Utils.escape(String(item.id))}', this.checked)"> 📌 Classement manuel (ne pas ranger dans « Sans scène »)</label>`;
    },

    // MIGRATION, idempotente, appelee au chargement du projet juste apres
    // bdNormalizeData (meme logique : non gardee par un drapeau, elle doit
    // aussi rattraper ce qui arrive par un import ou une vieille synchro).
    // Retourne le nombre de scenes touchees pour declencher une sauvegarde.
    migrate: () => {
        let n = 0;
        try {
            ((state.data && state.data.scenes) || []).forEach(s => {
                if(!s) return;
                let touched = false;
                if(!Array.isArray(s.persoIds)) { FicheLinks.syncIdsFromText(s); touched = true; }
                // Chantier 3 : la migration LIE aux fiches existantes, elle
                // n'en cree plus (les projets anciens ont deja leurs decors,
                // crees par syncLocations a chaque ouverture de l'onglet).
                if(s.locationId === undefined) { FicheLinks.resolveDecor(s); touched = true; }
                if(touched) n++;
            });
        } catch(e) { console.warn('FicheLinks.migrate:', e); }
        return n;
    },

    // ===== RENOMMAGE — le coeur du chantier =====
    renameCharacter: (id, newNameRaw) => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('character')) return false;
        const c = (state.data.characters || []).find(x => x && x.id === id);
        if(!c) return false;
        const newName = String(newNameRaw == null ? '' : newNameRaw).trim();
        if(!newName) { Utils.toast('Le nom ne peut pas être vide.', 'warning'); FicheLinks.rerender('characters'); return false; }
        if(newName === c.name) return true;
        const dbl = (state.data.characters || []).find(x => x && x.id !== id && String(x.name || '').trim().toLowerCase() === newName.toLowerCase());
        if(dbl) { Utils.toast('Un personnage porte déjà ce nom.', 'warning'); FicheLinks.rerender('characters'); return false; }
        const oldName = c.name;
        c.name = newName;
        (state.data.scenes || []).forEach(s => {
            if(!s) return;
            // Cache perso des scenes liees par identifiant.
            if(Array.isArray(s.persoIds) && s.persoIds.includes(id)) FicheLinks.refreshPerso(s);
            // Etiquettes du depouillement visant cette fiche, sur TOUTES les
            // scenes : une occurrence peut exister hors du champ perso.
            if(s.breakdown && Array.isArray(s.breakdown['PERSONNAGES'])) {
                s.breakdown['PERSONNAGES'].forEach(it => { if(it && typeof it === 'object' && it.id === id) it.t = newName; });
            }
        });
        History.log('EDIT', `Personnage renommé : ${oldName} → ${newName}`, { target: { kind: 'character', id: id, label: newName }, link: { kind: 'character', id: id } });
        Store.save();
        FicheLinks.rerender('characters');
        Utils.toast(`« ${oldName} » renommé en « ${newName} » partout.`, 'success');
        RenameReview.check(oldName, newName);
        return true;
    },

    renameLocation: (id, newNameRaw) => {
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('location')) return false;
        const l = (state.data.locations || []).find(x => x && x.id === id);
        if(!l) return false;
        // Convention des titres de scenario : le decor s'ecrit en majuscules.
        const newName = String(newNameRaw == null ? '' : newNameRaw).trim().toUpperCase();
        if(!newName) { Utils.toast('Le nom ne peut pas être vide.', 'warning'); FicheLinks.rerender('locations'); return false; }
        if(newName === l.name) return true;
        const dbl = (state.data.locations || []).find(x => x && x.id !== id && String(x.name || '').trim().toLowerCase() === newName.toLowerCase());
        if(dbl) { Utils.toast('Un décor porte déjà ce nom.', 'warning'); FicheLinks.rerender('locations'); return false; }
        const oldName = l.name;
        const oldLow = String(oldName || '').trim().toLowerCase();
        l.name = newName;
        (state.data.scenes || []).forEach(s => {
            if(!s) return;
            // Etiquettes du depouillement, sur toutes les scenes.
            if(s.breakdown && Array.isArray(s.breakdown['DECORS-LIEUX'])) {
                s.breakdown['DECORS-LIEUX'].forEach(it => { if(it && typeof it === 'object' && it.id === id) it.t = newName; });
            }
            if(s.locationId !== id) return;
            // Surcharge explicite : le cache suit la fiche.
            if(s.location && String(s.location).trim().toLowerCase() === oldLow) s.location = newName;
            // Titre : reecrit UNIQUEMENT si son decor est exactement l'ancien
            // nom — on ne touche jamais un titre qui ne correspond pas.
            const tp = Utils.sceneTitleParts(s.title);
            if(String(tp.loc || '').trim().toLowerCase() === oldLow) {
                s.title = (tp.pre || 'EXT') + '. ' + newName + ' - ' + (tp.suff || 'JOUR');
            }
        });
        History.log('EDIT', `Décor renommé : ${oldName} → ${newName}`, { target: { kind: 'location', id: id, label: newName }, link: { kind: 'location', id: id } });
        Store.save();
        FicheLinks.rerender('locations');
        Utils.toast(`« ${oldName} » renommé en « ${newName} » partout.`, 'success');
        RenameReview.check(oldName, newName);
        return true;
    },

    // Apres un renommage, tout ce qui affiche un nom en cache doit etre
    // redessine : la grille des fiches, le sequencier, le scenario, et le
    // depouillement si c'est l'onglet ouvert (meme logique que CardModal.close).
    rerender: (coll) => {
        try { GroupDnD.rerender(coll); } catch(e) {}
        try { UI.renderBoard(); } catch(e) {}
        try { UI.renderScript(); } catch(e) {}
        try {
            const activeTab = document.querySelector('.tab-content.active');
            if(activeTab && activeTab.id === 'tab-breakdown' && typeof Breakdown !== 'undefined' && Breakdown.init) Breakdown.init();
        } catch(e) {}
        // Fiche ouverte en modale : son contenu porte l'ancien nom, on la
        // reconstruit si c'est la collection concernee.
        try {
            if(CardModal.currentType === coll && CardModal.currentId != null && typeof UI.openFiche === 'function') {
                const kind = coll === 'characters' ? 'character' : (coll === 'locations' ? 'location' : null);
                if(kind) UI.openFiche(kind, CardModal.currentId);
            }
        } catch(e) {}
    }
};

// RenameReview — apres un renommage (personnage/decor), NE remplace RIEN
// automatiquement dans le texte du scenario (une machette qui devient un
// pistolet, ca ne se recrit pas mot a mot : la phrase autour doit etre
// repensee). A la place : chaque mention encore ecrite en toutes lettres
// recoit un surlignage orange DANS le scenario — un calque par-dessus en
// position:fixed, JAMAIS injecte dans le texte edite (scriptContent n'est
// jamais touche par ce module). Au survol : ancien -> nouveau nom, et trois
// gestes (ignorer / suivant / corrige+suivant). Liste en memoire pour la
// session (pas sauvegardee en base, ce n'est pas une donnee de projet).
const RenameReview = {
    items: [],   // { id, oldName, newName, sceneId, occIndex, done }
    _repaintT: null, _hideT: null,

    // Appelee juste apres un renommage reussi (FicheLinks.renameCharacter /
    // renameLocation). Recense les mentions hors DOM, sur le texte brut.
    check: (oldName, newName) => {
        try {
            const oldN = String(oldName || '').trim();
            const newN = String(newName || '').trim();
            if(!oldN || oldN.toLowerCase() === newN.toLowerCase()) return;
            const re = new RegExp('(?:^|[^\\wÀ-ÿ-])(' + oldN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\wÀ-ÿ-])', 'gi');
            let total = 0;
            (state.data.scenes || []).forEach(s => {
                if(!s || !s.scriptContent) return;
                const txt = s.scriptContent.replace(/<[^>]+>/g, ' ');
                const n = (txt.match(re) || []).length;
                for(let i = 0; i < n; i++) {
                    RenameReview.items.push({ id: 'rr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), oldName: oldN, newName: newN, sceneId: s.id, occIndex: i, done: false });
                }
                total += n;
            });
            if(total > 0) RenameReview.offer(oldN, total);
        } catch(e) { /* jamais bloquant pour le renommage lui-meme */ }
    },

    offer: (q, n) => {
        const old = document.getElementById('rename-review-offer'); if(old) old.remove();
        const b = document.createElement('div');
        b.id = 'rename-review-offer';
        b.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--panel-bg); border:1px solid var(--border); border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,0.25); padding:10px 14px; z-index:var(--z-tooltip); display:flex; align-items:center; gap:10px; font-size:0.85rem; max-width:90vw;';
        b.innerHTML = '<span>« ' + Utils.escape(q) + ' » encore écrit ' + n + ' fois dans le scénario.</span>'
            + '<button onclick="app.RenameReview.reveal()" style="padding:6px 12px; border:none; border-radius:6px; background:var(--primary); color:#fff; cursor:pointer; white-space:nowrap;">Repérer dans le texte</button>'
            + '<button onclick="document.getElementById(\'rename-review-offer\').remove()" style="padding:6px 10px; border:none; border-radius:6px; background:transparent; color:var(--text-sec); cursor:pointer;">Ignorer</button>';
        document.body.appendChild(b);
    },

    // Bascule sur l'onglet Scenario, en vue continue (tous les editeurs de
    // scene en meme temps), puis peint les surlignages orange.
    reveal: () => {
        const off = document.getElementById('rename-review-offer'); if(off) off.remove();
        if(typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('script');
        if(typeof ScriptEditorViewMode !== 'undefined') ScriptEditorViewMode.set('continuous');
        setTimeout(() => RenameReview._gotoFirstRetry(8), 200);
    },

    // Amene directement sur la premiere occurrence en attente — pas juste
    // en haut de la vue continue (qui peut commencer par des scenes sans
    // rien a verifier). Reessaie plusieurs fois : le temps que la vue
    // continue finisse de se construire, les marques ne sont pas encore la.
    _gotoFirstRetry: (attemptsLeft) => {
        RenameReview.paint();
        setTimeout(() => {
            const target = document.querySelector('.rn-pending-mark');
            if(target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => RenameReview._showTip(target.dataset.reviewId, target), 350);
            } else if(attemptsLeft > 0) {
                RenameReview._gotoFirstRetry(attemptsLeft - 1);
            }
        }, 120);
    },

    // Le seul endroit ou le texte d'une scene est editable : la vue continue
    // (.script-continuous-content).
    _editors: () => {
        const out = [];
        document.querySelectorAll('.script-continuous-content').forEach(el => {
            const wrap = el.closest('.script-continuous-scene');
            if(wrap) out.push({ el, sceneId: wrap.dataset.sceneId });
        });
        return out;
    },

    // Retrouve la n-ieme occurrence (mot entier, insensible a la casse) dans
    // un editeur — meme principe que ScriptEditorSearch, jamais de span
    // injecte : la Range sert juste a mesurer une position a l'ecran.
    _findOcc: (editorEl, term, occIndex) => {
        const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(?:^|[^\\wÀ-ÿ-])(' + safe + ')(?![\\wÀ-ÿ-])', 'gi');
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null, false);
        let node, seen = 0;
        while(node = walker.nextNode()) {
            const t = node.textContent;
            let m;
            re.lastIndex = 0;
            while((m = re.exec(t))) {
                const start = m.index + (m[0].length - m[1].length);
                if(seen === occIndex) {
                    const range = document.createRange();
                    range.setStart(node, start);
                    range.setEnd(node, start + m[1].length);
                    return range;
                }
                seen++;
                if(re.lastIndex === m.index) re.lastIndex++;
            }
        }
        return null;
    },

    paint: () => {
        if(!RenameReview._listenersBound) {
            RenameReview._listenersBound = true;
            window.addEventListener('resize', RenameReview.paint);
            document.addEventListener('scroll', RenameReview.paint, true);
        }
        clearTimeout(RenameReview._repaintT); RenameReview._repaintT = setTimeout(RenameReview._paintNow, 30);
    },

    _paintNow: () => {
        document.querySelectorAll('.rn-pending-mark').forEach(el => el.remove());
        const pending = RenameReview.items.filter(r => !r.done);
        if(!pending.length) return;
        const editors = RenameReview._editors();
        pending.forEach(rev => {
            const ed = editors.find(e => e.sceneId === rev.sceneId);
            if(!ed) return;
            let range;
            try { range = RenameReview._findOcc(ed.el, rev.oldName, rev.occIndex); } catch(e) { range = null; }
            if(!range) return;
            const rect = range.getBoundingClientRect();
            if(!rect || (!rect.width && !rect.height)) return;
            const mark = document.createElement('div');
            mark.className = 'rn-pending-mark';
            mark.dataset.reviewId = rev.id;
            mark.style.left = rect.left + 'px'; mark.style.top = rect.top + 'px';
            mark.style.width = rect.width + 'px'; mark.style.height = rect.height + 'px';
            mark.addEventListener('mouseenter', () => RenameReview._showTip(rev.id, mark));
            mark.addEventListener('mouseleave', () => RenameReview._scheduleHideTip());
            document.body.appendChild(mark);
        });
    },

    _showTip: (reviewId, markEl) => {
        clearTimeout(RenameReview._hideT);
        RenameReview._hideTip();
        const rev = RenameReview.items.find(r => r.id === reviewId);
        if(!rev) return;
        const rect = markEl.getBoundingClientRect();
        const tip = document.createElement('div');
        tip.id = 'rn-tip';
        const TIP_H = 70; // hauteur approximative, avant mesure reelle
        const placeAbove = (rect.bottom + TIP_H + 10) > window.innerHeight;
        tip.style.cssText = 'position:fixed; z-index:9999; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); padding:10px 12px; min-width:220px; font-size:0.85rem;';
        tip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + 'px';
        if(placeAbove) tip.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        else tip.style.top = (rect.bottom + 6) + 'px';
        tip.innerHTML = '<div style="margin-bottom:8px;">« ' + Utils.escape(rev.oldName) + ' » remplacé par « ' + Utils.escape(rev.newName) + ' » — vérifier le texte</div>'
            + '<div style="display:flex; gap:14px; font-size:0.85rem;">'
            + '<span style="cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="app.RenameReview.dismiss(\'' + rev.id + '\')">✕ Ignorer</span>'
            + '<span style="cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="app.RenameReview.next(\'' + rev.id + '\')">➡️ Suivant</span>'
            + '<span style="cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="app.RenameReview.fixedNext(\'' + rev.id + '\')">✅ Corrigé</span>'
            + '</div>';
        tip.addEventListener('mouseenter', () => clearTimeout(RenameReview._hideT));
        tip.addEventListener('mouseleave', () => RenameReview._scheduleHideTip());
        document.body.appendChild(tip);
    },

    _hideTip: () => { const t = document.getElementById('rn-tip'); if(t) t.remove(); },
    _scheduleHideTip: () => { clearTimeout(RenameReview._hideT); RenameReview._hideT = setTimeout(RenameReview._hideTip, 300); },

    // Croix : on laisse le mot tel quel (choix assume), on l'oublie.
    dismiss: (id) => {
        const rev = RenameReview.items.find(r => r.id === id);
        if(rev) rev.done = true;
        RenameReview._hideTip();
        RenameReview.paint();
    },

    // Fleche : on va voir la suivante sans rien changer au statut de celle-ci.
    next: (id) => {
        RenameReview._hideTip();
        const marks = Array.from(document.querySelectorAll('.rn-pending-mark'));
        const idx = marks.findIndex(m => m.dataset.reviewId === id);
        const target = marks[idx + 1] || marks[0];
        if(target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => RenameReview._showTip(target.dataset.reviewId, target), 350); }
    },

    // Coche : corrigee a la main par l'utilisateur, on l'oublie ET on avance.
    fixedNext: (id) => {
        RenameReview._hideTip();
        const marks = Array.from(document.querySelectorAll('.rn-pending-mark'));
        const idx = marks.findIndex(m => m.dataset.reviewId === id);
        const rev = RenameReview.items.find(r => r.id === id);
        if(rev) rev.done = true;
        RenameReview.paint();
        setTimeout(() => {
            const marks2 = Array.from(document.querySelectorAll('.rn-pending-mark'));
            const target = marks2[idx] || marks2[0];
            if(target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => RenameReview._showTip(target.dataset.reviewId, target), 200); }
        }, 60);
    }
};

// --- MODULE CARD MODAL (Vue compacte + édition) ---
// FICHE D'IDENTITE UNIVERSELLE (v581) — assembleur du gabarit partage.
// Chaque rendu de fiche existant reutilise ces briques : l'assembleur ne
// touche ni aux donnees ni aux branchements (onchange, droits), il ne fait
// que la presentation. Les valeurs affichees passent par Utils.escape ICI
// quand elles viennent de la saisie ; les morceaux de HTML deja construits
// (selects, sections) sont passes tels quels.
const FicheUI = {
    // Rond d'avatar : photo si fournie, sinon initiales du nom (2 lettres max).
    // clickAttr (optionnel) rend l'avatar cliquable pour changer la photo.
    avatarHtml: (name, photoUrl, clickAttr) => {
        let inner;
        if(photoUrl) inner = `<img src="${Utils.safeMediaUrl(photoUrl)}" alt="">`;
        else {
            const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase() || '?';
            inner = Utils.escape(initials);
        }
        if(clickAttr) return `<div class="fid-avatar fid-avatar--edit" ${clickAttr} title="Changer la photo" style="position:relative;">${inner}<span class="fid-avatar-edit">🖼️</span></div>`;
        return `<div class="fid-avatar">${inner}</div>`;
    },

    // En-tete complet : avatar, nom (editable via onchangeAttr, sinon texte),
    // sous-titre « type de fiche + n° de serie », badges, poubelle.
    headHtml: (opts) => {
        const name = opts.name || '';
        let nameHtml;
        if(opts.onchangeAttr) {
            nameHtml = `<input type="text" class="fid-name" value="${Utils.escape(name)}" placeholder="${Utils.escape(opts.placeholder || 'Nom')}" data-tooltip="${Utils.escape(opts.placeholder || 'Nom')}" onclick="event.stopPropagation()" ${opts.onchangeAttr}>`;
        } else {
            nameHtml = `<div class="fid-name">${Utils.escape(name || 'Sans nom')}</div>`;
        }
        const sub = `${Utils.escape(opts.kindLabel || '')} · fiche n° ${Utils.escape(String(opts.id || ''))}`;
        return `<div class="fid-head">
            ${FicheUI.avatarHtml(name, opts.photo, opts.avatarClickAttr)}${opts.avatarInputHtml || ''}
            <div class="fid-head-main">${nameHtml}<div class="fid-sub">${sub}</div></div>
            <div class="fid-head-side">${opts.badgesHtml || ''}${opts.delBtnHtml || ''}</div>
        </div>`;
    },

    // Champ « etiquette au-dessus, valeur dessous ». controlHtml est un
    // morceau deja construit (input, select...), passe tel quel.
    //  v601 - « commun » marque un champ PARTAGE par toutes les casquettes du
    //  compte (telephone, vehicule, date de naissance...). Sans ce signe, on
    //  croit modifier sa fiche technicien et on modifie les quatre.
    field: (label, controlHtml, opts) => {
        if(!controlHtml) return '';
        const marque = (opts && opts.commun)
            ? ' <span class="fid-commun" title="Champ commun à toutes vos casquettes : le modifier ici le modifie partout.">⇄ commun</span>'
            : '';
        return `<div class="fid-field"><span class="fid-label">${Utils.escape(label)}${marque}</span>${controlHtml}</div>`;
    },

    //  v601 - UN CHAMP DANS UNE RANGEE GARDE SON NOM AU-DESSUS. Le texte
    //  grise a l'interieur disparait des qu'on ecrit : six mois plus tard,
    //  on relit « 178 » sans savoir si c'est la taille ou le poids.
    mini: (label, controlHtml) => {
        if(!controlHtml) return '';
        return `<label class="fid-mini"><span>${Utils.escape(label)}</span>${controlHtml}</label>`;
    },
    // v593 : secTitle retiré (helper jamais appelé).

    badge: (txt, ok) => `<span class="fid-badge${ok ? ' fid-badge--ok' : ''}">${Utils.escape(txt)}</span>`,

    // ---- BRIQUES REPLIABLES (v581) ------------------------------------
    // Etat replie memorise par appareil, cle « famille.brique ». On ne
    // stocke QUE les briques repliees (par defaut tout est deplie).
    _collapseKey: 'moteur_fidcollapse',
    _collapseState: null,
    _loadCollapse: () => {
        if(FicheUI._collapseState) return FicheUI._collapseState;
        try { FicheUI._collapseState = JSON.parse(localStorage.getItem(FicheUI._collapseKey) || '{}') || {}; }
        catch(e) { FicheUI._collapseState = {}; }
        return FicheUI._collapseState;
    },
    isCollapsed: (kind, id) => !!FicheUI._loadCollapse()[kind + '.' + id],
    setCollapsed: (kind, id, val) => {
        const s = FicheUI._loadCollapse();
        if(val) s[kind + '.' + id] = 1; else delete s[kind + '.' + id];
        try { localStorage.setItem(FicheUI._collapseKey, JSON.stringify(s)); } catch(e) {}
    },
    toggleBlock: (headEl) => {
        const b = headEl.closest('.fid-block');
        if(!b) return;
        b.classList.toggle('is-collapsed');
        FicheUI.setCollapsed(b.dataset.ficheKind, b.dataset.blockId, b.classList.contains('is-collapsed'));
        // v582 : le mini-calendrier des disponibilites se rend dans son
        // conteneur a l'ouverture de la fiche ; si la brique etait repliee a
        // ce moment-la, le rendu peut s'etre perdu. Au depliage, on redessine
        // si le conteneur est reste vide. Meme garde viewer qu'a l'ouverture.
        if(!b.classList.contains('is-collapsed') && state.currentRole !== 'viewer') {
            const cal = b.querySelector('[id^="actor-calendar-"], [id^="crew-calendar-"]');
            if(cal && !cal.firstChild) {
                const m = cal.id.match(/^(actor|crew)-calendar-(\d+)$/);
                if(m) { try { UI.renderAvailabilityCalendar(cal.id, m[1], parseInt(m[2], 10)); } catch(e) {} }
            }
        }
    },
    // Une brique = carre gris repliable. opts.pin='right' epingle la brique
    // en haut de la colonne de droite (utilise pour « Dans le projet »).
    block: (kind, id, title, innerHtml, opts) => {
        opts = opts || {};
        const collapsed = FicheUI.isCollapsed(kind, id);
        return `<div class="fid-block${collapsed ? ' is-collapsed' : ''}" data-fiche-kind="${Utils.escape(kind)}" data-block-id="${Utils.escape(id)}"${opts.pin ? ` data-pin="${Utils.escape(opts.pin)}"` : ''} draggable="false">
            <div class="fid-block-head" onclick="app.FicheUI.toggleBlock(this)">
                <span class="fid-block-title"><span class="fid-block-grip" title="Déplacer" draggable="true" onclick="event.stopPropagation()">⠿</span>${title}</span>
                <span class="fid-block-chevron">▾</span>
            </div>
            <div class="fid-block-body">${innerHtml}</div>
        </div>`;
    }
};

// FICHE — MOTEUR D'EQUILIBRAGE DES BRIQUES (v581).
// Chaque fiche fournit une liste de briques (FicheUI.block). render() les
// pose dans un conteneur a deux colonnes ; balance() les repartit APRES
// affichage pour egaliser les hauteurs (mesure reelle du DOM). La brique
// marquee data-pin="right" reste en tete de la colonne de droite (les
// scenes). Le glisser-deposer manuel et « appliquer a toutes les fiches »
// viendront se brancher ici.
const FicheBlocks = {
    // ---- Disposition manuelle memorisee (par famille, sur l'appareil) ----
    // Des que l'utilisateur deplace une brique, on enregistre la disposition
    // { col0:[ids...], col1:[ids...] } ; tant qu'il n'y touche pas, c'est
    // l'equilibrage automatique par hauteur qui decide.
    _orderKey: 'moteur_fidorder',
    _orderState: null,
    _loadOrders: () => {
        if(FicheBlocks._orderState) return FicheBlocks._orderState;
        try { FicheBlocks._orderState = JSON.parse(localStorage.getItem(FicheBlocks._orderKey) || '{}') || {}; }
        catch(e) { FicheBlocks._orderState = {}; }
        return FicheBlocks._orderState;
    },
    getOrder: (kind) => FicheBlocks._loadOrders()[kind] || null,
    setOrder: (kind, layout) => {
        const s = FicheBlocks._loadOrders();
        if(layout) s[kind] = layout; else delete s[kind];
        try { localStorage.setItem(FicheBlocks._orderKey, JSON.stringify(s)); } catch(e) {}
    },

    _kindOf: (wrap) => {
        const b = wrap.querySelector('.fid-block');
        return b ? b.dataset.ficheKind : '';
    },

    render: (blocksHtmlArray) => {
        return `<div class="fid-blocks"><div class="fid-bcol">${blocksHtmlArray.join('')}</div><div class="fid-bcol"></div><div class="fid-blocks-reset"><button onclick="app.FicheBlocks.reset(this)" title="Revenir à la disposition automatique">↺ Disposition automatique</button></div></div>`;
    },

    // ---- ONGLETS DE FICHE (v588) ---------------------------------------
    // Table de repartition : par famille, la liste ORDONNEE des onglets et,
    // pour chacun, les identifiants de briques qu'il contient. Reordonner un
    // onglet = deplacer un identifiant ici (une seule ligne). Une brique
    // presente mais listee nulle part tombe dans un onglet « Autre » ; un
    // onglet dont aucune brique n'est presente est tout simplement masque.
    TABS: {
        actor: [
            { id: 'projet',     label: '🎬 Dans le projet',        blocks: ['projet'] },
            { id: 'photos',     label: '📸 Photos & démo',         blocks: ['galerie', 'demoreel'] },
            { id: 'contact',    label: '📇 Contact',               blocks: ['contact'] },
            { id: 'physique',   label: '📏 Physique',              blocks: ['identite', 'physique'] },
            { id: 'parcours',   label: '📝 Parcours',              blocks: ['bio'] },
            { id: 'logistique', label: '📅 Planning & logistique', blocks: ['dispos', 'vehicule', 'cachet'] }
        ],
        crew: [
            { id: 'projet',     label: '🎬 Dans le projet',        blocks: ['projet'] },
            { id: 'photos',     label: '📸 Photos & démo',         blocks: ['galerie', 'demoreel'] },
            { id: 'profil',     label: '🪪 Profil',                blocks: ['identite', 'contact'] },
            { id: 'parcours',   label: '📝 Parcours',              blocks: ['bio', 'notes'] },
            { id: 'logistique', label: '📅 Planning & logistique', blocks: ['dispos', 'vehicule', 'cachet'] }
        ],
        character: [
            { id: 'projet',   label: '🎬 Dans le projet', blocks: ['projet'] },
            { id: 'identite', label: '🪪 Identité',        blocks: ['identite'] },
            { id: 'physique', label: '📏 Physique',        blocks: ['physique'] },
            { id: 'casting',  label: '🎭 Casting',         blocks: ['casting'] },
            { id: 'notes',    label: '📝 Notes',           blocks: ['notes'] }
        ],
        location: [
            { id: 'projet',      label: '🎬 Dans le projet', blocks: ['projet'] },
            { id: 'lieu',        label: '📍 Lieu',           blocks: ['lieu', 'logistique'] },
            { id: 'photos',      label: '📸 Photos',         blocks: ['photos'] },
            { id: 'description', label: '📝 Description',     blocks: ['description', 'classement'] },
            { id: 'ideas',       label: '💡 Idées',           blocks: ['ideas'] }
        ],
        resource: [
            { id: 'projet',      label: '🎬 Dans le projet', blocks: ['projet'] },
            { id: 'fiche',       label: '📦 Fiche',          blocks: ['fiche', 'classement'] },
            { id: 'photos',      label: '📸 Photos',         blocks: ['galerie'] },
            { id: 'description', label: '📝 Description',     blocks: ['description'] },
            { id: 'ideas',       label: '💡 Idées',           blocks: ['ideas'] }
        ],
        org: [
            { id: 'projet',  label: '🎬 Sur ce projet',    blocks: ['projet'] },
            { id: 'fiche',   label: '🏛️ Identité',         blocks: ['fiche'] },
            { id: 'contact', label: '📇 Contact',           blocks: ['contact'] },
            { id: 'reseaux', label: '🔗 Présence',          blocks: ['reseaux'] },
            { id: 'origine', label: 'ℹ️ Origine',           blocks: ['origine'] }
        ],
        scene: [
            { id: 'projet',   label: '🎬 Dans le projet',      blocks: ['projet'] },
            { id: 'identite', label: '🎞️ Titre & repères',    blocks: ['identite'] },
            { id: 'liens',    label: '🔗 Décor & personnages', blocks: ['liens'] },
            { id: 'resume',   label: '📝 Résumé',              blocks: ['resume'] }
        ]
    },
    _blockIdOf: (html) => { const m = html.match(/data-block-id="([^"]+)"/); return m ? m[1] : ''; },
    // Repartit les briques deja construites entre les onglets de la famille.
    // N'ajoute AUCUNE structure a deux colonnes, donc balance() la laisse
    // tranquille : les briques gardent leur repli, on retire juste la poignee.
    renderTabbed: (blocksHtmlArray, kind) => {
        const conf = FicheBlocks.TABS[kind];
        if(!conf) return FicheBlocks.render(blocksHtmlArray);
        const byId = {};
        blocksHtmlArray.forEach(h => { const id = FicheBlocks._blockIdOf(h); if(id) byId[id] = h; });
        const used = {};
        const tabs = [];
        conf.forEach(t => {
            const html = t.blocks.map(id => { if(byId[id]) { used[id] = 1; return byId[id]; } return ''; }).join('');
            if(html) tabs.push({ id: t.id, label: t.label, html });
        });
        const leftover = blocksHtmlArray.filter(h => { const id = FicheBlocks._blockIdOf(h); return id && !used[id]; }).join('');
        if(leftover) tabs.push({ id: 'autre', label: '➕ Autre', html: leftover });
        if(!tabs.length) return FicheBlocks.render(blocksHtmlArray);
        // Onglet actif memorise par famille : un re-rendu (ajout de photo, favori,
        // renommage...) ne renvoie plus systematiquement sur le premier onglet.
        let activeIdx = tabs.findIndex(t => t.id === FicheBlocks._activeTab[kind]);
        if(activeIdx < 0) activeIdx = 0;
        const bar = tabs.map((t, i) => `<button type="button" class="fid-tab${i === activeIdx ? ' is-active' : ''}" data-tab="${Utils.escape(t.id)}" onclick="app.FicheBlocks.switchTab(this)">${t.label}</button>`).join('');
        const panels = tabs.map((t, i) => `<div class="fid-tabpanel${i === activeIdx ? ' is-active' : ''}" data-tab="${Utils.escape(t.id)}">${t.html}</div>`).join('');
        // v601 : le geste est pose une fois pour toutes, et l'estompe des bords
        // se relit apres l'affichage — la barre n'existe pas encore ici.
        FicheBlocks._poserGestes();
        setTimeout(FicheBlocks._marquerDebordement, 0);
        return `<div class="fid-tabs" data-fiche-kind="${Utils.escape(kind)}"><div class="fid-tabbar" role="tablist">${bar}</div>${panels}</div>`;
    },
    _activeTab: {},

    // ==================================================================
    //  GLISSER D'UN ONGLET A L'AUTRE (v601)
    // ==================================================================
    //  Demande du developpeur : « est-ce que ce ne serait pas plus joli, plus
    //  moderne, si on devait slider de gauche a droite ? » Oui pour le geste,
    //  non pour supprimer les onglets : avec cinq ou six sections, la barre
    //  est la CARTE de la fiche — elle dit ce qui existe sans y aller, et on
    //  ne lit pas une fiche de gauche a droite, on saute de la photo aux
    //  notes. Le glisse s'AJOUTE donc, la barre le suit.
    //
    //  UN SEUL ECOUTEUR POUR TOUTES LES FICHES, pose une fois. Les brancher a
    //  chaque rendu, c'est en oublier un — et en empiler dix sur le meme
    //  element quand la fiche se redessine.
    //
    //  ON NE VOLE PAS LE GESTE A CE QUI DEFILE DEJA : une galerie de photos,
    //  la barre elle-meme, un champ de texte. Sans cette reserve, faire
    //  defiler ses photos aurait change d'onglet.
    _gestesPoses: false,
    _poserGestes: () => {
        if(FicheBlocks._gestesPoses) return;
        FicheBlocks._gestesPoses = true;
        let mt = null;
        window.addEventListener('resize', () => {
            clearTimeout(mt);
            mt = setTimeout(FicheBlocks._marquerDebordement, 150);
        });
        // L'estompe ne change que le masque : elle ne modifie aucune taille,
        // donc surveiller la taille ici ne peut pas tourner en rond.
        try {
            FicheBlocks._observateur = new ResizeObserver((entrees) => {
                entrees.forEach(e => FicheBlocks._relire(e.target));
            });
        } catch(e) { FicheBlocks._observateur = null; }
        FicheBlocks._poserBords();
        let x0 = 0, y0 = 0, vise = null;
        document.addEventListener('touchstart', (ev) => {
            vise = null;
            if(!ev.touches || ev.touches.length !== 1) return;
            const t = ev.touches[0];
            const el = t.target;
            if(!el || !el.closest) return;
            const tabs = el.closest('.fid-tabs');
            if(!tabs) return;
            if(el.closest('.fid-tabbar, input, textarea, select, [contenteditable="true"]')) return;
            if(FicheBlocks._defileDeja(el, tabs)) return;
            vise = tabs; x0 = t.clientX; y0 = t.clientY;
        }, { passive: true });
        document.addEventListener('touchend', (ev) => {
            const tabs = vise; vise = null;
            if(!tabs || !ev.changedTouches || !ev.changedTouches.length) return;
            const t = ev.changedTouches[0];
            const dx = t.clientX - x0, dy = t.clientY - y0;
            // Franchement horizontal, et franchement long : un doigt qui
            // descend en biais ne doit pas changer de page.
            if(Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            FicheBlocks.glisser(tabs, dx < 0 ? 1 : -1);
        }, { passive: true });
    },
    _defileDeja: (el, tabs) => {
        let n = el;
        while(n && n !== tabs && n.nodeType === 1) {
            if(n.scrollWidth > n.clientWidth + 4) {
                const ov = getComputedStyle(n).overflowX;
                if(ov === 'auto' || ov === 'scroll') return true;
            }
            n = n.parentElement;
        }
        return false;
    },
    // sens : +1 vers la droite, -1 vers la gauche. ON NE BOUCLE PAS — revenir
    // au premier apres le dernier fait perdre ou l'on est.
    glisser: (tabs, sens) => {
        const btns = [...tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab')];
        const i = btns.findIndex(b => b.classList.contains('is-active'));
        const j = i + sens;
        if(i < 0 || j < 0 || j >= btns.length) return;
        FicheBlocks.switchTab(btns[j]);
    },
    // La ligne deborde-t-elle ? Si oui, ses bords s'estompent pour le dire.
    // Relu a chaque affichage : la largeur depend de la fenetre et du nombre
    // d'onglets, qui varie d'une famille a l'autre.
    // ==================================================================
    //  LA SOURIS PRES DU BORD FAIT DEFILER LA LIGNE (v601)
    // ==================================================================
    //  Au clavier et au doigt, on atteint les onglets caches ; a la souris,
    //  il fallait attraper une barre de defilement qu'on a justement masquee.
    //  Approcher le bord suffit maintenant. La vitesse suit la PROXIMITE :
    //  a peine entre dans la zone on avance lentement, colle au bord on
    //  avance vite — sinon on depasse toujours ce qu'on visait.
    //  ON S'ARRETE DES QUE LA BARRE NE DEBORDE PLUS OU QUE LA SOURIS PART :
    //  une boucle d'animation qui tourne pour rien est une boucle oubliee.
    ZONE_BORD: 46,        // largeur de la zone sensible, en pixels
    VITESSE_BORD: 9,      // pixels par image au plus fort
    _defilement: null,
    _poserBords: () => {
        document.addEventListener('mouseover', (ev) => {
            const barre = ev.target && ev.target.closest ? ev.target.closest('.fid-tabbar') : null;
            if(barre) FicheBlocks._suivreBord(barre);
        });
        document.addEventListener('mousemove', (ev) => {
            const d = FicheBlocks._defilement;
            if(d) d.x = ev.clientX;
        });
    },
    _suivreBord: (barre) => {
        if(FicheBlocks._defilement && FicheBlocks._defilement.barre === barre) return;
        FicheBlocks._defilement = { barre: barre, x: null };
        const partir = () => {
            if(FicheBlocks._defilement && FicheBlocks._defilement.barre === barre) FicheBlocks._defilement = null;
            barre.removeEventListener('mouseleave', partir);
        };
        barre.addEventListener('mouseleave', partir);
        const pas = () => {
            const d = FicheBlocks._defilement;
            if(!d || d.barre !== barre || !barre.isConnected) return;
            requestAnimationFrame(pas);
            if(d.x === null) return;
            if(barre.scrollWidth <= barre.clientWidth + 4) return;   // rien a faire defiler
            const r = barre.getBoundingClientRect();
            const aGauche = d.x - r.left;
            const aDroite = r.right - d.x;
            let v = 0;
            if(aGauche >= 0 && aGauche < FicheBlocks.ZONE_BORD) {
                v = -FicheBlocks.VITESSE_BORD * (1 - aGauche / FicheBlocks.ZONE_BORD);
            } else if(aDroite >= 0 && aDroite < FicheBlocks.ZONE_BORD) {
                v = FicheBlocks.VITESSE_BORD * (1 - aDroite / FicheBlocks.ZONE_BORD);
            }
            if(v) barre.scrollLeft += v;
        };
        requestAnimationFrame(pas);
    },

    _observateur: null,
    _relire: (barre) => {
        try { barre.classList.toggle('a-defilement', barre.scrollWidth > barre.clientWidth + 4); } catch(e) {}
    },
    _marquerDebordement: () => {
        document.querySelectorAll('.fid-tabbar').forEach(barre => {
            FicheBlocks._relire(barre);
            // UNE BARRE ENCORE INVISIBLE MESURE ZERO. La fiche est construite
            // avant que sa fenetre ne s'affiche : mesurer a cet instant donne
            // toujours « ca ne deborde pas ». Plutot que de deviner le bon
            // moment, on demande a etre prevenu quand elle prend sa taille.
            try {
                if(!barre._suivie && FicheBlocks._observateur) {
                    barre._suivie = true;
                    FicheBlocks._observateur.observe(barre);
                }
            } catch(e) {}
        });
    },

    switchTab: (btn) => {
        const tabs = btn.closest('.fid-tabs');
        if(!tabs) return;
        const id = btn.dataset.tab;
        if(tabs.dataset.ficheKind) FicheBlocks._activeTab[tabs.dataset.ficheKind] = id;
        // v601 : le panneau entre par le cote d'ou l'on vient. On le sait au
        // rang des onglets, pas au geste : cliquer un onglet plus a droite
        // doit donner la meme impression que glisser vers la gauche.
        const rangs = [...tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab')];
        const avant = rangs.findIndex(b => b.classList.contains('is-active'));
        const apres = rangs.indexOf(btn);
        tabs.style.setProperty('--fid-sens', (apres < avant ? '-10px' : '10px'));
        tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === id));
        // La ligne ne revient plus a la ligne : l'onglet choisi doit donc etre
        // ramene dans le champ de vision quand elle defile.
        try { btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch(e) {}
        // Le profil public pose ses onglets actifs lui-meme, sans passer par
        // ici au premier affichage : on relit l'estompe a chaque changement
        // plutot que de compter sur un seul point d'entree.
        FicheBlocks._marquerDebordement();
        let shown = null;
        tabs.querySelectorAll(':scope > .fid-tabpanel').forEach(p => { const on = p.dataset.tab === id; p.classList.toggle('is-active', on); if(on) shown = p; });
        // Un calendrier de dispo rendu dans un onglet cache doit etre redessine
        // a l'ouverture de son onglet (meme garde viewer qu'a l'ouverture).
        if(shown && state.currentRole !== 'viewer') {
            shown.querySelectorAll('[id^="actor-calendar-"],[id^="crew-calendar-"]').forEach(cal => {
                const m = cal.id.match(/^(actor|crew)-calendar-(\d+)$/);
                if(m) { try { UI.renderAvailabilityCalendar(cal.id, m[1], parseInt(m[2], 10)); } catch(e) {} }
            });
        }
    },

    // Appele apres affichage : applique la disposition manuelle si elle existe,
    // sinon equilibre par hauteur. Puis branche le glisser-deposer.
    balance: (rootEl) => {
        if(!rootEl) return;
        const wrap = rootEl.querySelector('.fid-blocks');
        if(!wrap) return;
        const cols = wrap.querySelectorAll('.fid-bcol');
        if(cols.length < 2) return;
        const kind = FicheBlocks._kindOf(wrap);
        const blocks = Array.from(wrap.querySelectorAll('.fid-block'));
        const byId = {};
        blocks.forEach(b => { byId[b.dataset.blockId] = b; });
        const twoCols = window.matchMedia('(min-width: 701px)').matches;
        cols[0].innerHTML = ''; cols[1].innerHTML = '';
        if(!twoCols) {
            blocks.forEach(b => cols[0].appendChild(b));
        } else {
            const saved = FicheBlocks.getOrder(kind);
            if(saved && (saved.col0 || saved.col1)) {
                // Disposition manuelle : on respecte l'ordre enregistre, puis
                // on place a la fin les briques nouvelles (non encore rangees).
                const placed = {};
                (saved.col0 || []).forEach(id => { if(byId[id]) { cols[0].appendChild(byId[id]); placed[id] = 1; } });
                (saved.col1 || []).forEach(id => { if(byId[id]) { cols[1].appendChild(byId[id]); placed[id] = 1; } });
                blocks.filter(b => !placed[b.dataset.blockId]).forEach(b => {
                    const t = cols[0].offsetHeight <= cols[1].offsetHeight ? cols[0] : cols[1];
                    t.appendChild(b);
                });
            } else {
                // Equilibrage automatique par hauteur. Brique epinglee a droite.
                const pinned = blocks.filter(b => b.dataset.pin === 'right');
                const rest = blocks.filter(b => b.dataset.pin !== 'right');
                pinned.forEach(b => cols[1].appendChild(b));
                rest.forEach(b => {
                    const t = cols[0].offsetHeight <= cols[1].offsetHeight ? cols[0] : cols[1];
                    t.appendChild(b);
                });
            }
        }
        FicheBlocks._wire(wrap);
    },

    // Enregistre la disposition courante des deux colonnes pour la famille.
    _save: (wrap) => {
        const kind = FicheBlocks._kindOf(wrap);
        if(!kind) return;
        const cols = wrap.querySelectorAll('.fid-bcol');
        const idsOf = (col) => Array.from(col.querySelectorAll('.fid-block')).map(b => b.dataset.blockId);
        FicheBlocks.setOrder(kind, { col0: idsOf(cols[0]), col1: idsOf(cols[1]) });
    },

    reset: (btn) => {
        const wrap = btn.closest('.fid-blocks');
        if(!wrap) return;
        const kind = FicheBlocks._kindOf(wrap);
        FicheBlocks.setOrder(kind, null);
        FicheBlocks.balance(wrap.parentElement);
    },

    // Glisser-deposer : la poignee ⠿ demarre le glisse ; on peut deposer sur
    // une autre brique (avant/apres) ou dans une colonne vide.
    _drag: null,
    _wire: (wrap) => {
        if(wrap._fidWired) return;
        wrap._fidWired = true;
        const cols = Array.from(wrap.querySelectorAll('.fid-bcol'));

        wrap.addEventListener('dragstart', (e) => {
            const grip = e.target.closest('.fid-block-grip');
            if(!grip) { e.preventDefault(); return; }
            const block = grip.closest('.fid-block');
            FicheBlocks._drag = block;
            block.classList.add('is-dragging');
            try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', block.dataset.blockId || ''); } catch(err) {}
        });
        wrap.addEventListener('dragend', () => {
            if(FicheBlocks._drag) FicheBlocks._drag.classList.remove('is-dragging');
            FicheBlocks._drag = null;
            wrap.querySelectorAll('.drop-before,.drop-after').forEach(b => b.classList.remove('drop-before', 'drop-after'));
            cols.forEach(c => c.classList.remove('is-drop-target'));
        });
        wrap.addEventListener('dragover', (e) => {
            if(!FicheBlocks._drag) return;
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'move'; } catch(err) {}
            wrap.querySelectorAll('.drop-before,.drop-after').forEach(b => b.classList.remove('drop-before', 'drop-after'));
            cols.forEach(c => c.classList.remove('is-drop-target'));
            const overBlock = e.target.closest('.fid-block');
            if(overBlock && overBlock !== FicheBlocks._drag) {
                const r = overBlock.getBoundingClientRect();
                overBlock.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
            } else {
                const col = e.target.closest('.fid-bcol');
                if(col) col.classList.add('is-drop-target');
            }
        });
        wrap.addEventListener('drop', (e) => {
            if(!FicheBlocks._drag) return;
            e.preventDefault();
            const dragged = FicheBlocks._drag;
            const overBlock = e.target.closest('.fid-block');
            if(overBlock && overBlock !== dragged) {
                const r = overBlock.getBoundingClientRect();
                if(e.clientY < r.top + r.height / 2) overBlock.parentElement.insertBefore(dragged, overBlock);
                else overBlock.parentElement.insertBefore(dragged, overBlock.nextSibling);
            } else {
                const col = e.target.closest('.fid-bcol');
                if(col) col.appendChild(dragged);
            }
            wrap.querySelectorAll('.drop-before,.drop-after').forEach(b => b.classList.remove('drop-before', 'drop-after'));
            cols.forEach(c => c.classList.remove('is-drop-target'));
            FicheBlocks._save(wrap);
        });
    }
};

// PLANCHE D'IDEES / CASTING (v588).
// Les idees (notes + photos de reference) sont stockees SUR la fiche elle-meme,
// dans item.board = [{ id, kind:'note'|'photo', text?, url?, ts }]. Elles heritent
// donc des droits de la section de leur fiche (aucune nouvelle cle de projet).
const Board = {
    _familyArray: (family) => {
        const map = { character: 'characters', actor: 'actors', crew: 'crew', location: 'locations', resource: 'resources', org: 'orgs', scene: 'scenes' };
        const key = map[family];
        return key ? (state.data[key] || null) : null;
    },
    _findItem: (family, id) => {
        const arr = Board._familyArray(family);
        return arr ? (arr.find(x => String(x.id) === String(id)) || null) : null;
    },
    list: (family, id) => { const it = Board._findItem(family, id); return (it && it.board) || []; },
    _newId: () => 'idea_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
    _rerender: (family, id) => {
        const w = document.getElementById('board-wrap-' + family + '-' + id);
        if(w) w.innerHTML = Board._inner(family, id, false);
    },
    addNote: (family, id) => {
        const it = Board._findItem(family, id);
        if(!it) return;
        if(!it.board) it.board = [];
        it.board.push({ id: Board._newId(), kind: 'note', text: '', ts: Date.now() });
        Store.save();
        Board._rerender(family, id);
    },
    updateNote: (family, id, ideaId, text) => {
        const it = Board._findItem(family, id);
        if(!it || !it.board) return;
        const idea = it.board.find(b => b.id === ideaId);
        if(idea) { idea.text = text; Store.saveDebounced(); }
    },
    remove: (family, id, ideaId) => {
        const it = Board._findItem(family, id);
        if(!it || !it.board) return;
        it.board = it.board.filter(b => b.id !== ideaId);
        Store.save();
        Board._rerender(family, id);
    },
    addPhoto: async (family, id) => {
        const it = Board._findItem(family, id);
        if(!it) return;
        const input = document.getElementById('board-photo-' + family + '-' + id);
        if(!input || !input.files || !input.files[0]) { Utils.toast('Choisissez une image.', 'warning'); return; }
        const file = input.files[0];
        input.value = '';
        Utils.toast('Envoi de la photo...', 'info', 1500);
        const url = await Utils.uploadProjectFile(file, { category: family, entityId: it.id || 'x', kind: 'board', maxDimension: 1920, quality: 0.9, maxKb: 1500 });
        if(!url) return;
        if(!it.board) it.board = [];
        it.board.push({ id: Board._newId(), kind: 'photo', url: url, ts: Date.now() });
        Store.save();
        Board._rerender(family, id);
    },
    // Ajoute un profil de l'Univers comme IDEE de casting sur la planche d'un
    // personnage : photo de reference (si dispo) + note « Idee casting : Nom ».
    // Utilise par la fenetre de casting (clic droit sur une carte ou bouton de
    // la fiche profil).
    addProfileIdea: (charId, profile) => {
        if(!charId || !profile) return;
        const it = Board._findItem('character', charId);
        if(!it) { Utils.toast('Personnage introuvable', 'warning'); return; }
        if(!it.board) it.board = [];
        const name = profile.name || profile.displayName || 'Profil';
        const photo = profile.photo || profile.photoURL || profile.mainPhoto || '';
        if(photo) it.board.push({ id: Board._newId(), kind: 'photo', url: photo, ts: Date.now() });
        const bits = [name]; if(profile.city) bits.push(profile.city);
        it.board.push({ id: Board._newId(), kind: 'note', text: 'Idée casting : ' + bits.join(' — '), ts: Date.now() });
        Store.save();
        Board._rerender('character', charId);
        Utils.toast('Ajouté aux idées de ' + (it.name || 'la fiche'), 'success');
    },
    // Contenu de la planche (sans l'enveloppe) : boutons d'ajout, bande de photos, liste de notes.
    _inner: (family, id, isView) => {
        const items = Board.list(family, id);
        const esc = Utils.escape;
        const fam = esc(family), sid = esc(String(id));
        let html = '';
        if(!isView) {
            html += `<div class="board-actions">
                <button class="btn btn--primary btn--sm" onclick="app.Board.addNote('${fam}','${sid}')">➕ Note</button>
                <input type="file" id="board-photo-${fam}-${sid}" accept="image/*" style="display:none;" onchange="app.Board.addPhoto('${fam}','${sid}')">
                <button class="btn btn--primary btn--sm" onclick="document.getElementById('board-photo-${fam}-${sid}').click()">📸 Photo</button>
            </div>`;
        }
        if(!items.length) {
            html += `<div class="board-empty">Aucune idée pour l'instant. Ajoute des notes ou des photos de référence.</div>`;
            return html;
        }
        const photos = items.filter(b => b.kind === 'photo');
        const notes = items.filter(b => b.kind === 'note');
        if(photos.length) {
            html += `<div class="board-scroller">`;
            photos.forEach(p => {
                html += `<div class="board-photo"><img src="${Utils.safeMediaUrl(p.url)}" alt="Idée de référence">${!isView ? `<button class="board-del" title="Supprimer" onclick="app.Board.remove('${fam}','${sid}','${esc(p.id)}')">✕</button>` : ''}</div>`;
            });
            html += `</div>`;
        }
        if(notes.length) {
            html += `<div class="board-notes">`;
            notes.forEach(n => {
                if(isView) {
                    html += `<div class="board-note">${esc(n.text || '')}</div>`;
                } else {
                    html += `<div class="board-note"><textarea class="board-note-input" placeholder="Idée, référence, remarque..." data-tooltip="Idée, référence, remarque..." oninput="app.Board.updateNote('${fam}','${sid}','${esc(n.id)}', this.value)">${esc(n.text || '')}</textarea><button class="board-del" title="Supprimer" onclick="app.Board.remove('${fam}','${sid}','${esc(n.id)}')">✕</button></div>`;
                }
            });
            html += `</div>`;
        }
        return html;
    },
    // ---- VUE SATELLITES (idees autour de la fiche, esprit Toile de liaisons) ----
    _satCtx: null,
    _onSatResize: null,
    _satNodes: null,
    _satZ: 10,
    _satSel: null,
    _satClearSel: () => {
        Board._satSel = null;
        const c = document.getElementById('board-sat-canvas');
        if(c) c.querySelectorAll('.board-sat-node.is-sel').forEach(el => el.classList.remove('is-sel'));
    },
    _satStartRubber: (e, canvas) => {
        e.preventDefault();
        Board._satClearSel();
        const rect = canvas.getBoundingClientRect();
        const x0 = e.clientX - rect.left, y0 = e.clientY - rect.top;
        const box = document.createElement('div');
        box.className = 'board-sat-rubber';
        canvas.appendChild(box);
        const move = (ev) => {
            const x1 = ev.clientX - rect.left, y1 = ev.clientY - rect.top;
            box.style.left = Math.min(x0, x1) + 'px'; box.style.top = Math.min(y0, y1) + 'px';
            box.style.width = Math.abs(x1 - x0) + 'px'; box.style.height = Math.abs(y1 - y0) + 'px';
        };
        const up = (ev) => {
            const x1 = ev.clientX - rect.left, y1 = ev.clientY - rect.top;
            const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
            box.remove();
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            const nodes = Board._satNodes || [];
            const sel = new Set();
            for(let i = 1; i < nodes.length; i++) {
                const n = nodes[i];
                if(n.x >= l && n.x <= r && n.y >= t && n.y <= b) sel.add(i);
            }
            if(sel.size) {
                Board._satSel = sel;
                canvas.querySelectorAll('.board-sat-node').forEach(el => {
                    if(!el.classList.contains('board-sat-centre') && sel.has(parseInt(el.dataset.si, 10))) el.classList.add('is-sel');
                });
            }
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },
    _satDragGroup: (e, canvas, nodes) => {
        e.preventDefault();
        const sel = Board._satSel;
        let lastX = e.clientX, lastY = e.clientY;
        const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
        sel.forEach(i => { if(nodes[i]) nodes[i].pinned = true; });
        const move = (ev) => {
            const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
            lastX = ev.clientX; lastY = ev.clientY;
            sel.forEach(i => { if(nodes[i]) { nodes[i].x += dx; nodes[i].y += dy; } });
            GraphPhysics.relax(nodes, W, H, 3);
            Board._satPaint();
        };
        const up = () => {
            sel.forEach(i => { if(nodes[i]) nodes[i].pinned = false; });
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },
    _satPaint: () => {
        const canvas = document.getElementById('board-sat-canvas');
        const nodes = Board._satNodes;
        if(!canvas || !nodes || !nodes.length) return;
        canvas.querySelectorAll('.board-sat-node').forEach(el => {
            const n = el.classList.contains('board-sat-centre') ? nodes[0] : nodes[parseInt(el.dataset.si, 10)];
            if(!n) return;
            el.style.left = (n.x - n.w / 2) + 'px';
            el.style.top = (n.y - n.h / 2) + 'px';
            el.style.width = n.w + 'px';
            el.style.height = n.h + 'px';
        });
        const svg = document.getElementById('board-sat-svg');
        if(svg) {
            const cx = nodes[0].x, cy = nodes[0].y;
            svg.querySelectorAll('.board-sat-line').forEach(line => {
                const n = nodes[parseInt(line.dataset.si, 10)];
                if(n) { line.setAttribute('x1', cx); line.setAttribute('y1', cy); line.setAttribute('x2', n.x); line.setAttribute('y2', n.y); }
            });
        }
    },
    _satMouseDown: (e) => {
        if(e.button && e.button !== 0) return;   // clic droit/milieu -> laisse le menu contextuel
        const canvas = document.getElementById('board-sat-canvas');
        const nodes = Board._satNodes || [];
        if(!canvas || !nodes.length) return;
        const el = e.target.closest('.board-sat-node');
        if(!el) { Board._satStartRubber(e, canvas); return; }   // clic dans le vide -> cadre
        e.preventDefault();
        const isCentre = el.classList.contains('board-sat-centre');
        const idx = isCentre ? 0 : parseInt(el.dataset.si, 10);
        if(!isCentre && Board._satSel && Board._satSel.size > 1 && Board._satSel.has(idx)) {
            Board._satDragGroup(e, canvas, nodes);              // pastille selectionnee -> groupe
            return;
        }
        Board._satClearSel();
        const nd = nodes[idx];
        if(!nd) return;
        if(!isCentre) el.style.zIndex = String(++Board._satZ); // au premier plan
        let lastX = e.clientX, lastY = e.clientY;
        const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
        const move = (ev) => {
            const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
            lastX = ev.clientX; lastY = ev.clientY;
            nd.x += dx; nd.y += dy;
            if(!isCentre) nd.pinned = true;          // la pastille tenue est figee
            GraphPhysics.relax(nodes, W, H, 3);       // les autres suivent et se repoussent (centre compris)
            Board._satPaint();
        };
        const up = () => { nd.pinned = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    },
    _satWheel: (e) => {
        const el = e.target.closest('.board-sat-node');
        if(!el || el.classList.contains('board-sat-centre')) return;
        const idx = parseInt(el.dataset.si, 10);
        const n = (Board._satNodes || [])[idx];
        if(!n) return;
        e.preventDefault();
        const canvas = document.getElementById('board-sat-canvas');
        const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        // Fraction du curseur DANS la pastille avant zoom (pour garder le point
        // sous la souris a la meme place apres redimensionnement).
        const fx = n.w ? (mx - (n.x - n.w / 2)) / n.w : 0.5;
        const fy = n.h ? (my - (n.y - n.h / 2)) / n.h : 0.5;
        n._scale = Math.max(0.4, Math.min(8, (n._scale || 1) + (e.deltaY < 0 ? 0.18 : -0.18)));
        n.w = n.bw * n._scale; n.h = n.bh * n._scale;
        // Recentre pour que le point vise reste sous le curseur
        n.x = mx - fx * n.w + n.w / 2;
        n.y = my - fy * n.h + n.h / 2;
        el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
        el.style.left = (n.x - n.w / 2) + 'px'; el.style.top = (n.y - n.h / 2) + 'px';
        const svg = document.getElementById('board-sat-svg');
        if(svg) { const line = svg.querySelector('.board-sat-line[data-si="' + idx + '"]'); if(line) { line.setAttribute('x2', n.x); line.setAttribute('y2', n.y); } }
    },
    _satDblClick: (e) => {
        const el = e.target.closest('.board-sat-node');
        if(!el || el.classList.contains('board-sat-centre')) return;
        const n = (Board._satNodes || [])[parseInt(el.dataset.si, 10)];
        if(!n) return;
        n._big = !n._big;
        n._scale = n._big ? 1.9 : 1;
        n.w = n.bw * n._scale; n.h = n.bh * n._scale;
        el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
        el.style.left = (n.x - n.w / 2) + 'px'; el.style.top = (n.y - n.h / 2) + 'px';
    },
    // Peut-on ecrire sur la planche de la fiche au centre ? (droit de sa section)
    _satCanEdit: () => {
        const ctx = Board._satCtx;
        if(!ctx) return false;
        return (typeof Permissions === 'undefined' || !Permissions.canEditFiche) ? true : Permissions.canEditFiche(ctx.family);
    },
    _satCloseMenu: () => {
        const m = document.getElementById('board-sat-menu');
        if(m) m.remove();
    },
    // Clic droit sur la fiche au centre : petit menu « Ajouter une note » /
    // « Ajouter une image » pour enrichir la planche sans repasser par la fiche.
    _satCtxMenu: (e) => {
        const centre = e.target.closest('.board-sat-centre');
        if(!centre) return;
        e.preventDefault();
        Board._satCloseMenu();
        if(!Board._satCanEdit()) return;
        const canvas = document.getElementById('board-sat-canvas');
        if(!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.id = 'board-sat-menu';
        menu.style.cssText = 'position:absolute; z-index:10000; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 6px 20px rgba(0,0,0,0.35); padding:4px; min-width:190px;';
        menu.style.left = Math.max(0, Math.min(e.clientX - rect.left, rect.width - 200)) + 'px';
        menu.style.top = Math.max(0, Math.min(e.clientY - rect.top, rect.height - 96)) + 'px';
        const mk = (label, fn) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText = 'display:block; width:100%; text-align:left; background:none; border:none; padding:9px 12px; border-radius:6px; cursor:pointer; color:var(--text-main); font-size:0.9rem;';
            b.onmouseover = () => { b.style.background = 'var(--highlight)'; };
            b.onmouseout = () => { b.style.background = 'none'; };
            b.addEventListener('click', () => { Board._satCloseMenu(); fn(); });
            return b;
        };
        menu.appendChild(mk('📝 Ajouter une note', Board._satAddNote));
        menu.appendChild(mk('📸 Ajouter une image', Board._satAddPhoto));
        canvas.appendChild(menu);
        setTimeout(() => {
            const off = (ev) => { if(!ev.target.closest('#board-sat-menu')) { Board._satCloseMenu(); document.removeEventListener('mousedown', off, true); } };
            document.addEventListener('mousedown', off, true);
        }, 0);
    },
    _satAddNote: async () => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it) return;
        let text = '';
        try { text = await ConfirmModal.prompt('Texte de la note', '📝 Nouvelle note', 'Idée, référence, remarque…'); } catch(_) { text = ''; }
        if(text == null) return;
        text = String(text).trim();
        if(!text) return;
        if(!it.board) it.board = [];
        it.board.push({ id: Board._newId(), kind: 'note', text: text, ts: Date.now() });
        Store.save();
        Board._renderSatellites();
    },
    _satAddPhoto: () => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            if(file) {
                Utils.toast('Envoi de la photo...', 'info', 1500);
                const url = await Utils.uploadProjectFile(file, { category: ctx.family, entityId: it.id || 'x', kind: 'board', maxDimension: 1920, quality: 0.9, maxKb: 1500 });
                if(url) {
                    if(!it.board) it.board = [];
                    it.board.push({ id: Board._newId(), kind: 'photo', url: url, ts: Date.now() });
                    Store.save();
                    Board._renderSatellites();
                }
            }
            input.remove();
        });
        input.click();
    },
    // Croix : supprime la note/photo directement depuis la vue satellites.
    _satRemove: (i) => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const n = (Board._satNodes || [])[i];
        if(!n || !n.idea) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it || !it.board) return;
        it.board = it.board.filter(b => b.id !== n.idea.id);
        Store.save();
        Board._renderSatellites();
    },
    // Coeur : marque/demarque une idee comme favorite (la fait ressortir).
    _satToggleFav: (i) => {
        const ctx = Board._satCtx;
        if(!ctx || !Board._satCanEdit()) return;
        const n = (Board._satNodes || [])[i];
        if(!n || !n.idea) return;
        n.idea.fav = !n.idea.fav;
        Store.save();
        // Mise a jour EN PLACE (pas de re-render) : les zooms restent.
        const canvas = document.getElementById('board-sat-canvas');
        const el = canvas && canvas.querySelector('.board-sat-node[data-si="' + i + '"]');
        if(el) {
            el.classList.toggle('is-fav', !!n.idea.fav);
            const btn = el.querySelector('.board-sat-fav');
            if(btn) { btn.classList.toggle('on', !!n.idea.fav); btn.textContent = n.idea.fav ? '❤' : '🤍'; btn.title = n.idea.fav ? 'Retirer des favoris' : "J'aime"; }
        }
    },
    // Ajuste la pastille photo au FORMAT reel de l'image une fois chargee
    // (fini le carre qui rognait) ; conserve le centre et le zoom courant.
    _satFitPhoto: (img) => {
        try {
            const el = img.closest('.board-sat-node');
            if(!el) return;
            const i = parseInt(el.dataset.si, 10);
            const n = (Board._satNodes || [])[i];
            if(!n) return;
            const nw = img.naturalWidth, nh = img.naturalHeight;
            if(!nw || !nh) return;
            const L = 150; // plus grand cote de base
            let w, h;
            if(nw >= nh) { w = L; h = Math.round(L * nh / nw); }
            else { h = L; w = Math.round(L * nw / nh); }
            n.bw = w; n.bh = h;
            const sc = n._scale || 1;
            n.w = w * sc; n.h = h * sc;
            el.style.width = n.w + 'px'; el.style.height = n.h + 'px';
            el.style.left = (n.x - n.w / 2) + 'px'; el.style.top = (n.y - n.h / 2) + 'px';
        } catch(_) {}
    },
    openSatellites: (family, id) => {
        const it = Board._findItem(family, id);
        if(!it) return;
        const old = document.getElementById('board-sat-modal');
        if(old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'board-sat-modal';
        wrap.className = 'board-sat-modal';
        wrap.onclick = (e) => { if(e.target === wrap) Board.closeSatellites(); };
        wrap.innerHTML = `<div class="board-sat-head"><span class="board-sat-title">💡 Idées — ${Utils.escape(it.name || '')}</span><button class="board-sat-close" type="button" onclick="app.Board.closeSatellites()">✖</button></div><div class="board-sat-canvas" id="board-sat-canvas"><svg class="board-sat-svg" id="board-sat-svg"></svg></div>`;
        document.body.appendChild(wrap);
        const _c = document.getElementById('board-sat-canvas');
        if(_c) { _c.addEventListener('mousedown', Board._satMouseDown); _c.addEventListener('dblclick', Board._satDblClick); _c.addEventListener('wheel', Board._satWheel, { passive: false }); _c.addEventListener('contextmenu', Board._satCtxMenu); }
        Board._satCtx = { family: family, id: id };
        Board._onSatResize = () => Board._renderSatellites();
        window.addEventListener('resize', Board._onSatResize);
        requestAnimationFrame(() => Board._renderSatellites());
    },
    closeSatellites: () => {
        if(Board._onSatResize) { window.removeEventListener('resize', Board._onSatResize); Board._onSatResize = null; }
        const m = document.getElementById('board-sat-modal');
        if(m) m.remove();
        Board._satCtx = null;
    },
    _renderSatellites: () => {
        const ctx = Board._satCtx;
        if(!ctx) return;
        const it = Board._findItem(ctx.family, ctx.id);
        if(!it) return;
        const canvas = document.getElementById('board-sat-canvas');
        const svg = document.getElementById('board-sat-svg');
        if(!canvas || !svg) return;
        const items = it.board || [];
        // Memoriser zoom/format/position par idee pour les restituer apres
        // reconstruction (un ajout/suppression ne doit pas remettre les zooms a zero).
        const prev = {};
        (Board._satNodes || []).forEach(nd => { if(nd && nd.idea && nd.idea.id) prev[nd.idea.id] = nd; });
        Board._satSel = null;
        const W = canvas.clientWidth || 900, H = canvas.clientHeight || 600;
        const cx = W / 2, cy = H / 2;
        const centre = { center: true, x: cx, y: cy, w: 160, h: 64 };
        const nodes = [centre];
        const R = Math.max(150, Math.min(W, H) / 2 - 90);
        const ring = (arr, kind, baseDeg, w, h) => {
            const n = arr.length;
            arr.forEach((b, i) => {
                const t = n <= 1 ? 0.5 : i / (n - 1);
                const ang = (baseDeg - 70 + 140 * t) * Math.PI / 180;
                const ox = Math.cos(ang) * R, oy = Math.sin(ang) * R;
                nodes.push({ kind: kind, idea: b, w: w, h: h, bw: w, bh: h, ox: ox, oy: oy, x: cx + ox, y: cy + oy });
            });
        };
        ring(items.filter(b => b.kind === 'photo'), 'photo', 0, 116, 116);
        ring(items.filter(b => b.kind === 'note'), 'note', 180, 168, 78);
        GraphPhysics.relax(nodes, W, H, 140);
        // Restituer l'etat memorise (zoom, format image, position) des idees deja affichees.
        for(let k = 1; k < nodes.length; k++) {
            const nd = nodes[k];
            if(!nd.idea) continue;
            const p = prev[nd.idea.id];
            if(!p) continue;
            if(p.bw) { nd.bw = p.bw; nd.bh = p.bh; }
            if(p._scale) nd._scale = p._scale;
            nd._big = p._big;
            const sc = nd._scale || 1;
            nd.w = nd.bw * sc; nd.h = nd.bh * sc;
            if(typeof p.x === 'number' && typeof p.y === 'number') { nd.x = p.x; nd.y = p.y; }
        }
        Board._satNodes = nodes;
        svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        let lines = '';
        for(let i = 1; i < nodes.length; i++) {
            lines += `<line x1="${cx}" y1="${cy}" x2="${nodes[i].x}" y2="${nodes[i].y}" class="board-sat-line" data-si="${i}"></line>`;
        }
        svg.innerHTML = lines;
        const esc = Utils.escape;
        const canEdit = Board._satCanEdit();
        // Coeur (favori) + croix (supprimer) sur chaque pastille. En lecture
        // seule, seul le coeur plein reste, comme repere.
        const ctrls = (i, fav) => {
            const heart = canEdit
                ? `<button class="board-sat-fav${fav ? ' on' : ''}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.Board._satToggleFav(${i})" title="${fav ? 'Retirer des favoris' : "J'aime"}">${fav ? '❤' : '🤍'}</button>`
                : (fav ? `<span class="board-sat-fav on">❤</span>` : '');
            const cross = canEdit
                ? `<button class="board-sat-x" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.Board._satRemove(${i})" title="Supprimer">✕</button>`
                : '';
            const topHtml = heart ? `<div class="board-sat-ctrls">${heart}</div>` : '';
            const botHtml = cross ? `<div class="board-sat-ctrls board-sat-ctrls-br">${cross}</div>` : '';
            return topHtml + botHtml;
        };
        let bubbles = `<div class="board-sat-node board-sat-centre" style="left:${centre.x - centre.w / 2}px; top:${centre.y - centre.h / 2}px; width:${centre.w}px; height:${centre.h}px;">${esc(it.name || 'Fiche')}</div>`;
        for(let i = 1; i < nodes.length; i++) {
            const n = nodes[i];
            const st = `left:${n.x - n.w / 2}px; top:${n.y - n.h / 2}px; width:${n.w}px; height:${n.h}px;`;
            const fav = !!(n.idea && n.idea.fav);
            const favCls = fav ? ' is-fav' : '';
            if(n.kind === 'photo') {
                bubbles += `<div class="board-sat-node board-sat-photo${favCls}" data-si="${i}" style="${st}"><img src="${Utils.safeMediaUrl(n.idea.url)}" alt="Idée de référence" onload="app.Board._satFitPhoto(this)">${ctrls(i, fav)}</div>`;
            } else {
                bubbles += `<div class="board-sat-node board-sat-noteb${favCls}" data-si="${i}" style="${st}">${esc(n.idea.text || '(note vide)')}${ctrls(i, fav)}</div>`;
            }
        }
        if(nodes.length === 1) {
            bubbles += `<div class="board-sat-empty">Aucune idée pour l'instant. Clic droit sur la fiche au centre pour ajouter une note ou une image.</div>`;
        }
        canvas.querySelectorAll('.board-sat-node,.board-sat-empty').forEach(el => el.remove());
        canvas.insertAdjacentHTML('beforeend', bubbles);
    },
    render: (family, id, isView) => `<div class="board-wrap" id="board-wrap-${Utils.escape(family)}-${Utils.escape(String(id))}">${Board._inner(family, id, isView)}</div>`
};

// ============================================================
// LECTEUR PHOTO reutilisable pour les galeries de fiches
// (comedien, decor, technicien). Defilement gauche/droite, coeur
// (favori, stocke dans entity.galleryFav) et croix (supprimer via la
// fonction de suppression propre a chaque famille).
// ============================================================
const PhotoViewer = {
    _coll: null, _idx: 0, _i: 0, _photos: [],
    _famOf: { actors: 'actor', locations: 'location', crew: 'crew', resources: 'resource' },
    _removeFn: {
        actors: (idx, i) => Actions.removeActorGalleryPhoto(idx, i),
        locations: (idx, i) => Actions.removeLocationPhoto(idx, i),
        crew: (idx, i) => Crew.removeGalleryPhoto(idx, i),
        resources: (idx, i) => Resources.removeGalleryPhoto(idx, i)
    },
    _entity: () => { const c = PhotoViewer._coll; return (c && state.data[c] && state.data[c][PhotoViewer._idx]) || null; },
    _canEdit: () => {
        const fam = PhotoViewer._famOf[PhotoViewer._coll];
        return (typeof Permissions === 'undefined' || !Permissions.canEditFiche) ? true : Permissions.canEditFiche(fam);
    },
    open: (coll, idx, start) => {
        const ent = state.data[coll] && state.data[coll][idx];
        if(!ent) return;
        const photos = ent.galleryPhotos || [];
        if(!photos.length) return;
        PhotoViewer._coll = coll; PhotoViewer._idx = idx; PhotoViewer._photos = photos;
        PhotoViewer._i = Math.max(0, Math.min(start || 0, photos.length - 1));
        let ov = document.getElementById('pv-overlay');
        if(!ov) {
            ov = document.createElement('div');
            ov.id = 'pv-overlay'; ov.className = 'pv-overlay';
            ov.addEventListener('click', (e) => { if(e.target === ov) PhotoViewer.close(); });
            document.body.appendChild(ov);
            document.addEventListener('keydown', PhotoViewer._onKey);
        }
        PhotoViewer._render();
    },
    close: () => {
        const ov = document.getElementById('pv-overlay');
        if(ov) ov.remove();
        document.removeEventListener('keydown', PhotoViewer._onKey);
    },
    _onKey: (e) => {
        if(!document.getElementById('pv-overlay')) return;
        if(e.key === 'Escape') PhotoViewer.close();
        else if(e.key === 'ArrowLeft') PhotoViewer.prev();
        else if(e.key === 'ArrowRight') PhotoViewer.next();
    },
    prev: () => { const n = PhotoViewer._photos.length; if(!n) return; PhotoViewer._i = (PhotoViewer._i - 1 + n) % n; PhotoViewer._render(); },
    next: () => { const n = PhotoViewer._photos.length; if(!n) return; PhotoViewer._i = (PhotoViewer._i + 1) % n; PhotoViewer._render(); },
    _toggleFav: () => {
        const ent = PhotoViewer._entity();
        if(!ent || !PhotoViewer._canEdit()) return;
        const url = PhotoViewer._photos[PhotoViewer._i];
        if(!url) return;
        if(!Array.isArray(ent.galleryFav)) ent.galleryFav = [];
        const k = ent.galleryFav.indexOf(url);
        if(k === -1) ent.galleryFav.push(url); else ent.galleryFav.splice(k, 1);
        Store.save();
        PhotoViewer._refreshSource();
        PhotoViewer._render();
    },
    _refreshSource: () => {
        if(PhotoViewer._coll === 'resources') { if(typeof Resources !== 'undefined' && Resources._refreshGalleryGrid) Resources._refreshGalleryGrid(PhotoViewer._idx); }
        else if(typeof CardModal !== 'undefined' && CardModal.refresh) CardModal.refresh();
    },
    _delete: async () => {
        const ent = PhotoViewer._entity();
        if(!ent || !PhotoViewer._canEdit()) return;
        const i = PhotoViewer._i;
        const fn = PhotoViewer._removeFn[PhotoViewer._coll];
        if(fn) await fn(PhotoViewer._idx, i);
        const ent2 = PhotoViewer._entity();
        const photos = (ent2 && ent2.galleryPhotos) || [];
        PhotoViewer._photos = photos;
        if(!photos.length) { PhotoViewer.close(); return; }
        PhotoViewer._i = Math.min(i, photos.length - 1);
        PhotoViewer._render();
    },
    _render: () => {
        const ov = document.getElementById('pv-overlay');
        if(!ov) return;
        const ent = PhotoViewer._entity();
        const photos = PhotoViewer._photos || [];
        const url = photos[PhotoViewer._i] || '';
        const n = photos.length;
        const canEdit = PhotoViewer._canEdit();
        const fav = !!(ent && Array.isArray(ent.galleryFav) && ent.galleryFav.includes(url));
        const esc = Utils.escape;
        const nav = n > 1
            ? `<button class="pv-nav pv-prev" onclick="event.stopPropagation(); app.PhotoViewer.prev()" title="Précédente">‹</button><button class="pv-nav pv-next" onclick="event.stopPropagation(); app.PhotoViewer.next()" title="Suivante">›</button>`
            : '';
        const actions = canEdit
            ? `<div class="pv-actions"><button class="pv-fav${fav ? ' on' : ''}" onclick="event.stopPropagation(); app.PhotoViewer._toggleFav()" title="${fav ? 'Retirer des favoris' : "J'aime"}">${fav ? '❤' : '🤍'}</button><button class="pv-del" onclick="event.stopPropagation(); app.PhotoViewer._delete()" title="Supprimer">✕</button></div>`
            : (fav ? `<div class="pv-actions"><span class="pv-fav on">❤</span></div>` : '');
        ov.innerHTML = `<button class="pv-close" onclick="event.stopPropagation(); app.PhotoViewer.close()" title="Fermer">✕</button>${n > 1 ? `<div class="pv-count">${PhotoViewer._i + 1} / ${n}</div>` : ''}<img class="pv-img" src="${esc(Utils.safeMediaUrl(url))}" alt="Photo">${nav}${actions}`;
    }
};

const CardModal = {
    currentType: null,
    currentIdx: null,
    
    // Verrou de lecture seule de la FENETRE, pose par chaque ouverture selon la
    // famille de la fiche. La fenetre ne vit pas dans l'onglet actif : elle
    // echappait donc au verrou pose par switchTab, et une fiche ouverte depuis
    // un onglet en 👁️ apparaissait modifiable. Appele par les sept portes.
    applyRights: (kind) => {
        const body = document.getElementById('card-edit-modal-body');
        if(!body) return true;
        const ok = (typeof Permissions === 'undefined' || !Permissions.canEditFiche) ? true : Permissions.canEditFiche(kind);
        const b = body.querySelector('.perm-ro-banner');
        if(b) b.remove();
        body.classList.toggle('is-perm-readonly', !ok);
        if(!ok) {
            const d = document.createElement('div');
            d.className = 'perm-ro-banner';
            d.textContent = '👁 Lecture seule — vous n\'avez pas les droits de modification sur cette fiche.';
            body.prepend(d);
        }
        return ok;
    },
    
    open: (type, idx) => {
        const item = state.data[type][idx];
        if(!item) return;
        // v601 — C'EST UNE PORTE. On y entrait sans rien prendre : cliquer une
        // vignette de Casting ou de Decors n'allumait donc rien chez les
        // autres, alors que UI.openFiche — l'autre chemin vers la meme fiche —
        // prenait bien le verrou. Deux entrees pour une meme piece, une seule
        // gardee.
        {
            const esp = { characters: 'character', actors: 'actor', locations: 'location' }[type];
            const nom = { characters: 'Ce personnage', actors: 'Cette fiche comédien', locations: 'Ce décor' }[type];
            if(esp) {
                try { if(typeof FicheLock !== 'undefined'
                         && FicheLock.ouvrir(esp, item.id, nom) === false) return; } catch(e) {}
            }
        }
        CardModal.currentType = type;
        CardModal.currentIdx = idx;
        CardModal.currentId = item.id;
        
        const modal = document.getElementById('card-edit-modal');
        const title = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        
        const typeLabels = { characters: '🎭 Personnage', actors: '🎬 Comédien·ne', locations: '🏠 Décor' };
        // v581 : personnage, comedien et decor portent leur propre en-tete
        // (nom + type + numero de fiche) dans le gabarit universel — la barre
        // de la fenetre ne repete que la famille.
        title.textContent = typeLabels[type];
        
        // Réutiliser le même code que les fiches détaillées
        const tempContainer = document.createElement('div');
        tempContainer.className = 'data-grid';
        
        let groupType = '';
        if(type === 'characters') groupType = 'perso';
        else if(type === 'actors') groupType = 'actor';
        else if(type === 'locations') groupType = 'lieu';
        const relevantGroups = state.data.groups.filter(g => g.type === groupType);
        
        // Utiliser exactement le même rendu que le mode détaillé
        // Le rendu de la carte consulte lui-meme le droit de la SECTION
        // D'ORIGINE (voir renderDataCards) : rien a lui imposer ici.
        UI.renderDataCards([item], type, tempContainer, relevantGroups);
        
        // Extraire et adapter la carte pour le modal
        const cardContent = tempContainer.querySelector('.data-card');
        body.innerHTML = '';
        if(cardContent) {
            cardContent.style.border = 'none';
            cardContent.style.boxShadow = 'none';
            cardContent.style.maxWidth = 'none';
            cardContent.style.margin = '0';
            body.appendChild(cardContent);
        }
        
        CardModal.applyRights({ characters: 'character', actors: 'actor', locations: 'location' }[type]);
        modal.classList.add('visible');
        // v581 : les fiches en briques (fid-blocks) sont equilibrees par
        // hauteur une fois visibles (mesure reelle du DOM).
        requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
        
        // Initialiser les calendriers si nécessaire
        if(type === 'actors') {
            setTimeout(() => {
                const calContainer = document.getElementById('actor-calendar-' + idx);
                if(calContainer && state.currentRole !== 'viewer') {
                    UI.renderAvailabilityCalendar('actor-calendar-' + idx, 'actor', idx);
                }
            }, 100);
        }
    },
    
    close: () => {
        const modal = document.getElementById('card-edit-modal');
        Utils.fermetureDouce(modal);   // v601 : elle s'en va en fondu
        CardModal.currentType = null;
        CardModal.currentIdx = null;
        CardModal.currentId = null;
        // Rafraîchir les vues compactes après fermeture
        const activeTab = document.querySelector('.tab-content.active');
        if(activeTab) {
            const tabId = activeTab.id;
            if(tabId === 'tab-chars') UI.renderDataTab('characters', els.charContainer);
            else if(tabId === 'tab-actors') UI.renderDataTab('actors', els.actorContainer);
            else if(tabId === 'tab-locs') UI.renderDataTab('locations', els.locContainer);
            else if(tabId === 'tab-crew') UI.renderCrewTab();
            // 7d : une fiche peut desormais s'ouvrir depuis le depouillement
            // sans changer d'onglet. Si son nom a ete modifie, les etiquettes
            // et les infobulles doivent suivre.
            else if(tabId === 'tab-breakdown' && typeof Breakdown !== 'undefined' && Breakdown.init) Breakdown.init();
            // Idem pour le storyboard : renommer un plan depuis sa fiche doit se
            // voir sur sa carte, sans quoi l'ancien nom reste a l'ecran.
            else if(tabId === 'tab-storyboard' && typeof Storyboard !== 'undefined' && Storyboard.renderShots && Storyboard.currentSceneId) {
                try { Storyboard.renderShots(); } catch(e) { console.error('CardModal.close/renderShots', e); }
            }
        }
    },
    
    // Fiche de scène. Le séquencier, la feuille de service et le PDF lisent
    // tous le résumé, les personnages, la durée, le décor et le jour de récit
    // d'une scène, mais rien ne permettait de les corriger sans repasser par le
    // formulaire du séquencier — d'où les cases rouges non cliquables de la
    // feuille. Écrit champ par champ, sans jamais remplacer l'objet scène.
    openScene: (id) => {
        const scenes = state.data.scenes || [];
        const idx = scenes.findIndex(x => x && String(x.id) === String(id));
        if(idx < 0) { Utils.toast('Scène introuvable.', 'error'); return; }
        const sc = scenes[idx];
        CardModal.currentType = 'scenes';
        CardModal.currentIdx = idx;
        CardModal.currentId = sc.id;
        const modal = document.getElementById('card-edit-modal');
        const titleEl = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        // Une scene appartient au sequencier : c'est son droit qui commande,
        // pas seulement le role global.
        const dis = (typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('scene')) ? 'disabled' : '';
        const decor = PlanningFDS.decor(sc);
        const names = (state.data.locations || []).map(l => l.name).filter(Boolean);
        if(decor && !names.includes(decor)) names.unshift(decor);
        // v581/v582 : la barre de la fenetre ne repete que la famille, le nom
        // vit dans l'en-tete du gabarit universel (FicheUI.headHtml).
        if(titleEl) titleEl.textContent = '🎬 Scène';
        // Le titre d'une scene n'est pas un texte libre : c'est un triptyque
        // effet / decor / moment, ecrit « INT. CUISINE - JOUR » par convention.
        // Il n'etait editable que par la bande de saisie du sequencier ; depuis
        // le 26 aout cette bande n'existe plus et la fiche porte les trois
        // morceaux. Ils s'ecrivent au fil de l'eau comme le reste.
        // v582 : la fiche scene rejoint le gabarit en BRIQUES de v581 (en-tete
        // commun + carres gris repliables, equilibres apres affichage). Le nom
        // d'en-tete n'est PAS editable ici : le titre est COMPOSE du triptyque,
        // un champ libre ouvrirait une divergence avec la convention.
        const tp = Utils.sceneTitleParts(sc.title);
        const scid = Utils.escape(String(sc.id));
        const delBtn = dis ? '' : `<button onclick="app.Actions.deleteScene('${scid}')" style="color:var(--danger);border:none;background:none;cursor:pointer" title="Supprimer la scène">🗑️</button>`;
        const blocks = [];

        // Brique « Dans le projet » — epinglee en haut a droite, comme sur les
        // six autres familles : tournee le, plans, cout.
        // Plans de la scene, dans leur ordre de storyboard. Chaque pastille
        // ouvre la fiche du plan : c'est la seule facon d'y acceder sans
        // passer par l'onglet Storyboard et sa grille.
        const shots = (state.data.shots || []).filter(s => s && s.sceneId === sc.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        let plansHtml = '';
        if(shots.length) {
            const tags = shots.map((s, i) => {
                const lbl = 'Plan ' + (i + 1) + (s.name ? ' — ' + String(s.name).slice(0, 30) : '');
                return `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('shot','${Utils.escape(String(s.id))}')" title="${Utils.escape(s.shotType || '')}">${Utils.escape(lbl)}</span>`;
            }).join(' ');
            plansHtml = `<div class="appearances-section"><span class="appearances-label">🎬 Plans (${shots.length}) :</span> ${tags}</div>`;
        }
        let projHtml = UI.renderShootDays('scene', sc.id, '📅 Tournée le') + plansHtml + UI.renderCost('scene', sc.id);
        if(!projHtml) projHtml = '<span class="text-sec-xs">Pas encore planifiée ni découpée en plans</span>';
        blocks.push(FicheUI.block('scene', 'projet', '🎬 Dans le projet', projHtml, { pin: 'right' }));

        // Brique « Titre & reperes » — le triptyque (colonnes resserrees pour
        // la demi-largeur d'une brique), la duree et le chrono.
        const idHtml = `
            <div style="display:grid; grid-template-columns:55px minmax(0,1fr) 105px; gap:8px; align-items:end; margin-bottom:10px;">
                <div>
                    <label class="form-label-block">Effet</label>
                    <input class="actor-input" id="fsc-pre" list="fsc-pre-list" placeholder="INT" data-tooltip="INT" value="${Utils.escape(tp.pre)}" onchange="app.CardModal.setSceneTitlePart('${scid}','pre',this.value)" ${dis}>
                    <datalist id="fsc-pre-list"><option value="INT"></option><option value="EXT"></option><option value="INT./EXT."></option></datalist>
                </div>
                <div class="autocomplete-wrapper" style="position:relative; margin-bottom:0;">
                    <label class="form-label-block" style="display:flex; align-items:center; gap:5px;">Décor (titre) <button type="button" onclick="app.FicheLinks.createDecorFromScene('${scid}')" ${dis} title="Enregistrer ce lieu comme nouveau décor et le lier à la scène" style="width:15px; height:15px; padding:0; border:none; border-radius:50%; background:var(--primary); color:#fff; font-size:11px; line-height:1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">+</button></label>
                    <input class="actor-input" id="fsc-loc" placeholder="LIEU" data-tooltip="LIEU" style="width:100%;" value="${Utils.escape(tp.loc)}" onchange="app.CardModal.setSceneTitlePart('${scid}','loc',this.value)" ${dis}>
                    <div id="fsc-loc-ac" class="autocomplete-list ac-fiche"></div>
                </div>
                <div>
                    <label class="form-label-block">Moment</label>
                    <input class="actor-input" id="fsc-suff" list="fsc-suff-list" placeholder="JOUR" data-tooltip="JOUR" value="${Utils.escape(tp.suff)}" onchange="app.CardModal.setSceneTitlePart('${scid}','suff',this.value)" ${dis}>
                    <datalist id="fsc-suff-list"><option value="JOUR"></option><option value="NUIT"></option><option value="AUBE"></option><option value="CRÉPUSCULE"></option><option value="MATIN"></option><option value="SOIR"></option></datalist>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; align-items:end;">
                <div>
                    <label class="form-label-block">⏱️ Durée estimée (min)</label>
                    <input class="actor-input" placeholder="Ex: 2.5" data-tooltip="Ex: 2.5" value="${Utils.escape(sc.time || '')}" onchange="app.CardModal.setSceneField('${scid}', 'time', this.value)" ${dis}>
                </div>
                <div>
                    <label class="form-label-block">📅 CHRONO — jour de récit</label>
                    <input class="actor-input" placeholder="Ex: J1, J+2, Nuit 3" data-tooltip="Ex: J1, J+2, Nuit 3" value="${Utils.escape(sc.chrono || '')}" onchange="app.CardModal.setSceneField('${scid}', 'chrono', this.value)" ${dis}>
                </div>
            </div>`;
        blocks.push(FicheUI.block('scene', 'identite', '🎞️ Titre & repères', idHtml));

        // Brique « Decor & personnages » — le lien explicite vers une fiche
        // decor (surcharge du titre) et les personnages presents.
        const liensHtml = `
            <label class="form-label-block">🏠 Décor</label>
            <select class="actor-input" id="fsc-decor" onchange="app.CardModal.setSceneField('${scid}', 'location', this.value)" ${dis} style="margin-bottom:10px;">
                <option value="">-- déduit du titre --</option>
                ${names.map(n => `<option value="${Utils.escape(n)}" ${decor === n ? 'selected' : ''}>${Utils.escape(n)}</option>`).join('')}
            </select>
            <label class="form-label-block">🎭 Personnages présents</label>
            <div class="autocomplete-wrapper" style="position:relative;">
                <input class="actor-input" id="fsc-perso" placeholder="Séparés par des points-virgules (ex: ALIX BERGER; CLARA)" data-tooltip="Séparés par des points-virgules (ex: ALIX BERGER; CLARA)" value="${Utils.escape(sc.perso || '')}" onchange="app.CardModal.setSceneField('${scid}', 'perso', this.value)" ${dis}>
                <div id="fsc-perso-ac" class="autocomplete-list ac-fiche"></div>
            </div>`;
        blocks.push(FicheUI.block('scene', 'liens', '🔗 Décor & personnages', liensHtml));

        // Brique « Resume ».
        const resumeHtml = `<textarea class="data-desc" style="min-height:90px; width:100%;" placeholder="Ce qui se passe dans la scène..." data-tooltip="Ce qui se passe dans la scène..." onchange="app.CardModal.setSceneField('${scid}', 'resume', this.value)" ${dis}>${Utils.escape(sc.resume || '')}</textarea>`;
        blocks.push(FicheUI.block('scene', 'resume', '📝 Résumé', resumeHtml));

        // v601 — LA FICHE DIT DE QUELLE SCENE ELLE PARLE. L'identifiant est pose
        // sur une ENVELOPPE a l'interieur du corps, pas sur le corps lui-meme :
        // ouvrir ensuite la fiche d'un comedien remplace ce contenu, donc
        // l'enveloppe disparait d'elle-meme. Sur le corps, l'attribut serait
        // reste en place et la fiche du comedien se serait crue verrouillee.
        if(body) body.innerHTML = '<div class="fiche-scene" data-scene-id="' + scid + '">'
            + FicheUI.headHtml({
                name: sc.title || 'Sans titre', id: sc.id, kindLabel: 'Scène', photo: '',
                badgesHtml: '', delBtnHtml: delBtn
            }) + FicheBlocks.renderTabbed(blocks, 'scene')
            + '</div>';
        CardModal.applyRights('scene');
        try { if(typeof VerrouFin !== 'undefined') VerrouFin.marquerTout(); } catch(e) {}
        if(modal) modal.classList.add('visible');
        // v581 : les briques sont equilibrees par hauteur une fois visibles
        // (mesure reelle du DOM), meme mecanique que les six autres familles.
        requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
        // AUTOCOMPLETION RECABLEE (26 aout). Elle vivait sur les champs de la
        // bande de saisie du sequencier, qui n'existe plus. Les champs de la
        // fiche etant reconstruits a chaque ouverture, l'ecouteur doit etre
        // repose a chaque fois — d'ou l'appel ici et non a l'initialisation.
        if(state.currentRole !== 'viewer') {
            const il = document.getElementById('fsc-loc');
            const ip = document.getElementById('fsc-perso');
            if(il) Utils.setupAutocomplete(il, { source: () => state.data.locations || [], listEl: document.getElementById('fsc-loc-ac'), multi: false });
            if(ip) Utils.setupAutocomplete(ip, { source: () => state.data.characters || [], listEl: document.getElementById('fsc-perso-ac'), multi: true });
        }
    },
    // Ecrit UN morceau du titre et recompose « EFFET. DECOR - MOMENT ».
    // Les trois morceaux passent en majuscules comme le faisait la bande de
    // saisie : le titre est une convention de scenario, pas une phrase libre.
    setSceneTitlePart: (id, part, value) => {
        if(state.currentRole === 'viewer') return;
        const sc = (state.data.scenes || []).find(x => x && String(x.id) === String(id));
        if(!sc) return;
        const tp = Utils.sceneTitleParts(sc.title);
        tp[part] = String(value == null ? '' : value).trim().toUpperCase();
        const titre = (tp.pre || 'EXT') + '. ' + (tp.loc || 'LIEU') + ' - ' + (tp.suff || 'JOUR');
        if(titre === sc.title) return;
        sc.title = titre;
        // v580 : le decor de la scene suit le titre — le lien par identifiant
        // est recalcule (la surcharge explicite s.location garde la main).
        FicheLinks.resolveDecor(sc);
        sc.lastModified = Date.now();
        if(state.currentUser && state.currentUser.email) sc.lastModifiedBy = state.currentUser.email;
        Store.save();
        // v582 : le titre compose vit dans l'en-tete du gabarit (fid-name),
        // la barre de la fenetre ne porte que la famille. On ne re-rend pas
        // la fiche entiere : l'utilisateur est en train de remplir le
        // triptyque, un re-rendu lui volerait le focus.
        const nameEl = document.querySelector('#card-edit-modal-body .fid-name');
        if(nameEl && nameEl.tagName !== 'INPUT') nameEl.textContent = titre;
        try { UI.renderBoard(); } catch(e) { console.error('setSceneTitlePart/renderBoard', e); }
    },
    setSceneField: (id, field, value) => {
        if(!Permissions.canEditFiche('scene')) return;
        const sc = (state.data.scenes || []).find(x => x && String(x.id) === String(id));
        if(!sc) return;
        const v = String(value == null ? '' : value).trim();
        if(String(sc[field] == null ? '' : sc[field]) === v) return;
        sc[field] = v;
        // v580 : perso et decor portent des liens par identifiant. Le texte
        // saisi fait foi une fois, les ids sont recalcules, puis le cache
        // repart des noms canoniques des fiches (le champ affiche suit).
        if(field === 'perso') {
            FicheLinks.setPersoFromText(sc, v);
            const ip = document.getElementById('fsc-perso');
            if(ip) ip.value = sc.perso || '';
        }
        if(field === 'location') FicheLinks.resolveDecor(sc);
        sc.lastModified = Date.now();
        if(state.currentUser && state.currentUser.email) sc.lastModifiedBy = state.currentUser.email;
        Store.save();
        try { UI.renderBoard(); } catch(e) { console.error('openScene/renderBoard', e); }
    },
    
    // ===== FICHE PLAN (25 aout) =====
    // Le plan etait la derniere entite du modele sans fiche : il ne vivait que
    // dans la grille du storyboard, qu'il fallait ouvrir a la bonne scene et
    // faire defiler. Or il est deja relie ailleurs — les jours de tournage
    // retiennent les plans retenus pour la journee (selectedShots) — et on veut
    // pouvoir le consulter depuis la fiche de scene ou la feuille de service.
    // ECRITURE : champ par champ, jamais par remplacement de l'objet, et via
    // Storyboard.updateShot qui porte deja le controle de permission. Le dessin
    // n'est PAS editable ici : l'editeur de dessin appartient au storyboard, le
    // dupliquer dans une modale posee sur une autre modale serait un piege.
    openShot: (id) => {
        const shots = state.data.shots || [];
        const shot = shots.find(x => x && String(x.id) === String(id));
        if(!shot) { Utils.toast('Plan introuvable.', 'error'); return; }
        CardModal.currentType = 'shots';
        CardModal.currentIdx = shots.indexOf(shot);
        CardModal.currentId = shot.id;
        const esc = Utils.escape;
        const scene = (state.data.scenes || []).find(s => s && s.id === shot.sceneId) || null;
        const sceneIdx = scene ? (state.data.scenes || []).indexOf(scene) : -1;
        // Rang du plan DANS SA SCENE : « Plan 3 » n'a de sens que rapporte a la
        // scene, pas au projet entier.
        const sisters = shots.filter(s => s && s.sceneId === shot.sceneId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const rang = sisters.indexOf(shot) + 1;
        const dis = (state.currentRole === 'viewer' || (typeof Permissions !== 'undefined' && !Permissions.canEdit('storyboard'))) ? 'disabled' : '';
        
        // Apercu : seule l'image televersee est affichable telle quelle ; un
        // dessin vit dans un canvas que seul le storyboard sait rejouer.
        let apercu = '';
        const up = (shot.drawings && shot.drawings.original && shot.drawings.original.imageUrl) || (shot.imageType === 'upload' ? shot.imageUrl : '');
        if(up) apercu = `<img src="${up}" alt="Aperçu du plan" style="width:100%; max-height:220px; object-fit:contain; background:var(--bg); border:1px solid var(--border); border-radius:8px; margin-bottom:12px;">`;
        
        // Jours de tournage ayant retenu ce plan.
        const days = (state.data.shootingDays || []).filter(d => {
            if(!d || !(d.date || d.startDate)) return false;
            return (d.scenes || []).some(sc => sc && typeof sc === 'object'
                && sc.sceneId === shot.sceneId && (sc.selectedShots || []).includes(shot.id));
        });
        const daysHtml = days.length
            ? `<div class="appearances-section"><span class="appearances-label">📅 Retenu pour (${days.length}) :</span> `
              + days.map(d => `<span class="appearance-tag is-clickable" onclick="app.UI.openFiche('day','${esc(String(d.id))}')">${esc(String(d.date || d.startDate))}</span>`).join(' ')
              + `</div>`
            : '';
        
        const modal = document.getElementById('card-edit-modal');
        const titleEl = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        if(titleEl) titleEl.textContent = '🎬 Plan ' + (rang > 0 ? rang : '') + (shot.name ? ' — ' + shot.name : '');
        // v601 : le plan se modifie dans cette fenetre. L'identifiant y est pose
        // pour le verrou par fiche (voir FicheLock) ; l'enveloppe vit dans le
        // contenu, elle disparait donc quand on ouvre autre chose.
        if(body) body.innerHTML = `
            <div class="fiche-fenetre" data-fiche="shot:${Utils.escape(String(shot.id))}">
            ${apercu}
            <div style="padding:10px 12px; background:var(--bg); border-radius:8px; border:1px solid var(--border); margin-bottom:12px;">
                ${scene
                    ? `<span style="font-size:0.85rem; color:var(--text-sec);">Scène :</span> <span class="appearance-tag is-clickable" onclick="app.UI.openFiche('scene','${esc(String(scene.id))}')">#${sceneIdx + 1}${scene.title ? ' — ' + esc(String(scene.title).slice(0, 50)) : ''}</span>`
                    : `<span style="font-size:0.85rem; color:var(--danger);">Ce plan n'est rattaché à aucune scène.</span>`}
                <div style="font-size:0.78rem; color:var(--text-sec); margin-top:6px;">Le dessin et les annotations se modifient dans l'onglet Storyboard.</div>
            </div>
            <label class="form-label-block">🏷️ Nom du plan</label>
            <input class="actor-input" placeholder="Ex: Arrivée en voiture" data-tooltip="Ex: Arrivée en voiture" value="${esc(shot.name || '')}" onchange="app.CardModal.setShotField('${esc(String(shot.id))}','name',this.value)" ${dis} style="margin-bottom:10px;">
            <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:150px;">
                    <label class="form-label-block">🎥 Type de plan</label>
                    <select class="actor-input" onchange="app.CardModal.setShotField('${esc(String(shot.id))}','shotType',this.value)" ${dis}>
                        <option value="">—</option>
                        ${CONFIG.shotTypes.map(t => `<option value="${esc(t)}" ${shot.shotType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1; min-width:150px;">
                    <label class="form-label-block">↔️ Mouvement</label>
                    <select class="actor-input" onchange="app.CardModal.setShotField('${esc(String(shot.id))}','cameraMove',this.value)" ${dis}>
                        <option value="">—</option>
                        ${CONFIG.cameraMoves.map(m => `<option value="${esc(m)}" ${shot.cameraMove === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1; min-width:150px;">
                    <label class="form-label-block">📷 Mode caméra</label>
                    <select class="actor-input" onchange="app.CardModal.setShotField('${esc(String(shot.id))}','cameraMode',this.value)" ${dis}>
                        <option value="">—</option>
                        ${(CONFIG.cameraModes || []).map(m => `<option value="${esc(m)}" ${shot.cameraMode === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <label class="form-label-block">📝 Description</label>
            <textarea class="data-desc" style="min-height:70px;" placeholder="Ce que montre le plan..." data-tooltip="Ce que montre le plan..." onchange="app.CardModal.setShotField('${esc(String(shot.id))}','description',this.value)" ${dis}>${esc(shot.description || '')}</textarea>
            <label class="form-label-block">🎭 Direction des acteurs</label>
            <textarea class="data-desc" style="min-height:60px;" onchange="app.CardModal.setShotField('${esc(String(shot.id))}','actorDirection',this.value)" ${dis}>${esc(shot.actorDirection || '')}</textarea>
            <label class="form-label-block">🔧 Direction technique</label>
            <textarea class="data-desc" style="min-height:60px;" onchange="app.CardModal.setShotField('${esc(String(shot.id))}','technicalDirection',this.value)" ${dis}>${esc(shot.technicalDirection || '')}</textarea>
            ${daysHtml}
            </div>
        `;
        CardModal.applyRights('shot');
        if(modal) modal.classList.add('visible');
    },
    setShotField: (id, field, value) => {
        if(typeof Storyboard === 'undefined' || !Storyboard.updateShot) return;
        // updateShot porte deja le refus pour lecteur et permission insuffisante.
        Storyboard.updateShot(id, field, String(value == null ? '' : value));
        // Le storyboard n'est rejoue que s'il est A L'ECRAN et sur la bonne
        // scene : le rejouer depuis un autre onglet reconstruirait une grille
        // que personne ne regarde, sur une scene qui n'est peut-etre pas celle-la.
        const shot = (state.data.shots || []).find(s => s && String(s.id) === String(id));
        const active = document.querySelector('.tab-content.active');
        if(shot && active && active.id === 'tab-storyboard' && Storyboard.currentSceneId === shot.sceneId) {
            try { Storyboard.renderShots(); } catch(e) { console.error('setShotField/renderShots', e); }
        }
    },
    
    // Ferme silencieusement la modale si elle affiche la fiche en cours de suppression
    closeIfShowing: (type, id) => {
        const modal = document.getElementById('card-edit-modal');
        if(!modal || !modal.classList.contains('visible')) return;
        if(CardModal.currentType !== type) return;
        if(id && CardModal.currentId && CardModal.currentId !== id) return;
        Utils.fermetureDouce(modal);
        CardModal.currentType = null;
        CardModal.currentIdx = null;
        CardModal.currentId = null;
    },

    // Re-render la modale si elle est ouverte (pour refléter une modif faite dans la fiche comme l'ajout d'une photo)
    refresh: () => {
        const modal = document.getElementById('card-edit-modal');
        if(!modal || !modal.classList.contains('visible')) return; // pas ouverte
        const type = CardModal.currentType;
        let idx = CardModal.currentIdx;
        if(!type || idx == null) return;
        // Re-résolution par ID : les index bougent quand une fiche est supprimée (localement ou par un collaborateur)
        const coll = type === 'crew' ? state.data.crew : state.data[type];
        if(CardModal.currentId && Array.isArray(coll)) {
            const newIdx = coll.findIndex(x => x && x.id === CardModal.currentId);
            if(newIdx === -1) { CardModal.close(); return; } // la fiche n'existe plus
            idx = newIdx;
            CardModal.currentIdx = newIdx;
        }
        if(type === 'crew') {
            // Crew utilise une autre fonction d'ouverture
            if(typeof CardModal.openCrew === 'function') CardModal.openCrew(idx);
        } else if(type === 'scenes') {
            // Les scènes aussi : rouvrir par identifiant, pas par index
            if(typeof CardModal.openScene === 'function') CardModal.openScene(CardModal.currentId);
        } else if(type === 'shots') {
            if(typeof CardModal.openShot === 'function') CardModal.openShot(CardModal.currentId);
        } else {
            CardModal.open(type, idx);
        }
    },
    
    // Rendu des cartes compactes pour l'équipe
    renderCompactCrewCards: (members, container, isView) => {
        members.forEach((member) => {
            const idx = state.data.crew.indexOf(member);
            const card = document.createElement('div');
            card.className = 'compact-card';
            if(member && member.id) card.dataset.fiche = 'crew:' + member.id;   // v601 : voir ci-dessus
            card.onclick = () => CardModal.openCrew(idx);
            if(!isView) { card.setAttribute('draggable', 'true'); card.dataset.dndColl = 'crew'; card.dataset.dndIdx = idx; }
            
            const photoContent = member.photo ? `<img src="${member.photo}" alt="Photo du membre de l'équipe">` : '👤';
            const roleInfo = member.role || '<em style="opacity:0.6">Fonction non définie</em>';
            const badge = member.publicProfileId ? (member._offline ? '🚧' : '🔒') : '';
            
            card.innerHTML = `
                ${!isView ? `
                <div class="compact-card-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); app.CardModal.openCrew(${idx})" title="Modifier">✏️</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.Crew.deleteMember(${idx})" title="Supprimer">🗑️</button>
                    ${CardModal._groupRoundHtml(member, idx, 'crew')}
                    <button class="casting-btn est-equipe" onclick="event.stopPropagation(); app.GlobalSearch.openForCrewMember(${idx})" title="Recrutement — trier les technicien·nes pour ce poste">🎥</button>
                    <button class="web-btn" onclick="event.stopPropagation(); app.Web.open('crew', '${member.id}')" title="Voir dans la toile">🕸️</button>
                </div>
                ` : ''}
                ${badge ? `<div class="compact-card-badge${member._offline ? ' card-offline' : ''}"${member._offline ? ' title="Hors ligne — masqué de l’Univers"' : ''}>${badge}</div>` : ''}
                <div class="compact-card-photo">${photoContent}</div>
                <div class="compact-card-name">${Utils.escape(member.name || 'Sans nom')}</div>
                <div class="compact-card-role">${roleInfo}</div>
            `;
            
            container.appendChild(card);
        });
    },
    
    // Ouvrir le modal pour un membre de l'équipe
    openCrew: (idx) => {
        const member = state.data.crew[idx];
        if(!member) return;
        try { if(typeof FicheLock !== 'undefined'
                 && FicheLock.ouvrir('crew', member.id, 'Cette fiche') === false) return; } catch(e) {}
        CardModal.currentType = 'crew';
        CardModal.currentIdx = idx;
        CardModal.currentId = member.id;
        
        const modal = document.getElementById('card-edit-modal');
        const title = document.getElementById('card-edit-modal-title');
        const body = document.getElementById('card-edit-modal-body');
        
        title.textContent = '🎥 Technicien·ne';
        
        // Réutiliser le même code que les fiches détaillées
        const isView = state.currentRole === 'viewer' || !Permissions.canEdit('equipe');
        const crewGroups = state.data.groups.filter(g => g.type === 'crew');
        const cardElement = UI.createCrewCard(member, idx, crewGroups, isView);
        
        // Adapter le style pour le modal
        cardElement.style.border = 'none';
        cardElement.style.boxShadow = 'none';
        cardElement.style.maxWidth = 'none';
        cardElement.style.margin = '0';
        
        body.innerHTML = '';
        body.appendChild(cardElement);
        
        CardModal.applyRights('crew');
        modal.classList.add('visible');
        requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
        
        // Initialiser le calendrier
        setTimeout(() => {
            const calContainer = document.getElementById('crew-calendar-' + idx);
            if(calContainer && state.currentRole !== 'viewer') {
                UI.renderAvailabilityCalendar('crew-calendar-' + idx, 'crew', idx);
            }
        }, 100);
    },
    
    // CardModal.updateField retirée v569, jamais appelée.
    
    // Rendu des cartes compactes
    _groupRoundHtml: (item, idx, dataType) => {
        dataType = dataType || 'actors';
        const groupType = { actors: 'actor', crew: 'crew', characters: 'perso', locations: 'lieu', resources: 'resource', orgs: 'org' }[dataType] || 'actor';
        let opts = '<option value="">-- Groupe --</option>';
        state.data.groups.filter(g => g.type === groupType).forEach(g => { opts += `<option value="${g.id}" ${item.group_id === g.id ? 'selected' : ''}>${Utils.escape(g.name)}</option>`; });
        return `<div class="group-round-wrap" title="Changer de groupe"><button class="group-btn" type="button" tabindex="-1">👥</button><select class="group-round-select" onclick="event.stopPropagation();" onchange="event.stopPropagation(); app.Actions.changeGroup('${dataType}', ${idx}, this.value)">${opts}</select></div>`;
    },
    renderCompactCards: (items, type, container) => {
        const isView = state.currentRole === 'viewer';
        
        items.forEach((item) => {
            const idx = state.data[type].indexOf(item);
            const card = document.createElement('div');
            card.className = 'compact-card';
            // v601 — LA VIGNETTE DIT DE QUELLE FICHE ELLE PARLE. Casting et
            // Decors s'affichent par defaut en vignettes, et c'est CETTE
            // fonction qui les dessine — pas renderDataCards, qui ne sert
            // qu'au mode detaille et a la fenetre. Sans cet identifiant, le
            // cadenas n'avait nulle part ou se poser : on n'apprenait qu'une
            // fiche etait occupee qu'en essayant de l'ouvrir. Meme defaut, et
            // meme cause, que la grille du storyboard.
            {
                const esp = { characters: 'character', actors: 'actor', locations: 'location' }[type];
                if(esp && item && item.id) card.dataset.fiche = esp + ':' + item.id;
            }
            card.onclick = () => CardModal.open(type, idx);
            if(!isView) { card.setAttribute('draggable', 'true'); card.dataset.dndColl = type; card.dataset.dndIdx = idx; }
            
            let photoContent = '';
            let roleInfo = '';
            let badge = '';
            
            if(type === 'characters') {
                const linkedActor = state.data.actors.find(a => a.id === item.actor_id);
                photoContent = (linkedActor && linkedActor.photo) ? `<img src="${Utils.safeMediaUrl(linkedActor.photo)}" alt="Photo du comédien">` : '🎭';
                roleInfo = linkedActor ? Utils.escape(linkedActor.name) : '<em style="opacity:0.5">Non casté</em>';
            } else if(type === 'actors') {
                photoContent = item.photo ? `<img src="${item.photo}" alt="Photo">` : '🎬';
                const linkedChar = state.data.characters.find(c => c.actor_id === item.id);
                roleInfo = linkedChar ? '🎭 ' + Utils.escape(linkedChar.name) : '<em style="opacity:0.5">Pas de rôle</em>';
                if(item.publicProfileId) badge = item._offline ? '🚧' : '🔒';
            } else if(type === 'locations') {
                photoContent = item.photo ? `<img src="${item.photo}" alt="Photo du décor">` : '🏠';
                roleInfo = item.realLocationName ? Utils.escape(item.realLocationName) : '<em style="opacity:0.5">Lieu non défini</em>';
            }
            
            card.innerHTML = `
                ${!isView ? `
                <div class="compact-card-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); app.CardModal.open('${type}', ${idx})" title="Modifier">✏️</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.Actions.deleteDataItem('${type}', ${idx})" title="Supprimer">🗑️</button>
                    ${CardModal._groupRoundHtml(item, idx, type)}
                    ${(type === 'characters' || type === 'locations') ? `<button class="board-btn" onclick="event.stopPropagation(); app.Board.openSatellites('${type === 'characters' ? 'character' : 'location'}', '${item.id}')" title="Idées (planche)">💡</button>` : ''}
                    ${type === 'characters' ? `<button class="casting-btn" onclick="event.stopPropagation(); app.GlobalSearch.openForCharacter(${idx})" title="Casting — trier les comédiens pour ce rôle">🎭</button>` : ''}
                    <button class="web-btn" onclick="event.stopPropagation(); app.Web.open('${({characters:'character',actors:'actor',locations:'location'})[type]}', '${item.id}')" title="Voir dans la toile">🕸️</button>
                </div>
                ` : ''}
                ${badge ? `<div class="compact-card-badge${item._offline ? ' card-offline' : ''}"${item._offline ? ' title="Hors ligne — masqué de l’Univers"' : ''}>${badge}</div>` : ''}
                <div class="compact-card-photo">${photoContent}</div>
                <div class="compact-card-name">${Utils.escape(item.name || 'Sans nom')}</div>
                <div class="compact-card-role">${roleInfo}</div>
            `;
            
            container.appendChild(card);
        });
    }
};

const TitlePage = {
    load: () => {
        const tp = state.data.titlePage || {};
        // Voir la garde de TitlePage.save : meme motif que Presentation.
        TitlePage._loadedFor = state.currentProjectId;
        const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
        setVal('tp-title', tp.title);
        setVal('tp-author', tp.author);
        setVal('tp-coauthor', tp.coauthor);
        setVal('tp-contact', tp.contact);
        setVal('tp-draft', tp.draft);
        setVal('tp-date', tp.date);
        setVal('tp-source', tp.source);
        setVal('tp-copyright', tp.copyright);
        setVal('tp-notes', tp.notes);
    },
    save: () => {
        if(!state.data) return; // [B2] Guard : pas de save si aucun projet ouvert (kick, déconnexion, etc.)
        // GARDE : save() REMPLACE state.data.titlePage par ce que contient le
        // formulaire de l'onglet Titre. Sans ce test, un appel passe avant
        // TitlePage.load() — ou apres un changement de projet — effacerait le
        // titre, l'auteur et le copyright, et propagerait au passage un titre
        // vide au projet lui-meme.
        if(TitlePage._loadedFor !== state.currentProjectId) {
            console.warn('[TitlePage] save() ignoré : formulaire non chargé pour ce projet.');
            return;
        }
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const newTitle = getVal('tp-title');
        state.data.titlePage = {
            title: newTitle,
            author: getVal('tp-author'),
            coauthor: getVal('tp-coauthor'),
            contact: getVal('tp-contact'),
            draft: getVal('tp-draft'),
            date: getVal('tp-date'),
            source: getVal('tp-source'),
            copyright: getVal('tp-copyright'),
            notes: getVal('tp-notes')
        };
        // Synchroniser avec le titre du projet
        if(newTitle && newTitle !== state.data.title) {
            state.data.title = newTitle;
            const projectTitleEl = document.getElementById('projectTitle');
            if(projectTitleEl) projectTitleEl.value = newTitle;
            Store.updateTitle(newTitle);
        }
        Store.saveDebounced();
    },
    
    // [Phase C.5.1] Export PDF de la page de titre seule (style Final Draft)
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const tp = state.data.titlePage || {};
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        const projectTitle = tp.title || state.data.title || 'Projet sans titre';
        const authorCombined = [tp.author, tp.coauthor].filter(Boolean).join(' & ');
        
        // Titre du film : très gros, centré, vers 40%
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(36);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
        const titleY = pageHeight * 0.40;
        doc.text(PdfTheme.cleanText(projectTitle).toUpperCase(), pageWidth / 2, titleY, { align: 'center' });
        
        // Trait de séparation
        const lineY = titleY + 10;
        doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
        doc.setLineWidth(0.3);
        doc.line(pageWidth / 2 - 45, lineY, pageWidth / 2 + 45, lineY);
        
        // "Un scénario de XXX"
        if(authorCombined) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(15);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
            doc.text(`Un scénario de ${PdfTheme.cleanText(authorCombined)}`, pageWidth / 2, lineY + 14, { align: 'center' });
        }
        
        // Basé sur
        let y = lineY + 24;
        if(tp.source) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(11);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(`Basé sur ${PdfTheme.cleanText(tp.source)}`, pageWidth / 2, y, { align: 'center' });
            y += 8;
        }
        
        // Bloc bas à gauche : draft, date, contact, copyright
        const bottomY = pageHeight - 55;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
        const lines = [];
        if(tp.draft) lines.push(PdfTheme.cleanText(tp.draft));
        if(tp.date) {
            try {
                lines.push(new Date(tp.date).toLocaleDateString('fr-FR'));
            } catch(e) { lines.push(tp.date); }
        }
        if(tp.copyright) lines.push(PdfTheme.cleanText(tp.copyright));
        if(tp.contact) {
            lines.push('');
            lines.push(PdfTheme.cleanText(tp.contact));
        }
        let by = bottomY;
        lines.forEach(l => { doc.text(l, 25, by); by += 5.5; });
        
        // Notes en bas si présentes
        if(tp.notes) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            const notesLines = doc.splitTextToSize(PdfTheme.cleanText(tp.notes), pageWidth - 50);
            notesLines.slice(0, 4).forEach((l, i) => {
                doc.text(l, pageWidth - 25, pageHeight - 25 + (i * 4), { align: 'right' });
            });
        }
        
        // Footer unifié "X / N" centré (skipFirstPage:false car ici c'est l'unique page)
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { skipFirstPage: false, forDossier: !!opts.returnBlob });
        }
        
        // Téléchargement
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Page de titre'));
        Utils.toast('Page de titre exportée !', 'success');
        History.log('EXPORT', 'Page de titre PDF générée');
    }
};

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

// ============================================================
// Episodes — Gestion des épisodes d'une série (Phase S3)
// ============================================================
// ============================================================
// Seasons — Gestion des saisons (Phase S7.3)
// ============================================================
const Seasons = {
    
    // Rend la grille des saisons
    render: () => {
        const grid = document.getElementById('seasons-grid');
        const countLabel = document.getElementById('seasons-count-label');
        if(!grid) return;
        
        if(!state.data.seasons) state.data.seasons = [];
        
        const seasons = state.data.seasons;
        const episodes = state.data.episodes || [];
        const canEdit = state.currentRole === 'owner' || state.currentRole === 'editor';
        
        if(countLabel) {
            countLabel.textContent = seasons.length === 0 ? '0 saison' : (seasons.length === 1 ? '1 saison' : seasons.length + ' saisons');
        }
        
        const addCard = canEdit ? `
            <div class="season-add-card" onclick="app.Seasons.add()">
                <div class="episode-add-icon">➕</div>
                <div class="episode-add-label">Ajouter une saison</div>
            </div>
        ` : '';
        
        const cards = seasons.map((s, idx) => {
            const epCount = episodes.filter(ep => ep.seasonId === s.id).length;
            
            return `
                <div class="season-card" 
                     data-season-id="${s.id}"
                     draggable="${canEdit}"
                     ondragstart="app.Seasons._onDragStart(event, '${s.id}')"
                     ondragover="app.Seasons._onDragOver(event)"
                     ondragleave="app.Seasons._onDragLeave(event)"
                     ondrop="app.Seasons._onDrop(event, '${s.id}')"
                     ondragend="app.Seasons._onDragEnd(event)">
                    <div class="season-thumb">
                        📺
                        <div class="season-number-badge">S${String(s.number).padStart(2,'0')}</div>
                        <div class="season-episode-count">${epCount} épisode${epCount>1?'s':''}</div>
                    </div>
                    <div class="season-body">
                        <input type="text" class="season-title-input" 
                               value="${Utils.escape(s.title || '')}"
                               placeholder="Titre de la saison (optionnel)" data-tooltip="Titre de la saison (optionnel)"
                               ${canEdit ? `onchange="app.Seasons.setTitle('${s.id}', this.value)"` : 'readonly'}>
                    </div>
                    ${canEdit ? `
                        <div class="season-actions">
                            <button class="season-action-btn" onclick="app.Seasons.openSeason('${s.id}')">📂 Voir épisodes</button>
                            <button class="season-action-btn danger" onclick="app.Seasons.remove('${s.id}')">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        grid.innerHTML = cards + addCard;
    },
    
    // Ajoute une nouvelle saison
    add: () => {
        if(!state.data.seasons) state.data.seasons = [];
        const nextNumber = state.data.seasons.length + 1;
        const newSeason = {
            id: crypto.randomUUID(),
            number: nextNumber,
            title: '',
            description: ''
        };
        state.data.seasons.push(newSeason);
        History.log('ADD', `Ajout saison S${String(nextNumber).padStart(2,'0')}`, { target: { kind: 'season', id: newSeason.id, label: `S${String(nextNumber).padStart(2,'0')}` }, link: { kind: 'season', id: newSeason.id } });
        Store.save();
        Seasons.render();
        // Rafraîchir aussi le sélecteur du header
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Saison ajoutée', 'success');
    },
    
    // Supprime une saison (avec confirmation, supprime aussi ses épisodes et leurs scènes)
    remove: async (seasonId) => {
        const seasons = state.data.seasons || [];
        if(seasons.length <= 1) {
            Utils.toast('Impossible de supprimer la dernière saison', 'warning');
            return;
        }
        
        const s = seasons.find(x => x.id === seasonId);
        if(!s) return;
        
        const linkedEpisodes = (state.data.episodes || []).filter(ep => ep.seasonId === seasonId);
        const linkedScenes = (state.data.scenes || []).filter(sc => linkedEpisodes.some(ep => ep.id === sc.episodeId));
        
        // v601 : supprimer une saison emporte ses scenes. On ne l'autorise pas
        // tant que quelqu'un en ecrit une (voir SceneLock).
        if(typeof SceneLock !== 'undefined' && !SceneLock.autoriseSuppressionScenes(linkedScenes)) return;
        
        let msg = `Supprimer la saison S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + s.title : ''} ?`;
        if(linkedEpisodes.length > 0) {
            msg += `\n\n⚠️ ${linkedEpisodes.length} épisode${linkedEpisodes.length>1?'s':''} seront aussi supprimé${linkedEpisodes.length>1?'s':''}`;
            if(linkedScenes.length > 0) {
                msg += `\net ${linkedScenes.length} scène${linkedScenes.length>1?'s':''}`;
            }
            msg += '.';
        }
        
        const confirmed = await ConfirmModal.confirmDelete(msg);
        if(!confirmed) return;
        
        // [Phase D] Capturer le recoverable AVANT la cascade
        const seasonLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const seasonRecoverable = await History.captureRecoverable(s, 'season', seasonLogId);
        // Enrichir avec les infos de cascade
        if(seasonRecoverable) {
            seasonRecoverable.metadata = seasonRecoverable.metadata || {};
            seasonRecoverable.metadata.episodesCount = linkedEpisodes.length;
            seasonRecoverable.metadata.scenesCount = linkedScenes.length;
            seasonRecoverable.metadata.episodeTitles = linkedEpisodes.map(ep => 
                `E${String(ep.number || '?').padStart(2,'0')}${ep.title ? ' — ' + ep.title : ''}`
            );
            seasonRecoverable.metadata.sceneTitles = linkedScenes.map(sc => sc.title || 'Sans titre');
        }
        
        // Supprimer les scènes liées
        const epIds = linkedEpisodes.map(e => e.id);
        state.data.scenes = (state.data.scenes || []).filter(sc => !epIds.includes(sc.episodeId));
        
        // Supprimer les épisodes
        state.data.episodes = (state.data.episodes || []).filter(ep => ep.seasonId !== seasonId);
        
        // Supprimer la saison
        state.data.seasons = seasons.filter(x => x.id !== seasonId);
        
        // Re-numéroter les saisons restantes
        state.data.seasons.forEach((s, i) => { s.number = i + 1; });
        
        // Si la saison supprimée était active, basculer sur la première
        if(state.currentSeasonId === seasonId) {
            state.currentSeasonId = state.data.seasons[0]?.id || null;
            state.currentEpisodeId = null; // sera réinitialisé par initEpisodeSelector
        }
        
        const seasonLabel = `S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + s.title : ''}`;
        const sceneCountInfo = linkedScenes.length > 0 ? ` (avec ${linkedEpisodes.length} épisode${linkedEpisodes.length>1?'s':''} et ${linkedScenes.length} scène${linkedScenes.length>1?'s':''})` : (linkedEpisodes.length > 0 ? ` (avec ${linkedEpisodes.length} épisode${linkedEpisodes.length>1?'s':''})` : '');
        History.log('DELETE', `Suppression saison ${seasonLabel}${sceneCountInfo}`, {
            target: { kind: 'season', id: seasonId, label: seasonLabel },
            recoverable: seasonRecoverable
        });
        Store.save();
        Seasons.render();
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Saison supprimée', 'success');
    },
    
    // Modifie le titre
    setTitle: (seasonId, title) => {
        const s = state.data.seasons.find(x => x.id === seasonId);
        if(!s) return;
        s.title = (title || '').trim();
        Store.saveDebounced();
        // Rafraîchir le sélecteur saison pour qu'il reflète le nouveau titre
        ScriptEditor.initEpisodeSelector();
    },
    
    // Ouvrir une saison : bascule vers l'onglet Épisodes avec cette saison sélectionnée
    openSeason: (seasonId) => {
        Episodes.switchSeason(seasonId);
        UI.switchTab('episodes');
    },
    
    // ---- Drag & Drop pour réordonner ----
    _draggedId: null,
    
    _onDragStart: (e, seasonId) => {
        Seasons._draggedId = seasonId;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    },
    
    _onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    },
    
    _onDragLeave: (e) => {
        e.currentTarget.classList.remove('drag-over');
    },
    
    _onDrop: (e, targetId) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const sourceId = Seasons._draggedId;
        if(!sourceId || sourceId === targetId) return;
        
        const seasons = state.data.seasons;
        const sourceIdx = seasons.findIndex(s => s.id === sourceId);
        const targetIdx = seasons.findIndex(s => s.id === targetId);
        if(sourceIdx === -1 || targetIdx === -1) return;
        
        const [moved] = seasons.splice(sourceIdx, 1);
        seasons.splice(targetIdx, 0, moved);
        
        // Re-numéroter
        seasons.forEach((s, i) => { s.number = i + 1; });
        
        Store.save();
        Seasons.render();
        ScriptEditor.initEpisodeSelector();
    },
    
    _onDragEnd: (e) => {
        e.currentTarget.classList.remove('dragging');
        Seasons._draggedId = null;
        document.querySelectorAll('.season-card.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
};

const Episodes = {
    // ===================== SAISONS & ÉPISODES =====================
    
    // S7 : bascule de saison
    // Change la saison active, met à jour les dropdowns et rafraîchit toutes les vues
    switchSeason: (seasonId) => {
        if(!seasonId) return;
        state.currentSeasonId = seasonId;
        
        // Réinitialiser l'épisode actif sur le premier de la nouvelle saison
        const episodesOfSeason = (state.data.episodes || []).filter(ep => ep.seasonId === seasonId);
        state.currentEpisodeId = episodesOfSeason[0]?.id || null;
        
        // Re-rendre les dropdowns (saison + épisode)
        ScriptEditor.initEpisodeSelector();
        
        // Rafraîchir les vues filtrées par épisode
        if(ScriptEditor.viewMode === 'continuous') {
            ScriptEditor.renderContinuous();
        } else {
            UI.renderScript();
        }
        if(typeof UI.renderBoard === 'function') UI.renderBoard();
        if(typeof Storyboard !== 'undefined' && typeof Storyboard.renderScenesList === 'function') Storyboard.renderScenesList();
        if(typeof BeatBoard !== 'undefined' && typeof BeatBoard.render === 'function') BeatBoard.render();
        
        // Si on est sur l'onglet Épisodes, le re-rendre pour afficher ceux de la saison
        Episodes.render();
    },
    
    // Rend la grille d'épisodes
    render: () => {
        const grid = document.getElementById('episodes-grid');
        const countLabel = document.getElementById('episodes-count-label');
        if(!grid) return;
        
        // Init : si state.data.episodes n'existe pas, le créer
        if(!state.data.episodes) state.data.episodes = [];
        if(!state.data.seasons) state.data.seasons = [];
        
        const allEpisodes = state.data.episodes;
        const seasons = state.data.seasons;
        const canEdit = state.currentRole === 'owner' || state.currentRole === 'editor';
        
        // S7.4 : filtrer les épisodes par saison active
        const activeSeason = seasons.find(s => s.id === state.currentSeasonId) || seasons[0];
        const episodes = activeSeason 
            ? allEpisodes.filter(ep => ep.seasonId === activeSeason.id)
            : allEpisodes;
        
        // Compteur (affiche aussi le nom de la saison)
        if(countLabel) {
            const seasonLabel = activeSeason ? ` (S${String(activeSeason.number).padStart(2,'0')}${activeSeason.title ? ' — ' + Utils.escape(activeSeason.title) : ''})` : '';
            const countText = episodes.length === 0 ? '0 épisode' : (episodes.length === 1 ? '1 épisode' : episodes.length + ' épisodes');
            countLabel.innerHTML = countText + seasonLabel;
        }
        
        // Carte "Ajouter" à la fin (si canEdit)
        const addCard = canEdit ? `
            <div class="episode-add-card" onclick="app.Episodes.add()">
                <div class="episode-add-icon">➕</div>
                <div class="episode-add-label">Ajouter un épisode</div>
            </div>
        ` : '';
        
        // Rendu des cartes d'épisodes
        const cards = episodes.map((ep, idx) => {
            const statusLabels = { draft: '📝 Brouillon', 'in-progress': '🎬 En cours', done: '✅ Terminé' };
            const status = ep.status || 'draft';
            const thumb = ep.thumb 
                ? `<img src="${Utils.escape(ep.thumb)}" alt="Vignette">` 
                : '🎬';
            
            return `
                <div class="episode-card" 
                     data-episode-id="${ep.id}"
                     draggable="${canEdit}"
                     ondragstart="app.Episodes._onDragStart(event, '${ep.id}')"
                     ondragover="app.Episodes._onDragOver(event)"
                     ondragleave="app.Episodes._onDragLeave(event)"
                     ondrop="app.Episodes._onDrop(event, '${ep.id}')"
                     ondragend="app.Episodes._onDragEnd(event)">
                    <div class="episode-thumb">
                        ${thumb}
                        ${canEdit ? `<button class="episode-thumb-upload" onclick="event.stopPropagation(); app.Episodes.uploadThumb('${ep.id}')">📷 Changer</button>` : ''}
                        <div class="episode-number-badge">E${String(ep.number).padStart(2,'0')}</div>
                        <div class="episode-status-badge ${status}">${statusLabels[status] || status}</div>
                    </div>
                    <div class="episode-body">
                        <input type="text" class="episode-title-input" 
                               value="${Utils.escape(ep.title || '')}"
                               placeholder="Titre de l'épisode (optionnel)" data-tooltip="Titre de l'épisode (optionnel)"
                               ${canEdit ? `onchange="app.Episodes.setTitle('${ep.id}', this.value)"` : 'readonly'}>
                        ${canEdit ? `
                            <select class="episode-status-select" onchange="app.Episodes.setStatus('${ep.id}', this.value)">
                                <option value="draft" ${status==='draft'?'selected':''}>📝 Brouillon</option>
                                <option value="in-progress" ${status==='in-progress'?'selected':''}>🎬 En cours</option>
                                <option value="done" ${status==='done'?'selected':''}>✅ Terminé</option>
                            </select>
                        ` : ''}
                    </div>
                    ${canEdit ? `
                        <div class="episode-actions">
                            <button class="episode-action-btn" onclick="app.Episodes.openEpisode('${ep.id}')">📂 Ouvrir</button>
                            <button class="episode-action-btn danger" onclick="app.Episodes.remove('${ep.id}')">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        grid.innerHTML = cards + addCard;
    },
    
    // Ajoute un nouvel épisode à la fin (dans la saison active)
    add: () => {
        if(!state.data.episodes) state.data.episodes = [];
        if(!state.data.seasons) state.data.seasons = [];
        
        // S7.4 : rattacher à la saison active
        const activeSeasonId = state.currentSeasonId || state.data.seasons[0]?.id;
        if(!activeSeasonId) {
            Utils.toast('Créez d\'abord une saison', 'warning');
            return;
        }
        
        // Numéro = nombre d'épisodes dans cette saison + 1
        const episodesInSeason = state.data.episodes.filter(ep => ep.seasonId === activeSeasonId);
        const nextNumber = episodesInSeason.length + 1;
        
        const newEpisode = {
            id: crypto.randomUUID(),
            seasonId: activeSeasonId,
            number: nextNumber,
            title: '',
            synopsis: '',
            status: 'draft',
            thumb: ''
        };
        state.data.episodes.push(newEpisode);
        const seasonForLog = state.data.seasons.find(s => s.id === activeSeasonId);
        const seasonNumStr = seasonForLog ? `S${String(seasonForLog.number).padStart(2,'0')}` : '?';
        History.log('ADD', `Ajout épisode ${seasonNumStr}E${String(nextNumber).padStart(2,'0')}`, { target: { kind: 'episode', id: newEpisode.id, label: `${seasonNumStr}E${String(nextNumber).padStart(2,'0')}` }, link: { kind: 'episode', id: newEpisode.id } });
        Store.save();
        Episodes.render();
        // Rafraîchir aussi le sélecteur épisode du header
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Épisode ajouté', 'success');
    },
    
    // Supprime un épisode (avec confirmation, supprime aussi ses scènes)
    remove: async (episodeId) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        
        // Compter les scènes liées
        const linkedScenes = (state.data.scenes || []).filter(s => s.episodeId === episodeId);
        // v601 : meme garde que pour la saison — une scene tenue par quelqu'un
        // ne part pas dans la suppression de son episode.
        if(typeof SceneLock !== 'undefined' && !SceneLock.autoriseSuppressionScenes(linkedScenes)) return;
        const sceneCountMsg = linkedScenes.length > 0 
            ? `\n\n⚠️ ${linkedScenes.length} scène${linkedScenes.length>1?'s':''} seront aussi supprimée${linkedScenes.length>1?'s':''}.`
            : '';
        
        const confirmed = await ConfirmModal.confirmDelete(
            `Supprimer l'épisode E${String(ep.number).padStart(2,'0')}${ep.title ? ' — ' + ep.title : ''} ?${sceneCountMsg}`
        );
        if(!confirmed) return;
        
        // [Phase D] Capturer le recoverable AVANT la cascade
        const episodeLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const episodeRecoverable = await History.captureRecoverable(ep, 'episode', episodeLogId);
        // Enrichir avec les infos de cascade
        if(episodeRecoverable) {
            episodeRecoverable.metadata = episodeRecoverable.metadata || {};
            episodeRecoverable.metadata.scenesCount = linkedScenes.length;
            episodeRecoverable.metadata.sceneTitles = linkedScenes.map(sc => sc.title || 'Sans titre');
        }
        
        // Supprimer les scènes liées
        state.data.scenes = (state.data.scenes || []).filter(s => s.episodeId !== episodeId);
        
        // Mémoriser la saison de l'épisode supprimé pour renumérotation
        const deletedSeasonId = ep.seasonId;
        
        // Supprimer l'épisode
        state.data.episodes = state.data.episodes.filter(e => e.id !== episodeId);
        
        // S7.4 : re-numéroter uniquement les épisodes de la même saison
        if(deletedSeasonId) {
            const sameSeasonEps = state.data.episodes.filter(e => e.seasonId === deletedSeasonId);
            sameSeasonEps.forEach((e, i) => { e.number = i + 1; });
        } else {
            // Fallback : anciens épisodes sans seasonId
            state.data.episodes.forEach((e, i) => { e.number = i + 1; });
        }
        
        const seasonForLog2 = state.data.seasons.find(s => s.id === deletedSeasonId);
        const seasonNumStr2 = seasonForLog2 ? `S${String(seasonForLog2.number).padStart(2,'0')}` : '?';
        const episodeLabel = `${seasonNumStr2}E${String(ep.number).padStart(2,'0')}${ep.title ? ' — ' + ep.title : ''}`;
        const sceneInfo = linkedScenes.length > 0 ? ` (avec ${linkedScenes.length} scène${linkedScenes.length>1?'s':''})` : '';
        History.log('DELETE', `Suppression épisode ${episodeLabel}${sceneInfo}`, {
            target: { kind: 'episode', id: episodeId, label: episodeLabel },
            recoverable: episodeRecoverable
        });
        Store.save();
        Episodes.render();
        // Rafraîchir le sélecteur épisode du header
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Épisode supprimé', 'success');
    },
    
    // Modifie le titre
    setTitle: (episodeId, title) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        ep.title = (title || '').trim();
        Store.saveDebounced();
        // Pas de re-render (on ne veut pas perdre le focus du champ)
    },
    
    // Change le statut
    setStatus: (episodeId, status) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        if(!['draft','in-progress','done'].includes(status)) return;
        ep.status = status;
        Store.save();
        Episodes.render(); // Re-render pour mettre à jour le badge
    },
    
    // Upload d'une vignette (image en base64)
    uploadThumb: (episodeId) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
            if(file.size > 2 * 1024 * 1024) {
                Utils.toast('Image trop lourde (max 2 Mo)', 'warning');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const ep = state.data.episodes.find(e => e.id === episodeId);
                if(!ep) return;
                ep.thumb = ev.target.result;
                Store.save();
                Episodes.render();
                Utils.toast('Vignette mise à jour', 'success');
            };
            reader.readAsDataURL(file);
        };
        input.click();
    },
    
    // Ouvrir un épisode : bascule vers l'onglet Scénario sur cet épisode
    // (pour l'instant juste un toast, la bascule arrivera en Phase S4)
    openEpisode: (episodeId) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        Utils.toast(`Ouvrir E${String(ep.number).padStart(2,'0')} — fonctionnalité à venir (Phase S4)`, 'info');
    },
    
    // ---- Drag & Drop pour réordonner ----
    _draggedId: null,
    
    _onDragStart: (e, episodeId) => {
        Episodes._draggedId = episodeId;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    },
    
    _onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    },
    
    _onDragLeave: (e) => {
        e.currentTarget.classList.remove('drag-over');
    },
    
    _onDrop: (e, targetId) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const sourceId = Episodes._draggedId;
        if(!sourceId || sourceId === targetId) return;
        
        const episodes = state.data.episodes;
        const source = episodes.find(ep => ep.id === sourceId);
        const target = episodes.find(ep => ep.id === targetId);
        if(!source || !target) return;
        
        // S7.4 : drag & drop uniquement dans la même saison
        if(source.seasonId !== target.seasonId) {
            Utils.toast('Les épisodes ne peuvent être réordonnés qu\'au sein d\'une même saison', 'warning');
            return;
        }
        
        const sourceIdx = episodes.findIndex(ep => ep.id === sourceId);
        const targetIdx = episodes.findIndex(ep => ep.id === targetId);
        
        // Déplacer dans le tableau global
        const [moved] = episodes.splice(sourceIdx, 1);
        const newTargetIdx = episodes.findIndex(ep => ep.id === targetId);
        episodes.splice(newTargetIdx, 0, moved);
        
        // Re-numéroter uniquement dans la saison concernée
        const sameSeasonEps = episodes.filter(ep => ep.seasonId === source.seasonId);
        sameSeasonEps.forEach((ep, i) => { ep.number = i + 1; });
        
        Store.save();
        Episodes.render();
        ScriptEditor.initEpisodeSelector();
    },
    
    _onDragEnd: (e) => {
        e.currentTarget.classList.remove('dragging');
        Episodes._draggedId = null;
        document.querySelectorAll('.episode-card.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
};

const Synopsis = {
    // Table type -> { key (state.data), editorId }. Une entree = un champ de
    // l'onglet. Ajouter un champ = une ligne ici + le HTML de sa section.
    FIELDS: {
        synopsis: { key: 'synopsis', editorId: 'synopsisEditor' },
        short:    { key: 'synopsisShort', editorId: 'shortEditor' },
        long:     { key: 'synopsisLong', editorId: 'longEditor' },
        intent:   { key: 'synopsisIntent', editorId: 'intentEditor' },
        director: { key: 'directorNote', editorId: 'directorEditor' },
        producer: { key: 'producerNote', editorId: 'producerEditor' }
    },
    // Champs optionnels : grises dans la nav tant qu'on n'a pas clique dessus
    // au moins une fois (ou qu'ils ont deja du contenu).
    OPTIONAL_FIELDS: ['intent', 'director', 'producer'],

    getEditor: (type) => document.getElementById((Synopsis.FIELDS[type] || Synopsis.FIELDS.synopsis).editorId),
    
    _saveTimer: null,
    _savedRange: null,
    _activeSection: 'synopsis',
    _focusedBlockId: null,
    _focusedType: null,
    
    // Bascule l'affichage entre les sections
    switchSection: (target) => {
        Synopsis._clearDeleteHandles();
        Synopsis._activeSection = target;
        document.querySelectorAll('.synopsis-section').forEach(sec => {
            if(sec.dataset.section === target) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });
        document.querySelectorAll('.synopsis-nav-btn').forEach(btn => {
            if(btn.dataset.target === target) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        // Mettre à jour tous les compteurs au switch
        Synopsis.updateCounts();
    },

    // Champ optionnel (intention/realisateur/producteur) : grise dans la nav
    // tant qu'il est vide, degrise dès le premier caractere ecrit, regrise si
    // on efface tout le contenu. Base uniquement sur le contenu — pas de flag
    // "deja consulte" persiste.
    refreshDormant: (type) => {
        if(!Synopsis.OPTIONAL_FIELDS.includes(type)) return;
        const f = Synopsis.FIELDS[type];
        const hasContent = !!(state.data[f.key] && String(state.data[f.key]).replace(/<[^>]+>/g, '').trim());
        const btn = document.querySelector(`.synopsis-nav-btn[data-target="${type}"]`);
        if(btn) btn.classList.toggle('is-dormant', !hasContent);
    },
    // Applique l'etat grise/actif de chaque champ optionnel au chargement.
    applyDormantState: () => {
        Synopsis.OPTIONAL_FIELDS.forEach(type => Synopsis.refreshDormant(type));
    },
    
    // Met à jour les compteurs de caractères dans la sidebar
    updateCounts: () => {
        Object.keys(Synopsis.FIELDS).forEach(type => {
            const editor = Synopsis.getEditor(type);
            const countEl = document.getElementById('synopsis-count-' + type);
            if(editor && countEl) {
                let text = '';
                editor.querySelectorAll('.syn-block-content').forEach(c => { text += (c.innerText || c.textContent || ''); });
                text = text.trim();
                const n = text.length;
                countEl.textContent = n === 0 ? '0 caractère' : (n === 1 ? '1 caractère' : n.toLocaleString('fr-FR') + ' caractères');
            }
        });
    },
    
    saveSelection: () => {
        const sel = window.getSelection();
        if(sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            // Vérifier que la sélection est dans un bloc de texte éditable
            const container = range.commonAncestorContainer;
            const box = container.nodeType === 3 ? container.parentElement : container;
            if(box && box.closest && box.closest('.syn-block-content')) {
                Synopsis._savedRange = range.cloneRange();
            }
        }
    },
    
    restoreSelection: () => {
        if(Synopsis._savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(Synopsis._savedRange);
        }
    },
    
    save: (type, notify = false) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        
        const key = (Synopsis.FIELDS[type] || Synopsis.FIELDS.synopsis).key;
        const parts = [];
        Array.from(editor.children).forEach(blockEl => {
            if(!blockEl.classList || !blockEl.classList.contains('syn-block')) return;
            const contentEl = blockEl.querySelector('.syn-block-content');
            const blockType = blockEl.dataset.blockType || 'text';
            parts.push('<div class="syn-block" data-block-type="' + blockType + '">' + (contentEl ? contentEl.innerHTML : '') + '</div>');
        });
        state.data[key] = parts.join('');
        
        Synopsis.refreshDormant(type);
        Synopsis.updateBoard();
        
        clearTimeout(Synopsis._saveTimer);
        Synopsis._saveTimer = setTimeout(() => Store.save(), 500);
        
        if(notify) Utils.notifyImpact('synopsis', 'board');
    },
    
    load: (type) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        
        const key = (Synopsis.FIELDS[type] || Synopsis.FIELDS.synopsis).key;
        let content = state.data[key] || '';
        if(content && !content.includes('<')) {
            content = content.split('\n').filter(l => l.trim()).map(l => '<p>' + l + '</p>').join('');
        }
        let blocks = Synopsis._blocksFromHtml(content);
        if(blocks.length === 0) blocks = [{ id: Utils.generateUniqueId(), type: 'text', html: '' }];
        Synopsis.renderBlocks(type, blocks);
    },
    
    // v595 : blocs réordonnables (texte / image / tableau) au lieu d'un
    // unique champ contenteditable. Chaque bloc est enveloppé, une fois
    // sauvegardé, dans <div class="syn-block" data-block-type="...">...</div> ;
    // l'ordre des div = l'ordre des blocs (et donc l'ordre du texte brut
    // affiché dans la colonne du séquencier, qui lit ce même champ).
    _blocksFromHtml: (html) => {
        if(!html) return [];
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const blockEls = Array.from(temp.children).filter(c => c.classList && c.classList.contains('syn-block'));
        if(blockEls.length === 0) return Synopsis._migrateLegacyHtml(html);
        return blockEls.map(el => ({
            id: Utils.generateUniqueId(),
            type: el.dataset.blockType || 'text',
            html: el.innerHTML
        }));
    },
    
    // Ancien format (un seul bloc de HTML continu, sans enveloppe de bloc) :
    // on découpe au niveau des tableaux et des images pour obtenir des blocs
    // dès le premier chargement, plutôt que de tout regrouper dans un seul
    // gros bloc texte.
    _migrateLegacyHtml: (html) => {
        const blocks = [];
        if(!html) return blocks;
        const temp = document.createElement('div');
        temp.innerHTML = html;
        let currentText = document.createElement('div');
        const flushText = () => {
            if(currentText.innerHTML.trim()) {
                blocks.push({ id: Utils.generateUniqueId(), type: 'text', html: currentText.innerHTML });
            }
            currentText = document.createElement('div');
        };
        Array.from(temp.childNodes).forEach(node => {
            if(node.nodeType === 1 && node.tagName === 'TABLE') {
                flushText();
                blocks.push({ id: Utils.generateUniqueId(), type: 'table', html: node.outerHTML });
                return;
            }
            if(node.nodeType === 1 && node.tagName === 'IMG') {
                flushText();
                blocks.push({ id: Utils.generateUniqueId(), type: 'image', html: node.outerHTML });
                return;
            }
            // Un noeud P ou DIV qui ne contient QUE une image (cas frequent de
            // document.execCommand('insertImage')) devient aussi un bloc image.
            if(node.nodeType === 1 && (node.tagName === 'P' || node.tagName === 'DIV')) {
                const onlyChild = node.childNodes.length === 1 ? node.childNodes[0] : null;
                const textContent = (node.textContent || '').trim();
                if(onlyChild && onlyChild.nodeType === 1 && onlyChild.tagName === 'IMG' && !textContent) {
                    flushText();
                    blocks.push({ id: Utils.generateUniqueId(), type: 'image', html: onlyChild.outerHTML });
                    return;
                }
            }
            currentText.appendChild(node.cloneNode(true));
        });
        flushText();
        return blocks;
    },
    
    _blockIcon: (type) => ({ text: '📝', image: '🖼️', table: '▦' })[type] || '📝',
    
    renderBlocks: (type, blocks) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        editor.innerHTML = '';
        blocks.forEach((block, idx) => {
            editor.appendChild(Synopsis._buildBlockEl(type, block, idx));
        });
    },
    
    _buildBlockEl: (type, block, idx) => {
        const el = document.createElement('div');
        el.className = 'syn-block';
        el.dataset.blockId = block.id;
        el.dataset.blockType = block.type;
        // Le bloc entier n'est PAS draggable (ça interfèrerait avec la
        // sélection de texte à la souris dans le contenu éditable) : seule la
        // poignée ⋮⋮ ci-dessous déclenche le glisser.
        
        const header = document.createElement('div');
        header.className = 'syn-block-header';
        header.innerHTML = '<span class="syn-block-drag" title="Glisser pour réordonner">⋮⋮</span>'
            + '<span class="syn-block-num">' + (idx + 1) + '</span>'
            + '<span class="syn-block-type-icon">' + Synopsis._blockIcon(block.type) + '</span>'
            + '<button type="button" class="syn-block-del" title="Supprimer ce bloc">🗑️</button>';
        const delBtn = header.querySelector('.syn-block-del');
        delBtn.onmousedown = (e) => e.preventDefault();
        delBtn.onclick = (e) => { e.stopPropagation(); Synopsis.deleteBlock(type, block.id); };
        const dragHandle = header.querySelector('.syn-block-drag');
        dragHandle.draggable = true;
        
        const content = document.createElement('div');
        content.className = 'syn-block-content';
        content.innerHTML = block.html;
        if(block.type === 'text' || block.type === 'table') {
            content.contentEditable = 'true';
            content.addEventListener('input', () => Synopsis.save(type));
            content.addEventListener('focus', () => { Synopsis._focusedBlockId = block.id; Synopsis._focusedType = type; });
            content.addEventListener('keyup', () => Synopsis.saveSelection());
            content.addEventListener('mouseup', () => Synopsis.saveSelection());
            content.addEventListener('paste', (e) => Synopsis._handlePaste(e));
        }
        
        el.appendChild(header);
        el.appendChild(content);
        
        // Glisser-déposer pour réordonner les blocs (déclenché depuis la poignée)
        dragHandle.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', 'synblock:' + block.id);
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('syn-block-dragging');
        });
        dragHandle.addEventListener('dragend', () => el.classList.remove('syn-block-dragging'));
        el.addEventListener('dragover', (e) => {
            if(!e.dataTransfer.types.includes('text/plain')) return;
            e.preventDefault();
            el.classList.add('syn-block-drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('syn-block-drag-over'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('syn-block-drag-over');
            const data = e.dataTransfer.getData('text/plain');
            if(!data || !data.startsWith('synblock:')) return;
            const fromId = data.slice(9);
            if(fromId === block.id) return;
            Synopsis._reorderBlock(type, fromId, block.id);
        });
        
        return el;
    },
    
    _handlePaste: (e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        if(html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            temp.querySelectorAll('*').forEach(el => {
                el.removeAttribute('style');
                el.removeAttribute('class');
            });
            document.execCommand('insertHTML', false, temp.innerHTML);
        } else {
            document.execCommand('insertText', false, text);
        }
    },
    
    _renumberBlocks: (type) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        editor.querySelectorAll('.syn-block').forEach((el, idx) => {
            const numEl = el.querySelector('.syn-block-num');
            if(numEl) numEl.textContent = idx + 1;
        });
    },
    
    _reorderBlock: (type, fromId, toId) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        const fromEl = editor.querySelector('.syn-block[data-block-id="' + fromId + '"]');
        const toEl = editor.querySelector('.syn-block[data-block-id="' + toId + '"]');
        if(!fromEl || !toEl) return;
        editor.insertBefore(fromEl, toEl);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
    },
    
    // Insère un élément bloc après le bloc actuellement focus dans ce champ
    // (ou à la fin si aucun bloc n'a le focus)
    _insertBlockEl: (type, el) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        if(Synopsis._focusedType === type && Synopsis._focusedBlockId) {
            const afterEl = editor.querySelector('.syn-block[data-block-id="' + Synopsis._focusedBlockId + '"]');
            if(afterEl) {
                if(afterEl.nextSibling) editor.insertBefore(el, afterEl.nextSibling);
                else editor.appendChild(el);
                return;
            }
        }
        editor.appendChild(el);
    },
    
    addTextBlock: (type) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        const block = { id: Utils.generateUniqueId(), type: 'text', html: '' };
        const el = Synopsis._buildBlockEl(type, block, 0);
        Synopsis._insertBlockEl(type, el);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
        const contentEl = el.querySelector('.syn-block-content');
        if(contentEl) contentEl.focus();
    },
    
    deleteBlock: (type, blockId) => {
        const editor = Synopsis.getEditor(type);
        if(!editor) return;
        const el = editor.querySelector('.syn-block[data-block-id="' + blockId + '"]');
        if(!el) return;
        el.remove();
        if(!editor.querySelector('.syn-block')) {
            // Ne jamais laisser le champ sans aucun bloc : un bloc texte vide
            // reste toujours disponible pour reprendre l'écriture.
            editor.appendChild(Synopsis._buildBlockEl(type, { id: Utils.generateUniqueId(), type: 'text', html: '' }, 0));
        } else {
            Synopsis._renumberBlocks(type);
        }
        Synopsis.save(type, true);
    },
    
    render: (type) => { Synopsis.load(type); },
    renderTree: (type) => { Synopsis.load(type); },
    
    updateBoard: () => {
        const strip = (html) => { if(!html) return '(Vide)'; const d = document.createElement('div'); d.innerHTML = html; return d.innerText.trim() || '(Vide)'; };
        if(els.boardSynopsis) els.boardSynopsis.innerText = strip(state.data.synopsis);
        if(els.boardShort) els.boardShort.innerText = strip(state.data.synopsisShort);
        if(els.boardLong) els.boardLong.innerText = strip(state.data.synopsisLong);
        if(els.boardIntent) els.boardIntent.innerText = strip(state.data.synopsisIntent);
        if(els.boardDirector) els.boardDirector.innerText = strip(state.data.directorNote);
        if(els.boardProducer) els.boardProducer.innerText = strip(state.data.producerNote);
    },
    
    exec: (cmd, value = null) => {
        Synopsis.restoreSelection();
        document.execCommand(cmd, false, value);
        Synopsis.saveSelection();
    },
    
    formatBlock: (tag, type) => {
        if(!tag) return;
        Synopsis.restoreSelection();
        document.execCommand('formatBlock', false, '<' + tag + '>');
        Synopsis.saveSelection();
    },
    
    insertImage: (type) => {
        const url = prompt('URL de l\'image :');
        if(!url) return;
        const block = { id: Utils.generateUniqueId(), type: 'image', html: '<img src="' + Utils.escape(url) + '">' };
        const el = Synopsis._buildBlockEl(type, block, 0);
        Synopsis._insertBlockEl(type, el);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
    },
    
    insertTable: (type) => {
        const rows = parseInt(prompt('Nombre de lignes :', '3')) || 3;
        const cols = parseInt(prompt('Nombre de colonnes :', '3')) || 3;
        let html = '<table><thead><tr>';
        for(let c = 0; c < cols; c++) html += '<th>En-tête</th>';
        html += '</tr></thead><tbody>';
        for(let r = 0; r < rows - 1; r++) {
            html += '<tr>';
            for(let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        const block = { id: Utils.generateUniqueId(), type: 'table', html: html };
        const el = Synopsis._buildBlockEl(type, block, 0);
        Synopsis._insertBlockEl(type, el);
        Synopsis._renumberBlocks(type);
        Synopsis.save(type);
    },
    
    // v595 : le clic droit natif du navigateur ne supprime ni un tableau ni
    // une image de façon fiable en contenteditable. Petite poignée de
    // suppression au clic, sur le même principe que le storyboard.
    _clearDeleteHandles: () => {
        document.querySelectorAll('.synopsis-del-handle, .synopsis-table-toolbar').forEach(el => el.remove());
    },
    
    _showTableDeleteHandle: (table, cell, type) => {
        Synopsis._clearDeleteHandles();
        const bar = document.createElement('div');
        bar.className = 'synopsis-table-toolbar';
        bar.innerHTML = (cell ? `<button type="button" data-act="row">➖ Supprimer la ligne</button>` : '')
            + `<button type="button" data-act="table">🗑️ Supprimer le tableau</button>`;
        bar.querySelectorAll('button').forEach(b => { b.onmousedown = (e) => e.preventDefault(); });
        bar.addEventListener('click', (e) => {
            e.stopPropagation();
            const act = e.target.closest('button') && e.target.closest('button').dataset.act;
            if(act === 'row' && cell) {
                const row = cell.closest('tr');
                const allRows = table.querySelectorAll('tr');
                if(row) { if(allRows.length <= 1) table.remove(); else row.remove(); }
            } else if(act === 'table') {
                table.remove();
            }
            Synopsis._clearDeleteHandles();
            Synopsis.save(type, true);
        });
        document.body.appendChild(bar);
        const rect = table.getBoundingClientRect();
        bar.style.top = (window.scrollY + rect.top - 34) + 'px';
        bar.style.left = (window.scrollX + rect.left) + 'px';
    },
    
    _handleEditorClick: (e, type) => {
        Synopsis._clearDeleteHandles();
        const table = e.target.closest('table');
        if(table) { Synopsis._showTableDeleteHandle(table, e.target.closest('td, th'), type); }
    },
    
    init: () => {
        if(!Synopsis._globalClickBound) {
            Synopsis._globalClickBound = true;
            document.addEventListener('click', (e) => {
                if(e.target.closest('.synopsis-table-toolbar')) return;
                if(e.target.closest('table')) return;
                Synopsis._clearDeleteHandles();
            });
        }
        const types = Object.keys(Synopsis.FIELDS);
        types.forEach(type => {
            const editor = Synopsis.getEditor(type);
            if(editor && !editor.dataset.synInit) {
                editor.dataset.synInit = '1';
                editor.addEventListener('click', (e) => Synopsis._handleEditorClick(e, type));
            }
        });
    },
    
    // ========================================================
    // EXPORT PDF DU SYNOPSIS [Vague 3a] — jsPDF natif
    // 3 champs (synopsis / synopsisShort / synopsisLong)
    // Conversion HTML riche : p, h1-3, b/strong, i/em, u, s, ul/ol/li, blockquote, hr, img, table
    // Page de garde Final Draft optionnelle
    // ========================================================
    
    // Point d'entrée : ouvre la modale options
    openSynopsisPdfModal: () => {
        // Vérifier qu'au moins un champ a du contenu
        const hasContent = (state.data.synopsis || state.data.synopsisShort || state.data.synopsisLong || state.data.synopsisIntent || state.data.directorNote || state.data.producerNote);
        if(!hasContent) {
            Utils.toast('Aucun synopsis à exporter — remplissez au moins un champ', 'warning');
            return;
        }
        Actions.openExportModal('synopsis');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'synopsis');
        });
    },
    
    // Modale options avec toggles bouton bleu (style cohérent avec le scénario)
    // === HELPER : Parse HTML enrichi en blocs typés pour jsPDF ===
    // Retourne un array de blocs : [{type, ...payload}]
    // types : heading, paragraph, list, blockquote, image, hr, table
    // Pour paragraph/heading/blockquote/list: payload contient `runs` = array de {text, style}
    _parseRichHtml: (html) => {
        if(!html || !html.trim()) return [];
        const container = document.createElement('div');
        container.innerHTML = html;
        // v595 : le contenu est maintenant enveloppé dans des
        // <div class="syn-block">...</div> réordonnables. Ce parseur ne
        // reconnaît que des tags de contenu au premier niveau (p, h1-3,
        // table, img...) — on déplie donc les blocs avant de parser, sinon
        // tout le contenu est silencieusement ignoré.
        const blockWrappers = Array.from(container.children).filter(c => c.classList && c.classList.contains('syn-block'));
        if(blockWrappers.length > 0) {
            const flat = document.createElement('div');
            blockWrappers.forEach(w => { Array.from(w.childNodes).forEach(n => flat.appendChild(n.cloneNode(true))); });
            container.innerHTML = flat.innerHTML;
        }
        const blocks = [];
        
        // Helper : extraire les "runs" inline d'un élément (gras/italique/souligné)
        const extractRuns = (node) => {
            const runs = [];
            const walk = (el, style) => {
                el.childNodes.forEach(child => {
                    if(child.nodeType === Node.TEXT_NODE) {
                        const txt = child.textContent;
                        if(txt) runs.push({ text: txt, ...style });
                    } else if(child.nodeType === Node.ELEMENT_NODE) {
                        const tag = child.tagName.toLowerCase();
                        const newStyle = { ...style };
                        if(tag === 'b' || tag === 'strong') newStyle.bold = true;
                        else if(tag === 'i' || tag === 'em') newStyle.italic = true;
                        else if(tag === 'u') newStyle.underline = true;
                        else if(tag === 's' || tag === 'strike') newStyle.strike = true;
                        else if(tag === 'br') { runs.push({ text: '\n' }); return; }
                        walk(child, newStyle);
                    }
                });
            };
            walk(node, {});
            return runs.filter(r => r.text);
        };
        
        // Helper : process une liste (ul/ol) récursivement
        const processList = (listEl, ordered) => {
            const items = [];
            listEl.querySelectorAll(':scope > li').forEach((li, idx) => {
                items.push({ runs: extractRuns(li), marker: ordered ? `${idx+1}.` : '•' });
            });
            return { type: 'list', items, ordered };
        };
        
        // Boucle sur les enfants directs du container (éléments ET texte nu)
        Array.from(container.childNodes).forEach(el => {
            if(el.nodeType === Node.TEXT_NODE) {
                el.textContent.split(/\n+/).forEach(line => {
                    const t = line.trim();
                    if(t) blocks.push({ type: 'paragraph', runs: [{ text: t }] });
                });
                return;
            }
            if(el.nodeType !== Node.ELEMENT_NODE) return;
            const tag = el.tagName.toLowerCase();
            
            if(tag === 'h1' || tag === 'h2' || tag === 'h3') {
                blocks.push({ type: 'heading', level: parseInt(tag[1], 10), runs: extractRuns(el) });
            } else if(tag === 'p') {
                // Détecter une image dans le paragraphe (paste/insertion)
                const img = el.querySelector('img');
                if(img && img.src) {
                    blocks.push({ type: 'image', src: img.src, alt: img.alt || '' });
                    // Ajouter aussi le texte autour si présent
                    const cloned = el.cloneNode(true);
                    cloned.querySelectorAll('img').forEach(i => i.remove());
                    const runs = extractRuns(cloned);
                    if(runs.length) blocks.push({ type: 'paragraph', runs });
                } else {
                    const runs = extractRuns(el);
                    if(runs.length) blocks.push({ type: 'paragraph', runs });
                }
            } else if(tag === 'blockquote') {
                blocks.push({ type: 'blockquote', runs: extractRuns(el) });
            } else if(tag === 'ul') {
                blocks.push(processList(el, false));
            } else if(tag === 'ol') {
                blocks.push(processList(el, true));
            } else if(tag === 'hr') {
                blocks.push({ type: 'hr' });
            } else if(tag === 'img') {
                if(el.src) blocks.push({ type: 'image', src: el.src, alt: el.alt || '' });
            } else if(tag === 'table') {
                // Conversion table simple : array d'array de strings
                const rows = [];
                el.querySelectorAll('tr').forEach(tr => {
                    const row = [];
                    tr.querySelectorAll('td, th').forEach(cell => {
                        row.push(cell.innerText.trim());
                    });
                    if(row.length) rows.push(row);
                });
                if(rows.length) blocks.push({ type: 'table', rows });
            } else if(tag === 'div') {
                // div générique : on traite comme un paragraphe
                const runs = extractRuns(el);
                if(runs.length) blocks.push({ type: 'paragraph', runs });
            }
        });
        
        return blocks;
    },
    
    // === GÉNÉRATION JSPDF DU SYNOPSIS ===
    // opts = { includeCover, includeSynopsis, includeShort, includeLong, returnBlob }
    synopsisToPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();    // 210
        const pageHeight = doc.internal.pageSize.getHeight();  // 297
        
        // Marges A4 standard (pas de reliure pour le synopsis, c'est plus un livret)
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;  // 160 mm
        
        // État du curseur d'écriture
        let y = margin;
        
        // ===== HELPERS =====
        
        // Nouveau saut de page (réinitialise y au top)
        const newPage = () => {
            doc.addPage();
            y = margin;
        };
        
        // S'assure qu'il reste `space` mm avant la fin de page ; sinon saut
        const ensureSpace = (space) => {
            if(y + space > pageHeight - margin) {
                newPage();
                return true;
            }
            return false;
        };
        
        // Écrit une suite de "runs" (text + style inline) en gérant le wrapping
        // runs : array de {text, bold?, italic?, underline?, strike?}
        // x : abscisse de départ
        // maxWidth : largeur disponible
        // fontSize : taille en pt
        // lineHeight : hauteur de ligne en mm
        // textColor : array [r,g,b] ou null pour noir
        const writeRuns = (runs, opts2 = {}) => {
            const x = opts2.x || margin;
            const maxWidth = opts2.maxWidth || usableWidth;
            const fontSize = opts2.fontSize || 11;
            const lineHeight = opts2.lineHeight || 5.5;
            const color = opts2.color || [30, 30, 30];
            const align = opts2.align || 'left';
            
            doc.setFontSize(fontSize);
            doc.setTextColor(color[0], color[1], color[2]);
            
            // Reconstituer le texte complet avec marqueurs de style
            // On va découper en lignes avec splitTextToSize, puis re-trouver les runs sur chaque ligne
            // Approche pragmatique : on concatène et on rend ligne par ligne en repassant sur les runs
            const fullText = runs.map(r => r.text || '').join('');
            if(!fullText.trim()) return;
            
            // Pour simplifier le wrapping avec styles mixtes, on utilise une approche par "mot"
            // mais on découpe les longs textes en gardant les styles
            // Stratégie : on rend run par run en mode "écriture continue" avec retour ligne quand on dépasse
            
            let curX = x;
            // Si align=center, on doit pré-calculer (complexe). Fallback : on ne supporte center/right que pour runs simples (1 seul style)
            if(align === 'center' || align === 'right') {
                // Pour center/right, on use splitTextToSize sur le texte complet (perd les styles)
                // mais c'est utilisé surtout pour les headings où il n'y a pas de mix
                const isBold = runs.length > 0 && runs[0].bold;
                const isItalic = runs.length > 0 && runs[0].italic;
                let style = 'normal';
                if(isBold && isItalic) style = 'bolditalic';
                else if(isBold) style = 'bold';
                else if(isItalic) style = 'italic';
                doc.setFont('helvetica', style);
                
                const lines = doc.splitTextToSize(fullText, maxWidth);
                lines.forEach(line => {
                    ensureSpace(lineHeight);
                    let drawX = x;
                    if(align === 'right') drawX = x + maxWidth;
                    else if(align === 'center') drawX = x + maxWidth / 2;
                    doc.text(line, drawX, y, { align });
                    y += lineHeight;
                });
                return;
            }
            
            // [2a] Bloc a style uniforme (cas courant : un seul style) -> rendu natif jsPDF.
            // splitTextToSize gere l'espacement et le wrap ; evite le collage / chevauchement
            // du rendu mot-a-mot manuel quand getTextWidth derive (mesure patchee du projet).
            const _uniform = runs.every(r => !!r.bold === !!runs[0].bold && !!r.italic === !!runs[0].italic && !r.underline && !r.strike);
            if(_uniform) {
                let st = 'normal';
                if(runs[0].bold && runs[0].italic) st = 'bolditalic';
                else if(runs[0].bold) st = 'bold';
                else if(runs[0].italic) st = 'italic';
                doc.setFont('helvetica', st);
                doc.splitTextToSize(fullText, maxWidth).forEach(line => {
                    ensureSpace(lineHeight);
                    doc.text(line, x, y);
                    y += lineHeight;
                });
                return;
            }
            
            // Mode left-align : on parcourt chaque run et écrit mot par mot
            const endX = x + maxWidth;
            
            runs.forEach(run => {
                let style = 'normal';
                if(run.bold && run.italic) style = 'bolditalic';
                else if(run.bold) style = 'bold';
                else if(run.italic) style = 'italic';
                doc.setFont('helvetica', style);
                
                // Découper le run en mots (en gardant les espaces avec les mots qui suivent)
                const words = run.text.split(/(\s+)/);
                words.forEach(word => {
                    if(!word) return;
                    // Gestion des retours ligne explicites
                    if(word.includes('\n')) {
                        const parts = word.split('\n');
                        parts.forEach((part, idx) => {
                            if(idx > 0) {
                                y += lineHeight;
                                curX = x;
                                ensureSpace(lineHeight);
                            }
                            if(part) {
                                const w = doc.getTextWidth(part);
                                if(curX + w > endX && curX > x) {
                                    y += lineHeight;
                                    curX = x;
                                    ensureSpace(lineHeight);
                                }
                                doc.text(part, curX, y);
                                if(run.underline) doc.line(curX, y+0.8, curX + w, y+0.8);
                                if(run.strike) doc.line(curX, y-1.5, curX + w, y-1.5);
                                curX += w;
                            }
                        });
                        return;
                    }
                    
                    const wWidth = doc.getTextWidth(word);
                    // Si le mot ne tient pas, on retourne à la ligne (sauf si on est déjà au début)
                    if(curX + wWidth > endX && curX > x) {
                        y += lineHeight;
                        curX = x;
                        ensureSpace(lineHeight);
                    }
                    doc.text(word, curX, y);
                    if(run.underline && word.trim()) {
                        doc.setLineWidth(0.2);
                        doc.line(curX, y+0.8, curX + wWidth, y+0.8);
                    }
                    if(run.strike && word.trim()) {
                        doc.setLineWidth(0.2);
                        doc.line(curX, y-1.5, curX + wWidth, y-1.5);
                    }
                    curX += wWidth;
                });
            });
            
            // Retour ligne après le bloc
            y += lineHeight;
        };
        
        // === Rendu d'un bloc typé ===
        const renderBlock = (block) => {
            switch(block.type) {
                case 'heading': {
                    const sizes = { 1: 18, 2: 14, 3: 12 };
                    const spaceBefore = { 1: 8, 2: 6, 3: 4 };
                    const spaceAfter = { 1: 4, 2: 3, 3: 2 };
                    if(y > margin) y += spaceBefore[block.level] || 4;
                    ensureSpace(sizes[block.level] * 0.6 + (spaceAfter[block.level] || 2));
                    // Forcer bold pour les headings
                    const boldRuns = block.runs.map(r => ({ ...r, bold: true }));
                    writeRuns(boldRuns, {
                        fontSize: sizes[block.level] || 14,
                        lineHeight: sizes[block.level] * 0.45 + 1,
                        color: [20, 20, 20]
                    });
                    y += spaceAfter[block.level] || 2;
                    break;
                }
                
                case 'paragraph': {
                    writeRuns(block.runs, { fontSize: 11, lineHeight: 5.5, color: [40, 40, 40] });
                    y += 2;
                    break;
                }
                
                case 'blockquote': {
                    if(y > margin) y += 3;
                    const startY = y;
                    // Décalage indent gauche
                    writeRuns(block.runs.map(r => ({ ...r, italic: true })), {
                        x: margin + 8,
                        maxWidth: usableWidth - 10,
                        fontSize: 11,
                        lineHeight: 5.5,
                        color: [90, 90, 90]
                    });
                    // Barre verticale grise à gauche
                    doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
                    doc.setLineWidth(0.8);
                    doc.line(margin + 2, startY - 3, margin + 2, y - 2);
                    y += 3;
                    break;
                }
                
                case 'list': {
                    block.items.forEach(item => {
                        ensureSpace(6);
                        // Marker (puce ou numéro) à gauche
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(11);
                        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                        doc.text(PdfTheme.cleanText(item.marker), margin + 2, y);
                        // Contenu indenté
                        writeRuns(item.runs, {
                            x: margin + 8,
                            maxWidth: usableWidth - 8,
                            fontSize: 11,
                            lineHeight: 5.5,
                            color: [40, 40, 40]
                        });
                    });
                    y += 2;
                    break;
                }
                
                case 'hr': {
                    if(y > margin) y += 4;
                    ensureSpace(6);
                    doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                    doc.setLineWidth(0.4);
                    doc.line(margin + 20, y, pageWidth - margin - 20, y);
                    y += 8;
                    break;
                }
                
                case 'image': {
                    if(!block.src) break;
                    try {
                        // Calcul dimensions : on récupère via Image native
                        const imgEl = new Image();
                        imgEl.crossOrigin = 'anonymous';
                        imgEl.src = Utils.signedUrlFor(block.src);
                        // Attendre le chargement (déjà chargé si dataURL ou cache)
                        if(!imgEl.complete) {
                            // skip async loading dans ce contexte sync - on retourne
                            break;
                        }
                        const naturalW = imgEl.naturalWidth || 400;
                        const naturalH = imgEl.naturalHeight || 300;
                        const maxImgWidth = Math.min(usableWidth, 150);
                        const ratio = naturalH / naturalW;
                        const w = maxImgWidth;
                        const h = maxImgWidth * ratio;
                        // Saut de page si trop grand
                        ensureSpace(h + 6);
                        const xCenter = (pageWidth - w) / 2;
                        doc.addImage(block.src, 'PNG', xCenter, y, w, h);
                        y += h + 4;
                    } catch(e) {
                        console.warn('[Synopsis PDF] Erreur image :', e);
                    }
                    break;
                }
                
                case 'table': {
                    // Rendu basique : N colonnes égales, ligne entête en gras
                    if(!block.rows || block.rows.length === 0) break;
                    const nCols = Math.max(...block.rows.map(r => r.length));
                    const colWidth = usableWidth / nCols;
                    const rowHeight = 7;
                    
                    block.rows.forEach((row, rowIdx) => {
                        ensureSpace(rowHeight);
                        const isHeader = rowIdx === 0;
                        // Fond gris léger pour le header
                        if(isHeader) {
                            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
                            doc.rect(margin, y - 4, usableWidth, rowHeight, 'F');
                        }
                        // Bordures
                        doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                        doc.setLineWidth(0.2);
                        doc.rect(margin, y - 4, usableWidth, rowHeight);
                        for(let c = 1; c < nCols; c++) {
                            doc.line(margin + c * colWidth, y - 4, margin + c * colWidth, y - 4 + rowHeight);
                        }
                        // Texte des cellules
                        doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
                        doc.setFontSize(9);
                        doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                        row.forEach((cell, c) => {
                            const txt = (cell || '').substring(0, 40);
                            doc.text(txt, margin + c * colWidth + 2, y);
                        });
                        y += rowHeight;
                    });
                    y += 4;
                    break;
                }
            }
        };
        
        // ===== PAGE DE GARDE (modèle unifié PdfTheme) =====
        if(opts.includeCover !== false) {
            if(typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
                PdfTheme.coverPage(doc, { sectionName: 'Synopsis' });
            }
            doc.addPage();
            y = margin;
        }
        
        // ===== CONTENU =====
        const sections = [];
        if(opts.includeSynopsis && state.data.synopsis) sections.push({ title: 'Synopsis', html: state.data.synopsis });
        if(opts.includeShort && state.data.synopsisShort) sections.push({ title: 'Résumé court', html: state.data.synopsisShort });
        if(opts.includeLong && state.data.synopsisLong) sections.push({ title: 'Résumé long', html: state.data.synopsisLong });
        if(opts.includeIntent && state.data.synopsisIntent) sections.push({ title: "Note d'intention", html: state.data.synopsisIntent });
        if(opts.includeDirector && state.data.directorNote) sections.push({ title: 'Note du réalisateur', html: state.data.directorNote });
        if(opts.includeProducer && state.data.producerNote) sections.push({ title: 'Note du producteur', html: state.data.producerNote });
        
        // PLUS DE SAUT DE PAGE SYSTEMATIQUE (v601). Chaque section ouvrait une
        // page neuve : un synopsis d'un tiers de page laissait donc deux tiers de
        // blanc avant le resume court, lui aussi court, et ainsi de suite. Un
        // dossier de six sections faisait six pages presque vides.
        // LA REGLE EST DESORMAIS CELLE DU BON SENS TYPOGRAPHIQUE : on enchaine,
        // sauf s'il ne reste pas de quoi poser le titre ET quelques lignes
        // dessous. Un titre seul en bas de page est pire qu'un blanc.
        const PLACE_MIN = 42;   // mm : le titre, son filet, et environ 4 lignes
        sections.forEach((section, idx) => {
            if(idx > 0) {
                y += 8;                   // respiration entre deux sections
                ensureSpace(PLACE_MIN);   // saute la page seulement si c'est trop juste
            }
            
            // Titre de section — porte unique PdfTheme.sectionBand (v601).
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                            title: section.title,
                                            accent: PdfTheme.accentFor('Synopsis') });
            
            // Parser et rendre les blocs
            const blocks = Synopsis._parseRichHtml(section.html);
            blocks.forEach(block => renderBlock(block));
        });
        
        // ===== FOOTERS =====
        const totalPages = doc.internal.getNumberOfPages();
        const offset = (opts.includeCover !== false) ? 1 : 0;
        const contentTotal = totalPages - offset;
        const today = new Date();
        const dateStr = String(today.getDate()).padStart(2, '0') + '/' 
                      + String(today.getMonth() + 1).padStart(2, '0') + '/' 
                      + today.getFullYear();
        const projectName = state.data.title || 'Projet';
        
        for(let i = 1; i <= totalPages; i++) {
            if(opts.includeCover !== false && i === 1) continue;
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            // Nom projet à gauche
            doc.text(projectName, margin, pageHeight - 10);
            // Date + pagination à droite
            const pageNum = i - offset;
            doc.text(`${dateStr} — ${pageNum}/${contentTotal}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
        }
        
        // ===== FOOTER UNIFIÉ =====
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { 
                skipFirstPage: opts.includeCover !== false,
                forDossier: !!opts.returnBlob
            });
        }
        
        // ===== SORTIE =====
        if(opts.returnBlob) return doc.output('blob');
        
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Synopsis')
            : `${state.data.title || 'Projet'} - Synopsis - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Synopsis PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Synopsis PDF généré');
    }
};
    
// Module Help remplacé par Tutorial


// ============================================================
// MODULE FICHES PDF [Vague 2] — Personnages / Comédiens / Lieux
// Génération jsPDF avec 3 modes par section (detailed / list / card)
// + page de garde Final Draft + footer + filtrage par saisons
// ============================================================

const FichesPDF = {
    // ============================================================
    // ===== HELPERS COMMUNS (réutilisables pour les 3 sections) =====
    // ============================================================
    
    // Convertit une URL d'image en dataURL via canvas (gère CORS Supabase)
    // Retourne null si échec. Cache interne pour ne pas refaire le travail.
    _imageCache: {},
    _loadImageDataURL: (url) => {
        return new Promise((resolve) => {
            if(!url) { resolve(null); return; }
            // Déjà en dataURL ?
            if(url.startsWith('data:')) { resolve(url); return; }
            // Dans le cache ?
            if(FichesPDF._imageCache[url]) { resolve(FichesPDF._imageCache[url]); return; }
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    // Limiter la résolution pour ne pas faire un PDF de 50Mo
                    const maxDim = 600;
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;
                    if(w > maxDim || h > maxDim) {
                        const ratio = Math.min(maxDim / w, maxDim / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    FichesPDF._imageCache[url] = dataUrl;
                    resolve(dataUrl);
                } catch(e) {
                    console.warn('[FichesPDF] Image conversion échouée :', e);
                    resolve(null);
                }
            };
            img.onerror = () => {
                console.warn('[FichesPDF] Image chargement échoué :', url);
                resolve(null);
            };
            img.src = Utils.signedUrlFor(url);
        });
    },
    
    // Précharge un array d'URLs et retourne un objet { url: dataURL }
    _preloadImages: async (urls) => {
        const unique = [...new Set(urls.filter(Boolean))];
        const results = await Promise.all(unique.map(u => FichesPDF._loadImageDataURL(u)));
        const map = {};
        unique.forEach((u, i) => { map[u] = results[i]; });
        return map;
    },
    
    // Dessine la page de garde Final Draft (style sobre, cohérent avec scénario/synopsis)
    // Note : ne réutilise PAS PdfTheme.coverPage (qui est trop générique). On veut un style propre.
    _drawCoverPage: (doc, sectionName) => {
        // Délègue à PdfTheme.coverPage (modèle unifié B) avec sélection d'auteur
        // contextuelle propre aux fiches (Personnages, Comédiens, Décors, Stats).
        const sectionAuthorMap = {
            'Personnages':   ['Scénariste', 'Réalisateur·rice'],
            'Comédiens':     ['Directeur·rice de casting', 'Régisseur·euse général·e'],
            'Décors':        ['Repéreur·euse', 'Directeur·rice de production', 'Régisseur·euse général·e'],
            'Statistiques':  ['Producteur·rice', 'Directeur·rice de production', '1er·ère assistant·e réalisateur·rice']
        };
        const wantedRoles = sectionAuthorMap[sectionName] || [];
        let author = null;
        for(const role of wantedRoles) {
            if(author) break;
            const member = (state.data.crew || []).find(m => {
                if(!m.role) return false;
                const r1 = String(m.role).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                const r2 = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                return r1 === r2 || r1.includes(r2);
            });
            if(member) author = member.name;
        }
        
        if(typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
            PdfTheme.coverPage(doc, { sectionName, customAuthor: author });
        }
    },
    
    // Dessine le footer sur toutes les pages (sauf la page de garde si présente)
    // "Date — N/Total" à droite, nom projet à gauche
    _drawFooters: (doc, includeCover, forDossier) => {
        // Délègue au footer unifié de PdfTheme (minimaliste "X / N" centré)
        // pour garantir une présentation cohérente avec les autres exports.
        // En mode Dossier (forDossier:true), ne dessine RIEN : pagination globale
        // gérée par buildDossierProd phase 7ter.
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { skipFirstPage: !!includeCover, forDossier: !!forDossier });
            return;
        }
        // Fallback si PdfTheme indisponible (ne devrait pas arriver)
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const totalPages = doc.internal.getNumberOfPages();
        for(let i = 1; i <= totalPages; i++) {
            if(includeCover && i === 1) continue;
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            doc.text(`${i} / ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }
    },
    
    // Dessine une photo (depuis dataURL) ou un placeholder "Pas de photo"
    _drawPhotoOrPlaceholder: (doc, dataUrl, x, y, w, h) => {
        if(dataUrl) {
            try {
                doc.addImage(Utils.signedUrlFor(dataUrl), 'JPEG', x, y, w, h);
                // Cadre fin autour
                doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                doc.setLineWidth(0.3);
                doc.rect(x, y, w, h);
                return;
            } catch(e) {
                console.warn('[FichesPDF] addImage failed :', e);
            }
        }
        // Placeholder
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(x, y, w, h, 'F');
        doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1, 1], 0);
        doc.rect(x, y, w, h);
        doc.setLineDashPattern([], 0);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
        doc.text('Pas de photo', x + w/2, y + h/2, { align: 'center' });
    },
    
    // Dessine un bandeau "GROUPE : XXX" stylé
    // L'accent est défini par l'export appelant via FichesPDF._accent (couleur de section)
    _accent: null,
    // Titre de groupe (Protagonistes, Casting principal, Interieurs...) — meme
    // porte que les titres de section depuis v601 : la couleur vient de l'export
    // appelant (_accent), donc personnages en vert, decors en brun, etc.
    _drawGroupHeader: (doc, groupName, y, marginX, usableWidth) => {
        return PdfTheme.sectionBand(doc, {
            x: marginX, y, width: usableWidth, size: 10,
            title: groupName,
            accent: FichesPDF._accent || PdfTheme.COLORS.BANNER_BLUE
        }) + 1;
    },
    
    // Assure qu'il reste `space` mm avant la fin de la page sinon saut
    // Retourne le nouveau y (peut être margin si saut)
    _ensureSpace: (doc, y, space, pageHeight, marginBottom) => {
        if(y + space > pageHeight - marginBottom) {
            doc.addPage();
            return marginBottom;  // reset to top margin
        }
        return y;
    },
    
    // ============================================================
    // ===== PICKER COMMUN : Modale choix saisons (séries) =====
    // ============================================================
    // kind : 'chars' | 'actors' | 'locs' (pour les ids des inputs)
    // emoji + titre adaptés ; callback reçoit les episodeIds
    _openSeasonChooser: (kind, emoji, title, callback) => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { callback([]); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="fp-seachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">${emoji} ${title}</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="fp-sea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="fp-sea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="fp-sea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="fp-sea-ok" style="margin:0;">Suivant →</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#fp-sea-all').onclick  = () => overlay.querySelectorAll('.fp-seachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#fp-sea-none').onclick = () => overlay.querySelectorAll('.fp-seachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#fp-sea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#fp-sea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.fp-seachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => callback(epIds), 100);
        };
    },
    
    // ============================================================
    // ===== MODALE OPTIONS COMMUNE (mode + page de garde) =====
    // ============================================================
    // modes : array de {value, label, desc} — 2 ou 3 modes
    // emoji, title : pour le header
    // callback(opts) reçoit { mode, includeCover }
    _openOptionsModal: (emoji, title, modes, callback) => {
        const initialMode = modes[0].value;
        const modeButtons = modes.map((m, i) => 
            `<button type="button" class="fmt-btn ${i === 0 ? 'active' : ''}" data-mode="${m.value}" style="padding:10px 14px;font-size:0.85rem;text-align:left;">${m.label}<br><span style="font-size:0.75rem;color:var(--text-sec);font-weight:normal;">${m.desc}</span></button>`
        ).join('');
        
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:520px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:14px;">${emoji} ${title}</div>
            
            <div style="text-align:left;font-size:0.8rem;color:var(--text-sec);margin-bottom:10px;">Page de garde :</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin-bottom:14px;">
                <button type="button" class="fmt-btn active" id="fp-opt-cover" data-active="1" style="padding:10px 14px;font-size:0.85rem;text-align:left;">📋 Inclure la page de titre</button>
            </div>
            
            <div style="text-align:left;font-size:0.8rem;color:var(--text-sec);margin-bottom:10px;">Mode de rendu :</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin-bottom:14px;" id="fp-opt-modes">
                ${modeButtons}
            </div>
            
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="fp-opt-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="fp-opt-ok" style="margin:0;">📄 Générer le PDF</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        
        // Toggle page de garde
        const coverBtn = overlay.querySelector('#fp-opt-cover');
        coverBtn.onclick = () => {
            const isActive = coverBtn.classList.toggle('active');
            coverBtn.dataset.active = isActive ? '1' : '0';
        };
        
        // Boutons mode = radio (un seul actif)
        let selectedMode = initialMode;
        overlay.querySelectorAll('#fp-opt-modes .fmt-btn').forEach(btn => {
            btn.onclick = () => {
                overlay.querySelectorAll('#fp-opt-modes .fmt-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMode = btn.dataset.mode;
            };
        });
        
        overlay.querySelector('#fp-opt-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#fp-opt-ok').onclick = () => {
            const includeCover = coverBtn.dataset.active === '1';
            overlay.remove();
            callback({ mode: selectedMode, includeCover });
        };
    },
    
    // ============================================================
    // ===== PERSONNAGES =====
    // ============================================================
    
    openCharactersModal: () => {
        const chars = state.data.characters || [];
        if(chars.length === 0) {
            Utils.toast('Aucun personnage à exporter', 'warning');
            return;
        }
        // Projet "série" : garde l'ancien chemin (choix de saison), que le hub
        // ne sait pas encore faire pour cette section. Sinon, hub direct.
        if(state.currentProjectType === 'series') {
            const continueToOptions = (episodeIds) => {
                const modes = [
                    { value: 'detailed', label: 'Détaillé', desc: 'Photo + bio + sexe + comédien lié + scènes (1 par ligne)' },
                    { value: 'list',     label: 'Liste',    desc: '2 colonnes compactes : nom + nombre de scènes' },
                    { value: 'card',     label: 'Fiche',    desc: '1 page A4 par personnage (grande photo + tous les détails)' }
                ];
                FichesPDF._openOptionsModal('👥', 'Personnages PDF — Options', modes, (opts) => {
                    FichesPDF.exportCharacters({ ...opts, episodeIds });
                });
            };
            FichesPDF._openSeasonChooser('chars', '👥', 'Personnages — Choix des saisons', continueToOptions);
            return;
        }
        Actions.openExportModal('chars');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'chars');
        });
    },
    
    exportCharacters: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        FichesPDF._accent = PdfTheme.accentFor('Personnages');
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        const isSeries = state.currentProjectType === 'series';
        
        // ========= Données =========
        const allChars = state.data.characters || [];
        const actors = state.data.actors || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'perso');
        const allScenes = state.data.scenes || [];
        
        // Filtrage par saisons (si série)
        let scenesScope = allScenes;
        if(isSeries && opts.episodeIds && opts.episodeIds.length > 0) {
            scenesScope = allScenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        // Filtrer personnages : si série + saisons choisies, ne garder que ceux qui apparaissent
        const charsInScope = isSeries ? allChars.filter(ch => scenesScope.some(s => FicheLinks.sceneHasChar(s, ch))) : allChars;
        
        if(charsInScope.length === 0) {
            Utils.toast('Aucun personnage à exporter dans cette sélection', 'warning');
            return;
        }
        
        // Helpers
        const sceneLabel = (s) => {
            if(isSeries) {
                const ep = (state.data.episodes || []).find(e => e.id === s.episodeId);
                if(ep) {
                    const scenesInEp = allScenes.filter(x => x.episodeId === ep.id);
                    return UI.formatSceneNumber(s, scenesInEp.indexOf(s));
                }
            }
            return '#' + (allScenes.indexOf(s) + 1);
        };
        // v580 : test par identifiant (sceneHasChar garde le nom en repli).
        const charScenes = (ch) => scenesScope.filter(s => FicheLinks.sceneHasChar(s, ch));
        
        // Précharger toutes les photos en parallèle (depuis les acteurs liés)
        Utils.toast('Préparation des photos...', 'info');
        const urls = charsInScope.map(ch => {
            const actor = ch.actor_id ? actors.find(a => a.id === ch.actor_id) : null;
            return actor && actor.photo ? actor.photo : null;
        }).filter(Boolean);
        const photoMap = await FichesPDF._preloadImages(urls);
        
        // ========= Page de garde =========
        if(opts.includeCover !== false) {
            FichesPDF._drawCoverPage(doc, 'Personnages');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Grouper =========
        const grouped = {};
        charsInScope.forEach(ch => {
            const gid = ch.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(ch);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        
        // ========= Rendu selon mode =========
        const getActor = (ch) => ch.actor_id ? actors.find(a => a.id === ch.actor_id) : null;
        const genderLabel = (g) => ({ homme: 'Homme', femme: 'Femme', 'non-binaire': 'Non-binaire' }[g] || g || '');
        
        // ----- MODE DETAILED : 1 fiche par ligne, photo 30x40mm + nom + bio + scènes -----
        const renderDetailed = (ch) => {
            const cardHeight = 50;  // hauteur minimum d'une carte
            y = FichesPDF._ensureSpace(doc, y, cardHeight, pageHeight, margin);
            
            const photoW = 28, photoH = 36;
            const actor = getActor(ch);
            const photoUrl = actor && actor.photo ? photoMap[actor.photo] : null;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, margin, y, photoW, photoH);
            
            const textX = margin + photoW + 6;
            const textWidth = usableWidth - photoW - 6;
            let ty = y + 5;
            
            // Nom (grand, gras)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(ch.name, textX, ty);
            ty += 5;
            
            // Sexe
            const gender = genderLabel(ch.gender);
            if(gender) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('Sexe : ' + gender, textX, ty);
                ty += 4;
            }
            
            // Comédien lié
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(PdfTheme.cleanText(actor ? 'Joué par : ' + actor.name : '— Aucun comédien lié —'), textX, ty);
            ty += 4;
            
            // Bio
            if(ch.bio) {
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const bioLines = doc.splitTextToSize(ch.bio, textWidth);
                bioLines.slice(0, 4).forEach(line => {
                    doc.text(line, textX, ty);
                    ty += 3.8;
                });
                if(bioLines.length > 4) {
                    doc.setFont('helvetica', 'italic');
                    doc.text('…', textX, ty);
                    ty += 3.8;
                }
            }
            
            // Scènes
            const cs = charScenes(ch);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            if(cs.length > 0) {
                const labels = cs.map(s => sceneLabel(s)).join('  ');
                const sceneText = `Apparaît dans (${cs.length}) : ${labels}`;
                const scLines = doc.splitTextToSize(sceneText, textWidth);
                scLines.slice(0, 2).forEach(line => {
                    doc.text(line, textX, ty);
                    ty += 3.5;
                });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text(`N'apparaît dans aucune scène`, textX, ty);
                ty += 3.5;
            }
            
            // Cadre autour de la fiche
            const actualHeight = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualHeight);
            
            y += actualHeight + 3;
        };
        
        // ----- MODE LIST : 2 colonnes compactes -----
        const renderList = (chars) => {
            const colWidth = usableWidth / 2 - 3;
            let col = 0;
            let lineY = y;
            const lineHeight = 5.5;
            
            chars.forEach(ch => {
                if(col === 0) {
                    lineY = FichesPDF._ensureSpace(doc, lineY, lineHeight, pageHeight, margin);
                }
                const cs = charScenes(ch);
                const x = margin + col * (colWidth + 6);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                // Nom (tronqué si trop long)
                const nameW = colWidth - 18;
                let name = ch.name;
                while(doc.getTextWidth(name) > nameW && name.length > 5) {
                    name = name.substring(0, name.length - 2) + '…';
                }
                doc.text(name, x, lineY);
                // Nombre de scènes à droite de la colonne
                doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
                doc.setFontSize(8);
                doc.text(`${cs.length} sc.`, x + colWidth, lineY, { align: 'right' });
                // Ligne pointillée sous le nom
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(x, lineY + 1.2, x + colWidth, lineY + 1.2);
                doc.setLineDashPattern([], 0);
                
                col = (col + 1) % 2;
                if(col === 0) lineY += lineHeight;
            });
            // Si fin sur la 1ère colonne, on passe à la ligne suivante
            if(col === 1) lineY += lineHeight;
            y = lineY + 2;
        };
        
        // ----- MODE CARD : 1 page A4 par personnage -----
        const renderCard = (ch) => {
            // Nouvelle page pour chaque personnage (sauf la 1ère qui est déjà neuve)
            // (on assume que le caller a déjà fait addPage ou est sur la 1ère page)
            
            const actor = getActor(ch);
            const photoUrl = actor && actor.photo ? photoMap[actor.photo] : null;
            
            // Bandeau titre coloré en haut
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text('PERSONNAGE', margin, 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const projT = state.data.title || '';
            doc.text(projT, pageWidth - margin, 12, { align: 'right' });
            
            // Grande photo à gauche (70 x 95mm)
            const photoW2 = 70, photoH2 = 95;
            const photoX = margin;
            const photoY = 28;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, photoX, photoY, photoW2, photoH2);
            
            // Bloc infos à droite
            const infoX = photoX + photoW2 + 10;
            const infoWidth = usableWidth - photoW2 - 10;
            let iy = photoY + 6;
            
            // Nom XXL
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const nameLines = doc.splitTextToSize(ch.name, infoWidth);
            nameLines.forEach(line => { doc.text(line, infoX, iy); iy += 8; });
            iy += 3;
            
            // Sexe
            const gender = genderLabel(ch.gender);
            if(gender) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(11);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(gender, infoX, iy);
                iy += 6;
            }
            
            // Comédien
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('INCARNÉ PAR', infoX, iy);
            iy += 4;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.text(PdfTheme.cleanText(actor ? actor.name : '(non assigné)'), infoX, iy);
            iy += 8;
            
            // Bio
            if(ch.bio) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('PORTRAIT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const bioLines = doc.splitTextToSize(ch.bio, infoWidth);
                bioLines.forEach(line => {
                    if(iy < pageHeight - 30) {
                        doc.text(line, infoX, iy);
                        iy += 4.5;
                    }
                });
            }
            
            // Section scènes en bas
            const cs = charScenes(ch);
            const bottomY = pageHeight - 50;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(`APPARAÎT DANS ${cs.length} SCÈNE${cs.length > 1 ? 'S' : ''}`, margin, bottomY);
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY + 1.5, pageWidth - margin, bottomY + 1.5);
            if(cs.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const labels = cs.map(s => sceneLabel(s)).join('  ');
                const scLines = doc.splitTextToSize(labels, usableWidth);
                let sy = bottomY + 6;
                scLines.slice(0, 4).forEach(line => {
                    doc.text(line, margin, sy);
                    sy += 4;
                });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text(`N'apparaît dans aucune scène`, margin, bottomY + 6);
            }
        };
        
        // ========= Exécution selon mode =========
        if(opts.mode === 'card') {
            // Mode fiche : 1 page A4 par perso, pas de groupes (chaque fiche est autonome)
            charsInScope.forEach((ch, idx) => {
                if(idx > 0) doc.addPage();
                renderCard(ch);
            });
        } else {
            // Modes detailed et list : par groupes
            groupOrder.forEach((gid, gIdx) => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                
                // Saut de page si plus de place pour le bandeau + au moins 1 fiche
                y = FichesPDF._ensureSpace(doc, y, 30, pageHeight, margin);
                y = FichesPDF._drawGroupHeader(doc, groupName, y, margin, usableWidth);
                
                if(opts.mode === 'detailed') {
                    grouped[gid].forEach(ch => renderDetailed(ch));
                } else if(opts.mode === 'list') {
                    renderList(grouped[gid]);
                }
            });
        }
        
        // ========= Footer =========
        FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Personnages')
            : `${state.data.title || 'Projet'} - Personnages - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Personnages PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Personnages PDF généré');
    },
    
    // ============================================================
    // ===== COMÉDIENS =====
    // ============================================================
    
    openActorsModal: () => {
        const actorsAll = state.data.actors || [];
        if(actorsAll.length === 0) {
            Utils.toast('Aucun comédien à exporter', 'warning');
            return;
        }
        if(state.currentProjectType === 'series') {
            const continueToOptions = (episodeIds) => {
                const modes = [
                    { value: 'detailed', label: 'Détaillé', desc: 'Photo + contact + bio + physique + statut + compétences (1 par ligne)' },
                    { value: 'list',     label: 'Liste',    desc: '1 colonne dense : nom · personnage · email · tél' },
                    { value: 'card',     label: 'Fiche',    desc: '1 page A4 paysage par comédien (casting book : photo + tous les détails)' }
                ];
                FichesPDF._openOptionsModal('🎭', 'Comédiens PDF — Options', modes, (opts) => {
                    FichesPDF.exportActors({ ...opts, episodeIds });
                });
            };
            FichesPDF._openSeasonChooser('actors', '🎭', 'Comédiens — Choix des saisons', continueToOptions);
            return;
        }
        Actions.openExportModal('actors');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'actors');
        });
    },
    
    exportActors: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        FichesPDF._accent = PdfTheme.accentFor('Comédiens');
        // Mode card → page A4 paysage (casting book). Autres modes → portrait.
        const isCard = opts.mode === 'card';
        const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        const isSeries = state.currentProjectType === 'series';
        
        // ========= Données =========
        const allActors = state.data.actors || [];
        const allChars = state.data.characters || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'actor');
        const allScenes = state.data.scenes || [];
        
        // Filtrage par saisons (si série) : on garde les comédiens dont le perso joué apparaît
        let scenesScope = allScenes;
        if(isSeries && opts.episodeIds && opts.episodeIds.length > 0) {
            scenesScope = allScenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        const actorsInScope = isSeries ? allActors.filter(a => {
            const linked = allChars.find(c => c.actor_id === a.id);
            if(!linked) return true; // Comédiens sans rôle assigné : on les garde
            return scenesScope.some(s => FicheLinks.sceneHasChar(s, linked));
        }) : allActors;
        
        if(actorsInScope.length === 0) {
            Utils.toast('Aucun comédien à exporter dans cette sélection', 'warning');
            return;
        }
        
        // Helpers : labels via ProfileRenderer.selectOptions
        const optLabel = (cat, val) => {
            if(!val) return '';
            const opts = (typeof ProfileRenderer !== 'undefined' && ProfileRenderer.selectOptions && ProfileRenderer.selectOptions[cat]) || [];
            const found = opts.find(o => o.value === val);
            return found ? found.label : val;
        };
        const getLinkedChar = (a) => allChars.find(c => c.actor_id === a.id) || null;
        // v580 : test par identifiant (sceneHasChar garde le nom en repli).
        const charScenes = (ch) => scenesScope.filter(s => FicheLinks.sceneHasChar(s, ch));
        const collabLabel = (c) => ({ pro: 'Pro', 'semi-pro': 'Semi-pro', benevole: 'Bénévole' }[c] || '');
        
        // Précharger toutes les photos en parallèle
        Utils.toast('Préparation des photos...', 'info');
        const urls = actorsInScope.map(a => a.photo).filter(Boolean);
        const photoMap = await FichesPDF._preloadImages(urls);
        
        // ========= Page de garde =========
        if(opts.includeCover !== false) {
            FichesPDF._drawCoverPage(doc, 'Comédiens');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Grouper =========
        const grouped = {};
        actorsInScope.forEach(a => {
            const gid = a.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(a);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        
        // ----- MODE DETAILED : 1 fiche par ligne (portrait A4) -----
        const renderDetailed = (a) => {
            const cardHeight = 56;
            y = FichesPDF._ensureSpace(doc, y, cardHeight, pageHeight, margin);
            
            const photoW = 28, photoH = 36;
            const photoUrl = a.photo ? photoMap[a.photo] : null;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, margin, y, photoW, photoH);
            
            const textX = margin + photoW + 6;
            const textWidth = usableWidth - photoW - 6;
            let ty = y + 5;
            
            // Nom (grand, gras)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(a.name || '(sans nom)', textX, ty);
            ty += 5;
            
            // Personnage joué (en italique, couleur accent)
            const linked = getLinkedChar(a);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            doc.text(linked ? 'Rôle : ' + linked.name : '— Aucun personnage attribué —', textX, ty);
            ty += 4.2;
            
            // Contact (email + tél sur une ligne, ville en dessous si présente)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            const contactBits = [];
            if(a.email) contactBits.push('Email : ' + a.email);
            if(a.phone) contactBits.push('Tél : ' + a.phone);
            if(contactBits.length > 0) {
                const contactLine = contactBits.join('   ·   ');
                const cLines = doc.splitTextToSize(contactLine, textWidth);
                cLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            if(a.city) {
                doc.text('Ville : ' + a.city, textX, ty);
                ty += 3.8;
            }
            
            // Statut pro + type collab
            const statusBits = [];
            const stat = optLabel('professionalStatus', a.professionalStatus);
            if(stat) statusBits.push(stat);
            const collab = collabLabel(a.collabType);
            if(collab) statusBits.push(collab);
            if(statusBits.length > 0) {
                doc.setTextColor(...PdfTheme.COLORS.WARNING);
                doc.text('Statut : ' + statusBits.join(' · '), textX, ty);
                ty += 3.8;
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            }
            
            // Bio (max 2 lignes)
            if(a.bio) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const bioLines = doc.splitTextToSize(a.bio, textWidth);
                bioLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.7; });
                if(bioLines.length > 2) {
                    doc.setFont('helvetica', 'italic');
                    doc.text('…', textX, ty);
                    ty += 3.7;
                }
            }
            
            // Physique compact : sexe · âge · taille · yeux · cheveux · corpulence
            const physBits = [];
            const gender = optLabel('gender', a.gender);
            if(gender && gender !== '-- Sexe --') physBits.push(gender);
            if(a.age)    physBits.push(a.age + ' ans');
            if(a.height) physBits.push(a.height + ' cm');
            const eyes = optLabel('eyeColor', a.eyeColor);
            if(eyes && !eyes.startsWith('--')) physBits.push('yeux ' + eyes.toLowerCase());
            const hairC = optLabel('hairColor', a.hairColor);
            if(hairC && !hairC.startsWith('--')) physBits.push('cheveux ' + hairC.toLowerCase());
            const corp = optLabel('corpulence', a.corpulence);
            if(corp && !corp.startsWith('--')) physBits.push(corp.toLowerCase());
            if(physBits.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const physLine = 'Physique : ' + physBits.join(' · ');
                const pLines = doc.splitTextToSize(physLine, textWidth);
                pLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Compétences : sports / langues
            const skillBits = [];
            if(a.sports)    skillBits.push('Sports : ' + a.sports);
            if(a.languages) skillBits.push('Langues : ' + a.languages);
            if(skillBits.length > 0) {
                doc.setFontSize(8);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const sLine = skillBits.join('   ·   ');
                const sLines = doc.splitTextToSize(sLine, textWidth);
                sLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Cadre autour de la fiche
            const actualHeight = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualHeight);
            
            y += actualHeight + 3;
        };
        
        // ----- MODE LIST : 1 colonne dense, nom · perso · email · tél -----
        const renderList = (actorsArr) => {
            const lineHeight = 5.5;
            actorsArr.forEach(a => {
                y = FichesPDF._ensureSpace(doc, y, lineHeight, pageHeight, margin);
                const linked = getLinkedChar(a);
                
                // Colonnes calculées
                const nameW = usableWidth * 0.28;
                const roleW = usableWidth * 0.22;
                const emailW = usableWidth * 0.30;
                const phoneW = usableWidth * 0.20;
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                let txtName = a.name || '(sans nom)';
                while(doc.getTextWidth(txtName) > nameW - 2 && txtName.length > 5) txtName = txtName.substring(0, txtName.length - 2) + '…';
                doc.text(txtName, margin, y);
                
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtRole = linked ? linked.name : '—';
                while(doc.getTextWidth(txtRole) > roleW - 2 && txtRole.length > 3) txtRole = txtRole.substring(0, txtRole.length - 2) + '…';
                doc.text(txtRole, margin + nameW, y);
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtEmail = a.email || '—';
                while(doc.getTextWidth(txtEmail) > emailW - 2 && txtEmail.length > 5) txtEmail = txtEmail.substring(0, txtEmail.length - 2) + '…';
                doc.text(txtEmail, margin + nameW + roleW, y);
                
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(a.phone || '—', margin + nameW + roleW + emailW, y);
                
                // Ligne pointillée sous
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(margin, y + 1.5, margin + usableWidth, y + 1.5);
                doc.setLineDashPattern([], 0);
                
                y += lineHeight;
            });
            y += 2;
        };
        
        // ----- MODE CARD : 1 page A4 PAYSAGE par comédien (casting book) -----
        const renderCard = (a) => {
            const linked = getLinkedChar(a);
            const photoUrl = a.photo ? photoMap[a.photo] : null;
            
            // Bandeau titre coloré en haut
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text('COMÉDIEN·NE', margin, 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const projT = state.data.title || '';
            doc.text(projT, pageWidth - margin, 12, { align: 'right' });
            
            // Grande photo à gauche (75 x 100mm en paysage)
            const photoW2 = 75, photoH2 = 100;
            const photoX = margin;
            const photoY = 28;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, photoX, photoY, photoW2, photoH2);
            
            // Bloc infos à droite
            const infoX = photoX + photoW2 + 12;
            const infoWidth = pageWidth - infoX - margin;
            let iy = photoY + 6;
            
            // Nom XXL
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const nameLines = doc.splitTextToSize(a.name || '(sans nom)', infoWidth);
            nameLines.forEach(line => { doc.text(line, infoX, iy); iy += 8; });
            iy += 2;
            
            // Rôle joué
            if(linked) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('RÔLE', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(12);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                doc.text(linked.name, infoX, iy);
                iy += 7;
            }
            
            // Contact bloc
            const hasContact = a.email || a.phone || a.city || a.address || a.website;
            if(hasContact) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('CONTACT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                if(a.email)   { doc.text('Email : ' + a.email, infoX, iy); iy += 4.2; }
                if(a.phone)   { doc.text('Tél : '   + a.phone, infoX, iy); iy += 4.2; }
                if(a.city)    { doc.text('Ville : ' + a.city,  infoX, iy); iy += 4.2; }
                if(a.website) { doc.text('Web : '   + a.website, infoX, iy); iy += 4.2; }
                if(a.address) {
                    const addrLines = doc.splitTextToSize('Adresse : ' + a.address, infoWidth);
                    addrLines.slice(0, 2).forEach(l => { doc.text(l, infoX, iy); iy += 4.2; });
                }
                iy += 3;
            }
            
            // Statut professionnel
            const statText = optLabel('professionalStatus', a.professionalStatus);
            const collabText = collabLabel(a.collabType);
            if(statText || collabText) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('STATUT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                if(statText)   { doc.text(statText, infoX, iy); iy += 4.2; }
                if(collabText) { doc.text('Type : ' + collabText, infoX, iy); iy += 4.2; }
                iy += 3;
            }
            
            // Bio
            if(a.bio) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('PORTRAIT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const bioLines = doc.splitTextToSize(a.bio, infoWidth);
                bioLines.forEach(line => {
                    if(iy < pageHeight - 40) {
                        doc.text(line, infoX, iy);
                        iy += 4.3;
                    }
                });
            }
            
            // Bas de page : description physique + compétences en grille
            const bottomY = pageHeight - 38;
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
            
            // Colonne gauche : Physique
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('PHYSIQUE', margin, bottomY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const physLines = [];
            const gender = optLabel('gender', a.gender);
            if(gender && !gender.startsWith('--')) physLines.push('Sexe : ' + gender);
            if(a.age)    physLines.push('Âge : ' + a.age + ' ans');
            if(a.height) physLines.push('Taille : ' + a.height + ' cm');
            if(a.weight) physLines.push('Poids : ' + a.weight + ' kg');
            const eyes = optLabel('eyeColor', a.eyeColor);
            if(eyes && !eyes.startsWith('--')) physLines.push('Yeux : ' + eyes);
            const hairC2 = optLabel('hairColor', a.hairColor);
            if(hairC2 && !hairC2.startsWith('--')) physLines.push('Cheveux : ' + hairC2);
            const hairL = optLabel('hairLength', a.hairLength);
            if(hairL && !hairL.startsWith('--')) physLines.push('Longueur : ' + hairL);
            const corp2 = optLabel('corpulence', a.corpulence);
            if(corp2 && !corp2.startsWith('--')) physLines.push('Corpulence : ' + corp2);
            const eth = optLabel('ethnicity', a.ethnicity);
            if(eth && !eth.startsWith('--')) physLines.push('Origine : ' + eth);
            
            // 2 sous-colonnes pour le bloc physique (compact)
            const physColW = (pageWidth / 2 - margin - 6) / 2;
            physLines.forEach((line, i) => {
                const subCol = Math.floor(i / 4);
                const row = i % 4;
                doc.text(line, margin + subCol * physColW, bottomY + 5 + row * 4);
            });
            
            // Colonne droite : Compétences
            const rightColX = pageWidth / 2 + 5;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('COMPÉTENCES', rightColX, bottomY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            let sy = bottomY + 5;
            const skillW = pageWidth - rightColX - margin;
            if(a.sports) {
                const sLines = doc.splitTextToSize('Sports : ' + a.sports, skillW);
                sLines.slice(0, 2).forEach(l => { doc.text(l, rightColX, sy); sy += 4; });
            }
            if(a.languages) {
                const lLines = doc.splitTextToSize('Langues : ' + a.languages, skillW);
                lLines.slice(0, 2).forEach(l => { doc.text(l, rightColX, sy); sy += 4; });
            }
            if(!a.sports && !a.languages) {
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text('—', rightColX, sy);
            }
        };
        
        // ========= Exécution selon mode =========
        if(opts.mode === 'card') {
            // Mode fiche : 1 page A4 paysage par comédien, pas de groupes
            actorsInScope.forEach((a, idx) => {
                if(idx > 0) doc.addPage();
                renderCard(a);
            });
        } else {
            // Modes detailed et list : par groupes
            groupOrder.forEach((gid) => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                
                y = FichesPDF._ensureSpace(doc, y, 30, pageHeight, margin);
                y = FichesPDF._drawGroupHeader(doc, groupName, y, margin, usableWidth);
                
                if(opts.mode === 'detailed') {
                    grouped[gid].forEach(a => renderDetailed(a));
                } else if(opts.mode === 'list') {
                    renderList(grouped[gid]);
                }
            });
        }
        
        // ========= Footer =========
        FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Comédiens')
            : `${state.data.title || 'Projet'} - Comédiens - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Comédiens PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Comédiens PDF généré');
    },
    
    // ============================================================
    // ===== LIEUX =====
    // ============================================================
    
    openLocationsModal: () => {
        const locsAll = state.data.locations || [];
        if(locsAll.length === 0) {
            Utils.toast('Aucun décor à exporter', 'warning');
            return;
        }
        if(state.currentProjectType === 'series') {
            const continueToOptions = (episodeIds) => {
                const modes = [
                    { value: 'detailed', label: 'Détaillé', desc: '1 par ligne : vignette + adresse + contact + scènes' },
                    { value: 'list',     label: 'Liste',    desc: '1 colonne dense : nom · lieu réel · ville · nb scènes' },
                    { value: 'card',     label: 'Fiche',    desc: '1 page A4 paysage par décor + planche-contact des photos' }
                ];
                FichesPDF._openOptionsModal('🏠', 'Décors PDF — Options', modes, (opts) => {
                    FichesPDF.exportLocations({ ...opts, episodeIds });
                });
            };
            FichesPDF._openSeasonChooser('locs', '🏠', 'Décors — Choix des saisons', continueToOptions);
            return;
        }
        Actions.openExportModal('locs');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'locs');
        });
    },
    
    exportLocations: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        FichesPDF._accent = PdfTheme.accentFor('Décors');
        // Mode card → page A4 paysage. Autres modes → portrait.
        const isCard = opts.mode === 'card';
        const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        const isSeries = state.currentProjectType === 'series';
        
        // ========= Données =========
        const allLocs = state.data.locations || [];
        const groups = (state.data.groups || []).filter(g => g.type === 'lieu');
        const allScenes = state.data.scenes || [];
        
        // Filtrage par saisons (si série)
        let scenesScope = allScenes;
        if(isSeries && opts.episodeIds && opts.episodeIds.length > 0) {
            scenesScope = allScenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        // Helper : scènes tournées dans un lieu (matche le titre INT./EXT. NOM)
        const locationScenes = (loc, scenePool) => scenePool.filter(s => {
            if(!s.title) return false;
            const m = s.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
            if(m && m[1]) return m[1].trim().toUpperCase() === (loc.name || '').toUpperCase();
            return false;
        });
        
        // Filtrer lieux : si série filtrée, ne garder que ceux qui ont au moins 1 scène dans le scope
        const locsInScope = isSeries && opts.episodeIds && opts.episodeIds.length > 0
            ? allLocs.filter(loc => locationScenes(loc, scenesScope).length > 0)
            : allLocs;
        
        if(locsInScope.length === 0) {
            Utils.toast('Aucun décor à exporter dans cette sélection', 'warning');
            return;
        }
        
        // Helper : label scène avec notation série S01E01-SC01 si série
        const sceneLabel = (s) => {
            if(isSeries) {
                const ep = (state.data.episodes || []).find(e => e.id === s.episodeId);
                if(ep) {
                    const scenesInEp = allScenes.filter(x => x.episodeId === ep.id);
                    return UI.formatSceneNumber(s, scenesInEp.indexOf(s));
                }
            }
            return '#' + (allScenes.indexOf(s) + 1);
        };
        
        // Précharger toutes les photos en parallèle (1ère photo pour detailed, toutes pour card)
        Utils.toast('Préparation des photos...', 'info');
        const allUrls = [];
        locsInScope.forEach(loc => {
            const photos = loc.galleryPhotos || [];
            if(opts.mode === 'card') {
                photos.forEach(u => allUrls.push(u));
            } else if(opts.mode === 'detailed') {
                if(photos[0]) allUrls.push(photos[0]);
            }
        });
        const photoMap = await FichesPDF._preloadImages(allUrls);
        
        // ========= Page de garde =========
        if(opts.includeCover !== false) {
            FichesPDF._drawCoverPage(doc, 'Décors');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Grouper =========
        const grouped = {};
        locsInScope.forEach(loc => {
            const gid = loc.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(loc);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        
        // ----- MODE DETAILED : 1 fiche par ligne (portrait A4) -----
        const renderDetailed = (loc) => {
            const cardHeight = 50;
            y = FichesPDF._ensureSpace(doc, y, cardHeight, pageHeight, margin);
            
            // Vignette paysage 38x28mm (1ère photo de la galerie)
            const photoW = 38, photoH = 28;
            const photos = loc.galleryPhotos || [];
            const photoUrl = photos[0] ? photoMap[photos[0]] : null;
            FichesPDF._drawPhotoOrPlaceholder(doc, photoUrl, margin, y, photoW, photoH);
            
            const textX = margin + photoW + 6;
            const textWidth = usableWidth - photoW - 6;
            let ty = y + 5;
            
            // Nom (grand, gras)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(PdfTheme.cleanText(loc.name || '(sans nom)'), textX, ty);
            ty += 5;
            
            // Lieu réel (en italique) si différent du nom scénaristique
            if(loc.realName) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(PdfTheme.cleanText('Lieu réel : ' + loc.realName), textX, ty);
                ty += 4.2;
            }
            
            // Adresse
            if(loc.address) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const addrLines = doc.splitTextToSize('Adresse : ' + loc.address, textWidth);
                addrLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            
            // Contact (nom + tél sur une ligne)
            const contactBits = [];
            if(loc.contactName)  contactBits.push('Contact : ' + loc.contactName);
            if(loc.contactPhone) contactBits.push('Tél : ' + loc.contactPhone);
            if(contactBits.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const cLine = PdfTheme.cleanText(contactBits.join('   ·   '));
                const cLines = doc.splitTextToSize(cLine, textWidth);
                cLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            
            // Notes d'accès (max 2 lignes)
            if(loc.accessNotes) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.WARNING);
                const accLines = doc.splitTextToSize(PdfTheme.cleanText('Accès : ' + loc.accessNotes), textWidth);
                accLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Logistique de tournage (une ligne compacte, max 2 lignes)
            const logiBits = [];
            if(loc.rdvFiguration) logiBits.push('Rdv figuration : ' + loc.rdvFiguration);
            if(loc.hmcPlace)      logiBits.push('HMC : ' + loc.hmcPlace);
            if(loc.prodOffice)    logiBits.push('Bureau prod : ' + loc.prodOffice);
            if(loc.techParking)   logiBits.push('Stat. technique : ' + loc.techParking);
            if(loc.persoParking)  logiBits.push('Stat. perso : ' + loc.persoParking);
            if(logiBits.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const lgLines = doc.splitTextToSize(PdfTheme.cleanText(logiBits.join('   -   ')), textWidth);
                lgLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            }
            
            // Scènes
            const sList = locationScenes(loc, scenesScope);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            if(sList.length > 0) {
                const labels = sList.map(s => sceneLabel(s)).join('  ');
                const sceneText = `Scènes tournées (${sList.length}) : ${labels}`;
                const scLines = doc.splitTextToSize(sceneText, textWidth);
                scLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.5; });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text('Aucune scène dans ce décor', textX, ty);
                ty += 3.5;
            }
            
            // Badge "X photos disponibles" en haut à droite si galerie non vide
            if(photos.length > 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                const photoBadge = photos.length === 1 ? '1 photo' : `${photos.length} photos`;
                doc.text(photoBadge, margin + usableWidth, y + 4, { align: 'right' });
            }
            
            // Cadre autour de la fiche
            const actualHeight = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualHeight);
            
            y += actualHeight + 3;
        };
        
        // ----- MODE LIST : 1 colonne dense -----
        const renderList = (locsArr) => {
            const lineHeight = 5.5;
            // Colonnes : nom (28%) · realName (32%) · adresse courte (28%) · nb scènes (12%)
            const nameW = usableWidth * 0.28;
            const realW = usableWidth * 0.32;
            const addrW = usableWidth * 0.28;
            
            // En-tête de colonnes
            y = FichesPDF._ensureSpace(doc, y, lineHeight + 2, pageHeight, margin);
            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
            doc.rect(margin, y - 4, usableWidth, 6, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('DÉCOR', margin + 1, y);
            doc.text('LIEU RÉEL', margin + nameW + 1, y);
            doc.text('ADRESSE', margin + nameW + realW + 1, y);
            doc.text('SCÈNES', margin + usableWidth - 1, y, { align: 'right' });
            y += 6;
            
            locsArr.forEach(loc => {
                y = FichesPDF._ensureSpace(doc, y, lineHeight, pageHeight, margin);
                const sList = locationScenes(loc, scenesScope);
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                let txtName = loc.name || '(sans nom)';
                while(doc.getTextWidth(txtName) > nameW - 5 && txtName.length > 5) txtName = txtName.substring(0, txtName.length - 2) + '…';
                doc.text(txtName, margin, y);
                
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtReal = loc.realName || '—';
                while(doc.getTextWidth(txtReal) > realW - 5 && txtReal.length > 3) txtReal = txtReal.substring(0, txtReal.length - 2) + '…';
                doc.text(txtReal, margin + nameW, y);
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtAddr = loc.address || '—';
                while(doc.getTextWidth(txtAddr) > addrW - 5 && txtAddr.length > 5) txtAddr = txtAddr.substring(0, txtAddr.length - 2) + '…';
                doc.text(txtAddr, margin + nameW + realW, y);
                
                doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
                doc.text(`${sList.length} sc.`, margin + usableWidth, y, { align: 'right' });
                
                // Ligne pointillée sous
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(margin, y + 1.5, margin + usableWidth, y + 1.5);
                doc.setLineDashPattern([], 0);
                
                y += lineHeight;
            });
            y += 2;
        };
        
        // ----- MODE CARD : 1 page A4 paysage par décor + pages photos -----
        // Page principale = grande photo gauche + grid infos droite
        // Pages galerie suivantes = 2x2 = 4 photos par page paysage si galerie > 1
        const renderCard = (loc) => {
            const photos = loc.galleryPhotos || [];
            const coverPhotoUrl = photos[0] ? photoMap[photos[0]] : null;
            
            // ===== PAGE 1 : Page principale =====
            // Bandeau titre coloré en haut
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text('DÉCOR', margin, 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const projT = state.data.title || '';
            doc.text(projT, pageWidth - margin, 12, { align: 'right' });
            
            // Grande photo de couverture à gauche (110 x 80mm en paysage)
            const photoW2 = 110, photoH2 = 80;
            const photoX = margin;
            const photoY = 28;
            FichesPDF._drawPhotoOrPlaceholder(doc, coverPhotoUrl, photoX, photoY, photoW2, photoH2);
            
            // Bloc infos à droite
            const infoX = photoX + photoW2 + 12;
            const infoWidth = pageWidth - infoX - margin;
            let iy = photoY + 6;
            
            // Nom XXL
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const nameLines = doc.splitTextToSize(loc.name || '(sans nom)', infoWidth);
            nameLines.forEach(line => { doc.text(line, infoX, iy); iy += 7.5; });
            iy += 2;
            
            // Lieu réel
            if(loc.realName) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(11);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                const rLines = doc.splitTextToSize(loc.realName, infoWidth);
                rLines.forEach(line => { doc.text(line, infoX, iy); iy += 5; });
                iy += 3;
            }
            
            // Adresse
            if(loc.address) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('ADRESSE', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const aLines = doc.splitTextToSize(loc.address, infoWidth);
                aLines.forEach(line => { doc.text(line, infoX, iy); iy += 4.2; });
                iy += 3;
            }
            
            // Contact
            if(loc.contactName || loc.contactPhone) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('CONTACT SUR PLACE', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                if(loc.contactName)  { doc.text(PdfTheme.cleanText('Nom : ' + loc.contactName), infoX, iy); iy += 4.2; }
                if(loc.contactPhone) { doc.text(PdfTheme.cleanText('Tél : ' + loc.contactPhone), infoX, iy); iy += 4.2; }
                iy += 3;
            }
            
            // Notes d'accès
            if(loc.accessNotes) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('ACCÈS', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const accLines = doc.splitTextToSize(loc.accessNotes, infoWidth);
                accLines.forEach(line => {
                    if(iy < pageHeight - 50) {
                        doc.text(line, infoX, iy); iy += 4;
                    }
                });
                iy += 3;
            }
            
            // Description scénaristique
            if(loc.desc) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('DESCRIPTION', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const dLines = doc.splitTextToSize(loc.desc, infoWidth);
                dLines.forEach(line => {
                    if(iy < pageHeight - 50) {
                        doc.text(line, infoX, iy); iy += 4;
                    }
                });
            }
            
            // Bas de page : scènes tournées
            const sList = locationScenes(loc, scenesScope);
            const bottomY = pageHeight - 32;
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(`SCÈNES TOURNÉES DANS CE DÉCOR (${sList.length})`, margin, bottomY);
            if(sList.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                const labels = sList.map(s => sceneLabel(s)).join('   ·   ');
                const scLines = doc.splitTextToSize(labels, pageWidth - margin * 2);
                let sy = bottomY + 5;
                scLines.slice(0, 3).forEach(line => {
                    doc.text(line, margin, sy);
                    sy += 4;
                });
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text('Aucune scène dans ce décor', margin, bottomY + 5);
            }
            
            // ===== PAGES GALERIE : planche-contact 2x2 si galerie > 1 =====
            // (la 1ère photo est déjà en couverture page principale, on inclut quand même toutes les photos en planche pour cohérence)
            if(photos.length > 0) {
                const photosPerPage = 4; // 2x2 grid
                const pageCount = Math.ceil(photos.length / photosPerPage);
                
                for(let pi = 0; pi < pageCount; pi++) {
                    doc.addPage();
                    
                    // Bandeau galerie
                    doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
                    doc.rect(0, 0, pageWidth, 18, 'F');
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(14);
                    doc.setTextColor(...PdfTheme.COLORS.WHITE);
                    doc.text(PdfTheme.cleanText('PHOTOS — ' + (loc.name || '(sans nom)')), margin, 12);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.text(`Planche ${pi + 1}/${pageCount}`, pageWidth - margin, 12, { align: 'right' });
                    
                    // Grille 2x2
                    const gridStartY = 26;
                    const gridGap = 6;
                    const cellW = (pageWidth - margin * 2 - gridGap) / 2;
                    const cellH = (pageHeight - gridStartY - margin - gridGap) / 2;
                    
                    for(let i = 0; i < photosPerPage; i++) {
                        const photoIdx = pi * photosPerPage + i;
                        if(photoIdx >= photos.length) break;
                        const url = photos[photoIdx];
                        const dataUrl = photoMap[url];
                        const col = i % 2;
                        const row = Math.floor(i / 2);
                        const cx = margin + col * (cellW + gridGap);
                        const cy = gridStartY + row * (cellH + gridGap);
                        FichesPDF._drawPhotoOrPlaceholder(doc, dataUrl, cx, cy, cellW, cellH);
                        // Numéro de la photo en bas-droit de la cellule
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);
                        doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
                        doc.text(`Photo ${photoIdx + 1}/${photos.length}`, cx + cellW - 2, cy + cellH - 2, { align: 'right' });
                    }
                }
            }
        };
        
        // ========= Exécution selon mode =========
        if(opts.mode === 'card') {
            // Mode fiche : 1 page A4 paysage par décor + pages photos, pas de groupes
            locsInScope.forEach((loc, idx) => {
                if(idx > 0) doc.addPage();
                renderCard(loc);
            });
        } else {
            // Modes detailed et list : par groupes
            groupOrder.forEach((gid) => {
                const group = groups.find(g => g.id === gid);
                const groupName = group ? group.name : 'Non classé';
                
                y = FichesPDF._ensureSpace(doc, y, 30, pageHeight, margin);
                y = FichesPDF._drawGroupHeader(doc, groupName, y, margin, usableWidth);
                
                if(opts.mode === 'detailed') {
                    grouped[gid].forEach(loc => renderDetailed(loc));
                } else if(opts.mode === 'list') {
                    renderList(grouped[gid]);
                }
            });
        }
        
        // ========= Footer =========
        FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Décors')
            : `${state.data.title || 'Projet'} - Décors - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Décors PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Décors PDF généré');
    }
};


// ========== MODULE EXPORT SCÉNARIO ==========
const ScriptExport = {
    // Convertit le HTML du scénario en texte brut avec type de bloc
    parseScriptContent: (html) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const blocks = [];
        
        temp.querySelectorAll('div, p').forEach(el => {
            const text = el.innerText.trim();
            if(!text) return;
            
            let type = 'action';
            if(el.classList.contains('sc-action')) type = 'action';
            else if(el.classList.contains('sc-perso')) type = 'character';
            else if(el.classList.contains('sc-dial')) type = 'dialogue';
            else if(el.classList.contains('sc-paren')) type = 'parenthetical';
            else if(el.classList.contains('sc-trans')) type = 'transition';
            else if(el.classList.contains('sc-centered')) type = 'centered';
            else if(el.classList.contains('sc-note')) type = 'note';
            else if(el.classList.contains('sc-general')) type = 'general';
            
            blocks.push({ type, text });
        });
        
        return blocks;
    },
    
    // ========== EXPORT FOUNTAIN ==========
    toFountain: () => {
        if(!state.data.scenes || state.data.scenes.length === 0) {
            Utils.toast('Aucune scène à exporter', 'warning');
            return;
        }
        
        let fountain = '';
        const meta = state.data.scriptMeta || {};
        
        // Page de titre (format Fountain)
        fountain += `Title: ${state.data.title || 'Sans titre'}\n`;
        if(meta.author) {
            fountain += `Author: ${meta.author}`;
            if(meta.coAuthor) fountain += ` & ${meta.coAuthor}`;
            fountain += '\n';
        }
        if(meta.draft) fountain += `Draft date: ${meta.draft}${meta.draftDate ? ' - ' + meta.draftDate : ''}\n`;
        if(meta.contact) fountain += `Contact: ${meta.contact}\n`;
        if(meta.copyright) fountain += `Copyright: ${meta.copyright}\n`;
        if(meta.source) fountain += `Credit: Basé sur ${meta.source}\n`;
        if(meta.notes) fountain += `Notes: ${meta.notes}\n`;
        fountain += '\n';
        
        // Scènes
        state.data.scenes.forEach((scene, idx) => {
            // Scene heading (forcer avec .)
            const heading = scene.title.toUpperCase();
            if(heading.match(/^(INT|EXT|I\/E|INT\.\/EXT)/)) {
                fountain += `\n${heading}\n\n`;
            } else {
                fountain += `\n.${heading}\n\n`;
            }
            
            // Contenu de la scène
            const blocks = ScriptExport.parseScriptContent(scene.scriptContent || '');
            
            blocks.forEach(block => {
                switch(block.type) {
                    case 'action':
                        fountain += `${block.text}\n\n`;
                        break;
                    case 'character':
                        fountain += `${block.text.toUpperCase()}\n`;
                        break;
                    case 'dialogue':
                        fountain += `${block.text}\n\n`;
                        break;
                    case 'parenthetical':
                        const paren = block.text.startsWith('(') ? block.text : `(${block.text})`;
                        fountain += `${paren}\n`;
                        break;
                    case 'transition':
                        fountain += `> ${block.text.toUpperCase()}\n\n`;
                        break;
                    case 'centered':
                        fountain += `> ${block.text} <\n\n`;
                        break;
                    case 'note':
                        fountain += `[[${block.text}]]\n\n`;
                        break;
                    case 'general':
                        fountain += `/* ${block.text} */\n\n`;
                        break;
                }
            });
        });
        
        // Télécharger le fichier
        const filename = (state.data.title || 'scenario').replace(/[^a-z0-9]/gi, '_') + '.fountain';
        ScriptExport.downloadFile(fountain, filename, 'text/plain');
        Utils.toast('Export Fountain réussi !', 'success');
    },
    
    // ========== EXPORT FDX (Final Draft) ==========
    toFDX: () => {
        if(!state.data.scenes || state.data.scenes.length === 0) {
            Utils.toast('Aucune scène à exporter', 'warning');
            return;
        }
        
        const meta = state.data.scriptMeta || {};
        
        // Construire le XML FDX
        let fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <TitlePage>
      <Content>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>${ScriptExport.escapeXml(state.data.title || 'Sans titre')}</Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text></Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>écrit par</Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.author || '')}${meta.coAuthor ? ' & ' + ScriptExport.escapeXml(meta.coAuthor) : ''}</Text>
        </Paragraph>`;
        
        if(meta.source) {
            fdx += `
        <Paragraph Alignment="Center" Type="Title Page">
          <Text></Text>
        </Paragraph>
        <Paragraph Alignment="Center" Type="Title Page">
          <Text>Basé sur ${ScriptExport.escapeXml(meta.source)}</Text>
        </Paragraph>`;
        }
        
        fdx += `
        <Paragraph Alignment="Left" Type="Title Page">
          <Text></Text>
        </Paragraph>
        <Paragraph Alignment="Left" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.draft || '')}${meta.draftDate ? ' - ' + meta.draftDate : ''}</Text>
        </Paragraph>
        <Paragraph Alignment="Left" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.contact || '')}</Text>
        </Paragraph>`;
        
        if(meta.copyright) {
            fdx += `
        <Paragraph Alignment="Left" Type="Title Page">
          <Text>${ScriptExport.escapeXml(meta.copyright)}</Text>
        </Paragraph>`;
        }
        
        fdx += `
      </Content>
    </TitlePage>
`;
        
        // Scènes
        state.data.scenes.forEach((scene, idx) => {
            // Scene Heading
            fdx += `    <Paragraph Type="Scene Heading" Number="${idx + 1}">
      <Text>${ScriptExport.escapeXml(scene.title.toUpperCase())}</Text>
    </Paragraph>\n`;
            
            // Contenu
            const blocks = ScriptExport.parseScriptContent(scene.scriptContent || '');
            
            blocks.forEach(block => {
                let fdxType = 'Action';
                switch(block.type) {
                    case 'action': fdxType = 'Action'; break;
                    case 'character': fdxType = 'Character'; break;
                    case 'dialogue': fdxType = 'Dialogue'; break;
                    case 'parenthetical': fdxType = 'Parenthetical'; break;
                    case 'transition': fdxType = 'Transition'; break;
                    case 'centered': fdxType = 'Action'; break; // FDX n'a pas de type centré natif
                    case 'note': fdxType = 'Action'; break;
                    case 'general': fdxType = 'General'; break;
                }
                
                let text = block.text;
                if(block.type === 'note') text = `[NOTE: ${text}]`;
                
                fdx += `    <Paragraph Type="${fdxType}"${block.type === 'centered' ? ' Alignment="Center"' : ''}>
      <Text>${ScriptExport.escapeXml(text)}</Text>
    </Paragraph>\n`;
            });
        });
        
        fdx += `  </Content>
</FinalDraft>`;
        
        // Télécharger le fichier
        const filename = (state.data.title || 'scenario').replace(/[^a-z0-9]/gi, '_') + '.fdx';
        ScriptExport.downloadFile(fdx, filename, 'application/xml');
        Utils.toast('Export Final Draft réussi !', 'success');
    },
    
    // Utilitaires
    escapeXml: (str) => {
        if(!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&apos;');
    },
    
    downloadFile: (content, filename, mimeType) => {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// ========== MODULE RAPPORT DE SCRIPT / CONTINUITÉ ==========
const ScriptReport = {
    currentSceneId: null,
    currentShotId: null,
    currentReportIdx: 0,
    
    init: () => {
        ScriptReport.renderScenesList();
    },
    
    // Rendu de la liste des scènes et plans (sidebar gauche)
    renderScenesList: () => {
        const container = document.getElementById('sr-scenes-list');
        if(!container) return;
        
        const scenes = state.data.scenes || [];
        if(scenes.length === 0) {
            container.innerHTML = '<div style="padding: 20px; color: var(--text-sec); text-align: center;">Aucune scène créée</div>';
            return;
        }
        
        let html = '';
        scenes.forEach((scene, idx) => {
            const sceneNum = idx + 1;
            const shots = (state.data.shots || []).filter(s => s.sceneId === scene.id);
            const isActive = ScriptReport.currentSceneId === scene.id && !ScriptReport.currentShotId;
            
            html += `
                <div class="sr-scene-item ${isActive ? 'active' : ''}" onclick="app.ScriptReport.selectScene('${scene.id}')">
                    <div class="sr-scene-title">Sc.${sceneNum} - ${Utils.escape(scene.title || 'Sans titre')}</div>
                    <div style="font-size: 0.8rem; opacity: 0.7;">${shots.length} plan(s)</div>
                </div>
                <div class="sr-shot-list" id="sr-shots-${scene.id}">
                    ${shots.map((shot, shotIdx) => {
                        const hasReport = ScriptReport.hasReport(scene.id, shot.id);
                        const isActiveShot = ScriptReport.currentShotId === shot.id;
                        return `<div class="sr-shot-item ${isActiveShot ? 'active' : ''} ${hasReport ? 'has-report' : ''}" data-fiche="rapport:${Utils.escape(String(scene.id) + '_' + String(shot.id))}" onclick="event.stopPropagation(); app.ScriptReport.selectShot('${scene.id}', '${shot.id}')">
                            Plan ${shotIdx + 1}${shot.name ? ' - ' + Utils.escape(shot.name) : ''}
                        </div>`;
                    }).join('')}
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    hasReport: (sceneId, shotId) => {
        if(!state.data.scriptReports) return false;
        const key = `${sceneId}_${shotId}`;
        return state.data.scriptReports[key] && state.data.scriptReports[key].length > 0;
    },
    
    selectScene: (sceneId) => {
        ScriptReport.currentSceneId = sceneId;
        ScriptReport.currentShotId = null;
        ScriptReport.renderScenesList();
        ScriptReport.showSceneOverview(sceneId);
    },
    
    selectShot: (sceneId, shotId) => {
        try { if(typeof FicheLock !== 'undefined'
                 && FicheLock.ouvrir('rapport', sceneId + '_' + shotId, 'Ce rapport') === false) return; } catch(e) {}
        ScriptReport.currentSceneId = sceneId;
        ScriptReport.currentShotId = shotId;
        ScriptReport.currentReportIdx = 0;
        ScriptReport.renderScenesList();
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
    showSceneOverview: (sceneId) => {
        const container = document.getElementById('sr-sheet-container');
        const scene = state.data.scenes.find(s => s.id === sceneId);
        if(!scene) return;
        
        const sceneIdx = state.data.scenes.indexOf(scene) + 1;
        const shots = (state.data.shots || []).filter(s => s.sceneId === sceneId);
        
        container.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <h2 class="mb-10">Scène ${sceneIdx} - ${Utils.escape(scene.title || 'Sans titre')}</h2>
                <p class="text-sec-mb20">${Utils.escape(scene.perso || 'Personnages non définis')}</p>
                <p style="margin-bottom: 30px;">${shots.length} plan(s) dans cette scène</p>
                ${shots.length > 0 ? '<p class="text-sec">Cliquez sur un plan dans la liste pour remplir sa fiche.</p>' : '<p style="color: var(--warning);">Ajoutez des plans dans le Storyboard pour créer des fiches de script.</p>'}
            </div>
        `;
    },
    
    // Récupérer les infos auto-remplies
    getAutoFillData: (sceneId, shotId) => {
        const scene = state.data.scenes.find(s => s.id === sceneId);
        const shot = (state.data.shots || []).find(s => s.id === shotId);
        const sceneIdx = state.data.scenes.indexOf(scene) + 1;
        const shots = (state.data.shots || []).filter(s => s.sceneId === sceneId);
        const shotIdx = shots.indexOf(shot) + 1;
        
        // Trouver le jour de tournage lié à cette scène
        let shootDay = null;
        (state.data.shootingDays || []).forEach(day => {
            if((day.scenes || []).some(s => s.sceneId === sceneId)) {
                shootDay = day;
            }
        });
        
        // Chercher le cadreur (groupe caméra gc3 ou chercher "cadreur" dans le rôle)
        let cadreur = '';
        const crew = state.data.crew || [];
        const cadreurMember = crew.find(c => c.group_id === 'gc3' || (c.role || '').toLowerCase().includes('cadreur') || (c.role || '').toLowerCase().includes('camera'));
        if(cadreurMember) cadreur = cadreurMember.name;
        
        // Parser le titre de la scène pour INT/EXT et JOUR/NUIT
        const title = scene?.title || '';
        const isInt = /\bINT\b/i.test(title);
        const isExt = /\bEXT\b/i.test(title);
        const isJour = /\bJOUR\b/i.test(title);
        const isNuit = /\bNUIT\b/i.test(title);
        
        // Récupérer les dialogues depuis le contenu de la scène (personnages + dialogues + didascalies)
        // Le contenu est dans scriptContent sous forme HTML avec classes sc-perso, sc-dial, sc-paren
        let dialogues = '';
        if(scene?.scriptContent) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = scene.scriptContent;
            const dialogueLines = [];
            
            // Parcourir tous les éléments du script
            tempDiv.querySelectorAll('.sc-perso, .sc-dial, .sc-paren').forEach(el => {
                const text = el.textContent.trim();
                if(!text) return;
                
                if(el.classList.contains('sc-perso')) {
                    // Nom du personnage
                    dialogueLines.push('');
                    dialogueLines.push(text.toUpperCase());
                } else if(el.classList.contains('sc-paren')) {
                    // Didascalie
                    dialogueLines.push('  (' + text.replace(/^\(|\)$/g, '') + ')');
                } else if(el.classList.contains('sc-dial')) {
                    // Dialogue
                    dialogueLines.push('  ' + text);
                }
            });
            
            dialogues = dialogueLines.join('\n').trim();
        }
        
        // Déterminer effet jour/nuit et int/ext
        const effet = isJour ? 'jour' : (isNuit ? 'nuit' : '');
        const lieu = isInt ? 'int' : (isExt ? 'ext' : '');
        
        return {
            film: state.data.title || '',
            decor: scene?.location || title.split('-')[0]?.replace(/INT|EXT/gi, '').trim() || '',
            date: shootDay?.startDate ? new Date(shootDay.startDate).toLocaleDateString('fr-FR') : '',
            plan: `${sceneIdx}-${shotIdx}`,
            planNom: shot?.name || '',
            camera: cadreur,
            objectif: shot?.lens || '',
            effet: effet,
            lieu: lieu,
            description: shot?.description || shot?.notes || '',
            dialogues: dialogues
        };
    },
    
    // Rendu de la fiche de script
    renderSheet: (sceneId, shotId) => {
        const container = document.getElementById('sr-sheet-container');
        if(!container) return;
        
        // Initialiser le stockage si nécessaire
        if(!state.data.scriptReports) state.data.scriptReports = {};
        const key = `${sceneId}_${shotId}`;
        if(!state.data.scriptReports[key]) state.data.scriptReports[key] = [];
        
        const reports = state.data.scriptReports[key];
        const autoFill = ScriptReport.getAutoFillData(sceneId, shotId);
        
        // Si aucun rapport, en créer un nouveau
        if(reports.length === 0) {
            reports.push(ScriptReport.createNewReport(autoFill));
            Store.save();
        }
        
        const idx = Math.min(ScriptReport.currentReportIdx, reports.length - 1);
        const report = reports[idx] || {};
        
        // Navigation entre les fiches
        let navHtml = '';
        if(reports.length > 1 || true) {
            navHtml = `<div class="sr-nav-reports">
                ${reports.map((r, i) => `<button class="sr-nav-btn ${i === idx ? 'active' : ''}" onclick="app.ScriptReport.switchReport(${i})">Fiche ${i + 1}</button>`).join('')}
                <button class="sr-nav-btn" onclick="app.ScriptReport.addReport('${sceneId}', '${shotId}')" style="background: var(--success); color: white;">+ Nouvelle fiche</button>
                ${reports.length > 1 ? `<button class="sr-nav-btn" onclick="app.ScriptReport.deleteReport('${sceneId}', '${shotId}', ${idx})" style="background: var(--danger); color: white;">🗑️</button>` : ''}
            </div>`;
        }
        
        // v601 — VERROU PAR RAPPORT. Un rapport de script EST une fiche : il a
        // une clef stable (« scene_plan ») et un contenu a lui. Il etait reste
        // sur un verrou d'onglet parce que je l'avais classe « cas mixte » avec
        // les Depenses — a tort : le budget est un objet unique, un rapport
        // non. La seule vraie particularite est que les rapports sont ranges
        // dans un DICTIONNAIRE et non dans une liste, ce qui ne change rien au
        // verrou et demande seulement une fusion a part (StoreRealtime._carteAJour).
        // C'est ici que sont les champs : c'est donc ici que le verrou s'accroche.
        container.innerHTML = `
            ${navHtml}
            <div class="sr-sheet" data-fiche="rapport:${Utils.escape(String(key))}">
                <!-- Ligne 1: FILM / DÉCOR / DATE / PLAN / EFFET -->
                <div class="sr-sheet-row" style="grid-template-columns: 1fr 1fr 120px 100px 180px;">
                    <div class="sr-sheet-cell"><strong>FILM :</strong><br><input type="text" value="${Utils.escape(report.film || autoFill.film)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'film', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>DÉCOR :</strong><br><input type="text" value="${Utils.escape(report.decor || autoFill.decor)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'decor', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>DATE :</strong><br><input type="text" value="${Utils.escape(report.date || autoFill.date)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'date', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>PLAN :</strong><br>${Utils.escape(report.plan || autoFill.plan)}</div>
                    <div class="sr-sheet-cell">
                        <strong>EFFET :</strong><br>
                        <select style="padding: 4px;" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'effet', this.value)">
                            <option value="" ${!(report.effet || autoFill.effet) ? 'selected' : ''}>-</option>
                            <option value="jour" ${(report.effet || autoFill.effet) === 'jour' ? 'selected' : ''}>JOUR</option>
                            <option value="nuit" ${(report.effet || autoFill.effet) === 'nuit' ? 'selected' : ''}>NUIT</option>
                        </select>
                        <select style="padding: 4px;" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'lieu', this.value)">
                            <option value="" ${!(report.lieu || autoFill.lieu) ? 'selected' : ''}>-</option>
                            <option value="int" ${(report.lieu || autoFill.lieu) === 'int' ? 'selected' : ''}>INT</option>
                            <option value="ext" ${(report.lieu || autoFill.lieu) === 'ext' ? 'selected' : ''}>EXT</option>
                        </select>
                    </div>
                </div>
                
                <!-- Ligne 2: SON / SUPPORTS / CAMÉRA / OBJECTIF -->
                <div class="sr-sheet-row" style="grid-template-columns: 100px 1fr 150px 150px;">
                    <div class="sr-sheet-cell">
                        <strong>SON :</strong><br>
                        <select style="padding: 4px; width: 100%;" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'son', this.value)">
                            <option value="sonore" ${report.son !== 'muet' ? 'selected' : ''}>SONORE</option>
                            <option value="muet" ${report.son === 'muet' ? 'selected' : ''}>MUET</option>
                        </select>
                    </div>
                    <div class="sr-sheet-cell"><strong>Supports :</strong><br><input type="text" value="${Utils.escape(report.supports || '')}" placeholder="Noms des supports..." data-tooltip="Noms des supports..." onchange="app.ScriptReport.updateField('${key}', ${idx}, 'supports', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>CAMÉRA :</strong><br><input type="text" value="${Utils.escape(report.camera || autoFill.camera)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'camera', this.value)" class="w-full"></div>
                    <div class="sr-sheet-cell"><strong>OBJECTIF :</strong><br><input type="text" value="${Utils.escape(report.objectif || autoFill.objectif)}" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'objectif', this.value)" class="w-full"></div>
                </div>
                
                <!-- Ligne 3: NOTE (texte libre) -->
                <div class="sr-sheet-row" style="grid-template-columns: 1fr;">
                    <div class="sr-sheet-cell"><strong>NOTE :</strong><br><textarea style="width: 100%; height: 50px; border: none; resize: vertical;" placeholder="Notes libres..." data-tooltip="Notes libres..." onchange="app.ScriptReport.updateField('${key}', ${idx}, 'note', this.value)">${Utils.escape(report.note || '')}</textarea></div>
                </div>
                
                <!-- Tableau des prises -->
                <div class="p-10">
                    <div class="section-header-10">
                        <strong>PRISES</strong>
                        <button onclick="app.ScriptReport.addTake('${key}', ${idx})" style="padding: 5px 10px; background: var(--success); color: white; border: none; border-radius: 4px; cursor: pointer;">+ Prise</button>
                    </div>
                    <table class="sr-takes-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;">Prise</th>
                                <th style="width: 70px;">N° Son</th>
                                <th style="width: 70px;">N° Image</th>
                                <th style="width: 200px;">Qualité</th>
                                <th>Notes</th>
                                <th style="width: 40px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(report.takes || []).map((take, tIdx) => `
                                <tr>
                                    <td style="text-align: center; vertical-align: top; padding-top: 10px;">
                                        <div class="fw-bold">${tIdx + 1}</div>
                                        <div class="mt-5">
                                            <span style="font-size: 1.3rem; color: ${take.star === 'gold' ? '#FFD700' : take.star === 'silver' ? '#A0A0A0' : '#CCC'}; cursor: pointer;" onclick="app.ScriptReport.showStarMenu(event, '${key}', ${idx}, ${tIdx})" title="Marquer cette prise">${take.star ? '★' : '☆'}</span>
                                        </div>
                                    </td>
                                    <td style="vertical-align: top; padding-top: 8px;"><input type="text" value="${Utils.escape(take.numSon || '')}" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'numSon', this.value)" style="width: 100%; border: none; text-align: center;"></td>
                                    <td style="vertical-align: top; padding-top: 8px;"><input type="text" value="${Utils.escape(take.numImage || '')}" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'numImage', this.value)" style="width: 100%; border: none; text-align: center;"></td>
                                    <td style="padding: 5px; vertical-align: top;">
                                        <div class="sr-quality-row">
                                            <span class="sr-quality-label">Son</span>
                                            <select class="sr-quality-select" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'qualitySon', this.value)">
                                                <option value="" ${!take.qualitySon ? 'selected' : ''}>-</option>
                                                <option value="5" ${take.qualitySon === '5' ? 'selected' : ''}>★★★★★ Excellent</option>
                                                <option value="4" ${take.qualitySon === '4' ? 'selected' : ''}>★★★★☆ Très bien</option>
                                                <option value="3" ${take.qualitySon === '3' ? 'selected' : ''}>★★★☆☆ Bien</option>
                                                <option value="2" ${take.qualitySon === '2' ? 'selected' : ''}>★★☆☆☆ Moyen</option>
                                                <option value="1" ${take.qualitySon === '1' ? 'selected' : ''}>★☆☆☆☆ Pas bien</option>
                                            </select>
                                        </div>
                                        <div class="sr-quality-row">
                                            <span class="sr-quality-label">Image</span>
                                            <select class="sr-quality-select" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'qualityImage', this.value)">
                                                <option value="" ${!take.qualityImage ? 'selected' : ''}>-</option>
                                                <option value="5" ${take.qualityImage === '5' ? 'selected' : ''}>★★★★★ Excellent</option>
                                                <option value="4" ${take.qualityImage === '4' ? 'selected' : ''}>★★★★☆ Très bien</option>
                                                <option value="3" ${take.qualityImage === '3' ? 'selected' : ''}>★★★☆☆ Bien</option>
                                                <option value="2" ${take.qualityImage === '2' ? 'selected' : ''}>★★☆☆☆ Moyen</option>
                                                <option value="1" ${take.qualityImage === '1' ? 'selected' : ''}>★☆☆☆☆ Pas bien</option>
                                            </select>
                                        </div>
                                        <div class="sr-quality-row">
                                            <span class="sr-quality-label">Acting</span>
                                            <select class="sr-quality-select" onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'qualityActing', this.value)">
                                                <option value="" ${!take.qualityActing ? 'selected' : ''}>-</option>
                                                <option value="5" ${take.qualityActing === '5' ? 'selected' : ''}>★★★★★ Excellent</option>
                                                <option value="4" ${take.qualityActing === '4' ? 'selected' : ''}>★★★★☆ Très bien</option>
                                                <option value="3" ${take.qualityActing === '3' ? 'selected' : ''}>★★★☆☆ Bien</option>
                                                <option value="2" ${take.qualityActing === '2' ? 'selected' : ''}>★★☆☆☆ Moyen</option>
                                                <option value="1" ${take.qualityActing === '1' ? 'selected' : ''}>★☆☆☆☆ Pas bien</option>
                                            </select>
                                        </div>
                                    </td>
                                    <td style="vertical-align: top;"><textarea placeholder="Notes, raccords, remarques..." data-tooltip="Notes, raccords, remarques..." onchange="app.ScriptReport.updateTake('${key}', ${idx}, ${tIdx}, 'notes', this.value)" style="width: 100%; min-height: 80px; border: 1px solid #ccc; border-radius: 4px; padding: 5px; font-size: 0.85rem;">${Utils.escape(take.notes || '')}</textarea></td>
                                    <td style="vertical-align: top; padding-top: 8px;"><button onclick="app.ScriptReport.removeTake('${key}', ${idx}, ${tIdx})" style="background: var(--danger); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">×</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <!-- Description du plan et Dialogues -->
                <div class="sr-sheet-row" style="grid-template-columns: 1fr 1fr;">
                    <div class="sr-sheet-cell p-10">
                        <strong>Description du Plan</strong>
                        <textarea class="n8-misc-3" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'description', this.value)">${Utils.escape(report.description || autoFill.description)}</textarea>
                    </div>
                    <div class="sr-sheet-cell p-10">
                        <strong>Dialogues</strong>
                        <textarea class="n8-misc-3" onchange="app.ScriptReport.updateField('${key}', ${idx}, 'dialogues', this.value)">${Utils.escape(report.dialogues || autoFill.dialogues)}</textarea>
                    </div>
                </div>
            </div>
        `;
    },
    
    createNewReport: (autoFill = {}) => ({
        film: autoFill.film || '',
        date: autoFill.date || '',
        plan: autoFill.plan || '',
        decor: autoFill.decor || '',
        camera: autoFill.camera || '',
        objectif: autoFill.objectif || '',
        effet: autoFill.effet || '',
        lieu: autoFill.lieu || '',
        bobine: '',
        son: 'sonore',
        supports: '',
        description: autoFill.description || '',
        dialogues: autoFill.dialogues || '',
        takes: [],
        createdAt: Date.now()
    }),
    
    updateField: (key, idx, field, value) => {
        if(!state.data.scriptReports[key]) return;
        if(!state.data.scriptReports[key][idx]) return;
        state.data.scriptReports[key][idx][field] = value;
        Store.save();
    },
    
    // Fix: shotId contient des underscores (Utils.generateUniqueId = timestamp_hash),
    // donc on split uniquement sur le premier _ pour reconstituer shotId complet
    splitKey: (key) => {
        const idx = (key || '').indexOf('_');
        if(idx === -1) return [key, ''];
        return [key.substring(0, idx), key.substring(idx + 1)];
    },
    
    addTake: (key, reportIdx) => {
        if(!state.data.scriptReports[key]) return;
        if(!state.data.scriptReports[key][reportIdx]) return;
        if(!state.data.scriptReports[key][reportIdx].takes) state.data.scriptReports[key][reportIdx].takes = [];
        
        state.data.scriptReports[key][reportIdx].takes.push({
            numSon: '',
            numImage: '',
            qualitySon: '',
            qualityImage: '',
            qualityActing: '',
            notes: ''
        });
        
        Store.save();
        // Fix : shotId contient des underscores (format '1776858_f8pjm8key'), 
        // on split uniquement sur le premier _ pour reconstituer shotId complet
        const idx = key.indexOf('_');
        const sceneId = key.substring(0, idx);
        const shotId = key.substring(idx + 1);
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
    updateTake: (key, reportIdx, takeIdx, field, value) => {
        if(!state.data.scriptReports[key]?.[reportIdx]?.takes?.[takeIdx]) return;
        state.data.scriptReports[key][reportIdx].takes[takeIdx][field] = value;
        Store.save();
    },
    
    setTakeStar: (key, reportIdx, takeIdx, value) => {
        if(!state.data.scriptReports[key]?.[reportIdx]?.takes?.[takeIdx]) return;
        state.data.scriptReports[key][reportIdx].takes[takeIdx].star = value;
        Store.save();
        // Fix : split uniquement sur le premier _ pour reconstituer shotId complet
        const idx = key.indexOf('_');
        const sceneId = key.substring(0, idx);
        const shotId = key.substring(idx + 1);
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
    showStarMenu: (event, key, reportIdx, takeIdx) => {
        event.stopPropagation();
        // Fermer tout menu existant
        document.querySelectorAll('.sr-star-menu').forEach(m => m.remove());
        
        const menu = document.createElement('div');
        menu.className = 'sr-star-menu';
        menu.style.cssText = 'position: absolute; background: var(--panel-bg); color: var(--text-main); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: var(--z-dropdown); padding: 5px 0;';
        menu.innerHTML = `
            <div style="padding: 8px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="app.ScriptReport.setTakeStar('${key}', ${reportIdx}, ${takeIdx}, 'gold'); this.parentElement.remove();">
                <span style="font-size: 1.3rem; color: #FFD700;">★</span> <span>Or</span>
            </div>
            <div style="padding: 8px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="app.ScriptReport.setTakeStar('${key}', ${reportIdx}, ${takeIdx}, 'silver'); this.parentElement.remove();">
                <span style="font-size: 1.3rem; color: #A0A0A0;">★</span> <span>Argent</span>
            </div>
            <div style="padding: 8px 15px; cursor: pointer; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="app.ScriptReport.setTakeStar('${key}', ${reportIdx}, ${takeIdx}, ''); this.parentElement.remove();">
                <span style="font-size: 1.3rem; color: #CCC;">☆</span> <span>Aucune</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Positionner le menu
        const rect = event.target.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 5) + 'px';
        
        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }, { once: true });
        }, 10);
    },
    
    removeTake: async (key, reportIdx, takeIdx) => {
        if(!await ConfirmModal.confirmDelete('Supprimer cette prise ?')) return;
        if(!state.data.scriptReports[key]?.[reportIdx]?.takes) return;
        state.data.scriptReports[key][reportIdx].takes.splice(takeIdx, 1);
        Store.save();
        const [sceneId, shotId] = ScriptReport.splitKey(key);
        ScriptReport.renderSheet(sceneId, shotId);
    },
    
       
    switchReport: (idx) => {
        ScriptReport.currentReportIdx = idx;
        if(ScriptReport.currentSceneId && ScriptReport.currentShotId) {
            ScriptReport.renderSheet(ScriptReport.currentSceneId, ScriptReport.currentShotId);
        }
    },
    
    addReport: (sceneId, shotId) => {
        const key = `${sceneId}_${shotId}`;
        if(!state.data.scriptReports[key]) state.data.scriptReports[key] = [];
        const autoFill = ScriptReport.getAutoFillData(sceneId, shotId);
        state.data.scriptReports[key].push(ScriptReport.createNewReport(autoFill));
        ScriptReport.currentReportIdx = state.data.scriptReports[key].length - 1;
        Store.save();
        ScriptReport.renderScenesList();
        ScriptReport.renderSheet(sceneId, shotId);
        Utils.toast('Nouvelle fiche créée', 'success');
    },
    
    deleteReport: async (sceneId, shotId, idx) => {
        if(!await ConfirmModal.confirmDelete('Supprimer cette fiche de script ?')) return;
        const key = `${sceneId}_${shotId}`;
        if(!state.data.scriptReports[key]) return;
        state.data.scriptReports[key].splice(idx, 1);
        ScriptReport.currentReportIdx = Math.max(0, idx - 1);
        Store.save();
        ScriptReport.renderScenesList();
        ScriptReport.renderSheet(sceneId, shotId);
        Utils.toast('Fiche supprimée', 'success');
    },
    
    openPrintChooser: () => {
        // Construire la liste : pour chaque scène ayant au moins 1 fiche, lister les plans concernés et leurs fiches
        const reports = state.data.scriptReports || {};
        const reportKeys = Object.keys(reports).filter(k => reports[k] && reports[k].length > 0);
        if(reportKeys.length === 0) { Utils.toast('Aucune fiche à imprimer', 'warning'); return; }
        // Grouper par sceneId — ATTENTION : les IDs de scène et de plan contiennent des underscores
        // (Utils.generateUniqueId = timestamp + '_' + hash), donc on ne peut PAS splitter simplement
        // sur le premier '_'. On cherche quel sceneId existant matche le début de la clé.
        const allScenes = state.data.scenes || [];
        const allShots = state.data.shots || [];
        const bySceneId = {};
        reportKeys.forEach(key => {
            // Trouver la scène dont l'ID + '_' est préfixe de la clé
            let matchedScene = allScenes.find(s => key.startsWith(s.id + '_'));
            let sceneId, shotId;
            if(matchedScene) {
                sceneId = matchedScene.id;
                shotId = key.substring(matchedScene.id.length + 1);
            } else {
                // Fallback : si on ne trouve pas la scène (orphan), on utilise la clé entière comme sceneId
                sceneId = '__orphan__';
                shotId = key;
            }
            if(!bySceneId[sceneId]) bySceneId[sceneId] = [];
            bySceneId[sceneId].push({ key, shotId, reports: reports[key] });
        });
        // Trier les scènes selon l'ordre dans state.data.scenes
        const sortedSceneIds = Object.keys(bySceneId).sort((a, b) => {
            if(a === '__orphan__') return 1;
            if(b === '__orphan__') return -1;
            const ia = allScenes.findIndex(s => s.id === a);
            const ib = allScenes.findIndex(s => s.id === b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });
        // Gérer les orphelins : pas de scène trouvée → label "Fiches orphelines"
        // Construire HTML colonnes — pas de checkbox carrée, les zones cliquables
        // sont les bandeaux de scène et les lignes de fiche directement (gain de place + plus joli)
        const colsHTML = sortedSceneIds.map(sceneId => {
            const isOrphan = sceneId === '__orphan__';
            const scene = isOrphan ? null : allScenes.find(s => s.id === sceneId);
            const sceneIdx = scene ? allScenes.indexOf(scene) : -1;
            const sceneNum = scene ? UI.formatSceneNumber(scene, sceneIdx) : '?';
            const sceneTitle = isOrphan ? 'Fiches orphelines' : (scene ? (scene.title || '') : 'Scène inconnue');
            const items = bySceneId[sceneId].sort((a, b) => {
                const ia = allShots.findIndex(s => s.id === a.shotId);
                const ib = allShots.findIndex(s => s.id === b.shotId);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });
            const linesHTML = items.map(it => {
                const shot = allShots.find(s => s.id === it.shotId);
                const shotLabel = shot ? (shot.title || `Plan ${shot.id.slice(-4)}`) : `Plan ?`;
                if(it.reports.length === 1) {
                    return `<div class="sr-fiche selected" data-fiche="rapport:${it.key}" data-key="${it.key}" data-idx="0" data-scene="${sceneId}">${Utils.escape(shotLabel)}</div>`;
                }
                return it.reports.map((r, ridx) => {
                    return `<div class="sr-fiche selected" data-fiche="rapport:${it.key}" data-key="${it.key}" data-idx="${ridx}" data-scene="${sceneId}">${Utils.escape(shotLabel)} <span class="sr-take">prise ${ridx + 1}</span></div>`;
                }).join('');
            }).join('');
            return `<div class="sr-col">
                <div class="sr-col-head selected" data-scene="${sceneId}">
                    <div class="sr-col-num">Sc ${sceneNum}</div>
                    <div class="sr-col-title">${Utils.escape(sceneTitle)}</div>
                    <div class="sr-col-count" data-scene-count="${sceneId}"></div>
                </div>
                <div class="sr-col-body">${linesHTML}</div>
            </div>`;
        }).join('');
        // Calcul de la largeur idéale : largeur d'une colonne (160px) × nombre de colonnes,
        // plafonné à 4 colonnes (au-delà, scroll horizontal). Avec marges/paddings/gaps inclus.
        const colCount = sortedSceneIds.length;
        const visibleCols = Math.min(colCount, 4);
        // Formule : visibleCols × 160 (col) + (visibleCols - 1) × 8 (gap) + 16 (padding grille) + 40 (padding modale) + 2 (bordures)
        const idealWidth = visibleCols * 160 + Math.max(0, (visibleCols - 1)) * 8 + 16 + 40 + 2;
        const maxAllowed = Math.floor(window.innerWidth * 0.92); // 92vw max
        const finalWidth = Math.min(idealWidth, maxAllowed);
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:92vw;width:${finalWidth}px;max-height:88vh;padding:20px;display:flex;flex-direction:column;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:8px;flex-shrink:0;">📋 Imprimer les fiches de script</div>
            <div style="text-align:left;font-size:0.82rem;color:var(--text-sec);margin-bottom:10px;flex-shrink:0;">Cliquez sur une scène pour tout (dé)sélectionner, ou sur un plan pour basculer son état.</div>
            <style>
                .sr-grid { display: flex; gap: 8px; overflow-x: auto; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
                .sr-col { flex-shrink: 0; width: 160px; background: var(--panel-bg); border: 1px solid var(--border); border-radius: 6px; display: flex; flex-direction: column; }
                .sr-col-head { padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer; border-radius: 6px 6px 0 0; transition: background 0.15s, border-color 0.15s; user-select: none; position: relative; }
                .sr-col-head:hover { background: rgba(33,150,243,0.08); }
                .sr-col-head.selected { background: rgba(33,150,243,0.12); border-bottom-color: var(--primary); }
                .sr-col-head.selected::before { content: '✓'; color: var(--primary); font-weight: bold; margin-right: 4px; }
                .sr-col-head.partial::before { content: '◐'; color: var(--primary); font-weight: bold; margin-right: 4px; }
                .sr-col-head.partial { background: rgba(33,150,243,0.05); }
                .sr-col-num { font-weight: bold; font-size: 0.85rem; display: inline; }
                .sr-col-title { font-size: 0.72rem; color: var(--text-sec); line-height: 1.3; margin-top: 2px; word-break: break-word; }
                .sr-col-count { font-size: 0.7rem; color: var(--text-sec); margin-top: 3px; font-style: italic; }
                .sr-col-body { padding: 4px; max-height: 360px; overflow-y: auto; }
                .sr-fiche { padding: 5px 8px; cursor: pointer; border-radius: 3px; font-size: 0.78rem; line-height: 1.3; user-select: none; transition: background 0.1s; margin-bottom: 1px; border: 1px solid transparent; }
                .sr-fiche:hover { background: rgba(33,150,243,0.05); }
                .sr-fiche.selected { background: rgba(33,150,243,0.1); border-color: rgba(33,150,243,0.3); color: var(--primary); }
                .sr-fiche.selected::before { content: '✓ '; font-weight: bold; }
                .sr-fiche:not(.selected)::before { content: '◯ '; color: var(--text-sec); }
                .sr-take { color: var(--text-sec); font-size: 0.7rem; }
            </style>
            <div class="sr-grid" style="flex:1;min-height:240px;">${colsHTML}</div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-shrink:0;">
                <button type="button" id="sr-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="sr-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-shrink:0;align-items:center;">
                <span id="sr-counter" style="margin-right:auto;font-size:0.82rem;color:var(--text-sec);"></span>
                <button class="confirm-modal-btn cancel" id="sr-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="sr-ok" style="margin:0;">Imprimer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        // Helpers de mise à jour
        const updateSceneHead = (sceneId) => {
            const head = overlay.querySelector(`.sr-col-head[data-scene="${sceneId}"]`);
            if(!head) return;
            const fiches = overlay.querySelectorAll(`.sr-fiche[data-scene="${sceneId}"]`);
            const selected = Array.from(fiches).filter(f => f.classList.contains('selected'));
            head.classList.remove('selected', 'partial');
            if(selected.length === fiches.length) head.classList.add('selected');
            else if(selected.length > 0) head.classList.add('partial');
            const cnt = overlay.querySelector(`[data-scene-count="${sceneId}"]`);
            if(cnt) cnt.textContent = `${selected.length}/${fiches.length} fiche${fiches.length > 1 ? 's' : ''}`;
        };
        const updateCounter = () => {
            const total = overlay.querySelectorAll('.sr-fiche').length;
            const sel = overlay.querySelectorAll('.sr-fiche.selected').length;
            overlay.querySelector('#sr-counter').textContent = `${sel}/${total} fiche${total > 1 ? 's' : ''} sélectionnée${sel > 1 ? 's' : ''}`;
        };
        // Initial : mettre à jour tous les compteurs
        sortedSceneIds.forEach(sid => updateSceneHead(sid));
        updateCounter();
        // Clic sur bandeau scène : C1 — si toutes les fiches sont sélectionnées, tout désélectionner ; sinon tout sélectionner
        overlay.querySelectorAll('.sr-col-head').forEach(head => {
            head.addEventListener('click', () => {
                const sceneId = head.dataset.scene;
                const fiches = overlay.querySelectorAll(`.sr-fiche[data-scene="${sceneId}"]`);
                const allSel = Array.from(fiches).every(f => f.classList.contains('selected'));
                fiches.forEach(f => { if(allSel) f.classList.remove('selected'); else f.classList.add('selected'); });
                updateSceneHead(sceneId);
                updateCounter();
            });
        });
        // Clic sur ligne fiche : toggle son état
        overlay.querySelectorAll('.sr-fiche').forEach(fiche => {
            fiche.addEventListener('click', () => {
                fiche.classList.toggle('selected');
                updateSceneHead(fiche.dataset.scene);
                updateCounter();
            });
        });
        overlay.querySelector('#sr-all').onclick = () => {
            overlay.querySelectorAll('.sr-fiche').forEach(f => f.classList.add('selected'));
            sortedSceneIds.forEach(sid => updateSceneHead(sid));
            updateCounter();
        };
        overlay.querySelector('#sr-none').onclick = () => {
            overlay.querySelectorAll('.sr-fiche').forEach(f => f.classList.remove('selected'));
            sortedSceneIds.forEach(sid => updateSceneHead(sid));
            updateCounter();
        };
        overlay.querySelector('#sr-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#sr-ok').onclick = () => {
            const selected = Array.from(overlay.querySelectorAll('.sr-fiche.selected')).map(f => ({ key: f.dataset.key, idx: parseInt(f.dataset.idx) }));
            if(selected.length === 0) { Utils.toast('Sélectionnez au moins une fiche', 'warning'); return; }
            overlay.remove();
            setTimeout(() => ScriptReport._launchPrintReports(selected), 100);
        };
    },
    
    _launchPrintReports: async (items) => {
        Utils.toast(`Génération de ${items.length} fiche${items.length > 1 ? 's' : ''}...`, 'info');
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        let first = true;
        items.forEach(it => {
            const reports = (state.data.scriptReports || {})[it.key];
            if(!reports || !reports[it.idx]) return;
            if(!first) doc.addPage();
            first = false;
            ScriptReport.renderPDFPage(doc, reports[it.idx], it.key);
        });
        if(first) { Utils.toast('Aucune fiche valide trouvée', 'warning'); return; }
        // Ouvrir dans nouvelle fenêtre (Blob URL) au lieu de télécharger
        const blob = doc.output('blob');
        const blobUrl = URL.createObjectURL(blob);
        const printWindow = window.open(blobUrl, '_blank');
        if(!printWindow) {
            Utils.toast('Impossible d\'ouvrir la fenêtre. Téléchargement à la place.', 'warning');
            doc.save((typeof PdfTheme !== 'undefined' && PdfTheme.filename) ? PdfTheme.filename('Rapports script') : `${state.data.title || 'Projet'} - Rapports script - moteur.studio.pdf`);
            return;
        }
        // Cleanup du Blob URL après ouverture
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    },
    
    // === EXPORT GLOBAL (modal Export PDF / Dossier de Production) ===
    // opts = { includeCover, returnBlob, sceneIds: null | [sceneId, ...] }
    // sceneIds null/undefined = toutes les scènes. Tri : ordre scènes > ordre plans > n° prise.
    exportPDF: async (opts = {}) => {
        const reports = state.data.scriptReports || {};
        const allScenes = state.data.scenes || [];
        const allShots = state.data.shots || [];
        const keys = Object.keys(reports).filter(k => reports[k] && reports[k].length > 0);
        
        const items = [];
        keys.forEach(key => {
            const scene = allScenes.find(s => key.startsWith(s.id + '_'));
            const sceneId = scene ? scene.id : '__orphan__';
            if(Array.isArray(opts.sceneIds) && !opts.sceneIds.includes(sceneId)) return;
            const shotId = scene ? key.substring(scene.id.length + 1) : key;
            reports[key].forEach((r, idx) => items.push({ key, idx, sceneId, shotId }));
        });
        
        if(items.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucune fiche de script à exporter', 'warning');
            return null;
        }
        
        const sceneOrder = (id) => { const i = allScenes.findIndex(s => s.id === id); return i === -1 ? 999 : i; };
        const shotOrder = (id) => { const i = allShots.findIndex(s => s.id === id); return i === -1 ? 999 : i; };
        items.sort((a, b) => sceneOrder(a.sceneId) - sceneOrder(b.sceneId) || shotOrder(a.shotId) - shotOrder(b.shotId) || a.idx - b.idx);
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        if(opts.includeCover !== false && typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
            PdfTheme.coverPage(doc, { sectionName: 'Rapports script' });
            doc.addPage();
        }
        
        let first = true;
        items.forEach(it => {
            if(!first) doc.addPage();
            first = false;
            ScriptReport.renderPDFPage(doc, reports[it.key][it.idx], it.key);
        });
        
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { skipFirstPage: opts.includeCover !== false, forDossier: !!opts.returnBlob });
        }
        
        if(opts.returnBlob) return doc.output('blob');
        
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Rapports script')
            : `${state.data.title || 'Projet'} - Rapports script.pdf`;
        doc.save(filename);
        Utils.toast('Rapports de script exportés !', 'success');
    },
    
    // ScriptReport.generatePDF retirée v569, jamais appelée : doublon de
    // ScriptReport.exportPDF (v558), le vrai chemin d'export utilisé partout.
    
    renderPDFPage: (doc, report, key) => {
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = margin;
        
        // Récupérer les dialogues depuis autoFill si report.dialogues est vide
        let dialoguesText = report.dialogues || '';
        if(!dialoguesText && key) {
            const [sceneId, shotId] = key.split('_');
            const autoFill = ScriptReport.getAutoFillData(sceneId, shotId);
            dialoguesText = autoFill.dialogues || '';
        }
        
        doc.setDrawColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        doc.setLineWidth(0.4);
        
        // === TITRE / EN-TÊTE ===
        doc.setFillColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        doc.rect(margin, y, pageWidth - 2*margin, 12, 'F');
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('FICHE DE SCRIPT', pageWidth / 2, y + 8, { align: 'center' });
        doc.setTextColor(...PdfTheme.COLORS.BLACK);
        y += 15;
        
        // === LIGNE 1 : FILM / DATE / PLAN ===
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const row1Height = 12;
        doc.rect(margin, y, pageWidth - 2*margin, row1Height);
        doc.line(margin + 90, y, margin + 90, y + row1Height);
        doc.line(pageWidth - margin - 60, y, pageWidth - margin - 60, y + row1Height);
        
        doc.text('FILM :', margin + 3, y + 5);
        doc.text('DATE :', margin + 93, y + 5);
        doc.text('PLAN :', pageWidth - margin - 57, y + 5);
        
        doc.setFont('helvetica', 'normal');
        doc.text(report.film || '', margin + 3, y + 10);
        doc.text(report.date || '', margin + 93, y + 10);
        doc.text(report.plan || '', pageWidth - margin - 57, y + 10);
        y += row1Height;
        
        // === LIGNE 2 : DÉCOR / EFFET ===
        doc.rect(margin, y, pageWidth - 2*margin, row1Height);
        doc.line(pageWidth - margin - 70, y, pageWidth - margin - 70, y + row1Height);
        
        doc.setFont('helvetica', 'bold');
        doc.text('DÉCOR :', margin + 3, y + 5);
        doc.text('EFFET :', pageWidth - margin - 67, y + 5);
        
        doc.setFont('helvetica', 'normal');
        doc.text(report.decor || '', margin + 3, y + 10);
        const effetStr = [(report.effet || '').toUpperCase(), (report.lieu || '').toUpperCase()].filter(Boolean).join(' - ');
        doc.text(effetStr, pageWidth - margin - 67, y + 10);
        y += row1Height;
        
        // === LIGNE 3 : SON / SUPPORTS / CAM / OBJ ===
        doc.rect(margin, y, pageWidth - 2*margin, row1Height);
        doc.line(margin + 30, y, margin + 30, y + row1Height);
        doc.line(margin + 90, y, margin + 90, y + row1Height);
        doc.line(pageWidth - margin - 45, y, pageWidth - margin - 45, y + row1Height);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('SON', margin + 3, y + 4);
        doc.text('SUPPORTS', margin + 33, y + 4);
        doc.text('CAMERA', margin + 93, y + 4);
        doc.text('OBJECTIF', pageWidth - margin - 42, y + 4);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(report.son === 'muet' ? 'MUET' : 'SONORE', margin + 3, y + 10);
        doc.text(report.supports || '-', margin + 33, y + 10);
        doc.text(report.camera || '-', margin + 93, y + 10);
        doc.text(report.objectif || '-', pageWidth - margin - 42, y + 10);
        y += row1Height;
        
        // === LIGNE 4 : NOTE (si présente) ===
        if(report.note) {
            doc.setFontSize(9);
            const noteLines = doc.splitTextToSize(report.note, pageWidth - 2*margin - 25);
            const noteHeight = Math.max(10, noteLines.length * 4 + 6);
            doc.rect(margin, y, pageWidth - 2*margin, noteHeight);
            doc.setFont('helvetica', 'bold');
            doc.text('NOTE :', margin + 3, y + 5);
            doc.setFont('helvetica', 'normal');
            noteLines.forEach((line, i) => doc.text(line, margin + 22, y + 5 + i*4));
            y += noteHeight;
        }
        
        y += 5;
        
        // === TABLEAU DES PRISES ===
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PRISES', margin, y + 4);
        y += 7;
        
        doc.setFontSize(8);
        const tableWidth = pageWidth - 2*margin;
        const col1 = 18; // Prise
        const col2 = 25; // N° Son
        const col3 = 28; // N° Image
        const col4 = tableWidth - col1 - col2 - col3; // Qualité & Notes
        
        // En-tête tableau
        doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
        doc.rect(margin, y, tableWidth, 8, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.text('Prise', margin + 2, y + 5);
        doc.text('N° Son', margin + col1 + 2, y + 5);
        doc.text('N° Image', margin + col1 + col2 + 2, y + 5);
        doc.text('Qualité & Notes', margin + col1 + col2 + col3 + 2, y + 5);
        y += 8;
        
        // Lignes de prises
        doc.setFont('helvetica', 'normal');
        (report.takes || []).forEach((take, idx) => {
            const hasStar = take.star === 'gold' || take.star === 'silver';
            const qualArr = [];
            if(take.qualitySon) qualArr.push('Son:' + take.qualitySon + '/5');
            if(take.qualityImage) qualArr.push('Img:' + take.qualityImage + '/5');
            if(take.qualityActing) qualArr.push('Act:' + take.qualityActing + '/5');
            const qualStr = qualArr.length > 0 ? qualArr.join(' | ') : '';
            const notesStr = take.notes || '';
            const fullDesc = qualStr + (qualStr && notesStr ? ' - ' : '') + notesStr;
            
            const descLines = doc.splitTextToSize(fullDesc, col4 - 6);
            const rowHeight = Math.max(8, descLines.length * 4 + 3);
            
            if(y + rowHeight > pageHeight - 70) {
                doc.addPage();
                y = margin;
            }
            
            doc.rect(margin, y, tableWidth, rowHeight);
            doc.line(margin + col1, y, margin + col1, y + rowHeight);
            doc.line(margin + col1 + col2, y, margin + col1 + col2, y + rowHeight);
            doc.line(margin + col1 + col2 + col3, y, margin + col1 + col2 + col3, y + rowHeight);
            
            doc.setFont('helvetica', 'bold');
            doc.text(`${idx + 1}`, margin + 2, y + 5);
            
            // Dessiner une étoile si nécessaire
            if(hasStar) {
                const starX = margin + 12;
                const starY = y + 3;
                const starSize = 2.5;
                
                // Couleur de l'étoile
                if(take.star === 'gold') {
                    doc.setFillColor(...PdfTheme.COLORS.WARNING); // Or
                } else {
                    doc.setFillColor(...PdfTheme.COLORS.BORDER_DARK); // Argent
                }
                
                // Dessiner une étoile à 5 branches
                const points = [];
                for(let i = 0; i < 10; i++) {
                    const radius = i % 2 === 0 ? starSize : starSize * 0.4;
                    const angle = (i * 36 - 90) * Math.PI / 180;
                    points.push({
                        x: starX + radius * Math.cos(angle),
                        y: starY + radius * Math.sin(angle)
                    });
                }
                
                doc.setDrawColor(...PdfTheme.COLORS.BORDER);
                doc.setLineWidth(0.1);
                doc.moveTo(points[0].x, points[0].y);
                for(let i = 1; i < points.length; i++) {
                    doc.lineTo(points[i].x, points[i].y);
                }
                doc.lineTo(points[0].x, points[0].y);
                doc.fillStroke();
                
                // Reset couleurs
                doc.setDrawColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                doc.setLineWidth(0.4);
            }
            doc.setFont('helvetica', 'normal');
            doc.text(take.numSon || '', margin + col1 + 2, y + 5);
            doc.text(take.numImage || '', margin + col1 + col2 + 2, y + 5);
            descLines.forEach((line, i) => doc.text(line, margin + col1 + col2 + col3 + 2, y + 5 + i*4));
            
            y += rowHeight;
        });
        
        if((report.takes || []).length === 0) {
            doc.rect(margin, y, tableWidth, 10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            doc.text('Aucune prise enregistrée', margin + tableWidth/2, y + 6, { align: 'center' });
            doc.setTextColor(...PdfTheme.COLORS.BLACK);
            y += 10;
        }
        
        y += 8;
        
        // === DESCRIPTION ET DIALOGUES ===
        if(y > pageHeight - 80) {
            doc.addPage();
            y = margin;
        }
        
        const halfWidth = (pageWidth - 2*margin - 5) / 2;
        const boxHeight = Math.min(70, pageHeight - y - 15);
        
        // Description
        doc.rect(margin, y, halfWidth, boxHeight);
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(margin, y, halfWidth, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Description du Plan', margin + 3, y + 6);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const descLines2 = doc.splitTextToSize(report.description || '', halfWidth - 6);
        descLines2.slice(0, 15).forEach((line, i) => doc.text(line, margin + 3, y + 14 + i*4));
        
        // Dialogues
        doc.rect(margin + halfWidth + 5, y, halfWidth, boxHeight);
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(margin + halfWidth + 5, y, halfWidth, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Dialogues', margin + halfWidth + 8, y + 6);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const dialLines2 = doc.splitTextToSize(dialoguesText, halfWidth - 6);
        dialLines2.slice(0, 15).forEach((line, i) => doc.text(line, margin + halfWidth + 8, y + 14 + i*4));
    }
};

// ========== MODULE MÉTÉO (Open-Meteo API - 100% gratuit) ==========
const Weather = {
    cache: {},
    
    weatherCodes: {
        0: { icon: '☀️', desc: 'Ciel dégagé' },
        1: { icon: '🌤️', desc: 'Principalement dégagé' },
        2: { icon: '⛅', desc: 'Partiellement nuageux' },
        3: { icon: '☁️', desc: 'Couvert' },
        45: { icon: '🌫️', desc: 'Brouillard' },
        48: { icon: '🌫️', desc: 'Brouillard givrant' },
        51: { icon: '🌧️', desc: 'Bruine légère' },
        53: { icon: '🌧️', desc: 'Bruine modérée' },
        55: { icon: '🌧️', desc: 'Bruine dense' },
        61: { icon: '🌧️', desc: 'Pluie légère' },
        63: { icon: '🌧️', desc: 'Pluie modérée' },
        65: { icon: '🌧️', desc: 'Pluie forte' },
        71: { icon: '🌨️', desc: 'Neige légère' },
        73: { icon: '🌨️', desc: 'Neige modérée' },
        75: { icon: '🌨️', desc: 'Neige forte' },
        80: { icon: '🌦️', desc: 'Averses légères' },
        81: { icon: '🌦️', desc: 'Averses modérées' },
        82: { icon: '🌦️', desc: 'Averses violentes' },
        85: { icon: '🌨️', desc: 'Averses de neige' },
        95: { icon: '⛈️', desc: 'Orage' },
        96: { icon: '⛈️', desc: 'Orage avec grêle' },
        99: { icon: '⛈️', desc: 'Orage violent' }
    },
    
    getWindDirection: (degrees) => {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
        return directions[Math.round(degrees / 45) % 8];
    },
    
    fetch: async (lat, lng, date) => {
        if(!lat || !lng || !date) return null;
        
        const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${date}`;
        if(Weather.cache[cacheKey]) return Weather.cache[cacheKey];
        
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,windspeed_10m_max,winddirection_10m_dominant,sunrise,sunset&timezone=Europe/Paris&start_date=${date}&end_date=${date}`;
            
            const response = await fetch(url);
            if(!response.ok) throw new Error('Erreur API météo');
            
            const data = await response.json();
            if(!data.daily || !data.daily.time?.length) return null;
            
            const weatherCode = data.daily.weathercode[0];
            const weatherInfo = Weather.weatherCodes[weatherCode] || { icon: '❓', desc: 'Inconnu' };
            
            const result = {
                icon: weatherInfo.icon,
                description: weatherInfo.desc,
                tempMax: Math.round(data.daily.temperature_2m_max[0]),
                tempMin: Math.round(data.daily.temperature_2m_min[0]),
                feelsLike: Math.round(data.daily.apparent_temperature_max[0]),
                precipitation: data.daily.precipitation_sum[0],
                precipitationProb: data.daily.precipitation_probability_max[0],
                windSpeed: Math.round(data.daily.windspeed_10m_max[0]),
                windDirection: Weather.getWindDirection(data.daily.winddirection_10m_dominant[0]),
                sunrise: data.daily.sunrise[0]?.split('T')[1] || '--:--',
                sunset: data.daily.sunset[0]?.split('T')[1] || '--:--'
            };
            
            Weather.cache[cacheKey] = result;
            return result;
        } catch(e) {
            console.error('Erreur météo:', e);
            return null;
        }
    },
    
    // Weather.renderCard retirée v569, jamais appelée : la feuille de service
    // affiche la météo via son propre rendu FDSLive, pas via ce module.
};

  window.ColorWheel = ColorWheel;
  // ==================== MODULE BEAT BOARD ====================
  // ========== MODE FOCUS (Plein écran onglet) ==========