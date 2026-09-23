
  const Utils = {
      sanitizeEmail: (email) => email.replace(/\./g, ','),

      // ==================================================================
      //  FERMER EN DOUCEUR (v601)
      // ==================================================================
      //  Une fenetre s'ouvre en fondu depuis toujours, mais elle DISPARAISSAIT
      //  d'un coup : la classe qui l'affiche est retiree, et « display: none »
      //  ne s'anime pas. C'est ce qui donnait au site son cote sec.
      //  LE PRINCIPE, et c'est lui qui evite une coordination fragile : la
      //  classe d'ouverture est retiree TOUT DE SUITE — tout ce qui demande
      //  « la fiche est-elle ouverte ? » repond juste a l'instant meme — et
      //  une classe de SORTIE la garde a l'ecran, inerte, le temps du fondu.
      //  Le style ne l'applique que si la classe d'ouverture est absente : si
      //  l'on rouvre dans la foulee, l'ouverture reprend la main sans qu'on
      //  ait a annuler quoi que ce soit.
      fermetureDouce: (el, classeOuverte) => {
          try {
              if(!el) return;
              const ouverte = classeOuverte || 'visible';
              if(!el.classList.contains(ouverte)) return;   // rien a fondre
              el.classList.remove(ouverte);
              el.classList.add('se-ferme');
              clearTimeout(el._fondu);
              el._fondu = setTimeout(() => { el.classList.remove('se-ferme'); }, 220);
          } catch(e) {
              try { el.classList.remove(classeOuverte || 'visible'); } catch(_) {}
          }
      },
      // Poids d'un projet, EN MEGAOCTETS SEULEMENT (v601). La double unite
      // « X Ko (Y Mo) » n'apprenait rien et encombrait la carte du projet. Une
      // seule porte : tous les endroits qui affichent un poids passent par ici.
      // Deux decimales sous 10 Mo, une seule au-dessus : a 24 Mo, le centieme
      // de mega ne veut plus rien dire. Et jamais « 0 Mo » pour un projet qui
      // existe — on montre le plus petit palier lisible.
      formatWeight: (bytes) => {
          const b = bytes || 0;
          const mo = b / 1048576;
          if(b > 0 && mo < 0.01) return '< 0,01 Mo';
          return mo.toLocaleString('fr-FR', { maximumFractionDigits: mo < 10 ? 2 : 1 }) + ' Mo';
      },
      // v593 : String(...) ajouté — sans ça, escape(nombre) ou escape(objet) plante (throw),
      // au lieu de simplement échapper le texte. Comportement inchangé pour les chaînes
      // et les valeurs vides (null/undefined/0/false → '', comme avant).
      escape: (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
      // v602 (audit securite) : un texte place comme ARGUMENT dans un onclick.
      // Utils.escape ne suffit pas la : le navigateur redecode &#39; en ' avant
      // d'executer l'attribut, et un nom « x');alert(1)// » sortait de la
      // chaine. On fabrique un vrai litteral JavaScript (guillemets compris),
      // puis on l'echappe pour l'attribut. S'utilise SANS guillemets autour :
      // onclick="app.X.y(${Utils.jsArg(nom)})".
      jsArg: (s) => Utils.escape(JSON.stringify(String(s == null ? '' : s))),
      // v602 (audit securite) : LA seule porte de lecture des profils
      // (user_profiles). Le telephone, la date de naissance, l'adresse et
      // les preferences ne se lisent plus en direct : cette fonction serveur
      // rend sa propre ligne intacte, et celle des autres avec le telephone
      // masque selon leur choix (numero d'agent, « masquer »). Memes regles
      // que l'Univers. Renvoie { data: [...], error }.
      //   { ids: [...] } / { emails: [...] } / { recherche: 'texte' } /
      //   { tous: true } (administration seulement)
      profils: async (q) => {
          q = q || {};
          const { data, error } = await supabase.rpc('profils_visibles', {
              p_ids: q.ids || null, p_emails: q.emails || null,
              p_recherche: q.recherche || null, p_tous: !!q.tous
          });
          return { data: data || [], error };
      },
      // Sanitize du HTML riche inter-utilisateurs (forum, actualites) : allowlist de balises, zero attribut
      sanitizeRich: (html) => {
        const allowed = ['B','I','U','STRONG','EM','UL','OL','LI','BR','P','DIV','SPAN'];
        const doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
        const walk = (node) => {
          [...node.children].forEach(child => {
            walk(child);
            if(!allowed.includes(child.tagName)) { child.replaceWith(...child.childNodes); return; }
            [...child.attributes].forEach(a => child.removeAttribute(a.name));
          });
        };
        const root = doc.body.firstChild;
        walk(root);
        return root.innerHTML;
      },
      // URL d'image sure pour les attributs src de contenu inter-utilisateurs
      // v601 — ON SIGNE AVANT DE VALIDER. Un media de projet est stocke par son
      // CHEMIN (« projects/xxx/yyy.jpg »), ou par une adresse « /object/public/ »
      // que le bucket PRIVE refuse de servir. Dans les deux cas le controle
      // ci-dessous le rejetait : le chemin nu ne commence pas par https, et
      // l'adresse publique part en 403. Resultat, TOUTE photo de comedien, de
      // personnage ou de decor ressortait vide — l'image cassee laissant voir son
      // texte de remplacement (« Phot du... ») dans les vignettes.
      // L'ordre compte : on resout d'abord en URL signee, on valide ENSUITE. Le
      // controle de securite garde donc le dernier mot, sur la valeur reellement
      // posee dans la page.
      safeMediaUrl: (u) => {
        u = String(u || '');
        const v = String((Utils.signedUrlFor ? Utils.signedUrlFor(u) : u) || '');
        return (/^(data:image\/|https:\/\/)/i.test(v)) ? v.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C') : '';
      },
      // URL de lien sure (href) : http(s) ou mailto uniquement, jamais javascript:
      safeUrl: (u) => {
        u = String(u || '').trim();
        return (/^(https?:\/\/|mailto:)/i.test(u)) ? u.replace(/"/g, '%22').replace(/'/g, '%27') : '';
      },
      // A4 - Neutralise les caracteres reserves de la syntaxe des filtres PostgREST (.or)
      pgSafe: (v) => String(v || '').replace(/[,()*]/g, ''),
      // Libelle LISIBLE d'une categorie de depouillement. Les cles sont ecrites
      // en capitales sans accent et separees par un tiret (DECORS-LIEUX) parce
      // qu'elles servent d'identifiant dans scene.breakdown : elles ne doivent
      // jamais changer, sous peine de perdre le depouillement des projets
      // existants. Seul l'AFFICHAGE passe par ici, jamais la donnee.
      // ==================================================================
      //  UN MENU QUI S'OUVRE ET SE FERME EN DOUCEUR (v601)
      // ==================================================================
      //  L'OUVERTURE S'ANIME TOUTE SEULE, EN CSS : un element qui passe de
      //  « pas affiche » a « affiche » rejoue son animation, sans une ligne
      //  de JavaScript. Rien a brancher, donc aucun menu oublie.
      //  LA FERMETURE, ELLE, DOIT ETRE RETENUE : une fois l'element retire du
      //  document ou repasse en display:none, il n'y a plus rien a animer.
      //  D'ou cette porte unique, qu'on appelle a la place de remove() ou de
      //  display='none'.
      DUREE_MENU: 130,
      fermerMenu: (el, apres) => {
          if(!el) return;
          const fin = () => {
              try { if(apres) apres(); else el.style.display = 'none'; } catch(e) {}
          };
          // Deux demandes de fermeture pour un meme menu (un clic dehors ET
          // un clic sur un item) ne doivent pas jouer deux animations ni
          // fermer deux fois.
          if(el.__ferme) return;
          let sobre = false;
          try { sobre = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch(e) {}
          if(sobre) { fin(); return; }
          el.__ferme = true;
          el.classList.add('menu-se-ferme');
          el.__tFerme = setTimeout(() => {
              el.classList.remove('menu-se-ferme');
              el.__ferme = false; el.__tFerme = null;
              fin();
          }, Utils.DUREE_MENU);
      },
      //  PENDANT LES 130 MILLISECONDES DE LA FERMETURE, LE MENU EST ENCORE LA.
      //  Un second clic sur le bouton qui l'ouvre le lirait donc comme
      //  « ouvert » et le refermerait une deuxieme fois : le menu ne se
      //  rouvrirait plus. Celui qui rouvre annule la fermeture en cours.
      annulerFermeture: (el) => {
          if(!el || !el.__ferme) return;
          if(el.__tFerme) clearTimeout(el.__tFerme);
          el.__tFerme = null; el.__ferme = false;
          el.classList.remove('menu-se-ferme');
      },

      CAT_LABELS: {
        'DECORS-LIEUX': 'Décors / Lieux',
        'MAQUILLAGE-COIFFURE': 'Maquillage / Coiffure',
        'SON-MUSIQUE': 'Son / Musique',
        'EFFETS SPECIAUX (SFX)': 'Effets spéciaux (SFX)',
        'EFFETS VISUELS (VFX)': 'Effets visuels (VFX)',
        'TECHNICIENS': 'Techniciens',
        'COMEDIENS': 'Comédiens',
        'PERSONNAGES': 'Personnages',
        'FIGURATION': 'Figuration',
        'ACCESSOIRES': 'Accessoires',
        'COSTUMES': 'Costumes',
        'VEHICULES': 'Véhicules',
        'ANIMAUX': 'Animaux',
        'LUMIERE': 'Lumière',
        'MACHINERIE': 'Machinerie',
        'LOGISTIQUE': 'Logistique'
      },
      // Repli sur la cle elle-meme : une categorie inconnue (import, projet
      // ancien) reste lisible plutot que de disparaitre.
      catLabel: (cat) => Utils.CAT_LABELS[cat] || String(cat == null ? '' : cat),

      // ============ ELEMENT DEPOUILLE : TEXTE + LIEN VERS UNE FICHE ============
      // Un element de scene.breakdown[CAT] est soit une CHAINE (forme
      // historique, texte libre), soit un OBJET { t, k, id } :
      //   t  texte affiche, tel qu'il apparait dans le scenario ;
      //   k  type de fiche visee (resource, character, actor, crew, location) ;
      //   id identifiant de la fiche, ou null si l'element n'est lie a rien.
      // LE LIEN VIT SUR L'OCCURRENCE, PAS SUR LE MOT : deux "valise" dans deux
      // scenes peuvent viser deux fiches differentes, et la meme valise dans
      // douze scenes fait douze occurrences vers un seul id. C'est toute la
      // raison de ce chantier — comparer des noms ne permet ni l'un ni l'autre.
      // TOUTE lecture passe par bdText : un lecteur oublie afficherait
      // "[object Object]", faute visible, jamais une perte silencieuse.
      BD_KIND_BY_CAT: {
        'ACCESSOIRES': 'resource', 'COSTUMES': 'resource', 'VEHICULES': 'resource',
        'PERSONNAGES': 'character', 'COMEDIENS': 'actor', 'FIGURATION': 'actor',
        'TECHNICIENS': 'crew', 'DECORS-LIEUX': 'location'
      },
      // Les huit categories ci-dessus ont une fiche quelque part dans l'app.
      // Les huit autres (ANIMAUX, LUMIERE, SFX...) restent du texte libre :
      // elles n'ont aucun onglet ou se ranger, y forcer un lien n'aurait pas
      // de cible. Elles deviennent tout de meme des objets, pour que la forme
      // soit unique et qu'un onglet futur n'impose pas une seconde migration.
      // Une categorie a une famille PAR DEFAUT (ci-dessus, celle qui sert a la
      // saisie libre), mais elle peut accepter des fiches d'AUTRES familles : le
      // lien vit sur l'element (it.k), pas sur la categorie, donc rien ne
      // l'interdit dans les donnees.
      // Deux familles restaient inaccessibles au depouillement alors qu'elles
      // ont une fiche : les VEHICULES DE REGIE (le minibus de l'equipe, qui
      // n'est pas un accessoire de jeu) et les STRUCTURES (le loueur, l'hotel,
      // le prestataire). VEHICULES accepte donc les deux sortes de vehicules, et
      // LOGISTIQUE ouvre sur les vehicules de regie et les structures.
      BD_ALT_KINDS: {
        'VEHICULES': ['resource', 'vehicle'],
        'LOGISTIQUE': ['vehicle', 'org'],
        'DECORS-LIEUX': ['location', 'org']
      },
      bdKindsFor: (cat) => {
        const alt = Utils.BD_ALT_KINDS[cat];
        if(alt) return alt.slice();
        const k = Utils.bdKindOf(cat);
        return k ? [k] : [];
      },
      bdKindOf: (cat) => Utils.BD_KIND_BY_CAT[cat] || null,
      // Texte affichable d'un element, quelle que soit sa forme.
      bdText: (it) => (it && typeof it === 'object') ? String(it.t == null ? '' : it.t) : String(it == null ? '' : it),
      // Identifiant de fiche liee, ou null (element libre ou forme historique).
      bdId: (it) => (it && typeof it === 'object' && it.id) ? it.id : null,
      // Type de fiche visee par l'element lui-meme, plus fiable que la categorie
      // pour un element deplace ou importe.
      bdKind: (it) => (it && typeof it === 'object' && it.k) ? it.k : null,
      // Fabrique un element. Sert a tous les points d'ecriture, pour qu'aucun
      // ne reinvente la forme dans son coin.
      bdItem: (text, cat, id) => ({ t: String(text == null ? '' : text), k: Utils.bdKindOf(cat), id: id || null }),
      // Comparaison souple sur le TEXTE (casse et espaces ignores). Sert aux
      // doublons a la saisie et au rattrapage des elements non lies ; ne sert
      // JAMAIS a etablir un lien, qui est toujours explicite.
      bdSameText: (a, b) => Utils.bdText(a).trim().toLowerCase() === Utils.bdText(b).trim().toLowerCase(),
      // Convertit en place tout le depouillement d'un projet a la forme objet.
      // Idempotent : rejouable sans effet, un element deja converti est laisse
      // tel quel. Appele au chargement du projet, apres la capture de baseline.
      bdNormalizeData: (data) => {
        let touched = 0;
        // Fiches sans identifiant. syncCharacters et syncLocations en ont
        // longtemps cree ainsi (nom, bio, groupe, mais pas d'id) : elles
        // s'affichaient normalement, mais rien ne pouvait POINTER vers elles.
        // Un rattachement sur une telle fiche ecrivait un lien vide et
        // l'element repassait "sans fiche" au controle suivant, indefiniment.
        ['characters', 'actors', 'crew', 'locations', 'resources'].forEach(coll => {
          const prefix = { characters: 'char_', actors: 'act_', crew: 'crew_', locations: 'loc_', resources: 'res_' }[coll];
          (data && data[coll] || []).forEach(rec => {
            if(rec && !rec.id) { rec.id = prefix + Utils.generateUniqueId(); touched++; }
          });
        });
        (data && data.scenes || []).forEach(sc => {
          if(!sc || !sc.breakdown) return;
          Object.keys(sc.breakdown).forEach(cat => {
            const arr = sc.breakdown[cat];
            if(!Array.isArray(arr)) return;
            sc.breakdown[cat] = arr.map(it => {
              if(it && typeof it === 'object') return it;
              touched++;
              return Utils.bdItem(it, cat, null);
            });
          });
        });
        return touched;
      },

      generateUniqueId: () => Date.now() + '_' + Math.random().toString(36).slice(2, 11),
      
      /**
       * Retire les caractères hors latin1 (emojis, pictogrammes, symboles unicode étendus)
       * qui plantent en jsPDF (encodage WinAnsi) ou créent des "þ" parasites.
       * Pour les champs destinés à un dossier de production professionnel.
       */
      stripPdfUnsafe: (str) => {
          if(!str) return '';
          // Normaliser les espaces exotiques (U+202F produit par toLocaleString
          // fr-FR, espace fine, nbsp) en espace simple AVANT le filtre latin1 :
          // sinon ils disparaissent ou se corrompent en '/' dans jsPDF.
          // Retirer emojis et symboles unicode au-delà de latin1
          let cleaned = String(str)
              .replace(/[\u202F\u2009\u00A0]/g, ' ')
              .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
              .replace(/[\u{2600}-\u{27BF}]/gu, '')
              .replace(/[\u{2300}-\u{23FF}]/gu, '')
              .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
              .replace(/[\u{1F900}-\u{1F9FF}]/gu, '');
          // Filet : tout caractère hors latin1 (au-delà de U+00FF)
          cleaned = cleaned.split('').filter(c => c.charCodeAt(0) <= 0xFF || c === '€').join('');
          return cleaned;
      },
      
      /**
       * Installe un blocker d'emojis sur un élément input/textarea : tout caractère
       * non-latin1 saisi ou collé est retiré silencieusement (avec un petit toast
       * d'avertissement la 1ère fois pour expliquer le comportement).
       * Idempotent : appeler plusieurs fois sur le même élément = no-op.
       * 
       * Usage : Utils.installEmojiBlocker(document.getElementById('film-title'));
       *        Utils.installEmojiBlocker('input.actor-name'); // sélecteur CSS
       */
      installEmojiBlocker: (target) => {
          // Helper pour traiter un élément
          const attachTo = (el) => {
              if(!el || el._emojiBlockerAttached) return;
              el._emojiBlockerAttached = true;
              const filterValue = () => {
                  const before = el.value;
                  const after = Utils.stripPdfUnsafe(before);
                  if(after !== before) {
                      // Conserver position du curseur (approximative)
                      const pos = Math.min(el.selectionStart || 0, after.length);
                      el.value = after;
                      try { el.setSelectionRange(pos, pos); } catch(_) {}
                      // Toast unique par session
                      if(!window._emojiBlockerToastShown) {
                          window._emojiBlockerToastShown = true;
                          if(typeof Utils !== 'undefined' && Utils.toast) {
                              Utils.toast('Les emojis sont retirés des champs du dossier de production.', 'info');
                          }
                      }
                  }
              };
              el.addEventListener('input', filterValue);
              el.addEventListener('paste', () => setTimeout(filterValue, 0));
          };
          // Si target est un sélecteur string, traiter tous les éléments matchés
          if(typeof target === 'string') {
              document.querySelectorAll(target).forEach(attachTo);
          } else if(target) {
              attachTo(target);
          }
      },
      
      // Formatage relatif du temps (il y a X minutes, etc.)
      timeAgo: (dateString) => {
          const date = new Date(dateString);
          const now = new Date();
          const seconds = Math.floor((now - date) / 1000);
          if(seconds < 60) return 'à l\'instant';
          const minutes = Math.floor(seconds / 60);
          if(minutes < 60) return `il y a ${minutes} min`;
          const hours = Math.floor(minutes / 60);
          if(hours < 24) return `il y a ${hours}h`;
          const days = Math.floor(hours / 24);
          if(days < 7) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
          const weeks = Math.floor(days / 7);
          if(weeks < 4) return `il y a ${weeks} sem.`;
          const months = Math.floor(days / 30);
          if(months < 12) return `il y a ${months} mois`;
          const years = Math.floor(months / 12);
          return `il y a ${years} an${years > 1 ? 's' : ''}`;
      },
      
      // Notifications Toast
      notifyImpact: (sourceTab, targetTabs, action = 'modifié') => {
          const tabNames = { synopsis: 'Synopsis', board: 'Séquencier', titlepage: 'Page de titre', script: 'Scénario', breakdown: 'Dépouillement', storyboard: 'Storyboard', chars: 'Personnages', actors: 'Comédiens', locs: 'Décors', planning: 'Planning' };
          const targets = Array.isArray(targetTabs) ? targetTabs : [targetTabs];
          const targetLabels = targets.map(t => tabNames[t] || t).join(', ');
          Utils.toast(`🔗 ${targetLabels} mis à jour`, 'info', 3000);
      },
      toast: (message, type = 'info', duration = 3000) => {
          const container = document.getElementById('toast-container');
          const toast = document.createElement('div');
          toast.className = 'toast ' + type;
          const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
          toast.innerHTML = `
              <span class="toast-icon">${icons[type] || icons.info}</span>
              <span class="toast-message">${Utils.escape(message)}</span>
              <button class="toast-close" onclick="this.parentElement.remove()">✖</button>
          `;
          container.appendChild(toast);
          setTimeout(() => { if(toast.parentElement) toast.remove(); }, duration);
      },
      
      // 31 aout : Utils.showIconPicker retiree — son seul appelant etait
      // le selecteur d'icone du formulaire de groupe, supprime le meme jour.
      // 200 emoticones et une fenetre entiere pour un reglage qui ne
      // s'affichait nulle part.
	  getDragAfterElement: (container, y, selector) => { const els = [...container.querySelectorAll(selector + ':not(.dragging)')]; return els.reduce((closest, child)=>{ const box = child.getBoundingClientRect(); const offset=y-box.top-box.height/2; return (offset<0 && offset>closest.offset)?{offset:offset,element:child}:closest; }, {offset:Number.NEGATIVE_INFINITY}).element; },
      debounce: (func, wait) => { let timeout; return function(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; },
      
      // Compresse une image File/Blob en base64 JPEG.
      // - Redimensionne si > maxDimension px (par défaut 1920)
      // - Quality JPEG 0.85 par défaut
      // - Refuse si le résultat est > maxKb (par défaut 500 Ko) avec un toast d'erreur
      // - Préserve les SVG et GIF (renvoie tel quel sans compression)
      // Retourne une Promise<dataURL> ou Promise<null> si échec/refus
      compressImage: (file, opts) => {
          opts = opts || {};
          const maxDimension = opts.maxDimension || 1920;
          const quality = opts.quality || 0.85;
          const maxKb = opts.maxKb || 500;
          return new Promise((resolve) => {
              if(!file) { resolve(null); return; }
              // Préserver SVG et GIF (animations) tels quels
              if(file.type === 'image/svg+xml' || file.type === 'image/gif') {
                  const reader = new FileReader();
                  reader.onload = (e) => resolve(e.target.result);
                  reader.onerror = () => { Utils.toast('Erreur lecture image', 'error'); resolve(null); };
                  reader.readAsDataURL(file);
                  return;
              }
              // Pour les autres formats : compresser via canvas
              const reader = new FileReader();
              reader.onload = (e) => {
                  const img = new Image();
                  img.onload = () => {
                      // Calculer dimensions cibles
                      let w = img.naturalWidth, h = img.naturalHeight;
                      if(w > maxDimension || h > maxDimension) {
                          const ratio = Math.min(maxDimension / w, maxDimension / h);
                          w = Math.round(w * ratio);
                          h = Math.round(h * ratio);
                      }
                      // Dessiner sur canvas
                      const canvas = document.createElement('canvas');
                      canvas.width = w; canvas.height = h;
                      const ctx = canvas.getContext('2d');
                      ctx.fillStyle = '#fff'; // fond blanc pour les PNG transparents → JPEG
                      ctx.fillRect(0, 0, w, h);
                      ctx.drawImage(img, 0, 0, w, h);
                      // Encoder en JPEG (sauf si fichier d'origine est PNG petit avec transparence importante)
                      const dataUrl = canvas.toDataURL('image/jpeg', quality);
                      // Vérifier la taille
                      // Approximation : 4 octets base64 = 3 octets binaire, donc taille ≈ length * 0.75
                      const sizeKb = Math.round(dataUrl.length * 0.75 / 1024);
                      if(sizeKb > maxKb) {
                          Utils.toast(`Image trop lourde même après compression (${sizeKb} Ko, max ${maxKb} Ko). Choisissez une image plus petite.`, 'error');
                          resolve(null);
                          return;
                      }
                      const origKb = Math.round(file.size / 1024);
                      if(origKb > sizeKb * 1.5) {
                          // Compression notable : afficher un petit toast d'info
                          Utils.toast(`Image compressée : ${origKb} → ${sizeKb} Ko`, 'success');
                      }
                      resolve(dataUrl);
                  };
                  img.onerror = () => { Utils.toast('Image invalide ou corrompue', 'error'); resolve(null); };
                  img.src = e.target.result;
              };
              reader.onerror = () => { Utils.toast('Erreur lecture fichier', 'error'); resolve(null); };
              reader.readAsDataURL(file);
          });
      },
      
      // === ProjectStorage : upload/suppression de photos vers le bucket Supabase 'projects' ===
      // Évite de stocker des base64 dans state.data (cause majeure de surcharge Supabase)
      // Convention de chemin : {projectId}/{category}/{filename}
      // category : 'actors', 'locations', 'crew'

      // === Lot D6 : résolveur d'URLs signées pour le bucket privé 'projects' ===
      STORAGE_TTL: 3600, // 1 h
      _signedCache: new Map(), // path -> { url, exp }
      _projPathFrom: (s) => {
          if(typeof s !== 'string' || !s) return null;
          const m = s.match(/\/object\/(?:public|sign)\/projects\/([^?]+)/);
          if(m) return decodeURIComponent(m[1]);
          if(!s.startsWith('http') && !s.startsWith('data:') && /^[\w-]+\/[\w./-]+$/.test(s)) return s;
          return null;
      },
      // Helper SYNCHRONE de rendu : URL signée en cache, sinon valeur d'origine (fallback sûr)
      signedUrlFor: (stored) => {
          if(typeof stored !== 'string' || !stored) return stored;
          const path = Utils._projPathFrom(stored);
          if(!path) return stored;
          const hit = Utils._signedCache.get(path);
          if(hit && hit.exp > Date.now()) return hit.url;
          return stored;
      },
      // Pré-signe en lot tous les médias 'projects' de data (appelé au chargement)
      refreshSignedCache: async (data) => {
          try {
              if(!data) return;
              const paths = new Set();
              const walk = (o) => {
                  if(!o) return;
                  if(typeof o === 'string') { const p = Utils._projPathFrom(o); if(p) paths.add(p); return; }
                  if(Array.isArray(o)) { o.forEach(walk); return; }
                  if(typeof o === 'object') Object.values(o).forEach(walk);
              };
              walk(data);
              if(!paths.size) return;
              const list = [...paths];
              const ttl = Utils.STORAGE_TTL;
              const exp = Date.now() + (ttl - 60) * 1000;
              for(let i = 0; i < list.length; i += 100) {
                  const chunk = list.slice(i, i + 100);
                  const { data: signed, error } = await supabase.storage.from('projects').createSignedUrls(chunk, ttl);
                  if(error || !signed) continue;
                  signed.forEach(s => { if(s && s.signedUrl && !s.error) Utils._signedCache.set(s.path, { url: s.signedUrl, exp }); });
              }
          } catch(e) { console.warn('refreshSignedCache:', e); }
      },
      // Signe + cache un path fraîchement uploadé (rendu immédiat sans recharger)
      _cacheNewPath: async (path) => {
          try {
              const ttl = Utils.STORAGE_TTL;
              const { data, error } = await supabase.storage.from('projects').createSignedUrl(path, ttl);
              if(!error && data && data.signedUrl) Utils._signedCache.set(path, { url: data.signedUrl, exp: Date.now() + (ttl - 60) * 1000 });
          } catch(e) {}
      },
      // Lot 4 : convertit en place les URLs publiques/signées 'projects' de data en paths bruts (hygiène payload). Idempotent : ne réécrit QUE les URLs projet (path brut, data:, URLs externes et strings normales inchangés via _projPathFrom). Retourne le nb de remplacements.
      migrateProjPathsInData: (data) => {
          let n = 0;
          const conv = (v) => {
              if(typeof v === 'string') {
                  const p = Utils._projPathFrom(v);
                  if(p && p !== v) { n++; return p; }
                  return v;
              }
              if(Array.isArray(v)) { for(let i = 0; i < v.length; i++) v[i] = conv(v[i]); return v; }
              if(v && typeof v === 'object') { for(const k in v) if(Object.prototype.hasOwnProperty.call(v, k)) v[k] = conv(v[k]); return v; }
              return v;
          };
          conv(data);
          return n;
      },
      _resolveOneImg: (img) => {
          try {
              const cur = img.getAttribute('src');
              if(!cur || cur.indexOf('/object/sign/projects/') !== -1) return;
              const path = Utils._projPathFrom(cur);
              if(!path) return;
              const hit = Utils._signedCache.get(path);
              if(hit && hit.exp > Date.now() && hit.url !== cur) img.setAttribute('src', hit.url);
          } catch(e) {}
      },
      resolveProjectImgs: (root) => {
          try { (root || document).querySelectorAll('img[src]').forEach(Utils._resolveOneImg); } catch(e) {}
      },
      // Observer global : résout les <img> 'projects' au fil des rendus + re-signature périodique
      startImgResolver: () => {
          if(Utils._imgObserver) { Utils.resolveProjectImgs(document); return; }
          Utils._imgObserver = new MutationObserver((muts) => {
              for(const m of muts) {
                  if(!m.addedNodes) continue;
                  m.addedNodes.forEach((n) => {
                      if(n.nodeType !== 1) return;
                      if(n.tagName === 'IMG') Utils._resolveOneImg(n);
                      else if(n.querySelectorAll) n.querySelectorAll('img[src]').forEach(Utils._resolveOneImg);
                  });
              }
          });
          Utils._imgObserver.observe(document.body, { childList: true, subtree: true });
          Utils.resolveProjectImgs(document);
          if(!Utils._resignTimer) {
              Utils._resignTimer = setInterval(async () => {
                  if(!state.currentProjectId || !state.data) return;
                  await Utils.refreshSignedCache(state.data);
                  Utils.resolveProjectImgs(document);
              }, (Utils.STORAGE_TTL - 600) * 1000);
          }
      },

      // v616 : préchauffe en tâche de fond (rien à l'écran, pas de rendu) le
      // cache HTTP du navigateur pour les images de calques du Storyboard,
      // juste après l'ouverture du projet. But : quand l'utilisateur clique
      // sur l'onglet Storyboard, les images sont déjà en cache navigateur au
      // lieu de partir chercher chaque fichier sur le réseau à cet instant-là
      // (ce qui donnait l'impression que ça ne commençait à charger qu'en
      // ouvrant l'onglet). S'appuie sur le cache d'URLs signées déjà rempli
      // par refreshSignedCache juste avant — ne resigne rien lui-même.
      // ===== RECHAUFFAGE DU CACHE IMAGES (v599) =====
      // Commun au Storyboard et au Mood Board. Les deux collecteurs ci-dessous
      // lancaient TOUTES leurs images d'un coup, parfois plusieurs centaines.
      // Trois defauts, tous corriges ici :
      //  - depart tardif : jusqu'a 4 s d'attente d'un moment de repos ;
      //  - aucune limite : le navigateur mettait tout en file d'attente, et les
      //    dernieres images arrivaient bien apres le clic sur l'onglet ;
      //  - aucun moyen de SAVOIR si le prechauffage faisait son travail —
      //    d'ou l'impression qu'il ne servait a rien. Utils.prefetchInfo(),
      //    a taper dans la console, le dit maintenant.
      // Le prechauffage reste un CONFORT : il n'affiche jamais d'erreur, et
      // s'abstient entierement en connexion econome (forfait limite).
      PREFETCH_CONC: 4,
      _prefetchFile: [],
      _prefetchActifs: 0,
      _prefetchBilan: { demandees: 0, chargees: 0, echouees: 0, ignorees: 0 },
      _warmImages: (paths, source) => {
          try {
              const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
              if(conn && conn.saveData) { Utils._prefetchBilan.ignorees += paths.length; return; }
              paths.forEach(p => {
                  const url = Utils.signedUrlFor(p);
                  // Pas encore signee a cet instant : on n'insiste pas, la passe
                  // suivante (re-signature horaire) la reprendra.
                  if(!url || url === p) { Utils._prefetchBilan.ignorees++; return; }
                  Utils._prefetchFile.push({ url: url, source: source });
                  Utils._prefetchBilan.demandees++;
              });
              const servir = () => {
                  while(Utils._prefetchActifs < Utils.PREFETCH_CONC && Utils._prefetchFile.length) {
                      const item = Utils._prefetchFile.shift();
                      Utils._prefetchActifs++;
                      const img = new Image();
                      img.decoding = 'async';
                      if('fetchPriority' in img) img.fetchPriority = 'low';
                      const fini = (ok) => {
                          Utils._prefetchBilan[ok ? 'chargees' : 'echouees']++;
                          Utils._prefetchActifs--;
                          servir();
                      };
                      img.onload = () => fini(true);
                      img.onerror = () => fini(false);
                      img.src = item.url;
                  }
              };
              if('requestIdleCallback' in window) requestIdleCallback(servir, { timeout: 1000 });
              else setTimeout(servir, 300);
          } catch(e) { /* confort : jamais bruyant */ }
      },
      // Les DESSINS du storyboard ne passent pas par le cache d'images du
      // navigateur : ils sont telecharges en blob par le SDK. Les rechauffer
      // veut donc dire remplir le cache de blobs, pas lancer des <img>.
      _warmBlobs: (paths) => {
          try {
              const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
              if(conn && conn.saveData) { Utils._prefetchBilan.ignorees += paths.length; return; }
              if(typeof StoryboardExport === 'undefined' || !StoryboardExport._resolveBlobUrl) return;
              Utils._prefetchBilan.demandees += paths.length;
              const file = paths.slice();
              let actifs = 0;
              const servir = () => {
                  while(actifs < 3 && file.length) {
                      const p = file.shift();
                      actifs++;
                      StoryboardExport._resolveBlobUrl(p)
                          .then(u => { Utils._prefetchBilan[u ? 'chargees' : 'echouees']++; })
                          .catch(() => { Utils._prefetchBilan.echouees++; })
                          .then(() => { actifs--; servir(); });
                  }
              };
              if('requestIdleCallback' in window) requestIdleCallback(servir, { timeout: 1000 });
              else setTimeout(servir, 300);
          } catch(e) { /* confort : jamais bruyant */ }
      },
      // Diagnostic a taper dans la console du navigateur.
      prefetchInfo: () => Object.assign(
          { enAttente: Utils._prefetchFile.length, enCours: Utils._prefetchActifs },
          Utils._prefetchBilan),

      // ==================================================================
      //  ON PRECHAUFFE L'ONGLET OU L'ON ARRIVE, PAS TOUT LE PROJET (v601)
      //  ------------------------------------------------------------------
      //  Avant : a l'ouverture du projet, on lancait toutes les images du
      //  Storyboard ET du Mood Board. Quelqu'un qui vient ecrire une scene et
      //  n'ouvrira jamais ces deux onglets payait quand meme le reseau et la
      //  memoire de plusieurs centaines d'images.
      //  UNE FOIS PAR ONGLET ET PAR PROJET : y revenir dix fois ne relance
      //  rien, les images sont deja en cache. Le marqueur est remis a zero a
      //  l'ouverture d'un projet.
      _ongletsPrechauffes: {},
      prechaufferOnglet: (tabName) => {
          try {
              const quoi = { storyboard: 'prefetchStoryboardImages', moodboard: 'prefetchMoodboardImages' }[tabName];
              if(!quoi) return;
              if(Utils._ongletsPrechauffes[tabName]) return;
              Utils._ongletsPrechauffes[tabName] = true;
              Utils[quoi]();
          } catch(e) { /* confort : jamais bruyant */ }
      },

      prefetchStoryboardImages: () => {
          try {
              if(!state.data || !Array.isArray(state.data.shots) || state.data.shots.length === 0) return;
              // v599 : DEUX canaux distincts. Les calques de dessin se
              // telechargent en blob par le SDK ; les images televersees
              // s'affichent dans une balise et passent, elles, par le cache
              // d'images du navigateur. Les rechauffer de la meme facon
              // revenait a ne rechauffer NI l'un NI l'autre correctement.
              const dessins = new Set();
              const photos = new Set();
              const collectZone = (zone) => {
                  if(!zone) return;
                  if(zone.drawingData && Array.isArray(zone.drawingData.layers)) {
                      zone.drawingData.layers.forEach(l => {
                          const p = Utils._projPathFrom(l && l.imageData);
                          if(p) dessins.add(p);
                      });
                  }
                  if(zone.imageType === 'upload' && zone.imageUrl) {
                      const p = Utils._projPathFrom(zone.imageUrl);
                      if(p) photos.add(p);
                  }
              };
              state.data.shots.forEach(shot => {
                  if(shot.drawings) Object.values(shot.drawings).forEach(collectZone);
                  if(shot.drawingData) collectZone({ drawingData: shot.drawingData }); // compat racine, ancien format
                  if(shot.imageType === 'upload' && shot.imageUrl) {
                      const p = Utils._projPathFrom(shot.imageUrl);
                      if(p) photos.add(p);
                  }
              });
              if(photos.size) Utils._warmImages([...photos], 'storyboard');
              if(dessins.size) Utils._warmBlobs([...dessins]);
          } catch(e) { /* confort : jamais bruyant */ }
      },

      // v616 : même principe que prefetchStoryboardImages ci-dessus, pour les
      // éléments image/dessin des planches du Mood Board (même architecture
      // par calques, mêmes chemins de stockage privé).
      prefetchMoodboardImages: () => {
          try {
              if(!state.data || !Array.isArray(state.data.moodboards) || state.data.moodboards.length === 0) return;
              const paths = new Set();
              state.data.moodboards.forEach(board => {
                  (board.elements || []).forEach(el => {
                      if((el.type === 'image' || el.type === 'drawing') && el.src) {
                          const p = Utils._projPathFrom(el.src);
                          if(p) paths.add(p);
                      }
                  });
              });
              if(paths.size === 0) return;
              Utils._warmImages([...paths], 'moodboard');
          } catch(e) { /* confort : jamais bruyant */ }
      },

      uploadProjectFile: async (file, opts) => {
          // opts = { category: 'actors'|'locations'|'crew', entityId: 'act_xxx', kind: 'photo'|'gallery', maxDimension, quality, maxKb }
          if(!state.currentProjectId) { Utils.toast('Aucun projet ouvert', 'error'); return null; }
          if(!file) return null;
          opts = opts || {};
          
          // Compresser d'abord (réutilise la logique existante)
          const dataUrl = await Utils.compressImage(file, {
              maxDimension: opts.maxDimension || 1920,
              quality: opts.quality || 0.85,
              maxKb: opts.maxKb || 1500
          });
          if(!dataUrl) return null; // erreur de compression déjà signalée
          
          // Convertir le data URL en Blob pour upload
          let blob;
          try {
              const res = await fetch(dataUrl);
              blob = await res.blob();
          } catch(e) {
              Utils.toast('Erreur lors de la préparation du fichier', 'error');
              return null;
          }
          
          // Construire le chemin
          const ext = blob.type === 'image/png' ? 'png' : (blob.type === 'image/svg+xml' ? 'svg' : (blob.type === 'image/gif' ? 'gif' : 'jpg'));
          const kindSuffix = opts.kind === 'gallery' ? '_gallery' : '';
          const filename = `${opts.entityId || 'item'}${kindSuffix}_${Date.now()}.${ext}`;
          const filePath = `${state.currentProjectId}/${opts.category}/${filename}`;
          
          // Uploader vers Supabase Storage
          try {
              const { error: uploadErr } = await supabase.storage
                  .from('projects')
                  .upload(filePath, blob, {
                      contentType: blob.type,
                      upsert: false
                  });
              if(uploadErr) {
                  console.error('Erreur upload Storage:', uploadErr);
                  Utils.toast('Erreur lors de l\'enregistrement de la photo', 'error');
                  return null;
              }
              
              // Récupérer l'URL publique
              const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
              await Utils._cacheNewPath(filePath); // Lot D6 : signe+cache pour rendu immédiat sous bucket privé
              return urlData?.publicUrl || null;
          } catch(e) {
              console.error('Exception upload Storage:', e);
              Utils.toast('Erreur réseau lors de l\'upload', 'error');
              return null;
          }
      },
      
// Supprime un fichier du bucket projects à partir de son URL publique
      // Ne supprime que si l'URL pointe bien vers notre bucket (laisse les anciennes base64 intactes)
      deleteProjectFile: async (publicUrl) => {
          if(!publicUrl || typeof publicUrl !== 'string') return;
          if(!publicUrl.includes('/storage/v1/object/public/projects/')) return; // pas une URL Storage projects (probablement base64 hérité)
          try {
              const path = publicUrl.split('/storage/v1/object/public/projects/')[1];
              if(!path) return;
              const { error } = await supabase.storage.from('projects').remove([path]);
              if(error) console.warn('Erreur suppression fichier Storage:', error.message);
          } catch(e) {
              console.warn('Exception suppression Storage:', e);
          }
      },
      
      // === Upload d'un dataUrl base64 directement (sans compression supplémentaire) ===
      // Utile pour les calques de dessin canvas qui sont déjà au format PNG/JPEG optimal
      // Si upsertPath est fourni, le fichier écrase celui à ce chemin (utile pour save de calques)
      uploadDataUrl: async (dataUrl, filePath, upsert = true) => {
          if(!state.currentProjectId) return null;
          if(!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
          if(!filePath) return null;
          
          try {
              const blob = await (await fetch(dataUrl)).blob();
              const { error: uploadErr } = await supabase.storage
                  .from('projects')
                  .upload(filePath, blob, {
                      contentType: blob.type,
                      upsert: upsert
                  });
              if(uploadErr) {
                  console.error('Erreur upload calque Storage:', uploadErr);
                  return null;
              }
              const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
              await Utils._cacheNewPath(filePath); // Lot D6 : signe+cache pour rendu immédiat sous bucket privé
              // Ajout d'un cache-buster pour éviter que le navigateur affiche une vieille version après upsert
              return urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
          } catch(e) {
              console.error('Exception upload calque Storage:', e);
              return null;
          }
      },
      
      // === Script de migration ponctuelle : extrait les base64 hérités vers Storage ===
      // À lancer manuellement depuis la console : await app.Utils.migrateProjectPhotos()
      // Idempotent : peut être relancé sans risque (les URLs Storage sont skippées)
      // Conservateur : si un upload échoue, le base64 est conservé pour ne pas perdre la photo
      migrateProjectPhotos: async () => {
          if(!state.currentProjectId) { console.error('Aucun projet ouvert'); return; }
          if(!state.data) { console.error('state.data vide'); return; }
          
          console.log('🔄 Démarrage migration photos base64 → Storage...');
          let totalProcessed = 0, totalSuccess = 0, totalFailed = 0, totalSkipped = 0;
          
          // Helper : convertir un dataUrl base64 en Blob
          const dataUrlToBlob = async (dataUrl) => {
              try {
                  const res = await fetch(dataUrl);
                  return await res.blob();
              } catch(e) { return null; }
          };
          
          // Helper : uploader un base64 vers Storage et retourner l'URL
          const uploadBase64 = async (dataUrl, category, entityId, kind) => {
              const blob = await dataUrlToBlob(dataUrl);
              if(!blob) return null;
              const ext = blob.type === 'image/png' ? 'png' : (blob.type === 'image/svg+xml' ? 'svg' : (blob.type === 'image/gif' ? 'gif' : 'jpg'));
              const kindSuffix = kind === 'gallery' ? '_gallery' : '';
              const filename = `${entityId || 'item'}${kindSuffix}_migrated_${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
              const filePath = `${state.currentProjectId}/${category}/${filename}`;
              try {
                  const { error: upErr } = await supabase.storage.from('projects').upload(filePath, blob, { contentType: blob.type, upsert: false });
                  if(upErr) { console.warn('Échec upload', filePath, upErr.message); return null; }
                  const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
                  return urlData?.publicUrl || null;
              } catch(e) {
                  console.warn('Exception upload', filePath, e);
                  return null;
              }
          };
          
          const isBase64 = (val) => typeof val === 'string' && val.startsWith('data:');
          
          // Helper générique pour migrer un champ photo unique d'une entité
          const migratePhoto = async (entity, field, category, entityId) => {
              if(!entity || !isBase64(entity[field])) return;
              totalProcessed++;
              const url = await uploadBase64(entity[field], category, entityId, 'photo');
              if(url) { entity[field] = url; totalSuccess++; }
              else { totalFailed++; }
          };
          
          // Helper générique pour migrer un tableau galleryPhotos
          const migrateGallery = async (entity, category, entityId) => {
              if(!entity || !Array.isArray(entity.galleryPhotos)) return;
              for(let i = 0; i < entity.galleryPhotos.length; i++) {
                  const val = entity.galleryPhotos[i];
                  if(!isBase64(val)) { totalSkipped++; continue; }
                  totalProcessed++;
                  const url = await uploadBase64(val, category, entityId, 'gallery');
                  if(url) { entity.galleryPhotos[i] = url; totalSuccess++; }
                  else { totalFailed++; }
              }
          };
          
          // 1. Comédiens
          for(const actor of (state.data.actors || [])) {
              await migratePhoto(actor, 'photo', 'actors', actor.id);
              await migrateGallery(actor, 'actors', actor.id);
          }
          // 2. Décors
          for(const loc of (state.data.locations || [])) {
              await migrateGallery(loc, 'locations', loc.id);
          }
          // 3. Équipe
          for(const member of (state.data.crew || [])) {
              await migratePhoto(member, 'photo', 'crew', member.id);
              await migrateGallery(member, 'crew', member.id);
          }
          // 4. Ressources
          for(const res of (state.data.resources || [])) {
              await migratePhoto(res, 'photo', 'resources', res.id);
          }
          
          console.log(`✅ Migration terminée. Traité : ${totalProcessed}, Succès : ${totalSuccess}, Échecs : ${totalFailed}, Skippés (déjà URL) : ${totalSkipped}`);
          
          if(totalSuccess > 0) {
              console.log('💾 Sauvegarde du projet allégé...');
              await Store.save();
              console.log('✅ Projet sauvegardé. Rechargez la page pour vérifier.');
              Utils.toast(`Migration : ${totalSuccess} photo(s) migrées vers Storage`, 'success', 5000);
          } else if(totalProcessed === 0) {
              console.log('ℹ️ Rien à migrer (toutes les photos sont déjà en URL Storage).');
              Utils.toast('Aucune photo base64 à migrer', 'info');
          } else {
              console.warn('⚠️ Aucune migration n\'a réussi. Vérifiez les permissions du bucket.');
              Utils.toast('Migration échouée. Vérifiez la console.', 'error');
          }
          
          return { totalProcessed, totalSuccess, totalFailed, totalSkipped };
      },
      
      // === Diagnostic : taille du projet par section + détection base64 ===
      // À lancer depuis la console : app.Utils.diagnoseProjectSize()
      diagnoseProjectSize: () => {
          const data = state.data;
          if(!data) { console.log('No data'); return; }
          const fullSize = JSON.stringify(data).length;
          console.log(`📊 Taille totale state.data : ${(fullSize/1024/1024).toFixed(2)} Mo (${fullSize} caractères)`);
          
          const sizes = [];
          Object.keys(data).forEach(key => {
              try {
                  const size = JSON.stringify(data[key]).length;
                  sizes.push({ key, size, pct: (size / fullSize * 100).toFixed(1) });
              } catch(e) {}
          });
          sizes.sort((a, b) => b.size - a.size);
          console.log('\n📁 Top sections par taille :');
          sizes.slice(0, 15).forEach(s => {
              console.log(`  ${s.key.padEnd(25)} : ${(s.size/1024).toFixed(0).padStart(8)} Ko (${s.pct}%)`);
          });
          
          // Détecter base64
          const fullStr = JSON.stringify(data);
          const base64Count = (fullStr.match(/data:image\//g) || []).length;
          const base64Pdf = (fullStr.match(/data:application\/pdf/g) || []).length;
          const base64Other = (fullStr.match(/data:[^"]+;base64/g) || []).length;
          let base64Size = 0;
          fullStr.split('"data:').slice(1).forEach(s => { base64Size += s.split('"')[0].length; });
          console.log(`\n🔍 Détection contenus base64 :`);
          console.log(`  Images "data:image/" : ${base64Count} occurrences`);
          console.log(`  PDF "data:application/pdf" : ${base64Pdf} occurrences`);
          console.log(`  Total "data:...;base64" : ${base64Other} occurrences`);
          console.log(`  Taille totale base64 : ${(base64Size/1024/1024).toFixed(2)} Mo (${(base64Size/fullSize*100).toFixed(1)}% du projet)`);
          
          // Détecter les plus gros champs string (chaînes longues)
          console.log(`\n🔬 Plus gros champs string (top 10) :`);
          const longStrings = [];
          const walk = (obj, path) => {
              if(typeof obj === 'string' && obj.length > 5000) {
                  longStrings.push({ path, size: obj.length, preview: obj.substring(0, 80) });
              } else if(Array.isArray(obj)) {
                  obj.forEach((item, i) => walk(item, `${path}[${i}]`));
              } else if(obj && typeof obj === 'object') {
                  Object.keys(obj).forEach(k => walk(obj[k], path ? `${path}.${k}` : k));
              }
          };
          walk(data, '');
          longStrings.sort((a, b) => b.size - a.size);
          longStrings.slice(0, 10).forEach(s => {
              console.log(`  ${s.path.substring(0, 60).padEnd(60)} : ${(s.size/1024).toFixed(0).padStart(7)} Ko — ${s.preview}...`);
          });
          
          return { totalSize: fullSize, sections: sizes, base64Count, base64Size, longStrings: longStrings.slice(0, 10) };
      },
      
      // === Diagnostic des snapshots du projet courant ===
      // À lancer depuis la console : app.Utils.diagnoseSnapshots()
      diagnoseSnapshots: () => {
          const snaps = state.data?.snapshots || [];
          console.log(`📸 ${snaps.length} snapshots dans le projet :`);
          snaps.forEach((s, i) => {
              const size = JSON.stringify(s).length;
              const date = s.timestamp ? new Date(s.timestamp).toLocaleString('fr-FR') : (s.date || 'inconnu');
              const label = s.label || s.name || s.reason || s.note || 'auto';
              console.log(`  [${i}] ${date.toString().padEnd(20)} | ${(size/1024/1024).toFixed(2)} Mo | ${label}`);
          });
          return snaps;
      },
      
      // === Migration des données storyboard existantes (base64 → Storage) ===
      // À lancer manuellement depuis la console : await app.Utils.migrateStoryboard()
      // Idempotent : peut être relancé sans risque (les URLs Storage sont skippées)
      // Conservateur : si un upload échoue, le base64 est conservé pour ne pas perdre les données
      //
      // Migre :
      //  - shot.imageUrl (image principale uploadée) → Storage
      //  - shot.drawings[kind].objects[].imageData (objets vectoriels images) → Storage
      //  - shot.drawings[kind].drawingData.layers[].imageData (calques de dessin) → Storage (upsert)
      //  - shot.versions[].data.layers[].imageData (versions historiques) → Storage (timestamp)
      //  - shot.drawingData.layers[].imageData (compat backwards 'original') → Storage (upsert)
      migrateStoryboard: async () => {
          if(!state.currentProjectId) { console.error('Aucun projet ouvert'); return; }
          if(!state.data) { console.error('state.data vide'); return; }
          if(!Array.isArray(state.data.shots) || state.data.shots.length === 0) {
              console.log('ℹ️ Aucun shot dans ce projet, rien à migrer');
              return;
          }
          
          console.log(`🔄 Démarrage migration storyboard de ${state.data.shots.length} shot(s)...`);
          let totalProcessed = 0, totalSuccess = 0, totalFailed = 0, totalSkipped = 0;
          const isBase64 = (val) => typeof val === 'string' && val.startsWith('data:');
          
          // Helper : convertir un dataUrl en blob
          const dataUrlToBlob = async (dataUrl) => {
              try {
                  const res = await fetch(dataUrl);
                  return await res.blob();
              } catch(e) { return null; }
          };
          
          // Helper : uploader un base64 vers Storage avec chemin déterministe
          const uploadToStorage = async (dataUrl, filePath, upsert = true) => {
              const blob = await dataUrlToBlob(dataUrl);
              if(!blob) return null;
              try {
                  const { error: upErr } = await supabase.storage.from('projects').upload(filePath, blob, { contentType: blob.type, upsert: upsert });
                  if(upErr) { console.warn('Échec upload', filePath, upErr.message); return null; }
                  const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
                  return urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
              } catch(e) {
                  console.warn('Exception upload', filePath, e);
                  return null;
              }
          };
          
          // Parcourir tous les shots
          for(const shot of state.data.shots) {
              const shotId = shot.id || 'unknown';
              
              // 1) shot.imageUrl (image principale uploadée)
              if(isBase64(shot.imageUrl)) {
                  totalProcessed++;
                  const filePath = `${state.currentProjectId}/storyboard/${shotId}_main_migrated_${Date.now()}.jpg`;
                  const url = await uploadToStorage(shot.imageUrl, filePath, false);
                  if(url) { shot.imageUrl = url; totalSuccess++; }
                  else { totalFailed++; }
              } else if(shot.imageUrl) {
                  totalSkipped++;
              }
              
              // 2) shot.drawings[kind] : objects[] + drawingData.layers[]
              if(shot.drawings) {
                  for(const kind of ['original', 'lighting', 'camera', 'actors']) {
                      const zone = shot.drawings[kind];
                      if(!zone) continue;
                      
                      // 2a) Objets vectoriels (images insérées)
                      if(Array.isArray(zone.objects)) {
                          for(const obj of zone.objects) {
                              if(obj.type !== 'image') continue;
                              if(isBase64(obj.imageData)) {
                                  totalProcessed++;
                                  const filePath = `${state.currentProjectId}/storyboard/${shotId}_${kind}_obj_${obj.id || Date.now()}.jpg`;
                                  const url = await uploadToStorage(obj.imageData, filePath, false);
                                  if(url) { obj.imageData = url; totalSuccess++; }
                                  else { totalFailed++; }
                              } else if(obj.imageData) {
                                  totalSkipped++;
                              }
                          }
                      }
                      
                      // 2b) Calques de dessin (chemin déterministe = upsert si re-migration)
                      if(zone.drawingData && Array.isArray(zone.drawingData.layers)) {
                          for(const layer of zone.drawingData.layers) {
                              if(isBase64(layer.imageData)) {
                                  totalProcessed++;
                                  const filePath = `${state.currentProjectId}/storyboard/${shotId}_${kind}_layer_${layer.id || 'unknown'}.png`;
                                  const url = await uploadToStorage(layer.imageData, filePath, true);
                                  if(url) { layer.imageData = url; totalSuccess++; }
                                  else { totalFailed++; }
                              } else if(layer.imageData) {
                                  totalSkipped++;
                              }
                          }
                      }
                  }
              }
              
              // 3) Versions historiques (shot.versions[].data.layers[])
              if(Array.isArray(shot.versions)) {
                  for(const version of shot.versions) {
                      if(!version.data || !Array.isArray(version.data.layers)) continue;
                      const versionKind = version.kind || 'original';
                      const versionTs = version.timestamp || Date.now();
                      for(const layer of version.data.layers) {
                          if(isBase64(layer.imageData)) {
                              totalProcessed++;
                              const filePath = `${state.currentProjectId}/storyboard/${shotId}_${versionKind}_layer_${layer.id || 'unknown'}_v${versionTs}.png`;
                              const url = await uploadToStorage(layer.imageData, filePath, false);
                              if(url) { layer.imageData = url; totalSuccess++; }
                              else { totalFailed++; }
                          } else if(layer.imageData) {
                              totalSkipped++;
                          }
                      }
                  }
              }
              
              // 4) Compat backwards : shot.drawingData.layers[] (alias de shot.drawings.original.drawingData.layers[])
              // Note : si shot.drawings.original.drawingData.layers a déjà été migré, ce sont les MÊMES références
              // mais en pratique JSON.parse a souvent cloné, donc on traite séparément
              if(shot.drawingData && Array.isArray(shot.drawingData.layers)) {
                  for(const layer of shot.drawingData.layers) {
                      if(isBase64(layer.imageData)) {
                          totalProcessed++;
                          const filePath = `${state.currentProjectId}/storyboard/${shotId}_original_layer_${layer.id || 'unknown'}.png`;
                          const url = await uploadToStorage(layer.imageData, filePath, true);
                          if(url) { layer.imageData = url; totalSuccess++; }
                          else { totalFailed++; }
                      } else if(layer.imageData) {
                          totalSkipped++;
                      }
                  }
              }
          }
          
          console.log(`✅ Migration storyboard terminée.`);
          console.log(`   Traité : ${totalProcessed}, Succès : ${totalSuccess}, Échecs : ${totalFailed}, Skippés (déjà URL) : ${totalSkipped}`);
          
          if(totalSuccess > 0) {
              console.log('💾 Sauvegarde du projet allégé...');
              await Store.save();
              console.log('✅ Projet sauvegardé. Rechargez la page (F5) pour vérifier.');
              Utils.toast(`Migration storyboard : ${totalSuccess} image(s) migrées (${totalFailed} échecs)`, 'success', 6000);
          } else if(totalProcessed === 0) {
              console.log('ℹ️ Rien à migrer (tout est déjà en Storage ou aucun contenu base64).');
              Utils.toast('Storyboard : aucune image base64 à migrer', 'info');
          } else {
              console.warn('⚠️ Aucune migration n\'a réussi. Vérifiez les permissions du bucket.');
              Utils.toast('Migration échouée. Vérifiez la console.', 'error');
          }
          
          return { totalProcessed, totalSuccess, totalFailed, totalSkipped };
      },
      
      // === [Phase D6] Migration du projet courant vers le nouveau format Journal ===
      // À lancer depuis la console : await app.Utils.migrateProjectHistory()
      // 
      // Effets :
      //   1. Normalise les anciennes entrées state.data.history (ajoute id, link, recoverable, target = null)
      //   2. Tronque à History.MAX_ENTRIES (50) si dépassement
      //   3. Vide state.data.snapshots[] (résidus obsolètes)
      //   4. Supprime state.data.history_mode (paramètre obsolète)
      //   5. Sauvegarde le projet allégé
      //
      // Idempotent : peut être relancé sans risque.
      migrateProjectHistory: async () => {
          if(!state.currentProjectId) { console.error('Aucun projet ouvert'); return; }
          if(!state.data) { console.error('state.data vide'); return; }
          
          console.log('🔄 Démarrage migration journal/snapshots...');
          
          let stats = {
              entriesMigrated: 0,
              entriesAlreadyOk: 0,
              entriesTrimmed: 0,
              snapshotsRemoved: 0,
              historyModeRemoved: false,
              snapshotsSizeFreedMo: 0
          };
          
          // 1. Normaliser les anciennes entrées history
          if(Array.isArray(state.data.history)) {
              const beforeCount = state.data.history.length;
              for(const entry of state.data.history) {
                  // Détection ancienne entrée : pas d'id ou pas de champ 'target'/'link'/'recoverable' explicite
                  const isLegacy = !entry.id || 
                                   (entry.link === undefined && 
                                    entry.recoverable === undefined && 
                                    entry.target === undefined);
                  if(isLegacy) {
                      // Génère un id si absent
                      if(!entry.id) {
                          entry.id = 'log_legacy_' + (entry.timestamp || Date.now()) + '_' + Math.random().toString(36).slice(2, 8);
                      }
                      // Initialise les nouveaux champs à null s'ils manquent
                      if(entry.link === undefined) entry.link = null;
                      if(entry.recoverable === undefined) entry.recoverable = null;
                      if(entry.target === undefined) entry.target = null;
                      if(entry.details === undefined) entry.details = {};
                      // Nettoyer l'ancien champ 'level' (filtrage essentiel/complet)
                      delete entry.level;
                      stats.entriesMigrated++;
                  } else {
                      stats.entriesAlreadyOk++;
                  }
              }
              
              // Tronquer à MAX_ENTRIES (50)
              const cap = (typeof History !== 'undefined' && History.MAX_ENTRIES) ? History.MAX_ENTRIES : 50;
              if(state.data.history.length > cap) {
                  const expired = state.data.history.slice(cap);
                  state.data.history = state.data.history.slice(0, cap);
                  stats.entriesTrimmed = beforeCount - state.data.history.length;
                  // Cleanup Storage des entrées qui sortent (médias éventuels)
                  console.log(`🧹 Nettoyage des médias Storage pour ${expired.length} entrées qui sortent du cap...`);
                  for(const exp of expired) {
                      if(typeof History !== 'undefined' && History.cleanupExpiredEntry) {
                          await History.cleanupExpiredEntry(exp).catch(() => {});
                      }
                  }
              }
          }
          
          // 2. Vider state.data.snapshots (obsolètes depuis Phase D)
          if(Array.isArray(state.data.snapshots) && state.data.snapshots.length > 0) {
              stats.snapshotsRemoved = state.data.snapshots.length;
              stats.snapshotsSizeFreedMo = parseFloat((JSON.stringify(state.data.snapshots).length / 1024 / 1024).toFixed(2));
              state.data.snapshots = [];
          }
          
          // 3. Supprimer le paramètre obsolète history_mode (ancien filtrage essentiel/complet)
          if(state.data.history_mode !== undefined) {
              delete state.data.history_mode;
              stats.historyModeRemoved = true;
          }
          
          // 4. Sauvegarder
          console.log('💾 Sauvegarde du projet migré...');
          await Store.save();
          
          // Récapitulatif
          console.log('✅ Migration terminée :');
          console.log(`   Entrées historique migrées : ${stats.entriesMigrated}`);
          console.log(`   Entrées historique déjà OK : ${stats.entriesAlreadyOk}`);
          if(stats.entriesTrimmed > 0) console.log(`   Entrées historique tronquées (cap 50) : ${stats.entriesTrimmed}`);
          if(stats.snapshotsRemoved > 0) console.log(`   Snapshots supprimés : ${stats.snapshotsRemoved} (${stats.snapshotsSizeFreedMo} Mo libérés)`);
          if(stats.historyModeRemoved) console.log(`   Paramètre history_mode obsolète supprimé`);
          
          const hasChanges = stats.entriesMigrated > 0 || stats.snapshotsRemoved > 0 || stats.historyModeRemoved;
          if(hasChanges) {
              Utils.toast(`Projet migré : ${stats.snapshotsRemoved} snapshots supprimés (${stats.snapshotsSizeFreedMo} Mo)`, 'success', 5000);
          } else {
              console.log('ℹ️ Aucune migration nécessaire (projet déjà à jour).');
              Utils.toast('Projet déjà à jour', 'info');
          }
          
          return stats;
      },
      
      // === Purge des snapshots : garde uniquement les N plus récents (par défaut 3) ===
      // À lancer depuis la console : await app.Utils.purgeSnapshots(3)
      // Si labeled=true, on garde aussi tous les snapshots avec un label manuel
      purgeSnapshots: async (keepCount = 3, keepLabeled = true) => {
          if(!state.data) { console.log('No data'); return; }
          if(!Array.isArray(state.data.snapshots)) { console.log('Aucun snapshot'); return; }
          const before = state.data.snapshots.length;
          const beforeSize = JSON.stringify(state.data.snapshots).length;
          
          // Tri par date décroissante (les plus récents d'abord)
          state.data.snapshots.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          
          // Définir lesquels garder
          const kept = [];
          state.data.snapshots.forEach((s, i) => {
              const hasLabel = s.label || s.name;
              if(i < keepCount) kept.push(s);
              else if(keepLabeled && hasLabel) kept.push(s);
          });
          
          state.data.snapshots = kept;
          const afterSize = JSON.stringify(state.data.snapshots).length;
          const freedMo = ((beforeSize - afterSize) / 1024 / 1024).toFixed(2);
          
          console.log(`✅ Purge : ${before} → ${kept.length} snapshots (${freedMo} Mo libérés)`);
          console.log('💾 Sauvegarde du projet allégé...');
          await Store.save();
          console.log('✅ Projet sauvegardé. Rechargez la page.');
          Utils.toast(`${before - kept.length} snapshots supprimés (${freedMo} Mo)`, 'success', 5000);
          return { before, after: kept.length, freedMo };
      },
      
      getInitials: (email) => email.substring(0,2).toUpperCase(),
      getColor: (str) => { const colors = ['#f44336', '#E91E63', '#9C27B0', '#3F51B5', '#2196F3', '#009688', '#FF9800', '#795548']; let hash = 0; for(let i=0; i<str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); return colors[Math.abs(hash) % colors.length]; },
      
      // Decompose « INT. CUISINE - JOUR » en ses trois morceaux. Regle unique,
      // partagee par la fiche de scene et tout ce qui doit relire un titre :
      // la meme expression etait recopiee dans Actions.editScene et dans
      // Actions.addScene, avec des replis differents en cas de titre non
      // conforme (titre libre importe d'un scenario, par exemple).
      // MOMENTS RECONNUS : la meme liste que PlanningFDS.decor, qui deduit le
      // decor en retirant le moment de fin de titre. Sans cette liste, un titre
      // comme « INT. APPARTEMENT D'ALIX - PARIS - NUIT » se coupait au PREMIER
      // tiret et rendait « PARIS - NUIT » comme moment.
      SCENE_MOMENTS: ['JOUR', 'NUIT', 'AUBE', 'CRÉPUSCULE', 'CREPUSCULE', 'MATIN', 'SOIR', 'SOIRÉE', 'SOIREE'],
      sceneTitleParts: (title) => {
          const t = String(title || '').trim();
          let pre = '', reste = t;
          const mp = t.match(/^\s*(INT\.?\/EXT\.?|I\s*\/\s*E|INT\.?|EXT\.?)\s*\.?\s*(.*)$/i);
          if(mp) { pre = mp[1].replace(/\.$/, '').toUpperCase(); reste = mp[2]; }
          else {
              const mg = t.match(/^([^\.]+)\.\s*(.*)$/);
              if(mg) { pre = mg[1].trim().toUpperCase(); reste = mg[2]; }
          }
          // Le moment est le dernier morceau apres tiret, et seulement s'il en
          // est un : « - PARIS » n'est pas un moment, « - NUIT » oui.
          let loc = reste.trim(), suff = '';
          const ms = reste.match(/^(.*?)\s*[-–]\s*([^-–]+)$/);
          if(ms) {
              const cand = ms[2].trim().toUpperCase();
              if(Utils.SCENE_MOMENTS.includes(cand)) { loc = ms[1].trim(); suff = cand; }
          }
          return { pre: pre || 'EXT', loc: loc, suff: suff || 'JOUR' };
      },
      setupAutocomplete: (inp, opts) => { 
          // opts = { source: () => array d'items, listEl: DOM element, multi: bool, transform: fn(item)=>string }
          // Defauts : source = personnages, multi = true (separe par ;).
          // listEl n'a PAS de defaut : voir juste en dessous.
          opts = opts || {};
          const source = opts.source || (() => state.data.characters || []);
          // listEl est OBLIGATOIRE depuis le 1er septembre. Il avait pour
          // defaut els.acList, devenu null avec la bande de saisie du
          // sequencier : l'oubli se serait vu a la premiere frappe de
          // l'utilisateur, et pas avant. Mieux vaut refuser tout de suite.
          const listEl = opts.listEl;
          if(!listEl) { console.warn('[setupAutocomplete] appel sans listEl : liste deroulante ignoree.'); return; }
          const multi = opts.multi !== false;
          const transform = opts.transform || (item => item.name);
          let currentFocus = -1; 
          inp.addEventListener("input", function(e) { 
              const val = this.value; Utils.closeAllLists(); 
              if (!val) return false; 
              const terms = multi ? val.split(';') : [val];
              const currentTerm = terms[terms.length - 1].trim().toLowerCase(); 
              if(currentTerm.length < 1) return; 
              currentFocus = -1; listEl.innerHTML = ''; 
              const matches = source().filter(item => transform(item).toLowerCase().startsWith(currentTerm)); 
              if(matches.length === 0) return; 
              matches.forEach(match => { 
                  const matchName = transform(match);
                  const div = document.createElement("div"); div.className = "autocomplete-item"; 
                  div.innerHTML = "<strong>" + Utils.escape(matchName.substring(0, currentTerm.length)) + "</strong>" + Utils.escape(matchName.substring(currentTerm.length)); 
                  div.innerHTML += "<input type='hidden' value='" + Utils.escape(matchName) + "'>"; 
                  // v580 : cliquer une suggestion faisait d'abord PERDRE LE
                  // FOCUS au champ — le navigateur emettait alors 'change'
                  // avec le TEXTE PARTIEL (« Ali » pendant qu'on visait
                  // « ALIX »), et tout ce qui ecoute change travaillait sur ce
                  // fragment (creation de fiches personnage A, Al, Ali...).
                  // Meme parade que ScriptEditorAC : neutraliser le mousedown,
                  // le focus reste au champ, change ne part qu'a la vraie
                  // validation (point-virgule choisi, Entree, sortie du champ).
                  div.addEventListener("mousedown", function(e) { e.preventDefault(); });
                  div.addEventListener("click", function(e) { 
                      const chosen = this.getElementsByTagName("input")[0].value;
                      if(multi) {
                          terms[terms.length - 1] = " " + chosen; 
                          inp.value = terms.join(';').trim() + '; '; 
                      } else {
                          inp.value = chosen;
                      }
                      Utils.closeAllLists(); inp.focus(); 
                  }); 
                  listEl.appendChild(div); 
              }); 
              // LISTE D'UNE FICHE : le corps de la modale defile (overflow-y),
              // ce qui ROGNE tout enfant positionne en absolu — la liste etait
              // bien construite mais invisible. On la sort du flux en position
              // fixe, recalee sous le champ a chaque frappe.
              if(listEl.classList.contains('ac-fiche')) {
                  const r = inp.getBoundingClientRect();
                  listEl.style.position = 'fixed';
                  listEl.style.left = r.left + 'px';
                  listEl.style.top = (r.bottom + 2) + 'px';
                  listEl.style.width = r.width + 'px';
                  listEl.style.zIndex = '5000';
              }
          }); 
          inp.addEventListener("keydown", function(e) { 
              let x = listEl.getElementsByTagName("div"); 
              if (e.key === "ArrowDown") { currentFocus++; addActive(x); } 
              else if (e.key === "ArrowUp") { currentFocus--; addActive(x); } 
              else if (e.key === "Enter") { 
                  if (currentFocus > -1) { e.preventDefault(); if (x) x[currentFocus].click(); } 
                  else { Utils.closeAllLists(); } 
              } 
          }); 
          function addActive(x) { 
              if (!x) return false; removeActive(x); 
              if (currentFocus >= x.length) currentFocus = 0; 
              if (currentFocus < 0) currentFocus = (x.length - 1); 
              x[currentFocus].classList.add("autocomplete-active"); 
          } 
          function removeActive(x) { for (let i = 0; i < x.length; i++) x[i].classList.remove("autocomplete-active"); } 
      },
      closeAllLists: () => { 
          // Les deux balayages historiques (els.acList, els.acListLoc) sont
          // retires le 1er septembre : les deux valaient null ou undefined
          // depuis le retrait de la bande de saisie du sequencier. Seules
          // subsistent les listes nees dans une fiche.
          // Listes nees dans une fiche (classe ac-fiche) : elles sont creees et
          // detruites avec la modale, donc introuvables via els. Sans ce
          // balayage, une liste deroulante restait ouverte par-dessus le reste.
          document.querySelectorAll('.autocomplete-list.ac-fiche').forEach(l => { l.innerHTML = ''; });
      },
      // setupEnterNav retiree le 26 aout : elle enchainait le focus des six
      // champs de la bande de saisie du sequencier, qui n'existe plus.
      
      estimateTime: (htmlContent) => {
          if(!htmlContent) return "0";
          const tmp = document.createElement("DIV");
          tmp.innerHTML = htmlContent;
          const text = tmp.textContent || tmp.innerText || "";
          const wordCount = text.trim().split(/\s+/).length;
          if(wordCount === 0) return "0";
          const minutes = (wordCount / 250); 
          return minutes < 0.2 ? "0.2" : minutes.toFixed(1);
      }
  };

  // ========== PROFILE RENDERER - Fonction commune pour le rendu des profils ==========