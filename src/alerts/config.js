// Alert Notification Configuration and Customization Engine

const DEFAULT_ALERT_CONFIG = {
  soundAlerts: true,
  browserNotifications: false,
  emergencyThreshold: 20,
  warningThreshold: 35,
  alertSoundFrequency: 'TWO_TONE', // 'TWO_TONE' | 'HIGH_PITCH' | 'SOFT_CHIME'
  alertMessageTemplate: '🚨 CRITICAL SHORTAGE: {hospitalName} (Reg: {hospitalReg}) has reached {currentStock} cylinders (≤ {emergencyThreshold} threshold)! Urgent dispatch requested from {donorName}.',
  customDispatchRecipients: 'District 04 Logistics Dispatch, Trauma Network Command',
  autoModalOpen: true,
  leadTimeHours: 4.0
};

let currentAlertConfig = { ...DEFAULT_ALERT_CONFIG };

function getAlertConfig() {
  return { ...currentAlertConfig };
}

function setAlertConfig(updates = {}) {
  if (updates.soundAlerts !== undefined) {
    currentAlertConfig.soundAlerts = Boolean(updates.soundAlerts);
  }
  if (updates.browserNotifications !== undefined) {
    currentAlertConfig.browserNotifications = Boolean(updates.browserNotifications);
  }
  if (updates.emergencyThreshold !== undefined) {
    currentAlertConfig.emergencyThreshold = Math.max(5, Math.min(100, Number(updates.emergencyThreshold) || 20));
  }
  if (updates.warningThreshold !== undefined) {
    currentAlertConfig.warningThreshold = Math.max(10, Math.min(150, Number(updates.warningThreshold) || 35));
  }
  if (updates.alertSoundFrequency !== undefined) {
    currentAlertConfig.alertSoundFrequency = updates.alertSoundFrequency;
  }
  if (updates.alertMessageTemplate !== undefined && String(updates.alertMessageTemplate).trim().length > 0) {
    currentAlertConfig.alertMessageTemplate = String(updates.alertMessageTemplate).trim();
  }
  if (updates.customDispatchRecipients !== undefined) {
    currentAlertConfig.customDispatchRecipients = String(updates.customDispatchRecipients).trim();
  }
  if (updates.autoModalOpen !== undefined) {
    currentAlertConfig.autoModalOpen = Boolean(updates.autoModalOpen);
  }
  if (updates.leadTimeHours !== undefined) {
    currentAlertConfig.leadTimeHours = Math.max(1.0, Number(updates.leadTimeHours) || 4.0);
  }

  return getAlertConfig();
}

function formatAlertMessage(template, vars) {
  const tmpl = template || currentAlertConfig.alertMessageTemplate;
  return tmpl
    .replace(/\{hospitalName\}/g, vars.hospitalName || 'Hospital')
    .replace(/\{hospitalReg\}/g, vars.hospitalReg || vars.registrationNumber || 'MOH-REG-2026-XXXX')
    .replace(/\{currentStock\}/g, vars.currentStock !== undefined ? Math.round(vars.currentStock) : '0')
    .replace(/\{emergencyThreshold\}/g, vars.emergencyThreshold || currentAlertConfig.emergencyThreshold)
    .replace(/\{donorName\}/g, vars.donorName || 'Primary Donor Facility')
    .replace(/\{runwayHours\}/g, vars.runwayHours !== undefined ? (+vars.runwayHours).toFixed(1) : '2.0');
}

module.exports = {
  DEFAULT_ALERT_CONFIG,
  getAlertConfig,
  setAlertConfig,
  formatAlertMessage
};
