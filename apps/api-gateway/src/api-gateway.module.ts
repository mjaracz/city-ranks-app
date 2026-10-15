import { Module } from '@nestjs/common';
import { ApiGatewayControllerModule } from './controllers/api-gateway-controller.module';

@Module({ imports: [ApiGatewayControllerModule] })
export class ApiGatewayModule {}
