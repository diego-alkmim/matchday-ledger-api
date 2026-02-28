import { Module } from '@nestjs/common';
import { ConfigModule as NestConfig } from '@nestjs/config';
import { ConfigService } from './config.service';

@Module({
  imports: [NestConfig.forRoot({ isGlobal: true })],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
