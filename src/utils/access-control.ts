import type { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../repositories/prisma.js';

export type AppRole =
  | 'superadmin'
  | 'admin'
  | 'standard'
  | 'operator'
  | 'manager'
  | 'viewer';

export interface RequestScope {
  idUsuario: number;
  idRol: number;
  role: AppRole;
  roleName: string;
  allowedOrganizationIds: number[];
  allowedBranchIds: number[];
  allowedFacilityIds: number[];
}

type HttpError = Error & { statusCode: number };

type DecodedToken = {
  id_usuario?: unknown;
  idUsuario?: unknown;
  id_rol?: unknown;
  role?: unknown;
  sub?: unknown;
};

type RequestScopeCacheEntry = {
  expiresAt: number;
  scope: RequestScope;
};

const REQUEST_SCOPE_CACHE_TTL_MS = Number(process.env.REQUEST_SCOPE_CACHE_TTL_MS ?? 10_000);
const REQUEST_SCOPE_CACHE_MAX_ENTRIES = 500;
const requestScopeCache = new Map<string, RequestScopeCacheEntry>();

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function mapRoleNameToAppRole(roleName: string): AppRole {
  const key = normalizeKey(roleName);

  if (key.includes('superadmin')) return 'superadmin';
  if (key === 'admin' || key.includes('administrador')) return 'admin';
  if (key.includes('operator') || key.includes('operador')) return 'operator';
  if (key.includes('manager') || key.includes('gerente')) return 'manager';
  if (key.includes('viewer') || key.includes('lector')) return 'viewer';

  return 'standard';
}

function toPositiveInt(value: unknown): number | null {
  const num = typeof value === 'string'
    ? Number(value)
    : (typeof value === 'number' ? value : NaN);

  if (!Number.isFinite(num)) return null;
  const parsed = Math.trunc(num);
  return parsed > 0 ? parsed : null;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function cloneScope(scope: RequestScope): RequestScope {
  return {
    ...scope,
    allowedOrganizationIds: [...scope.allowedOrganizationIds],
    allowedBranchIds: [...scope.allowedBranchIds],
    allowedFacilityIds: [...scope.allowedFacilityIds],
  };
}

function pruneExpiredScopeCache(now = Date.now()): void {
  for (const [key, entry] of requestScopeCache.entries()) {
    if (entry.expiresAt <= now) {
      requestScopeCache.delete(key);
    }
  }
}

function getCachedScope(token: string): RequestScope | null {
  const entry = requestScopeCache.get(token);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    requestScopeCache.delete(token);
    return null;
  }

  return cloneScope(entry.scope);
}

function setCachedScope(token: string, scope: RequestScope): void {
  if (REQUEST_SCOPE_CACHE_TTL_MS <= 0) return;

  const now = Date.now();
  pruneExpiredScopeCache(now);

  while (requestScopeCache.size >= REQUEST_SCOPE_CACHE_MAX_ENTRIES) {
    const oldestKey = requestScopeCache.keys().next().value;
    if (!oldestKey) break;
    requestScopeCache.delete(oldestKey);
  }

  requestScopeCache.set(token, {
    expiresAt: now + REQUEST_SCOPE_CACHE_TTL_MS,
    scope: cloneScope(scope),
  });
}

function extractTokenFromCookie(cookieHeader: string): string | null {
  const cookies = cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const tokenCookie = cookies.find((cookie) => cookie.startsWith('access_token='));
  if (!tokenCookie) return null;

  const value = tokenCookie.slice('access_token='.length);
  return value ? decodeURIComponent(value) : null;
}

function extractAccessToken(req: FastifyRequest): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    return extractTokenFromCookie(cookieHeader);
  }

  return null;
}

export async function getRequestScope(req: FastifyRequest): Promise<RequestScope> {
  const token = extractAccessToken(req);
  if (!token) {
    req.log.warn({ url: req.url, method: req.method }, 'Access token missing');
    throw createHttpError(401, 'Token de acceso requerido');
  }

  let decoded: DecodedToken;
  try {
    decoded = req.server.jwt.verify(token) as DecodedToken;
  } catch {
    req.log.warn({ url: req.url, method: req.method }, 'Invalid or expired access token');
    throw createHttpError(401, 'Token inválido o expirado');
  }

  const idUsuario = toPositiveInt(decoded.id_usuario ?? decoded.idUsuario ?? decoded.sub);
  if (!idUsuario) {
    req.log.warn({ url: req.url, method: req.method, decoded }, 'Token missing user identifier');
    throw createHttpError(401, 'Token inválido');
  }

  const cachedScope = getCachedScope(token);
  if (cachedScope && cachedScope.idUsuario === idUsuario) {
    return cachedScope;
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id_usuario: idUsuario },
    include: {
      tipo_rol: true,
      asignacion_usuario: {
        include: {
          organizacion_sucursal: {
            select: {
              id_organizacion: true,
            },
          },
        },
      },
    },
  });

  if (!usuario) {
    requestScopeCache.delete(token);
    req.log.warn({ url: req.url, method: req.method, idUsuario }, 'User from token was not found');
    throw createHttpError(401, 'Usuario no encontrado');
  }

  if (usuario.estado !== 'activo') {
    requestScopeCache.delete(token);
    req.log.warn({ url: req.url, method: req.method, idUsuario }, 'Inactive user attempted access');
    throw createHttpError(403, 'Usuario inactivo');
  }

  const roleName = usuario.tipo_rol?.nombre ?? String(decoded.role ?? 'standard');
  const role = mapRoleNameToAppRole(roleName);

  const allowedBranchIds = uniqueNumbers(
    usuario.asignacion_usuario
      .map((assignment) => assignment.id_organizacion_sucursal)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  );

  const allowedFacilityIds = uniqueNumbers(
    usuario.asignacion_usuario
      .map((assignment) => assignment.id_instalacion)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  );

  const allowedOrganizationIds = uniqueNumbers(
    usuario.asignacion_usuario
      .map((assignment) => assignment.organizacion_sucursal?.id_organizacion)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  );

  const scope: RequestScope = {
    idUsuario: usuario.id_usuario,
    idRol: usuario.id_rol,
    role,
    roleName,
    allowedOrganizationIds,
    allowedBranchIds,
    allowedFacilityIds,
  };

  setCachedScope(token, scope);
  return scope;
}

export async function requireRequestScope(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<RequestScope | null> {
  try {
    return await getRequestScope(req);
  } catch (error) {
    const statusCode = typeof (error as Partial<HttpError>)?.statusCode === 'number'
      ? (error as HttpError).statusCode
      : 401;

    const message = error instanceof Error ? error.message : 'No autorizado';
    if (!reply.sent) {
      reply.status(statusCode).send({ error: message });
    }
    return null;
  }
}

export function canManageUsers(scope: RequestScope): boolean {
  return scope.role === 'superadmin' || scope.role === 'admin';
}

export function canManageResources(scope: RequestScope): boolean {
  return scope.role === 'superadmin';
}

export function isSuperadmin(scope: RequestScope): boolean {
  return scope.role === 'superadmin';
}

export function canAccessOrganization(scope: RequestScope, organizationId: number): boolean {
  if (scope.role === 'superadmin') return true;
  if (scope.role !== 'admin') return false;
  return scope.allowedOrganizationIds.includes(organizationId);
}

export function canAccessBranch(scope: RequestScope, branchId: number): boolean {
  if (scope.role === 'superadmin') return true;
  return scope.allowedBranchIds.includes(branchId);
}

export function canAccessFacility(
  scope: RequestScope,
  facilityId: number,
  branchId?: number | null
): boolean {
  if (scope.role === 'superadmin') return true;

  if (scope.role === 'admin') {
    if (!branchId) return false;
    return scope.allowedBranchIds.includes(branchId);
  }

  if (scope.allowedFacilityIds.length > 0) {
    return scope.allowedFacilityIds.includes(facilityId);
  }

  if (branchId && scope.allowedBranchIds.length > 0) {
    return scope.allowedBranchIds.includes(branchId);
  }

  return false;
}

export function buildOrganizacionScopeWhere(scope: RequestScope): Prisma.organizacionWhereInput {
  if (scope.role === 'superadmin') return {};

  if (scope.role === 'admin' && scope.allowedOrganizationIds.length > 0) {
    return { id_organizacion: { in: scope.allowedOrganizationIds } };
  }

  return { id_organizacion: -1 };
}

export function buildSucursalScopeWhere(scope: RequestScope): Prisma.organizacion_sucursalWhereInput {
  if (scope.role === 'superadmin') return {};

  if (scope.allowedBranchIds.length > 0) {
    return { id_organizacion_sucursal: { in: scope.allowedBranchIds } };
  }

  return { id_organizacion_sucursal: -1 };
}

export function buildInstalacionScopeWhere(scope: RequestScope): Prisma.instalacionWhereInput {
  if (scope.role === 'superadmin') return {};

  if (scope.role === 'admin') {
    if (scope.allowedBranchIds.length === 0) {
      return { id_instalacion: -1 };
    }
    return { id_organizacion_sucursal: { in: scope.allowedBranchIds } };
  }

  if (scope.allowedFacilityIds.length > 0) {
    return { id_instalacion: { in: scope.allowedFacilityIds } };
  }

  if (scope.allowedBranchIds.length > 0) {
    return { id_organizacion_sucursal: { in: scope.allowedBranchIds } };
  }

  return { id_instalacion: -1 };
}
