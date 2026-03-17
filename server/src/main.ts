import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { join } from 'path';
import { AppModule } from './app.module';
import { SnakeCaseInterceptor } from './common';

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api');
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new SnakeCaseInterceptor());
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
