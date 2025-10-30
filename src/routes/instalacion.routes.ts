import type { FastifyInstance } from 'fastify';
import * as instController from '../controllers/instalacion.controller.js';

export async function registerInstalacionRoutes(app: FastifyInstance) {
  // Instalaciones
  app.post('/api/instalaciones', instController.createInstalacion);
  app.get('/api/instalaciones', instController.getInstalaciones);
  app.get('/api/instalaciones/:id', instController.getInstalacionById);
  app.put('/api/instalaciones/:id', instController.updateInstalacion);
  app.delete('/api/instalaciones/:id', instController.deleteInstalacion);

  // Catálogo Sensores
  app.post('/api/catalogo-sensores', instController.createCatalogoSensor);
  app.get('/api/catalogo-sensores', instController.getCatalogoSensores);
  app.get('/api/catalogo-sensores/:id', instController.getCatalogoSensorById);
  app.put('/api/catalogo-sensores/:id', instController.updateCatalogoSensor);
  app.delete('/api/catalogo-sensores/:id', instController.deleteCatalogoSensor);

  // Sensores Instalados
  app.post('/api/sensores-instalados', instController.createSensorInstalado);
  app.get('/api/sensores-instalados', instController.getSensoresInstalados);
  app.get('/api/sensores-instalados/:id', instController.getSensorInstaladoById);
  app.put('/api/sensores-instalados/:id', instController.updateSensorInstalado);
  app.delete('/api/sensores-instalados/:id', instController.deleteSensorInstalado);
}
