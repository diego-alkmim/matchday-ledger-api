import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateUserSchema, CreateUserDto } from './dto/create-user.dto';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { domainErrors } from '../common/errors/domain-errors';

@Controller('users')
@UseGuards(RolesGuard)
@ApiTags('Users')
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private service: UsersService) {}

  @Roles(Role.ADMIN)
  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password', 'role'],
      properties: {
        email: { type: 'string', format: 'email', example: 'novo@time.local' },
        password: { type: 'string', minLength: 8, example: 'SenhaForte123!' },
        role: { type: 'string', enum: ['ADMIN', 'DIRETOR'], example: 'DIRETOR' },
        directorId: { type: 'string', nullable: true, example: 'cuid-do-diretor' },
      },
    },
  })
  async create(@Body() body: CreateUserDto) {
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(domainErrors.invalidPayload);
    }

    return this.service.create(parsed.data);
  }
}
