import { Module } from '@nestjs/common';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { CollectionsModule } from '../collections/collections.module';

@Module({ imports: [CollectionsModule], providers: [GamesService], controllers: [GamesController] })
export class GamesModule {}
