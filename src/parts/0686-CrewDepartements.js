
  // ==========================================================================
  //  LES DEPARTEMENTS TECHNIQUES : UNE LISTE FERMEE (v602)
  // ==========================================================================
  //  Meme decision que pour les comediens (voir CastFamilies) : les groupes
  //  de l'equipe technique sont les DIX-HUIT DEPARTEMENTS du metier
  //  (CONFIG.crewGroups), et on n'en cree pas d'autre. Ce ne sont pas des
  //  etiquettes de rangement : la feuille de service les LIT — bandeau
  //  d'equipe par corps de metier, contacts de production (cherches dans
  //  « Production » seulement), responsable de chaque ligne du depouillement
  //  (CONFIG.crewToBreakdownMap), liste des fonctions de la fiche. Un
  //  technicien range dans un groupe maison sortait de tout cela et tombait
  //  dans la case fourre-tout du bandeau.
  //  « Autre » existe deja pour ce qui ne rentre nulle part.
  //  Personnages, decors, ressources, structures GARDENT leurs groupes libres :
  //  aucun document officiel ne les lit, ils ne servent qu'a ranger.
  const CrewDepartements = {
    // Ou va un groupe maison. Le seul cas en base au 23 septembre etait
    // « Equipe aquatique » (1 personne), que le developpeur a range en Image.
    // Un nom inconnu part dans « Autre ».
    cibleDe: (g) => {
        const n = String((g && g.name) || '');
        if(/aquati|image|cam[eé]ra|photo|cadr/i.test(n)) return 'gc1';
        return 'gc17';
    },
    // A L'OUVERTURE D'UN PROJET, apres la baseline (la reprise s'enregistre
    // une fois). JAMAIS sans le droit de voir l'equipe : on effacerait un
    // groupe sans pouvoir y reprendre personne. Renvoie true si ca a change.
    fermer: (data, equipeVisible) => {
        if(!data || !Array.isArray(data.groups) || equipeVisible === false) return false;
        const offIds = CONFIG.crewGroups.map(g => g.id);
        const maison = data.groups.filter(g => g && g.type === 'crew' && offIds.indexOf(g.id) < 0);
        if(!maison.length) return false;
        maison.forEach(g => {
            const vers = CrewDepartements.cibleDe(g);
            (data.crew || []).forEach(m => { if(m && m.group_id === g.id) m.group_id = vers; });
        });
        data.groups = data.groups.filter(g => maison.indexOf(g) < 0);
        return true;
    }
  };
