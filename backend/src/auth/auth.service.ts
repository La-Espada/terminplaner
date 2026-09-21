import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokenPurpose, ConsentType, Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenService } from './auth-token.service';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';

/** Gültigkeit des Verifizierungslinks. */
const VERIFIZIERUNG_GUELTIG_MINUTEN = 24 * 60;

/**
 * Fassung der Einwilligungstexte, der zugestimmt wurde.
 *
 * Ändert sich der Text von AGB oder Datenschutzerklärung, wird diese Nummer
 * erhöht und die Einwilligung neu eingeholt. Ohne ein Archiv der Fassungen ist
 * die Nummer wertlos — siehe docs/CHECKLISTE.md.
 */
const EINWILLIGUNG_VERSION = '1.0';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: AuthTokenService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registrierung.
   *
   * Antwortet **immer gleich**, egal ob die Adresse schon vergeben ist. Sonst
   * wird der Endpunkt zum Verzeichnis: Wer wissen will, ob jemand Kundin dieser
   * Praxis ist, probiert einfach die Adresse durch. Bei einer Arztpraxis wäre
   * schon diese Information heikel.
   *
   * Existiert die Adresse bereits, geht stattdessen ein Hinweis an die bekannte
   * Adresse — wer dort nicht hineinsieht, erfährt nichts.
   */
  async register(dto: RegisterDto): Promise<void> {
    if (!dto.acceptedTerms || !dto.acceptedPrivacy) {
      throw new BadRequestException('AGB und Datenschutzerklärung müssen akzeptiert werden.');
    }

    const passwordHash = await this.passwords.hashPassword(dto.password);

    let userId: string;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const angelegt = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            role: 'CUSTOMER',
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone ?? null,
          },
          select: { id: true },
        });

        await tx.consent.createMany({
          data: [
            this.consent(angelegt.id, 'TOS', true),
            this.consent(angelegt.id, 'PRIVACY', true),
            this.consent(angelegt.id, 'MARKETING', dto.acceptedMarketing === true),
          ],
        });

        return angelegt;
      });
      userId = user.id;
    } catch (fehler) {
      if (fehler instanceof Prisma.PrismaClientKnownRequestError && fehler.code === 'P2002') {
        // Adresse ist vergeben. Nach außen nicht unterscheidbar.
        this.logger.log('Registrierung auf bereits vergebene Adresse');
        return;
      }
      throw fehler;
    }

    const klartext = await this.tokens.issue(
      userId,
      AuthTokenPurpose.EMAIL_VERIFICATION,
      VERIFIZIERUNG_GUELTIG_MINUTEN,
    );

    await this.mail.sendVerificationMail(dto.email, dto.firstName, this.verifyLink(klartext));
  }

  /**
   * E-Mail-Verifizierung. Der Token wirkt genau einmal.
   *
   * Ist er bereits verbraucht, das Konto aber verifiziert, melden wir Erfolg —
   * ein zweiter Klick auf denselben Link in der Mail soll keinen Fehler zeigen.
   */
  async verifyEmail(token: string): Promise<void> {
    const userId = await this.tokens.redeem(token, AuthTokenPurpose.EMAIL_VERIFICATION);

    if (!userId) {
      throw new BadRequestException('Der Link ist ungültig oder abgelaufen.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    this.logger.log('E-Mail-Adresse bestätigt');
  }

  private consent(userId: string, type: ConsentType, granted: boolean) {
    return {
      userId,
      type,
      version: EINWILLIGUNG_VERSION,
      granted,
      grantedAt: new Date(),
    };
  }

  private verifyLink(token: string): string {
    const basis = this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
    return `${basis}/verify-email?token=${encodeURIComponent(token)}`;
  }
}
