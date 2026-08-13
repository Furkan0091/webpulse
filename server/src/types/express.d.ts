import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      // Zod-validated query/params are typed at runtime; keep them loosely typed.
      query: any;
      params: any;
      user?: {
        id: string;
        email: string;
      };
      org?: {
        organizationId: string;
        role: Role;
        membershipId: string;
      };
      apiKeyOrgId?: string;
      apiKeyScopes?: string[];
    }
  }
}

export {};
