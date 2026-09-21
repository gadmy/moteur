-- ============================================================================
--  MOTEUR — SEUL LE PROPRIETAIRE CHANGE LES DROITS DES MEMBRES (v601)
-- ============================================================================
--  APPLIQUEE le 21 septembre 2026 sur la base de production.
--
--  LE TROU
--  -------
--  memberPermissions ne figure PAS dans project_key_sections(), la table qui
--  dit quelle section commande quelle cle. Le declencheur d'ecriture ne la
--  regardait donc jamais : n'importe quel membre EDITEUR pouvait la reecrire,
--  donc s'attribuer des droits. Le navigateur ne propose ce tableau qu'au
--  proprietaire, mais une protection qui ne tient qu'a l'interface n'en est
--  pas une : il suffit d'envoyer la requete soi-meme.
--
--  POURQUOI PAS UNE LIGNE DE PLUS DANS project_key_sections
--  -------------------------------------------------------
--  Parce qu'une section y OUVRE un droit d'ecriture a qui la possede. Ici il
--  faut l'inverse : seul le proprietaire ecrit cette cle, quels que soient ses
--  autres droits. D'ou une regle a part.
--
--  LA DECISION VIT DANS SA PROPRE FONCTION
--  ---------------------------------------
--  peut_ecrire_droits_membres(projet, adresse) repond pour N'IMPORTE QUELLE
--  adresse. On peut donc verifier qu'elle repond juste — proprietaire oui,
--  co-proprietaire oui, membre editeur non, inconnu non — sans avoir a se
--  faire passer pour quelqu'un. Une regle de securite qu'on ne peut pas
--  interroger est une regle qu'on croit sur parole.
--
--  CE QUI NE CHANGE PAS : les sauvegardes ordinaires. Le declencheur ne se
--  reveille QUE si la cle a reellement bouge — et le navigateur n'envoie que
--  les cles modifiees.
-- ============================================================================

create or replace function public.peut_ecrire_droits_membres(p_project uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when coalesce(p_email, '') = '' then true   -- contexte serveur, pas de jeton
    else exists (
      select 1 from public.projects p
       where p.id = p_project and lower(p.owner_email) = lower(p_email)
    ) or exists (
      select 1 from public.project_members m
       where m.project_id = p_project
         and lower(m.email) = lower(p_email)
         and m.role = 'owner'
    )
  end;
$function$;

create or replace function public.projects_member_permissions_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if me = '' then return new; end if;
  if new.data is null or old.data is null then return new; end if;
  if (old.data -> 'memberPermissions') is not distinct from (new.data -> 'memberPermissions') then
    return new;
  end if;
  if public.peut_ecrire_droits_membres(new.id, me) then return new; end if;
  raise exception
    'Modification refusee : seul le proprietaire du projet change les droits des membres.'
    using errcode = '42501';
end;
$function$;

drop trigger if exists projects_member_permissions_guard on public.projects;
create trigger projects_member_permissions_guard
  before update on public.projects
  for each row execute function public.projects_member_permissions_guard();
