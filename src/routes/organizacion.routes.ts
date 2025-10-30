import type { FastifyInstance } from 'fastify';
import * as orgController from '../controllers/organizacion.controller.js';

export async function registerOrganizacionRoutes(app: FastifyInstance) {
  // Organizaciones
  app.post('/api/organizaciones', orgController.createOrganizacion);
  app.get('/api/organizaciones', orgController.getOrganizaciones);
  app.get('/api/organizaciones/:id', orgController.getOrganizacionById);
  app.put('/api/organizaciones/:id', orgController.updateOrganizacion);
  app.delete('/api/organizaciones/:id', orgController.deleteOrganizacion);

  // Sucursales
  app.post('/api/sucursales', orgController.createSucursal);
  app.get('/api/sucursales', orgController.getSucursales);
  app.get('/api/sucursales/:id', orgController.getSucursalById);
  app.put('/api/sucursales/:id', orgController.updateSucursal);
  app.delete('/api/sucursales/:id', orgController.deleteSucursal);
}
