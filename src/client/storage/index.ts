export {
  getAllProjects,
  getProject,
  saveProject,
  deleteProject,
  createNewProject,
  generateProjectId,
  getStorageInfo,
} from './projectStorage';

export type { StoredProject, ProjectData } from './projectStorage';

// ADO PAT ani snapshot se na klientovi neukládají — po ADR-008 je obojí
// serverové (`ado_credentials`), takže tu žádné `adoStorage` není.

export {
  getPendingCommands,
  enqueuePendingCommand,
  removePendingCommand,
  clearPendingCommands,
  purgeExpiredCommands,
  PendingQueueFullError,
  MAX_PENDING_COMMANDS,
  PENDING_COMMAND_EXPIRY_MS,
} from './offlineQueue';

export type { PendingCommand } from './offlineQueue';

export { saveProjectCache, getProjectCache, clearProjectCache } from './projectCache';

export type { CachedProjectState } from './projectCache';
