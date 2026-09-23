-- ============================================================================
--  AUDIT DE SECURITE DU 23 SEPTEMBRE 2026 (v602) — LES DEUX PORTES CRITIQUES
-- ============================================================================
--  1. LA COLONNE « data » DES PROJETS SE LISAIT EN DIRECT.
--     Depuis v578, le contenu d'un projet ne doit passer QUE par
--     project_data_for_me, qui retire les onglets qu'on n'a pas le droit de
--     voir (le « cloisonnement »). Mais le correctif de v601
--     (lecture_projects.sql) a rendu aux connectes le droit de lire TOUTE la
--     table : un invite limite au Planning pouvait lire budget, contrats et
--     depenses d'une seule requete. On garde la lecture de la table, SANS la
--     colonne data. L'appli ne la lit plus nulle part en direct (verifie :
--     toutes ses lectures nomment leurs colonnes ; les deux creations de
--     projet ont ete corrigees avant ce fichier).
--     L'ecriture n'est pas touchee : on peut toujours ECRIRE data, et les
--     fonctions serveur (SECURITY DEFINER) la lisent comme avant.
--
--  2. LES PROFILS SE LISAIENT SANS COMPTE.
--     La regle « Profiles viewable except demo » est ouverte a « public »,
--     comptes anonymes compris, et le role anon avait la lecture de toutes
--     les colonnes : e-mail, telephone, date de naissance, coordonnees. La
--     seule cle publique (qui est dans la page) suffisait. Aucun ecran de
--     l'appli ne lit les profils sans etre connecte : on retire la lecture a
--     anon. SEUL EFFET : le compteur de la limite d'inscriptions pre-alpha,
--     lu a l'inscription, echoue — et il est deja ecrit pour laisser passer
--     dans ce cas.
--     A FAIRE ENSUITE (pas ici) : un compte connecte lit encore toutes les
--     colonnes de tous les profils non-demo.
-- ============================================================================

-- APPLIQUE le 23/09/2026 (migration securite_audit_v602), verifie en se
-- faisant passer pour un connecte : liste, ouverture et creation de projet
-- marchent, la colonne data est refusee ; anon ne lit plus les profils.

-- 1. projects : lecture sans la colonne data
revoke select on public.projects from authenticated;
revoke select on public.projects from anon;
grant select (id, owner_email, title, description, type, status, created_at,
              updated_at, owner_profile_id, project_type, episode_count, deleted_at)
  on public.projects to authenticated;

-- 2. user_profiles : plus aucune lecture sans compte
revoke select on public.user_profiles from anon;

-- 3. Canaux temps reel du projet (synchronisation « project_<id> » et
--    mini-chat « minichat_<id> ») : PRIVES. Publics, n'importe qui
--    connaissant l'identifiant d'un projet pouvait les ecouter et y parler.
--    Seuls le proprietaire et les membres acceptes (can_view_project) y
--    entrent. Le code ouvre ces canaux avec « private: true » depuis v602.
--    APPLIQUE le 23/09/2026 (migration canaux_temps_reel_prives_v602).
create or replace function public.canal_projet_autorise(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_topic ~ '^(project|minichat)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_view_project(substring(p_topic from '[0-9a-f-]{36}$')::uuid)
    else false end
$$;
revoke execute on function public.canal_projet_autorise(text) from public, anon;
grant execute on function public.canal_projet_autorise(text) to authenticated;
create policy "canaux projet : membres en lecture" on realtime.messages
  for select to authenticated using (public.canal_projet_autorise((select realtime.topic())));
create policy "canaux projet : membres en envoi" on realtime.messages
  for insert to authenticated with check (public.canal_projet_autorise((select realtime.topic())));
