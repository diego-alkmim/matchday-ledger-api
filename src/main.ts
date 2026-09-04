import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as compression from 'compression';
import { json, RequestHandler, urlencoded } from 'express';
import * as basicAuth from 'express-basic-auth';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { domainErrors } from './common/errors/domain-errors';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

type CompressionFactory = () => RequestHandler;
type CookieParserFactory = () => RequestHandler;
const createCompression = compression as unknown as CompressionFactory;
const createCookieParser = cookieParser as unknown as CookieParserFactory;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origin = config.get<string>('CORS_ORIGIN');

  app.enableCors({
    origin,
    credentials: true,
    methods: 'GET,POST,PUT,PATCH,DELETE',
    exposedHeaders: ['x-csrf-token'],
  });

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(createCookieParser());
  app.use(createCompression());
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", origin].filter(Boolean) as string[],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: domainErrors.invalidPayload,
          errors: errors.flatMap((error) =>
            error.constraints ? Object.values(error.constraints) : [],
          ),
        }),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const swaggerEnabled =
    config.get<string>('SWAGGER_ENABLED') ??
    (process.env.NODE_ENV !== 'production' ? 'true' : 'false');

  if (swaggerEnabled === 'true') {
    const swaggerUser = config.get<string>('SWAGGER_USER');
    const swaggerPass = config.get<string>('SWAGGER_PASSWORD');

    if (swaggerUser && swaggerPass) {
      app.use(
        '/docs',
        basicAuth({
          users: { [swaggerUser]: swaggerPass },
          challenge: true,
        }),
      );
    }

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Matchday Ledger API')
      .setDescription(
        'API de controle de caixa do time (Auth, Diretores, Jogos, Categorias, Lançamentos, Relatórios).',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addCookieAuth('refresh_token', {
        type: 'http',
        in: 'Cookie',
        description:
          'Refresh token HttpOnly usado apenas no fluxo /auth/refresh. Enviado automaticamente pelo browser.',
      })
      .build();

    const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDoc, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
}

void bootstrap();
