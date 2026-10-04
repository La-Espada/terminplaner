import { Controller, Get } from '@nestjs/common';
import { Person } from '../auth/decorators/person.decorator';
import type { AngemeldetePerson } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';

interface ProfilAntwort {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
}

@Controller('me')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Das eigene Profil.
   *
   * Kein @Rollen(): Jede angemeldete Person darf ihr eigenes Profil sehen. Die
   * Begrenzung steckt in der Abfrage — gelesen wird ausschließlich das Konto aus
   * dem Token, nie eine ID aus der Anfrage.
   */
  @Get()
  async profil(@Person() person: AngemeldetePerson): Promise<ProfilAntwort> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: person.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        emailVerifiedAt: true,
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }
}
