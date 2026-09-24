
// --- MODULE EXPENSES V88 ---

// ========== HISTORIQUE DES MODIFICATIONS ==========
// ========== GESTION DES CONTRATS ==========
// Orgs — structures (associations / entreprises) rattachees au projet, assignables a un departement / une fonction.
const Orgs = {
    _list: () => {
        if(!Array.isArray(state.data.orgs)) state.data.orgs = [];
        return state.data.orgs;
    },

    // Instantane complet et normalise de la fiche structure (affichage lecture seule + autocompletion contrats).
    // b = sac de champs a plat (data du profil OU JSON contact) ; facets = pour le siege (hqAddress).
    _ficheFrom: (b, facets, kind) => {
        b = b || {};
        const f = (facets || {})[kind] || {};
        const sList = (obj, map) => Object.keys(map).filter(k => obj && obj[k]).map(k => map[k]).join(', ');
        if(kind === 'asso') {
            return {
                kind: 'asso',
                name: b.assoName || b.name || '', logo: b.assoLogo || b.logo || b.photo || '', type: b.assoType || '',
                siret: b.assoSiret || '', legalForm: '', year: b.assoYear || '',
                size: b.assoMembers || '', leader: b.assoPresident || '', contactPerson: b.assoContact || '',
                email: b.assoEmail || b.email || '', phone: b.assoPhone || b.phone || '', website: b.assoWebsite || b.website || '',
                hq: f.hqAddress || b.assoSiege || b.address || b.city || '',
                mission: b.assoMission || b.bio || b.description || '', activities: b.assoActivities || '',
                services: sList(b.assoServices, { formation:'Formation', ateliers:'Ateliers', networking:'Networking', casting:'Casting', materiel:'Prêt de matériel', production:'Production', diffusion:'Diffusion' }),
                facebook: b.assoFacebook || '', instagram: b.assoInstagram || '', youtube: b.assoYoutube || '', linkedin: b.assoLinkedin || '', vimeo: '', imdb: '',
                demoreel: b.assoDemoreel || (b.assoDemoreels && b.assoDemoreels[0]) || ''
            };
        }
        return {
            kind: 'ent',
            name: b.entName || b.name || '', logo: b.entLogo || b.logo || b.photo || '', type: b.entType || '',
            siret: b.entSiret || '', legalForm: b.entLegal || '', year: b.entYear || '',
            size: b.entEmployees || '', leader: b.entDirector || '', contactPerson: b.entContact || '',
            email: b.entEmail || b.email || '', phone: b.entPhone || b.phone || '', website: b.entWebsite || b.website || '',
            hq: f.hqAddress || b.entSiege || b.address || b.city || '',
            mission: b.entDescription || b.bio || b.description || '', activities: b.entServices || '',
            services: sList(b.entSpecialties, { fiction:'Fiction', doc:'Documentaire', pub:'Publicité', corporate:'Corporate', clip:'Clip', event:'Événementiel', web:'Web' }),
            facebook: b.entFacebook || '', instagram: b.entInstagram || '', youtube: b.entYoutube || '', linkedin: b.entLinkedin || '', vimeo: b.entVimeo || '', imdb: b.entImdb || '',
            demoreel: b.entDemoreel || (b.entDemoreels && b.entDemoreels[0]) || ''
        };
    },

    // Fiche normalisee a afficher : l'instantane o.fiche, ou repli depuis les anciens champs a plat (donnees legacy).
    _fiche: (o) => {
        if(o && o.fiche) return o.fiche;
        const kind = (o && o.type === 'asso') ? 'asso' : 'ent';
        return { kind: kind, name: (o && o.name) || '', logo: '', type: '', siret: '', legalForm: '', year: '', size: '', leader: '', contactPerson: '',
            email: (o && o.contact) || '', phone: (o && o.phone) || '', website: (o && o.site) || '', hq: (o && o.address) || '',
            mission: (o && o.desc) || '', activities: '', services: '', facebook: '', instagram: '', youtube: '', linkedin: '', vimeo: '', imdb: '' };
    },

    // Edition d'un champ de la fiche (structures NON liees a l'Univers uniquement).
    updateFiche: (idx, key, value) => {
        // FUSION profil (volet 2) : en mode moteur, on ecrit sur la copie jetable, sans notifier ni sauvegarder le projet.
        if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) {
            const l = Orgs._list();
            if(!l[idx]) return;
            if(!l[idx].fiche) l[idx].fiche = Orgs._fiche(l[idx]);
            l[idx].fiche[key] = value;
            if(key === 'name') l[idx].name = value;
            return;
        }
        if(!Permissions.canEditFiche('org')) return;
        const list = Orgs._list();
        if(!list[idx]) return;
        if(list[idx].profileId) return; // P1 (audit) : structure liee a l'Univers = identite en lecture seule
        if(!list[idx].fiche) list[idx].fiche = Orgs._fiche(list[idx]);
        list[idx].fiche[key] = value;
        if(key === 'name') list[idx].name = value;
        if(key === 'email') list[idx].contact = value;
        Store.save();
        if(key === 'email' && value && value.indexOf('@') !== -1) Orgs._maybeNotify(list[idx], value.trim());
    },

    // Fonctions disponibles selon le departement (meme taxonomie que technicien : CONFIG.crewRoles + Financeurs).
    _rolesFor: (deptId) => {
        if(deptId === 'fin') return ['Financeur principal', 'Co-financeur', 'Subvention', 'Mécénat', 'Préachat', 'Partenaire', 'Autre'];
        return (typeof CONFIG !== 'undefined' && CONFIG.crewRoles && CONFIG.crewRoles[deptId]) ? CONFIG.crewRoles[deptId] : ['Autre'];
    },

    // Options du select departement : groupes crew du projet + Financeurs (+ valeur legacy eventuelle).
    _deptOptions: (selected) => {
        const groups = (state.data.groups || []).filter(g => g.type === 'crew');
        let html = '<option value="">— Département —</option>';
        groups.forEach(g => { html += `<option value="${Utils.escape(g.id)}"${g.id === selected ? ' selected' : ''}>${Utils.escape(g.name)}</option>`; });
        html += `<option value="fin"${selected === 'fin' ? ' selected' : ''}>💰 Financeurs</option>`;
        if(selected && selected !== 'fin' && !groups.some(g => g.id === selected)) html += `<option value="${Utils.escape(selected)}" selected>${Utils.escape(selected)}</option>`;
        return html;
    },

    // Changement de departement : la fonction depend du departement -> on la reinitialise.
    setDept: (idx, value) => {
        const list = Orgs._list();
        if(!list[idx]) return;
        list[idx].department = value;
        list[idx].role = '';
        list[idx].roleCustom = false;
        Store.save();
        Orgs.render();
    },

    // Choix de fonction : 'Autre' -> champ libre (comme technicien).
    onRoleChange: (idx, value) => {
        const list = Orgs._list();
        if(!list[idx]) return;
        if(value === 'Autre') { list[idx].roleCustom = true; }
        else { list[idx].roleCustom = false; list[idx].role = value; }
        Store.save();
        Orgs.render();
    },

    // Resynchronise les fiches liees a l'Univers (lecture seule), comme comedien/technicien : 1 requete groupee a l'ouverture de l'onglet.
    // Ne touche jamais a la section « Sur ce projet » (department / role / notes).
    syncFromUniverse: async () => {
        const list = Orgs._list();
        const ids = [...new Set(list.filter(o => o.profileId).map(o => o.profileId))];
        if(!ids.length) return;
        try {
            const { data, error } = await Utils.profils({ ids: ids });
            if(error || !data) return;
            const byId = {};
            data.forEach(p => { byId[p.id] = p; });
            let changed = false;
            list.forEach(o => {
                if(!o.profileId) return;
                const p = byId[o.profileId];
                if(!p) return; // fiche introuvable (supprimee/privee) : on garde l'instantane existant
                const kind = (o.type === 'asso') ? 'asso' : 'ent';
                const fct = ((p.data || {}).facets || {})[kind] || {};
                // Casquette masquee/desactivee : on GARDE le dernier instantane et on marque hors ligne.
                const offline = fct.visible === false || fct.enabled === false;
                o._offline = offline;
                if(!offline) o.fiche = Orgs._ficheFrom(Object.assign({}, p, p.data || {}), (p.data || {}).facets, kind);
                changed = true;
            });
            if(changed) Store.save();
        } catch(e) { console.warn('[Orgs] sync Univers:', e); }
    },

    add: () => {
        Orgs._list().push({ id: Utils.generateUniqueId(), type: 'ent', name: '', address: '', phone: '', site: '', desc: '', department: '', role: '', contact: '', notes: '', srcId: null });
        Store.save();
        Orgs.render();
        Orgs.edit(Orgs._list().length - 1);
    },

    // Import depuis Mes contacts (structures enregistrees dans tes contacts)
    importFromContacts: async () => {
        try {
            const email = (state.currentUser && state.currentUser.email || '').toLowerCase();
            if(!email) return;
            const { data, error } = await supabase.from('contacts').select('*').eq('owner_email', email);
            if(error) { console.warn('[Orgs] importFromContacts:', error); Utils.toast('Impossible de lire tes contacts pour le moment.', 'error'); return; }
            const orgContacts = (data || []).filter(c => ['org', 'association', 'enterprise', 'asso', 'ent'].indexOf(c.contact_type) !== -1);
            if(!orgContacts.length) {
                Utils.toast('Aucune structure dans tes contacts pour le moment. Utilise « 🔍 Rechercher une structure » pour passer par l\u2019Univers.', 'info', 6000);
                return;
            }
            const list = Orgs._list();
            let added = 0;
            orgContacts.forEach(c => {
                if(list.some(o => (o.name || '').toLowerCase() === (c.name || '').toLowerCase())) return;
                const t = (c.contact_type === 'association' || c.contact_type === 'asso') ? 'asso' : 'ent';
                // La fiche complete est stockee en JSON dans le contact : on la copie comme depuis la recherche
                let prof = {};
                try { prof = JSON.parse(c.notes || '{}'); } catch(_) {}
                const fx = (o, keys) => { for(const k of keys) { if(o && o[k]) return o[k]; } return ''; };
                const f = ((prof.facets || {})[t === 'asso' ? 'asso' : 'ent']) || {};
                const email = (c.contact_email && c.contact_email.indexOf('@') !== -1) ? c.contact_email : (f.email || prof.email || '');
                list.push({ id: Utils.generateUniqueId(), type: t, name: c.name || '',
                    address: fx(f, ['siege', 'siegeAddress', 'address']) || prof.city || '',
                    phone: fx(f, ['phone', 'tel']) || prof.phone || '',
                    site: fx(f, ['site', 'website', 'web']) || prof.site || '',
                    desc: fx(f, ['description', 'desc', 'bio']) || '',
                    department: '', role: '', contact: email, notes: '', srcId: null,
                    fiche: Orgs._ficheFrom(prof, prof.facets, t),
                    profileId: prof.publicProfileId || c.publicProfileId || null });
                added++;
            });
            if(added) { Store.save(); Orgs.render(); }
            Utils.toast(added ? (added + ' structure(s) importée(s) de tes contacts.') : 'Toutes tes structures de contacts sont déjà dans le projet.', added ? 'success' : 'info');
        } catch(e) { console.warn('[Orgs] contacts:', e); }
    },

    // Apercu de la fiche de presentation d'une structure de l'Univers
    preview: (i) => {
        const r = Orgs._searchResults[i];
        if(!r) return;
        const old = document.getElementById('orgs-preview-modal'); if(old) old.remove();
        const modal = document.createElement('div');
        modal.id = 'orgs-preview-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        const line = (ico, val) => val ? ('<div style="display:flex; gap:8px; font-size:0.9rem;"><span>' + ico + '</span><span>' + Utils.escape(val) + '</span></div>') : '';
        modal.innerHTML = '<div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 460px; max-height: 80vh; overflow-y:auto; display: flex; flex-direction: column;">'
            + '<div style="display:flex; align-items:center; justify-content:space-between; padding:15px 20px; border-bottom:1px solid var(--border);">'
            + '<h3 style="margin:0;">' + (r.t === 'asso' ? '🏛️ ' : '🏢 ') + Utils.escape(r.name) + '</h3>'
            + '<button onclick="document.getElementById(\'orgs-preview-modal\').remove()" class="icon-btn-sec">✖</button>'
            + '</div>'
            + '<div style="padding:20px; display:flex; flex-direction:column; gap:10px;">'
            + '<div style="color:var(--text-sec); font-size:0.85rem;">' + (r.t === 'asso' ? 'Association' : 'Entreprise') + ' — fiche publique de l\u2019Univers</div>'
            + line('📍', r.address || r.city)
            + line('📧', r.email)
            + line('☎️', r.phone)
            + line('🌐', r.site)
            + (r.desc ? '<div style="font-size:0.9rem; color:var(--text-sec); white-space:pre-wrap; border-top:1px solid var(--border); padding-top:10px;">' + Utils.escape(r.desc) + '</div>' : '')
            + '<button onclick="app.Orgs.addFromUniverse(' + i + '); document.getElementById(\'orgs-preview-modal\').remove();" style="margin-top:6px; padding:10px; background:var(--primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">➕ Ajouter au projet</button>'
            + '</div></div>';
        document.body.appendChild(modal);
    },

    // Recherche d'une structure dans l'Univers (fiches publiques asso / entreprise)
    _searchResults: [],
    openSearch: () => {
        const modal = document.createElement('div');
        modal.id = 'orgs-search-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        modal.innerHTML = '<div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 560px; max-height: 80vh; display: flex; flex-direction: column;">'
            + '<div style="display:flex; align-items:center; justify-content:space-between; padding:15px 20px; border-bottom:1px solid var(--border);">'
            + '<h3 style="margin:0;">🔍 Rechercher une structure</h3>'
            + '<button onclick="document.getElementById(\'orgs-search-modal\').remove()" class="icon-btn-sec">✖</button>'
            + '</div>'
            + '<div style="display:flex; flex-direction:column; gap:8px; padding:12px 20px;">'
            + '<input type="text" id="orgs-search-name" placeholder="Nom, ville..." data-tooltip="Nom, ville..." oninput="app.Orgs.runSearch()" style="flex:1 1 auto; min-width:0; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main);">'
            + '<select id="orgs-search-type" onchange="app.Orgs.runSearch()" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main);">'
            + '<option value="">Tous types</option><option value="asso">🏛️ Associations</option><option value="ent">🏢 Entreprises</option>'
            + '</select>'
            + '</div>'
            + '<div id="orgs-search-results" style="padding: 0 20px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;"><div style="text-align:center; color:var(--text-sec); padding:20px;">🔄 Chargement...</div></div>'
            + '</div>';
        document.body.appendChild(modal);
        Orgs.runSearch();
    },

    runSearch: async () => {
        const box = document.getElementById('orgs-search-results');
        if(!box) return;
        try {
            // v578 (audit) : fonction serveur, regle du telephone appliquee en base.
            const { data, error } = await supabase.rpc('public_profiles_for_me', { p_type: null });
            if(error) { box.innerHTML = '<div style="color:var(--text-sec); text-align:center; padding:20px;">Recherche indisponible pour le moment.</div>'; return; }
            const out = [];
            (data || []).forEach(p => {
                const d = p.data || {};
                const f = d.facets || {};
                const entries = [];
                const fx = (o, keys) => { for(const k of keys) { if(o && o[k]) return o[k]; } return ''; };
                const fa = f.asso || {}, fe = f.ent || {};
                if(fa.enabled || p.profile_type === 'association') entries.push({ t: 'asso',
                    name: d.assoName || fa.name || p.name,
                    email: fa.email || d.assoEmail || '',
                    phone: fx(fa, ['phone', 'tel']) || d.assoPhone || '',
                    site: fx(fa, ['site', 'website', 'web']) || d.assoSite || '',
                    address: fx(fa, ['siege', 'siegeAddress', 'address']) || d.assoSiege || '',
                    desc: fx(fa, ['description', 'desc', 'bio']) || d.assoDesc || '',
                    fiche: Orgs._ficheFrom(Object.assign({}, p, d), f, 'asso') });
                if(fe.enabled || p.profile_type === 'enterprise') entries.push({ t: 'ent',
                    name: d.entName || fe.name || p.name,
                    email: fe.email || d.entEmail || '',
                    phone: fx(fe, ['phone', 'tel']) || d.entPhone || '',
                    site: fx(fe, ['site', 'website', 'web']) || d.entSite || '',
                    address: fx(fe, ['siege', 'siegeAddress', 'address']) || d.entSiege || '',
                    desc: fx(fe, ['description', 'desc', 'bio']) || d.entDesc || '',
                    fiche: Orgs._ficheFrom(Object.assign({}, p, d), f, 'ent') });
                entries.forEach(en => { if(en.name) out.push({ pid: p.id, t: en.t, name: en.name, city: d.city || p.city || '', email: en.email, phone: en.phone, site: en.site, address: en.address, desc: en.desc, fiche: en.fiche }); });
            });
            const q = (document.getElementById('orgs-search-name')?.value || '').toLowerCase();
            const tf = document.getElementById('orgs-search-type')?.value || '';
            let res = out;
            if(tf) res = res.filter(r => r.t === tf);
            if(q) res = res.filter(r => (r.name || '').toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q));
            Orgs._searchResults = res;
            if(!res.length) { box.innerHTML = '<div style="color:var(--text-sec); text-align:center; padding:20px;">Aucune structure trouvée dans l\u2019Univers. Tu peux en créer une vierge avec « ➕ Ajouter une structure ».</div>'; return; }
            box.innerHTML = res.map((r, i) => '<div onclick="app.Orgs.preview(' + i + ')" style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; cursor:pointer;">'
                + '<div style="font-size:1.4rem;">' + (r.t === 'asso' ? '🏛️' : '🏢') + '</div>'
                + '<div style="flex:1;"><div style="font-weight:600;">' + Utils.escape(r.name) + '</div>'
                + (r.city ? '<div style="font-size:0.8rem; color:var(--text-sec);">📍 ' + Utils.escape(r.city) + '</div>' : '')
                + '<div style="font-size:0.75rem; color:var(--text-sec);">Clique pour voir la fiche</div>'
                + '</div><button onclick="event.stopPropagation(); app.Orgs.addFromUniverse(' + i + ')" class="chub-btn">➕ Ajouter</button></div>').join('');
        } catch(e) { box.innerHTML = '<div style="color:var(--text-sec); text-align:center; padding:20px;">Erreur de recherche.</div>'; }
    },

    addFromUniverse: (i) => {
        const r = Orgs._searchResults[i];
        if(!r) return;
        const list = Orgs._list();
        if(list.some(o => (o.profileId && o.profileId === r.pid && o.type === r.t) || ((o.name || '').toLowerCase() === (r.name || '').toLowerCase())) ) {
            Utils.toast('Cette structure est déjà dans le projet.', 'warning');
            return;
        }
        // La fiche structure de la casquette est COPIEE dans le projet (comme une fiche comedien)
        list.push({ id: Utils.generateUniqueId(), type: r.t, name: r.name || '', address: r.address || r.city || '', phone: r.phone || '', site: r.site || '', desc: r.desc || '', department: '', role: '', contact: r.email || '', notes: '', srcId: null, profileId: r.pid, fiche: r.fiche || null });
        Store.save();
        Orgs.render();
        const modal = document.getElementById('orgs-search-modal'); if(modal) modal.remove();
        Utils.toast(Utils.escape(r.name) + ' ajoutée au projet !', 'success');
        if(r.email) {
            setTimeout(() => { Orgs._maybeNotify(list[list.length - 1], r.email); }, 300);
        }
    },

    update: (idx, field, value) => {
        // FUSION profil (volet 2) : en mode moteur, ecriture sur la copie jetable, aucun effet projet.
        if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) {
            const l = Orgs._list();
            if(l[idx]) l[idx][field] = value;
            return;
        }
        if(!Permissions.canEditFiche('org')) return;
        const list = Orgs._list();
        if(!list[idx]) return;
        const before = list[idx][field];
        list[idx][field] = value;
        Store.save();
        if(field === 'type') { if(list[idx].fiche) list[idx].fiche.kind = (value === 'asso' ? 'asso' : 'ent'); Orgs.render(); }
        // Meme logique que comediens/techniciens : email saisi -> si un compte existe, proposer de prevenir
        if(field === 'contact' && value && value !== before && value.indexOf('@') !== -1) {
            Orgs._maybeNotify(list[idx], value.trim());
        }
    },

    _maybeNotify: async (org, email) => {
        try {
            // v602 : les profils des autres ne se lisent plus en direct ; la
            // fonction serveur ne rend que le strict minimum.
            const { data, error } = await supabase.rpc('profils_minimaux', { p_emails: [email], p_ids: null });
            if(error) { console.warn('[Orgs] _maybeNotify:', error); return; }
            if(!data || !data.length) return; // pas de compte : rien a envoyer
            const ok = await ConfirmModal.show({ title: 'Prévenir cette structure ?', message: 'Un compte existe pour ' + email + '. Lui envoyer une notification pour l\u2019informer que sa structure a été ajoutée au projet ?', icon: '📧', confirmText: 'Envoyer' });
            if(!ok) return;
            const projectTitle = document.getElementById('projectTitle')?.value || 'Un projet';
            const senderName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0] || 'Quelqu\u2019un';
            await Notifications.send(email, 'invite', senderName + ' a ajouté votre structure au projet "' + projectTitle + '"', state.currentProjectId);
            await Messages.sendEmailPing(email, org.name || email.split('@')[0], 'invitation', { senderName: senderName, projectTitle: projectTitle, role: 'structure partenaire' });
            Utils.toast('Notification envoyée !', 'success');
        } catch(e) { console.warn('[Orgs] notification structure:', e); }
    },

    // Suppression DEFINITIVE : cet onglet est le pole des structures. Supprimer ici retire
    // aussi la structure des Partenaires de la Presentation (la Presentation n'est qu'une vitrine).
    remove: async (idx) => {
        // FUSION profil (volet 2) : pas de suppression depuis la fiche profil.
        if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) return;
        const list = Orgs._list();
        if(!list[idx]) return;
        const o = list[idx];
        const name = o.name || 'cette structure';
        const pres = state.data.presentation || {};
        const isPartner = !!(o.srcId && (
            (pres.associations || []).some(p => p && p.id === o.srcId)
            || (pres.enterprises || []).some(p => p && p.id === o.srcId)
        ));
        const msg = isPartner
            ? 'Supprimer définitivement ' + name + ' ? Elle sera aussi retirée des Partenaires du Projet (Présentation).'
            : 'Supprimer définitivement ' + name + ' du projet ?';
        if(!(await ConfirmModal.confirmDelete(msg))) return;
        if(isPartner) {
            if(Array.isArray(pres.associations)) pres.associations = pres.associations.filter(p => !p || p.id !== o.srcId);
            if(Array.isArray(pres.enterprises)) pres.enterprises = pres.enterprises.filter(p => !p || p.id !== o.srcId);
            state.data.presentation = pres;
            try { if(typeof Presentation !== 'undefined' && typeof Presentation.renderPartners === 'function') Presentation.renderPartners(); } catch(_) {}
        }
        list.splice(idx, 1);
        Store.save();
        Orgs.render();
    },

    render: () => {
        const host = document.getElementById('orgs-list');
        if(!host) return;
        GroupDnD.init();
        const list = Orgs._list();

        // Datalist des departements : ceux de l'equipe + classiques
        const deps = {};
        (state.data.crew || []).forEach(c => { if(c.department) deps[c.department] = true; });
        ['Réalisation', 'Image', 'Son', 'Lumière', 'Régie', 'Décors', 'Costumes', 'Maquillage', 'Montage', 'Post-production', 'Production', 'Communication', 'Financeurs'].forEach(d => { deps[d] = true; });
        const dl = '<datalist id="orgs-deps">' + Object.keys(deps).sort((a, b) => a.localeCompare(b, 'fr')).map(d => '<option value="' + Utils.escape(d) + '"></option>').join('') + '</datalist>';

        // REGLE : tout partenaire de la Presentation est AUTOMATIQUEMENT present ici.
        // (L'inverse n'est pas vrai : on peut avoir des structures hors partenaires.)
        const pres = state.data.presentation || {};
        const already = {};
        list.forEach(o => { if(o.srcId) already[o.srcId] = true; already[o.id] = true; });
        let autoAdded = false;
        const considerAuto = (p, t) => {
            if(!p || !p.id || already[p.id]) return;
            list.push({ id: Utils.generateUniqueId(), type: t, name: p.name || '', department: '', role: '', contact: '', notes: '', srcId: p.id });
            already[p.id] = true;
            autoAdded = true;
        };
        (pres.associations || []).forEach(p => considerAuto(p, 'asso'));
        (pres.enterprises || []).forEach(p => considerAuto(p, 'ent'));
        if(autoAdded) { try { Store.save(); } catch(_) {} }
        const importHtml = '';

        if(!list.length && !importHtml) {
            host.innerHTML = dl + '<div style="padding:40px; text-align:center; color:var(--text-sec);">Aucune structure pour le moment — « ➕ Ajouter une structure », ou déclare des partenaires dans Présentation.</div>';
            return;
        }

const orgGroups = (state.data.groups || []).filter(g => g.type === 'org');
        const esc = Utils.escape;
        const isView = state.currentRole === 'viewer';
        const cardHtml = (o, i) => {
            const fc = Orgs._fiche(o);
            const icon = (fc.kind === 'asso') ? '🏛️' : '🏢';
            const typeLabel = (fc.kind === 'asso') ? 'Association' : 'Entreprise';
            const logo = fc.logo ? `<img src="${esc(fc.logo)}" alt="">` : icon;
            let opts = '<option value="">-- Groupe --</option>';
            orgGroups.forEach(g => { opts += `<option value="${g.id}" ${o.group_id === g.id ? 'selected' : ''}>${esc(g.name)}</option>`; });
            const actions = isView ? '' : `
                <div class="compact-card-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); app.Orgs.edit(${i})" title="Modifier">✏️</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.Orgs.remove(${i})" title="Supprimer">🗑️</button>
                    <div class="group-round-wrap" title="Changer de groupe"><button class="group-btn" type="button" tabindex="-1">👥</button><select class="group-round-select" onclick="event.stopPropagation();" onchange="event.stopPropagation(); app.Actions.changeGroup('orgs', ${i}, this.value)">${opts}</select></div>
                    <button class="web-btn" onclick="event.stopPropagation(); app.Web.open('org', '${o.id}')" title="Voir dans la toile">🕸️</button>
                </div>`;
            const dnd = isView ? '' : ` draggable="true" data-dnd-coll="orgs" data-dnd-idx="${i}"`;
            return `<div class="compact-card" data-fiche="org:${Utils.escape(String(o.id || ''))}"${dnd} onclick="app.Orgs.edit(${i})">${actions}${o._offline ? '<div class="compact-card-badge card-offline" title="Hors ligne — masqué de l’Univers">🚧</div>' : ''}<div class="compact-card-photo">${logo}</div><div class="compact-card-name">${esc(fc.name || o.name || 'Sans nom')}</div><div class="compact-card-role">${typeLabel}</div></div>`;
        };
        const idxPairs = list.map((o, i) => [o, i]);
        let sections = '';
        orgGroups.forEach(grp => {
            const inG = idxPairs.filter(p => p[0].group_id === grp.id);
            if(inG.length || !isView) sections += `<div class="group-section${inG.length ? '' : ' dnd-empty-target'}"><div class="group-header">${esc(grp.name)}${GroupDnD.delBtnHtml('orgs', grp.id, isView)}</div><div class="compact-cards-grid" data-dnd-coll="orgs" data-dnd-group="${grp.id}">` + inG.map(p => cardHtml(p[0], p[1])).join('') + `</div></div>`;
        });
        const noG = idxPairs.filter(p => !p[0].group_id || !orgGroups.find(g => g.id === p[0].group_id));
        if(noG.length) sections += `<div class="group-section"><div class="group-header text-sec">Non classé</div><div class="compact-cards-grid" data-dnd-coll="orgs" data-dnd-group="">` + noG.map(p => cardHtml(p[0], p[1])).join('') + `</div></div>`;
        host.innerHTML = dl + importHtml + sections;
    },
    edit: (i) => {
        const o = Orgs._list()[i]; if(!o) return;
        try { if(typeof FicheLock !== 'undefined'
                 && FicheLock.ouvrir('org', o.id, 'Cette structure') === false) return; } catch(e) {}
        const modal = document.getElementById('card-edit-modal');
        const body = document.getElementById('card-edit-modal-body');
        const titleEl = document.getElementById('card-edit-modal-title');
        const fc = Orgs._fiche(o);
        const ic = (fc.kind === 'asso') ? '🏛️' : '🏢';
        if(titleEl) titleEl.textContent = ic + ' ' + ((fc.kind === 'asso') ? 'Association' : 'Entreprise');
        // v601 : voir Resources.edit — la structure se modifie dans cette
        // fenetre, pas sur sa carte. L'identifiant se pose donc ici.
        if(body) body.innerHTML = '<div class="fiche-fenetre" data-fiche="org:'
            + Utils.escape(String(o.id || '')) + '">' + Orgs._detailHtml(o, i) + '</div>';
        CardModal.applyRights('org');
        if(modal) modal.classList.add('visible');
        if(body) requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
    },
    // Upload du logo de la structure (bucket avatars public, compression 800px), cote projet ET profil.
    uploadLogo: async (idx, input) => {
        if(!input || !input.files || !input.files[0]) return;
        const file = input.files[0]; input.value = '';
        if(!file.type.startsWith('image/')) { Utils.toast('Fichier image invalide.', 'warning'); return; }
        if(file.size > 5 * 1024 * 1024) { Utils.toast('Fichier trop volumineux (max 5 Mo).', 'warning'); return; }
        Utils.toast('Envoi du logo…', 'info', 1500);
        try {
            const blob = await PublicProfile.compressImageToBlob(file, 800, 0.8);
            const userId = state.currentUser.id;
            const filePath = userId + '/orglogo_' + Date.now() + '.jpg';
            const { error } = await supabase.storage.from('avatars').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
            if(error) throw error;
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const url = (urlData && urlData.publicUrl) ? urlData.publicUrl : '';
            if(!url) throw new Error('URL vide');
            const list = Orgs._list();
            if(!list[idx]) return;
            if(!list[idx].fiche) list[idx].fiche = Orgs._fiche(list[idx]);
            list[idx].fiche.logo = url;
            if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) {
                PublicProfile._orgEngineRerenderCard();
            } else {
                Store.save();
                Orgs.edit(idx);
            }
            Utils.toast('Logo mis à jour.', 'success');
        } catch(e) { console.warn('[Orgs] logo:', e); Utils.toast('Erreur envoi logo : ' + ((e && e.message) || 'inconnue'), 'error'); }
    },

    _detailHtml: (o, i) => {
            const esc = Utils.escape;
            const linked = !!o.profileId;
            const fc = Orgs._fiche(o);
            const icon = (fc.kind === 'asso') ? '🏛️' : '🏢';
            const typeLabel = (fc.kind === 'asso') ? 'Association' : 'Entreprise';

            // En-tete au gabarit fiche d'identite universelle (v581).
            const avatarInner = fc.logo ? `<img src="${Utils.safeMediaUrl(fc.logo)}" alt="">` : icon;
            const avatarHtml = linked
                ? `<div class="fid-avatar">${avatarInner}</div>`
                : `<div class="fid-avatar" style="cursor:pointer; position:relative;" onclick="event.stopPropagation(); document.getElementById('org-logo-input-${esc(String(i))}').click()" title="Changer le logo">${avatarInner}<span style="position:absolute; right:-2px; bottom:-2px; font-size:0.85rem;">🖼️</span><input type="file" id="org-logo-input-${esc(String(i))}" accept="image/*" style="display:none;" onchange="app.Orgs.uploadLogo(${i}, this)"></div>`;
            const nameHtml = linked
                ? `<div class="fid-name">${esc(fc.name || o.name || 'Sans nom')}</div>`
                : `<input type="text" class="fid-name" value="${esc(fc.name || o.name || '')}" placeholder="Nom de la structure" data-tooltip="Nom de la structure" onclick="event.stopPropagation()" onchange="app.Orgs.updateFiche(${i}, 'name', this.value)">`;
            const delTitle = linked ? 'Retirer du projet' : 'Supprimer définitivement';
            const roBadge = linked ? FicheUI.badge('🔒 lecture seule') : '';
            const head = `<div class="fid-head">
                ${avatarHtml}
                <div class="fid-head-main">${nameHtml}<div class="fid-sub">${typeLabel} · fiche n° ${esc(String(o.id || ''))}</div></div>
                <div class="fid-head-side">${o._offline ? FicheUI.badge('🚧 Hors ligne') : ''}${roBadge}<button onclick="app.Orgs.remove(${i})" title="${delTitle}" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:var(--text-sec);">🗑</button></div>
            </div>`;

            // Colonne gauche : IDENTITE (type + fiche structure).
            let typeField = '';
            if(!linked) {
                typeField = FicheUI.field('Type de structure', `<select onchange="app.Orgs.update(${i}, 'type', this.value)" class="actor-input">
                    <option value="ent"${o.type !== 'asso' ? ' selected' : ''}>🏢 Entreprise</option>
                    <option value="asso"${o.type === 'asso' ? ' selected' : ''}>🏛️ Association</option></select>`);
            }
            const st = 'width:100%; box-sizing:border-box; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main);';
            const inp = (key) => `<input type="text" value="${esc(fc[key] || '')}" onchange="app.Orgs.updateFiche(${i}, '${key}', this.value)" style="${st}">`;
            const F = FicheUI.field;
            let idHtml, ctHtml, rxHtml;
            if(linked) {
                const roRow = (ic, label, val) => val ? `<div style="display:flex; gap:8px; font-size:0.88rem; padding:2px 0;"><span style="opacity:0.7; flex:0 0 18px;">${ic}</span><span style="color:var(--text-sec); flex:0 0 96px;">${label}</span><span style="color:var(--text-main); word-break:break-word;">${esc(val)}</span></div>` : '';
                const href = (u) => esc(u.indexOf('http') === 0 ? u : 'https://' + u);
                const link = (ic, label, u) => u ? `<div style="display:flex; gap:8px; font-size:0.88rem; padding:2px 0;"><span style="opacity:0.7; flex:0 0 18px;">${ic}</span><span style="color:var(--text-sec); flex:0 0 96px;">${label}</span><a href="${href(u)}" target="_blank" rel="noopener" style="color:var(--primary); word-break:break-all;">${esc(u)}</a></div>` : '';
                const social = [['Facebook', fc.facebook], ['Instagram', fc.instagram], ['LinkedIn', fc.linkedin], ['YouTube', fc.youtube], ['Vimeo', fc.vimeo], ['IMDb', fc.imdb]].filter(sx => sx[1]);
                const box = (inner) => inner ? `<div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px;">${inner}</div>` : '';
                idHtml = box(roRow('🏷\uFE0F', 'Type', fc.type) + roRow('🔢', (fc.kind === 'asso' ? 'RNA / SIRET' : 'SIRET'), fc.siret) + roRow('\u2696\uFE0F', 'Forme', fc.legalForm) + roRow('📅', 'Ann\u00e9e', fc.year) + roRow('👥', (fc.kind === 'asso' ? 'Membres' : 'Effectif'), fc.size) + roRow('👤', (fc.kind === 'asso' ? 'Pr\u00e9sident\u00b7e' : 'Dirigeant\u00b7e'), fc.leader) + (fc.mission ? `<div style="font-size:0.88rem; color:var(--text-main); white-space:pre-wrap; margin-top:4px;">${esc(fc.mission)}</div>` : '') + roRow('🛠\uFE0F', 'Activit\u00e9s', fc.activities) + roRow('\u2728', 'Services', fc.services));
                ctHtml = box(roRow('🧑', 'Contact', fc.contactPerson) + roRow('📧', 'Email', fc.email) + roRow('\u260E\uFE0F', 'T\u00e9l\u00e9phone', fc.phone) + roRow('📍', 'Si\u00e8ge', fc.hq) + link('🌐', 'Site', fc.website));
                rxHtml = box(link('🎬', 'D\u00e9mo', fc.demoreel) + (social.length ? `<div style="border-top:1px solid var(--border); margin-top:6px; padding-top:6px; font-size:0.82rem;">` + social.map(sx => `<a href="${href(sx[1])}" target="_blank" rel="noopener" style="color:var(--primary);">${sx[0]}</a>`).join(' \u00b7 ') + `</div>` : ''));
            } else {
                idHtml = typeField
                       + F((fc.kind === 'asso' ? '🔢 RNA / SIRET' : '🔢 SIRET'), inp('siret'))
                       + (fc.kind === 'ent' ? F('\u2696\uFE0F Forme juridique', inp('legalForm')) : '')
                       + F('📅 Ann\u00e9e de cr\u00e9ation', inp('year'))
                       + F((fc.kind === 'asso' ? '👥 Nb de membres' : '👥 Effectif'), inp('size'))
                       + F((fc.kind === 'asso' ? '👤 Pr\u00e9sident\u00b7e' : '👤 Dirigeant\u00b7e'), inp('leader'))
                       + F((fc.kind === 'asso' ? 'Mission / objet' : 'Description'), `<textarea onchange="app.Orgs.updateFiche(${i}, 'mission', this.value)" style="${st} min-height:44px; resize:vertical;">${esc(fc.mission || '')}</textarea>`)
                       + F('🛠\uFE0F Activit\u00e9s / prestations', `<textarea onchange="app.Orgs.updateFiche(${i}, 'activities', this.value)" style="${st} min-height:40px; resize:vertical;">${esc(fc.activities || '')}</textarea>`);
                ctHtml = F('📧 Email de contact', inp('email'))
                       + F('\u260E\uFE0F T\u00e9l\u00e9phone', inp('phone'))
                       + F('🌐 Site internet', inp('website'))
                       + F('📍 Si\u00e8ge / adresse', inp('hq'))
                       + F('🧑 Personne \u00e0 contacter', inp('contactPerson'));
                rxHtml = F('🎬 Bande d\u00e9mo (URL YouTube / Vimeo)', inp('demoreel'))
                       + (fc.demoreel ? `<div style="margin:2px 0 8px;"><iframe src="${ProfileRenderer.getEmbedUrl(fc.demoreel)}" width="100%" height="180" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe></div>` : '')
                       + F('📘 Facebook', inp('facebook')) + F('📷 Instagram', inp('instagram')) + F('\u25B6\uFE0F YouTube', inp('youtube')) + F('💼 LinkedIn', inp('linkedin'))
                       + (fc.kind === 'ent' ? F('🎞\uFE0F Vimeo', inp('vimeo')) + F('🎬 IMDb', inp('imdb')) : '');
            }

            // Colonne droite : SUR CE PROJET (departement -> fonction + notes) + couts.
            const deptId = o.department || '';
            const roles = Orgs._rolesFor(deptId);
            const showFree = !!o.roleCustom || (!!o.role && roles.indexOf(o.role) === -1);
            const roleSel = showFree ? 'Autre' : (o.role || '');
            const roleOpts = `<option value="">— Fonction —</option>` + roles.map(r => `<option value="${esc(r)}"${r === roleSel ? ' selected' : ''}>${esc(r)}</option>`).join('');
            const project = F('Département', `<select onchange="app.Orgs.setDept(${i}, this.value)" style="${st}">${Orgs._deptOptions(deptId)}</select>`)
                + F('Fonction', `<select onchange="app.Orgs.onRoleChange(${i}, this.value)" style="${st}">${roleOpts}</select>`)
                + (showFree ? F('Préciser la fonction', `<input type="text" value="${esc(o.role || '')}" onchange="app.Orgs.update(${i}, 'role', this.value)" style="${st}">`) : '')
                + F('Notes projet', `<textarea placeholder="Périmètre, devis, dates..." data-tooltip="Périmètre, devis, dates..." onchange="app.Orgs.update(${i}, 'notes', this.value)" style="${st} min-height:50px; resize:vertical;">${esc(o.notes || '')}</textarea>`);

            const footer = `<div style="font-size:0.78rem; color:var(--text-sec);">${icon} ${o.srcId ? 'Importée des partenaires de la Présentation' : (linked ? 'Fiche liée à l\u2019Univers' : 'Structure ajoutée manuellement')}</div>`;

            const oblocks = [];
            // Brique « Sur ce projet » — epinglee a droite (une structure
            // n'apparait pas dans des scenes, c'est le lien projet qui prime).
            oblocks.push(FicheUI.block('org', 'projet', '🎬 Sur ce projet', project + UI.renderCost('org', o.id), { pin: 'right' }));
            // Briques structure splittees en onglets (comme comedien/technicien).
            oblocks.push(FicheUI.block('org', 'fiche', '🏛️ Identité', idHtml));
            if(ctHtml) oblocks.push(FicheUI.block('org', 'contact', '📇 Contact', ctHtml));
            if(rxHtml) oblocks.push(FicheUI.block('org', 'reseaux', '🔗 Présence & réseaux', rxHtml));
            // Brique « Origine » (petite ligne d'info).
            oblocks.push(FicheUI.block('org', 'origine', 'ℹ️ Origine', footer));

            return `<div class="data-card fid-card chub-card" style="max-width:none; margin:0; box-shadow:none; padding:0;">
                ${head}
                ${FicheBlocks.renderTabbed(oblocks, 'org')}
            </div>`;
    },
    openExportModal: () => {
        const list = Orgs._list();
        if(!list.length) { Utils.toast('Aucune structure à exporter', 'warning'); return; }
        Actions.openExportModal('orgs');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'orgs');
        });
    },
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        opts.mode = opts.mode || 'list';
        const isCard = opts.mode === 'card';
        const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const usableWidth = pageWidth - margin * 2;
        const cleanT = (t) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');

        const list = Orgs._list();
        if(!list.length) { Utils.toast('Aucune structure à exporter', 'warning'); return; }
        const orgGroups = (state.data.groups || []).filter(g => g.type === 'org');

        let photoMap = {};
        if(opts.mode !== 'list' && typeof FichesPDF !== 'undefined' && FichesPDF._preloadImages) {
            photoMap = await FichesPDF._preloadImages(list.map(o => Orgs._fiche(o).logo).filter(Boolean));
        }

        if(opts.includeCover !== false) {
            if(typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) FichesPDF._drawCoverPage(doc, 'Asso / Entreprises');
            else if(typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) PdfTheme.coverPage(doc, { sectionName: 'Asso / Entreprises' });
            doc.addPage();
        }
        let y = margin;
        const ensureSpace = (h) => { if(y + h > pageHeight - margin) { doc.addPage(); y = margin; } };

        const grouped = {};
        list.forEach(o => { const gid = (o.group_id && orgGroups.find(g => g.id === o.group_id)) ? o.group_id : 'orphan'; (grouped[gid] = grouped[gid] || []).push(o); });
        const groupOrder = orgGroups.map(g => g.id).filter(id => grouped[id]);
        if(grouped['orphan']) groupOrder.push('orphan');

        const drawGroupHeader = (name, count) => {
            ensureSpace(14);
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                            title: cleanT(name), right: String(count),
                                            accent: PdfTheme.accentFor('Asso / Entreprises') });
        };

        const drawPhoto = (url, x, py, w, h) => {
            if(typeof FichesPDF !== 'undefined' && FichesPDF._drawPhotoOrPlaceholder) FichesPDF._drawPhotoOrPlaceholder(doc, url, x, py, w, h);
            else { doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT); doc.rect(x, py, w, h, 'F'); }
        };

        const renderDetailed = (o) => {
            const fc = Orgs._fiche(o);
            ensureSpace(48);
            const photoW = 28, photoH = 36;
            drawPhoto(fc.logo ? photoMap[fc.logo] : null, margin, y, photoW, photoH);
            const textX = margin + photoW + 5;
            const textWidth = usableWidth - photoW - 7;
            let ty = y + 5;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(cleanT(fc.name || o.name) || '(sans nom)', textX, ty);
            ty += 5;
            doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            doc.text([orgType(o), cleanT(fc.type)].filter(Boolean).join('  ·  '), textX, ty); ty += 4.4;
            const legalBits = [];
            if(fc.siret) legalBits.push((fc.kind === 'asso' ? 'RNA/SIRET : ' : 'SIRET : ') + cleanT(fc.siret));
            if(fc.legalForm) legalBits.push('Forme : ' + cleanT(fc.legalForm));
            if(fc.year) legalBits.push('Année : ' + cleanT(fc.year));
            if(fc.size) legalBits.push((fc.kind === 'asso' ? 'Membres : ' : 'Effectif : ') + cleanT(fc.size));
            if(fc.leader) legalBits.push((fc.kind === 'asso' ? 'Président·e : ' : 'Dirigeant·e : ') + cleanT(fc.leader));
            if(legalBits.length) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.splitTextToSize(legalBits.join('   ·   '), textWidth).slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.6; });
            }
            const contactBits = [];
            if(fc.email) contactBits.push('Email : ' + fc.email);
            if(fc.phone) contactBits.push('Tél : ' + fc.phone);
            if(fc.hq) contactBits.push('Siège : ' + cleanT(fc.hq));
            if(contactBits.length) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.splitTextToSize(contactBits.join('   ·   '), textWidth).slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            if(fc.mission) {
                doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.splitTextToSize(cleanT(fc.mission), textWidth).slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.4; });
            }
            if(o.role) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                doc.text('Sur le projet : ' + cleanT(o.role), textX, ty); ty += 3.6;
            }
            const actualH = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualH);
            y += actualH + 3;
        };

        const renderCard = (o) => {
            const fc = Orgs._fiche(o);
            const photoUrl = fc.logo ? photoMap[fc.logo] : null;
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 16, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text(orgType(o).toUpperCase(), margin, 11);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
            doc.text(cleanT(state.data.title || ''), pageWidth - margin, 11, { align: 'right' });
            const photoW2 = 75, photoH2 = 100;
            const photoX = margin, photoY = 28;
            drawPhoto(photoUrl, photoX, photoY, photoW2, photoH2);
            const infoX = photoX + photoW2 + 12;
            const infoW = pageWidth - infoX - margin;
            let iy = photoY + 6;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.splitTextToSize(cleanT(fc.name || o.name) || '(sans nom)', infoW).forEach(l => { doc.text(l, infoX, iy); iy += 8; });
            iy += 2;
            if(fc.type) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('ACTIVITÉ', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                doc.text(cleanT(fc.type), infoX, iy); iy += 7;
            }
            const idBits = [];
            if(fc.siret) idBits.push((fc.kind === 'asso' ? 'RNA/SIRET : ' : 'SIRET : ') + cleanT(fc.siret));
            if(fc.legalForm) idBits.push('Forme : ' + cleanT(fc.legalForm));
            if(fc.year) idBits.push('Année : ' + cleanT(fc.year));
            if(fc.size) idBits.push((fc.kind === 'asso' ? 'Membres : ' : 'Effectif : ') + cleanT(fc.size));
            if(fc.leader) idBits.push((fc.kind === 'asso' ? 'Président·e : ' : 'Dirigeant·e : ') + cleanT(fc.leader));
            if(idBits.length) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('IDENTIFICATION', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                idBits.forEach(b => { doc.splitTextToSize(b, infoW).forEach(l => { doc.text(l, infoX, iy); iy += 4.2; }); });
                iy += 3;
            }
            const contactBits = [];
            if(fc.email) contactBits.push('Email : ' + fc.email);
            if(fc.phone) contactBits.push('Tél : ' + fc.phone);
            if(fc.contactPerson) contactBits.push('Contact : ' + cleanT(fc.contactPerson));
            if(fc.hq) contactBits.push('Siège : ' + cleanT(fc.hq));
            if(fc.website) contactBits.push('Site : ' + fc.website);
            if(contactBits.length) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('CONTACT', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                contactBits.forEach(b => { doc.splitTextToSize(b, infoW).slice(0, 2).forEach(l => { doc.text(l, infoX, iy); iy += 4.2; }); });
                iy += 3;
            }
            if(fc.mission) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text(fc.kind === 'asso' ? 'MISSION / OBJET' : 'DESCRIPTION', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                doc.splitTextToSize(cleanT(fc.mission), infoW).forEach(l => { if(iy < pageHeight - 40) { doc.text(l, infoX, iy); iy += 4.2; } });
            }
            const bottomY = pageHeight - 30;
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('SUR LE PROJET', margin, bottomY);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.text(cleanT(o.role) || '—', margin, bottomY + 5);
            const rightX = pageWidth / 2 + 5;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('GROUPE', rightX, bottomY);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const grp = orgGroups.find(g => g.id === o.group_id);
            doc.text(grp ? cleanT(grp.name) : 'Non classé', rightX, bottomY + 5);
        };

        const orgType = (o) => (Orgs._fiche(o).kind === 'asso') ? 'Association' : 'Entreprise';
        const orgContact = (o) => { const fc = Orgs._fiche(o); return fc.email || fc.phone || fc.contactPerson || ''; };

        const renderList = (items) => {
            const lineH = 5.5;
            ensureSpace(lineH);
            doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
            doc.rect(margin, y, usableWidth, lineH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            const colsW = [usableWidth * 0.30, usableWidth * 0.18, usableWidth * 0.32, usableWidth * 0.20];
            const colsX = [margin];
            for(let i = 1; i < colsW.length; i++) colsX.push(colsX[i-1] + colsW[i-1]);
            doc.text('Nom', colsX[0] + 1, y + 3.8);
            doc.text('Type', colsX[1] + 1, y + 3.8);
            doc.text('Contact', colsX[2] + 1, y + 3.8);
            doc.text('Fonction', colsX[3] + 1, y + 3.8);
            y += lineH + 1;
            items.forEach(o => {
                ensureSpace(lineH);
                const fc = Orgs._fiche(o);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                let txtName = cleanT(fc.name || o.name) || '(sans nom)';
                while(doc.getTextWidth(txtName) > colsW[0] - 2 && txtName.length > 4) txtName = txtName.substring(0, txtName.length - 2) + '…';
                doc.text(txtName, colsX[0] + 1, y + 3.8);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(orgType(o), colsX[1] + 1, y + 3.8);
                let txtContact = cleanT(orgContact(o)) || '—';
                while(doc.getTextWidth(txtContact) > colsW[2] - 2 && txtContact.length > 5) txtContact = txtContact.substring(0, txtContact.length - 2) + '…';
                doc.text(txtContact, colsX[2] + 1, y + 3.8);
                let txtRole = cleanT(o.role) || '—';
                while(doc.getTextWidth(txtRole) > colsW[3] - 2 && txtRole.length > 3) txtRole = txtRole.substring(0, txtRole.length - 2) + '…';
                doc.text(txtRole, colsX[3] + 1, y + 3.8);
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT); doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(margin, y + lineH, margin + usableWidth, y + lineH);
                doc.setLineDashPattern([], 0);
                y += lineH;
            });
            y += 2;
        };

        if(opts.mode === 'card') {
            list.forEach((o, idx) => { if(idx > 0) doc.addPage(); renderCard(o); });
        } else {
        groupOrder.forEach((gid) => {
            const grp = orgGroups.find(g => g.id === gid);
            drawGroupHeader(grp ? grp.name : 'Non classé', grouped[gid].length);
            if(opts.mode === 'list') renderList(grouped[gid]);
            else grouped[gid].forEach(o => renderDetailed(o));
            y += 2;
        });
        }

        if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        else if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });

        if(opts.returnBlob) return doc.output('blob');
        doc.save((typeof PdfTheme !== 'undefined' && PdfTheme.filename) ? PdfTheme.filename('Asso Entreprises') : `${state.data.title || 'Projet'} - Asso Entreprises - moteur.studio.pdf`);
    }
};
if(typeof window !== 'undefined') window.Orgs = Orgs;
