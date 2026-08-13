import AuditLog from '../models/AuditLog.js';

export const recordAuditLog = async ({
  adminId,
  action,
  entity,
  entityId = '',
  ipAddress = '',
  metadata = {}
}) => {
  try {
    if (!adminId || !action || !entity) return;
    await AuditLog.create({
      adminId,
      action,
      entity,
      entityId: String(entityId),
      ipAddress,
      metadata
    });
  } catch (error) {
    console.error('Failed to create audit log:', error.message);
  }
};
