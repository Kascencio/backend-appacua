import { FastifyInstance } from 'fastify';
import {
  createLecturas,
  getLecturas,
  getResumenHorario,
  getPromedios,
  getPromediosBatch,
  getReporteXML,
  getLecturasProceso,
  getLecturasPorProceso
} from '../controllers/lecturas.controller.js';

export async function registerLecturasRoutes(app: FastifyInstance) {
  app.post('/api/lecturas', createLecturas);
  app.get('/api/lecturas', getLecturas);
  app.get('/api/lecturas/proceso', getLecturasProceso);
  app.get('/api/lecturas-por-proceso', getLecturasPorProceso);
  app.get('/api/resumen-horario', getResumenHorario);
  app.get('/api/promedios', getPromedios);
  app.get('/api/promedios-batch', getPromediosBatch);
  app.get('/api/reportes/xml', getReporteXML);
}
