import { Module } from '@nestjs/common';
import { DirectorsService } from './directors.service';
import { DirectorsController } from './directors.controller';
import { CollectionsModule } from '../collections/collections.module';

@Module({ imports: [CollectionsModule], providers: [DirectorsService], controllers: [DirectorsController] })
export class DirectorsModule {}
