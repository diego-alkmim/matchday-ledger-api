import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Valida conectividade com o banco e retorna latência.' })
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
        message: 'Database unreachable',
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
    } catch (error: any) {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'down',
        message: error?.message || 'Database unreachable',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
