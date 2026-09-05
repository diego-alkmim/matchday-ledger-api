import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JWT authentication policy', () => {
  it('bypasses JWT validation only for an explicitly public route', () => {
    const getAllAndOverride = jest.fn().mockReturnValue(true);
    const reflector = {
      getAllAndOverride,
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const handler = () => undefined;
    class PublicController {}
    const context = {
      getHandler: () => handler,
      getClass: () => PublicController,
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [handler, PublicController]);
  });
});
