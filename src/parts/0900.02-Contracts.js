
const Contracts = {
    // ===================== STORE CONTRATS (Lot 0 : modèle + persistance) =====================
    // Un contrat = { id, partyType, partyId, partyName, type, status, title, blocks[], createdAt, updatedAt }
    // partyType : 'actor' | 'crew' | 'org'   —   type : 'image' | 'cddu' | 'prestation' | 'benevole'
    // status : 'draft' | 'to_sign' | 'signed' | 'archived'
    store: {
        all: () => { if(!Array.isArray(state.data.contracts)) state.data.contracts = []; return state.data.contracts; },
        get: (id) => Contracts.store.all().find(ct => ct.id === id) || null,
        forParty: (partyType, partyId) => Contracts.store.all().filter(ct => ct.partyType === partyType && ct.partyId === partyId),
        create: (data) => {
            const ct = {
                id: 'ctr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                partyType: data.partyType || null, partyId: data.partyId || null, partyName: data.partyName || '',
                type: data.type || 'image', status: data.status || 'draft', title: data.title || '',
                blocks: Array.isArray(data.blocks) ? data.blocks : [],
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            Contracts.store.all().push(ct); Store.save(); return ct;
        },
        upsert: (ct) => {
            if(!ct || !ct.id) return null;
            const list = Contracts.store.all();
            const idx = list.findIndex(x => x.id === ct.id);
            ct.updatedAt = new Date().toISOString();
            if(idx === -1) list.push(ct); else list[idx] = ct;
            Store.save(); return ct;
        },
        remove: (id) => {
            const list = Contracts.store.all();
            const idx = list.findIndex(x => x.id === id);
            if(idx === -1) return false;
            list.splice(idx, 1); Store.save(); return true;
        },
        setStatus: (id, status) => {
            const ct = Contracts.store.get(id);
            if(!ct) return null;
            ct.status = status; ct.updatedAt = new Date().toISOString(); Store.save(); return ct;
        }
    },

    // ===================== MES MODÈLES (Chantier 3) =====================
    // Scope projet : state.data.contractTemplates (sync Store) — scope global :
    // localStorage moteur_contract_templates, sync multi-appareils via PreferencesSync.
    // Suppression locale d'un modèle global = masquage via contractTemplatesHidden.
    tpl: {
        KEY: 'moteur_contract_templates',
        proj: () => { if(!Array.isArray(state.data.contractTemplates)) state.data.contractTemplates = []; return state.data.contractTemplates; },
        hidden: () => { if(!Array.isArray(state.data.contractTemplatesHidden)) state.data.contractTemplatesHidden = []; return state.data.contractTemplatesHidden; },
        glob: () => { try { return JSON.parse(localStorage.getItem(Contracts.tpl.KEY) || '[]') || []; } catch(e) { return []; } },
        saveGlob: (list) => {
            const json = JSON.stringify(list || []);
            const PS = (typeof window !== 'undefined' && window.app && window.app.PreferencesSync) ? window.app.PreferencesSync : (typeof PreferencesSync !== 'undefined' ? PreferencesSync : null);
            if(PS && PS.save) PS.save(Contracts.tpl.KEY, json);
            else { try { localStorage.setItem(Contracts.tpl.KEY, json); } catch(e) {} }
        },
        list: () => {
            const hid = Contracts.tpl.hidden();
            return Contracts.tpl.glob().filter(t => hid.indexOf(t.id) === -1).map(t => ({ t: t, scope: 'glob' }))
                .concat(Contracts.tpl.proj().map(t => ({ t: t, scope: 'proj' })));
        }
    },
    _tplPendingSave: null,
    _tplOpts: null,
    saveAsTemplate: () => {
        if(!Contracts._editing) return;
        Contracts._persist();
        const ct = Contracts.store.get(Contracts._editing); if(!ct) return;
        const name = prompt('Nom du modèle :', ct.title || '');
        if(!name || !name.trim()) return;
        Contracts._tplPendingSave = { name: name.trim(), type: ct.type || 'image', body: ct.body || '' };
        Contracts._tplModal('Enregistrer le modèle « ' + Utils.escape(name.trim()) + ' » :', [
            { label: '📁 Que pour ce projet', fn: () => Contracts.tplCommitSave('proj') },
            { label: '🌐 Pour tous mes projets', fn: () => Contracts.tplCommitSave('glob') }
        ]);
    },
    tplCommitSave: (scope) => {
        const p = Contracts._tplPendingSave; Contracts._tplPendingSave = null;
        if(!p) return;
        const t = { id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: p.name, type: p.type, body: p.body, createdAt: new Date().toISOString() };
        if(scope === 'glob') { const l = Contracts.tpl.glob(); l.push(t); Contracts.tpl.saveGlob(l); }
        else { Contracts.tpl.proj().push(t); Store.save(); }
        Utils.toast(scope === 'glob' ? 'Modèle enregistré pour tous tes projets' : 'Modèle enregistré pour ce projet', 'success');
    },
    newFromTemplate: (scope, id) => {
        if(!Contracts._sel) return;
        const arr = scope === 'glob' ? Contracts.tpl.glob() : Contracts.tpl.proj();
        const t = arr.find(x => x.id === id); if(!t) return;
        Contracts._pickerOpen = false;
        Contracts.openEditor(Contracts._sel.partyType, Contracts._sel.idx, t.type || 'image', t.body || '', t.name || '');
        Contracts.renderHub();
    },
    removeTemplate: async (scope, id) => {
        if(scope === 'proj') {
            if(!(await ConfirmModal.confirmDelete('Ce modèle sera supprimé de ce projet. Cette action est définitive.', 'Supprimer ce modèle ?'))) return;
            const l = Contracts.tpl.proj(); const i = l.findIndex(x => x.id === id);
            if(i > -1) { l.splice(i, 1); Store.save(); }
            Contracts.renderHub();
        } else {
            Contracts._tplModal('Ce modèle est disponible dans tous tes projets. Le supprimer :', [
                { label: '📁 Que pour ce projet', fn: () => { const h = Contracts.tpl.hidden(); if(h.indexOf(id) === -1) { h.push(id); Store.save(); } Contracts.renderHub(); } },
                { label: '🌐 Pour tous mes projets', fn: () => { const l = Contracts.tpl.glob(); const i = l.findIndex(x => x.id === id); if(i > -1) { l.splice(i, 1); Contracts.tpl.saveGlob(l); } Contracts.renderHub(); } }
            ]);
        }
    },
    _tplModal: (msg, opts) => {
        const old = document.getElementById('ctr-tpl-modal'); if(old) old.remove();
        Contracts._tplOpts = opts;
        const m = document.createElement('div');
        m.className = 'contracts-modal'; m.id = 'ctr-tpl-modal';
        m.onclick = (e) => { if(e.target === m) m.remove(); };
        m.innerHTML = '<div class="contracts-box" style="max-width:420px;">'
            + '<div class="contracts-header"><h3>📑 Modèle de contrat</h3><button class="history-close-btn" onclick="document.getElementById(\'ctr-tpl-modal\').remove()">✕</button></div>'
            + '<div style="padding:18px;"><p style="margin:0 0 14px;">' + msg + '</p>'
            + opts.map((o, i) => '<button class="ctr-pal-btn" style="display:block; width:100%; margin-bottom:8px;" onclick="app.Contracts._tplPick(' + i + ')">' + o.label + '</button>').join('')
            + '</div></div>';
        document.body.appendChild(m);
    },
    _tplPick: (i) => {
        const o = (Contracts._tplOpts || [])[i];
        const m = document.getElementById('ctr-tpl-modal'); if(m) m.remove();
        Contracts._tplOpts = null;
        if(o && o.fn) o.fn();
    },

    // ===================== DEUX VUES DANS L'ONGLET (8e, 25 aout) =====================
    // L'onglet melangeait deux usages dans un seul ecran : consulter les contrats
    // existants (qui vivait dans une FENETRE, donc invisible tant qu'on ne
    // cliquait pas un bouton perdu dans la barre de tri) et en fabriquer un
    // (les trois colonnes). Ce sont deux moments de travail differents, ils ont
    // desormais chacun leur sous-onglet. « Mes contrats » ouvre en premier :
    // arriver dans l'onglet, c'est le plus souvent venir relire ou reprendre un
    // contrat, pas en creer un de zero.
    _view: 'list',
    setView: (v) => {
        if(Contracts._editing) Contracts._persist();
        Contracts._view = (v === 'hub') ? 'hub' : 'list';
        Contracts.renderTab();
    },
    renderTab: () => {
        const isHub = Contracts._view === 'hub';
        const bl = document.getElementById('ctr-viewbtn-list');
        const bh = document.getElementById('ctr-viewbtn-hub');
        if(bl) bl.classList.toggle('fds-tabbtn-active', !isHub);
        if(bh) bh.classList.toggle('fds-tabbtn-active', isHub);
        const sub = document.getElementById('contracts-subtitle');
        if(sub) sub.textContent = isHub
            ? 'Toutes les personnes du projet (comédien·nes, technicien·nes et structures), une carte par personne avec l\u2019ensemble de ses fonctions. Choisis le contrat à générer.'
            : 'Tous les contrats de ce projet. Clique sur une carte pour l\u2019ouvrir dans l\u2019éditeur.';
        const hostList = document.getElementById('contracts-list');
        const hostHub = document.getElementById('contracts-hub');
        if(hostList) hostList.style.display = isHub ? 'none' : 'block';
        if(hostHub) hostHub.style.display = isHub ? 'block' : 'none';
        if(isHub) Contracts.renderHub();
        else Contracts.renderList();
    },
    // Grille de toutes les fiches contrat du projet. Meme format compact que
    // Comediens / Techniciens / Ressources. Clic = ouvrir dans l'editeur, ce qui
    // bascule sur l'autre sous-onglet.
    // TROIS CLASSEMENTS (25 aout) : par nom de personne, par type de contrat, par
    // statut. Le tri par defaut etait « le plus recemment modifie en premier »,
    // pratique pour reprendre son travail mais inutilisable pour retrouver un
    // contrat precis dans une liste de trente. Les sections reprennent le format
    // des groupes des autres onglets (.group-section / .group-header), et un
    // classement vide n'affiche pas de section vide.
    _listSort: 'alpha',
    setListSort: (mode) => { Contracts._listSort = mode; Contracts.renderList(); },
    // Categorie de metier d'un contrat, deduite de la personne signataire, avec
    // les memes regles que la colonne de gauche du sous-onglet de creation :
    // un contrat n'a pas de metier a lui, il herite de celui de sa partie.
    // Une partie supprimee depuis tombe dans « Autres » plutot que de faire
    // disparaitre son contrat de la liste.
    _partyCategory: (ct) => {
        const t = ct.partyType;
        if(t === 'org') return 'Structures';
        if(t === 'figurant') return 'Figurants';
        if(t === 'actor') {
            const a = (state.data.actors || []).find(x => x && x.id === ct.partyId);
            if(!a) return 'Autres';
            const figIds = (state.data.groups || []).filter(g => g.type === 'actor' && /figuration/i.test(g.name || '')).map(g => g.id);
            return figIds.includes(a.group_id) ? 'Figurants' : 'Comédien·ne';
        }
        if(t === 'crew') {
            const c = (state.data.crew || []).find(x => x && x.id === ct.partyId);
            if(!c) return 'Autres';
            if(!c.department) return 'Équipe technique';
            const g = (state.data.groups || []).find(x => x.id === c.department);
            return g ? g.name : 'Équipe technique';
        }
        return 'Autres';
    },
    _cardHTML: (ct) => {
        const esc = Utils.escape;
        const typeIcon = { image: '📸', cddu: '📋', prestation: '📄', benevole: '❤️' };
        const tlabel = Contracts._typeLabel[ct.type] || ct.type;
        const slabel = Contracts._statusLabel[ct.status] || ct.status;
        const title = ct.title ? esc(ct.title) : tlabel;
        const actions = '<div class="compact-card-actions">'
            + '<button class="edit-btn" title="Exporter en PDF" onclick="event.stopPropagation(); app.Contracts.exportPDF(\'' + ct.id + '\')">📄</button>'
            + '<button class="merge-btn" title="Dupliquer" onclick="event.stopPropagation(); app.Contracts.duplicate(\'' + ct.id + '\')">📋</button>'
            + '<button class="delete-btn" title="Supprimer" onclick="event.stopPropagation(); app.Contracts.removeContract(\'' + ct.id + '\')">🗑️</button>'
            + '</div>';
        // v601 : la carte de la liste dit de quel contrat elle parle, pour que
        // le cadenas s'y pose comme sur les trois colonnes.
        return '<div class="compact-card" data-fiche="contract:' + esc(String(ct.id)) + '" onclick="app.Contracts.openFromList(\'' + ct.id + '\')">'
            + actions
            + '<div class="compact-card-photo">' + (typeIcon[ct.type] || '📄') + '</div>'
            + '<div class="compact-card-name">' + title + '</div>'
            + '<div class="compact-card-role">' + esc(ct.partyName || '—') + '</div>'
            + '<div class="ctr-card-badge"><span class="ctr-badge ctr-badge-' + (ct.status || 'draft') + '">' + slabel + '</span></div>'
            + '</div>';
    },
    renderList: () => {
        const host = document.getElementById('contracts-list');
        if(!host) return;
        const esc = Utils.escape;
        const all = (Contracts.store.all() || []).slice();
        if(!all.length) {
            host.innerHTML = '<div class="ccol-empty" style="padding:50px 20px;">Aucun contrat sur ce projet. Passe par « ✏️ Créer un contrat » pour en fabriquer un.</div>';
            return;
        }
        const mode = Contracts._listSort || 'alpha';
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (mode === 'alpha' ? 'active' : '') + '" title="Par nom de la personne ou de la structure" onclick="app.Contracts.setListSort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (mode === 'type' ? 'active' : '') + '" title="Par nature du contrat" onclick="app.Contracts.setListSort(\'type\')">Par catégorie</button>'
            + '<button class="chub-sort-btn ' + (mode === 'metier' ? 'active' : '') + '" title="Par métier de la personne signataire" onclick="app.Contracts.setListSort(\'metier\')">Par métier</button>'
            + '<button class="chub-sort-btn ' + (mode === 'status' ? 'active' : '') + '" title="Brouillon, à signer, signé, archivé" onclick="app.Contracts.setListSort(\'status\')">Par statut</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + all.length + ' contrat' + (all.length > 1 ? 's' : '') + '</span></div>';
        
        const byName = (a, b) => String(a.partyName || '').localeCompare(String(b.partyName || ''), 'fr')
            || String(a.title || '').localeCompare(String(b.title || ''), 'fr');
        let body;
        if(mode === 'alpha') {
            body = '<div class="compact-cards-grid">' + all.sort(byName).map(Contracts._cardHTML).join('') + '</div>';
        } else if(mode === 'metier') {
            // Les metiers ne sont pas une liste fermee (les groupes d'equipe sont
            // crees par l'utilisateur) : les sections sont donc alphabetiques,
            // « Autres » repousse en fin de liste.
            const groups = {};
            all.forEach(ct => { const k = Contracts._partyCategory(ct); (groups[k] = groups[k] || []).push(ct); });
            const cats = Object.keys(groups).sort((a, b) => {
                if(a === 'Autres') return 1;
                if(b === 'Autres') return -1;
                return a.localeCompare(b, 'fr');
            });
            body = cats.map(k =>
                '<div class="group-section"><div class="group-header">' + esc(k)
                    + '<span class="ccol-group-count">' + groups[k].length + '</span></div>'
                + '<div class="compact-cards-grid">' + groups[k].sort(byName).map(Contracts._cardHTML).join('') + '</div></div>'
            ).join('');
        } else {
            // L'ordre des sections est fixe et voulu : les categories suivent
            // l'ordre de la palette de creation, les statuts suivent le cycle de
            // vie d'un contrat (on ecrit, on fait signer, on archive).
            const keys = mode === 'type'
                ? ['image', 'cddu', 'prestation', 'benevole']
                : ['draft', 'to_sign', 'signed', 'archived'];
            const labels = mode === 'type' ? Contracts._typeLabel : Contracts._statusLabel;
            const field = mode === 'type' ? 'type' : 'status';
            const fallback = mode === 'type' ? 'image' : 'draft';
            const groups = {};
            all.forEach(ct => { const k = keys.indexOf(ct[field]) > -1 ? ct[field] : fallback; (groups[k] = groups[k] || []).push(ct); });
            body = keys.filter(k => groups[k] && groups[k].length).map(k =>
                '<div class="group-section"><div class="group-header">' + esc(labels[k] || k)
                    + '<span class="ccol-group-count">' + groups[k].length + '</span></div>'
                + '<div class="compact-cards-grid">' + groups[k].sort(byName).map(Contracts._cardHTML).join('') + '</div></div>'
            ).join('');
        }
        host.innerHTML = toolbar + body;
    },
    // La fenetre « Mes contrats » n'existe plus : le nom est conserve parce que
    // duplicate() et le reste du module l'appellent, il renvoie maintenant vers
    // le sous-onglet.
    openList: () => { Contracts._view = 'list'; Contracts.renderTab(); },

    // ===================== HUB ADMIN > CONTRATS =====================
    // Grille de toutes les personnes du projet, dedupliquees, avec toutes leurs fonctions.
    renderHub: () => {
        const host = document.getElementById('contracts-hub');
        if(!host) return;
        const esc = Utils.escape;
        const characters = state.data.characters || [];
        const people = [];
        const byKey = {};
        const add = (key, name, func, ref, category, avatar, icon, id) => {
            if(!byKey[key]) { byKey[key] = { key: key, name: name, funcs: [], ref: ref, category: category || 'Autres', avatar: avatar || '', icon: icon || '👤', id: id || null }; people.push(byKey[key]); }
            else if(!byKey[key].avatar && avatar) byKey[key].avatar = avatar;
            if(func && byKey[key].funcs.indexOf(func) === -1) byKey[key].funcs.push(func);
        };
        const figGroupIds = (state.data.groups || []).filter(g => g.type === 'actor' && /figuration/i.test(g.name || '')).map(g => g.id);
        (state.data.actors || []).forEach((a, i) => {
            if(!a.name) return;
            const roles = characters.filter(c => c.actor_id === a.id).map(c => c.name).filter(Boolean);
            add('actor:' + (a.id || a.name), a.name, '🎭 Comédien·ne' + (roles.length ? ' — ' + roles.join(', ') : ''), { t: 'actor', i: i }, 'Comédien·ne', a.photo, '🎭', a.id);
            if(figGroupIds.includes(a.group_id)) add('figurant:' + (a.id || a.name), a.name, '🎭 Figurant·e', { t: 'figurant', i: i }, 'Figurants', a.photo, '🎭', a.id);
        });
        const groupName = (gid) => { const g = (state.data.groups || []).find(x => x.id === gid); return g ? g.name : (gid || 'Équipe technique'); };
        (state.data.crew || []).forEach((c, i) => {
            if(!c.name) return;
            add('crew:' + (c.id || c.name), c.name, '🎥 ' + (c.role || 'Technicien·ne'), { t: 'crew', i: i }, (c.department ? groupName(c.department) : 'Équipe technique'), c.photo, '🎥', c.id);
        });
        (state.data.orgs || []).forEach((o, i) => {
            const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(o) : (o.fiche || o);
            const nm = (fc && fc.name) || o.name || '';
            if(!nm) return;
            const icon = o.type === 'asso' ? '🏛️' : '🏢';
            add('org:' + (o.id || nm), nm, icon + ' ' + (o.type === 'asso' ? 'Association' : 'Entreprise'), { t: 'org', i: i }, 'Structures', (fc && fc.logo) || '', icon, o.id);
        });
       
        people.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        const sortMode = Contracts._hubSort || 'alpha';
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Trier :</span>'
            + '<button class="chub-sort-btn ' + (sortMode === 'alpha' ? 'active' : '') + '" onclick="app.Contracts.setHubSort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'metier' ? 'active' : '') + '" onclick="app.Contracts.setHubSort(\'metier\')">Par métier</button></div>';
        const dotHTML = (p) => {
            const cs = (Contracts.store.forParty(p.ref.t, p.id) || []);
            if(!cs.length) return '<span class="ccol-dots"><span class="ccol-dot ccol-dot-none" title="Aucun contrat">0</span></span>';
            const order = ['draft','to_sign','signed','archived'];
            const counts = {};
            cs.forEach(c => { const s = c.status || 'draft'; counts[s] = (counts[s] || 0) + 1; });
            return '<span class="ccol-dots">' + order.filter(s => counts[s]).map(s => '<span class="ccol-dot ccol-dot-' + s + '" title="' + (Contracts._statusLabel[s] || s) + ' : ' + counts[s] + '">' + counts[s] + '</span>').join('') + '</span>';
        };
        const itemHTML = (p) => {
            const sel = Contracts._sel && Contracts._sel.key === p.key;
            const av = p.avatar ? '<img src="' + esc(p.avatar) + '" alt="Photo de profil" class="ccol-av">' : '<span class="ccol-av ccol-av-ph">' + p.icon + '</span>';
            return '<div class="ccol-item' + (sel ? ' ccol-item-sel' : '') + '" onclick="app.Contracts.selectParty(\'' + p.ref.t + '\',' + p.ref.i + ',\'' + encodeURIComponent(p.key) + '\')">' + av + '<span class="ccol-item-name">' + esc(p.name) + '</span>' + dotHTML(p) + '</div>';
        };
        let listHTML;
        if(!people.length) {
            listHTML = '<div class="ccol-empty">Aucune personne ni structure sur ce projet.</div>';
        } else if(sortMode === 'metier') {
            const groups = {};
            people.forEach(p => { (groups[p.category] = groups[p.category] || []).push(p); });
            listHTML = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr')).map(cat => {
                const collapsed = !!Contracts._metierCollapsed[cat];
                const items = groups[cat].map(itemHTML).join('');
                return '<div class="ccol-group">'
                    + '<div class="ccol-group-head" onclick="app.Contracts.toggleGroup(\'' + encodeURIComponent(cat) + '\')"><span>' + (collapsed ? '▸' : '▾') + ' ' + esc(cat) + '</span><span class="ccol-group-count">' + groups[cat].length + '</span></div>'
                    + (collapsed ? '' : '<div class="ccol-group-body">' + items + '</div>')
                    + '</div>';
            }).join('');
        } else {
            listHTML = people.map(itemHTML).join('');
        }
        let col2;
        if(Contracts._sel) {
            const contracts = (Contracts.store.forParty(Contracts._sel.partyType, Contracts._sel.partyId) || []).slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
            const allowedTypes = Contracts._sel.partyType === 'org' ? ['prestation', 'benevole'] : ['image', 'cddu', 'prestation', 'benevole'];
            const tpls = Contracts.tpl.list().filter(x => allowedTypes.indexOf(x.t.type || 'image') !== -1);
            const tplHTML = tpls.length ? '<div class="ctr-pal-title" style="margin-top:4px;">Mes modèles</div>' + tpls.map(x => '<div class="ctr-tpl-row"><button class="ctr-pal-btn" onclick="app.Contracts.newFromTemplate(\'' + x.scope + '\',\'' + x.t.id + '\')">' + (x.scope === 'glob' ? '🌐 ' : '📁 ') + esc(x.t.name || 'Sans nom') + '</button><button class="ctr-tpl-del" title="Supprimer ce modèle" onclick="app.Contracts.removeTemplate(\'' + x.scope + '\',\'' + x.t.id + '\')">×</button></div>').join('') : '';
            const picker = Contracts._pickerOpen ? '<div class="ccol-picker">'
                + allowedTypes.map(t => '<button class="ctr-pal-btn" onclick="app.Contracts.newContract(\'' + t + '\')">' + (Contracts._typeLabel[t] || t) + '</button>').join('')
                + tplHTML + '</div>' : '';
            const rows = contracts.length ? contracts.map(ct => {
                const tlabel = Contracts._typeLabel[ct.type] || ct.type;
                const slabel = Contracts._statusLabel[ct.status] || ct.status;
                const open = Contracts._editing === ct.id;
                return '<div class="ccol-ctr' + (open ? ' ccol-ctr-open' : '') + '" data-fiche="contract:' + esc(String(ct.id)) + '" onclick="app.Contracts.openExisting(\'' + ct.id + '\')">'
                    + '<button class="ccol-ctr-del" title="Supprimer ce contrat" onclick="event.stopPropagation(); app.Contracts.removeContract(\'' + ct.id + '\')">×</button>'
                    + '<div class="ccol-ctr-title">' + (ct.title ? esc(ct.title) : tlabel) + '</div>'
                    + '<div class="ccol-ctr-meta">' + tlabel + ' <span class="ctr-badge ctr-badge-' + (ct.status || 'draft') + '">' + slabel + '</span></div></div>';
            }).join('') : '<div class="ccol-empty">Aucun contrat. Crée-en un avec « + Nouveau ».</div>';
            col2 = '<div class="ccol-head"><span class="ccol-head-name">' + esc(Contracts._sel.name) + '</span>'
                + '<button class="chub-sort-btn" onclick="app.Contracts.togglePicker()">' + (Contracts._pickerOpen ? '× Fermer' : '+ Nouveau') + '</button></div>'
                + picker + '<div class="ccol-ctrs">' + rows + '</div>';
        } else {
            col2 = '<div class="ccol-empty">Sélectionne une fiche à gauche pour voir ou créer ses contrats.</div>';
        }
        host.innerHTML = '<div class="ccol-wrap' + (Contracts._editing ? ' ccol-wrap-editing' : '') + '">'
            + '<div class="ccol ccol-1">' + toolbar + '<div class="ccol-list">' + listHTML + '</div></div>'
            + '<div class="ccol ccol-2">' + col2 + '</div>'
            + '<div class="ccol ccol-3" id="ccol-3"></div>'
            + '</div>';
        const ed = Contracts._editing ? Contracts.store.get(Contracts._editing) : null;
        Contracts._bindWide(host);
        if(ed && Contracts._ctx) Contracts.renderEditor(ed);
        else { const c3 = document.getElementById('ccol-3'); if(c3) c3.innerHTML = '<div class="ccol-empty" style="padding:50px 20px;">Sélectionne un contrat (ou crée-en un) pour l\u2019éditer ici.</div>'; }
    },

    _hubSort: 'alpha',
    // Mode large : le contrat occupe presque toute la page pendant qu'on
    // travaille dessus. Bascule au survol (ou au curseur) de la 3e colonne ;
    // revient a la normale des qu'on survole la bande de gauche.
    _wide: false,
    _setWide: (on) => {
        if(Contracts._wide === on) return;
        Contracts._wide = on;
        const w = document.querySelector('#contracts-hub .ccol-wrap');
        if(w) w.classList.toggle('ccol-wrap-wide', on);
    },
    _bindWide: (host) => {
        // Etat conserve d'un rendu a l'autre (renderHub reconstruit le HTML)
        const w = host.querySelector('.ccol-wrap');
        if(w && Contracts._wide && Contracts._editing) w.classList.add('ccol-wrap-wide');
        if(!Contracts._editing) Contracts._wide = false;
        if(host._wideBound) return;
        host._wideBound = true;
        const inEditor = (el) => !!(el && el.closest && el.closest('.ccol-3'));
        const inSides = (el) => !!(el && el.closest && (el.closest('.ccol-1') || el.closest('.ccol-2')));
        host.addEventListener('mouseover', (e) => {
            if(!Contracts._editing) return;
            if(inEditor(e.target)) Contracts._setWide(true);
            else if(inSides(e.target)) Contracts._setWide(false);
        });
        host.addEventListener('focusin', (e) => {
            if(Contracts._editing && inEditor(e.target)) Contracts._setWide(true);
        });
    },
    setHubSort: (mode) => { if(Contracts._editing) Contracts._persist(); Contracts._hubSort = mode; Contracts.renderHub(); },
    _sel: null,
    _pickerOpen: false,
    _metierCollapsed: {},
    selectParty: (t, i, keyEnc) => {
        const key = decodeURIComponent(keyEnc);
        const same = Contracts._sel && Contracts._sel.key === key;
        if(Contracts._editing) { Contracts._persist(); Contracts._editing = null; Contracts._ctx = null; }
        if(same) { Contracts.renderHub(); return; }
        const list = t === 'actor' ? state.data.actors : (t === 'org' ? state.data.orgs : (t === 'figurant' ? state.data.actors : state.data.crew));
        const obj = (list && list[i]) || {};
        let name = '';
        if(t === 'org') { const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(obj) : (obj.fiche || obj); name = (fc && fc.name) || obj.name || ''; }
        else name = obj.name || '';
        Contracts._sel = { partyType: t, idx: i, partyId: obj.id || null, name: name, key: key };
        Contracts._pickerOpen = false;
        Contracts.renderHub();
    },
    toggleGroup: (catEnc) => { if(Contracts._editing) Contracts._persist(); const cat = decodeURIComponent(catEnc); Contracts._metierCollapsed[cat] = !Contracts._metierCollapsed[cat]; Contracts.renderHub(); },
    togglePicker: () => { if(Contracts._editing) Contracts._persist(); Contracts._pickerOpen = !Contracts._pickerOpen; Contracts.renderHub(); },
    newContract: (type) => { if(!Contracts._sel) return; Contracts._pickerOpen = false; Contracts.openEditor(Contracts._sel.partyType, Contracts._sel.idx, type); Contracts.renderHub(); },

    // ===================== ÉDITEUR DE CONTRAT (Lot 2a) =====================
    fields: {
        'prod.name':    { label: 'Production — nom',        resolve: (x) => x.project.producer },
        'prod.address': { label: 'Production — adresse',    resolve: (x) => x.project.addressLegal || x.project.city },
        'prod.siret':   { label: 'Production — SIRET',      resolve: (x) => x.project.siret },
        'prod.ape':     { label: 'Production — APE/NAF',    resolve: (x) => x.project.ape },
        'prod.licence': { label: 'Production — licence',    resolve: (x) => x.project.licence },
        'prod.rep':     { label: 'Production — représentant·e', resolve: (x) => x.project.director },
        'prod.repTitle':{ label: 'Production — qualité',    resolve: (x) => x.project.directorTitle },
        'party.name':   { label: 'Partie — nom',            resolve: (x) => x.party.name },
        'party.address':{ label: 'Partie — adresse',        resolve: (x) => x.party.address },
        'party.email':  { label: 'Partie — email',          resolve: (x) => x.party.email },
        'party.phone':  { label: 'Partie — téléphone',      resolve: (x) => x.party.phone },
        'party.role':   { label: 'Partie — fonction',       resolve: (x) => x.party.role },
        'party.siret':  { label: 'Partie — SIRET',          resolve: (x) => x.party.siret },
        'party.legalForm': { label: 'Partie — forme juridique', resolve: (x) => x.party.legalForm },
        'party.rep':    { label: 'Partie — représentant·e',     resolve: (x) => x.party.rep },
        'party.secu':   { label: 'Partie — n° Sécu',        resolve: (x) => x.party.numSecu },
        'party.conges': { label: 'Partie — Congés Spectacles', resolve: (x) => x.party.numCongesSpectacles },
        'project.title':{ label: 'Projet — titre',          resolve: (x) => x.projectTitle },
        'period.range': { label: 'Feuille de service — période', resolve: () => { const cs = Contracts._callsheet(Contracts._editingParty()); return cs.count ? ('du ' + cs.start + ' au ' + cs.end + ' (' + cs.count + ' jour' + (cs.count > 1 ? 's' : '') + ' de tournage)') : ''; } }
    },
    _snippets: {
        date:  'le <span class="ctr-blank">_____________</span>',
        lieu:  'à <span class="ctr-blank">_____________</span>',
        remu:  '<span class="ctr-blank">_____________ €</span>',
        heuresSup: '<p><strong>Heures supplémentaires :</strong> au-delà de <span class="ctr-blank">___</span> heures de travail effectif par jour, les heures supplémentaires sont rémunérées au taux horaire majoré de <span class="ctr-blank">___ %</span> (25 % pour les 8 premières heures, 50 % au-delà, sauf accord collectif plus favorable).</p>',
        sign:  '<p>Fait à <span class="ctr-blank">__________</span>, le <span class="ctr-blank">__________</span>, en deux exemplaires.</p><table class="ctr-sign"><tr><td>La Production<br><small>(signature)</small></td><td>La Partie<br><small>(« Bon pour accord » + signature)</small></td></tr></table>',
        legal: '<p class="ctr-legal" contenteditable="false">Modèle de contrat fourni à titre purement indicatif. Il ne constitue pas un conseil juridique. Avant toute signature, vérifiez sa conformité au droit applicable (Code du travail, convention collective, etc.) auprès d\u2019un professionnel du droit. moteur.studio décline toute responsabilité quant à l\u2019usage de ce document.</p>'
    },
    _escapeAttr: (s) => (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
    _sanitizeBody: (html) => {
        const okTag = ['P','DIV','SPAN','BR','STRONG','B','EM','I','U','H1','H2','H3','TABLE','THEAD','TBODY','TR','TD','TH','SMALL','UL','OL','LI','A','IMG'];
        const okAttr = ['class','contenteditable','alt','colspan','rowspan','data-field','data-snippet','data-hash'];
        const drop = ['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','NOSCRIPT','LINK','META'];
        const root = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html').body.firstChild;
        const walk = (node) => {
            [...node.children].forEach(child => {
                if(drop.includes(child.tagName)) { child.remove(); return; }
                walk(child);
                if(!okTag.includes(child.tagName)) { child.replaceWith(...child.childNodes); return; }
                [...child.attributes].forEach(a => {
                    const n = a.name.toLowerCase();
                    if(n === 'src') { const u = Utils.safeMediaUrl(a.value); if(u) { child.setAttribute('src', u); } else { child.removeAttribute('src'); } }
                    else if(n === 'href') { const u = Utils.safeUrl(a.value); if(u) { child.setAttribute('href', u); } else { child.removeAttribute('href'); } }
                    else if(!okAttr.includes(n)) { child.removeAttribute(a.name); }
                });
            });
        };
        walk(root);
        return root.innerHTML;
    },

    // Agrégat de la feuille de service (jours triés, période, lieux, convocations)
    _callsheet: (party) => {
        const all = (state.data.shootingDays || []).filter(d => d.startDate || d.date);
        let raw = all;
        if(party && party.id) raw = all.map(d => { const c = (d.callSheet || []).find(x => x.personId === party.id); return c ? Object.assign({ _pCall: c.callTime || '' }, d) : null; }).filter(Boolean);
        const days = raw.slice().sort((a,b) => new Date(a.startDate||a.date) - new Date(b.startDate||b.date));
        const fmt = (s) => { try { return s ? Utils.formatDate(s) : ''; } catch(e){ return s || ''; } };
        const norm = days.map((d, i) => ({ n: d.dayNumber || (i+1), start: d.startDate || d.date || '', end: d.endDate || d.startDate || d.date || '', location: d.location || '', call: d._pCall || d.crewCall || '', wrap: d.estimatedWrap || '' }));
        return { count: norm.length, total: all.length, scoped: !!(party && party.id), start: norm.length ? fmt(norm[0].start) : '', end: norm.length ? fmt(norm[norm.length-1].end) : '', days: norm, fmt: fmt };
    },
    // Partie du contrat en cours d'edition, pour scoper la feuille de service a ses convocations (null pour les structures)
    _editingParty: () => { const ct = Contracts.store.get(Contracts._editing); return (ct && ct.partyId && ct.partyType !== 'org') ? { type: ct.partyType, id: ct.partyId } : null; },
    // Blocs HTML construits dynamiquement à l'insertion (instantané, non re-résolu)
    _snippetBuilders: {
        clauses: () => { const ct = Contracts.store.get(Contracts._editing); const type = (ct && ct.type) || 'image'; if(type === 'prestation' && ct && ct.partyType === 'org') return Contracts._clauses.prestation_org; return Contracts._clauses[type] || Contracts._clauses.image; },
        callsheet: (party) => {
            const cs = Contracts._callsheet(party !== undefined ? party : Contracts._editingParty());
            let inner;
            if(!cs.count) inner = (cs.scoped && cs.total) ? '<p><em>Aucune convocation pour cette personne dans la feuille de service.</em></p>' : '<p><em>Aucun jour de tournage saisi dans la feuille de service.</em></p>';
            else {
                const rows = cs.days.map(d => '<tr><td>J'+d.n+'</td><td>'+(d.start===d.end ? cs.fmt(d.start) : cs.fmt(d.start)+' → '+cs.fmt(d.end))+'</td><td>'+Utils.escape(d.location||'—')+'</td><td>'+Utils.escape(d.call||'—')+'</td><td>'+Utils.escape(d.wrap||'—')+'</td></tr>').join('');
                inner = '<h2>Période &amp; horaires (feuille de service)</h2><table class="ctr-cs"><thead><tr><th>Jour</th><th>Date</th><th>Lieu</th><th>Convocation</th><th>Fin (estimée)</th></tr></thead><tbody>'+rows+'</tbody></table>';
            }
            return '<div data-snippet="callsheet">' + inner + '</div>';
        },
        remuTable: () => '<h2>Rémunération</h2><table class="ctr-cs"><tbody>'
            + '<tr><td>Base</td><td><span class="ctr-blank">cachet / journalier / forfait</span></td></tr>'
            + '<tr><td>Montant brut</td><td><span class="ctr-blank">_________ €</span></td></tr>'
            + '<tr><td>Congés spectacles (10 %)</td><td><span class="ctr-blank">_________ €</span></td></tr>'
            + '<tr><td>Net estimé</td><td><span class="ctr-blank">_________ €</span></td></tr>'
            + '<tr><td>Modalités de paiement</td><td><span class="ctr-blank">virement, sous 30 jours…</span></td></tr>'
            + '</table>'
    },

    _clauses: {
        cddu: `
<h2>Préambule — motif de recours</h2>
<p>Le présent contrat est conclu dans le cadre d'un emploi à caractère temporaire pour lequel il est d'usage constant, dans le secteur de la production cinématographique et audiovisuelle, de ne pas recourir au contrat à durée indéterminée en raison de la nature de l'activité exercée et du caractère par nature temporaire de cet emploi (article D.1242-1 du Code du travail). Ce contrat n'a pas pour objet de pourvoir durablement un emploi lié à l'activité normale et permanente de l'entreprise.</p>
<h2>Nature du contrat</h2>
<p>Le/la salarié·e est engagé·e dans le cadre d'un contrat à durée déterminée d'usage (CDDU), conformément aux articles L.1242-2 et suivants du Code du travail, spécifiques aux professions du spectacle.</p>
<h2>Convention collective</h2>
<p>Le présent contrat est régi par la convention collective de la <span class="ctr-blank">_____________</span>.</p>
<h2>Caisse de retraite et prévoyance</h2>
<p>Caisse de retraite complémentaire : AUDIENS — 74 rue Jean Bleuzen, 92170 Vanves.</p>
<h2>Congés spectacles</h2>
<p>Les congés payés seront versés par la Caisse des Congés Spectacles. N° d'affiliation employeur : <span class="ctr-blank">_____________</span>.</p>
<h2>Abattement pour frais professionnels</h2>
<p>L'emploi occupé ouvre droit à la déduction forfaitaire spécifique pour frais professionnels prévue par l'arrêté du 20 décembre 2002. Le/la salarié·e déclare :<br>☐ Accepter l'application de cet abattement<br>☐ Refuser l'application de cet abattement<br><em>Note : l'application de cet abattement minore l'assiette des cotisations sociales et donc les droits sociaux (retraite, indemnités journalières, allocations chômage).</em></p>
<h2>Fin de contrat</h2>
<p>À l'issue du contrat, l'employeur remettra au/à la salarié·e : un certificat de travail, une attestation Pôle emploi (AEM), un reçu pour solde de tout compte, le dernier bulletin de salaire et un certificat congés spectacles.</p>
<h2>Juridiction compétente</h2>
<p>En cas de litige, les parties conviennent de rechercher une solution amiable. À défaut, le Conseil de Prud'hommes compétent sera celui du lieu de travail ou du domicile du/de la salarié·e.</p>
`,
        image: `
<h2>Supports et modes d'exploitation</h2>
<p>Supports autorisés :<br>☐ Exploitation cinématographique (salles)<br>☐ Diffusion télévisuelle (hertzienne, câble, satellite, TNT)<br>☐ Supports vidéo (DVD, Blu-ray, VOD, SVOD)<br>☐ Internet et réseaux sociaux<br>☐ Supports promotionnels (affiches, bandes-annonces, making-of)<br>☐ Festivals et projections publiques<br>☐ Usage pédagogique et culturel<br>☐ Tous supports connus ou inconnus à ce jour</p>
<h2>Étendue territoriale et durée</h2>
<p>Territoire : Monde entier / ou limité à : <span class="ctr-blank">_____________</span>.<br>Durée : <span class="ctr-blank">_____________</span>.<br><em>En cas de durée illimitée, l'autorisation est consentie pour toute la durée légale de protection des droits de propriété intellectuelle et de leurs éventuelles prolongations.</em></p>
<h2>Engagements du bénéficiaire</h2>
<p>Le bénéficiaire s'engage à ce que l'exploitation de l'image ne porte pas atteinte à la dignité, à l'honneur ou à la réputation du/de la signataire, ne dénature pas le contexte de captation, ne soit pas utilisée dans un contexte pornographique, diffamatoire ou contraire aux bonnes mœurs, et respecte le droit moral du/de la signataire.</p>
<h2>Droit de retrait</h2>
<p>Conformément à l'article 9 du Code civil, le/la signataire conserve le droit de retirer son autorisation à tout moment, par lettre recommandée avec accusé de réception. Ce retrait ne pourra affecter les exploitations déjà réalisées ou en cours, ni ouvrir droit à indemnisation.</p>
<h2>Protection des données (RGPD)</h2>
<p>Conformément au Règlement Général sur la Protection des Données (UE 2016/679) et à la loi Informatique et Libertés, le/la signataire dispose d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de ses données. Les données collectées seront conservées pour la durée nécessaire à l'exploitation autorisée.</p>
<h2>Déclarations</h2>
<p>Le/la signataire déclare :<br>☐ Avoir pris connaissance de l'intégralité du présent document<br>☐ Avoir pu poser des questions et obtenir des réponses<br>☐ Ne pas être lié·e par un contrat exclusif relatif à l'utilisation de son image<br>☐ Donner son consentement libre, spécifique, éclairé et univoque</p>
`,
        prestation: `
<h2>Modalités de paiement</h2>
<p>Le paiement sera effectué par virement bancaire sous 30 jours à réception de la facture.</p>
<h2>Indépendance</h2>
<p>Le/la prestataire exerce son activité de manière indépendante et n'est soumis·e à aucun lien de subordination. Il/elle organise librement son travail dans le respect des délais convenus.</p>
<h2>Assurance</h2>
<p>Le/la prestataire déclare être assuré·e au titre de sa responsabilité civile professionnelle (n° de police : <span class="ctr-blank">_____________</span>, compagnie : <span class="ctr-blank">_____________</span>) et s'engage à maintenir cette assurance pendant toute la durée de la mission.</p>
<h2>Propriété intellectuelle</h2>
<p>Sauf accord contraire écrit, les créations réalisées dans le cadre de la mission (images, sons, textes, graphismes, etc.) sont la propriété exclusive du/de la client·e dès leur création et leur paiement intégral. Le/la prestataire cède au/à la client·e, à titre exclusif, l'ensemble des droits patrimoniaux attachés aux créations, pour tous supports et tous modes d'exploitation, pour le monde entier et pour toute la durée légale de protection des droits d'auteur (reproduction, représentation, adaptation, traduction, exploitation commerciale).</p>
<h2>Confidentialité</h2>
<p>Le/la prestataire s'engage à garder strictement confidentielles toutes les informations relatives au projet et au/à la client·e. Cette obligation reste en vigueur pendant 2 ans après la fin du contrat.</p>
<h2>Résiliation</h2>
<p><strong>Pour convenance :</strong> chaque partie peut résilier moyennant un préavis de <span class="ctr-blank">___</span> jours ouvrés notifié par écrit.<br><strong>Pour faute :</strong> en cas de manquement grave, l'autre partie pourra résilier de plein droit, 8 jours après mise en demeure restée infructueuse.<br><strong>Conséquences :</strong> le/la prestataire sera rémunéré·e pour les prestations déjà réalisées et acceptées.</p>
<h2>Sous-traitance</h2>
<p>Le/la prestataire ne pourra sous-traiter tout ou partie de la mission sans l'accord préalable et écrit du/de la client·e.</p>
<h2>Litige et droit applicable</h2>
<p>Le présent contrat est soumis au droit français. En cas de litige, les parties rechercheront une solution amiable ; à défaut d'accord dans un délai de 30 jours, le litige sera soumis aux tribunaux compétents du ressort du siège social du/de la client·e.</p>
<h2>Déclarations du/de la prestataire</h2>
<p>Le/la prestataire déclare :<br>☐ Être régulièrement inscrit·e au RCS ou au Répertoire des Métiers<br>☐ Être à jour de ses obligations fiscales et sociales<br>☐ Ne pas être en situation de dépendance économique vis-à-vis du/de la client·e</p>
<p class="ctr-legal">Attention : le recours à un·e prestataire auto-entrepreneur·e est licite uniquement si celui/celle-ci exerce son activité de manière réellement indépendante, sans lien de subordination. À défaut, le contrat pourrait être requalifié en contrat de travail.</p>
`,
        prestation_org: `
<h2>Indépendance des parties</h2>
<p>Le Prestataire exécute la mission en toute indépendance, avec ses propres moyens humains et matériels. Le présent contrat n'établit aucun lien de subordination entre le personnel du Prestataire et le Client, ni aucune société de fait entre les parties.</p>
<h2>Obligations du Prestataire</h2>
<p>Le Prestataire est tenu à une obligation de moyens. Il s'engage à exécuter la mission conformément aux règles de l'art, dans le respect du calendrier convenu, et à informer sans délai le Client de toute difficulté.</p>
<h2>Réception des livrables</h2>
<p>Le Client dispose d'un délai de <span class="ctr-blank">___</span> jours à compter de la remise des livrables pour formuler ses réserves par écrit. Passé ce délai, les livrables sont réputés acceptés. Nombre de séries de corrections incluses : <span class="ctr-blank">___</span>.</p>
<h2>Assurance</h2>
<p>Le Prestataire déclare être titulaire d'une assurance responsabilité civile professionnelle (compagnie : <span class="ctr-blank">_____________</span>, police n° <span class="ctr-blank">_____________</span>) couvrant l'ensemble de la mission.</p>
<h2>Propriété intellectuelle</h2>
<p>Les droits patrimoniaux attachés aux créations réalisées dans le cadre de la mission sont cédés au Client au fur et à mesure de leur création, sous condition du paiement intégral du prix, pour tous supports, tous modes d'exploitation, pour le monde entier et pour la durée légale de protection des droits d'auteur. Le Prestataire garantit que les livrables ne portent atteinte à aucun droit de tiers.</p>
<h2>Confidentialité</h2>
<p>Chaque partie s'engage à garder confidentielles les informations échangées dans le cadre du contrat, pendant sa durée et pendant 2 ans après son terme.</p>
<h2>Sous-traitance</h2>
<p>Le Prestataire ne peut sous-traiter tout ou partie de la mission sans l'accord préalable et écrit du Client. Il demeure en toute hypothèse seul responsable de la bonne exécution.</p>
<h2>Résiliation</h2>
<p><strong>Pour convenance :</strong> chaque partie peut résilier moyennant un préavis de <span class="ctr-blank">___</span> jours notifié par écrit.<br><strong>Pour faute :</strong> en cas de manquement grave non réparé dans les 8 jours suivant une mise en demeure, l'autre partie peut résilier de plein droit.<br><strong>Conséquences :</strong> les prestations réalisées et acceptées à la date d'effet restent dues.</p>
<h2>Litige et droit applicable</h2>
<p>Le contrat est soumis au droit français. Les parties rechercheront une solution amiable ; à défaut d'accord dans un délai de 30 jours, le litige sera porté devant le tribunal compétent du ressort du siège du défendeur.</p>
`,
        benevole: `
<h2>Préambule</h2>
<p>Le présent accord définit les conditions d'une collaboration bénévole dans le cadre d'un projet audiovisuel à but non lucratif ou à budget limité. Il n'établit aucun lien de subordination et ne constitue pas un contrat de travail. Chaque partie s'engage librement et de bonne foi.</p>
<h2>Nature bénévole</h2>
<p>Les parties reconnaissent expressément que cette collaboration est bénévole : aucune rémunération ne sera versée ; aucun lien de subordination n'existe ; le/la collaborateur·rice est libre d'organiser sa participation et peut y mettre fin à tout moment.</p>
<h2>Défraiements</h2>
<p>Le/la porteur·se de projet s'engage, dans la mesure du possible, à prendre en charge :<br>☐ Les repas sur le lieu de tournage/travail<br>☐ Les frais de transport (sur justificatifs)<br>☐ L'hébergement si nécessaire<br><em>Les modalités précises seront définies avant chaque journée de collaboration.</em></p>
<h2>Engagements mutuels</h2>
<p><strong>Le/la porteur·se de projet s'engage à :</strong> traiter le/la collaborateur·rice avec respect, fournir les informations nécessaires, assurer des conditions de travail sécurisées, et le/la mentionner au générique (sauf demande contraire).<br><strong>Le/la collaborateur·rice s'engage à :</strong> participer de bonne foi et avec professionnalisme, respecter les consignes de sécurité, prévenir en cas d'absence, et respecter la confidentialité du projet.</p>
<h2>Crédits et reconnaissance</h2>
<p>☐ Je souhaite apparaître au générique<br>☐ Je ne souhaite pas apparaître au générique</p>
<h2>Propriété intellectuelle</h2>
<p>Le/la collaborateur·rice accepte que sa contribution soit intégrée au projet final. En contrepartie de cette collaboration bénévole et de la mention au générique, il/elle cède gracieusement les droits d'exploitation de sa contribution pour ce projet uniquement.</p>
<h2>Assurance</h2>
<p>Le/la porteur·se de projet déclare :<br>☐ Disposer d'une assurance responsabilité civile couvrant les collaborateurs<br>☐ Ne pas disposer d'assurance spécifique (participation aux risques du/de la collaborateur·rice)</p>
<h2>Esprit de l'accord</h2>
<p><em>Cet accord repose sur la confiance mutuelle, le respect et l'envie commune de réaliser un projet créatif. Les parties s'engagent à communiquer ouvertement et à résoudre tout différend à l'amiable.</em></p>
`
    },

    buildContext: (obj, partyType) => {
        const project = state.data.presentation || {};
        const projectTitle = state.data.title || 'Sans titre';
        let party = {};
        if(partyType === 'org') {
            const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(obj) : (obj.fiche || obj);
            party = { name: (fc && fc.name) || obj.name || '', address: (fc && (fc.hq || fc.address || fc.siege)) || '', email: (fc && fc.email) || '', phone: (fc && fc.phone) || '', role: [obj.department, (obj.roleCustom || obj.role)].filter(Boolean).join(' — '), numSecu: '', numCongesSpectacles: '', siret: (fc && fc.siret) || '', legalForm: (fc && fc.legalForm) || '', rep: (fc && fc.leader) || '', isOrg: true };
        } else {
            party = { name: obj.name || '', address: obj.address || '', email: obj.email || '', phone: obj.phone || '', role: obj.role || (partyType === 'actor' ? 'Comédien·ne' : (partyType === 'figurant' ? 'Figurant·e' : 'Technicien·ne')), numSecu: obj.numSecu || '', numCongesSpectacles: obj.numCongesSpectacles || '', siret: '', id: obj.id || null };
        }
        return { project: project, projectTitle: projectTitle, party: party };
    },

    // Modele B2B : la Production (Client) commande une prestation a une structure (Prestataire)
    _orgPrestationBody: (tok) => {
        const blank = (hint) => '<span class="ctr-blank">' + hint + '</span>';
        const client = '<p><strong>Le Client (la Production) :</strong><br>'+tok('prod.name')+'<br>Adresse : '+tok('prod.address')+'<br>SIRET : '+tok('prod.siret')+'<br>Représenté par '+tok('prod.rep')+', '+tok('prod.repTitle')+'.</p>';
        const presta = '<p><strong>Le Prestataire :</strong><br>'+tok('party.name')+' ('+tok('party.legalForm')+')<br>Siège : '+tok('party.address')+'<br>SIRET : '+tok('party.siret')+'<br>Représenté·e par '+tok('party.rep')+'<br>Contact : '+tok('party.email')+' — '+tok('party.phone')+'</p>';
        const objet = '<h2>Objet</h2><p>Le Prestataire s\u2019engage à réaliser pour le Client, dans le cadre du projet « '+tok('project.title')+' », la prestation suivante : '+blank('description de la mission')+'.</p>'
            + '<p>Livrables attendus : '+blank('liste des livrables, formats, quantités')+'.</p>'
            + '<p>La prestation est réalisée conformément au devis n° '+blank('________')+' du '+blank('________')+', accepté par le Client, qui fait partie intégrante du présent contrat.</p>';
        const duree = '<h2>Durée et délais</h2><p>La prestation est exécutée du '+blank('__________')+' au '+blank('__________')+'. Les livrables seront remis au plus tard le '+blank('__________')+'.</p>';
        const prix = '<h2>Prix et facturation</h2><table class="ctr-cs"><tbody>'
            + '<tr><td>Montant HT</td><td>'+blank('_________ €')+'</td></tr>'
            + '<tr><td>TVA</td><td>'+blank('20 % / non applicable, art. 293 B du CGI')+'</td></tr>'
            + '<tr><td>Montant TTC</td><td>'+blank('_________ €')+'</td></tr>'
            + '<tr><td>Acompte à la signature</td><td>'+blank('____ %')+'</td></tr>'
            + '<tr><td>Solde</td><td>'+blank('à la livraison / réception de facture')+'</td></tr>'
            + '</tbody></table><p>Paiement par virement bancaire sous 30 jours à compter de la réception de la facture.</p>';
        const penalites = '<h2>Pénalités de retard</h2><p>Tout retard de paiement entraîne de plein droit l\u2019application de pénalités calculées sur la base de trois fois le taux d\u2019intérêt légal, ainsi qu\u2019une indemnité forfaitaire de 40 € pour frais de recouvrement (articles L.441-10 et D.441-5 du Code de commerce).</p>';
        const sign = '<p>Fait à '+blank('__________')+', le '+blank('__________')+', en deux exemplaires.</p><table class="ctr-sign"><tr><td>Pour le Client<br><small>(signature)</small></td><td>Pour le Prestataire<br><small>(cachet + signature)</small></td></tr></table>';
        return '<h1>CONTRAT DE PRESTATION DE SERVICES</h1>'
            + '<h2>Entre les soussignés</h2>' + client + presta
            + objet + duree + prix + penalites + sign + Contracts._snippets.legal;
    },

    defaultBody: (type, ctx) => {
        const tok = (id) => '<span class="ctr-field" contenteditable="false" data-field="'+id+'">___________</span>';
        if(type === 'prestation' && ctx && ctx.party && ctx.party.isOrg) return Contracts._orgPrestationBody(tok);
        const titles = { image: 'AUTORISATION D\u2019EXPLOITATION DU DROIT À L\u2019IMAGE', cddu: 'CONTRAT À DURÉE DÉTERMINÉE D\u2019USAGE (CDDU)', prestation: 'CONTRAT DE PRESTATION DE SERVICES', benevole: 'ACCORD DE COLLABORATION BÉNÉVOLE' };
        const partiesProd = '<p><strong>La Production :</strong><br>'+tok('prod.name')+'<br>Adresse : '+tok('prod.address')+'<br>SIRET : '+tok('prod.siret')+'<br>Représentée par '+tok('prod.rep')+', '+tok('prod.repTitle')+'.</p>';
        const partyLabel = type === 'prestation' ? 'Le Prestataire' : (type === 'cddu' ? 'Le/La Salarié·e' : 'La Partie');
        const partiesParty = '<p><strong>'+partyLabel+' :</strong><br>'+tok('party.name')+'<br>Adresse : '+tok('party.address')+'<br>Contact : '+tok('party.email')+' — '+tok('party.phone')+'<br>Fonction : '+tok('party.role')+'</p>';
        let extra = '';
        if(type === 'cddu') extra = '<p>N° Sécurité sociale : '+tok('party.secu')+' — N° Congés Spectacles : '+tok('party.conges')+'</p>';
        if(type === 'prestation') extra = '<p>SIRET du prestataire : '+tok('party.siret')+'</p>';
        let objet = '';
        if(type === 'image') objet = '<h2>Objet</h2><p>La Partie autorise la Production à fixer, reproduire et exploiter son image dans le cadre du projet « '+tok('project.title')+' ».</p>';
        else if(type === 'cddu') objet = '<h2>Objet</h2><p>La Production engage le/la salarié·e en qualité de '+tok('party.role')+' pour le projet « '+tok('project.title')+' ».</p>';
        else if(type === 'prestation') objet = '<h2>Objet</h2><p>Le Prestataire réalise pour la Production la prestation suivante dans le cadre du projet « '+tok('project.title')+' » : <span class="ctr-blank">_____________</span>.</p>';
        else objet = '<h2>Objet</h2><p>La Partie participe bénévolement au projet « '+tok('project.title')+' ».</p>';
        const party = (ctx && ctx.party && ctx.party.id && !ctx.party.isOrg) ? { id: ctx.party.id } : null;
        const auto = (type !== 'image' && party && Contracts._callsheet(party).count) ? Contracts._snippetBuilders.callsheet(party) : '';
        const remu = (type === 'cddu' || type === 'prestation') ? Contracts._snippetBuilders.remuTable() : '';
        const dates = '<h2>Période &amp; lieu</h2><p>Du '+Contracts._snippets.date+' au '+Contracts._snippets.date+', '+Contracts._snippets.lieu+'.</p>';
        return '<h1>'+titles[type]+'</h1>'
            + '<h2>Entre les soussigné·e·s</h2>' + partiesProd + partiesParty + extra
            + objet + dates + auto + remu
            + Contracts._snippets.sign
            + Contracts._snippets.legal;
    },

    openEditor: (partyType, idx, type, tplBody, tplTitle) => {
        if(!state.currentProjectId) { Utils.toast('Ouvrez un projet d\u2019abord', 'warning'); return; }
        const list = partyType === 'actor' ? state.data.actors : (partyType === 'org' ? state.data.orgs : (partyType === 'figurant' ? state.data.actors : state.data.crew));
        const obj = (list && list[idx]) || {};
        let partyName = '';
        if(partyType === 'org') { const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(obj) : (obj.fiche || obj); partyName = (fc && fc.name) || obj.name || ''; }
        else partyName = obj.name || '';
        Contracts._ctx = Contracts.buildContext(obj, partyType);
        const ct = Contracts.store.create({ partyType: partyType, partyId: obj.id || null, partyName: partyName, type: type, status: 'draft', title: tplTitle || '' });
        ct.body = tplBody || Contracts.defaultBody(type, Contracts._ctx);
        Contracts.store.upsert(ct);
        Contracts._editing = ct.id;
        Contracts.renderHub();
    },

    renderEditor: (ct) => {
        const old = document.getElementById('ctr-editor'); if(old) old.remove();
        const palette = [
            { g: 'Production', items: [['prod.name','Nom'],['prod.address','Adresse'],['prod.siret','SIRET'],['prod.ape','APE/NAF'],['prod.licence','Licence'],['prod.rep','Représentant·e'],['prod.repTitle','Qualité']] },
            { g: 'Personne / Structure', items: [['party.name','Nom'],['party.address','Adresse'],['party.email','Email'],['party.phone','Téléphone'],['party.role','Fonction'],['party.secu','N° Sécu'],['party.conges','Congés Spect.'],['party.siret','SIRET'],['party.legalForm','Forme jur.'],['party.rep','Représentant·e']] },
            { g: 'Projet', items: [['project.title','Titre du projet']] }
        ];
        let paletteHTML = palette.map(grp => '<div class="ctr-pal-group"><div class="ctr-pal-title">'+grp.g+'</div>'+grp.items.map(it => '<button class="ctr-pal-btn" onclick="app.Contracts.insertField(\''+it[0]+'\')">'+it[1]+'</button>').join('')+'</div>').join('');
        paletteHTML += '<div class="ctr-pal-group"><div class="ctr-pal-title">Saisie libre</div>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'date\')">Date</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'lieu\')">Lieu</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'remu\')">Rémunération</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'sign\')">Signatures</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'legal\')">Mention légale</button>'
            + '</div>';
        paletteHTML += '<div class="ctr-pal-group"><div class="ctr-pal-title">Feuille de service &amp; paie</div>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertField(\'period.range\')">Période (du…au…)</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'callsheet\')">Tableau jours/horaires</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'remuTable\')">Rémunération détaillée</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'heuresSup\')">Heures sup</button>'
            + '</div>';
        paletteHTML += '<div class="ctr-pal-group"><div class="ctr-pal-title">Clauses juridiques</div>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'clauses\')">Clauses-types (selon le contrat)</button>'
            + '</div>';
        const col3 = document.getElementById('ccol-3'); if(!col3) return;
        // v601 — VERROU PAR CONTRAT. Chaque contrat est une fiche : il a un
        // identifiant, une liste, et un editeur a lui. Il etait reste sur un
        // verrou d'onglet parce que j'avais range « Contrats » avec le Planning
        // et les Depenses, sous « travail qui touche plusieurs elements a la
        // fois » — ce qui etait faux, et le developpeur l'a vu tout de suite.
        // C'est ICI que se trouvent les champs (titre, statut, et le document
        // lui-meme, modifiable directement), donc ici que le verrou s'accroche.
        col3.innerHTML = '<div class="ctr-ed fiche-fenetre" data-fiche="contract:' + String(Contracts._editing || '') + '">'
            + '<div class="contracts-header ctr-editor-header">'
            + '<input id="ctr-title" class="ctr-title-input" placeholder="Titre du contrat (optionnel)" data-tooltip="Titre du contrat (optionnel)" value="'+Contracts._escapeAttr(ct.title || '')+'">'
            + '<select id="ctr-status" class="ctr-status-sel"><option value="draft">Brouillon</option><option value="to_sign">À signer</option><option value="signed">Signé</option><option value="archived">Archivé</option></select>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.resolveFields(document.getElementById(\'ctr-doc\'))">↻ Champs</button>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.renumberArticles()" title="Renuméroter les articles dans l\u2019ordre du document">№ Articles</button>'
            + '<button class="chub-sort-btn active" onclick="app.Contracts.saveEditor()">💾 Enregistrer</button>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.exportPDF()">📄 PDF</button>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.saveAsTemplate()" title="Enregistrer comme modèle réutilisable">⭐ Modèle</button>'
            + '<button class="history-close-btn" onclick="app.Contracts.closeEditor()">✕</button>'
            + '</div>'
            + '<div class="ctr-editor-body"><div class="ctr-palette">'+paletteHTML+'</div><div id="ctr-doc" class="ctr-doc" contenteditable="true"></div></div>'
            + '</div>';
        const doc = document.getElementById('ctr-doc');
        if(doc) {
            doc.innerHTML = Contracts._sanitizeBody(ct.body);
            const frozen = (ct.status === 'signed' || ct.status === 'archived');
            if(!frozen) { Contracts.refreshSnippets(doc, ct); Contracts.resolveFields(doc); }
            Contracts._stampSnippets(doc);
        }
        const st = document.getElementById('ctr-status'); if(st) { st.value = ct.status || 'draft'; st.addEventListener('change', Contracts.refreshLiveBadges); }
        const ti = document.getElementById('ctr-title');
        if(ti) ti.addEventListener('input', () => { clearTimeout(Contracts._liveT); Contracts._liveT = setTimeout(Contracts.refreshLiveBadges, 400); });
    },

    insertHTMLAtCaret: (html) => {
        const ed = document.getElementById('ctr-doc'); if(!ed) return;
        ed.focus();
        const sel = window.getSelection();
        let range;
        if(sel && sel.rangeCount && ed.contains(sel.anchorNode)) range = sel.getRangeAt(0);
        else { range = document.createRange(); range.selectNodeContents(ed); range.collapse(false); }
        range.deleteContents();
        const tpl = document.createElement('template'); tpl.innerHTML = html;
        const frag = tpl.content; const last = frag.lastChild;
        range.insertNode(frag);
        if(last && sel) { range.setStartAfter(last); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    },
    insertField: (id) => {
        const f = Contracts.fields[id]; if(!f) return;
        const val = Utils.escape((Contracts._ctx ? f.resolve(Contracts._ctx) : '') || '___________');
        Contracts.insertHTMLAtCaret('<span class="ctr-field" contenteditable="false" data-field="'+id+'">'+val+'</span>&nbsp;');
    },
    insertSnippet: (key) => {
        const html = (Contracts._snippetBuilders && Contracts._snippetBuilders[key]) ? Contracts._snippetBuilders[key]() : Contracts._snippets[key];
        if(!html) return;
        Contracts.insertHTMLAtCaret(html + ' ');
        Contracts._stampSnippets(document.getElementById('ctr-doc'));
        if(key === 'clauses') Contracts.renumberArticles();
    },
    resolveFields: (root) => {
        if(!root || !root.querySelectorAll) return;
        root.querySelectorAll('[data-field]').forEach(el => {
            const f = Contracts.fields[el.getAttribute('data-field')];
            if(f && Contracts._ctx) el.textContent = (f.resolve(Contracts._ctx) || '___________');
        });
    },
    renumberArticles: () => {
        const ed = document.getElementById('ctr-doc'); if(!ed) return;
        let n = 0;
        ed.querySelectorAll('h2').forEach(h => {
            const nodes = h.childNodes;
            for(let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if(node.nodeType === 3 && /ARTICLE\s+\d+/i.test(node.data)) {
                    n++;
                    node.data = node.data.replace(/ARTICLE\s+\d+/i, 'ARTICLE ' + n);
                    break;
                }
            }
        });
    },
    // Empreinte simple (djb2) pour détecter les blocs-instantanés modifiés à la main
    _hash: (s) => { let h = 5381; for(let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return String(h); },
    // Estampille les blocs data-snippet fraîchement insérés (après normalisation du navigateur)
    _stampSnippets: (root) => {
        if(!root || !root.querySelectorAll) return;
        root.querySelectorAll('[data-snippet]:not([data-hash])').forEach(el => el.setAttribute('data-hash', Contracts._hash(el.innerHTML)));
    },
    // Reconstruit depuis le Planning courant les tableaux jours INTACTS (hash inchangé).
    // Un bloc ajusté à la main (heures sup...) garde la version de l'utilisateur.
    refreshSnippets: (root, ct) => {
        if(!root || !ct || !root.querySelectorAll) return;
        const party = (ct.partyId && ct.partyType !== 'org') ? { id: ct.partyId } : null;
        root.querySelectorAll('[data-snippet="callsheet"]').forEach(el => {
            const stored = el.getAttribute('data-hash');
            if(!stored) return;
            if(Contracts._hash(el.innerHTML) !== stored) return;
            const tpl = document.createElement('template');
            tpl.innerHTML = Contracts._snippetBuilders.callsheet(party);
            const fresh = tpl.content.firstChild;
            if(fresh) { el.innerHTML = fresh.innerHTML; el.setAttribute('data-hash', Contracts._hash(el.innerHTML)); }
        });
    },
    _liveT: null,
    refreshLiveBadges: () => {
        if(!Contracts._editing) return;
        const ct = Contracts.store.get(Contracts._editing); if(!ct) return;
        const sSel = document.getElementById('ctr-status');
        const tInp = document.getElementById('ctr-title');
        const liveStatus = (sSel && sSel.value) || ct.status || 'draft';
        const liveTitle = tInp ? tInp.value : (ct.title || '');
        const row = document.querySelector('.ccol-ctr-open');
        if(row) {
            const tl = row.querySelector('.ccol-ctr-title');
            if(tl) tl.textContent = liveTitle || (Contracts._typeLabel[ct.type] || ct.type);
            const b = row.querySelector('.ctr-badge');
            if(b) { b.className = 'ctr-badge ctr-badge-' + liveStatus; b.textContent = Contracts._statusLabel[liveStatus] || liveStatus; }
        }
        const dots = document.querySelector('.ccol-item-sel .ccol-dots');
        if(dots && Contracts._sel) {
            const cs = Contracts.store.forParty(Contracts._sel.partyType, Contracts._sel.partyId) || [];
            const counts = {};
            cs.forEach(c => { const s = (c.id === ct.id) ? liveStatus : (c.status || 'draft'); counts[s] = (counts[s] || 0) + 1; });
            const order = ['draft', 'to_sign', 'signed', 'archived'];
            dots.innerHTML = cs.length
                ? order.filter(s => counts[s]).map(s => '<span class="ccol-dot ccol-dot-' + s + '" title="' + (Contracts._statusLabel[s] || s) + ' : ' + counts[s] + '">' + counts[s] + '</span>').join('')
                : '<span class="ccol-dot ccol-dot-none" title="Aucun contrat">0</span>';
        }
    },
    _persist: () => {
        const ct = Contracts.store.get(Contracts._editing); if(!ct) return;
        const doc = document.getElementById('ctr-doc'); if(doc) { Contracts.renumberArticles(); ct.body = Contracts._sanitizeBody(doc.innerHTML); }
        const t = document.getElementById('ctr-title'); if(t) ct.title = t.value;
        const s = document.getElementById('ctr-status'); if(s) ct.status = s.value;
        Contracts.store.upsert(ct);
    },
    saveEditor: () => {
        if(!Contracts._editing) return;
        Contracts._persist();
        Utils.toast('Contrat enregistré', 'success');
        Contracts.renderHub();
    },
    closeEditor: () => {
        if(Contracts._editing) Contracts._persist();
        Contracts._editing = null; Contracts._ctx = null;
        if(document.getElementById('contracts-hub')) Contracts.renderHub();
    },

    // ===================== LISTE « MES CONTRATS » + EXPORT (Lot 3) =====================
    _typeLabel: { image: '📸 Droit à l\u2019image', cddu: '📋 CDDU', prestation: '📄 Prestation', benevole: '❤️ Bénévole' },
    _statusLabel: { draft: 'Brouillon', to_sign: 'À signer', signed: 'Signé', archived: 'Archivé' },

    // La fenetre « Mes contrats » (modale #ctr-list) est retiree le 25 aout :
    // son contenu est devenu le sous-onglet « Mes contrats », rendu par
    // Contracts.renderList. Une fenetre pour lire une liste que l'on consulte a
    // chaque passage etait un obstacle, pas une protection.

    // Ouvrir un contrat depuis la liste : on bascule sur le sous-onglet des
    // trois colonnes, c'est la que vit l'editeur.
    openFromList: (id) => {
        Contracts._view = 'hub';
        Contracts.openExisting(id);
    },

    openExisting: (id) => {
        const ct = Contracts.store.get(id); if(!ct) return;
        try { if(typeof FicheLock !== 'undefined'
                 && FicheLock.ouvrir('contract', id, 'Ce contrat') === false) return; } catch(e) {}
        const list = ct.partyType === 'actor' ? (state.data.actors||[]) : (ct.partyType === 'org' ? (state.data.orgs||[]) : (state.data.crew||[]));
        let obj = ct.partyId ? list.find(x => x.id === ct.partyId) : null;
        if(!obj) obj = list.find(x => { const fc = (ct.partyType==='org' && typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(x) : x; return ((fc && fc.name) || x.name) === ct.partyName; });
        obj = obj || { name: ct.partyName || '' };
        Contracts._ctx = Contracts.buildContext(obj, ct.partyType);
        Contracts._editing = ct.id;
        // renderTab et non renderHub : ouvert depuis le sous-onglet « Mes
        // contrats », le hub etait bien reconstruit mais restait masque — on
        // cliquait une fiche et il ne se passait rien a l'ecran.
        Contracts.renderTab();
    },
    duplicate: (id) => {
        const ct = Contracts.store.get(id); if(!ct) return;
        const copy = Contracts.store.create({ partyType: ct.partyType, partyId: ct.partyId, partyName: ct.partyName, type: ct.type, status: 'draft', title: (ct.title || '') + ' (copie)' });
        copy.body = ct.body; Contracts.store.upsert(copy);
        Contracts.openList();
    },
    removeContract: async (id) => {
        if(!(await ConfirmModal.confirmDelete('Ce contrat sera définitivement supprimé.', 'Supprimer ce contrat ?'))) return;
        if(Contracts._editing === id) Contracts._editing = null;
        Contracts.store.remove(id);
        // Rafraichit le sous-onglet affiche, quel qu'il soit : la carte doit
        // disparaitre de la liste comme de la colonne du milieu.
        Contracts.renderTab();
    },
    exportPDF: async (id) => {
        const ct = id ? Contracts.store.get(id) : Contracts.store.get(Contracts._editing);
        if(!ct) return;
        let body = ct.body || '';
        if(ct.id === Contracts._editing) { const live = document.getElementById('ctr-doc'); if(live) body = live.innerHTML; }
        body = Contracts._sanitizeBody(body);
        if(typeof html2canvas === 'undefined' || !window.jspdf) { Utils.toast('Librairie PDF indisponible', 'error'); return; }
        Utils.toast('Génération du PDF…', 'info');
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:fixed; top:0; left:-10000px; width:794px; background:#fff; color:#111; padding:40px 48px; box-sizing:border-box; font-family: Georgia, "Times New Roman", serif; font-size:14px; line-height:1.55;';
        tempDiv.innerHTML = '<style>'
            + '#ctr-pdf-wrap .ctr-field{background:none !important;color:#111 !important;padding:0 !important;}'
            + '#ctr-pdf-wrap .ctr-blank{color:#333 !important;}'
            + '#ctr-pdf-wrap h1{font-size:22px;text-align:center;margin:0 0 14px;}'
            + '#ctr-pdf-wrap h2{font-size:16px;border-bottom:1px solid #999;padding-bottom:3px;margin:16px 0 6px;}'
            + '#ctr-pdf-wrap table{width:100%;border-collapse:collapse;margin:8px 0;}'
            + '#ctr-pdf-wrap td,#ctr-pdf-wrap th{border:1px solid #999;padding:5px 7px;text-align:left;}'
            + '#ctr-pdf-wrap .ctr-legal{font-size:11px;color:#444;font-style:italic;border-top:1px solid #999;padding-top:8px;margin-top:18px;}'
            + '</style><div id="ctr-pdf-wrap">' + body + '</div>';
        document.body.appendChild(tempDiv);
        try {
            const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
            await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageH = 297, imgW = 210;
            const imgH = canvas.height * imgW / canvas.width;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            let position = 0, heightLeft = imgH;
            doc.addImage(dataUrl, 'JPEG', 0, position, imgW, imgH);
            heightLeft -= pageH;
            while(heightLeft > 0) { position -= pageH; doc.addPage(); doc.addImage(dataUrl, 'JPEG', 0, position, imgW, imgH); heightLeft -= pageH; }
            const ctrSection = 'Contrat' + (ct.type ? ' - ' + ct.type : '') + (ct.partyName ? ' - ' + ct.partyName : '');
            doc.save((typeof PdfTheme !== 'undefined' && PdfTheme.filename) ? PdfTheme.filename(ctrSection) : `${state.data.title || 'Projet'} - ${ctrSection} - moteur.studio.pdf`);
            Utils.toast('PDF généré', 'success');
        } catch(err) {
            console.warn('[Contrat PDF] échec', err);
            Utils.toast('Échec de la génération PDF', 'error');
        } finally {
            if(tempDiv.parentNode) tempDiv.parentNode.removeChild(tempDiv);
        }
    }

    // Ancienne modale de generation de contrat (openModal + sa chaine de
    // 10 fonctions) et ses modeles ContractsTemplates : SUPPRIMES en v569.
    // Integralement remplacee par le Hub de contrats (newContract /
    // openExisting / openEditor / defaultBody / exportPDF), qui a ses propres
    // textes et sa propre generation PDF.
};
