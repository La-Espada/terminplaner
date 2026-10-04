import type { UserRole } from '@prisma/client';

/**
 * Die angemeldete Person, wie der JwtAuthGuard sie an die Anfrage hängt.
 *
 * `staffProfileId` ist nur bei Rolle STAFF gesetzt. Sie wird für die
 * objektbezogene Rechteprüfung gebraucht: „Gehört dieser Termin zu *dieser*
 * Kosmetiker:in?" lässt sich nur über die Profil-ID beantworten, nicht über die
 * Benutzer-ID.
 */
export interface AngemeldetePerson {
  id: string;
  role: UserRole;
  staffProfileId: string | null;
}
