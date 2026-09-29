import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class CollectionsMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollectionsMaintenanceService.name);
  private interval?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private generation: CollectionsGenerationService,
    private ledger: CollectionsLedgerService,
  ) {}

  onModuleInit() {
    void this.runSafely();
    this.interval = setInterval(() => void this.runSafely(), MAINTENANCE_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async runNow(now = new Date()) {
    const { from, to } = this.currentMonth(now);
    const teams = await this.prisma.team.findMany({ where: { active: true }, select: { id: true } });
    for (const team of teams) {
      try {
        await this.generation.generate(team.id, from, to);
        await this.ledger.applyAvailableCredits(team.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Falha na manutenção automática de arrecadações do time ${team.id}: ${message}`);
      }
    }
  }

  private async runSafely() {
    try {
      await this.runNow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao iniciar a manutenção automática de arrecadações: ${message}`);
    }
  }

  private currentMonth(now: Date) {
    const current = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [year, month] = current.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }
}
