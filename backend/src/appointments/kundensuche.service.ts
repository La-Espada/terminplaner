import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface Kundentreffer {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string | null;
}

/**
 * Kundensuche fuer die Buchung am Telefon.
 *
 * **Keine Liste aller Kundinnen.** Nur Suche, nur mit mindestens drei Zeichen,
 * hoechstens zehn Treffer. Eine durchblaetterbare Kundenliste im Admin-Web
 * waere bequem und waere zugleich ein Verzeichnis aller Patientinnen der Praxis
 * — mit Namen und Telefonnummern, abrufbar von jedem angemeldeten Geraet. Wer
 * eine Kundin sucht, kennt ihren Namen; wer nur stoebern will, hat hier nichts
 * zu suchen.
 *
 * Die Vollliste kommt in Schritt 48 als Auswertung fuer die Studioleitung —
 * dann aber mit Protokollierung.
 */
@Injectable()
export class KundensucheService {
  constructor(private readonly prisma: PrismaService) {}

  async suchen(suchtext: string): Promise<Kundentreffer[]> {
    const text = suchtext.trim();
    if (text.length < 3) return [];

    const treffer = await this.prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        status: 'ACTIVE',
        OR: [
          { firstName: { contains: text, mode: 'insensitive' } },
          { lastName: { contains: text, mode: 'insensitive' } },
          { email: { contains: text, mode: 'insensitive' } },
          { phone: { contains: text } },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 10,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });

    return treffer.map((t) => ({
      id: t.id,
      vorname: t.firstName,
      nachname: t.lastName,
      email: t.email,
      telefon: t.phone,
    }));
  }
}
