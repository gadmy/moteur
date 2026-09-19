
  const PlanningCallSheets = {
    // Ouverture de la fenetre des feuilles de service (extrait du coeur de Planning, v578).
    openCallSheets: () => {
        const modal = document.getElementById('callsheets-modal');
        const list = document.getElementById('callsheets-list');
        
        if(!state.data.shootingDays || state.data.shootingDays.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-sec);"><p>Aucun jour de tournage planifié.</p><p>Créez un jour de tournage depuis le calendrier.</p></div>';
        } else {
            // Trier par date
            const sortedDays = [...state.data.shootingDays].sort((a, b) => new Date(a.date) - new Date(b.date));
            
            let html = '<div style="display:flex; flex-direction:column; gap:15px;">';
            
            sortedDays.forEach(day => {
                const startDate = day.startDate || day.date;
                const endDate = day.endDate || startDate;
                const startDateObj = new Date(startDate);
                const endDateObj = new Date(endDate);
                const dateFormatted = startDate === endDate 
                    ? startDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    : startDateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' → ' + endDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                const isPast = endDateObj < new Date();
                const isToday = Planning.formatDate(startDateObj) === Planning.formatDate(new Date()) || Planning.formatDate(endDateObj) === Planning.formatDate(new Date());
                const status = day.validated ? '✅ Validée' : (isPast ? '⚠️ Passée' : (isToday ? '🎬 Aujourd\'hui' : '📝 En préparation'));
                const statusColor = day.validated ? 'var(--success)' : (isPast ? 'var(--danger)' : (isToday ? 'var(--primary)' : 'var(--text-sec)'));
                
                html += `<div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold; font-size:1.1rem;">${Utils.escape(day.name || 'Tournage')} - ${dateFormatted}</div>
                        <div style="color:var(--text-sec); font-size:0.9rem; margin-top:5px;">
                            📍 ${day.location || 'Lieu non défini'} • 
                            🎬 ${day.scenes?.length || 0} scène(s) • 
                            👥 ${day.callSheet?.length || 0} convoqué(s)
                        </div>
                        <div style="margin-top:8px; font-size:0.85rem; color:${statusColor}; font-weight:500;">${status}</div>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button onclick="app.Planning.editShootDay('${day.id}')" style="padding:8px 15px; background:var(--primary); color:white; border:none; border-radius:6px; cursor:pointer;">✏️ Modifier</button>
                        <button onclick="app.Planning.exportPlanningPDF({ dayIds: ['${day.id}'], includeCover: false })" style="padding:8px 15px; background:var(--panel-bg); border:1px solid var(--border); border-radius:6px; cursor:pointer;">📄 PDF</button>
                        <button onclick="app.Planning.sendCallSheet('${day.id}')" style="padding:8px 15px; background:var(--warning, #FF9800); color:white; border:none; border-radius:6px; cursor:pointer;">📧 Envoyer</button>
                        <button onclick="app.Planning.validateCallSheet('${day.id}')" style="padding:8px 15px; background:${day.validated ? 'var(--text-sec)' : 'var(--success)'}; color:white; border:none; border-radius:6px; cursor:pointer;">${day.validated ? '🔓 Dé-valider' : '✅ Valider'}</button>
                        <button onclick="app.Planning.deleteShootDayFromList('${day.id}')" style="padding:8px 15px; background:var(--danger); color:white; border:none; border-radius:6px; cursor:pointer;">🗑️ Supprimer</button>
                    </div>
                </div>`;
            });
            
            html += '</div>';
            list.innerHTML = html;
        }
        
        modal.style.display = 'flex';
    },
    
    closeCallSheets: () => {
        document.getElementById('callsheets-modal').style.display = 'none';
    },
    
    validateCallSheet: (dayId) => {
        const day = state.data.shootingDays.find(d => d.id === dayId);
        if(!day) return;
        
        day.validated = !day.validated;
        Store.save();
        Planning.openCallSheets(); // Rafraîchir la liste
    },
    
    publishCallSheet: async (shootDay) => {
        // Génère le PDF du jour (rendu identique au Dossier de Production) et l'uploade
        const token = (crypto.randomUUID ? crypto.randomUUID() : 'fds_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11));
        try {
            const blob = await PlanningExport.exportPlanningPDF({ dayIds: [shootDay.id], includeCover: false, returnBlob: true });
            if(!blob) { Utils.toast('Erreur génération du PDF', 'error'); return null; }
            const filePath = `${state.currentProjectId || 'projet'}/${token}.pdf`;
            const { error: upErr } = await supabase.storage.from('callsheets').upload(filePath, blob, { contentType: 'application/pdf', upsert: false });
            if(upErr) { console.error('Erreur upload feuille:', upErr); Utils.toast('Erreur lors de l\'envoi du PDF', 'error'); return null; }
            if(shootDay.callsheetFile && shootDay.callsheetFile !== filePath) {
                const { error: rmOld } = await supabase.storage.from('callsheets').remove([shootDay.callsheetFile]);
                if(rmOld) console.warn('Purge ancienne feuille échouée:', rmOld.message);
            }
            shootDay.callsheetFile = filePath;
            Store.save();
            const dlName = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
                ? PdfTheme.filename('Feuille de service - ' + Planning.dayShortLabel(shootDay))
                : `${state.data.title || 'Projet'} - Feuille de service - moteur.studio.pdf`;
            const { data: urlData } = supabase.storage.from('callsheets').getPublicUrl(filePath, { download: dlName });
            return urlData?.publicUrl || null;
        } catch(e) {
            console.error('Erreur publication feuille:', e);
            return null;
        }
    },
    
    sendCallSheet: async (dayId) => {
        const shootDay = state.data.shootingDays.find(sd => sd.id === dayId);
        if(!shootDay) {
            Utils.toast('Jour de tournage introuvable', 'error');
            return;
        }
        
        const projectName = state.data.title || 'Projet';
        const dateFormatted = new Date(shootDay.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const senderName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0] || 'La production';
        
        // Collecter toutes les personnes à notifier
        const recipients = [];
    if(shootDay.callSheet && shootDay.callSheet.length > 0) {
            for(const call of shootDay.callSheet) {
                let person = null;
                
                if(call.type === 'actor') {
                    person = state.data.actors.find(a => a.id === call.personId);
                } else if(call.type === 'crew') {
                    person = state.data.crew.find(c => c.id === call.personId);
                }
                
                if(person && person.email) {
                    recipients.push({
                        name: person.name || 'Inconnu',
                        email: person.email,
                        callTime: call.callTime || shootDay.crewCall || 'À confirmer',
                        notes: call.notes || ''
                    });
                }
            }
        }
        
        if(recipients.length === 0) {
            Utils.toast('Aucune personne avec email dans cette feuille de service', 'warning');
            return;
        }
        
        if(!await ConfirmModal.show({ title: `Envoyer la feuille de service ${Planning.dayShortLabel(shootDay)} ?`, message: `${recipients.length} destinataire(s) :\n\n${recipients.map(r => '• ' + Utils.escape(r.name)).join('\n')}`, icon: '📧', confirmText: 'Envoyer' })) {
            return;
        }
        
        // Publier la feuille de service pour générer le lien
        Utils.toast('Publication de la feuille de service...', 'info');
        const publicLink = await PlanningCallSheets.publishCallSheet(shootDay);
        if(!publicLink) {
            Utils.toast('Erreur lors de la publication', 'error');
            return;
        }
        
        let sent = 0;
        let errors = 0;
        
        for(const recipient of recipients) {
            try {
                
                // Envoyer email avec lien public
                await Messages.sendEmailPing(recipient.email, recipient.name, 'callsheet', {
                    projectName: projectName,
                    shootDate: dateFormatted,
                    location: shootDay.location || 'À confirmer',
                    callTime: recipient.callTime,
                    senderName: senderName,
                    publicLink: publicLink
                });
                
                sent++;
            } catch(e) {
                console.error(`❌ Erreur envoi à ${recipient.name}:`, e);
                errors++;
            }
        }
        
        if(sent > 0) {
            Utils.toast(`✅ ${sent} convocation(s) envoyée(s) !`, 'success');
        }
        if(errors > 0) {
            Utils.toast(`⚠️ ${errors} erreur(s) d'envoi`, 'warning');
        }
    },
  };
