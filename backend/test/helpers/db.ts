import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma-Client für Integrationstests.
 *
 * Bewusst dieselbe Datenbank wie in der Entwicklung — der Überschneidungsschutz
 * lässt sich nur gegen echtes PostgreSQL prüfen, nicht gegen eine Attrappe.
 * Der Schutzschalter in test/setup.ts verhindert, dass das versehentlich gegen
 * etwas anderes als eine lokale Datenbank läuft.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export interface Fixture {
  serviceId: string;
  customerId: string;
  staffAId: string;
  staffBId: string;
}

/** Leert alle Tabellen in einer Reihenfolge, die keine Fremdschlüssel verletzt. */
export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      treatment_notes, notifications_outbox, audit_log, consents,
      refresh_tokens, device_tokens, appointments, staff_services,
      working_hours, time_off, staff_profiles, services, users
    RESTART IDENTITY CASCADE
  `);
}

/** Legt eine Leistung, zwei Kosmetiker:innen und eine Kundin an. */
export async function createFixture(): Promise<Fixture> {
  const service = await prisma.service.create({
    data: { name: 'Gesichtsbehandlung', durationMinutes: 60, bufferMinutes: 0, priceCents: 4590 },
  });

  const staffA = await prisma.staffProfile.create({
    data: {
      displayName: 'Anna',
      user: {
        create: {
          email: 'anna@test.invalid',
          passwordHash: 'x',
          role: 'STAFF',
          firstName: 'Anna',
          lastName: 'Test',
        },
      },
    },
  });

  const staffB = await prisma.staffProfile.create({
    data: {
      displayName: 'Lisa',
      user: {
        create: {
          email: 'lisa@test.invalid',
          passwordHash: 'x',
          role: 'STAFF',
          firstName: 'Lisa',
          lastName: 'Test',
        },
      },
    },
  });

  const customer = await prisma.user.create({
    data: {
      email: 'kundin@test.invalid',
      passwordHash: 'x',
      role: 'CUSTOMER',
      firstName: 'Lea',
      lastName: 'Test',
    },
  });

  await prisma.staffService.createMany({
    data: [
      { staffId: staffA.id, serviceId: service.id },
      { staffId: staffB.id, serviceId: service.id },
    ],
  });

  return {
    serviceId: service.id,
    customerId: customer.id,
    staffAId: staffA.id,
    staffBId: staffB.id,
  };
}

/** Zeitpunkt am 1. Oktober 2026 in UTC. */
export function at(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 9, 1, hour, minute));
}
