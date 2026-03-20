import { PrismaClient, type proceso_estado } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { refreshLecturaAggregatesWindow } from '../src/services/lectura-aggregates.service.js';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = '123456';
const HISTORY_DAYS = 14;
const STEP_HOURS = 6;

type InstallationTemplate = {
  org: string;
  branch: string;
  installation: string;
  species: string;
  processName: string;
  status: proceso_estado;
  startOffsetDays: number;
  durationDays: number;
  descripcion: string;
  lat: number;
  lng: number;
  capacidadMaxima: number;
  capacidadActual: number;
  volumen: number;
  profundidad: number;
};

function atStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function timePart(date: Date): Date {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return new Date(`1970-01-01T${hh}:${mm}:${ss}Z`);
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function sensorKind(
  sensorName: string,
): 'temperature' | 'ph' | 'oxygen' | 'salinity' | 'turbidity' | 'nitrates' | 'ammonia' | 'conductivity' | 'orp' | 'other' {
  const key = normalize(sensorName);
  if (key.includes('temperatura')) return 'temperature';
  if (key === 'ph' || key.includes('potencial')) return 'ph';
  if (key.includes('oxigeno') || key.includes('oxygen')) return 'oxygen';
  if (key.includes('salinidad')) return 'salinity';
  if (key.includes('turbidez')) return 'turbidity';
  if (key.includes('nitrato') || key.includes('nitrate')) return 'nitrates';
  if (key.includes('amonio') || key.includes('amoniaco') || key.includes('ammonia')) return 'ammonia';
  if (key.includes('conductividad') || key.includes('conductivity')) return 'conductivity';
  if (key.includes('orp') || key.includes('redox')) return 'orp';
  return 'other';
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function readingValue(kind: ReturnType<typeof sensorKind>, step: number, sensorId: number): number {
  const noise = (pseudoRandom(step + sensorId) - 0.5) * 2;
  const seasonal = Math.sin(step / 3);

  switch (kind) {
    case 'temperature':
      return Number((25 + seasonal * 1.8 + noise * 0.9).toFixed(2));
    case 'ph':
      return Number((7.2 + seasonal * 0.25 + noise * 0.08).toFixed(2));
    case 'oxygen':
      return Number((6.8 + seasonal * 0.6 + noise * 0.35).toFixed(2));
    case 'salinity':
      return Number((17.5 + seasonal * 1.4 + noise * 0.6).toFixed(2));
    case 'turbidity':
      return Number((12 + Math.abs(seasonal) * 8 + Math.abs(noise) * 3).toFixed(2));
    case 'nitrates':
      return Number((18 + Math.abs(seasonal) * 6 + Math.abs(noise) * 2.2).toFixed(2));
    case 'ammonia':
      return Number((0.25 + Math.abs(seasonal) * 0.2 + Math.abs(noise) * 0.08).toFixed(3));
    case 'conductivity':
      return Number((1200 + seasonal * 140 + noise * 60).toFixed(2));
    case 'orp':
      return Number((275 + seasonal * 35 + noise * 15).toFixed(2));
    default:
      return Number((50 + seasonal * 5 + noise * 2).toFixed(2));
  }
}

async function ensureRole(name: string) {
  const existing = await prisma.tipo_rol.findFirst({
    where: {
      nombre: {
        equals: name,
      },
    },
  });

  if (existing) return existing;
  return prisma.tipo_rol.create({ data: { nombre: name } });
}

async function ensureParametro(nombre_parametro: string, unidad_medida: string) {
  const existing = await prisma.parametros.findFirst({
    where: {
      nombre_parametro: {
        equals: nombre_parametro,
      },
    },
  });

  if (existing) {
    return prisma.parametros.update({
      where: { id_parametro: existing.id_parametro },
      data: { unidad_medida },
    });
  }

  return prisma.parametros.create({
    data: { nombre_parametro, unidad_medida },
  });
}

async function ensureCatalogoSensor(nombre: string, unidad_medida: string, descripcion: string) {
  const existing = await prisma.catalogo_sensores.findFirst({
    where: {
      nombre: {
        equals: nombre,
      },
    },
  });

  // Nunca modificar sensores/tipos existentes: solo agregar nuevos si faltan.
  if (existing) return existing;

  return prisma.catalogo_sensores.create({
    data: {
      nombre,
      descripcion,
      unidad_medida,
      modelo: 'AQM-Gen2',
      marca: 'AquaSense',
      rango_medicion: 'Automático',
    },
  });
}

async function ensureEspecie(params: {
  nombre: string;
  nombre_cientifico: string;
  descripcion: string;
  temperatura: [number, number];
  ph: [number, number];
  oxigeno: [number, number];
  salinidad: [number, number];
}) {
  const existing = await prisma.especies.findFirst({
    where: {
      nombre: {
        equals: params.nombre,
      },
    },
  });

  const data = {
    nombre: params.nombre,
    nombre_cientifico: params.nombre_cientifico,
    descripcion: params.descripcion,
    temperatura_optima_min: params.temperatura[0],
    temperatura_optima_max: params.temperatura[1],
    ph_optimo_min: params.ph[0],
    ph_optimo_max: params.ph[1],
    oxigeno_optimo_min: params.oxigeno[0],
    oxigeno_optimo_max: params.oxigeno[1],
    salinidad_optima_min: params.salinidad[0],
    salinidad_optima_max: params.salinidad[1],
    estado: 'activa' as const,
  };

  if (existing) {
    return prisma.especies.update({
      where: { id_especie: existing.id_especie },
      data,
    });
  }

  return prisma.especies.create({ data });
}

async function ensureEspecieParametro(idEspecie: number, idParametro: number, rmin: number, rmax: number) {
  const rows = await prisma.especie_parametro.findMany({
    where: { id_especie: idEspecie, id_parametro: idParametro },
    orderBy: { id_especie_parametro: 'asc' },
  });

  if (rows.length === 0) {
    await prisma.especie_parametro.create({
      data: {
        id_especie: idEspecie,
        id_parametro: idParametro,
        Rmin: rmin,
        Rmax: rmax,
      },
    });
    return;
  }

  await prisma.especie_parametro.update({
    where: { id_especie_parametro: rows[0].id_especie_parametro },
    data: {
      Rmin: rmin,
      Rmax: rmax,
    },
  });

  if (rows.length > 1) {
    await prisma.especie_parametro.deleteMany({
      where: {
        id_especie_parametro: {
          in: rows.slice(1).map((row) => row.id_especie_parametro),
        },
      },
    });
  }
}

async function ensureUser(params: {
  nombre: string;
  correo: string;
  idRol: number;
  passwordHash: string;
}) {
  const existing = await prisma.usuario.findUnique({
    where: { correo: params.correo },
  });

  if (existing) {
    return prisma.usuario.update({
      where: { id_usuario: existing.id_usuario },
      data: {
        nombre_completo: params.nombre,
        id_rol: params.idRol,
        estado: 'activo',
        password_hash: params.passwordHash,
      },
    });
  }

  return prisma.usuario.create({
    data: {
      nombre_completo: params.nombre,
      correo: params.correo,
      id_rol: params.idRol,
      estado: 'activo',
      password_hash: params.passwordHash,
    },
  });
}

async function ensureAssignment(params: {
  idUsuario: number;
  idSucursal?: number | null;
  idInstalacion?: number | null;
}) {
  const existing = await prisma.asignacion_usuario.findFirst({
    where: {
      id_usuario: params.idUsuario,
      id_organizacion_sucursal: params.idSucursal ?? null,
      id_instalacion: params.idInstalacion ?? null,
    },
  });

  if (existing) return existing;

  return prisma.asignacion_usuario.create({
    data: {
      id_usuario: params.idUsuario,
      id_organizacion_sucursal: params.idSucursal ?? null,
      id_instalacion: params.idInstalacion ?? null,
    },
  });
}

async function main() {
  console.log('Seeding started...');

  const today = atStartOfDay(new Date());

  const estado = await prisma.estados.upsert({
    where: { id_estado: 1 },
    update: { nombre: 'Tabasco' },
    create: { nombre: 'Tabasco' },
  });

  const municipio = await prisma.municipios.upsert({
    where: { id_municipio: 1 },
    update: { nombre: 'Centro', id_estado: estado.id_estado },
    create: {
      nombre: 'Centro',
      id_estado: estado.id_estado,
    },
  });

  const rolSuperadmin = await ensureRole('SUPERADMIN');
  const rolAdmin = await ensureRole('ADMIN');
  const rolOperador = await ensureRole('OPERADOR');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const superadmin = await ensureUser({
    nombre: 'Super Admin',
    correo: 'superadmin@example.com',
    idRol: rolSuperadmin.id_rol,
    passwordHash,
  });

  const admin = await ensureUser({
    nombre: 'Admin Operativo',
    correo: 'admin@example.com',
    idRol: rolAdmin.id_rol,
    passwordHash,
  });

  const operador = await ensureUser({
    nombre: 'Operador de Campo',
    correo: 'operador@example.com',
    idRol: rolOperador.id_rol,
    passwordHash,
  });

  const organizacionesData = [
    {
      nombre: 'Aqua Principal',
      razon_social: 'Aqua Principal S.A. de C.V.',
      rfc: 'APR010101AA1',
      correo: 'contacto@aquaprincipal.com',
      telefono: '+52 993 100 1001',
      direccion: 'Carretera Villahermosa - Frontera km 12',
      latitud: 17.9892,
      longitud: -92.9361,
      branches: [
        {
          nombre_sucursal: 'Sucursal Principal',
          direccion_sucursal: 'Ranchería Río Viejo, Centro, Tabasco',
          latitud: 17.9951,
          longitud: -92.9302,
        },
      ],
    },
  ];

  const orgByName = new Map<string, { id_organizacion: number }>();
  const branchByKey = new Map<string, { id_organizacion_sucursal: number }>();

  for (const orgData of organizacionesData) {
    const existingOrg = await prisma.organizacion.findFirst({
      where: {
        nombre: {
          equals: orgData.nombre,
        },
      },
    });

    const org = existingOrg
      ? await prisma.organizacion.update({
          where: { id_organizacion: existingOrg.id_organizacion },
          data: {
            razon_social: orgData.razon_social,
            rfc: orgData.rfc,
            correo: orgData.correo,
            telefono: orgData.telefono,
            direccion: orgData.direccion,
            id_estado: estado.id_estado,
            id_municipio: municipio.id_municipio,
            estado: 'activa',
            latitud: orgData.latitud,
            longitud: orgData.longitud,
          },
        })
      : await prisma.organizacion.create({
          data: {
            nombre: orgData.nombre,
            razon_social: orgData.razon_social,
            rfc: orgData.rfc,
            correo: orgData.correo,
            telefono: orgData.telefono,
            direccion: orgData.direccion,
            id_estado: estado.id_estado,
            id_municipio: municipio.id_municipio,
            estado: 'activa',
            latitud: orgData.latitud,
            longitud: orgData.longitud,
          },
        });

    orgByName.set(orgData.nombre, { id_organizacion: org.id_organizacion });

    for (const branchData of orgData.branches) {
      const existingBranch = await prisma.organizacion_sucursal.findFirst({
        where: {
          id_organizacion: org.id_organizacion,
          nombre_sucursal: {
            equals: branchData.nombre_sucursal,
          },
        },
      });

      const branch = existingBranch
        ? await prisma.organizacion_sucursal.update({
            where: { id_organizacion_sucursal: existingBranch.id_organizacion_sucursal },
            data: {
              direccion_sucursal: branchData.direccion_sucursal,
              telefono_sucursal: orgData.telefono,
              correo_sucursal: orgData.correo,
              id_estado: estado.id_estado,
              id_municipio: municipio.id_municipio,
              estado: 'activa',
              latitud: branchData.latitud,
              longitud: branchData.longitud,
            },
          })
        : await prisma.organizacion_sucursal.create({
            data: {
              id_organizacion: org.id_organizacion,
              nombre_sucursal: branchData.nombre_sucursal,
              direccion_sucursal: branchData.direccion_sucursal,
              telefono_sucursal: orgData.telefono,
              correo_sucursal: orgData.correo,
              id_estado: estado.id_estado,
              id_municipio: municipio.id_municipio,
              estado: 'activa',
              latitud: branchData.latitud,
              longitud: branchData.longitud,
            },
          });

      branchByKey.set(`${orgData.nombre}::${branchData.nombre_sucursal}`, {
        id_organizacion_sucursal: branch.id_organizacion_sucursal,
      });
    }
  }

  const parametroTemperatura = await ensureParametro('Temperatura', '°C');
  const parametroPH = await ensureParametro('pH', 'pH');
  const parametroOxigeno = await ensureParametro('Oxígeno Disuelto', 'mg/L');
  const parametroSalinidad = await ensureParametro('Salinidad', 'ppt');

  const especiesBase = [
    {
      nombre: 'Tilapia',
      nombre_cientifico: 'Oreochromis niloticus',
      descripcion: 'Especie tropical de rápido crecimiento para cultivo semi-intensivo.',
      temperatura: [24, 30] as [number, number],
      ph: [6.5, 8.5] as [number, number],
      oxigeno: [5, 9] as [number, number],
      salinidad: [0, 12] as [number, number],
    },
    {
      nombre: 'Camarón Blanco',
      nombre_cientifico: 'Litopenaeus vannamei',
      descripcion: 'Crustáceo marino adaptable a sistemas intensivos, biofloc y agua salobre.',
      temperatura: [26, 32] as [number, number],
      ph: [7.2, 8.4] as [number, number],
      oxigeno: [5.5, 10] as [number, number],
      salinidad: [10, 28] as [number, number],
    },
    {
      nombre: 'Trucha Arcoíris',
      nombre_cientifico: 'Oncorhynchus mykiss',
      descripcion: 'Especie de agua fría que requiere alto oxígeno disuelto y control térmico estricto.',
      temperatura: [12, 18] as [number, number],
      ph: [6.8, 8.0] as [number, number],
      oxigeno: [7.0, 12.0] as [number, number],
      salinidad: [0, 5] as [number, number],
    },
    {
      nombre: 'Carpa Común',
      nombre_cientifico: 'Cyprinus carpio',
      descripcion: 'Pez omnívoro resistente y adaptable a variaciones ambientales.',
      temperatura: [20, 28] as [number, number],
      ph: [6.5, 8.5] as [number, number],
      oxigeno: [4.0, 8.0] as [number, number],
      salinidad: [0, 8] as [number, number],
    },
    {
      nombre: 'Bagre de Canal',
      nombre_cientifico: 'Ictalurus punctatus',
      descripcion: 'Especie de fondo con alta tolerancia y amplia adopción en acuicultura continental.',
      temperatura: [24, 30] as [number, number],
      ph: [6.5, 8.5] as [number, number],
      oxigeno: [4.0, 8.0] as [number, number],
      salinidad: [0, 10] as [number, number],
    },
    {
      nombre: 'Ostión Japonés',
      nombre_cientifico: 'Crassostrea gigas',
      descripcion: 'Molusco filtrador de cultivo costero, útil para operaciones en agua salobre-marina.',
      temperatura: [18, 25] as [number, number],
      ph: [7.5, 8.4] as [number, number],
      oxigeno: [5.0, 9.0] as [number, number],
      salinidad: [20, 35] as [number, number],
    },
  ];

  const especies = await Promise.all(especiesBase.map((params) => ensureEspecie(params)));

  const especieByName = new Map<string, { id_especie: number }>(
    especies.map((especie) => [especie.nombre, { id_especie: especie.id_especie }]),
  );

  for (const especie of especies) {
    const config = especiesBase.find((item) => item.nombre === especie.nombre);
    if (!config) continue;

    await ensureEspecieParametro(especie.id_especie, parametroTemperatura.id_parametro, config.temperatura[0], config.temperatura[1]);
    await ensureEspecieParametro(especie.id_especie, parametroPH.id_parametro, config.ph[0], config.ph[1]);
    await ensureEspecieParametro(especie.id_especie, parametroOxigeno.id_parametro, config.oxigeno[0], config.oxigeno[1]);
    await ensureEspecieParametro(especie.id_especie, parametroSalinidad.id_parametro, config.salinidad[0], config.salinidad[1]);
  }

  const installationTemplates: InstallationTemplate[] = [
    {
      org: 'Aqua Principal',
      branch: 'Sucursal Principal',
      installation: 'Estanque Principal',
      species: 'Tilapia',
      processName: 'Proceso Principal de Tilapia',
      status: 'en_progreso',
      startOffsetDays: -30,
      durationDays: 120,
      descripcion: 'Estanque principal de engorda con aireación mecánica',
      lat: 17.9956,
      lng: -92.9309,
      capacidadMaxima: 12000,
      capacidadActual: 8600,
      volumen: 3500,
      profundidad: 1.7,
    },
  ];

  const installedById = new Map<number, { id_instalacion: number; nombre_instalacion: string }>();

  for (const template of installationTemplates) {
    const species = especieByName.get(template.species);
    const branch = branchByKey.get(`${template.org}::${template.branch}`);

    if (!species || !branch) {
      continue;
    }

    const fechaInicio = atStartOfDay(addDays(today, template.startOffsetDays));
    const fechaFinal = atStartOfDay(addDays(fechaInicio, template.durationDays));
    const progreso = template.status === 'planificado'
      ? 0
      : template.status === 'completado'
        ? 100
        : Math.max(1, Math.min(99, Math.round(((today.getTime() - fechaInicio.getTime()) / (fechaFinal.getTime() - fechaInicio.getTime())) * 100)));

    const existingProceso = await prisma.procesos.findFirst({
      where: {
        nombre_proceso: {
          equals: template.processName,
        },
      },
    });

    const proceso = existingProceso
      ? await prisma.procesos.update({
          where: { id_proceso: existingProceso.id_proceso },
          data: {
            id_especie: species.id_especie,
            descripcion: `Seguimiento productivo para ${template.species} en ${template.installation}`,
            objetivos: 'Mantener parámetros óptimos y maximizar supervivencia',
            estado: template.status,
            porcentaje_avance: progreso,
            fecha_inicio: fechaInicio,
            fecha_final: fechaFinal,
            fecha_fin_real: template.status === 'completado' ? fechaFinal : null,
          },
        })
      : await prisma.procesos.create({
          data: {
            id_especie: species.id_especie,
            nombre_proceso: template.processName,
            descripcion: `Seguimiento productivo para ${template.species} en ${template.installation}`,
            objetivos: 'Mantener parámetros óptimos y maximizar supervivencia',
            estado: template.status,
            porcentaje_avance: progreso,
            fecha_inicio: fechaInicio,
            fecha_final: fechaFinal,
            fecha_fin_real: template.status === 'completado' ? fechaFinal : null,
          },
        });

    const existingInstalacion = await prisma.instalacion.findFirst({
      where: {
        id_organizacion_sucursal: branch.id_organizacion_sucursal,
        nombre_instalacion: {
          equals: template.installation,
        },
      },
    });

    const instalacion = existingInstalacion
      ? await prisma.instalacion.update({
          where: { id_instalacion: existingInstalacion.id_instalacion },
          data: {
            id_proceso: proceso.id_proceso,
            fecha_instalacion: atStartOfDay(addDays(fechaInicio, -12)),
            estado_operativo: 'activo',
            descripcion: template.descripcion,
            tipo_uso: 'acuicultura',
            codigo_instalacion: template.installation
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, 12),
            ubicacion: `${template.branch} (${template.org})`,
            latitud: template.lat,
            longitud: template.lng,
            capacidad_maxima: template.capacidadMaxima,
            capacidad_actual: template.capacidadActual,
            volumen_agua_m3: template.volumen,
            profundidad_m: template.profundidad,
            fecha_ultima_inspeccion: atStartOfDay(addDays(today, -2)),
            responsable_operativo: 'Ing. Operaciones Aqua',
            contacto_emergencia: '+52 993 222 3344',
          },
        })
      : await prisma.instalacion.create({
          data: {
            id_organizacion_sucursal: branch.id_organizacion_sucursal,
            id_proceso: proceso.id_proceso,
            nombre_instalacion: template.installation,
            fecha_instalacion: atStartOfDay(addDays(fechaInicio, -12)),
            estado_operativo: 'activo',
            descripcion: template.descripcion,
            tipo_uso: 'acuicultura',
            codigo_instalacion: template.installation
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, 12),
            ubicacion: `${template.branch} (${template.org})`,
            latitud: template.lat,
            longitud: template.lng,
            capacidad_maxima: template.capacidadMaxima,
            capacidad_actual: template.capacidadActual,
            volumen_agua_m3: template.volumen,
            profundidad_m: template.profundidad,
            fecha_ultima_inspeccion: atStartOfDay(addDays(today, -2)),
            responsable_operativo: 'Ing. Operaciones Aqua',
            contacto_emergencia: '+52 993 222 3344',
          },
        });

    installedById.set(instalacion.id_instalacion, {
      id_instalacion: instalacion.id_instalacion,
      nombre_instalacion: instalacion.nombre_instalacion,
    });
  }

  const sensoresCatalogo = [
    await ensureCatalogoSensor('Temperatura', '°C', 'Sensor de temperatura del agua'),
    await ensureCatalogoSensor('pH', 'pH', 'Sensor de potencial de hidrógeno'),
    await ensureCatalogoSensor('Oxígeno Disuelto', 'mg/L', 'Sensor óptico de oxígeno disuelto'),
    await ensureCatalogoSensor('Salinidad', 'ppt', 'Sensor de salinidad'),
  ];

  const sensoresInstalados: Array<{
    id_sensor_instalado: number;
    id_sensor: number;
    id_instalacion: number;
    sensorNombre: string;
  }> = [];

  for (const instalacion of installedById.values()) {
    for (const sensor of sensoresCatalogo) {
      const existingByType = await prisma.sensor_instalado.findFirst({
        where: {
          id_instalacion: instalacion.id_instalacion,
          id_sensor: sensor.id_sensor,
        },
      });

      // No tocar sensores existentes de la instalación; solo agregar nuevos.
      if (existingByType) {
        continue;
      }

      const sensorInstalado = await prisma.sensor_instalado.create({
        data: {
          id_instalacion: instalacion.id_instalacion,
          id_sensor: sensor.id_sensor,
          fecha_instalada: addDays(today, -90),
          descripcion: `[SEED] ${sensor.nombre} - ${instalacion.nombre_instalacion}`,
        },
      });

      sensoresInstalados.push({
        id_sensor_instalado: sensorInstalado.id_sensor_instalado,
        id_sensor: sensor.id_sensor,
        id_instalacion: instalacion.id_instalacion,
        sensorNombre: sensor.nombre,
      });
    }
  }

  const allBranchIds = Array.from(branchByKey.values()).map((b) => b.id_organizacion_sucursal);
  for (const branchId of allBranchIds) {
    await ensureAssignment({ idUsuario: superadmin.id_usuario, idSucursal: branchId, idInstalacion: null });
  }

  for (const branchId of allBranchIds) {
    await ensureAssignment({ idUsuario: admin.id_usuario, idSucursal: branchId, idInstalacion: null });
  }

  const seededInstallations = Array.from(installedById.values());
  const firstAdminFacility = sensoresInstalados[0]?.id_instalacion ?? seededInstallations[0]?.id_instalacion;
  if (firstAdminFacility) {
    await ensureAssignment({
      idUsuario: superadmin.id_usuario,
      idSucursal: null,
      idInstalacion: firstAdminFacility,
    });

    await ensureAssignment({
      idUsuario: admin.id_usuario,
      idSucursal: null,
      idInstalacion: firstAdminFacility,
    });

    await ensureAssignment({
      idUsuario: operador.id_usuario,
      idSucursal: null,
      idInstalacion: firstAdminFacility,
    });
  }

  const firstBranchId = allBranchIds[0];
  if (firstBranchId) {
    await ensureAssignment({
      idUsuario: operador.id_usuario,
      idSucursal: firstBranchId,
      idInstalacion: null,
    });
  }

  const historyStart = addDays(today, -HISTORY_DAYS);
  const now = new Date();

  for (const sensor of sensoresInstalados) {
    const existingCount = await prisma.lectura.count({
      where: {
        id_sensor_instalado: sensor.id_sensor_instalado,
        fecha: {
          gte: historyStart,
        },
      },
    });

    const minimumRows = Math.ceil((HISTORY_DAYS * 24) / STEP_HOURS) - 4;
    if (existingCount >= minimumRows) {
      continue;
    }

    const data: Array<{
      id_sensor_instalado: number;
      valor: number;
      fecha: Date;
      hora: Date;
    }> = [];

    let cursor = new Date(historyStart);
    let step = 0;
    while (cursor <= now) {
      const kind = sensorKind(sensor.sensorNombre);
      let valor = readingValue(kind, step, sensor.id_sensor_instalado);

      // Inyectar una variación puntual para simular eventos reales.
      if (step % 19 === 0 && kind === 'oxygen') {
        valor = Math.max(2.5, Number((valor - 2.1).toFixed(2)));
      }
      if (step % 23 === 0 && kind === 'temperature') {
        valor = Number((valor + 2.4).toFixed(2));
      }

      data.push({
        id_sensor_instalado: sensor.id_sensor_instalado,
        valor,
        fecha: atStartOfDay(cursor),
        hora: timePart(cursor),
      });

      cursor = addHours(cursor, STEP_HOURS);
      step += 1;
    }

    if (data.length > 0) {
      await prisma.lectura.createMany({
        data,
      });
    }
  }

  for (const sensor of sensoresInstalados) {
    const latest = await prisma.lectura.findFirst({
      where: { id_sensor_instalado: sensor.id_sensor_instalado },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      select: { id_lectura: true },
    });

    if (latest) {
      await prisma.sensor_instalado.update({
        where: { id_sensor_instalado: sensor.id_sensor_instalado },
        data: { id_lectura: latest.id_lectura },
      });
    }
  }

  if (sensoresInstalados.length > 0) {
    await refreshLecturaAggregatesWindow({
      from: historyStart,
      to: now,
      sensorIds: sensoresInstalados.map((sensor) => sensor.id_sensor_instalado),
    });
  }

  const alertCandidates = sensoresInstalados.slice(0, 4);
  for (const sensor of alertCandidates) {
    const latest = await prisma.lectura.findFirst({
      where: { id_sensor_instalado: sensor.id_sensor_instalado },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      select: { valor: true },
    });

    if (!latest) continue;

    const existingAlert = await prisma.alertas.findFirst({
      where: {
        id_sensor_instalado: sensor.id_sensor_instalado,
        descripcion: {
          equals: 'Seed: valor fuera de rango operativo',
        },
      },
    });

    if (existingAlert) continue;

    await prisma.alertas.create({
      data: {
        id_instalacion: sensor.id_instalacion,
        id_sensor_instalado: sensor.id_sensor_instalado,
        descripcion: 'Seed: valor fuera de rango operativo',
        dato_puntual: latest.valor,
      },
    });
  }

  const totalInstalaciones = await prisma.instalacion.count();
  const totalSensores = await prisma.sensor_instalado.count();
  const totalLecturas = await prisma.lectura.count({
    where: {
      fecha: {
        gte: historyStart,
      },
    },
  });

  console.log('Seeding completed successfully.');
  console.log(`Superadmin: superadmin@example.com / ${DEFAULT_PASSWORD}`);
  console.log(`Admin: admin@example.com / ${DEFAULT_PASSWORD}`);
  console.log(`Operador: operador@example.com / ${DEFAULT_PASSWORD}`);
  console.log(`Instalaciones: ${totalInstalaciones}`);
  console.log(`Sensores instalados: ${totalSensores}`);
  console.log(`Lecturas (${HISTORY_DAYS} días): ${totalLecturas}`);
}

main()
  .catch((error) => {
    console.error('Seeding error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
