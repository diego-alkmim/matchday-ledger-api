import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsGenerationService } from './collections-generation.service';
import { CollectionsLedgerService } from './collections-ledger.service';

const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
    const { today, start: currentMonthStart, end: to } = this.currentPeriod(now);
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const currentMonthStartDate = new Date(`${currentMonthStart}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    const teams = await this.prisma.team.findMany({
      where: {
        active: true,
        OR: [
          { collectionsMaintainedOn: null },
          { collectionsMaintainedOn: { lt: todayDate } },
        ],
        collectionPlans: { some: { effectiveFrom: { lte: toDate } } },
      },
      select: {
        id: true,
        collectionsGeneratedThrough: true,
        collectionPlans: {
          where: { effectiveFrom: { lte: toDate } },
          orderBy: { effectiveFrom: 'asc' },
          take: 1,
          select: { effectiveFrom: true },
        },
      },
    });
    for (const team of teams) {
      try {
        const earliestPlan = team.collectionPlans[0];
        if (!earliestPlan) continue;
        const from = !team.collectionsGeneratedThrough
          ? earliestPlan.effectiveFrom.toISOString().slice(0, 10)
          : team.collectionsGeneratedThrough < currentMonthStartDate
            ? this.dayAfter(team.collectionsGeneratedThrough)
            : currentMonthStart;
        await this.generation.generate(team.id, from, to);
        await this.ledger.applyAvailableCredits(team.id);
        await this.updateMaintenanceState(team.id, toDate, todayDate);
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

  private currentPeriod(now: Date) {
    const current = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [year, month] = current.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return {
      today: current,
      start: `${prefix}-01`,
      end: `${prefix}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  private dayAfter(date: Date) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }

  private updateMaintenanceState(teamId: string, through: Date, maintainedOn: Date) {
    return this.prisma.team.update({
      where: { id: teamId },
      data: {
        collectionsGeneratedThrough: through,
        collectionsMaintainedOn: maintainedOn,
      },
    });
  }
}
