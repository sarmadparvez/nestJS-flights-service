import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as fs from 'fs';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // OpenAPI Specification
  const config = new DocumentBuilder()
    .setTitle('Flight Service')
    .setDescription(
      'The services returns flight information which is fetched from different flight sources.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // save swagger spec file
  saveOpenAPISpec(document);
  await app.listen(process.env.PORT || 3000);
}

function saveOpenAPISpec(document: OpenAPIObject) {
  const fileName = './swagger/swagger.json';
  try {
    fs.writeFileSync(fileName, JSON.stringify(document));
  } catch (error) {
    console.error('Error in saving OpenApi Spec file', fileName, error);
  }
}

bootstrap();
