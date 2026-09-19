
  const PlanningTransport = {
    isDriverMode: (t) => t === 'own-brings' || t === 'own-brings-regie',
    // ===== MODELE DE COVOITURAGE (v565) — DONNEES PURES, ZERO DOM =====
    // Toute la logique metier — capacite du vehicule, selection unique cote
    // passager, reciprocite conducteur/passager, desynchronisation — opere ici
    // sur Planning.tempShootDay.callSheet. Aucun acces au DOM, aucun setTimeout.
    // Les cases du formulaire n'en sont plus que la projection : voir project().
    // Avant ce portage, la case a cocher ETAIT le modele, et la moitie de la
    // reciprocite etait differee de 50 a 100 ms : enregistrer dans la foulee
    // d'un clic pouvait sauvegarder un passager sans son conducteur.
    model: {
        calls: () => {
            if(!Planning.tempShootDay) Planning.tempShootDay = {};
            if(!Array.isArray(Planning.tempShootDay.callSheet)) Planning.tempShootDay.callSheet = [];
            return Planning.tempShootDay.callSheet;
        },
        key: (type, personId) => `${type}_${personId}`,
        // "actor_act_12" -> { type:'actor', personId:'act_12' } : split au PREMIER
        // underscore, les identifiants de personnes en contiennent eux-memes.
        parse: (composite) => {
            const s = String(composite == null ? '' : composite);
            const i = s.indexOf('_');
            if(i === -1) return null;
            const type = s.substring(0, i), personId = s.substring(i + 1);
            return (type && personId) ? { type, personId } : null;
        },
        get: (type, personId) => PlanningTransport.model.calls().find(c => c.type === type && String(c.personId) === String(personId)) || null,
        // ===== CHAMPS DE CORPS (v598) =====
        // Ce qui decrit le TRAJET de la personne, et non son poste : une seule
        // valeur par corps et par journee. La consigne (notes), le PAT et le
        // HMC n'y sont PAS : ils appartiennent au poste.
        BODY_PROPS: ['callTime', 'pickupTime', 'transport', 'vehicleId'],
        // Les cles de covoiturage de toutes les lignes d'une meme personne.
        peerKeys: (type, personId) => PersonIdentity.peers(type, personId)
            .map(p => PlanningTransport.model.key(p.type, p.personId)),
        // Premiere AUTRE ligne convoquee du meme corps, s'il y en a une.
        peerEntry: (type, personId) => {
            const M = PlanningTransport.model;
            let found = null;
            PersonIdentity.others(type, personId).forEach(p => {
                if(!found) found = M.get(p.type, p.personId);
            });
            return found;
        },
        // Recopie les champs de corps de la ligne qu'on vient de modifier vers
        // les autres lignes CONVOQUEES de la meme personne. Les lignes non
        // convoquees ne sont pas creees : etre cadreur ce jour-la ne convoque
        // pas Bob comme electro.
        mirror: (type, personId) => {
            const M = PlanningTransport.model;
            const src = M.get(type, personId);
            if(!src) return;
            PersonIdentity.others(type, personId).forEach(p => {
                const dst = M.get(p.type, p.personId);
                if(!dst) return;
                M.BODY_PROPS.forEach(k => { dst[k] = src[k]; });
                dst.withWho = (src.withWho || []).slice();
            });
        },
        // Apres un lien de covoiturage, les DEUX corps ont bouge : celui qui
        // monte et celui qui conduit. On repercute des deux cotes.
        mirrorPair: (type, personId, composite) => {
            const M = PlanningTransport.model;
            M.mirror(type, personId);
            const o = M.parse(composite);
            if(o) M.mirror(o.type, o.personId);
        },
        ensure: (type, personId) => {
            let e = PlanningTransport.model.get(type, personId);
            if(!e) {
                e = { type, personId, callTime: '', notes: '', transport: '', withWho: [], vehicleId: '' };
                // Deuxieme poste d'une personne DEJA convoquee ce jour-la : son
                // corps a deja un trajet, la nouvelle ligne en herite au lieu
                // d'ouvrir un second voyage.
                const peer = PlanningTransport.model.peerEntry(type, personId);
                if(peer) {
                    PlanningTransport.model.BODY_PROPS.forEach(k => { e[k] = peer[k]; });
                    e.withWho = (peer.withWho || []).slice();
                }
                PlanningTransport.model.calls().push(e);
            }
            if(!Array.isArray(e.withWho)) e.withWho = [];
            return e;
        },
        // Places d'un conducteur pour un mode donne. Le mode est passe en
        // parametre pour pouvoir verifier la capacite AVANT de muter l'entree.
        seatsOf: (type, personId, mode, vehicleId) => {
            if(mode === 'own-brings') {
                const arr = type === 'actor' ? state.data.actors : state.data.crew;
                const p = (arr || []).find(x => String(x.id) === String(personId));
                return parseInt(p?.vehicleSeats) || 0;
            }
            if(mode === 'own-brings-regie') {
                const veh = (state.data.vehicles || []).find(v => String(v.id) === String(vehicleId));
                return parseInt(veh?.seats) || 0;
            }
            return 0;
        },
        seats: (type, personId) => {
            const e = PlanningTransport.model.get(type, personId);
            return e ? PlanningTransport.model.seatsOf(type, personId, e.transport, e.vehicleId) : 0;
        },
        // Une personne qui conduit ne peut pas etre passagere de quelqu'un
        // d'autre : sa voiture ne se conduit pas toute seule.
        canBePassenger: (type, personId) => {
            const e = PlanningTransport.model.get(type, personId);
            return !(e && PlanningTransport.isDriverMode(e.transport));
        },
        setTransport: (type, personId, value) => {
            const e = PlanningTransport.model.ensure(type, personId);
            const was = e.transport;
            e.transport = value || '';
            if(e.transport !== 'own-brings-regie') e.vehicleId = '';
            // Quitter le covoiturage relache tous les liens, dans les deux sens.
            // Passer de conducteur a passager les relache aussi : on ne garde
            // pas de passagers quand on monte soi-meme dans une autre voiture.
            const quitte = !PlanningTransport.isDriverMode(e.transport) && e.transport !== 'with';
            const devientPassager = e.transport === 'with' && PlanningTransport.isDriverMode(was);
            if(quitte || devientPassager) {
                e.withWho.slice().forEach(k => PlanningTransport.model.unlink(type, personId, k));
            }
            return e;
        },
        // Un vehicule de regie n'a qu'un conducteur par jour. La regle vit ici
        // et pas seulement dans la liste grisee : l'attribution peut aussi
        // venir d'un import, d'une duplication de jour ou d'un autre appelant.
        vehicleTakenBy: (vehicleId, type, personId) => {
            if(!vehicleId) return null;
            // v598 : la comparaison porte sur le CORPS, pas sur la ligne.
            // Sans cela, Bob convoque comme cadreur ET comme electro se
            // bloquait lui-meme son propre vehicule de regie.
            return PlanningTransport.model.calls().find(cl =>
                cl && cl.transport === 'own-brings-regie'
                && String(cl.vehicleId || '') === String(vehicleId)
                && !PersonIdentity.same(cl.type, cl.personId, type, personId)
            ) || null;
        },
        setVehicle: (type, personId, vehicleId) => {
            const e = PlanningTransport.model.ensure(type, personId);
            const pris = PlanningTransport.model.vehicleTakenBy(vehicleId, type, personId);
            if(pris) {
                const p = pris.type === 'actor'
                    ? (state.data.actors || []).find(a => a.id === pris.personId)
                    : (state.data.crew || []).find(x => x.id === pris.personId);
                Utils.toast(`Ce véhicule est déjà conduit par ${(p && p.name) ? p.name : 'quelqu\'un d\'autre'} ce jour-là.`, 'error');
                return e;
            }
            e.vehicleId = vehicleId || '';
            return e;
        },
        // Pose le lien dans les deux sens. Renvoie null si accepte, sinon le
        // message de refus. Le sens conducteur / passager est deduit du mode de
        // celui qui clique : c'est ce qui rend l'operation symetrique.
        link: (type, personId, composite) => {
            const M = PlanningTransport.model;
            const other = M.parse(composite);
            if(!other) return null;
            const me = M.ensure(type, personId);
            const you = M.ensure(other.type, other.personId);
            if(me === you) return null;
            // v598 : Bob cadreur ne monte pas dans la voiture de Bob electro —
            // c'est le meme corps, et la meme voiture.
            if(PersonIdentity.same(type, personId, other.type, other.personId)) return null;

            let driver, passenger, driverType, driverId;
            if(PlanningTransport.isDriverMode(me.transport)) {
                driver = me; passenger = you; driverType = type; driverId = personId;
            } else {
                driver = you; passenger = me; driverType = other.type; driverId = other.personId;
            }
            const driverKey = M.key(driverType, driverId);
            const passengerType = (passenger === me) ? type : other.type;
            const passengerId = (passenger === me) ? personId : other.personId;
            const passengerKey = M.key(passengerType, passengerId);
            // v598 : toutes les lignes du passager designent UN corps, donc UNE
            // place. Sans cela Bob, convoque sur deux postes, occupait deux
            // sieges dans la voiture de quelqu'un d'autre.
            const passengerPeerKeys = M.peerKeys(passengerType, passengerId);

            // Un conducteur ne peut pas etre passager d'un autre conducteur.
            if(PlanningTransport.isDriverMode(passenger.transport)) {
                return 'Cette personne conduit : elle ne peut pas être passagère.';
            }

            const driverMode = PlanningTransport.isDriverMode(driver.transport) ? driver.transport : 'own-brings';
            const cap = M.seatsOf(driverType, driverId, driverMode, driver.vehicleId);
            const already = driver.withWho.filter(k => passengerPeerKeys.indexOf(k) === -1).length;
            if(cap > 0 && already + 1 > cap - 1) {
                return `Capacité atteinte : ${cap} place(s), conducteur inclus.`;
            }

            driver.transport = driverMode;
            // Une seule cle par corps a bord : un deuxieme poste du meme
            // passager ne prend pas un second siege.
            driver.withWho = driver.withWho.filter(k => passengerPeerKeys.indexOf(k) === -1);
            driver.withWho.push(passengerKey);
            // Cote passager la selection est unique : on relache l'ancien conducteur.
            passenger.withWho.slice().forEach(k => { if(k !== driverKey) M.unlink(passenger.type, passenger.personId, k); });
            passenger.transport = 'with';
            passenger.withWho = [driverKey];
            return null;
        },
        // Retire le lien dans les deux sens et remet a vide le transport de
        // l'autre s'il ne covoiture plus avec personne.
        unlink: (type, personId, composite) => {
            const M = PlanningTransport.model;
            const other = M.parse(composite);
            if(!other) return;
            const me = M.get(type, personId);
            const you = M.get(other.type, other.personId);
            // v598 : on relache le lien du CORPS, pas celui d'une seule ligne.
            // Defaire le covoiturage depuis la ligne « electro » de Bob doit
            // aussi le sortir de la voiture ou il etait monte comme « cadreur ».
            const myKeys = M.peerKeys(type, personId);
            const otherKeys = M.peerKeys(other.type, other.personId);
            if(me) me.withWho = me.withWho.filter(k => otherKeys.indexOf(k) === -1);
            if(you) {
                if(!Array.isArray(you.withWho)) you.withWho = [];
                you.withWho = you.withWho.filter(k => myKeys.indexOf(k) === -1);
                if(you.withWho.length === 0 && (you.transport === 'with' || PlanningTransport.isDriverMode(you.transport))) {
                    you.transport = '';
                    you.vehicleId = '';
                }
            }
        },
        // Cocher / decocher quelqu'un dans la callSheet
        include: (type, personId) => PlanningTransport.model.ensure(type, personId),
        exclude: (type, personId) => {
            const M = PlanningTransport.model;
            const e = M.get(type, personId);
            // v598 : une AUTRE ligne du meme corps reste-t-elle convoquee ?
            // Si oui, Bob vient quand meme sur le plateau : ses liens de
            // covoiturage ne se relachent pas, ils passent simplement sur sa
            // ligne restante. Sinon on les relache, comme avant.
            const heir = M.peerEntry(type, personId);
            if(e && !heir) e.withWho.slice().forEach(k => M.unlink(type, personId, k));
            if(e && heir) {
                const oldKey = M.key(type, personId);
                const newKey = M.key(heir.type, heir.personId);
                M.calls().forEach(cl => {
                    if(!cl || !Array.isArray(cl.withWho)) return;
                    cl.withWho = cl.withWho
                        .map(k => (k === oldKey ? newKey : k))
                        .filter((k, idx, a) => a.indexOf(k) === idx)
                        .filter(k => k !== M.key(cl.type, cl.personId));
                });
            }
            const arr = M.calls();
            const i = arr.findIndex(c => c.type === type && String(c.personId) === String(personId));
            if(i > -1) arr.splice(i, 1);
        }
    },
    // ===== NETTOYAGE v566 — PROJECTION VERS LE FORMULAIRE SUPPRIMEE =====
    // Le pane Formulaire a ete retire en v565 : project / projectAll,
    // forceDriverOption, vehicleSelectHtml, onTransportChange, onCallToggle,
    // vehicleCapacity, onWithWhoItemClick, syncTransport / unsyncTransport et
    // les quatre fonctions de dropdown « Avec qui » n'avaient plus aucun DOM a
    // manipuler ni aucun appelant. Le modele (PlanningTransport.model) et
    // isDriverMode suffisent : la feuille de service les attaque directement.
  };

  // ==================== ÉDITEUR WYSIWYG DE FEUILLE DE SERVICE (v563) ====================
  // Principe : ce pane n'est PAS une seconde source de vérité. Il rend une vue
  // « papier » de la feuille et écrit en traversée dans les champs du pane
  // normal (qui reste dans le DOM, seulement masqué). saveShootDay continue
  // donc de lire les mêmes inputs qu'avant : aucune donnée dupliquée, aucun
  // chemin de sauvegarde nouveau.