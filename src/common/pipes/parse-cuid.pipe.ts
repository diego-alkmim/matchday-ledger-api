import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { CUID_REGEX } from '../validation/cuid.validation';

@Injectable()
export class ParseCuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!CUID_REGEX.test(value)) {
      throw new BadRequestException('Identificador inválido.');
    }

    return value;
  }
}
