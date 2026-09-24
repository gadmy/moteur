
// --- MODULE ADMIN ---
const Admin = {
    // ===================== ÉTAT & INITIALISATION =====================
    allUsers: [],
    allReports: [],
    allErrors: [],
    allFeedback: [],

    // ===================== RETOURS UTILISATEURS (v600) =====================
    // Ce que les gens ECRIVENT depuis « Vos remarques ». Le mail quotidien
    // reste la notification ; cette table est le PLAN DE TRAVAIL : on y trie
    // par urgence, on marque ce qui est traite, et on croise avec les erreurs
    // de l'onglet voisin. L'adresse de la personne n'y figure pas (choix du
    // 19 septembre) — elle reste dans le mail, ce qui suffit pour repondre.
    URGENCES: { 1: '🔴 Urgent', 2: '🟠 Normal', 3: '🔵 Plus tard' },

    loadFeedback: async () => {
        if(!Admin.isAdmin()) return;
        const bac = document.getElementById('admin-feedback-list');
        if(bac) bac.innerHTML = '<p class="text-sec-sm2">Chargement…</p>';
        try {
            const { data, error } = await supabase
                .from('client_feedback')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            if(error) throw error;
            Admin.allFeedback = data || [];
            Admin.renderFeedback();
        } catch(e) {
            console.error('[Admin] Retours:', e);
            if(bac) bac.innerHTML = '<p class="text-sec-sm2">Impossible de charger les retours : ' + Utils.escape(e.message || 'erreur inconnue') + '</p>';
        }
    },

    _feedbackFiltres: () => {
        const type = document.getElementById('admin-feedback-type')?.value || '';
        const montrerTraites = document.getElementById('admin-feedback-show-done')?.checked;
        return Admin.allFeedback
            .filter(f => (!type || f.type === type) && (montrerTraites || !f.traite))
            // Les urgents d'abord, puis les non classes, puis par date.
            .sort((a, b) => (a.urgence || 9) - (b.urgence || 9) || (a.created_at < b.created_at ? 1 : -1));
    },

    renderFeedback: () => {
        const bac = document.getElementById('admin-feedback-list');
        if(!bac) return;
        const liste = Admin._feedbackFiltres();
        const enAttente = Admin.allFeedback.filter(f => !f.traite).length;
        const badge = document.getElementById('admin-feedback-badge');
        if(badge) { badge.textContent = enAttente; badge.style.display = enAttente ? 'inline-block' : 'none'; }
        if(liste.length === 0) { bac.innerHTML = '<p class="text-sec-sm2">✅ Aucun retour à traiter.</p>'; return; }
        const TYPES = { bug: '🐞 Un problème', idee: '💡 Une idée', autre: '💬 Autre' };
        bac.innerHTML = liste.map(f => {
            const date = new Date(f.created_at).toLocaleString('fr-FR');
            const urg = Object.keys(Admin.URGENCES).map(n =>
                '<option value="' + n + '"' + (String(f.urgence) === n ? ' selected' : '') + '>' + Admin.URGENCES[n] + '</option>').join('');
            return '<div style="border:1px solid var(--border); border-left:4px solid ' + (f.urgence === 1 ? 'var(--danger)' : f.urgence === 2 ? '#f59e0b' : 'var(--border)') + '; border-radius:8px; padding:12px 14px; margin-bottom:10px; background:var(--panel-bg);' + (f.traite ? ' opacity:.55;' : '') + '">'
                + '<div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:6px;">'
                +   '<strong>' + (TYPES[f.type] || Utils.escape(f.type || '')) + '</strong>'
                +   '<span class="text-sec-sm2">' + Utils.escape(date) + (f.version ? ' · ' + Utils.escape(f.version) : '') + '</span>'
                + '</div>'
                + '<div style="white-space:pre-wrap; margin-bottom:8px;">' + Utils.escape(f.texte || '') + '</div>'
                + (f.contexte ? '<div class="text-sec-sm2" style="margin-bottom:8px;">' + Utils.escape(f.contexte) + '</div>' : '')
                + '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">'
                +   '<select class="form-input-sm" onchange="app.Admin.setFeedbackUrgence(' + f.id + ', this.value)"><option value="">— Urgence —</option>' + urg + '</select>'
                +   '<button class="btn btn--sm" onclick="app.Admin.markFeedbackDone(' + f.id + ', ' + (f.traite ? 'false' : 'true') + ')">' + (f.traite ? '↩️ À retraiter' : '✔️ Traité') + '</button>'
                + '</div>'
            + '</div>';
        }).join('');
    },

    setFeedbackUrgence: async (id, valeur) => {
        const urgence = valeur ? parseInt(valeur, 10) : null;
        try {
            const { error } = await supabase.from('client_feedback').update({ urgence: urgence }).eq('id', id);
            if(error) throw error;
            const f = Admin.allFeedback.find(x => x.id === id);
            if(f) f.urgence = urgence;
            Admin.renderFeedback();
        } catch(e) { console.error('[Admin] setFeedbackUrgence:', e); Utils.toast('Impossible d\'enregistrer l\'urgence.', 'error'); }
    },

    markFeedbackDone: async (id, traite) => {
        try {
            const { error } = await supabase.from('client_feedback').update({ traite: traite }).eq('id', id);
            if(error) throw error;
            const f = Admin.allFeedback.find(x => x.id === id);
            if(f) f.traite = traite;
            Admin.renderFeedback();
        } catch(e) { console.error('[Admin] markFeedbackDone:', e); Utils.toast('Impossible de marquer ce retour.', 'error'); }
    },

    // SEANCE DE TRI : un seul bloc de texte réunissant les retours ET les
    // erreurs en attente, prêt à coller dans une conversation pour les classer
    // et les réparer. C'est le point de tout ce dispositif.
    copyTriage: async () => {
        if(Admin.allFeedback.length === 0) await Admin.loadFeedback();
        if(Admin.allErrors.length === 0) await Admin.loadErrors();
        const retours = Admin.allFeedback.filter(f => !f.traite);
        const groupes = Admin._groupesErreurs().filter(g => !g.traite);
        const lignes = [];
        lignes.push('=== RETOURS UTILISATEURS EN ATTENTE (' + retours.length + ') ===');
        retours.forEach(f => {
            lignes.push('');
            lignes.push('[' + (f.type || 'autre') + '] ' + new Date(f.created_at).toLocaleString('fr-FR')
                + (f.version ? ' — ' + f.version : '') + (f.urgence ? ' — urgence ' + f.urgence : ''));
            lignes.push(f.texte || '');
            if(f.contexte) lignes.push('(' + f.contexte + ')');
        });
        lignes.push('');
        lignes.push('=== ERREURS EN ATTENTE (' + groupes.length + ' distinctes) ===');
        groupes.forEach(g => {
            const e = g.modele;
            lignes.push('');
            lignes.push(g.nb + '× [' + e.type + '] ' + e.message);
            lignes.push('   ' + (e.source || '?') + ':' + (e.ligne || 0) + ' — page ' + (e.page || '?')
                + ' — ' + (e.version || '?') + ' — ' + (e.navigateur || '?'));
        });
        const texte = lignes.join('\n');
        try { await navigator.clipboard.writeText(texte); Utils.toast('Tout est copié — colle-le dans la conversation.', 'success', 5000); }
        catch(err) { console.log(texte); Utils.toast('Copie impossible — le texte est dans la console.', 'warning'); }
    },

    // ===================== ERREURS REMONTEES (v600) =====================
    // Les plantages survenus chez les utilisateurs, deposes par ErrorLogger
    // dans la table client_errors (voir sql/remontee_erreurs.sql). Aucun
    // identifiant de compte ni de projet n'y figure : c'est voulu.
    // REGROUPEMENT PAR EMPREINTE : une meme erreur qui arrive cent fois est
    // UNE ligne « 100 fois », pas cent lignes. Sans ca la liste serait
    // illisible des le premier bug un peu bavard.
    loadErrors: async () => {
        if(!Admin.isAdmin()) return;
        const bac = document.getElementById('admin-errors-list');
        if(bac) bac.innerHTML = '<p class="text-sec-sm2">Chargement…</p>';
        try {
            const { data, error } = await supabase
                .from('client_errors')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            if(error) throw error;
            Admin.allErrors = data || [];
            Admin.renderErrors();
        } catch(e) {
            console.error('[Admin] Erreurs remontées:', e);
            if(bac) bac.innerHTML = '<p class="text-sec-sm2">Impossible de charger les erreurs : ' + Utils.escape(e.message || 'erreur inconnue') + '</p>';
        }
    },

    // Regroupe par empreinte : la plus recente porte le detail, les autres
    // ne servent qu'a compter.
    _groupesErreurs: () => {
        const groupes = {};
        Admin.allErrors.forEach(e => {
            const g = groupes[e.empreinte];
            if(!g) { groupes[e.empreinte] = { modele: e, nb: 1, premier: e.created_at, traite: !!e.traite, ids: [e.id] }; return; }
            g.nb++;
            g.ids.push(e.id);
            if(e.created_at < g.premier) g.premier = e.created_at;
            if(!e.traite) g.traite = false;
        });
        return Object.values(groupes).sort((a, b) => (a.traite === b.traite)
            ? (b.modele.created_at < a.modele.created_at ? -1 : 1)
            : (a.traite ? 1 : -1));
    },

    renderErrors: () => {
        const bac = document.getElementById('admin-errors-list');
        if(!bac) return;
        const montrerTraitees = document.getElementById('admin-errors-show-done')?.checked;
        const groupes = Admin._groupesErreurs().filter(g => montrerTraitees || !g.traite);
        const enAttente = Admin._groupesErreurs().filter(g => !g.traite).length;
        const badge = document.getElementById('admin-errors-badge');
        if(badge) { badge.textContent = enAttente; badge.style.display = enAttente ? 'inline-block' : 'none'; }
        if(groupes.length === 0) {
            bac.innerHTML = '<p class="text-sec-sm2">✅ Aucune erreur' + (montrerTraitees ? '' : ' à traiter') + '.</p>';
            return;
        }
        bac.innerHTML = groupes.map(g => {
            const e = g.modele;
            const date = new Date(e.created_at).toLocaleString('fr-FR');
            const lieu = [e.source ? String(e.source).split('/').pop() : '', e.ligne ? ('ligne ' + e.ligne) : ''].filter(Boolean).join(' — ');
            return '<details style="border:1px solid var(--border); border-radius:8px; margin-bottom:10px; background:var(--panel-bg);' + (g.traite ? ' opacity:.55;' : '') + '">'
                + '<summary style="padding:10px 14px; cursor:pointer; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap;">'
                +   '<span style="background:' + (g.traite ? 'var(--border)' : 'var(--danger)') + '; color:' + (g.traite ? 'var(--text-sec)' : '#fff') + '; border-radius:10px; padding:1px 8px; font-size:0.75rem; font-weight:bold;">' + g.nb + '×</span>'
                +   '<strong style="flex:1; min-width:200px;">' + Utils.escape(e.message || '') + '</strong>'
                +   '<span class="text-sec-sm2">' + Utils.escape(date) + '</span>'
                + '</summary>'
                + '<div style="padding:0 14px 14px;">'
                +   '<div class="text-sec-sm2" style="margin-bottom:8px;">'
                +     Utils.escape(e.type || '') + (lieu ? ' · ' + Utils.escape(lieu) : '')
                +     (e.page ? ' · page ' + Utils.escape(e.page) : '')
                +     (e.version ? ' · ' + Utils.escape(e.version) : '')
                +     (e.navigateur ? ' · ' + Utils.escape(e.navigateur) : '')
                +   '</div>'
                +   (e.pile ? '<pre style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:10px; overflow:auto; font-size:0.75rem; max-height:260px;">' + Utils.escape(e.pile) + '</pre>' : '')
                +   '<div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">'
                +     '<button class="btn btn--sm" onclick="app.Admin.copyError(' + Utils.jsArg(e.empreinte) + ')">📋 Copier</button>'
                +     '<button class="btn btn--sm" onclick="app.Admin.markErrorDone(' + Utils.jsArg(e.empreinte) + ', ' + (g.traite ? 'false' : 'true') + ')">' + (g.traite ? '↩️ À retraiter' : '✔️ Traitée') + '</button>'
                +   '</div>'
                + '</div>'
            + '</details>';
        }).join('');
    },

    // Copie le detail au presse-papier, pret a coller dans une conversation.
    copyError: async (empreinte) => {
        const g = Admin._groupesErreurs().find(x => x.modele.empreinte === empreinte);
        if(!g) return;
        const e = g.modele;
        const texte = [
            '[' + e.type + '] ' + e.message,
            'Vu ' + g.nb + ' fois — dernière : ' + new Date(e.created_at).toLocaleString('fr-FR'),
            'Endroit : ' + (e.source || '?') + ':' + (e.ligne || 0) + ':' + (e.colonne || 0),
            'Page : ' + (e.page || '?') + ' — ' + (e.version || '?') + ' — ' + (e.navigateur || '?'),
            e.pile ? '\nPile :\n' + e.pile : ''
        ].join('\n');
        try { await navigator.clipboard.writeText(texte); Utils.toast('Erreur copiée.', 'success'); }
        catch(err) { console.log(texte); Utils.toast('Copie impossible — le détail est dans la console.', 'warning'); }
    },

    // Marque toutes les lignes d'une meme erreur comme traitees (ou l'inverse).
    markErrorDone: async (empreinte, traite) => {
        try {
            const { error } = await supabase.from('client_errors').update({ traite: traite }).eq('empreinte', empreinte);
            if(error) throw error;
            Admin.allErrors.forEach(e => { if(e.empreinte === empreinte) e.traite = traite; });
            Admin.renderErrors();
        } catch(e) {
            console.error('[Admin] markErrorDone:', e);
            Utils.toast('Impossible de marquer cette erreur.', 'error');
        }
    },
    
    isAdmin: () => {
        return state.currentUser && CONFIG.adminEmails.includes(state.currentUser.email.toLowerCase());
    },
    
    // J2: filtre pour exclure les profils démo des stats
    excludeDemoProfiles: false,
    toggleExcludeDemo: () => {
        Admin.excludeDemoProfiles = document.getElementById('admin-exclude-demo')?.checked || false;
        Admin.loadStats(); // Recharger les stats avec le nouveau filtre
    },
    
    init: () => {
        // Afficher le bouton admin si l'utilisateur est admin
        const btn = document.getElementById('admin-btn');
        if(btn) {
            btn.style.display = Admin.isAdmin() ? 'inline-block' : 'none';
        }
        // Rafraîchir la pastille de signalements en attente
        if(Admin.isAdmin()) {
            Admin.refreshPendingBadge();
            // Rafraîchir périodiquement toutes les 2 minutes
            if(Admin._pendingInterval) clearInterval(Admin._pendingInterval);
            Admin._pendingInterval = setInterval(() => Admin.refreshPendingBadge(), 120000);
        }
    },
    
    // Met a jour la pastille rouge du bouton « 🛡️ Admin » ET celles des onglets.
    // v600 : elle ne comptait que les signalements. Elle compte desormais TOUT
    // ce qui attend : signalements + erreurs remontees + retours utilisateurs.
    // POURQUOI ICI : une pastille ne sert a rien si elle n'apparait qu'une fois
    // l'onglet ouvert — c'est justement ce qu'elle est censee t'epargner. Elle
    // est donc posee au chargement du tableau de bord, puis toutes les deux
    // minutes, sans attendre que tu cliques quoi que ce soit.
    refreshPendingBadge: async () => {
        if(!Admin.isAdmin()) return;
        const poser = (id, n) => {
            const el = document.getElementById(id);
            if(!el) return;
            el.textContent = n > 99 ? '99+' : String(n);
            el.style.display = n > 0 ? 'inline-block' : 'none';
        };
        let signalements = 0, erreurs = 0, retours = 0;
        try {
            const { count, error } = await supabase
                .from('reports')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'pending');
            if(!error && count) signalements = count;
        } catch(e) { console.warn('[Admin] pastille signalements:', e); }
        try {
            // On compte les erreurs DISTINCTES, comme l'onglet les affiche :
            // une pastille a « 200 » pour un seul bug qui boucle ne dirait rien
            // d'utile. Une seule colonne suffit pour ca.
            const { data, error } = await supabase
                .from('client_errors')
                .select('empreinte')
                .eq('traite', false)
                .limit(1000);
            if(!error && data) erreurs = new Set(data.map(x => x.empreinte)).size;
        } catch(e) { console.warn('[Admin] pastille erreurs:', e); }
        try {
            const { count, error } = await supabase
                .from('client_feedback')
                .select('id', { count: 'exact', head: true })
                .eq('traite', false);
            if(!error && count) retours = count;
        } catch(e) { console.warn('[Admin] pastille retours:', e); }
        poser('admin-errors-badge', erreurs);
        poser('admin-feedback-badge', retours);
        poser('admin-pending-badge', signalements + erreurs + retours);
    },
    
    // B5 : re-clic sur le bouton Admin = retour à l'accueil
    toggle: () => {
        const v = document.getElementById('admin-view');
        if(v && v.style.display === 'flex') Admin.close();
        else Admin.show();
    },

    show: async () => {
        if(!Admin.isAdmin()) {
            Utils.toast('Accès non autorisé', 'error');
            return;
        }
        
        // Admin est dans dashboard-view, donc on cache juste le hub
        document.getElementById('hub-content').style.display = 'none';
        document.getElementById('universe-view').style.display = 'none';
        document.getElementById('admin-view').style.display = 'flex';
        Router.sync();
        
        await Admin.loadStats();
        await Admin.loadReports();
    },
    
    close: () => {
        UI.hideAllViews();
        document.getElementById('hub-content').style.display = '';
        document.getElementById('dashboard-view').style.display = 'flex';
        // Scroller en haut de la page
        window.scrollTo(0, 0);
    },
    
    // ===================== STATISTIQUES & GRAPHIQUES =====================
    statsData: {
        profiles: [],
        projects: [],
        actors: [],
        connections: [],
        reports: [],
        // Métiers tech
        crew_gc1: [], crew_gc2: [], crew_gc3: [], crew_gc4: [], crew_gc5: [],
        crew_gc6: [], crew_gc7: [], crew_gc8: [], crew_gc9: [], crew_gc10: [],
        crew_gc11: [], crew_gc12: [], crew_gc13: [], crew_gc14: [], crew_gc15: [],
        crew_gc16: [], crew_gc17: [],
        // Associations
        asso_video: [], asso_comediens: [], asso_realisateurs: [], asso_techniciens: [],
        asso_scenaristes: [], asso_producteurs: [], asso_figurants: [], asso_court_metrage: [],
        asso_documentaire: [], asso_animation: [], asso_musique: [], asso_theatre: [],
        asso_formation: [], asso_autre: [],
        // Entreprises
        ent_production: [], ent_postprod: [], ent_montage: [], ent_vfx: [],
        ent_doublage: [], ent_son: [], ent_musique: [], ent_location: [],
        ent_vente: [], ent_studio: [], ent_casting: [], ent_distribution: [],
        ent_technique: [], ent_formation: [], ent_autre: []
    },
    
    activeStatCategory: null,
    
    loadStats: async () => {
        try {
            // Charger les profils (filtré si exclusion démo active)
            // v602 : par la porte unique des profils (administration : tout).
            const _tous = await Utils.profils({ tous: true });
            const profiles = Admin.excludeDemoProfiles ? _tous.data.filter(p => !p.is_demo) : _tous.data;
            Admin.statsData.profiles = profiles || [];
            
            // Réinitialiser les compteurs détaillés
            Object.keys(Admin.statsData).forEach(k => {
                if(k.startsWith('crew_') || k.startsWith('asso_') || k.startsWith('ent_')) {
                    Admin.statsData[k] = [];
                }
            });
            
            // Mapping des rôles vers départements
            const roleToDept = {
                'Réalisateur-rice': 'gc3', '1er assistant réalisateur': 'gc3', '2ème assistant réalisateur': 'gc3', 'Scripte': 'gc3',
                'Directeur-rice de la photo': 'gc1', 'Cadreur-se': 'gc1', '1er assistant caméra': 'gc1', '2ème assistant caméra': 'gc1', 'Steadicamer': 'gc1', 'Chef opérateur drone': 'gc1',
                'Chef électro': 'gc2', 'Electricien-ne': 'gc2', 'Chef machino': 'gc18', 'Machiniste': 'gc18',
                'Chef opérateur son': 'gc4', 'Perchiste': 'gc4', 'Ingénieur du son': 'gc4',
                'Chef décorateur': 'gc5', 'Ensemblier': 'gc5', 'Accessoiriste': 'gc5', 'Régisseur plateau': 'gc5',
                'Chef costumier': 'gc6', 'Costumier-ère': 'gc6', 'Habilleur-se': 'gc6',
                'Chef maquilleur': 'gc7', 'Maquilleur-se': 'gc7', 'Coiffeur-se': 'gc7',
                'Script/Continuité': 'gc8',
                'Régisseur général': 'gc9', 'Régisseur adjoint': 'gc9',
                'Directeur de production': 'gc10', 'Directeur de post-production': 'gc10', 'Producteur-rice': 'gc10',
                'Chef cuisinier': 'gc11', 'Intendant': 'gc11',
                'Chauffeur': 'gc12', 'Régisseur transport': 'gc12',
                'Monteur-se': 'gc13', 'Etalonneur-se': 'gc13', 'Infographiste': 'gc13',
                'Scénariste': 'gc14', 'Dialoguiste': 'gc14',
                'Compositeur-rice': 'gc15', 'Musicien-ne': 'gc15',
                'Cascadeur-se': 'gc16', 'Coordinateur cascades': 'gc16'
            };
            
            // Compter les types de profils
            let actorCount = 0;
            profiles?.forEach(p => {
                const profileType = p.profile_type;
                const data = p.data || {};
                const created = p.created_at || p.updated_at || new Date().toISOString();
                
                if(profileType === 'actor') actorCount++;
                if(profileType === 'crew') {
                    let dept = data.department;
                    if(!dept && data.role) {
                        dept = roleToDept[data.role] || 'gc17';
                    }
                    if(dept) {
                        const key = 'crew_' + dept;
                        if(Admin.statsData[key] !== undefined) {
                            Admin.statsData[key].push(created);
                        }
                    }
                }
                if(profileType === 'association' && data.assoType) {
                    if(Admin.statsData[data.assoType] !== undefined) {
                        Admin.statsData[data.assoType].push(created);
                    }
                }
                if(profileType === 'enterprise' && data.entType) {
                    if(Admin.statsData[data.entType] !== undefined) {
                        Admin.statsData[data.entType].push(created);
                    }
                }
            });
            Admin.statsData.actors = new Array(actorCount);
            
            // Charger les projets avec dates
            const { data: projects, error: projStatsErr } = await supabase.from('projects').select('created_at').is('deleted_at', null);
            if(projStatsErr) console.error('Erreur stats projets:', projStatsErr);
            Admin.statsData.projects = projects?.map(p => p.created_at) || [];
            
            // Charger les connexions
            const { data: connections, error: connStatsErr } = await supabase.from('user_logins').select('logged_at, user_email');
            if(connStatsErr) console.error('Erreur stats connexions:', connStatsErr);
            const _connExt = (connections || []).filter(c => !CONFIG.internalEmails.includes((c.user_email || '').toLowerCase()));
            Admin._internalLogins = (connections || []).length - _connExt.length;
            Admin.statsData.connections = _connExt.map(c => c.logged_at);
            
            // Charger les signalements
            const { data: reports, error: repStatsErr } = await supabase.from('reports').select('created_at');
            if(repStatsErr) console.error('Erreur stats signalements:', repStatsErr);
            Admin.statsData.reports = reports?.map(r => r.created_at) || [];
            
            // Mettre à jour les totaux
            document.getElementById('stat-profiles-total').textContent = Admin.statsData.profiles.length;
            document.getElementById('stat-projects-total').textContent = Admin.statsData.projects.length;
            document.getElementById('stat-actors-total').textContent = Admin.statsData.actors.length;
            document.getElementById('stat-connections-total').textContent = Admin.statsData.connections.length + (Admin._internalLogins ? ' (+' + Admin._internalLogins + ' int.)' : '');
            document.getElementById('stat-reports-total').textContent = Admin.statsData.reports.length;
            
            // Config
            const { data: authCount, error: errAuthCount } = await supabase.rpc('get_auth_users_count');
            if(errAuthCount) console.error('[Admin] get_auth_users_count:', errAuthCount);
            document.getElementById('config-current-users').textContent = authCount || 0;
            
            // Dessiner le graphique
            Admin.updateStatsChart();
            
        } catch(e) {
            console.error('Erreur chargement stats:', e);
        }
    },
    
    toggleStatCategory: (category) => {
        const container = document.getElementById('stats-detail-toggles');
        const btn = document.getElementById('stat-cat-' + category);
        
        // Toggle le bouton actif
        document.querySelectorAll('.stat-cat-btn').forEach(b => {
            b.style.background = 'var(--bg)';
            b.style.color = 'var(--text-main)';
        });
        
        if(Admin.activeStatCategory === category) {
            Admin.activeStatCategory = null;
            container.innerHTML = '';
            return;
        }
        
        Admin.activeStatCategory = category;
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
        
        // Générer les toggles pour cette catégorie
        let items = [];
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#0ea5e9', '#d946ef', '#64748b', '#fb7185'];
        
        if(category === 'crew') {
            items = CONFIG.crewGroups.map((g, i) => ({
                id: 'crew_' + g.id,
                name: g.name,
                color: colors[i % colors.length],
                count: Admin.statsData['crew_' + g.id]?.length || 0
            }));
        } else if(category === 'asso') {
            items = CONFIG.associationTypes.map((t, i) => ({
                id: t.id,
                name: t.name,
                color: colors[i % colors.length],
                count: Admin.statsData[t.id]?.length || 0
            }));
        } else if(category === 'ent') {
            items = CONFIG.enterpriseTypes.map((t, i) => ({
                id: t.id,
                name: t.name,
                color: colors[i % colors.length],
                count: Admin.statsData[t.id]?.length || 0
            }));
        }
        
        container.innerHTML = items.map(item => `
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 4px 8px; background: var(--bg); border-radius: 4px; font-size: 0.75rem;">
                <input type="checkbox" data-stat="${item.id}" onchange="app.Admin.updateStatsChart()" style="accent-color: ${item.color}; width: 12px; height: 12px;">
                <span style="color: ${item.color};">${item.name}</span>
                <strong style="color: ${item.color};">${item.count}</strong>
            </label>
        `).join('');
    },
    updateStatsChart: () => {
        const canvas = document.getElementById('admin-stats-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const days = parseInt(document.getElementById('stats-period').value) || 30;
        const now = new Date();
        
        // Générer les labels (dates)
        const labels = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            labels.push(d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
        }
        
        // Fonction pour compter les éléments cumulés par jour
        const getCumulativeData = (dates) => {
            const counts = [];
            for (let i = days - 1; i >= 0; i--) {
                const dayEnd = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                dayEnd.setHours(23, 59, 59, 999);
                const count = (dates || []).filter(d => new Date(d) <= dayEnd).length;
                counts.push(count);
            }
            return counts;
        };
        
        // Fonction pour compter par jour (non cumulé - pour connexions)
        const getDailyData = (dates) => {
            const counts = [];
            for (let i = days - 1; i >= 0; i--) {
                const dayStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setHours(23, 59, 59, 999);
                const count = (dates || []).filter(d => {
                    const date = new Date(d);
                    return date >= dayStart && date <= dayEnd;
                }).length;
                counts.push(count);
            }
            return counts;
        };
        
        // Collecter les datasets actifs
        const datasets = [];
        const baseColors = {
            profiles: '#3b82f6',
            projects: '#10b981',
            actors: '#8b5cf6',
            connections: '#06b6d4',
            reports: '#ef4444'
        };
        
        const detailColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#0ea5e9', '#d946ef', '#64748b', '#fb7185'];
        
        // Stats principales
        document.querySelectorAll('#stats-toggles input[type="checkbox"]').forEach(cb => {
            if (cb.checked) {
                const stat = cb.dataset.stat;
                if (Admin.statsData[stat]) {
                    const data = stat === 'connections' 
                        ? getDailyData(Admin.statsData[stat])
                        : getCumulativeData(Admin.statsData[stat]);
                    datasets.push({ name: stat, data, color: baseColors[stat] || '#888' });
                }
            }
        });
        
        // Stats détaillées (métiers, asso, entreprises)
        let colorIndex = 0;
        document.querySelectorAll('#stats-detail-toggles input[type="checkbox"]').forEach(cb => {
            if (cb.checked) {
                const stat = cb.dataset.stat;
                if (Admin.statsData[stat]) {
                    const data = getCumulativeData(Admin.statsData[stat]);
                    const color = detailColors[colorIndex % detailColors.length];
                    datasets.push({ name: stat, data, color });
                    colorIndex++;
                }
            }
        });
        
        // Dessiner le graphique
        Admin.drawLineChart(ctx, canvas, labels, datasets);
    },
    
    drawLineChart: (ctx, canvas, labels, datasets) => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);
        
        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 20, bottom: 40, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        ctx.clearRect(0, 0, width, height);
        
        let maxVal = 1;
        datasets.forEach(ds => {
            const dsMax = Math.max(...ds.data);
            if (dsMax > maxVal) maxVal = dsMax;
        });
        maxVal = Math.ceil(maxVal * 1.1);
        
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-sec').trim() || '#666';
        
        // Grille
        ctx.strokeStyle = 'rgba(128,128,128,0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            ctx.fillStyle = textColor;
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 5) * i), padding.left - 8, y + 3);
        }
        
        // Labels X
        ctx.textAlign = 'center';
        const step = Math.ceil(labels.length / 10);
        labels.forEach((label, i) => {
            if (i % step === 0 || i === labels.length - 1) {
                const x = padding.left + (i / (labels.length - 1)) * chartWidth;
                ctx.fillStyle = textColor;
                ctx.font = '9px Arial';
                ctx.fillText(label, x, height - 10);
            }
        });
        
        // Lignes
        datasets.forEach(ds => {
            ctx.strokeStyle = ds.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            ds.data.forEach((val, i) => {
                const x = padding.left + (i / (ds.data.length - 1)) * chartWidth;
                const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            
            ctx.fillStyle = ds.color;
            ds.data.forEach((val, i) => {
                const x = padding.left + (i / (ds.data.length - 1)) * chartWidth;
                const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    },
    
    // ===================== SIGNALEMENTS & BADGES =====================
    loadReports: async () => {
        const container = document.getElementById('admin-reports-list');
        container.innerHTML = '<div style="text-align: center; color: var(--text-sec); padding: 20px;">Chargement...</div>';
        
        try {
            const { data: reports, error } = await supabase
                .from('reports')
                .select('*')
                .order('created_at', { ascending: false });
            
            if(error) throw error;
            
            Admin.allReports = reports || [];
            
            if(!reports || reports.length === 0) {
                container.innerHTML = '<div class="empty-state">✅ Aucun signalement</div>';
                return;
            }
            
            // Charger les badges actuels des profils signalés (pour affichage)
            const reportedEmails = [...new Set(reports.map(r => (r.reported_email || '').toLowerCase()).filter(e => e))];
            const badgeByEmail = {};
            if(reportedEmails.length > 0) {
                const { data: profiles, error: errBadges } = await supabase
                    .from('user_profiles')
                    .select('email, moderation_badge, badge_reason')
                    .in('email', reportedEmails);
                if(errBadges) console.error('[Admin] badges signalements:', errBadges);
                (profiles || []).forEach(p => { badgeByEmail[p.email] = { badge: p.moderation_badge, reason: p.badge_reason }; });
            }
            
            const reasonLabels = {
                'fake': '👤 Faux profil',
                'inappropriate': '🚫 Inapproprié',
                'spam': '📧 Spam',
                'harassment': '⚠️ Harcèlement',
                'scam': '💰 Arnaque',
                'other': '❓ Autre'
            };
            
            const statusLabels = {
                'pending': { label: '⏳ En attente', color: '#f59e0b' },
                'reviewed': { label: '👁️ Examiné', color: '#3b82f6' },
                'resolved': { label: '✅ Résolu', color: '#10b981' },
                'dismissed': { label: '❌ Rejeté', color: '#6b7280' }
            };
            
            const badgeDotLabels = { yellow: '🟡 Jaune', red: '🔴 Rouge', black: '⚫ Noir' };
            
            container.innerHTML = reports.map(r => {
                const emailKey = (r.reported_email || '').toLowerCase();
                const currentBadge = badgeByEmail[emailKey];
                const hasBadge = currentBadge && currentBadge.badge;
                
                return `
                <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 15px; display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
                    <div class="flex-1">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
                            <span style="background: ${statusLabels[r.status]?.color || '#6b7280'}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem;">${statusLabels[r.status]?.label || r.status}</span>
                            <span class="fw-bold">${reasonLabels[r.reason] || Utils.escape(r.reason)}</span>
                            <span class="text-sec-sm2">• ${r.reported_type === 'forum_thread' ? 'Sujet forum' : r.reported_type === 'forum_reply' ? 'Réponse forum' : r.reported_type === 'profile' ? 'Profil' : r.reported_type}</span>
                            ${hasBadge ? `<span style="background:${currentBadge.badge === 'yellow' ? '#f59e0b' : currentBadge.badge === 'red' ? '#dc2626' : '#1f2937'}; color:white; padding:3px 8px; border-radius:4px; font-size:0.75rem;">Badge ${badgeDotLabels[currentBadge.badge]}</span>` : ''}
                        </div>
                        <div style="margin-bottom: 5px;"><strong>Signalé :</strong> ${Utils.escape(r.reported_name || 'Inconnu')} ${r.reported_email ? `(${Utils.escape(r.reported_email)})` : ''}</div>
                        <div style="margin-bottom: 5px; color: var(--text-sec); font-size: 0.85rem;"><strong>Par :</strong> ${Utils.escape(r.reporter_email)}</div>
                        ${r.details ? `<div style="margin-top: 8px; padding: 10px; background: var(--panel-bg); border-radius: 6px; font-size: 0.9rem;">${Utils.escape(r.details)}</div>` : ''}
                        ${hasBadge && currentBadge.reason ? `<div style="margin-top: 8px; padding: 10px; background: var(--panel-bg); border-left: 3px solid ${currentBadge.badge === 'yellow' ? '#f59e0b' : currentBadge.badge === 'red' ? '#dc2626' : '#1f2937'}; border-radius: 4px; font-size: 0.85rem;"><strong>Raison du badge :</strong> ${Utils.escape(currentBadge.reason)}</div>` : ''}
                        <div style="margin-top: 8px; color: var(--text-sec); font-size: 0.8rem;">📅 ${new Date(r.created_at).toLocaleDateString('fr-FR')} à ${new Date(r.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</div>
                        
                        ${r.reported_email ? `
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border);">
                            <div style="font-size: 0.75rem; color: var(--text-sec); margin-bottom: 6px; font-weight: bold;">MODÉRATION DU PROFIL</div>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                <button onclick="app.Admin.applyBadgeFromReport('${r.id}', 'yellow')" style="padding: 5px 10px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;" ${currentBadge?.badge === 'yellow' ? 'disabled style="padding:5px 10px; background:#f59e0b99; color:white; border:none; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:not-allowed;"' : ''}>🟡 Jaune</button>
                                <button onclick="app.Admin.applyBadgeFromReport('${r.id}', 'red')" style="padding: 5px 10px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;" ${currentBadge?.badge === 'red' ? 'disabled style="padding:5px 10px; background:#dc262699; color:white; border:none; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:not-allowed;"' : ''}>🔴 Rouge</button>
                                <button onclick="app.Admin.applyBadgeFromReport('${r.id}', 'black')" style="padding: 5px 10px; background: #1f2937; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;" ${currentBadge?.badge === 'black' ? 'disabled style="padding:5px 10px; background:#1f293799; color:white; border:none; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:not-allowed;"' : ''}>⚫ Noir</button>
                                ${hasBadge ? `<button onclick="app.Admin.removeBadgeFromReport('${r.id}')" style="padding: 5px 10px; background: var(--border); color: var(--text-main); border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">⚪ Retirer le badge</button>` : ''}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="flex-col-gap5">
                        ${r.status === 'pending' ? `
                            <button onclick="app.Admin.updateReportStatus('${r.id}', 'resolved')" style="padding: 6px 12px; background: var(--success); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">✅ Résolu</button>
                            <button onclick="app.Admin.updateReportStatus('${r.id}', 'dismissed')" style="padding: 6px 12px; background: var(--border); color: var(--text-main); border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">❌ Rejeter</button>
                        ` : ''}
                        ${(r.reported_type === 'forum_thread' || r.reported_type === 'forum_reply') ? `<button onclick="app.Admin.deleteForumPost('${r.reported_type}', '${r.reported_id}', '${r.id}')" style="padding: 6px 12px; background: #b45309; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">🗑️ Supprimer le post</button>` : ''}
                        <button onclick="app.Admin.deleteReport('${r.id}')" style="padding: 6px 12px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">🗑️</button>
                    </div>
                </div>`;
            }).join('');
            
        } catch(e) {
            console.error('Erreur chargement signalements:', e);
            container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 40px;">Erreur de chargement</div>';
        }
    },
    
    // Applique un badge de modération sur le profil signalé
    // badge : 'yellow' | 'red' | 'black' | null (null = retirer le badge)
    setProfileBadge: async (reportedEmail, badge, reason = '') => {
        if(!Admin.isAdmin()) {
            Utils.toast('Accès non autorisé', 'error');
            return false;
        }
        if(!reportedEmail) {
            Utils.toast('Email du profil signalé manquant', 'error');
            return false;
        }
        
        try {
            const badgeFilter = `email.eq.${Utils.pgSafe(reportedEmail.toLowerCase())},owner_email.eq.${Utils.pgSafe(reportedEmail.toLowerCase())}`;
            const { data, error } = await supabase
                .from('user_profiles')
                .update({
                    moderation_badge: badge,
                    badge_reason: badge ? reason : null,
                    badge_set_at: badge ? new Date().toISOString() : null,
                    badge_set_by: badge ? state.currentUser.email.toLowerCase() : null
                })
                .or(badgeFilter)
                .select('id');
            
            if(error) throw error;
            if(!data || data.length === 0) {
                Utils.toast('Badge non enregistré : profil introuvable ou écriture bloquée (RLS user_profiles ?)', 'error');
                console.warn('[Admin] setProfileBadge : 0 ligne touchée pour', reportedEmail, '— email/owner_email absent ou policy RLS UPDATE manquante');
                return false;
            }
            
            // G5b: invalider le cache de modération
            Moderation.invalidateCache(reportedEmail);
            
            const labels = { yellow: '🟡 Jaune', red: '🔴 Rouge', black: '⚫ Noir' };
            if(badge) {
                Utils.toast(`Badge ${labels[badge]} appliqué à ${reportedEmail}`, 'success');
            } else {
                Utils.toast(`Badge retiré de ${reportedEmail}`, 'success');
            }
            return true;
        } catch(e) {
            console.error('Erreur setProfileBadge:', e);
            Utils.toast('Erreur lors de l\'application du badge', 'error');
            return false;
        }
    },
    
    // Demande confirmation + raison, puis applique le badge
    applyBadgeFromReport: async (reportId, badge) => {
        const r = (Admin.allReports || []).find(x => String(x.id) === String(reportId));
        if(!r) return;
        const reportedEmail = r.reported_email;
        const reportedName = r.reported_name;
        if(!reportedEmail) {
            Utils.toast('Ce profil n\'a pas d\'email enregistré, impossible d\'appliquer un badge', 'warning');
            return;
        }
        
        const labels = { yellow: '🟡 Jaune (avertissement léger)', red: '🔴 Rouge (cas grave)', black: '⚫ Noir (restrictions de contact)' };
        const colors = { yellow: '#f59e0b', red: '#dc2626', black: '#1f2937' };
        
        const confirmed = await ConfirmModal.show({
            title: `Attribuer le badge ${labels[badge]} ?`,
            message: `
                <p class="mb-15">Badge à appliquer sur : <strong>${Utils.escape(reportedName || reportedEmail)}</strong> (${Utils.escape(reportedEmail)})</p>
                <label class="label-bold-block-5">Raison (visible publiquement sur le profil) :</label>
                <textarea id="badge-reason-input" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px;" placeholder="Ex : plusieurs signalements pour contenu inapproprié..." data-tooltip="Ex : plusieurs signalements pour contenu inapproprié..."></textarea>
                <div style="margin-top: 12px; padding: 10px; background: ${colors[badge]}22; border-left: 3px solid ${colors[badge]}; border-radius: 4px; font-size: 0.85rem;">
                    ${badge === 'black' ? '⚠️ Le badge noir restreint les communications : le profil ne pourra plus envoyer/recevoir de messages ni d\'invitations auprès de nouvelles personnes. Ses contacts et projets existants restent accessibles.' : badge === 'red' ? 'Avertissement public fort. Le profil reste fonctionnel.' : 'Avertissement public modéré. Le profil reste fonctionnel.'}
                </div>
            `,
            confirmText: 'Appliquer le badge',
            icon: '🏷️'
        });
        
        if(!confirmed) return;
        
        const reason = document.getElementById('badge-reason-input')?.value?.trim() || '';
        const ok = await Admin.setProfileBadge(reportedEmail, badge, reason);
        if(ok) {
            await Admin.loadReports();
        }
    },
    
    // Retire le badge d'un profil
    removeBadgeFromReport: async (reportId) => {
        const r = (Admin.allReports || []).find(x => String(x.id) === String(reportId));
        if(!r) return;
        const reportedEmail = r.reported_email;
        const reportedName = r.reported_name;
        if(!reportedEmail) return;
        const confirmed = await ConfirmModal.show({
            title: 'Retirer le badge ?',
            message: `<p>Retirer le badge de modération du profil <strong>${Utils.escape(reportedName || reportedEmail)}</strong> ?</p><p class="text-sec-sm2 mt-10">Le profil retrouvera son état normal.</p>`,
            confirmText: 'Retirer',
            icon: '⚪'
        });
        if(!confirmed) return;
        
        const ok = await Admin.setProfileBadge(reportedEmail, null);
        if(ok) {
            await Admin.loadReports();
        }
    },
    
    updateReportStatus: async (reportId, status) => {
        try {
            const { data, error } = await supabase
                .from('reports')
                .update({ 
                    status: status, 
                    reviewed_at: new Date().toISOString(),
                    reviewed_by: state.currentUser.email
                })
                .eq('id', reportId)
                .select();
            
            if(error) throw error;
            if(!data || data.length === 0) { Utils.toast('Mise a jour bloquee : droits RLS sur reports ?', 'error'); console.warn('[Admin] update reports : 0 ligne touchee (policy RLS UPDATE manquante ?) id=', reportId); return; }
            
            Utils.toast('Statut mis à jour', 'success');
            await Admin.loadReports();
            await Admin.loadStats();
            Admin.refreshPendingBadge();
        } catch(e) {
            console.error('Erreur mise à jour:', e);
            Utils.toast('Erreur', 'error');
        }
    },
    
    // Supprimer un post forum signalé (sujet -> cascade réponses + votes ; réponse -> seule)
    deleteForumPost: async (kind, postId, reportId) => {
        const isThread = kind === 'forum_thread';
        if(!await ConfirmModal.show({ title: 'Supprimer le post ?', message: isThread ? 'Supprimer définitivement ce sujet ET toutes ses réponses ?' : 'Supprimer définitivement cette réponse ?', icon: '🗑️', confirmText: 'Supprimer' })) return;
        try {
            if(isThread) {
                try { await supabase.from('forum_votes').delete().eq('thread_id', postId); } catch(_) {}
                await supabase.from('forum_replies').delete().eq('thread_id', postId);
                const { data, error } = await supabase.from('forum_threads').delete().eq('id', postId).select();
                if(error) throw error;
                if(!data || data.length === 0) { Utils.toast('Suppression bloquée : aucune ligne supprimée (vérifie la policy RLS DELETE sur forum_threads).', 'error', 7000); return; }
            } else {
                const { data, error } = await supabase.from('forum_replies').delete().eq('id', postId).select();
                if(error) throw error;
                if(!data || data.length === 0) { Utils.toast('Suppression bloquée : aucune ligne supprimée (vérifie la policy RLS DELETE sur forum_replies).', 'error', 7000); return; }
            }
            try { await supabase.from('reports').update({ status: 'resolved', reviewed_at: new Date().toISOString(), reviewed_by: state.currentUser.email }).eq('id', reportId); } catch(_) {}
            Utils.toast('Post supprimé', 'success');
            await Admin.loadReports();
            await Admin.loadStats();
            Admin.refreshPendingBadge();
        } catch(e) {
            console.error('Erreur suppression post forum:', e);
            Utils.toast('Erreur lors de la suppression du post', 'error');
        }
    },
    
    deleteReport: async (reportId) => {
        if(!await ConfirmModal.show({ title: 'Supprimer ?', message: 'Supprimer définitivement ce signalement ?', icon: '🗑️', confirmText: 'Supprimer' })) return;
        
        try {
            const { data, error } = await supabase.from('reports').delete().eq('id', reportId).select();
            if(error) throw error;
            if(!data || data.length === 0) { Utils.toast('Suppression bloquee : droits RLS sur reports ?', 'error'); console.warn('[Admin] delete reports : 0 ligne supprimee (policy RLS DELETE manquante ?) id=', reportId); return; }
            
            Utils.toast('Signalement supprimé', 'success');
            await Admin.loadReports();
            await Admin.loadStats();
            Admin.refreshPendingBadge();
        } catch(e) {
            console.error('Erreur suppression:', e);
            Utils.toast('Erreur', 'error');
        }
    },
    
    // ===================== UTILISATEURS =====================
    loadUsers: async () => {
        const container = document.getElementById('admin-users-list');
        container.innerHTML = '<div style="text-align: center; color: var(--text-sec); padding: 20px;">Chargement...</div>';
        
        try {
            // Charger les profils
            // v602 : l'administration lit tout par la porte unique des profils.
            const _tous = await Utils.profils({ tous: true });
            const error = _tous.error;
            const users = _tous.data.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
            
            if(error) throw error;
            
            // Charger tous les projets
            // v578 (cloisonnement) : on chargeait le JSON de TOUS les projets de la
            // plateforme pour n'en afficher que le poids. La fonction serveur rend
            // le poids sans le contenu.
            const { data: rawProjects, error: errSizes } = await supabase.rpc('admin_project_sizes');
            if(errSizes) console.error('[Admin] admin_project_sizes:', errSizes);
            // Corbeille : si la fonction serveur renvoie deleted_at, on écarte les projets supprimés
            const projects = (rawProjects || []).filter(p => !p.deleted_at);
            
            // Associer les projets aux utilisateurs
            Admin.allProjects = projects;
            Admin.allUsers = (users || []).map(u => {
                const userProjects = projects?.filter(p => p.owner_email === u.email) || [];
                return { ...u, projects: userProjects };
            });
            
            Admin.renderUsers(Admin.allUsers);
            
        } catch(e) {
            console.error('Erreur chargement utilisateurs:', e);
            container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 40px;">Erreur de chargement</div>';
        }
    },
    
    renderUsers: (users) => {
        const container = document.getElementById('admin-users-list');
        
        if(!users || users.length === 0) {
            container.innerHTML = '<div class="empty-state">Aucun utilisateur</div>';
            return;
        }
        
        container.innerHTML = `
            <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 800px;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border); background: var(--bg);">
                        <th class="td-padded">Email</th>
                        <th class="td-padded">Nom du profil</th>
                        <th style="padding: 12px 10px; text-align: center; font-size: 0.85rem;">Types</th>
                        <th class="td-padded">Inscription</th>
                        <th style="padding: 12px 10px; text-align: center; font-size: 0.85rem;">CGU</th>
                        <th class="td-padded">Projets</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => {
                        const facets = PublicProfile._normalizeFacets((u.data || {}).facets || u.facets, u);
                        const profileTypes = [];
                        if(facets.actor.enabled) profileTypes.push('<span title="Comédien">🎭</span>');
                        if(PublicProfile.crewAnyEnabled(facets)) profileTypes.push('<span title="Technicien">🎥</span>');
                        if(facets.asso.enabled) profileTypes.push('<span title="Association">🏛️</span>');
                        if(facets.ent.enabled) profileTypes.push('<span title="Entreprise">🏢</span>');
                        
                        // Projets de l'utilisateur
                        const projectsHtml = u.projects && u.projects.length > 0 
                            ? u.projects.map(p => `<div style="font-size: 0.8rem; margin-bottom: 3px;">
                                <span style="color: var(--text-main);">${Utils.escape(p.title || 'Sans titre')}</span>
                                <span style="color: var(--text-sec); font-size: 0.75rem;">(${new Date(p.created_at).toLocaleDateString('fr-FR')})</span>
                                <span style="color: var(--text-sec); font-size: 0.75rem;"> — 💾 ${Utils.formatWeight(p.weight_bytes || 0)}</span>
                            </div>`).join('')
                            : '<span style="color: var(--text-sec); font-size: 0.8rem;">-</span>';
                        
                        return `
                            <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--highlight)'" onmouseout="this.style.background=''">
                                <td style="padding: 10px; font-size: 0.85rem;">
                                    <a href="mailto:${Utils.escape(u.email)}" style="color: var(--primary); text-decoration: none;">${Utils.escape(u.email || '-')}</a>
                                </td>
                                <td class="p-10">
                                    <strong>${Utils.escape(u.name || '-')}</strong>
                                </td>
                                <td style="padding: 10px; text-align: center; font-size: 1.1rem;">
                                    ${profileTypes.join(' ') || '<span class="text-sec">-</span>'}
                                </td>
                                <td style="padding: 10px; color: var(--text-sec); font-size: 0.85rem;">
                                    ${u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '-'}
                                </td>
                                <td style="padding: 10px; text-align: center; font-size: 0.85rem;" title="${u.terms_accepted && u.terms_accepted_at ? 'Accepté le ' + new Date(u.terms_accepted_at).toLocaleString('fr-FR') : 'Pas encore accepté'}">
                                    ${u.terms_accepted ? '✅' : '❌'}
                                </td>
                                <td class="p-10">
                                    ${projectsHtml}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        `;
    },
    
    filterUsers: (search) => {
        const filtered = Admin.allUsers.filter(u => {
            const s = search.toLowerCase();
            return (u.email && u.email.toLowerCase().includes(s)) || 
                   (u.name && u.name.toLowerCase().includes(s));
        });
        Admin.renderUsers(filtered);
    },
    
    // ===== STATISTIQUES CONNEXIONS =====
    connectionStats: null,
    
    loadConnectionStats: async () => {
        try {
            const { data: allLogins, error } = await supabase
                .from('user_logins')
                .select('logged_at, user_email')
                .order('logged_at', { ascending: false });
            
            if (error) throw error;
            
            // B4 : on ne compte que les connexions externes (hors CONFIG.internalEmails)
            const logins = (allLogins || []).filter(l => !CONFIG.internalEmails.includes((l.user_email || '').toLowerCase()));
            const _intCount = (allLogins || []).length - logins.length;
            Admin.connectionStats = logins;
            
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            // Compteurs
            let todayCount = 0, weekCount = 0, monthCount = 0;
            logins.forEach(l => {
                const d = new Date(l.logged_at);
                if (d >= today) todayCount++;
                if (d >= weekAgo) weekCount++;
                if (d >= monthAgo) monthCount++;
            });
            
            document.getElementById('stat-today').textContent = todayCount;
            document.getElementById('stat-week').textContent = weekCount;
            document.getElementById('stat-month').textContent = monthCount;
            document.getElementById('stat-total-logins').textContent = logins.length + (_intCount ? ' (+' + _intCount + ' int.)' : '');
            
            // Graphiques
            Admin.drawDailyChart(logins);
            Admin.drawWeeklyChart(logins);
            Admin.drawMonthlyChart(logins);
            
        } catch(e) {
            console.error('Erreur chargement stats connexions:', e);
        }
    },
    
    drawDailyChart: (logins) => {
        const canvas = document.getElementById('chart-daily');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Préparer les données des 7 derniers jours
        const days = [];
        const counts = [];
        const now = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            
            days.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
            counts.push(logins.filter(l => {
                const ld = new Date(l.logged_at);
                return ld >= dayStart && ld < dayEnd;
            }).length);
        }
        
        Admin.drawBarChart(ctx, canvas, days, counts, '#3b82f6');
    },
    
    drawWeeklyChart: (logins) => {
        const canvas = document.getElementById('chart-weekly');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const weeks = [];
        const counts = [];
        const now = new Date();
        
        for (let i = 3; i >= 0; i--) {
            const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            weeks.push(`Sem. ${weekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`);
            counts.push(logins.filter(l => {
                const ld = new Date(l.logged_at);
                return ld >= weekStart && ld < weekEnd;
            }).length);
        }
        
        Admin.drawBarChart(ctx, canvas, weeks, counts, '#8b5cf6');
    },
    
    drawMonthlyChart: (logins) => {
        const canvas = document.getElementById('chart-monthly');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const months = [];
        const counts = [];
        const now = new Date();
        
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
            const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            
            months.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
            counts.push(logins.filter(l => {
                const ld = new Date(l.logged_at);
                return ld >= monthStart && ld < monthEnd;
            }).length);
        }
        
        Admin.drawBarChart(ctx, canvas, months, counts, '#10b981');
    },
    
    drawBarChart: (ctx, canvas, labels, data, color) => {
        // Ajuster la résolution du canvas
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);
        
        const width = rect.width;
        const height = rect.height;
        const padding = 40;
        const barWidth = (width - padding * 2) / labels.length * 0.7;
        const gap = (width - padding * 2) / labels.length * 0.3;
        const maxVal = Math.max(...data, 1);
        
        // Effacer
        ctx.clearRect(0, 0, width, height);
        
        // Style texte
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-sec').trim() || '#666';
        ctx.fillStyle = textColor;
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        
        // Dessiner les barres
        labels.forEach((label, i) => {
            const x = padding + i * (barWidth + gap) + gap / 2;
            const barHeight = (data[i] / maxVal) * (height - padding * 2);
            const y = height - padding - barHeight;
            
            // Barre
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 4);
            ctx.fill();
            
            // Valeur au-dessus
            ctx.fillStyle = textColor;
            ctx.fillText(data[i], x + barWidth / 2, y - 5);
            
            // Label en bas
            ctx.fillText(label, x + barWidth / 2, height - 10);
        });
        
        // Ligne de base
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding / 2, height - padding);
        ctx.stroke();
    },
    
    // ===================== NAVIGATION =====================
    switchTab: (tabName) => {
        // Cacher tous les contenus
        document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
        // Désactiver tous les onglets
        document.querySelectorAll('.admin-tab').forEach(el => {
            el.style.background = 'var(--panel-bg)';
            el.style.color = 'var(--text-main)';
            el.classList.remove('active');
        });
        
        // Afficher le contenu sélectionné
        document.getElementById('admin-tab-' + tabName).style.display = 'block';
        // Activer l'onglet
        const activeTab = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
        if(activeTab) {
            activeTab.style.background = 'var(--primary)';
            activeTab.style.color = 'white';
            activeTab.classList.add('active');
        }
        
        // Charger les données si nécessaire
        if(tabName === 'users' && Admin.allUsers.length === 0) {
            Admin.loadUsers();
        }
        if(tabName === 'errors' && Admin.allErrors.length === 0) {
            Admin.loadErrors();
        }
        if(tabName === 'feedback' && Admin.allFeedback.length === 0) {
            Admin.loadFeedback();
        }
        if(tabName === 'analytics') {
            Admin.loadConnectionStats();
        }
        if(tabName === 'config') {
            Admin.loadPrealphaConfig();
        }
    },
    
    // ===== MESSAGE PRÉ-ALPHA =====
    loadPrealphaConfig: async () => {
        try {
            const { data, error } = await supabase
                .from('app_config')
                .select('key, value')
                .in('key', ['prealpha_title', 'prealpha_message']);
            
            if (data) {
                data.forEach(item => {
                    if (item.key === 'prealpha_title') {
                        const el = document.getElementById('prealpha-title');
                        if (el) el.textContent = item.value;
                        const input = document.getElementById('config-prealpha-title');
                        if (input) input.value = item.value;
                    }
                    if (item.key === 'prealpha_message') {
                        const el = document.getElementById('prealpha-message');
                        if (el) el.textContent = item.value;
                        const textarea = document.getElementById('config-prealpha-message');
                        if (textarea) textarea.value = item.value;
                    }
                });
            }
        } catch(e) {
            console.error('Erreur chargement config prealpha:', e);
        }
    },
    
    savePrealphaMessage: async () => {
        const title = document.getElementById('config-prealpha-title').value.trim();
        const message = document.getElementById('config-prealpha-message').value.trim();
        
        if (!title || !message) {
            Utils.toast('Veuillez remplir tous les champs', 'error');
            return;
        }
        
        try {
            // Upsert title
            const {error: cfgErr1} = await supabase.from('app_config').upsert({ 
                key: 'prealpha_title', 
                value: title,
                updated_at: new Date().toISOString()
            });
            if(cfgErr1) throw cfgErr1;
            
            // Upsert message
            const {error: cfgErr2} = await supabase.from('app_config').upsert({ 
                key: 'prealpha_message', 
                value: message,
                updated_at: new Date().toISOString()
            });
            if(cfgErr2) throw cfgErr2;
            
            // Mettre à jour l'affichage
            document.getElementById('prealpha-title').textContent = title;
            document.getElementById('prealpha-message').textContent = message;
            
            Utils.toast('Message pré-alpha mis à jour !', 'success');
        } catch(e) {
            console.error('Erreur sauvegarde message prealpha:', e);
            Utils.toast('Erreur de sauvegarde', 'error');
        }
    },
    
    previewPrealphaMessage: () => {
        const title = document.getElementById('config-prealpha-title').value;
        const message = document.getElementById('config-prealpha-message').value;
        
        document.getElementById('prealpha-title').textContent = title;
        document.getElementById('prealpha-message').textContent = message;
        
        Utils.toast('Prévisualisation appliquée (non sauvegardée)', 'info');
    },
    
    // ===== EMAILING =====
    emailRecipients: [],
    
    updateEmailFilter: (...a) => AdminEmail.updateEmailFilter(...a),
    showRecipientsList: (...a) => AdminEmail.showRecipientsList(...a),
    loadEmailTemplate: (...a) => AdminEmail.loadEmailTemplate(...a),
    previewEmail: (...a) => AdminEmail.previewEmail(...a),
    sendEmails: (...a) => AdminEmail.sendEmails(...a),
};
