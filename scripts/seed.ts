import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting seeding...');

    // 1. Estados
    const estado = await prisma.estados.upsert({
        where: { id_estado: 1 },
        update: {},
        create: {
            nombre: 'Ciudad de México'
        }
    });
    console.log('Estado created:', estado);

    // 2. Municipios
    const municipio = await prisma.municipios.upsert({
        where: { id_municipio: 1 },
        update: {},
        create: {
            nombre: 'Cuauhtémoc',
            id_estado: estado.id_estado
        }
    });
    console.log('Municipio created:', municipio);

    // 3. Tipos de Rol
    const rolAdmin = await prisma.tipo_rol.upsert({
        where: { id_rol: 1 },
        update: {},
        create: {
            nombre: 'ADMIN'
        }
    });
    const rolUser = await prisma.tipo_rol.upsert({
        where: { id_rol: 2 },
        update: {},
        create: {
            nombre: 'USER'
        }
    });
    console.log('Roles created:', rolAdmin, rolUser);

    // 4. Usuario Admin
    const passwordHash = await bcrypt.hash('123456', 10);
    const admin = await prisma.usuario.upsert({
        where: { correo: 'admin@example.com' },
        update: {},
        create: {
            nombre_completo: 'Admin User',
            correo: 'admin@example.com',
            password_hash: passwordHash,
            id_rol: rolAdmin.id_rol,
            estado: 'activo'
        }
    });
    console.log('Admin user created:', admin);

    // 5. Organizacion
    const org = await prisma.organizacion.upsert({
        where: { id_organizacion: 1 },
        update: {},
        create: {
            nombre: 'Organización Ejemplo',
            razon_social: 'Ejemplo S.A. de C.V.',
            rfc: 'XAXX010101000',
            correo: 'contacto@ejemplo.com',
            id_estado: estado.id_estado,
            id_municipio: municipio.id_municipio,
            estado: 'activa'
        }
    });
    console.log('Organizacion created:', org);

    // 6. Sucursal
    const sucursal = await prisma.organizacion_sucursal.upsert({
        where: { id_organizacion_sucursal: 1 },
        update: {},
        create: {
            id_organizacion: org.id_organizacion,
            nombre_sucursal: 'Sucursal Centro',
            id_estado: estado.id_estado,
            id_municipio: municipio.id_municipio,
            estado: 'activa'
        }
    });
    console.log('Sucursal created:', sucursal);

    // 7. Catalogo Sensores
    const sensorType = await prisma.catalogo_sensores.upsert({
        where: { id_sensor: 1 },
        update: {},
        create: {
            nombre: 'Sensor Temperatura',
            descripcion: 'Mide temperatura del agua',
            unidad_medida: '°C'
        }
    });
    console.log('Sensor Type created:', sensorType);

    // 8. Especie (needed for Proceso)
    const especie = await prisma.especies.upsert({
        where: { id_especie: 1 },
        update: {},
        create: {
            nombre: 'Tilapia'
        }
    });

    // 9. Proceso (needed for Instalacion)
    const proceso = await prisma.procesos.upsert({
        where: { id_proceso: 1 },
        update: {},
        create: {
            id_especie: especie.id_especie,
            fecha_inicio: new Date(),
            fecha_final: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        }
    });

    // 10. Instalacion
    const instalacion = await prisma.instalacion.upsert({
        where: { id_instalacion: 1 },
        update: {},
        create: {
            id_organizacion_sucursal: sucursal.id_organizacion_sucursal,
            nombre_instalacion: 'Estanque 1',
            fecha_instalacion: new Date(),
            estado_operativo: 'activo',
            descripcion: 'Estanque principal',
            tipo_uso: 'acuicultura',
            id_proceso: proceso.id_proceso
        }
    });
    console.log('Instalacion created:', instalacion);

    // 11. Sensor Instalado
    const sensorInstalado = await prisma.sensor_instalado.upsert({
        where: { id_sensor_instalado: 1 },
        update: {},
        create: {
            id_instalacion: instalacion.id_instalacion,
            id_sensor: sensorType.id_sensor,
            fecha_instalada: new Date(),
            descripcion: 'Sensor T1'
        }
    });
    console.log('Sensor Instalado created:', sensorInstalado);

    // 12. Asignacion Usuario (Super Admin to Sucursal)
    const existingAsignacion = await prisma.asignacion_usuario.findFirst({
        where: {
            id_usuario: admin.id_usuario,
            id_organizacion_sucursal: sucursal.id_organizacion_sucursal,
            id_instalacion: null
        }
    });

    let asignacion;
    if (!existingAsignacion) {
        asignacion = await prisma.asignacion_usuario.create({
            data: {
                id_usuario: admin.id_usuario,
                id_organizacion_sucursal: sucursal.id_organizacion_sucursal,
                id_instalacion: null
            }
        });
        console.log('Asignacion Usuario created:', asignacion);
    } else {
        asignacion = existingAsignacion;
        console.log('Asignacion Usuario already exists:', asignacion);
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
