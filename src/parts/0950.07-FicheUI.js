
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
                const m = cal.id.match(/^(actor|crew)-calendar-(-?\d+)$/)  /* v601 : -1 en mode profil */;
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
