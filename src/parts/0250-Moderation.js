
  const Moderation = {
      // Cache des badges récemment consultés (évite de requêter 50 fois)
      _badgeCache: new Map(),
      _cacheTTL: 60000, // 1 minute
      
      // Récupère le badge d'un email (avec cache)
      getBadge: async (email) => {
          if(!email) return null;
          const key = email.toLowerCase();
          const cached = Moderation._badgeCache.get(key);
          if(cached && (Date.now() - cached.ts) < Moderation._cacheTTL) {
              return cached.badge;
          }
          try {
              // Multi-profils : un email peut avoir plusieurs lignes
              // On prend le badge le plus restrictif (black > red > yellow > null)
              const { data, error } = await supabase
                  .from('user_profiles')
                  .select('moderation_badge')
                  .or(`email.eq.${Utils.pgSafe(key)},owner_email.eq.${Utils.pgSafe(key)}`)
                  .not('moderation_badge', 'is', null);
              if(error) console.warn('[Moderation] getBadge:', error);
              
              let badge = null;
              if(data && data.length > 0) {
                  const order = { black: 3, red: 2, yellow: 1 };
                  const sorted = data.slice().sort((a, b) => 
                      (order[b.moderation_badge] || 0) - (order[a.moderation_badge] || 0)
                  );
                  badge = sorted[0].moderation_badge || null;
              }
              
              Moderation._badgeCache.set(key, { badge, ts: Date.now() });
              return badge;
          } catch(e) {
              console.warn('[Moderation] Erreur getBadge:', e);
              return null;
          }
      },
      
      // Invalide le cache pour un email (à appeler après setProfileBadge)
      invalidateCache: (email) => {
          if(email) Moderation._badgeCache.delete(email.toLowerCase());
      },
      
      // Vérifie si deux emails ont déjà une "relation" (message passé OU projet commun)
      haveRelation: async (emailA, emailB) => {
          if(!emailA || !emailB) return false;
          const a = emailA.toLowerCase();
          const b = emailB.toLowerCase();
          if(a === b) return true; // Soi-même
          
          try {
              // 1) Message échangé dans un sens ou l'autre ?
              const { count: msgCount, error: errMsg } = await supabase
                  .from('messages')
                  .select('id', { count: 'exact', head: true })
                  .or(`and(from_email.eq.${Utils.pgSafe(a)},to_email.eq.${Utils.pgSafe(b)}),and(from_email.eq.${Utils.pgSafe(b)},to_email.eq.${Utils.pgSafe(a)})`);
              if(errMsg) console.warn('[Moderation] haveRelation (messages):', errMsg);
              if(msgCount && msgCount > 0) return true;
              
              // 2) Projet commun ?
              const { data: projA, error: errA } = await supabase
                  .from('project_members')
                  .select('project_id')
                  .eq('email', a);
              if(errA) console.warn('[Moderation] haveRelation (projA):', errA);
              if(!projA || projA.length === 0) return false;
              
              const projectIds = projA.map(p => p.project_id);
              const { count: commonCount, error: errC } = await supabase
                  .from('project_members')
                  .select('project_id', { count: 'exact', head: true })
                  .eq('email', b)
                  .in('project_id', projectIds);
              if(errC) console.warn('[Moderation] haveRelation (commonCount):', errC);
              
              return (commonCount && commonCount > 0);
          } catch(e) {
              console.warn('[Moderation] Erreur haveRelation:', e);
              // En cas d'erreur réseau, on laisse passer pour ne pas bloquer l'utilisateur
              return true;
          }
      },
      
      // Vérifie si fromEmail peut communiquer avec toEmail
      // Retourne { allowed: bool, reason: string | null }
      canCommunicate: async (fromEmail, toEmail) => {
          if(!fromEmail || !toEmail) return { allowed: true, reason: null };
          
          // Charger les 2 badges en parallèle
          const [fromBadge, toBadge] = await Promise.all([
              Moderation.getBadge(fromEmail),
              Moderation.getBadge(toEmail)
          ]);
          
          // Si aucun des deux n'est noir, communication libre
          if(fromBadge !== 'black' && toBadge !== 'black') {
              return { allowed: true, reason: null };
          }
          
          // Un des deux (ou les deux) est noir : vérifier relation existante
          const related = await Moderation.haveRelation(fromEmail, toEmail);
          if(related) return { allowed: true, reason: null };
          
          // Bloqué : déterminer le message selon qui est badgé
          if(fromBadge === 'black' && toBadge === 'black') {
              return {
                  allowed: false,
                  reason: 'Votre compte est en cours de vérification. Vous ne pouvez pas contacter de nouvelles personnes pour le moment.'
              };
          } else if(fromBadge === 'black') {
              return {
                  allowed: false,
                  reason: 'Votre compte est en cours de vérification. Vous ne pouvez pas contacter de nouvelles personnes pour le moment.'
              };
          } else {
              return {
                  allowed: false,
                  reason: 'Ce profil est en cours de vérification et ne peut pas être contacté pour le moment.'
              };
          }
      }
  };

// ============================================================
  // ActiveProfile - gestion du profil actif global (I3)
  // L'utilisateur peut avoir plusieurs profils publics. Le "profil actif"
  // est celui utilisé pour ses interactions sur le site :
  // messages, forum, feed, actualités, etc.
  // Persiste en localStorage, réinitialisé à la déconnexion.
  // ============================================================