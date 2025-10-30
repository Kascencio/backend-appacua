import type { FastifyInstance } from 'fastify';
import * as especiesController from '../controllers/especies.controller.js';

export async function registerEspeciesRoutes(app: FastifyInstance) {
  // Catálogo Especies
  app.post('/api/catalogo-especies', especiesController.createCatalogoEspecie);
  app.get('/api/catalogo-especies', especiesController.getCatalogoEspecies);
  app.get('/api/catalogo-especies/:id', especiesController.getCatalogoEspecieById);
  app.put('/api/catalogo-especies/:id', especiesController.updateCatalogoEspecie);
  app.delete('/api/catalogo-especies/:id', especiesController.deleteCatalogoEspecie);

  // Especies Instaladas
  app.post('/api/especies-instaladas', especiesController.createEspecieInstalada);
  app.get('/api/especies-instaladas', especiesController.getEspeciesInstaladas);
  app.get('/api/especies-instaladas/:id', especiesController.getEspecieInstaladaById);
  app.put('/api/especies-instaladas/:id', especiesController.updateEspecieInstalada);
  app.delete('/api/especies-instaladas/:id', especiesController.deleteEspecieInstalada);

  // Especie Parámetro
  app.post('/api/especies-parametros', especiesController.createEspecieParametro);
  app.get('/api/especies-parametros', especiesController.getEspeciesParametros);
  app.get('/api/especies-parametros/:id', especiesController.getEspecieParametroById);
  app.put('/api/especies-parametros/:id', especiesController.updateEspecieParametro);
  app.delete('/api/especies-parametros/:id', especiesController.deleteEspecieParametro);

  // Procesos
  app.post('/api/procesos', especiesController.createProceso);
  app.get('/api/procesos', especiesController.getProcesos);
  app.get('/api/procesos/:id', especiesController.getProcesoById);
  app.put('/api/procesos/:id', especiesController.updateProceso);
  app.delete('/api/procesos/:id', especiesController.deleteProceso);
}
