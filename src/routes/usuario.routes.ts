import type { FastifyInstance } from 'fastify';
import * as userController from '../controllers/usuario.controller.js';

export async function registerUsuarioRoutes(app: FastifyInstance) {
  // Usuarios
  app.post('/api/login', userController.login);
  app.post('/api/usuarios', userController.createUsuario);
  app.get('/api/usuarios', userController.getUsuarios);
  app.get('/api/usuarios/:id', userController.getUsuarioById);
  app.put('/api/usuarios/:id', userController.updateUsuario);
  app.delete('/api/usuarios/:id', userController.deleteUsuario);

  // Tipos de Rol
  app.post('/api/tipos-rol', userController.createTipoRol);
  app.get('/api/tipos-rol', userController.getTiposRol);
  app.get('/api/tipos-rol/:id', userController.getTipoRolById);
  app.put('/api/tipos-rol/:id', userController.updateTipoRol);
  app.delete('/api/tipos-rol/:id', userController.deleteTipoRol);

  // Alertas
  app.post('/api/alertas', userController.createAlerta);
  app.get('/api/alertas', userController.getAlertas);
  app.get('/api/alertas/:id', userController.getAlertaById);
  app.put('/api/alertas/:id', userController.updateAlerta);
  app.delete('/api/alertas/:id', userController.deleteAlerta);

  // Parámetros
  app.post('/api/parametros', userController.createParametro);
  app.get('/api/parametros', userController.getParametros);
  app.get('/api/parametros/:id', userController.getParametroById);
  app.put('/api/parametros/:id', userController.updateParametro);
  app.delete('/api/parametros/:id', userController.deleteParametro);
}
