
const AdminEmail = {
    updateEmailFilter: async () => {
        if(Admin.allUsers.length === 0) {
            await Admin.loadUsers();
        }
        
        const filters = {
            testOnly: document.getElementById('filter-test-only')?.checked,
            allUsers: document.getElementById('filter-all-users')?.checked,
            incompleteProfile: document.getElementById('filter-incomplete-profile')?.checked,
            noPublicProfile: document.getElementById('filter-no-public-profile')?.checked,
            noProject: document.getElementById('filter-no-project')?.checked,
            inactiveProject: document.getElementById('filter-inactive-project')?.checked,
            newUsers: document.getElementById('filter-new-users')?.checked,
            inactiveUsers: document.getElementById('filter-inactive-users')?.checked,
            typeActor: document.getElementById('filter-type-actor')?.checked,
            typeCrew: document.getElementById('filter-type-crew')?.checked,
            typeAssociation: document.getElementById('filter-type-association')?.checked,
            typeEnterprise: document.getElementById('filter-type-enterprise')?.checked
        };
        
        const now = new Date();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        
        // Charger les projets pour les filtres liés aux projets
        let userProjects = {};
        if(filters.noProject || filters.inactiveProject) {
            try {
                const { data: projects, error: errFiltProj } = await supabase.from('projects').select('owner_email, updated_at').is('deleted_at', null);
                if(errFiltProj) console.error('[Admin] emailing projets:', errFiltProj);
                projects?.forEach(p => {
                    if(!userProjects[p.owner_email]) userProjects[p.owner_email] = [];
                    userProjects[p.owner_email].push(p);
                });
            } catch(e) { console.error(e); }
        }
        
        Admin.emailRecipients = Admin.allUsers.filter(user => {
            // 🧪 Mode test : uniquement le compte de test, ignore tout le reste
            if(filters.testOnly) {
                return (user.email || '').toLowerCase() === 'ga.dmy@ikmail.com';
            }
            // 📣 Tous les utilisateurs : ignore les autres filtres (comptes internes exclus)
            if(filters.allUsers) {
                return !CONFIG.internalEmails.includes((user.email || '').toLowerCase());
            }
            // Vraies casquettes (facettes) — l'ancien champ profile_data n'existe pas sur user_profiles
            const pdata = user.data || {};
            const facets = PublicProfile._normalizeFacets(pdata.facets || user.facets, user);
            const email = user.email?.toLowerCase();
            const createdAt = new Date(user.created_at);
            const updatedAt = new Date(user.updated_at || user.created_at);
            
            // Complétion du profil : champs remplis du JSON de profil
            const filledFields = Object.values(pdata).filter(v => v && v !== '' && v !== false);
            const profileCompletion = Math.min(100, filledFields.length * 10);
            // Public si au moins une casquette activée ET visible
            const hasPublicProfile = PublicProfile.FACET_KEYS.some(k => k === 'crew' ? PublicProfile.crewArr(facets).some(f => f && f.enabled && f.visible !== false) : (facets[k].enabled && facets[k].visible !== false));
            
            // Appliquer les filtres
            let matches = true;
            
            if(filters.incompleteProfile && profileCompletion >= 50) matches = false;
            if(filters.noPublicProfile && hasPublicProfile) matches = false;
            if(filters.noProject && userProjects[email]?.length > 0) matches = false;
            if(filters.inactiveProject) {
                const projects = userProjects[email] || [];
                const hasInactive = projects.some(p => new Date(p.updated_at) < thirtyDaysAgo);
                if(!hasInactive) matches = false;
            }
            if(filters.newUsers && createdAt < sevenDaysAgo) matches = false;
            if(filters.inactiveUsers && updatedAt > thirtyDaysAgo) matches = false;
            
            // Filtres par type de profil
            const typeFiltersActive = filters.typeActor || filters.typeCrew || filters.typeAssociation || filters.typeEnterprise;
            if(typeFiltersActive) {
                let typeMatch = false;
                if(filters.typeActor && facets.actor.enabled) typeMatch = true;
                if(filters.typeCrew && PublicProfile.crewAnyEnabled(facets)) typeMatch = true;
                if(filters.typeAssociation && facets.asso.enabled) typeMatch = true;
                if(filters.typeEnterprise && facets.ent.enabled) typeMatch = true;
                if(!typeMatch) matches = false;
            }
            
            // Si aucun filtre actif, ne sélectionner personne
            const anyFilterActive = Object.values(filters).some(v => v);
            if(!anyFilterActive) return false;
            
            return matches;
        });
        
        document.getElementById('email-recipients-count').textContent = Admin.emailRecipients.length;
    },
    
    showRecipientsList: () => {
        if(Admin.emailRecipients.length === 0) {
            Utils.toast('Aucun destinataire sélectionné', 'warning');
            return;
        }
        
        const listHtml = Admin.emailRecipients.map(u => `
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
                <span>${Utils.escape(u.name || 'Sans nom')}</span>
                <span class="text-sec">${Utils.escape(u.email)}</span>
            </div>
        `).join('');
        
        ConfirmModal.show({
            title: `📧 ${Admin.emailRecipients.length} destinataires`,
            message: `<div style="max-height: 400px; overflow-y: auto; background: var(--bg); border-radius: 8px;">${listHtml}</div>`,
            confirmText: 'Fermer',
            icon: '👥'
        });
    },
    
    loadEmailTemplate: (template) => {
        const templates = {
            'welcome': {
                subject: '👋 Bienvenue sur Moteur !',
                body: `Bonjour {nom},

Bienvenue sur Moteur, la plateforme de gestion de production audiovisuelle !

Nous sommes ravis de vous compter parmi nos utilisateurs. N'hésitez pas à explorer toutes les fonctionnalités :
- Créez votre profil public pour être visible dans l'Univers
- Lancez votre premier projet
- Connectez-vous avec d'autres professionnels

Si vous avez des questions, n'hésitez pas à nous contacter.

À très vite sur Moteur !
L'équipe Moteur 🎬`
            },
            'complete-profile': {
                subject: '👤 Complétez votre profil Moteur',
                body: `Bonjour {nom},

Nous avons remarqué que votre profil sur Moteur n'est pas encore complet.

Un profil complet vous permet :
- D'être visible dans l'Univers par les autres professionnels
- De recevoir des propositions de projets adaptées
- De gagner en crédibilité auprès de la communauté

Prenez 5 minutes pour compléter votre profil et maximisez vos opportunités !

👉 Connectez-vous sur moteur.studio

L'équipe Moteur 🎬`
            },
            'reactivation': {
                subject: '🔄 Moteur vous manque !',
                body: `Bonjour {nom},

Cela fait un moment que nous ne vous avons pas vu sur Moteur !

Depuis votre dernière visite, nous avons ajouté de nouvelles fonctionnalités :
- L'Univers pour découvrir des profils et projets
- Le système de matching intelligent
- De nouveaux outils de gestion de projet

Revenez découvrir tout ça !

👉 Connectez-vous sur moteur.studio

L'équipe Moteur 🎬`
            },
            'new-feature': {
                subject: '🆕 Nouvelle fonctionnalité sur Moteur !',
                body: `Bonjour {nom},

Nous avons le plaisir de vous annoncer une nouvelle fonctionnalité sur Moteur !

[Décrivez la fonctionnalité ici]

Connectez-vous pour la découvrir !

👉 moteur.studio

L'équipe Moteur 🎬`
            },
            'feedback': {
                subject: '💬 Votre avis compte !',
                body: `Bonjour {nom},

Vous utilisez Moteur depuis votre inscription le {date_inscription}, et nous aimerions avoir votre retour.

Quelques questions rapides :
- Qu'est-ce qui vous plaît sur Moteur ?
- Qu'est-ce qui pourrait être amélioré ?
- Quelle fonctionnalité aimeriez-vous voir ajoutée ?

Répondez simplement à cet email, nous lisons tous les retours !

Merci pour votre aide précieuse.

L'équipe Moteur 🎬`
            }
        };
        
        if(templates[template]) {
            document.getElementById('email-subject').value = templates[template].subject;
            document.getElementById('email-body').value = templates[template].body;
        }
    },
    
    previewEmail: () => {
        const subject = document.getElementById('email-subject').value;
        const body = document.getElementById('email-body').value;
        
        if(!subject || !body) {
            Utils.toast('Remplissez l\'objet et le message', 'warning');
            return;
        }
        
        // Exemple avec le premier destinataire ou des valeurs par défaut
        const example = Admin.emailRecipients[0] || { name: 'Jean Dupont', email: 'exemple@email.com', created_at: new Date().toISOString() };
        
        const previewBody = body
            .replace(/\{nom\}/g, example.name || 'Utilisateur')
            .replace(/\{email\}/g, example.email || '')
            .replace(/\{date_inscription\}/g, new Date(example.created_at).toLocaleDateString('fr-FR'));
        
        ConfirmModal.show({
            title: '👁️ Prévisualisation',
            message: `
                <div style="background: var(--bg); border-radius: 8px; padding: 15px;">
                    <div style="font-weight: bold; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                        📧 ${Utils.escape(subject)}
                    </div>
                    <div style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">
${Utils.escape(previewBody)}
                    </div>
                </div>
            `,
            confirmText: 'Fermer',
            icon: '📧'
        });
    },
    
    sendEmails: async () => {
        const subject = document.getElementById('email-subject').value;
        const body = document.getElementById('email-body').value;
        
        if(!subject || !body) {
            Utils.toast('Remplissez l\'objet et le message', 'warning');
            return;
        }
        
        if(Admin.emailRecipients.length === 0) {
            Utils.toast('Aucun destinataire sélectionné', 'warning');
            return;
        }
        
        const confirmed = await ConfirmModal.show({
            title: '📤 Confirmer l\'envoi',
            message: `Vous êtes sur le point d'envoyer cet email à <strong>${Admin.emailRecipients.length} destinataires</strong>.<br><br>Cette action est irréversible.`,
            confirmText: 'Envoyer',
            icon: '📧'
        });
        
        if(!confirmed) return;
        
        Utils.toast('Envoi en cours...', 'info');
        
        let sent = 0;
        let errors = 0;
        
        for(const recipient of Admin.emailRecipients) {
            try {
                const personalizedBody = body
                    .replace(/\{nom\}/g, recipient.name || 'Utilisateur')
                    .replace(/\{email\}/g, recipient.email || '')
                    .replace(/\{date_inscription\}/g, new Date(recipient.created_at).toLocaleDateString('fr-FR'));
                
                await supabase.functions.invoke('super-action', { body: {
                    to: recipient.email,
                    toName: recipient.name || 'Utilisateur',
                    type: 'generic',
                    data: { subject: subject, title: subject, message: personalizedBody }
                } });
                
                sent++;
                
                // Pause pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch(e) {
                console.error('Erreur envoi email à', recipient.email, e);
                errors++;
            }
        }
        
        if(errors === 0) {
            Utils.toast(`✅ ${sent} emails envoyés avec succès !`, 'success');
        } else {
            Utils.toast(`📧 ${sent} envoyés, ${errors} erreurs`, 'warning');
        }
    }
};
