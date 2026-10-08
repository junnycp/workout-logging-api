import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';

/** One `CLOCK` for the whole app (POST future-date check, period comparisons); tests override it once. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class TimeModule {}
