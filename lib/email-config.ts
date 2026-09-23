export const EMAIL_CONFIG = {
  PRIMARY_API: {
    name: 'BREVO_PRIMARY',
    key: process.env.BREVO_API_KEY,
    hourlyLimit: 70,
  },
  BACKUP_API: {
    name: 'BREVO_BACKUP',
    key: process.env.BREVO_BACKUP_API_KEY || process.env.BREVO_API_KEY_2,
    hourlyLimit: 70,
  },
  FALLBACK_API: {
    name: 'GROK',
    key: process.env.GROK_API_KEY,
    hourlyLimit: 50, // Grok as last resort
  },
  DAILY_LIMIT: 550,
  HOURLY_LIMIT: 70,
};
