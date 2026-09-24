
const TitlePage = {
    load: () => {
        const tp = state.data.titlePage || {};
        // Voir la garde de TitlePage.save : meme motif que Presentation.
        TitlePage._loadedFor = state.currentProjectId;
        const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
        setVal('tp-title', tp.title);
        setVal('tp-author', tp.author);
        setVal('tp-coauthor', tp.coauthor);
        setVal('tp-contact', tp.contact);
        setVal('tp-draft', tp.draft);
        setVal('tp-date', tp.date);
        setVal('tp-source', tp.source);
        setVal('tp-copyright', tp.copyright);
        setVal('tp-notes', tp.notes);
    },
    save: () => {
        if(!state.data) return; // [B2] Guard : pas de save si aucun projet ouvert (kick, déconnexion, etc.)
        // GARDE : save() REMPLACE state.data.titlePage par ce que contient le
        // formulaire de l'onglet Titre. Sans ce test, un appel passe avant
        // TitlePage.load() — ou apres un changement de projet — effacerait le
        // titre, l'auteur et le copyright, et propagerait au passage un titre
        // vide au projet lui-meme.
        if(TitlePage._loadedFor !== state.currentProjectId) {
            console.warn('[TitlePage] save() ignoré : formulaire non chargé pour ce projet.');
            return;
        }
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const newTitle = getVal('tp-title');
        state.data.titlePage = {
            title: newTitle,
            author: getVal('tp-author'),
            coauthor: getVal('tp-coauthor'),
            contact: getVal('tp-contact'),
            draft: getVal('tp-draft'),
            date: getVal('tp-date'),
            source: getVal('tp-source'),
            copyright: getVal('tp-copyright'),
            notes: getVal('tp-notes')
        };
        // Synchroniser avec le titre du projet
        if(newTitle && newTitle !== state.data.title) {
            state.data.title = newTitle;
            const projectTitleEl = document.getElementById('projectTitle');
            if(projectTitleEl) projectTitleEl.value = newTitle;
            Store.updateTitle(newTitle);
        }
        Store.saveDebounced();
    },
    
    // [Phase C.5.1] Export PDF de la page de titre seule (style Final Draft)
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const tp = state.data.titlePage || {};
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        const projectTitle = tp.title || state.data.title || 'Projet sans titre';
        const authorCombined = [tp.author, tp.coauthor].filter(Boolean).join(' & ');
        
        // Titre du film : très gros, centré, vers 40%
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(36);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
        const titleY = pageHeight * 0.40;
        doc.text(PdfTheme.cleanText(projectTitle).toUpperCase(), pageWidth / 2, titleY, { align: 'center' });
        
        // Trait de séparation
        const lineY = titleY + 10;
        doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
        doc.setLineWidth(0.3);
        doc.line(pageWidth / 2 - 45, lineY, pageWidth / 2 + 45, lineY);
        
        // "Un scénario de XXX"
        if(authorCombined) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(15);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
            doc.text(`Un scénario de ${PdfTheme.cleanText(authorCombined)}`, pageWidth / 2, lineY + 14, { align: 'center' });
        }
        
        // Basé sur
        let y = lineY + 24;
        if(tp.source) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(11);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(`Basé sur ${PdfTheme.cleanText(tp.source)}`, pageWidth / 2, y, { align: 'center' });
            y += 8;
        }
        
        // Bloc bas à gauche : draft, date, contact, copyright
        const bottomY = pageHeight - 55;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
        const lines = [];
        if(tp.draft) lines.push(PdfTheme.cleanText(tp.draft));
        if(tp.date) {
            try {
                lines.push(new Date(tp.date).toLocaleDateString('fr-FR'));
            } catch(e) { lines.push(tp.date); }
        }
        if(tp.copyright) lines.push(PdfTheme.cleanText(tp.copyright));
        if(tp.contact) {
            lines.push('');
            lines.push(PdfTheme.cleanText(tp.contact));
        }
        let by = bottomY;
        lines.forEach(l => { doc.text(l, 25, by); by += 5.5; });
        
        // Notes en bas si présentes
        if(tp.notes) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            const notesLines = doc.splitTextToSize(PdfTheme.cleanText(tp.notes), pageWidth - 50);
            notesLines.slice(0, 4).forEach((l, i) => {
                doc.text(l, pageWidth - 25, pageHeight - 25 + (i * 4), { align: 'right' });
            });
        }
        
        // Footer unifié "X / N" centré (skipFirstPage:false car ici c'est l'unique page)
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { skipFirstPage: false, forDossier: !!opts.returnBlob });
        }
        
        // Téléchargement
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Page de titre'));
        Utils.toast('Page de titre exportée !', 'success');
        History.log('EXPORT', 'Page de titre PDF générée');
    }
};
