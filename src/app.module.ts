import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DirectorsModule } from './directors/directors.module';
import { GamesModule } from './games/games.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ReportsModule } from './reports/reports.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): import('@nestjs/throttler').ThrottlerModuleOptions => ({
        throttlers: [
          {
            name: 'default',
            ttl: cfg.get<number>('RATE_LIMIT_TTL', 60_000),
            limit: cfg.get<number>('RATE_LIMIT_MAX', 30),
          },
          {
            name: 'auth',
            ttl: 60_000,
            limit: 5,
          },
        ],
      }),
    }),
    AuthModule,
    UsersModule,
    DirectorsModule,
    GamesModule,
    CategoriesModule,
    TransactionsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
