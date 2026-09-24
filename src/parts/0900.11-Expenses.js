
const Expenses = {
    // ===================== ÉTAT & CONFIG =====================
    expenses: [],
    filterDept: '',
    filterStatus: '',
    filterSearch: '',
    mode: 'simple', // 'simple' ou 'advanced'
    
    // ===================== CATÉGORIES CNC, TVA & MIGRATION =====================
    // Catégories CNC officielles (nomenclature devis de production)
    CNC_CATEGORIES: [
        { 
            id: 'droits', code: '1', name: 'Droits artistiques', icon: '📜',
            subcats: [
                { id: 'droits_scenario', name: 'Scénario / Adaptation' },
                { id: 'droits_musique', name: 'Droits musicaux' },
                { id: 'droits_autres', name: 'Autres droits' }
            ]
        },
        { 
            id: 'personnel', code: '2', name: 'Personnel', icon: '👥',
            subcats: [
                { id: 'personnel_realisation', name: 'Réalisation' },
                { id: 'personnel_technique', name: 'Équipe technique' },
                { id: 'personnel_production', name: 'Production' }
            ]
        },
        { 
            id: 'interpretation', code: '3', name: 'Interprétation', icon: '🎭',
            subcats: [
                { id: 'interpretation_principaux', name: 'Rôles principaux' },
                { id: 'interpretation_secondaires', name: 'Rôles secondaires' },
                { id: 'interpretation_figuration', name: 'Figuration' }
            ]
        },
        { 
            id: 'charges', code: '4', name: 'Charges sociales', icon: '📊',
            subcats: [
                { id: 'charges_artistiques', name: 'Charges artistes' },
                { id: 'charges_techniques', name: 'Charges techniciens' }
            ]
        },
        { 
            id: 'decors', code: '5', name: 'Décors & Costumes', icon: '🎨',
            subcats: [
                { id: 'decors_construction', name: 'Construction décors' },
                { id: 'decors_naturels', name: 'Décors naturels' },
                { id: 'costumes', name: 'Costumes' },
                { id: 'maquillage', name: 'Maquillage / Coiffure' }
            ]
        },
        { 
            id: 'transport', code: '6', name: 'Transports & Régie', icon: '🚗',
            subcats: [
                { id: 'transport_voyages', name: 'Voyages' },
                { id: 'transport_vehicules', name: 'Véhicules' },
                { id: 'regie_defraiements', name: 'Défraiements' },
                { id: 'regie_catering', name: 'Régie / Catering' }
            ]
        },
        { 
            id: 'moyens_tech', code: '7', name: 'Moyens techniques', icon: '🎥',
            subcats: [
                { id: 'tech_camera', name: 'Matériel caméra' },
                { id: 'tech_lumiere', name: 'Lumière' },
                { id: 'tech_son', name: 'Son' },
                { id: 'tech_machinerie', name: 'Machinerie' },
                { id: 'tech_effets', name: 'Effets spéciaux plateau' }
            ]
        },
        { 
            id: 'postprod', code: '8', name: 'Post-production', icon: '🎞️',
            subcats: [
                { id: 'postprod_montage', name: 'Montage' },
                { id: 'postprod_son', name: 'Post-prod son / Mixage' },
                { id: 'postprod_image', name: 'Étalonnage' },
                { id: 'postprod_vfx', name: 'Effets visuels' }
            ]
        },
        { 
            id: 'assurances', code: '9', name: 'Assurances & Divers', icon: '📋',
            subcats: [
                { id: 'assurances_prod', name: 'Assurances' },
                { id: 'frais_generaux', name: 'Frais généraux' },
                { id: 'imprevus', name: 'Imprévus' }
            ]
        }
    ],
    
    // 31 aout — POSTES QUI RELEVENT DU TOURNAGE. Sert au seul calcul du cout
    // moyen par jour de tournage : diviser le budget ENTIER par le nombre de
    // jours de plateau melangeait les droits d'auteur, la post-production et
    // les assurances a une moyenne censee dire ce que coute UNE journee de
    // tournage. Sont donc ecartes les postes 1 (droits artistiques),
    // 8 (post-production) et 9 (assurances et divers) — les seuls qui ne
    // dependent pas du nombre de jours passes sur le plateau.
    SHOOT_CATEGORIES: ['personnel', 'interpretation', 'charges', 'decors', 'transport', 'moyens_tech'],
    
    // Mapping anciennes catégories → nouvelles CNC
    MIGRATION_MAP: {
        'production': 'personnel',
        'technique': 'moyens_tech',
        'artistique': 'decors',
        'logistique': 'transport',
        'salaires': 'personnel', // Les salaires acteurs seront remappés vers 'interpretation'
        'divers': 'assurances',
        // Anciens départements détaillés
        'image': 'moyens_tech',
        'lumiere': 'moyens_tech',
        'son': 'moyens_tech',
        'realisation': 'personnel',
        'decoration': 'decors',
        'costumes': 'decors',
        'maquillage': 'decors',
        'regie': 'transport',
        'transport': 'transport',
        'catering': 'transport',
        'postprod': 'postprod',
        'location': 'decors',
        'assurance': 'assurances'
    },
    
    // Taux de TVA courants
    // v593 : VAT_RATES retiré (liste de taux de TVA jamais lue ailleurs).
    
    // Migration des données existantes vers le nouveau format
    migrateData: () => {
        let migrated = false;
        
        // Migrer le budget
        if(!state.data.budget) state.data.budget = {};
        if(!state.data.budget.vatMode) {
            state.data.budget.vatMode = 'HT';
            state.data.budget.defaultVatRate = 20;
            migrated = true;
        }
        if(!state.data.budget.previsionnel) {
            state.data.budget.previsionnel = {};
            // Migrer les anciennes enveloppes vers le prévisionnel
            if(state.data.budget.envelopes) {
                Object.entries(state.data.budget.envelopes).forEach(([oldCat, amount]) => {
                    const newCat = Expenses.MIGRATION_MAP[oldCat] || 'assurances';
                    if(!state.data.budget.previsionnel[newCat]) {
                        state.data.budget.previsionnel[newCat] = { budgetHT: 0, budgetTTC: 0 };
                    }
                    state.data.budget.previsionnel[newCat].budgetHT += amount;
                    state.data.budget.previsionnel[newCat].budgetTTC += amount * 1.2;
                });
                migrated = true;
            }
        }
        if(!state.data.budget.alertThresholds) {
            state.data.budget.alertThresholds = { warning: 80, danger: 100 };
        }
        
        // Migrer les dépenses
        (state.data.expenses || []).forEach(exp => {
            // Migrer la catégorie
            if(exp.department && !exp.category) {
                // Cas spécial : salaires acteurs → interprétation
                if(exp.department === 'salaires' && exp.salaryPersonType === 'actor') {
                    exp.category = 'interpretation';
                    exp.subcategory = 'interpretation_principaux';
                } else if(exp.department === 'salaires' && exp.salaryPersonType === 'crew') {
                    exp.category = 'personnel';
                    exp.subcategory = 'personnel_technique';
                } else {
                    exp.category = Expenses.MIGRATION_MAP[exp.department] || 'assurances';
                }
                migrated = true;
            }
            
            // Migrer les montants HT/TTC
            if(exp.amount !== undefined && exp.amountHT === undefined) {
                exp.amountHT = exp.amount;
                exp.vatRate = 0; // Par défaut, pas de TVA sur les anciennes
                exp.amountTTC = exp.amount;
                migrated = true;
            }
            
            // Migrer photo vers attachments
            if(exp.photo && (!exp.attachments || exp.attachments.length === 0)) {
                exp.attachments = [{
                    id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    name: 'justificatif.jpg',
                    url: exp.photo,
                    type: 'photo'
                }];
                migrated = true;
            }
        });
        
        if(migrated) {
            // Migration budget/dépenses effectuée
            Store.save();
        }
        
        return migrated;
    },
    
    // ===================== HELPERS (catégorie, calculs TVA) =====================
    // Obtenir une catégorie par ID
    getCategory: (catId) => {
        return Expenses.CNC_CATEGORIES.find(c => c.id === catId);
    },
    
    // Calculer le montant TTC à partir du HT
    calculateTTC: (amountHT, vatRate) => {
        return Math.round(amountHT * (1 + vatRate / 100) * 100) / 100;
    },
    
    // Calculer le montant HT à partir du TTC
    calculateHT: (amountTTC, vatRate) => {
        return Math.round(amountTTC / (1 + vatRate / 100) * 100) / 100;
    },
    
    // ===================== INIT, MODE & RENDU =====================
    // Initialise le module
    init: () => {
        if(!state.data.expenses) state.data.expenses = [];
        if(!state.data.budget) state.data.budget = { total: 0, currency: '€', manager: '', envelopes: {}, deptManagers: {}, previsionnel: {}, vatMode: 'HT', defaultVatRate: 20 };
        if(!state.data.budget.envelopes) state.data.budget.envelopes = {};
        if(!state.data.budget.deptManagers) state.data.budget.deptManagers = {};
        if(!state.data.budget.previsionnel) state.data.budget.previsionnel = {};
        
        // Migration des anciennes données
        Expenses.migrateData();
        
        Expenses.expenses = state.data.expenses;
        
        // Le mode de budget appartient au PROJET (state.data.budget.mode) et non au
        // navigateur : deux collaborateurs doivent voir le meme budget, et un petit
        // projet ne doit pas heriter du mode choisi sur un gros. L'ancienne cle
        // localStorage n'est plus lue (elle ne portait meme pas l'id du projet).
        // Valeur absente = choix jamais fait : on demande a l'ouverture (askMode).
        const savedMode = state.data.budget?.mode;
        Expenses.mode = (savedMode === 'advanced' || savedMode === 'simple') ? savedMode : 'simple';
        
        Expenses.populateCategories();
        Expenses.populateManager();
        Expenses.loadBudget();
        Expenses.loadFinanceParams();
        Expenses.loadManagerEmailPref();
        Expenses.renderCategoryManagers();
        Expenses.applyMode();
        Expenses.render();
        Expenses.askModeIfNeeded();
    },
    
    // Premiere arrivee sur l'onglet d'un projet dont le mode n'a jamais ete choisi :
    // on pose la question une fois. Silencieux pour qui ne peut pas ecrire (un
    // lecteur n'a pas a trancher un reglage du projet, et sa reponse ne serait pas
    // enregistree).
    askModeIfNeeded: () => {
        const already = state.data.budget?.mode;
        if(already === 'simple' || already === 'advanced') return;
        if(typeof Permissions !== 'undefined' && Permissions.tabWritable && !Permissions.tabWritable('expenses')) return;
        setTimeout(() => Expenses.openModeChooser(true), 300);
    },
    
    // Changer de mode Simple/Avancé
    setMode: (mode) => {
        Expenses.mode = mode;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.mode = mode;
        Store.save();
        Expenses.applyMode();
        Expenses.render();
    },
    
    // ===== DEUX VUES DE L'ONGLET (8e, 25 aout) =====
    // « Dépenses » porte le budget, les filtres, le tri et les fiches ;
    // « Coût par jour » ne porte que la lecture par journée de tournage. Le
    // reglage n'appartient pas au projet mais au moment de travail : il n'est
    // donc pas persiste, chaque arrivee sur l'onglet repart des depenses.
    _view: 'list',
    setView: (v) => {
        Expenses._view = (v === 'days') ? 'days' : 'list';
        Expenses.applyView();
    },
    applyView: () => {
        const isDays = Expenses._view === 'days';
        const bl = document.getElementById('exp-viewbtn-list');
        const bd = document.getElementById('exp-viewbtn-days');
        if(bl) bl.classList.toggle('fds-tabbtn-active', !isDays);
        if(bd) bd.classList.toggle('fds-tabbtn-active', isDays);
        const pl = document.getElementById('expenses-pane-list');
        const pd = document.getElementById('expenses-pane-days');
        if(pl) pl.style.display = isDays ? 'none' : 'block';
        if(pd) pd.style.display = isDays ? 'block' : 'none';
    },
    
    // Fenetre de generation des salaires. Une depense de salaire est une depense
    // COMME UNE AUTRE (decision de Guillaume) : elle vit dans la meme grille que
    // les autres, se trie et se filtre comme elles. Ce qui restait a lui donner,
    // c'est un endroit pour la FABRIQUER a partir du planning et des tarifs —
    // d'ou cette fenetre, qui est un outil et non une seconde liste.
    openSalariesModal: () => {
        const old = document.getElementById('salaries-modal');
        if(old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'salaries-modal';
        wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:var(--z-modal); display:block; overflow-y:auto; padding:40px 16px;';
        wrap.onclick = (e) => { if(e.target === wrap) wrap.remove(); };
        const box = document.createElement('div');
        box.style.cssText = 'display:block; box-sizing:border-box; width:100%; max-width:900px; margin:0 auto; background:var(--panel-bg); color:var(--text-main); border-radius:12px; padding:20px; box-shadow:0 10px 40px rgba(0,0,0,0.4);';
        box.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">'
            + '<div><h3 style="margin:0 0 4px 0;">💼 Salaires</h3>'
            + '<div style="font-size:0.85rem; color:var(--text-sec);">Une fiche par personne convoquée, calculée depuis le planning et son tarif. Le rond ↻ génère ou recalcule sa dépense, qui rejoint ensuite la liste des dépenses.</div></div>'
            + '<div style="display:flex; gap:8px; flex-shrink:0;">'
            + '<button onclick="app.Expenses.checkMissingInfo()" style="padding:8px 14px; background:var(--warning, #FF9800); color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:500; font-size:0.85rem;">🔍 Vérifier infos</button>'
            + '<button onclick="document.getElementById(\'salaries-modal\').remove()" style="padding:8px 14px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main); cursor:pointer; font-weight:600;">Fermer</button>'
            + '</div></div>'
            + '<div id="expenses-salaries-list"></div>'
            + '<div style="text-align:right; margin-top:10px; font-weight:bold;">Total estimé : <span id="expenses-salaries-total">0 €</span></div>';
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        ExpensesSalaries.renderSalaries();
    },
    
    // Depenses rattachees a une cible donnee. Aucune deduction, aucun partage :
    // seules comptent les depenses qui pointent EXPLICITEMENT vers cette cible.
    linkedExpenses: (kind, id) => {
        if(!kind || !id) return [];
        return (state.data.expenses || []).filter(e => e && e.link && e.link.k === kind && e.link.id === id);
    },
    // Total des depenses rattachees, dans le mode TVA du projet (HT ou TTC),
    // le meme que celui de l'onglet Depenses : deux ecrans qui annonceraient
    // deux totaux differents pour la meme fiche seraient pires que pas de total.
    linkedTotal: (kind, id) => {
        const ttc = (state.data.budget?.vatMode || 'HT') === 'TTC';
        return Expenses.linkedExpenses(kind, id).reduce((sum, e) => {
            const v = ttc ? (e.amountTTC != null ? e.amountTTC : e.amount)
                          : (e.amountHT  != null ? e.amountHT  : e.amount);
            return sum + (parseFloat(v) || 0);
        }, 0);
    },
    
    // ===== D'UNE SCENE VERS SON JOUR (25 aout) =====
    // Premier jour DATE ou cette scene est programmee, ou chaine vide si elle
    // ne l'est pas encore. « Premier » et non « tous » : une scene etalee sur
    // deux jours ferait sinon apparaitre la meme depense sur les deux, et le
    // total du projet compterait deux fois le meme achat — exactement ce que la
    // regle « une cible, jamais de division » interdit depuis juillet.
    firstDayOfScene: (sceneId) => {
        if(!sceneId) return '';
        const hits = (state.data.shootingDays || []).filter(d => {
            if(!d || !(d.date || d.startDate)) return false;
            return (d.scenes || []).some(sc => (typeof sc === 'string' ? sc : (sc && sc.sceneId)) === sceneId);
        });
        if(!hits.length) return '';
        hits.sort((a, b) => String(a.date || a.startDate).localeCompare(String(b.date || b.startDate)));
        return hits[0].id;
    },
    // Nombre de jours DATES sur lesquels une scene est programmee. Sert a
    // prevenir sur la fiche quand une depense n'est comptee que sur le premier.
    dayCountOfScene: (sceneId) => {
        if(!sceneId) return 0;
        return (state.data.shootingDays || []).filter(d => {
            if(!d || !(d.date || d.startDate)) return false;
            return (d.scenes || []).some(sc => (typeof sc === 'string' ? sc : (sc && sc.sceneId)) === sceneId);
        }).length;
    },
    // Tout ce qui pese sur un jour : ce qui le vise directement, plus les
    // depenses de ses scenes. Une depense de scene non encore programmee ne pese
    // sur aucun jour — elle attend sa date, et reste lisible sur sa fiche.
    dayExpenses: (dayId) => {
        if(!dayId) return [];
        const direct = Expenses.linkedExpenses('day', dayId);
        const viaScene = (state.data.expenses || []).filter(e =>
            e && e.link && e.link.k === 'scene' && Expenses.firstDayOfScene(e.link.id) === dayId);
        return direct.concat(viaScene);
    },
    dayTotal: (dayId) => {
        const ttc = (state.data.budget?.vatMode || 'HT') === 'TTC';
        return Expenses.dayExpenses(dayId).reduce((sum, e) => {
            const v = ttc ? (e.amountTTC != null ? e.amountTTC : e.amount)
                          : (e.amountHT  != null ? e.amountHT  : e.amount);
            return sum + (parseFloat(v) || 0);
        }, 0);
    },
    
    // ===================== LIEN VERS UN ELEMENT DU FILM (etape 7d) =====================
    // Une depense porte au plus UN lien : { k: type, id: identifiant }. Les types
    // de fiche sont ceux de UI.FICHE_TAB (v572), plus 'day' pour un jour de
    // tournage — les repas, l'essence ou la location d'un camion ne visent aucune
    // fiche mais bien une date.
    // REGLE FERME : on ne divise JAMAIS un montant. Une valise a 40 euros presente
    // dans douze scenes reste une valise a 40 euros. Tout ecran de synthese compte
    // chaque depense une fois, sur sa cible, et rien d'autre.
    linkValue: (link) => (link && link.k && link.id) ? (link.k + '|' + link.id) : '',
    parseLink: (value) => {
        if(!value || value.indexOf('|') < 0) return null;
        const parts = value.split('|');
        return (parts[0] && parts[1]) ? { k: parts[0], id: parts[1] } : null;
    },
    // Libelle affichable d'un lien, ou chaine vide si la cible n'existe plus
    // (fiche supprimee depuis : on ne veut ni planter ni afficher un identifiant).
    // 8a : le nom et l'icone d'une cible sont rendus par le socle. Ces deux
    // fonctions etaient la SEULE table de correspondance famille -> nom du
    // fichier ; la laisser ici obligeait tout autre ecran a la recopier.
    linkLabel: (link) => (link && link.k && link.id) ? Links.label(link.k, link.id) : '',
    linkIcon: (link) => (link && link.k) ? Links.icon(link.k) : '🔗',
    // Remplit le menu deroulant. Groupe par famille pour rester lisible meme sur
    // un projet charge. Une fiche sans identifiant n'est jamais proposee : on
    // ecrirait un lien vide (piege corrige en v572).
    populateLinkSelect: (link) => {
        const sel = document.getElementById('expense-link');
        if(!sel) return;
        sel.innerHTML = '<option value="">-- Rien de particulier --</option>';
        
        const addGroup = (label, items, kind) => {
            const list = (items || []).filter(x => x && x.id && x.name);
            if(list.length === 0) return;
            const g = document.createElement('optgroup');
            g.label = label;
            list.forEach(x => {
                const o = document.createElement('option');
                o.value = kind + '|' + x.id;
                o.textContent = x.name;
                g.appendChild(o);
            });
            sel.appendChild(g);
        };
        
        const res = state.data.resources || [];
        addGroup('🎭 Accessoires', res.filter(r => r.category === 'accessoire'), 'resource');
        addGroup('👔 Costumes',    res.filter(r => r.category === 'costume'),    'resource');
        addGroup('🚗 Véhicules',   res.filter(r => r.category === 'vehicule'),   'resource');
        addGroup('📍 Décors / Lieux', state.data.locations, 'location');
        addGroup('👤 Personnages',    state.data.characters, 'character');
        addGroup('🎭 Comédiens',      state.data.actors, 'actor');
        addGroup('🎬 Équipe',         state.data.crew, 'crew');
        
        // 🏛️ STRUCTURES ET 🚐 VEHICULES (25 aout). La structure est le
        // PRESTATAIRE — l'hotel, le loueur, l'association coproductrice : c'est
        // elle qui emet la facture, et rien ne permettait de l'y rattacher. Le
        // vehicule de production porte carburant, peages et location.
        // Le nom d'une structure vit dans sa fiche normalisee (Orgs._fiche) et
        // pas toujours dans o.name : on passe par la meme lecture que le reste
        // du module, sans quoi la moitie des structures s'afficheraient vides et
        // seraient donc ecartees par le filtre de addGroup.
        const orgs = (state.data.orgs || []).map(o => {
            const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(o) : (o.fiche || o);
            return { id: o.id, name: (fc && fc.name) || o.name || '' };
        });
        addGroup('🏛️ Structures', orgs, 'org');
        addGroup('🚐 Véhicules de production', state.data.vehicles, 'vehicle');
        
        // 🎞️ SCENES (25 aout). Une depense de scene remonte au JOUR ou cette
        // scene se tourne (voir Expenses.firstDayOfScene) : c'est la facon
        // naturelle de saisir « la casse du vase de la scene 12 » sans avoir a
        // savoir quel jour elle est programmee — ni a corriger la depense si le
        // planning bouge.
        const scenes = (state.data.scenes || []).map((s, i) => ({
            id: s.id,
            name: '#' + (i + 1) + (s.title ? ' — ' + String(s.title).slice(0, 50) : '')
        }));
        addGroup('🎞️ Scènes', scenes, 'scene');
        
        const days = (state.data.shootingDays || []).map((d, i) => {
            if(!d) return { id: null, name: '' };
            // Le champ porte le nom 'date' (et non startDate) : voir Planning.
            const dt = d.date || d.startDate || '';
            return {
                id: d.id,
                name: Planning.dayLabel(d) + (dt ? ' — ' + dt : '')
            };
        });
        addGroup('📅 Jours de tournage', days, 'day');
        
        const value = Expenses.linkValue(link);
        // Cible disparue : on la signale au lieu de vider le champ en silence,
        // sinon une simple reouverture de la fiche effacerait le lien.
        if(value && !sel.querySelector('option[value="' + value + '"]')) {
            const o = document.createElement('option');
            o.value = value;
            o.textContent = '⚠️ Élément supprimé depuis';
            sel.appendChild(o);
        }
        sel.value = value;
        Expenses.onLinkChange();
    },
    onLinkChange: () => {
        const sel = document.getElementById('expense-link');
        const btn = document.getElementById('expense-link-open');
        if(!btn) return;
        const link = Expenses.parseLink(sel ? sel.value : '');
        // 8b : le jour de tournage a desormais une porte (sa feuille de service),
        // le bouton n'a donc plus a l'exclure. Il reste eteint pour une cible
        // supprimee depuis, dont linkLabel renvoie une chaine vide.
        btn.style.display = (link && Expenses.linkLabel(link)) ? 'inline-block' : 'none';
        btn.title = (link && link.k === 'day') ? 'Ouvrir la feuille de service de ce jour' : 'Ouvrir la fiche liée';
    },
    openLinkedFiche: () => {
        const sel = document.getElementById('expense-link');
        const link = Expenses.parseLink(sel ? sel.value : '');
        if(!link) return;
        if(typeof UI !== 'undefined' && UI.openFiche) UI.openFiche(link.k, link.id);
    },
    
    // Fenetre de choix du mode de budget. firstTime = question posee a l'arrivee
    // sur un projet qui n'a jamais choisi ; sinon c'est un changement volontaire.
    // PIEGE CONNU (v572) : dans une fenetre construite a la volee, ne dependre ni
    // de classes ni de flex -- les proprietes d'affichage sont posees directement
    // sur chaque element, une regle globale ne peut alors pas les contredire.
    openModeChooser: (firstTime) => {
        const old = document.getElementById('expenses-mode-modal');
        if(old) old.remove();
        const current = Expenses.mode === 'advanced' ? 'advanced' : 'simple';
        const chosen = state.data.budget?.mode;
        
        const wrap = document.createElement('div');
        wrap.id = 'expenses-mode-modal';
        wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10000; display:block; overflow-y:auto; padding:40px 16px;';
        
        const box = document.createElement('div');
        box.style.cssText = 'display:block; box-sizing:border-box; width:100%; max-width:560px; margin:0 auto; background:var(--panel-bg); color:var(--text-main); border-radius:12px; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.4);';
        
        const h = document.createElement('h3');
        h.style.cssText = 'display:block; margin:0 0 8px 0; font-size:1.15rem;';
        h.textContent = firstTime ? 'Comment suivre le budget de ce projet ?' : 'Mode de budget du projet';
        box.appendChild(h);
        
        const intro = document.createElement('p');
        intro.style.cssText = 'display:block; margin:0 0 18px 0; font-size:0.9rem; line-height:1.5; color:var(--text-sec);';
        intro.textContent = firstTime
            ? 'Ce reglage appartient au projet : tous les collaborateurs verront la meme chose. Il reste modifiable a tout moment.'
            : 'Changer de mode ne convertit et n\'efface rien : les depenses sont les memes dans les deux vues. Le mode Simple masque les enveloppes, les responsables et les salaires, il ne les supprime pas -- revenir au Detaille les retrouve.';
        box.appendChild(intro);
        
        const mk = (mode, titre, texte) => {
            const b = document.createElement('div');
            const active = (mode === current && chosen);
            b.style.cssText = 'display:block; box-sizing:border-box; width:100%; text-align:left; margin:0 0 12px 0; padding:14px 16px; border:2px solid ' + (active ? 'var(--primary)' : 'var(--border)') + '; border-radius:10px; cursor:pointer; background:var(--bg);';
            const t = document.createElement('div');
            t.style.cssText = 'display:block; font-weight:700; font-size:0.98rem; margin:0 0 4px 0;';
            t.textContent = titre + (active ? '   (mode actuel)' : '');
            const d = document.createElement('div');
            d.style.cssText = 'display:block; font-size:0.85rem; line-height:1.45; color:var(--text-sec);';
            d.textContent = texte;
            b.appendChild(t);
            b.appendChild(d);
            b.onclick = () => {
                wrap.remove();
                Expenses.setMode(mode);
                Utils.toast(mode === 'simple' ? 'Budget en mode Simple' : 'Budget en mode Detaille', 'success');
            };
            return b;
        };
        
        box.appendChild(mk('simple', '📋 Simple',
            'Un budget global et une liste de depenses a payer / payees. Pour un court-metrage, un projet etudiant ou associatif.'));
        box.appendChild(mk('advanced', '⚙️ Detaille',
            'En plus : enveloppes prevues par poste CNC, responsable par poste, TVA, salaires et synthese. Pour une production qui doit justifier ses comptes.'));
        
        const foot = document.createElement('div');
        foot.style.cssText = 'display:block; text-align:right; margin-top:6px;';
        const cancel = document.createElement('button');
        cancel.style.cssText = 'padding:8px 18px; border:1px solid var(--border); border-radius:6px; cursor:pointer; background:var(--bg); color:var(--text-main); font-weight:600;';
        cancel.textContent = firstTime ? 'Plus tard' : 'Annuler';
        cancel.onclick = () => wrap.remove();
        foot.appendChild(cancel);
        box.appendChild(foot);
        
        wrap.appendChild(box);
        wrap.onclick = (e) => { if(e.target === wrap) wrap.remove(); };
        document.body.appendChild(wrap);
    },
    
    // Appliquer le mode visuel
    applyMode: () => {
        const isSimple = Expenses.mode === 'simple';
        
        // Bouton unique de mode (libelle seulement : le choix se fait dans la fenetre)
        const btnMode = document.getElementById('expenses-mode-btn');
        if(btnMode) btnMode.textContent = isSimple ? '⚙️ Mode : Simple' : '⚙️ Mode : Détaillé';
        
        // Sidebar (avancé uniquement)
        const sidebar = document.getElementById('expenses-sidebar-advanced');
        if(sidebar) sidebar.style.display = isSimple ? 'none' : 'block';
        
        // Header simple
        const simpleHeader = document.getElementById('expenses-simple-header');
        if(simpleHeader) simpleHeader.style.display = isSimple ? 'block' : 'none';
        
        // Summary avancé
        const advancedSummary = document.getElementById('expenses-summary-advanced');
        if(advancedSummary) advancedSummary.style.display = isSimple ? 'none' : 'flex';
        
        // Filtres
        const advancedFilters = document.getElementById('expenses-filters-advanced');
        const simpleFilters = document.getElementById('expenses-filters-simple');
        if(advancedFilters) advancedFilters.style.display = isSimple ? 'none' : 'flex';
        if(simpleFilters) simpleFilters.style.display = isSimple ? 'block' : 'none';
        
        // Ajuster la grille container
        const container = document.querySelector('.expenses-container');
        if(container) {
            container.style.gridTemplateColumns = isSimple ? '1fr' : '280px 1fr';
        }
        
        // Synchroniser le budget simple
        const budgetSimple = document.getElementById('expenses-budget-simple');
        if(budgetSimple) {
            budgetSimple.value = state.data.budget?.total || '';
        }
    },
    
    saveBudgetSimple: () => {
        const value = parseFloat(document.getElementById('expenses-budget-simple')?.value) || 0;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.total = value;
        
        // Synchroniser avec le champ avancé
        const advancedInput = document.getElementById('expenses-budget-total');
        if(advancedInput) advancedInput.value = value;
        
        Store.save();
        Expenses.updateSummary();
    },
    
    // Remplit les selects avec les catégories CNC
    populateCategories: () => {
        const categories = Expenses.CNC_CATEGORIES;
        
        // Remplir les selects de catégorie
        const selects = ['expense-category', 'expenses-filter-dept'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if(!select) return;
            
            const firstOption = select.querySelector('option');
            select.innerHTML = '';
            if(firstOption) select.appendChild(firstOption);
            
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = `${cat.icon} ${cat.code}. ${cat.name}`;
                select.appendChild(opt);
            });
        });
        
        // Liste des catégories CNC dans la sidebar
        const catList = document.getElementById('expenses-dept-list');
        if(catList) {
            catList.innerHTML = '';
            const currency = state.data.budget?.currency || '€';
            const expenses = state.data.expenses || [];
            const previsionnel = state.data.budget?.previsionnel || {};
            const vatMode = state.data.budget?.vatMode || 'HT';
            const thresholds = state.data.budget?.alertThresholds || { warning: 80, danger: 100 };
            
            categories.forEach(cat => {
                const budget = previsionnel[cat.id]?.[vatMode === 'HT' ? 'budgetHT' : 'budgetTTC'] || 0;
                const catManager = state.data.budget?.deptManagers?.[cat.id];
                
                // Trouver le nom du responsable
                let managerName = '';
                if(catManager?.email) {
                    const person = Expenses.findPersonByEmail(catManager.email);
                    managerName = person?.name || catManager.email.split('@')[0];
                }
                
                // Calculer les dépenses pour cette catégorie
                const catExpenses = expenses.filter(e => e.category === cat.id || e.department === cat.id);
                const spent = catExpenses
                    .filter(e => e.status === 'approved' || e.status === 'done')
                    .reduce((sum, e) => sum + (vatMode === 'HT' ? (e.amountHT || e.amount || 0) : (e.amountTTC || e.amount || 0)), 0);
                
                const countPending = catExpenses.filter(e => e.status === 'pending').length;
                const countMissingRate = catExpenses.filter(e => e.salaryMissingRate).length;
                
                // Calculer le pourcentage et l'état d'alerte
                const percent = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                const alertState = percent >= thresholds.danger ? 'danger' : percent >= thresholds.warning ? 'warning' : 'ok';
                
                // Badges
                let badges = '';
                if(countMissingRate > 0) badges += `<span class="dept-badge red" title="Tarif manquant">${countMissingRate}</span>`;
                if(countPending > 0) badges += `<span class="dept-badge yellow" title="En attente">${countPending}</span>`;
                if(alertState === 'danger') badges += `<span class="dept-badge red" title="Budget dépassé !">🔴</span>`;
                else if(alertState === 'warning') badges += `<span class="dept-badge orange" title="Attention budget">⚠️</span>`;
                
                // Barre de progression
                const progressColor = alertState === 'danger' ? 'var(--danger)' : alertState === 'warning' ? '#f59e0b' : 'var(--success)';
                const progressBar = budget > 0 ? `
                    <div style="height:4px; background:var(--border); border-radius:2px; margin-top:4px; overflow:hidden;">
                        <div style="height:100%; width:${Math.min(percent, 100)}%; background:${progressColor}; transition:width 0.3s;"></div>
                    </div>
                ` : '';
                
                const div = document.createElement('div');
                div.className = 'expense-dept-item' + (Expenses.filterDept === cat.id ? ' active' : '');
                div.innerHTML = `
                    <div class="flex-1">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="dept-name">${cat.icon} ${cat.code}. ${cat.name}</span>
                            <div class="dept-badges">${badges}</div>
                        </div>
                        ${budget > 0 ? `
                            <div style="font-size:0.7rem; color:var(--text-sec);">
                                Prévu: ${budget.toLocaleString()} ${currency} ${vatMode}
                                ${percent > 0 ? `<span style="color:${progressColor}; font-weight:600;">(${percent}%)</span>` : ''}
                            </div>
                            ${progressBar}
                        ` : ''}
                        ${managerName ? `<div style="font-size:0.7rem; color:var(--primary); margin-top:2px;">👤 ${Utils.escape(managerName)}</div>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <span class="dept-amount" id="cat-total-${cat.id}" style="color:${alertState === 'danger' ? 'var(--danger)' : 'var(--text-main)'}">${spent.toLocaleString()} ${currency}</span>
                        <button onclick="event.stopPropagation(); app.Expenses.editCategoryBudget('${cat.id}')" style="background:none; border:none; cursor:pointer; font-size:0.8rem; padding:2px 5px; margin-left:5px;" title="Paramètres de la catégorie">⚙️</button>
                    </div>
                `;
                div.onclick = (e) => {
                    if(e.target.tagName === 'BUTTON') return;
                    Expenses.filterDept = Expenses.filterDept === cat.id ? '' : cat.id;
                    const filterSelect = document.getElementById('expenses-filter-dept');
                    if(filterSelect) filterSelect.value = Expenses.filterDept;
                    Expenses.applyFilters();
                    Expenses.populateCategories();
                };
                catList.appendChild(div);
            });
        }
    },
    
    // Alias pour rétrocompatibilité
    populateDepartments: () => {
        Expenses.populateCategories();
    },
    
    // Remplit le select du responsable budget
    populateManager: () => {
        const select = document.getElementById('expenses-manager');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Choisir --</option>';
        
        // Ajouter les membres de l'équipe
        if(state.data.crew) {
            state.data.crew.forEach(member => {
                if(member.email) {
                    const opt = document.createElement('option');
                    opt.value = member.email;
                    opt.textContent = member.name + ' (' + (member.role || 'Équipe') + ')';
                    select.appendChild(opt);
                }
            });
        }
        
        // Sélectionner le manager actuel
        if(state.data.budget?.manager) {
            select.value = state.data.budget.manager;
        }
    },
    
    // Budget, TVA, managers & paramètres financiers — délégué à ExpensesBudget
    loadBudget: (...a) => ExpensesBudget.loadBudget(...a),
    saveBudget: (...a) => ExpensesBudget.saveBudget(...a),
    setVatMode: (...a) => ExpensesBudget.setVatMode(...a),
    saveDefaultVat: (...a) => ExpensesBudget.saveDefaultVat(...a),
    saveAlertThresholds: (...a) => ExpensesBudget.saveAlertThresholds(...a),
    saveManager: (...a) => ExpensesBudget.saveManager(...a),
    saveManagerEmailPref: (...a) => ExpensesBudget.saveManagerEmailPref(...a),
    loadManagerEmailPref: (...a) => ExpensesBudget.loadManagerEmailPref(...a),
    renderCategoryManagers: (...a) => ExpensesBudget.renderCategoryManagers(...a),
    findPersonByEmail: (...a) => ExpensesBudget.findPersonByEmail(...a),
    isDeptManager: (...a) => ExpensesBudget.isDeptManager(...a),
    saveFinanceParams: (...a) => ExpensesBudget.saveFinanceParams(...a),
    loadFinanceParams: (...a) => ExpensesBudget.loadFinanceParams(...a),
    editCategoryBudget: (...a) => ExpensesBudget.editCategoryBudget(...a),
    isBudgetManager: (...a) => ExpensesBudget.isBudgetManager(...a),
    openBudgetSettings: (...a) => ExpensesBudget.openSettings(...a),
    // Rendu principal
    render: () => {
        Expenses.updateSummary();
        Expenses.updateDeptTotals();
        Expenses.populateDepartments();
        Expenses.renderExpensesList();
        // renderSalaries ne fait rien si la fenetre des salaires n'est pas
        // ouverte (son conteneur n'existe pas), mais elle doit etre rejouee
        // quand elle l'est : generer un salaire redessine la liste dessous.
        Expenses.renderSalaries();
        Expenses.renderCostPerDay();
        Expenses.applyView();
    },
    
    // Recapitulatif par jour de tournage. Ne remonte QUE les depenses portant un
    // lien 'day' : repas, essence, location a la journee. Les elements depouilles
    // ce jour-la (une chemise, un vehicule) ne sont volontairement PAS reventiles
    // ici : ils appartiennent a leur fiche, et les compter par jour reviendrait a
    // additionner plusieurs fois le meme achat.
    // Section entierement masquee si aucune depense n'est rattachee a un jour :
    // un tableau vide n'apprend rien et occupe l'ecran.
    renderCostPerDay: () => {
        const list = document.getElementById('expenses-per-day-list');
        if(!list) return;
        
        const cur = state.data.budget?.currency || '€';
        const mode = state.data.budget?.vatMode || 'HT';
        const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
        const days = state.data.shootingDays || [];
        
        // TOUS les jours de tournage ont leur fiche, y compris ceux qui n'ont
        // encore rien coute : un jour a zero euro est une information (rien n'a
        // ete rattache), pas une ligne a cacher. Les jours sans depense sont
        // simplement repousses en fin de grille.
        // UN JOUR SANS DATE N'EST PAS UN JOUR (decision du 25 aout). Il
        // n'apparaît dans aucun agenda, aucune feuille ne lui est attachee : lui
        // fabriquer une fiche de cout revenait a donner corps a un fantome. Les
        // jours orphelins des anciens projets sont donc simplement absents d'ici.
        // Ils restent atteignables et supprimables depuis l'onglet Planning.
        const rows = days.map((d, i) => {
            if(!d || !d.id) return null;
            const iso = d.date || d.startDate || '';
            if(!iso) return null;
            const linked = Expenses.dayExpenses(d.id);
            // TITRE = LA DATE, seul repere qui ne mente pas.
            // Deux titres ont ete essayes et ecartes le 25 aout :
            //  - le nom du jour : fabrique a partir des scenes quand il n'est pas
            //    saisi (« Sc.1 »), il fait croire a une fiche de scene et surtout
            //    il n'indique aucun rang — la scene 1 peut se tourner au 4e jour ;
            //  - « Jour N » (dayNumber) : ce compteur vaut « nombre de jours
            //    existants + 1 » a la creation, c'est donc un ordre de SAISIE.
            //    Creer le 20 fevrier avant le 1er donne Jour 1 = 20 fevrier.
            // On n'invente pas non plus un rang chronologique recalcule ici : il
            // divergerait de celui qu'affichent la feuille de service et les
            // exports, et deux ecrans annoncant deux numeros pour le meme jour
            // seraient pires que pas de numero du tout. (Le calcul de dayNumber
            // est un chantier a part, note dans le plan.)
            const type = (typeof Planning !== 'undefined' && Planning.dayTypes) ? Planning.dayTypes[d.dayType || 'tournage'] : null;
            const dt = new Date(iso + 'T12:00:00');
            const human = isNaN(dt.getTime()) ? iso : dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            return {
                id: d.id,
                label: human,
                sub: d.name || '',
                icon: (type && type.icon) || '📅',
                typeLabel: (type && type.label) || 'Tournage',
                date: iso,
                count: linked.length,
                total: Expenses.dayTotal(d.id)
            };
        }).filter(Boolean);
        
        if(!rows.length) {
            list.innerHTML = '<div class="ccol-empty" style="padding:40px 20px;">Aucun jour daté sur ce projet. Un coût par jour suppose une journée posée dans l\u2019agenda : place tes jours de tournage dans l\u2019onglet Planning, ils apparaîtront ici.</div>';
            return;
        }
        
        const sort = Expenses._daySort || 'date';
        const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.label.localeCompare(b.label, 'fr');
        let sorted = rows.slice();
        if(sort === 'cout') sorted.sort((a, b) => (b.total - a.total) || byDate(a, b));
        // « A → Z » trie sur le NOM du jour (« Sc.1 », « Cabinet d'avocat »), pas
        // sur son titre : celui-ci est desormais une date, deja couverte par le
        // classement « Par date ».
        else if(sort === 'alpha') sorted.sort((a, b) => String(a.sub || a.label).localeCompare(String(b.sub || b.label), 'fr'));
        else if(sort === 'type') sorted.sort((a, b) => String(a.typeLabel).localeCompare(String(b.typeLabel), 'fr') || byDate(a, b));
        else sorted.sort((a, b) => (b.count > 0) - (a.count > 0) || byDate(a, b));
        
        const grand = rows.reduce((s, r) => s + r.total, 0);
        const nb = rows.filter(r => r.count).length;
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (sort === 'date' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'date\')">Par date</button>'
            + '<button class="chub-sort-btn ' + (sort === 'cout' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'cout\')">Par coût</button>'
            + '<button class="chub-sort-btn ' + (sort === 'alpha' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (sort === 'type' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'type\')">Par type de journée</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + nb + ' jour' + (nb > 1 ? 's' : '') + ' avec dépense • Total ' + fmt(grand) + ' ' + mode + '</span></div>';
        
        const cardOf = (r) => {
            const vide = r.count === 0;
            // Sous la ligne du montant : le type de journee puis le nom du jour.
            // Le nom redevient ce qu'il est — ce qu'on y tourne — au lieu de tenir
            // lieu de reperage dans le temps.
            const meta = [r.typeLabel, r.sub].filter(Boolean).join(' · ');
            return '<div class="compact-card" style="' + (vide ? 'opacity:0.6;' : '') + '" onclick="app.UI.openFiche(\'day\', ' + Utils.jsArg(String(r.id)) + ')" title="' + r.typeLabel + ' — ouvrir la feuille de service">'
                + '<div class="compact-card-badge" title="Nombre de dépenses rattachées">' + r.count + '</div>'
                + '<div class="compact-card-photo">' + r.icon + '</div>'
                + '<div class="compact-card-name">' + Utils.escape(r.label) + '</div>'
                + '<div class="compact-card-role" style="font-weight:700; color:' + (vide ? 'var(--text-sec)' : 'var(--primary)') + ';">' + fmt(r.total) + '</div>'
                + '<div class="compact-card-role" style="font-size:0.72rem; opacity:0.75;">' + Utils.escape(meta) + '</div>'
                + '</div>';
        };
        const cards = sorted.map(cardOf).join('');
        
        // « Par type de journée » regroupe : un repérage, un essai costume et un
        // jour de plateau ne se comparent pas, les melanger dans une grille
        // continue oblige a lire chaque icone une par une.
        if(sort === 'type') {
            const secs = [];
            sorted.forEach((r, i) => {
                const html = cardOf(r);
                const last = secs[secs.length - 1];
                if(last && last.label === r.typeLabel) last.items.push(html);
                else secs.push({ label: r.typeLabel, items: [html] });
            });
            list.innerHTML = toolbar + secs.map(s => '<div class="group-section"><div class="group-header">' + Utils.escape(s.label)
                + '<span class="ccol-group-count">' + s.items.length + '</span></div>'
                + '<div class="compact-cards-grid">' + s.items.join('') + '</div></div>').join('');
            return;
        }
        
        list.innerHTML = toolbar + '<div class="compact-cards-grid">' + cards + '</div>';
    },
    _daySort: 'date',
    setDaySort: (mode) => { Expenses._daySort = mode; Expenses.renderCostPerDay(); },
    
    // Met à jour les totaux
    updateSummary: () => {
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const previsionnel = state.data.budget?.previsionnel || {};
        
        // BUDGET TOTAL = ce que la production A, c'est-a-dire le montant SAISI.
        // Les enveloppes par poste n'en sont que la REPARTITION : les additionner
        // pour en faire le budget revenait a dire qu'une production qui n'a rien
        // reparti n'a pas de budget, et faisait tomber un total de 5000 saisi en
        // mode Simple a 300 des qu'une seule enveloppe etait posee en Detaille.
        // Repli sur la somme des enveloppes UNIQUEMENT si aucun total n'a jamais
        // ete saisi : sans cela les projets anterieurs perdraient leur budget.
        let allocated = 0;
        Object.values(previsionnel).forEach(p => {
            allocated += vatMode === 'HT' ? (p.budgetHT || 0) : (p.budgetTTC || 0);
        });
        let budgetTotal = state.data.budget?.total || 0;
        if(budgetTotal === 0) budgetTotal = allocated;
        
        // Calculer le total dépensé (selon mode HT/TTC)
        // On distingue le VALIDE (approuve ou paye) de l'EN ATTENTE : une depense
        // demandee mais pas encore validee est deja engagee dans les faits, et ne
        // la montrer nulle part laissait croire a un restant plus confortable
        // qu'il ne l'est. Elle n'entre pas dans le total, elle est annoncee a cote.
        let totalSpent = 0;
        let totalPending = 0;
        // shootSpent : la part du depense qui releve du plateau (voir
        // Expenses.SHOOT_CATEGORIES). Sert uniquement au cout moyen par jour.
        let shootSpent = 0;
        state.data.expenses?.forEach(exp => {
            const amount = vatMode === 'HT'
                ? (parseFloat(exp.amountHT) || parseFloat(exp.amount) || 0)
                : (parseFloat(exp.amountTTC) || parseFloat(exp.amount) || 0);
            if(exp.status === 'approved' || exp.status === 'done') {
                totalSpent += amount;
                if(Expenses.SHOOT_CATEGORIES.includes(exp.category)) shootSpent += amount;
            } else if(exp.status === 'pending' || exp.status === 'escalated') {
                totalPending += amount;
            }
        });
        
        // Ajouter les salaires estimes (mode detaille uniquement), en EXCLUANT
        // ceux qui ont deja ete generes en depense validee : ils sont alors deja
        // dans totalSpent ci-dessus, les recompter gonflerait le poste du double.
        if(Expenses.mode === 'advanced') {
            const salariesTotal = Expenses.calculateSalariesTotal(true);
            totalSpent += salariesTotal;
        }
        
        const remaining = budgetTotal - totalSpent;
        const percentUsed = budgetTotal > 0 ? Math.round((totalSpent / budgetTotal) * 100) : 0;
        
        // Mode avancé
        const budgetEl = document.getElementById('expenses-total-budget');
        const spentEl = document.getElementById('expenses-total-spent');
        const remainingEl = document.getElementById('expenses-total-remaining');
        
        if(budgetEl) budgetEl.textContent = budgetTotal.toLocaleString() + ' ' + currency + ' ' + vatMode;
        if(spentEl) spentEl.innerHTML = totalSpent.toLocaleString() + ' ' + currency + ` <span style="font-size:0.75rem; opacity:0.8;">(${percentUsed}%)</span>`;
        if(remainingEl) remainingEl.textContent = remaining.toLocaleString() + ' ' + currency;
        
        // Notes d'engagement : ce qui est demande mais pas encore valide.
        const fmtCur = (n) => n.toLocaleString('fr-FR') + ' ' + currency;
        const pendingNote = document.getElementById('expenses-pending-note');
        const remainingNote = document.getElementById('expenses-remaining-note');
        if(pendingNote) pendingNote.textContent = totalPending > 0 ? ('+ ' + fmtCur(totalPending) + ' en attente') : '';
        if(remainingNote) remainingNote.textContent = totalPending > 0 ? (fmtCur(remaining - totalPending) + ' une fois tout validé') : '';
        
        // Cout moyen / jour de tournage = depenses VALIDEES des postes de plateau
        // divisees par le nombre de jours. Les salaires ESTIMES du mode Detaille
        // n'y entrent pas : ce sont des previsions, pas des depenses constatees,
        // et les melanger ferait bouger la moyenne sans qu'un euro soit sorti.
        const nbShootDays = (state.data.shootingDays || []).length;
        const cpdEl = document.getElementById('expenses-cost-per-day');
        if(cpdEl) cpdEl.innerHTML = nbShootDays > 0
            ? Math.round(shootSpent / nbShootDays).toLocaleString() + ' ' + currency + ` <span style="font-size:0.75rem; opacity:0.7;">/ jour · ${nbShootDays} j</span>`
            : '—';
        
        // Changer la couleur si dépassement (mode avancé)
        const remainingCard = remainingEl?.parentElement;
        if(remainingCard) {
            if(remaining < 0) {
                remainingCard.classList.remove('success');
                remainingCard.classList.add('danger');
            } else {
                remainingCard.classList.remove('danger');
                remainingCard.classList.add('success');
            }
        }
        
        // Mode simple
        const spentSimple = document.getElementById('expenses-spent-simple');
        const remainingSimple = document.getElementById('expenses-remaining-simple');
        const remainingSimpleCard = document.getElementById('expenses-remaining-simple-card');
        
        if(spentSimple) spentSimple.textContent = totalSpent.toLocaleString() + ' ' + currency;
        if(remainingSimple) remainingSimple.textContent = remaining.toLocaleString() + ' ' + currency;
        if(remainingSimpleCard) {
            remainingSimpleCard.style.background = remaining < 0 ? 'var(--danger)' : 'var(--success)';
        }
        
        // Meme information qu'en mode Detaille : ce qui reste a payer compte, meme
        // sur un petit projet. Le vocabulaire suit celui du mode Simple, ou le
        // filtre parle de « a payer » et non de validation.
        const pendingNoteSimple = document.getElementById('expenses-pending-note-simple');
        const remainingNoteSimple = document.getElementById('expenses-remaining-note-simple');
        if(pendingNoteSimple) pendingNoteSimple.textContent = totalPending > 0 ? ('+ ' + fmtCur(totalPending) + ' à payer') : '';
        if(remainingNoteSimple) remainingNoteSimple.textContent = totalPending > 0 ? (fmtCur(remaining - totalPending) + ' une fois tout payé') : '';
        
        // Mettre à jour le champ budget total
        const budgetInput = document.getElementById('expenses-budget-total');
        if(budgetInput) budgetInput.value = budgetTotal || '';
        
        // Indicateur de repartition (mode Detaille) : combien des enveloppes sont
        // posees, et ce qu'il reste a repartir. Muet tant qu'aucune enveloppe
        // n'existe : une production qui ne repartit pas n'a pas a etre sermonnee.
        const hint = document.getElementById('expenses-envelopes-hint');
        if(hint) {
            if(allocated <= 0) {
                hint.textContent = '';
            } else {
                const left = budgetTotal - allocated;
                const f = (n) => n.toLocaleString('fr-FR') + ' ' + currency;
                if(left < 0) {
                    hint.innerHTML = `<span style="color: var(--danger); font-weight: 600;">⚠️ ${f(allocated)} répartis pour un budget de ${f(budgetTotal)} : ${f(-left)} de trop.</span>`;
                } else {
                    hint.textContent = `${f(allocated)} répartis sur ${f(budgetTotal)} — reste ${f(left)} à répartir.`;
                }
            }
        }
    },
    
    // Met à jour les totaux par catégorie (maintenant géré par populateCategories)
    updateDeptTotals: () => {
        // Cette fonction est maintenant gérée par populateCategories()
        // On la garde pour rétrocompatibilité mais elle appelle simplement populateCategories
        Expenses.populateCategories();
    },
    
    // Applique les filtres
    applyFilters: () => {
        // Mode simple ou avancé
        if(Expenses.mode === 'simple') {
            const statusFilter = document.getElementById('expenses-filter-status-simple')?.value || '';
            const searchFilter = document.getElementById('expenses-filter-search-simple')?.value?.toLowerCase() || '';
            
            // Convertir les statuts simples
            if(statusFilter === 'paid') {
                Expenses.filterStatus = 'done';
            } else if(statusFilter === 'unpaid') {
                Expenses.filterStatus = 'pending';
            } else {
                Expenses.filterStatus = '';
            }
            
            Expenses.filterDept = '';
            Expenses.filterSearch = searchFilter;
        } else {
            Expenses.filterDept = document.getElementById('expenses-filter-dept')?.value || '';
            Expenses.filterStatus = document.getElementById('expenses-filter-status')?.value || '';
            Expenses.filterSearch = document.getElementById('expenses-filter-search')?.value?.toLowerCase() || '';
        }
        
        Expenses.renderExpensesList();
        Expenses.populateDepartments();
    },
    
    // updateSalariesVisibility retiree le 25 aout : la section salaires n'existe
    // plus dans la page. Les depenses de salaire sont des depenses comme les
    // autres et se filtrent comme elles ; la generation vit dans sa fenetre.
    
    // ===================== RAPPELS & INFOS MANQUANTES =====================
    // Vérifier les informations manquantes pour les contrats/salaires
    checkMissingInfo: () => {
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const missing = [];
        
        // Vérifier les acteurs
        actors.forEach(actor => {
            if(!actor.name) return;
            const issues = [];
            
            if(!actor.email) issues.push('Email');
            if(!actor.address) issues.push('Adresse');
            if(!(actor.salaryGross || actor.dailyRate)) issues.push('Salaire brut');
            
            if(actor.professionalStatus === 'intermittent') {
                if(!actor.numSecu) issues.push('N° Sécurité Sociale');
                if(!actor.numCongesSpectacles) issues.push('N° Congés Spectacles');
            } else if(actor.professionalStatus === 'micro-entrepreneur') {
                if(!actor.siret) issues.push('N° SIRET');
            } else if(!actor.professionalStatus) {
                issues.push('Statut professionnel');
            }
            
            if(issues.length > 0) {
                missing.push({ type: 'actor', person: actor, issues: issues });
            }
        });
        
        // Vérifier les techniciens
        crew.forEach(member => {
            if(!member.name) return;
            const issues = [];
            
            if(!member.email) issues.push('Email');
            if(!member.address) issues.push('Adresse');
            if(!(member.salaryGross || member.dailyRate)) issues.push('Salaire brut');
            
            if(member.professionalStatus === 'intermittent') {
                if(!member.numSecu) issues.push('N° Sécurité Sociale');
                if(!member.numCongesSpectacles) issues.push('N° Congés Spectacles');
            } else if(member.professionalStatus === 'micro-entrepreneur') {
                if(!member.siret) issues.push('N° SIRET');
            } else if(!member.professionalStatus) {
                issues.push('Statut professionnel');
            }
            
            if(issues.length > 0) {
                missing.push({ type: 'crew', person: member, issues: issues });
            }
        });
        
        Expenses.showMissingInfoModal(missing);
    },
    
    // Afficher la modale des infos manquantes
    showMissingInfoModal: (missing) => {
        const modal = document.createElement('div');
        modal.id = 'missing-info-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        let content = '';
        
        if(missing.length === 0) {
            content = `
                <div style="text-align:center; padding:40px;">
                    <div style="font-size:4rem; margin-bottom:20px;">✅</div>
                    <h3 style="margin:0 0 10px; color:var(--success);">Tout est complet !</h3>
                    <p class="text-sec">Toutes les fiches ont les informations nécessaires.</p>
                </div>
            `;
        } else {
            content = `
                <div class="mb-20">
                    <div style="background:#FF9800; color:white; padding:15px; border-radius:8px; margin-bottom:15px;">
                        <strong>⚠️ ${missing.length} fiche${missing.length > 1 ? 's' : ''} avec des informations manquantes</strong>
                    </div>
                    <div style="max-height:400px; overflow-y:auto;">
                        ${missing.map(m => `
                            <div style="background:var(--bg); border-radius:8px; padding:15px; margin-bottom:10px; border-left:4px solid #FF9800;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <strong>${m.type === 'actor' ? '🎭' : '🎬'} ${Utils.escape(m.person.name)}</strong>
                                    ${m.person.email ? `<button onclick="app.Expenses.sendReminderEmail('${m.type}', '${m.person.id}')" style="padding:6px 12px; background:var(--primary); color:white; border:none; border-radius:6px; cursor:pointer; font-size:0.85rem;">📧 Envoyer rappel</button>` : ''}
                                </div>
                                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                                    ${m.issues.map(issue => `<span style="background:var(--danger); color:white; padding:3px 8px; border-radius:4px; font-size:0.8rem;">❌ ${issue}</span>`).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="flex-end">
                    <button onclick="app.Expenses.sendAllReminderEmails()" class="btn btn--primary">📧 Envoyer rappel à tous</button>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div style="background:var(--panel-bg); border-radius:12px; padding:25px; width:600px; max-width:90%; max-height:80vh; overflow:hidden;">
                <div class="section-header-20">
                    <h3 class="m-0">🔍 Vérification des informations</h3>
                    <button onclick="document.getElementById('missing-info-modal').remove()" class="icon-btn">✕</button>
                </div>
                ${content}
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    // Envoyer un email de rappel
    sendReminderEmail: async (type, personId) => {
        const list = type === 'actor' ? state.data.actors : state.data.crew;
        const person = list?.find(p => p.id === personId);
        
        if(!person || !person.email) {
            Utils.toast('Aucun email disponible', 'error');
            return;
        }
        
        const issues = [];
        if(!person.address) issues.push('ton adresse');
        if(!(person.salaryGross || person.dailyRate)) issues.push('ton salaire brut');
        if(!person.professionalStatus) issues.push('ton statut professionnel');
        if(person.professionalStatus === 'intermittent') {
            if(!person.numSecu) issues.push('ton numéro de Sécurité Sociale');
            if(!person.numCongesSpectacles) issues.push('ton numéro Congés Spectacles');
        }
        if(person.professionalStatus === 'micro-entrepreneur' && !person.siret) {
            issues.push('ton numéro SIRET');
        }
        
        const projectTitle = state.data.title || 'Sans titre';
        
        try {
await supabase.functions.invoke('super-action', { body: {
                to: person.email,
                toName: person.name,
                type: 'generic',
                data: {
                    subject: `🎬 ${projectTitle} - Informations manquantes sur ton profil`,
                    title: 'Informations manquantes sur ton profil',
                    message: `Salut ${Utils.escape(person.name)} ! 👋\n\nLe projet "${projectTitle}" a besoin de quelques informations pour compléter ta fiche et préparer les contrats/salaires.\n\nIl manque : ${issues.join(', ')}\n\nPeux-tu mettre à jour ton profil sur moteur.studio quand tu as 2 minutes ?\n\nMerci ! 🎬`
                }
            } });
            
            Utils.toast(`📧 Email envoyé à ${person.name}`, 'success');
        } catch(e) {
            console.error('Erreur envoi email:', e);
            Utils.toast('Erreur lors de l\'envoi', 'error');
        }
    },
    
    // Envoyer rappel à tous
    sendAllReminderEmails: async () => {
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        let sent = 0;
        
        const check = async (person, type) => {
            if(!person.email) return;
            let hasMissing = !person.address || !(person.salaryGross || person.dailyRate) || !person.professionalStatus;
            if(person.professionalStatus === 'intermittent' && (!person.numSecu || !person.numCongesSpectacles)) hasMissing = true;
            if(person.professionalStatus === 'micro-entrepreneur' && !person.siret) hasMissing = true;
            
            if(hasMissing) {
                await Expenses.sendReminderEmail(type, person.id);
                sent++;
            }
        };
        
        for(const actor of actors) { await check(actor, 'actor'); }
        for(const member of crew) { await check(member, 'crew'); }
        
        Utils.toast(sent > 0 ? `📧 ${sent} email${sent > 1 ? 's' : ''} envoyé${sent > 1 ? 's' : ''}` : 'Aucun email à envoyer', sent > 0 ? 'success' : 'info');
        document.getElementById('missing-info-modal')?.remove();
    },
    
    // Remplit le select "Payé par" avec les membres du projet
    populatePaidBySelect: () => {
        const select = document.getElementById('expense-paid-by');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Production / Non remboursable --</option>';
        
        // Ajouter les comédiens
        (state.data.actors || []).forEach(actor => {
            if(actor.name) {
                const opt = document.createElement('option');
                opt.value = 'actor_' + actor.id;
                opt.textContent = '🎭 ' + actor.name;
                select.appendChild(opt);
            }
        });
        
        // Ajouter les techniciens
        (state.data.crew || []).forEach(member => {
            if(member.name) {
                const opt = document.createElement('option');
                opt.value = 'crew_' + member.id;
                opt.textContent = '🎬 ' + member.name;
                select.appendChild(opt);
            }
        });
    },
    
    // Affiche la liste des dépenses
    renderExpensesList: () => {
        const container = document.getElementById('expenses-list');
        if(!container) return;
        
        let expenses = [...(state.data.expenses || [])];
        
        // Appliquer les filtres (supporte category OU department pour rétrocompatibilité)
        if(Expenses.filterDept) {
            expenses = expenses.filter(e => e.category === Expenses.filterDept || e.department === Expenses.filterDept);
        }
        if(Expenses.filterStatus) {
            expenses = expenses.filter(e => e.status === Expenses.filterStatus);
        }
        if(Expenses.filterSearch) {
            expenses = expenses.filter(e => 
                e.title?.toLowerCase().includes(Expenses.filterSearch) ||
                e.description?.toLowerCase().includes(Expenses.filterSearch)
            );
        }
        
        // currency et vatMode remontent ici : le tri par montant en a besoin, et
        // une const declaree plus bas serait lue avant son initialisation.
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        
        // CLASSEMENTS (8e, 25 aout). Le seul ordre possible etait « le plus
        // recemment saisi en premier », pratique pour retrouver ce qu'on vient
        // d'ecrire, inutilisable pour verifier un poste ou reperer les gros
        // montants. Le tri ne remplace pas les filtres au-dessus : il ordonne
        // ce qu'ils ont laisse passer.
        const sortMode = Expenses._sort || 'recent';
        const amountOf = (e) => parseFloat((vatMode === 'HT' ? (e.amountHT != null ? e.amountHT : e.amount) : (e.amountTTC != null ? e.amountTTC : e.amount))) || 0;
        const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr');
        if(sortMode === 'alpha') expenses.sort(byTitle);
        else if(sortMode === 'montant') expenses.sort((a, b) => (amountOf(b) - amountOf(a)) || byTitle(a, b));
        else if(sortMode === 'categorie') {
            // Ordre du plan comptable CNC (le code), et non l'ordre alphabetique
            // de l'identifiant interne : « 2. Personnel » doit venir avant
            // « 10. Transport », ce que le tri texte ne fait pas.
            const codeOf = (e) => {
                const c = Expenses.getCategory(e.category || e.department);
                return c ? (parseFloat(c.code) || 999) : 999;
            };
            expenses.sort((a, b) => (codeOf(a) - codeOf(b)) || byTitle(a, b));
        }
        else if(sortMode === 'statut') {
            const order = ['pending', 'escalated', 'returned', 'approved', 'done', 'rejected'];
            expenses.sort((a, b) => (order.indexOf(a.status) - order.indexOf(b.status)) || byTitle(a, b));
        }
        else expenses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if(expenses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💰</div>
                    <div class="empty-state-title">Aucune dépense</div>
                    <div class="empty-state-desc">Suivez le budget de votre production en enregistrant les dépenses. Chaque dépense peut être validée par un responsable.</div>
                    <button class="empty-state-btn" onclick="app.Expenses.openAddModal()">+ Ajouter une dépense</button>
                    <div class="empty-state-tips">💡 <strong>Astuce :</strong> Définissez le budget prévisionnel par catégorie CNC.</div>
                </div>
            `;
            return;
        }
        
        const currentUserEmail = state.currentUser?.email;
        const isGlobalManager = state.data.budget?.manager === currentUserEmail || state.currentRole === 'owner';
        
        // Chaque carte est collectee avec la SECTION a laquelle elle appartient,
        // pour que les tris qui regroupent (categorie, statut) puissent poser un
        // titre et un filet entre les paquets. Les tris qui ordonnent sans
        // regrouper (A-Z, montant, recentes) ignorent simplement cette section.
        const cards = [];
        expenses.forEach(exp => {
            const statusLabels = {
                pending: '⏳ En attente',
                approved: '✅ Validé',
                rejected: '❌ Refusé',
                done: '💰 Payé',
                escalated: '⬆️ Remonté',
                returned: '↩️ Renvoyé'
            };
            
            // Obtenir le label de la catégorie CNC, sous-catégorie comprise :
            // sur une carte compacte il n'y a qu'une ligne pour les deux.
            const cat = Expenses.getCategory(exp.category || exp.department);
            let catLabel = cat ? `${cat.icon} ${cat.code}. ${cat.name}` : (exp.category || exp.department || 'Non classé');
            if(exp.subcategory && cat) {
                const subcat = cat.subcats?.find(s => s.id === exp.subcategory);
                if(subcat) catLabel += ' › ' + subcat.name;
            }
            
            const date = exp.date ? new Date(exp.date).toLocaleDateString('fr-FR') : '';
            const isDeptManager = Expenses.isDeptManager(exp.category || exp.department);
            const isCreator = exp.createdBy === currentUserEmail;
            
            // Droits : la carte ne porte plus que Dupliquer / Modifier /
            // Supprimer. Valider, Remonter et Renvoyer sont calcules dans la
            // fiche (Expenses.workflowBarHtml), au moment de se prononcer.
            const canEdit = isCreator || isGlobalManager;
            const canDelete = isCreator || isGlobalManager || isDeptManager;
            
            // Montants HT/TTC
            const amountHT = exp.amountHT || exp.amount || 0;
            const amountTTC = exp.amountTTC || exp.amount || 0;
            const displayAmount = vatMode === 'HT' ? amountHT : amountTTC;
            
            const attachments = exp.attachments || [];
            
            // Etiquette du lien vers un element du film. Muette si le lien
            // n'existe pas, ou si sa cible a ete supprimee depuis : mieux vaut
            // ne rien montrer qu'un renvoi qui n'ouvre rien. Le clic ouvre la
            // cible sans ouvrir la depense (d'ou le stopPropagation).
            let lien = '';
            const lbl = Expenses.linkLabel(exp.link);
            if(lbl) {
                lien = `<span onclick="event.stopPropagation(); app.UI.openFiche('${exp.link.k}', '${exp.link.id}')" title="Ouvrir : ${Utils.escape(lbl)}" style="cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;">${Expenses.linkIcon(exp.link)} ${Utils.escape(lbl)}</span>`;
            }
            
            // ===== CARTE COMPACTE (8e, 25 aout) =====
            // Les fiches de depense s'etiraient sur toute la largeur, une par
            // ligne : sur un projet de trente depenses on faisait defiler un
            // rouleau au lieu de balayer une grille. Meme format que Comediens /
            // Techniciens / Ressources / Contrats. Ce qui detaille la depense
            // (description, justificatifs, motif de renvoi, historique de
            // validation) vit maintenant dans SA FICHE, qu'un clic ouvre.
            // Le circuit de validation N'EST PAS PERDU : Valider / Remonter /
            // Renvoyer sont rejoues en tete de la fiche, la ou l'on voit enfin
            // le detail sur lequel on se prononce.
            const stEmoji = { pending: '⏳', approved: '✅', rejected: '❌', done: '💰', escalated: '⬆️', returned: '↩️' };
            const att0 = (attachments && attachments.length) ? (attachments[0].data || attachments[0].url) : (exp.photo || '');
            const isImg = att0 && (String(att0).startsWith('data:image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(att0)));
            const photo = isImg
                ? `<img src="${att0}" alt="Justificatif" onerror="this.style.display='none'">`
                : (cat && cat.icon ? cat.icon : '💶');
            // Un liesere rappelle les deux etats qui demandent une action, sans
            // quoi ils se perdraient dans la grille.
            const edge = exp.status === 'returned' ? 'border-left:3px solid #f59e0b;'
                       : (exp.salaryMissingRate ? 'border-left:3px solid var(--danger);' : '');
            const actions = `<div class="compact-card-actions">
                        <button class="merge-btn" title="Dupliquer" onclick="event.stopPropagation(); app.Expenses.duplicateExpense('${exp.id}')">📋</button>
                        ${canEdit ? `<button class="edit-btn" title="Modifier" onclick="event.stopPropagation(); app.Expenses.editExpense('${exp.id}')">✏️</button>` : ''}
                        ${canDelete ? `<button class="delete-btn" title="Supprimer" onclick="event.stopPropagation(); app.Expenses.deleteExpense('${exp.id}')">🗑️</button>` : ''}
                    </div>`;
            const secLabel = sortMode === 'statut'
                ? (statusLabels[exp.status] || exp.status)
                : (cat ? (cat.icon + ' ' + cat.code + '. ' + cat.name) : 'Non classé');
            cards.push({ sec: secLabel, html: `
                <div class="compact-card" style="${edge}" onclick="app.Expenses.editExpense('${exp.id}')" title="${Utils.escape(exp.title || '')}">
                    ${actions}
                    <div class="compact-card-badge" onclick="event.stopPropagation(); app.Expenses.cycleStatus('${exp.id}')" title="${statusLabels[exp.status] || exp.status} — cliquer pour changer" style="cursor:pointer;">${stEmoji[exp.status] || '•'}</div>
                    <div class="compact-card-photo">${photo}</div>
                    <div class="compact-card-name">${Utils.escape(exp.title)}</div>
                    <div class="compact-card-role" style="font-weight:700; color:var(--primary);">${parseFloat(displayAmount).toLocaleString()} ${currency} ${vatMode}</div>
                    <div class="compact-card-role" style="font-size:0.72rem;">${Utils.escape(catLabel)}${date ? ' • ' + date : ''}</div>
                    ${lien ? `<div class="compact-card-role" style="font-size:0.72rem;">${lien}</div>` : ''}
                </div>
            ` });
        });
        
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (sortMode === 'recent' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'recent\')">Récentes</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'alpha' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'categorie' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'categorie\')">Par catégorie</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'montant' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'montant\')">Par montant</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'statut' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'statut\')">Par statut</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + expenses.length + ' dépense' + (expenses.length > 1 ? 's' : '') + '</span></div>';
        // Les tris qui regroupent posent un titre de section et son filet ;
        // l'ordre des paquets suit celui du tri, deja applique plus haut, on ne
        // retrie donc pas les sections.
        let body;
        if(sortMode === 'categorie' || sortMode === 'statut') {
            const secs = [];
            cards.forEach(c => {
                const last = secs[secs.length - 1];
                if(last && last.label === c.sec) last.items.push(c.html);
                else secs.push({ label: c.sec, items: [c.html] });
            });
            body = secs.map(s => '<div class="group-section"><div class="group-header">' + Utils.escape(s.label)
                + '<span class="ccol-group-count">' + s.items.length + '</span></div>'
                + '<div class="compact-cards-grid">' + s.items.join('') + '</div></div>').join('');
        } else {
            body = '<div class="compact-cards-grid">' + cards.map(c => c.html).join('') + '</div>';
        }
        container.innerHTML = toolbar + body;
    },
    _sort: 'recent',
    setSort: (mode) => { Expenses._sort = mode; Expenses.renderExpensesList(); },
    
// Salaires (basés sur jours de tournage) — délégué à ExpensesSalaries
    calculateSalariesTotal: (...a) => ExpensesSalaries.calculateSalariesTotal(...a),
    renderSalaries: (...a) => ExpensesSalaries.renderSalaries(...a),
    generateSalaryFor: (...a) => ExpensesSalaries.generateSalaryFor(...a),
    removeSalaryFor: (...a) => ExpensesSalaries.removeSalaryFor(...a),
    setSalarySort: (...a) => ExpensesSalaries.setSort(...a),
// CRUD dépenses, modale & pièces jointes — délégué à ExpensesCRUD
    openAddModal: (...a) => ExpensesCRUD.openAddModal(...a),
    onCategoryChange: (...a) => ExpensesCRUD.onCategoryChange(...a),
    calculateTTCFromHT: (...a) => ExpensesCRUD.calculateTTCFromHT(...a),
    calculateHTFromTTC: (...a) => ExpensesCRUD.calculateHTFromTTC(...a),
    handleFileUpload: (...a) => ExpensesCRUD.handleFileUpload(...a),
    editExpense: (...a) => ExpensesCRUD.editExpense(...a),
    saveExpense: (...a) => ExpensesCRUD.saveExpense(...a),
    deleteExpense: (...a) => ExpensesCRUD.deleteExpense(...a),
    validateExpense: (...a) => ExpensesCRUD.validateExpense(...a),
    cycleStatus: (...a) => ExpensesCRUD.cycleStatus(...a),
    escalateExpense: (...a) => ExpensesCRUD.escalateExpense(...a),
    openReturnModal: (...a) => ExpensesCRUD.openReturnModal(...a),
    duplicateExpense: (...a) => ExpensesCRUD.duplicateExpense(...a),
    // Export PDF & Excel — délégué à ExpensesExport
    openExportModal: (...a) => ExpensesExport.openExportModal(...a),
    exportPDF: (...a) => ExpensesExport.exportPDF(...a),
    exportExcel: (...a) => ExpensesExport.exportExcel(...a)
};
