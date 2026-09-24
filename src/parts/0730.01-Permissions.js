
const Permissions = {
    // ============================================================
    // ===== LOGIQUE D'ACCÈS (calcul des droits) =====
    // ============================================================
    // Obtenir les permissions d'un membre du projet
    renderInvitesTable: async (members, opts) => {
        const div = document.getElementById('perm-invites-table');
        if(!div) return;
        div.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Chargement…</p>';
        try {
            members = members || [];
            const myEmail = (state.currentUser?.email || '').toLowerCase();
            const actorEmails = new Set((state.data.actors || []).map(a => (a.email || '').toLowerCase()).filter(Boolean));
            const crewEmails = new Set((state.data.crew || []).map(c => (c.email || '').toLowerCase()).filter(Boolean));
            const pure = (members || []).filter(m => {
                const e = (m.email || '').toLowerCase();
                if(!e || m.role === 'owner' || e === myEmail) return false;
                if(actorEmails.has(e) || crewEmails.has(e)) return false;
                return true;
            });
            if(pure.length === 0) {
                div.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Aucun invité. Utilise « Partager » pour inviter une personne.</p>';
                return;
            }
            const profileIds = [...new Set(pure.map(m => m.profile_id).filter(Boolean))];
            const nameById = {};
            if(profileIds.length > 0) {
                const { data: profs, error: errProfs } = await supabase.rpc('profils_minimaux', { p_emails: null, p_ids: profileIds });
                if(errProfs) console.warn('[Invites] noms des profils:', errProfs);
                (profs || []).forEach(p => { nameById[p.id] = p.name || ''; });
            }
            const inviteMembers = pure.map(m => ({
                email: m.email,
                name: nameById[m.profile_id] || m.email,
                // v570 : une invitation non acceptee ne donne aucun acces — le dire ici.
                role: (m.status === 'pending')
                    ? '⏳ En attente de réponse'
                    : (m.role === 'editor' ? 'Invité · Éditeur' : 'Invité · Lecture'),
                _rawRole: m.role,
                _pending: (m.status === 'pending'),
                photo: null,
                _memberId: m.id
            }));
            div.innerHTML = Permissions.buildTable(inviteMembers, 'invite', Object.assign({ revoke: true }, opts || {}, {
                accessEmails: (opts && opts.accessEmails) || new Set(inviteMembers.map(m => (m.email || '').toLowerCase()))
            }));
        } catch(e) {
            console.error('renderInvitesTable:', e);
            div.innerHTML = '<p style="color:var(--danger,#dc2626);">Erreur de chargement des invités.</p>';
        }
    },

    // v570 — Cellule « rôle ». Le rôle n'est PLUS choisi : il est DEDUIT des cases de
    // la ligne (au moins une ✏️ = Éditeur) et pousse en base a la sauvegarde. Regler
    // les deux separement permettait de se contredire — 15 ✏️ sur un « lecteur »
    // n'avaient aucun effet, la lecture seule etant testee avant la permission fine.
    _roleCell: (member, type, emailKey) => {
        if(type !== 'invite') {
            return Utils.escape(type === 'actor' ? 'Comédien.ne' : (member.role || 'Technicien'));
        }
        if(member._pending) {
            return '<span title="Tant que la personne n\'a pas accepté, elle n\'a aucun accès">' + Utils.escape(member.role) + '</span>';
        }
        const lab = (member._rawRole === 'editor') ? '✏️ Éditeur' : '👁️ Lecture seule';
        // v601 : repere par DONNEE et non par identifiant. Une meme personne peut
        // avoir DEUX lignes (comedien ET technicien) : deux identifiants
        // identiques dans la page, dont un seul serait jamais retrouve.
        return '<span data-derived="' + emailKey + '" title="Rôle déduit des cases de cette ligne : au moins une ✏️ donne Éditeur.">' + lab + '</span>';
    },

    // v582 — La colonne « Peut inviter » a ete RETIREE (decision de
    // Guillaume, option A) : le droit d'inviter se deduit desormais du
    // crayon sur la colonne Fiche projet (section 'presentation'), teste en
    // direct au clic et en base par la policy INSERT (my_section_level).
    // La colonne project_members.can_invite reste en base, dormante et
    // epinglee a false par la policy, mais plus rien ne la lit.

    revokeAccess: async (email) => {
        if(state.currentRole !== 'owner') { Utils.toast('Seul le propriétaire peut révoquer un accès.', 'error'); return; }
        const ok = await ConfirmModal.show({ title: 'Révoquer cet accès ?', message: `${email} n'aura plus accès à ce projet.`, icon: '🚫', dangerous: true, confirmText: 'Révoquer' });
        if(!ok) return;
        const { error } = await supabase.from('project_members').delete().eq('project_id', state.currentProjectId).eq('email', email);
        if(error) { console.error(error); Utils.toast('Erreur lors de la révocation.', 'error'); return; }
        if(typeof History !== 'undefined' && History.log) History.log('SHARE', 'Accès révoqué : ' + email);
        Utils.toast(`${email} n'a plus accès au projet.`, 'success');
        Permissions.renderTables();
    },

    // v570 — PRESETS DE ROLE. Le tableau devient le SEUL reglage : on remplit une
    // ligne d'un coup, et le role en base (project_members.role) se DEDUIT ensuite
    // des cases (voir _deriveRole). Avant, role et cases se reglaient separement et
    // pouvaient se contredire — cocher 15 ✏️ sur un « lecteur » n'avait aucun effet.
    // v570 — Carte ONGLET -> SECTION de permission, centralisee ici. Elle existait en
    // trois exemplaires recopies dans le fichier (switchTab, Tutorial...) ; celle-ci
    // fait desormais reference pour la visibilite et les verrous.
    SECTION_BY_TAB: {
        'presentation': 'presentation', 'synopsis': 'synopsis', 'board': 'sequencier',
        'titlepage': 'scenario', 'script': 'scenario', 'storyboard': 'storyboard',
        'moodboard': 'moodboard', 'chars': 'personnages', 'locs': 'lieux',
        'actors': 'comediens', 'resources': 'ressources', 'crew': 'equipe', 'orgs': 'equipe',
        'breakdown': 'depouillement', 'scriptreport': 'scriptreport',
        'stats': 'stats', 'planning': 'planning',
        'expenses': 'depenses', 'contracts': 'contrats',
        // Saisons et Episodes structurent les scenes : ils suivent le Sequencier
        // plutot que d'occuper deux colonnes inutiles sur un projet film.
        'seasons': 'sequencier', 'episodes': 'sequencier'
    },

    sectionOf: (tabName) => Permissions.SECTION_BY_TAB[tabName] || null,

    // TROIS NIVEAUX, decides le 23 aout :
    //   ❌  l'onglet N'APPARAIT PAS dans sa navigation (et pas seulement « bloque au clic ») ;
    //   👁️  l'onglet apparait, consultable, et NE POSE AUCUN VERROU — regarder ne gene personne ;
    //   ✏️  l'onglet apparait, modifiable, et pose un verrou.
    // Un onglet sans section connue (moodboard, episodes, contracts...) reste visible :
    // ne jamais faire disparaitre un onglet par simple absence de la carte ci-dessus.
    tabVisible: (tabName) => {
        if(state.currentRole === 'owner') return true;
        const sec = Permissions.sectionOf(tabName);
        if(!sec) return true;
        return Permissions.canAccess(sec);
    },

    // Cet onglet me donne-t-il le droit d'ecrire (donc de poser un verrou) ?
    tabWritable: (tabName) => {
        if(state.currentRole === 'owner') return true;
        if(state.currentRole === 'viewer') return false;
        const sec = Permissions.sectionOf(tabName);
        if(!sec) return true;
        return Permissions.canEdit(sec);
    },

    // v570 — Verrouille VISUELLEMENT l'onglet actif quand il n'est qu'en lecture (👁️).
    // Sans cela les champs restaient cliquables et modifiables : rien n'etait
    // enregistre, mais on pouvait saisir n'importe quoi et en faire une capture.
    applyReadOnlyUI: () => {
        try {
            const active = document.querySelector('.tab-content.active');
            if(!active) return;
            const tabName = active.id.replace('tab-', '');
            const ro = !Permissions.tabWritable(tabName);
            const dejaPose = active.classList.contains('is-perm-readonly');
            const banniere = active.querySelector('.perm-ro-banner');
            // Appelee aussi au battement : ne rien remuer si l'etat n'a pas bouge.
            if(ro === dejaPose && !!banniere === ro) return;
            if(banniere) banniere.remove();
            active.classList.toggle('is-perm-readonly', ro);
            if(ro) {
                const b = document.createElement('div');
                b.className = 'perm-ro-banner';
                b.textContent = '👁 Lecture seule — vous n\'avez pas les droits de modification sur cet onglet.';
                active.prepend(b);
            }
        } catch(e) { console.warn('[Permissions] applyReadOnlyUI:', e && e.message); }
    },

    // v570 — Prise en compte SANS RECHARGEMENT d'un changement d'accès. Le rôle et le
    // droit d'inviter ne vivent pas dans le projet mais dans project_members : ils ne
    // remontent donc pas par la synchro temps réel du projet, il faut les relire.
    // Appelée après chaque mise à jour distante du projet et par le battement des verrous.
    _liveBusy: false,
    refreshLive: async () => {
        if(Permissions._liveBusy || !state.currentProjectId || !state.currentUser) return;
        if(state.currentRole === 'owner') { Permissions.applyReadOnlyUI(); return; }
        Permissions._liveBusy = true;
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('role')
                .eq('project_id', state.currentProjectId)
                .eq('email', state.currentUser.email.toLowerCase())
                .eq('status', 'accepted');
            if(error) console.warn('[Permissions] refreshLive:', error);
            if(data && data.length) {
                const roleOrder = { owner: 3, editor: 2, viewer: 1 };
                const best = data.slice().sort((a, b) => (roleOrder[b.role] || 0) - (roleOrder[a.role] || 0))[0];
                if(best.role && best.role !== state.currentRole) {
                    state.currentRole = best.role;
                    Utils.toast('Vos droits sur ce projet viennent de changer.', 'info', 5000);
                }
                // v582 : plus de drapeau can_invite a relire, le droit
                // d'inviter suit la fiche projet (voir openShareModal).
            }
        } catch(e) { console.warn('[Permissions] refreshLive:', e && e.message); }
        Permissions._liveBusy = false;
        Permissions.applyAccessUI();
    },

    // Reconstruit la navigation selon les accès courants, et évacue l'onglet ouvert
    // s'il vient d'être fermé (sinon on resterait sur un contenu devenu interdit).
    applyAccessUI: () => {
        try { UIHidden.applyHiddenTabs(); } catch(e) {}
        try { UIHidden.applyHiddenCategories(); } catch(e) {}
        const active = document.querySelector('.tab-content.active');
        const tabName = active ? active.id.replace('tab-', '') : null;
        if(tabName && !Permissions.tabVisible(tabName)) {
            const cats = (typeof UI !== 'undefined' && UI.categoryTabs) || {};
            let cible = null;
            for(const c in cats) {
                const t = cats[c].find(x => Permissions.tabVisible(x) && !(UI.hiddenTabs || []).includes(x)
                    && (state.currentProjectType === 'series' || (x !== 'episodes' && x !== 'seasons')));
                if(t) { cible = t; break; }
            }
            Utils.toast('Cet onglet ne vous est plus accessible.', 'warning', 5000);
            if(cible) UI.switchTab(cible);
            return;
        }
        Permissions.applyReadOnlyUI();
        // Ne re-declencher la logique de verrou que si le droit d'ecrire a REELLEMENT
        // change : cette fonction tourne aussi au battement (toutes les minutes), et
        // rappeler onTabEnter a vide relacherait puis reprendrait le verrou pour rien.
        try {
            if(typeof LockManager !== 'undefined' && tabName
               && LockManager.currentEditable !== Permissions.tabWritable(tabName)) {
                LockManager.onTabEnter(tabName);
            }
        } catch(e) {}
    },

    _emailByKey: {},

    ROLE_PRESETS: {
        '__viewer': { label: 'Lecteur (tout en lecture)',        mode: 'read' },
        '__editor': { label: 'Éditeur (tout en modification)',   mode: 'write' },
        '__guest':  { label: 'Invité restreint (fiche projet seule)', mode: 'guest' }
    },

    _rolePresetPerms: (mode) => {
        const out = {};
        CONFIG.permissionSections.forEach(s => {
            if(mode === 'read') out[s.id] = 'read';
            else if(mode === 'write') out[s.id] = (s.id === 'stats') ? 'read' : 'write';
            else out[s.id] = (s.id === 'presentation') ? 'read' : 'none';
        });
        return out;
    },

    // Une section absente des permissions enregistrees vaut LECTURE, jamais blocage :
    // sans cela, ajouter une section au tableau la rendrait inaccessible a tous les
    // membres deja enregistres (c'est ce qui est arrive a 'presentation' et
    // 'ressources', citees par switchTab mais jamais definies).
    _normalize: (perms) => {
        const out = Object.assign({}, perms || {});
        CONFIG.permissionSections.forEach(s => { if(!out[s.id]) out[s.id] = 'read'; });
        return out;
    },

    // Le role decoule des cases : au moins une modification -> editeur, sinon lecteur.
    _deriveRole: (perms) => {
        return CONFIG.permissionSections.some(s => (perms || {})[s.id] === 'write') ? 'editor' : 'viewer';
    },

    // v601 : meme regle de sortie pour TOUS les chemins — une section que le
    // preset ne connait pas vaut lecture, jamais blocage (voir applyPreset).
    // Un seul des quatre chemins normalisait ; les trois autres refermaient les
    // six sections ajoutees depuis.
    getForMember: (member, type) => {
        // type = 'actor' ou 'crew'
        if(type === 'actor') {
            return Permissions._normalize(CONFIG.defaultPermissions['comedien']);
        }
        
        // Pour les techniciens, chercher par rôle
        const role = member.role || '';
        
        // Chercher une correspondance exacte
        if(CONFIG.defaultPermissions[role]) {
            return Permissions._normalize(CONFIG.defaultPermissions[role]);
        }
        
        // Vérifier si c'est un chef de poste (contient "Chef" ou "Directeur")
        if(role.includes('Chef') || role.includes('Directeur') || role.includes('Réalisateur')) {
            return Permissions._normalize(CONFIG.defaultPermissions['chef_de_poste']);
        }
        
        // Par défaut, technicien standard
        return Permissions._normalize(CONFIG.defaultPermissions['technicien']);
    },
    
    // Obtenir les permissions actuelles d'un utilisateur sur le projet
    getCurrentUserPermissions: () => {
        if(state.currentRole === 'owner') {
            return CONFIG.defaultPermissions['owner'];
        }
        
        // Chercher l'utilisateur dans les membres du projet
        const userEmail = state.currentUser?.email;
        if(!userEmail) return CONFIG.defaultPermissions['technicien'];
        
        // Vérifier dans les permissions personnalisées du projet
        if(state.data?.memberPermissions?.[Utils.sanitizeEmail(userEmail)]) {
            return Permissions._normalize(state.data.memberPermissions[Utils.sanitizeEmail(userEmail)]);
        }
        
        // Chercher dans les comédiens
        const actor = state.data?.actors?.find(a => a.email === userEmail);
        if(actor) return Permissions._normalize(Permissions.getForMember(actor, 'actor'));
        
        // Chercher dans l'équipe
        const crew = state.data?.crew?.find(c => c.email === userEmail);
        if(crew) return Permissions._normalize(Permissions.getForMember(crew, 'crew'));
        
        // Par défaut selon le rôle ACL
        if(state.currentRole === 'editor') {
            return Permissions._normalize(CONFIG.defaultPermissions['chef_de_poste']);
        }
        
        return CONFIG.defaultPermissions['technicien'];
    },
    
    // v578 (cloisonnement) — LE SERVEUR FAIT FOI.
    // A l'ouverture du projet, la base renvoie sa propre carte des droits
    // (state.dataScope). Quand elle est la, on la croit ELLE et non plus le
    // calcul local : c'est la meme fonction SQL qui a decide quelles cles
    // envoyer. Sans cela le navigateur pourrait s'accorder un acces que le
    // serveur a refuse, et afficher un onglet vide en guise d'explication.
    // Repli sur le calcul local tant que dataScope n'existe pas (tableau de
    // bord, projet pas encore ouvert).
    serverLevel: (section) => {
        const sc = state.dataScope;
        if(!sc || !section) return null;
        return sc[section] || null;
    },

    // Vérifier si l'utilisateur peut accéder à une section
    canAccess: (section) => {
        if(state.currentRole === 'owner') return true;
        const lvl = Permissions.serverLevel(section);
        if(lvl) return lvl !== 'none';
        const perms = Permissions.getCurrentUserPermissions();
        return perms[section] && perms[section] !== 'none';
    },
    
    // Vérifier si l'utilisateur peut modifier une section
    canEdit: (section) => {
        if(state.currentRole === 'owner') return true;
        const lvl = Permissions.serverLevel(section);
        if(lvl) return lvl === 'write';
        const perms = Permissions.getCurrentUserPermissions();
        return perms[section] === 'write';
    },
    
    // ============================================================
    // ===== DROITS PAR FAMILLE DE FICHE (26 aout) =====
    // ============================================================
    // UNE FICHE APPARTIENT A SON ONGLET D'ORIGINE, OU QU'ON L'OUVRE.
    // Le depouillement, la toile et la feuille de service sont des CHEMINS vers
    // elle, pas des proprietaires : ils ne changent pas ses droits. Le droit a
    // appliquer est toujours celui de sa section d'origine — « comediens » pour
    // un comedien, meme quand on arrive du depouillement.
    // Avant cette table, une seule fenetre sur sept consultait le droit de sa
    // section (celle des techniciens) ; les six autres ne regardaient que le
    // role global. Un collaborateur en lecture seule sur Comediens pouvait donc
    // ouvrir la fiche depuis le depouillement et y ecrire pour de bon.
    FICHE_SECTION: {
        character: 'personnages', actor: 'comediens', crew: 'equipe',
        location: 'lieux', resource: 'ressources', org: 'equipe',
        vehicle: 'equipe', scene: 'sequencier', day: 'planning',
        expense: 'depenses', shot: 'storyboard'
    },
    sectionOfFiche: (kind) => Permissions.FICHE_SECTION[kind] || null,
    // Ai-je le droit de VOIR cette fiche ?
    canOpenFiche: (kind) => {
        if(state.currentRole === 'owner') return true;
        const s = Permissions.sectionOfFiche(kind);
        if(!s) return true;
        return Permissions.canAccess(s);
    },
    // Ai-je le droit d'y ECRIRE ? Verifie a l'ouverture (pour griser les champs)
    // ET dans les fonctions d'enregistrement : un champ grise n'est qu'un
    // affichage, tant que l'ecriture ne verifie rien le droit n'existe pas.
    canEditFiche: (kind) => {
        if(state.currentRole === 'owner') return true;
        if(state.currentRole === 'viewer') return false;
        const s = Permissions.sectionOfFiche(kind);
        if(!s) return true;
        return Permissions.canEdit(s);
    },

    // ============================================================
    // ===== MODALE & UI DE GESTION DES PERMISSIONS =====
    // ============================================================
    // Ouvrir le modal de gestion des permissions
    openModal: () => {
        if(state.currentRole !== 'owner') {
            Utils.toast('Seul le propriétaire peut gérer les accès.', 'error');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'permissions-modal';
        modal.id = 'permissions-modal';
        modal.onclick = (e) => { if(e.target === modal) Permissions.closeModal(); };
        
        modal.innerHTML = `
            <div class="permissions-container">
                <div class="permissions-header">
                    <h2>🔐 Gérer les accès au projet</h2>
                    <button onclick="app.Permissions.closeModal()" class="icon-btn">✖</button>
                </div>
                <div class="permissions-body">
                    <p class="text-sec-mb20">
                        Définissez les permissions pour chaque membre du projet. Les permissions par défaut sont basées sur le rôle de chacun.
                    </p>
                    
                    <div class="perm-tabs" style="display:flex; gap:4px; border-bottom:1px solid var(--border); margin-bottom:16px;">
                        <button id="perm-tabbtn-actors" onclick="app.Permissions.switchTab('actors')" style="padding:10px 16px; background:none; border:none; border-bottom:3px solid var(--primary); color:var(--text-main); font-weight:600; cursor:pointer; font-size:0.95rem;">🎭 Comédien·nes</button>
                        <button id="perm-tabbtn-crew" onclick="app.Permissions.switchTab('crew')" style="padding:10px 16px; background:none; border:none; border-bottom:3px solid transparent; color:var(--text-sec); font-weight:400; cursor:pointer; font-size:0.95rem;">🎥 Équipe technique</button>
                        <button id="perm-tabbtn-invites" onclick="app.Permissions.switchTab('invites')" style="padding:10px 16px; background:none; border:none; border-bottom:3px solid transparent; color:var(--text-sec); font-weight:400; cursor:pointer; font-size:0.95rem;">📨 Invités</button>
                    </div>

                    <div class="perm-tab-pane" id="perm-tab-actors">
                        <div id="perm-actors-table"></div>
                    </div>
                    
                    <div class="perm-tab-pane" id="perm-tab-crew" style="display:none;">
                        <div id="perm-crew-table"></div>
                    </div>

                    <div class="perm-tab-pane" id="perm-tab-invites" style="display:none;">
                        <div id="perm-invites-table"><p style="color:var(--text-sec); font-style:italic;">(Liste des invités — à venir)</p></div>
                    </div>
                    
                    <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px;">
                        <button onclick="app.Permissions.closeModal()" style="padding:10px 20px; background:var(--bg); border:1px solid var(--border); border-radius:6px; cursor:pointer;">Fermer</button>
                        <button onclick="app.Permissions.saveAll()" style="padding:10px 20px; background:var(--success); color:white; border:none; border-radius:6px; cursor:pointer;">💾 Sauvegarder</button>
                    </div>
                </div>
            </div>
        `;
        
        // v601 — UNE SEULE FENETRE A LA FOIS. Rien n'enlevait l'ancienne avant
        // d'en poser une nouvelle : deux clics sur le menu en laissaient DEUX
        // dans la page, invisibles l'une derriere l'autre. Et la sauvegarde
        // ramassait les cases des DEUX — celles de la fenetre morte, restees
        // sur les anciennes valeurs, ecrasaient celles qu'on venait de regler.
        document.querySelectorAll('#permissions-modal, .permissions-modal').forEach(v => v.remove());
        document.body.appendChild(modal);
        Permissions.renderTables();
    },
    
    // A taper dans la console, fenetre des acces OUVERTE : dit ce que la
    // sauvegarde verrait si on cliquait Enregistrer a cet instant.
    etat: () => {
        const toutes = document.querySelectorAll('#permissions-modal, .permissions-modal');
        const f = document.getElementById('permissions-modal');
        const cases = f ? [...f.querySelectorAll('.permissions-table select[data-email]')] : [];
        const dansToutLeDocument = document.querySelectorAll('.permissions-table select[data-email]').length;
        return {
            fenetres_ouvertes: toutes.length,
            cases_dans_la_fenetre: cases.length,
            cases_dans_toute_la_page: dansToutLeDocument,
            lignes: new Set(cases.map(c => c.dataset.email)).size,
            identique_a_l_enregistre: (() => {
                const m = {};
                cases.forEach(c => { (m[c.dataset.email] = m[c.dataset.email] || {})[c.dataset.section] = c.value; });
                return JSON.stringify(m) === JSON.stringify(state.data.memberPermissions || {});
            })()
        };
    },

    closeModal: () => {
        const modal = document.getElementById('permissions-modal');
        if(modal) modal.remove();
    },

    switchTab: (tab) => {
        ['actors','crew','invites'].forEach(t => {
            const pane = document.getElementById('perm-tab-' + t);
            if(pane) pane.style.display = (t === tab) ? '' : 'none';
            const btn = document.getElementById('perm-tabbtn-' + t);
            if(btn) {
                const active = (t === tab);
                btn.style.borderBottom = active ? '3px solid var(--primary)' : '3px solid transparent';
                btn.style.color = active ? 'var(--text-main)' : 'var(--text-sec)';
                btn.style.fontWeight = active ? '600' : '400';
            }
        });
    },
    
    renderTables: async () => {
        let _members = [];
        try {
            const { data, error } = await supabase.from('project_members').select('id, email, profile_id, role, status').eq('project_id', state.currentProjectId);
            if(error) console.error('renderTables members:', error);
            _members = data || [];
        } catch(e) { console.error('renderTables members:', e); }
        const _accessEmails = new Set(_members.map(m => (m.email || '').toLowerCase()).filter(Boolean));
        const _ownerEmails = new Set(_members.filter(m => m.role === 'owner').map(m => (m.email || '').toLowerCase()));
        const _pendingEmails = new Set(_members.filter(m => m.status === 'pending').map(m => (m.email || '').toLowerCase()));
        const _opts = { revoke: true, accessEmails: _accessEmails,
                        ownerEmails: _ownerEmails, pendingEmails: _pendingEmails };

        // Table des comédiens
        const actorsDiv = document.getElementById('perm-actors-table');
        if(actorsDiv) {
            if(!state.data.actors || state.data.actors.length === 0) {
                actorsDiv.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Aucun comédien dans le projet</p>';
            } else {
                actorsDiv.innerHTML = Permissions.buildTable(state.data.actors, 'actor', _opts);
            }
        }
        
        // Table de l'équipe
        const crewDiv = document.getElementById('perm-crew-table');
        if(crewDiv) {
            if(!state.data.crew || state.data.crew.length === 0) {
                crewDiv.innerHTML = '<p style="color:var(--text-sec); font-style:italic;">Aucun technicien dans le projet</p>';
            } else {
                crewDiv.innerHTML = Permissions.buildTable(state.data.crew, 'crew', _opts);
            }
        }

        // Table des invités (asynchrone : project_members)
        Permissions.renderInvitesTable(_members, _opts);
    },
    
    buildTable: (members, type, options = {}) => {
        const sections = CONFIG.permissionSections;
        
        let html = `<div style="overflow-x:auto; padding-top: 10px;"><table class="permissions-table">
            <thead>
                <tr>
                    <th style="min-width:180px; height: 140px; vertical-align: bottom;">Membre</th>
                    <th style="height: 140px; vertical-align: bottom;">Preset</th>
                    ${sections.map(s => {
                        // Sépare l'emoji initial du texte (si label commence par un emoji)
                        const label = s.label || '';
                        const match = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\S+)\s+(.+)$/u);
                        const emoji = match ? match[1] : '';
                        const text = match ? match[2] : label;
                        return `<th class="rotated-header" title="${Utils.escape(label)}">
                            <span class="rotated-header-inner">
                                ${Utils.escape(text)}
                            </span>
                        </th>`;
                    }).join('')}

                    ${options.revoke ? '<th style="height:140px; vertical-align:bottom;">Action</th>' : ''}
                </tr>
            </thead>
            <tbody>`;
        
        members.forEach((member, idx) => {
            // v601 — JAMAIS LE RANG COMME CLEF. Une fiche sans adresse prenait
            // « crew_3 » : son RANG dans la liste. Reordonner l'equipe aurait
            // decale les droits de tout le monde, en silence. On prend
            // l'identifiant de la fiche, qui ne bouge pas.
            // (Une fiche sans adresse ne peut de toute facon pas etre invitee :
            // sa ligne ne sert a personne. Mais une clef qui se deplace est un
            // piege qu'on ne veut pas laisser derriere soi — et il ne coutait
            // qu'une ligne a retirer. Verifie en base le 21 septembre : aucune
            // clef positionnelle n'existait encore, la correction est donc
            // purement preventive, sans rien a reprendre.)
            const emailKey = member.email ? Utils.sanitizeEmail(member.email)
                           : (member.id ? type + ':' + member.id : `${type}_${idx}`);
            // v570 : la cle est une adresse assainie ; on garde l'adresse reelle pour
            // pouvoir ecrire le role deduit dans project_members a la sauvegarde.
            if(member.email) Permissions._emailByKey[emailKey] = member.email;
            const currentPerms = state.data.memberPermissions?.[emailKey] || Permissions.getForMember(member, type);
            const photoHTML = member.photo ? `<img src="${Utils.safeMediaUrl(member.photo)}" alt="Photo du membre de l'équipe">` : '👤';
            // v570 : le libellé du rôle passe par Permissions._roleCell (sélecteur pour les invités).
            
            html += `<tr>
                <td>
                    <div class="permissions-user-info">
                        <div class="permissions-user-photo">${photoHTML}</div>
                        <div>
                            <div class="permissions-user-name">${Utils.escape(member.name)}</div>
                            <div class="permissions-user-role">${Permissions._roleCell(member, type, emailKey)}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <select class="perm-select" onchange="app.Permissions.applyPreset('${emailKey}', '${type}', ${idx}, this.value)">
                        <option value="">Personnalisé</option>
                        <option value="__viewer">👁️ Lecteur (tout)</option>
                        <option value="__editor">✏️ Éditeur (tout)</option>
                        <option value="__guest">🚪 Invité restreint</option>
                        <option value="comedien" ${type === 'actor' ? 'selected' : ''}>Comédien</option>
                        <option value="technicien">Technicien</option>
                        <option value="chef_de_poste">Chef de poste</option>
                        <option value="Scripte">Scripte</option>
                        <option value="1er·ère assistant·e réalisateur·rice">1er Assistant Réal</option>
                        <option value="Directeur·rice de casting">Dir. Casting</option>
                        <option value="Réalisateur·rice">Réalisateur</option>
                        <option value="Producteur·rice">Producteur</option>
                    </select>
                </td>
                ${sections.map(s => `
                    <td class="rotated-cell">
                        <select class="perm-select" id="perm-${type}-${idx}-${emailKey}-${s.id}" data-email="${emailKey}" data-section="${s.id}" title="${Utils.escape(s.label)}" onchange="app.Permissions.surChangement('${emailKey}', '${s.id}', this.value)">
                            <option value="none" ${currentPerms[s.id] === 'none' ? 'selected' : ''}>❌</option>
                            <option value="read" ${currentPerms[s.id] === 'read' ? 'selected' : ''}>👁️</option>
                            <option value="write" ${currentPerms[s.id] === 'write' ? 'selected' : ''}>✏️</option>
                        </select>
                    </td>
                `).join('')}

                ${options.revoke ? `<td style="text-align:center; vertical-align:middle;">${ (member.email && options.accessEmails && options.accessEmails.has((member.email || '').toLowerCase()) && (member.email || '').toLowerCase() !== (state.currentUser?.email || '').toLowerCase()) ? `<button onclick="app.Permissions.revokeAccess(${Utils.jsArg(member.email)})" style="padding:4px 10px; background:var(--danger,#dc2626); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">Révoquer</button>` : '' }</td>` : ''}
            </tr>`;
        });
        
        html += '</tbody></table></div>';
        
        // Légende
        html += `<div style="margin-top:10px; font-size:0.8rem; color:var(--text-sec);">
            <span style="margin-right:15px;">❌ Aucun accès</span>
            <span style="margin-right:15px;">👁️ Lecture seule</span>
            <span style="margin-right:15px;">✏️ Modification</span>
            <span style="margin-right:15px;">Le rôle se déduit de la ligne : au moins une ✏️ = Éditeur, sinon Lecture seule.</span>

        </div>`;
        
        return html;
    },
    
    applyPreset: (emailKey, type, idx, preset) => {
        if(!preset) return;
        
        // v570 : les trois presets de role remplissent la ligne entiere.
        const rp = Permissions.ROLE_PRESETS[preset];
        const brut = rp ? Permissions._rolePresetPerms(rp.mode) : CONFIG.defaultPermissions[preset];
        if(!brut) return;
        // v601 — UN PRESET NE DOIT PAS FERMER CE QU'IL NE CONNAIT PAS. Les
        // presets de METIER (comedien, technicien, chef de poste, et les douze
        // intitules) ont ete ecrits avant six sections du tableau :
        // presentation, moodboard, ressources, rapports de script, depenses,
        // contrats. Elles n'y figurent donc pas — et la ligne les remplissait a
        // « aucun acces ». Choisir « Comedien » RETIRAIT six acces sans le dire.
        // _normalize applique la regle que le reste de l'application suit deja :
        // une section absente vaut LECTURE, jamais blocage. Ajouter une section
        // au tableau demain ne refermera donc rien derriere nous.
        const perms = Permissions._normalize(brut);
        
        // v601 : par DONNEE, pour couvrir les deux lignes d'une meme personne.
        // Par identifiant, on n'en servait qu'une — et l'autre reecrivait tout.
        CONFIG.permissionSections.forEach(s => {
            Permissions._lignesDe(emailKey)
                .filter(sel => sel.dataset.section === s.id)
                .forEach(sel => { sel.value = perms[s.id] || 'none'; });
        });
        Permissions._refreshDerived(emailKey);
    },

    // ======================================================================
    //  UNE PERSONNE PEUT AVOIR DEUX LIGNES — ET UN SEUL JEU DE DROITS (v601)
    // ======================================================================
    //  Mesure sur un vrai projet : la meme adresse figurait a la fois dans les
    //  COMEDIENS et dans l'EQUIPE, et une autre revenait SEPT fois en figuration.
    //  Or les droits se rangent par ADRESSE, pas par ligne : deux lignes, une
    //  seule entree. La sauvegarde ecrivait case par case en parcourant la page,
    //  donc la DERNIERE ligne lue gagnait — celle qu'on n'avait pas touchee.
    //  On reglait une case, on enregistrait, et la ligne jumelle restee sur
    //  l'ancienne valeur la reecrivait a l'identique. Rien ne changeait en base,
    //  et l'ecran annoncait « enregistre ».
    //  LA REGLE : un changement se pose sur TOUTES les lignes de la personne.
    //  Peu importe alors laquelle est lue en dernier, elles disent la meme chose.
    surChangement: (emailKey, section, valeur) => {
        try {
            const fenetre = document.getElementById('permissions-modal') || document;
            fenetre.querySelectorAll('select[data-email="' + CSS.escape(emailKey) + '"][data-section="' + CSS.escape(section) + '"]')
                   .forEach(sel => { if(sel.value !== valeur) sel.value = valeur; });
        } catch(e) { console.warn('[Permissions] propagation :', e && e.message); }
        Permissions._refreshDerived(emailKey);
    },

    // Toutes les lignes d'une personne (elle peut en avoir plusieurs).
    _lignesDe: (emailKey) => {
        const fenetre = document.getElementById('permissions-modal') || document;
        try { return [...fenetre.querySelectorAll('select[data-email="' + CSS.escape(emailKey) + '"]')]; }
        catch(e) { return []; }
    },

    // Met a jour l'etiquette de role deduite d'une ligne, sans attendre la sauvegarde.
    _refreshDerived: (emailKey) => {
        const fenetre = document.getElementById('permissions-modal') || document;
        let cellules = [];
        try { cellules = [...fenetre.querySelectorAll('[data-derived="' + CSS.escape(emailKey) + '"]')]; } catch(e) { return; }
        if(!cellules.length) return;
        const perms = {};
        Permissions._lignesDe(emailKey).forEach(sel => { perms[sel.dataset.section] = sel.value; });
        const r = Permissions._deriveRole(perms);
        cellules.forEach(cell => {
            cell.textContent = (r === 'editor') ? '✏️ Éditeur' : '👁️ Lecture seule';
            cell.title = 'Rôle déduit des cases de cette personne : au moins une ✏️ donne Éditeur.';
        });
    },
    
    saveAll: async () => {
        if(!state.data.memberPermissions) {
            state.data.memberPermissions = {};
        }
        
        // v601 — ON NE LIT QUE LA FENETRE OUVERTE, pas « toutes les cases de la
        // page ». Chercher dans le document entier, c'est ramasser aussi celles
        // d'une fenetre restee derriere, dont les valeurs sont perimees — et
        // comme on ecrit case par case, c'est la DERNIERE lue qui gagne.
        const fenetre = document.getElementById('permissions-modal');
        if(!fenetre) { Utils.toast('La fenêtre des accès n\'est plus ouverte : rien n\'a été enregistré.', 'error', 8000); return; }
        const allSelects = fenetre.querySelectorAll('.permissions-table select[data-email]');
        if(!allSelects.length) {
            Utils.toast('Aucune case de droits n\'a pu être lue : rien n\'a été enregistré.', 'error', 8000);
            console.error('[Permissions] aucun select[data-email] dans la fenêtre — tableau non rendu ?');
            return;
        }
        const permsByEmail = {};
        
        // v601 — DEUX LIGNES POUR UNE MEME PERSONNE NE DOIVENT PLUS S'ANNULER.
        // Les droits se rangent par ADRESSE ; une personne inscrite a la fois
        // chez les comediens et dans l'equipe a DEUX lignes pour UNE entree. On
        // ecrivait case par case en parcourant la page : la derniere ligne lue
        // gagnait, y compris quand c'etait la jumelle qu'on n'avait pas touchee.
        // Les deux lignes sont normalement tenues en phase par surChangement ;
        // ce filet-ci couvre le cas ou elles divergeraient quand meme — la
        // valeur qui DIFFERE de l'enregistre est forcement celle qu'on vient de
        // regler, l'autre n'etant qu'une copie de ce qui est deja en base.
        const dejaEnBase = state.data.memberPermissions || {};
        const divergences = [];
        allSelects.forEach(select => {
            const email = select.dataset.email;
            const section = select.dataset.section;
            if(!permsByEmail[email]) permsByEmail[email] = {};
            const dejaLu = permsByEmail[email][section];
            if(dejaLu !== undefined && dejaLu !== select.value) {
                divergences.push(email + '/' + section);
                const ancien = (dejaEnBase[email] || {})[section];
                // On garde celle qui n'est PAS la valeur enregistree.
                permsByEmail[email][section] = (dejaLu !== ancien) ? dejaLu : select.value;
                return;
            }
            permsByEmail[email][section] = select.value;
        });
        if(divergences.length) {
            console.warn('[Permissions] lignes en double desaccordees, on garde la valeur modifiee :', divergences.join(', '));
        }
        
        // Ajouter les permissions de chat par défaut
        Object.keys(permsByEmail).forEach(email => {
            permsByEmail[email].chat_general = 'write';
            permsByEmail[email].chat_chefs = permsByEmail[email].scenario === 'write' ? 'write' : 'none';
            permsByEmail[email].chat_technique = permsByEmail[email].depouillement !== 'none' ? 'write' : 'none';
            permsByEmail[email].chat_comediens = permsByEmail[email].comediens !== 'none' ? 'write' : 'none';
        });
        
        // v601 — ON NE DIT PLUS « ENREGISTRE » QUAND RIEN N'A BOUGE. C'est ce
        // qui a coute trois allers-retours : l'ecran annoncait la reussite, la
        // base ne changeait pas d'un caractere, et on cherchait le defaut du
        // cote de la sauvegarde alors que les cases lues etaient deja les
        // anciennes. Si le tableau rend exactement ce qui est deja enregistre,
        // il faut le DIRE — c'est une information, pas une panne.
        const avant = JSON.stringify(state.data.memberPermissions || {});
        const apres = JSON.stringify(permsByEmail);
        if(avant === apres) {
            Utils.toast('Aucun changement à enregistrer : le tableau affiche déjà ce qui est enregistré.', 'info', 7000);
            console.warn('[Permissions] tableau identique a l\'enregistrement — ' + allSelects.length + ' cases lues.');
            return;
        }
        state.data.memberPermissions = permsByEmail;
        
        // v570 — LE ROLE SE DEDUIT DES CASES. Au moins une ✏️ = editeur en base, sinon
        // lecteur. C'est ce qui rend les deux reglages impossibles a contredire : plus
        // besoin de penser au role, il suit. Ne concerne que les vrais membres du projet.
        let rolesChanges = 0;
        try {
            const { data: membres, error: errMembres } = await supabase
                .from('project_members')
                .select('id, email, role')
                .eq('project_id', state.currentProjectId);
            if(errMembres) console.warn('[Permissions] déduction du rôle:', errMembres);
            for(const m of (membres || [])) {
                if(m.role === 'owner') continue;
                const key = Utils.sanitizeEmail(m.email || '');
                const p = permsByEmail[key];
                if(!p) continue; // personne sans ligne dans le tableau : on ne touche a rien
                const voulu = Permissions._deriveRole(p);
                if(voulu === m.role) continue;
                const { error } = await supabase.from('project_members').update({ role: voulu }).eq('id', m.id);
                if(!error) rolesChanges++;
            }
        } catch(e) { console.warn('[Permissions] mise à jour des rôles:', e && e.message); }
        
        try {
            // v601 : on ne dit « enregistre » que si ca l'est. La sauvegarde
            // pouvait refuser en silence (mode fiche moteur reste coince) et
            // l'ecran annoncait quand meme la reussite — c'est ce qui a ete
            // signale le 21 septembre.
            if(await Store.save() === false) {
                Utils.toast('Enregistrement impossible pour le moment. Rechargez la page et réessayez.', 'error', 8000);
                return;
            }
            // v570 : les ❌ font disparaitre des onglets — reconstruire la navigation
            // pour que le proprietaire voie l'effet, et surtout pour l'auto-attribution.
            try { UIHidden.applyHiddenTabs(); UIHidden.applyHiddenCategories(); } catch(e) {}
            const memberCount = Object.keys(permsByEmail).length;
            History.log('PERMISSIONS', `Permissions modifiées pour ${memberCount} membre${memberCount > 1 ? 's' : ''}`);
            Utils.toast('Permissions sauvegardées !' + (rolesChanges > 0
                ? ' ' + rolesChanges + ' rôle(s) mis à jour — les personnes concernées doivent rouvrir le projet.'
                : ''), 'success', rolesChanges > 0 ? 7000 : 3000);
            Permissions.closeModal();
        } catch(e) {
            console.error('Erreur sauvegarde permissions:', e);
            Utils.toast('Erreur lors de la sauvegarde', 'error');
        }
    },
    
    };
