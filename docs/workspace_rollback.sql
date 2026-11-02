-- Explicit rollback only. Export workspace data first; this removes new feature data. Never run automatically.
DROP TABLE `UserWorkspace`;
