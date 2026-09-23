
  // ==========================================================================
  //  LES FAMILLES DE COMEDIENS ET LEUR NUMEROTATION OFFICIELLE (v602)
  // ==========================================================================
  //  Silhouettes, doublures, cascadeurs, pilotes : TOUS restent des comediens.
  //  Ils sont devant la camera, ont un contrat d'artiste et une convocation
  //  HMC ; en faire des techniciens leur ferait perdre la feuille de service
  //  comediens, le planning de presence et les colonnes du plan de travail.
  //  La famille se lit sur le GROUPE du comedien, par son nom — c'etait deja
  //  la regle de la feuille de service et du PDF, elle vit maintenant ICI et
  //  nulle part ailleurs.
  //  LE NUMERO SE POSE SUR LE GROUPE, PAS SUR LA PERSONNE : chaque famille a
  //  son prefixe et le debut de sa plage (modele AFAR), et le numero se
  //  calcule d'apres la place dans la famille. Personne ne le saisit, donc
  //  deux personnes ne peuvent pas porter le meme.
  //  L'ORDRE DANS UNE FAMILLE : celui des groupes (Casting Principal avant
  //  Roles Secondaires), puis celui des comediens dans leur groupe.
  //  UNE PLAGE EST UN REPERE, PAS UN MUR : un seizieme role prend le 16, une
  //  vingt-et-unieme silhouette muette le S21. Seule exception, les roles et
  //  les silhouettes parlantes partagent les memes chiffres : si les roles
  //  depassent 20, les parlantes commencent juste apres eux, sinon deux
  //  personnes porteraient le meme numero.
  const CastFamilies = {
    // Ordre = ordre des tableaux sur la feuille et des colonnes du plan de
    // travail. Les cles 'sil' et 'dbl' sont celles deja enregistrees dans
    // les jours (fdsHide) : les renommer ferait reapparaitre des tableaux
    // masques.
    LISTE: [
        { cle: 'role', label: 'Rôles',                 titre: 'RÔLE(S)',                   prefixe: '',  debut: 1 },
        { cle: 'sil',  label: 'Silhouettes parlantes', titre: 'SILHOUETTE(S) PARLANTE(S)', prefixe: '',  debut: 21 },
        { cle: 'silm', label: 'Silhouettes muettes',   titre: 'SILHOUETTE(S) MUETTE(S)',   prefixe: 'S', debut: 1 },
        { cle: 'dbl',  label: 'Doublures',             titre: 'DOUBLURE(S)',               prefixe: 'D', debut: 1 },
        { cle: 'casc', label: 'Cascadeurs',            titre: 'CASCADEUR(S)',              prefixe: 'C', debut: 1 },
        { cle: 'pil',  label: 'Pilotes',               titre: 'PILOTE(S)',                 prefixe: 'P', debut: 1 },
        { cle: 'figu', label: 'Figuration',            titre: 'FIGURATION',                prefixe: null }
    ],
    // L'ordre des tests compte : « Silhouettes muettes » contient aussi
    // « silhouette », et un groupe inconnu reste un role.
    deGroupe: (g) => {
        const n = String((g && g.name) || '');
        if(/figura/i.test(n)) return 'figu';
        if(/muet/i.test(n)) return 'silm';
        if(/silhouette/i.test(n)) return 'sil';
        if(/doublure/i.test(n)) return 'dbl';
        if(/cascad/i.test(n)) return 'casc';
        if(/pilote/i.test(n)) return 'pil';
        return 'role';
    },
    info: (cle) => CastFamilies.LISTE.find(f => f.cle === cle) || CastFamilies.LISTE[0],
    _groupes: () => (state.data.groups || []).filter(g => g && g.type === 'actor'),
    groupIds: (cle) => CastFamilies._groupes().filter(g => CastFamilies.deGroupe(g) === cle).map(g => g.id),
    de: (actor) => {
        if(!actor) return 'role';
        const g = CastFamilies._groupes().find(x => x.id === actor.group_id);
        return g ? CastFamilies.deGroupe(g) : 'role';
    },
    // Les comediens d'une famille, dans l'ordre officiel.
    membres: (cle) => {
        const actors = (state.data.actors || []).filter(a => a && CastFamilies.de(a) === cle);
        const rangs = {};
        CastFamilies._groupes().forEach((g, i) => { rangs[g.id] = i; });
        const rang = (a) => (rangs[a.group_id] !== undefined ? rangs[a.group_id] : 9999);
        return actors.map((a, i) => ({ a, i }))
            .sort((x, y) => (rang(x.a) - rang(y.a)) || (x.i - y.i))
            .map(x => x.a);
    },
    // Tous les numeros d'un coup : { idComedien: 'S3' }. La figuration n'en a pas.
    numeros: () => {
        const out = {};
        const nRoles = CastFamilies.membres('role').length;
        CastFamilies.LISTE.forEach(f => {
            if(f.prefixe === null) return;
            const debut = (f.cle === 'sil') ? Math.max(f.debut, nRoles + 1) : f.debut;
            CastFamilies.membres(f.cle).forEach((a, i) => { out[a.id] = f.prefixe + (debut + i); });
        });
        return out;
    },
    numero: (actor) => (actor ? (CastFamilies.numeros()[actor.id] || '') : ''),
    // Les groupes qui manquent a un projet ancien. Un projet cree avant la
    // v602 n'a ni silhouettes muettes, ni cascadeurs, ni pilotes ; et son
    // « Silhouettes » devient « Silhouettes parlantes » s'il n'a pas ete
    // renomme par l'utilisateur (un nom choisi ne se touche pas).
    completerGroupes: (data) => {
        if(!data || !Array.isArray(data.groups)) return;
        const g4 = data.groups.find(g => g.id === 'ga4');
        if(g4 && g4.name === 'Silhouettes') g4.name = 'Silhouettes parlantes';
        ['ga4', 'ga5', 'ga6', 'ga7', 'ga8'].forEach(gid => {
            if(data.groups.some(g => g.id === gid)) return;
            const def = CONFIG.defaultGroups.find(g => g.id === gid);
            if(def) data.groups.push(Object.assign({}, def));
        });
    }
  };
