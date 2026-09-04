import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

type SuccessResponse<T> = { success: true; data: T };

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler<unknown>): Observable<SuccessResponse<unknown>> {
    return next.handle().pipe(map((data: unknown) => ({ success: true, data })));
  }
}
