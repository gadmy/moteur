
  // ==========================================================================
  //  LES FAMILLES DE COMEDIENS ET LEUR NUMEROTATION OFFICIELLE (v602)
  // ==========================================================================
  //  Silhouettes, doublures, cascadeurs, pilotes : TOUS restent des comediens.
  //  Ils sont devant la camera, ont un contrat d'artiste et une convocation
  //  HMC ; en faire des techniciens leur ferait perdre la feuille de service
  //  comediens, le planning de presence et les colonnes du plan de travail.
  //  La famille se lit sur le GROUPE du comedien (voir OFFICIELS). Elle vit
  //  ICI et nulle part ailleurs : la feuille de service, son PDF et le plan
  //  de travail la lisaient chacun a leur maniere.
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
    // LA LISTE EST FERMEE (v602, decision du developpeur) : huit groupes
    // tires du metier, dans cet ordre, et on n'en cree pas d'autre. Un
    // comedien a donc toujours un numero officiel (sauf la figuration, qui
    // n'en a pas dans la pratique). La famille se lit par l'IDENTIFIANT du
    // groupe ; le nom ne sert plus que de repli pour une donnee ancienne.
    OFFICIELS: [
        { id: 'ga1', famille: 'role' }, { id: 'ga2', famille: 'role' },
        { id: 'ga4', famille: 'sil' },  { id: 'ga6', famille: 'silm' },
        { id: 'ga5', famille: 'dbl' },  { id: 'ga7', famille: 'casc' },
        { id: 'ga8', famille: 'pil' },  { id: 'ga3', famille: 'figu' }
    ],
    // L'ordre des tests compte : « Silhouettes muettes » contient aussi
    // « silhouette », et un groupe inconnu reste un role.
    deGroupe: (g) => {
        const off = g && CastFamilies.OFFICIELS.find(o => o.id === g.id);
        if(off) return off.famille;
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
    // A L'OUVERTURE D'UN PROJET : la liste des groupes de comediens est
    // ramenee aux huit officiels, avec leurs noms, dans l'ordre du metier.
    // - Il en manque (projet cree avant la v602) : on les ajoute.
    // - Un groupe MAISON (« Seconds roles creoles ») : ses comediens passent
    //   dans le groupe officiel de la meme famille — Roles secondaires pour
    //   un nom inconnu, qui donne les memes numeros — et il disparait.
    //   SEULEMENT SI on a le droit de voir les comediens : sinon on
    //   effacerait un groupe sans pouvoir y reprendre personne (voir
    //   Links.masquee et le cloisonnement).
    // - L'ordre du tableau groups est refait : tous les ecrans (onglet,
    //   menu « Groupe », PDF) lisent les groupes dans cet ordre.
    // Renvoie true si quelque chose a change (il faut alors enregistrer).
    completerGroupes: (data, comediensVisibles) => {
        if(!data || !Array.isArray(data.groups)) return false;
        const avant = JSON.stringify([data.groups, (data.actors || []).map(a => a && a.group_id)]);
        const defs = CONFIG.defaultGroups;
        const offIds = CastFamilies.OFFICIELS.map(o => o.id);
        const cible = { role: 'ga2', sil: 'ga4', silm: 'ga6', dbl: 'ga5', casc: 'ga7', pil: 'ga8', figu: 'ga3' };
        const maison = data.groups.filter(g => g && g.type === 'actor' && offIds.indexOf(g.id) < 0);
        if(comediensVisibles !== false && maison.length) {
            maison.forEach(g => {
                const vers = cible[CastFamilies.deGroupe(g)];
                (data.actors || []).forEach(a => { if(a && a.group_id === g.id) a.group_id = vers; });
            });
        }
        const garder = (g) => !(g && g.type === 'actor') || offIds.indexOf(g.id) > -1
            || (comediensVisibles === false && maison.indexOf(g) > -1);
        const pos = data.groups.findIndex(g => g && g.type === 'actor');
        const officiels = offIds.map(id => {
            const def = defs.find(d => d.id === id);
            const ex = data.groups.find(g => g && g.id === id);
            return Object.assign({}, ex || {}, def);
        });
        const restants = data.groups.filter(g => !(g && g.type === 'actor' && offIds.indexOf(g.id) > -1)).filter(garder);
        const at = pos < 0 ? restants.length : Math.min(pos, restants.length);
        data.groups = restants.slice(0, at).concat(officiels, restants.slice(at));
        return JSON.stringify([data.groups, (data.actors || []).map(a => a && a.group_id)]) !== avant;
    }
  };
