-- supabase/migrations/0021_project_pipeline_stages.sql
-- Projects become a sales pipeline (Kanban lanes in ProjectsPage):
--   lead (Enquiry) → site_visit → proposal → won → installation → completed, plus lost.
-- Still one text column with a CHECK — a stage is a label on the project, not a
-- table of its own; the order and what each stage unlocks live in code
-- (projectRules.ts PROJECT_STATUSES / stageUnlocks) so they're testable.
-- The old catch-all 'active' had no defined meaning; it maps to 'site_visit',
-- the first in-progress stage, so nothing jumps ahead in the pipeline.

alter table projects drop constraint if exists projects_status_check;
update projects set status = 'site_visit' where status = 'active';
alter table projects add constraint projects_status_check
  check (status in ('lead', 'site_visit', 'proposal', 'won', 'installation', 'completed', 'lost'));
