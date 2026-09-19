
  const ProfileRenderer = {
      // Options pour les selects
      selectOptions: {
          gender: [
              {value: '', label: '-- Sexe --'},
              {value: 'homme', label: 'Homme'},
              {value: 'femme', label: 'Femme'},
              {value: 'non-binaire', label: 'Non-binaire'},
              {value: 'non-precise', label: 'Ne souhaite pas préciser'}
          ],
          eyeColor: [
              {value: '', label: '-- Yeux --'},
              {value: 'marron', label: 'Marron'},
              {value: 'bleu', label: 'Bleu'},
              {value: 'vert', label: 'Vert'},
              {value: 'gris', label: 'Gris'},
              {value: 'noisette', label: 'Noisette'},
              {value: 'noir', label: 'Noir'}
          ],
          hairColor: [
              {value: '', label: '-- Cheveux (couleur) --'},
              {value: 'noir', label: 'Noir'},
              {value: 'brun', label: 'Brun'},
              {value: 'chatain', label: 'Châtain'},
              {value: 'blond', label: 'Blond'},
              {value: 'roux', label: 'Roux'},
              {value: 'gris', label: 'Gris'},
              {value: 'blanc', label: 'Blanc'},
              {value: 'chauve', label: 'Chauve'}
          ],
          hairLength: [
              {value: '', label: '-- Cheveux (longueur) --'},
              {value: 'chauve', label: 'Chauve'},
              {value: 'rase', label: 'Rasé'},
              {value: 'court', label: 'Court'},
              {value: 'mi-long', label: 'Mi-long'},
              {value: 'long', label: 'Long'}
          ],
          corpulence: [
              {value: '', label: '-- Corpulence --'},
              {value: 'mince', label: 'Mince'},
              {value: 'normal', label: 'Normal'},
              {value: 'athletique', label: 'Athlétique'},
              {value: 'muscle', label: 'Musclé'},
              {value: 'rond', label: 'Rond'},
              {value: 'fort', label: 'Fort / Costaud'}
          ],
          ethnicity: [
              {value: '', label: '-- Origine ethnique --'},
              {value: 'caucasien', label: 'Caucasien'},
              {value: 'africain', label: 'Africain / Afro-descendant'},
              {value: 'asiatique', label: 'Asiatique'},
              {value: 'latino', label: 'Latino / Hispanique'},
              {value: 'maghrebin', label: 'Maghrébin'},
              {value: 'moyenorient', label: 'Moyen-Orient'},
              {value: 'indien', label: 'Indien / Sud-asiatique'},
              {value: 'metis', label: 'Métis'},
              {value: 'autre', label: 'Autre'}
          ],
          professionalStatus: [
              {value: '', label: '-- Statut --'},
              {value: 'intermittent', label: 'Intermittent·e du spectacle'},
              {value: 'micro-entrepreneur', label: 'Micro-entrepreneur·e'},
              {value: 'amateur', label: 'Amateur·rice (pas de statut)'}
          ]
      },

      // Convertit URL YouTube/Vimeo en URL embed
      getEmbedUrl: (url) => {
          if(!url) return '';
          // YouTube
          const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
          if(ytMatch) return `https://www.youtube.com/embed/${Utils.escape(ytMatch[1])}`;
          // Vimeo
          const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
          if(vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
          if(/^https?:\/\//i.test(url)) return Utils.escape(url);
          return '';
      }
  };

  // ========== PREFERENCES SYNC ==========
  // Synchronise les préférences UI (localStorage ↔ Supabase user_profiles.preferences)