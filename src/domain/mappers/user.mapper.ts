import { User } from "../../domain/entities/user.entity";
import { UserModel } from "../../domain/contracts/user.model";

export function mapToUserModel(user: User): UserModel {
  return {
    id: user.id,
    email: user.email,
    gender: user.gender,
    lastName: user.lastName,
    photo: user.profileImage,
    firstName: user.firstName,
    phoneNumber: user.phoneNumber,
    isEmailVerified: user.emailConfirmed,
  } as UserModel;
}