
  const FDSLive = {
    esc: (s) => Utils.escape(String(s == null ? '' : s)),
    // VOIE B — TEMPS 3 : la feuille n'est plus un calque pose sur le pane
    // Formulaire, elle EST l'editeur. Les accesseurs ci-dessous lisent et
    // ecrivent Planning.tempShootDay ; le DOM du pane, tant qu'il existe, est
    // tenu a jour par courtoisie mais ne fait plus autorite.
    // Cle de tempShootDay derriere un id de champ : 'edit-crewCall' -> 'crewCall'
    key: (id) => (String(id || '').startsWith('edit-') ? String(id).slice(5) : ''),
    // Convocations individuelles : 'call-<champ>-<type>-<personId>'.
    // Ces cases visaient les inputs du pane Formulaire, disparu en v566 : elles
    // ecrivaient donc dans le vide et s'affichaient toujours vides, alors que
    // le PDF continuait d'imprimer les valeurs saisies avant le retrait.
    // Decoupage sur les TROIS premiers tirets seulement, un projet importe
    // pouvant porter des identifiants de personne contenant des tirets.
    CALL_PROPS: { time: 'callTime', pickup: 'pickupTime', hmc: 'hmcTime', pat: 'patTime', notes: 'notes' },
    callKey: (id) => {
        const s = String(id || '');
        if(!s.startsWith('call-')) return null;
        const rest = s.slice(5);
        const i1 = rest.indexOf('-'); if(i1 === -1) return null;
        const field = rest.slice(0, i1);
        const rest2 = rest.slice(i1 + 1);
        const i2 = rest2.indexOf('-'); if(i2 === -1) return null;
        const type = rest2.slice(0, i2), personId = rest2.slice(i2 + 1);
        const prop = FDSLive.CALL_PROPS[field];
        if(!prop || !personId || (type !== 'actor' && type !== 'crew')) return null;
        return { type, personId, prop };
    },
    temp: () => {
        if(!Planning.tempShootDay) Planning.tempShootDay = {};
        return Planning.tempShootDay;
    },
    // --- PORTEES DE CONVOCATION ---
    // Un « tableau » de la feuille : les quatre familles de comediens et
    // l'equipe technique. Sert a la fois au masquage et a l'application groupee
    // d'une heure. Les familles se deduisent des GROUPES de comediens, jamais
    // d'un champ dedie : c'est deja la regle du PDF.
    KIND_LABELS: { time: 'Conv.', pickup: 'Pick-up', hmc: 'HMC', pat: 'PAT' },
    // Le HMC est une donnee comedien : l'equipe technique ne l'a pas.
    scopeKinds: (scope) => (scope === 'crew' ? ['time', 'pickup', 'pat'] : ['time', 'pickup', 'hmc', 'pat']),
    // v602 : la famille se lit dans CastFamilies, seule source.
    scopeOf: (actor) => CastFamilies.de(actor),
    // Identifiants des personnes CONVOQUEES dans un tableau donne.
    scopeIds: (scope) => {
        const calls = PlanningTransport.model.calls();
        if(scope === 'crew') return calls.filter(cl => cl.type === 'crew').map(cl => cl.personId);
        const actorOf = (id) => (state.data.actors || []).find(a => String(a.id) === String(id));
        return calls.filter(cl => cl.type === 'actor')
            .filter(cl => { const a = actorOf(cl.personId); return a && FDSLive.scopeOf(a) === scope; })
            .map(cl => cl.personId);
    },
    // Barre de titre portant son propre interrupteur, a droite. La barre reste
    // toujours visible : eteinte, elle dit ce qui a ete retire de la feuille,
    // au lieu de le faire disparaitre sans trace.
    barTog: (title, on, action, labOn, labOff) => {
        const cls = on ? 'fdsw-tog fdsw-tog-on' : 'fdsw-tog';
        return `<div class="fdsw-bar fdsw-bar-tog">${FDSLive.esc(title)}
            <button type="button" class="${cls}" onclick="${action}">
                <span>${FDSLive.esc(on ? (labOn || 'affiché') : (labOff || 'masqué'))}</span>
                <span class="fdsw-tog-rail"><span class="fdsw-tog-knob"></span></span>
            </button></div>`;
    },
    // --- BASCULE DE LA FEUILLE FIGURATION (v567) ---
    // Deux usages, un seul modele de donnees. Peu de figurants : ils sont
    // nommes sur la feuille principale, comme les silhouettes, et la feuille
    // figuration reste eteinte. Figuration de masse : la principale n'en garde
    // que les effectifs et le detail part sur sa propre feuille — c'est la
    // pratique du metier, la liste nominative n'ayant a circuler qu'aupres de
    // la regie figuration. Le reglage appartient au JOUR.
    figuSplit: () => !!FDSLive.temp().figuSplit,
    setFiguSplit: (on) => {
        FDSLive.temp().figuSplit = !!on;
        FDSLive.render();
        Planning.refreshFDSTabs();
        Utils.toast(on ? 'Feuille de figuration séparée : l\'onglet « FDS figu » est actif.'
                       : 'Figuration intégrée : les figurants sont nommés sur la feuille de service.', 'info');
    },
    // --- MASQUAGE DE TABLEAUX (par jour) ---
    // Silhouettes, doublures et figuration ne concernent pas tous les jours.
    // Le reglage appartient au JOUR, pas au projet : un jour de figuration de
    // masse et un jour a deux comediens n'ont pas la meme feuille.
    // La figuration n'est PAS ici : elle a son propre interrupteur (figuSplit),
    // qui DEPLACE le detail au lieu de le supprimer. Deux reglages sur la meme
    // chose se seraient contredits.
    HIDEABLE: [['sil', 'Silhouettes parlantes'], ['silm', 'Silhouettes muettes'], ['dbl', 'Doublures'],
               ['casc', 'Cascadeurs'], ['pil', 'Pilotes']],
    hidden: (scope) => (FDSLive.temp().fdsHide || []).indexOf(scope) > -1,
    toggleScope: (scope, show) => {
        const t = FDSLive.temp();
        const cur = (t.fdsHide || []).filter(s => s !== scope);
        if(!show) cur.push(scope);
        t.fdsHide = cur;
        FDSLive.render();
    },
    // Applique une meme heure a tout un tableau. Les colonnes laissees vides ne
    // sont pas touchees : on peut poser la seule convocation sans effacer les
    // pick-up deja saisis un par un.
    applyToAll: (scope) => {
        const type = scope === 'crew' ? 'crew' : 'actor';
        const ids = FDSLive.scopeIds(scope);
        if(!ids.length) { Utils.toast('Personne n\'est convoqué dans ce tableau.', 'warning'); return; }
        const done = [];
        FDSLive.scopeKinds(scope).forEach(k => {
            const el = document.getElementById(`fdsw-all-${scope}-${k}`);
            const val = el ? (el.value || '') : '';
            if(!val) return;
            ids.forEach(pid => FDSLive.push(`call-${k}-${type}-${pid}`, val));
            done.push(FDSLive.KIND_LABELS[k] + ' ' + val);
        });
        if(!done.length) { Utils.toast('Renseigne au moins une heure à appliquer.', 'warning'); return; }
        FDSLive.render();
        Utils.toast(`${done.join(', ')} appliqué à ${ids.length} personne${ids.length > 1 ? 's' : ''}.`, 'success');
    },
    // Ligne « appliquer a tout le tableau », posee en pied de chaque tableau.
    applyRowHtml: (scope, colspan) => {
        const cells = FDSLive.scopeKinds(scope).map(k =>
            `<label style="margin-right:10px"><span class="fdsw-lab">${FDSLive.KIND_LABELS[k]}</span>
             <input class="fdsw-in" id="fdsw-all-${scope}-${k}" type="time" style="width:auto; border:1px solid #999;"></label>`).join('');
        return `<tr><td colspan="${colspan}" style="background:#fafafa">
            <span class="fdsw-lab">Appliquer à tout le tableau</span> ${cells}
            <button type="button" class="fdsw-btn" onclick="app.FDSLive.applyToAll('${scope}')">Appliquer</button>
            <span class="fdsw-empty" style="font-size:0.62rem">&nbsp;une case vide ne touche pas la colonne</span>
        </td></tr>`;
    },
    // Lit la valeur courante d'un champ
    get: (id) => {
        const k = FDSLive.key(id);
        if(k) {
            const v = FDSLive.temp()[k];
            return (v == null) ? '' : String(v);
        }
        const ck = FDSLive.callKey(id);
        if(ck) {
            const e = PlanningTransport.model.get(ck.type, ck.personId);
            const v = e ? e[ck.prop] : '';
            return (v == null) ? '' : String(v);
        }
        const el = document.getElementById(id);
        return el ? (el.value || '') : '';
    },
    // Ecrit la valeur du champ dans tempShootDay
    push: (id, val) => {
        // Point d'ecriture central de la feuille de service : toutes les
        // cellules editables passent par ici. Sans cette garde, le verrou pose
        // sur la fenetre ne serait qu'un habillage.
        if(typeof PlanningDayEdit !== 'undefined' && PlanningDayEdit.canWrite && !PlanningDayEdit.canWrite()) return;
        const k = FDSLive.key(id);
        if(k) FDSLive.temp()[k] = val;
        const ck = FDSLive.callKey(id);
        if(ck) {
            PlanningTransport.model.ensure(ck.type, ck.personId)[ck.prop] = val;
            // v598 : une heure d'arrivee ou de ramassage appartient au CORPS,
            // elle se pose donc sur toutes les lignes de la personne. La
            // consigne, le PAT et le HMC restent propres au poste.
            if(PlanningTransport.model.BODY_PROPS.indexOf(ck.prop) !== -1) {
                PlanningTransport.model.mirror(ck.type, ck.personId);
            }
        }
        const el = document.getElementById(id);
        if(el) {
            el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Certaines cases de la feuille ne sont pas saisies mais DÉDUITES d'un
        // champ saisi ailleurs : le bandeau de date et le lever / coucher du
        // soleil. Elles étaient calculées au rendu et n'étaient donc jamais
        // rafraîchies tant qu'on ne rejouait pas toute la feuille — changer la
        // date laissait le soleil de la veille à l'écran. Mise à jour ciblée du
        // seul contenu concerné plutôt que re-rendu complet : rejouer la feuille
        // à chaque frappe ferait perdre le focus du champ en cours de saisie.
        if(FDSLive.DERIVED_FROM.includes(id)) FDSLive.refreshDerived();
    },
    // Champs dont dépendent des cases calculées de la feuille
    // 'edit-dayType' ajoute le 31 aout : changer le type de journee change le
    // bandeau (« J3 » devient « REPERAGE »), il doit donc le rafraichir.
    DERIVED_FROM: ['edit-startDate', 'edit-locationLat', 'edit-locationLng', 'edit-crewCall', 'edit-dayType'],
    
    // ===== BANDEAU DE TETE (31 aout) =====
    // Il n'annoncait que la date : le numero du jour n'apparaissait NULLE PART
    // sur la feuille, alors que c'est ainsi qu'une equipe designe sa journee
    // (« on est en J4 »). Il porte desormais le rang du jour de tournage, ou la
    // nature de la journee quand ce n'en est pas un.
    // Le numero est PROVISOIRE tant que le jour n'est pas enregistre : il se
    // recalcule a chaque changement de date, sans rien ecrire.
    dayBarText: () => {
        const dt = FDSLive.get('edit-startDate');
        const type = FDSLive.get('edit-dayType') || 'tournage';
        const txt = dt ? new Date(dt).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).toUpperCase() : '';
        let tete = 'FEUILLE DE SERVICE';
        if(type === 'tournage') {
            const t = Planning.tempShootDay || {};
            const n = t.dayNumber || Planning.previewDayNumber(Planning.editingDayId, dt, type);
            if(n) tete += ' \u2014 J' + n;
        } else {
            const info = Planning.getDayTypeInfo(type);
            if(info && info.label) tete += ' \u2014 ' + String(info.label).toUpperCase();
        }
        return tete + (txt ? ' \u2014 ' + txt : '');
    },
    refreshDerived: () => {
        const host = document.getElementById('fds-pane-live');
        if(!host || host.offsetParent === null) return;
        const dt = FDSLive.get('edit-startDate');
        const lat = FDSLive.get('edit-locationLat'), lng = FDSLive.get('edit-locationLng');
        const bar = document.getElementById('fdsw-datebar');
        if(bar) bar.textContent = FDSLive.dayBarText();
        [['sunrise', 'Lever du soleil'], ['sunset', 'Coucher du soleil']].forEach(([which, lab]) => {
            const cell = document.getElementById('fdsw-cell-' + which);
            if(cell) cell.innerHTML = `<span class="fdsw-lab">${lab}</span><br>` + FDSLive.sunCell(which, lat, lng, dt);
        });
        // « Convocation équipe » est une case officielle AFAR distincte du début
        // des horaires de tournage, mais l'app n'a qu'une donnée pour les deux
        // (shootDay.crewCall). Elle est donc affichée en écho, non saisie : deux
        // champs de saisie sur la même donnée laissaient l'un des deux périmé
        // à l'écran jusqu'au rendu suivant.
        const crewEcho = document.getElementById('fdsw-cell-crewcall');
        if(crewEcho) crewEcho.innerHTML = FDSLive.ro(FDSLive.get('edit-crewCall'), 'non renseignée');
    },
    // --- Transport : la feuille attaque desormais le MODELE de covoiturage
    // (PlanningTransport.model), qui porte capacite, reciprocite et
    // desynchronisation. Rien n'est reimplemente ici. La projection vers les
    // cases du formulaire a disparu avec le pane (nettoyage v566).
    setTransport: (type, id, value) => {
        PlanningTransport.model.setTransport(type, id, value);
        PlanningTransport.model.mirror(type, id);
        setTimeout(FDSLive.render, 60);
    },
    setVehicle: (type, id, value) => {
        PlanningTransport.model.setVehicle(type, id, value);
        PlanningTransport.model.mirror(type, id);
        FDSLive.render();
    },
    // « Part avec » : selection unique, deja garantie par model.link.
    setWith: (type, id, value) => {
        FDSLive.withWhoOf(type, id).forEach(v => { if(v !== value) PlanningTransport.model.unlink(type, id, v); });
        if(value) {
            const refus = PlanningTransport.model.link(type, id, value);
            if(refus) Utils.toast(refus, 'error');
        }
        PlanningTransport.model.mirrorPair(type, id, value);
        setTimeout(FDSLive.render, 60);
    },
    // FDSLive._toggleRaw retirée v569, jamais appelée.
    toggleWith: (type, id, value, checked) => {
        const entry = PlanningTransport.model.get(type, id);
        if(!entry || !entry.transport) { Utils.toast('Choisis d\'abord un mode de transport.', 'warning'); return; }
        if(checked) {
            const refus = PlanningTransport.model.link(type, id, value);
            if(refus) Utils.toast(refus, 'error');
        } else {
            PlanningTransport.model.unlink(type, id, value);
        }
        PlanningTransport.model.mirrorPair(type, id, value);
        setTimeout(FDSLive.render, 60);
    },
    // Plans a tourner sur cette scene ce jour-la. La case officielle « PLANS »
    // du modele AFAR ; l'app la remplit depuis sceneRef.selectedShots, qui sert
    // aussi au nom automatique du jour (« Sc.3 (5 pl.) »). Le choix se faisait
    // dans le pane Formulaire : il est rebranche ici en v566, dans un volet
    // replie par defaut pour ne pas noyer le sequencier. Les cases ecrivent par
    // PlanningBreakdown.toggleShotSelection, qui ne rejoue pas la feuille : le
    // volet reste donc ouvert pendant qu'on coche.
    shotsCell: (ref, scene) => {
        const esc = FDSLive.esc;
        const shots = (state.data.shots || []).filter(s => String(s.sceneId) === String(scene.id));
        if(!shots.length) {
            return `<span class="fdsw-empty" title="Aucun plan n'est découpé sur cette scène">—</span>`;
        }
        const sel = ref.selectedShots || [];
        const id = esc(String(scene.id));
        const items = shots.map(sh => {
            const lab = sh.shotNumber || sh.name || ('Plan ' + sh.id);
            return `<label style="display:block; text-align:left; white-space:nowrap; font-size:0.7rem;">
                <input type="checkbox" data-fds-scene="${id}" data-fds-shot="${esc(String(sh.id))}" ${sel.some(x => String(x) === String(sh.id)) ? 'checked' : ''} onchange="app.PlanningBreakdown.toggleShotSelection('${id}', '${esc(String(sh.id))}')"> ${esc(lab)}
            </label>`;
        }).join('');
        return `<details style="text-align:left">
            <summary style="cursor:pointer; text-align:center; font-size:0.72rem;"><span id="fdsw-shots-${id}">${sel.length}/${shots.length}</span></summary>
            <div style="max-height:150px; overflow-y:auto; margin-top:4px;">${items}</div>
            <div style="margin-top:4px; text-align:center;">
                <button type="button" class="fdsw-btn" onclick="app.PlanningBreakdown.selectAllShots('${id}')">tous</button>
                <button type="button" class="fdsw-btn" onclick="app.PlanningBreakdown.deselectAllShots('${id}')">aucun</button>
            </div>
        </details>`;
    },
    // Personnes en covoiturage avec cette personne, selon le modele
    withWhoOf: (type, id) => {
        const e = PlanningTransport.model.get(type, id);
        return (e && Array.isArray(e.withWho)) ? e.withWho.slice() : [];
    },
    // Lever / coucher du soleil : calcul astronomique local partagé avec le PDF
    // (PlanningFDS.sun). Synchrone, donc plus de cellule « … » en attente, et
    // valable quelle que soit la distance de la date — une API de prévisions
    // ne répond que pour les deux semaines à venir.
    sunCell: (which, lat, lng, date) => {
        if(!lat || !lng) return `<span class="fdsw-empty">pas de coordonnées</span> <button type="button" class="fdsw-link" onclick="app.FDSLive.focusAddress()">renseigner l'adresse du lieu</button>`;
        const val = PlanningFDS.sun(lat, lng, date)[which === 'sunrise' ? 'sunrise' : 'sunset'];
        if(!val) return `<span class="fdsw-empty">${date ? 'pas de lever ni de coucher ce jour-là' : 'date non renseignée'}</span>`;
        return `<span id="fdsw-${which}" class="fdsw-ro">${FDSLive.esc(val)}</span>`;
    },
    // Cellule éditable reliée à un champ du pane normal
    cell: (id, placeholder, type, domId) => {
        const t = type || 'text';
        const extra = domId ? ` id="${FDSLive.esc(domId)}"` : '';
        return `<input class="fdsw-in"${extra} type="${t}" value="${FDSLive.esc(FDSLive.get(id))}" placeholder="${FDSLive.esc(placeholder || '')}" data-tooltip="${FDSLive.esc(placeholder || '')}" oninput="app.FDSLive.push('${id}', this.value)">`;
    },
    // Amène l'utilisateur sur le champ adresse de la feuille : sans coordonnées,
    // pas de lever ni de coucher de soleil.
    // Amene l'utilisateur AU champ concerne plutot que de lui dire vaguement ou
    // il se trouve. Le repli textuel ne sert que si le champ n'est pas rendu.
    focusField: (id, msg) => {
        const el = document.getElementById(id);
        if(!el) { Utils.toast(msg || "Ce champ est dans le bloc d'informations.", 'info'); return; }
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
    },
    focusAddress: () => {
        FDSLive.focusField('fdsw-addr', "Le champ adresse est dans le bloc d'informations.");
    },
    // Miroir d'un <select> du formulaire : mêmes options, même valeur
    sel: (id) => {
        if(id === 'edit-dayType') {
            const opts = Planning.dayTypeOptionsHtml(FDSLive.get('edit-dayType') || 'tournage');
            return `<select class="fdsw-in" onchange="app.FDSLive.push('edit-dayType', this.value); app.FDSLive.render();">${opts}</select>`;
        }
        if(id === 'edit-location-select') {
            // La valeur affichee n'est pas stockee : elle se DEDUIT de la fiche
            // liee. Stocker le nom du decor en double ouvrirait la porte a une
            // divergence avec locationId, seul lien qui fasse foi.
            const cur = (FDSLive.linkedLocation() || {}).name || '';
            let opts = `<option value=""${cur ? '' : ' selected'}>-- Sélectionner un décor --</option>`;
            (state.data.locations || []).forEach(loc => {
                opts += `<option value="${FDSLive.esc(loc.name)}"${loc.name === cur ? ' selected' : ''}>${FDSLive.esc(loc.name)}</option>`;
            });
            opts += `<option value="__custom__">➕ Autre...</option>`;
            return `<select class="fdsw-in" onchange="app.FDSLive.pickLocation(this.value)">${opts}</select>`;
        }
        const src = document.getElementById(id);
        if(!src || src.tagName !== 'SELECT') return `<span class="fdsw-empty">non disponible</span>`;
        let opts = '';
        Array.from(src.options).forEach(o => {
            opts += `<option value="${FDSLive.esc(o.value)}"${o.value === src.value ? ' selected' : ''}>${FDSLive.esc(o.textContent)}</option>`;
        });
        return `<select class="fdsw-in" onchange="app.FDSLive.push('${id}', this.value); app.FDSLive.render();">${opts}</select>`;
    },
    // Choix d'une fiche decor depuis la feuille. Meme regle que le formulaire :
    // on pose le lien (locationId) et le nom reel, et on n'herite des autres
    // champs que dans le vide — jamais par ecrasement d'une saisie.
    pickLocation: (value) => {
        if(state.currentRole === 'viewer') return;
        if(value === '__custom__' || !value) {
            FDSLive.push('edit-locationId', '');
            if(value === '__custom__') FDSLive.push('edit-location', '');
            FDSLive.render();
            return;
        }
        const loc = (state.data.locations || []).find(l => l && l.name === value);
        FDSLive.push('edit-locationId', loc ? (loc.id || '') : '');
        FDSLive.push('edit-location', (loc && loc.realName) ? loc.realName : '');
        if(loc) {
            const fill = (input, val) => { if(val && !FDSLive.get(input)) FDSLive.push(input, val); };
            fill('edit-locationAddress', loc.address);
            fill('edit-contactName', loc.contactName);
            fill('edit-contactPhone', loc.contactPhone);
            fill('edit-locationNotes', loc.accessNotes);
            if(loc.lat && loc.lng) {
                FDSLive.push('edit-locationLat', String(loc.lat));
                FDSLive.push('edit-locationLng', String(loc.lng));
            }
        }
        FDSLive.render();
    },
    // --- Actions structurelles : elles passent par les fonctions existantes du
    // formulaire (qui mutent tempShootDay et cochent les cases), puis la feuille
    // est rejouée. Aucune logique métier n'est réécrite ici.
    addScene: (sceneId) => {
        if(!sceneId) return;
        Planning.addSceneToDay(sceneId);
        FDSLive.render();
    },
    removeScene: (sceneId) => {
        Planning.removeSceneFromDay(sceneId);
        FDSLive.render();
    },
    // CHRONO (jour de récit) : contrairement aux autres cases de la feuille, la
    // donnée n'appartient pas au jour de tournage mais à la scène, qui n'a
    // aucun input dans le formulaire du jour. Écriture directe sur la scène
    // puis Store.save(), comme le fait le séquencier. Sur « change » (donc à la
    // sortie du champ) et non « input », pour ne pas déclencher une sauvegarde
    // par frappe. Pas de re-rendu : la valeur est déjà à l'écran, et rejouer la
    // feuille ferait perdre le focus.
    // Heure de plateau d'une scene du jour. Elle appartient au JOUR, pas a la
    // scene : elle vit dans tempShootDay.scenes[].startTime, d'ou l'ecriture
    // directe plutot qu'un passage par push (qui ne connait que les cles edit-*).
    setSceneTime: (sceneId, val) => {
        if(state.currentRole === 'viewer') return;
        const t = FDSLive.temp();
        const ref = (t.scenes || []).find(x => x && String(x.sceneId) === String(sceneId));
        if(!ref) return;
        ref.startTime = String(val == null ? '' : val);
    },
    setChrono: (sceneId, val) => {
        if(state.currentRole === 'viewer') return;
        const sc = (state.data.scenes || []).find(x => x && String(x.id) === String(sceneId));
        if(!sc) { Utils.toast('Scène introuvable.', 'error'); return; }
        const v = String(val == null ? '' : val).trim();
        if((sc.chrono || '') === v) return;
        sc.chrono = v;
        sc.lastModified = Date.now();
        if(state.currentUser && state.currentUser.email) sc.lastModifiedBy = state.currentUser.email;
        Store.save();
    },
    // Convoquer / retirer quelqu'un du jour. Depuis le retrait du pane, la case
    // a cocher n'existe plus : le modele est seul depositaire de la convocation
    // et de ses consequences (relachement des liens de covoiturage).
    addPerson: (type, id) => {
        if(!id || state.currentRole === 'viewer') return;
        PlanningTransport.model.include(type, id);
        FDSLive.render();
    },
    removePerson: (type, id) => {
        if(!id || state.currentRole === 'viewer') return;
        PlanningTransport.model.exclude(type, id);
        FDSLive.render();
    },
    ro: (val, emptyLabel, linkLabel, linkAction) => {
        const v = String(val == null ? '' : val).trim();
        const link = linkAction ? ` <button type="button" class="fdsw-link" onclick="${linkAction}">${FDSLive.esc(linkLabel || 'ouvrir la fiche')}</button>` : '';
        if(v) return `<span class="fdsw-ro">${FDSLive.esc(v)}</span>`;
        return `<span class="fdsw-empty">${FDSLive.esc(emptyLabel || 'à renseigner')}</span>${link}`;
    },
    // Cellule dont la valeur appartient entierement a une source (fiche ou
    // onglet) et n'est pas surchargeable depuis la feuille : elle suit donc
    // toujours la source, s'affiche en noir, et porte le bouton qui mene la
    // ou on peut la changer. Meme regle que cellSrc, sans l'etat orange
    // puisqu'aucune saisie locale n'est possible.
    roSrc: (val, emptyLabel, action, btnLabel) => {
        const v = String(val == null ? '' : val).trim();
        const btn = action ? ` <button type="button" class="fdsw-btn" onclick="${action}">${FDSLive.esc(btnLabel || "Changer l'info source")}</button>` : '';
        if(v) return `<span class="fdsw-ro">${FDSLive.esc(v)}</span>${btn}`;
        return `<span class="fdsw-empty">${FDSLive.esc(emptyLabel || 'à renseigner')}</span>${btn}`;
    },
    // Ouvre la fiche qui porte la donnée manquante PAR-DESSUS la feuille de
    // service : le jour reste ouvert, rien n'est enregistré ni perdu, et la
    // feuille est rejouée à la fermeture pour que la case se remplisse.
    openFiche: (kind, id) => {
        const modal = document.getElementById('card-edit-modal');
        if(modal) modal.classList.add('modal-over-fds');
        FDSLive._pendingRefresh = true;
        // ROUTAGE DELEGUE EN ENTIER (26 aout). La feuille refaisait son propre
        // aiguillage pour six familles : c'etait une seconde table a tenir a
        // jour, et elle nommait 'char' et 'loc' ce que tout le reste appelle
        // 'character' et 'location' — un nom copie d'un endroit a l'autre
        // echouait en silence. Seul l'enrobage propre a la feuille reste ici
        // (superposition et rejeu a la fermeture) ; la porte unique decide de la
        // fenetre ET des droits, comme partout ailleurs.
        // Les deux anciens noms sont encore acceptes : ils sont ecrits dans les
        // appels de la feuille, les renommer tous serait un risque pour rien.
        const FAMILLE = { char: 'character', loc: 'location' };
        const famille = FAMILLE[kind] || kind;
        try {
            if(!Links.COLL[famille] && famille !== 'day') { Utils.toast('Fiche introuvable.', 'error'); return; }
            UI.openFiche(famille, id);
        } catch(e) {
            console.error('FDSLive.openFiche', e);
            Utils.toast("Impossible d'ouvrir cette fiche.", 'error');
            return;
        }
        FDSLive._watchClose();
    },
    // Le titre du film et son auteur vivent dans l'onglet Titre, qui n'a pas de
    // fiche modale : on ne peut qu'indiquer où aller.
    // « Changer l'info source » de l'identite de la production. La feuille ne
    // modifie RIEN de global en douce : elle ouvre la fenetre qui en est la
    // source, par-dessus le jour en cours, et se rejoue a la fermeture.
    openProdLegal: () => {
        if(typeof Presentation === 'undefined' || !Presentation.openLegalModal) {
            Utils.toast("Ces informations sont dans l'onglet Production > Présentation.", 'info');
            return;
        }
        Presentation.openLegalModal();
    },
    // Indique OU se renseigne une donnee sans quitter le jour en cours : basculer
    // d'onglet fermerait la modale et perdrait les saisies non sauvegardees.
    // Le second argument nomme l'onglet reel — sans lui, ce message annoncait
    // l'onglet Titre pour tout le monde, y compris pour l'equipe ou la
    // production.
    goTab: (label, tab) => {
        Utils.toast(`« ${label} » se renseigne dans l'onglet ${tab || 'Titre'} du projet.`, 'info');
    },
    _pendingRefresh: false,
    _watchClose: () => {
        const modal = document.getElementById('card-edit-modal');
        if(!modal) return;
        const tick = setInterval(() => {
            if(!modal.classList.contains('visible')) {
                clearInterval(tick);
                modal.classList.remove('modal-over-fds');
                if(FDSLive._pendingRefresh) {
                    FDSLive._pendingRefresh = false;
                    FDSLive.render();
                }
            }
        }, 300);
    },
    missing: (label) => {
        Utils.toast(`« ${label} » n'existe encore nulle part dans l'app : champ à créer sur le jour de tournage.`, 'warning');
    },
    // --- Lien jour <-> fiche décor -------------------------------------------
    // Le jour RECOPIE la fiche décor au moment où on le choisit, puis vit sa
    // vie : corriger l'adresse ou le code de porte sur la fiche ne redescend
    // jamais. La recopie automatique serait pire, un point de rendez-vous
    // diverge légitimement du décor (on se gare à 300 m). On se contente donc
    // de signaler l'écart et de proposer de le combler.
    LOC_FIELDS: [
        { input: 'edit-location',        prop: 'realName',     label: 'Lieu réel' },
        { input: 'edit-locationAddress', prop: 'address',      label: 'Adresse' },
        { input: 'edit-contactName',     prop: 'contactName',  label: 'Contact' },
        { input: 'edit-contactPhone',    prop: 'contactPhone', label: 'Téléphone' },
        { input: 'edit-locationNotes',   prop: 'accessNotes',  label: "Notes d'accès" },
        { input: 'edit-rdvFiguration',   prop: 'rdvFiguration', label: 'Rdv figuration' },
        { input: 'edit-hmcPlace',        prop: 'hmcPlace',     label: 'HMC' },
        { input: 'edit-prodOffice',      prop: 'prodOffice',   label: 'Bureau de production' },
        { input: 'edit-techParking',     prop: 'techParking',  label: 'Stationnement technique' },
        { input: 'edit-persoParking',    prop: 'persoParking', label: 'Stationnement perso' },
        { input: 'edit-locationLat',     prop: 'lat',          label: 'Coordonnées' },
        { input: 'edit-locationLng',     prop: 'lng',          label: 'Coordonnées' }
    ],
    linkedLocation: () => {
        const locs = state.data.locations || [];
        const id = FDSLive.get('edit-locationId');
        if(id) return locs.find(l => l && l.id === id) || null;
        // Jours créés avant l'existence du lien : repli sur le champ location,
        // qui portait le nom du décor à l'époque et porte le nom réel depuis.
        const real = String(FDSLive.get('edit-location') || '').trim();
        if(!real) return null;
        return locs.find(l => l && l.name === real)
            || locs.find(l => l && l.realName && l.realName === real)
            || null;
    },
    // Etat d'un champ vis-a-vis de sa source :
    //   'none'     la source ne dit rien, le champ appartient au jour
    //   'sync'     le jour dit exactement ce que dit la source  -> noir
    //   'override' le jour dit autre chose (y compris rien)     -> orange
    // La memoire locSync retient la valeur heritee lors du dernier alignement.
    // Sans elle, impossible de distinguer « le jour suit la source, qui vient
    // de changer » de « l'utilisateur a saisi sa propre valeur » : les deux se
    // presentent comme un ecart. C'est aussi elle qui permet de vider un champ
    // pour de bon sans qu'il ne se reremplisse au rendu suivant.
    locSyncMap: () => {
        const d = Planning.tempShootDay;
        if(!d) return {};
        if(!d.locSync || typeof d.locSync !== 'object') d.locSync = {};
        return d.locSync;
    },
    srcState: (f) => {
        const loc = FDSLive.linkedLocation();
        if(!loc) return 'none';
        const src = String(loc[f.prop] == null ? '' : loc[f.prop]).trim();
        if(!src) return 'none';
        return String(FDSLive.get(f.input) || '').trim() === src ? 'sync' : 'override';
    },
    // Fait descendre la source dans les champs qui la suivent encore, et ne
    // touche a rien d'autre. Appelee a chaque rendu de la feuille.
    syncFromLocation: () => {
        const loc = FDSLive.linkedLocation();
        if(!loc || state.currentRole === 'viewer') return;
        const memo = FDSLive.locSyncMap();
        FDSLive.LOC_FIELDS.forEach(f => {
            const src = String(loc[f.prop] == null ? '' : loc[f.prop]).trim();
            const cur = String(FDSLive.get(f.input) || '').trim();
            const seen = memo[f.prop];
            if(seen === undefined) {
                // Premier contact avec ce champ : on n'herite que dans le vide.
                if(!cur && src) { FDSLive.push(f.input, src); memo[f.prop] = src; }
                else if(cur && cur === src) { memo[f.prop] = src; }
                return;
            }
            if(cur !== seen) return;          // valeur propre au jour : intouchable
            if(src !== seen) {                 // la source a bouge, le jour suit
                FDSLive.push(f.input, src);
                memo[f.prop] = src;
            }
        });
    },
    // Rend au champ la valeur de sa source
    revertField: (prop) => {
        if(state.currentRole === 'viewer') return;
        const loc = FDSLive.linkedLocation();
        const f = FDSLive.LOC_FIELDS.find(x => x.prop === prop);
        if(!loc || !f) return;
        const src = String(loc[f.prop] == null ? '' : loc[f.prop]).trim();
        FDSLive.push(f.input, src);
        FDSLive.locSyncMap()[f.prop] = src;
        FDSLive.render();
    },
    // Ouvre la fiche qui fait autorite pour ce champ
    editSource: () => {
        const loc = FDSLive.linkedLocation();
        if(!loc) { Utils.toast("Aucune fiche décor n'est liée à ce jour : choisis-en une dans « Fiche décor liée ».", 'info'); return; }
        FDSLive.openFiche('loc', loc.id);
    },
    // Champ adosse a une fiche : saisie libre, coloration selon l'ecart,
    // bouton vers la source, et retour a la source quand on a diverge.
    cellSrc: (prop, placeholder, domId, withAddressSearch) => {
        const f = FDSLive.LOC_FIELDS.find(x => x.prop === prop);
        if(!f) return `<span class="fdsw-empty">non disponible</span>`;
        const st = FDSLive.srcState(f);
        const cls = st === 'override' ? 'fdsw-in fdsw-override' : 'fdsw-in';
        const title = st === 'override' ? "Cette valeur diffère de la fiche décor. Modifier ici ne change pas la fiche."
                    : (st === 'sync' ? 'Valeur reprise de la fiche décor.' : '');
        let btns = `<button type="button" class="fdsw-btn" title="Modifier la fiche décor, qui fait autorité" onclick="app.FDSLive.editSource()">Changer l'info source</button>`;
        if(st === 'override') {
            btns += `<button type="button" class="fdsw-btn fdsw-btn-revert" title="Reprendre la valeur de la fiche décor" onclick="app.FDSLive.revertField('${FDSLive.esc(prop)}')">Revenir à la source</button>`;
        }
        const extra = domId ? ` id="${FDSLive.esc(domId)}"` : '';
        // Le champ du formulaire déclenche son autocomplétion sur « oninput »
        // alors que la feuille écrit sur « change » : une adresse tapée ici
        // n'était donc jamais géocodée, d'où ni soleil ni carte. La feuille a
        // désormais sa propre recherche, avec sa propre liste de suggestions.
        const search = withAddressSearch ? ` oninput="app.FDSLive.searchAddress(this.value)" autocomplete="off"` : '';
        const sugg = withAddressSearch ? `<div id="fdsw-addr-sugg" class="address-suggestions"></div>` : '';
        const wrapCls = withAddressSearch ? 'fdsw-src address-autocomplete-container' : 'fdsw-src';
        return `<div class="${wrapCls}"><input class="${cls}"${extra} type="text" value="${FDSLive.esc(FDSLive.get(f.input))}" placeholder="${FDSLive.esc(placeholder || '')}" title="${FDSLive.esc(title)}" oninput="app.FDSLive.push('${f.input}', this.value)"${search} onchange="app.FDSLive.render()">${btns}${sugg}</div>`;
    },
    // Recherche d'adresse (API Adresse du gouvernement français), avec le même
    // anti-rebond que le formulaire. Le choix d'une suggestion renseigne
    // l'adresse ET les coordonnées, ce qui débloque soleil, carte et météo.
    _addrTimer: null,
    searchAddress: (query) => {
        clearTimeout(FDSLive._addrTimer);
        const box = document.getElementById('fdsw-addr-sugg');
        if(!box) return;
        if(!query || query.length < 3) { box.classList.remove('visible'); box.style.display = 'none'; return; }
        FDSLive._addrTimer = setTimeout(function fdsAddrLookup() {
            fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`)
                .then(r => r.json())
                .then(data => {
                    const cur = document.getElementById('fdsw-addr-sugg');
                    if(!cur) return;
                    const feats = (data && data.features) || [];
                    if(!feats.length) {
                        cur.innerHTML = `<div class="address-suggestion" style="cursor:default; color:var(--text-sec);">Aucun résultat</div>`;
                    } else {
                        cur.innerHTML = feats.map(ft => {
                            const pr = ft.properties || {}, co = (ft.geometry || {}).coordinates || [];
                            const label = String(pr.label || '');
                            const arg = FDSLive.esc(label).replace(/'/g, "\\'");
                            return `<div class="address-suggestion" onclick="app.FDSLive.selectAddress('${arg}', ${co[1]}, ${co[0]})">
                                <div class="address-suggestion-main">${FDSLive.esc(pr.name || label.split(',')[0])}</div>
                                <div class="address-suggestion-secondary">${FDSLive.esc(pr.context || '')}</div>
                            </div>`;
                        }).join('');
                    }
                    cur.classList.add('visible');
                    cur.style.display = 'block';
                })
                .catch(err => {
                    console.error('FDSLive.searchAddress', err);
                    const cur = document.getElementById('fdsw-addr-sugg');
                    if(cur) { cur.classList.remove('visible'); cur.style.display = 'none'; }
                });
        }, 300);
    },
    selectAddress: (address, lat, lng) => {
        FDSLive.push('edit-locationAddress', address);
        if(isFinite(lat) && isFinite(lng)) {
            FDSLive.push('edit-locationLat', String(lat));
            FDSLive.push('edit-locationLng', String(lng));
        }
        const box = document.getElementById('fdsw-addr-sugg');
        if(box) { box.classList.remove('visible'); box.style.display = 'none'; }
        FDSLive.render();
    },
    render: () => {
        const host = document.getElementById('fds-pane-live');
        if(!host) return;
        FDSLive.syncFromLocation();
        const day = Planning.tempShootDay || {};
        const g = FDSLive.get, c = FDSLive.cell, ro = FDSLive.ro, esc = FDSLive.esc;
        const scenes = day.scenes || [];
        const allScenes = state.data.scenes || [];
        // Titre et auteur sont desormais lus par PlanningFDS.filmIdentity, qui
        // porte toute l'identite du film pour l'ecran comme pour le PDF.
        const dateTxt = g('edit-startDate')
            ? new Date(g('edit-startDate')).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).toUpperCase()
            : '';

        let h = '';
        h += `<div class="fdsw-legend">
            <span>Champ blanc : éditable, écrit directement dans la feuille.</span>
            <span><b>Rouge italique</b> : case du modèle AFAR non renseignée.</span>
        </div>`;
        h += `<div class="fdsw">`;

        // --- Bandeau d'équipe (bande de tête du modèle AFAR) ---
        // Neuf cases par corps de métier, plus « Personnel sup » et
        // « COMÉDIENS ». Les noms viennent de l'onglet Équipe : rien ne se
        // saisit ici, un bouton renvoie vers la fiche à corriger.
        {
            const banner = PlanningFDS.teamBanner(day, state.data.crew || [], state.data.actors || []);
            const cw = (100 / banner.cols.length).toFixed(2);
            h += `<table class="fdsw-grid"><tr>`;
            banner.cols.forEach(col => {
                h += `<th style="width:${cw}%; font-size:0.62rem">${esc(col.label)}</th>`;
            });
            h += `</tr><tr>`;
            banner.cols.forEach(col => {
                let inner = '';
                if(col.empty) {
                    inner = `<span class="fdsw-empty">personne</span>`;
                } else {
                    inner = col.parts.filter(p => p.names.length).map(p =>
                        (p.sub ? `<span class="fdsw-lab" style="font-size:0.6rem">${esc(p.sub)}</span><br>` : '')
                        + `<span class="fdsw-ro" style="font-size:0.66rem">${esc(p.names.join(', '))}</span>`
                    ).join('<br>');
                }
                h += `<td style="vertical-align:top; font-size:0.66rem">${inner}</td>`;
            });
            h += `</tr>`;
            h += `<tr><td colspan="${banner.cols.length}"><span class="fdsw-lab">Personnel sup</span> ${c('edit-extraStaff', 'renforts ponctuels du jour')}</td></tr>`;
            h += `<tr><td colspan="${banner.cols.length}"><span class="fdsw-lab">Comédiens</span> `
               + (banner.actors.length
                    ? `<span class="fdsw-ro"><b>${esc(banner.actors.join(', '))}</b></span>`
                    : `<span class="fdsw-empty">aucun comédien dans le projet</span>`)
               + `</td></tr>`;
            h += `</table>`;
        }

        // --- Identité du film et contacts de production (modèle AFAR) ---
        // Logo + TITRE + « un film de », puis le pavé production et les sept
        // contacts nommés. Tout est en lecture : chaque case renvoie vers la
        // fiche ou l'onglet qui en est la source.
        {
            const idt = PlanningFDS.filmIdentity(state.data.crew || []);
            const prodTab = "app.FDSLive.openProdLegal()";
            const logoCell = idt.logo
                ? `<img src="${esc(Utils.signedUrlFor(idt.logo))}" alt="Logo de la production" style="max-height:54px; max-width:100%;">`
                : `<span class="fdsw-empty">pas de logo de production</span><br><button type="button" class="fdsw-link" onclick="app.FDSLive.openProdLegal()">ajouter un logo</button>`;
            h += `<table class="fdsw-grid"><tr>
                <td style="width:22%; text-align:center; vertical-align:middle">${logoCell}</td>
                <td style="width:44%; text-align:center; vertical-align:middle">
                    <span style="font-size:1.05rem; font-weight:bold">${FDSLive.roSrc(idt.title, 'titre du film', "app.FDSLive.goTab('Titre du film', 'Titre')", 'Onglet Titre')}</span>
                    <br><span style="font-size:0.72rem">Un film de ${FDSLive.roSrc(idt.author, 'auteur / réalisateur', "app.FDSLive.goTab('Auteur', 'Titre')", 'Onglet Titre')}</span>
                </td>
                <td style="width:34%; vertical-align:top">
                    <span class="fdsw-lab">Production</span><br>
                    ${ro(idt.prodName, 'nom de la production', 'renseigner', prodTab)}<br>
                    ${ro(idt.prodAddress, 'adresse de la production', 'renseigner', prodTab)}<br>
                    ${ro(idt.prodPhone, 'téléphone de la production', 'renseigner', prodTab)}
                    <br><button type="button" class="fdsw-btn" onclick="app.FDSLive.openProdLegal()">Changer l'info source</button>
                </td>
            </tr></table>`;
            h += `<table class="fdsw-grid"><tr><th style="width:44%">Contact production</th><th style="width:33%">Nom</th><th style="width:23%">Téléphone</th></tr>`;
            idt.contacts.forEach(ct => {
                // Personne identifiee mais sans telephone : le lien ouvre SA
                // fiche, comme partout ailleurs sur la feuille. Poste vacant :
                // il n'y a aucune fiche a ouvrir, on dit ou l'attribuer.
                const fiche = `app.FDSLive.openFiche('crew','${esc(ct.id)}')`;
                const phoneCell = ct.name
                    ? ro(ct.phone, 'téléphone absent de la fiche', 'Fiche équipe', fiche)
                    : `<span class="fdsw-ro" style="color:#888">—</span>`;
                const nameCell = ct.name
                    ? FDSLive.roSrc(ct.name, '', fiche, 'Fiche équipe')
                    : ro('', 'aucun poste attribué', 'où l\u2019attribuer', "app.FDSLive.goTab('Contacts de production', 'Équipes')");
                h += `<tr>
                    <td><span class="fdsw-lab">${esc(ct.label)}</span></td>
                    <td>${nameCell}</td>
                    <td>${phoneCell}</td>
                </tr>`;
            });
            h += `</table>`;
        }

        // --- En-tête horaires ---
        h += `<table class="fdsw-grid"><tr>
            <td style="width:25%"><span class="fdsw-lab">Type de journée</span><br>${FDSLive.sel('edit-dayType')}</td>
            <td style="width:25%"><span class="fdsw-lab">Date</span><br>${c('edit-startDate','','date')}</td>
            <td style="width:25%"><span class="fdsw-lab">Date de fin</span><br>${c('edit-endDate','','date')}</td>
            <td style="width:25%"><span class="fdsw-lab">Nom du jour</span><br>${c('edit-name', PlanningDayEdit.autoDayName(Planning.tempShootDay))}</td>
        </tr></table>`;
        h += `<table class="fdsw-grid"><tr>
            <td style="width:25%"><span class="fdsw-lab">Horaires de tournage</span><br>${c('edit-crewCall','','time')} &nbsp;&ndash;&nbsp; ${c('edit-estimatedWrap','','time')}</td>
            <td style="width:25%"><span class="fdsw-lab">Convocation équipe</span><br><span id="fdsw-cell-crewcall">${ro(g('edit-crewCall'), 'non renseignée')}</span><br><span class="fdsw-empty" style="font-size:0.62rem">même heure que le début des horaires de tournage</span></td>
            <td style="width:25%"><span class="fdsw-lab">Prêt à tourner</span><br>${c('edit-readyToShoot','','time')}</td>
            <td style="width:25%"><span class="fdsw-lab">Repas</span><br>${c('edit-lunchStart','','time')} &nbsp;&ndash;&nbsp; ${c('edit-lunchEnd','','time')}</td>
        </tr></table>`;

        // Lever / coucher du soleil : calculés à partir des coordonnées du lieu
        // de tournage, par le même code que le PDF (case officielle AFAR).
        const _lat = g('edit-locationLat'), _lng = g('edit-locationLng'), _dt = g('edit-startDate');
        h += `<table class="fdsw-grid"><tr>
            <td style="width:25%" id="fdsw-cell-sunrise"><span class="fdsw-lab">Lever du soleil</span><br>${FDSLive.sunCell('sunrise', _lat, _lng, _dt)}</td>
            <td style="width:25%" id="fdsw-cell-sunset"><span class="fdsw-lab">Coucher du soleil</span><br>${FDSLive.sunCell('sunset', _lat, _lng, _dt)}</td>
            <td style="width:50%"><span class="fdsw-lab">H. supp éventuelles</span><br>${ro('', 'aucun champ dans l\'app', 'à créer', "app.FDSLive.missing('HEURES SUPPLÉMENTAIRES')")}</td>
        </tr></table>`;

        h += `<div class="fdsw-bar" id="fdsw-datebar">${esc(FDSLive.dayBarText())}</div>`;

        // --- Note à l'équipe ---
        h += `<div class="fdsw-note"><span class="fdsw-lab">Note à l'équipe</span><br>${c('edit-notes','Consignes générales du jour...')}</div>`;

        // --- Bloc informations ---
        const infoRow = (lab, inner) => `<tr><td style="width:34%"><span class="fdsw-lab">${esc(lab)}</span></td><td>${inner}</td></tr>`;
        const decors = scenes.map(r => { const s = allScenes.find(x => x.id === r.sceneId); return s ? PlanningFDS.decor(s) : ''; }).filter(Boolean).join(' - ');
        h += `<table class="fdsw-grid">`;
        const srcLoc = FDSLive.linkedLocation();
        h += `<tr><td colspan="2" style="background:#f7f7f7">
            <span class="fdsw-empty">Les lignes ci-dessous sont reprises de la fiche décor. En noir : identique à la fiche. En orange : valeur propre à ce jour, la fiche n'est pas modifiée.</span>
        </td></tr>`;
        h += infoRow('Décor(s)', ro(decors, 'aucune scène ajoutée au jour', 'ajouter une scène', "app.FDSLive.focusField('fdsw-addscene')"));
        h += infoRow('Fiche décor liée', FDSLive.sel('edit-location-select') + (srcLoc ? '' : ' <span class="fdsw-empty">aucune fiche liée : les lignes suivantes n\'ont pas de source</span>'));
        h += infoRow('Lieu(x) de rdv & de tournage', FDSLive.cellSrc('realName', 'lieu de tournage', 'fdsw-realname'));
        h += infoRow('Adresse', FDSLive.cellSrc('address', 'tapez une adresse', 'fdsw-addr', true));
        h += infoRow('Contact sur place', FDSLive.cellSrc('contactName', 'qui accueille sur place'));
        h += infoRow('Téléphone du contact', FDSLive.cellSrc('contactPhone', 'à joindre le jour même'));
        h += infoRow('Accès (code porte, interphone...)', FDSLive.cellSrc('accessNotes', 'code, interphone, étage...'));
        h += infoRow('Lieu(x) de rdv figuration', FDSLive.cellSrc('rdvFiguration', 'où la figuration se présente', 'fdsw-rdvfigu'));
        h += infoRow('HMC (lieu)', FDSLive.cellSrc('hmcPlace', 'où sont installés maquillage / coiffure / costumes', 'fdsw-hmcplace'));
        h += infoRow('Bureau de production', FDSLive.cellSrc('prodOffice', 'où joindre la production sur place'));
        h += infoRow('Cantine', c('edit-meals', 'repas à prévoir'));
        h += infoRow('Stationnement véhicules techniques', FDSLive.cellSrc('techParking', 'où se garent les camions et la régie'));
        h += infoRow('Stationnement véhicules perso', FDSLive.cellSrc('persoParking', 'où se gare le reste de l\'équipe'));
        h += infoRow('Consignes météo', c('edit-customWeather', 'ex : prévoir parapluies'));
        h += `</table>`;

        // --- Carte et météo du lieu ---
        // Deux blocs remplis APRÈS l'insertion du HTML : Leaflet exige un
        // conteneur déjà présent dans le document pour se dimensionner, et la
        // météo est un appel réseau qui ne doit pas retarder l'affichage.
        h += `<table class="fdsw-grid"><tr>
            <td style="width:50%; vertical-align:top"><span class="fdsw-lab">Plan d'accès</span><div id="fdsw-map" class="fdsw-map"></div><div id="fdsw-map-links"></div><div id="fdsw-map-warn" style="display:none"><span class="fdsw-empty">tuiles bloquées : normal en ouvrant le fichier en local, la carte s'affiche une fois le site en ligne</span></div></td>
            <td style="width:50%; vertical-align:top"><span class="fdsw-lab">Météo prévue</span><div id="fdsw-weather"><span class="fdsw-empty">—</span></div></td>
        </tr></table>`;

        // --- Séquencier ---
        h += `<table class="fdsw-grid">
            <tr><th style="width:8%">Heure</th><th style="width:5%">Seq</th><th style="width:10%">Effet</th><th style="width:7%">Chrono</th>
            <th style="width:15%">Décor</th><th style="width:19%">Résumé</th><th style="width:15%">Personnages</th><th style="width:9%">Plans</th><th style="width:7%">Pré-min</th><th style="width:5%"></th></tr>`;
        if(!scenes.length) {
            h += `<tr><td colspan="10" style="text-align:center"><span class="fdsw-empty">Aucune scène planifiée : ajoute-en une ci-dessous, le reste de la feuille se remplira tout seul.</span></td></tr>`;
        } else {
            scenes.forEach(ref => {
                const s = allScenes.find(x => x.id === ref.sceneId);
                if(!s) return;
                const idx = allScenes.findIndex(x => x.id === ref.sceneId);
                h += `<tr>
                    <td><input class="fdsw-in" type="time" value="${esc(ref.startTime || '')}" onchange="app.FDSLive.setSceneTime('${esc(ref.sceneId)}', this.value)"></td>
                    <td style="text-align:center">${esc(idx >= 0 ? idx + 1 : '')}</td>
                    <td>${FDSLive.roSrc(PlanningFDS.effet(s.title), 'INT/EXT ?', `app.FDSLive.openFiche('scene','${esc(ref.sceneId)}')`, 'Fiche scène')}</td>
                    <td style="text-align:center"><input class="fdsw-in" style="text-align:center" value="${esc(s.chrono || '')}" placeholder="J1" title="Jour de récit" onchange="app.FDSLive.setChrono('${esc(ref.sceneId)}', this.value)"></td>
                    <td>${FDSLive.roSrc(PlanningFDS.decor(s), 'décor illisible', `app.FDSLive.openFiche('scene','${esc(ref.sceneId)}')`, 'Fiche scène')}</td>
                    <td>${FDSLive.roSrc(s.resume || '', 'résumé vide', `app.FDSLive.openFiche('scene','${esc(ref.sceneId)}')`, 'Fiche scène')}</td>
                    <td>${FDSLive.roSrc(s.perso || '', 'aucun personnage', `app.FDSLive.openFiche('scene','${esc(ref.sceneId)}')`, 'Fiche scène')}</td>
                    <td style="text-align:center">${FDSLive.shotsCell(ref, s)}</td>
                    <td style="text-align:center">${FDSLive.roSrc(PlanningFDS.min(s.time), '—', `app.FDSLive.openFiche('scene','${esc(ref.sceneId)}')`, 'Fiche scène')}</td>
                    <td style="text-align:center"><button type="button" class="fdsw-link" title="Retirer du jour" onclick="app.FDSLive.removeScene('${esc(ref.sceneId)}')">✖</button></td>
                </tr>`;
            });
        }
        // Ajout d'une scène : c'est ce choix qui alimente toute la feuille
        const dayScenesIds = scenes.map(r => String(r.sceneId));
        const addable = allScenes.filter(s => !dayScenesIds.includes(String(s.id)));
        h += `<tr><td colspan="10" style="background:#f4f4f4">
            <span class="fdsw-lab">Ajouter une scène</span>
            <select id="fdsw-addscene" class="fdsw-in" style="width:auto; border:1px solid #999;" onchange="app.FDSLive.addScene(this.value)">
                <option value="">-- choisir une scène --</option>
                ${addable.map((s, i) => `<option value="${esc(s.id)}">${esc((allScenes.indexOf(s) + 1) + '. ' + (s.title || 'Sans titre'))}</option>`).join('')}
            </select>
        </td></tr>`;
        h += `</table>`;

        // --- Convocations : tableaux de distribution AFAR séparés ---
        // La liste des convoques vient de tempShootDay.callSheet via le modele.
        // Elle etait auparavant relevee sur les cases cochees du pane
        // Formulaire : depuis son retrait, cette lecture ne ramenait plus rien
        // et vidait d'un coup distribution, equipe technique et transports.
        const calls = PlanningTransport.model.calls()
            .filter(cl => cl && cl.type && cl.personId != null)
            .map(cl => ({ type: cl.type, id: cl.personId }));
        // Numeros officiels (v602) : calcules une fois pour toute la feuille.
        const numeros = CastFamilies.numeros();
        const actorOf = (id) => (state.data.actors || []).find(a => a.id === id);
        const crewOf = (id) => (state.data.crew || []).find(x => x.id === id);
        const castCalls = calls.filter(p => p.type === 'actor');
        const crewCalls = calls.filter(p => p.type === 'crew');

        const castTable = (title, scope, pred, barOverride, extra) => {
            // « extra » ajoute des colonnes propres a une famille : la
            // figuration a besoin du transport, du costume et de la consigne
            // pour que la feuille principale suffise a ses figurants.
            const xh = (extra && extra.headers) || [];
            const nCols = 8 + xh.length;
            // Les tableaux masquables gardent leur barre de titre, qui porte
            // l'interrupteur : eteinte, la ligne dit ce qui manque a la feuille.
            const togable = FDSLive.HIDEABLE.some(([k]) => k === scope);
            const bar = barOverride || (togable
                ? FDSLive.barTog(title, !FDSLive.hidden(scope), `app.FDSLive.toggleScope('${scope}', ${FDSLive.hidden(scope)})`)
                : `<div class="fdsw-bar">${esc(title)}</div>`);
            if(togable && FDSLive.hidden(scope)) return bar;
            const rows = castCalls.filter(p => { const a = actorOf(p.id); return a && pred(a); });
            let t = bar + `<table class="fdsw-grid">
                <tr><th style="width:5%">N°</th><th>Rôle</th><th>Interprète</th>
                <th style="width:9%">Conv.</th><th style="width:9%">Pick-up</th><th style="width:9%">HMC</th><th style="width:9%">PAT</th>${xh.map(lab => `<th>${esc(lab)}</th>`).join('')}<th style="width:4%"></th></tr>`;
            if(!rows.length) {
                t += `<tr><td colspan="${nCols}" style="text-align:center"><span class="fdsw-empty">Aucun·e convoqué·e.</span></td></tr>`;
            } else {
                rows.forEach((p, i) => {
                    const a = actorOf(p.id);
                    // Le rôle n'est pas porté par le comédien : c'est le personnage
                    // qui pointe vers lui (character.actor_id), comme dans le PDF.
                    const ch = (state.data.characters || []).find(x => x.actor_id === a.id);
                    const roleCell = ch
                        ? FDSLive.roSrc(ch.name || '', 'personnage sans nom', `app.FDSLive.openFiche('char','${esc(ch.id)}')`)
                        : FDSLive.roSrc('', 'aucun personnage lié', `app.FDSLive.openFiche('actor','${esc(a.id)}')`, 'Lier un personnage');
                    t += `<tr>
                        <td style="text-align:center">${esc(numeros[a.id] || (scope === 'figu' ? String(i + 1) : ''))}</td>
                        <td>${roleCell}</td>
                        <td>${FDSLive.roSrc(a.name || '', 'comédien sans nom', `app.FDSLive.openFiche('actor','${esc(a.id)}')`)}</td>
                        <td>${c(`call-time-actor-${p.id}`, '', 'time')}</td>
                        <td>${c(`call-pickup-actor-${p.id}`, '', 'time')}</td>
                        <td>${c(`call-hmc-actor-${p.id}`, '', 'time')}</td>
                        <td>${c(`call-pat-actor-${p.id}`, '', 'time')}</td>
                        ${extra ? extra.cells(p.id) : ''}
                        <td style="text-align:center"><button type="button" class="fdsw-link" title="Déconvoquer" onclick="app.FDSLive.removePerson('actor','${esc(p.id)}')">✖</button></td>
                    </tr>`;
                });
            }
            // Rattrapage : un comédien oublié par l'auto-complétion se rajoute ici
            const already = castCalls.map(p => p.id);
            const addable = (state.data.actors || []).filter(a => !already.includes(a.id) && pred(a));
            t += `<tr><td colspan="${nCols}" style="background:#f4f4f4">
                <span class="fdsw-lab">Convoquer en plus</span>
                <select class="fdsw-in" style="width:auto; border:1px solid #999;" onchange="app.FDSLive.addPerson('actor', this.value)">
                    <option value="">-- ajouter --</option>
                    ${addable.map(a => `<option value="${esc(a.id)}">${esc(a.name || 'Sans nom')}</option>`).join('')}
                </select>
            </td></tr>`;
            if(rows.length) t += FDSLive.applyRowHtml(scope, nCols);
            return t + `</table>`;
        };
        // Silhouettes et doublures : l'interrupteur vit dans la barre de titre
        // de chaque tableau (FDSLive.barTog), plus dans une rangée de cases.
        // v602 : une famille sans aucun comedien dans le projet n'a pas de
        // tableau — il n'y aurait personne a convoquer. Les roles, eux, sont
        // toujours la.
        CastFamilies.LISTE.forEach(f => {
            if(f.cle === 'figu') return;
            if(f.cle !== 'role' && !CastFamilies.membres(f.cle).length) return;
            h += castTable(f.titre, f.cle, (a) => CastFamilies.de(a) === f.cle);
        });
        // --- FIGURATION : nommée ici, ou renvoyée sur sa propre feuille ---
        {
            const split = FDSLive.figuSplit();
            const figIds = FDSLive.scopeIds('figu');
            // L'interrupteur vit dans la barre, comme pour les autres tableaux.
            // ON = feuille dédiée ; OFF = tableau complet ici même.
            const figBar = FDSLive.barTog('FIGURATION', split,
                `app.FDSLive.setFiguSplit(${!split})`, 'feuille dédiée', 'sur cette feuille');
            if(!split) {
                // Mode « sur cette feuille » : la feuille principale doit
                // suffire aux figurants, donc elle porte aussi leurs colonnes
                // propres. Transport = prise en charge du deplacement (defraye,
                // gratuit, par ses propres moyens) : c'est une autre question
                // que le covoiturage du tableau TRANSPORTS, qui reste valable.
                const figExtra = {
                    headers: ['Transport', 'Costume', 'Consigne'],
                    cells: (pid) => {
                        const row = Figuration._fcs(day).find(r => String(r.figurantId) === String(pid)) || {};
                        const tr = row.transport || {};
                        const isOther = (tr.mode || '') === 'Autre';
                        const opts = Figuration._transportModes.map(m =>
                            `<option value="${esc(m)}" ${(tr.mode || '') === m ? 'selected' : ''}>${esc(m || '-- transport --')}</option>`).join('');
                        return `<td><select class="fdsw-in" onchange="app.Figuration.updateCallsheetTransport('${esc(pid)}', 'mode', this.value)">${opts}</select>`
                            + (isOther ? `<input class="fdsw-in" placeholder="préciser..." data-tooltip="préciser..." value="${esc(tr.note || '')}" onchange="app.Figuration.updateCallsheetTransport('${esc(pid)}', 'note', this.value)">` : '')
                            + `</td>`
                            + `<td><input class="fdsw-in" placeholder="tenue à prévoir" data-tooltip="tenue à prévoir" value="${esc(row.costume || '')}" onchange="app.Figuration.updateCallsheetField('${esc(pid)}', 'costume', this.value)"></td>`
                            + `<td>${c(`call-notes-actor-${pid}`, 'rien à apporter')}</td>`;
                    }
                };
                h += castTable('FIGURATION', 'figu', (a) => CastFamilies.de(a) === 'figu', figBar, figExtra);
            } else {
                // Effectifs par heure de convocation : ce que le modèle AFAR
                // attend sur la feuille principale quand la figuration est
                // gérée à part.
                const parHeure = {};
                figIds.forEach(id => {
                    const e = PlanningTransport.model.get('actor', id) || {};
                    const k = e.callTime || '';
                    parHeure[k] = (parHeure[k] || 0) + 1;
                });
                const lignes = Object.keys(parHeure).sort().map(k =>
                    `${parHeure[k]} figurant${parHeure[k] > 1 ? 's' : ''} à ${k || '(heure non renseignée)'}`).join(' &nbsp;·&nbsp; ');
                const goFigu = `<button type="button" class="fdsw-btn" onclick="app.Planning.switchFDSTab('figu')">Ouvrir la FDS figuration</button>`;
                h += figBar + `<table class="fdsw-grid">`;
                h += infoRow('Effectif du jour', figIds.length
                    ? `<span class="fdsw-ro">${figIds.length}</span> ${goFigu}`
                    : `<span class="fdsw-empty">aucun figurant convoqué</span> ${goFigu}`);
                if(figIds.length) h += infoRow('Convocation', `<span class="fdsw-ro">${lignes}</span>`);
                h += infoRow('Lieu(x) de rdv figuration', ro(g('edit-rdvFiguration'), 'non renseigné', 'renseigner',
                    "app.FDSLive.focusField('fdsw-rdvfigu', 'Le champ est dans le bloc d\\'informations.')"));
                h += infoRow('HMC (lieu)', ro(g('edit-hmcPlace'), 'non renseigné', 'renseigner',
                    "app.FDSLive.focusField('fdsw-hmcplace', 'Le champ est dans le bloc d\\'informations.')"));
                h += `</table>`;
            }
        }

        // --- Équipe technique, groupée par département ---
        h += `<div class="fdsw-bar">ÉQUIPE TECHNIQUE</div><table class="fdsw-grid">
            <tr><th style="width:24%">Nom</th><th style="width:26%">Poste</th><th style="width:11%">Conv.</th><th style="width:11%">Pick-up</th><th style="width:11%">PAT</th><th style="width:13%">Département</th><th style="width:4%"></th></tr>`;
        if(!crewCalls.length) {
            h += `<tr><td colspan="7" style="text-align:center"><span class="fdsw-empty">Aucun technicien convoqué.</span></td></tr>`;
        } else {
            const grpName = (gid) => { const gg = (CONFIG.crewGroups || []).concat((state.data.groups || []).filter(x => x.type === 'crew')).find(x => x.id === gid); return gg ? gg.name : ''; };
            const sorted = crewCalls.slice().sort((a, b) => String(grpName((crewOf(a.id) || {}).group_id)).localeCompare(String(grpName((crewOf(b.id) || {}).group_id))));
            sorted.forEach(p => {
                const m = crewOf(p.id) || {};
                h += `<tr>
                    <td>${FDSLive.roSrc(m.name || '', 'technicien sans nom', `app.FDSLive.openFiche('crew','${esc(p.id)}')`)}</td>
                    <td>${FDSLive.roSrc(m.role || '', 'poste non renseigné', `app.FDSLive.openFiche('crew','${esc(p.id)}')`)}</td>
                    <td>${c(`call-time-crew-${p.id}`, '', 'time')}</td>
                    <td>${c(`call-pickup-crew-${p.id}`, '', 'time')}</td>
                    <td>${c(`call-pat-crew-${p.id}`, '', 'time')}</td>
                    <td>${FDSLive.roSrc(grpName(m.group_id), 'non classé', `app.FDSLive.openFiche('crew','${esc(p.id)}')`)}</td>
                    <td style="text-align:center"><button type="button" class="fdsw-link" title="Déconvoquer" onclick="app.FDSLive.removePerson('crew','${esc(p.id)}')">✖</button></td>
                </tr>`;
            });
        }
        const crewAlready = crewCalls.map(p => p.id);
        const crewAddable = (state.data.crew || []).filter(m => !crewAlready.includes(m.id));
        h += `<tr><td colspan="7" style="background:#f4f4f4">
            <span class="fdsw-lab">Convoquer en plus</span>
            <select class="fdsw-in" style="width:auto; border:1px solid #999;" onchange="app.FDSLive.addPerson('crew', this.value)">
                <option value="">-- ajouter --</option>
                ${crewAddable.map(m => `<option value="${esc(m.id)}">${esc((m.name || 'Sans nom') + (m.role ? ' — ' + m.role : ''))}</option>`).join('')}
            </select>
        </td></tr>`;
        if(crewCalls.length) h += FDSLive.applyRowHtml('crew', 7);
        h += `</table>`;

        // --- Transports : mode + covoiturage, via PlanningTransport ---
        const transportSel = (type, id) => {
            const pers = type === 'actor' ? actorOf(id) : crewOf(id);
            const entry = PlanningTransport.model.get(type, id) || {};
            const cur = entry.transport || '';
            // L'option « V. régie » demande deux choses : un parc de véhicules,
            // et au moins un permis sur la fiche de la personne. Le formulaire
            // la faisait disparaitre en silence quand l'une manquait, ce qui ne
            // laissait aucun moyen de comprendre pourquoi. On l'affiche
            // desormais grisee, avec la raison.
            const parc = (state.data.vehicles || []).length > 0;
            const permis = !!(pers && (pers.licenses || []).length > 0);
            const regieLab = parc
                ? (permis ? '🚐 Amène (V. régie)' : '🚐 V. régie — aucun permis sur la fiche')
                : '🚐 V. régie — aucun véhicule au parc';
            const choix = [
                ['', '-- Transport --', false],
                ['own', '🚗 Propres moyens', false],
                ['own-brings', '🚗👥 Amène (V. perso)', false],
                ['own-brings-regie', regieLab, !(parc && permis) && cur !== 'own-brings-regie'],
                ['taxi', '🚕 Taxi', false],
                ['public', '🚇 Transports', false],
                ['with', '🚗➡️ Part avec...', false],
            ];
            let opts = '';
            choix.forEach(([v, lab, off]) => {
                opts += `<option value="${esc(v)}"${v === cur ? ' selected' : ''}${off ? ' disabled' : ''}>${esc(lab)}</option>`;
            });
            return `<select class="fdsw-in" onchange="app.FDSLive.setTransport('${type}','${esc(id)}', this.value)">${opts}</select>`;
        };
        const modeOf = (type, id) => (PlanningTransport.model.get(type, id) || {}).transport || '';
        const withCell = (type, id) => {
            const mode = modeOf(type, id);
            const isDriver = (mode === 'own-brings' || mode === 'own-brings-regie');
            if(!isDriver && mode !== 'with') return `<span class="fdsw-ro" style="color:#888">—</span>`;
            const picked = FDSLive.withWhoOf(type, id);
            // v598 : un CORPS par entree. On retire toutes les lignes de la
            // personne elle-meme — elle ne monte pas dans sa propre voiture — et
            // chaque autre n'est proposee qu'une fois, quel que soit le nombre de
            // postes qu'elle tient.
            const others = PersonIdentity.dedupe(
                calls.filter(o => !PersonIdentity.same(o.type, o.id, type, id)),
                (o) => ({ type: o.type, id: o.id }));
            if(!others.length) return `<span class="fdsw-empty">personne d'autre n'est convoqué</span>`;
            // Une cle de covoiturage enregistree peut viser un AUTRE poste de la
            // meme personne que celui retenu ci-dessus : la comparaison porte donc
            // sur le corps, sinon le passager disparaitrait de l'affichage.
            const memeQue = (o, v) => {
                const p = PlanningTransport.model.parse(v);
                return !!p && PersonIdentity.same(o.type, o.id, p.type, p.personId);
            };
            const nameFor = (o) => { const p = o.type === 'actor' ? actorOf(o.id) : crewOf(o.id); return p ? (p.name || '') : ''; };
            const optFor = (o) => `<option value="${esc(o.type + '_' + o.id)}">${esc(nameFor(o))}</option>`;
            if(mode === 'with') {
                // « Part avec » : un seul conducteur, la logique existante force déjà l'unicité
                const cur = picked[0] || '';
                return `<select class="fdsw-in" style="width:100%; border:1px solid #999;"
                    onchange="app.FDSLive.setWith('${type}','${esc(id)}', this.value)">
                    <option value="">-- qui conduit ? --</option>
                    ${others.map(o => { const v = o.type + '_' + o.id;
                        return `<option value="${esc(v)}"${(cur && memeQue(o, cur)) ? ' selected' : ''}>${esc(nameFor(o))}</option>`; }).join('')}
                </select>`;
            }
            // « Amène » : plusieurs passagers, ajoutés un par un et retirables
            const chips = picked.map(v => {
                const o = others.find(x => memeQue(x, v));
                if(!o) return '';
                return `<span style="display:inline-block; background:#eee; border:1px solid #999; border-radius:3px; padding:0 4px; margin:1px 3px 1px 0; white-space:nowrap;">${esc(nameFor(o))}
                    <button type="button" class="fdsw-link" title="Retirer" onclick="app.FDSLive.toggleWith('${type}','${esc(id)}','${esc(v)}', false)">✖</button></span>`;
            }).join('');
            const free = others.filter(o => !picked.some(v => memeQue(o, v))
                && PlanningTransport.model.canBePassenger(o.type, o.id));
            const adder = free.length ? `<select class="fdsw-in" style="width:100%; border:1px solid #999; margin-top:2px;"
                onchange="app.FDSLive.toggleWith('${type}','${esc(id)}', this.value, true)">
                <option value="">-- ajouter un passager --</option>${free.map(optFor).join('')}
            </select>` : `<span class="fdsw-empty">tout le monde est déjà passager</span>`;
            return chips + adder;
        };
        // Véhicule : déduit du mode de transport, jamais ressaisi.
        //  - « Amène (V. perso) »  -> la voiture de la fiche de la personne
        //  - « Amène (V. régie) »  -> le parc de production, filtré par permis
        //  - « Part avec »         -> le véhicule du conducteur choisi
        //  - autres modes          -> aucun véhicule
        // Une voiture perso reste toujours conduite par son propriétaire : la
        // prêter à un tiers pose un problème d'assurance qu'une feuille de
        // service n'a pas à encourager. Et vehicleUsage = 'private' signifie
        // que la personne ne met pas sa voiture à disposition de la production,
        // auquel cas elle n'apparaît nulle part.
        const ownVehicleOf = (person) => {
            if(!person || !person.hasVehicle) return null;
            if((person.vehicleUsage || '') === 'private') return null;
            const bits = [];
            if(person.vehicleType)  bits.push(person.vehicleType);
            if(person.vehiclePlate) bits.push(person.vehiclePlate);
            if(person.vehicleSeats) bits.push(person.vehicleSeats + ' pl.');
            if(person.vehicleTrunk) bits.push('coffre');
            return bits.length ? bits.join(' - ') : 'véhicule perso';
        };
        const vehicleCell = (type, id, pers) => {
            const mode = modeOf(type, id);
            const fiche = type === 'actor'
                ? `app.FDSLive.openFiche('actor','${esc(id)}')`
                : `app.FDSLive.openFiche('crew','${esc(id)}')`;
            if(mode === 'own-brings') {
                return FDSLive.roSrc(ownVehicleOf(pers), 'véhicule non renseigné sur la fiche', fiche);
            }
            if(mode === 'own-brings-regie') {
                const cur = (PlanningTransport.model.get(type, id) || {}).vehicleId || '';
                // Un vehicule ne peut pas etre conduit par deux personnes le
                // meme jour. On garde ceux qui sont deja pris dans la liste,
                // mais grises et avec le nom de leur conducteur : les masquer
                // laisserait croire que le parc est plus petit qu'il n'est.
                const prisPar = {};
                PlanningTransport.model.calls().forEach(cl => {
                    if(!cl || cl.transport !== 'own-brings-regie' || !cl.vehicleId) return;
                    if(cl.type === type && String(cl.personId) === String(id)) return;
                    const p = cl.type === 'actor' ? actorOf(cl.personId) : crewOf(cl.personId);
                    prisPar[cl.vehicleId] = (p && p.name) ? p.name : 'un autre conducteur';
                });
                const fleet = (state.data.vehicles || []).filter(v => (pers && (pers.licenses || []).includes(v.licenseRequired || 'vl')));
                let opts = `<option value=""${cur ? '' : ' selected'}>-- Véhicule régie --</option>`;
                fleet.forEach(v => {
                    const occupe = prisPar[v.id] && v.id !== cur;
                    const lab = `${v.name || 'véhicule'}${v.seats ? ' (' + v.seats + ' pl.)' : ''}${occupe ? ' — conduit par ' + prisPar[v.id] : ''}`;
                    opts += `<option value="${esc(v.id)}"${v.id === cur ? ' selected' : ''}${occupe ? ' disabled' : ''}>${esc(lab)}</option>`;
                });
                return `<select class="fdsw-in" onchange="app.FDSLive.setVehicle('${type}','${esc(id)}', this.value)">${opts}</select>`;
            }
            if(mode === 'with') {
                const driver = (FDSLive.withWhoOf(type, id) || [])[0] || '';
                if(!driver) return `<span class="fdsw-empty">conducteur non choisi</span>`;
                const cut = driver.indexOf('_');
                const dType = driver.slice(0, cut), dId = driver.slice(cut + 1);
                const dPers = dType === 'actor' ? actorOf(dId) : crewOf(dId);
                const dEntry = PlanningTransport.model.get(dType, dId) || {};
                if(dEntry.transport === 'own-brings-regie') {
                    const v = (state.data.vehicles || []).find(x => x.id === (dEntry.vehicleId || ''));
                    // Le vehicule du parc est une fiche comme une autre : places,
                    // permis requis et notes s'y trouvent, et le regisseur les lit
                    // depuis la feuille. Sans ce bouton il fallait aller les
                    // chercher dans l'onglet Equipe, donc quitter le jour.
                    return FDSLive.roSrc(v ? (v.name || 'véhicule régie') : '', 'véhicule régie non choisi',
                        v ? `app.FDSLive.openFiche('vehicle','${esc(v.id)}')` : '', 'Fiche véhicule');
                }
                return FDSLive.roSrc(ownVehicleOf(dPers), 'véhicule du conducteur non renseigné',
                    dType === 'actor' ? `app.FDSLive.openFiche('actor','${esc(dId)}')` : `app.FDSLive.openFiche('crew','${esc(dId)}')`);
            }
            return `<span class="fdsw-ro" style="color:#888">—</span>`;
        };
        h += `<div class="fdsw-bar">TRANSPORTS</div><table class="fdsw-grid">
            <tr><th style="width:18%">Nom</th><th style="width:18%">Moyen</th><th style="width:22%">Véhicule</th><th style="width:24%">Avec qui</th><th style="width:18%">Destination</th></tr>`;
        if(!calls.length) {
            h += `<tr><td colspan="5" style="text-align:center"><span class="fdsw-empty">Personne n'est convoqué sur ce jour.</span></td></tr>`;
        } else {
            // v598 : une ligne par PERSONNE — c'est un tableau de logistique, pas
            // de convocation. Les tableaux de convocation ci-dessus gardent, eux,
            // une ligne par poste.
            PersonIdentity.dedupe(calls, (p) => ({ type: p.type, id: p.id })).forEach(p => {
                const pers = p.type === 'actor' ? actorOf(p.id) : crewOf(p.id);
                if(!pers) return;
                h += `<tr><td>${esc(pers.name || '')}</td>
                    <td>${transportSel(p.type, p.id)}</td>
                    <td>${vehicleCell(p.type, p.id, pers)}</td>
                    <td>${withCell(p.type, p.id)}</td>
                    <td>${ro(g('edit-location'), 'lieu non renseigné', 'renseigner le lieu', "app.FDSLive.focusField('fdsw-realname')")}</td></tr>`;
            });
        }
        h += `</table>`;

        // --- Dépouillement en 13 blocs métier, ÉDITABLE (calcul partagé avec
        // le PDF). Ce qui vient des scènes est en lecture seule ; ce que
        // l'utilisateur ajoute à la main, sa note et le retrait d'une catégorie
        // passent par les fonctions Planning.bd*, qui vivaient dans le pane
        // Formulaire et sont rebranchées ici (v566).
        h += `<div class="fdsw-bar">DÉPOUILLEMENT</div>`;
        h += `<table class="fdsw-grid"><tr><th style="width:20%">Bloc</th><th style="width:16%">Responsable</th><th style="width:64%">Contenu</th></tr>`;
        PlanningFDS.breakdownSlots(day, allScenes, state.data.crew || []).forEach(slot => {
            const cats = slot.all || [];
            const resps = cats.map(x => x.resp).filter(Boolean)
                .join(', ').split(', ').filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
            let body;
            if(!cats.length) {
                body = `<span class="fdsw-empty">aucune catégorie de dépouillement de l'app ne correspond à ce bloc officiel</span>`;
            } else {
                body = cats.map(x => {
                    // Une categorie inconnue de CONFIG.bdCategories (venue d'un
                    // import ou d'un depouillement plus ancien) n'a pas d'index :
                    // les fonctions bd* travaillant par index, elle reste en
                    // lecture seule plutot que d'offrir des boutons sans effet.
                    const i = CONFIG.bdCategories.indexOf(x.cat);
                    // Chaque element rattache a une fiche ouvre cette fiche par
                    // dessus la feuille : le regisseur voit qui fournit
                    // l'accessoire sans quitter son jour de tournage.
                    const autoHtml = (x.autoDetail || []).map(d => {
                        const lk = (x.links || {})[d.txt];
                        if(!lk) return esc(d.label);
                        const k = lk.kind === 'character' ? 'char' : (lk.kind === 'location' ? 'loc' : lk.kind);
                        const tip = d.n > 1
                            ? `${d.n} fiches distinctes portent ce nom — ouvrir la première`
                            : 'Ouvrir la fiche';
                        return `<span role="button" title="${esc(tip)}" onclick="app.FDSLive.openFiche('${k}','${esc(String(lk.id))}')" style="cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;">${esc(d.label)}</span>`;
                    }).join('  -  ');
                    const auto = (x.autoDetail || []).length
                        ? autoHtml
                        : `<span class="fdsw-empty">rien dans les scènes du jour</span>`;
                    if(i < 0) {
                        return `<div style="margin-bottom:8px"><b>${esc(Utils.catLabel(x.cat))}</b><br>${auto}</div>`;
                    }
                    if(x.hidden) {
                        return `<div style="margin-bottom:8px; color:#888"><b>${esc(Utils.catLabel(x.cat))}</b> — retiré de la feuille
                            <button type="button" class="fdsw-btn" title="Faire réapparaître cette catégorie sur la feuille" onclick="app.Planning.bdShow(${i})">remettre</button></div>`;
                    }
                    const extra = x.extra.map((it, j) => `<span style="display:inline-block; margin:2px 4px 2px 0; padding:1px 6px; border:1px dashed var(--primary); border-radius:4px;">${esc(it)} <span role="button" title="Retirer cet ajout" onclick="app.Planning.bdRemoveExtra(${i}, ${j})" style="cursor:pointer; color:var(--danger); font-weight:bold;">×</span></span>`).join('');
                    return `<div style="margin-bottom:10px">
                        <b>${esc(Utils.catLabel(x.cat))}</b>
                        <button type="button" class="fdsw-btn" title="Ne pas faire figurer cette catégorie sur la feuille de service" onclick="app.Planning.bdHide(${i})">retirer de la feuille</button>
                        <br>${auto} ${extra}
                        <br><input class="fdsw-in" type="text" id="bd-extra-input-${i}" placeholder="+ ajouter un oubli, un imprévu…" data-tooltip="+ ajouter un oubli, un imprévu…" style="width:55%" onkeydown="if(event.key==='Enter'){event.preventDefault(); app.Planning.bdAddExtra(${i});}">
                        <button type="button" class="fdsw-btn" onclick="app.Planning.bdAddExtra(${i})">ajouter</button>
                        <br><input class="fdsw-in" type="text" style="width:80%" value="${esc(x.note)}" placeholder="note pour ce poste (ex : prévoir deux doubles)" data-tooltip="note pour ce poste (ex : prévoir deux doubles)" onchange="app.Planning.bdSetNote(${i}, this.value)">
                    </div>`;
                }).join('');
            }
            const respCell = cats.length
                ? (resps ? `<span class="fdsw-ro">${esc(resps)}</span>`
                         : `<span class="fdsw-empty">personne du département n'est convoqué</span>`)
                : `<span class="fdsw-ro" style="color:#888">—</span>`;
            h += `<tr><td><span class="fdsw-lab">${esc(slot.label)}</span>${slot.sub ? `<br><span style="font-size:0.62rem;color:#666">${esc(slot.sub)}</span>` : ''}</td><td>${respCell}</td><td>${body}</td></tr>`;
        });
        h += `</table>`;

        // --- Consignes individuelles (notes de convocation, éditables) ---
        // En mode « figuration sur cette feuille », les figurants ont deja leur
        // colonne Consigne dans le tableau FIGURATION : les reprendre ici
        // poserait DEUX champs de saisie sur la MEME donnee, dont l'un resterait
        // perime a l'ecran — exactement le defaut corrige sur edit-crewCall.
        const consigneCalls = FDSLive.figuSplit() ? calls
            : calls.filter(p => !(p.type === 'actor' && Figuration.isFigurant(p.id)));
        h += `<div class="fdsw-bar">CONSIGNES INDIVIDUELLES — À APPORTER / À PRÉPARER</div>`;
        h += `<table class="fdsw-grid"><tr><th style="width:34%">Qui</th><th style="width:66%">Consigne</th></tr>`;
        if(!consigneCalls.length) {
            h += `<tr><td colspan="2" style="text-align:center"><span class="fdsw-empty">Personne n'est convoqué sur ce jour.</span></td></tr>`;
        } else {
            consigneCalls.forEach(p => {
                const pers = p.type === 'actor' ? actorOf(p.id) : crewOf(p.id);
                if(!pers) return;
                let who = pers.name || '';
                if(p.type === 'actor') {
                    const ch = (state.data.characters || []).find(x => x.actor_id === pers.id);
                    if(ch && ch.name) who += ' (' + ch.name + ')';
                } else if(pers.role) { who += ' (' + pers.role + ')'; }
                h += `<tr><td>${esc(who)}</td><td>${c(`call-notes-${p.type}-${p.id}`, 'rien à apporter')}</td></tr>`;
            });
        }
        h += `</table>`;

        // --- Prévisions du lendemain ---
        // « Personnel supplémentaire » n'est plus ici : le modèle AFAR le place
        // dans le bandeau de tête, et deux champs de saisie sur la même donnée
        // laissaient l'un des deux périmé à l'écran (même bug que edit-crewCall).
        h += `<table class="fdsw-grid">
            <tr><td style="width:26%"><span class="fdsw-lab">Prévisions du lendemain</span></td><td>${c('edit-previsions', 'notes pour le jour suivant')}</td></tr>
        </table>`;

        h += `</div>`;
        host.innerHTML = h;
        FDSLive.mountMapWeather();
    },
    // --- Carte et météo -----------------------------------------------------
    _map: null,
    mountMapWeather: () => {
        const lat = parseFloat(FDSLive.get('edit-locationLat'));
        const lng = parseFloat(FDSLive.get('edit-locationLng'));
        const date = FDSLive.get('edit-startDate');
        FDSLive._mountMap(lat, lng);
        FDSLive._mountWeather(lat, lng, date);
    },
    _mountMap: (lat, lng) => {
        const box = document.getElementById('fdsw-map');
        if(!box) return;
        // Lien de secours : même tuiles bloquées, l'itinéraire reste accessible.
        const links = document.getElementById('fdsw-map-links');
        if(links) {
            if(isFinite(lat) && isFinite(lng)) {
                const q = encodeURIComponent(lat + ',' + lng);
                links.innerHTML = `<button type="button" class="fdsw-btn" onclick="window.open('https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}','_blank')">Ouvrir dans OpenStreetMap</button>
                    <button type="button" class="fdsw-btn" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${q}','_blank')">Ouvrir dans Google Maps</button>`;
            } else {
                links.innerHTML = '';
            }
        }
        // La feuille est rejouée souvent : sans destruction explicite, Leaflet
        // laisse derrière lui une instance accrochée à un noeud disparu.
        if(FDSLive._map) { try { FDSLive._map.remove(); } catch(e) {} FDSLive._map = null; }
        if(!isFinite(lat) || !isFinite(lng)) {
            box.innerHTML = `<span class="fdsw-empty">pas de coordonnées</span> <button type="button" class="fdsw-btn" onclick="app.FDSLive.focusAddress()">Renseigner l'adresse</button>`;
            box.classList.add('fdsw-map-empty');
            return;
        }
        box.classList.remove('fdsw-map-empty');
        box.innerHTML = `<span class="fdsw-empty">chargement de la carte...</span>`;
        LazyLib.load('leaflet').then(function fdsMapReady() {
            const cur = document.getElementById('fdsw-map');
            if(!cur || typeof L === 'undefined') return;
            cur.innerHTML = '';
            const map = L.map(cur, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
                .setView([lat, lng], 15);
            // URL canonique d'OpenStreetMap : les sous-domaines a/b/c sont
            // dépréciés et font partie des motifs de blocage. L'attribution est
            // exigée par la politique d'usage des tuiles, son absence en est un
            // autre. Reste que depuis un fichier ouvert en file://, le
            // navigateur n'envoie aucun Referer et OSM renvoie alors ses tuiles
            // « Access blocked » : c'est attendu en test local, pas en ligne.
            const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap'
            });
            let failed = 0;
            tiles.on('tileerror', () => {
                failed++;
                if(failed === 4) {
                    const warn = document.getElementById('fdsw-map-warn');
                    if(warn) warn.style.display = '';
                }
            });
            tiles.addTo(map);
            L.marker([lat, lng]).addTo(map);
            FDSLive._map = map;
            // Leaflet calcule la taille des tuiles au moment du setView. Dans une
            // cellule de tableau qui vient d'être insérée, cette taille est
            // encore fausse, d'où des tuiles géantes et décalées. Deux passes :
            // une au prochain rendu, une après la mise en page du tableau.
            requestAnimationFrame(() => { try { map.invalidateSize(); } catch(e) {} });
            setTimeout(() => { try { map.invalidateSize(); } catch(e) {} }, 300);
        }).catch(err => {
            console.error('FDSLive._mountMap', err);
            const cur = document.getElementById('fdsw-map');
            if(cur) cur.innerHTML = `<span class="fdsw-empty">carte indisponible</span>`;
        });
    },
    _mountWeather: (lat, lng, date) => {
        const box = document.getElementById('fdsw-weather');
        if(!box) return;
        if(!isFinite(lat) || !isFinite(lng) || !date) {
            box.innerHTML = `<span class="fdsw-empty">${date ? 'pas de coordonnées' : 'date non renseignée'}</span>`;
            return;
        }
        box.innerHTML = `<span class="fdsw-empty">chargement...</span>`;
        Weather.fetch(lat, lng, date).then(w => {
            const cur = document.getElementById('fdsw-weather');
            if(!cur) return;
            if(!w) {
                // Open-Meteo ne prévoit qu'une quinzaine de jours : au-delà, il
                // n'y a rien à afficher, ce qui est le cas courant d'un plan de
                // travail préparé des mois à l'avance.
                cur.innerHTML = `<span class="fdsw-empty">pas de prévision à cette échéance</span>`;
                return;
            }
            const bits = [
                `${FDSLive.esc(w.icon || '')} ${FDSLive.esc(w.description || '')}`,
                `${FDSLive.esc(String(w.tempMin))}° / ${FDSLive.esc(String(w.tempMax))}° (ressenti ${FDSLive.esc(String(w.feelsLike))}°)`,
                `Pluie ${FDSLive.esc(String(w.precipitationProb == null ? '?' : w.precipitationProb))} % — ${FDSLive.esc(String(w.precipitation == null ? '?' : w.precipitation))} mm`,
                `Vent ${FDSLive.esc(String(w.windSpeed))} km/h ${FDSLive.esc(w.windDirection || '')}`
            ];
            cur.innerHTML = `<span class="fdsw-ro">${bits.join('<br>')}</span>`;
        }).catch(err => {
            console.error('FDSLive._mountWeather', err);
            const cur = document.getElementById('fdsw-weather');
            if(cur) cur.innerHTML = `<span class="fdsw-empty">météo indisponible</span>`;
        });
    },
  };
