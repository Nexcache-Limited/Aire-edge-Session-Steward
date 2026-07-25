import './telemetry';

import { timingSafeEqual } from 'node:crypto';

import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

type ApiRequest = {
  path: string;
  header(name: string): string | undefined;
};

type Next = (error?: unknown) => void;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const apiToken = requiredApiToken();
  app.use((request: ApiRequest, _response: unknown, next: Next) => {
    if (request.path === '/health') {
      next();
      return;
    }
    const supplied = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!safeEqual(supplied, apiToken)) {
      next(new UnauthorizedException('Valid bearer authentication is required.'));
      return;
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}

function requiredApiToken(): string {
  const value = process.env.SESSION_STEWARD_API_TOKEN;
  if (!value) {
    throw new Error('SESSION_STEWARD_API_TOKEN is required.');
  }
  if (value && value.length < 32) {
    throw new Error('SESSION_STEWARD_API_TOKEN must contain at least 32 characters.');
  }
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

void bootstrap();
