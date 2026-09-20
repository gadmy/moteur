
  const PlanningExport = {
    // ============================================================
    // ===== EXPORT PDF PLANNING (jsPDF natif) =====
    // ============================================================
    // Génère 1 PDF contenant N jours de tournage, 1 jour = ~1 page avec
    // toutes les infos utiles : date, lieu, horaires, programme scènes,
    // convocations groupées (comédiens par groupe + techniciens par dept),
    // dépouillement, notes, météo perso.
    
    openExportModal: () => {
        const days = state.data.shootingDays || [];
        if(days.length === 0) {
            Utils.toast('Aucun jour de tournage à exporter', 'warning');
            return;
        }
        Actions.openExportModal('planning');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'planning');
        });
    },
    
    exportPlanningPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 18;
        const usableWidth = pageWidth - margin * 2;
        
        const allDays = state.data.shootingDays || [];
        const days = (opts.dayIds && opts.dayIds.length > 0)
            ? allDays.filter(d => opts.dayIds.includes(d.id))
            : allDays;
        
        if(days.length === 0) {
            Utils.toast('Aucun jour à exporter', 'warning');
            return;
        }
        
        days.sort((a, b) => {
            const da = new Date(a.startDate || a.date || 0);
            const db = new Date(b.startDate || b.date || 0);
            return da - db;
        });
        
        Utils.toast('Génération du PDF planning...', 'info');        
        if(opts.includeCover !== false && typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) {
            FichesPDF._drawCoverPage(doc, 'Planning');
            doc.addPage();
        }
        
        const allScenes = state.data.scenes || [];
        const allActors = state.data.actors || [];
        const allCrew = state.data.crew || [];
        const allCharacters = state.data.characters || [];
const actorGroups = (state.data.groups || []).filter(g => g.type === 'actor');
        const crewGroupsAll = (state.data.groups || []).filter(g => g.type === 'crew');
        const isSeries = state.currentProjectType === 'series';
        
        const transportLabel = (call) => {
            const t = call.transport;
            const lookupNames = () => (call.withWho || []).map(id => {
                const sep = id.indexOf('_');
                if(sep < 0) return '';
                const type = id.substring(0, sep);
                const personId = id.substring(sep + 1);
                const p = type === 'actor' ? allActors.find(a => a.id === personId) : allCrew.find(c => c.id === personId);
                return p ? p.name : '';
            }).filter(Boolean).join(', ');
            if(t === 'own')         return 'Véhicule perso';
            if(t === 'own-brings')  { const n = lookupNames(); return 'Véhic. perso + ' + (n || 'pers.'); }
            if(t === 'own-brings-regie') { const n = lookupNames(); const v = (state.data.vehicles || []).find(x => x.id === call.vehicleId); return 'Véhic. régie' + (v ? ' (' + v.name + ')' : '') + (n ? ' + ' + n : ''); }
            if(t === 'with')        { const n = lookupNames(); return 'Avec ' + (n || '—'); }
            if(t === 'taxi')        return 'Taxi';
            if(t === 'public')      return 'Transp. en commun';
            return '—';
        };
        
        const pdfSafe = (s) => Utils.stripPdfUnsafe(String(s == null ? '' : s).replace(/[—–]/g, '-').replace(/…/g, '...'));
        let y = margin;
        let zebraRow = 0; // Compteur pour le zébrage des lignes de tableaux
        const ensureSpace = (space) => {
            if(y + space > pageHeight - margin - 8) {
                doc.addPage();
                y = margin;
            }
        };
        
        const drawSectionHeader = (title) => {
            ensureSpace(7 + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BLACK);
            doc.setLineWidth(0.3);
            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
            doc.rect(margin, y, usableWidth, 5.5, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(title.toUpperCase(), pageWidth / 2, y + 3.8, { align: 'center' });
            y += 5.5 + 1.5;
            zebraRow = 0;
        };
        
        const drawTableRow = (cols, cells, opts = {}) => {
            const rowH = opts.height || 4.4;
            ensureSpace(rowH);
            if(opts.fillRow) {
                doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
                doc.rect(margin, y, usableWidth, rowH, 'F');
                zebraRow = 0;
            } else if(opts.divider) {
                // Zébrage léger une ligne sur deux (lisibilité)
                if(zebraRow % 2 === 1) {
                    doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
                    doc.rect(margin, y, usableWidth, rowH, 'F');
                }
                zebraRow++;
            }
            doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
            doc.setFontSize(opts.fontSize || 8.5);
            doc.setTextColor(opts.color || 30, opts.color || 30, opts.color || 30);
            cells.forEach((cell, i) => {
                const col = cols[i];
                let txt = pdfSafe(cell);
                while(doc.getTextWidth(txt) > col.w - 2 && txt.length > 3) {
                    txt = txt.substring(0, txt.length - 2) + '…';
                }
                const tx = col.align === 'right' ? col.x + col.w - 1 : col.x + 1;
                doc.text(txt, tx, y + rowH - 1.4, { align: col.align || 'left' });
            });
            // Grille complète format AFAR : bordures verticales entre colonnes + ligne de bas
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.setLineWidth(0.15);
            cols.forEach((col, i) => { if(i > 0) doc.line(col.x, y, col.x, y + rowH); });
            doc.line(margin, y, margin, y + rowH);
            doc.line(margin + usableWidth, y, margin + usableWidth, y + rowH);
            doc.line(margin, y + rowH, margin + usableWidth, y + rowH);
                y += rowH;
        };
        
        // ===================== HELPERS FORMAT AFAR =====================
        // Barre de libellé pleine largeur (fond gris ou noir, texte gras)
        const afarLabelBar = (text, opts = {}) => {
            const h = opts.height || 5;
            ensureSpace(h);
            doc.setDrawColor(...PdfTheme.COLORS.BLACK);
            doc.setLineWidth(0.2);
            doc.setFillColor(...(opts.dark ? PdfTheme.COLORS.BLACK : PdfTheme.COLORS.BG_LIGHT));
            doc.rect(margin, y, usableWidth, h, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(opts.fontSize || 8.5);
            doc.setTextColor(...(opts.dark ? PdfTheme.COLORS.WHITE : PdfTheme.COLORS.TEXT_DARK));
            if(opts.center) doc.text(pdfSafe(text), pageWidth / 2, y + h - 1.6, { align: 'center' });
            else doc.text(pdfSafe(text), margin + 2, y + h - 1.6);
            y += h;
        };
        
        // Ligne « libellé : valeur » (colonne de gauche grise, valeur multi-lignes)
        const afarKVRow = (label, value, opts = {}) => {
            const lw = opts.labelW || usableWidth * 0.32;
            const vw = usableWidth - lw;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            const val = (value == null || value === '') ? '' : String(value);
            const lines = val ? doc.splitTextToSize(pdfSafe(val), vw - 3) : [''];
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.6);
            const labLines = doc.splitTextToSize(pdfSafe(label), lw - 3);
            const h = Math.max(opts.minHeight || 5, lines.length * 3.6 + 1.6, labLines.length * 3.3 + 1.8);
            ensureSpace(h);
            doc.setDrawColor(...PdfTheme.COLORS.BLACK);
            doc.setLineWidth(0.2);
            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
            doc.rect(margin, y, lw, h, 'FD');
            doc.rect(margin + lw, y, vw, h);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.6);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            labLines.forEach((l, i) => doc.text(l, margin + 2, y + 3.4 + i * 3.3));
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            lines.forEach((l, i) => doc.text(l, margin + lw + 2, y + 3.5 + i * 3.6));
            y += h;
        };
        
        // Ligne de tableau AFAR : grille noire complète, hauteur automatique
        const afarRow = (cols, cells, opts = {}) => {
            const fs = opts.fontSize || 7.6;
            doc.setFont('helvetica', (opts.bold || opts.header) ? 'bold' : 'normal');
            doc.setFontSize(fs);
            const wrapped = cells.map((cell, i) => {
                const txt = pdfSafe(cell == null ? '' : String(cell));
                if(!txt) return [''];
                return opts.noWrap ? [txt] : doc.splitTextToSize(txt, Math.max(4, cols[i].w - 2));
            });
            const maxL = wrapped.reduce((m, w) => Math.max(m, w.length), 1);
            const h = Math.max(opts.height || 4.4, maxL * 3.3 + 1.4);
            ensureSpace(h);
            if(opts.header || opts.fill) {
                doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
                doc.rect(margin, y, usableWidth, h, 'F');
            }
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const boldCols = opts.boldCols || null;
            wrapped.forEach((lines, i) => {
                const col = cols[i];
                if(boldCols) {
                    doc.setFont('helvetica', boldCols.includes(i) ? 'bold' : 'normal');
                    doc.setFontSize(fs);
                }
                const tx = col.align === 'center' ? col.x + col.w / 2 : (col.align === 'right' ? col.x + col.w - 1 : col.x + 1);
                lines.forEach((l, j) => doc.text(l, tx, y + 3.2 + j * 3.3, col.align ? { align: col.align } : undefined));
            });
            doc.setDrawColor(...PdfTheme.COLORS.BLACK);
            doc.setLineWidth(0.15);
            cols.forEach((col, i) => { if(i > 0) doc.line(col.x, y, col.x, y + h); });
            doc.line(margin, y, margin, y + h);
            doc.line(margin + usableWidth, y, margin + usableWidth, y + h);
            doc.line(margin, y, margin + usableWidth, y);
            doc.line(margin, y + h, margin + usableWidth, y + h);
            y += h;
        };
        
        // Bandeau d'équipe : bande de tête de la page 1 du modèle AFAR. Neuf
        // cases par corps de métier, dont quatre subdivisées par le modèle
        // lui-même — d'où un helper dédié plutôt qu'afarRow, qui ne sait pas
        // mettre en gras une partie seulement d'une cellule. Le calcul des
        // noms est partagé avec l'écran (PlanningFDS.teamBanner).
        const afarTeamBanner = (banner) => {
            const n = banner.cols.length;
            const cw = usableWidth / n;
            const cols = banner.cols.map((c, i) => ({ x: margin + i * cw, w: cw, align: 'center' }));
            // Les lignes sont composées AVANT le moindre tracé : sans cela, un
            // saut de page pourrait tomber entre l'en-tête et le corps et
            // couper la grille en deux.
            const blocks = banner.cols.map(col => {
                const out = [];
                col.parts.forEach(p => {
                    if(!p.names.length) return;
                    if(p.sub) out.push({ b: true, t: pdfSafe(p.sub) });
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(6);
                    doc.splitTextToSize(pdfSafe(p.names.join(', ')), cw - 2)
                        .forEach(l => out.push({ b: false, t: l }));
                });
                if(!out.length) out.push({ b: false, t: '-' });
                return out;
            });
            const maxL = blocks.reduce((m, b) => Math.max(m, b.length), 1);
            const h = Math.max(6, maxL * 2.8 + 1.6);
            ensureSpace(4.6 + h + 9.6);
            afarRow(cols, banner.cols.map(c => c.label), { header: true, height: 4.6, fontSize: 5.6, noWrap: true });
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            blocks.forEach((b, i) => {
                b.forEach((ln, j) => {
                    doc.setFont('helvetica', ln.b ? 'bold' : 'normal');
                    doc.setFontSize(ln.b ? 5.6 : 6);
                    doc.text(ln.t, cols[i].x + 1, y + 3 + j * 2.8);
                });
            });
            doc.setDrawColor(...PdfTheme.COLORS.BLACK);
            doc.setLineWidth(0.15);
            cols.forEach((c, i) => { if(i > 0) doc.line(c.x, y, c.x, y + h); });
            doc.line(margin, y, margin, y + h);
            doc.line(margin + usableWidth, y, margin + usableWidth, y + h);
            doc.line(margin, y, margin + usableWidth, y);
            doc.line(margin, y + h, margin + usableWidth, y + h);
            y += h;
            const bw = usableWidth * 0.16;
            const wide = [{ x: margin, w: bw }, { x: margin + bw, w: usableWidth - bw }];
            afarRow(wide, ['Personnel sup :', banner.extraStaff], { height: 4.6, fontSize: 7, boldCols: [0] });
            afarRow(wide, ['COMÉDIENS :', banner.actors.join(', ')], { height: 4.6, fontSize: 7, bold: true });
        };
        
        // Identité du film + contacts de production (2e bande de tête AFAR).
        // logoData est un dataURL issu de FichesPDF._preloadImages ; ses
        // dimensions sont relues par jsPDF. Si l'image manque ou échoue, la
        // case reste vide : un logo ne doit pas faire tomber tout l'export.
        const afarFilmIdentity = (idt, logoData) => {
            const cw = [usableWidth * 0.22, usableWidth * 0.44, usableWidth * 0.34];
            const cx = [margin, margin + cw[0], margin + cw[0] + cw[1]];
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            const prodLines = [idt.prodName, idt.prodAddress, idt.prodPhone].filter(Boolean)
                .reduce((acc, t) => acc.concat(doc.splitTextToSize(pdfSafe(t), cw[2] - 3)), []);
            const h = Math.max(16, prodLines.length * 3.4 + 4);
            ensureSpace(h);
            if(logoData) {
                try {
                    const props = doc.getImageProperties(logoData);
                    const maxW = cw[0] - 6, maxH = h - 4;
                    const rw = props.width || 1, rh = props.height || 1;
                    const sc = Math.min(maxW / rw, maxH / rh);
                    doc.addImage(logoData, 'JPEG', cx[0] + (cw[0] - rw * sc) / 2, y + (h - rh * sc) / 2, rw * sc, rh * sc);
                } catch(e) { console.warn('Logo production non dessiné :', e); }
            }
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text(pdfSafe(idt.title ? '"' + idt.title + '"' : ''), cx[1] + cw[1] / 2, y + h / 2 - 1, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(pdfSafe(idt.author ? 'Un film de ' + idt.author : ''), cx[1] + cw[1] / 2, y + h / 2 + 4, { align: 'center' });
            doc.setFontSize(7.5);
            prodLines.forEach((l, i) => doc.text(l, cx[2] + 2, y + 4.5 + i * 3.4));
            doc.setDrawColor(...PdfTheme.COLORS.BLACK);
            doc.setLineWidth(0.15);
            doc.rect(margin, y, usableWidth, h);
            doc.line(cx[1], y, cx[1], y + h);
            doc.line(cx[2], y, cx[2], y + h);
            y += h;
            const ccw = [usableWidth * 0.44, usableWidth * 0.33, usableWidth * 0.23];
            const ccols = [
                { x: margin, w: ccw[0] },
                { x: margin + ccw[0], w: ccw[1] },
                { x: margin + ccw[0] + ccw[1], w: ccw[2] }
            ];
            idt.contacts.forEach(ct => {
                afarRow(ccols, [ct.label, ct.name, ct.phone], { height: 4.4, fontSize: 7, boldCols: [0] });
            });
        };
        
        // Bloc « LIBELLÉ : » + zone de contenu (page 2 du modèle AFAR)
        const afarSlotBox = (label, value, sub) => {
            const h1 = 4.6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.6);
            const val = (value == null || value === '') ? '' : String(value);
            const lines = val ? doc.splitTextToSize(pdfSafe(val), usableWidth - 4) : [''];
            const h2 = Math.max(4.6, lines.length * 3.3 + 1.4);
            ensureSpace(h1 + h2);
            doc.setDrawColor(...PdfTheme.COLORS.BLACK);
            doc.setLineWidth(0.2);
            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
            doc.rect(margin, y, usableWidth, h1, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(pdfSafe(label) + ' :', margin + 2, y + h1 - 1.4);
            if(sub) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.2);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text(pdfSafe(sub), margin + usableWidth - 2, y + h1 - 1.4, { align: 'right' });
            }
            y += h1;
            doc.rect(margin, y, usableWidth, h2);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.6);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            lines.forEach((l, i) => doc.text(l, margin + 2, y + 3.2 + i * 3.3));
            y += h2;
        };
        
        // Effet / décor / pré-minutage : parseurs partagés avec l'éditeur WYSIWYG
        // (PlanningFDS), pour que l'écran et l'impression déduisent la même chose.
        const afarEffet = (title) => PlanningFDS.effet(title);
        const afarDecor = (sc) => PlanningFDS.decor(sc);
        const afarMin = (min) => PlanningFDS.min(min);
        
        const sceneLabel = (s) => {
            if(isSeries && s.episodeId) {
                const ep = (state.data.episodes || []).find(e => e.id === s.episodeId);
                if(ep) {
                    const scenesInEp = allScenes.filter(x => x.episodeId === ep.id);
                    return UI.formatSceneNumber(s, scenesInEp.indexOf(s));
                }
            }
            return '#' + (allScenes.indexOf(s) + 1);
        };
        
        // ========= EN-TÊTE EN BANDEAU GRIS (cohérent avec les autres sections) =========
        ensureSpace(16);
        y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                        title: 'Planning de tournage',
                                        accent: PdfTheme.accentFor('Planning') });
        // Sous-titre discret avec le nombre de jours
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9.5);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
        doc.text(`${days.length} jour${days.length > 1 ? 's' : ''} de tournage`, margin, y + 4);
        y += 10;
        
        drawSectionHeader('Sommaire');
        const sumCols = [
            { x: margin,       w: 8 },
            { x: margin + 9,   w: 35 },
            { x: margin + 45,  w: 38 },
            { x: margin + 84,  w: 50 },
            { x: margin + 135, w: usableWidth - 135 - 2, align: 'right' }
        ];
        drawTableRow(sumCols, ['#', 'Date', 'Nom', 'Lieu', 'Scènes'], { bold: true, fontSize: 8.5, fillRow: true });
        days.forEach((d, i) => {
            const startDate = d.startDate || d.date;
            const dObj = startDate ? new Date(startDate) : null;
            const dateStr = dObj && !isNaN(dObj)
                ? dObj.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
                : '—';
            const dayName = Planning.dayLabel(d);
            const loc = d.location || d.locationRealName || '—';
            const sc = (d.scenes || []).length;
            drawTableRow(sumCols, [String(i + 1), dateStr, dayName, loc, `${sc} sc.`], { fontSize: 8.5, divider: true });
        });
        y += 4;
        
        // ========= UNE PAGE PAR JOUR =========
        // Identité du film et logo : constants d'un jour à l'autre, donc lus et
        // préchargés une seule fois. Le logo passe par le préchargement partagé
        // des fiches (dataURL), l'export PDF étant lui-même synchrone.
        const filmIdentity = PlanningFDS.filmIdentity(allCrew);
        let prodLogoData = null;
        if(filmIdentity.logo && typeof FichesPDF !== 'undefined' && FichesPDF._preloadImages) {
            try {
                const map = await FichesPDF._preloadImages([filmIdentity.logo]);
                prodLogoData = map[filmIdentity.logo] || null;
            } catch(e) { console.warn('Préchargement du logo de production échoué :', e); }
        }
        days.forEach((shootDay, dayIdx) => {
            doc.addPage();
            y = margin;
            
            const startDate = shootDay.startDate || shootDay.date;
            const dateObj = startDate ? new Date(startDate) : null;
            const dateStr = dateObj && !isNaN(dateObj)
                ? dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : '(date non définie)';
            const dayName = Planning.dayLabel(shootDay);
            
            // ===== BANDEAU D'ÉQUIPE (bande de tête du modèle AFAR) =====
            afarTeamBanner(PlanningFDS.teamBanner(shootDay, allCrew, allActors));
            y += 1.5;
            
            // ===== IDENTITÉ DU FILM ET CONTACTS DE PRODUCTION =====
            afarFilmIdentity(filmIdentity, prodLogoData);
            y += 1.5;
            
            // ===== EN-TÊTE AFAR : bloc jour / météo / soleil / horaires / repas =====
            const hdCols2 = [
                { x: margin,                        w: usableWidth * 0.52 },
                { x: margin + usableWidth * 0.52,   w: usableWidth * 0.26 },
                { x: margin + usableWidth * 0.78,   w: usableWidth * 0.22 }
            ];
            const hdCols4 = [
                { x: margin,                        w: usableWidth * 0.26 },
                { x: margin + usableWidth * 0.26,   w: usableWidth * 0.26 },
                { x: margin + usableWidth * 0.52,   w: usableWidth * 0.26 },
                { x: margin + usableWidth * 0.78,   w: usableWidth * 0.22 }
            ];
            // Ligne soleil : mêmes bornes extérieures que hdCols4 (0.26 / 0.52 /
            // 0.78) pour que la grille reste alignée, chaque libellé cédant
            // 0.10 à sa valeur.
            const hdCols6 = [
                { x: margin,                        w: usableWidth * 0.16 },
                { x: margin + usableWidth * 0.16,   w: usableWidth * 0.10 },
                { x: margin + usableWidth * 0.26,   w: usableWidth * 0.16 },
                { x: margin + usableWidth * 0.42,   w: usableWidth * 0.10 },
                { x: margin + usableWidth * 0.52,   w: usableWidth * 0.26 },
                { x: margin + usableWidth * 0.78,   w: usableWidth * 0.22 }
            ];
            const mealStr = (shootDay.lunchStart || shootDay.lunchEnd)
                ? `${shootDay.lunchStart || '--:--'} - ${shootDay.lunchEnd || '--:--'}` : '';
            const sunDay = PlanningFDS.sun(shootDay.locationLat, shootDay.locationLng, startDate);
            afarRow(hdCols2, [
                // 31 aout : « JOUR 1 / 1 » sur une feuille exportee seule etait
                // faux et inquietant. Le rang vient du planning, pas de la
                // selection imprimee.
                (shootDay.dayNumber
                    ? `JOUR ${shootDay.dayNumber} / ${allDays.filter(d => d && (d.dayType || 'tournage') === 'tournage').length}`
                    : Planning.dayShortLabel(shootDay)),
                'Horaires de tournage :',
                `${shootDay.crewCall || '--:--'} - ${shootDay.estimatedWrap || '--:--'}`
            ], { height: 6.5, fontSize: 9, boldCols: [0, 1] });
            afarRow(hdCols2, [
                'Météo : ' + (shootDay.customWeather ? String(shootDay.customWeather).replace(/\s*\n\s*/g, ' ') : ''),
                'H. Supp éventuelles :',
                ''
            ], { height: 5.5, fontSize: 8, boldCols: [1] });
            afarRow(hdCols6, [
                'Lever soleil :', sunDay.sunrise, 'Coucher soleil :', sunDay.sunset, 'Repas', mealStr
            ], { height: 5.5, fontSize: 8, boldCols: [0, 2, 4] });
            afarRow(hdCols4, [
                'Convocation équipe :', shootDay.crewCall || '--:--',
                'Prêt à tourner :', shootDay.readyToShoot || '--:--'
            ], { height: 5.5, fontSize: 8, boldCols: [0, 2] });
            
            // Bandeau noir centré
            ensureSpace(8);
            doc.setFillColor(...PdfTheme.COLORS.BLACK);
            doc.rect(margin, y, usableWidth, 7.5, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            // 31 aout : le bandeau porte le rang du jour, comme a l'ecran.
            // « J4 » pour un jour de tournage, la nature de la journee sinon.
            const tag = (typeof Planning !== 'undefined' && Planning.dayShortLabel)
                ? Planning.dayShortLabel(shootDay) : '';
            const tete = 'FEUILLE DE SERVICE'
                + (tag && (shootDay.dayType || 'tournage') === 'tournage' ? ' - ' + tag : '')
                + ((shootDay.dayType || 'tournage') !== 'tournage' && tag ? ' - ' + tag.toUpperCase() : '');
            doc.text(pdfSafe(`${tete} DU ${dateStr.toUpperCase()}`), pageWidth / 2, y + 5.2, { align: 'center' });
            y += 7.5 + 1.5;
            
            // NOTE À L'ÉQUIPE
            afarSlotBox("NOTE À L'ÉQUIPE", shootDay.notes || '', dayName + (shootDay.validated ? '   ·   VALIDÉ' : ''));
            y += 1.5;
            
            // ===== BLOC D'INFORMATIONS AFAR (décors, lieux, HMC, régie) =====
            const dayScenesRaw = shootDay.scenes || [];
            const subDecors = [];
            dayScenesRaw.forEach(ref => {
                const sc = allScenes.find(s => s.id === ref.sceneId);
                if(!sc) return;
                const d = afarDecor(sc);
                if(d && !subDecors.includes(d)) subDecors.push(d);
            });
            const mainDecor = shootDay.location || '';
            const decorLine = mainDecor
                ? mainDecor + (subDecors.length ? ' : ' + subDecors.join(' - ') : '')
                : subDecors.join(' - ');
            
            const rdvBits = [];
            if(shootDay.locationRealName) rdvBits.push(shootDay.locationRealName);
            if(shootDay.locationAddress)  rdvBits.push(shootDay.locationAddress);
            if(shootDay.contactName)      rdvBits.push('Contact : ' + shootDay.contactName);
            if(shootDay.contactPhone)     rdvBits.push('Tél : ' + shootDay.contactPhone);
            if(shootDay.locationLat && shootDay.locationLng) rdvBits.push(`GPS : ${shootDay.locationLat}, ${shootDay.locationLng}`);
            
            const infoLabelW = usableWidth * 0.32;
            afarKVRow('DÉCOR(S) :', decorLine, { labelW: infoLabelW });
            afarKVRow('LIEU(X) DE RDV & DE TOURNAGE :', rdvBits.join('  -  '), { labelW: infoLabelW });
            afarKVRow('ACCÈS (CODE PORTE, INTERPHONE) :', (shootDay.locationNotes && String(shootDay.locationNotes).trim()) || '', { labelW: infoLabelW });
            afarKVRow('LIEU(X) DE RDV FIGURATION :', (shootDay.rdvFiguration && String(shootDay.rdvFiguration).trim()) || '', { labelW: infoLabelW });
            afarKVRow('HMC :', (shootDay.hmcPlace && String(shootDay.hmcPlace).trim()) || '', { labelW: infoLabelW });
            afarKVRow('BUREAU DE PRODUCTION :', (shootDay.prodOffice && String(shootDay.prodOffice).trim()) || '', { labelW: infoLabelW });
            afarKVRow('CANTINE :', (shootDay.meals && String(shootDay.meals).trim()) || '', { labelW: infoLabelW });
            afarKVRow('STATIONNEMENT VÉHICULES TECHNIQUES :', (shootDay.techParking && String(shootDay.techParking).trim()) || '', { labelW: infoLabelW });
            afarKVRow('STATIONNEMENT VÉHICULES PERSO :', (shootDay.persoParking && String(shootDay.persoParking).trim()) || '', { labelW: infoLabelW });
            y += 1.5;
            
            // ===== GRILLE DES CONVOCATIONS PAR DÉPARTEMENT (format AFAR) =====
            const deptDefs = [
                { ab: 'REAL',  g: ['gc3'], role: /^real/ },
                { ab: 'MES',   g: ['gc3'], roleNot: /^real/ },
                { ab: 'SCR',   g: ['gc8'] },
                { ab: 'DIR PHOTO', g: ['gc1'], role: /^(directeur|dop|chef ?op)/ },
                { ab: 'CAM',   g: ['gc1'], roleNot: /^(directeur|dop|chef ?op)/ },
                { ab: 'ÉLEC',  g: ['gc2'] },
                { ab: 'MACH',  g: ['gc18'] },
                { ab: 'SON',   g: ['gc4'] },
                { ab: 'DÉCO',  g: ['gc5'] },
                { ab: 'COST',  g: ['gc6'] },
                { ab: 'MAQ',   g: ['gc7'] },
                { ab: 'RÉGIE', g: ['gc9', 'gc10', 'gc11', 'gc12'] }
            ];
            const normRole = (r) => String(r || '').toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/[\u00B7.]/g, '').trim();
            const deptCall = (def) => {
                const times = (shootDay.callSheet || [])
                    .filter(call => {
                        if(call.type !== 'crew' || !call.callTime) return false;
                        const m = allCrew.find(cc => cc.id === call.personId);
                        if(!m || !def.g.includes(m.group_id)) return false;
                        const r = normRole(m.role);
                        if(def.role && !def.role.test(r)) return false;
                        if(def.roleNot && def.roleNot.test(r)) return false;
                        return true;
                    })
                    .map(call => call.callTime)
                    .sort();
                return times.length ? times[0] : '';
            };
            const dGridW = usableWidth / deptDefs.length;
            const dCols = deptDefs.map((d, i) => ({ x: margin + i * dGridW, w: dGridW, align: 'center' }));
            afarRow(dCols, deptDefs.map(d => d.ab), { header: true, height: 4.6, fontSize: 6.2, noWrap: true });
            afarRow(dCols, deptDefs.map(d => deptCall(d)), { height: 4.6, fontSize: 7 });
            y += 2;
            
            // ===== PROGRAMME DU JOUR — séquencier format AFAR =====
            const scenes = shootDay.scenes || [];
            const seqCols = [
                { x: margin,                        w: usableWidth * 0.07, align: 'center' },
                { x: margin + usableWidth * 0.07,   w: usableWidth * 0.06, align: 'center' },
                { x: margin + usableWidth * 0.13,   w: usableWidth * 0.09, align: 'center' },
                { x: margin + usableWidth * 0.22,   w: usableWidth * 0.07, align: 'center' },
                { x: margin + usableWidth * 0.29,   w: usableWidth * 0.19 },
                { x: margin + usableWidth * 0.48,   w: usableWidth * 0.24 },
                { x: margin + usableWidth * 0.72,   w: usableWidth * 0.15 },
                { x: margin + usableWidth * 0.87,   w: usableWidth * 0.06, align: 'center' },
                { x: margin + usableWidth * 0.93,   w: usableWidth * 0.07, align: 'center' }
            ];
            afarRow(seqCols, ['HEURE', 'SEQ', 'EFFET', 'CHRONO', 'DÉCOR', 'RÉSUMÉ', 'PERSONNAGES', 'PLANS', 'PRÉ-MIN'],
                { header: true, height: 5.6, fontSize: 6.4 });
            if(scenes.length === 0) {
                afarRow([{ x: margin, w: usableWidth, align: 'center' }], ['Aucune scène planifiée pour ce jour.'],
                    { height: 4.8, fontSize: 7.4 });
            } else {
                scenes.forEach(ref => {
                    const sc = allScenes.find(s => s.id === ref.sceneId);
                    if(!sc) return;
                    const allShots = (state.data.shots || []).filter(s => s.sceneId === ref.sceneId || String(s.sceneId) === String(ref.sceneId));
                    const totalShots = allShots.length;
                    const selectedShots = ref.selectedShots || [];
                    const shotsInfo = totalShots === 0 ? '' : `${selectedShots.length}/${totalShots}`;
                    afarRow(seqCols, [
                        ref.startTime || '',
                        sceneLabel(sc).replace(/^#/, ''),
                        afarEffet(sc.title),
                        sc.chrono || '',
                        afarDecor(sc),
                        sc.resume || '',
                        sc.perso || '',
                        shotsInfo,
                        afarMin(sc.time)
                    ], { height: 4.8, fontSize: 7 });
                });
            }
            y += 2;
            
            // Familles de comédiens (portée : tout le rendu du jour, prévisions incluses)
            const figuGroupIds = actorGroups.filter(g => /figuration/i.test(g.name || '')).map(g => g.id);
            const silGroupIds  = actorGroups.filter(g => /silhouette/i.test(g.name)).map(g => g.id);
            const dblGroupIds  = actorGroups.filter(g => /doublure/i.test(g.name)).map(g => g.id);
            // Tout comédien qui n'est ni figurant, ni silhouette, ni doublure relève des rôles
            const isFigu = (p) => figuGroupIds.includes(p.group_id);
            const isSil  = (p) => silGroupIds.includes(p.group_id);
            const isDbl  = (p) => dblGroupIds.includes(p.group_id);
            
            // ===== CONVOCATIONS — tableaux de distribution format AFAR =====
            if(opts.includeCallSheet !== false) {
            const callsAll = shootDay.callSheet || [];
            const castCols = [
                { x: margin,                        w: usableWidth * 0.05, align: 'center' },
                { x: margin + usableWidth * 0.05,   w: usableWidth * 0.19 },
                { x: margin + usableWidth * 0.24,   w: usableWidth * 0.19 },
                { x: margin + usableWidth * 0.43,   w: usableWidth * 0.22 },
                { x: margin + usableWidth * 0.65,   w: usableWidth * 0.07, align: 'center' },
                { x: margin + usableWidth * 0.72,   w: usableWidth * 0.07, align: 'center' },
                { x: margin + usableWidth * 0.79,   w: usableWidth * 0.07, align: 'center' },
                { x: margin + usableWidth * 0.86,   w: usableWidth * 0.07, align: 'center' },
                { x: margin + usableWidth * 0.93,   w: usableWidth * 0.07, align: 'center' }
            ];
            // Séquences du jour où apparaît un personnage donné
            const seqsForCharacter = (charName) => {
                if(!charName) return '';
                // v580 : nom -> fiche une fois, puis test PAR IDENTIFIANT
                // (sceneHasChar garde le nom en repli).
                const fiche = FicheLinks.findChar(charName);
                const needle = String(charName).toUpperCase();
                return scenes.map(ref => {
                    const sc = allScenes.find(s => s.id === ref.sceneId);
                    if(!sc) return null;
                    const hit = fiche ? FicheLinks.sceneHasChar(sc, fiche)
                        : String(sc.perso || '').toUpperCase().includes(needle);
                    return hit ? sceneLabel(sc).replace(/^#/, '') : null;
                }).filter(Boolean).join('  ');
            };
            // Un tableau de distribution AFAR pour une famille de groupes de comédiens
            const drawCastTable = (title, matchFn, emptyIfNone) => {
                const rows = [];
                callsAll.filter(cl => cl.type === 'actor').forEach(cl => {
                    const person = allActors.find(a => a.id === cl.personId);
                    if(!person || !matchFn(person)) return;
                    const character = allCharacters.find(ch => ch.actor_id === person.id);
                    rows.push({ cl, person, role: character ? character.name : '' });
                });
                if(rows.length === 0 && !emptyIfNone) return;
                afarRow(castCols, ['N°', title, 'INTERPRÈTE(S)', 'SÉQUENCE(S)', 'CONV.', 'PICK UP', 'HMC', 'HMC > Décor', 'PAT'],
                    { header: true, height: 5.6, fontSize: 6.2 });
                if(rows.length === 0) {
                    afarRow(castCols, ['', '', '', '', '', '', '', '', ''], { height: 4.8 });
                } else {
                    rows.forEach((r, ri) => {
                        afarRow(castCols, [
                            String(ri + 1),
                            r.role,
                            r.person.name || '',
                            seqsForCharacter(r.role),
                            r.cl.callTime || '',
                            r.cl.pickupTime || '',
                            r.cl.hmcTime || '',
                            '',
                            r.cl.patTime || ''
                        ], { height: 4.8, fontSize: 7 });
                    });
                }
                y += 1.5;
            };
            
            // Tableaux masques pour ce jour depuis la feuille (v567)
            const fdsHidden = (s) => (shootDay.fdsHide || []).indexOf(s) > -1;
            drawCastTable('RÔLE(S)',        (p) => !isFigu(p) && !isSil(p) && !isDbl(p), true);
            if(!fdsHidden('sil')) drawCastTable('SILHOUETTE(S)',  isSil, false);
            if(!fdsHidden('dbl')) drawCastTable('DOUBLURE(S)',    isDbl, false);
            
            // Figuration — deux formes selon le mode choisi sur le jour.
            // INTEGRE : tableau nominatif complet, la feuille suffit aux
            // figurants. SEPARE : effectifs seuls, le detail part sur sa propre
            // feuille (pratique du metier : la liste nominative ne circule
            // qu'aupres de la regie figuration).
            const figCs = Figuration._fcs(shootDay);
            const figNom = (row) => {
                const f = allActors.find(a => String(a.id) === String(row.figurantId));
                return f ? (f.name || 'sans nom') : '(supprime)';
            };
            const figTrans = (row) => {
                const tr = row.transport || {};
                return tr.mode === 'Autre' ? (tr.note || 'Autre') : (tr.mode || '');
            };
            if(figCs.length > 0 && !shootDay.figuSplit) {
                const figCols = [
                    { x: margin,                        w: usableWidth * 0.04, align: 'center' },
                    { x: margin + usableWidth * 0.04,   w: usableWidth * 0.17 },
                    { x: margin + usableWidth * 0.21,   w: usableWidth * 0.07, align: 'center' },
                    { x: margin + usableWidth * 0.28,   w: usableWidth * 0.07, align: 'center' },
                    { x: margin + usableWidth * 0.35,   w: usableWidth * 0.07, align: 'center' },
                    { x: margin + usableWidth * 0.42,   w: usableWidth * 0.07, align: 'center' },
                    { x: margin + usableWidth * 0.49,   w: usableWidth * 0.18 },
                    { x: margin + usableWidth * 0.67,   w: usableWidth * 0.16 },
                    { x: margin + usableWidth * 0.83,   w: usableWidth * 0.17 }
                ];
                afarLabelBar('FIGURATION', { height: 5, center: true });
                afarRow(figCols, ['N°', 'FIGURANT·E', 'CONV.', 'PICK UP', 'HMC', 'PAT', 'TRANSPORT', 'COSTUME', 'CONSIGNE'],
                    { header: true, height: 5.6, fontSize: 6.2 });
                figCs.forEach((row, ri) => {
                    const cl = callsAll.find(x => x.type === 'actor' && String(x.personId) === String(row.figurantId)) || {};
                    afarRow(figCols, [
                        String(ri + 1),
                        figNom(row),
                        cl.callTime || '',
                        cl.pickupTime || '',
                        cl.hmcTime || '',
                        cl.patTime || '',
                        figTrans(row),
                        row.costume || '',
                        row.notes || ''
                    ], { height: 4.8, fontSize: 7 });
                });
                afarRow(figCols, ['', 'Total jour :', String(figCs.length), '', '', '', '', '', ''],
                    { height: 4.8, fontSize: 7.2, boldCols: [1, 2] });
                y += 1.5;
            } else if(figCs.length > 0) {
                const figCols = [
                    { x: margin,                        w: usableWidth * 0.43 },
                    { x: margin + usableWidth * 0.43,   w: usableWidth * 0.36 },
                    { x: margin + usableWidth * 0.79,   w: usableWidth * 0.07, align: 'center' },
                    { x: margin + usableWidth * 0.86,   w: usableWidth * 0.07, align: 'center' },
                    { x: margin + usableWidth * 0.93,   w: usableWidth * 0.07, align: 'center' }
                ];
                const buckets = {};
                figCs.forEach(row => {
                    const f = allActors.find(a => a.id === row.figurantId);
                    const ch = f ? allCharacters.find(x => x.actor_id === f.id) : null;
                    const key = (ch && ch.name) || (f && f.role) || 'Figurant·e';
                    // Regroupement par categorie ET par heure : deux vagues de
                    // figurants a des heures differentes sont deux lignes, sans
                    // quoi la seconde heure serait perdue.
                    const bk = key + '||' + (row.callTime || '');
                    if(!buckets[bk]) buckets[bk] = { n: 0, key: key, call: row.callTime || '' };
                    buckets[bk].n++;
                });
                afarLabelBar('FIGURATION', { height: 5, center: true });
                afarRow(figCols, ['Figuration', 'SÉQUENCE(S)', 'CONV.', 'HMC', 'PAT'],
                    { header: true, height: 5.6, fontSize: 6.4 });
                Object.keys(buckets).sort().forEach(k => {
                    afarRow(figCols, [buckets[k].n + ' ' + buckets[k].key, '', buckets[k].call, '', ''],
                        { height: 4.8, fontSize: 7.2 });
                });
                afarRow(figCols, ['Total jour :', 'voir la feuille de figuration', String(figCs.length), '', ''],
                    { height: 4.8, fontSize: 7.2, boldCols: [0, 2] });
                y += 1.5;
            }
            
            // Convocations nominatives de l'équipe technique (complément au relevé par département)
            const crewCalls = callsAll.filter(cl => cl.type === 'crew');
            if(crewCalls.length > 0) {
                const crewCols = [
                    { x: margin,                        w: usableWidth * 0.34 },
                    { x: margin + usableWidth * 0.34,   w: usableWidth * 0.34 },
                    { x: margin + usableWidth * 0.68,   w: usableWidth * 0.11, align: 'center' },
                    { x: margin + usableWidth * 0.79,   w: usableWidth * 0.11, align: 'center' },
                    { x: margin + usableWidth * 0.90,   w: usableWidth * 0.10, align: 'center' }
                ];
                afarRow(crewCols, ['ÉQUIPE TECHNIQUE', 'POSTE', 'CONVOC.', 'PICK UP', 'PAT'],
                    { header: true, height: 5.2, fontSize: 6.6 });
                const drawCrewLine = (cl) => {
                    const person = allCrew.find(cc => cc.id === cl.personId);
                    if(!person) return;
                    afarRow(crewCols, [
                        person.name || '',
                        person.role || '',
                        cl.callTime || '',
                        cl.pickupTime || '',
                        cl.patTime || ''
                    ], { height: 4.8, fontSize: 7.2 });
                };
                crewGroupsAll.forEach(grp => {
                    const gc = crewCalls.filter(cl => {
                        const m = allCrew.find(cc => cc.id === cl.personId);
                        return m && m.group_id === grp.id;
                    });
                    if(gc.length === 0) return;
                    afarRow([{ x: margin, w: usableWidth }], [pdfSafe(grp.name).toUpperCase()],
                        { fill: true, bold: true, height: 4.4, fontSize: 6.8 });
                    gc.forEach(drawCrewLine);
                });
                const ungrouped = crewCalls.filter(cl => {
                    const m = allCrew.find(cc => cc.id === cl.personId);
                    return m && (!m.group_id || !crewGroupsAll.find(g => g.id === m.group_id));
                });
                if(ungrouped.length > 0) {
                    afarRow([{ x: margin, w: usableWidth }], ['NON CLASSÉS'],
                        { fill: true, bold: true, height: 4.4, fontSize: 6.8 });
                    ungrouped.forEach(drawCrewLine);
                }
                y += 1.5;
            }
            
            // ===== TRANSPORTS (format AFAR page 3) =====
            const trCols = [
                { x: margin,                        w: usableWidth * 0.24 },
                { x: margin + usableWidth * 0.24,   w: usableWidth * 0.24 },
                { x: margin + usableWidth * 0.48,   w: usableWidth * 0.09, align: 'center' },
                { x: margin + usableWidth * 0.57,   w: usableWidth * 0.19 },
                { x: margin + usableWidth * 0.76,   w: usableWidth * 0.15 },
                { x: margin + usableWidth * 0.91,   w: usableWidth * 0.09, align: 'center' }
            ];
            const destLieu = shootDay.locationRealName || shootDay.location || '';
            const drawTransportTable = (title, calls, resolvePerson) => {
                if(calls.length === 0) return;
                afarLabelBar('TRANSPORTS ' + title, { height: 5, center: true });
                afarRow(trCols, ['NOMS', 'Chauffeur / moyen', 'Pick-up', '', 'Destination', ''],
                    { header: true, height: 4.6, fontSize: 6.6 });
                afarRow(trCols, ['', '', 'Horaire', 'Lieu', 'Lieu', 'Horaire'],
                    { header: true, height: 4.4, fontSize: 6.2 });
                // v598 : une ligne par PERSONNE, comme a l'ecran.
                PersonIdentity.dedupe(calls, (cl) => ({ type: cl.type, id: cl.personId })).forEach(cl => {
                    const person = resolvePerson(cl);
                    if(!person) return;
                    const moyen = transportLabel(cl);
                    afarRow(trCols, [
                        person.name || '',
                        moyen === '-' ? '' : moyen,
                        cl.pickupTime || '',
                        cl.pickupPlace || '',
                        destLieu,
                        cl.callTime || ''
                    ], { height: 4.8, fontSize: 7 });
                });
                y += 1.5;
            };
            drawTransportTable('Comédiens', callsAll.filter(cl => cl.type === 'actor'),
                (cl) => allActors.find(a => a.id === cl.personId));
            drawTransportTable('Techniciens', crewCalls,
                (cl) => allCrew.find(cc => cc.id === cl.personId));
            
            // ===== CONSIGNES INDIVIDUELLES (ce que chacun doit apporter / préparer) =====
            const consignes = [];
            callsAll.forEach(cl => {
                const note = cl.notes && String(cl.notes).trim();
                if(!note) return;
                if(cl.type === 'actor') {
                    const p = allActors.find(a => a.id === cl.personId);
                    if(!p) return;
                    const ch = allCharacters.find(x => x.actor_id === p.id);
                    consignes.push({ who: p.name + (ch && ch.name ? ' (' + ch.name + ')' : ''), note });
                } else {
                    const p = allCrew.find(cc => cc.id === cl.personId);
                    if(!p) return;
                    consignes.push({ who: p.name + (p.role ? ' (' + p.role + ')' : ''), note });
                }
            });
            Figuration._fcs(shootDay).forEach(row => {
                const note = row.notes && String(row.notes).trim();
                if(!note) return;
                const f = allActors.find(a => a.id === row.figurantId);
                consignes.push({ who: (f ? f.name : 'Figurant·e') + ' (figuration)', note });
            });
            if(consignes.length > 0) {
                const cnCols = [
                    { x: margin,                        w: usableWidth * 0.34 },
                    { x: margin + usableWidth * 0.34,   w: usableWidth * 0.66 }
                ];
                afarRow(cnCols, ['CONSIGNES INDIVIDUELLES', 'À APPORTER / À PRÉPARER'],
                    { header: true, height: 5.2, fontSize: 6.6 });
                consignes.forEach(cn => afarRow(cnCols, [cn.who, cn.note], { height: 4.8, fontSize: 7 }));
                y += 1.5;
            }
            } // fin if(opts.includeCallSheet !== false)
            
            // ===== DÉPOUILLEMENT — blocs par corps de métier (format AFAR page 2) =====
            // (calcul délégué à PlanningFDS.breakdownSlots, partagé avec l'écran)
            // Dépouillement : calcul partagé avec l'éditeur WYSIWYG (PlanningFDS)
            PlanningFDS.breakdownSlots(shootDay, allScenes, allCrew).forEach(slot => {
                const parts = slot.cats.map(c =>
                    Utils.catLabel(c.cat) + (c.resp ? ' (Resp. : ' + c.resp + ')' : '') + ' : ' + c.content);
                afarSlotBox(slot.label, parts.join('   |   '), slot.sub);
            });
            y += 2;
            
            // Personnel supplémentaire du jour courant (rattaché au jour, pas aux prévisions)
            if(shootDay.extraStaff && String(shootDay.extraStaff).trim()) {
                afarSlotBox('PERSONNEL SUPPLÉMENTAIRE', String(shootDay.extraStaff).trim(), '');
                y += 2;
            }
            
            // ===== PRÉVISIONS DU LENDEMAIN (format AFAR page 3) =====
            // 31 aout — LE LENDEMAIN SE CHERCHE DANS LE PLANNING, PAS DANS
            // L'EXPORT. On lisait days[dayIdx + 1], c'est-a-dire le jour suivant
            // DANS LA SELECTION IMPRIMEE : exporter une seule feuille laissait
            // donc tout le bloc vide, alors que le lendemain existe bel et bien
            // dans le projet. Or ce bloc n'a de sens que pour l'equipe qui
            // recoit la feuille la veille au soir : il doit annoncer le vrai
            // jour d'apres. On cherche desormais, dans TOUS les jours de
            // tournage, le premier qui suive la date courante.
            const _dCur = new Date(shootDay.startDate || shootDay.date || 0);
            const nextDay = allDays
                .filter(d => d && (d.dayType || 'tournage') === 'tournage')
                .filter(d => {
                    const dd = new Date(d.startDate || d.date || 0);
                    return !isNaN(dd) && !isNaN(_dCur) && dd > _dCur;
                })
                .sort((a, b) => new Date(a.startDate || a.date || 0) - new Date(b.startDate || b.date || 0))[0] || null;
            const nextDateObj = nextDay ? new Date(nextDay.startDate || nextDay.date || 0) : null;
            const nextDateStr = (nextDateObj && !isNaN(nextDateObj))
                ? nextDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
            const nextScenes = nextDay ? (nextDay.scenes || []).map(ref => allScenes.find(s => s.id === ref.sceneId)).filter(Boolean) : [];
            const uniq = (arr) => arr.filter((v, i, a) => v && a.indexOf(v) === i);
            const prevLabelW = usableWidth * 0.24;
            // Le rang annonce est celui du lendemain dans le PLANNING (son
            // dayNumber), plus sa position dans la selection imprimee : sur une
            // feuille exportee seule, « JOUR 2 / 1 » n'avait aucun sens.
            const _totalT = allDays.filter(d => d && (d.dayType || 'tournage') === 'tournage').length;
            afarLabelBar('PRÉVISIONS DU ' + (nextDateStr ? nextDateStr.toUpperCase() : 'LENDEMAIN')
                + (nextDay && nextDay.dayNumber ? '   (JOUR ' + nextDay.dayNumber + ' / ' + _totalT + ')' : ''), { height: 5 });
            afarKVRow('Horaires :', nextDay ? `${nextDay.crewCall || '--:--'} - ${nextDay.estimatedWrap || '--:--'}` : '', { labelW: prevLabelW });
            afarKVRow('Séquences :', uniq(nextScenes.map(sc => sceneLabel(sc).replace(/^#/, ''))).join('  '), { labelW: prevLabelW });
            afarKVRow('Effets :', uniq(nextScenes.map(sc => afarEffet(sc.title))).join('  -  '), { labelW: prevLabelW });
            afarKVRow('Décors :', uniq(nextScenes.map(sc => afarDecor(sc))).join('  -  '), { labelW: prevLabelW });
            afarKVRow('Lieux :', nextDay ? [nextDay.locationRealName, nextDay.locationAddress].filter(Boolean).join(' - ') : '', { labelW: prevLabelW });
            afarKVRow('Rôles :', uniq(nextScenes.map(sc => sc.perso).filter(Boolean).join(', ').split(/\s*,\s*/)).join('  -  '), { labelW: prevLabelW });
            // Effectifs prévus du lendemain par famille de comédiens
            const nextByGroup = (matchFn) => {
                if(!nextDay) return '';
                const names = (nextDay.callSheet || [])
                    .filter(cl => cl.type === 'actor')
                    .map(cl => allActors.find(a => a.id === cl.personId))
                    .filter(p => p && matchFn(p))
                    .map(p => p.name);
                return names.join('  -  ');
            };
            afarKVRow('Silhouettes :', nextByGroup(isSil), { labelW: prevLabelW });
            afarKVRow('Doublures :', nextByGroup(isDbl), { labelW: prevLabelW });
            afarKVRow('Figuration :', nextDay ? String(Figuration._fcs(nextDay).length || '') : '', { labelW: prevLabelW });
            afarKVRow('Véhicules :', nextDay ? uniq((nextDay.callSheet || []).map(cl => {
                const v = (state.data.vehicles || []).find(x => x.id === cl.vehicleId);
                return v ? v.name : null;
            })).join('  -  ') : '', { labelW: prevLabelW });
            afarKVRow('Notes :', shootDay.previsions || '', { labelW: prevLabelW });
        });

        // FDS figuration a la suite (jours avec figurants convoques) — flux continu :
        // plusieurs jours par page tant que la place le permet (fini 1 page par jour).
        if(typeof Figuration !== 'undefined' && Figuration._renderFiguPage) {
            let figY = null;
            days.forEach(shootDay => {
                const fcs = Figuration._fcs(shootDay);
                // Uniquement pour les jours bascules en feuille dediee : sinon
                // la figuration est deja nommee sur la feuille de service, et
                // sortirait deux fois. « fdsScope » permet en plus de ne
                // demander que la feuille de service.
                if(fcs.length > 0 && shootDay.figuSplit && opts.fdsScope !== 'main') {
                    const estH = 42 + fcs.length * 6;
                    if(figY === null || figY + estH > pageHeight - margin - 10) {
                        doc.addPage();
                        figY = margin;
                    }
                    figY = Figuration._renderFiguPage(doc, shootDay, { margin, pageWidth, pageHeight, startY: figY }) + 10;
                }
            });
        }

        // Footer
        if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) {
            FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        }
        
        // Sauvegarde
        if(opts.returnBlob) return doc.output('blob');
        const pdfSectionName = (days.length === 1) ? ('Feuille de service - ' + Planning.dayShortLabel(days[0])) : 'Planning';
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename(pdfSectionName)
            : `${state.data.title || 'Projet'} - ${pdfSectionName} - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast(`Planning PDF exporté (${days.length} jour${days.length > 1 ? 's' : ''}) !`, 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `Planning PDF généré (${days.length} jours)`);
    }
  };
