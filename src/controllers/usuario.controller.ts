import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../repositories/prisma.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { normalizeOrganizacionSucursalId } from '../utils/normalize.utils.js';
import {
  canAccessBranch,
  canAccessFacility,
  canManageResources,
  canManageUsers,
  isSuperadmin,
  requireRequestScope,
  type RequestScope,
} from '../utils/access-control.js';
import { sendTelegramAlertToAuthorizedUsers } from '../services/telegram.service.js';
import { broadcastNotification } from '../services/ws.lecturas.server.js';
import { sendPasswordRecoveryInstructions } from '../services/password-recovery.service.js';

const HASH_ROUNDS = 10;

type FrontendRole = 'superadmin' | 'admin' | 'standard' | 'operator' | 'manager' | 'viewer';

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function mapDbRoleToFrontendRole(roleName?: string | null): FrontendRole {
  const key = normalizeKey(roleName || '');

  if (key.includes('superadmin')) return 'superadmin';
  if (key === 'admin' || key.includes('administrador')) return 'admin';
  if (key.includes('operator') || key.includes('operador')) return 'operator';
  if (key.includes('manager') || key.includes('gerente')) return 'manager';
  if (key.includes('viewer') || key.includes('lector')) return 'viewer';

  return 'standard';
}

function mapStatusToDb(value: unknown): 'activo' | 'inactivo' {
  const key = normalizeKey(String(value ?? 'activo'));
  if (key === 'inactive' || key === 'inactivo' || key === 'disabled' || key === 'suspended') {
    return 'inactivo';
  }
  return 'activo';
}

function mapStatusToFrontend(value: 'activo' | 'inactivo'): 'active' | 'inactive' {
  return value === 'activo' ? 'active' : 'inactive';
}

function toInt(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : (typeof value === 'number' ? value : NaN);
  if (!Number.isFinite(num)) return null;
  const parsed = Math.trunc(num);
  return parsed > 0 ? parsed : null;
}

function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return defaultValue;
}

function parseNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => toInt(item))
    .filter((item): item is number => item !== null);
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function randomPassword(): string {
  return `TmpAqua${Math.random().toString(36).slice(2, 10)}!9`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientIp(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return req.ip || 'unknown';
}

function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push('La contraseña debe tener al menos 8 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('La contraseña debe contener al menos una letra mayúscula');
  if (!/[a-z]/.test(password)) errors.push('La contraseña debe contener al menos una letra minúscula');
  if (!/\d/.test(password)) errors.push('La contraseña debe contener al menos un número');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('La contraseña debe contener al menos un carácter especial');
  }
  return errors;
}

function buildRecoveryToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function getRecoveryExpirationDate(): Date {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 1);
  return expiration;
}

function normalizeRoleAlias(value: string): string {
  const key = normalizeKey(value);

  if (key === 'superadministrator' || key === 'superuser') return 'superadmin';
  if (key === 'administrator') return 'admin';
  if (key === 'user' || key === 'usuario') return 'standard';

  return key;
}

async function resolveRoleRecord(
  roleInput: unknown,
  db: Prisma.TransactionClient | typeof prisma
): Promise<{ id: number; nombre: string; frontendRole: FrontendRole }> {
  const roles = await db.tipo_rol.findMany({
    select: {
      id_rol: true,
      nombre: true,
    },
  });

  const explicitId = toInt(roleInput);
  if (explicitId) {
    const byId = roles.find((role) => role.id_rol === explicitId);
    if (byId) {
      return {
        id: byId.id_rol,
        nombre: byId.nombre,
        frontendRole: mapDbRoleToFrontendRole(byId.nombre),
      };
    }
  }

  const roleText = typeof roleInput === 'string' ? roleInput : '';
  const desiredKey = normalizeRoleAlias(roleText || 'standard');

  const exact = roles.find((role) => normalizeRoleAlias(role.nombre) === desiredKey);
  if (exact) {
    return {
      id: exact.id_rol,
      nombre: exact.nombre,
      frontendRole: mapDbRoleToFrontendRole(exact.nombre),
    };
  }

  if (desiredKey === 'viewer' || desiredKey === 'operator' || desiredKey === 'manager') {
    const standard = roles.find((role) => normalizeRoleAlias(role.nombre) === 'standard');
    if (standard) {
      return {
        id: standard.id_rol,
        nombre: standard.nombre,
        frontendRole: mapDbRoleToFrontendRole(standard.nombre),
      };
    }
  }

  const fallbackKeys = ['standard', 'admin', 'superadmin'];
  for (const fallbackKey of fallbackKeys) {
    const match = roles.find((role) => normalizeRoleAlias(role.nombre) === fallbackKey);
    if (match) {
      return {
        id: match.id_rol,
        nombre: match.nombre,
        frontendRole: mapDbRoleToFrontendRole(match.nombre),
      };
    }
  }

  if (roles.length > 0) {
    return {
      id: roles[0].id_rol,
      nombre: roles[0].nombre,
      frontendRole: mapDbRoleToFrontendRole(roles[0].nombre),
    };
  }

  throw new Error('No hay roles configurados en la base de datos');
}

async function resolveRoleId(roleInput: unknown, db: Prisma.TransactionClient | typeof prisma): Promise<number> {
  const role = await resolveRoleRecord(roleInput, db);
  return role.id;
}

const usuarioWithRelationsSelect = {
  id_usuario: true,
  id_rol: true,
  nombre_completo: true,
  correo: true,
  telefono: true,
  estado: true,
  fecha_creacion: true,
  tipo_rol: {
    select: {
      id_rol: true,
      nombre: true,
    },
  },
  asignacion_usuario: {
    select: {
      id_organizacion_sucursal: true,
      id_instalacion: true,
      organizacion_sucursal: {
        select: {
          id_organizacion: true,
        },
      },
    },
  },
} satisfies Prisma.usuarioSelect;

const usuarioAuthSelect = {
  ...usuarioWithRelationsSelect,
  password_hash: true,
} satisfies Prisma.usuarioSelect;

type UsuarioWithRelations = Prisma.usuarioGetPayload<{
  select: typeof usuarioWithRelationsSelect;
}>;

function serializeUsuario(usuario: UsuarioWithRelations) {
  const organizationAccess = uniqueNumbers(
    usuario.asignacion_usuario
      .map((assignment) => assignment.organizacion_sucursal?.id_organizacion)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  );

  const sucursalAccess = uniqueNumbers(
    usuario.asignacion_usuario
      .map((assignment) => assignment.id_organizacion_sucursal)
      .filter((id): id is number => typeof id === 'number' && id > 0)
      .map((id) => id + 10000)
  );

  const branchAccess = uniqueNumbers([...organizationAccess, ...sucursalAccess]);

  const facilityAccess = uniqueNumbers(
    usuario.asignacion_usuario
      .map((assignment) => assignment.id_instalacion)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  );

  const role = mapDbRoleToFrontendRole(usuario.tipo_rol?.nombre);
  const status = mapStatusToFrontend(usuario.estado);

  return {
    id_usuario: usuario.id_usuario,
    nombre_completo: usuario.nombre_completo,
    correo: usuario.correo,
    telefono: usuario.telefono,
    estado: usuario.estado,
    fecha_creacion: usuario.fecha_creacion,
    id_rol: usuario.id_rol,
    tipo_rol: usuario.tipo_rol,
    branchAccess,
    facilityAccess,

    // Legacy/UI aliases
    id: usuario.id_usuario,
    name: usuario.nombre_completo,
    email: usuario.correo,
    phone: usuario.telefono,
    role,
    status,
    createdAt: usuario.fecha_creacion,
    updatedAt: usuario.fecha_creacion,
  };
}

function getUsuarioBranchIds(usuario: UsuarioWithRelations): number[] {
  return uniqueNumbers(
    usuario.asignacion_usuario
      .map((assignment) => assignment.id_organizacion_sucursal)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  );
}

function isUserVisibleForScope(scope: RequestScope, usuario: UsuarioWithRelations): boolean {
  if (isSuperadmin(scope)) return true;
  if (scope.idUsuario === usuario.id_usuario) return true;

  if (scope.role !== 'admin') {
    return false;
  }

  const targetBranches = getUsuarioBranchIds(usuario);
  if (targetBranches.length === 0) return false;

  return targetBranches.some((branchId) => scope.allowedBranchIds.includes(branchId));
}

function buildUsuariosScopeFilter(scope: RequestScope): Prisma.usuarioWhereInput {
  if (isSuperadmin(scope)) return {};

  if (scope.role === 'admin') {
    if (scope.allowedBranchIds.length === 0) {
      return { id_usuario: scope.idUsuario };
    }

    return {
      OR: [
        { id_usuario: scope.idUsuario },
        {
          asignacion_usuario: {
            some: {
              id_organizacion_sucursal: { in: scope.allowedBranchIds },
            },
          },
        },
      ],
    };
  }

  return { id_usuario: scope.idUsuario };
}

async function resolveAccess(
  tx: Prisma.TransactionClient,
  branchAccessRaw: unknown,
  facilityAccessRaw: unknown
): Promise<{
  sucursalIds: number[];
  facilityRows: Array<{ id_instalacion: number; id_organizacion_sucursal: number }>;
}> {
  const branchIds = parseNumberArray(branchAccessRaw);
  const facilityIds = parseNumberArray(facilityAccessRaw);

  const sucursalIds = new Set<number>();

  const highIds = branchIds.filter((id) => id >= 10000);
  for (const highId of highIds) {
    sucursalIds.add(normalizeOrganizacionSucursalId(highId));
  }

  const lowIds = branchIds.filter((id) => id > 0 && id < 10000);
  if (lowIds.length > 0) {
    const directSucursales = await tx.organizacion_sucursal.findMany({
      where: {
        id_organizacion_sucursal: { in: lowIds },
      },
      select: {
        id_organizacion_sucursal: true,
      },
    });

    const directIds = new Set(directSucursales.map((row) => row.id_organizacion_sucursal));

    for (const directId of directIds) {
      sucursalIds.add(directId);
    }

    const organizationIds = lowIds.filter((id) => !directIds.has(id));
    if (organizationIds.length > 0) {
      const organizationBranches = await tx.organizacion_sucursal.findMany({
        where: {
          id_organizacion: { in: organizationIds },
        },
        select: {
          id_organizacion_sucursal: true,
        },
      });

      for (const branch of organizationBranches) {
        sucursalIds.add(branch.id_organizacion_sucursal);
      }
    }
  }

  const facilityRows = facilityIds.length > 0
    ? await tx.instalacion.findMany({
        where: {
          id_instalacion: { in: facilityIds },
        },
        select: {
          id_instalacion: true,
          id_organizacion_sucursal: true,
        },
      })
    : [];

  for (const facility of facilityRows) {
    sucursalIds.add(facility.id_organizacion_sucursal);
  }

  return {
    sucursalIds: uniqueNumbers([...sucursalIds]),
    facilityRows,
  };
}

function assertAccessAssignmentByScope(
  scope: RequestScope,
  targetRole: FrontendRole,
  sucursalIds: number[],
  isCreate: boolean,
  accessWasProvided: boolean
): void {
  if (!isSuperadmin(scope)) {
    if (targetRole === 'superadmin') {
      throw new Error('Solo superadmin puede crear o modificar usuarios superadmin');
    }

    for (const sucursalId of sucursalIds) {
      if (!canAccessBranch(scope, sucursalId)) {
        throw new Error('No puede asignar empresas/sucursales fuera de su alcance');
      }
    }
  }

  const mustHaveScopedAccess = targetRole !== 'superadmin';
  if (mustHaveScopedAccess && (isCreate || accessWasProvided) && sucursalIds.length === 0) {
    throw new Error('Debe asignar al menos una empresa/sucursal o instalación');
  }
}

async function replaceUsuarioAccess(
  tx: Prisma.TransactionClient,
  userId: number,
  sucursalIds: number[],
  facilityRows: Array<{ id_instalacion: number; id_organizacion_sucursal: number }>
): Promise<void> {
  await tx.asignacion_usuario.deleteMany({
    where: { id_usuario: userId },
  });

  const records: Prisma.asignacion_usuarioCreateManyInput[] = [];
  const seen = new Set<string>();

  for (const sucursalId of sucursalIds) {
    const key = `${userId}-${sucursalId}-null`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push({
      id_usuario: userId,
      id_organizacion_sucursal: sucursalId,
      id_instalacion: null,
    });
  }

  for (const facility of facilityRows) {
    const key = `${userId}-${facility.id_organizacion_sucursal}-${facility.id_instalacion}`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push({
      id_usuario: userId,
      id_organizacion_sucursal: facility.id_organizacion_sucursal,
      id_instalacion: facility.id_instalacion,
    });
  }

  if (records.length > 0) {
    await tx.asignacion_usuario.createMany({
      data: records,
      skipDuplicates: true,
    });
  }
}

async function syncUsuarioAccess(
  tx: Prisma.TransactionClient,
  userId: number,
  branchAccessRaw: unknown,
  facilityAccessRaw: unknown
): Promise<void> {
  if (branchAccessRaw === undefined && facilityAccessRaw === undefined) {
    return;
  }

  const { sucursalIds, facilityRows } = await resolveAccess(tx, branchAccessRaw, facilityAccessRaw);
  await replaceUsuarioAccess(tx, userId, sucursalIds, facilityRows);
}

async function getUsuarioWithRelations(
  db: Prisma.TransactionClient | typeof prisma,
  idUsuario: number
): Promise<UsuarioWithRelations | null> {
  return db.usuario.findUnique({
    where: { id_usuario: idUsuario },
    select: usuarioWithRelationsSelect,
  });
}

// USUARIOS
export async function createUsuario(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear usuarios' });
    }

    const body = (req.body || {}) as Record<string, unknown>;

    const nombreCompleto = String(body.nombre_completo ?? body.name ?? '').trim();
    const correo = String(body.correo ?? body.email ?? '').trim().toLowerCase();

    if (!nombreCompleto || !correo) {
      return reply.status(400).send({ error: 'nombre_completo y correo son obligatorios' });
    }

    const telefono = typeof body.telefono === 'string'
      ? body.telefono.trim() || null
      : (typeof body.phone === 'string' ? body.phone.trim() || null : null);

    const plainPassword = typeof body.password === 'string' && body.password.trim()
      ? body.password.trim()
      : randomPassword();

    const estado = mapStatusToDb(body.estado ?? body.status);

    const usuario = await prisma.$transaction(async (tx) => {
      const role = await resolveRoleRecord(body.id_rol ?? body.role, tx);
      const passwordHash = await bcrypt.hash(plainPassword, HASH_ROUNDS);
      const accessWasProvided = body.branchAccess !== undefined || body.facilityAccess !== undefined;

      const resolvedAccess = await resolveAccess(tx, body.branchAccess, body.facilityAccess);
      assertAccessAssignmentByScope(
        scope,
        role.frontendRole,
        resolvedAccess.sucursalIds,
        true,
        accessWasProvided
      );

      const created = await tx.usuario.create({
        data: {
          id_rol: role.id,
          nombre_completo: nombreCompleto,
          correo,
          telefono,
          password_hash: passwordHash,
          estado,
        },
      });

      if (role.frontendRole !== 'superadmin' || accessWasProvided) {
        await replaceUsuarioAccess(
          tx,
          created.id_usuario,
          resolvedAccess.sucursalIds,
          resolvedAccess.facilityRows
        );
      }

      const complete = await getUsuarioWithRelations(tx, created.id_usuario);
      if (!complete) {
        throw new Error('No fue posible recuperar el usuario creado');
      }

      return complete;
    });

    reply.status(201).send(serializeUsuario(usuario));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function login(req: FastifyRequest, reply: FastifyReply) {
  let resolvedEmail = '';
  try {
    const { correo, email, password } = (req.body || {}) as Record<string, unknown>;
    resolvedEmail = String(correo ?? email ?? '').trim().toLowerCase();

    const usuario = await prisma.usuario.findUnique({
      where: { correo: resolvedEmail },
      select: usuarioAuthSelect,
    });

    if (!usuario || !usuario.password_hash) {
      return reply.status(401).send({ error: 'Credenciales inválidas' });
    }

    if (usuario.estado !== 'activo') {
      return reply.status(403).send({ error: 'Usuario inactivo' });
    }

    const valid = await bcrypt.compare(String(password ?? ''), usuario.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Credenciales inválidas' });
    }

    const role = mapDbRoleToFrontendRole(usuario.tipo_rol?.nombre);

    const token = req.server.jwt.sign({
      id_usuario: usuario.id_usuario,
      id_rol: usuario.id_rol,
      email: usuario.correo,
      role,
    });

    // Emitir cookie httpOnly segura
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

    reply.setCookie('access_token', token, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return reply.send({ token, usuario: serializeUsuario(usuario) });
  } catch (error: any) {
    req.log.error(
      {
        err: error,
        correo: resolvedEmail,
      },
      'Error during login'
    );
    return reply.status(500).send({ error: error.message });
  }
}

export async function register(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const nombre = String(body.nombre ?? body.nombre_completo ?? body.name ?? '').trim();
    const correo = String(body.email ?? body.correo ?? '').trim().toLowerCase();
    const password = String(body.password ?? '').trim();

    if (!nombre || !correo || !password) {
      return reply.status(400).send({ error: 'nombre, correo y password son obligatorios' });
    }

    if (!isValidEmail(correo)) {
      return reply.status(400).send({ error: 'Formato de email inválido' });
    }

    const passwordErrors = validatePasswordStrength(password);
    if (passwordErrors.length > 0) {
      return reply.status(400).send({ error: 'Contraseña inválida', details: passwordErrors });
    }

    const exists = await prisma.usuario.findUnique({
      where: { correo },
      select: { id_usuario: true },
    });

    if (exists) {
      return reply.status(409).send({ error: 'Ya existe un usuario con ese correo' });
    }

    const role = await resolveRoleRecord('standard', prisma);
    const passwordHash = await bcrypt.hash(password, HASH_ROUNDS);

    const created = await prisma.usuario.create({
      data: {
        id_rol: role.id,
        nombre_completo: nombre,
        correo,
        telefono: null,
        password_hash: passwordHash,
        estado: 'activo',
      },
    });

    const usuario = await getUsuarioWithRelations(prisma, created.id_usuario);
    if (!usuario) {
      return reply.status(500).send({ error: 'No fue posible recuperar el usuario creado' });
    }

    const frontendRole = mapDbRoleToFrontendRole(usuario.tipo_rol?.nombre);
    const token = req.server.jwt.sign({
      id_usuario: usuario.id_usuario,
      id_rol: usuario.id_rol,
      email: usuario.correo,
      role: frontendRole,
    });

    // Emitir cookie httpOnly segura (igual que login)
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

    reply.setCookie('access_token', token, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return reply.status(201).send({ token, usuario: serializeUsuario(usuario) });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message || 'Error interno del servidor' });
  }
}

export async function refreshToken(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const bodyToken = typeof body.token === 'string' ? body.token.trim() : '';
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bodyToken || bearerToken;

    if (!token) {
      return reply.status(401).send({ error: 'Token requerido' });
    }

    let decoded: Record<string, unknown>;
    try {
      decoded = req.server.jwt.verify(token) as Record<string, unknown>;
    } catch {
      return reply.status(401).send({ error: 'Token inválido o expirado' });
    }

    const idUsuario = toInt(decoded.id_usuario ?? decoded.idUsuario ?? decoded.sub);
    if (!idUsuario) {
      return reply.status(401).send({ error: 'Token inválido' });
    }

    const usuario = await getUsuarioWithRelations(prisma, idUsuario);
    if (!usuario || usuario.estado !== 'activo') {
      return reply.status(401).send({ error: 'Usuario inválido para refrescar token' });
    }

    const frontendRole = mapDbRoleToFrontendRole(usuario.tipo_rol?.nombre);
    const newToken = req.server.jwt.sign({
      id_usuario: usuario.id_usuario,
      id_rol: usuario.id_rol,
      email: usuario.correo,
      role: frontendRole,
    });

    // Actualizar cookie httpOnly segura con el nuevo token
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

    reply.setCookie('access_token', newToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return reply.send({ token: newToken });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message || 'Error interno del servidor' });
  }
}

export async function forgotPassword(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const correo = String(body.correo ?? body.email ?? '').trim().toLowerCase();

    if (!correo) {
      return reply.status(400).send({ error: 'Email es requerido' });
    }

    if (!isValidEmail(correo)) {
      return reply.status(400).send({ error: 'Formato de email inválido' });
    }

    const user = await prisma.usuario.findFirst({
      where: { correo, estado: 'activo' },
      select: { id_usuario: true, nombre_completo: true },
    });

    let deliveryDebug: { ok: boolean; channel: string; error?: string } | null = null;

    if (user) {
      const recoveryToken = buildRecoveryToken();
      const expirationDate = getRecoveryExpirationDate();

      await prisma.token_recuperacion.deleteMany({
        where: { id_usuario: user.id_usuario },
      });

      await prisma.token_recuperacion.create({
        data: {
          id_usuario: user.id_usuario,
          token: recoveryToken,
          expiracion: expirationDate,
        },
      });

      console.log(`[RECOVERY] Token para ${correo}: ${recoveryToken}`);
      console.log(`[RECOVERY] Expira: ${expirationDate}`);

      const delivery = await sendPasswordRecoveryInstructions({
        email: correo,
        userName: user.nombre_completo,
        token: recoveryToken,
      });

      deliveryDebug = {
        ok: delivery.ok,
        channel: delivery.channel,
        error: delivery.error,
      };

      if (!delivery.ok) {
        console.warn('[RECOVERY] No se pudo enviar enlace por email/telegram:', delivery.error);
      } else {
        console.log(`[RECOVERY] Enlace enviado por ${delivery.channel} para ${correo}`);
      }

      console.info(`[SECURITY] Password recovery requested for user ${user.id_usuario} from ${getClientIp(req)}`);
    }

    return reply.send({
      success: true,
      message: 'Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.',
      ...(process.env.NODE_ENV !== 'production' && deliveryDebug ? { debugDelivery: deliveryDebug } : {}),
    });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message || 'Error interno del servidor' });
  }
}

export async function resetPassword(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const token = String(body.token ?? '').trim();
    const newPassword = String(body.newPassword ?? body.password ?? '').trim();
    const confirmPassword = String(body.confirmPassword ?? body.passwordConfirm ?? '').trim();

    if (!token || !newPassword || !confirmPassword) {
      return reply.status(400).send({ error: 'Token, nueva contraseña y confirmación son requeridos' });
    }

    if (newPassword !== confirmPassword) {
      return reply.status(400).send({ error: 'Las contraseñas no coinciden' });
    }

    const passwordErrors = validatePasswordStrength(newPassword);
    if (passwordErrors.length > 0) {
      return reply.status(400).send({ error: 'Contraseña inválida', details: passwordErrors });
    }

    const tokenRow = await prisma.token_recuperacion.findFirst({
      where: {
        token,
        expiracion: {
          gt: new Date(),
        },
      },
      include: { usuario: true },
    });

    if (!tokenRow || tokenRow.usuario.estado !== 'activo') {
      return reply.status(400).send({ error: 'Token inválido o expirado' });
    }

    const passwordHash = await bcrypt.hash(newPassword, HASH_ROUNDS);

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id_usuario: tokenRow.id_usuario },
        data: { password_hash: passwordHash },
      });

      await tx.token_recuperacion.delete({
        where: { id_token: tokenRow.id_token },
      });
    });

    console.info(`[SECURITY] Password changed for user ${tokenRow.id_usuario} from ${getClientIp(req)}`);

    return reply.send({
      success: true,
      message: 'Contraseña restablecida exitosamente',
    });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message || 'Error interno del servidor' });
  }
}

export async function getMe(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const usuario = await getUsuarioWithRelations(prisma, scope.idUsuario);
    if (!usuario) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }

    return reply.send({ usuario: serializeUsuario(usuario) });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message || 'Error interno del servidor' });
  }
}

export async function logout(_req: FastifyRequest, reply: FastifyReply) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  reply.clearCookie('access_token', {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  return reply.send({
    success: true,
    message: 'Sesión cerrada',
  });
}

export async function getUsuarios(
  req: FastifyRequest<{ Querystring: { rol?: string; estado?: string; id_rol?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para consultar usuarios' });
    }

    const { rol, estado, id_rol } = req.query;
    const filters: Prisma.usuarioWhereInput[] = [];

    const scopeFilter = buildUsuariosScopeFilter(scope);
    if (Object.keys(scopeFilter).length > 0) {
      filters.push(scopeFilter);
    }

    if (estado) {
      filters.push({ estado: mapStatusToDb(estado) });
    }

    const explicitRoleId = toInt(id_rol);
    if (explicitRoleId) {
      filters.push({ id_rol: explicitRoleId });
    } else if (rol) {
      const roleId = await resolveRoleId(rol, prisma);
      filters.push({ id_rol: roleId });
    }

    const where: Prisma.usuarioWhereInput = filters.length > 1
      ? { AND: filters }
      : (filters[0] ?? {});

    const usuarios = await prisma.usuario.findMany({
      where,
      select: usuarioWithRelationsSelect,
      orderBy: {
        fecha_creacion: 'desc',
      },
    });

    return reply.send(usuarios.map(serializeUsuario));
  } catch (error: any) {
    if (reply.sent) {
      req.log.warn({ err: error }, 'Se omitio una segunda respuesta porque la solicitud ya fue respondida');
      return reply;
    }

    return reply.status(500).send({ error: error.message || 'Error interno del servidor' });
  }
}

export async function getUsuarioById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const id = Number.parseInt(req.params.id, 10);
    if (!canManageUsers(scope) && id !== scope.idUsuario) {
      return reply.status(403).send({ error: 'No tiene permisos para consultar este usuario' });
    }

    const usuario = await getUsuarioWithRelations(prisma, id);

    if (!usuario) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }

    if (!isUserVisibleForScope(scope, usuario)) {
      return reply.status(403).send({ error: 'No tiene acceso a este usuario' });
    }

    reply.send(serializeUsuario(usuario));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateUsuario(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar usuarios' });
    }

    const id = Number.parseInt(req.params.id, 10);
    const body = (req.body || {}) as Record<string, unknown>;

    const usuario = await prisma.$transaction(async (tx) => {
      const existing = await getUsuarioWithRelations(tx, id);
      if (!existing) {
        throw new Error('Usuario no encontrado');
      }

      if (!isUserVisibleForScope(scope, existing)) {
        throw new Error('No tiene acceso a este usuario');
      }

      const data: Prisma.usuarioUncheckedUpdateInput = {};
      const accessWasProvided = body.branchAccess !== undefined || body.facilityAccess !== undefined;

      const roleRecord = (body.id_rol !== undefined || body.role !== undefined)
        ? await resolveRoleRecord(body.id_rol ?? body.role, tx)
        : {
            id: existing.id_rol,
            nombre: existing.tipo_rol.nombre,
            frontendRole: mapDbRoleToFrontendRole(existing.tipo_rol.nombre),
          };

      const resolvedAccess = accessWasProvided
        ? await resolveAccess(tx, body.branchAccess, body.facilityAccess)
        : {
            sucursalIds: getUsuarioBranchIds(existing),
            facilityRows: [] as Array<{ id_instalacion: number; id_organizacion_sucursal: number }>,
          };

      assertAccessAssignmentByScope(
        scope,
        roleRecord.frontendRole,
        resolvedAccess.sucursalIds,
        false,
        accessWasProvided
      );

      if (body.nombre_completo !== undefined || body.name !== undefined) {
        const nombre = String(body.nombre_completo ?? body.name ?? '').trim();
        if (nombre) data.nombre_completo = nombre;
      }

      if (body.correo !== undefined || body.email !== undefined) {
        const correo = String(body.correo ?? body.email ?? '').trim().toLowerCase();
        if (correo) data.correo = correo;
      }

      if (body.telefono !== undefined || body.phone !== undefined) {
        const telefono = String(body.telefono ?? body.phone ?? '').trim();
        data.telefono = telefono || null;
      }

      if (body.estado !== undefined || body.status !== undefined) {
        data.estado = mapStatusToDb(body.estado ?? body.status);
      }

      if (body.id_rol !== undefined || body.role !== undefined) {
        data.id_rol = roleRecord.id;
      }

      if (body.password !== undefined) {
        const plainPassword = String(body.password ?? '').trim();
        if (plainPassword) {
          data.password_hash = await bcrypt.hash(plainPassword, HASH_ROUNDS);
        }
      }

      if (Object.keys(data).length > 0) {
        await tx.usuario.update({
          where: { id_usuario: id },
          data,
        });
      }

      if (accessWasProvided) {
        await replaceUsuarioAccess(tx, id, resolvedAccess.sucursalIds, resolvedAccess.facilityRows);
      }

      const complete = await getUsuarioWithRelations(tx, id);
      if (!complete) {
        throw new Error('Usuario no encontrado');
      }

      return complete;
    });

    reply.send(serializeUsuario(usuario));
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteUsuario(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar usuarios' });
    }

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.status(400).send({ error: 'ID de usuario inválido' });
    }

    if (scope.idUsuario === id) {
      return reply.status(403).send({ error: 'No puede eliminar su propia cuenta' });
    }

    const target = await getUsuarioWithRelations(prisma, id);
    if (!target) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }

    if (!isUserVisibleForScope(scope, target)) {
      return reply.status(403).send({ error: 'No tiene acceso a este usuario' });
    }

    if (!isSuperadmin(scope) && mapDbRoleToFrontendRole(target.tipo_rol.nombre) === 'superadmin') {
      return reply.status(403).send({ error: 'Solo superadmin puede eliminar usuarios superadmin' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.token_recuperacion.deleteMany({
        where: { id_usuario: id },
      });

      await tx.asignacion_usuario.deleteMany({
        where: { id_usuario: id },
      });

      await tx.usuario.delete({
        where: { id_usuario: id },
      });
    });

    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// TIPO ROL
export async function createTipoRol(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede crear roles' });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const nombre = String(body.nombre ?? '').trim();

    if (!nombre) {
      return reply.status(400).send({ error: 'nombre es obligatorio' });
    }

    const tipoRol = await prisma.tipo_rol.create({
      data: { nombre },
      include: {
        _count: {
          select: { usuario: true },
        },
      },
    });

    reply.status(201).send(tipoRol);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getTiposRol(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(_req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para consultar roles' });
    }

    const roles = await prisma.tipo_rol.findMany({
      include: {
        _count: {
          select: { usuario: true },
        },
      },
      orderBy: {
        id_rol: 'asc',
      },
    });

    reply.send(roles.map((role) => ({
      ...role,
      id: role.id_rol,
      name: role.nombre,
      users_count: role._count.usuario,
    })));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getTipoRolById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para consultar roles' });
    }

    const id = Number.parseInt(req.params.id, 10);
    const rol = await prisma.tipo_rol.findUnique({
      where: { id_rol: id },
      include: {
        _count: {
          select: { usuario: true },
        },
      },
    });

    if (!rol) {
      return reply.status(404).send({ error: 'Tipo de rol no encontrado' });
    }

    reply.send({
      ...rol,
      id: rol.id_rol,
      name: rol.nombre,
      users_count: rol._count.usuario,
    });
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateTipoRol(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede actualizar roles' });
    }

    const id = Number.parseInt(req.params.id, 10);
    const body = (req.body || {}) as Record<string, unknown>;
    const nombre = String(body.nombre ?? '').trim();

    if (!nombre) {
      return reply.status(400).send({ error: 'nombre es obligatorio' });
    }

    const rol = await prisma.tipo_rol.update({
      where: { id_rol: id },
      data: { nombre },
      include: {
        _count: {
          select: { usuario: true },
        },
      },
    });

    reply.send({
      ...rol,
      id: rol.id_rol,
      name: rol.nombre,
      users_count: rol._count.usuario,
    });
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteTipoRol(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!isSuperadmin(scope)) {
      return reply.status(403).send({ error: 'Solo superadmin puede eliminar roles' });
    }

    const id = Number.parseInt(req.params.id, 10);

    const count = await prisma.usuario.count({
      where: { id_rol: id },
    });

    if (count > 0) {
      return reply.status(409).send({
        error: 'No se puede eliminar el rol porque tiene usuarios asociados',
      });
    }

    await prisma.tipo_rol.delete({ where: { id_rol: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

const alertaSensorInstaladoSelect = {
  id_sensor_instalado: true,
  id_instalacion: true,
  id_sensor: true,
  fecha_instalada: true,
  descripcion: true,
  catalogo_sensores: {
    select: {
      id_sensor: true,
      nombre: true,
      unidad_medida: true,
    },
  },
};

const alertaWithRelationsSelect = {
  id_alertas: true,
  id_instalacion: true,
  id_sensor_instalado: true,
  descripcion: true,
  dato_puntual: true,
  leida: true,
  fecha_lectura: true,
  fecha_alerta: true,
  instalacion: {
    select: {
      id_instalacion: true,
      id_organizacion_sucursal: true,
      nombre_instalacion: true,
    },
  },
  sensor_instalado: {
    select: alertaSensorInstaladoSelect,
  },
};

type AlertaWithRelations = Prisma.alertasGetPayload<{
  select: typeof alertaWithRelationsSelect;
}>;

function serializeAlerta(alerta: AlertaWithRelations) {
  const parameter = alerta.sensor_instalado.catalogo_sensores?.nombre;
  const valor = Number(alerta.dato_puntual);
  const isRead = Boolean(alerta.leida);
  const fechaAlerta = alerta.fecha_alerta ? alerta.fecha_alerta.toISOString() : new Date().toISOString();
  const fechaLectura = alerta.fecha_lectura ? alerta.fecha_lectura.toISOString() : null;

  return {
    id_alertas: alerta.id_alertas,
    id_alerta: alerta.id_alertas,
    id_instalacion: alerta.id_instalacion,
    id_sensor_instalado: alerta.id_sensor_instalado,
    descripcion: alerta.descripcion,
    dato_puntual: valor,
    valor_medido: valor,
    title: parameter ? `Alerta ${parameter}` : 'Alerta de sensor',
    parameter,
    tipo_alerta: 'critica',
    estado_alerta: 'activa',
    read: isRead,
    leida: isRead,
    fecha: fechaAlerta,
    fecha_alerta: fechaAlerta,
    fecha_lectura: fechaLectura,
    instalacion: alerta.instalacion,
    sensor_instalado: alerta.sensor_instalado,
  };
}

async function fetchAlertaWithRelations(id: number): Promise<AlertaWithRelations | null> {
  return prisma.alertas.findUnique({
    where: { id_alertas: id },
    select: alertaWithRelationsSelect,
  });
}

function emitAlertaNotification(
  type: 'alerta.created' | 'alerta.updated' | 'alerta.deleted' | 'alertas.read-all' | 'alertas.deleted.bulk',
  data: any,
) {
  broadcastNotification({ type, data });
}

function buildAlertasScopeFilter(scope: RequestScope): Prisma.alertasWhereInput {
  if (isSuperadmin(scope)) return {};

  if (scope.role === 'admin') {
    if (scope.allowedBranchIds.length === 0) {
      return { id_alertas: -1 };
    }

    return {
      instalacion: {
        id_organizacion_sucursal: { in: scope.allowedBranchIds },
      },
    };
  }

  if (scope.allowedFacilityIds.length > 0) {
    return {
      id_instalacion: { in: scope.allowedFacilityIds },
    };
  }

  if (scope.allowedBranchIds.length > 0) {
    return {
      instalacion: {
        id_organizacion_sucursal: { in: scope.allowedBranchIds },
      },
    };
  }

  return { id_alertas: -1 };
}

// ALERTAS
export async function createAlerta(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear alertas' });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const idInstalacion = toInt(body.id_instalacion);
    const idSensorInstalado = toInt(body.id_sensor_instalado);
    const descripcion = String(body.descripcion ?? '').trim();
    const datoPuntual = Number(body.dato_puntual ?? NaN);

    if (!idInstalacion || !idSensorInstalado || !descripcion || Number.isNaN(datoPuntual)) {
      return reply.status(400).send({
        error: 'id_instalacion, id_sensor_instalado, descripcion y dato_puntual son obligatorios',
      });
    }

    const instalacion = await prisma.instalacion.findUnique({
      where: { id_instalacion: idInstalacion },
      select: { id_organizacion_sucursal: true },
    });
    if (!instalacion) {
      return reply.status(404).send({ error: 'Instalación no encontrada' });
    }

    if (!canAccessFacility(scope, idInstalacion, instalacion.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a la instalación seleccionada' });
    }

    const created = await prisma.alertas.create({
      data: {
        id_instalacion: idInstalacion,
        id_sensor_instalado: idSensorInstalado,
        descripcion,
        dato_puntual: datoPuntual,
      },
    });

    const alertaWithRelations = await fetchAlertaWithRelations(created.id_alertas);
    if (!alertaWithRelations) {
      return reply.status(500).send({ error: 'No fue posible recuperar la alerta creada' });
    }

    const payload = serializeAlerta(alertaWithRelations);

    emitAlertaNotification('alerta.created', payload);

    const telegramResult = await sendTelegramAlertToAuthorizedUsers(idInstalacion, {
      id_alertas: payload.id_alertas,
      descripcion: payload.descripcion,
      dato_puntual: payload.dato_puntual,
      instalacion: payload.instalacion
        ? {
            id_instalacion: payload.instalacion.id_instalacion,
            nombre_instalacion: payload.instalacion.nombre_instalacion,
          }
        : undefined,
      sensor: payload.sensor_instalado
        ? {
            id_sensor_instalado: payload.sensor_instalado.id_sensor_instalado,
            nombre: payload.sensor_instalado.catalogo_sensores?.nombre,
            unidad_medida: payload.sensor_instalado.catalogo_sensores?.unidad_medida || undefined,
          }
        : undefined,
    });

    if (!telegramResult.ok) {
      req.log.warn(
        {
          alertaId: payload.id_alertas,
          error: telegramResult.error,
        },
        'No fue posible enviar alerta a Telegram',
      );
    }

    reply.status(201).send(payload);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getAlertas(
  req: FastifyRequest<{ Querystring: { id_instalacion?: string; id_sensor_instalado?: string; read?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const { id_instalacion, id_sensor_instalado, read } = req.query;
    const filters: Prisma.alertasWhereInput[] = [];

    const instalacionId = toInt(id_instalacion);
    if (instalacionId) filters.push({ id_instalacion: instalacionId });

    const sensorId = toInt(id_sensor_instalado);
    if (sensorId) filters.push({ id_sensor_instalado: sensorId });

    if (read !== undefined) {
      filters.push({ leida: parseBoolean(read, false) });
    }

    const scopeFilter = buildAlertasScopeFilter(scope);
    if (Object.keys(scopeFilter).length > 0) {
      filters.push(scopeFilter);
    }

    const where: Prisma.alertasWhereInput = filters.length > 1
      ? { AND: filters }
      : (filters[0] ?? {});

    const alertas = await prisma.alertas.findMany({
      where,
      select: alertaWithRelationsSelect,
      orderBy: {
        id_alertas: 'desc',
      },
    });

    return reply.send(alertas.map(serializeAlerta));
  } catch (error: any) {
    if (reply.sent) {
      req.log.warn({ err: error }, 'Se omitio una segunda respuesta porque la solicitud ya fue respondida');
      return reply;
    }

    return reply.status(500).send({ error: error.message || 'Error interno del servidor' });
  }
}

export async function markAlertaRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.status(400).send({ error: 'ID de alerta inválido' });
    }

    const existing = await fetchAlertaWithRelations(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Alerta no encontrada' });
    }

    if (!canAccessFacility(scope, existing.id_instalacion, existing.instalacion?.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta alerta' });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const read = parseBoolean(body.read ?? body.leida, true);
    const now = new Date();

    await prisma.alertas.update({
      where: { id_alertas: id },
      data: {
        leida: read,
        fecha_lectura: read ? now : null,
      },
    });

    const alerta = await fetchAlertaWithRelations(id);
    if (!alerta) {
      return reply.status(404).send({ error: 'Alerta no encontrada' });
    }

    const payload = serializeAlerta(alerta);
    emitAlertaNotification('alerta.updated', payload);
    reply.send(payload);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

type MarkAllAlertasBody = {
  read?: boolean | string | number;
  leida?: boolean | string | number;
  ids?: unknown[];
  id_instalacion?: string | number;
};

export async function markAllAlertasRead(req: FastifyRequest<{ Body: MarkAllAlertasBody }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const body = (req.body || {}) as MarkAllAlertasBody;
    const read = parseBoolean(body.read ?? body.leida, true);
    const ids = uniqueNumbers(parseNumberArray(body.ids));
    const idInstalacion = toInt(body.id_instalacion);

    const filters: Prisma.alertasWhereInput[] = [];

    if (ids.length > 0) {
      filters.push({ id_alertas: { in: ids } });
    }

    if (idInstalacion) {
      filters.push({ id_instalacion: idInstalacion });
    }

    const scopeFilter = buildAlertasScopeFilter(scope);
    if (Object.keys(scopeFilter).length > 0) {
      filters.push(scopeFilter);
    }

    const where: Prisma.alertasWhereInput = filters.length > 1
      ? { AND: filters }
      : (filters[0] ?? {});

    const targets = await prisma.alertas.findMany({
      where,
      select: { id_alertas: true },
    });

    if (targets.length === 0) {
      return reply.send({ updated: 0, read, ids: [] as number[] });
    }

    const targetIds = targets.map((item) => item.id_alertas);
    const now = new Date();

    await prisma.alertas.updateMany({
      where: { id_alertas: { in: targetIds } },
      data: {
        leida: read,
        fecha_lectura: read ? now : null,
      },
    });

    emitAlertaNotification('alertas.read-all', {
      ids: targetIds,
      read,
      fecha_lectura: read ? now.toISOString() : null,
    });

    reply.send({ updated: targetIds.length, read, ids: targetIds });
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

type DeleteAllAlertasBody = {
  ids?: unknown[];
  id_instalacion?: string | number;
};

export async function deleteAllAlertas(req: FastifyRequest<{ Body: DeleteAllAlertasBody }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar alertas' });
    }

    const body = (req.body || {}) as DeleteAllAlertasBody;
    const ids = uniqueNumbers(parseNumberArray(body.ids));
    const idInstalacion = toInt(body.id_instalacion);

    const filters: Prisma.alertasWhereInput[] = [];

    if (ids.length > 0) {
      filters.push({ id_alertas: { in: ids } });
    }

    if (idInstalacion) {
      filters.push({ id_instalacion: idInstalacion });
    }

    const scopeFilter = buildAlertasScopeFilter(scope);
    if (Object.keys(scopeFilter).length > 0) {
      filters.push(scopeFilter);
    }

    const where: Prisma.alertasWhereInput = filters.length > 1
      ? { AND: filters }
      : (filters[0] ?? {});

    const targets = await prisma.alertas.findMany({
      where,
      select: { id_alertas: true },
    });

    if (targets.length === 0) {
      return reply.send({ deleted: 0, ids: [] as number[] });
    }

    const targetIds = targets.map((item) => item.id_alertas);

    await prisma.alertas.deleteMany({
      where: { id_alertas: { in: targetIds } },
    });

    emitAlertaNotification('alertas.deleted.bulk', { ids: targetIds });

    reply.send({ deleted: targetIds.length, ids: targetIds });
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getAlertaById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const id = Number.parseInt(req.params.id, 10);
    const alerta = await fetchAlertaWithRelations(id);

    if (!alerta) {
      return reply.status(404).send({ error: 'Alerta no encontrada' });
    }

    if (!canAccessFacility(scope, alerta.id_instalacion, alerta.instalacion?.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta alerta' });
    }

    reply.send(serializeAlerta(alerta));
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateAlerta(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar alertas' });
    }

    const id = Number.parseInt(req.params.id, 10);
    const body = (req.body || {}) as Record<string, unknown>;

    const existing = await fetchAlertaWithRelations(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Alerta no encontrada' });
    }

    if (!canAccessFacility(scope, existing.id_instalacion, existing.instalacion?.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta alerta' });
    }

    const data: Prisma.alertasUncheckedUpdateInput = {};

    const idInstalacion = toInt(body.id_instalacion);
    if (idInstalacion) {
      const destination = await prisma.instalacion.findUnique({
        where: { id_instalacion: idInstalacion },
        select: { id_organizacion_sucursal: true },
      });
      if (!destination) {
        return reply.status(404).send({ error: 'Instalación no encontrada' });
      }
      if (!canAccessFacility(scope, idInstalacion, destination.id_organizacion_sucursal)) {
        return reply.status(403).send({ error: 'No tiene acceso a la instalación seleccionada' });
      }
      data.id_instalacion = idInstalacion;
    }

    const idSensorInstalado = toInt(body.id_sensor_instalado);
    if (idSensorInstalado) data.id_sensor_instalado = idSensorInstalado;

    if (body.descripcion !== undefined) {
      data.descripcion = String(body.descripcion ?? '').trim();
    }

    if (body.dato_puntual !== undefined) {
      const value = Number(body.dato_puntual);
      if (!Number.isNaN(value)) {
        data.dato_puntual = value;
      }
    }

    if (body.read !== undefined || body.leida !== undefined) {
      const read = parseBoolean(body.read ?? body.leida, false);
      data.leida = read;
      data.fecha_lectura = read ? new Date() : null;
    }

    await prisma.alertas.update({
      where: { id_alertas: id },
      data,
    });

    const alerta = await fetchAlertaWithRelations(id);
    if (!alerta) {
      return reply.status(404).send({ error: 'Alerta no encontrada' });
    }

    const payload = serializeAlerta(alerta);
    emitAlertaNotification('alerta.updated', payload);

    reply.send(payload);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteAlerta(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar alertas' });
    }

    const id = Number.parseInt(req.params.id, 10);

    const alerta = await fetchAlertaWithRelations(id);
    if (!alerta) {
      return reply.status(404).send({ error: 'Alerta no encontrada' });
    }

    if (!canAccessFacility(scope, alerta.id_instalacion, alerta.instalacion?.id_organizacion_sucursal)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta alerta' });
    }

    await prisma.alertas.delete({ where: { id_alertas: id } });

    emitAlertaNotification('alerta.deleted', { id_alertas: id });

    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// PARÁMETROS
export async function createParametro(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear parámetros' });
    }

    const body = req.body as any;
    const parametro = await prisma.parametros.create({ data: body });
    reply.status(201).send(parametro);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getParametros(_req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(_req, reply);
    if (!scope) return reply;

    const parametros = await prisma.parametros.findMany({
      orderBy: {
        id_parametro: 'asc',
      },
    });

    return reply.send(parametros.map((parametro) => ({
      ...parametro,
      nombre: parametro.nombre_parametro,
      unidad: parametro.unidad_medida,
    })));
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}

export async function getParametroById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const id = parseInt(req.params.id);
    const parametro = await prisma.parametros.findUnique({
      where: { id_parametro: id }
    });

    if (!parametro) {
      return reply.status(404).send({ error: 'Parámetro no encontrado' });
    }

    reply.send({
      ...parametro,
      nombre: parametro.nombre_parametro,
      unidad: parametro.unidad_medida,
    });
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function updateParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para actualizar parámetros' });
    }

    const id = parseInt(req.params.id);
    const body = req.body as any;

    const parametro = await prisma.parametros.update({
      where: { id_parametro: id },
      data: body
    });

    reply.send({
      ...parametro,
      nombre: parametro.nombre_parametro,
      unidad: parametro.unidad_medida,
    });
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function deleteParametro(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageResources(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar parámetros' });
    }

    const id = parseInt(req.params.id);
    await prisma.parametros.delete({ where: { id_parametro: id } });
    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

// ASIGNACION USUARIO
export async function createAsignacionUsuario(req: FastifyRequest, reply: FastifyReply) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para crear asignaciones' });
    }

    const body = (req.body || {}) as Record<string, unknown>;

    const idUsuario = toInt(body.id_usuario ?? body.userId);
    const idInstalacion = toInt(body.id_instalacion ?? body.facilityId);

    let idSucursal = toInt(body.id_organizacion_sucursal ?? body.sucursalId ?? body.branchId);
    if (idSucursal && idSucursal >= 10000) {
      idSucursal = normalizeOrganizacionSucursalId(idSucursal);
    }

    if (!idUsuario) {
      return reply.status(400).send({ error: 'id_usuario es obligatorio' });
    }

    if (!idSucursal && idInstalacion) {
      const instalacion = await prisma.instalacion.findUnique({
        where: { id_instalacion: idInstalacion },
        select: { id_organizacion_sucursal: true },
      });
      idSucursal = instalacion?.id_organizacion_sucursal ?? null;
    }

    if (!idSucursal) {
      return reply.status(400).send({ error: 'id_organizacion_sucursal es obligatorio' });
    }

    if (!canAccessBranch(scope, idSucursal)) {
      return reply.status(403).send({ error: 'No puede asignar sucursales fuera de su alcance' });
    }

    if (idInstalacion && !canAccessFacility(scope, idInstalacion, idSucursal)) {
      return reply.status(403).send({ error: 'No puede asignar instalaciones fuera de su alcance' });
    }

    const targetUser = await getUsuarioWithRelations(prisma, idUsuario);
    if (!targetUser) {
      return reply.status(404).send({ error: 'Usuario no encontrado' });
    }

    const targetRole = mapDbRoleToFrontendRole(targetUser.tipo_rol.nombre);
    const targetHasAssignments = getUsuarioBranchIds(targetUser).length > 0;
    const isBootstrapAssignment = scope.role === 'admin' && !targetHasAssignments && targetRole !== 'superadmin';

    if (!isUserVisibleForScope(scope, targetUser) && !isBootstrapAssignment) {
      return reply.status(403).send({ error: 'No tiene acceso a este usuario' });
    }

    if (!isSuperadmin(scope) && targetRole === 'superadmin') {
      return reply.status(403).send({ error: 'Solo superadmin puede administrar asignaciones de superadmin' });
    }

    const existing = await prisma.asignacion_usuario.findFirst({
      where: {
        id_usuario: idUsuario,
        id_organizacion_sucursal: idSucursal,
        id_instalacion: idInstalacion ?? null,
      },
    });

    if (existing) {
      return reply.status(409).send({
        error: 'La asignación ya existe',
        id_asignacion: existing.id_asignacion,
      });
    }

    const asignacion = await prisma.asignacion_usuario.create({
      data: {
        id_usuario: idUsuario,
        id_organizacion_sucursal: idSucursal,
        id_instalacion: idInstalacion ?? null,
      },
      include: {
        usuario: {
          select: {
            id_usuario: true,
            nombre_completo: true,
            correo: true,
          },
        },
        organizacion_sucursal: {
          select: {
            id_organizacion_sucursal: true,
            id_organizacion: true,
            nombre_sucursal: true,
          },
        },
        instalacion: {
          select: {
            id_instalacion: true,
            nombre_instalacion: true,
          },
        },
      },
    });

    reply.status(201).send(asignacion);
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}

export async function getAsignacionesUsuario(
  req: FastifyRequest<{ Querystring: { userId?: string; sucursalId?: string; instalacionId?: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const userId = toInt(req.query.userId);
    const sucursalIdRaw = toInt(req.query.sucursalId);
    const instalacionId = toInt(req.query.instalacionId);

    const filters: Prisma.asignacion_usuarioWhereInput[] = [];

    if (userId) {
      if (!canManageUsers(scope) && userId !== scope.idUsuario) {
        return reply.status(403).send({ error: 'No tiene permisos para consultar asignaciones de otros usuarios' });
      }
      filters.push({ id_usuario: userId });
    }

    if (sucursalIdRaw) {
      const normalizedSucursalId = sucursalIdRaw >= 10000
        ? normalizeOrganizacionSucursalId(sucursalIdRaw)
        : sucursalIdRaw;
      filters.push({ id_organizacion_sucursal: normalizedSucursalId });
    }

    if (instalacionId) {
      filters.push({ id_instalacion: instalacionId });
    }

    if (!isSuperadmin(scope)) {
      if (canManageUsers(scope)) {
        if (scope.allowedBranchIds.length === 0) {
          filters.push({ id_asignacion: -1 });
        } else {
          filters.push({
            id_organizacion_sucursal: { in: scope.allowedBranchIds },
          });
        }
      } else {
        filters.push({ id_usuario: scope.idUsuario });
      }
    }

    const where: Prisma.asignacion_usuarioWhereInput = filters.length > 1
      ? { AND: filters }
      : (filters[0] ?? {});

    const asignaciones = await prisma.asignacion_usuario.findMany({
      where,
      include: {
        usuario: {
          select: {
            id_usuario: true,
            nombre_completo: true,
            correo: true,
          },
        },
        organizacion_sucursal: {
          select: {
            id_organizacion_sucursal: true,
            id_organizacion: true,
            nombre_sucursal: true,
          },
        },
        instalacion: {
          select: {
            id_instalacion: true,
            nombre_instalacion: true,
          },
        },
      },
      orderBy: {
        fecha_asignacion: 'desc',
      },
    });

    reply.send(asignaciones);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function getAsignacionUsuarioById(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;

    const id = Number.parseInt(req.params.id, 10);
    const asignacion = await prisma.asignacion_usuario.findUnique({
      where: { id_asignacion: id },
      include: {
        usuario: {
          select: {
            id_usuario: true,
            nombre_completo: true,
            correo: true,
          },
        },
        organizacion_sucursal: {
          select: {
            id_organizacion_sucursal: true,
            id_organizacion: true,
            nombre_sucursal: true,
          },
        },
        instalacion: {
          select: {
            id_instalacion: true,
            nombre_instalacion: true,
          },
        },
      },
    });

    if (!asignacion) {
      return reply.status(404).send({ error: 'Asignación no encontrada' });
    }

    if (!isSuperadmin(scope)) {
      if (canManageUsers(scope)) {
        if (!asignacion.id_organizacion_sucursal || !canAccessBranch(scope, asignacion.id_organizacion_sucursal)) {
          return reply.status(403).send({ error: 'No tiene acceso a esta asignación' });
        }
      } else if (asignacion.id_usuario !== scope.idUsuario) {
        return reply.status(403).send({ error: 'No tiene acceso a esta asignación' });
      }
    }

    reply.send(asignacion);
  } catch (error: any) {
    reply.status(500).send({ error: error.message });
  }
}

export async function deleteAsignacionUsuario(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const scope = await requireRequestScope(req, reply);
    if (!scope) return reply;
    if (!canManageUsers(scope)) {
      return reply.status(403).send({ error: 'No tiene permisos para eliminar asignaciones' });
    }

    const id = Number.parseInt(req.params.id, 10);
    const asignacion = await prisma.asignacion_usuario.findUnique({
      where: { id_asignacion: id },
    });

    if (!asignacion) {
      return reply.status(404).send({ error: 'Asignación no encontrada' });
    }

    if (!canAccessBranch(scope, asignacion.id_organizacion_sucursal ?? -1)) {
      return reply.status(403).send({ error: 'No tiene acceso a esta asignación' });
    }

    await prisma.asignacion_usuario.delete({
      where: { id_asignacion: id },
    });

    reply.status(204).send();
  } catch (error: any) {
    reply.status(400).send({ error: error.message });
  }
}
