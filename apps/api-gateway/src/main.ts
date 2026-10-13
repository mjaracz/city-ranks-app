import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import { getApiGatewayPort } from '../../../libs/config/src/environment';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  await app.listen(getApiGatewayPort());
}
bootstrap();
