export namespace Globals {

  export class Roles {
    public static readonly User = "User";
    public static readonly Admin = "Admin";
  }

  export class ClaimTypes {

    public static readonly UserId = "http://gaddr.com/claims/sub";
    public static readonly Email = "http://gaddr.com/claims/email";
    public static readonly TwoFARequired = "http://gaddr.com/claims/2fa-required";
    public static readonly SecurityStamp = "http://gaddr.com/claims/security-stamp";
    public static readonly ConcurrencyStamp = "http://gaddr.com/claims/concurrency-stamp";
    public static readonly UserType = "http://gaddr.com/claims/usertype";
    public static readonly UserName = "http://gaddr.com/claims/username";
    public static readonly ProfileImage = "http://gaddr.com/claims/profile-picture";
    public static readonly AccountType = "http://gaddr.com/claims/account-type";
    public static readonly GivenName = "http://gaddr.com/claims/givenname";
    public static readonly FamilyName = "http://gaddr.com/claims/familyname";
    public static readonly FullName = "http://gaddr.com/claims/fullname";
    public static readonly Roles = "http://gaddr.com/claims/roles";

    public static readonly Permission = "permission";
  }

  export class Email {
    public static readonly DefaultFrom = '"Gaddr" <team@gaddr.com>';
    public static readonly DefaultSender = {
      name: "Gaddr",
      email: "team@gaddr.com"
    }
  }
} 