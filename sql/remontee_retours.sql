-- ============================================================================
--  MOTEUR — REMONTEE DES RETOURS UTILISATEUR (v600)
-- ============================================================================
--  Complement de sql/remontee_erreurs.sql. Meme principe, autre source : ici
--  ce que les gens ECRIVENT (« Un probleme », « Une idee », « Autre »), la-bas
--  ce que l'application casse toute seule.
--
--  POURQUOI CETTE TABLE : les retours partaient en mail une fois par jour, et
--  une boite mail ne se trie pas, ne se compte pas et ne se relit pas a
--  plusieurs. Ils vivent donc ici, ou on peut les classer par urgence, marquer
--  ce qui est traite, et les croiser avec les erreurs remontees. Le mail
--  quotidien a ete SUPPRIME dans la foulee : il faisait doublon.
--
--  RETOURS ANONYMES : l'adresse de la personne n'est PAS enregistree, et elle
--  n'existe plus nulle part ailleurs depuis l'arret du mail. On ne peut donc
--  PAS recontacter quelqu'un depuis un retour — c'est assume : qui a vraiment
--  besoin d'une reponse ecrit directement a l'editeur. Remettre l'adresse ici
--  est possible, mais c'est une decision a reprendre, pas un detail.
--
--  PAS DE PURGE AUTOMATIQUE, contrairement aux erreurs : une erreur de l'an
--  dernier n'apprend plus rien, une idee d'utilisateur si.
-- ============================================================================

create table if not exists public.client_feedback (
    id           bigint generated always as identity primary key,
    created_at   timestamptz not null default now(),
    -- 'bug' | 'idee' | 'autre' — les trois choix de la fenetre de retour.
    type         text        not null check (length(type) <= 20),
    texte        text        not null check (length(texte) <= 4000),
    -- Contexte joint automatiquement : projet, onglet, role, navigateur.
    -- C'est lui qui rend un « ca ne marche pas » exploitable.
    contexte     text                 check (length(contexte) <= 600),
    version      text                 check (length(version) <= 20),
    -- Suivi, rempli par l'admin pendant les seances de tri.
    traite       boolean     not null default false,
    urgence      smallint             check (urgence between 1 and 3),  -- 1 urgent, 2 normal, 3 plus tard
    note         text                 check (length(note) <= 2000)
);

create index if not exists client_feedback_date_idx on public.client_feedback (created_at desc);

alter table public.client_feedback enable row level security;

-- ---------------------------------------------------------------------------
-- DEPOT : ouvert, comme pour les erreurs. Quelqu'un doit pouvoir signaler un
-- probleme meme si son compte est justement ce qui ne marche pas.
-- ---------------------------------------------------------------------------
drop policy if exists "depot libre des retours" on public.client_feedback;
create policy "depot libre des retours"
    on public.client_feedback for insert
    to anon, authenticated
    with check (true);

-- ---------------------------------------------------------------------------
-- LECTURE / SUIVI / MENAGE : admins seulement (meme liste que l'application,
-- CONFIG.adminEmails — ajouter une adresse ici ET la-bas).
-- ---------------------------------------------------------------------------
drop policy if exists "lecture des retours par l_admin" on public.client_feedback;
create policy "lecture des retours par l_admin"
    on public.client_feedback for select
    to authenticated
    using (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'));

drop policy if exists "mise a jour des retours par l_admin" on public.client_feedback;
create policy "mise a jour des retours par l_admin"
    on public.client_feedback for update
    to authenticated
    using (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'))
    with check (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'));

drop policy if exists "suppression des retours par l_admin" on public.client_feedback;
create policy "suppression des retours par l_admin"
    on public.client_feedback for delete
    to authenticated
    using (lower(auth.jwt() ->> 'email') in ('contact@moteur.studio'));
