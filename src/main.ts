import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import * as express from 'express';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);


  // Конфигурация Swagger
  const config = new DocumentBuilder()
    .setTitle('API документация')
    .setDescription('Документация для API')
    .setVersion('1.0')
    .addBearerAuth() // если используете JWT
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  app.enableCors({ 
    origin: ['http://localhost:4200','http://192.168.10.237:4200','http://192.168.10.49:4200', 'http://192.168.10.62:3000', 'http://192.168.10.134:4200', 'http://192.168.10.148:4200'],
    credentials: true,
  })

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use('/media', express.static(join(__dirname, '..', 'media')));

  // await app.listen(8888, '192.168.10.49');
  await app.listen(8888, '192.168.10.148');
}
bootstrap();
