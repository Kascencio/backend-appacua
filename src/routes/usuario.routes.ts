import type { FastifyInstance } from 'fastify';
import * as userController from '../controllers/usuario.controller.js';

export async function registerUsuarioRoutes(app: FastifyInstance) {
  // Usuarios
  app.post('/api/login', userController.login);
  app.post('/api/auth/login', userController.login);
  app.post('/api/auth/register', userController.register);
  app.post('/api/auth/refresh', userController.refreshToken);
  app.post('/api/auth/forgot-password', userController.forgotPassword);
  app.post('/api/auth/reset-password', userController.resetPassword);
  app.get('/api/auth/me', userController.getMe);
  app.post('/api/auth/logout', userController.logout);
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
  // Alias legacy frontend
  app.post('/api/roles', userController.createTipoRol);
  app.get('/api/roles', userController.getTiposRol);
  app.get('/api/roles/:id', userController.getTipoRolById);
  app.put('/api/roles/:id', userController.updateTipoRol);
  app.delete('/api/roles/:id', userController.deleteTipoRol);

  // Asignaciones Usuario
  app.post('/api/asignacion-usuario', userController.createAsignacionUsuario);
  app.get('/api/asignacion-usuario', userController.getAsignacionesUsuario);
  app.get('/api/asignacion-usuario/:id', userController.getAsignacionUsuarioById);
  app.delete('/api/asignacion-usuario/:id', userController.deleteAsignacionUsuario);

  // Alertas
  app.post('/api/alertas', userController.createAlerta);
  app.get('/api/alertas', userController.getAlertas);
  app.put('/api/alertas/read-all', userController.markAllAlertasRead);
  app.patch('/api/alertas/read-all', userController.markAllAlertasRead);
  app.post('/api/alertas/delete-all', userController.deleteAllAlertas);
  app.put('/api/alertas/:id/read', userController.markAlertaRead);
  app.patch('/api/alertas/:id/read', userController.markAlertaRead);
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
