
  const CrewExport = {
    // [Phase C.2.1 → refonte multi-modes Phase D] Export PDF de l'équipe technique
    // 3 modes : detailed | list | card. Sépare proprement équipe technique des comédiens
    // (les comédiens ont leur propre export FichesPDF.exportActors).
    openExportModal: () => {
        const crew = state.data.crew || [];
        if(crew.length === 0) {
            Utils.toast('Aucun membre d\'équipe à exporter', 'warning');
            return;
        }
        Actions.openExportModal('crew');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'crew');
        });
    },
    
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        opts.mode = opts.mode || 'detailed';
        const isCard = opts.mode === 'card';
        const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const usableWidth = pageWidth - margin * 2;
        
        const crew = state.data.crew || [];
        if(crew.length === 0) {
            Utils.toast('Aucun membre d\'équipe à exporter', 'warning');
            return;
        }
        
        const crewGroups = (state.data.groups || []).filter(g => g.type === 'crew');
        
        if(opts.mode !== 'list') Utils.toast('Préparation des photos...', 'info');
        let photoMap = {};
        if(opts.mode !== 'list' && typeof FichesPDF !== 'undefined' && FichesPDF._preloadImages) {
            const urls = crew.map(c => c.photo).filter(Boolean);
            photoMap = await FichesPDF._preloadImages(urls);
        }
        
        if(opts.includeCover !== false) {
            if(typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) {
                FichesPDF._drawCoverPage(doc, 'Équipe');
            } else {
                PdfTheme.coverPage(doc, { sectionName: 'Équipe' });
            }
            doc.addPage();
        }
        let y = margin;
        
        const grouped = {};
        crew.forEach(m => {
            const gid = m.group_id || 'orphan';
            if(!grouped[gid]) grouped[gid] = [];
            grouped[gid].push(m);
        });
        const groupOrder = Object.keys(grouped).sort((a, b) => {
            if(a === 'orphan') return 1;
            if(b === 'orphan') return -1;
            return 0;
        });
        
        const ensureSpace = (space) => {
            if(y + space > pageHeight - margin - 5) { doc.addPage(); y = margin; }
        };
        
        const drawDeptHeader = (deptName, count) => {
            ensureSpace(14);
            const lbl = (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText(deptName) : deptName;
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                            title: lbl, right: count + (count > 1 ? ' personnes' : ' personne'),
                                            accent: PdfTheme.accentFor('Équipe') });
        };
        
        const drawPhoto = (url, x, y, w, h) => {
            if(typeof FichesPDF !== 'undefined' && FichesPDF._drawPhotoOrPlaceholder) {
                FichesPDF._drawPhotoOrPlaceholder(doc, url, x, y, w, h);
            } else {
                doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
                doc.rect(x, y, w, h, 'F');
                if(url) { try { doc.addImage(url, 'JPEG', x, y, w, h); } catch(e){} }
            }
        };
        
        const cleanT = (t) => (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');
        
        // ===== MODE DETAILED =====
        const renderDetailed = (m) => {
            const cardH = 46;
            ensureSpace(cardH);
            const photoW = 28, photoH = 36;
            const photoUrl = m.photo ? photoMap[m.photo] : null;
            drawPhoto(photoUrl, margin, y, photoW, photoH);
            const textX = margin + photoW + 5;
            const textWidth = usableWidth - photoW - 7;
            let ty = y + 5;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(cleanT(m.name) || '(sans nom)', textX, ty);
            ty += 5;
            if(m.role) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(cleanT(m.role), textX, ty);
                ty += 4.2;
            }
            const contactBits = [];
            if(m.email) contactBits.push('Email : ' + m.email);
            if(m.phone) contactBits.push('Tél : ' + m.phone);
            if(contactBits.length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const cLine = contactBits.join('   ·   ');
                const cLines = doc.splitTextToSize(cLine, textWidth);
                cLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            if(m.city || m.address) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const addrBits = [];
                if(m.city) addrBits.push('Ville : ' + cleanT(m.city));
                if(m.address) addrBits.push(cleanT(m.address));
                const aLines = doc.splitTextToSize(addrBits.join('  ·  '), textWidth);
                aLines.slice(0, 1).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            if(m.hasVehicle) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.STAT_GREEN);
                const vBits = ['Véhicule'];
                if(m.vehicleType) vBits.push(cleanT(m.vehicleType));
                if(m.vehicleSeats) vBits.push(m.vehicleSeats + ' places');
                if(m.vehicleTrunk) vBits.push('coffre OK');
                doc.text(vBits.join(' · '), textX, ty);
                ty += 3.6;
            }
            if(Pay.gross(m) || Pay.net(m) || Pay.budget(m)) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.WARNING);
                const payBits = [];
                if(Pay.gross(m)) payBits.push(`Brut : ${Pay.gross(m)} ${m.rateCurrency || '€'}`);
                if(Pay.net(m)) payBits.push(`Net : ${Pay.net(m)} ${m.rateCurrency || '€'}`);
                if(Pay.budget(m)) payBits.push(`Budget HT : ${Pay.budget(m)} ${m.rateCurrency || '€'}`);
                doc.text(payBits.join(' - ') + ` / ${m.rateType || 'Jour'}`, textX, ty);
                ty += 3.6;
            }
            if(m.notes) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(8);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                const nLines = doc.splitTextToSize(cleanT(m.notes), textWidth);
                nLines.slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.4; });
            }
            const actualH = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualH);
            y += actualH + 3;
        };
        
        // ===== MODE LIST =====
        const renderList = (members) => {
            const lineH = 5.5;
            ensureSpace(lineH);
            doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
            doc.rect(margin, y, usableWidth, lineH, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            const colsW = [usableWidth * 0.25, usableWidth * 0.25, usableWidth * 0.30, usableWidth * 0.20];
            const colsX = [margin];
            for(let i = 1; i < colsW.length; i++) colsX.push(colsX[i-1] + colsW[i-1]);
            doc.text('Nom',   colsX[0] + 1, y + 3.8);
            doc.text('Rôle',  colsX[1] + 1, y + 3.8);
            doc.text('Email', colsX[2] + 1, y + 3.8);
            doc.text('Tél',   colsX[3] + 1, y + 3.8);
            y += lineH + 1;
            members.forEach(m => {
                ensureSpace(lineH);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                let txtName = cleanT(m.name) || '(sans nom)';
                while(doc.getTextWidth(txtName) > colsW[0] - 2 && txtName.length > 4) txtName = txtName.substring(0, txtName.length - 2) + '…';
                doc.text(txtName, colsX[0] + 1, y + 3.8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtRole = cleanT(m.role) || '—';
                while(doc.getTextWidth(txtRole) > colsW[1] - 2 && txtRole.length > 3) txtRole = txtRole.substring(0, txtRole.length - 2) + '…';
                doc.text(txtRole, colsX[1] + 1, y + 3.8);
                doc.setFont('helvetica', 'normal');
 doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                let txtEmail = m.email || '—';
                while(doc.getTextWidth(txtEmail) > colsW[2] - 2 && txtEmail.length > 5) txtEmail = txtEmail.substring(0, txtEmail.length - 2) + '…';
                doc.text(txtEmail, colsX[2] + 1, y + 3.8);
                doc.text(m.phone || '—', colsX[3] + 1, y + 3.8);
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(margin, y + lineH, margin + usableWidth, y + lineH);
                doc.setLineDashPattern([], 0);
                y += lineH;
            });
            y += 2;
        };
        
        // ===== MODE CARD (A4 paysage par technicien) =====
        const renderCard = (m) => {
            const photoUrl = m.photo ? photoMap[m.photo] : null;
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 18, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text('TECHNICIEN·NE', margin, 11);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(PdfTheme.cleanText(state.data.title || ''), pageWidth - margin, 11, { align: 'right' });
            const photoW2 = 75, photoH2 = 100;
            const photoX = margin, photoY = 28;
            drawPhoto(photoUrl, photoX, photoY, photoW2, photoH2);
            const infoX = photoX + photoW2 + 12;
            const infoW = pageWidth - infoX - margin;
            let iy = photoY + 6;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            const nLines = doc.splitTextToSize(cleanT(m.name) || '(sans nom)', infoW);
            nLines.forEach(l => { doc.text(l, infoX, iy); iy += 8; });
            iy += 2;
            if(m.role) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('FONCTION', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(12);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                doc.text(cleanT(m.role), infoX, iy);
                iy += 7;
            }
            const hasContact = m.email || m.phone || m.city || m.address;
            if(hasContact) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('CONTACT', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                if(m.email)   { doc.text('Email : ' + m.email, infoX, iy); iy += 4.2; }
                if(m.phone)   { doc.text('Tél : '   + m.phone, infoX, iy); iy += 4.2; }
                if(m.city)    { doc.text('Ville : ' + cleanT(m.city), infoX, iy); iy += 4.2; }
                if(m.address) {
                    const aLines = doc.splitTextToSize('Adresse : ' + cleanT(m.address), infoW);
                    aLines.slice(0, 2).forEach(l => { doc.text(l, infoX, iy); iy += 4.2; });
                }
                iy += 3;
            }
            if(Pay.gross(m) || Pay.net(m) || Pay.budget(m)) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('RÉMUNÉRATION', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(11);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                if(Pay.gross(m)) { doc.text(`Brut : ${Pay.gross(m)} ${m.rateCurrency || '€'} / ${m.rateType || 'Jour'}`, infoX, iy); iy += 4.5; }
                if(Pay.net(m)) { doc.text(`Net : ${Pay.net(m)} ${m.rateCurrency || '€'} / ${m.rateType || 'Jour'}`, infoX, iy); iy += 4.5; }
                if(Pay.budget(m)) { doc.text(`Budget HT : ${Pay.budget(m)} ${m.rateCurrency || '€'} / ${m.rateType || 'Jour'}`, infoX, iy); iy += 4.5; }
                iy += 1.5;
            }
            if(m.availabilityText) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('DISPONIBILITÉS', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const aLines = doc.splitTextToSize(cleanT(m.availabilityText), infoW);
                aLines.forEach(l => { if(iy < pageHeight - 50) { doc.text(l, infoX, iy); iy += 4.2; } });
                iy += 3;
            }
            if(m.notes) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('NOTES', infoX, iy);
                iy += 4;
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                const ntLines = doc.splitTextToSize(cleanT(m.notes), infoW);
                ntLines.forEach(l => { if(iy < pageHeight - 50) { doc.text(l, infoX, iy); iy += 4.2; } });
            }
            const bottomY = pageHeight - 30;
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('VÉHICULE', margin, bottomY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            if(m.hasVehicle) {
                let vy = bottomY + 5;
                const vBits = [];
                if(m.vehicleType)  vBits.push('Type : ' + cleanT(m.vehicleType));
                if(m.vehiclePlate) vBits.push('Imm. : ' + m.vehiclePlate);
                if(m.vehicleSeats) vBits.push(m.vehicleSeats + ' places');
                if(m.vehicleTrunk) vBits.push('Coffre OK');
                if(m.vehicleNotes) vBits.push(cleanT(m.vehicleNotes));
                vBits.forEach(b => { doc.text(b, margin, vy); vy += 4; });
                if(vBits.length === 0) doc.text('Oui (détails non renseignés)', margin, vy);
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                doc.text('—', margin, bottomY + 5);
            }
            const rightX = pageWidth / 2 + 5;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('DÉPARTEMENT', rightX, bottomY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const dept = crewGroups.find(g => g.id === m.group_id);
            const deptName = dept ? cleanT(dept.name) : 'Non classé';
            doc.text(deptName, rightX, bottomY + 5);
        };
        
        // ===== EXÉCUTION =====
        if(opts.mode === 'card') {
            crew.forEach((m, idx) => {
                if(idx > 0) doc.addPage();
                renderCard(m);
            });
        } else {
            groupOrder.forEach((gid) => {
                const dept = crewGroups.find(g => g.id === gid);
                const deptName = dept ? dept.name : 'Non classé';
                drawDeptHeader(deptName, grouped[gid].length);
                if(opts.mode === 'list') renderList(grouped[gid]);
                else grouped[gid].forEach(m => renderDetailed(m));
                y += 2;
            });
        }
        
        if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) {
            FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        } else if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
        }
        
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Équipe')
            : `${state.data.title || 'Projet'} - Équipe - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Équipe PDF exportée !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `Équipe PDF générée (${opts.mode})`);
    }
};
