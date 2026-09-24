
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
        // Le compte suit AUSSI un defilement a la molette ou au pave tactile.
        document.addEventListener('scroll', (ev) => {
            const barre = ev.target;
            if(barre && barre.classList && barre.classList.contains('fid-tabbar')) FicheBlocks._relire(barre);
        }, true);
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
            if(v) { barre.scrollLeft += v; FicheBlocks._relire(barre); }
        };
        requestAnimationFrame(pas);
    },

    _observateur: null,
    //  v601 - « IL Y A ENCORE DEUX ONGLETS PAR LA-BAS ». Le defilement au bord
    //  marchait, mais rien ne disait qu'il y avait quelque chose a aller
    //  chercher : une barre pleine et une barre qui deborde se ressemblent.
    //  On COMPTE les onglets sortis du cadre de chaque cote et on l'ecrit.
    //  Le compte est pose sur le parent, pas sur la barre : la barre DEFILE,
    //  une pastille posee dessus partirait avec elle.
    _relire: (barre) => {
        try {
            const deborde = barre.scrollWidth > barre.clientWidth + 4;
            barre.classList.toggle('a-defilement', deborde);
            const hote = barre.parentElement;
            if(!hote) return;
            if(!deborde) {
                hote.removeAttribute('data-caches-g');
                hote.removeAttribute('data-caches-d');
                return;
            }
            const g0 = barre.scrollLeft, d0 = barre.scrollLeft + barre.clientWidth;
            let g = 0, d = 0;
            barre.querySelectorAll(':scope > .fid-tab').forEach(t => {
                if(t.offsetLeft + t.offsetWidth <= g0 + 1) g++;
                else if(t.offsetLeft >= d0 - 1) d++;
            });
            // UN ONGLET COUPE EN DEUX N'EST PAS « CACHE » : annoncer « 1 »
            // pour un onglet qu'on a sous les yeux serait faux. Mais il reste
            // quelque chose par la : on met alors le chevron SANS compte.
            const resteG = barre.scrollLeft > 2;
            const resteD = barre.scrollLeft + barre.clientWidth < barre.scrollWidth - 2;
            if(resteG) hote.setAttribute('data-caches-g', g ? String(g) : ''); else hote.removeAttribute('data-caches-g');
            if(resteD) hote.setAttribute('data-caches-d', d ? String(d) : ''); else hote.removeAttribute('data-caches-d');
        } catch(e) {}
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
                const m = cal.id.match(/^(actor|crew)-calendar-(-?\d+)$/)  /* v601 : -1 en mode profil */;
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
