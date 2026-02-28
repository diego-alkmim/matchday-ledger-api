import { Module } from '@nestjs/common';
import { DirectorsService } from './directors.service';
import { DirectorsController } from './directors.controller';

@Module({ providers: [DirectorsService], controllers: [DirectorsController] })
export class DirectorsModule {}
