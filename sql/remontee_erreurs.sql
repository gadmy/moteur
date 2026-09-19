-- ============================================================================
--  MOTEUR — REMONTEE DES ERREURS DE CONSOLE (v600)
-- ============================================================================
--  A jouer UNE FOIS dans l'editeur SQL de Supabase.
--
--  A QUOI CA SERT : jusqu'ici, quand l'application plantait chez quelqu'un,
--  l'erreur restait dans SON navigateur (ErrorLogger, 20 dernieres erreurs en
--  memoire locale). Personne ne la voyait jamais. Cette table est le bout du
--  tuyau : le navigateur y depose l'erreur, l'admin la lit.
--
--  CE QU'ON ENVOIE, ET RIEN D'AUTRE : le message d'erreur, le fichier, la
--  ligne, la pile d'appel, la page en cours, la version de l'application et un
--  navigateur abrege. AUCUN identifiant de compte, AUCUN identifiant de projet.
--  On voit le bug, pas qui l'a eu. C'est un choix : ca evite d'avoir a traiter
--  ces traces comme de la donnee personnelle.
--
--  POURQUOI L'INSERTION EST OUVERTE A TOUS : une erreur doit pouvoir remonter
--  meme quand la personne n'est pas connectee — y compris quand c'est
--  justement l'ouverture de session qui a plante. La table est donc en
--  ECRITURE SEULE pour le public : on peut y deposer, jamais y lire, jamais
--  modifier, jamais supprimer. La lecture est reservee aux admins.
--
--  GARDE-FOUS CONTRE L'INONDATION : les longueurs sont bornees ici (une pile
--  d'appel ne depassera pas 2000 caracteres quoi qu'il arrive), et le
--  navigateur, de son cote, n'envoie chaque erreur identique qu'UNE FOIS par
--  session, avec un plafond par session. Voir ErrorLogger dans l'application.
-- ============================================================================

create table if not exists public.client_errors (
    id           bigint generated always as identity primary key,
    created_at   timestamptz not null default now(),
    -- Empreinte de regroupement : meme type + meme message + meme endroit.
    -- C'est elle qui permet de dire « cette erreur est arrivee 47 fois »
    -- plutot que d'afficher 47 lignes identiques.
    empreinte    text        not null check (length(empreinte) <= 120),
    type         text        not null check (length(type) <= 40),
    message      text        not null check (length(message) <= 500),
    source       text                 check (length(source) <= 300),
    ligne        integer,
    colonne      integer,
    pile         text                 check (length(pile) <= 2000),
    page         text                 check (length(page) <= 300),
    version      text                 check (length(version) <= 20),
    navigateur   text                 check (length(navigateur) <= 120),
    -- Marqueur de traitement, mis par l'admin depuis le tableau de bord.
    traite       boolean     not null default false
);

create index if not exists client_errors_date_idx      on public.client_errors (created_at desc);
create index if not exists client_errors_empreinte_idx on public.client_errors (empreinte);

alter table public.client_errors enable row level security;

-- ---------------------------------------------------------------------------
-- DEPOT : ouvert a tous, connecte ou non. C'est volontaire (voir en-tete).
-- ---------------------------------------------------------------------------
drop policy if exists "depot libre des erreurs" on public.client_errors;
create policy "depot libre des erreurs"
    on public.client_errors for insert
    to anon, authenticated
    with check (true);

-- ---------------------------------------------------------------------------
-- LECTURE : admins seulement. La liste des admins est celle de l'application
-- (CONFIG.adminEmails). Ajouter une adresse ici ET la-bas.
-- ---------------------------------------------------------------------------
drop policy if exists "lecture des erreurs par l_admin" on public.client_errors;
create policy "lecture des erreurs par l_admin"
    on public.client_errors for select
    to authenticated
    using (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'));

-- ---------------------------------------------------------------------------
-- MARQUER COMME TRAITE / FAIRE LE MENAGE : admins seulement.
-- ---------------------------------------------------------------------------
drop policy if exists "mise a jour des erreurs par l_admin" on public.client_errors;
create policy "mise a jour des erreurs par l_admin"
    on public.client_errors for update
    to authenticated
    using (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'))
    with check (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'));

drop policy if exists "suppression des erreurs par l_admin" on public.client_errors;
create policy "suppression des erreurs par l_admin"
    on public.client_errors for delete
    to authenticated
    using (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'));

-- ---------------------------------------------------------------------------
-- MENAGE AUTOMATIQUE : au-dela de 60 jours, une erreur n'apprend plus rien.
-- A appeler depuis une tache planifiee (pg_cron), ou a la main de temps en
-- temps. Ecrite en SECURITY DEFINER pour pouvoir passer outre la RLS.
-- ---------------------------------------------------------------------------
create or replace function public.purge_client_errors()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    supprimees integer;
begin
    delete from public.client_errors where created_at < now() - interval '60 days';
    get diagnostics supprimees = row_count;
    return supprimees;
end;
$$;

revoke all on function public.purge_client_errors() from public, anon, authenticated;
