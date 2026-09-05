import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const controller = new HealthController(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the database as available', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(controller.health()).resolves.toMatchObject({ status: 'ok', db: 'up' });
  });

  it('does not expose database details when the health check fails', async () => {
    const internalMessage = 'database password for neon.example.com is invalid';
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    queryRaw.mockRejectedValueOnce(new Error(internalMessage));

    try {
      await controller.health();
      fail('Expected the health check to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse();
      expect(JSON.stringify(response)).not.toContain(internalMessage);
    } finally {
      loggerError.mockRestore();
    }
  });
});
