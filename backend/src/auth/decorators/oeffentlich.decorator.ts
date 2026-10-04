import { SetMetadata } from '@nestjs/common';

export const IST_OEFFENTLICH = 'ist_oeffentlich';

/**
 * Markiert einen Endpunkt als ohne Anmeldung erreichbar.
 *
 * Bewusst sparsam verwenden. Jede Markierung ist eine Tür nach außen und sollte
 * im Code sichtbar begründet sein.
 */
export const Oeffentlich = () => SetMetadata(IST_OEFFENTLICH, true);
