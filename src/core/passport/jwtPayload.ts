import { Globals } from "../../core/globals";

export interface JwtPayload {
  [key: string]: any;
  [Globals.ClaimTypes.Email]: string;
  [Globals.ClaimTypes.UserId]: string;
  [Globals.ClaimTypes.FullName]: string;
  [Globals.ClaimTypes.GivenName]: string;
  [Globals.ClaimTypes.FamilyName]: string;
  [Globals.ClaimTypes.SecurityStamp]: string;
  [Globals.ClaimTypes.ConcurrencyStamp]: string;
}