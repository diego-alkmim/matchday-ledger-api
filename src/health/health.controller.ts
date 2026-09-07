import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { domainErrors } from '../common/errors/domain-errors';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
@Public()
@SkipThrottle({ default: true, auth: true })
@ApiTags('Health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Valida conectividade com o banco e retorna latência.',
  })
  @ApiResponse({
    status: 200,
    description: 'Serviço saudável',
    schema: {
      example: {
        status: 'ok',
        db: 'up',
        latencyMs: 12,
        timestamp: '2026-02-28T15:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Falha ao conectar ao banco',
    schema: {
      example: {
        status: 'error',
        db: 'down',
        message: 'Banco de dados indisponível',
        timestamp: '2026-02-28T15:00:00.000Z',
      },
    },
  })
  async health() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - startedAt;
      return {
        status: 'ok',
        db: 'up',
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      this.logger.error(
        'Health check failed while querying the database.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'down',
        message: domainErrors.healthDatabaseUnavailable,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
