import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { getApiGatewayPort } from '@libs/config/environment';

import { ApiGatewayModule } from './api-gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  await app.listen(getApiGatewayPort());
}
bootstrap();
