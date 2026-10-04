import { Role } from "@prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      validated?: {
        body: any;
        query: any;
        params: any;
      };
    }
  }
}

export {};