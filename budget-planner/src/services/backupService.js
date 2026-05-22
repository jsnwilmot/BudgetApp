import {
  BACKUP_APP_NAME,
  getBackupSectionSummary,
  getCurrentAppDataVersion,
  getCurrentAppVersion,
  isPlainObject,
  normalizeImportedAppData
} from "../data/migrations";

const BACKUP_VERSION = 1;

export function createBackupSnapshot(appData) {
  const createdAt = new Date().toISOString();

  return {
    metadata: {
      appName: BACKUP_APP_NAME,
      appVersion: getCurrentAppVersion(),
      backupVersion: BACKUP_VERSION,
      appDataVersion: getCurrentAppDataVersion(),
      createdAt,
      source: "local"
    },
    data: {
      ...appData,
      appMetadata: {
        ...(appData?.appMetadata || {}),
        lastBackupAt: createdAt,
        updatedAt: createdAt
      },
      appVersion: getCurrentAppVersion(),
      appDataVersion: getCurrentAppDataVersion()
    }
  };
}

export function validateBackupFile(backup) {
  if (!isPlainObject(backup)) {
    return { valid: false, message: "Backup file is not valid." };
  }

  if (!isPlainObject(backup.metadata)) {
    return { valid: false, message: "Backup metadata is missing." };
  }

  if (backup.metadata.appName !== BACKUP_APP_NAME) {
    return { valid: false, message: "This is not a BudgetApp backup file." };
  }

  if (!backup.metadata.backupVersion) {
    return { valid: false, message: "Backup version is missing." };
  }

  const appDataVersion = Number(backup.metadata.appDataVersion ?? 0);

  if (appDataVersion > getCurrentAppDataVersion()) {
    return {
      valid: false,
      message: "This backup is from a newer app version and cannot be imported."
    };
  }

  if (!isPlainObject(backup.data)) {
    return { valid: false, message: "Backup data is missing." };
  }

  try {
    const normalizedData = normalizeImportedAppData(
      backup.data,
      backup.metadata
    );

    return {
      valid: true,
      message: "Backup file is valid.",
      data: normalizedData,
      summary: getBackupSectionSummary(normalizedData)
    };
  } catch (error) {
    return {
      valid: false,
      message: error.message || "Backup data could not be normalized."
    };
  }
}

export function getBackupFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `budgetapp-backup-${date}.json`;
}
