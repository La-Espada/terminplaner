import Joi from 'joi';

/**
 * Prüfung der Umgebungsvariablen beim Start.
 *
 * Fehlt etwas oder ist es unplausibel, startet die Anwendung gar nicht erst —
 * das ist deutlich besser, als Wochen später über einen undefined-Wert zu stolpern.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),

  // Basis-URL für Links in E-Mails (Verifizierung, Passwort-Reset).
  // In Produktion die öffentliche Adresse der App, nicht die des Backends.
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3000'),

  // Kommagetrennte Liste erlaubter Herkünfte für Browser-Clients.
  // Leer bedeutet: keine fremde Herkunft erlaubt.
  CORS_ORIGINS: Joi.string().allow('').default(''),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  // Zeitzone des Studios. Alle Zeitstempel liegen in UTC in der Datenbank,
  // dieser Wert steuert nur Anzeige und Berechnung der Arbeitszeiten.
  STUDIO_TIMEZONE: Joi.string().default('Europe/Vienna'),

  // --- Buchungsregeln, siehe docs/ENTSCHEIDUNGEN.md E-20 ---
  CANCELLATION_DEADLINE_HOURS: Joi.number().integer().min(0).default(24),
  BOOKING_LEAD_TIME_MINUTES: Joi.number().integer().min(0).default(120),
  BOOKING_HORIZON_DAYS: Joi.number().integer().min(1).default(90),
  SLOT_GRANULARITY_MINUTES: Joi.number().integer().valid(5, 10, 15, 20, 30, 60).default(15),
  AUTO_CONFIRM_BOOKINGS: Joi.boolean().default(true),

  // --- Aufbewahrungsfristen, siehe docs/PLAN.md Abschnitt 8.4.1 ---
  HEALTH_DATA_RETENTION_MONTHS: Joi.number().integer().min(1).default(24),
  APPOINTMENT_RETENTION_YEARS: Joi.number().integer().min(1).default(7),
  AUDIT_LOG_RETENTION_DAYS: Joi.number().integer().min(1).default(365),
  AUDIT_LOG_ART9_RETENTION_DAYS: Joi.number().integer().min(1).default(1095),
  BACKUP_RETENTION_DAYS: Joi.number().integer().min(1).default(30),
}).unknown(true);
