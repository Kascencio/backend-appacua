import { create } from 'xmlbuilder2';

export function buildReportXML(sensorId: number, rows: Array<{timestamp: Date, valor: number}>, promedio: number|null) {
  const root = create({ version: '1.0' }).ele('reporte');
  root.ele('fecha').txt(new Date().toISOString()).up();
  const sensores = root.ele('sensores');
  const sensor = sensores.ele('sensor', { id: sensorId.toString() });
  sensor.ele('promedio').txt(promedio !== null ? promedio.toFixed(6) : 'NaN').up();
  const lecturas = sensor.ele('lecturas');
  rows.forEach(r => {
    const node = lecturas.ele('lectura', { timestamp: r.timestamp.toISOString() });
    node.ele('valor').txt(r.valor.toString());
  });
  return root.end({ prettyPrint: true });
}
