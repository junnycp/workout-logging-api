import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module';
import { WorkoutLoggingService } from './workout-logging.service';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsRepository } from './workouts.repository';

@Module({
  imports: [ExercisesModule],
  controllers: [WorkoutsController],
  providers: [WorkoutLoggingService, WorkoutsRepository],
})
export class WorkoutsModule {}
