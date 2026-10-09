import { Module } from '@nestjs/common';
import { ExerciseCatalogRepository } from './exercise-catalog.repository';

@Module({
  providers: [ExerciseCatalogRepository],
  exports: [ExerciseCatalogRepository],
})
export class ExercisesModule {}
