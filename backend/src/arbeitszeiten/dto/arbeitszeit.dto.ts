import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TimeOffType } from '@prisma/client';

/** `HH:mm` im 24-Stunden-Format. */
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
/** `YYYY-MM-DD`. Die Plausibilitaet des Datums prueft die Umrechnung. */
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export class ArbeitsspanneDto {
  /** 0 = Sonntag bis 6 = Samstag, wie in `working_hours`. */
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Matches(UHRZEIT, { message: 'Uhrzeiten werden als HH:mm angegeben, etwa 09:00.' })
  von!: string;

  @Matches(UHRZEIT, { message: 'Uhrzeiten werden als HH:mm angegeben, etwa 17:00.' })
  bis!: string;
}

/**
 * Die ganze Woche auf einmal.
 *
 * Eine leere Liste ist gueltig und bedeutet: arbeitet nicht. Das ist kein
 * Sonderfall, sondern der Zustand jeder neu angelegten Person.
 */
export class WochenplanDto {
  @IsArray()
  // 7 Tage mal hoechstens ein paar Abschnitte. Die Grenze faengt Unfug ab,
  // nicht echte Plaene.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ArbeitsspanneDto)
  spannen!: ArbeitsspanneDto[];
}

/**
 * Abwesenheit, in Ortszeit angegeben.
 *
 * Bewusst keine Zeitstempel: Der Client soll nicht umrechnen. Ein Browser kennt
 * die Zeitzone seines Geraets, nicht die des Studios — wer aus dem Urlaub einen
 * Feiertag eintraegt, laege sonst um Stunden daneben.
 *
 * Kein Freitextfeld (E-12). Der Grund steht in `type`; "Reha Bad Ischl" waere
 * ein Gesundheitsdatum ueber eine Beschaeftigte.
 */
export class AbwesenheitDto {
  /** Weggelassen oder `null`: gilt studioweit, also Feiertag oder Betriebsurlaub. */
  @IsOptional()
  @IsUUID()
  staffId?: string | null;

  @IsEnum(TimeOffType)
  type!: TimeOffType;

  @IsBoolean()
  ganztags!: boolean;

  @Matches(DATUM, { message: 'Daten werden als JJJJ-MM-TT angegeben.' })
  vonDatum!: string;

  @Matches(DATUM, { message: 'Daten werden als JJJJ-MM-TT angegeben.' })
  bisDatum!: string;

  @ValidateIf((o: AbwesenheitDto) => !o.ganztags)
  @Matches(UHRZEIT, { message: 'Uhrzeiten werden als HH:mm angegeben.' })
  vonZeit?: string;

  @ValidateIf((o: AbwesenheitDto) => !o.ganztags)
  @Matches(UHRZEIT, { message: 'Uhrzeiten werden als HH:mm angegeben.' })
  bisZeit?: string;
}
