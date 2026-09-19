
  const PersonIdentity = {
      recordOf: (type, personId) => {
          const arr = (type === 'actor') ? state.data.actors : state.data.crew;
          return (arr || []).find(p => p && String(p.id) === String(personId)) || null;
      },
      // Empreinte du CORPS : 'acc:<id>' pour un compte, 'mail:<email>' pour une
      // saisie manuelle, null quand rien ne permet de rapprocher deux lignes
      // (une personne sans empreinte n'est jamais que elle-meme).
      fingerprint: (rec) => {
          if(!rec) return null;
          if(rec.publicProfileId) return 'acc:' + String(rec.publicProfileId);
          const mail = String(rec.email || '').trim().toLowerCase();
          return mail ? 'mail:' + mail : null;
      },
      // Toutes les lignes — comediens ET equipe — qui sont la MEME personne,
      // celle de depart comprise.
      peers: (type, personId) => {
          const self = [{ type: type, personId: String(personId) }];
          const fp = PersonIdentity.fingerprint(PersonIdentity.recordOf(type, personId));
          if(!fp) return self;
          const out = [];
          [['actor', state.data.actors], ['crew', state.data.crew]].forEach(pair => {
              (pair[1] || []).forEach(p => {
                  if(p && PersonIdentity.fingerprint(p) === fp) out.push({ type: pair[0], personId: String(p.id) });
              });
          });
          return out.length ? out : self;
      },
      // Les AUTRES lignes de la meme personne (celle de depart exclue).
      others: (type, personId) => PersonIdentity.peers(type, personId)
          .filter(p => !(p.type === type && p.personId === String(personId))),
      // Ne garde qu'UNE entree par corps dans une liste ; `ref` rend le couple
      // { type, id } d'un element. Sert aux tableaux de LOGISTIQUE (transports),
      // ou une personne convoquee sur deux postes n'a qu'un trajet : deux lignes
      // identiques y feraient croire a deux vehicules ou deux pick-up a prevoir.
      // Les tableaux de CONVOCATION, eux, gardent bien une ligne PAR POSTE — le
      // chef de chaque departement doit y retrouver sa personne.
      dedupe: (liste, ref) => {
          const vus = new Set();
          return (liste || []).filter(x => {
              const r = ref(x);
              if(!r) return false;
              const k = PersonIdentity.fingerprint(PersonIdentity.recordOf(r.type, r.id)) || (r.type + '_' + r.id);
              if(vus.has(k)) return false;
              vus.add(k);
              return true;
          });
      },
      // Vrai si les deux references designent le meme corps.
      same: (typeA, idA, typeB, idB) => {
          if(typeA === typeB && String(idA) === String(idB)) return true;
          const a = PersonIdentity.fingerprint(PersonIdentity.recordOf(typeA, idA));
          return !!a && a === PersonIdentity.fingerprint(PersonIdentity.recordOf(typeB, idB));
      }
  };
