import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
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
import {
  assertProductionAuth,
  getTurnstileConfig,
  getTrustProxyHops,
  getSwaggerCredentials,
  getCorsOrigins,
} from './config/security-config';

type CompressionFactory = () => RequestHandler;
type CookieParserFactory = () => RequestHandler;
const createCompression = compression as unknown as CompressionFactory;
const createCookieParser = cookieParser as unknown as CookieParserFactory;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const corsOrigin = config.getOrThrow<string>('CORS_ORIGIN');
  const corsOrigins = getCorsOrigins(corsOrigin);
  const nodeEnv = config.get<string>('NODE_ENV');
  assertProductionAuth(nodeEnv, config.get<string>('REQUIRE_AUTH'));
  getTurnstileConfig(
    nodeEnv,
    config.get<string>('TURNSTILE_SECRET_KEY'),
    config.get<string>('TURNSTILE_EXPECTED_HOSTNAME'),
  );
  app.set('trust proxy', getTrustProxyHops(nodeEnv, config.get<string>('TRUST_PROXY')));

  app.enableCors({
    origin: corsOrigins,
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
          connectSrc: ["'self'", ...corsOrigins],
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

  const swaggerEnabled = config.get<string>('SWAGGER_ENABLED') === 'true';

  if (swaggerEnabled) {
    const { user: swaggerUser, password: swaggerPass } = getSwaggerCredentials(
      config.get<string>('SWAGGER_USER'),
      config.get<string>('SWAGGER_PASSWORD'),
    );

    app.use(
      '/docs',
      basicAuth({
        users: { [swaggerUser]: swaggerPass },
        challenge: true,
      }),
    );

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
