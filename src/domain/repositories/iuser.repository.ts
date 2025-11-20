import { User, UserClaim, UserRole } from "../entities";

export interface IUserRepository {

  deleteAsync(user: User): Promise<void>;
  updateAsync(user: User): Promise<boolean>;
  createAsync(user: User, password: string): Promise<User>;

  getAsync(): Promise<User[]>;
  getUserByIdAsync(id: string): Promise<User | null>;
  getUserByEmailAsync(email: string): Promise<User | null>;
  getUserByNameAsync(userName: string): Promise<User | null>;
  getSimilarUserNamesAsync(userName: string): Promise<string[]>;

  isEmailInuseAsync(email: string): Promise<boolean>;
  cleanupExpiredEmailChangesAsync(expirationHours?: number): Promise<number>;

  setEmailAsync(user: User, email: string): Promise<boolean>;
  changeEmailAsync(newEmail: string, token: string): Promise<boolean>;
  setPhoneNumberAsync(user: User, phoneNumber: string): Promise<boolean>;
  changePhoneNumberAsync(newPhoneNumber: string, token: string): Promise<boolean>;
  generatePhoneConfirmationTokenAsync(user: User, newPhoneNumber: string): Promise<string>;

  getRolesAsync(user: User): Promise<string[]>;
  isInRoleAsync(user: User, roleName: string): Promise<UserRole | null>;
  addToRoleAsync(user: User, roleName: string): Promise<UserRole | null>;

  generatePasswordResetTokenAsync(user: User): Promise<string>;
  generateUserTokenAsync(user: User, purpose: string): Promise<string>;
  generateEmailConfirmationTokenAsync(user: User, newEmail: string): Promise<string>;
  verifyUserTokenAsync(purpose: string, token: string): Promise<{ isValid: boolean, userId: string }>;

  updatePassword(user: User, newPassword: string): Promise<boolean>;
  checkPasswordAsync(user: User, password: string): Promise<boolean>;
  changePasswordAsync(user: User, currentPassword: string, newPassword: string): Promise<boolean>;

  getClaimsAsync(user: User): Promise<UserClaim[]>;
  addClaimAsync(user: User, claim: UserClaim): Promise<UserClaim>;
  removeClaimAsync(user: User, claim: UserClaim): Promise<boolean>;
  addClaimsAsync(user: User, claims: UserClaim[]): Promise<UserClaim[]>;
  replaceClaimAsync(user: User, claim: UserClaim, newClaim: UserClaim): Promise<boolean>;
  removeClaimsAsync(user: User, claims: UserClaim[]): Promise<{ claimType: string; succeeded: boolean }[]>;

  getEntriesAsync(
    page: number,
    pageSize: number,
    orderBy: string,
    order: "ASC" | "DESC",
    searchTerm?: string
  ): Promise<[User[], number]>;

}