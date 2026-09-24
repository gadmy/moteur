

// ========== NOTIFICATIONS ==========

const Notifications = {
    // ===================== ÉTAT & INIT =====================
    unreadCount: 0,
    items: [],
    listenerAttached: false,
    
    // Initialiser l'écoute des notifications
    init: async () => {
        if(!state.currentUser || Notifications.listenerAttached) return;
        
        const email = state.currentUser.email.toLowerCase();
        
        // Charger les notifications initiales
        const loadNotifications = async () => {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_email', email)
                .order('created_at', { ascending: false })
                .limit(50);
            
            if(!error && data) {
                Notifications.items = data.map(n => ({
                    id: n.id,
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    link: n.link,
                    read: n.read,
                    // v602 : pose par la base (trigger), impossible a falsifier.
                    sender: n.sender_email || '',
                    timestamp: new Date(n.created_at).getTime()
                }));
                
                Notifications.unreadCount = Notifications.items.filter(n => !n.read).length;
                Notifications.updateBadge();
                Notifications.renderList();
                Notifications._announce();
            }
        };
        
        await loadNotifications();
        
        // Écouter les nouvelles notifications en temps réel
        if(Notifications._channel) { try { await supabase.removeChannel(Notifications._channel); } catch(e) {} }
        const notifChannel = supabase.channel('notifications_' + email);
        notifChannel.on('postgres_changes', 
                { event: '*', schema: 'public', table: 'notifications', filter: 'user_email=eq.' + email },
                () => loadNotifications()
            )
            .subscribe();
        Notifications._channel = notifChannel;
        
        Notifications.listenerAttached = true;
    },
    
    // ——— Suivi des notifications connues (toasts live chat/messagerie retirés) ———
    _known: null,
    _announce: () => {
        if(!Notifications._known) Notifications._known = new Set();
        Notifications.items.forEach(n => Notifications._known.add(n.id));
    },

    // Mettre à jour le badge
    updateBadge: () => {
        const badge = document.getElementById('notif-badge');
        if(!badge) return;
        
        if(Notifications.unreadCount > 0) {
            badge.textContent = Notifications.unreadCount > 99 ? '99+' : Notifications.unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },
    
    // Afficher/masquer le panneau
    togglePanel: () => {
        const panel = document.getElementById('notif-panel');
        if(panel) {
            panel.classList.toggle('visible');
        }
    },
    
    // Fermer le panneau
    closePanel: () => {
        const panel = document.getElementById('notif-panel');
        if(panel) {
            panel.classList.remove('visible');
        }
    },
    
    // Rendre la liste
    // ===================== LISTE & RENDU =====================
    renderList: () => {
        const list = document.getElementById('notif-list');
        if(!list) return;
        const email = ((state.currentUser && state.currentUser.email) || '').toLowerCase();
        
        if(Notifications.items.length === 0) {
            list.innerHTML = '<div class="notif-empty">🔕 Aucune notification</div>';
            return;
        }
        
        list.innerHTML = Notifications.items.map(n => {
            const date = new Date(n.timestamp);
            const timeAgo = Notifications.getTimeAgo(date);
            const icon = Notifications.getIcon(n.type);
            const unreadClass = n.read ? '' : 'unread';
            
            return `
                <div class="notif-item ${unreadClass}" onclick="app.Notifications.handleClick(${Utils.jsArg(n.id)}, ${Utils.jsArg(n.type)}, ${Utils.jsArg(n.projectId || '')})">
                    <span class="notif-icon">${icon}</span>
                    <div class="notif-content">
                        <div class="notif-text">${Utils.escape(Notifications._displayText(n))}</div>
                        <div class="notif-time">${n.sender && n.sender !== email ? 'De ' + Utils.escape(n.sender) + ' · ' : ''}${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Texte lisible d'une notification. Les commentaires invites (script_comments)
    // sont stockes en JSON par l'Edge Function ; on le traduit en une phrase.
    _displayText: (n) => {
        if(n.type === 'script_comments') {
            try {
                const d = JSON.parse(n.message);
                const who = (d.from || d.email || 'Un relecteur');
                const c = d.count || 0;
                return who + ' a déposé ' + c + ' commentaire' + (c > 1 ? 's' : '') + ' sur un partage.';
            } catch(e) { return 'Nouveaux commentaires sur un partage.'; }
        }
        return n.message || '';
    },
    
    // Obtenir l'icône selon le type
    getIcon: (type) => {
        const icons = {
            'invite': '📨',
            'message': '💬',
            'script_comments': '💬',
            'modification': '✏️',
            'share': '👥',
            // v601 : quelqu'un s'est declare indisponible un jour ou il devait
            // tourner. Ce n'est pas un message ordinaire : le plan de travail
            // est a refaire.
            'dispo_annulee': '⚠️'
        };
        return icons[type] || '🔔';
    },
    
    // Calculer "il y a X temps"
    getTimeAgo: (date) => {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if(seconds < 60) return "À l'instant";
        if(seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
        if(seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
        if(seconds < 604800) return `Il y a ${Math.floor(seconds / 86400)}j`;
        return date.toLocaleDateString('fr-FR');
    },
    
    // Gérer le clic sur une notification
    handleClick: async (notifId, type, projectId) => {
        // Marquer comme lu
        await Notifications.markAsRead(notifId);
        
        // Action selon le type
        if(type === 'invite' && projectId) {
            Notifications.closePanel();
            Store.loadProject(projectId);
        }
        if(type === 'script_comments') {
            const it = Notifications.items.find(n => String(n.id) === String(notifId));
            const pid = (it && it.link) ? it.link : projectId;
            if(pid) { Notifications.closePanel(); Store.loadProject(pid); }
        }
    },
    
    // Marquer une notification comme lue
    markAsRead: async (notifId) => {
        if(!state.currentUser) return;
        
        try {
            const {error: mrErr} = await supabase.from('notifications').update({ read: true }).eq('id', notifId);
            if(mrErr) throw mrErr;
        } catch(e) {
            console.error('Erreur markAsRead:', e);
        }
    },

    // Effacer toutes les notifications
    clearAll: async () => {
        if(!state.currentUser) return;
        if(Notifications.items.length === 0) { Utils.toast('Aucune notification à effacer', 'info'); return; }
        const ok = await ConfirmModal.confirm('Effacer toutes vos notifications ? Cette action est définitive.', 'Effacer les notifications', true);
        if(!ok) return;
        const email = state.currentUser.email.toLowerCase();
        try {
            const { error } = await supabase.from('notifications').delete().eq('user_email', email);
            if(error) throw error;
            Notifications.items = [];
            Notifications.unreadCount = 0;
            Notifications.updateBadge();
            Notifications.renderList();
            Utils.toast('Notifications effacées', 'success');
        } catch(e) {
            console.error('Erreur clearAll:', e);
            Utils.toast("Impossible d'effacer les notifications.", 'error');
        }
    },

    // Envoyer une notification à un utilisateur
    // ===================== ENVOI & RÔLES =====================
    send: async (toEmail, type, message, projectId = null) => {
        const notif = {
            user_email: toEmail.toLowerCase(),
            type: type,
            // Le titre dit de quoi il s'agit AVANT d'ouvrir : « Notification »
            // pour tout ne prevenait de rien.
            title: type === 'invite' ? '📨 Invitation'
                 : (type === 'dispo_annulee' ? '⚠️ Disponibilité annulée' : '🔔 Notification'),
            message: message,
            link: projectId,
            read: false
        };
        
        try {
            const {error: notifErr2} = await supabase.from('notifications').insert(notif);
            if(notifErr2) throw notifErr2;
        } catch(e) {
            console.error('Erreur envoi notification:', e);
        }
    },
    
    // v593 : toggle() retiré — doublon jamais appelé de togglePanel() ci-dessus,
    // qui est la seule fonction réellement câblée sur le bouton du header.
    
    // 1er septembre — updateRoleBadge RETIREE (67 lignes). Elle calculait un
    // libelle de role (proprietaire, responsable de budget, responsable de
    // departement, poste dans l'equipe) pour un element #user-role-badge qui
    // n'existe NULLE PART : ni dans le HTML, ni dans une chaine de gabarit, et
    // sans la moindre regle CSS .user-role-badge. Elle sortait donc sur son
    // premier if a chaque appel, depuis on ne sait quelle refonte d'en-tete.
    // Si le badge revient un jour, c'est une fonction a reecrire, pas a
    // deterrer : la table des roles a change deux fois depuis (etape 7b).
};
