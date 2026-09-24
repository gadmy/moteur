
const ExpensesCRUD = {
    // Stockage temporaire des pièces jointes en cours d'édition
    tempAttachments: [],
    
    // Ouvre le modal d'ajout
    openAddModal: () => {
        document.getElementById('expense-modal-title').textContent = '➕ Nouvelle Dépense';
        document.getElementById('expense-edit-id').value = '';
        document.getElementById('expense-title').value = '';
        document.getElementById('expense-amount-ht').value = '';
        document.getElementById('expense-amount-ttc').value = '';
        document.getElementById('expense-vat-rate').value = state.data.budget?.defaultVatRate || 20;
        document.getElementById('expense-category').value = '';
        document.getElementById('expense-subcategory').innerHTML = '<option value="">-- Sous-catégorie --</option>';
        document.getElementById('expense-description').value = '';
        document.getElementById('expense-status').value = 'pending';
        document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
        ExpensesCRUD.tempAttachments = [];
        ExpensesCRUD.renderAttachmentsList();
        Expenses.populatePaidBySelect();
        Expenses.populateCategories();
        Expenses.populateLinkSelect(null);
        document.getElementById('expense-paid-by').value = '';
        // Une depense qui n'existe pas encore n'a ni circuit de validation ni
        // trace : le bandeau est vide. Sans ce vidage il garderait celui de la
        // depense consultee juste avant.
        const wf = document.getElementById('expense-workflow-bar');
        if(wf) wf.innerHTML = '';
        const em = document.getElementById('expense-modal');
        em.classList.toggle('modal-stacked', !!document.querySelector('#planning-modal.active') || !!document.querySelector('#card-edit-modal.visible'));
        em.style.display = 'flex';
    },
    
    // Change de catégorie → met à jour les sous-catégories
    onCategoryChange: () => {
        const catId = document.getElementById('expense-category').value;
        const subcatSelect = document.getElementById('expense-subcategory');
        subcatSelect.innerHTML = '<option value="">-- Sous-catégorie --</option>';
        
        if(catId) {
            const cat = Expenses.getCategory(catId);
            if(cat && cat.subcats) {
                cat.subcats.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub.id;
                    opt.textContent = sub.name;
                    subcatSelect.appendChild(opt);
                });
            }
        }
    },
    
    // Calcul TTC depuis HT
    calculateTTCFromHT: () => {
        const ht = parseFloat(document.getElementById('expense-amount-ht').value) || 0;
        const vatRate = parseFloat(document.getElementById('expense-vat-rate').value) || 0;
        const ttc = Expenses.calculateTTC(ht, vatRate);
        document.getElementById('expense-amount-ttc').value = ttc || '';
    },
    
    // Calcul HT depuis TTC
    calculateHTFromTTC: () => {
        const ttc = parseFloat(document.getElementById('expense-amount-ttc').value) || 0;
        const vatRate = parseFloat(document.getElementById('expense-vat-rate').value) || 0;
        const ht = Expenses.calculateHT(ttc, vatRate);
        document.getElementById('expense-amount-ht').value = ht || '';
    },
    
    // Gérer l'upload de fichier
    handleFileUpload: async (input) => {
        const file = input.files[0];
        if(!file) return;
        
        const isImage = file.type.startsWith('image/');
        let dataUrl;
        let finalSize;
        
        if(isImage) {
            // Compression automatique pour les images : 1600px max + JPEG 0.85, max 600 Ko
            // (un peu plus tolérant que les autres car justificatif comptable, qualité utile)
            dataUrl = await Utils.compressImage(file, { maxDimension: 1600, maxKb: 600 });
            if(!dataUrl) { input.value = ''; return; } // erreur ou refus → toast déjà affiché
            finalSize = Math.round(dataUrl.length * 0.75);
        } else {
            // PDF/document : pas de compression, mais garder la limite de 5 Mo
            if(file.size > 5 * 1024 * 1024) {
                Utils.toast('Fichier trop volumineux (max 5 Mo)', 'error');
                input.value = '';
                return;
            }
            dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            finalSize = file.size;
        }
        
        const attachment = {
            id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: file.name,
            data: dataUrl,
            type: isImage ? 'photo' : 'document',
            size: finalSize
        };
        ExpensesCRUD.tempAttachments.push(attachment);
        ExpensesCRUD.renderAttachmentsList();
        Utils.toast('Fichier ajouté', 'success');
        input.value = '';
    },
    
    // Supprimer une pièce jointe
    removeAttachment: (attId) => {
        ExpensesCRUD.tempAttachments = ExpensesCRUD.tempAttachments.filter(a => a.id !== attId);
        ExpensesCRUD.renderAttachmentsList();
    },
    
    // Afficher la liste des pièces jointes
    renderAttachmentsList: () => {
        const container = document.getElementById('expense-attachments-list');
        if(!container) return;
        
        if(ExpensesCRUD.tempAttachments.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        ExpensesCRUD.tempAttachments.forEach(att => {
            const isImage = att.type === 'photo' || (att.data && att.data.startsWith('data:image'));
            const src = att.data || att.url;
            
            html += `<div style="position: relative; display: inline-block;">
                ${isImage ? `<img src="${src}" alt="Pièce jointe" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);">` : 
                `<div style="width: 80px; height: 80px; background: var(--bg); border-radius: 6px; border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--text-sec); padding: 5px; text-align: center;">
                    📄<br>${Utils.escape(att.name.substring(0, 12))}${att.name.length > 12 ? '...' : ''}
                </div>`}
                <button onclick="app.ExpensesCRUD.removeAttachment('${att.id}')" style="position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; border-radius: 50%; background: var(--danger); color: white; border: none; cursor: pointer; font-size: 0.7rem; line-height: 1;">✕</button>
            </div>`;
        });
        
        container.innerHTML = html;
    },
    
    // Édite une dépense
    // ===== BANDEAU DE VALIDATION DE LA FICHE (8e, 25 aout) =====
    // Valider / Remonter / Renvoyer vivaient au pied de chaque grande fiche de
    // la liste. En passant les depenses en cartes compactes, ces trois actions
    // remontent ICI, en tete de la fiche : on se prononce apres avoir vu le
    // montant, le justificatif et le motif d'un eventuel renvoi, pas avant.
    // Les memes droits qu'avant, au mot pres : un responsable de poste peut
    // valider ou remonter ce qui est en attente, le responsable global tranche
    // aussi ce qui lui a ete remonte.
    workflowBarHtml: (exp) => {
        if(!exp) return '';
        const me = state.currentUser?.email;
        const isGlobal = state.data.budget?.manager === me || state.currentRole === 'owner';
        const isDept = Expenses.isDeptManager(exp.category || exp.department);
        const canValidate = (isGlobal && (exp.status === 'pending' || exp.status === 'escalated'))
                         || (isDept && exp.status === 'pending');
        const canEscalate = isDept && exp.status === 'pending' && !isGlobal;
        const canReturn = (isDept || isGlobal) && (exp.status === 'pending' || exp.status === 'escalated');
        const motif = (exp.status === 'returned' && exp.returnedReason)
            ? `<div style="background: rgba(245,158,11,0.1); border-left: 3px solid #f59e0b; padding: 8px 12px; margin-bottom: 10px; font-size: 0.85rem;"><strong>↩️ Renvoyé par ${Utils.escape(exp.returnedByName || 'un responsable')}</strong><br>${Utils.escape(exp.returnedReason)}</div>`
            : '';
        const trace = [];
        if(exp.createdByName || exp.createdBy) trace.push('👤 ' + Utils.escape(exp.createdByName || exp.createdBy));
        if(exp.validatedBy) trace.push('✓ Validé par ' + Utils.escape(exp.validatedByName || exp.validatedBy));
        if(exp.status === 'escalated') trace.push('⬆️ Remonté au responsable global');
        if(exp.salaryMissingRate) trace.push('⚠️ Tarif manquant');
        const traceHtml = trace.length ? `<div style="font-size: 0.78rem; color: var(--text-sec); margin-bottom: 8px;">${trace.join(' • ')}</div>` : '';
        const btns = [];
        if(canValidate) btns.push(`<button class="expense-btn-approve" onclick="app.Expenses.validateExpense('${exp.id}')">✅ Valider</button>`);
        if(canEscalate) btns.push(`<button class="expense-btn-escalate" onclick="app.Expenses.escalateExpense('${exp.id}')">⬆️ Remonter</button>`);
        if(canReturn) btns.push(`<button class="expense-btn-return" onclick="app.Expenses.openReturnModal('${exp.id}')">↩️ Renvoyer</button>`);
        if(!motif && !traceHtml && !btns.length) return '';
        return motif + traceHtml + (btns.length ? `<div class="expense-card-actions" style="margin: 0 0 12px 0;">${btns.join('')}</div>` : '');
    },

    editExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        document.getElementById('expense-modal-title').textContent = '✏️ Modifier la Dépense';
        document.getElementById('expense-edit-id').value = id;
        document.getElementById('expense-title').value = expense.title || '';
        
        // Montants
        document.getElementById('expense-amount-ht').value = expense.amountHT || expense.amount || '';
        document.getElementById('expense-vat-rate').value = expense.vatRate || 0;
        document.getElementById('expense-amount-ttc').value = expense.amountTTC || expense.amount || '';
        
        // Catégorie
        Expenses.populateCategories();
        document.getElementById('expense-category').value = expense.category || expense.department || '';
        ExpensesCRUD.onCategoryChange();
        if(expense.subcategory) {
            document.getElementById('expense-subcategory').value = expense.subcategory;
        }
        
        document.getElementById('expense-description').value = expense.description || '';
        document.getElementById('expense-status').value = expense.status || 'pending';
        document.getElementById('expense-date').value = expense.date || '';
        
        // Pièces jointes
        ExpensesCRUD.tempAttachments = expense.attachments ? [...expense.attachments] : [];
        if(expense.photo && ExpensesCRUD.tempAttachments.length === 0) {
            ExpensesCRUD.tempAttachments = [{
                id: 'att_migrated',
                name: 'justificatif.jpg',
                url: expense.photo,
                type: 'photo'
            }];
        }
        ExpensesCRUD.renderAttachmentsList();
        
        Expenses.populatePaidBySelect();
        document.getElementById('expense-paid-by').value = expense.paidBy || '';
        Expenses.populateLinkSelect(expense.link || null);
        
        const wf = document.getElementById('expense-workflow-bar');
        if(wf) wf.innerHTML = ExpensesCRUD.workflowBarHtml(expense);
        
        // 8c : la depense s'ouvre desormais depuis une fiche, elle-meme parfois
        // posee sur la feuille de service. Le palier n'est pris que si une de ces
        // deux fenetres est effectivement a l'ecran, et RETIRE sinon : sans ce
        // retrait la classe survivrait a la premiere ouverture empilee et la
        // fenetre resterait au-dessus de tout pour le reste de la session.
        const em = document.getElementById('expense-modal');
        const fdsOpen = !!document.querySelector('#planning-modal.active');
        const ficheOpen = !!document.querySelector('#card-edit-modal.visible');
        em.classList.toggle('modal-stacked', fdsOpen || ficheOpen);
        em.style.display = 'flex';
    },
    
    // Sauvegarde une dépense
    saveExpense: () => {
        const title = document.getElementById('expense-title').value.trim();
        const amountHT = parseFloat(document.getElementById('expense-amount-ht').value) || 0;
        const category = document.getElementById('expense-category').value;
        
        if(!title || !amountHT || !category) {
            Utils.toast('Veuillez remplir les champs obligatoires (Titre, Montant HT, Catégorie)', 'warning');
            return;
        }
        
        const editId = document.getElementById('expense-edit-id').value;
        
        if(!state.data.expenses) state.data.expenses = [];
        
        const paidByValue = document.getElementById('expense-paid-by').value;
        const paidBySelect = document.getElementById('expense-paid-by');
        const paidByName = paidByValue ? paidBySelect.options[paidBySelect.selectedIndex].text : '';
        
        const vatRate = parseFloat(document.getElementById('expense-vat-rate').value) || 0;
        const amountTTC = parseFloat(document.getElementById('expense-amount-ttc').value) || Expenses.calculateTTC(amountHT, vatRate);
        
        const expenseData = {
            title: title,
            // Nouveaux champs TVA
            amountHT: amountHT,
            vatRate: vatRate,
            amountTTC: amountTTC,
            // Rétrocompatibilité
            amount: amountHT,
            // Catégories CNC
            category: category,
            subcategory: document.getElementById('expense-subcategory').value || '',
            department: category, // Alias pour rétrocompatibilité
            // Autres champs
            description: document.getElementById('expense-description').value.trim(),
            status: document.getElementById('expense-status').value,
            date: document.getElementById('expense-date').value,
            // Pièces jointes
            attachments: [...ExpensesCRUD.tempAttachments],
            photo: ExpensesCRUD.tempAttachments.length > 0 ? (ExpensesCRUD.tempAttachments[0].url || ExpensesCRUD.tempAttachments[0].data || '') : '',
            paidBy: paidByValue,
            paidByName: paidByName,
            // Lien facultatif vers UN element du film (etape 7d). null = aucun.
            link: Expenses.parseLink(document.getElementById('expense-link')?.value || ''),
            updatedAt: new Date().toISOString()
        };
        
        const currency = state.data.budget?.currency || '€';
        const amountStr = `${amountTTC.toFixed(2)} ${currency}`;
        if(editId) {
            // Modification
            const idx = state.data.expenses.findIndex(e => e.id === editId);
            if(idx > -1) {
                state.data.expenses[idx] = { ...state.data.expenses[idx], ...expenseData };
            }
            History.log('EDIT', `Modification dépense : ${title} (${amountStr})`, { target: { kind: 'expense', id: editId, label: title }, link: { kind: 'expense', id: editId } });
        } else {
            // Création
            expenseData.id = 'exp_' + Utils.generateUniqueId();
            expenseData.createdAt = new Date().toISOString();
            expenseData.createdBy = state.currentUser?.email;
            expenseData.createdByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
            state.data.expenses.push(expenseData);
            History.log('ADD', `Ajout dépense : ${title} (${amountStr})`, { target: { kind: 'expense', id: expenseData.id, label: title }, link: { kind: 'expense', id: expenseData.id } });
            
            // Notifier le responsable concerné
            ExpensesCRUD.notifyExpenseUpdate(expenseData, 'new');
        }
        
        Store.save();
        document.getElementById('expense-modal').style.display = 'none';
        Expenses.render();
        Notifications.updateBadge();
        
        // Vérifier les alertes de dépassement
        ExpensesCRUD.checkBudgetAlerts(category);
    },
    
    // Vérifier les alertes de dépassement après ajout/modif
    checkBudgetAlerts: (catId) => {
        const cat = Expenses.getCategory(catId);
        if(!cat) return;
        
        const budget = state.data.budget?.previsionnel?.[catId];
        if(!budget || !budget.budgetHT) return;
        
        const vatMode = state.data.budget?.vatMode || 'HT';
        const budgetAmount = vatMode === 'HT' ? budget.budgetHT : budget.budgetTTC;
        
        const expenses = state.data.expenses || [];
        const spent = expenses
            .filter(e => (e.category === catId || e.department === catId) && (e.status === 'approved' || e.status === 'done'))
            .reduce((sum, e) => sum + (vatMode === 'HT' ? (e.amountHT || e.amount || 0) : (e.amountTTC || e.amount || 0)), 0);
        
        const percent = Math.round((spent / budgetAmount) * 100);
        const thresholds = state.data.budget?.alertThresholds || { warning: 80, danger: 100 };
        
        if(percent >= thresholds.danger) {
            Utils.toast(`🔴 Attention ! Le budget "${cat.name}" est dépassé (${percent}%)`, 'error');
        } else if(percent >= thresholds.warning) {
            Utils.toast(`⚠️ Le budget "${cat.name}" atteint ${percent}%`, 'warning');
        }
    },
    
    // Supprime une dépense
    deleteExpense: async (id) => {
        if(!await ConfirmModal.confirmDelete("Cette dépense sera supprimée.")) return;
        
        const expense = state.data.expenses?.find(e => e.id === id);
        const expenseTitle = expense?.title || 'sans titre';
        const currency = state.data.budget?.currency || '€';
        const amountStr = expense ? `${(expense.amountTTC || expense.amount || 0).toFixed(2)} ${currency}` : '?';
        
        // [Phase D] Capturer le recoverable AVANT suppression
        const expenseLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const expenseRecoverable = expense ? await History.captureRecoverable(expense, 'expense', expenseLogId) : null;
        
        state.data.expenses = state.data.expenses.filter(e => e.id !== id);
        History.log('DELETE', `Suppression dépense : ${expenseTitle} (${amountStr})`, {
            target: { kind: 'expense', id: id, label: expenseTitle },
            recoverable: expenseRecoverable
        });
        Store.save();
        Expenses.render();
    },
    
    // Valide directement une dépense
    // ===== PASTILLE DE STATUT CLIQUABLE (8e, 25 aout) =====
    // La pastille d'angle de la carte n'etait qu'un temoin. Elle fait maintenant
    // tourner le statut sur le cycle courant d'une facture :
    //   ⏳ En attente  ->  ✅ Validé  ->  💰 Payé  ->  ⏳ En attente
    // Les trois autres etats (⬆️ remonté, ↩️ renvoyé, ❌ refusé) appartiennent au
    // circuit de validation et ne sont PAS produits ici : un clic dessus ramene
    // simplement la depense en attente, c'est-a-dire la reprend en main. Les
    // memes droits que les boutons de la fiche s'appliquent — sans cela la
    // pastille serait une porte derobee pour se valider ses propres depenses.
    cycleStatus: (id) => {
        const exp = state.data.expenses?.find(e => e.id === id);
        if(!exp) return;
        const me = state.currentUser?.email;
        const isGlobal = state.data.budget?.manager === me || state.currentRole === 'owner';
        const isDept = Expenses.isDeptManager(exp.category || exp.department);
        if(!isGlobal && !isDept) { Utils.toast('Seul un responsable de budget peut changer le statut.', 'error'); return; }
        const next = { pending: 'approved', approved: 'done', done: 'pending' };
        const target = next[exp.status] || 'pending';
        if(target === 'approved') { ExpensesCRUD.validateExpense(id); return; }
        exp.status = target;
        if(target === 'done') { exp.paidAt = new Date().toISOString(); }
        if(target === 'pending') {
            // Reprise en main : on efface la trace de validation, sinon la
            // depense afficherait « validée par » tout en etant en attente.
            delete exp.validatedAt; delete exp.validatedBy; delete exp.validatedByName;
        }
        Store.save();
        Expenses.render();
        Utils.toast(target === 'done' ? 'Dépense marquée payée' : 'Dépense remise en attente', 'success');
    },

    validateExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        expense.status = 'approved';
        expense.validatedAt = new Date().toISOString();
        expense.validatedBy = state.currentUser?.email;
        expense.validatedByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
        
        Store.save();
        Expenses.render();
        Utils.toast('Dépense validée !', 'success');
        
        // Notifier le créateur
        ExpensesCRUD.notifyExpenseUpdate(expense, 'approved');
    },
    
    // Remonte une dépense au responsable budget global
    escalateExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        expense.status = 'escalated';
        expense.escalatedAt = new Date().toISOString();
        expense.escalatedBy = state.currentUser?.email;
        expense.escalatedByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
        
        Store.save();
        Expenses.render();
        Utils.toast('Dépense remontée au responsable budget global', 'info');
        
        // Notifier le responsable budget global
        ExpensesCRUD.notifyExpenseUpdate(expense, 'escalated');
    },
    
    // Ouvre le modal de renvoi
    openReturnModal: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        const currency = state.data.budget?.currency || '€';
        
        const modal = document.createElement('div');
        modal.id = 'return-expense-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div class="modal-panel-450">
                <h3 style="margin:0 0 20px; color:var(--text-main);">↩️ Renvoyer la dépense</h3>
                
                <div style="background: var(--bg); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">${Utils.escape(expense.title)}</div>
                    <div style="font-size: 1.2rem; color: var(--primary); font-weight: bold;">${parseFloat(expense.amount).toLocaleString()} ${currency}</div>
                    <div style="font-size: 0.85rem; color: var(--text-sec); margin-top: 5px;">Par : ${Utils.escape(expense.createdByName || expense.createdBy)}</div>
                </div>
                
                <label class="form-label-alt">Raison du renvoi *</label>
                <textarea id="return-reason" placeholder="Expliquez pourquoi cette dépense est renvoyée (trop chère, mauvais choix, informations manquantes...)" data-tooltip="Expliquez pourquoi cette dépense est renvoyée (trop chère, mauvais choix, informations manquantes...)" style="width:100%; padding:12px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main); min-height:100px; resize:vertical; margin-bottom:20px;"></textarea>
                
                <div class="flex-end">
                    <button onclick="document.getElementById('return-expense-modal').remove()" class="btn btn--outline">Annuler</button>
                    <button onclick="app.ExpensesCRUD.returnExpense('${id}')" style="padding:10px 20px; background:#f59e0b; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">↩️ Renvoyer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.getElementById('return-reason').focus();
    },
    
    // Renvoie une dépense au créateur
    returnExpense: (id) => {
        const reason = document.getElementById('return-reason').value.trim();
        if(!reason) {
            Utils.toast('Veuillez indiquer la raison du renvoi', 'warning');
            return;
        }
        
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        expense.status = 'returned';
        expense.returnedAt = new Date().toISOString();
        expense.returnedBy = state.currentUser?.email;
        expense.returnedByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
        expense.returnedReason = reason;
        
        Store.save();
        document.getElementById('return-expense-modal').remove();
        Expenses.render();
        Utils.toast('Dépense renvoyée au demandeur', 'info');
        
        // Notifier le créateur
        ExpensesCRUD.notifyExpenseUpdate(expense, 'returned');
    },
    
    // Notifie les personnes concernées lors d'une mise à jour de dépense
    notifyExpenseUpdate: async (expense, action) => {
        const projectName = state.data.title || 'Projet';
        const currency = state.data.budget?.currency || '€';
        
        let recipientEmail = null;
        let recipientName = null;
        let subject = '';
        let content = '';
        
        if(action === 'approved') {
            // Notifier le créateur que sa dépense est validée
            recipientEmail = expense.createdBy;
            recipientName = expense.createdByName;
            subject = `✅ Dépense validée - ${projectName}`;
            content = `Votre dépense "${expense.title}" de ${expense.amount} ${currency} a été validée par ${expense.validatedByName || 'le responsable budget'}.`;
        } else if(action === 'returned') {
            // Notifier le créateur que sa dépense est renvoyée
            recipientEmail = expense.createdBy;
            recipientName = expense.createdByName;
            subject = `↩️ Dépense renvoyée - ${projectName}`;
            content = `Votre dépense "${expense.title}" de ${expense.amount} ${currency} a été renvoyée par ${expense.returnedByName || 'le responsable'}.\n\nRaison : ${expense.returnedReason}`;
        } else if(action === 'escalated') {
            // Notifier le responsable budget global
            recipientEmail = state.data.budget?.manager;
            const managerPerson = Expenses.findPersonByEmail(recipientEmail);
            recipientName = managerPerson?.name;
            subject = `⬆️ Dépense remontée - ${projectName}`;
            content = `Une dépense a été remontée pour validation :\n\n"${expense.title}" - ${expense.amount} ${currency}\nDemandée par : ${expense.createdByName}\nRemontée par : ${expense.escalatedByName}`;
        } else if(action === 'new') {
            // Notifier le responsable concerné (département ou global)
            const deptManager = state.data.budget?.deptManagers?.[expense.department];
            if(deptManager && expense.department !== 'divers') {
                recipientEmail = deptManager.email;
                if(!deptManager.emailNotif) recipientEmail = null; // Pas de mail si désactivé
            } else {
                recipientEmail = state.data.budget?.manager;
                if(state.data.budget?.managerEmailNotif === false) recipientEmail = null;
            }
            const recipientPerson = Expenses.findPersonByEmail(recipientEmail);
            recipientName = recipientPerson?.name;
            subject = `💰 Nouvelle dépense à valider - ${projectName}`;
            content = `Une nouvelle dépense attend votre validation :\n\n"${expense.title}" - ${expense.amount} ${currency}\nDemandée par : ${expense.createdByName}`;
        }
        
        // Envoyer la notification interne (messagerie du site)
        if(recipientEmail) {
            ExpensesCRUD.sendInternalNotification(recipientEmail, subject, content, expense.id);
        }
        
        // Envoyer l'email si activé
        // Note: L'envoi d'email dépend de la configuration Supabase
    },
    
    // Envoie une notification interne via le système de messagerie
    sendInternalNotification: (recipientEmail, subject, content, expenseId) => {
        // Utiliser le système de notifications existant ou créer un nouveau
        if(!state.data.notifications) state.data.notifications = [];
        
        state.data.notifications.push({
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            type: 'expense',
            recipientEmail: recipientEmail,
            subject: subject,
            content: content,
            expenseId: expenseId,
            read: false,
            createdAt: new Date().toISOString(),
            createdBy: state.currentUser?.email
        });
        
        Store.save();
    },
    
    // Dupliquer une dépense
    duplicateExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        const newExpense = {
            ...expense,
            id: 'exp_' + Utils.generateUniqueId(),
            title: expense.title + ' (copie)',
            status: 'pending',
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            createdBy: state.currentUser?.email,
            createdByName: state.userProfile?.displayName || state.currentUser?.email?.split('@')[0],
            validatedAt: null,
            validatedBy: null,
            validatedByName: null,
            validationComment: null,
            returnedReason: null,
            returnedBy: null,
            returnedByName: null,
            escalatedAt: null,
            escalatedBy: null,
            escalatedByName: null
        };
        
        // Retirer les références aux salaires si c'était une dépense auto
        delete newExpense.salaryPersonId;
        delete newExpense.salaryPersonType;
        delete newExpense.salaryMissingRate;
        
        if(!state.data.expenses) state.data.expenses = [];
        state.data.expenses.push(newExpense);
        
        Store.save();
        Expenses.render();
        // La copie garde les justificatifs ET le lien de l'originale : c'est ce qui
        // permet de ventiler UNE facture couvrant plusieurs produits en plusieurs
        // lignes sans re-televerser la photo a chaque fois. On enchaine donc
        // directement sur la modification, sinon il faudrait retrouver la carte
        // « (copie) » dans la liste pour corriger titre, montant et lien.
        setTimeout(() => {
            ExpensesCRUD.editExpense(newExpense.id);
            const t = document.getElementById('expense-title');
            if(t) { t.focus(); t.select(); }
        }, 150);
        Utils.toast('Copie créée : ajuste le titre, le montant et le lien', 'success');
    }
};
