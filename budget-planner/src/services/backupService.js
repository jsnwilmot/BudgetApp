const BACKUP_APP_NAME = "BudgetApp";
const BACKUP_VERSION = 1;

export function createBackupSnapshot(appData) {
  return {
    metadata: {
      appName: BACKUP_APP_NAME,
      backupVersion: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      source: "local"
    },
    data: appData
  };
}

export function validateBackupFile(backup) {
  if (!backup || typeof backup !== "object") {
    return { valid: false, message: "Backup file is not valid." };
  }

  if (!backup.metadata) {
    return { valid: false, message: "Backup metadata is missing." };
  }

  if (backup.metadata.appName !== BACKUP_APP_NAME) {
    return { valid: false, message: "This is not a BudgetApp backup file." };
  }

  if (!backup.metadata.backupVersion) {
    return { valid: false, message: "Backup version is missing." };
  }

  if (!backup.data || typeof backup.data !== "object") {
    return { valid: false, message: "Backup data is missing." };
  }

  return { valid: true, message: "Backup file is valid." };
}

export function getBackupFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `budgetapp-backup-${date}.json`;
}