import type { FastifyInstance } from 'fastify';
import * as especiesController from '../controllers/especies.controller.js';
import * as crecimientoOstionController from '../controllers/crecimiento-ostion.controller.js';

export async function registerEspeciesRoutes(app: FastifyInstance) {
  // Catálogo Especies
  app.post('/api/catalogo-especies', especiesController.createCatalogoEspecie);
  app.get('/api/catalogo-especies', especiesController.getCatalogoEspecies);
  app.get('/api/catalogo-especies/:id', especiesController.getCatalogoEspecieById);
  app.put('/api/catalogo-especies/:id', especiesController.updateCatalogoEspecie);
  app.delete('/api/catalogo-especies/:id', especiesController.deleteCatalogoEspecie);
  // Alias legacy frontend
  app.post('/api/especies', especiesController.createCatalogoEspecie);
  app.get('/api/especies', especiesController.getCatalogoEspecies);
  app.get('/api/especies/:id', especiesController.getCatalogoEspecieById);
  app.put('/api/especies/:id', especiesController.updateCatalogoEspecie);
  app.delete('/api/especies/:id', especiesController.deleteCatalogoEspecie);

  // Especie Parámetro
  app.post('/api/especies-parametros', especiesController.createEspecieParametro);
  app.get('/api/especies-parametros', especiesController.getEspeciesParametros);
  app.get('/api/especies-parametros/:id', especiesController.getEspecieParametroById);
  app.put('/api/especies-parametros/:id', especiesController.updateEspecieParametro);
  app.delete('/api/especies-parametros/:id', especiesController.deleteEspecieParametro);
  // Alias legacy singular
  app.post('/api/especie-parametros', especiesController.createEspecieParametro);
  app.get('/api/especie-parametros', especiesController.getEspeciesParametros);
  app.get('/api/especie-parametros/:id', especiesController.getEspecieParametroById);
  app.put('/api/especie-parametros/:id', especiesController.updateEspecieParametro);
  app.delete('/api/especie-parametros/:id', especiesController.deleteEspecieParametro);

  // Procesos
  app.post('/api/procesos', especiesController.createProceso);
  app.get('/api/procesos', especiesController.getProcesos);
  app.get('/api/procesos/:id', especiesController.getProcesoById);
  app.put('/api/procesos/:id', especiesController.updateProceso);
  app.delete('/api/procesos/:id', especiesController.deleteProceso);
  app.get('/api/procesos/:id/crecimiento-ostion', crecimientoOstionController.getProcesoCrecimientoOstion);
  app.put('/api/procesos/:id/crecimiento-ostion', crecimientoOstionController.updateProcesoCrecimientoOstion);
  app.post('/api/procesos/:id/crecimiento-ostion/capturas', crecimientoOstionController.createProcesoCrecimientoOstionCaptura);
  app.put('/api/procesos/:id/crecimiento-ostion/capturas/:capturaId', crecimientoOstionController.updateProcesoCrecimientoOstionCapturaById);
  app.post('/api/procesos/:id/crecimiento-ostion/capturas/:capturaId/mediciones', crecimientoOstionController.saveProcesoCrecimientoOstionMediciones);
}
