-- ============================================================================
--  MOTEUR — DIFFUSER LES VERROUS EN TEMPS REEL (v601)
-- ============================================================================
--  APPLIQUEE le 21 septembre 2026 sur la base de production.
--
--  LE DEFAUT
--  ---------
--  LockManager.init s'abonne aux changements de la table project_locks pour
--  savoir qui prend et qui rend un verrou. Cet abonnement REUSSISSAIT, mais
--  n'a jamais rien recu : la table n'etait pas dans la publication temps reel.
--  Chaque poste gardait donc la photo des verrous prise a l'ouverture du
--  projet. Une personne qui quittait une scene la laissait affichee comme
--  occupee chez les autres, indefiniment.
--
--  Rien ne s'en plaignait : un abonnement a une table non publiee ne renvoie
--  pas d'erreur, il reste simplement muet. C'est le pire des defauts — celui
--  qui a l'air de marcher.
--
--  REPLICA IDENTITY FULL
--  ---------------------
--  Indispensable pour les SUPPRESSIONS, c'est-a-dire pour les LIBERATIONS.
--  Sans elle, la ligne effacee n'est transmise qu'avec sa cle primaire ; le
--  filtre par projet pose cote client ne peut alors pas la reconnaitre, et on
--  verrait les prises de verrou sans jamais voir les liberations.
-- ============================================================================

alter table public.project_locks replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_locks'
  ) then
    alter publication supabase_realtime add table public.project_locks;
  end if;
end $$;
