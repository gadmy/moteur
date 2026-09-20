
  const Figuration = {
    _dayId: null,
    // Ouvrir l'onglet suffit a creer day.figuration (via _fig / _fcs). Cette
    // remise a zero existe pour annuler un clic par megarde : elle ne touche
    // qu'a la figuration du jour, jamais au jour lui-meme.
    clearDay: () => {
        if(state.currentRole === 'viewer') return;
        const day = Figuration._currentDay();
        if(!day) return;
        const cs = Figuration._fcs(day);
        const groups = (day.figuration && day.figuration.groups) || [];
        if(cs.length || groups.length) {
            if(!confirm('Vider la feuille de figuration de ce jour ? Les figurants seront DECONVOQUES du jour, ici comme sur la feuille de service principale. Le jour de tournage, lui, n\'est pas touche.')) return;
        }
        // Source unique : vider la feuille figuration, c'est deconvoquer.
        day.callSheet = (day.callSheet || []).filter(cl => !(cl.type === 'actor' && Figuration.isFigurant(cl.personId)));
        day.figuration = { groups: [], callSheet: [] };
        Utils.toast('Feuille de figuration vidée.', 'success');
        Planning.switchFDSTab('live');
    },
    _fig: (day) => {
        if(!day.figuration) day.figuration = { groups: [] };
        if(!Array.isArray(day.figuration.groups)) day.figuration.groups = [];
        return day.figuration;
    },
    _currentDay: () => {
        return (typeof Planning !== 'undefined' && Planning.tempShootDay) ? Planning.tempShootDay : null;
    },

    _renderFiguPage: (doc, day, layout) => {
        const { margin, pageWidth, pageHeight } = layout;
        const usableWidth = pageWidth - margin * 2;
        // 31 aout : le groupe Figuration etait reconnu par une egalite STRICTE
        // sur son nom, a CINQ endroits (feuille de figuration ecran et PDF,
        // dossier de production, contrats). Lui coller une emoticone ou le
        // renommer « Figuration ronde » suffisait a le rendre invisible : la
        // feuille se vidait sans le moindre message. Test tolerant partout,
        // celui que Figuration.GROUP_IDS employait deja correctement.
        const figGroupIds = (state.data.groups || []).filter(g => g.type === 'actor' && /figuration/i.test(g.name || '')).map(g => g.id);
        const repertoire = (state.data.actors || []).filter(a => figGroupIds.includes(a.group_id));
        const cs = Figuration._fcs(day);
        const C = PdfTheme.COLORS;
        const clean = PdfTheme.cleanText;
        const dayStr = (day.startDate || day.date) ? new Date(day.startDate || day.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
        const dayHdr = [day.name, dayStr].filter(Boolean).join(' - ');
        let y = layout.startY || margin;
        y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                        title: 'Feuille de service - Figuration',
                                        right: dayHdr,
                                        accent: PdfTheme.accentFor('Figuration') });
        doc.setTextColor(...C.TEXT_BODY); doc.setFontSize(9.5);
        const info = [];
        // Mêmes lignes que la vue écran : ce qui est affiché est ce qui sort.
        const seqLine = (day.scenes || []).map(ref => {
            const si = (state.data.scenes || []).findIndex(x => x.id === ref.sceneId);
            if(si < 0) return '';
            const sc = state.data.scenes[si];
            return 'Sc.' + (si + 1) + (sc && sc.title ? ' ' + PlanningFDS.decor(sc) : '');
        }).filter(Boolean).join('  -  ');
        if(seqLine) info.push('Sequence(s) : ' + seqLine);
        if(day.rdvFiguration) info.push('Rdv figuration : ' + day.rdvFiguration);
        if(day.location) info.push('Lieu : ' + day.location + (day.locationAddress ? ' (' + day.locationAddress + ')' : ''));
        if(day.hmcPlace) info.push('HMC : ' + day.hmcPlace);
        if(day.locationNotes) info.push('Acces : ' + day.locationNotes);
        const horaire = [day.crewCall && ('Convoc. equipe ' + day.crewCall), day.estimatedWrap && ('fin ' + day.estimatedWrap)].filter(Boolean).join(' - ');
        if(horaire) info.push(horaire);
        const repas = [day.lunchStart, day.lunchEnd].filter(Boolean).join(' - ');
        if(repas) info.push('Repas : ' + repas);
        if(day.customWeather) info.push('Meteo : ' + day.customWeather);
        info.forEach(line => { const w = doc.splitTextToSize(clean(line), usableWidth); w.forEach(t => { y = FichesPDF._ensureSpace(doc, y, 5, pageHeight, margin); doc.text(t, margin, y); y += 4.6; }); });
        y += 3;
        const colName = margin, colTime = margin + usableWidth - 125, colTrans = margin + usableWidth - 100,
              colCost = margin + usableWidth - 62, colNote = margin + usableWidth - 30;
        y = FichesPDF._ensureSpace(doc, y, 10, pageHeight, margin);
        doc.setFillColor(...C.BG_LIGHT); doc.rect(margin, y - 4, usableWidth, 6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C.TEXT_PRIMARY);
        doc.text('FIGURANT', colName + 1, y); doc.text('Convoc.', colTime, y); doc.text('Transport', colTrans, y);
        doc.text('Costume', colCost, y); doc.text('Consigne', colNote, y);
        y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        cs.forEach((row, ri) => {
            y = FichesPDF._ensureSpace(doc, y, 7, pageHeight, margin);
            if(ri % 2 === 1) { doc.setFillColor(...C.BG_LIGHTER); doc.rect(margin, y - 4, usableWidth, 6, 'F'); }
            const f = repertoire.find(p => p.id === row.figurantId);
            const tr = row.transport || {};
            const transStr = tr.mode === 'Autre' ? (tr.note || 'Autre') : (tr.mode || '-');
            const callT = row.callTime || day.crewCall || '-';
            doc.setTextColor(...C.TEXT_PRIMARY);
            doc.text(clean(f ? (f.name || 'sans nom') : '(supprime)'), colName + 1, y);
            doc.setTextColor(...C.TEXT_SECONDARY);
            doc.text(clean(callT), colTime, y);
            doc.text(clean(transStr).slice(0, 14), colTrans, y);
            doc.text(clean(row.costume || '-').slice(0, 16), colCost, y);
            doc.text(clean(row.notes || '-').slice(0, 14), colNote, y);
            y += 6;
        });
        y += 3;
        doc.setTextColor(...C.TEXT_LIGHT); doc.setFontSize(8);
        doc.text(clean(cs.length + ' figurant(s) convoque(s)'), margin, y);
        return y + 4;
    },
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const day = (state.data.shootingDays || []).find(x => x.id === (opts.dayId || Figuration._dayId)) || Figuration._currentDay();
        if(!day) { Utils.toast('Aucun jour de tournage', 'warning'); return; }
        const cs = Figuration._fcs(day);
        if(!cs.length) { Utils.toast('Aucun figurant convoqué pour ce jour', 'warning'); return; }
        const doc = new jsPDF('p', 'mm', 'a4');
        const layout = { margin: 18, pageWidth: doc.internal.pageSize.getWidth(), pageHeight: doc.internal.pageSize.getHeight() };
        if(opts.includeCover !== false) {
            const dayStr = (day.startDate || day.date) ? new Date(day.startDate || day.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
            PdfTheme.coverPage(doc, { sectionName: 'Figuration', customSubtitle: [day.name, dayStr].filter(Boolean).join(' - ') });
            doc.addPage();
        }
        Figuration._renderFiguPage(doc, day, layout);
        FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob || !!opts.forDossier);
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Figuration - ' + Planning.dayShortLabel(day)));
    },

    _transportModes: ['', 'Par ses propres moyens', 'Défrayé par la prod', 'Transport assuré (gratuit)', 'Covoiturage', 'Autre'],

    // Feuille de service figuration, en vue papier. Même langage visuel que
    // FDSLive (classes .fdsw) pour que les deux onglets se ressemblent, et
    // surtout même contenu que la page imprimée par _renderFiguPage : ce qui
    // est à l'écran est ce qui sortira.
    // Les informations du jour restent en lecture seule ici — elles se
    // modifient sur la feuille de service normale, jamais en double.
    renderDays: () => {
        const c = document.getElementById('fds-pane-figu');
        if(!c) return;
        // Meme droit que la feuille principale (1er septembre) : le role global
        // laissait les champs actifs pour un editeur en lecture seule sur le
        // planning. Le verrou CSS du corps de fenetre les couvre desormais
        // aussi, mais le disabled reste utile — il se voit, la ou pointer-events
        // laisse croire que le champ marche jusqu'a ce qu'on clique.
        const ro = (typeof PlanningDayEdit !== 'undefined') ? !PlanningDayEdit.canWrite() : (state.currentRole === 'viewer');
        const day = (typeof Planning !== 'undefined') ? Planning.tempShootDay : null;
        if(!day) { c.innerHTML = '<div class="text-sec" style="padding:12px;">Aucun jour.</div>'; return; }
        const esc = Utils.escape;
        const cs = Figuration._fcs(day);
        const figGroupIds = (state.data.groups || []).filter(g => g.type === 'actor' && /figuration/i.test(g.name || '')).map(g => g.id);
        const repertoire = (state.data.actors || []).filter(a => figGroupIds.includes(a.group_id));
        const transportModes = Figuration._transportModes;
        const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
        const dStart = (day.startDate || day.date) || '', dEnd = day.endDate || dStart;
        const dateLine = dStart ? ((dEnd && dEnd !== dStart) ? fmt(dStart) + ' -> ' + fmt(dEnd) : fmt(dStart)) : '';
        const tp = state.data.titlePage || {};
        const filmTitle = tp.title || state.data.title || '';

        // Séquences du jour : case officielle AFAR jusqu'ici absente de la
        // feuille figuration alors que la donnée existe sur le jour.
        const seqList = (day.scenes || []).map(ref => {
            const idx = (state.data.scenes || []).findIndex(x => x.id === ref.sceneId);
            if(idx < 0) return '';
            const sc = state.data.scenes[idx];
            return 'Sc.' + (idx + 1) + (sc && sc.title ? ' ' + PlanningFDS.decor(sc) : '');
        }).filter(Boolean).join('  -  ');

        // Renvoi vers la feuille normale plutôt que saisie en double
        const srcBtn = `<button type="button" class="fdsw-btn" onclick="app.Planning.switchFDSTab('live')">Modifier sur la feuille de service</button>`;
        const roCell = (val, empty) => {
            const v = String(val == null ? '' : val).trim();
            return (v ? `<span class="fdsw-ro">${esc(v)}</span>` : `<span class="fdsw-empty">${esc(empty)}</span>`) + ' ' + srcBtn;
        };
        const infoRow = (lab, inner) => `<tr><td style="width:34%"><span class="fdsw-lab">${esc(lab)}</span></td><td>${inner}</td></tr>`;

        let h = `<div class="fdsw-legend">Feuille de service figuration : ce que tu vois ici est ce qui sera imprimé. Les informations du jour se modifient sur la feuille de service, jamais ici.</div>`;
        h += `<div class="fdsw">`;
        h += `<table class="fdsw-grid"><tr>
            <td style="width:18%"><span class="fdsw-lab">Titre</span></td>
            <td style="width:32%"><span class="fdsw-ro">${esc(filmTitle) || '<span class="fdsw-empty">titre du film</span>'}</span></td>
            <td style="width:18%"><span class="fdsw-lab">Jour</span></td>
            <td style="width:32%"><span class="fdsw-ro">${esc(day.name || '')}</span></td>
        </tr></table>`;
        h += `<div class="fdsw-bar">FEUILLE DE SERVICE - FIGURATION${dateLine ? ' DU ' + esc(dateLine).toUpperCase() : ''}</div>`;

        h += `<table class="fdsw-grid">`;
        h += infoRow('Séquence(s)', seqList ? `<span class="fdsw-ro">${esc(seqList)}</span> ${srcBtn}` : `<span class="fdsw-empty">aucune scène ajoutée au jour</span> ${srcBtn}`);
        h += infoRow('Lieu(x) de rdv figuration', roCell(day.rdvFiguration, 'non renseigné'));
        h += infoRow('Lieu de tournage', roCell(day.locationRealName || day.location, 'non renseigné'));
        h += infoRow('Adresse', roCell(day.locationAddress, 'non renseignée'));
        h += infoRow('HMC (lieu)', roCell(day.hmcPlace, 'non renseigné'));
        h += infoRow('Accès (code porte, interphone...)', roCell(day.locationNotes, 'non renseigné'));
        h += infoRow('Convocation équipe', roCell(day.crewCall, 'non renseignée'));
        h += infoRow('Fin estimée', roCell(day.estimatedWrap, 'non renseignée'));
        h += infoRow('Repas', roCell([day.lunchStart, day.lunchEnd].filter(Boolean).join(' - '), 'non renseigné'));
        h += infoRow('Consignes météo', roCell(day.customWeather, 'aucune consigne'));
        h += `</table>`;

        h += `<div class="fdsw-note"><span class="fdsw-lab">Note à l'équipe</span><br>${day.notes ? esc(day.notes) : `<span class="fdsw-empty">aucune note</span>`} ${srcBtn}</div>`;

        h += `<div class="fdsw-bar">CONVOCATION FIGURATION</div><table class="fdsw-grid">
            <tr><th style="width:6%">N°</th><th style="width:28%">Figurant·e</th><th style="width:12%">Convoc.</th><th style="width:26%">Transport</th><th style="width:24%">Note</th><th style="width:4%"></th></tr>`;
        if(!cs.length) {
            h += `<tr><td colspan="6" style="text-align:center"><span class="fdsw-empty">Aucun·e figurant·e convoqué·e : ajoute-en ci-dessous.</span></td></tr>`;
        } else {
            cs.forEach((row, i) => {
                const f = repertoire.find(p => p.id === row.figurantId);
                const tr = row.transport || {};
                const isOther = (tr.mode || '') === 'Autre';
                const nameCell = f
                    ? `<span class="fdsw-ro">${esc(f.name || 'sans nom')}</span> <button type="button" class="fdsw-btn" onclick="app.Figuration.openFigurant('${esc(row.figurantId)}')">Changer l'info source</button>`
                    : `<span class="fdsw-empty">comédien·ne supprimé·e</span>`;
                h += `<tr>
                    <td style="text-align:center">${i + 1}</td>
                    <td>${nameCell}</td>
                    <td><input class="fdsw-in" type="time" value="${esc(row.callTime || '')}" title="Vide = convocation équipe (${esc(day.crewCall || '—')})" onchange="app.Figuration.updateCallsheetField('${esc(row.figurantId)}', 'callTime', this.value)" ${ro ? 'disabled' : ''}></td>
                    <td><select class="fdsw-in" onchange="app.Figuration.updateCallsheetTransport('${esc(row.figurantId)}', 'mode', this.value)" ${ro ? 'disabled' : ''}>
                        ${transportModes.map(m => `<option value="${esc(m)}" ${(tr.mode || '') === m ? 'selected' : ''}>${m || '-- transport --'}</option>`).join('')}
                        </select>${isOther ? `<input class="fdsw-in" placeholder="préciser..." data-tooltip="préciser..." value="${esc(tr.note || '')}" onchange="app.Figuration.updateCallsheetTransport('${esc(row.figurantId)}', 'note', this.value)" ${ro ? 'disabled' : ''}>` : ''}</td>
                    <td><input class="fdsw-in" placeholder="rien à apporter" data-tooltip="rien à apporter" value="${esc(row.notes || '')}" onchange="app.Figuration.updateCallsheetField('${esc(row.figurantId)}', 'notes', this.value)" ${ro ? 'disabled' : ''}></td>
                    <td style="text-align:center">${ro ? '' : `<button type="button" class="fdsw-link" title="Déconvoquer" onclick="app.Figuration.removeFromCallsheet('${esc(row.figurantId)}')">✖</button>`}</td>
                </tr>`;
            });
        }
        if(!ro) {
            const already = cs.map(r => r.figurantId);
            const addable = repertoire.filter(f => !already.includes(f.id));
            h += `<tr><td colspan="6" style="background:#f4f4f4">
                <span class="fdsw-lab">Convoquer</span>
                <select class="fdsw-in" style="width:auto; border:1px solid #999;" onchange="app.Figuration.addToCallsheetFromPicker(this.value); this.value='';">
                    <option value="">-- ajouter --</option>
                    ${addable.map(f => `<option value="f:${esc(f.id)}">${esc(f.name || 'sans nom')}</option>`).join('')}
                </select>
                ${!repertoire.length ? `<span class="fdsw-empty">aucun comédien dans le groupe « Figuration »</span>` : ''}
            </td></tr>`;
        }
        h += `</table>`;
        h += `<div style="font-size:0.7rem; color:#555; margin-top:4px;">${cs.length} figurant·e(s) convoqué·e(s)</div>`;
        h += `</div>`;
        c.innerHTML = h;
    },
    // Ouvre la fiche du comédien qui porte la figuration
    openFigurant: (id) => {
        if(typeof FDSLive !== 'undefined' && FDSLive.openFiche) FDSLive.openFiche('actor', id);
    },
    // --- SOURCE UNIQUE DE LA CONVOCATION FIGURATION (v567) ---
    // Avant : day.figuration.callSheet portait SA PROPRE liste de presents, sans
    // rapport avec la convocation du jour. Un figurant pouvait donc etre sur la
    // feuille principale et pas sur la feuille figuration, ou l'inverse, sans
    // qu'aucun ecran ne le signale.
    // Desormais QUI est convoque se lit dans day.callSheet, comme pour tout le
    // monde ; day.figuration.callSheet ne porte plus que les COMPLEMENTS propres
    // a la figuration (transport, costume, consignes), indexes par personne.
    figGroupIds: () => (state.data.groups || [])
        .filter(g => g.type === 'actor' && /figuration/i.test(g.name || '')).map(g => g.id),
    isFigurant: (personId) => {
        const ids = Figuration.figGroupIds();
        const a = (state.data.actors || []).find(x => String(x.id) === String(personId));
        return !!(a && ids.includes(a.group_id));
    },
    // Convocations figuration du jour, dans l'ordre de la convocation generale.
    // LECTURE PURE : ne cree rien, pour pouvoir servir un jour deja sauvegarde
    // (PDF, previsions du lendemain) sans le modifier au passage.
    _fcs: (day) => {
        if(!day) return [];
        const comp = (day.figuration && Array.isArray(day.figuration.callSheet)) ? day.figuration.callSheet : [];
        return (day.callSheet || [])
            .filter(cl => cl && cl.type === 'actor' && Figuration.isFigurant(cl.personId))
            .map(cl => {
                const row = comp.find(r => String(r.figurantId) === String(cl.personId))
                    || { figurantId: cl.personId, transport: { mode: '', note: '' }, notes: '', costume: '' };
                // L'heure et la consigne appartiennent a la convocation
                // generale : echo, jamais stockees ici. Sans cela la consigne
                // d'un figurant existerait en double — une fois dans le tableau
                // CONSIGNES INDIVIDUELLES, une fois dans la feuille figuration.
                row.callTime = cl.callTime || '';
                row.notes = cl.notes || '';
                return row;
            });
    },
    // Ligne de complements d'une personne, creee a la demande (ECRITURE).
    _row: (day, fid) => {
        const f = Figuration._fig(day);
        if(!Array.isArray(f.callSheet)) f.callSheet = [];
        let row = f.callSheet.find(r => String(r.figurantId) === String(fid));
        if(!row) { row = { figurantId: fid, transport: { mode: '', note: '' }, notes: '', costume: '' }; f.callSheet.push(row); }
        return row;
    },
    addToCallsheetFromPicker: (value) => {
        if(!value) return;
        if(value.slice(0, 2) === 'f:') Figuration.addToCallsheet(value.slice(2));
    },
    addToCallsheet: (fid) => {
        if(typeof PlanningDayEdit !== 'undefined' && !PlanningDayEdit.canWrite()) return;
        const day = (typeof Planning !== 'undefined') ? Planning.tempShootDay : null;
        if(!day || !fid) return;
        // Convoquer sur la feuille figuration, c'est convoquer tout court :
        // la personne apparait aussi sur la feuille principale.
        PlanningTransport.model.ensure('actor', fid);
        Figuration._row(day, fid);
        Figuration.renderDays();
    },
    removeFromCallsheet: (fid) => {
        if(typeof PlanningDayEdit !== 'undefined' && !PlanningDayEdit.canWrite()) return;
        const day = (typeof Planning !== 'undefined') ? Planning.tempShootDay : null;
        if(!day) return;
        // Deconvoque pour de bon. Les complements figuration sont conserves :
        // reconvoquer la personne le meme jour retrouve son costume et sa note.
        day.callSheet = (day.callSheet || []).filter(cl => !(cl.type === 'actor' && String(cl.personId) === String(fid)));
        Figuration.renderDays();
    },
    // Meme elargissement que la feuille principale (1er septembre) : le test
    // portait sur le role GLOBAL et laissait ecrire un editeur qui n'a que la
    // lecture sur le planning. La feuille figuration EST une feuille de
    // service : elle depend du meme droit.
    updateCallsheetField: (fid, field, value) => {
        if(typeof PlanningDayEdit !== 'undefined' && !PlanningDayEdit.canWrite()) return;
        const day = (typeof Planning !== 'undefined') ? Planning.tempShootDay : null;
        if(!day) return;
        // L'heure et la consigne vivent dans la convocation generale, pas dans
        // les complements : une seule donnee, un seul endroit.
        if(field === 'callTime' || field === 'notes') {
            PlanningTransport.model.ensure('actor', fid)[field] = value;
            return;
        }
        Figuration._row(day, fid)[field] = value;
    },
    updateCallsheetTransport: (fid, field, value) => {
        if(typeof PlanningDayEdit !== 'undefined' && !PlanningDayEdit.canWrite()) return;
        const day = (typeof Planning !== 'undefined') ? Planning.tempShootDay : null;
        if(!day) return;
        const row = Figuration._row(day, fid);
        if(!row.transport) row.transport = { mode: '', note: '' };
        row.transport[field] = value;
        if(field === 'mode') Figuration.renderDays();
    },
  };
