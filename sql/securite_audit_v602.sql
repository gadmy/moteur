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

-- ============================================================================
--  SUITE DU 23/09 — DECISIONS DU DEVELOPPEUR
-- ============================================================================
-- 4. SEUL LE CREATEUR SUPPRIME (OU RESTAURE) UN PROJET. Les autres le
--    quittent (« Quitter le projet » les retire de leur hub). Avant : tout
--    editeur, meme limite a un onglet, pouvait renseigner deleted_at.
-- 5. SUPPRIMER UNE JOURNEE DE TOURNAGE (et donc sa feuille de service) est
--    reserve au createur, ou a l'assistant·e realisateur ayant l'ecriture sur
--    le Planning (reconnu a sa fiche dans l'equipe : meme adresse, poste
--    « assistant... realisat... »). MODIFIER une journee reste ouvert. Meme
--    regle pour effacer un PDF de feuille dans le stockage « callsheets »,
--    ou n'importe quel compte pouvait effacer n'importe quel fichier.
--    APPLIQUE (migration suppressions_reservees_v602). Teste sur un vrai
--    projet, annule ensuite : l'editeur ne supprime plus une journee mais la
--    modifie toujours, l'assistant·e la supprime, le createur met a la corbeille.
create or replace function public.peut_supprimer_fds(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_id
      and (
        lower(p.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (
          public.my_section_level(p_id, 'planning') = 'write'
          and exists (
            select 1 from jsonb_array_elements(coalesce(p.data -> 'crew', '[]'::jsonb)) m
            where lower(coalesce(m ->> 'email', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
              and coalesce(m ->> 'email', '') <> ''
              and (m ->> 'role') ~* 'assist'
              and (m ->> 'role') ~* 'r[eé]alisat'
          )
        )
      )
  )
$$;
revoke execute on function public.peut_supprimer_fds(uuid) from public, anon;
grant execute on function public.peut_supprimer_fds(uuid) to authenticated;

create or replace function public.projects_suppressions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text := lower(coalesce(auth.jwt() ->> 'email', ''));
  retires int;
begin
  if me = '' then return new; end if;
  if new.deleted_at is distinct from old.deleted_at and me <> lower(old.owner_email) then
    raise exception 'Seul le createur du projet peut le supprimer ou le restaurer.' using errcode = '42501';
  end if;
  if old.data is not null and new.data is not null
     and (old.data -> 'shootingDays') is distinct from (new.data -> 'shootingDays') then
    select count(*) into retires
      from jsonb_array_elements(coalesce(old.data -> 'shootingDays', '[]'::jsonb)) o
     where coalesce(o ->> 'id', '') <> ''
       and not exists (select 1 from jsonb_array_elements(coalesce(new.data -> 'shootingDays', '[]'::jsonb)) n
                        where n ->> 'id' = o ->> 'id');
    if retires > 0 and not public.peut_supprimer_fds(new.id) then
      raise exception 'Supprimer une journee de tournage est reserve au createur du projet et a l''assistant(e) realisateur.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger projects_suppressions_guard before update on public.projects
  for each row execute function public.projects_suppressions_guard();

drop policy if exists callsheets_delete_auth on storage.objects;
create policy callsheets_delete_fds on storage.objects for delete to authenticated
  using (bucket_id = 'callsheets'
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.peut_supprimer_fds(((storage.foldername(name))[1])::uuid));

-- 6. LES PROFILS DES AUTRES. Un compte connecte ne lit plus EN DIRECT que
--    ses propres profils, les profils PUBLICS, et tout pour l'administration.
--    Les profils prives (42 sur 50 le 23/09) etaient lisibles en entier par
--    n'importe qui ayant cree un compte. Ce dont l'appli a besoin sur un
--    profil prive (un compte existe-t-il pour cette adresse, le nom d'un
--    invite, un badge de moderation) passe par profils_minimaux, qui ne rend
--    que cela — et une adresse seulement si c'est celle qu'on a demandee.
--    APPLIQUE (migrations profils_minimaux_v602 puis, une fois le code en
--    ligne, lecture_profils_et_badge_v602). Verifie : un inconnu voit 8
--    profils (les publics), aucun prive ; le proprietaire voit le sien ;
--    l'admin voit tout.
create or replace function public.profils_minimaux(p_emails text[] default null, p_ids uuid[] default null)
returns table(id uuid, name text, profile_type text, email text, owner_email text, moderation_badge text)
language sql stable security definer set search_path = public as $$
  with q as (select array(select lower(trim(x)) from unnest(coalesce(p_emails, '{}'::text[])) x) as le)
  select p.id, p.name, p.profile_type,
         case when lower(p.email) = any(q.le) then p.email end,
         case when lower(p.owner_email) = any(q.le) then p.owner_email end,
         p.moderation_badge
    from public.user_profiles p, q
   where auth.uid() is not null
     and (coalesce(p.is_demo, false) = false
          or lower(coalesce(auth.jwt() ->> 'email', '')) in ('ga.demauroy@gmail.com', 'contact@moteur.studio', 'ga.dmy@ikmail.com'))
     and ((cardinality(q.le) > 0 and (lower(p.email) = any(q.le) or lower(p.owner_email) = any(q.le)))
          or (p_ids is not null and p.id = any(p_ids)))
   limit 500
$$;
revoke execute on function public.profils_minimaux(text[], uuid[]) from public, anon;
grant execute on function public.profils_minimaux(text[], uuid[]) to authenticated;

drop policy if exists "Profiles viewable except demo" on public.user_profiles;
create policy "Profils lisibles : les miens, les publics, l'admin" on public.user_profiles
  for select to authenticated using (
    lower(coalesce(email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    or lower(coalesce(owner_email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) in ('ga.demauroy@gmail.com', 'contact@moteur.studio')
    or (is_public = true and coalesce(is_demo, false) = false)
  );

-- 7. LE BADGE DE MODERATION NE SE RETIRE PAS SOI-MEME. La regle de mise a
--    jour autorise toutes les colonnes de sa propre ligne : un utilisateur
--    averti pouvait effacer l'avertissement. Seule l'administration y touche.
--    APPLIQUE et verifie (badge pose puis tentative d'effacement : refusee).
create or replace function public.user_profiles_badge_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if me = '' or me in ('ga.demauroy@gmail.com', 'contact@moteur.studio') then return new; end if;
  if new.moderation_badge is distinct from old.moderation_badge
     or new.badge_reason is distinct from old.badge_reason
     or new.badge_set_at is distinct from old.badge_set_at
     or new.badge_set_by is distinct from old.badge_set_by then
    raise exception 'Le badge de moderation est reserve a l''administration.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger user_profiles_badge_guard before update on public.user_profiles
  for each row execute function public.user_profiles_badge_guard();
