import { FastifyInstance } from 'fastify';
import {
  getLecturas,
  getResumenHorario,
  getPromedios,
  getReporteXML,
  getLecturasProceso,
  getLecturasPorProceso
} from '../controllers/lecturas.controller.js';

export async function registerLecturasRoutes(app: FastifyInstance) {
  app.get('/api/lecturas', getLecturas);
  app.get('/api/lecturas/proceso', getLecturasProceso);
  app.get('/api/lecturas-por-proceso', getLecturasPorProceso);
  app.get('/api/resumen-horario', getResumenHorario);
  app.get('/api/promedios', getPromedios);
  app.get('/api/reportes/xml', getReporteXML);
}
