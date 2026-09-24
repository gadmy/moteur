
// --- MODULE INVITATIONS V84 ---
const Invitations = {
    // ===================== VÉRIFICATION & PROFILS =====================
    // Vérifie si l'email existe déjà dans Supabase
    checkEmail: async (email) => {
        const statusEl = document.getElementById('share-email-status');
        const messageSection = document.getElementById('share-message-section');
        if(!statusEl || !messageSection) return;

        const saisi = (email || '').trim().toLowerCase();
        if(!saisi || !saisi.includes('@')) {
            statusEl.style.display = 'none';
            messageSection.style.display = 'none';
            return;
        }

        // v570 — CORRECTION : cette fonction interrogeait la base avec l'adresse de
        // L'UTILISATEUR COURANT au lieu de celle qu'on saisit, puis appelait
        // profileSnap.exists(), methode inexistante heritee de l'epoque Firebase.
        // Elle levait donc une exception a tous les coups et le bandeau ne
        // s'affichait jamais. On interroge owner_email, seule cle fiable d'un compte.
        try {
            // v602 : par la fonction serveur (les profils prives ne se lisent
            // plus en direct). owner_email n'est rendu que s'il correspond.
            const { data: profils, error } = await supabase.rpc('profils_minimaux', { p_emails: [saisi], p_ids: null });
            if(error) throw error;

            const compteExiste = !!(profils && profils.some(p => p.owner_email));
            statusEl.style.display = 'block';
            if(compteExiste) {
                statusEl.innerHTML = '✅ <strong>Utilisateur existant</strong> — l\'invitation l\'attendra sur son tableau de bord';
                statusEl.style.background = 'rgba(40,167,69,0.1)';
                statusEl.style.color = 'var(--success)';
            } else {
                statusEl.innerHTML = '📧 <strong>Nouvel utilisateur</strong> — un e-mail l\'invitera à créer son compte';
                statusEl.style.background = 'rgba(43,110,246,0.1)';
                statusEl.style.color = 'var(--primary)';
            }
            // Le message personnalise part dans l'e-mail : utile dans les deux cas.
            messageSection.style.display = 'block';
        } catch(e) {
            console.warn('[Invitations] checkEmail:', e && e.message);
            statusEl.style.display = 'none';
            messageSection.style.display = 'block';
        }
    },
    
    // Envoie l'invitation
    // I5f: charge dynamiquement les profils publics de l'email saisi
    loadTargetProfiles: async (emailInput) => {
        const email = (emailInput || '').trim().toLowerCase();
        const section = document.getElementById('share-target-profile-section');
        const select = document.getElementById('share-target-profile');
        if(!section || !select) return;
        
        // Si email invalide ou vide, on masque la section
        if(!email || !email.includes('@') || email.length < 5) {
            section.style.display = 'none';
            select.innerHTML = '<option value="">-- Choisir un profil --</option>';
            return;
        }
        
        // Charger les profils publics liés à cet email
        try {
            // v602 : par la fonction serveur, en ne gardant que les profils
            // dont le COMPTE est cette adresse (owner_email).
            const { data: trouves, error } = await supabase.rpc('profils_minimaux', { p_emails: [email], p_ids: null });
            const profiles = (trouves || []).filter(p => p.owner_email);
            
            if(error || !profiles || profiles.length === 0) {
                // Aucun profil trouvé : on masque, l'invitation partira sans to_profile_id
                section.style.display = 'none';
                select.innerHTML = '<option value="">-- Aucun profil public pour cet email --</option>';
                return;
            }
            
            // Remplir le select avec les profils trouvés
            let html = '';
            if(profiles.length > 1) {
                html += '<option value="">-- Choisir un profil --</option>';
            }
            profiles.forEach(p => {
                const icon = p.profile_type === 'actor' ? '🎭' 
                           : p.profile_type === 'crew' ? '🎥' 
                           : p.profile_type === 'association' ? '🏛️' 
                           : p.profile_type === 'enterprise' ? '🏢' 
                           : '👤';
                const displayName = p.name || '(sans nom)';
                html += `<option value="${p.id}">${icon} ${Utils.escape(displayName)}</option>`;
            });
            select.innerHTML = html;
            
            // Si un seul profil, pré-sélectionné automatiquement
            if(profiles.length === 1) {
                select.value = profiles[0].id;
            }
            
            section.style.display = 'block';
        } catch(e) {
            console.warn('Erreur chargement profils destinataires:', e);
            section.style.display = 'none';
        }
    },
    
    // ===================== ENVOI D'INVITATION =====================
    // ==================================================================
    //  INVITER TOUTES LES FICHES QUI ONT UN E-MAIL (v601)
    // ==================================================================
    //  « Si on ne les a pas invites tout de suite, il faut pouvoir les
    //  inviter a un autre moment. »
    //  UNE FICHE SANS INVITATION EST UNE FICHE SANS PERSONNE : elle ne voit
    //  pas le projet, ne recoit pas les jours de tournage, et le desistement
    //  ne la concerne pas. Les inviter une par une quand l'equipe est faite,
    //  c'est trente fois la meme fenetre.
    //  EN LECTURE SEULE, ET CE N'EST PAS UN DETAIL : on invite d'un coup des
    //  gens qu'on n'a pas choisis un par un. Donner le droit de MODIFIER a
    //  tout le monde par un seul clic est le genre de geste qu'on regrette.
    //  Le role se releve ensuite, personne par personne.
    //  QU'ILS SOIENT DEJA SUR MOTEUR OU PAS : ceux qui ont un compte
    //  recoivent la cloche et un e-mail, les autres l'e-mail d'invitation a
    //  s'inscrire — c'est exactement ce que fait deja l'invitation unitaire.
    _emailValide: (e) => {
        const v = String(e || '').trim().toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : '';
    },
    //  Les gens du projet qui ont une adresse, sans doublon, moi exclu.
    fichesInvitables: () => {
        const moi = String((state.currentUser && state.currentUser.email) || '').toLowerCase();
        const vus = {}, out = [];
        const prendre = (espece, p) => {
            if(!p) return;
            const mail = Invitations._emailValide(p.email);
            if(!mail || mail === moi || vus[mail]) return;
            vus[mail] = 1;
            out.push({ email: mail, nom: p.name || mail, espece: espece, profilId: p.publicProfileId || null });
        };
        (state.data.actors || []).forEach(a => prendre('actor', a));
        (state.data.crew || []).forEach(c => prendre('crew', c));
        return out;
    },
    //  Ceux qui sont deja membres (acceptes OU en attente) n'ont rien a
    //  recevoir : reinviter quelqu'un qui n'a pas encore repondu, c'est le
    //  relancer sans le vouloir.
    ouvrirInvitationGroupee: async () => {
        if(!state.currentProjectId) return;
        if(state.currentRole !== 'owner') {
            Utils.toast('Seul le propriétaire du projet peut inviter en une fois.', 'warning', 6000);
            return;
        }
        const tous = Invitations.fichesInvitables();
        if(!tous.length) {
            Utils.toast('Aucune fiche du projet ne porte d’adresse e-mail. Renseignez-les dans les fiches comédiens et équipe.', 'info', 8000);
            return;
        }
        let deja = [];
        try {
            const { data } = await supabase.from('project_members').select('email')
                .eq('project_id', state.currentProjectId);
            deja = (data || []).map(m => String(m.email || '').toLowerCase());
        } catch(e) { console.warn('[Invitations] membres:', e && e.message); }
        const reste = tous.filter(p => deja.indexOf(p.email) < 0);
        if(!reste.length) {
            Utils.toast('Tout le monde a déjà été invité.', 'info', 6000);
            return;
        }
        const lignes = reste.map(p => '<label class="inv-ligne"><input type="checkbox" checked data-mail="'
            + Utils.escape(p.email) + '"><span><strong>' + (p.espece === 'actor' ? '🎭 ' : '🎬 ')
            + Utils.escape(p.nom) + '</strong><span>' + Utils.escape(p.email) + '</span></span></label>').join('');
        const ov = document.createElement('div');
        ov.className = 'confirm-modal-overlay';
        ov.id = 'inv-groupe-modal';
        ov.innerHTML = '<div class="confirm-modal-box" style="max-width:540px;">'
            + '<h3 style="margin:0 0 4px;">📧 Inviter les fiches du projet</h3>'
            + '<p style="margin:0 0 12px; font-size:.82rem; color:var(--text-sec);">'
              + reste.length + ' fiche' + (reste.length > 1 ? 's ont' : ' a') + ' une adresse e-mail et n’'
              + (reste.length > 1 ? 'ont' : 'a') + ' pas encore été invitée' + (reste.length > 1 ? 's' : '')
              + '. Elles recevront une invitation <strong>en lecture seule</strong> — vous pourrez relever le rôle ensuite, personne par personne.'
              + (deja.length ? '<br>' + deja.length + ' personne' + (deja.length > 1 ? 's sont' : ' est') + ' déjà invitée' + (deja.length > 1 ? 's' : '') + ' : elle' + (deja.length > 1 ? 's ne sont' : ' n’est') + ' pas relancée' + (deja.length > 1 ? 's' : '') + '.' : '')
              + '</p>'
            + '<div class="inv-liste">' + lignes + '</div>'
            + '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">'
              + '<button class="btn btn--secondary btn--sm" data-act="rien">Annuler</button>'
              + '<button class="btn btn--primary btn--sm" data-act="ok">Envoyer les invitations</button>'
            + '</div>'
        + '</div>';
        document.body.appendChild(ov);
        const fermer = () => { const m = document.getElementById('inv-groupe-modal'); if(m) m.remove(); };
        ov.addEventListener('click', async (e) => {
            const act = e.target && e.target.dataset ? e.target.dataset.act : null;
            if(e.target === ov || act === 'rien') { fermer(); return; }
            if(act !== 'ok') return;
            const choisis = [...ov.querySelectorAll('input[data-mail]:checked')].map(el => el.dataset.mail);
            const liste = reste.filter(p => choisis.indexOf(p.email) >= 0);
            fermer();
            if(!liste.length) { Utils.toast('Personne de sélectionné.', 'info'); return; }
            await Invitations.inviterEnLot(liste);
        });
    },
    inviterEnLot: async (liste) => {
        const pid = state.currentProjectId;
        const projectTitle = state.data.title || 'Sans titre';
        const inviterName = (state.currentUser.email || '').split('@')[0];
        Utils.toast('Envoi de ' + liste.length + ' invitation' + (liste.length > 1 ? 's' : '') + '…', 'info', 3000);
        let comptes = {};
        try {
            const { data } = await supabase.rpc('profils_minimaux', { p_emails: liste.map(p => p.email), p_ids: null });
            (data || []).forEach(u => { comptes[String(u.owner_email || '').toLowerCase()] = 1; });
        } catch(e) { console.warn('[Invitations] comptes:', e && e.message); }
        let ok = 0, rates = [];
        for(const p of liste) {
            try {
                const { error } = await supabase.from('project_members').insert({
                    project_id: pid, email: p.email, profile_id: p.profilId,
                    role: 'viewer', status: 'pending',
                    invited_by: state.currentUser.id, invited_at: new Date().toISOString()
                });
                if(error) throw error;
                ok++;
                if(comptes[p.email]) {
                    try { await Notifications.send(p.email, 'invite', inviterName + ' vous a invité(e) au projet « ' + projectTitle + ' »', pid); } catch(e) {}
                    try { await Messages.sendEmailPing(p.email, p.nom, 'invitation', { senderName: inviterName, projectTitle: projectTitle, role: 'Lecteur' }); } catch(e) {}
                } else {
                    try { await Invitations.sendEmail(p.email, projectTitle, 'viewer', inviterName, ''); } catch(e) {}
                }
            } catch(e) {
                console.warn('[Invitations] ' + p.email + ' :', e && e.message);
                rates.push(p.nom + ' (' + p.email + ')');
            }
        }
        try { History.log('SHARE', ok + ' invitation(s) envoyée(s) depuis les fiches du projet'); } catch(e) {}
        // ON DIT CE QUI N'EST PAS PARTI : un « c'est envoye » qui cache trois
        // echecs se paie au moment ou les gens ne repondent pas.
        if(rates.length) {
            Utils.toast(ok + ' invitation(s) envoyée(s). Échec pour : ' + rates.join(', ')
                + ' — réessayez depuis Partager.', 'warning', 12000);
        } else {
            Utils.toast(ok + ' invitation(s) envoyée(s) — en attente de leurs réponses.', 'success', 7000);
        }
    },

    sendInvitation: async () => {
        // Vérifier si l'email est dans la whitelist
        const email = document.getElementById('share-email')?.value?.trim()?.toLowerCase();
        
        if(!email || !email.includes('@')) {
            Utils.toast('Veuillez entrer un email valide.', 'warning');
            return;
        }
        
        // G5b: Vérifier le blocage badge noir
        if(state.currentUser?.email) {
            const check = await Moderation.canCommunicate(state.currentUser.email, email);
            if(!check.allowed) {
                Utils.toast(check.reason, 'warning', 6000);
                return;
            }
        }
        
        const role = document.getElementById('share-role').value;
        const message = document.getElementById('share-message')?.value?.trim() || '';
        
        // I5f: profil destinataire sélectionné (peut être vide si user sans profil public)
        const targetProfileId = document.getElementById('share-target-profile')?.value || null;
        
        // I5f: si plusieurs profils disponibles mais aucun choisi, bloquer
        const profileSection = document.getElementById('share-target-profile-section');
        const profileSelect = document.getElementById('share-target-profile');
        if(profileSection && profileSection.style.display === 'block' && profileSelect && profileSelect.options.length > 1 && !targetProfileId) {
            Utils.toast('Veuillez choisir quel profil de cette personne inviter.', 'warning');
            return;
        }
        
        if(!state.currentProjectId) return;
        
        const btn = document.getElementById('share-confirm-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Envoi...';
        btn.classList.add('btn-loading');
        
        // v570 : emailKey / fromProfileId / inviterEmail retirees — elles n'alimentaient
        // que l'insertion en double dans « messages », supprimee avec l'acceptation.
        const pid = state.currentProjectId;
        const projectTitle = state.data.title || 'Sans titre';
        const inviterName = state.currentUser.email.split('@')[0];
        
        try {
            // T10 fix : un user peut avoir plusieurs profils publics, chacun avec owner_email = son email.
            // On vérifie l'existence du compte via owner_email (et non la colonne email, devenue ambiguë).
            // v602 : par la fonction serveur (profils prives compris).
            const { data: trouvesEx, error: errExProf } = await supabase.rpc('profils_minimaux', { p_emails: [email.toLowerCase()], p_ids: null });
            if(errExProf) throw errExProf;
            const existingProfiles = (trouvesEx || []).filter(p => p.owner_email);
            
            const userExists = !!(existingProfiles && existingProfiles.length > 0);
            
            // Ajouter le membre par email + profil cible (même clé de lecture que getProjectsList).
            // On ne dépend pas d'une contrainte unique DB : on regarde d'abord si le membership existe,
            // puis on insère ou on met à jour.
            const { data: existingMember, error: errExMemb } = await supabase
                .from('project_members')
                .select('id')
                .eq('project_id', pid)
                .eq('email', email)
                .maybeSingle();
            if(errExMemb) throw errExMemb;
            
            if(existingMember) {
                // v570 : seul le proprietaire peut modifier une ligne existante (policy UPDATE).
                // Un delegue qui reinvite quelqu'un de deja present echouerait en silence.
                if(state.currentRole !== 'owner') {
                    Utils.toast('Cette personne fait déjà partie du projet ou a déjà été invitée. Seul le propriétaire peut changer son rôle.', 'warning', 6000);
                    return;
                }
                await supabase
                    .from('project_members')
                    .update({ role: role, profile_id: targetProfileId })
                    .eq('id', existingMember.id);
            } else {
                await supabase
                    .from('project_members')
                    .insert({
                        project_id: pid,
                        email: email, // clé de filtrage utilisée par getProjectsList
                        profile_id: targetProfileId, // I5f : profil cible (peut être null)
                        role: role,
                        status: 'pending', // v570 : consentement — la personne doit accepter
                        invited_by: state.currentUser.id,
                        invited_at: new Date().toISOString()
                    });
            }
            
            // v570 : plus de doublon dans « messages ». L'invitation en attente EST la ligne
            // project_members au statut 'pending' ; le tableau de bord la propose a l'acceptation.
            
            // Cloche in-app + email externe direct (plus de message interne)
            const roleLabel = role === 'editor' ? 'Éditeur' : 'Lecteur';
            try {
                if(userExists) await Notifications.send(email, 'invite', `${inviterName} vous a invité(e) au projet \"${projectTitle}\" en tant que ${roleLabel}`, pid);
            } catch(e) { console.warn('Notification invitation:', e); }
            
            // Envoyer un ping email
            if(!userExists) {
                await Invitations.sendEmail(email, projectTitle, role, inviterName, message);
            } else {
                await Messages.sendEmailPing(email, email.split('@')[0], 'invitation', {
                    senderName: inviterName,
                    projectTitle: projectTitle,
                    role: roleLabel
                });
            }
            
            const roleForLog = role === 'editor' ? 'Éditeur' : 'Lecteur';
            History.log('SHARE', `Invitation envoyée à ${email} (${roleForLog})`);
            Utils.toast(`Invitation envoyée à ${email} — en attente de sa réponse.`, 'success', 5000);
            
            document.getElementById('share-modal').style.display = 'none';
            document.getElementById('share-email').value = '';
            document.getElementById('share-message').value = '';
            document.getElementById('share-email-status').style.display = 'none';
            document.getElementById('share-message-section').style.display = 'none';
            // I5f: reset du sélecteur profil cible
            const tps = document.getElementById('share-target-profile-section');
            if(tps) tps.style.display = 'none';
            const tp = document.getElementById('share-target-profile');
            if(tp) tp.innerHTML = '<option value="">-- Choisir un profil --</option>';
            
        } catch(e) {
            Utils.toast('Erreur: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '📧 Inviter';
            btn.classList.remove('btn-loading');
        }
    },
    
    // Envoie l'email d'invitation via l'Edge Function (super-action)
    sendEmail: async (toEmail, projectTitle, role, inviterName, message) => {
        const safeToEmail = String(toEmail || '').trim();
        if(!safeToEmail) { console.warn('Email invalide - envoi ignoré'); return; }
        const safeRole = role === 'editor' ? 'Éditeur' : 'Lecteur';
        const safeProjectTitle = String(projectTitle || 'Projet').trim();
        const safeInviterName = String(inviterName || 'Un utilisateur').trim();

        try {
            const { error } = await supabase.functions.invoke('super-action', { body: {
                to: safeToEmail,
                toName: safeToEmail.split('@')[0] || 'Utilisateur',
                type: 'invitation',
                data: { senderName: safeInviterName, projectTitle: safeProjectTitle, role: safeRole }
            } });
            if(error) {
                console.error('Erreur envoi invitation:', error);
                Invitations.openMailto(toEmail, projectTitle, role, inviterName, message);
            }
        } catch(e) {
            console.error('Erreur envoi invitation:', e);
            Invitations.openMailto(toEmail, projectTitle, role, inviterName, message);
        }
    },
    
    // Ouvre le client mail en fallback
    openMailto: (toEmail, projectTitle, role, inviterName, message) => {
        const roleLabel = role === 'editor' ? 'Éditeur' : 'Lecteur';
        const subject = encodeURIComponent(`Invitation à collaborer sur "${projectTitle}" - Moteur`);
        const body = encodeURIComponent(
`Bonjour,

${inviterName} vous invite à collaborer sur le projet "${projectTitle}" en tant que ${roleLabel}.

${message ? 'Message: ' + message + '\n\n' : ''}Pour acceder au projet, creez votre compte gratuit sur Moteur :
${window.location.origin}${window.location.pathname}

À bientôt !`
        );
        window.open(`mailto:${toEmail}?subject=${subject}&body=${body}`, '_blank');
    },

    // ===================== INVITATIONS EN ATTENTE (v570) =====================
    // Une invitation en attente EST une ligne project_members au statut 'pending'.
    // Elle ne donne AUCUN acces : can_view_project / can_edit_project l'ignorent.
    // La personne invitee l'accepte (fonction serveur invitation_accept) ou la
    // refuse (suppression de sa propre ligne, deja autorisee par la policy DELETE).
    // La carte grisee apparait DANS la grille des projets, a la racine.
    _pending: [],

    // Charge mes invitations en attente (appelee par UIDashboard.renderProjectList).
    loadPending: async () => {
        if(!state.currentUser) { Invitations._pending = []; return []; }
        try {
            const { data, error } = await supabase.rpc('my_pending_invitations');
            if(error) throw error;
            Invitations._pending = data || [];
        } catch(e) {
            console.warn('[Invitations] Lecture des invitations en attente impossible:', e && e.message);
            Invitations._pending = [];
        }
        return Invitations._pending;
    },

    _roleLabel: (r) => (r === 'editor' ? 'Éditeur' : (r === 'owner' ? 'Propriétaire' : 'Lecteur')),

    // Construit la carte grisee d'une invitation (meme gabarit qu'une carte projet).
    buildCard: (inv) => {
        const card = document.createElement('div');
        card.className = 'project-card pinv-card';
        card.dataset.pinv = inv.project_id;
        const who = (inv.inviter_email || '').split('@')[0] || 'Quelqu\'un';
        const seriesBadge = (inv.project_type === 'series')
            ? `<div class="p-series-line"><span class="p-series-badge" title="Projet série">📺 ${inv.episode_count || 0} épisode${(inv.episode_count || 0) > 1 ? 's' : ''}</span></div>`
            : '';
        card.innerHTML = `<span class="p-role-badge pinv-badge">INVITATION</span>`
            + `<div><div class="p-title">${Utils.escape(inv.project_title || 'Projet sans titre')}</div>`
            + seriesBadge
            + `<div class="p-meta">${Utils.escape(who)} vous invite en tant que ${Invitations._roleLabel(inv.role)}</div>`
            + `<div class="pinv-hint">Survolez la carte pour découvrir le projet</div></div>`
            + `<div class="pinv-actions">`
            + `<button class="btn btn--primary btn--sm">Accepter</button>`
            + `<button class="select-outline">Refuser</button>`
            + `</div>`;
        const btns = card.querySelectorAll('.pinv-actions button');
        btns[0].onclick = (e) => { e.stopPropagation(); Invitations.hidePreview(); Invitations.accept(inv.project_id); };
        btns[1].onclick = (e) => { e.stopPropagation(); Invitations.hidePreview(); Invitations.refuse(inv.project_id); };
        // Survol (bureau) ET clic (tactile) : meme panneau d'apercu.
        card.addEventListener('mouseenter', () => Invitations.showPreview(card, inv));
        card.addEventListener('mouseleave', () => Invitations.hidePreview());
        card.addEventListener('click', (e) => {
            if(e.target.closest('.pinv-actions')) return;
            if(Invitations._previewFor === inv.project_id) Invitations.hidePreview();
            else Invitations.showPreview(card, inv);
        });
        return card;
    },

    // ——— Apercu de la fiche de presentation ———
    // Seule la fiche Presentation est exposee cote serveur (my_pending_invitations) :
    // ni casting, ni planning, ni budget, ni scenario. L'affiche n'est pas montree,
    // le stockage des images etant ferme aux non-membres.
    _previewEl: null,
    _previewFor: null,

    showPreview: (card, inv) => {
        Invitations.hidePreview();
        const p = inv.presentation || {};
        const tags = ['genre', 'format', 'duration', 'productionType']
            .map(k => (p[k] || '').trim()).filter(Boolean);
        const pitch = (p.description || '').trim();
        const synopsis = (p.synopsisShort || '').trim();
        let body = '';
        if(tags.length) body += `<div class="pinv-pv-tags">${tags.map(t => `<span class="pinv-pv-tag">${Utils.escape(t)}</span>`).join('')}</div>`;
        if(pitch) body += `<div class="pinv-pv-label">Présentation</div><div class="pinv-pv-block">${Utils.escape(pitch)}</div>`;
        if(synopsis) body += `<div class="pinv-pv-label">Synopsis</div><div class="pinv-pv-block">${Utils.escape(synopsis)}</div>`;
        if(!body) body = `<div class="pinv-pv-empty">La fiche de présentation de ce projet n'est pas encore remplie.</div>`;
        const el = document.createElement('div');
        el.className = 'pinv-preview';
        el.innerHTML = `<h4>${Utils.escape(inv.project_title || 'Projet sans titre')}</h4>`
            + `<div class="pinv-pv-sub">Invitation de ${Utils.escape((inv.inviter_email || '').split('@')[0] || 'quelqu\'un')}</div>`
            + body;
        el.addEventListener('mouseenter', () => clearTimeout(Invitations._hideT));
        el.addEventListener('mouseleave', () => Invitations.hidePreview());
        document.body.appendChild(el);
        // Positionnement : a droite de la carte si la place existe, sinon a gauche, sinon dessous.
        const r = card.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight;
        let left = r.right + 12;
        if(left + w > window.innerWidth - 12) left = r.left - w - 12;
        if(left < 12) left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
        let top = r.top;
        if(top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        Invitations._previewEl = el;
        Invitations._previewFor = inv.project_id;
    },

    _hideT: null,
    hidePreview: () => {
        clearTimeout(Invitations._hideT);
        if(Invitations._previewEl) { Invitations._previewEl.remove(); Invitations._previewEl = null; }
        Invitations._previewFor = null;
    },

    // Accepte : bascule ma ligne en 'accepted' cote serveur, puis rafraichit la grille.
    accept: async (projectId) => {
        if(!projectId || !state.currentUser) return;
        const inv = (Invitations._pending || []).find(i => i.project_id === projectId);
        try {
            const { error } = await supabase.rpc('invitation_accept', { p_project: projectId });
            if(error) throw error;
            Utils.toast('Invitation acceptée' + (inv && inv.project_title ? ' : ' + inv.project_title : '') + ' !', 'success');
        } catch(e) {
            Utils.toast('Impossible d\'accepter l\'invitation pour le moment.', 'error');
            console.warn('[Invitations] accept:', e && e.message);
            return;
        }
        try { if(typeof UIDashboard !== 'undefined') await UIDashboard.renderProjectList(); } catch(e) {}
    },

    // Refuse : supprime ma propre ligne (policy DELETE « owner or self »).
    refuse: async (projectId) => {
        if(!projectId || !state.currentUser) return;
        const inv = (Invitations._pending || []).find(i => i.project_id === projectId);
        const titre = (inv && inv.project_title) || 'ce projet';
        const ok = await ConfirmModal.show({
            title: 'Refuser l\'invitation ?',
            message: 'Vous n\'aurez pas accès à « ' + Utils.escape(titre) + ' ». La personne qui vous a invité pourra vous réinviter plus tard.',
            icon: '📭',
            confirmText: 'Refuser',
            dangerous: true
        });
        if(!ok) return;
        try {
            const { error } = await supabase
                .from('project_members')
                .delete()
                .eq('project_id', projectId)
                .eq('email', state.currentUser.email.toLowerCase());
            if(error) throw error;
            Utils.toast('Invitation refusée.', 'info');
        } catch(e) {
            Utils.toast('Impossible de refuser l\'invitation pour le moment.', 'error');
            console.warn('[Invitations] refuse:', e && e.message);
            return;
        }
        try { if(typeof UIDashboard !== 'undefined') await UIDashboard.renderProjectList(); } catch(e) {}
    }
};

  // === MODULE TUTORIEL & AIDE CONTEXTUELLE ===
  // ===================== VISITE GUIDEE (TOUR / ONBOARDING) =====================
  // Moteur generique de visites guidees multi-chapitres (spotlight + infobulle,
  // pilote par l'utilisateur). Chapitres dans Tour.chapters. API : start/next/prev/stop/goTo.
  // ============================================================
  // MODULE FEEDBACK — bulle « retour utilisateur »
  // ------------------------------------------------------------
  // Posee en bas a gauche, au-dessus du mini-chat quand celui-ci
  // est monte (classe body.has-minichat). Contrairement au mini-chat,
  // elle vit AUSSI sur le hub : un retour doit pouvoir partir de
  // n'importe ou, y compris quand aucun projet n'est ouvert.
  //
  // ENVOI DIFFERE — les remarques ne partent PAS a chaque clic.
  // Elles s'accumulent dans le navigateur, restent modifiables et
  // supprimables, et sont envoyees en UN SEUL message au premier
  // passage de minuit. Sans cela, dix utilisateurs actifs
  // produiraient des centaines de mails isoles et illisibles.
  //
  // CONSEQUENCE ASSUMEE : une remarque ecrite puis jamais suivie
  // d'une reouverture de l'application apres minuit ne part pas.
  // C'est le prix du stockage local, qui evite une table Supabase
  // et une migration.
  // ============================================================