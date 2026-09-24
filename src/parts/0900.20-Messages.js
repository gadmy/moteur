
// --- MODULE MESSAGES V85 ---
const Messages = {
    // Messagerie interne retirée — ne restent que les helpers d'envoi d'email (Brevo).// ===================== EMAIL & COMPOSITION =====================
    // Nettoie une string pour l'email (supprime caractères problématiques)
    sanitizeForEmail: (str) => {
        if(str === null || str === undefined) return '';
        return String(str)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprime accents
            .replace(/[\n\r\t]/g, ' ')
            .replace(/[""''«»]/g, "'")
            .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[ïî]/g, 'i')
            .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/[ç]/g, 'c')
            .replace(/[ÀÂÄÁ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÏÎ]/g, 'I')
            .replace(/[ÔÖ]/g, 'O').replace(/[ÙÛÜÚ]/g, 'U').replace(/[Ç]/g, 'C')
            .replace(/[^\x20-\x7E]/g, '') // Garde uniquement ASCII imprimable
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 500) || 'N/A';
    },
    
    // Templates d'email selon le type
    emailTemplates: {
        'claim': (data) => ({
            title: 'Votre profil vous attend sur moteur.studio',
            message: `${data.senderName} a cree votre profil ${data.typeLabel} dans le projet "${data.projectTitle}" sur moteur.studio. Voulez-vous le revendiquer ? Connectez-vous sur https://moteur.studio pour recuperer ce profil, le completer et apparaitre dans l'Univers.`
        }),
        'invitation': (data) => ({
            title: 'Invitation a rejoindre un projet sur moteur.studio',
            message: `${data.senderName} vous invite a rejoindre le projet "${data.projectTitle}" en tant que ${data.role} sur moteur.studio. Connectez-vous sur https://moteur.studio : l'invitation vous attend sur votre tableau de bord, a vous d'accepter ou de refuser. Si vous acceptez, vous pourrez quitter le projet a tout moment.`
        }),
        'contact': (data) => ({
            title: 'Nouveau message',
            message: `${data.senderName} vous a contacte. Connectez-vous a Moteur pour lire le message et repondre.`
        }),
        'project_contact': (data) => ({
            title: 'Message pour votre projet',
            message: `${data.senderName} vous a contacte concernant votre projet "${data.projectTitle}". Sujet: ${data.subject}. Connectez-vous a Moteur pour lire le message.`
        }),
        'reply': (data) => ({
            title: 'Reponse recue',
            message: `${data.senderName} vous a repondu. Connectez-vous a Moteur pour lire la reponse.`
        }),
        'callsheet': (data) => ({
            title: 'Convocation tournage',
            message: `Vous etes convoque pour le tournage de "${data.projectName}" le ${data.shootDate}. Lieu: ${data.location}. Heure de convocation: ${data.callTime}. Voir et imprimer votre feuille de service: ${data.publicLink || 'https://moteur.studio'}`
        }),
        'default': (data) => ({
            title: 'Notification',
            message: data.customMessage || 'Vous avez recu une notification sur Moteur. Connectez-vous pour en savoir plus.'
        })
    },
    
    // Envoie une notification par email (ping simple)
    sendEmailPing: async (toEmail, toName, emailType = 'default', data = {}) => {
        const sanitize = Messages.sanitizeForEmail;
        const safeToEmail = sanitize(toEmail);
        if(!safeToEmail) { console.warn('Email invalide - ping ignoré'); return; }
        const safeToName = sanitize(toName) || safeToEmail.split('@')[0] || 'Utilisateur';

        // Types gérés nativement par l'Edge Function (beaux gabarits + bouton)
        const nativeTypes = ['invitation', 'claim', 'added', 'request', 'callsheet'];
        let body;
        if(nativeTypes.includes(emailType)) {
            body = {
                to: safeToEmail,
                toName: safeToName,
                type: emailType,
                data: {
                    senderName: sanitize(data.senderName) || 'Un utilisateur',
                    projectTitle: sanitize(data.projectTitle) || 'votre projet',
                    typeLabel: sanitize(data.typeLabel) || 'membre',
                    role: sanitize(data.role) || 'collaborateur',
                    projectName: sanitize(data.projectName) || sanitize(data.projectTitle) || 'le projet',
                    shootDate: sanitize(data.shootDate) || '',
                    location: sanitize(data.location) || '',
                    callTime: sanitize(data.callTime) || '',
                    publicLink: data.publicLink || 'https://moteur.studio'
                }
            };
        } else {
            const templateFn = Messages.emailTemplates[emailType] || Messages.emailTemplates['default'];
            const t = templateFn({
                senderName: sanitize(data.senderName) || 'Un utilisateur',
                projectTitle: sanitize(data.projectTitle) || 'Projet',
                typeLabel: sanitize(data.typeLabel) || 'membre',
                role: sanitize(data.role) || 'collaborateur',
                subject: sanitize(data.subject) || 'Sans sujet',
                customMessage: sanitize(data.customMessage) || '',
                projectName: sanitize(data.projectName) || sanitize(data.projectTitle) || 'le projet',
                shootDate: sanitize(data.shootDate) || '',
                location: sanitize(data.location) || '',
                callTime: sanitize(data.callTime) || '',
                publicLink: data.publicLink || 'https://moteur.studio'
            });
            body = { to: safeToEmail, toName: safeToName, type: 'generic', data: { subject: t.title, title: t.title, message: t.message } };
        }

        try {
            const { error } = await supabase.functions.invoke('super-action', { body });
            if(error) console.warn('Erreur ping email:', error);
        } catch(e) {
            console.error('Erreur ping email:', e);
        }
    },
};
