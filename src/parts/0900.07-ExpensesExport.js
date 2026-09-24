
const ExpensesExport = {
    // Modal d'options du bouton d'onglet — aligné sur le modal Export global
    // (mode Simple par défaut + toggle page de garde)
    openExportModal: () => {
        Actions.openExportModal('budget');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'budget');
        });
    },
    
    // Export PDF du budget [Phase C.2.2 refondu + Phase D : opts.simple / opts.includeCover]
    // opts = { includeCover, returnBlob, simple }
    // - simple : page de garde + résumé global + totaux par catégorie CNC (saute le tableau détaillé des dépenses)
    // - sinon : tout (par défaut = détaillé)
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const projectTitle = state.data.title || 'Projet sans titre';
        const previsionnel = state.data.budget?.previsionnel || {};
        
        // Helper de formatage des montants (évite le bug "38 /260" de toLocaleString avec espace insécable)
        const fmt = (n) => {
            const num = parseFloat(n) || 0;
            // Format français : séparateur de milliers = espace normal, pas d'insécable
            return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        };
        
        // Calculer le budget total depuis le prévisionnel
        let budgetTotal = 0;
        Object.values(previsionnel).forEach(p => {
            budgetTotal += vatMode === 'HT' ? (p.budgetHT || 0) : (p.budgetTTC || 0);
        });
        if(budgetTotal === 0) budgetTotal = state.data.budget?.total || 0;
        
        // Calcul des totaux par catégorie CNC
        let totalApproved = 0, totalPending = 0, totalRejected = 0;
        const catTotals = {};
        
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const prev = previsionnel[cat.id] || {};
            catTotals[cat.id] = { 
                approved: 0, 
                pending: 0, 
                budget: vatMode === 'HT' ? (prev.budgetHT || 0) : (prev.budgetTTC || 0)
            };
        });
        
        (state.data.expenses || []).forEach(exp => {
            const catId = exp.category || exp.department;
            const amount = vatMode === 'HT' ? (parseFloat(exp.amountHT) || parseFloat(exp.amount) || 0) : (parseFloat(exp.amountTTC) || parseFloat(exp.amount) || 0);
            
            if(exp.status === 'approved' || exp.status === 'done') totalApproved += amount;
            else if(exp.status === 'pending' || exp.status === 'escalated') totalPending += amount;
            else if(exp.status === 'rejected') totalRejected += amount;
            
            const mappedCat = Expenses.MIGRATION_MAP[catId] || catId;
            if(!catTotals[mappedCat]) catTotals[mappedCat] = { approved: 0, pending: 0, budget: 0 };
            
            if(exp.status === 'approved' || exp.status === 'done') catTotals[mappedCat].approved += amount;
            else if(exp.status === 'pending') catTotals[mappedCat].pending += amount;
        });
        
        // Meme precaution que dans la synthese a l'ecran : on n'ajoute que les
        // salaires PAS encore generes en depense validee, sinon le PDF annonce un
        // poste salaires double.
        const salariesTotal = Expenses.calculateSalariesTotal(true);
        totalApproved += salariesTotal;
        
        // ===== HELPER : en-têtes tableau dépenses =====
        const drawExpenseHeaders = (yPos) => {
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(margin, yPos, pageWidth - margin * 2, 7, 'F');
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.text('Date', margin + 2, yPos + 5);
            doc.text('Titre', margin + 22, yPos + 5);
            doc.text('Catégorie', margin + 75, yPos + 5);
            doc.text('HT', margin + 112, yPos + 5);
            doc.text('TVA', margin + 132, yPos + 5);
            doc.text('TTC', margin + 148, yPos + 5);
            doc.text('Statut', margin + 167, yPos + 5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.setFont('helvetica', 'normal');
            return yPos + 9;
        };
        
        // ===== PAGE DE GARDE (Phase C.1) — optionnelle =====
        if(opts.includeCover !== false) {
            PdfTheme.coverPage(doc, { sectionName: 'Budget' });
            doc.addPage();
        }
        let y = margin;
        
        // Mention du mode HT/TTC
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
        doc.setFont('helvetica', 'italic');
        doc.text('Mode ' + vatMode, pageWidth / 2, y + 4, { align: 'center' });
        y += 12;
        
        // ===== RÉSUMÉ GLOBAL =====
        const reste = budgetTotal - totalApproved;
        const pct = budgetTotal > 0 ? Math.round(totalApproved / budgetTotal * 100) : 0;
        
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 38, 3, 3, 'F');
        doc.setDrawColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 38, 3, 3, 'S');
        doc.setLineWidth(0.2);
        
        // Titre résumé
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.text('RÉSUMÉ GLOBAL', margin + 5, y + 8);
        
        // Barre de progression
        const barX = margin + 5;
        const barW = pageWidth - margin * 2 - 10;
        const barY = y + 12;
        doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
        doc.roundedRect(barX, barY, barW, 4, 2, 2, 'F');
        if(pct > 0) {
            const clampedPct = Math.min(pct, 100);
            doc.setFillColor(pct > 100 ? 220 : 76, pct > 100 ? 53 : 175, pct > 100 ? 69 : 80);
            doc.roundedRect(barX, barY, barW * clampedPct / 100, 4, 2, 2, 'F');
        }
        doc.setFontSize(7);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
        doc.text(pct + '% consommé', barX + barW / 2, barY + 3, { align: 'center' });
        
        // Chiffres
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
        doc.text('Prévisionnel ' + vatMode, margin + 5, y + 25);
        doc.text('Dépensé (validé)', margin + 65, y + 25);
        doc.text('En attente', margin + 120, y + 25);
        doc.text('Reste', margin + 158, y + 25);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        doc.text(fmt(budgetTotal) + ' ' + currency, margin + 5, y + 33);
        doc.setTextColor(...PdfTheme.COLORS.STAT_GREEN);
        doc.text(fmt(totalApproved) + ' ' + currency, margin + 65, y + 33);
        doc.setTextColor(...PdfTheme.COLORS.WARNING);
        doc.text(fmt(totalPending) + ' ' + currency, margin + 120, y + 33);
        doc.setTextColor(reste < 0 ? 220 : 43, reste < 0 ? 53 : 110, reste < 0 ? 69 : 246);
        doc.text(fmt(reste) + ' ' + currency, margin + 158, y + 33);
        
        y += 48;
        
        // ===== TABLEAU CATÉGORIES CNC =====
        y = PdfTheme.sectionBand(doc, { x: margin, y, width: pageWidth - margin * 2,
                                        title: 'Répartition par catégorie CNC', size: 10,
                                        accent: PdfTheme.accentFor('Budget') });
        
        // En-têtes
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('Catégorie', margin + 3, y + 5);
        doc.text('Prévisionnel', margin + 75, y + 5);
        doc.text('Dépensé', margin + 108, y + 5);
        doc.text('En attente', margin + 137, y + 5);
        doc.text('Écart', margin + 167, y + 5);
        y += 9;
        
        let rowIndex = 0;
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const data = catTotals[cat.id];
            if(!data || (data.approved === 0 && data.pending === 0 && data.budget === 0)) return;
            
            if(y > pageHeight - 20) { doc.addPage(); y = margin; }
            
            if(rowIndex % 2 === 0) {
                doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
                doc.rect(margin, y - 3.5, pageWidth - margin * 2, 7, 'F');
            }
            
            const ecart = data.budget - data.approved;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.text(PdfTheme.cleanText(`${cat.code}. ${cat.name}`).substring(0, 38), margin + 3, y);
            doc.text(data.budget > 0 ? fmt(data.budget) + ' ' + currency : '-', margin + 75, y);
            doc.text(fmt(data.approved) + ' ' + currency, margin + 108, y);
            doc.text(data.pending > 0 ? fmt(data.pending) + ' ' + currency : '-', margin + 137, y);
            if(data.budget > 0) {
                doc.setTextColor(ecart < 0 ? 220 : 76, ecart < 0 ? 53 : 175, ecart < 0 ? 69 : 80);
                doc.text(fmt(ecart) + ' ' + currency, margin + 167, y);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            } else {
                doc.text('-', margin + 167, y);
            }
            y += 7;
            rowIndex++;
        });
        
        // Ligne total catégories
        y += 2;
        doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
        doc.rect(margin, y - 3.5, pageWidth - margin * 2, 8, 'F');
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL', margin + 3, y + 1);
        doc.text(fmt(budgetTotal) + ' ' + currency, margin + 75, y + 1);
        doc.text(fmt(totalApproved) + ' ' + currency, margin + 108, y + 1);
        doc.text(fmt(totalPending) + ' ' + currency, margin + 137, y + 1);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        y += 15;
        
        // ===== LISTE DES DÉPENSES (sautée si opts.simple) =====
        const statusColors = { pending: [255, 152, 0], approved: [76, 175, 80], rejected: [220, 53, 69], done: [43, 110, 246], escalated: [156, 39, 176], returned: [96, 125, 139] };
        const expenses = [...(state.data.expenses || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if(!opts.simple && expenses.length > 0) {
            if(y > pageHeight - 50) { doc.addPage(); y = margin; }
            
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: pageWidth - margin * 2,
                                            title: 'Liste des dépenses', size: 10,
                                            right: String(expenses.length),
                                            accent: PdfTheme.accentFor('Budget') });
            
            y = drawExpenseHeaders(y);
            
            expenses.forEach((exp, idx) => {
                if(y > pageHeight - 15) { 
                    doc.addPage(); 
                    y = margin;
                    y = drawExpenseHeaders(y);
                }
                
                if(idx % 2 === 0) {
                    doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
                    doc.rect(margin, y - 3.5, pageWidth - margin * 2, 6.5, 'F');
                }
                
                const cat = Expenses.getCategory(exp.category || exp.department);
                const catLabel = cat ? `${cat.code}. ${cat.name}` : (exp.category || exp.department || '-');
                const amountHT = exp.amountHT || exp.amount || 0;
                const vatRate = exp.vatRate || 0;
                const amountTTC = exp.amountTTC || exp.amount || 0;
                
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                doc.text(exp.date ? new Date(exp.date).toLocaleDateString('fr-FR') : '-', margin + 2, y);
                doc.text(PdfTheme.cleanText(exp.title || 'Sans titre').substring(0, 26), margin + 22, y);
                doc.text(PdfTheme.cleanText(catLabel).substring(0, 20), margin + 75, y);
                doc.text(fmt(amountHT), margin + 112, y);
                doc.text(vatRate > 0 ? vatRate + '%' : '-', margin + 132, y);
                doc.text(fmt(amountTTC), margin + 148, y);
                const sc = statusColors[exp.status] || [100, 100, 100];
                doc.setTextColor(sc[0], sc[1], sc[2]);
                doc.setFont('helvetica', 'bold');
                doc.text(EXPENSE_STATUS_LABELS[exp.status] || exp.status || '-', margin + 167, y);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                
                y += 6;
            });
            
            // Ligne total dépenses
            y += 3;
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(margin, y - 3.5, pageWidth - margin * 2, 8, 'F');
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            let totalHT = 0, totalTTC = 0;
            expenses.filter(e => e.status === 'approved' || e.status === 'done').forEach(e => {
                totalHT += parseFloat(e.amountHT) || parseFloat(e.amount) || 0;
                totalTTC += parseFloat(e.amountTTC) || parseFloat(e.amount) || 0;
            });
            doc.text('TOTAL (validé/payé)', margin + 3, y + 1);
            doc.text(fmt(totalHT) + ' ' + currency, margin + 112, y + 1);
            doc.text(fmt(totalTTC) + ' ' + currency, margin + 148, y + 1);
        }
        
        // ===== FOOTERS UNIFIÉS (Phase C.1) =====
        PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
        
        // ===== TÉLÉCHARGEMENT (nom unifié) =====
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Budget'));
        Utils.toast('Budget PDF exporté !', 'success');
        History.log('EXPORT', 'Budget PDF généré');
    },
    
    // Export Excel du budget (format CNC avec TVA)
    exportExcel: () => {
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const projectTitle = state.data.title || 'Projet sans titre';
        const previsionnel = state.data.budget?.previsionnel || {};
        
        // Calculer le budget total
        let budgetTotal = 0;
        Object.values(previsionnel).forEach(p => {
            budgetTotal += vatMode === 'HT' ? (p.budgetHT || 0) : (p.budgetTTC || 0);
        });
        if(budgetTotal === 0) budgetTotal = state.data.budget?.total || 0;
        
        
        // Construire le CSV avec BOM UTF-8
        let csv = '\uFEFF';
        
        // En-tête projet
        csv += `BUDGET - ${projectTitle}\n`;
        csv += `Généré le;${new Date().toLocaleDateString('fr-FR')}\n`;
        csv += `Mode;${vatMode}\n`;
        csv += `Budget total ${vatMode};${budgetTotal} ${currency}\n\n`;
        
        // Résumé par catégorie CNC
        csv += 'RÉPARTITION PAR CATÉGORIE CNC\n';
        csv += 'Code;Catégorie;Prévisionnel HT;Prévisionnel TTC;Dépensé HT;Dépensé TTC;En attente;Écart\n';
        
        // Calculer les totaux par catégorie
        const catTotals = {};
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const prev = previsionnel[cat.id] || {};
            catTotals[cat.id] = { 
                approvedHT: 0, 
                approvedTTC: 0,
                pendingHT: 0,
                budgetHT: prev.budgetHT || 0,
                budgetTTC: prev.budgetTTC || 0
            };
        });
        
        (state.data.expenses || []).forEach(exp => {
            const catId = exp.category || exp.department;
            const mappedCat = Expenses.MIGRATION_MAP[catId] || catId;
            
            if(!catTotals[mappedCat]) catTotals[mappedCat] = { approvedHT: 0, approvedTTC: 0, pendingHT: 0, budgetHT: 0, budgetTTC: 0 };
            
            const amountHT = parseFloat(exp.amountHT) || parseFloat(exp.amount) || 0;
            const amountTTC = parseFloat(exp.amountTTC) || parseFloat(exp.amount) || 0;
            
            if(exp.status === 'approved' || exp.status === 'done') {
                catTotals[mappedCat].approvedHT += amountHT;
                catTotals[mappedCat].approvedTTC += amountTTC;
            } else if(exp.status === 'pending' || exp.status === 'escalated') {
                catTotals[mappedCat].pendingHT += amountHT;
            }
        });
        
        // Écrire les lignes par catégorie CNC
        let totalBudgetHT = 0, totalBudgetTTC = 0, totalApprovedHT = 0, totalApprovedTTC = 0, totalPending = 0;
        
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const data = catTotals[cat.id];
            if(!data || (data.approvedHT === 0 && data.pendingHT === 0 && data.budgetHT === 0)) return;
            
            const ecart = data.budgetHT - data.approvedHT;
            csv += `${cat.code};${cat.name};${data.budgetHT};${data.budgetTTC};${data.approvedHT};${data.approvedTTC};${data.pendingHT};${ecart}\n`;
            
            totalBudgetHT += data.budgetHT;
            totalBudgetTTC += data.budgetTTC;
            totalApprovedHT += data.approvedHT;
            totalApprovedTTC += data.approvedTTC;
            totalPending += data.pendingHT;
        });
        
        // Ligne total
        csv += `;TOTAL;${totalBudgetHT};${totalBudgetTTC};${totalApprovedHT};${totalApprovedTTC};${totalPending};${totalBudgetHT - totalApprovedHT}\n`;
        
        csv += '\n';
        
        // Liste des dépenses détaillée
        csv += 'LISTE DES DÉPENSES\n';
        csv += 'Date;Titre;Catégorie CNC;Sous-catégorie;Montant HT;TVA %;Montant TTC;Statut;Description;Créé par;Validé par;Payé par\n';
        
        const expenses = [...(state.data.expenses || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        expenses.forEach(exp => {
            const date = exp.date ? new Date(exp.date).toLocaleDateString('fr-FR') : '';
            const title = (exp.title || '').replace(/;/g, ',').replace(/\n/g, ' ');
            const desc = (exp.description || '').replace(/;/g, ',').replace(/\n/g, ' ');
            const createdBy = (exp.createdByName || exp.createdBy || '').replace(/;/g, ',');
            const validatedBy = (exp.validatedByName || '').replace(/;/g, ',');
            const paidBy = (exp.paidByName || '').replace(/;/g, ',');
            
            // Catégorie CNC
            const cat = Expenses.getCategory(exp.category || exp.department);
            const catLabel = cat ? `${cat.code}. ${cat.name}` : (exp.category || exp.department || '');
            
            // Sous-catégorie
            let subcatLabel = '';
            if(exp.subcategory && cat) {
                const subcat = cat.subcats?.find(s => s.id === exp.subcategory);
                if(subcat) subcatLabel = subcat.name;
            }
            
            // Montants
            const amountHT = exp.amountHT || exp.amount || 0;
            const vatRate = exp.vatRate || 0;
            const amountTTC = exp.amountTTC || exp.amount || 0;
            
            csv += `${date};${title};${catLabel};${subcatLabel};${amountHT};${vatRate};${amountTTC};${EXPENSE_STATUS_LABELS[exp.status] || exp.status};${desc};${createdBy};${validatedBy};${paidBy}\n`;
        });
        
        // Télécharger
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (projectTitle.replace(/[^a-z0-9]/gi, '_') || 'budget') + '_budget_CNC.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Utils.toast('Export Excel (CSV) généré !', 'success');
    },
};
