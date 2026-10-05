import { Module } from '@nestjs/common';
import { ExerciseLookupService } from './exercise-lookup.service';

@Module({
  providers: [ExerciseLookupService],
  exports: [ExerciseLookupService],
})
export class ExercisesModule {}
