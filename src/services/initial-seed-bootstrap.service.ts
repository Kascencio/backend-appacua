import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../repositories/prisma.js';

const DEFAULT_PASSWORD = '123456';
const MVERGEL_PASSWORD = '105090Vergel';

const TECNM_ORG_NAME = 'TecNM Campus Villahermosa';
const TECNM_BRANCH_NAME = 'Laboratorio de Acuicultura';
const TECNM_INSTALLATION_NAME = 'Estanque Experimental 1';
const TECNM_PROCESS_NAME = 'Investigación Tilapia G1';

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

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

async function ensureCatalogoSensor(
  nombre: string,
  unidad_medida: string,
  descripcion: string,
  rango_medicion: string,
) {
  const existing = await prisma.catalogo_sensores.findFirst({
    where: {
      nombre: {
        equals: nombre,
      },
    },
  });

  if (existing) {
    return prisma.catalogo_sensores.update({
      where: { id_sensor: existing.id_sensor },
      data: {
        descripcion,
        unidad_medida,
        modelo: 'AQM-Gen2',
        marca: 'AquaSense',
        rango_medicion,
      },
    });
  }

  return prisma.catalogo_sensores.create({
    data: {
      nombre,
      descripcion,
      unidad_medida,
      modelo: 'AQM-Gen2',
      marca: 'AquaSense',
      rango_medicion,
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

async function isTecnmSeedAlreadyApplied(): Promise<boolean> {
  const [superadmin, mvergel, org] = await Promise.all([
    prisma.usuario.findUnique({ where: { correo: 'superadmin@example.com' } }),
    prisma.usuario.findUnique({ where: { correo: 'mvergel@gmail.com' } }),
    prisma.organizacion.findFirst({
      where: {
        nombre: {
          equals: TECNM_ORG_NAME,
        },
      },
    }),
  ]);

  if (!superadmin || !mvergel || !org) return false;

  const branch = await prisma.organizacion_sucursal.findFirst({
    where: {
      id_organizacion: org.id_organizacion,
      nombre_sucursal: {
        equals: TECNM_BRANCH_NAME,
      },
    },
  });

  if (!branch) return false;

  const installation = await prisma.instalacion.findFirst({
    where: {
      id_organizacion_sucursal: branch.id_organizacion_sucursal,
      nombre_instalacion: {
        equals: TECNM_INSTALLATION_NAME,
      },
    },
  });

  if (!installation) return false;

  const [speciesRows, sensorRows] = await Promise.all([
    prisma.especies.findMany({
      where: {
        nombre: {
          in: [
            'Tilapia',
            'Camarón Blanco',
            'Trucha Arcoíris',
            'Carpa Común',
            'Bagre de Canal',
            'Ostión Japonés',
          ],
        },
      },
      select: { nombre: true },
    }),
    prisma.catalogo_sensores.findMany({
      where: {
        nombre: {
          in: ['Temperatura', 'pH', 'Oxígeno Disuelto', 'Salinidad'],
        },
      },
      select: { nombre: true },
    }),
  ]);

  const speciesSet = new Set(speciesRows.map((item) => normalize(item.nombre)));
  const sensorsSet = new Set(sensorRows.map((item) => normalize(item.nombre)));

  const requiredSpecies = ['tilapia', 'camaron blanco', 'trucha arcoiris', 'carpa comun', 'bagre de canal', 'ostion japones'];
  const requiredSensors = ['temperatura', 'ph', 'oxigeno disuelto', 'salinidad'];

  const hasSpecies = requiredSpecies.every((name) => speciesSet.has(name));
  const hasSensors = requiredSensors.every((name) => sensorsSet.has(name));

  if (!hasSpecies || !hasSensors) return false;

  const [superadminBranchAssignment, mvergelBranchAssignment] = await Promise.all([
    prisma.asignacion_usuario.findFirst({
      where: {
        id_usuario: superadmin.id_usuario,
        id_organizacion_sucursal: branch.id_organizacion_sucursal,
        id_instalacion: null,
      },
    }),
    prisma.asignacion_usuario.findFirst({
      where: {
        id_usuario: mvergel.id_usuario,
        id_organizacion_sucursal: branch.id_organizacion_sucursal,
        id_instalacion: null,
      },
    }),
  ]);

  return Boolean(superadminBranchAssignment && mvergelBranchAssignment);
}

export async function runInitialSeedBootstrap(app: FastifyInstance): Promise<void> {
  const seedEnabled = String(process.env.INITIAL_SEED_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!seedEnabled) {
    app.log.info('Initial seed bootstrap deshabilitado por INITIAL_SEED_ENABLED=false');
    return;
  }

  app.log.info('Initial seed bootstrap iniciado...');

  const alreadyApplied = await isTecnmSeedAlreadyApplied();
  if (alreadyApplied) {
    app.log.info('Seed TecNM ya aplicado. Omitiendo ejecución.');
    return;
  }

  const today = atStartOfDay(new Date());
  const processStart = atStartOfDay(addDays(today, -30));
  const processEnd = atStartOfDay(addDays(processStart, 120));

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

  for (const especie of especies) {
    const config = especiesBase.find((item) => item.nombre === especie.nombre);
    if (!config) continue;

    await ensureEspecieParametro(especie.id_especie, parametroTemperatura.id_parametro, config.temperatura[0], config.temperatura[1]);
    await ensureEspecieParametro(especie.id_especie, parametroPH.id_parametro, config.ph[0], config.ph[1]);
    await ensureEspecieParametro(especie.id_especie, parametroOxigeno.id_parametro, config.oxigeno[0], config.oxigeno[1]);
    await ensureEspecieParametro(especie.id_especie, parametroSalinidad.id_parametro, config.salinidad[0], config.salinidad[1]);
  }

  await ensureCatalogoSensor('Temperatura', '°C', 'Sensor de temperatura del agua', '0 a 50 °C');
  await ensureCatalogoSensor('pH', 'pH', 'Sensor de potencial de hidrógeno', '0 a 14 pH');
  await ensureCatalogoSensor('Oxígeno Disuelto', 'mg/L', 'Sensor óptico de oxígeno disuelto', '0 a 20 mg/L');
  await ensureCatalogoSensor('Salinidad', 'ppt', 'Sensor de salinidad', '0 a 45 ppt');

  const [superadminPasswordHash, mvergelPasswordHash] = await Promise.all([
    bcrypt.hash(DEFAULT_PASSWORD, 10),
    bcrypt.hash(MVERGEL_PASSWORD, 10),
  ]);

  const superadmin = await ensureUser({
    nombre: 'Super Admin',
    correo: 'superadmin@example.com',
    idRol: rolSuperadmin.id_rol,
    passwordHash: superadminPasswordHash,
  });

  const mvergel = await ensureUser({
    nombre: 'MVergel Superadmin',
    correo: 'mvergel@gmail.com',
    idRol: rolSuperadmin.id_rol,
    passwordHash: mvergelPasswordHash,
  });

  const existingOrg = await prisma.organizacion.findFirst({
    where: {
      nombre: {
        equals: TECNM_ORG_NAME,
      },
    },
  });

  const organizacion = existingOrg
    ? await prisma.organizacion.update({
        where: { id_organizacion: existingOrg.id_organizacion },
        data: {
          razon_social: 'Instituto Tecnológico de Villahermosa',
          rfc: 'ITV010101AA1',
          correo: 'contacto@villahermosa.tecnm.mx',
          telefono: '+52 993 312 0000',
          direccion: 'Av. Instituto Tecnológico S/N, Indeco, 86010 Villahermosa, Tab.',
          id_estado: estado.id_estado,
          id_municipio: municipio.id_municipio,
          estado: 'activa',
          latitud: 18.0169,
          longitud: -92.9069,
        },
      })
    : await prisma.organizacion.create({
        data: {
          nombre: TECNM_ORG_NAME,
          razon_social: 'Instituto Tecnológico de Villahermosa',
          rfc: 'ITV010101AA1',
          correo: 'contacto@villahermosa.tecnm.mx',
          telefono: '+52 993 312 0000',
          direccion: 'Av. Instituto Tecnológico S/N, Indeco, 86010 Villahermosa, Tab.',
          id_estado: estado.id_estado,
          id_municipio: municipio.id_municipio,
          estado: 'activa',
          latitud: 18.0169,
          longitud: -92.9069,
        },
      });

  const existingBranch = await prisma.organizacion_sucursal.findFirst({
    where: {
      id_organizacion: organizacion.id_organizacion,
      nombre_sucursal: {
        equals: TECNM_BRANCH_NAME,
      },
    },
  });

  const sucursal = existingBranch
    ? await prisma.organizacion_sucursal.update({
        where: { id_organizacion_sucursal: existingBranch.id_organizacion_sucursal },
        data: {
          direccion_sucursal: 'Edificio de Ciencias Biológicas, TecNM Villahermosa',
          telefono_sucursal: '+52 993 312 0000',
          correo_sucursal: 'contacto@villahermosa.tecnm.mx',
          id_estado: estado.id_estado,
          id_municipio: municipio.id_municipio,
          estado: 'activa',
          latitud: 18.0169,
          longitud: -92.9069,
        },
      })
    : await prisma.organizacion_sucursal.create({
        data: {
          id_organizacion: organizacion.id_organizacion,
          nombre_sucursal: TECNM_BRANCH_NAME,
          direccion_sucursal: 'Edificio de Ciencias Biológicas, TecNM Villahermosa',
          telefono_sucursal: '+52 993 312 0000',
          correo_sucursal: 'contacto@villahermosa.tecnm.mx',
          id_estado: estado.id_estado,
          id_municipio: municipio.id_municipio,
          estado: 'activa',
          latitud: 18.0169,
          longitud: -92.9069,
        },
      });

  const especieTilapia = especies.find((item) => item.nombre === 'Tilapia');
  if (!especieTilapia) {
    throw new Error('No se pudo resolver la especie Tilapia para crear el proceso base.');
  }

  const existingProcess = await prisma.procesos.findFirst({
    where: {
      nombre_proceso: {
        equals: TECNM_PROCESS_NAME,
      },
    },
  });

  const processProgress = Math.max(
    1,
    Math.min(
      99,
      Math.round(((today.getTime() - processStart.getTime()) / (processEnd.getTime() - processStart.getTime())) * 100),
    ),
  );

  const proceso = existingProcess
    ? await prisma.procesos.update({
        where: { id_proceso: existingProcess.id_proceso },
        data: {
          id_especie: especieTilapia.id_especie,
          descripcion: 'Seguimiento productivo para Tilapia en Estanque Experimental 1',
          objetivos: 'Mantener parámetros óptimos y maximizar supervivencia',
          estado: 'en_progreso',
          porcentaje_avance: processProgress,
          fecha_inicio: processStart,
          fecha_final: processEnd,
          fecha_fin_real: null,
        },
      })
    : await prisma.procesos.create({
        data: {
          id_especie: especieTilapia.id_especie,
          nombre_proceso: TECNM_PROCESS_NAME,
          descripcion: 'Seguimiento productivo para Tilapia en Estanque Experimental 1',
          objetivos: 'Mantener parámetros óptimos y maximizar supervivencia',
          estado: 'en_progreso',
          porcentaje_avance: processProgress,
          fecha_inicio: processStart,
          fecha_final: processEnd,
          fecha_fin_real: null,
        },
      });

  const existingInstallation = await prisma.instalacion.findFirst({
    where: {
      id_organizacion_sucursal: sucursal.id_organizacion_sucursal,
      nombre_instalacion: {
        equals: TECNM_INSTALLATION_NAME,
      },
    },
  });

  const instalacion = existingInstallation
    ? await prisma.instalacion.update({
        where: { id_instalacion: existingInstallation.id_instalacion },
        data: {
          id_proceso: proceso.id_proceso,
          fecha_instalacion: atStartOfDay(addDays(processStart, -12)),
          estado_operativo: 'activo',
          descripcion: 'Estanque experimental para prácticas de Ingeniería',
          tipo_uso: 'acuicultura',
          codigo_instalacion: 'ESTANQUEEXP1',
          ubicacion: `${TECNM_BRANCH_NAME} (${TECNM_ORG_NAME})`,
          latitud: 18.0169,
          longitud: -92.9069,
          capacidad_maxima: 5000,
          capacidad_actual: 3000,
          volumen_agua_m3: 1000,
          profundidad_m: 1.2,
          fecha_ultima_inspeccion: atStartOfDay(addDays(today, -2)),
          responsable_operativo: 'Ing. Operaciones TecNM',
          contacto_emergencia: '+52 993 222 3344',
        },
      })
    : await prisma.instalacion.create({
        data: {
          id_organizacion_sucursal: sucursal.id_organizacion_sucursal,
          id_proceso: proceso.id_proceso,
          nombre_instalacion: TECNM_INSTALLATION_NAME,
          fecha_instalacion: atStartOfDay(addDays(processStart, -12)),
          estado_operativo: 'activo',
          descripcion: 'Estanque experimental para prácticas de Ingeniería',
          tipo_uso: 'acuicultura',
          codigo_instalacion: 'ESTANQUEEXP1',
          ubicacion: `${TECNM_BRANCH_NAME} (${TECNM_ORG_NAME})`,
          latitud: 18.0169,
          longitud: -92.9069,
          capacidad_maxima: 5000,
          capacidad_actual: 3000,
          volumen_agua_m3: 1000,
          profundidad_m: 1.2,
          fecha_ultima_inspeccion: atStartOfDay(addDays(today, -2)),
          responsable_operativo: 'Ing. Operaciones TecNM',
          contacto_emergencia: '+52 993 222 3344',
        },
      });

  await ensureAssignment({
    idUsuario: superadmin.id_usuario,
    idSucursal: sucursal.id_organizacion_sucursal,
    idInstalacion: null,
  });

  await ensureAssignment({
    idUsuario: mvergel.id_usuario,
    idSucursal: sucursal.id_organizacion_sucursal,
    idInstalacion: null,
  });

  await ensureAssignment({
    idUsuario: superadmin.id_usuario,
    idSucursal: null,
    idInstalacion: instalacion.id_instalacion,
  });

  await ensureAssignment({
    idUsuario: mvergel.id_usuario,
    idSucursal: null,
    idInstalacion: instalacion.id_instalacion,
  });

  app.log.info('Seeding completed successfully (bootstrap).');
}
