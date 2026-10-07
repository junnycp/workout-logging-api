import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/time/clock';
import { ExercisesModule } from '../exercises/exercises.module';
import { PersonalRecordsController } from './personal-records.controller';
import { PersonalRecordsRepository } from './personal-records.repository';
import { PersonalRecordsService } from './personal-records.service';

@Module({
  imports: [ExercisesModule],
  controllers: [PersonalRecordsController],
  providers: [
    PersonalRecordsService,
    PersonalRecordsRepository,
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class RecordsModule {}
