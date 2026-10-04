import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ERLAUBTE_ROLLEN = 'erlaubte_rollen';

/** Schränkt einen Endpunkt auf bestimmte Rollen ein. */
export const Rollen = (...rollen: UserRole[]) => SetMetadata(ERLAUBTE_ROLLEN, rollen);
